/* Muxing of encoded chunks into an MP4 or WebM file (mp4-muxer / webm-muxer, both bundled; no
 * network, works from file://): in memory, or written to a sink as it goes (a file the user
 * chose) so that a long video never sits whole in memory. */
import {
  ArrayBufferTarget as Mp4Target,
  Muxer as Mp4Muxer,
  StreamTarget as Mp4StreamTarget,
} from 'mp4-muxer';
import {
  ArrayBufferTarget as WebmTarget,
  Muxer as WebmMuxer,
  StreamTarget as WebmStreamTarget,
} from 'webm-muxer';
import type { VideoSink } from '../types';
import type { VideoCodec } from './codecs';
import { createOutputWriter, OUTPUT_CHUNK_BYTES } from './outputWriter';

export interface VideoMuxer {
  addChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  waitForCapacity(): Promise<void>;
  /** Stop queued output; drain still waits for any already-started write to settle. */
  abort(reason: unknown): void;
  drain(): Promise<void>;
  /** Writes the headers and returns the file — null when it went to the request's sink, once
   * every write landed. `durationUs` is the exact length of the video (the end of its last
   * frame). */
  finalize(durationUs: number): Promise<Blob | null>;
}

/** Where the Duration element of the Segment Info (id 0x4489, an 8-byte float in TimecodeScale
 * units, 1 ms) keeps its value: the offset of the float, or null when the element was not found.
 * The Segment Info sits at the start of the file. */
export function findWebmDuration(bytes: Uint8Array): number | null {
  const limit = Math.min(bytes.length - 11, 4096);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88) return i + 3;
  }
  return null;
}

/** webm-muxer stores the start of the last frame as the Segment duration, one frame too short.
 * Rewrites the Duration element in place. Returns false when the element was not found. */
export function setWebmDuration(bytes: Uint8Array, durationMs: number): boolean {
  const at = findWebmDuration(bytes);
  if (at === null) return false;
  new DataView(bytes.buffer, bytes.byteOffset + at, 8).setFloat64(0, durationMs, false);
  return true;
}

export interface MuxerRequest {
  container: 'mp4' | 'webm';
  codec: VideoCodec;
  width: number;
  height: number;
  fps: number;
  /** The file's destination; null or absent: in memory. */
  sink?: VideoSink | null;
  /** First asynchronous output failure, while the encoder may still be running. */
  onError?: (error: unknown) => void;
}

const WEBM_CODECS: Record<VideoCodec, string | null> = {
  avc: null,
  vp9: 'V_VP9',
  av1: 'V_AV1',
};

export function createMuxer(request: MuxerRequest): VideoMuxer {
  const { container, codec, width, height, fps } = request;
  const sink = request.sink ?? null;
  const writer = sink ? createOutputWriter(sink, request.onError) : null;
  let aborted = false;
  let abortReason: unknown;
  const check = () => {
    if (aborted) throw abortReason;
  };
  const lifecycle = {
    async waitForCapacity() {
      check();
      await writer?.waitForCapacity();
    },
    abort(reason: unknown) {
      if (aborted) return;
      aborted = true;
      abortReason = reason;
      writer?.abort(reason);
    },
    async drain() {
      await writer?.drain();
      check();
    },
  };
  const video = { codec, width, height, frameRate: fps };
  if (container === 'mp4') {
    if (writer) {
      // The moov box goes at the end and the mdat size is patched at the start: the sink takes
      // positions, so the file needs no second pass and never sits whole in memory.
      const muxer = new Mp4Muxer({
        target: new Mp4StreamTarget({
          onData: writer.onData,
          chunked: true,
          chunkSize: OUTPUT_CHUNK_BYTES,
        }),
        video,
        fastStart: false,
      });
      return {
        ...lifecycle,
        addChunk: (chunk, meta) => {
          check();
          muxer.addVideoChunk(chunk, meta);
        },
        async finalize() {
          check();
          muxer.finalize();
          await lifecycle.drain();
          return null;
        },
      };
    }
    const target = new Mp4Target();
    const muxer = new Mp4Muxer({ target, video, fastStart: 'in-memory' });
    return {
      ...lifecycle,
      addChunk: (chunk, meta) => {
        check();
        muxer.addVideoChunk(chunk, meta);
      },
      async finalize() {
        check();
        muxer.finalize();
        return new Blob([target.buffer], { type: 'video/mp4' });
      },
    };
  }
  const webmCodec = WEBM_CODECS[codec];
  if (!webmCodec) throw new Error('WebM cannot hold H.264. Use MP4, or pick VP9 or AV1.');
  const webmVideo = { ...video, codec: webmCodec };
  if (writer) {
    const muxer = new WebmMuxer({
      target: new WebmStreamTarget({
        onData: writer.onData,
        chunked: true,
        chunkSize: OUTPUT_CHUNK_BYTES,
      }),
      video: webmVideo,
    });
    return {
      ...lifecycle,
      addChunk: (chunk, meta) => {
        check();
        muxer.addVideoChunk(chunk, meta);
      },
      async finalize(durationUs) {
        check();
        muxer.finalize();
        await lifecycle.drain();
        const at = findWebmDuration(writer.head);
        if (at !== null) {
          const patch = new Uint8Array(8);
          new DataView(patch.buffer).setFloat64(0, durationUs / 1000, false);
          writer.onData(patch, at);
          await lifecycle.drain();
        }
        return null;
      },
    };
  }
  const target = new WebmTarget();
  const muxer = new WebmMuxer({ target, video: webmVideo });
  return {
    ...lifecycle,
    addChunk: (chunk, meta) => {
      check();
      muxer.addVideoChunk(chunk, meta);
    },
    async finalize(durationUs) {
      check();
      muxer.finalize();
      const bytes = new Uint8Array(target.buffer);
      setWebmDuration(bytes, durationUs / 1000);
      return new Blob([bytes], { type: 'video/webm' });
    },
  };
}
