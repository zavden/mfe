/* Manim's bounding boxes, computed as each library computes them, from the point lists it stores
 * (`toPointPath`; ARCHITECTURE §5, "Attached objects"): what `width` / `height`, `get_center`,
 * `get_corner` and `next_to` read. ManimCE takes corners and centres (`get_critical_point`) from
 * the anchors of the curves — `VMobject.get_points_defining_boundary` returns the anchors — and
 * widths (`length_over_dim`) from every point; ManimGL reads every point for both
 * (`get_bounding_box`). For TeX glyphs the two boxes mostly agree (their extremes sit on anchors)
 * until the glyphs are rotated. */
import { pointPathBox, type Box, type PointPath, type Vec2 } from '../geom';
import type { AttachSide, Target } from '../model';

export interface ManimBoxes {
  /** The box of every point: what `width` and `height` read. */
  size: Box;
  /** The box the critical points come from (`get_center`, `get_corner`, `get_edge_center`,
   * `next_to`): the anchors in ManimCE, every point in ManimGL. */
  critical: Box;
}

function unionOf(paths: readonly PointPath[], anchorsOnly: boolean): Box | null {
  let box: Box | null = null;
  for (const path of paths) {
    const b = pointPathBox(path, anchorsOnly);
    if (!b) continue;
    box = box
      ? {
          minX: Math.min(box.minX, b.minX),
          minY: Math.min(box.minY, b.minY),
          maxX: Math.max(box.maxX, b.maxX),
          maxY: Math.max(box.maxY, b.maxY),
        }
      : { ...b };
  }
  return box;
}

/** The boxes `target` reads from a group of these paths (a glyph each, placed); null when there
 * is no point to measure. */
export function manimBoxes(paths: readonly PointPath[], target: Target): ManimBoxes | null {
  const size = unionOf(paths, false);
  if (!size) return null;
  const critical = target === 'ce' ? unionOf(paths, true) : null;
  return { size, critical: critical ?? size };
}

/** Manim's `get_critical_point(direction)`: on each axis the low edge, the middle or the high
 * edge of the critical box as the direction's component is negative, zero or positive. */
export function criticalPoint(boxes: ManimBoxes, direction: Vec2): Vec2 {
  const { critical: b } = boxes;
  const pick = (lo: number, hi: number, d: number) => (d < 0 ? lo : d > 0 ? hi : (lo + hi) / 2);
  return [pick(b.minX, b.maxX, direction[0]), pick(b.minY, b.maxY, direction[1])];
}

/** The native group centre used by animation pivots. Paths must already be converted to the
 * target's point representation and placed; cubic display bounds have a different contract. */
export function manimCenter(paths: readonly PointPath[], target: Target): Vec2 {
  const boxes = manimBoxes(paths, target);
  return boxes ? criticalPoint(boxes, [0, 0]) : [0, 0];
}

/** Manim's DOWN, UP, LEFT and RIGHT. */
export const SIDE_VECTORS: Record<AttachSide, Vec2> = {
  down: [0, -1],
  up: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** The shift `object.next_to(target, side, buff)` gives the object, both measured where they are:
 * its edge facing the target lands `buff` away from the target's edge on that side, centred on
 * it along the other axis (Manim's default `aligned_edge`). */
export function nextToShift(
  object: ManimBoxes,
  target: ManimBoxes,
  side: AttachSide,
  buff: number,
): Vec2 {
  const dir = SIDE_VECTORS[side];
  return nextToPointShift(object, criticalPoint(target, dir), dir, buff);
}

/** The shift `object.next_to(point, direction, buff)` gives the object, measured where it is: its
 * critical point opposite `direction` lands on `point`, moved `buff` times `direction` further —
 * which Manim does not normalise, so a corner's `buff` goes along both axes. */
export function nextToPointShift(
  object: ManimBoxes,
  point: Vec2,
  direction: Vec2,
  buff: number,
): Vec2 {
  const from = criticalPoint(object, [-direction[0], -direction[1]]);
  return [point[0] - from[0] + buff * direction[0], point[1] - from[1] + buff * direction[1]];
}

/** NumPy's `np.round` of one value: to the nearest integer, a half to the even one (`np.round(0.5)`
 * is 0, `np.round(1.5)` 2), where `Math.round` takes halves up. */
export function roundHalfEven(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value - Math.trunc(value)) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded;
}
