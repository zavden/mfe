/* The preview's grid, drawn under the formulas (the renderer's `underlay`): one device pixel per
 * line, laid on the pixel grid like the snap guides, the origin's axes stronger. The colour is a
 * translucent mid grey, readable over any scene background. */
import type { Box } from '../../geom';
import { sceneToPixelMatrix, toScene, type Camera, type Surface } from '../../render';
import { gridLines } from './grid';

export const GRID_LINE = 'rgba(128, 128, 128, 0.35)';
export const GRID_AXIS = 'rgba(128, 128, 128, 0.75)';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The part of the scene a canvas shows, as a box: what the grid covers in a scene with a camera
 * (D190), whose world has no frame to stop at — the grid stays in the world, and is drawn
 * wherever the view looks. */
export function canvasBox(camera: Camera, surface: Surface): Box {
  const [minX, maxY] = toScene([0, 0], camera, surface);
  const [maxX, minY] = toScene([surface.width, surface.height], camera, surface);
  return { minX, minY, maxX, maxY };
}

/** Draw the lines of a grid of `step` scene units across `frame` (the Manim frame, or the part of
 * the world a canvas shows: `canvasBox`), in pixels. */
export function drawGrid(
  ctx: Context2D,
  camera: Camera,
  surface: Surface,
  frame: Box,
  step: number,
): void {
  const [a, , , d, e, f] = sceneToPixelMatrix(camera, surface);
  const lines = gridLines(frame, step);
  // The middle of a device pixel: a crisp one-pixel line.
  const px = (x: number) => Math.floor(a * x + e) + 0.5;
  const py = (y: number) => Math.floor(d * y + f) + 0.5;
  const top = py(frame.maxY);
  const bottom = py(frame.minY);
  const left = px(frame.minX);
  const right = px(frame.maxX);
  const stroke = (color: string, xs: readonly number[], ys: readonly number[]) => {
    if (xs.length === 0 && ys.length === 0) return;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const x of xs) {
      ctx.moveTo(px(x), top);
      ctx.lineTo(px(x), bottom);
    }
    for (const y of ys) {
      ctx.moveTo(left, py(y));
      ctx.lineTo(right, py(y));
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1;
  stroke(
    GRID_LINE,
    lines.x.filter((x) => x !== 0),
    lines.y.filter((y) => y !== 0),
  );
  stroke(
    GRID_AXIS,
    lines.x.filter((x) => x === 0),
    lines.y.filter((y) => y === 0),
  );
  ctx.restore();
}
