/* Where the scene lands on a canvas: the camera the app's renderer draws with (render/camera.ts)
 * for a region of the scene fitted into a canvas, and the mapping between scene units (y up) and
 * the canvas's pixels — the bitmap's device pixels and the page's CSS pixels. The player shows
 * the whole Manim frame; a widget may show a part of it (one formula, zoomed). Pure. */
import type { Box, Vec2 } from '../geom';
import { FRAME_HEIGHT, frameWidth, type ProjectMeta } from '../model';
import { fitScale, toPixel, toScene, type Camera, type Surface } from '../render';

/** How a region of the scene sits on a canvas, and the way between their coordinates. */
export interface View {
  /** The camera the renderer draws with. */
  readonly camera: Camera;
  /** The canvas bitmap, in device pixels. */
  readonly surface: Surface;
  /** Device pixels per CSS pixel: the bitmap's width over the canvas's CSS width. */
  readonly dpr: number;
  /** Device pixels per scene unit. */
  readonly scale: number;
  /** A scene point → device pixels of the bitmap (y down, from its top left corner). */
  toPixel(point: Vec2): Vec2;
  /** Device pixels of the bitmap → a scene point. */
  toScene(pixel: Vec2): Vec2;
  /** A scene point → CSS pixels from the canvas's top left corner (what `offsetX`/`offsetY` of a
   * pointer event on it say). */
  toCss(point: Vec2): Vec2;
  /** CSS pixels from the canvas's top left corner → a scene point. */
  fromCss(css: Vec2): Vec2;
  /** A box of the scene → the rectangle it covers on the canvas, in CSS pixels. */
  boxToCss(box: Box): { left: number; top: number; width: number; height: number };
}

/** The whole Manim frame of a project: 8 units tall, as wide as its pixels make it, centred. */
export function frameBox(meta: Pick<ProjectMeta, 'width' | 'height'>): Box {
  const halfWidth = frameWidth(meta) / 2;
  const halfHeight = FRAME_HEIGHT / 2;
  return { minX: -halfWidth, minY: -halfHeight, maxX: halfWidth, maxY: halfHeight };
}

/** `box` grown by `margin` scene units on every side. */
export function padBox(box: Box, margin: number): Box {
  return {
    minX: box.minX - margin,
    minY: box.minY - margin,
    maxX: box.maxX + margin,
    maxY: box.maxY + margin,
  };
}

/** The box of a frame of the scene `height` units tall about `center`, for a project of `meta`:
 * a scene camera's frame (D190), which has the picture's shape. */
export function cameraBox(
  meta: Pick<ProjectMeta, 'width' | 'height'>,
  frame: { readonly center: Vec2; readonly height: number },
): Box {
  const halfHeight = frame.height / 2;
  const halfWidth = (halfHeight * meta.width) / meta.height;
  return {
    minX: frame.center[0] - halfWidth,
    minY: frame.center[1] - halfHeight,
    maxX: frame.center[0] + halfWidth,
    maxY: frame.center[1] + halfHeight,
  };
}

/** The view that fits `region` (scene units) whole into a canvas of `surface` device pixels,
 * centred, for a project of `meta`. The renderer clips to `filmed`, the frame the scene is filmed
 * through: the project's whole frame, or the frame of its camera at the instant shown
 * (`cameraBox`). `dpr` is the canvas's device pixels per CSS pixel. A degenerate region (no width
 * or no height) shows the filmed frame whole. */
export function fitView(
  meta: Pick<ProjectMeta, 'width' | 'height'>,
  surface: Surface,
  dpr: number,
  region?: Box,
  filmed: Box = frameBox(meta),
): View {
  const shown = region ?? filmed;
  const regionWidth = shown.maxX - shown.minX;
  const regionHeight = shown.maxY - shown.minY;
  const frameCenter: Vec2 = [(filmed.minX + filmed.maxX) / 2, (filmed.minY + filmed.maxY) / 2];
  const atOrigin = frameCenter[0] === 0 && frameCenter[1] === 0;
  const frame: Camera = {
    frameWidth: filmed.maxX - filmed.minX,
    frameHeight: filmed.maxY - filmed.minY,
    // The project's own frame is about the origin: its camera says nothing more, as ever.
    ...(atOrigin ? {} : { frameCenter }),
    center: frameCenter,
    zoom: 1,
  };
  const usable = regionWidth > 0 && regionHeight > 0 && Number.isFinite(regionWidth + regionHeight);
  const wanted = usable
    ? Math.min(surface.width / regionWidth, surface.height / regionHeight)
    : fitScale(frame, surface);
  const camera: Camera = usable
    ? {
        ...frame,
        center: [(shown.minX + shown.maxX) / 2, (shown.minY + shown.maxY) / 2],
        zoom: wanted / fitScale(frame, surface),
      }
    : frame;
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const view: View = {
    camera,
    surface,
    dpr: ratio,
    scale: wanted,
    toPixel: (point) => toPixel(point, camera, surface),
    toScene: (pixel) => toScene(pixel, camera, surface),
    toCss: (point) => {
      const [x, y] = toPixel(point, camera, surface);
      return [x / ratio, y / ratio];
    },
    fromCss: ([x, y]) => toScene([x * ratio, y * ratio], camera, surface),
    boxToCss: (box) => {
      const [left, top] = view.toCss([box.minX, box.maxY]);
      const [right, bottom] = view.toCss([box.maxX, box.minY]);
      return { left, top, width: right - left, height: bottom - top };
    },
  };
  return view;
}

/** The bitmap size of a canvas laid out `cssWidth` × `cssHeight` CSS pixels on a screen of
 * `dpr` device pixels per CSS pixel: whole device pixels, at least one. */
export function bitmapSize(cssWidth: number, cssHeight: number, dpr: number): Surface {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  };
}
