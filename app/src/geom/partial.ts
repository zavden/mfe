/* Partial cubic paths, as Manim's `pointwise_become_partial` computes them.
 *
 * Manim does not split a path by arc length: it treats the concatenated curves of all
 * subpaths as one list, maps a, b ∈ [0, 1] onto curve indices with `integer_interpolate(0, n, ·)`
 * and cuts the first and last curve (ManimCE `VMobject.pointwise_become_partial`,
 * `utils/bezier.py: partial_bezier_points, integer_interpolate`). A glyph with many tiny curves
 * and one long curve therefore "draws" at a very uneven speed, exactly like in Manim. */
import type { Contour } from './types';

/** Number of cubic curves in a contour (length 2 + 6k). */
function contourCurveCount(contour: Contour): number {
  return Math.max(0, (contour.length - 2) / 6);
}

export function curveCount(contours: readonly Contour[]): number {
  let n = 0;
  for (const c of contours) n += contourCurveCount(c);
  return n;
}

/** Manim `integer_interpolate(start, end, alpha)`: the curve index and the residue inside it. */
export function integerInterpolate(start: number, end: number, alpha: number): [number, number] {
  if (alpha >= 1) return [end - 1, 1];
  if (alpha <= 0) return [start, 0];
  const value = start + (end - start) * alpha;
  const index = Math.trunc(value);
  return [index, ((end - start) * alpha) % 1];
}

/** Portion [a, b] (0 ≤ a ≤ b ≤ 1 in parameter space) of the cubic p0..p3, written to `out`. */
export function partialCubic(
  src: ArrayLike<number>,
  at: number,
  a: number,
  b: number,
  out: number[],
): void {
  const x0 = src[at]!;
  const y0 = src[at + 1]!;
  const x1 = src[at + 2]!;
  const y1 = src[at + 3]!;
  const x2 = src[at + 4]!;
  const y2 = src[at + 5]!;
  const x3 = src[at + 6]!;
  const y3 = src[at + 7]!;
  if (a <= 0 && b >= 1) {
    out.push(x1, y1, x2, y2, x3, y3);
    return;
  }
  // Same matrix form as ManimCE's partial_bezier_points for degree 3, via blossoming:
  // the sub-curve on [a, b] has control points B(a,a,a), B(a,a,b), B(a,b,b), B(b,b,b).
  const blossom = (s: number, t: number, u: number): [number, number] => {
    const lerp = (p: number, q: number, k: number) => p + (q - p) * k;
    const ax = lerp(x0, x1, s);
    const ay = lerp(y0, y1, s);
    const bx = lerp(x1, x2, s);
    const by = lerp(y1, y2, s);
    const cx = lerp(x2, x3, s);
    const cy = lerp(y2, y3, s);
    const dx = lerp(ax, bx, t);
    const dy = lerp(ay, by, t);
    const ex = lerp(bx, cx, t);
    const ey = lerp(by, cy, t);
    return [lerp(dx, ex, u), lerp(dy, ey, u)];
  };
  const p1 = blossom(a, a, b);
  const p2 = blossom(a, b, b);
  const p3 = blossom(b, b, b);
  out.push(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
}

/** Portion of a multi-contour cubic path between fractions a and b of its curve count. The
 * result contains the curves from the one holding `a` to the one holding `b`, cut at both ends
 * (subpath boundaries are preserved). Returns `contours` itself when a ≤ 0 and b ≥ 1. */
export function partialContours(contours: readonly Contour[], a: number, b: number): Contour[] {
  if (a <= 0 && b >= 1) return contours as Contour[];
  const total = curveCount(contours);
  if (total === 0) return [];
  const [lowerIndex, lowerResidue] = integerInterpolate(0, total, a);
  const [upperIndex, upperResidue] = integerInterpolate(0, total, b);

  const out: Contour[] = [];
  let offset = 0; // global index of the first curve of the current contour
  for (const contour of contours) {
    const n = contourCurveCount(contour);
    const first = Math.max(lowerIndex, offset);
    const last = Math.min(upperIndex, offset + n - 1);
    if (n > 0 && first <= last) {
      const piece: Contour = [];
      for (let k = first; k <= last; k++) {
        const at = (k - offset) * 6;
        const from = k === lowerIndex ? lowerResidue : 0;
        const to = k === upperIndex ? upperResidue : 1;
        if (piece.length === 0) {
          // Start point of the cut curve: B(from, from, from).
          const head: number[] = [];
          partialCubic(contour, at, from, from, head);
          piece.push(head[4]!, head[5]!);
        }
        partialCubic(contour, at, from, to, piece);
      }
      out.push(piece);
    }
    offset += n;
  }
  return out;
}

/** `partial_quadratic_bezier_points`: the portion [a, b] of the ManimGL quadratic at `at`
 * (anchor, handle, anchor: six numbers), as three points. A jump between subpaths (the handle on
 * its first anchor) stays one, its handle on the portion's first anchor: GL's renderer reads the
 * subpath structure, which `pointwise_become_partial` keeps, so a cut jump is never drawn. */
function partialQuadratic(src: ArrayLike<number>, at: number, a: number, b: number): number[] {
  const x0 = src[at]!;
  const y0 = src[at + 1]!;
  const hx = src[at + 2]!;
  const hy = src[at + 3]!;
  const x1 = src[at + 4]!;
  const y1 = src[at + 5]!;
  if (a === 1) return [x1, y1, x1, y1, x1, y1];
  const curve = (t: number): [number, number] => [
    x0 * (1 - t) * (1 - t) + 2 * hx * t * (1 - t) + x1 * t * t,
    y0 * (1 - t) * (1 - t) + 2 * hy * t * (1 - t) + y1 * t * t,
  ];
  const [h0x, h0y] = a > 0 ? curve(a) : [x0, y0];
  const [h2x, h2y] = b < 1 ? curve(b) : [x1, y1];
  if (hx === x0 && hy === y0) return [h0x, h0y, h0x, h0y, h2x, h2y];
  const h1px = (1 - a) * hx + a * x1;
  const h1py = (1 - a) * hy + a * y1;
  const end = (b - a) / (1 - a);
  return [h0x, h0y, (1 - end) * h0x + end * h1px, (1 - end) * h0y + end * h1py, h2x, h2y];
}

/** Portion [a, b] of a ManimGL path (quadratic curves sharing anchors: anchor, handle, anchor,
 * handle, …, as `toPointPath(…, 'gl')` lays them out), as `VMobject.pointwise_become_partial`
 * cuts it: by curve count through `integer_interpolate`, the first and last curve cut by
 * `partial_quadratic_bezier_points`. A line is one such curve and a cubic two, so a glyph mixing
 * them is cut elsewhere than its cubic outline would be (`partialContours`). Manim keeps the
 * points before and after the portion, collapsed onto its ends (curves that draw nothing); they
 * are left out here, so the result runs from the curve holding `a` to the one holding `b`. A jump
 * between subpaths stays a jump (its handle on its first anchor), also when a cut lands on it:
 * GL draws by the subpath structure the path had. Returns `points` itself when a ≤ 0 and
 * b ≥ 1. */
export function partialQuadraticPoints(points: Float64Array, a: number, b: number): Float64Array {
  if (a <= 0 && b >= 1) return points;
  const n = Math.floor((points.length / 2 - 1) / 2);
  if (n <= 0) return new Float64Array(0);
  const [lowerIndex, lowerResidue] = integerInterpolate(0, n, a);
  const [upperIndex, upperResidue] = integerInterpolate(0, n, b);
  if (lowerIndex === upperIndex) {
    return Float64Array.from(partialQuadratic(points, 4 * lowerIndex, lowerResidue, upperResidue));
  }
  const low = partialQuadratic(points, 4 * lowerIndex, lowerResidue, 1);
  const high = partialQuadratic(points, 4 * upperIndex, 0, upperResidue);
  // The untouched curves between them: from the handle of the curve after `lowerIndex` to the
  // anchor the curve `upperIndex` starts from.
  const middle = points.subarray(4 * lowerIndex + 6, 4 * upperIndex + 2);
  const out = new Float64Array(6 + middle.length + 4);
  out.set(low, 0);
  out.set(middle, 6);
  out.set(high.slice(2), 6 + middle.length);
  return out;
}
