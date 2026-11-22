/* Hit-testing of cubic contours without a canvas: flatten each Bézier into a short polyline,
 * count winding for a fill and measure the distance to the polyline for a stroke. Used by
 * `Renderer.pick` and by the tests (jsdom has no 2D context). */
import type { Contour, Vec2 } from '../geom';
import type { CubicPath } from '../scene';

export type FillRule = 'nonzero' | 'evenodd';

export interface FlatContour {
  /** x0, y0, x1, y1, … */
  points: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Control-polygon length per flattened segment, in scene units. */
const SEGMENT_LENGTH = 0.02;
const MIN_STEPS = 4;
const MAX_STEPS = 48;

/** Polyline approximation of one subpath (curve steps scale with the control polygon length). */
export function flattenContour(contour: Contour): FlatContour {
  const points: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const push = (x: number, y: number) => {
    points.push(x, y);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  if (contour.length >= 2) push(contour[0]!, contour[1]!);
  for (let i = 2; i + 5 < contour.length; i += 6) {
    const x0 = contour[i - 2]!;
    const y0 = contour[i - 1]!;
    const x1 = contour[i]!;
    const y1 = contour[i + 1]!;
    const x2 = contour[i + 2]!;
    const y2 = contour[i + 3]!;
    const x3 = contour[i + 4]!;
    const y3 = contour[i + 5]!;
    const length =
      Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    const steps = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.ceil(length / SEGMENT_LENGTH)));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      const b0 = u * u * u;
      const b1 = 3 * u * u * t;
      const b2 = 3 * u * t * t;
      const b3 = t * t * t;
      push(b0 * x0 + b1 * x1 + b2 * x2 + b3 * x3, b0 * y0 + b1 * y1 + b2 * y2 + b3 * y3);
    }
  }
  return { points, minX, minY, maxX, maxY };
}

/** Winding number of the (implicitly closed) polyline around (x, y). */
function winding(flat: FlatContour, x: number, y: number): number {
  const p = flat.points;
  const n = p.length / 2;
  if (n < 3) return 0;
  let w = 0;
  let xa = p[(n - 1) * 2]!;
  let ya = p[(n - 1) * 2 + 1]!;
  for (let i = 0; i < n; i++) {
    const xb = p[i * 2]!;
    const yb = p[i * 2 + 1]!;
    if (ya <= y) {
      if (yb > y && (xb - xa) * (y - ya) - (x - xa) * (yb - ya) > 0) w++;
    } else if (yb <= y && (xb - xa) * (y - ya) - (x - xa) * (yb - ya) < 0) {
      w--;
    }
    xa = xb;
    ya = yb;
  }
  return w;
}

export function flattenPath(path: CubicPath): FlatContour[] {
  return path.contours.map(flattenContour);
}

/** Does the filled region of `flat` (all subpaths together) contain the point? Open subpaths
 * are closed implicitly, as `fill()` does. */
export function containsPoint(
  flat: readonly FlatContour[],
  point: Vec2,
  rule: FillRule = 'nonzero',
): boolean {
  const [x, y] = point;
  let total = 0;
  for (const c of flat) {
    if (x < c.minX || x > c.maxX || y < c.minY || y > c.maxY) continue;
    total += winding(c, x, y);
  }
  return rule === 'nonzero' ? total !== 0 : total % 2 !== 0;
}

/** Distance from the point to the polyline's segments. An open subpath is not closed: a stroke
 * has no closing side (a closed contour ends on its start, so its polyline closes by itself). */
export function distanceToContour(flat: FlatContour, point: Vec2): number {
  const p = flat.points;
  const n = p.length / 2;
  const [x, y] = point;
  if (n === 0) return Infinity;
  if (n === 1) return Math.hypot(x - p[0]!, y - p[1]!);
  let best = Infinity;
  for (let i = 1; i < n; i++) {
    const ax = p[(i - 1) * 2]!;
    const ay = p[(i - 1) * 2 + 1]!;
    const bx = p[i * 2]!;
    const by = p[i * 2 + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/** Does a stroke along any subpath of `flat` pass within `radius` of the point? */
export function nearStroke(flat: readonly FlatContour[], point: Vec2, radius: number): boolean {
  const [x, y] = point;
  for (const c of flat) {
    if (x < c.minX - radius || x > c.maxX + radius || y < c.minY - radius || y > c.maxY + radius) {
      continue;
    }
    if (distanceToContour(c, point) <= radius) return true;
  }
  return false;
}
