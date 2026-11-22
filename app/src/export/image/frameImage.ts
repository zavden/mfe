/* The frame of the scene at an instant as a PNG picture (Export ▸ Image…). It is the frame a video
 * shows there, drawn by what draws a video's (`video/frames.ts`): through the scene's camera when
 * it has one that moves, with the tracks hidden in the Preview, which are a toggle of the Preview.
 * At the project's size or a multiple of it — the scene is curves, so more pixels are a sharper
 * picture, not a stretched one —, over the scene's background or over nothing. */
import type { ResolvedFormulas } from '../../engine';
import type { Project, ProjectMeta } from '../../model';
import { createCanvasRenderer, type Renderer } from '../../render';
import { exportEvaluator, sceneFraming } from '../../scene';
import { browserPngCanvas, frameDrawer, type PngCanvas } from '../video/frames';

/** How many pixels of the picture a pixel of the project is, each way. */
export const IMAGE_SCALES = [1, 2] as const;
export type ImageScale = (typeof IMAGE_SCALES)[number];

export interface FrameImageOptions {
  /** The instant of the scene, in seconds (the evaluator keeps it within the scene). */
  time: number;
  scale: ImageScale;
  /** Without the scene's background: what is drawn, over nothing. */
  transparent: boolean;
}

export interface FrameImage {
  blob: Blob;
  width: number;
  height: number;
}

/** What the picture is drawn with; a test gives its own. `alpha`: a canvas that starts as
 * nothing, for a picture without its background. */
export interface FrameImageDeps {
  createCanvas(width: number, height: number, alpha: boolean): PngCanvas;
  renderer: Renderer;
}

/** The pixels of the picture. */
export function imageSize(
  meta: Pick<ProjectMeta, 'width' | 'height'>,
  scale: number,
): { width: number; height: number } {
  return { width: meta.width * scale, height: meta.height * scale };
}

export async function frameImage(
  project: Project,
  resolved: ResolvedFormulas,
  options: FrameImageOptions,
  deps: FrameImageDeps = { createCanvas: browserPngCanvas, renderer: createCanvasRenderer() },
): Promise<FrameImage> {
  const { width, height } = imageSize(project.meta, options.scale);
  const canvas = deps.createCanvas(width, height, options.transparent);
  // The first frame of a video that starts at the instant. A background that is no colour paints
  // nothing: the canvas keeps the nothing it started as.
  const draw = frameDrawer(
    deps.renderer,
    exportEvaluator(project, resolved, { width, height }),
    {
      width,
      height,
      fps: project.meta.fps,
      background: options.transparent ? 'transparent' : project.meta.background,
      framing: sceneFraming(project),
    },
    options.time,
  );
  draw(canvas.ctx, 0);
  return { blob: await canvas.toPng(), width, height };
}
