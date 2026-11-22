/* Video through the companion (docs/COMPANION.md, "Video and Manim rendering").
 *
 * `exportVideoViaCompanion`: the same frames as the in-browser export, drawn by the same renderer,
 * sent as PNG to an ffmpeg job (any format ffmpeg offers). `renderWithManim`: the exported Python
 * scene rendered by the companion's Manim. Both create a job, follow it, download the result and
 * always ask the companion to delete the job's files at the end. With a soundtrack, the mix is
 * sent first (`soundtrack.ts`) and the companion's ffmpeg adds it to the file. */
import type {
  CompanionClient,
  CompanionJobStatus,
  CompanionManimRequest,
  CompanionQuality,
  CompanionVideoFormat,
} from '../../engine';
import { createCanvasRenderer, type Renderer } from '../../render';
import type { SceneEvaluator, SceneFraming } from '../../scene';
import type { VideoSink } from '../types';
import { browserPngCanvas, frameDrawer, planFrames, type PngCanvas } from './frames';
import { assertCoversVideo, sendSoundtrack, type Soundtrack } from './soundtrack';

/** A job that ended in failure; `log` is the end of ffmpeg's or Manim's output. */
export class CompanionJobError extends Error {
  constructor(
    message: string,
    readonly log: string,
  ) {
    super(message);
    this.name = 'CompanionJobError';
  }
}

export interface CompanionVideoOptions {
  background: string;
  width: number;
  height: number;
  fps: number;
  format: CompanionVideoFormat;
  quality: CompanionQuality;
  range: [number, number] | null;
  /** The frame each instant is filmed through, for a scene with a camera that moves
   * (`sceneFraming`); absent or null, Manim's still frame. */
  framing?: SceneFraming | null;
  /** Where the result goes as it is downloaded; without one it comes back as a Blob. */
  sink?: VideoSink | null;
  /** The sound of the video: the mix of exactly its range. Not for GIF; the companion must list
   * the format in `capabilities.videoAudio`. */
  soundtrack?: Soundtrack | null;
}

export type JobPhase = 'sound' | 'rendering' | 'encoding' | 'downloading';

export interface JobProgress {
  phase: JobPhase;
  /** Video frames; in the 'sound' phase, sample frames of the mix. */
  frame: number;
  totalFrames: number;
  /** Jobs with a soundtrack: samples of the mix over full scale so far. */
  clippedSamples?: number;
}

export interface CompanionVideoDeps {
  createCanvas(width: number, height: number): PngCanvas;
  renderer: Renderer;
}

/** Frames per request and bytes per request: big enough to keep the connection busy, small enough
 * that cancelling is quick. The companion's own limits are checked as well. */
export const MAX_FRAMES_PER_REQUEST = 32;
export const TARGET_REQUEST_BYTES = 6 * 1024 * 1024;

export async function exportVideoViaCompanion(
  client: CompanionClient,
  evaluator: SceneEvaluator,
  options: CompanionVideoOptions,
  onProgress: (progress: JobProgress) => void,
  signal: AbortSignal,
  deps: CompanionVideoDeps = { createCanvas: browserPngCanvas, renderer: createCanvasRenderer() },
): Promise<Blob | null> {
  signal.throwIfAborted();
  const { width, height, fps } = options;
  const { start, total } = planFrames(evaluator.duration, options.range, fps);
  const soundtrack = options.soundtrack ?? null;
  if (soundtrack) assertCoversVideo(soundtrack.plan, start, total, fps);

  // The create request is not given the signal: aborting it could leave a job on the companion
  // whose id never arrives. It is short; if the user cancelled meanwhile, the job is deleted below.
  const created = await client.createVideoJob({
    format: options.format,
    quality: options.quality,
    width,
    height,
    fps,
    frames: total,
    ...(soundtrack ? { audio: true } : {}),
  });
  const id = created.id;
  let result: Blob | null;
  try {
    signal.throwIfAborted();
    let clippedSamples: number | undefined;
    if (soundtrack) {
      // The sound goes first: a recording that cannot be read stops the export before any frame.
      await sendSoundtrack(
        client,
        'video',
        id,
        soundtrack,
        (p) => {
          clippedSamples = p.clippedSamples;
          onProgress({ phase: 'sound', ...p });
        },
        signal,
        created.maxAudioRequestBytes,
      );
    }
    const withSound = clippedSamples === undefined ? {} : { clippedSamples };
    const maxFrame = created.maxFrameBytes ?? 64 * 1024 * 1024;
    const maxRequest = Math.min(created.maxRequestBytes ?? 128 * 1024 * 1024, 32 * 1024 * 1024);
    const canvas = deps.createCanvas(width, height);
    const drawFrame = frameDrawer(
      deps.renderer,
      evaluator,
      { width, height, fps, background: options.background, framing: options.framing },
      start,
    );

    let pending: Blob[] = [];
    let pendingBytes = 0;
    let sentFrames = 0;
    let upload: Promise<void> = Promise.resolve();
    let failure: unknown = null;
    const flush = async () => {
      if (pending.length === 0) return;
      await upload; // one request in flight; the next batch was rendered meanwhile
      if (failure) throw failure;
      const body = new Blob(pending, { type: 'application/octet-stream' });
      const first = sentFrames;
      sentFrames += pending.length;
      pending = [];
      pendingBytes = 0;
      upload = client.sendVideoFrames(id, first, body, signal).then(
        () => undefined,
        (error: unknown) => {
          failure ??= error;
        },
      );
    };

    for (let k = 0; k < total; k++) {
      signal.throwIfAborted();
      if (failure) throw failure;
      drawFrame(canvas.ctx, k);
      const png = await canvas.toPng();
      if (png.size > maxFrame) throw new Error('A frame is larger than the companion accepts.');
      if (pending.length > 0 && pendingBytes + png.size > maxRequest) await flush();
      pending.push(png);
      pendingBytes += png.size;
      onProgress({ phase: 'rendering', frame: k + 1, totalFrames: total, ...withSound });
      if (pending.length >= MAX_FRAMES_PER_REQUEST || pendingBytes >= TARGET_REQUEST_BYTES) {
        await flush();
      }
    }
    await flush();
    await upload;
    if (failure) throw failure;

    onProgress({ phase: 'encoding', frame: total, totalFrames: total, ...withSound });
    const finished = await client.finishVideoJob(id, signal);
    if (finished.state !== 'done') throw jobFailure(finished, 'ffmpeg failed.');
    onProgress({ phase: 'downloading', frame: total, totalFrames: total, ...withSound });
    result = await client.jobResult('video', id, signal, options.sink ?? null);
  } finally {
    await client.cancelJob('video', id); // deletes the job's files (also after a success)
  }
  signal.throwIfAborted();
  return result;
}

function jobFailure(status: CompanionJobStatus, fallback: string): Error {
  if (status.state === 'cancelled') return new DOMException('The job was cancelled.', 'AbortError');
  return new CompanionJobError(status.error?.message || fallback, status.error?.log ?? '');
}

// --- Render with Manim ---------------------------------------------------------------------

export interface ManimProgress {
  /** 'running' while Manim renders; then the result is downloaded. With a soundtrack: 'sound'
   * before, while it is sent, and 'encoding' after, while ffmpeg adds it to Manim's video. */
  phase: 'sound' | 'running' | 'encoding' | 'downloading';
  /** Frames rendered so far (best effort); `totalFrames` is the expected number, or null. In the
   * 'sound' phase, sample frames of the mix. */
  frame: number;
  totalFrames: number | null;
  animation: number | null;
  /** With a soundtrack: samples of the mix over full scale so far. */
  clippedSamples?: number;
}

export interface ManimOptions {
  /** Milliseconds between status requests. */
  pollMs?: number;
  /** Where the video goes as it is downloaded; without one it comes back as a Blob. */
  sink?: VideoSink | null;
  /** The sound of the video: the mix of the whole scene Manim renders, `frames / fps` seconds
   * from zero. The request must say its size, frame rate and frames. */
  soundtrack?: Soundtrack | null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function renderWithManim(
  client: CompanionClient,
  request: CompanionManimRequest,
  onProgress: (progress: ManimProgress) => void,
  signal: AbortSignal,
  options: ManimOptions = {},
): Promise<Blob | null> {
  signal.throwIfAborted();
  const soundtrack = options.soundtrack ?? null;
  if (soundtrack) {
    if (!request.frames || !request.fps)
      throw new Error('A render with sound needs its frame rate and its number of frames.');
    assertCoversVideo(soundtrack.plan, 0, request.frames, request.fps);
  }
  // Not abortable on purpose, see exportVideoViaCompanion: a job whose id was lost cannot be deleted.
  const started = await client.startManimRender(soundtrack ? { ...request, audio: true } : request);
  const id = started.id;
  let result: Blob | null;
  try {
    signal.throwIfAborted();
    let status = started;
    let withSound: { clippedSamples?: number } = {};
    if (soundtrack) {
      // Manim starts when the companion has the whole soundtrack.
      await sendSoundtrack(
        client,
        'manim',
        id,
        soundtrack,
        (p) => {
          withSound = { clippedSamples: p.clippedSamples };
          onProgress({ phase: 'sound', ...p, animation: null });
        },
        signal,
        started.maxAudioRequestBytes,
      );
      status = await client.jobStatus('manim', id, signal);
    }
    for (;;) {
      onProgress({
        phase: status.state === 'encoding' ? 'encoding' : 'running',
        frame: status.frame ?? 0,
        totalFrames: status.frames ?? null,
        animation: status.animation ?? null,
        ...withSound,
      });
      if (status.state === 'done') break;
      if (status.state === 'failed' || status.state === 'cancelled') {
        throw jobFailure(status, 'Manim failed.');
      }
      await sleep(options.pollMs ?? 500, signal);
      status = await client.jobStatus('manim', id, signal);
    }
    onProgress({
      phase: 'downloading',
      frame: status.frames ?? status.frame ?? 0,
      totalFrames: status.frames ?? null,
      animation: status.animation ?? null,
      ...withSound,
    });
    result = await client.jobResult('manim', id, signal, options.sink ?? null);
  } finally {
    await client.cancelJob('manim', id); // stops a running render and deletes its files
  }
  signal.throwIfAborted();
  return result;
}
