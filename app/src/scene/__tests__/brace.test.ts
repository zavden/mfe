// @vitest-environment node
/* Manim's braces (geom/brace.ts) against the braces each library built on real LaTeX glyphs
 * (fixtures/manim/gen_brace.py): the whole formula, a slice and a lone glyph, as is or scaled and
 * rotated, on the four sides and at an angle, with two gaps and (ManimCE) three sharpnesses. The
 * target is measured here as `scene/attach.ts` measures it — its point lists turned to the frame
 * where the brace points down, boxed by the library's rule — and the shape placed as Manim places
 * it; every point of every piece must then be Manim's, and so must what Manim reads from the brace
 * (centre, corner, tip, direction, size). */
import { describe, expect, it } from 'vitest';
import {
  braceShape,
  braceTip,
  GL_BRACE_PIECES,
  multiply,
  rotate,
  toPointPath,
  transformContour,
  transformPointPath,
  translate,
  type Contour,
  type Mat2D,
} from '../../geom';
import type { Target } from '../../model';
import { criticalPoint, manimBoxes } from '../measure';
import { contoursOf, type Pt } from './manimFixture';
import braceCe from './fixtures/manim-brace-ce.json';
import braceGl from './fixtures/manim-brace-gl.json';

interface BraceCase {
  transform: string;
  slice: string;
  direction: string;
  degrees: number;
  buff: number;
  sharpness: number;
  targetGlyphs: number[];
  pieces: Pt[][];
  center: Pt;
  ul: Pt;
  tip: Pt;
  dir: Pt;
  width: number;
  height: number;
}
interface Fixture {
  lib: Target;
  transforms: { name: string; glyphs: Pt[][] }[];
  cases: BraceCase[];
  natural: { pieces: Pt[][]; width: number; height: number; h0?: number };
}

/** The largest difference between two flat point lists of the same length. */
function worstOf(got: ArrayLike<number>, want: readonly number[]): number {
  expect(got.length).toBe(want.length);
  let worst = 0;
  for (let i = 0; i < want.length; i++) worst = Math.max(worst, Math.abs(got[i]! - want[i]!));
  return worst;
}

/** Where Manim puts the brace: `shape` moved by the target's lower-left corner and `buff` down in
 * the frame where the brace points down, then turned to its direction about the origin. */
function placement(left: Pt, buff: number, degrees: number): Mat2D {
  return multiply(rotate(degrees), translate(left[0], left[1] - buff));
}

describe.each([braceCe, braceGl] as unknown as Fixture[])('Manim $lib braces', (fx) => {
  const lib = fx.lib;
  // ManimCE's points are doubles (the fixture keeps nine decimals); ManimGL stores float32.
  const tolerance = lib === 'ce' ? 5e-9 : 2e-6;
  const targetPaths = new Map(
    fx.transforms.map((t) => [t.name, t.glyphs.map((g) => toPointPath(contoursOf(g, lib), lib))]),
  );

  it.each(fx.cases)('$transform · $slice · $direction · buff $buff · sharpness $sharpness', (c) => {
    const frame = rotate(-c.degrees);
    const paths = c.targetGlyphs.map((g) =>
      transformPointPath(frame, targetPaths.get(c.transform)![g]!),
    );
    const target = manimBoxes(paths, lib)!;
    const width = target.critical.maxX - target.critical.minX;
    const left: Pt = [target.critical.minX, target.critical.minY];
    const shape = braceShape(lib, width, c.sharpness);
    const m = placement(left, c.buff, c.degrees);
    const placed = shape.map((piece) => transformContour(m, piece));

    // Every point of every piece.
    expect(placed.length).toBe(c.pieces.length);
    let worst = 0;
    placed.forEach((piece, i) => {
      worst = Math.max(worst, worstOf(toPointPath([piece], lib).points, c.pieces[i]!.flat()));
    });
    expect(worst).toBeLessThan(tolerance);

    // What Manim reads from the brace.
    const boxes = manimBoxes(
      placed.map((piece) => toPointPath([piece], lib)),
      lib,
    )!;
    const center = criticalPoint(boxes, [0, 0]);
    expect(center[0]).toBeCloseTo(c.center[0], 6);
    expect(center[1]).toBeCloseTo(c.center[1], 6);
    expect(boxes.critical.minX).toBeCloseTo(c.ul[0], 6);
    expect(boxes.critical.maxY).toBeCloseTo(c.ul[1], 6);
    expect(boxes.size.maxX - boxes.size.minX).toBeCloseTo(c.width, 6);
    expect(boxes.size.maxY - boxes.size.minY).toBeCloseTo(c.height, 6);
    const tip = braceTip(lib, shape, m);
    expect(tip[0]).toBeCloseTo(c.tip[0], 6);
    expect(tip[1]).toBeCloseTo(c.tip[1], 6);
    const length = Math.hypot(tip[0] - center[0], tip[1] - center[1]);
    expect((tip[0] - center[0]) / length).toBeCloseTo(c.dir[0], 6);
    expect((tip[1] - center[1]) / length).toBeCloseTo(c.dir[1], 6);
  });

  it('the natural brace is the fixture one', () => {
    if (lib === 'gl') {
      // The constant is the fixture's natural brace; the shape of its own width is it, moved so
      // that its corner is at the origin.
      expect(GL_BRACE_PIECES.map((p) => p.length / 2)).toEqual(
        fx.natural.pieces.map((p) => p.length),
      );
      const shape = braceShape('gl', fx.natural.width, 2);
      const all = fx.natural.pieces.flat();
      const minX = Math.min(...all.map((p) => p[0]));
      const maxY = Math.max(...all.map((p) => p[1]));
      const m = translate(minX, maxY);
      let worst = 0;
      shape.forEach((piece, i) => {
        const got = toPointPath([transformContour(m, piece)], 'gl').points;
        worst = Math.max(worst, worstOf(got, fx.natural.pieces[i]!.flat()));
      });
      expect(worst).toBeLessThan(1e-6);
    } else {
      // `Brace(Line(ORIGIN, RIGHT), DOWN, buff=0)`: a 1-unit brace whose corner is at the origin.
      const shape: Contour[] = braceShape('ce', 1, 2);
      expect(shape).toHaveLength(1);
      expect((shape[0]!.length - 2) / 6).toBe(25);
      const worst = worstOf(toPointPath(shape, 'ce').points, fx.natural.pieces[0]!.flat());
      expect(worst).toBeLessThan(1e-11);
      expect(fx.natural.width).toBe(1);
    }
  });
});
