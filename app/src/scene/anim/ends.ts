/* The line of a clip whose tweens carry its ends (`TweenEnds`, D144), at an instant.
 *
 * Such a clip draws more than one line over its life: its object's own until the first of those
 * tweens starts, then, after each, the line that tween leaves (`lineStates.ts`: an arrow built
 * anew between its new ends, a line or a dashed line carried there). While one runs Manim plays
 * `Transform(line, new_line)` — or `line.animate.put_start_and_end_on(…)`, which is the same
 * between a mobject and a copy of it —: every member goes point by point from what it is to what
 * it becomes, its stroke width with it. Two members that do not hold as many curves — an arc
 * ManimGL draws with more quadratics once it has more degrees, a straight line that becomes an
 * arc — are aligned first as `Transform` aligns them (`alignPointPaths`).
 *
 * `shapeAt` gives the contours and the styles of every member of the line at an instant, as a
 * shape's fit does (`anim/fit.ts`): about the line's centre between those tweens, for the clip's
 * pose to place; in the scene's frame already while one runs (`placed`). Pure. */
import {
  contoursBox,
  interpolatePoints,
  multiply,
  pointsToContours,
  transformPointPath,
  translate,
  type ArrowTrace,
  type Contour,
  type Mat2D,
  type PointPath,
} from '../../geom';
import {
  TIME_EPSILON,
  type Easing,
  type GlyphStyle,
  type LineFormula,
  type Target,
  type Vec2,
} from '../../model';
import type { RateFunction } from '../easing';
import { carryLine, lineCentreOf, ownLineGeometry, type LineGeometry } from '../lineStates';
import { placementMatrix } from '../placement';
import { endsAtStart } from '../state';
import type { TweenEvent } from '../types';
import type { FitTrack, OwnGlyph, ShapedGlyphs } from './fit';

/** A line as it is at a state, about its centre: what an animation that reads the line itself
 * needs of it (GrowArrow: where it starts, what its trace follows). */
export interface BuiltLine {
  start: Vec2;
  trace: ArrowTrace | null;
}

export interface EndsTrack extends FitTrack {
  /** The line as a tween left it, in effect at `time`; null while it is the object's own. */
  builtAt(time: number): BuiltLine | null;
}

interface Shaped extends ShapedGlyphs {
  styles: readonly GlyphStyle[];
  built: BuiltLine;
}

/** One of those tweens: the line it starts as, with its points aligned with the ones it ends
 * with (`from`); the line it ends as (`to`); the one it leaves (`after`: the one before it for an
 * easing that comes back); and what brings each of the first two about its centre — `from` is
 * where the line before it was, whatever the alignment did to its points. */
interface Step {
  tween: TweenEvent;
  from: LineGeometry;
  to: LineGeometry;
  after: LineGeometry;
  centreFrom: Mat2D;
  centreTo: Mat2D;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The points of a shaft in the layout a trace reads (`ArrowTrace`, `traceAt`): curves that share
 * their ends. ManimCE holds four points for each of its cubics (`PointPath`), which `traceAt`
 * would count as more curves than there are (audit A4-02); ManimGL's quadratics share their
 * anchors already. A shaft is one path: its first contour is all of it. */
function tracePoints(shaft: PointPath): number[] {
  if (shaft.degree === 2) return Array.from(shaft.points);
  return pointsToContours(shaft, shaft.points)[0] ?? [];
}

/** The track of a clip of the line `formula` with the tween events `tweens` (in start order), or
 * null when none of them carries its ends: the clip is drawn from its render alone. */
export function buildEndsTrack(input: {
  formula: LineFormula;
  target: Target;
  tweens: readonly TweenEvent[];
  own: readonly OwnGlyph[];
  ownStyles: readonly GlyphStyle[];
  rateOf(easing: Easing): RateFunction;
}): EndsTrack | null {
  const { formula, target, own, ownStyles, rateOf } = input;
  const carrying = input.tweens.filter((tween) => tween.ends?.drawn);
  if (carrying.length === 0) return null;

  const centring = (geometry: LineGeometry): Mat2D => {
    const [cx, cy] = lineCentreOf(target, geometry);
    return translate(-cx, -cy);
  };
  const first = ownLineGeometry(target, formula);
  const steps: Step[] = [];
  let state = first;
  for (const tween of carrying) {
    const ends = tween.ends!;
    const width = tween.to.strokeWidth ?? formula.strokeWidth;
    const { from, to } = carryLine(target, formula, state, ends, ends.drawn!, width);
    const after = endsAtStart(tween.easing) ? state : to;
    steps.push({ tween, from, to, after, centreFrom: centring(state), centreTo: centring(to) });
    state = after;
  }

  const memo = new Map<LineGeometry, Shaped>();
  /** The members of a line about its centre, as a render's are. */
  const shaped = (geometry: LineGeometry): Shaped => {
    let made = memo.get(geometry);
    if (!made) {
      const centre = centring(geometry);
      const paths = geometry.members.map((member) => transformPointPath(centre, member));
      const locals = own.map(({ glyph }) => {
        const path = paths[glyph];
        return path ? pointsToContours(path, path.points) : [];
      });
      const shaft = paths[0];
      const { bases } = geometry;
      const at = (point: Vec2): Vec2 => [point[0] + centre[4], point[1] + centre[5]];
      made = {
        locals,
        boxes: locals.map((l) => contoursBox(l)),
        styles: own.map(({ glyph }, k) => geometry.styles[glyph] ?? ownStyles[k]!),
        placed: false,
        key: `ends${memo.size}`,
        built: {
          start: at(geometry.start),
          trace:
            bases && shaft
              ? {
                  degree: shaft.degree,
                  points: tracePoints(shaft),
                  endBase: at(bases.end),
                  startBase: bases.start && at(bases.start),
                }
              : null,
        },
      };
      memo.set(geometry, made);
    }
    return made;
  };

  /** The line while a tween runs, `alpha` of the way: every point of every member between where
   * it was and where the tween puts it, and its stroke width between the two. */
  const running = (step: Step, alpha: number): Shaped => {
    const { tween, from, to } = step;
    const ma = multiply(placementMatrix(tween.from), step.centreFrom);
    const mb = multiply(placementMatrix(tween.to), step.centreTo);
    const locals: Contour[][] = [];
    const styles: GlyphStyle[] = [];
    own.forEach(({ glyph }, k) => {
      const a = from.members[glyph];
      const b = to.members[glyph];
      const sa = from.styles[glyph] ?? ownStyles[k]!;
      const sb = to.styles[glyph] ?? sa;
      // A member only one of the two has, or that `Transform` could not align: the nearer.
      if (!a || !b || a.points.length !== b.points.length) {
        const near = alpha < 0.5 ? a : b;
        const placed = near && transformPointPath(alpha < 0.5 ? ma : mb, near);
        locals.push(placed ? pointsToContours(placed, placed.points) : []);
        styles.push(alpha < 0.5 ? sa : sb);
        return;
      }
      const pa = transformPointPath(ma, a);
      const pb = transformPointPath(mb, b);
      locals.push(pointsToContours(pa, interpolatePoints(pa.points, pb.points, alpha, 0)));
      styles.push({
        fillOpacity: lerp(sa.fillOpacity, sb.fillOpacity, alpha),
        strokeWidth: lerp(sa.strokeWidth, sb.strokeWidth, alpha),
        strokeOpacity: lerp(sa.strokeOpacity, sb.strokeOpacity, alpha),
      });
    });
    return {
      locals,
      boxes: locals.map((l) => contoursBox(l)),
      styles,
      placed: true,
      key: '',
      built: shaped(from).built,
    };
  };

  /** The line a tween left that is in effect at `time` (null: the object's own, its render), or
   * the tween running then. */
  const at = (time: number): { state: LineGeometry | null; running: Shaped | null } => {
    let now: LineGeometry | null = null;
    for (const step of steps) {
      const { tween } = step;
      if (time < tween.start - TIME_EPSILON) break;
      if (time < tween.end - TIME_EPSILON && tween.end > tween.start) {
        const frac = (time - tween.start) / (tween.end - tween.start);
        return { state: now, running: running(step, rateOf(tween.easing)(frac)) };
      }
      now = step.after === first ? null : step.after;
    }
    return { state: now, running: null };
  };

  return {
    shapeAt(time) {
      const found = at(time);
      return found.running ?? (found.state ? shaped(found.state) : null);
    },
    builtAt(time) {
      const { state: now } = at(time);
      return now ? shaped(now).built : null;
    },
  };
}
