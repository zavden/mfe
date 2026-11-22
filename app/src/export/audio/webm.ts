/* Streaming WebM packet writer. Each bounded cluster carries one packet. Opus uses exact
 * CodecDelay and final DiscardPadding; these are absent from the candidate muxer's tail path.
 * The 10 µs scale represents Opus's 2.5 ms granularity without rounding its 6.5 ms delay. */
import type { EncodedPacket } from 'mediabunny';
import type { VideoSink } from '../types';
import { createMemoryFile } from '../video/memoryFile';

const SCALE_NS = 10_000;

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function uint(
  value: number,
  width = Math.max(1, Math.ceil(Math.log2(value + 1) / 8)),
): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(width);
  for (let i = width - 1; i >= 0; i--) {
    result[i] = value % 256;
    value = Math.floor(value / 256);
  }
  return result;
}

function size(value: number): Uint8Array<ArrayBuffer> {
  const width = Math.max(1, Math.ceil(Math.log2(value + 2) / 7));
  const result = uint(value, width);
  result[0]! |= 1 << (8 - width);
  return result;
}

function element(id: number, data: Uint8Array): Uint8Array<ArrayBuffer> {
  return concat([uint(id), size(data.length), data]);
}

const integer = (id: number, value: number) => element(id, uint(value));
const text = (id: number, value: string) => element(id, new TextEncoder().encode(value));
function float(value: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return bytes;
}

export interface WebmVideoTrack {
  codec: 'vp9' | 'av1';
  width: number;
  height: number;
  fps: number;
  description?: Uint8Array;
}

export interface TimedWebmWriter {
  addAudio(
    packet: EncodedPacket,
    meta?: EncodedAudioChunkMetadata,
    discardFrames?: number,
  ): Promise<void>;
  addVideo(packet: EncodedPacket): Promise<void>;
  finalize(frameCount: number): Promise<Blob | null>;
}

export function createTimedWebmWriter(
  options: { sink?: VideoSink | null; signal?: AbortSignal; video?: WebmVideoTrack } = {},
): TimedWebmWriter {
  const { sink, signal, video } = options;
  // Without a file to write to, the output is assembled in memory (`memoryFile.ts`).
  const memory = sink ? null : createMemoryFile();
  const cues: { time: number; position: number; track: number }[] = [];
  let position = 0;
  let segmentStart = 0;
  let durationPosition = 0;
  let codecDelay = 0;
  let started = false;
  let lastCue = -Infinity;
  const audioQueue: { packet: EncodedPacket; discardFrames: number }[] = [];
  const videoQueue: EncodedPacket[] = [];
  let queuedBytes = 0;
  const audioTrack = video ? 2 : 1;
  const write = async (bytes: Uint8Array<ArrayBuffer>, offset = position) => {
    signal?.throwIfAborted();
    await (sink ?? memory!.sink).write(bytes, offset);
    position = Math.max(position, offset + bytes.length);
    signal?.throwIfAborted();
  };
  const start = async (packet: EncodedPacket, meta?: EncodedAudioChunkMetadata) => {
    const description = meta?.decoderConfig?.description;
    if (!description) throw new Error('Opus encoder did not provide its identification header.');
    const opusHead = ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description);
    codecDelay = Math.max(0, -packet.timestamp);
    const ebml = element(
      0x1a45dfa3,
      concat([
        integer(0x4286, 1),
        integer(0x42f7, 1),
        integer(0x42f2, 4),
        integer(0x42f3, 8),
        text(0x4282, 'webm'),
        integer(0x4287, 4),
        integer(0x4285, 2),
      ]),
    );
    await write(
      concat([ebml, uint(0x18538067), new Uint8Array([1, 255, 255, 255, 255, 255, 255, 255])]),
    );
    segmentStart = position;
    const duration = element(0x4489, float(0));
    const infoData = concat([
      integer(0x2ad7b1, SCALE_NS),
      text(0x4d80, 'MFE'),
      text(0x5741, 'MFE'),
      duration,
    ]);
    const info = element(0x1549a966, infoData);
    durationPosition = position + info.length - 8;
    await write(info);
    const audio = element(
      0xae,
      concat([
        integer(0xd7, audioTrack),
        integer(0x73c5, audioTrack),
        integer(0x83, 2),
        integer(0x9c, 0),
        text(0x86, 'A_OPUS'),
        element(0x63a2, opusHead),
        integer(0x56aa, Math.round(codecDelay * 1e9)),
        integer(0x56bb, 80_000_000),
        element(0xe1, concat([element(0xb5, float(48_000)), integer(0x9f, 2)])),
      ]),
    );
    const tracks = [audio];
    if (video)
      tracks.unshift(
        element(
          0xae,
          concat([
            integer(0xd7, 1),
            integer(0x73c5, 1),
            integer(0x83, 1),
            integer(0x9c, 0),
            integer(0x23e383, Math.round(1e9 / video.fps)),
            text(0x86, video.codec === 'vp9' ? 'V_VP9' : 'V_AV1'),
            ...(video.description ? [element(0x63a2, video.description)] : []),
            element(0xe0, concat([integer(0xb0, video.width), integer(0xba, video.height)])),
          ]),
        ),
      );
    await write(element(0x1654ae6b, concat(tracks)));
    started = true;
  };
  const packetBlock = async (packet: EncodedPacket, track: number, discardFrames = 0) => {
    const timestamp = Math.max(
      0,
      Math.round(((packet.timestamp + (track === audioTrack ? codecDelay : 0)) * 1e9) / SCALE_NS),
    );
    const block = concat([
      new Uint8Array([0x80 | track, 0, 0, packet.type === 'key' ? 0x80 : 0]),
      packet.data,
    ]);
    let content = element(0xa3, block);
    if (track === audioTrack) {
      block[3] = 0;
      // Signed positive integer: use eight bytes so the sign bit cannot become set.
      content = element(
        0xa0,
        concat([
          element(0xa1, block),
          integer(0x9b, Math.round(((packet.duration - discardFrames / 48_000) * 1e9) / SCALE_NS)),
          ...(discardFrames > 0
            ? [element(0x75a2, uint(Math.round((discardFrames * 1e9) / 48_000), 8))]
            : []),
        ]),
      );
    }
    if ((!video || (track === 1 && packet.type === 'key')) && timestamp - lastCue >= 100_000) {
      cues.push({ time: timestamp, position: position - segmentStart, track });
      lastCue = timestamp;
    }
    await write(element(0x1f43b675, concat([integer(0xe7, timestamp), content])));
  };
  const drain = async (final = false) => {
    while (
      (audioQueue.length && (!video || videoQueue.length || final)) ||
      (videoQueue.length && final)
    ) {
      const audio = audioQueue[0];
      const picture = videoQueue[0];
      if (picture && (!audio || picture.timestamp < audio.packet.timestamp + codecDelay)) {
        videoQueue.shift();
        queuedBytes -= picture.data.byteLength;
        await packetBlock(picture, 1);
      } else if (audio) {
        audioQueue.shift();
        queuedBytes -= audio.packet.data.byteLength;
        await packetBlock(audio.packet, audioTrack, audio.discardFrames);
      }
    }
    if (queuedBytes > 16 * 1024 * 1024 || audioQueue.length + videoQueue.length > 256)
      throw new Error('Audio/video production exceeded the bounded interleave queue.');
  };
  return {
    async addAudio(packet, meta, discardFrames = 0) {
      if (!started) await start(packet, meta);
      audioQueue.push({ packet, discardFrames });
      queuedBytes += packet.data.byteLength;
      await drain();
    },
    async addVideo(packet) {
      if (!video || !started) throw new Error('Add initial audio before video packets.');
      videoQueue.push(packet);
      queuedBytes += packet.data.byteLength;
      await drain();
    },
    async finalize(frameCount) {
      if (!started) throw new Error('No audio was encoded.');
      await drain(true);
      await write(
        element(
          0x1c53bb6b,
          concat(
            cues.map((cue) =>
              element(
                0xbb,
                concat([
                  integer(0xb3, cue.time),
                  element(0xb7, concat([integer(0xf7, cue.track), integer(0xf1, cue.position)])),
                ]),
              ),
            ),
          ),
        ),
      );
      await write(float(((frameCount / 48_000) * 1e9) / SCALE_NS), durationPosition);
      return memory ? memory.blob(video ? 'video/webm' : 'audio/webm') : null;
    },
  };
}
