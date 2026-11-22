/* Where Manim puts the ends of a line (ARCHITECTURE §5, "Attached objects"; fixtures sampled from
 * both venvs, `gen_lines.py`). `Line(start, end, buff=)` takes a point or a mobject for each end.
 * It first reads a rough place for both — the point, or the mobject's centre — and the direction
 * from the one to the other; an end that is a mobject then goes to the mobject's edge in that
 * direction, and the two libraries mean different points by it:
 *
 *   - ManimCE: `get_boundary_point(direction)`, the point of the mobject farthest that way — one
 *     of the anchors of its curves, the first of them when several are as far;
 *   - ManimGL: `get_continuous_bounding_box_point(direction)`, where the ray from the centre of
 *     its bounding box leaves the box.
 *
 * The line between those two points is then shortened by `buff` at each end, by each library's
 * own rule (`lineContour`): that is the line drawn, and what a line object's `vector` holds. */
import {
  applyToPoint,
  arcDrawn,
  buildLine,
  lineContour,
  pointPathBox,
  type ArrowTrace,
  type PointPath,
} from '../geom';
import {
  isGlyphEnd,
  type LineAnchor,
  type LineCurve,
  type LineEnd,
  type LineFormula,
  type Placement,
  type Target,
  type TweenEnds,
  type Vec2,
} from '../model';
import { criticalPoint, manimBoxes } from './measure';
import { placementMatrix } from './placement';
import type { SceneEvaluator } from './types';

/** What a line is drawn with: its kind and the fields its members are built from. */
export type LineLook = Pick<
  LineFormula,
  'line' | 'strokeWidth' | 'tipLength' | 'dashLength' | 'curve' | 'tip' | 'startTip'
>;

/** The centre of a line of `look` drawn from `start` along `vector`, where `get_center` reads the
 * mobject and where the render of the object puts its origin (`LineBuild.centre`). It is the
 * middle of the line unless a tip widens the box on one side, or a curve bulges out of it. */
export function lineCentre(lib: Target, look: LineLook, start: Vec2, vector: Vec2): Vec2 {
  const end: Vec2 = [start[0] + vector[0], start[1] + vector[1]];
  return buildLine(lib, look.line, start, end, look).centre;
}

/** `curve` with the part of its arc the gap at each end takes (`trim`); a straight line and a
 * spline keep theirs as they are: their gap is taken off their two ends. */
export function withTrim(curve: LineCurve | null, trim: number): LineCurve | null {
  return curve?.shape === 'arc' && curve.trim !== trim ? { ...curve, trim } : curve;
}

/** Where the two ends of a line object are in the frame of its render, which runs along the
 * object's `vector` about its own centre (`lineCentre`). */
export function lineEndsLocal(lib: Target, formula: LineFormula): { start: Vec2; end: Vec2 } {
  const [vx, vy] = formula.vector;
  const [cx, cy] = lineCentre(lib, formula, [-vx / 2, -vy / 2], formula.vector);
  return { start: [-vx / 2 - cx, -vy / 2 - cy], end: [vx / 2 - cx, vy / 2 - cy] };
}

/** What the GrowArrow of a bent arrow follows (`ArrowTrace`), in the frame of the object's render
 * (`lineEndsLocal`); null for a line without tips. */
export function lineTraceLocal(lib: Target, formula: LineFormula): ArrowTrace | null {
  const [vx, vy] = formula.vector;
  const built = buildLine(lib, formula.line, [-vx / 2, -vy / 2], [vx / 2, vy / 2], formula);
  const { trace } = built;
  if (!trace) return null;
  const [cx, cy] = built.centre;
  const local = ([x, y]: Vec2): Vec2 => [x - cx, y - cy];
  return {
    degree: trace.degree,
    points: trace.points.map((v, index) => v - (index % 2 === 0 ? cx : cy)),
    endBase: local(trace.endBase),
    startBase: trace.startBase && local(trace.startBase),
  };
}

/** Where the two ends of a line object are, for a clip of it in `state`: the clip places the
 * render of the object (`lineEndsLocal`). */
export function lineEndsAt(
  lib: Target,
  formula: LineFormula,
  state: Placement,
): { start: Vec2; end: Vec2 } {
  const local = lineEndsLocal(lib, formula);
  const pose = placementMatrix(state);
  return { start: applyToPoint(pose, local.start), end: applyToPoint(pose, local.end) };
}

/** An end as Manim is given it: a point of the scene, or a mobject — the placed point lists of
 * its glyphs, one list each, in the order of its family. */
export type LineEndInput = { point: Vec2 } | { paths: readonly PointPath[] };

/** Manim's direction of each anchor of an end on glyphs: `UL` … `DR`, and the centre. */
export const ANCHOR_VECTORS: Record<Exclude<LineAnchor, 'auto'>, Vec2> = {
  ul: [-1, 1],
  up: [0, 1],
  ur: [1, 1],
  left: [-1, 0],
  center: [0, 0],
  right: [1, 0],
  dl: [-1, -1],
  down: [0, -1],
  dr: [1, -1],
};

/** An end on glyphs as Manim is given it (D140): the mobject itself when its anchor is `auto` —
 * the library looks for its edge —, else the point of its box the anchor names, which is what
 * `get_corner(UL)`, `get_left()` … `get_center()` read (`get_critical_point`: the box of the
 * anchors in ManimCE, of every point in ManimGL). `paths`: the placed point lists of the glyphs.
 * Null for a mobject without points. */
export function glyphEndInput(
  lib: Target,
  paths: readonly PointPath[],
  anchor: LineAnchor,
): LineEndInput | null {
  if (paths.length === 0) return null;
  if (anchor === 'auto') return { paths };
  const boxes = manimBoxes(paths, lib);
  return boxes ? { point: criticalPoint(boxes, ANCHOR_VECTORS[anchor]) } : null;
}

/** An end of a line as Manim is given it at the instant `t`: its point, or the glyphs it is on
 * where the scene has them then (`glyphEndInput`). Null when the glyphs cannot be measured. */
export function lineEndInput(
  evaluator: Pick<SceneEvaluator, 'points'>,
  lib: Target,
  end: LineEnd,
  t: number,
): LineEndInput | null {
  if (!isGlyphEnd(end)) return { point: end.point };
  const lists = evaluator.points(end.clipId, end.glyphs, t);
  if (!lists || lists.length === 0) return null;
  return glyphEndInput(
    lib,
    lists.map((list) => list.placed),
    end.anchor,
  );
}

/** The rough place of an end: the point, or the centre `get_center` reads; null for a mobject
 * without points. */
function roughPlace(lib: Target, end: LineEndInput): Vec2 | null {
  if ('point' in end) return end.point;
  const boxes = manimBoxes(end.paths, lib);
  return boxes ? criticalPoint(boxes, [0, 0]) : null;
}

/** ManimCE's `get_boundary_point`: the anchor farthest along `direction`, the first one in the
 * family's order when several are as far (`np.argmax`). The anchors of a path are the first and
 * the last point of each of its cubics. */
function boundaryPoint(paths: readonly PointPath[], direction: Vec2): Vec2 | null {
  let best: Vec2 | null = null;
  let most = -Infinity;
  for (const path of paths) {
    const { points, degree } = path;
    for (let i = 0; i + 1 < points.length; i += 2) {
      const k = i / 2;
      // A cubic's points come four by four: the anchors are the first and the fourth.
      if (degree === 3 ? k % 4 === 1 || k % 4 === 2 : k % 2 === 1) continue;
      const dot = points[i]! * direction[0] + points[i + 1]! * direction[1];
      if (dot > most) {
        most = dot;
        best = [points[i]!, points[i + 1]!];
      }
    }
  }
  return best;
}

/** ManimGL's `get_continuous_bounding_box_point`: from the centre of the box of every point,
 * along `direction`, as far as the box goes; null when the box has no size that way. */
function boxPoint(paths: readonly PointPath[], direction: Vec2): Vec2 | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    const box = pointPathBox(path, false);
    if (!box) continue;
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }
  if (!Number.isFinite(minX)) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const hx = maxX - cx;
  const hy = maxY - cy;
  // A side of no length takes no part (`np.true_divide(…, where=corner_vect != 0)`).
  const reach = Math.max(
    hx !== 0 ? Math.abs(direction[0] / hx) : 0,
    hy !== 0 ? Math.abs(direction[1] / hy) : 0,
  );
  if (!(reach > 0)) return null;
  return [cx + direction[0] / reach, cy + direction[1] / reach];
}

/** The two points `Line(start, end)` runs between in `lib`, before its buff: each end's point, or
 * the edge of its mobject towards the other end. Null when an end cannot be read: a mobject with
 * no points, or two ends at one place — there is no direction to look for an edge in. */
export function manimLineEnds(
  lib: Target,
  start: LineEndInput,
  end: LineEndInput,
): { start: Vec2; end: Vec2 } | null {
  const a = roughPlace(lib, start);
  const b = roughPlace(lib, end);
  if (!a || !b) return null;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const free = 'point' in start && 'point' in end;
  if (!(length > 0) && !free) return null;
  const towards: Vec2 = length > 0 ? [(b[0] - a[0]) / length, (b[1] - a[1]) / length] : [0, 0];
  const back: Vec2 = [-towards[0], -towards[1]];
  const edge = (input: LineEndInput, direction: Vec2): Vec2 | null => {
    if ('point' in input) return input.point;
    return lib === 'ce' ? boundaryPoint(input.paths, direction) : boxPoint(input.paths, direction);
  };
  const from = edge(start, towards);
  const to = edge(end, back);
  return from && to ? { start: from, end: to } : null;
}

/** The two points `Line(start, end)` runs between for the ends of a line at the instant `t`
 * (`manimLineEnds`, the ends as `lineEndInput` hands them on): undefined when an end cannot be
 * measured then, null when Manim finds no line between them — two ends at one place with glyphs
 * among them, where there is no direction to look for an edge in: ManimCE draws a line of no
 * length there, and ManimGL stops the scene. */
export function foundLineEnds(
  evaluator: Pick<SceneEvaluator, 'points'>,
  lib: Target,
  ends: { start: LineEnd; end: LineEnd },
  t: number,
): { start: Vec2; end: Vec2 } | null | undefined {
  const from = lineEndInput(evaluator, lib, ends.start, t);
  const to = lineEndInput(evaluator, lib, ends.end, t);
  if (!from || !to) return undefined;
  return manimLineEnds(lib, from, to);
}

/** Removes the float noise of a point the editor writes (six decimals, never −0). */
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6 + 0;

/** The point to give Manim for a free end so that the line drawn ends at `at`: Manim stops the
 * line `buff` short of the point it is given, along the line, so the point is that much further
 * out. The direction depends on where the line leaves the glyphs of its other end, which depends
 * on the point in turn: a few rounds settle it. An arc leaves its gap along itself (`curve`), which
 * the same rounds follow. `at` itself when the other end cannot be measured, or with no gap. */
export function pointForFreeEnd(
  lib: Target,
  other: LineEndInput | null,
  at: Vec2,
  buff: number,
  side: 'start' | 'end',
  curve: LineCurve | null = null,
): Vec2 {
  if (!other || !(buff > 0)) return at;
  let point: Vec2 = at;
  for (let round = 0; round < 6; round++) {
    const free: LineEndInput = { point };
    const ends =
      side === 'start' ? manimLineEnds(lib, free, other) : manimLineEnds(lib, other, free);
    if (!ends) return at;
    const drawn = drawnEnds(lib, curve, ends, buff)[side];
    point = [point[0] + at[0] - drawn[0], point[1] + at[1] - drawn[1]];
  }
  return [round6(point[0]), round6(point[1])];
}

/** The line Manim draws between the two points `manimLineEnds` found, for a line bent as `curve`
 * says: from where to where once the gap at each end (`buff`) is left, and the part of an arc
 * that gap took (`LineCurve.trim`; 0 for the rest). A straight line and a spline — which the
 * export bends from the straight line — are `buff` shorter at each end (`buffedEnds`); an arc
 * leaves the gap along itself (`arcDrawn`). */
export function drawnEnds(
  lib: Target,
  curve: LineCurve | null,
  ends: { start: Vec2; end: Vec2 },
  buff: number,
): { start: Vec2; end: Vec2; trim: number } {
  if (curve?.shape === 'arc') return arcDrawn(lib, ends.start, ends.end, curve.degrees, buff);
  return { ...buffedEnds(lib, ends, buff), trim: 0 };
}

/** The line Manim draws for `Line(start, end, buff=buff)` between the two points
 * `manimLineEnds` found: from where to where, once each end is `buff` shorter (ManimCE leaves a
 * line shorter than twice its buff whole, ManimGL shrinks it to its middle). */
export function buffedEnds(
  lib: Target,
  ends: { start: Vec2; end: Vec2 },
  buff: number,
): { start: Vec2; end: Vec2 } {
  const line = lineContour(lib, ends.start, ends.end, buff);
  return { start: [line[0]!, line[1]!], end: [line[6]!, line[7]!] };
}

/** Where a tween that carries the ends of a line puts them (`TweenEnds`), measured at the instant
 * `t` it starts at: two free ends are the two points themselves; with an end on glyphs it is the
 * line Manim draws between them then — `Line(a, b, buff=…, path_arc=…)`, bent as `curve` —, from
 * where to where once its gap is left, and the part of an arc that gap took. Null when an end
 * cannot be measured, or the two are at one place. */
export function tweenEndsDrawn(
  evaluator: Pick<SceneEvaluator, 'points'>,
  lib: Target,
  ends: Pick<TweenEnds, 'start' | 'end' | 'buff'>,
  curve: LineCurve | null,
  t: number,
): { start: Vec2; end: Vec2; trim: number } | null {
  if (!isGlyphEnd(ends.start) && !isGlyphEnd(ends.end)) {
    return { start: ends.start.point, end: ends.end.point, trim: 0 };
  }
  const from = lineEndInput(evaluator, lib, ends.start, t);
  const to = lineEndInput(evaluator, lib, ends.end, t);
  const found = from && to && manimLineEnds(lib, from, to);
  return found ? drawnEnds(lib, curve, found, ends.buff) : null;
}
