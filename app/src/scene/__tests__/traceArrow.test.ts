// @vitest-environment node
/* The GrowArrow of a bent arrow (D149) against the export's `_TraceArrow` run in each library
 * (fixtures/manim/gen_curved_lines.py, manim-trace-arrow-*.json): arrows and double arrows bent
 * into arcs and splines, with each shape of tip, part of the way through the animation — every
 * member point for point: the shaft cut as Create cuts it, the tip at the end on the end of what
 * is drawn, turned with it and grown over the first quarter, the tip at the start grown in its
 * place. */
import { describe, expect, it } from 'vitest';
import { arcDrawn, buildLine, lineContour, type Contour } from '../../geom';
import type { LineCurve, LineKind, LineTip, SplineNode, Target, Vec2 } from '../../model';
import { introLook, TRACE_TIP_GROWN, type LookInput } from '../anim/looks';
import { manimCurves, ourCurves, type Pt } from './manimFixture';
import traceCe from './fixtures/manim-trace-arrow-ce.json';
import traceGl from './fixtures/manim-trace-arrow-gl.json';

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
  frames: { alpha: number; members: Pt[][] }[];
}
interface Fixture {
  lib: Target;
  cases: Case[];
}

/** The arrow of a case as the editor builds it (as `curvedLines.test.ts` checks it whole). */
function built(lib: Target, c: Case) {
  let start: Vec2;
  let end: Vec2;
  let curve: LineCurve;
  if (c.arc !== null) {
    const arc = arcDrawn(lib, c.from, c.to, c.arc, c.buff);
    ({ start, end } = arc);
    curve = { shape: 'arc', degrees: c.arc, trim: arc.trim };
  } else {
    const line = lineContour(lib, c.from, c.to, c.buff);
    start = [line[0]!, line[1]!];
    end = [line[6]!, line[7]!];
    curve = { shape: 'spline', nodes: c.spline!.map((node) => ({ ...node, smooth: false })) };
  }
  return buildLine(lib, c.kind, start, end, {
    strokeWidth: c.strokeWidth,
    tipLength: c.tipLength,
    dashLength: c.dashLength,
    curve,
    tip: c.tips[0],
    startTip: c.tips[1],
  });
}

const MEMBERS = ['shaft', 'tip', 'startTip'] as const;

function lookOf(lib: Target, c: Case, member: number, alpha: number): Contour[] {
  const build = built(lib, c);
  const part = build.parts[member]!;
  const input: LookInput = {
    local: [part.contour],
    matrix: [1, 0, 0, 1, 0, 0],
    color: '#FFFFFF',
    opacity: 1,
    style: part.style,
    groupColor: '#FFFFFF',
    center: [0, 0],
    target: lib,
    shift: [0, 0],
    scale: 1,
    trace: { path: build.trace!, member: MEMBERS[member]! },
  };
  return introLook('grow_arrow', input, alpha)?.contours ?? [];
}

describe.each([traceCe, traceGl] as unknown as Fixture[])(
  'Manim $lib: the GrowArrow of a bent arrow',
  (fixture) => {
    const { lib } = fixture;
    // ManimGL holds its points as float32.
    const digits = lib === 'ce' ? 6 : 4;
    const cases = fixture.cases.flatMap((c, index) =>
      c.frames.map(
        (frame) =>
          [`${index} ${c.name} ${c.kind} ${c.tips.join('/')} at ${frame.alpha}`, c, frame] as const,
      ),
    );

    it('samples arcs and splines, arrows and double arrows, before and after the tips are grown', () => {
      expect(new Set(fixture.cases.map((c) => c.kind))).toEqual(new Set(['arrow', 'double_arrow']));
      expect(fixture.cases.some((c) => c.arc !== null)).toBe(true);
      expect(fixture.cases.some((c) => c.spline)).toBe(true);
      const alphas = fixture.cases[0]!.frames.map((frame) => frame.alpha);
      expect(alphas.some((alpha) => alpha < TRACE_TIP_GROWN)).toBe(true);
      expect(alphas.some((alpha) => alpha > TRACE_TIP_GROWN && alpha < 1)).toBe(true);
      expect(alphas).toContain(1);
    });

    it.each(cases)('%s', (_name, c, frame) => {
      expect(built(lib, c).parts.length, 'members').toBe(frame.members.length);
      frame.members.forEach((points, k) => {
        // Curves of no length draw nothing: what is not drawn yet of the shaft, which ManimGL
        // keeps collapsed on the end of what is.
        const drawn = (curve: number[]) =>
          Math.hypot(curve[6]! - curve[0]!, curve[7]! - curve[1]!) > 1e-9 ||
          Math.hypot(curve[2]! - curve[0]!, curve[3]! - curve[1]!) > 1e-9;
        const want = manimCurves({ points }, lib).filter(drawn);
        const have = ourCurves(lookOf(lib, c, k, frame.alpha)).filter(drawn);
        expect(have.length, `member ${k}: curves`).toBe(want.length);
        have.forEach((curve, n) =>
          curve.forEach((v, j) =>
            expect(v, `member ${k} curve ${n}[${j}]`).toBeCloseTo(want[n]![j]!, digits),
          ),
        );
      });
    });
  },
);
