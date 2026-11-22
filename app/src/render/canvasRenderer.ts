/* Canvas 2D implementation of the Renderer contract (render/types.ts).
 *
 * It only maps scene units to pixels and paints; animation lives in scene/. Matches Manim's
 * Cairo camera: fills use the non-zero winding rule, strokes are mitred with butt caps and a
 * width of 0.01 scene units per Manim stroke-width unit, fill first and stroke on top, and a
 * subpath whose end point equals its start point is closed. The same code draws the preview and
 * (Phase 5) every frame of a video export, into any 2D context, DOM-attached or not. */
import type { Contour, Vec2 } from '../geom';
import type { CubicPath, Drawable } from '../scene';
import { frameRect, sceneToPixelMatrix, toScene } from './camera';
import { containsPoint, flattenPath, nearStroke, type FlatContour } from './hitTest';
import type { Camera, FrameStyle, Renderer, Surface } from './types';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** What both `Path2D` and a 2D context accept while tracing a path. */
interface PathSink {
  moveTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}

/** One Manim stroke-width unit in scene units (ManimCE Cairo: `cairo_line_width_multiple`). */
export const STROKE_UNIT = 0.01;
/** Cairo's default miter limit; Canvas has the same default. */
export const MITER_LIMIT = 10;
/** Points closer than this are "equal" when deciding whether a subpath is closed. */
const CLOSE_EPSILON = 1e-8;

export function traceContours(sink: PathSink, contours: readonly Contour[]): void {
  for (const c of contours) {
    if (c.length < 8) continue; // a lone point or less than one curve draws nothing
    sink.moveTo(c[0]!, c[1]!);
    for (let i = 2; i + 5 < c.length; i += 6) {
      sink.bezierCurveTo(c[i]!, c[i + 1]!, c[i + 2]!, c[i + 3]!, c[i + 4]!, c[i + 5]!);
    }
    const n = c.length;
    if (
      Math.abs(c[0]! - c[n - 2]!) < CLOSE_EPSILON &&
      Math.abs(c[1]! - c[n - 1]!) < CLOSE_EPSILON
    ) {
      sink.closePath();
    }
  }
}

const hasPath2D = typeof Path2D !== 'undefined';

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Drawables in ascending z; array order breaks ties (Array.prototype.sort is stable). */
function inDrawOrder(drawables: readonly Drawable[]): readonly Drawable[] {
  for (let i = 1; i < drawables.length; i++) {
    if (drawables[i - 1]!.z > drawables[i]!.z) return [...drawables].sort((a, b) => a.z - b.z);
  }
  return drawables;
}

export function createCanvasRenderer(): Renderer {
  // Path2D / flattened geometry per path object: pan, zoom and hover redraws reuse them. The
  // evaluator builds new path objects whenever time or the project changes, so entries expire
  // with the frame they belong to.
  const path2dCache = new WeakMap<CubicPath, Path2D>();
  const flatCache = new WeakMap<CubicPath, FlatContour[]>();

  const path2d = (path: CubicPath): Path2D => {
    let cached = path2dCache.get(path);
    if (!cached) {
      cached = new Path2D();
      traceContours(cached, path.contours);
      path2dCache.set(path, cached);
    }
    return cached;
  };

  const flat = (path: CubicPath): FlatContour[] => {
    let cached = flatCache.get(path);
    if (!cached) {
      cached = flattenPath(path);
      flatCache.set(path, cached);
    }
    return cached;
  };

  return {
    draw(ctx: Context2D, drawables, camera: Camera, surface: Surface, style: FrameStyle) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      if (style.unclipped) {
        // The world around the frame: the scene's background everywhere, and nothing cut.
        ctx.fillStyle = style.background;
        ctx.fillRect(0, 0, surface.width, surface.height);
      } else {
        ctx.fillStyle = style.outside ?? style.background;
        ctx.fillRect(0, 0, surface.width, surface.height);

        // The frame rectangle snapped to whole pixels: crisp edges, and a frame that fills the
        // canvas up to rounding leaves no sliver of the letterbox colour.
        const frame = frameRect(camera, surface);
        const left = Math.round(frame.x);
        const top = Math.round(frame.y);
        const right = Math.round(frame.x + frame.width);
        const bottom = Math.round(frame.y + frame.height);
        ctx.fillStyle = style.background;
        ctx.fillRect(left, top, right - left, bottom - top);

        // Nothing is visible outside the Manim frame, as in the rendered video.
        ctx.beginPath();
        ctx.rect(left, top, right - left, bottom - top);
        ctx.clip();
      }
      style.underlay?.(ctx);

      const [a, b, c, d, e, f] = sceneToPixelMatrix(camera, surface);
      ctx.setTransform(a, b, c, d, e, f);
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      ctx.miterLimit = MITER_LIMIT;

      for (const drawable of inDrawOrder(drawables)) {
        const { fill, stroke, path } = drawable;
        const fillAlpha = fill ? clamp01(fill.opacity) : 0;
        const strokeAlpha = stroke ? clamp01(stroke.opacity) : 0;
        if (fillAlpha === 0 && (strokeAlpha === 0 || stroke!.width <= 0)) continue;

        const shape = hasPath2D ? path2d(path) : null;
        if (!shape) {
          ctx.beginPath();
          traceContours(ctx, path.contours);
        }
        if (fill && fillAlpha > 0) {
          ctx.globalAlpha = fillAlpha;
          ctx.fillStyle = fill.color;
          if (shape) ctx.fill(shape, 'nonzero');
          else ctx.fill('nonzero');
        }
        if (stroke && strokeAlpha > 0 && stroke.width > 0) {
          ctx.globalAlpha = strokeAlpha;
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width * STROKE_UNIT;
          if (shape) ctx.stroke(shape);
          else ctx.stroke();
        }
      }
      ctx.restore();
    },

    pick(drawables, scenePoint: Vec2, slack = 0) {
      const ordered = inDrawOrder(drawables);
      for (let i = ordered.length - 1; i >= 0; i--) {
        const drawable = ordered[i]!;
        if (drawable.role !== 'object') continue;
        const fillVisible = !!drawable.fill && drawable.fill.opacity > 0;
        const strokeVisible =
          !!drawable.stroke && drawable.stroke.opacity > 0 && drawable.stroke.width > 0;
        if (!fillVisible && !strokeVisible) continue;
        const shape = flat(drawable.path);
        // A fill is hit anywhere inside; a stroke only along its line, so that what sits inside a
        // hollow shape (a formula in its box) stays under the pointer.
        if (fillVisible && containsPoint(shape, scenePoint, 'nonzero')) return drawable;
        if (
          strokeVisible &&
          nearStroke(shape, scenePoint, (drawable.stroke!.width * STROKE_UNIT) / 2 + slack)
        ) {
          return drawable;
        }
      }
      return null;
    },

    toScene: (pixel, camera, surface) => toScene(pixel, camera, surface),
  };
}
