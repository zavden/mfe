import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Renderer } from '../../../render';
import type { SceneEvaluator } from '../../../scene';
import type { VideoOptions } from '../../types';
import { createVideoExporter, maxQueue, type EncoderLike, type VideoEnv } from '../exporter';
import type { MuxerRequest } from '../muxer';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

interface Harness {
  env: VideoEnv;
  encoder: FakeEncoder;
  drawn: { camera: unknown; surface: unknown; style: unknown; drawables: unknown }[];
  frames: { timestamp: number; duration: number; keyFrame: boolean; closed: boolean }[];
  chunks: { timestamp: number; duration: number; keyFrame: boolean }[];
  muxerRequests: MuxerRequest[];
  canvases: [number, number][];
  config: VideoEncoderConfig | null;
  finalizedWith?: number;
}

class FakeEncoder implements EncoderLike {
  state: CodecState = 'unconfigured';
  encodeQueueSize = 0;
  configured: VideoEncoderConfig | null = null;
  closeCalls = 0;
  private listeners = new Set<() => void>();
  private rejectFlush: ((error: Error) => void) | null = null;
  /** Called with each encode; may change `encodeQueueSize`. */
  onEncode: (frame: FakeFrame, options?: VideoEncoderEncodeOptions) => void = () => {};
  flushHangs = false;
  onFlush: () => void = () => {};
  onQueueWait: () => void = () => {};
  constructor(readonly init: VideoEncoderInit) {}
  configure(config: VideoEncoderConfig) {
    this.configured = config;
    this.state = 'configured';
  }
  encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
    this.onEncode(frame as unknown as FakeFrame, options);
  }
  flush() {
    this.onFlush();
    if (this.flushHangs) {
      return new Promise<void>((_, reject) => {
        this.rejectFlush = reject;
      });
    }
    return Promise.resolve();
  }
  close() {
    this.closeCalls++;
    this.state = 'closed';
    this.rejectFlush?.(new DOMException('closed', 'AbortError'));
  }
  addEventListener(_type: 'dequeue', listener: () => void) {
    this.listeners.add(listener);
    this.onQueueWait();
  }
  removeEventListener(_type: 'dequeue', listener: () => void) {
    this.listeners.delete(listener);
  }
  dequeue() {
    for (const listener of [...this.listeners]) listener();
  }
}

interface FakeFrame {
  timestamp: number;
  duration: number;
  closed: boolean;
  close(): void;
}

function harness(
  config: VideoEncoderConfig | null = { codec: 'avc1.64001F' } as VideoEncoderConfig,
) {
  const h = {
    drawn: [],
    frames: [],
    chunks: [],
    muxerRequests: [],
    canvases: [],
    config,
  } as unknown as Harness;
  const renderer: Renderer = {
    draw: (_ctx, drawables, camera, surface, style) =>
      h.drawn.push({ camera, surface, style, drawables }),
    pick: () => null,
    toScene: () => [0, 0],
  };
  h.env = {
    isConfigSupported: async () => (config ? { supported: true, config } : { supported: false }),
    createEncoder: (init) => {
      const encoder = new FakeEncoder(init);
      encoder.onEncode = (frame, options) => {
        const record = {
          timestamp: frame.timestamp,
          duration: frame.duration,
          keyFrame: !!options?.keyFrame,
          closed: false,
        };
        h.frames.push(record);
        queueMicrotask(() => {
          init.output(
            { timestamp: frame.timestamp, duration: frame.duration } as EncodedVideoChunk,
            undefined,
          );
          h.chunks.push({ ...record });
        });
      };
      h.encoder = encoder;
      return encoder;
    },
    createCanvas: (width, height) => {
      h.canvases.push([width, height]);
      return {
        ctx: {} as OffscreenCanvasRenderingContext2D,
        toFrame: (timestamp, duration) => {
          const frame: FakeFrame = {
            timestamp,
            duration,
            closed: false,
            close() {
              frame.closed = true;
              const record = h.frames.find((f) => f.timestamp === timestamp);
              if (record) record.closed = true;
            },
          };
          return frame as unknown as VideoFrame;
        },
      };
    },
    createMuxer: (request) => {
      h.muxerRequests.push(request);
      return {
        waitForCapacity: async () => undefined,
        drain: async () => undefined,
        abort: () => {},
        addChunk: () => {},
        finalize: async (durationUs: number) => {
          h.finalizedWith = durationUs;
          return new Blob(['video'], { type: 'video/mp4' });
        },
      };
    },
    renderer,
    yieldToUi: () => Promise.resolve(),
    now: (() => {
      let t = 0;
      return () => (t += 1);
    })(),
  };
  return h;
}

function evaluator(duration: number): SceneEvaluator & { times: number[] } {
  const times: number[] = [];
  return {
    duration,
    events: [],
    times,
    measure: () => null,
    points: () => null,
    evaluate(t: number) {
      times.push(t);
      return [];
    },
    geometry: () => [],
  };
}

const OPTIONS: VideoOptions = {
  background: '#112233',
  width: 320,
  height: 180,
  fps: 10,
  codec: 'avc',
  container: 'mp4',
  bitrate: null,
  range: null,
};

describe('exportVideo', () => {
  it('renders round(duration · fps) frames at r0 + k / fps and reports progress', async () => {
    const h = harness();
    const scene = evaluator(2.5);
    const progress: [number, number][] = [];
    const blob = await createVideoExporter(h.env)(
      scene,
      OPTIONS,
      (p) => progress.push([p.frame, p.totalFrames]),
      new AbortController().signal,
    );
    expect(scene.times).toHaveLength(25);
    expect(scene.times[0]).toBe(0);
    expect(scene.times[24]).toBeCloseTo(2.4, 12);
    expect(progress).toHaveLength(25);
    expect(progress[0]).toEqual([1, 25]);
    expect(progress[24]).toEqual([25, 25]);
    expect(blob!.type).toBe('video/mp4');
    expect(h.frames.every((f) => f.closed)).toBe(true);
    expect(h.encoder.state).toBe('closed');
    expect(h.finalizedWith).toBe(2_500_000); // the exact length of the video
  });

  it('timestamps frames in microseconds so the file lasts exactly frames / fps', async () => {
    const h = harness();
    await createVideoExporter(h.env)(
      evaluator(1),
      { ...OPTIONS, fps: 30 },
      () => {},
      new AbortController().signal,
    );
    expect(h.frames).toHaveLength(30);
    expect(h.frames[1]!.timestamp).toBe(33333);
    const last = h.frames[29]!;
    expect(last.timestamp + last.duration).toBe(1_000_000);
    // contiguous: every frame starts where the previous one ended
    for (let k = 1; k < h.frames.length; k++) {
      expect(h.frames[k]!.timestamp).toBe(h.frames[k - 1]!.timestamp + h.frames[k - 1]!.duration);
    }
  });

  it('forces a keyframe on the first frame and every two seconds', async () => {
    const h = harness();
    await createVideoExporter(h.env)(
      evaluator(5),
      { ...OPTIONS, fps: 10 },
      () => {},
      new AbortController().signal,
    );
    const keys = h.frames.flatMap((f, k) => (f.keyFrame ? [k] : []));
    expect(keys).toEqual([0, 20, 40]);
  });

  it('exports a custom range', async () => {
    const h = harness();
    const scene = evaluator(10);
    await createVideoExporter(h.env)(
      scene,
      { ...OPTIONS, range: [2, 3.5] },
      () => {},
      new AbortController().signal,
    );
    expect(scene.times).toHaveLength(15);
    expect(scene.times[0]).toBe(2);
    expect(scene.times[14]).toBeCloseTo(3.4, 12);
  });

  it('draws the whole Manim frame centred, at the output size, with the background', async () => {
    const h = harness();
    await createVideoExporter(h.env)(
      evaluator(0.1),
      { ...OPTIONS, width: 640, height: 360 },
      () => {},
      new AbortController().signal,
    );
    expect(h.canvases).toEqual([[640, 360]]);
    const call = h.drawn[0]!;
    expect(call.camera).toEqual({
      frameWidth: (8 * 640) / 360,
      frameHeight: 8,
      center: [0, 0],
      zoom: 1,
    });
    expect(call.surface).toEqual({ width: 640, height: 360 });
    expect(call.style).toEqual({ background: '#112233', outside: null });
  });

  it('uses the aspect ratio of the output, not of the project', async () => {
    const h = harness();
    await createVideoExporter(h.env)(
      evaluator(0.1),
      { ...OPTIONS, width: 400, height: 400 },
      () => {},
      new AbortController().signal,
    );
    expect((h.drawn[0]!.camera as { frameWidth: number }).frameWidth).toBeCloseTo(8, 12);
  });

  it('configures the encoder and muxer for the options', async () => {
    const h = harness({ codec: 'vp09.00.10.08', bitrate: 1 } as VideoEncoderConfig);
    await createVideoExporter(h.env)(
      evaluator(0.2),
      { ...OPTIONS, codec: 'vp9', container: 'webm' },
      () => {},
      new AbortController().signal,
    );
    expect(h.encoder.configured).toEqual({ codec: 'vp09.00.10.08', bitrate: 1 });
    expect(h.muxerRequests).toEqual([
      {
        container: 'webm',
        codec: 'vp9',
        width: 320,
        height: 180,
        fps: 10,
        sink: null,
        onError: expect.any(Function),
      },
    ]);
  });

  it('hands the sink of the options to the muxer and returns what the muxer does', async () => {
    const h = harness();
    const sink = { write: vi.fn(async () => undefined) };
    h.env.createMuxer = (request) => {
      h.muxerRequests.push(request);
      return {
        addChunk: () => {},
        finalize: async () => (request.sink ? null : new Blob()),
        waitForCapacity: async () => undefined,
        drain: async () => undefined,
        abort: () => {},
      };
    };
    const result = await createVideoExporter(h.env)(
      evaluator(1),
      { ...OPTIONS, sink },
      () => {},
      new AbortController().signal,
    );
    expect(result).toBeNull();
    expect(h.muxerRequests[0]!.sink).toBe(sink);
  });

  it('rejects when the browser cannot encode the codec', async () => {
    const h = harness(null);
    await expect(
      createVideoExporter(h.env)(evaluator(1), OPTIONS, () => {}, new AbortController().signal),
    ).rejects.toThrow(/cannot encode H\.264 at 320×180/);
    expect(h.canvases).toHaveLength(0);
  });

  it('validates sizes and combinations before doing any work', async () => {
    const h = harness();
    const run = (options: Partial<VideoOptions>, duration = 1) =>
      createVideoExporter(h.env)(
        evaluator(duration),
        { ...OPTIONS, ...options },
        () => {},
        new AbortController().signal,
      );
    await expect(run({ width: 321 })).rejects.toThrow(/even/);
    await expect(run({ height: 0 })).rejects.toThrow(/positive whole numbers/);
    await expect(run({ fps: 29.97 })).rejects.toThrow(/positive whole numbers/);
    await expect(run({ container: 'webm', codec: 'avc' })).rejects.toThrow(
      /WebM cannot hold H\.264/,
    );
    await expect(run({}, 0)).rejects.toThrow(/Nothing to export/);
    await expect(run({ range: [0.5, 0.52] })).rejects.toThrow(/Nothing to export/);
    expect(h.canvases).toHaveLength(0);
  });

  it('is cancelled by the AbortSignal: stops drawing, closes the encoder, rejects with AbortError', async () => {
    const h = harness();
    const controller = new AbortController();
    const scene = evaluator(10);
    const promise = createVideoExporter(h.env)(
      scene,
      OPTIONS,
      (p) => {
        if (p.frame === 5) controller.abort();
      },
      controller.signal,
    );
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(scene.times).toHaveLength(5);
    expect(h.encoder.state).toBe('closed');
    expect(h.frames.every((f) => f.closed)).toBe(true);
  });

  it('checks cancellation after its final cleanup await before returning a Blob', async () => {
    const h = harness();
    const abort = new AbortController();
    const reason = new DOMException('Cancelled after cleanup', 'AbortError');
    h.env.createMuxer = () => ({
      addChunk() {},
      waitForCapacity: async () => undefined,
      abort() {},
      drain: async () => {
        abort.abort(reason);
      },
      finalize: async () => new Blob(['video']),
    });
    await expect(
      createVideoExporter(h.env)(evaluator(0.1), OPTIONS, () => {}, abort.signal),
    ).rejects.toBe(reason);
  });

  it('is cancelled while the encoder flushes', async () => {
    const h = harness();
    const flushing = deferred();
    const controller = new AbortController();
    const promise = createVideoExporter({
      ...h.env,
      createEncoder: (init) => {
        const encoder = h.env.createEncoder(init) as FakeEncoder;
        encoder.flushHangs = true;
        encoder.onFlush = flushing.resolve;
        return encoder;
      },
    })(evaluator(0.5), OPTIONS, () => {}, controller.signal);
    await flushing.promise;
    expect(h.frames).toHaveLength(5);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.encoder.state).toBe('closed');
  });

  it('rejects at once when already aborted', async () => {
    const h = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createVideoExporter(h.env)(evaluator(1), OPTIONS, () => {}, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.canvases).toHaveLength(0);
  });

  it('waits for the encoder queue to drain (back-pressure)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const h = harness();
    const firstWait = deferred();
    const secondWait = deferred();
    let waits = 0;
    const scene = evaluator(2); // 20 frames
    const limit = maxQueue(OPTIONS.width, OPTIONS.height);
    const probe = createVideoExporter({
      ...h.env,
      createEncoder: (init) => {
        const encoder = h.env.createEncoder(init) as FakeEncoder;
        encoder.onQueueWait = () => (++waits === 1 ? firstWait : secondWait).resolve();
        const inner = encoder.onEncode;
        encoder.onEncode = (frame, options) => {
          inner(frame, options);
          encoder.encodeQueueSize += 1;
        };
        return encoder;
      },
    });
    const promise = probe(scene, OPTIONS, () => {}, new AbortController().signal);
    await firstWait.promise;
    expect(h.frames).toHaveLength(limit + 1);
    // the exporter is parked: nothing more is encoded until the encoder dequeues
    await vi.advanceTimersByTimeAsync(50);
    expect(h.frames.length).toBe(limit + 1);
    h.encoder.encodeQueueSize = 0;
    h.encoder.dequeue();
    await secondWait.promise;
    expect(h.frames).toHaveLength(2 * limit + 2);
    h.encoder.encodeQueueSize = 0;
    // the timer fallback notices a drained queue even without a dequeue event
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeInstanceOf(Blob);
    expect(h.frames).toHaveLength(20);
    expect(h.finalizedWith).toBe(2_000_000);
    expect(h.encoder.state).toBe('closed');
  }, 10_000);

  it('fails when the encoder reports an error', async () => {
    const h = harness();
    const promise = createVideoExporter({
      ...h.env,
      createEncoder: (init) => {
        const encoder = h.env.createEncoder(init) as FakeEncoder;
        const inner = encoder.onEncode;
        encoder.onEncode = (frame, options) => {
          inner(frame, options);
          if (h.frames.length === 3) init.error(new DOMException('boom', 'EncodingError'));
        };
        return encoder;
      },
    })(evaluator(5), OPTIONS, () => {}, new AbortController().signal);
    await expect(promise).rejects.toThrow('boom');
    expect(h.encoder.state).toBe('closed');
    expect(h.frames.length).toBeLessThan(10);
  });

  it('yields to the UI during long exports', async () => {
    const h = harness();
    const yieldToUi = vi.fn(() => Promise.resolve());
    let t = 0;
    await createVideoExporter({ ...h.env, yieldToUi, now: () => (t += 20) })(
      evaluator(1),
      OPTIONS,
      () => {},
      new AbortController().signal,
    );
    expect(yieldToUi.mock.calls.length).toBeGreaterThan(3);
  });
});
