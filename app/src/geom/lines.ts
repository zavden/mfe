/* Manim's lines and arrows between two points, built in the browser as each library builds them
 * (fixtures/manim/gen_lines.py and gen_curved_lines.py sample them from both venvs;
 * scene/__tests__/lines.test.ts and curvedLines.test.ts check every point): the members of a line
 * object, in the order of the mobject's family.
 *
 * The way of a line, before its dashes and its tips:
 *
 *   - straight: `Line(start, end)`, one run.
 *   - an arc (`path_arc=`, D145): ManimCE's `ArcBetweenPoints` — eight cubics — and ManimGL's
 *     `add_arc_to` — a quadratic for each eighth of a turn, and a straight run for an arc under a
 *     thousandth of a radian. The gap at an end (`buff`) is left along the arc: the arc between
 *     the two ends is cut by curve count (`pointwise_become_partial`), a fraction of it at each
 *     end (`arcDrawn` works it out; a line object holds it as its curve's `trim`).
 *   - a spline: the export's `_spline` helper bends a straight line into cubic stretches through
 *     the nodes, given in the frame of its two ends (`splineStretches`). ManimCE holds the cubics;
 *     ManimGL draws quadratics, eight for each stretch (`quadraticsOfCubic`).
 *
 * What is made of it:
 *
 *   - `Line`: the way itself.
 *   - `DashedLine`: the way cut into dashes, each a member, the line left without points. ManimCE
 *     (`DashedVMobject`, half of the line painted): at least two dashes,
 *     `ceil(length / dash_length / 2)` of them, of one length along the way, the first at its
 *     start and the last at its end. ManimGL: `ceil(length / (2 · dash_length))` dashes — one for
 *     a short line, none for a line of no length —, cut by curve count, their starts spread so
 *     that the last one ends a little before the line does. Both count the dashes of an arc by the
 *     distance between its ends, not by its length. A spline's dashes are the export's `_dashed`:
 *     ManimCE's rule in both libraries, counted by the length of the curve.
 *   - an arrow: ManimCE's `Arrow` — a tip with its point on the end of the way, along the way
 *     there; the way then put between its start and the base of the tip (turned and scaled about
 *     its start: `put_start_and_end_on`); the tip and the stroke width of the shaft capped by the
 *     distance between the two ends (`arrowShape`). In ManimGL `Line(…).add_tip(…)` builds the same
 *     with the editor's values, or the export's `_arrow` helper.
 *   - a double arrow: ManimCE's `DoubleArrow`. The tip at the start is made on the way the first
 *     tip has shortened; the first tip then turns about its point with the way, which ends up
 *     between the bases of the two; the stroke width is capped by the distance between those
 *     bases. In ManimGL, the `_arrow` helper.
 *   - the tips (D146): Manim's triangle, as long as wide; ManimCE's `StealthTip`, that triangle
 *     with a notch — where the shaft ends — and a stroke of its own; and a dot as wide as the tip
 *     is long (`ArrowCircleFilledTip`; in ManimGL its own dot, asked twice as long).
 *
 * `start` and `end` are where the line is drawn from and to: the gap Manim leaves at an end
 * (`buff`) is taken before (`lineContour`, scene/lines.ts). Formula-local cubic contours, as
 * every glyph is held. */
import type { GlyphStyle, LineCurve, LineKind, LineTip, SplineNode, Vec2 } from '../model';
import { integerInterpolate, partialContours, partialQuadraticPoints } from './partial';
import { arcPoints, lineContour, MANIM_SHAPE_STYLE, type ShapeTarget } from './shapes';
import type { Contour, Mat2D } from './types';

/** The part of a dashed line that is painted (ManimCE's `dashed_ratio`, ManimGL's
 * `positive_space_ratio`). */
const DASHED_RATIO = 0.5;
/** The most dashes a dashed line is drawn with. Manim has no such limit — it builds a mobject per
 * dash until the memory ends —; here a dash length a file or a field brings must not be able to
 * hang the tab. The fields stop at a dash 0.01 long (`MIN_DASH_LENGTH`, model/defaults.ts), which
 * is 10,000 dashes on a line 200 units long: well past what a scene holds. */
export const MAX_DASHES = 10_000;
/** `Arrow.max_tip_length_to_length_ratio` and `max_stroke_width_to_length_ratio`. */
const ARROW_MAX_TIP_RATIO = 0.25;
const ARROW_MAX_STROKE_RATIO = 5;
/** The arc ManimGL draws as a straight line (`add_arc_to`'s threshold), in radians. */
const GL_STRAIGHT_ARC = 1e-3;
/** The curves of an arc between two points in ManimCE (`Arc.num_components` anchors). */
const CE_ARC_CURVES = 8;
/** The quadratics the export's `_spline` makes of each cubic stretch in ManimGL. */
const SPLINE_QUADRATICS = 8;
/** The pieces each curve is measured by (`get_nth_curve_length_pieces`: ten points). */
const LENGTH_PIECES = 9;
/** Two tangents whose cross product is under this part of their lengths run one way (well over
 * the noise of ManimGL's float32 points, so that the export's `_spline` decides the same). */
const PARALLEL = 1e-4;
/** `StealthTip`: its stroke width, and how far behind its point its notch — its base — is, as a
 * part of its length. */
const STEALTH_STROKE_WIDTH = 3;
const STEALTH_BASE = 0.625;

export interface LineOptions {
  /** `stroke_width`, before an arrow's cap by its length. */
  strokeWidth: number;
  /** An arrow's `tip_length`, before the cap by its length. */
  tipLength: number;
  /** A dashed line's `dash_length`. */
  dashLength: number;
  /** How the line is bent; straight when absent. */
  curve?: LineCurve | null;
  /** The shape of the tip at the end, and of the one at the start of a double arrow: triangles
   * when absent. */
  tip?: LineTip;
  startTip?: LineTip;
}

/** One member of a line: its path, how it is painted, and what it is. */
export interface LinePart {
  role: 'line' | 'dash' | 'tip';
  contour: Contour;
  style: GlyphStyle;
}

/** A line as it is built: its members; the values Manim caps by its length — the stroke width of
 * an arrow's shaft and the length of its tips (the ones asked for, for the other kinds) —; and
 * its centre as the library reads it (`get_center()`: the middle of the box of its anchors in
 * ManimCE, of every point in ManimGL), which is where a clip of the line is placed by. */
export interface LineBuild {
  parts: LinePart[];
  strokeWidth: number;
  tip: number;
  centre: Vec2;
  /** An arrow with its tips: what the GrowArrow of a bent arrow follows (D149). */
  trace: ArrowTrace | null;
}

/** What the GrowArrow of a bent arrow follows (D149; the export's `_TraceArrow`): the shaft as the
 * library holds it — `Create` cuts it by the count of its curves, ManimCE's cubics or ManimGL's
 * quadratics —, and the middle of the base of each tip, about which the tip grows: the one at the
 * end, where the shaft ends, and the one at the start of a double arrow. */
export interface ArrowTrace {
  degree: 2 | 3;
  points: number[];
  endBase: Vec2;
  startBase: Vec2 | null;
}

/** Below this length a way runs nowhere: a curve collapsed on a point. */
const NO_WAY = 1e-8;

/** Where the tip of a traced arrow is when the part `alpha` of its shaft is drawn: `at`, the end
 * of what is drawn — the point of the shaft at that part of its curve count —, and `turn`, how far
 * the shaft runs there from the way it runs at its end, which is how far the tip is turned from
 * where it ends. No turn where the shaft runs nowhere, there or at its end. */
export function traceAt(trace: ArrowTrace, alpha: number): { at: Vec2; turn: number } {
  const step = 2 * trace.degree;
  const curves = (trace.points.length - 2) / step;
  const along = (part: number): { at: Vec2; way: Vec2 } => {
    const [index, t] = integerInterpolate(0, curves, part);
    const p = trace.points;
    const o = index * step;
    const s = 1 - t;
    if (trace.degree === 3) {
      const b = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
      const d = [s * s, 2 * s * t, t * t];
      const sum = (weights: number[], axis: number, difference: boolean): number =>
        weights.reduce(
          (total, w, k) =>
            total +
            w *
              (difference ? p[o + 2 * k + 2 + axis]! - p[o + 2 * k + axis]! : p[o + 2 * k + axis]!),
          0,
        );
      return {
        at: [sum(b, 0, false), sum(b, 1, false)],
        way: [sum(d, 0, true), sum(d, 1, true)],
      };
    }
    return {
      at: [
        s * s * p[o]! + 2 * s * t * p[o + 2]! + t * t * p[o + 4]!,
        s * s * p[o + 1]! + 2 * s * t * p[o + 3]! + t * t * p[o + 5]!,
      ],
      way: [
        s * (p[o + 2]! - p[o]!) + t * (p[o + 4]! - p[o + 2]!),
        s * (p[o + 3]! - p[o + 1]!) + t * (p[o + 5]! - p[o + 3]!),
      ],
    };
  };
  const now = along(alpha);
  const ahead = along(1).way;
  const runs =
    Math.hypot(now.way[0], now.way[1]) > NO_WAY && Math.hypot(ahead[0], ahead[1]) > NO_WAY;
  return {
    at: now.at,
    turn: runs ? Math.atan2(now.way[1], now.way[0]) - Math.atan2(ahead[1], ahead[0]) : 0,
  };
}

/** A member before it is handed out: its way as the library holds it. */
interface Member {
  role: LinePart['role'];
  way: Way;
  style: GlyphStyle;
}

/** A way as the library holds it: curves sharing their anchors — ManimCE's cubics (an anchor,
 * then two handles and an anchor per curve), ManimGL's quadratics (an anchor, then a handle and an
 * anchor per curve). */
interface Way {
  degree: 2 | 3;
  points: number[];
  /** ManimGL keeps the curves a cut leaves out, collapsed on the end of what is left: the handle
   * it reads at that end (`get_first_handle`, `get_last_handle`) is then the end itself. */
  collapsed?: { start: boolean; end: boolean };
}

const degreeOf = (target: ShapeTarget): 2 | 3 => (target === 'ce' ? 3 : 2);
const firstOf = (way: Way): Vec2 => [way.points[0]!, way.points[1]!];
const lastOf = (way: Way): Vec2 => [way.points.at(-2)!, way.points.at(-1)!];
/** `get_first_handle()` and `get_last_handle()`: the second point and the one before the last. */
const firstHandleOf = (way: Way): Vec2 =>
  way.collapsed?.start ? firstOf(way) : [way.points[2]!, way.points[3]!];
const lastHandleOf = (way: Way): Vec2 =>
  way.collapsed?.end ? lastOf(way) : [way.points.at(-4)!, way.points.at(-3)!];
const distance = (a: Vec2, b: Vec2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** The unit vector from `from` to `to`: the way a tip points, from the handle before its end to
 * the end. Two points at one place give (−1, 0): Manim reads the angle 0 of the vector of no
 * length from the end to the handle, and points the tip the other way. */
function towards(from: Vec2, to: Vec2): Vec2 {
  const length = distance(from, to);
  return length > 0 ? [(to[0] - from[0]) / length, (to[1] - from[1]) / length] : [-1, 0];
}

/** `v` turned by `angle`. */
function turned(v: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos];
}

/** The way moved, turned and scaled so that the points `from0` and `from1` land on `to0` and
 * `to1`: what `put_start_and_end_on` does to a line. Two points at one place only move. */
function puts(from0: Vec2, from1: Vec2, to0: Vec2, to1: Vec2): (x: number, y: number) => Vec2 {
  const dx = from1[0] - from0[0];
  const dy = from1[1] - from0[1];
  const span = dx * dx + dy * dy;
  // The complex ratio (to1 − to0) / (from1 − from0).
  const tx = to1[0] - to0[0];
  const ty = to1[1] - to0[1];
  const re = span > 0 ? (tx * dx + ty * dy) / span : 1;
  const im = span > 0 ? (ty * dx - tx * dy) / span : 0;
  return (x, y) => {
    const px = x - from0[0];
    const py = y - from0[1];
    return [to0[0] + px * re - py * im, to0[1] + px * im + py * re];
  };
}

/** The matrix that moves, turns and scales the plane so that `from0` and `from1` land on `to0`
 * and `to1` (`puts`): what `put_start_and_end_on(to0, to1)` does to a line that runs from `from0`
 * to `from1`, whatever its points. */
export function similarityOnto(from0: Vec2, from1: Vec2, to0: Vec2, to1: Vec2): Mat2D {
  const at = puts(from0, from1, to0, to1);
  const [ox, oy] = at(0, 0);
  const [ax, ay] = at(1, 0);
  const [bx, by] = at(0, 1);
  return [ax - ox, ay - oy, bx - ox, by - oy, ox, oy];
}

function mapWay(way: Way, at: (x: number, y: number) => Vec2): Way {
  const points = new Array<number>(way.points.length);
  for (let i = 0; i < way.points.length; i += 2) {
    const [x, y] = at(way.points[i]!, way.points[i + 1]!);
    points[i] = x;
    points[i + 1] = y;
  }
  return { degree: way.degree, points, collapsed: way.collapsed };
}

/** The part of a way between the fractions `a` and `b` of its curve count
 * (`pointwise_become_partial`). */
function partialWay(way: Way, a: number, b: number): Way {
  if (a <= 0 && b >= 1) return way;
  if (way.degree === 3) {
    return { degree: 3, points: partialContours([way.points], a, b)[0] ?? way.points.slice(0, 2) };
  }
  const points = partialQuadraticPoints(Float64Array.from(way.points), a, b);
  const curves = (way.points.length - 2) / 4;
  return {
    degree: 2,
    points: points.length > 0 ? Array.from(points) : way.points.slice(0, 2),
    collapsed: {
      start: integerInterpolate(0, curves, a)[0] > 0,
      end: integerInterpolate(0, curves, b)[0] < curves - 1,
    },
  };
}

/** A way as a cubic contour: ManimGL's quadratics raised to cubics. */
function contourOf(way: Way): Contour {
  if (way.degree === 3) return way.points;
  const p = way.points;
  const c: Contour = [p[0]!, p[1]!];
  for (let i = 0; i + 5 < p.length; i += 4) {
    const hx = p[i + 2]!;
    const hy = p[i + 3]!;
    c.push(
      p[i]! + (2 * (hx - p[i]!)) / 3,
      p[i + 1]! + (2 * (hy - p[i + 1]!)) / 3,
      p[i + 4]! + (2 * (hx - p[i + 4]!)) / 3,
      p[i + 5]! + (2 * (hy - p[i + 5]!)) / 3,
      p[i + 4]!,
      p[i + 5]!,
    );
  }
  return c;
}

/** The centre the library reads of some ways (`get_center()`): the middle of the box of their
 * anchors in ManimCE, of all their points in ManimGL. Null without points. */
function centreOf(ways: readonly Way[]): Vec2 | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { degree, points } of ways) {
    // ManimCE's anchors: every third point of cubics sharing them.
    const step = degree === 3 ? 6 : 2;
    for (let i = 0; i + 1 < points.length; i += step) {
      minX = Math.min(minX, points[i]!);
      maxX = Math.max(maxX, points[i]!);
      minY = Math.min(minY, points[i + 1]!);
      maxY = Math.max(maxY, points[i + 1]!);
    }
  }
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
}

/** `Line(start, end)`: one straight run. */
function straightWay(target: ShapeTarget, start: Vec2, end: Vec2): Way {
  return target === 'ce'
    ? { degree: 3, points: lineContour(target, start, end) }
    : {
        degree: 2,
        points: [...start, (start[0] + end[0]) / 2, (start[1] + end[1]) / 2, ...end],
      };
}

/** Whether the library draws an arc of `degrees` as a straight line: none in ManimCE, one under a
 * thousandth of a radian in ManimGL. */
function isStraightArc(target: ShapeTarget, degrees: number): boolean {
  const angle = (degrees * Math.PI) / 180;
  return target === 'ce' ? angle === 0 : Math.abs(angle) < GL_STRAIGHT_ARC;
}

/** The arc of `degrees` from (1, 0) about the origin, as the library holds the one it lays between
 * two points. */
function unitArcWay(target: ShapeTarget, degrees: number): Way {
  const angle = (degrees * Math.PI) / 180;
  const curves = target === 'ce' ? CE_ARC_CURVES : Math.ceil((8 * Math.abs(angle)) / (2 * Math.PI));
  return { degree: degreeOf(target), points: arcPoints(target, angle, curves) };
}

/** The cumulative lengths of a way, each curve measured by ten points of it — nine straight
 * pieces —, from 0: what `DashedVMobject` and `get_arc_length` add up in ManimCE, and the export's
 * `_dashed` in ManimGL. */
function wayLengths(way: Way): number[] {
  const p = way.points;
  const step = 2 * way.degree;
  const lengths = [0];
  for (let at = 0; at + step + 1 < p.length; at += step) {
    let px = p[at]!;
    let py = p[at + 1]!;
    for (let k = 1; k <= LENGTH_PIECES; k++) {
      const t = k / LENGTH_PIECES;
      const s = 1 - t;
      let x: number;
      let y: number;
      if (way.degree === 3) {
        const b0 = s * s * s;
        const b1 = 3 * s * s * t;
        const b2 = 3 * s * t * t;
        const b3 = t * t * t;
        x = b0 * p[at]! + b1 * p[at + 2]! + b2 * p[at + 4]! + b3 * p[at + 6]!;
        y = b0 * p[at + 1]! + b1 * p[at + 3]! + b2 * p[at + 5]! + b3 * p[at + 7]!;
      } else {
        x = s * s * p[at]! + 2 * s * t * p[at + 2]! + t * t * p[at + 4]!;
        y = s * s * p[at + 1]! + 2 * s * t * p[at + 3]! + t * t * p[at + 5]!;
      }
      lengths.push(lengths.at(-1)! + Math.hypot(x - px, y - py));
      px = x;
      py = y;
    }
  }
  return lengths;
}

/** The fraction of a way's curve count at the fraction `part` of its length (`np.interp` over
 * the measured pieces). */
function fractionAtLength(lengths: readonly number[], part: number): number {
  const last = lengths.length - 1;
  const want = part * lengths[last]!;
  if (want <= 0) return 0;
  if (want >= lengths[last]!) return 1;
  let i = 1;
  while (i < last && lengths[i]! < want) i++;
  const before = lengths[i - 1]!;
  const piece = lengths[i]! - before;
  // In curves: a cut within rounding of the joint of two curves is that joint, so that it leaves
  // no sliver of the curve before it.
  const curves = (i - 1 + (piece > 0 ? (want - before) / piece : 0)) / LENGTH_PIECES;
  const joint = Math.round(curves);
  return (Math.abs(curves - joint) < 1e-9 ? joint : curves) / (last / LENGTH_PIECES);
}

/** What the gap at each end leaves of an arc of `degrees` between `start` and `end`, the two
 * points Manim runs it between: where it is drawn from and to, and the fraction of the arc cut at
 * each end (a line object's `curve.trim`). The gap is left along the arc: ManimCE measures the arc
 * by its pieces and leaves an arc shorter than twice its gap whole; ManimGL takes a clockwise arc
 * to be as long as the distance between its ends, and cuts no more than half at each end. */
export function arcDrawn(
  target: ShapeTarget,
  start: Vec2,
  end: Vec2,
  degrees: number,
  buff: number,
): { start: Vec2; end: Vec2; trim: number } {
  if (isStraightArc(target, degrees)) {
    const line = lineContour(target, start, end, buff);
    return { start: [line[0]!, line[1]!], end: [line[6]!, line[7]!], trim: 0 };
  }
  const chord = distance(start, end);
  if (!(buff > 0) || !(chord > 0)) return { start, end, trim: 0 };
  const unit = unitArcWay(target, degrees);
  const scale = chord / distance(firstOf(unit), lastOf(unit));
  let trim: number;
  if (target === 'ce') {
    const length = wayLengths(unit).at(-1)! * scale;
    trim = length < 2 * buff ? 0 : buff / length;
  } else {
    const angle = (degrees * Math.PI) / 180;
    const length = angle > 0 ? (chord * angle) / (2 * Math.sin(angle / 2)) : chord;
    trim = Math.min(buff / length, 0.5);
  }
  if (trim === 0) return { start, end, trim };
  const at = puts(firstOf(unit), lastOf(unit), start, end);
  const cut = partialWay(unit, trim, 1 - trim);
  return { start: at(...firstOf(cut)), end: at(...lastOf(cut)), trim };
}

/** `arcDrawn` backwards: the two points Manim runs an arc between and the gap it leaves at each
 * end, for an arc drawn from `start` to `end` whose gap took `trim` of it — what the export writes
 * for a line that hangs on nothing. An arc with no gap runs between the two ends themselves. */
export function arcUndrawn(
  target: ShapeTarget,
  start: Vec2,
  end: Vec2,
  degrees: number,
  trim: number,
): { start: Vec2; end: Vec2; buff: number } {
  if (!(trim > 0) || isStraightArc(target, degrees)) return { start, end, buff: 0 };
  const unit = unitArcWay(target, degrees);
  const cut = partialWay(unit, trim, 1 - trim);
  if (!(distance(firstOf(cut), lastOf(cut)) > 0)) return { start, end, buff: 0 };
  const at = puts(firstOf(cut), lastOf(cut), start, end);
  const from = at(...firstOf(unit));
  const to = at(...lastOf(unit));
  const chord = distance(from, to);
  const angle = (degrees * Math.PI) / 180;
  const length =
    target === 'ce'
      ? (wayLengths(unit).at(-1)! * chord) / distance(firstOf(unit), lastOf(unit))
      : angle > 0
        ? (chord * angle) / (2 * Math.sin(angle / 2))
        : chord;
  return { start: from, end: to, buff: trim * length };
}

/** The arc of `degrees` drawn from `start` to `end`, once the gap at each end took `trim` of the
 * arc Manim built. */
function arcWay(target: ShapeTarget, start: Vec2, end: Vec2, degrees: number, trim: number): Way {
  if (isStraightArc(target, degrees)) return straightWay(target, start, end);
  const unit = unitArcWay(target, degrees);
  const cut = trim > 0 ? partialWay(unit, trim, 1 - trim) : unit;
  return mapWay(cut, puts(firstOf(cut), lastOf(cut), start, end));
}

/** The cubic stretches of a spline, in the frame of its nodes: for each, its two handles and the
 * anchor it ends at — what the export writes for `_spline`. A handle that is not there sits a
 * third of the way to the next control point of its stretch — the other handle, or the other
 * anchor —, so that the curve leaves its anchor towards it and a tip there finds its way. */
export function splineStretches(nodes: readonly SplineNode[]): [Vec2, Vec2, Vec2][] {
  const third = (from: Vec2, to: Vec2): Vec2 => [
    from[0] + (to[0] - from[0]) / 3,
    from[1] + (to[1] - from[1]) / 3,
  ];
  const stretches: [Vec2, Vec2, Vec2][] = [];
  for (let k = 0; k + 1 < nodes.length; k++) {
    const p0 = nodes[k]!.at;
    const p3 = nodes[k + 1]!.at;
    const out = nodes[k]!.out;
    const into = nodes[k + 1]!.in;
    stretches.push([out ?? third(p0, into ?? p3), into ?? third(p3, out ?? p0), p3]);
  }
  return stretches;
}

/** The quadratics the export's `_spline` makes of a cubic stretch in ManimGL, as (handle, anchor)
 * pairs after its start: eight, each with its handle where the tangents at its two ends meet,
 * when they meet between them; else — the curve runs straight there, or turns its bend — the
 * handle of the quadratic nearest to that eighth. */
function quadraticsOfCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): number[] {
  const at: Vec2[] = [];
  const way: Vec2[] = [];
  for (let i = 0; i <= SPLINE_QUADRATICS; i++) {
    const t = i / SPLINE_QUADRATICS;
    const s = 1 - t;
    at.push([
      s * s * s * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t * t * t * p3[0],
      s * s * s * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t * t * t * p3[1],
    ]);
    way.push([
      s * s * (p1[0] - p0[0]) + 2 * s * t * (p2[0] - p1[0]) + t * t * (p3[0] - p2[0]),
      s * s * (p1[1] - p0[1]) + 2 * s * t * (p2[1] - p1[1]) + t * t * (p3[1] - p2[1]),
    ]);
  }
  const out: number[] = [];
  for (let i = 0; i < SPLINE_QUADRATICS; i++) {
    const a = at[i]!;
    const b = at[i + 1]!;
    const da = way[i]!;
    const db = way[i + 1]!;
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const spread = 3 / (4 * SPLINE_QUADRATICS);
    let handle: Vec2 = [mid[0] + spread * (da[0] - db[0]), mid[1] + spread * (da[1] - db[1])];
    const turn = da[0] * db[1] - da[1] * db[0];
    if (Math.abs(turn) > PARALLEL * Math.hypot(da[0], da[1]) * Math.hypot(db[0], db[1])) {
      const gap: Vec2 = [b[0] - a[0], b[1] - a[1]];
      const s = (gap[0] * db[1] - gap[1] * db[0]) / turn;
      const u = (da[0] * gap[1] - da[1] * gap[0]) / turn;
      const met: Vec2 = [a[0] + s * da[0], a[1] + s * da[1]];
      if (s > 0 && u > 0 && distance(met, mid) <= Math.hypot(gap[0], gap[1])) handle = met;
    }
    out.push(handle[0], handle[1], b[0], b[1]);
  }
  return out;
}

/** The spline through `nodes` drawn from `start` to `end`: its stretches put in the frame of the
 * two ends — u along the line from the one (0) to the other (1), v across it to the left. */
function splineWay(target: ShapeTarget, start: Vec2, end: Vec2, nodes: readonly SplineNode[]): Way {
  const ax = end[0] - start[0];
  const ay = end[1] - start[1];
  const at = ([u, v]: Vec2): Vec2 => [start[0] + u * ax - v * ay, start[1] + u * ay + v * ax];
  const points: number[] = [start[0], start[1]];
  let last = start;
  for (const [h1, h2, anchor] of splineStretches(nodes)) {
    const p1 = at(h1);
    const p2 = at(h2);
    const p3 = at(anchor);
    if (target === 'ce') points.push(...p1, ...p2, ...p3);
    else points.push(...quadraticsOfCubic(last, p1, p2, p3));
    last = p3;
  }
  if (points.length === 2) return straightWay(target, start, end);
  return { degree: degreeOf(target), points };
}

/** The way of a line drawn from `start` to `end`, before its dashes and its tips. */
function wayOf(target: ShapeTarget, start: Vec2, end: Vec2, curve: LineCurve | null): Way {
  if (curve?.shape === 'arc') return arcWay(target, start, end, curve.degrees, curve.trim);
  if (curve?.shape === 'spline') return splineWay(target, start, end, curve.nodes);
  return straightWay(target, start, end);
}

/** The dashes of a dashed line `length` long, as fractions of it: where each starts and ends.
 * Never more than `MAX_DASHES`, however short the dash. */
export function dashSpans(
  target: ShapeTarget,
  length: number,
  dashLength: number,
): [number, number][] {
  const each = length / dashLength;
  if (target === 'ce') {
    const n = Math.min(
      MAX_DASHES,
      Math.max(2, Number.isFinite(each) ? Math.ceil(each * DASHED_RATIO) : 2),
    );
    const dash = DASHED_RATIO / n;
    const period = dash + (1 - DASHED_RATIO) / (n - 1);
    const spans: [number, number][] = [];
    for (let i = 0; i < n; i++) spans.push([i * period, Math.min(1, i * period + dash)]);
    // The last one ends where the line does (its overflow check clamps it).
    spans[n - 1]![1] = 1;
    return spans;
  }
  const n = Math.min(MAX_DASHES, Number.isFinite(each) ? Math.ceil(each * DASHED_RATIO) : 1);
  if (n <= 0) return [];
  const dash = DASHED_RATIO / n;
  const spread = 1 - 1 / n + dash;
  const spans: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const from = i / n / spread;
    spans.push([from, from + dash]);
  }
  return spans;
}

/** The dashes of a way. A straight line and an arc take the library's own: counted by the
 * distance between the two ends, of one length along the way in ManimCE, cut by curve count in
 * ManimGL. A spline takes the export's `_dashed` in both: ManimCE's rule, counted by the length
 * of the curve. */
function dashesOf(
  target: ShapeTarget,
  way: Way,
  curve: LineCurve | null,
  dashLength: number,
): Way[] {
  if (curve?.shape === 'spline' || target === 'ce') {
    const lengths = wayLengths(way);
    const counted =
      curve?.shape === 'spline' ? lengths.at(-1)! : distance(firstOf(way), lastOf(way));
    return dashSpans('ce', counted, dashLength).map(([a, b]) =>
      partialWay(way, fractionAtLength(lengths, a), fractionAtLength(lengths, b)),
    );
  }
  return dashSpans('gl', distance(firstOf(way), lastOf(way)), dashLength).map(([a, b]) =>
    partialWay(way, a, b),
  );
}

/** How far behind its point a tip's base is — where the shaft ends —, as a part of its length. */
const tipBase = (shape: LineTip): number => (shape === 'stealth' ? STEALTH_BASE : 1);

/** A tip of `shape`, `size` long, whose point is at `point`, pointing along the unit vector `u`.
 * The triangle and the stealth tip run from the point through the corner on the left of that
 * direction — the stealth one then through its notch — to the corner on its right and back; the
 * dot is a circle counter-clockwise from the point, as the library holds a circle. */
function tipOf(target: ShapeTarget, shape: LineTip, point: Vec2, u: Vec2, size: number): Member {
  const at = (along: number, across: number): Vec2 => [
    point[0] + along * u[0] - across * u[1],
    point[1] + along * u[1] + across * u[0],
  ];
  if (shape === 'dot') {
    const radius = size / 2;
    const angle = Math.atan2(u[1], u[0]);
    const circle: Way = {
      degree: degreeOf(target),
      points: arcPoints(target, 2 * Math.PI, target === 'ce' ? 8 : 16),
    };
    const cos = Math.cos(angle) * radius;
    const sin = Math.sin(angle) * radius;
    const [cx, cy] = at(-radius, 0);
    const placed = mapWay(circle, (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
    return { role: 'tip', way: placed, style: { ...MANIM_SHAPE_STYLE.tip } };
  }
  const corners: Vec2[] =
    shape === 'stealth'
      ? [at(-size, size / 2), at(-STEALTH_BASE * size, 0), at(-size, -size / 2)]
      : [at(-size, size / 2), at(-size, -size / 2)];
  const way = [point, ...corners, point].reduce<Way | null>((made, corner, index, all) => {
    if (index === 0) return null;
    const run = straightWay(target, all[index - 1]!, corner);
    return made ? { degree: made.degree, points: [...made.points, ...run.points.slice(2)] } : run;
  }, null)!;
  const style: GlyphStyle =
    shape === 'stealth'
      ? { ...MANIM_SHAPE_STYLE.tip, strokeWidth: STEALTH_STROKE_WIDTH }
      : { ...MANIM_SHAPE_STYLE.tip };
  return { role: 'tip', way, style };
}

/** The stroke width an arrow's shaft takes and the size of its tips, for a straight arrow with
 * triangle tips `length` long from end to end: the ones asked for, capped by the length
 * (`get_default_tip_length`: a quarter of it; `_set_stroke_width_from_length`: five times it).
 * ManimCE measures the length for a double arrow's stroke once its second tip has shortened the
 * shaft and with the tips taken off — what is left between the two tips —, so a short double
 * arrow is thinner than the arrow of its length. `buildLine` gives the same for any line. */
export function arrowValues(
  kind: LineKind,
  length: number,
  options: Pick<LineOptions, 'strokeWidth' | 'tipLength'>,
): { strokeWidth: number; tip: number } {
  const tip = Math.min(options.tipLength, ARROW_MAX_TIP_RATIO * length);
  const measured = kind === 'double_arrow' ? length - 2 * tip : length;
  return { strokeWidth: Math.min(options.strokeWidth, ARROW_MAX_STROKE_RATIO * measured), tip };
}

/** A line of `kind` drawn from `start` to `end`: its members in the order of its family — the
 * line (an arrow's shaft), then its tips, the one at the end first, or the dashes from the start
 * on — and the values Manim caps by its length. ManimCE applies those itself; the export writes
 * them for ManimGL. */
export function buildLine(
  target: ShapeTarget,
  kind: LineKind,
  start: Vec2,
  end: Vec2,
  options: LineOptions,
): LineBuild {
  const stroke = (strokeWidth: number): GlyphStyle => ({ ...MANIM_SHAPE_STYLE.line, strokeWidth });
  const curve = options.curve ?? null;
  const way = wayOf(target, start, end, curve);
  const built = (
    strokeWidth: number,
    tip: number,
    members: Member[],
    bases: { end: Vec2; start: Vec2 | null } | null = null,
  ): LineBuild => ({
    strokeWidth,
    tip,
    parts: members.map((m) => ({ role: m.role, contour: contourOf(m.way), style: m.style })),
    centre: centreOf(members.map((m) => m.way)) ?? [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
    ],
    trace: bases && {
      degree: members[0]!.way.degree,
      points: members[0]!.way.points,
      endBase: bases.end,
      startBase: bases.start,
    },
  });
  if (kind === 'line') {
    return built(options.strokeWidth, options.tipLength, [
      { role: 'line', way, style: stroke(options.strokeWidth) },
    ]);
  }
  if (kind === 'dashed') {
    return built(
      options.strokeWidth,
      options.tipLength,
      dashesOf(target, way, curve, options.dashLength).map((dash) => ({
        role: 'dash' as const,
        way: dash,
        style: stroke(options.strokeWidth),
      })),
    );
  }
  const first = firstOf(way);
  const last = lastOf(way);
  const length = distance(first, last);
  const tip = Math.min(options.tipLength, ARROW_MAX_TIP_RATIO * length);
  const capped = (measured: number) =>
    Math.min(options.strokeWidth, ARROW_MAX_STROKE_RATIO * measured);
  // ManimGL cannot put a tip on a line of no length (`add_tip` fails): the export writes the
  // line alone there.
  if (target === 'gl' && !(tip > 0)) {
    const strokeWidth = capped(length);
    return built(strokeWidth, tip, [{ role: 'line', way, style: stroke(strokeWidth) }]);
  }
  const endShape = options.tip ?? 'triangle';
  // The tip at the end: its point on the end of the way, along the way there; the way then runs
  // to its base.
  const ahead = towards(lastHandleOf(way), last);
  const base = (point: Vec2, u: Vec2, shape: LineTip): Vec2 => [
    point[0] - tipBase(shape) * tip * u[0],
    point[1] - tipBase(shape) * tip * u[1],
  ];
  const endBase = base(last, ahead, endShape);
  if (kind === 'arrow') {
    const strokeWidth = capped(length);
    return built(
      strokeWidth,
      tip,
      [
        {
          role: 'line',
          way: mapWay(way, puts(first, last, first, endBase)),
          style: stroke(strokeWidth),
        },
        tipOf(target, endShape, last, ahead, tip),
      ],
      { end: endBase, start: null },
    );
  }
  // The tip at the start is made on the way the first tip has shortened; the first then turns
  // about its point with the way, when the second shortens it.
  const startShape = options.startTip ?? 'triangle';
  const shortened = mapWay(way, puts(first, last, first, endBase));
  const back = towards(firstHandleOf(shortened), first);
  const startBase = base(first, back, startShape);
  const turn =
    Math.atan2(last[1] - startBase[1], last[0] - startBase[0]) -
    Math.atan2(last[1] - first[1], last[0] - first[0]);
  const aheadTurned = turned(ahead, turn);
  const endBaseTurned = base(last, aheadTurned, endShape);
  const strokeWidth = capped(distance(startBase, endBaseTurned));
  return built(
    strokeWidth,
    tip,
    [
      {
        role: 'line',
        way: mapWay(way, puts(first, last, startBase, endBaseTurned)),
        style: stroke(strokeWidth),
      },
      tipOf(target, endShape, last, aheadTurned, tip),
      tipOf(target, startShape, first, back, tip),
    ],
    { end: endBaseTurned, start: startBase },
  );
}

/** The members of a line of `kind` drawn from `start` to `end` (`buildLine`). */
export function lineParts(
  target: ShapeTarget,
  kind: LineKind,
  start: Vec2,
  end: Vec2,
  options: LineOptions,
): LinePart[] {
  return buildLine(target, kind, start, end, options).parts;
}
