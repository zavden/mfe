/* What a line is after each of the tweens that carry its ends (`TweenEnds`, D144), as the Python
 * that plays them leaves it (measured in both venvs, `fixtures/manim/gen_line_moves.py`):
 *
 *   - An arrow or a double arrow is **built anew** between its new ends: `Transform(arrow,
 *     new_arrow)`, the new one made by the constructor the export always writes — its tips and
 *     its stroke capped by its new length, an arc with the gap of its new ends (`trim`).
 *     (`put_start_and_end_on` is no use for an arrow: ManimCE keeps the tip as long as it was on
 *     an arrow too short for it, and ManimGL scales the tip and misses the end.)
 *   - A line and a dashed line are **carried**: `line.animate.put_start_and_end_on(a, b)` moves,
 *     turns and scales the points they have — an arc keeps its shape, a dashed line its dashes,
 *     however long it is now —, and `.set_stroke(width=…)` sets the stroke of them all. Manim
 *     reads the two ends of a dashed line off its dashes (`get_start()`, `get_end()`): where the
 *     first starts and the last ends, which in ManimGL is short of the end of the line.
 *   - A line whose arc takes other degrees is built anew, as an arrow is: `Transform(line,
 *     Line(a, b, path_arc=…))`. A dashed line's dashes are only ever carried.
 *
 * `Transform` aligns the points of the two mobjects first, member by member (`align_points`), and
 * leaves the line with the aligned points: an arc ManimGL drew with two quadratics, sent to one
 * it draws with one, ends as that arc in two. It draws the same, but its centre is read off other
 * points, and what cuts it later — an outro, another tween — cuts it by them. So a state here is
 * the line **as the library holds it**: the points of each member.
 *
 * The frame of a geometry does not matter — the first is in the frame of the object's render,
 * the ones after a tween in the scene's —: a clip draws its line about the centre Manim reads of
 * it (`lineCentreOf`), where the clip's state puts it. Pure. */
import {
  alignPointPaths,
  applyToPoint,
  buildLine,
  pointPathBox,
  similarityOnto,
  toPointPath,
  transformPointPath,
  type PointPath,
} from '../geom';
import {
  hasTips,
  TIME_EPSILON,
  type Clip,
  type GlyphStyle,
  type LineCurve,
  type LineEndsDrawn,
  type LineFormula,
  type Target,
  type TweenEnds,
  type Vec2,
} from '../model';
import { lineEndsAt } from './lines';
import { actionStates, endsAtStart, placementAt, tweensOf } from './state';

/** A line as a clip draws it between two of its tweens. */
export interface LineGeometry {
  /** Its members as the library holds them — ManimCE's cubics, ManimGL's quadratics —, in the
   * order of its family: the line (an arrow's shaft) then its tips, or its dashes. */
  members: PointPath[];
  styles: GlyphStyle[];
  /** Where Manim reads its two ends (`get_start()`, `get_end()`): for a dashed line, where its
   * first dash starts and where its last one ends. */
  start: Vec2;
  end: Vec2;
  /** How it is bent, with the part of an arc the gap at its ends took. */
  curve: LineCurve | null;
  /** An arrow: the middle of the base of the tip at its end, and of the one at its start. */
  bases: { end: Vec2; start: Vec2 | null } | null;
}

/** The line of `formula` built between two points, bent as `curve`, at a stroke width. */
function builtGeometry(
  lib: Target,
  formula: LineFormula,
  start: Vec2,
  end: Vec2,
  curve: LineCurve | null,
  strokeWidth: number,
): LineGeometry {
  const built = buildLine(lib, formula.line, start, end, {
    strokeWidth,
    tipLength: formula.tipLength,
    dashLength: formula.dashLength,
    curve,
    tip: formula.tip,
    startTip: formula.startTip,
  });
  const members = built.parts.map((part) => toPointPath([part.contour], lib));
  const first = members[0]?.points;
  const last = members.at(-1)?.points;
  const dashed = formula.line === 'dashed' && first && last && first.length > 1;
  return {
    members,
    styles: built.parts.map((part) => part.style),
    start: dashed ? [first[0]!, first[1]!] : start,
    end: dashed ? [last.at(-2)!, last.at(-1)!] : end,
    curve,
    bases: built.trace && { end: built.trace.endBase, start: built.trace.startBase },
  };
}

/** The line of the object itself, in the frame of its render before it is centred: along its
 * vector, about the origin. */
export function ownLineGeometry(lib: Target, formula: LineFormula): LineGeometry {
  const [vx, vy] = formula.vector;
  const start: Vec2 = [-vx / 2, -vy / 2];
  return builtGeometry(lib, formula, start, [vx / 2, vy / 2], formula.curve, formula.strokeWidth);
}

/** The centre the library reads of a line (`get_center()`): the middle of the box of the anchors
 * of its curves in ManimCE, of all its points in ManimGL. */
export function lineCentreOf(lib: Target, geometry: Pick<LineGeometry, 'members' | 'start'>): Vec2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const member of geometry.members) {
    const box = pointPathBox(member, lib === 'ce');
    if (!box) continue;
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : geometry.start;
}

/** The curve a tween's ends are measured with: the line's, an arc with the degrees the tween
 * gives it. Manim leaves the gap of an arc along the arc. */
export function measuredCurve(
  state: Pick<LineGeometry, 'curve'>,
  ends: Pick<TweenEnds, 'degrees'>,
): LineCurve | null {
  const { curve } = state;
  return curve?.shape === 'arc' && ends.degrees !== null
    ? { ...curve, degrees: ends.degrees }
    : curve;
}

/** Whether a tween with `ends` builds the line of `formula` anew from `state` — an arrow always,
 * a line whose arc takes other degrees — rather than carrying its points. */
export function rebuildsLine(
  formula: LineFormula,
  state: Pick<LineGeometry, 'curve'>,
  ends: Pick<TweenEnds, 'degrees'>,
): boolean {
  if (hasTips(formula.line)) return true;
  if (formula.line !== 'line') return false;
  return (
    state.curve?.shape === 'arc' && ends.degrees !== null && ends.degrees !== state.curve.degrees
  );
}

/** What a tween that carries the ends of the line to where `drawn` says does to it, with the
 * stroke width it arrives with: `to`, the line once there, and `from`, the line it starts as —
 * `state` itself, or, for a line built anew, `state` with its points aligned with the new one's
 * as `Transform` aligns them. The two have their points one for one. */
export function carryLine(
  lib: Target,
  formula: LineFormula,
  state: LineGeometry,
  ends: Pick<TweenEnds, 'degrees'>,
  drawn: Pick<LineEndsDrawn, 'start' | 'end' | 'trim'>,
  strokeWidth: number,
): { from: LineGeometry; to: LineGeometry } {
  const start: Vec2 = [drawn.start[0], drawn.start[1]];
  const end: Vec2 = [drawn.end[0], drawn.end[1]];
  if (!rebuildsLine(formula, state, ends)) {
    const carry = similarityOnto(state.start, state.end, start, end);
    return {
      from: state,
      to: {
        members: state.members.map((member) => transformPointPath(carry, member)),
        styles: state.styles.map((style) => ({ ...style, strokeWidth })),
        start,
        end,
        curve: state.curve,
        bases: state.bases && {
          end: applyToPoint(carry, state.bases.end),
          start: state.bases.start && applyToPoint(carry, state.bases.start),
        },
      },
    };
  }
  const measured = measuredCurve(state, ends);
  const curve = measured?.shape === 'arc' ? { ...measured, trim: drawn.trim } : measured;
  const fresh = builtGeometry(lib, formula, start, end, curve, strokeWidth);
  // A member only one of the two has (ManimGL's arrow of no length has no tip) is left as it is.
  const aligned = fresh.members.map((member, k) => {
    const was = state.members[k];
    return was ? alignPointPaths(was, member) : ([member, member] as const);
  });
  return {
    from: { ...state, members: state.members.map((member, k) => aligned[k]?.[0] ?? member) },
    to: { ...fresh, members: aligned.map((pair) => pair[1]) },
  };
}

/** How the line of `clip` is bent when its tween `actionId` starts: the object's curve, with
 * what the tweens before it that built the line anew gave it (an arc's degrees, the gap of its
 * ends). */
export function lineCurveBefore(
  formula: LineFormula,
  clip: Pick<Clip, 'actions'>,
  actionId: string,
): LineCurve | null {
  let state = { curve: formula.curve };
  for (const tween of tweensOf(clip as Clip)) {
    if (tween.id === actionId) break;
    const { ends } = tween;
    if (!ends?.drawn || endsAtStart(tween.easing) || !rebuildsLine(formula, state, ends)) continue;
    const curve = measuredCurve(state, ends);
    state = { curve: curve?.shape === 'arc' ? { ...curve, trim: ends.drawn.trim } : curve };
  }
  return state.curve;
}

/** Where the two ends of the line of `clip` are at `time`, as what places it then has them: the
 * ends the tween in effect carries it to (`TweenEnds.drawn` — while it runs too: they are what an
 * edit there changes), moved along by a plain tween after it; before any of those, where the
 * clip's placement puts the object's own line. */
export function lineEndsInEffect(
  lib: Target,
  formula: LineFormula,
  clip: Clip,
  time: number,
): { start: Vec2; end: Vec2 } {
  let carried: LineEndsDrawn | null = null;
  let plain = false;
  for (const { action } of actionStates(clip)) {
    const start = clip.start + action.start;
    if (start > time + TIME_EPSILON) break;
    const ended = time >= start + action.duration - TIME_EPSILON;
    if (ended && endsAtStart(action.easing)) continue;
    if (action.ends?.drawn) {
      carried = action.ends.drawn;
      plain = false;
    } else plain = true;
  }
  if (!carried) return lineEndsAt(lib, formula, placementAt(clip, time, lib));
  if (!plain) return { start: carried.start, end: carried.end };
  const [x, y] = placementAt(clip, time, lib).position;
  const dx = x - carried.center[0];
  const dy = y - carried.center[1];
  return {
    start: [carried.start[0] + dx, carried.start[1] + dy],
    end: [carried.end[0] + dx, carried.end[1] + dy],
  };
}
