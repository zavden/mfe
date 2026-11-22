/* Muxer targets emit synchronously; file writes are asynchronous. Keep their copied bytes in
 * one bounded queue, stop on the first failure, and never start a queued write after abort. */
import type { VideoSink } from '../types';

export const OUTPUT_CHUNK_BYTES = 256 * 1024;
export const OUTPUT_HIGH_WATER_BYTES = 4 * 1024 * 1024;
export const MAX_PENDING_OUTPUT_BYTES = 16 * 1024 * 1024;

export function createOutputWriter(sink: VideoSink, onError?: (error: unknown) => void) {
  const head = new Uint8Array(4096);
  const queue: { data: Uint8Array; position: number }[] = [];
  const waiters = new Set<() => void>();
  let pendingBytes = 0;
  let writing = false;
  let stopped = false;
  let failure: unknown;
  const changed = () => {
    for (const wake of waiters) wake();
    waiters.clear();
  };
  const wait = () => new Promise<void>((resolve) => waiters.add(resolve));
  const check = () => {
    if (stopped) throw failure;
  };
  const abort = (reason: unknown) => {
    if (stopped) return;
    stopped = true;
    failure = reason;
    for (const entry of queue) pendingBytes -= entry.data.byteLength;
    queue.length = 0;
    changed();
  };
  const fail = (error: unknown) => {
    if (stopped) return;
    abort(error);
    onError?.(error);
  };
  const pump = async () => {
    writing = true;
    while (!stopped && queue.length > 0) {
      const { data, position } = queue.shift()!;
      try {
        await sink.write(data, position);
      } catch (error) {
        fail(error);
      } finally {
        pendingBytes -= data.byteLength;
        changed();
      }
    }
    writing = false;
    changed();
  };
  return {
    head,
    get pendingBytes() {
      return pendingBytes;
    },
    onData(data: Uint8Array, position: number) {
      check();
      if (pendingBytes + data.byteLength > MAX_PENDING_OUTPUT_BYTES) {
        // Backpressure normally pauses the encoder well before this. Synchronous output bursts
        // still need a hard limit: a pathological frame must not allocate an unbounded queue.
        fail(
          new Error(
            'The video exceeded its output buffer. Try a smaller size or Companion · ffmpeg.',
          ),
        );
        check();
      }
      if (position < head.length) {
        head.set(data.subarray(0, Math.min(data.length, head.length - position)), position);
      }
      queue.push({ data: data.slice(), position }); // muxers reuse their chunk buffers
      pendingBytes += data.byteLength;
      if (!writing) void pump();
    },
    async waitForCapacity() {
      check();
      while (pendingBytes >= OUTPUT_HIGH_WATER_BYTES) {
        await wait();
        check();
      }
    },
    async drain() {
      // Cancellation discards queued writes, but the caller must abort its owned destination
      // and let an already-started write settle before releasing that destination.
      while (writing) await wait();
      check();
    },
    abort,
  };
}
