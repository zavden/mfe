/* The Emphasis blocks (`EmphasisEvent`, D73) as the evaluator plays them, measured against both
 * libraries (fixtures/manim/gen_emphasis.py, __tests__/manim-emphasis.test.ts):
 *   - an Indicate and a Wiggle move the glyphs themselves, as part motions (part.ts,
 *     `emphasisMotion`): the Indicate scales them by `scale` about the centre of their box and
 *     turns them `color`, fill and stroke, driven by its pulse easing — Manim's `Transform` to the
 *     scaled, recoloured copy —; the Wiggle scales them by `there_and_back` of the eased progress
 *     and turns them by `wiggle(s, n) · angle` about that centre, as the export's `_Wiggle` helper
 *     does (Manim's own Wiggle reads the centre again while it moves the glyphs one by one, which
 *     drifts it by a hundredth, and ManimGL's refuses an array pivot);
 *   - a Circumscribe, a Flash and a FocusOn draw a temporary mobject built from what Manim
 *     measures of the glyphs when the block starts (`buildTemp`, from `SceneEvaluator.measure`)
 *     and cut or shrunk per frame (`tempLooks`): the Circumscribe's frame, the
 *     `SurroundingRectangle` of the `fitShape` box rule, traced and untraced in one pass as
 *     `ShowPassingFlash` cuts it (`flashBounds`); the Flash's twelve lines, 0.1 to 0.3 away from
 *     the glyphs' centre (both libraries' defaults), each cut the same way with the library's own
 *     time width; the FocusOn's disc, a `Dot` as wide as the frame at the origin interpolated to a
 *     point at the glyphs' centre, so that it shrinks and slides there while its fill rises. */
import {
  circleContour,
  lineContour,
  partialContours,
  partialQuadraticPoints,
  pointsToContours,
  rectangleContour,
  toPointPath,
  type Contour,
  type PointPath,
  type Vec2,
} from '../../geom';
import type { Target } from '../../model';
import type { RateFunction } from '../easing';
import { criticalPoint, type ManimBoxes } from '../measure';
import { boxFitGeometry } from '../shapes';
import type { EmphasisEvent } from '../types';
import type { Look } from './looks';
import type { PartMotion } from './part';

/** Manim's `Flash`: `lines` lines `length` long starting `radius` from the point, `strokeWidth`
 * wide, each a `ShowPassingFlash` with the library's own `time_width` (ManimGL's is its
 * `ShowCreationThenDestruction`). */
export const FLASH = {
  lines: 12,
  length: 0.2,
  radius: 0.1,
  strokeWidth: 3,
  timeWidth: { ce: 1, gl: 2 } as Record<Target, number>,
} as const;

/** Half the frame's height (`FRAME_Y_RADIUS`): a FocusOn starts from a disc of radius
 * `frame_x_radius + frame_y_radius`. */
export const FRAME_Y_RADIUS = 4;

/** Below this, a cut or a radius is float noise, not something to draw. */
const NEGLIGIBLE = 1e-9;

/** The part motion of an Emphasis block that animates its glyphs (`EMPHASIS[effect].animates`),
 * or null for one that only measures them. `thereAndBack` is the target library's rate function
 * of that name, which a Wiggle's scale and turn follow. */
export function emphasisMotion(
  event: EmphasisEvent,
  thereAndBack: RateFunction,
): PartMotion | null {
  const base = {
    id: event.id,
    start: event.start,
    end: event.end,
    easing: event.easing,
    glyphs: event.glyphs,
    shift: [0, 0] as Vec2,
    opacity: null,
  };
  switch (event.effect) {
    case 'indicate':
      return { ...base, scale: event.scale, rotation: 0, color: event.color };
    case 'wiggle':
      return {
        ...base,
        scale: event.scale,
        rotation: event.angle,
        color: null,
        profile: {
          scale: thereAndBack,
          turn: (s) => thereAndBack(s) * Math.sin(event.wiggles * Math.PI * s),
        },
      };
    default:
      return null;
  }
}

/** A straight contour with the point list the target library stores for it. */
interface Stroke {
  contour: Contour;
  path: PointPath;
}

/** The temporary mobject of a Circumscribe, a Flash or a FocusOn, built once at the block's
 * start. */
export type TempShape =
  | { kind: 'frame'; frame: Stroke }
  | { kind: 'flash'; lines: Stroke[] }
  | { kind: 'focus'; point: Vec2; radius: number };

function stroke(contour: Contour, target: Target): Stroke {
  return { contour, path: toPointPath([contour], target) };
}

/** What a Circumscribe, a Flash or a FocusOn draws, from the boxes Manim reads over the glyphs
 * when the block starts; `frameWidth` is that of the picture being made (8 units tall): the
 * project's in the preview, the video's in an export. Null for an effect that animates its glyphs
 * instead. */
export function buildTemp(
  event: EmphasisEvent,
  boxes: ManimBoxes,
  target: Target,
  frameWidth: number,
): TempShape | null {
  switch (event.effect) {
    case 'circumscribe': {
      const fit = boxFitGeometry(boxes, event.buff);
      if (![fit.width, fit.height, ...fit.center].every(Number.isFinite)) return null;
      return {
        kind: 'frame',
        frame: stroke(rectangleContour(target, fit.width, fit.height, fit.center), target),
      };
    }
    case 'flash': {
      // `Line(point, point + length * RIGHT).shift(radius * RIGHT).rotate(angle, about_point=point)`
      // in ManimCE; ManimGL builds the same lines about the origin and keeps them on the point.
      const [cx, cy] = criticalPoint(boxes, [0, 0]);
      const lines: Stroke[] = [];
      for (let k = 0; k < FLASH.lines; k++) {
        const angle = (2 * Math.PI * k) / FLASH.lines;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const inner: Vec2 = [cx + FLASH.radius * dx, cy + FLASH.radius * dy];
        const outer = FLASH.radius + FLASH.length;
        lines.push(stroke(lineContour(target, inner, [cx + outer * dx, cy + outer * dy]), target));
      }
      return { kind: 'flash', lines };
    }
    case 'focus_on':
      return {
        kind: 'focus',
        point: criticalPoint(boxes, [0, 0]),
        radius: frameWidth / 2 + FRAME_Y_RADIUS,
      };
    default:
      return null;
  }
}

/** The stretch of the path `ShowPassingFlash` shows at eased progress `alpha` with `timeWidth`:
 * `[upper − w, upper]` for `upper = alpha · (1 + w)`, clamped to [0, 1] (Manim's `_get_bounds`). */
export function flashBounds(alpha: number, timeWidth: number): [number, number] {
  const upper = alpha * (1 + timeWidth);
  return [Math.max(upper - timeWidth, 0), Math.min(upper, 1)];
}

/** The stretch [lower, upper] of a stroke, cut by curve count as the target library cuts it
 * (`pointwise_become_partial`); nothing for an empty stretch. */
function cut(s: Stroke, lower: number, upper: number, target: Target): Contour[] {
  if (upper - lower <= NEGLIGIBLE) return [];
  if (lower <= 0 && upper >= 1) return [s.contour];
  return target === 'ce'
    ? partialContours([s.contour], lower, upper)
    : pointsToContours(s.path, partialQuadraticPoints(s.path.points, lower, upper));
}

/** What the temporary mobject looks like at eased progress `s` of its block: one look per drawn
 * member, with a suffix that tells them apart in the drawable keys. Nothing while a stretch or a
 * radius is empty (the first and the last instant). */
export function tempLooks(
  shape: TempShape,
  event: EmphasisEvent,
  s: number,
  target: Target,
): { suffix: string; look: Look }[] {
  const traced = (suffix: string, member: Stroke, timeWidth: number) => {
    const [lower, upper] = flashBounds(s, timeWidth);
    const contours = cut(member, lower, upper, target);
    if (contours.length === 0) return [];
    const width = shape.kind === 'flash' ? FLASH.strokeWidth : event.strokeWidth;
    if (width <= NEGLIGIBLE) return [];
    return [
      {
        suffix,
        look: {
          contours,
          fill: null,
          stroke: { color: event.color, opacity: 1, width },
          partial: lower > 0 || upper < 1,
        },
      },
    ];
  };
  switch (shape.kind) {
    case 'frame':
      return traced('frame', shape.frame, event.timeWidth);
    case 'flash':
      return shape.lines.flatMap((line, k) => traced(`line${k}`, line, FLASH.timeWidth[target]));
    case 'focus': {
      // The disc's points go straight from the big disc at the origin to the point: a circle of
      // the radius left, centred part of the way there; its fill opacity rises with them.
      const radius = shape.radius * (1 - s);
      const opacity = event.opacity * s;
      if (radius <= NEGLIGIBLE || opacity <= NEGLIGIBLE) return [];
      const center: Vec2 = [shape.point[0] * s, shape.point[1] * s];
      return [
        {
          suffix: 'disc',
          look: {
            contours: [circleContour(target, radius, center)],
            fill: { color: event.color, opacity },
            stroke: null,
            partial: false,
          },
        },
      ];
    }
  }
}
