// @vitest-environment node
/* A tween that carries the ends of a line (D144) against what Manim plays for it
 * (fixtures/manim/gen_line_moves.py, manim-line-moves-*.json): every kind of line — straight, an
 * arc, a spline, with the tips the editor has —, carried from two points to two others, part of
 * the way and once there. An arrow is built anew between its new ends (`Transform`), a line and
 * a dashed line are carried as they are (`put_start_and_end_on`), a line whose arc takes other
 * degrees is built anew; every member point for point, with its stroke width, and the centre
 * Manim reads of the line once it is there, which is where the clip is from then on. */
import { describe, expect, it } from 'vitest';
import { contoursBox, pointsToContours, transformContour, type Contour } from '../../geom';
import {
  createLineFormula,
  type ClipState,
  type LineKind,
  type LineTip,
  type SplineNode,
  type Target,
  type Vec2,
} from '../../model';
import { buildEndsTrack } from '../anim/ends';
import { carryLine, lineCentreOf, ownLineGeometry } from '../lineStates';
import { placementMatrix } from '../placement';
import type { TweenEvent } from '../types';
import { manimCurves, ourCurves, type Pt } from './manimFixture';
import movesCe from './fixtures/manim-line-moves-ce.json';
import movesGl from './fixtures/manim-line-moves-gl.json';

interface Case {
  name: string;
  kind: LineKind;
  from: [Vec2, Vec2];
  to: [Vec2, Vec2];
  arc: number | null;
  spline: Omit<SplineNode, 'smooth'>[] | null;
  degrees: number | null;
  toWidth: number | null;
  strokeWidth: number;
  tipLength: number;
  dashLength: number;
  tips: [LineTip, LineTip];
  frames: { alpha: number; members: { points: Pt[]; width: number }[] }[];
  center: Vec2;
}
interface Fixture {
  lib: Target;
  cases: Case[];
}

const state = (position: Vec2, strokeWidth?: number): ClipState => ({
  position,
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  color: null,
  glyphColors: {},
  ...(strokeWidth === undefined ? {} : { strokeWidth }),
});

/** The clip of a case as the editor has it: its line object along the first two points, at the
 * centre Manim reads of it, and one tween over [1, 2) that carries its ends to the other two. */
function played(lib: Target, c: Case) {
  const [a0, a1] = c.from;
  const [b0, b1] = c.to;
  const formula = createLineFormula({
    line: c.kind,
    vector: [a1[0] - a0[0], a1[1] - a0[1]],
    strokeWidth: c.strokeWidth,
    tipLength: c.tipLength,
    dashLength: c.dashLength,
    tip: c.tips[0],
    startTip: c.tips[1],
    curve:
      c.arc !== null
        ? { shape: 'arc', degrees: c.arc, trim: 0 }
        : c.spline
          ? { shape: 'spline', nodes: c.spline.map((node) => ({ ...node, smooth: false })) }
          : null,
  });
  const own = ownLineGeometry(lib, formula);
  // The render of the object: its members about the centre Manim reads of it.
  const [cx, cy] = lineCentreOf(lib, own);
  const glyphs = own.members.map((member, glyph) => {
    const local = pointsToContours(member, member.points).map((contour) =>
      transformContour([1, 0, 0, 1, -cx, -cy], contour),
    );
    return { glyph, local, box: contoursBox(local) };
  });
  const width = c.toWidth ?? formula.strokeWidth;
  const drawn = { start: b0, end: b1, trim: 0 };
  const there = lineCentreOf(
    lib,
    carryLine(lib, formula, own, { degrees: c.degrees }, drawn, width).to,
  );
  // Where the clip is: the object runs about its origin, the line from its first point.
  const [vx, vy] = formula.vector;
  const before: Vec2 = [a0[0] + vx / 2 + cx, a0[1] + vy / 2 + cy];
  const tween: TweenEvent = {
    kind: 'tween',
    id: 'tween:t',
    start: 1,
    end: 2,
    easing: 'linear',
    clipId: 'c',
    actionId: 't',
    from: state(before),
    to: state(there, c.toWidth ?? undefined),
    ends: {
      start: { point: b0 },
      end: { point: b1 },
      buff: 0,
      degrees: c.degrees,
      drawn: { ...drawn, center: there },
    },
  };
  const track = buildEndsTrack({
    formula,
    target: lib,
    tweens: [tween],
    own: glyphs,
    ownStyles: own.styles,
    rateOf: () => (t) => t,
  })!;
  return { track, tween, centre: there };
}

describe.each([movesCe, movesGl] as unknown as Fixture[])(
  'Manim $lib: a tween that carries the ends of a line',
  (fixture) => {
    const { lib } = fixture;
    // ManimGL holds its points as float32.
    const digits = lib === 'ce' ? 6 : 4;
    const cases = fixture.cases.map(
      (c, index) => [`${index} ${c.kind} ${c.tips.join('/')} ${c.name}`, c] as const,
    );

    it('samples every kind, straight and bent, to a long line and a short one', () => {
      expect(new Set(fixture.cases.map((c) => c.kind))).toEqual(
        new Set(['line', 'dashed', 'arrow', 'double_arrow']),
      );
      expect(fixture.cases.some((c) => c.degrees !== null)).toBe(true);
      expect(fixture.cases.some((c) => c.spline && c.kind === 'dashed')).toBe(true);
      expect(fixture.cases.some((c) => c.toWidth !== null)).toBe(true);
    });

    it.each(cases)('%s', (_name, c) => {
      const { track, tween, centre } = played(lib, c);
      expect(centre[0], 'centre x').toBeCloseTo(c.center[0], digits);
      expect(centre[1], 'centre y').toBeCloseTo(c.center[1], digits);
      for (const frame of c.frames) {
        const time = frame.alpha < 1 ? tween.start + frame.alpha : 3;
        const shaped = track.shapeAt(time)!;
        // Once it has ended the line is about its centre, where the clip's state puts it.
        const pose = shaped.placed ? null : placementMatrix(tween.to);
        expect(shaped.placed, 'in the scene while it runs').toBe(frame.alpha < 1);
        expect(shaped.locals.length, 'members').toBe(frame.members.length);
        frame.members.forEach((member, k) => {
          // Curves of no length draw nothing (ManimGL keeps the ones a cut left out).
          const drawn = (curve: number[]) =>
            Math.hypot(curve[6]! - curve[0]!, curve[7]! - curve[1]!) > 1e-9 ||
            Math.hypot(curve[2]! - curve[0]!, curve[3]! - curve[1]!) > 1e-9;
          const want = manimCurves(member, lib).filter(drawn);
          const local: readonly Contour[] = shaped.locals[k]!;
          const have = ourCurves(pose ? local.map((l) => transformContour(pose, l)) : local).filter(
            drawn,
          );
          const at = `alpha ${frame.alpha}, member ${k}`;
          expect(have.length, `${at}: curves`).toBe(want.length);
          have.forEach((curve, n) =>
            curve.forEach((v, j) =>
              expect(v, `${at}, curve ${n}[${j}]`).toBeCloseTo(want[n]![j]!, digits),
            ),
          );
          expect(shaped.styles![k]!.strokeWidth, `${at}: stroke width`).toBeCloseTo(
            member.width,
            4,
          );
        });
      }
    });
  },
);
