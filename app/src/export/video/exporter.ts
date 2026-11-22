/* In-browser video export: the scene is drawn frame by frame with the preview's renderer,
 * encoded by WebCodecs and muxed to MP4 / WebM (docs/ARCHITECTURE.md §8).
 *
 * `createVideoExporter(env)` holds the logic against a small `VideoEnv`, so the unit tests can run
 * it with fakes; `exportVideo` (index.ts) is the same with the browser's objects.
 *
 * Fallback without WebCodecs (Firefox before 130, Safari before 16.4, insecure contexts): there is
 * none. MediaRecorder cannot be driven frame by frame and writes variable-rate files whose
 * duration is not frames / fps, so the exporter fails with `VideoUnsupportedError` and the dialog
 * points to "Companion · ffmpeg". */
import { createCanvasRenderer, type Renderer } from '../../render';
import type { ExportVideo } from '../types';
import {
  browserCanEncode,
  chooseEncoderConfig,
  codecLabel,
  defaultIsConfigSupported,
  type IsConfigSupported,
} from './codecs';
import { createMuxer, type MuxerRequest, type VideoMuxer } from './muxer';
import { frameDrawer, offscreen2d, planFrames } from './frames';
import { frameDurationUs, keyFrameInterval, timestampUs } from './timing';

export class VideoUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoUnsupportedError';
  }
}

/** The part of VideoEncoder the exporter uses. */
export interface EncoderLike {
  readonly state: CodecState;
  readonly encodeQueueSize: number;
  configure(config: VideoEncoderConfig): void;
  encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions): void;
  flush(): Promise<void>;
  close(): void;
  addEventListener(type: 'dequeue', listener: () => void): void;
  removeEventListener(type: 'dequeue', listener: () => void): void;
}

/** One canvas of the output size and the way to turn its current content into a VideoFrame. */
export interface FrameCanvas {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  toFrame(timestampUs: number, durationUs: number): VideoFrame;
}

export interface VideoEnv {
  isConfigSupported: IsConfigSupported;
  createEncoder(init: VideoEncoderInit): EncoderLike;
  createCanvas(width: number, height: number): FrameCanvas;
  createMuxer(request: MuxerRequest): VideoMuxer;
  renderer: Renderer;
  /** Let the browser paint and handle input (called about every 30 ms of work). */
  yieldToUi(): Promise<void>;
  now(): number;
}

/** Frames waiting in the encoder before the exporter pauses: fewer for big pictures. */
export function maxQueue(width: number, height: number): number {
  return width * height > 2560 * 1440 ? 3 : 8;
}

export function browserEnv(): VideoEnv {
  const isConfigSupported = defaultIsConfigSupported();
  if (!browserCanEncode() || !isConfigSupported) {
    throw new VideoUnsupportedError(
      'This browser cannot encode video (WebCodecs is missing). Use a recent Chrome or Edge, ' +
        'or choose "Companion · ffmpeg".',
    );
  }
  return {
    isConfigSupported,
    createEncoder: (init) => new VideoEncoder(init),
    createCanvas(width, height) {
      const { canvas, ctx } = offscreen2d(width, height);
      return {
        ctx,
        toFrame: (timestamp, duration) => new VideoFrame(canvas, { timestamp, duration }),
      };
    },
    createMuxer,
    renderer: createCanvasRenderer(),
    yieldToUi: () => new Promise((resolve) => setTimeout(resolve, 0)),
    now: () => performance.now(),
  };
}

function waitForDequeue(encoder: EncoderLike): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      encoder.removeEventListener('dequeue', done);
      clearTimeout(timer);
      resolve();
    };
    // The timer covers a missed event and an encoder that closed meanwhile.
    const timer = setTimeout(done, 100);
    encoder.addEventListener('dequeue', done);
  });
}

export function createVideoExporter(env: VideoEnv): ExportVideo {
  return async (evaluator, options, onProgress, signal) => {
    const { width, height, fps, codec, container } = options;
    if (![width, height, fps].every((n) => Number.isInteger(n) && n > 0)) {
      throw new Error('Width, height and frame rate must be positive whole numbers.');
    }
    if ((codec === 'avc' || container === 'mp4') && (width % 2 !== 0 || height % 2 !== 0)) {
      throw new Error('Width and height must be even for MP4 and H.264.');
    }
    if (container === 'webm' && codec === 'avc') {
      throw new Error('WebM cannot hold H.264. Use MP4, or pick VP9 or AV1.');
    }
    signal.throwIfAborted();

    const { start, total } = planFrames(evaluator.duration, options.range, fps);

    const config = await chooseEncoderConfig(
      { codec, width, height, fps, bitrate: options.bitrate },
      env.isConfigSupported,
    );
    if (!config) {
      throw new VideoUnsupportedError(
        `This browser cannot encode ${codecLabel(codec)} at ${width}×${height}. Pick another ` +
          'codec or size, or use "Companion · ffmpeg".',
      );
    }
    signal.throwIfAborted();

    const canvas = env.createCanvas(width, height);
    const drawFrame = frameDrawer(
      env.renderer,
      evaluator,
      { width, height, fps, background: options.background, framing: options.framing },
      start,
    );
    let failed = false;
    let failure: unknown;
    let encoder: EncoderLike | undefined = undefined;
    const recordFailure = (error: unknown) => {
      if (failed) return;
      failed = true;
      failure = error;
      if (encoder && encoder.state !== 'closed') encoder.close();
    };
    const check = () => {
      signal.throwIfAborted();
      if (failed) throw failure;
    };
    const muxer = env.createMuxer({
      container,
      codec,
      width,
      height,
      fps,
      sink: options.sink ?? null,
      onError: recordFailure,
    });
    encoder = env.createEncoder({
      output: (chunk, meta) => {
        if (signal.aborted || failed) return;
        try {
          muxer.addChunk(chunk, meta);
        } catch (error) {
          recordFailure(error);
        }
      },
      error: recordFailure,
    });
    const onAbort = () => {
      muxer.abort(signal.reason);
      if (encoder!.state !== 'closed') encoder!.close(); // rejects a pending flush
    };
    signal.addEventListener('abort', onAbort, { once: true });

    const keyInterval = keyFrameInterval(fps);
    const queueLimit = maxQueue(width, height);
    let lastYield = env.now();
    let result: Blob | null;
    try {
      encoder.configure(config);
      for (let k = 0; k < total; k++) {
        check();
        await muxer.waitForCapacity();
        check();
        while (encoder.encodeQueueSize > queueLimit) {
          await waitForDequeue(encoder);
          check();
        }
        drawFrame(canvas.ctx, k);
        const frame = canvas.toFrame(timestampUs(k, fps), frameDurationUs(k, fps));
        try {
          encoder.encode(frame, { keyFrame: k % keyInterval === 0 });
        } finally {
          frame.close();
        }
        onProgress({ frame: k + 1, totalFrames: total });
        // encodeQueueSize counts work accepted by the codec, not output callbacks still owed.
        // Bound that extra burst too, then let byte backpressure govern the next batch.
        if (options.sink && (k + 1) % queueLimit === 0) {
          await encoder.flush();
          check();
          await muxer.waitForCapacity();
        }
        if (env.now() - lastYield > 30) {
          await env.yieldToUi();
          lastYield = env.now();
        }
      }
      await encoder.flush();
      check();
      result = await muxer.finalize(timestampUs(total, fps));
      check();
    } catch (error) {
      muxer.abort(failed ? failure : error);
      if (signal.aborted) throw signal.reason ?? error;
      throw failed ? failure : error;
    } finally {
      if (encoder.state !== 'closed') encoder.close();
      // No losing async writer may outlive the export. The run owner aborts the destination on
      // cancellation; a sink without abort support must finish its one already-started write.
      await muxer.drain().catch(() => undefined);
      signal.removeEventListener('abort', onAbort);
    }
    check();
    return result;
  };
}
