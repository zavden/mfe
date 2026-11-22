import {
  AdtsOutputFormat,
  AudioSample,
  AudioSampleSource,
  canEncodeAudio,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  NullTarget,
  OggOutputFormat,
  Output,
  StreamTarget,
  type StreamTargetChunk,
} from 'mediabunny';
import type { AudioPcm } from '../../audio/types';
import type { VideoSink } from '../types';
import { createMemoryFile } from '../video/memoryFile';
import { createOutputWriter, OUTPUT_CHUNK_BYTES } from '../video/outputWriter';
import { mp4TrackEnd } from './mp4Timing';
import { AAC_FRAME_SAMPLES, aacPriming, leadInSamples } from './priming';
import { createTimedWebmWriter } from './webm';

/** What a browser export writes for sound: the container and the codec together. */
export type AudioEncoding = 'webm-opus' | 'mp4-aac' | 'mp4-opus';

const BITRATE = { aac: 192_000, opus: 128_000 } as const;

let aac: Promise<boolean> | null = null;

/** Whether this browser encodes AAC itself (WebCodecs). The app ships no AAC encoder of its own:
 * where the browser has none (Chrome on Linux), an MP4 carries Opus and M4A is not offered. Asked
 * once: the answer is the browser's, it does not change while the page lives. */
export function canEncodeAac(): Promise<boolean> {
  aac ??= canEncodeAudio('aac', {
    sampleRate: 48_000,
    numberOfChannels: 2,
    bitrate: BITRATE.aac,
  }).catch(() => false);
  return aac;
}

/** About how many bytes a second of sound takes in a file (its bitrate; the container adds little). */
export function soundBytesPerSecond(encoding: AudioEncoding): number {
  return BITRATE[encoding === 'mp4-aac' ? 'aac' : 'opus'] / 8;
}

/** The sound of a video file. AAC is what opens wherever an MP4 does; Opus is what every browser
 * that can export encodes, and a valid MP4 track that fewer players and editors read. */
export function videoAudioEncoding(container: 'mp4' | 'webm', hasAac: boolean): AudioEncoding {
  return container === 'webm' ? 'webm-opus' : hasAac ? 'mp4-aac' : 'mp4-opus';
}

/** Close/abort only drain this bridge. The caller still owns publication of the real file. */
export function createMediaTarget(sink: VideoSink | null, signal?: AbortSignal) {
  // Without a file to write to, the output is assembled in memory (`memoryFile.ts`).
  const memory = sink ? null : createMemoryFile();
  const writer = createOutputWriter(sink ?? memory!.sink);
  const target = new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      async write(chunk) {
        signal?.throwIfAborted();
        writer!.onData(chunk.data, chunk.position);
        await writer!.waitForCapacity();
      },
      close: () => writer!.drain(),
      abort(reason) {
        writer!.abort(reason);
      },
    }),
    { chunked: true, chunkSize: OUTPUT_CHUNK_BYTES },
  );
  return {
    target,
    writer,
    result(mimeType: string): Blob | null {
      return memory ? memory.blob(mimeType) : null;
    },
  };
}

export function pcmSample(pcm: AudioPcm): AudioSample {
  const count = pcm.channels[0].length;
  const data = new Float32Array(count * 2);
  data.set(pcm.channels[0]);
  data.set(pcm.channels[1], count);
  return new AudioSample({
    data,
    format: 'f32-planar',
    numberOfChannels: 2,
    sampleRate: pcm.sampleRate,
    timestamp: pcm.startFrame / pcm.sampleRate,
  });
}

/** Encode `frames` stereo 48 kHz samples of silence, the first of them at `startFrame`. */
async function addSilence(source: AudioSampleSource, startFrame: number, frames: number) {
  const silence = [new Float32Array(frames), new Float32Array(frames)] as const;
  const sample = pcmSample({ startFrame, sampleRate: 48_000, channels: silence });
  try {
    await source.add(sample);
  } finally {
    sample.close();
  }
}

let aacLead: Promise<number> | null = null;

/** How many samples before the sound this browser's AAC encoder starts its stream, as the
 * timestamp of its first packet says it (mediabunny measures the encoder's delay and moves the
 * packets by it): learned once, from two frames of silence encoded the way an export encodes its
 * sound. The answer is the browser's, it does not change while the page lives. */
function aacLeadIn(): Promise<number> {
  aacLead ??= (async () => {
    const starts: number[] = [];
    const output = new Output({ target: new NullTarget(), format: new AdtsOutputFormat() });
    const source = new AudioSampleSource({
      codec: 'aac',
      bitrate: BITRATE.aac,
      onEncodedPacket: (packet) => starts.push(packet.timestamp),
    });
    output.addAudioTrack(source);
    try {
      await output.start();
      await addSilence(source, 0, 2 * AAC_FRAME_SAMPLES);
      await output.finalize();
    } catch (error) {
      await output.cancel().catch(() => undefined);
      throw error;
    }
    if (!starts.length) throw new Error('The AAC encoder gave no packet.');
    return leadInSamples(starts[0]!);
  })().catch((error: unknown) => {
    aacLead = null; // a failure is not the browser's answer: the next export asks again
    throw error;
  });
  return aacLead;
}

export async function createAudioEncoder(
  format: AudioEncoding,
  options: {
    sink?: VideoSink | null;
    signal?: AbortSignal;
    video?: { codec: 'avc' | 'vp9' | 'av1'; width: number; height: number; fps: number };
  } = {},
) {
  const { signal } = options;
  signal?.throwIfAborted();
  const codec = format === 'mp4-aac' ? 'aac' : 'opus';
  if (codec === 'aac' && !(await canEncodeAac()))
    throw new Error('This browser cannot encode AAC. Export WAV or WebM (Opus) instead.');
  signal?.throwIfAborted();
  // The silence an AAC encoder that starts its stream with the sound lacks (priming.ts). Opus
  // states its own priming (the pre-skip), which its decoders leave out. An encoder that could
  // not be asked gets none, as every encoder did before: the export itself says what is wrong
  // with it, where its caller hears it.
  const priming = codec === 'aac' ? await aacLeadIn().then(aacPriming, () => 0) : 0;
  signal?.throwIfAborted();
  const bridge = format === 'webm-opus' ? null : createMediaTarget(options.sink ?? null, signal);
  const output = bridge
    ? new Output({ target: bridge.target, format: new Mp4OutputFormat({ fastStart: false }) })
    : null;
  const audio = output ? new EncodedAudioPacketSource(codec) : null;
  if (audio) output!.addAudioTrack(audio);
  const video = output && options.video ? new EncodedVideoPacketSource(options.video.codec) : null;
  if (video) output!.addVideoTrack(video, { frameRate: options.video!.fps });
  if (format === 'webm-opus' && options.video?.codec === 'avc')
    throw new Error('WebM cannot contain H.264.');
  const webm =
    format === 'webm-opus'
      ? createTimedWebmWriter({
          ...options,
          video: options.video
            ? { ...options.video, codec: options.video.codec as 'vp9' | 'av1' }
            : undefined,
        })
      : null;
  // Encode continuously into a non-retaining target, forwarding public encoded packets to
  // the actual writer. Hold exactly one packet so its trailing codec padding can be removed.
  const encoding = new Output({
    target: new NullTarget(),
    format: codec === 'aac' ? new AdtsOutputFormat() : new OggOutputFormat(),
  });
  let totalFrames = 0;
  /** Where the MP4 track starts: zero, or the lead-in before it (the encoder's priming, with the
   * silence added before zero where that is less than a frame). */
  let firstTimestamp: number | null = null;
  let last: { packet: EncodedPacket; meta?: EncodedAudioChunkMetadata } | null = null;
  let writes = Promise.resolve();
  let failed = false;
  let failure: unknown;
  let audioEnded = false;
  let audioStarted = false;
  let ready!: () => void;
  const audioReady = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const send = (
    entry: { packet: EncodedPacket; meta?: EncodedAudioChunkMetadata },
    final: boolean,
  ) => {
    writes = writes
      .then(async () => {
        if (failed) throw failure;
        signal?.throwIfAborted();
        const { packet, meta } = entry;
        const padding = final
          ? Math.round((packet.timestamp + packet.duration) * 48_000) - totalFrames
          : -1;
        if (webm) {
          await webm.addAudio(packet, meta, Math.max(0, padding));
          audioStarted = true;
          ready();
        } else {
          firstTimestamp ??= packet.timestamp;
          // The last packet ends where the sound does, the rest of its codec frame left out; the
          // end is said the way that makes the file present exactly that (mp4Timing.ts).
          await audio!.add(
            padding >= 0
              ? packet.clone({
                  duration: mp4TrackEnd(firstTimestamp, totalFrames) - packet.timestamp,
                })
              : packet,
            meta,
          );
        }
      })
      .catch((error: unknown) => {
        failed = true;
        failure = error;
      });
  };
  const source = new AudioSampleSource({
    codec,
    bitrate: BITRATE[codec],
    onEncodedPacket(packet, meta) {
      if (Math.round(packet.timestamp * 48_000) >= totalFrames) return;
      if (last) send(last, false);
      last = { packet, meta };
    },
  });
  encoding.addAudioTrack(source);
  const check = () => {
    signal?.throwIfAborted();
    if (failed) throw failure;
  };
  const abort = () => {
    ready();
    bridge?.writer?.abort(signal?.reason);
    void encoding.cancel().catch(() => undefined);
    void output?.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  await output?.start();
  await encoding.start();
  // Before zero: the first packet starts there, and the edit list leaves it out. An encoder that
  // fails on it says so at the first of the sound, where the caller hears it and cancels.
  if (priming) await addSilence(source, -priming, priming);
  const finishAudio = async () => {
    if (audioEnded) return;
    audioEnded = true;
    check();
    await encoding.finalize();
    if (last) send(last, true);
    last = null;
    await writes;
    check();
  };
  return {
    async add(pcm: AudioPcm) {
      check();
      if (audioEnded) throw new Error('Audio encoding has already ended.');
      if (pcm.sampleRate !== 48_000 || pcm.startFrame !== totalFrames)
        throw new Error('Audio encoder requires contiguous 48 kHz blocks starting at zero.');
      totalFrames += pcm.channels[0].length;
      const sample = pcmSample(pcm);
      try {
        await source.add(sample);
      } finally {
        sample.close();
      }
      await writes;
      check();
    },
    finishAudio,
    async addVideo(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
      check();
      if (!options.video) throw new Error('This output has no video track.');
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      if (video) await video.add(packet, meta);
      else {
        if (!audioStarted) await audioReady;
        check();
        writes = writes
          .then(() => webm!.addVideo(packet))
          .catch((error: unknown) => {
            failed = true;
            failure = error;
          });
        await writes;
      }
      check();
    },
    async finalize(): Promise<Blob | null> {
      try {
        check();
        await finishAudio();
        await writes;
        check();
        if (webm) return await webm.finalize(totalFrames);
        await output!.finalize();
        await bridge!.writer?.drain();
        check();
        return bridge!.result(options.video ? 'video/mp4' : 'audio/mp4');
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    },
    async cancel(reason?: unknown) {
      failed = true;
      failure = reason ?? new DOMException('Audio export cancelled.', 'AbortError');
      ready();
      bridge?.writer?.abort(failure);
      await encoding.cancel().catch(() => undefined);
      await writes;
      await output?.cancel().catch(() => undefined);
      await bridge?.writer?.drain().catch(() => undefined);
      signal?.removeEventListener('abort', abort);
    },
  };
}
