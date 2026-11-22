/* Paths as Manim morphs them: point alignment and interpolation.
 *
 * `Transform` (ManimCE 0.22 `animation/transform.py`, ManimGL 1.7 likewise) gives the two
 * mobjects the same number of points before it interpolates them point by point. A glyph is a
 * cubic path in this app; Manim stores it differently per library, and the alignment differs, so
 * this module keeps both layouts and ports the alignment of each:
 *
 *   - ManimCE: cubic curves, four points per curve (an anchor is repeated between curves).
 *     `VMobject.align_points`: when both paths have as many curves nothing is done (even if
 *     their subpaths differ); otherwise the subpaths are paired in order, a missing subpath is a
 *     null curve at the end of the last one, and the shorter of each pair is subdivided evenly
 *     (`insert_n_curves_to_point_list` → `bezier_remap`: curve i of k is cut into the number of
 *     pieces `bincount(i·k' // k')` says).
 *   - ManimGL: quadratic curves sharing anchors (2k + 1 points); a subpath ends with a "null
 *     curve" whose handle sits on its first anchor. `VMobject.align_points` sorts the subpaths
 *     longest first, pairs them, pads a missing one with the longest traced forth and back and
 *     subdivides the *longest* curves of the shorter path (greedy by chord length). GL stores the
 *     cubics of an SVG as quadratics (`get_quadratic_approximation_of_cubic`): `toPointPath`
 *     repeats that conversion, keeping curves that already are quadratics (what `Q` and `L`
 *     become) as one piece. Every GL result is elevated back to cubics (an exact operation that
 *     commutes with interpolation) when it is drawn.
 *
 * Ties in GL's choice of which curve to cut (`np.argpartition`) are broken in favour of the
 * later curve, which is what NumPy does for small arrays with one or two cuts; for larger tie
 * groups the choice may differ from NumPy's.
 *
 * Everything works on flat `Float64Array`s of x, y pairs. Alignment is done in formula-local
 * space and cached by the caller: it depends only on the shapes, not on the placement (a
 * similarity transform changes no count, no connectivity and no ordering of lengths). */
import { partialCubic } from './partial';
import { STRAIGHT_PATH_THRESHOLD, pathShift, type ArcLengths, type PathSpline } from './spline';
import type { Contour, Mat2D, Vec2 } from './types';

export type MorphTarget = 'ce' | 'gl';

export interface PointPath {
  /** 3: ManimCE cubics (4 points per curve); 2: ManimGL quadratics (shared anchors). */
  degree: 2 | 3;
  points: Float64Array;
}

const ATOL = 1e-6;
const RTOL = 1e-5;

/** numpy.allclose(a, b) for one 2-D point (|a − b| ≤ atol + rtol·|b|). */
function close(ax: number, ay: number, bx: number, by: number): boolean {
  return (
    Math.abs(ax - bx) <= ATOL + RTOL * Math.abs(bx) &&
    Math.abs(ay - by) <= ATOL + RTOL * Math.abs(by)
  );
}

// --- ManimCE layout ------------------------------------------------------------------

const CE_CURVE = 8; // numbers per curve (4 points)

function ceFromContours(contours: readonly Contour[]): Float64Array {
  let curves = 0;
  for (const c of contours) curves += Math.max(0, (c.length - 2) / 6);
  const out = new Float64Array(curves * CE_CURVE);
  let at = 0;
  for (const c of contours) {
    for (let i = 0; i + 8 <= c.length; i += 6) {
      for (let k = 0; k < 8; k++) out[at++] = c[i + k]!;
    }
  }
  return out;
}

/** [from, to) curve ranges of the subpaths: a new one starts where a curve does not begin at the
 * end of the previous one (`get_subpaths_from_points`). */
function ceSubpaths(pts: Float64Array): [number, number][] {
  const n = pts.length / CE_CURVE;
  const out: [number, number][] = [];
  let from = 0;
  for (let i = 1; i < n; i++) {
    const prev = (i - 1) * CE_CURVE;
    const cur = i * CE_CURVE;
    if (!close(pts[prev + 6]!, pts[prev + 7]!, pts[cur]!, pts[cur + 1]!)) {
      out.push([from, i]);
      from = i;
    }
  }
  if (n > 0) out.push([from, n]);
  return out;
}

/** The n-th subpath as `align_points` sees it: trailing null curves removed; past the last one,
 * a null curve at the last point. */
function ceNthSubpath(pts: Float64Array, subpaths: [number, number][], n: number): Float64Array {
  if (n >= subpaths.length) {
    const [, to] = subpaths[subpaths.length - 1] ?? [0, 0];
    const x = to > 0 ? pts[to * CE_CURVE - 2]! : 0;
    const y = to > 0 ? pts[to * CE_CURVE - 1]! : 0;
    return Float64Array.of(x, y, x, y, x, y, x, y);
  }
  const [from, last] = subpaths[n]!;
  let to = last;
  // https://github.com/ManimCommunity/manim/issues/1959: drop curves that never leave the
  // previous anchor.
  while (to - from > 1) {
    const last = (to - 1) * CE_CURVE;
    const px = pts[last - 2]!;
    const py = pts[last - 1]!;
    let same = true;
    for (let k = 0; k < 4 && same; k++)
      same = close(pts[last + 2 * k]!, pts[last + 2 * k + 1]!, px, py);
    if (!same) break;
    to--;
  }
  return pts.subarray(from * CE_CURVE, to * CE_CURVE);
}

/** `insert_n_curves_to_point_list` for cubics: k + n curves tracing the same path. */
function ceInsertCurves(curves: Float64Array, n: number): Float64Array {
  const have = curves.length / CE_CURVE;
  if (n <= 0 || have === 0) return curves;
  const target = have + n;
  const out = new Float64Array(target * CE_CURVE);
  // repeat_indices = arange(target) * have // target; split_factors = bincount.
  const split = new Array<number>(have).fill(0);
  for (let i = 0; i < target; i++) split[Math.floor((i * have) / target)]!++;
  let at = 0;
  for (let c = 0; c < have; c++) {
    const sf = split[c]!;
    for (let k = 0; k < sf; k++) {
      if (sf === 1) {
        for (let j = 0; j < CE_CURVE; j++) out[at++] = curves[c * CE_CURVE + j]!;
      } else {
        const piece: number[] = [];
        partialCubic(curves, c * CE_CURVE, k / sf, (k + 1) / sf, piece);
        // partialCubic emits the three trailing points; the first is the piece's own start.
        const start: number[] = [];
        partialCubic(curves, c * CE_CURVE, k / sf, k / sf, start);
        out[at++] = start[4]!;
        out[at++] = start[5]!;
        for (let j = 0; j < 6; j++) out[at++] = piece[j]!;
      }
    }
  }
  return out;
}

function ceAlign(a: Float64Array, b: Float64Array): [Float64Array, Float64Array] {
  if (a.length === b.length) return [a, b];
  const sa = ceSubpaths(a);
  const sb = ceSubpaths(b);
  const count = Math.max(sa.length, sb.length);
  const outA: Float64Array[] = [];
  const outB: Float64Array[] = [];
  for (let n = 0; n < count; n++) {
    const p1 = ceNthSubpath(a, sa, n);
    const p2 = ceNthSubpath(b, sb, n);
    const c1 = p1.length / CE_CURVE;
    const c2 = p2.length / CE_CURVE;
    outA.push(ceInsertCurves(p1, Math.max(0, c2 - c1)));
    outB.push(ceInsertCurves(p2, Math.max(0, c1 - c2)));
  }
  return [concat(outA), concat(outB)];
}

function concat(parts: readonly Float64Array[]): Float64Array {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Float64Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// --- ManimGL layout ------------------------------------------------------------------

const GL_TOLERANCE = 1e-8; // VMobject.tolerance_for_point_equality
/** SVG units are about 20× larger than scene units; GL's thresholds (1e-5 on a cross product)
 * were tuned for them. */
const GL_SVG_SCALE = 20;

/** `get_quadratic_approximation_of_cubic`: five points a0, i0, mid, i1, a1 (two quadratics). */
function glQuadraticOfCubic(
  c: ArrayLike<number>,
  at: number,
): [number, number, number, number, number, number, number, number, number, number] {
  const [a0x, a0y, h0x, h0y, h1x, h1y, a1x, a1y] = [
    c[at]!,
    c[at + 1]!,
    c[at + 2]!,
    c[at + 3]!,
    c[at + 4]!,
    c[at + 5]!,
    c[at + 6]!,
    c[at + 7]!,
  ] as const;
  const t0x = h0x - a0x;
  const t0y = h0y - a0y;
  const t1x = a1x - h1x;
  const t1y = a1y - h1y;
  // Inflection points (caffeineowl.com/graphics/2d/vectorial/cubic-inflexion.html).
  const px = h0x - a0x;
  const py = h0y - a0y;
  const qx = h1x - 2 * h0x + a0x;
  const qy = h1y - 2 * h0y + a0y;
  const rx = a1x - 3 * h1x + 3 * h0x - a0x;
  const ry = a1y - 3 * h1y + 3 * h0y - a0y;
  const a = qx * ry - qy * rx;
  const b = px * ry - py * rx;
  const cc = px * qy - py * qx;
  const disc = b * b - 4 * a * cc;
  let tMid = 0.5;
  if (disc > 0) {
    const root = Math.sqrt(Math.abs(disc));
    const bounds: number[] = [];
    for (const sgn of [-1, 1]) {
      let ti = (-b + sgn * root) / (2 * a);
      if (a === 0) ti = -cc / b;
      if (a === 0 && b === 0) ti = 0;
      bounds.push(ti);
    }
    // ti_max wins over ti_min when both are in range (assigned last).
    if (bounds[0]! > 0 && bounds[0]! < 1) tMid = bounds[0]!;
    if (bounds[1]! > 0 && bounds[1]! < 1) tMid = bounds[1]!;
  }
  const s = 1 - tMid;
  const bez = (v0: number, v1: number, v2: number, v3: number) =>
    s * s * s * v0 + 3 * s * s * tMid * v1 + 3 * s * tMid * tMid * v2 + tMid * tMid * tMid * v3;
  const midX = bez(a0x, h0x, h1x, a1x);
  const midY = bez(a0y, h0y, h1y, a1y);
  const quad = (v0: number, v1: number, v2: number) =>
    s * s * v0 + 2 * s * tMid * v1 + tMid * tMid * v2;
  const tmX = quad(h0x - a0x, h1x - h0x, a1x - h1x);
  const tmY = quad(h0y - a0y, h1y - h0y, a1y - h1y);
  const intersect = (p0x: number, p0y: number, v0x: number, v0y: number): [number, number] => {
    // find_intersection(p0, v0, mid, Tm), threshold 1e-5 (the denominator → ∞, the ratio → 0).
    const numer = tmX * (midY - p0y) - tmY * (midX - p0x);
    let denom = tmX * v0y - tmY * v0x;
    if (Math.abs(denom) < 1e-5) denom = Infinity;
    const ratio = numer / denom;
    return [p0x + ratio * v0x, p0y + ratio * v0y];
  };
  const [i0x, i0y] = intersect(a0x, a0y, t0x, t0y);
  const [i1x, i1y] = intersect(a1x, a1y, t1x, t1y);
  return [a0x, a0y, i0x, i0y, midX, midY, i1x, i1y, a1x, a1y];
}

/** A cubic that is a degree-elevated quadratic (lines and `Q` curves): its quadratic handle. */
function quadraticHandleOf(c: ArrayLike<number>, at: number): [number, number] | null {
  const x0 = c[at]!;
  const y0 = c[at + 1]!;
  const x3 = c[at + 6]!;
  const y3 = c[at + 7]!;
  const qx1 = (3 * c[at + 2]! - x0) / 2;
  const qy1 = (3 * c[at + 3]! - y0) / 2;
  const qx2 = (3 * c[at + 4]! - x3) / 2;
  const qy2 = (3 * c[at + 5]! - y3) / 2;
  const tol = 1e-7 + 1e-6 * (Math.abs(x3 - x0) + Math.abs(y3 - y0));
  return Math.abs(qx1 - qx2) <= tol && Math.abs(qy1 - qy2) <= tol ? [qx1, qy1] : null;
}

function glFromContours(contours: readonly Contour[]): Float64Array {
  const pts: number[] = [];
  let lastX: number;
  let lastY: number;
  const equal = (ax: number, ay: number, bx: number, by: number) =>
    Math.abs(ax - bx) < GL_TOLERANCE && Math.abs(ay - by) < GL_TOLERANCE;
  for (const c of contours) {
    if (c.length < 8) continue;
    // start_new_path: the marker handle sits exactly on the last anchor written (not on the
    // contour's own end, which the scaling of a cubic's approximation may have moved by an ulp):
    // `pointsToContours` and ManimGL's `is_end` tell a jump by that equality.
    if (pts.length > 0) pts.push(pts[pts.length - 2]!, pts[pts.length - 1]!);
    pts.push(c[0]!, c[1]!);
    lastX = c[0]!;
    lastY = c[1]!;
    for (let i = 0; i + 8 <= c.length; i += 6) {
      const handle = quadraticHandleOf(c, i);
      const ex = c[i + 6]!;
      const ey = c[i + 7]!;
      if (handle) {
        let [hx, hy] = handle;
        // add_quadratic_bezier_curve_to keeps the handle off the anchor it comes from.
        if (equal(hx, hy, lastX, lastY)) {
          hx = (hx + ex) / 2;
          hy = (hy + ey) / 2;
        }
        pts.push(hx, hy, ex, ey);
      } else {
        const k = GL_SVG_SCALE;
        const scaled = [0, 1, 2, 3, 4, 5, 6, 7].map((j) => c[i + j]! * k);
        const q = glQuadraticOfCubic(scaled, 0).map((v) => v / k);
        // add_cubic_bezier_curve_to: avoid degenerate handles.
        if (equal(q[6]!, q[7]!, q[8]!, q[9]!)) {
          q[6] = (q[4]! + q[6]!) / 2;
          q[7] = (q[5]! + q[7]!) / 2;
        }
        if (equal(q[2]!, q[3]!, lastX, lastY)) {
          q[2] = (q[2]! + q[4]!) / 2;
          q[3] = (q[3]! + q[5]!) / 2;
        }
        pts.push(q[2]!, q[3]!, q[4]!, q[5]!, q[6]!, q[7]!, q[8]!, q[9]!);
      }
      lastX = ex;
      lastY = ey;
    }
  }
  return Float64Array.from(pts);
}

/** Subpaths of a GL path as [first point, last point] indices (`get_subpaths`): a subpath ends
 * at an anchor whose handle sits on it, followed by a genuinely different anchor. */
function glSubpaths(pts: Float64Array): [number, number][] {
  const total = pts.length / 2;
  if (total === 0) return [];
  const ends: number[] = [];
  for (let n = 0; 2 * n + 2 < total; n++) {
    const a0 = 2 * n;
    const h = a0 + 1;
    const a1 = a0 + 2;
    const onTop = pts[2 * a0] === pts[2 * h] && pts[2 * a0 + 1] === pts[2 * h + 1];
    const apart =
      Math.abs(pts[2 * h]! - pts[2 * a1]!) > 1e-4 ||
      Math.abs(pts[2 * h + 1]! - pts[2 * a1 + 1]!) > 1e-4;
    if (onTop && apart) ends.push(a0);
  }
  ends.push(total - 1);
  const out: [number, number][] = [];
  let start = 0;
  for (const end of ends) {
    out.push([start, end]);
    start = end + 2;
  }
  return out;
}

function glPolylineLength(pts: Float64Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    sum += Math.hypot(pts[2 * i + 2]! - pts[2 * i]!, pts[2 * i + 3]! - pts[2 * i + 1]!);
  }
  return sum;
}

/** `insert_n_curves_to_point_list` of ManimGL: n more curves, cutting the longest ones. */
function glInsertCurves(points: Float64Array, n: number): Float64Array {
  const total = points.length / 2;
  if (total === 1) {
    const out = new Float64Array((2 * n + 1) * 2);
    for (let i = 0; i < 2 * n + 1; i++) {
      out[2 * i] = points[0]!;
      out[2 * i + 1] = points[1]!;
    }
    return out;
  }
  if (n === 0) return points;

  const k = (total - 1) / 2; // curves
  const lengths = new Float64Array(k);
  let sum = 0;
  for (let c = 0; c < k; c++) {
    const a0 = 2 * c;
    const h = a0 + 1;
    const a1 = a0 + 2;
    lengths[c] = Math.hypot(
      points[2 * a1]! - points[2 * a0]!,
      points[2 * a1 + 1]! - points[2 * a0 + 1]!,
    );
    // A curve whose handle sits on its first anchor marks the end of a subpath and stays whole.
    if (
      Math.hypot(points[2 * h]! - points[2 * a0]!, points[2 * h + 1]! - points[2 * a0 + 1]!) <
      GL_TOLERANCE
    ) {
      lengths[c] = 0;
    }
    sum += lengths[c]!;
  }
  if (sum === 0) {
    // Nothing to even out: pad with null curves at the start.
    const out = new Float64Array(points.length + 4 * n);
    for (let i = 0; i < 2 * n; i++) {
      out[2 * i] = points[0]!;
      out[2 * i + 1] = points[1]!;
    }
    out.set(points, 4 * n);
    return out;
  }

  // Cutting a curve of length L into j pieces leaves the longest L / j: the n cuts to make are
  // the n largest such values, with no curve taking more than its share of the pieces.
  const candidates: { curve: number; piece: number }[] = [];
  for (let c = 0; c < k; c++) {
    const cap = Math.floor(((k + n) * lengths[c]!) / sum);
    for (let j = 0; j < cap; j++) candidates.push({ curve: c, piece: lengths[c]! / (j + 1) });
  }
  const order = candidates
    .map((_, i) => i)
    .sort((x, y) => candidates[y]!.piece - candidates[x]!.piece || y - x);
  const counts = new Array<number>(k).fill(1);
  for (const i of order.slice(0, n)) counts[candidates[i]!.curve]!++;

  const outPoints: number[] = [];
  for (let c = 0; c < k; c++) {
    const count = counts[c]!;
    const a0x = points[4 * c]!;
    const a0y = points[4 * c + 1]!;
    const hx = points[4 * c + 2]!;
    const hy = points[4 * c + 3]!;
    const a1x = points[4 * c + 4]!;
    const a1y = points[4 * c + 5]!;
    const width = 1 / count;
    for (let j = 0; j < count; j++) {
      const lower = width * j;
      const fx = a0x + lower * (hx - a0x);
      const fy = a0y + lower * (hy - a0y);
      const sx = hx + lower * (a1x - hx);
      const sy = hy + lower * (a1y - hy);
      const ax = fx + lower * (sx - fx);
      const ay = fy + lower * (sy - fy);
      outPoints.push(ax, ay, ax + width * (sx - fx), ay + width * (sy - fy));
    }
  }
  outPoints.push(points[points.length - 2]!, points[points.length - 1]!);
  return Float64Array.from(outPoints);
}

function glAlign(a: Float64Array, b: Float64Array): [Float64Array, Float64Array] {
  if (a.length === b.length) return [a, b];
  const sorted = (pts: Float64Array) =>
    glSubpaths(pts)
      .map(([from, to]) => ({
        points: pts.subarray(2 * from, 2 * to + 2),
        length: glPolylineLength(pts, from, to),
      }))
      .sort((x, y) => y.length - x.length)
      .map((s) => s.points);
  const sa = sorted(a);
  const sb = sorted(b);
  const count = Math.max(sa.length, sb.length);
  const nth = (list: Float64Array[], n: number): Float64Array => {
    if (n < list.length) return list[n]!;
    // The longest subpath traced forth and back.
    const first = list[0]!;
    const total = first.length / 2;
    const out = new Float64Array((2 * total - 1) * 2);
    out.set(first.subarray(0, first.length - 2), 0);
    for (let i = 0; i < total; i++) {
      out[2 * (total - 1 + i)] = first[2 * (total - 1 - i)]!;
      out[2 * (total - 1 + i) + 1] = first[2 * (total - 1 - i) + 1]!;
    }
    return out;
  };
  const outA: Float64Array[] = [];
  const outB: Float64Array[] = [];
  for (let n = 0; n < count; n++) {
    const sp1 = nth(sa, n);
    const sp2 = nth(sb, n);
    const diff1 = Math.max(0, Math.floor((sp2.length / 2 - sp1.length / 2) / 2));
    const diff2 = Math.max(0, Math.floor((sp1.length / 2 - sp2.length / 2) / 2));
    const p1 = glInsertCurves(sp1, diff1);
    const p2 = glInsertCurves(sp2, diff2);
    if (n > 0) {
      // An intermediate anchor marks the end of the previous subpath.
      const last1 = outA[outA.length - 1]!;
      const last2 = outB[outB.length - 1]!;
      outA.push(last1.slice(last1.length - 2));
      outB.push(last2.slice(last2.length - 2));
    }
    outA.push(p1);
    outB.push(p2);
  }
  return [concat(outA), concat(outB)];
}

// --- Public API ----------------------------------------------------------------------

/** The point list Manim holds for a glyph (all its contours as one mobject). */
export function toPointPath(contours: readonly Contour[], target: MorphTarget): PointPath {
  return target === 'ce'
    ? { degree: 3, points: ceFromContours(contours) }
    : { degree: 2, points: glFromContours(contours) };
}

/** `align_points` of the two paths (same degree): equal point counts afterwards. */
export function alignPointPaths(a: PointPath, b: PointPath): [PointPath, PointPath] {
  if (a.degree !== b.degree) throw new Error('Paths of different degree cannot be aligned.');
  const [pa, pb] = a.degree === 3 ? ceAlign(a.points, b.points) : glAlign(a.points, b.points);
  return [
    pa === a.points ? a : { degree: a.degree, points: pa },
    pb === b.points ? b : { degree: b.degree, points: pb },
  ];
}

export function transformPointPath(m: Mat2D, path: PointPath): PointPath {
  const src = path.points;
  const out = new Float64Array(src.length);
  for (let i = 0; i < src.length; i += 2) {
    const x = src[i]!;
    const y = src[i + 1]!;
    out[i] = m[0] * x + m[2] * y + m[4];
    out[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  return { degree: path.degree, points: out };
}

/** Box over the points of a path: every point, or only the anchors of the curves. ManimCE's
 * `get_center` uses the anchors of a VMobject while its `width` / `height` (`length_over_dim`) use
 * every point; ManimGL uses every point for both. */
export function pointPathBox(
  path: PointPath,
  anchorsOnly = false,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const p = path.points;
  if (p.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (i: number) => {
    const x = p[2 * i]!;
    const y = p[2 * i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  const count = p.length / 2;
  for (let i = 0; i < count; i++) {
    if (anchorsOnly) {
      // CE: the first and last point of every four; GL: every other point.
      if (path.degree === 3 ? i % 4 !== 0 && i % 4 !== 3 : i % 2 !== 0) continue;
    }
    visit(i);
  }
  return { minX, minY, maxX, maxY };
}

/** A prepared interpolation between two aligned paths. */
export interface PathPair {
  degree: 2 | 3;
  start: Float64Array;
  end: Float64Array;
}

/** Pair two paths with the same structure (aligned already, or ghosts of each other). */
export function pathPair(start: PointPath, end: PointPath): PathPair {
  if (start.points.length !== end.points.length) {
    throw new Error('Cannot interpolate paths with different point counts.');
  }
  return { degree: start.degree, start: start.points, end: end.points };
}

/** The points at `alpha` along `path_along_arc(arc)` (radians; straight below the threshold). */
export function interpolatePoints(
  start: Float64Array,
  end: Float64Array,
  alpha: number,
  arc: number,
  out: Float64Array = new Float64Array(start.length),
): Float64Array {
  if (Math.abs(arc) < STRAIGHT_PATH_THRESHOLD) {
    const keep = 1 - alpha;
    for (let i = 0; i < start.length; i++) out[i] = keep * start[i]! + alpha * end[i]!;
    return out;
  }
  const cot = Math.abs(arc - Math.PI) < 1e-12 ? 0 : 1 / Math.tan(arc / 2);
  const cos = Math.cos(alpha * arc);
  const sin = Math.sin(alpha * arc);
  for (let i = 0; i < start.length; i += 2) {
    const sx = start[i]!;
    const sy = start[i + 1]!;
    const vx = end[i]! - sx;
    const vy = end[i + 1]! - sy;
    // Centre of the arc: the midpoint pushed sideways, then rotate about it.
    const cx = sx + vx / 2 - (vy / 2) * cot;
    const cy = sy + vy / 2 + (vx / 2) * cot;
    const dx = sx - cx;
    const dy = sy - cy;
    out[i] = cx + cos * dx - sin * dy;
    out[i + 1] = cy + sin * dx + cos * dy;
  }
  return out;
}

/** The centre of the box over every point of a flat x, y array (null for none): what the chord
 * of a custom path joins, at the start and at the end — the export's helper reads the same
 * centre from the points Manim hands its `path_func`. */
export function pointsCenter(points: Float64Array): Vec2 | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/** The points at `alpha` along a custom path (D48): the straight interpolation, every point
 * shifted by the same vector — where the path, laid on the chord `chord` (`chordFrame` of the
 * centres at the start and at the end), lies off the chord at the fraction `alpha` of its length
 * (`pathShift`). The export's `path_func` helper computes exactly this. */
export function interpolateAlongPath(
  start: Float64Array,
  end: Float64Array,
  alpha: number,
  spline: PathSpline,
  table: ArcLengths,
  chord: Mat2D,
  out: Float64Array = new Float64Array(start.length),
): Float64Array {
  const [sx, sy] = pathShift(spline, table, chord, alpha);
  const keep = 1 - alpha;
  for (let i = 0; i < start.length; i += 2) {
    out[i] = keep * start[i]! + alpha * end[i]! + sx;
    out[i + 1] = keep * start[i + 1]! + alpha * end[i + 1]! + sy;
  }
  return out;
}

/** Cubic contours of interpolated points, split the way Manim's renderer splits subpaths: CE
 * where a curve does not start at the end of the previous one (`get_subpaths`), GL at a curve
 * whose handle sits exactly on its start with the next anchor elsewhere (`is_end`; that curve is
 * the jump to the next subpath and is not drawn). GL quadratics are elevated to cubics. */
export function pointsToContours(pair: Pick<PathPair, 'degree'>, pts: Float64Array): Contour[] {
  const contours: Contour[] = [];
  if (pair.degree === 3) {
    const n = pts.length / CE_CURVE;
    let current: Contour | null = null;
    for (let k = 0; k < n; k++) {
      const at = k * CE_CURVE;
      if (!current || !close(pts[at - 2]!, pts[at - 1]!, pts[at]!, pts[at + 1]!)) {
        current = [pts[at]!, pts[at + 1]!];
        contours.push(current);
      }
      current.push(
        pts[at + 2]!,
        pts[at + 3]!,
        pts[at + 4]!,
        pts[at + 5]!,
        pts[at + 6]!,
        pts[at + 7]!,
      );
    }
    return contours;
  }
  const n = (pts.length / 2 - 1) / 2;
  let current: Contour | null = null;
  for (let k = 0; k < n; k++) {
    const x0 = pts[4 * k]!;
    const y0 = pts[4 * k + 1]!;
    const qx = pts[4 * k + 2]!;
    const qy = pts[4 * k + 3]!;
    const x1 = pts[4 * k + 4]!;
    const y1 = pts[4 * k + 5]!;
    if (x0 === qx && y0 === qy && (Math.abs(qx - x1) > 1e-4 || Math.abs(qy - y1) > 1e-4)) {
      current = null; // the jump to the next subpath is not drawn
      continue;
    }
    if (!current) {
      current = [x0, y0];
      contours.push(current);
    }
    current.push(
      x0 + (2 / 3) * (qx - x0),
      y0 + (2 / 3) * (qy - y0),
      x1 + (2 / 3) * (qx - x1),
      y1 + (2 / 3) * (qy - y1),
      x1,
      y1,
    );
  }
  return contours;
}
