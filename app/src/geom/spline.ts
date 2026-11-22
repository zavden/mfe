/* Path splines: the curve the centre of a glyph follows from its place in one formula to its
 * place in another (a transfer pair's custom path). Piecewise cubic Béziers between nodes, each
 * node an anchor with an incoming and an outgoing handle (null = the handle sits on the anchor,
 * so that end of the segment leaves it straight); a *smooth* node keeps its handles collinear, a
 * corner's are free (the editor enforces that; the maths here don't depend on it).
 *
 * The nodes live in the chord's frame (`chordFrame`): u along the chord from the start centre
 * (u = 0) to the end centre (u = 1), v across it, both as fractions of the chord's length — so a
 * path deforms with the formulas it joins, like an arc does, and the first and last anchors are
 * (0, 0) and (1, 0). The centre travels at a uniform speed by arc length (`pointAtFraction`,
 * through the table `arcLengths` samples), not by segment, so a short segment is not rushed.
 *
 * Pure maths over `Vec2`s, agnostic of the frame except for `chordFrame`; the types are the
 * model's (`GlyphPair.path`), which stores at least two nodes. The Python helper the export
 * emits builds the same table from the same samples, so the preview and Manim agree. */
import type { PathSpline, SplineNode } from '../model';
import type { Mat2D, Vec2 } from './types';

export type { PathSpline, SplineNode };

/** A cubic Bézier segment: its start, the start's handle, the end's handle, its end. */
export type Cubic = [Vec2, Vec2, Vec2, Vec2];

/** Where a point of the spline is: on which segment (0-based) and at which parameter of it. */
export interface SplinePlace {
  segment: number;
  t: number;
}

/** The sampled arc lengths of a spline: `cumulative[k · samples + i]` is the length of the
 * polyline through the first k segments and the first i of `samples` equal-parameter steps of
 * the next one; `total` is its last entry. */
export interface ArcLengths {
  samples: number;
  cumulative: Float64Array;
  total: number;
}

/** Steps per segment of `arcLengths` by default. The export's helper uses the same count. */
export const ARC_SAMPLES = 64;

/** Steps per segment of the coarse search of `nearestPoint`. */
const NEAREST_SAMPLES = 32;

/** Handles closer than this to their anchor are the anchor. */
const ON_ANCHOR = 1e-12;

/** The chord itself: two nodes without handles, at u = 0 and u = 1. */
export function straightSpline(): PathSpline {
  return {
    nodes: [
      { at: [0, 0], in: null, out: null, smooth: false },
      { at: [1, 0], in: null, out: null, smooth: false },
    ],
  };
}

/** Two nodes joined without handles: the straight line between them (the chord, in the chord's
 * frame), which a morph can take without any path maths. */
export function isStraightSpline(spline: PathSpline): boolean {
  const [a, b] = spline.nodes;
  return spline.nodes.length === 2 && !!a && !!b && a.out === null && b.in === null;
}

/** Radians below which Manim treats a path arc as a straight path (`STRAIGHT_PATH_THRESHOLD`). */
export const STRAIGHT_PATH_THRESHOLD = 0.01;

/** Degrees of arc one cubic takes at most: with its control points at `4/3 · tan(φ/4)` of the
 * radius along the tangents it traces a quarter circle to 2.7e-4 of the radius. */
const ARC_PER_SEGMENT = 90;
/** The widest arc `arcSpline` draws, in degrees: a full turn, which is as far as the fields of a
 * path arc go (`PATH_ARC_LIMIT`, model/defaults.ts). A wider one is drawn as this one. */
export const ARC_SPLINE_LIMIT = 360;

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6 || 0;

/** The arc of `degrees` between the chord's ends as a spline: the curve the glyphs of a pair
 * follow for a transfer's `pathArc` (Manim's `path_along_arc`: the midpoint pushed across the
 * chord is the centre, a positive arc turns counter-clockwise, so it swings under a chord that
 * runs to the right), one smooth node per 90° at most with its handles along the tangents, so
 * that editing a pair's path starts from what the morph plays. An arc under Manim's straight
 * threshold is the chord itself. */
export function arcSpline(asked: number): PathSpline {
  // Never more than a full turn: the count of nodes is the arc's, and an arc is a number of a file.
  const degrees = Math.max(-ARC_SPLINE_LIMIT, Math.min(ARC_SPLINE_LIMIT, asked));
  const theta = (degrees * Math.PI) / 180;
  if (Math.abs(theta) < STRAIGHT_PATH_THRESHOLD) return straightSpline();
  const count = Math.ceil(Math.abs(degrees) / ARC_PER_SEGMENT);
  const step = theta / count;
  const centre: Vec2 = [0.5, 0.5 / Math.tan(theta / 2)];
  // The handles reach 4/3 · tan(φ/4) of the radius along the tangent, which, taken as the
  // derivative of the turn below, is as long as the radius already.
  const reach = (4 / 3) * Math.tan(Math.abs(step) / 4);
  const sign = Math.sign(theta);
  // The start, seen from the centre; each node is it turned by k steps.
  const dx = -centre[0];
  const dy = -centre[1];
  const nodes: SplineNode[] = [];
  for (let k = 0; k <= count; k++) {
    const cos = Math.cos(k * step);
    const sin = Math.sin(k * step);
    const at: Vec2 =
      k === 0
        ? [0, 0]
        : k === count
          ? [1, 0]
          : [round6(centre[0] + cos * dx - sin * dy), round6(centre[1] + sin * dx + cos * dy)];
    const tangent: Vec2 = [(-sin * dx - cos * dy) * sign, (cos * dx - sin * dy) * sign];
    const handle = (direction: 1 | -1): Vec2 => [
      round6(at[0] + direction * reach * tangent[0]),
      round6(at[1] + direction * reach * tangent[1]),
    ];
    nodes.push({
      at,
      in: k > 0 ? handle(-1) : null,
      out: k < count ? handle(1) : null,
      smooth: k > 0 && k < count,
    });
  }
  return { nodes };
}

/** Whether two splines trace the same curve: the same anchors and handles within `tolerance`,
 * a retracted handle counting as one on its anchor (the smooth flags are not geometry). */
export function equalSplines(a: PathSpline, b: PathSpline, tolerance = 1e-9): boolean {
  if (a.nodes.length !== b.nodes.length) return false;
  const near = (p: Vec2, q: Vec2) =>
    Math.abs(p[0] - q[0]) <= tolerance && Math.abs(p[1] - q[1]) <= tolerance;
  return a.nodes.every((n, i) => {
    const m = b.nodes[i]!;
    return (
      near(n.at, m.at) && near(n.in ?? n.at, m.in ?? m.at) && near(n.out ?? n.at, m.out ?? m.at)
    );
  });
}

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

const distance = (a: Vec2, b: Vec2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** The cubic from node `a` to node `b`. A segment without handles is the straight line between
 * the anchors with its control points at 1/3 and 2/3 (as `lineTo` lays them: the line traced at
 * a constant speed, so `t` is the fraction of it); a missing handle beside a present one sits on
 * its anchor, so the curve leaves that anchor towards the other handle, as in a vector editor. */
function segmentOf(a: SplineNode, b: SplineNode): Cubic {
  if (a.out === null && b.in === null) {
    return [a.at, lerp(a.at, b.at, 1 / 3), lerp(a.at, b.at, 2 / 3), b.at];
  }
  return [a.at, a.out ?? a.at, b.in ?? b.at, b.at];
}

/** The cubic segments between consecutive nodes (`segmentOf`). */
export function splineSegments(spline: PathSpline): Cubic[] {
  const out: Cubic[] = [];
  for (let k = 0; k + 1 < spline.nodes.length; k++) {
    out.push(segmentOf(spline.nodes[k]!, spline.nodes[k + 1]!));
  }
  return out;
}

/** The point of a cubic at parameter `t`. */
export function cubicAt([p0, p1, p2, p3]: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
    w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1],
  ];
}

/** The two cubics that trace the parts of `c` before and after `t` (de Casteljau: together
 * they are the same curve). */
export function splitCubic([p0, p1, p2, p3]: Cubic, t: number): [Cubic, Cubic] {
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const s = lerp(r0, r1, t);
  return [
    [p0, q0, r0, s],
    [s, r1, q2, p3],
  ];
}

/** The arc-length table of a spline, with `samples` equal-parameter steps per segment: the
 * lengths of the polyline through the sampled points. Enough for a uniform speed to the eye at
 * the default count; the export's helper builds the same table. */
export function arcLengths(spline: PathSpline, samples = ARC_SAMPLES): ArcLengths {
  const segments = splineSegments(spline);
  const cumulative = new Float64Array(segments.length * samples + 1);
  let length = 0;
  segments.forEach((c, k) => {
    let previous = c[0];
    for (let i = 1; i <= samples; i++) {
      const point = cubicAt(c, i / samples);
      length += distance(previous, point);
      cumulative[k * samples + i] = length;
      previous = point;
    }
  });
  return { samples, cumulative, total: length };
}

/** Where the spline is at the fraction `alpha` (clamped to [0, 1]) of its length: the sampled
 * interval the length falls in, interpolated linearly in the parameter. A spline of no length
 * is at its start. */
export function placeAtFraction(table: ArcLengths, alpha: number): SplinePlace {
  const { samples, cumulative, total } = table;
  const last = cumulative.length - 1;
  const segments = last / samples;
  if (segments < 1) return { segment: 0, t: 0 };
  if (total <= 0 || alpha <= 0) return { segment: 0, t: 0 };
  if (alpha >= 1) return { segment: segments - 1, t: 1 };
  const target = alpha * total;
  // The largest i < last with cumulative[i] <= target.
  let lo = 0;
  let hi = last - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid]! <= target) lo = mid;
    else hi = mid - 1;
  }
  const step = cumulative[lo + 1]! - cumulative[lo]!;
  const fraction = step > 0 ? (target - cumulative[lo]!) / step : 0;
  const global = (lo + fraction) / samples;
  const segment = Math.min(Math.floor(global), segments - 1);
  return { segment, t: global - segment };
}

/** The point of a spline at a place of it. */
export function pointAtPlace(spline: PathSpline, place: SplinePlace): Vec2 {
  return cubicAt(
    segmentOf(spline.nodes[place.segment]!, spline.nodes[place.segment + 1]!),
    place.t,
  );
}

/** The point at the fraction `alpha` of the spline's length (`placeAtFraction`). */
export function pointAtFraction(spline: PathSpline, table: ArcLengths, alpha: number): Vec2 {
  return pointAtPlace(spline, placeAtFraction(table, alpha));
}

/** The point of the spline closest to `p`: a coarse search over sampled points, then a ternary
 * search of the distance around the best sample (across a node when the sample is one). */
export function nearestPoint(
  spline: PathSpline,
  p: Vec2,
): SplinePlace & { point: Vec2; distance: number } {
  const segments = splineSegments(spline);
  const count = segments.length;
  // A global parameter g in [0, count]: segment floor(g) at t = g − floor(g).
  const at = (g: number): Vec2 => {
    const k = Math.min(Math.floor(g), count - 1);
    return cubicAt(segments[k]!, g - k);
  };
  const far = (g: number): number => distance(at(g), p);
  const n = NEAREST_SAMPLES;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i <= count * n; i++) {
    const d = far(i / n);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  let lo = Math.max(0, (best - 1) / n);
  let hi = Math.min(count, (best + 1) / n);
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (far(m1) <= far(m2)) hi = m2;
    else lo = m1;
  }
  const g = (lo + hi) / 2;
  const segment = Math.min(Math.floor(g), count - 1);
  const point = at(g);
  return { segment, t: g - segment, point, distance: distance(point, p) };
}

/** `p` as a handle of `anchor`: null when it sits on it. */
function handle(p: Vec2, anchor: Vec2): Vec2 | null {
  return distance(p, anchor) <= ON_ANCHOR ? null : p;
}

/** The spline with a node added at a place of it, the curve unchanged: a straight segment gets
 * a corner node without handles, a curved one a smooth node with the handles de Casteljau
 * gives it (and the segment's own handles shortened to match). */
export function splitSpline(spline: PathSpline, place: SplinePlace): PathSpline {
  const nodes = spline.nodes.map((node) => ({ ...node }));
  const a = nodes[place.segment]!;
  const b = nodes[place.segment + 1]!;
  const cubic = segmentOf(a, b);
  let inserted: SplineNode;
  if (a.out === null && b.in === null) {
    inserted = { at: cubicAt(cubic, place.t), in: null, out: null, smooth: false };
  } else {
    const [first, second] = splitCubic(cubic, place.t);
    a.out = handle(first[1], a.at);
    b.in = handle(second[2], b.at);
    const at = first[3];
    inserted = { at, in: handle(first[2], at), out: handle(second[1], at), smooth: true };
  }
  nodes.splice(place.segment + 1, 0, inserted);
  return { nodes };
}

/** How far the point at the fraction `alpha` of the path's length lies from the straight run
 * between the path's ends at `alpha`, in the frame `chord` maps to (its linear part): what a
 * morph adds to its straight interpolation — `lerp(start, end, α) + (S(α) − lerp(S(0), S(1), α))`,
 * with S the path on the chord — so that the centre follows the curve while the shape
 * interpolates as on a straight path. Zero at both ends. */
export function pathShift(
  spline: PathSpline,
  table: ArcLengths,
  chord: Mat2D,
  alpha: number,
): Vec2 {
  const [u, v] = pointAtFraction(spline, table, alpha);
  const first = spline.nodes[0]!.at;
  const last = spline.nodes[spline.nodes.length - 1]!.at;
  const du = u - (first[0] + (last[0] - first[0]) * alpha);
  const dv = v - (first[1] + (last[1] - first[1]) * alpha);
  return [chord[0] * du + chord[2] * dv, chord[1] * du + chord[3] * dv];
}

/** The chord's frame as the matrix that takes chord coordinates (u along the chord, v across it
 * to its left, as fractions of its length) to the frame `from` and `to` are in: (0, 0) lands on
 * `from`, (1, 0) on `to`. Null when the two coincide (then there is no path to follow). */
export function chordFrame(from: Vec2, to: Vec2): Mat2D | null {
  const cx = to[0] - from[0];
  const cy = to[1] - from[1];
  if (cx * cx + cy * cy <= ON_ANCHOR * ON_ANCHOR) return null;
  return [cx, cy, -cy, cx, from[0], from[1]];
}
