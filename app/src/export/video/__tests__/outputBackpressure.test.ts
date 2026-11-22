import { afterEach, describe, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers';
import type { SceneEvaluator } from '../../../scene';
import { createVideoExporter, type EncoderLike, type VideoEnv } from '../exporter';
import { createMuxer } from '../muxer';
import * as outputWriter from '../outputWriter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class Chunk {
  readonly byteLength = 1024 * 1024;
  readonly type = 'key';
  constructor(
    readonly timestamp: number,
    readonly duration: number,
  ) {}
  copyTo(destination: ArrayBuffer | ArrayBufferView) {
    const bytes =
      destination instanceof ArrayBuffer
        ? new Uint8Array(destination)
        : new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength);
    bytes.fill(1);
  }
}

function environment() {
  const drawn = vi.fn();
  let encoder!: EncoderLike;
  const env: VideoEnv = {
    createMuxer,
    isConfigSupported: async (config) => ({ supported: true, config }),
    createCanvas: () => ({
      ctx: {} as OffscreenCanvasRenderingContext2D,
      toFrame: (timestamp, duration) => ({ timestamp, duration, close() {} }) as VideoFrame,
    }),
    createEncoder(init) {
      let state: CodecState = 'configured';
      encoder = {
        get state() {
          return state;
        },
        encodeQueueSize: 0,
        configure() {},
        encode(frame) {
          queueMicrotask(() => {
            if (encoder.state !== 'closed') {
              init.output(
                new Chunk(frame.timestamp, frame.duration!) as unknown as EncodedVideoChunk,
              );
            }
          });
        },
        flush: async () => undefined,
        close() {
          state = 'closed';
        },
        addEventListener() {},
        removeEventListener() {},
      };
      return encoder;
    },
    renderer: { draw: drawn, pick: () => null, toScene: () => [0, 0] },
    now: (() => {
      let time = 0;
      return () => (time += 40);
    })(),
    yieldToUi: async () => undefined,
  };
  return { env, drawn };
}

const scene: SceneEvaluator = {
  duration: 4.8,
  events: [],
  evaluate: () => [],
  geometry: () => [],
  measure: () => null,
  points: () => null,
};
const options = {
  width: 64,
  height: 48,
  fps: 10,
  codec: 'vp9' as const,
  container: 'webm' as const,
  background: '#000000',
  range: null,
  bitrate: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('streamed video backpressure', () => {
  it('pauses encoding while emitted output bytes wait for a blocked destination', async () => {
    vi.stubGlobal('EncodedVideoChunk', Chunk);
    const entered = deferred();
    const release = deferred();
    const capacityBlocked = deferred();
    const createWriter = outputWriter.createOutputWriter;
    vi.spyOn(outputWriter, 'createOutputWriter').mockImplementation((sink, onError) => {
      const writer = createWriter(sink, onError);
      const wait = writer.waitForCapacity;
      vi.spyOn(writer, 'waitForCapacity').mockImplementation(() => {
        if (writer.pendingBytes >= outputWriter.OUTPUT_HIGH_WATER_BYTES) {
          capacityBlocked.resolve();
        }
        return wait();
      });
      return writer;
    });
    const abort = new AbortController();
    const h = environment();
    const sink = {
      write: vi.fn(async () => {
        entered.resolve();
        await release.promise;
      }),
    };
    const pending = createVideoExporter(h.env)(
      scene,
      { ...options, sink },
      () => {},
      abort.signal,
    ).catch((error: unknown) => error);
    await entered.promise;
    await capacityBlocked.promise;
    // Once the real byte limit is reached, drain this turn's microtasks. An exporter ignoring
    // the capacity promise would finish its remaining frames before this next event-loop turn.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const framesWhileBlocked = h.drawn.mock.calls.length;
    abort.abort();
    release.resolve();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(framesWhileBlocked).toBeLessThan(48);
    expect(sink.write).toHaveBeenCalledOnce();
  });

  it('stops encoding and preserves a mid-stream disk error before finalization', async () => {
    vi.stubGlobal('EncodedVideoChunk', Chunk);
    const h = environment();
    const failure = new DOMException('Disk full', 'QuotaExceededError');
    const sink = {
      write: vi.fn(async () => {
        throw failure;
      }),
    };
    const result = await createVideoExporter(h.env)(
      scene,
      { ...options, sink },
      () => {},
      new AbortController().signal,
    ).catch((error: unknown) => error);
    expect(result).toBe(failure);
    expect(h.drawn.mock.calls.length).toBeLessThan(48);
    expect(sink.write).toHaveBeenCalledOnce();
  });
});
