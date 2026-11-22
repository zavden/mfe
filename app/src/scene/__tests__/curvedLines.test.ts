// @vitest-environment node
/* Curved lines and arrows, and the tips that are not the triangle, against what each library
 * builds (fixtures/manim/gen_curved_lines.py): an arc, a spline, a stealth tip and a dot, between
 * two points, as the export writes them. Every member point for point — the line, its dashes, its
 * tips —, with its stroke width; what the gap at each end leaves of the line; the values the
 * editor passes ManimGL for an arrow; and the centre the library reads of the whole. */
import { describe, expect, it } from 'vitest';
import { arcDrawn, buildLine, lineContour } from '../../geom';
import type { LineCurve, LineKind, LineTip, SplineNode, Target, Vec2 } from '../../model';
import { manimCurves, ourCurves, type Pt } from './manimFixture';
import curvedCe from './fixtures/manim-curved-lines-ce.json';
import curvedGl from './fixtures/manim-curved-lines-gl.json';

interface Member {
  cls: string;
  points: Pt[];
  fill: number[];
  stroke: number[];
  width: number;
}
interface Case {
  name: string;
  kind: LineKind;
  from: Vec2;
  to: Vec2;
  buff: number;
  arc: number | null;
  spline: Omit<SplineNode, 'smooth'>[] | null;
  strokeWidth: number;
  tipLength: number;
  dashLength: number;
  tips: [LineTip, LineTip];
  /** ManimGL: the values the editor passes for an arrow. */
  tip?: number;
  shaftWidth?: number;
  members: Member[];
  start: Vec2 | null;
  end: Vec2 | null;
  center: Vec2 | null;
}
interface Fixture {
  lib: Target;
  cases: Case[];
}

/** The line a case draws, as the attach sync works it out: where it runs from and to once the gap
 * at each end is left, and its curve. */
function drawn(lib: Target, c: Case): { start: Vec2; end: Vec2; curve: LineCurve | null } {
  if (c.arc !== null) {
    const arc = arcDrawn(lib, c.from, c.to, c.arc, c.buff);
    return {
      start: arc.start,
      end: arc.end,
      curve: { shape: 'arc', degrees: c.arc, trim: arc.trim },
    };
  }
  const line = lineContour(lib, c.from, c.to, c.buff);
  return {
    start: [line[0]!, line[1]!],
    end: [line[6]!, line[7]!],
    curve: c.spline
      ? { shape: 'spline', nodes: c.spline.map((node) => ({ ...node, smooth: false })) }
      : null,
  };
}

describe.each([curvedCe, curvedGl] as unknown as Fixture[])(
  'Manim $lib curved lines',
  (fixture) => {
    const { lib } = fixture;
    // ManimGL holds its points as float32.
    const digits = lib === 'ce' ? 6 : 4;
    const cases = fixture.cases.map(
      (c, index) => [`${index} ${c.name} ${c.kind} ${c.tips.join('/')} buff ${c.buff}`, c] as const,
    );

    it('samples every kind over arcs, splines and tips', () => {
      expect(new Set(fixture.cases.map((c) => c.kind))).toEqual(
        new Set(['line', 'dashed', 'arrow', 'double_arrow']),
      );
      expect(new Set(fixture.cases.flatMap((c) => c.tips))).toEqual(
        new Set(['triangle', 'stealth', 'dot']),
      );
      expect(fixture.cases.some((c) => c.arc !== null && c.arc < 0)).toBe(true);
      expect(fixture.cases.some((c) => c.spline)).toBe(true);
    });

    it.each(cases)('%s', (_name, c) => {
      const line = drawn(lib, c);
      const build = buildLine(lib, c.kind, line.start, line.end, {
        strokeWidth: c.strokeWidth,
        tipLength: c.tipLength,
        dashLength: c.dashLength,
        curve: line.curve,
        tip: c.tips[0],
        startTip: c.tips[1],
      });
      const { parts } = build;
      expect(parts.length, 'members').toBe(c.members.length);
      parts.forEach((part, k) => {
        const member = c.members[k]!;
        // Curves of no length draw nothing: ManimGL keeps the ones a cut left out, collapsed on
        // its ends, and a dash that ends within rounding of the joint of two curves has a sliver
        // of the next one or not.
        const drawn = (curve: number[]) =>
          Math.hypot(curve[6]! - curve[0]!, curve[7]! - curve[1]!) > 1e-9;
        const want = manimCurves(member, lib).filter(drawn);
        const have = ourCurves([part.contour]).filter(drawn);
        expect(have.length, `member ${k}: curves`).toBe(want.length);
        have.forEach((curve, n) =>
          curve.forEach((v, j) =>
            expect(v, `member ${k} (${member.cls}) curve ${n}[${j}]`).toBeCloseTo(
              want[n]![j]!,
              digits,
            ),
          ),
        );
        expect(part.style.strokeWidth, `member ${k}: stroke width`).toBeCloseTo(member.width, 5);
        expect(part.style.fillOpacity > 0, `member ${k}: filled`).toBe(member.fill[3]! > 0);
      });
      if (c.tip !== undefined) expect(build.tip, 'tip').toBeCloseTo(c.tip, 5);
      if (c.shaftWidth !== undefined) {
        expect(build.strokeWidth, 'stroke width').toBeCloseTo(c.shaftWidth, 5);
      }
      if (c.kind !== 'dashed' && c.start && c.end) {
        expect(line.start[0]).toBeCloseTo(c.start[0], digits);
        expect(line.start[1]).toBeCloseTo(c.start[1], digits);
        expect(line.end[0]).toBeCloseTo(c.end[0], digits);
        expect(line.end[1]).toBeCloseTo(c.end[1], digits);
      }
      if (c.center && parts.length > 0) {
        expect(build.centre[0], 'centre x').toBeCloseTo(c.center[0], digits);
        expect(build.centre[1], 'centre y').toBeCloseTo(c.center[1], digits);
      }
    });
  },
);
