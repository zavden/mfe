// @vitest-environment node
/* Shape objects fitted to real LaTeX glyphs (scene/shapes.ts + geom/shapes.ts) against the
 * shapes each library fitted (fixtures/manim/gen_decorations.py): a `SurroundingRectangle` with two
 * gaps, square and rounded; the circle around of the export's helper; an `Underline` with two
 * gaps; a `Cross` — over the whole formula, a slice and a lone glyph, as is or scaled and rotated.
 * The target is measured from the fixture's own glyph points, as the evaluator measures it
 * (`manimBoxes`); the fit must give Manim's centre and size, and the shape built for it every
 * point of every member, as the library stores it (`toPointPath`). */
import { describe, expect, it } from 'vitest';
import {
  shapeContours,
  toPointPath,
  transformContour,
  translate,
  type Contour,
  type PointPath,
} from '../../geom';
import type { ShapeKind, Target } from '../../model';
import { manimBoxes } from '../measure';
import { fitShape } from '../shapes';
import fxCe from './fixtures/manim-decorations-ce.json';
import fxGl from './fixtures/manim-decorations-gl.json';

interface Member {
  cls: string;
  points: [number, number][];
  fill: number[];
  stroke: number[];
  width: number;
}
interface Case {
  transform: string;
  slice: string;
  shape: ShapeKind;
  buff: number;
  radius: number;
  targetGlyphs: number[];
  members: Member[];
  center: [number, number];
  width: number;
  height: number;
}
interface Fixture {
  lib: Target;
  transforms: { name: string; glyphs: [number, number][][] }[];
  cases: Case[];
}

/** A glyph's point list as the library stores it, from the fixture. */
function pointPath(lib: Target, points: [number, number][]): PointPath {
  return { degree: lib === 'ce' ? 3 : 2, points: Float64Array.from(points.flat()) };
}

/** The largest difference between a point list as the library stores it and the fixture's. */
function worstOf(lib: Target, contour: Contour, want: [number, number][]): number {
  const got = toPointPath([contour], lib).points;
  expect(got.length, 'point count').toBe(want.length * 2);
  let worst = 0;
  want.forEach(([x, y], i) => {
    worst = Math.max(worst, Math.abs(got[2 * i]! - x), Math.abs(got[2 * i + 1]! - y));
  });
  return worst;
}

describe.each([fxCe, fxGl] as unknown as Fixture[])('Manim $lib shapes fitted to glyphs', (fx) => {
  // ManimGL keeps its points as float32, and scales a unit line up to the width.
  const tolerance = fx.lib === 'ce' ? 1e-9 : 5e-6;
  const targetPaths = new Map(
    fx.transforms.map((t) => [t.name, t.glyphs.map((g) => pointPath(fx.lib, g))]),
  );
  for (const c of fx.cases) {
    it(`${c.shape} (buff ${c.buff}, radius ${c.radius}) on ${c.slice} of ${c.transform}`, () => {
      const target = manimBoxes(
        c.targetGlyphs.map((g) => targetPaths.get(c.transform)![g]!),
        fx.lib,
      )!;
      const fit = fitShape(c.shape, target, c.buff)!;
      // The fixture keeps nine decimals (ManimCE) or ManimGL's float32.
      expect(fit.width).toBeCloseTo(c.width, fx.lib === 'ce' ? 8 : 5);
      expect(fit.height).toBeCloseTo(c.height, fx.lib === 'ce' ? 8 : 5);
      expect(fit.center[0]).toBeCloseTo(c.center[0], fx.lib === 'ce' ? 8 : 5);
      expect(fit.center[1]).toBeCloseTo(c.center[1], fx.lib === 'ce' ? 8 : 5);
      // The shape, built about the origin and moved to its centre, is Manim's member for member.
      const contours = shapeContours(fx.lib, c.shape, fit.width, fit.height, c.radius).map((k) =>
        transformContour(translate(fit.center[0], fit.center[1]), k),
      );
      expect(contours).toHaveLength(c.members.length);
      contours.forEach((contour, i) => {
        const want = c.members[i]!.points;
        if (fx.lib === 'gl' && c.shape === 'cross') {
          // ManimGL's Cross inserts twenty curves into each line (for its tapered stroke): the
          // same run, from the same corner to the same corner, with every point on it.
          expect(want).toHaveLength(43);
          const [x0, y0] = want[0]!;
          const [x1, y1] = want[42]!;
          expect(Math.hypot(contour[0]! - x0, contour[1]! - y0)).toBeLessThan(tolerance);
          expect(Math.hypot(contour[6]! - x1, contour[7]! - y1)).toBeLessThan(tolerance);
          for (const [x, y] of want) {
            expect(Math.abs((x - x0) * (y1 - y0) - (y - y0) * (x1 - x0))).toBeLessThan(1e-5);
          }
          return;
        }
        expect(worstOf(fx.lib, contour, want)).toBeLessThan(tolerance);
      });
    });
  }

  it('reads the default styles the export relies on', () => {
    const of = (shape: ShapeKind) => fx.cases.find((c) => c.shape === shape)!.members[0]!;
    expect([of('box').width, of('circle').width, of('underline').width, of('cross').width]).toEqual(
      [4, 4, 4, 6],
    );
    for (const shape of ['box', 'circle', 'underline', 'cross'] as const) {
      expect(of(shape).fill[3]).toBe(0);
      expect(of(shape).stroke[3]).toBe(1);
    }
  });
});
