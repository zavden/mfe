/* What the two frame-by-frame video exports share (WebCodecs in the browser, and the companion's
 * ffmpeg): which frames to draw, how to draw one, and the canvas they are drawn on. */
import { FRAME_HEIGHT, frameWidth } from '../../model';
import { cameraThrough, type Camera, type Renderer, type Surface } from '../../render';
import type { SceneEvaluator, SceneFraming } from '../../scene';
import { frameTime, resolveRange, totalFrames } from './timing';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The camera of a video frame: the whole Manim frame (8 units tall, 8·w/h wide), centred. */
export function exportCamera(width: number, height: number): Camera {
  return {
    frameWidth: frameWidth({ width, height }),
    frameHeight: FRAME_HEIGHT,
    center: [0, 0],
    zoom: 1,
  };
}

/** The frames of an export: `total` frames of 1/fps from `start` (the range, or the scene). */
export function planFrames(
  duration: number,
  range: [number, number] | null,
  fps: number,
): { start: number; total: number } {
  const [start, end] = resolveRange(duration, range);
  const total = totalFrames(start, end, fps);
  if (total < 1) throw new Error('Nothing to export: the selected range is shorter than a frame.');
  return { start, total };
}

/** Draws frame `k` of the export (from `start`) on a canvas of the output size: through Manim's
 * still frame, or, for a scene with a camera that moves (`framing`, D190), through the camera's
 * frame of that instant, which then fills the picture as it does in Manim's render. */
export function frameDrawer(
  renderer: Renderer,
  evaluator: SceneEvaluator,
  output: {
    width: number;
    height: number;
    fps: number;
    background: string;
    framing?: SceneFraming | null;
  },
  start: number,
): (ctx: Context2D, k: number) => void {
  const { width, height, fps, background, framing } = output;
  const still = exportCamera(width, height);
  const surface: Surface = { width, height };
  const style = { background, outside: null };
  return (ctx, k) => {
    const t = frameTime(k, start, fps);
    const camera = framing ? cameraThrough(framing(t), width / height) : still;
    renderer.draw(ctx, evaluator.evaluate(t), camera, surface, style);
  };
}

/** A 2D canvas off screen, of the output size: opaque, as a frame of a video is, unless `alpha`
 * asks for one that starts as nothing (a picture without its background). */
export function offscreen2d(
  width: number,
  height: number,
  alpha = false,
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha });
  if (!ctx) throw new Error('Cannot create a 2D canvas for the export.');
  return { canvas, ctx };
}

/** A canvas of the output size that can be saved as PNG. */
export interface PngCanvas {
  ctx: Context2D;
  toPng(): Promise<Blob>;
}

/** The browser's: off screen where it has such canvases, else one of the document's. */
export function browserPngCanvas(width: number, height: number, alpha = false): PngCanvas {
  if (typeof OffscreenCanvas === 'function') {
    const { canvas, ctx } = offscreen2d(width, height, alpha);
    return { ctx, toPng: () => canvas.convertToBlob({ type: 'image/png' }) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha });
  if (!ctx) throw new Error('Cannot create a 2D canvas for the export.');
  return {
    ctx,
    toPng: () =>
      new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Cannot encode a frame as PNG.'))),
          'image/png',
        ),
      ),
  };
}
