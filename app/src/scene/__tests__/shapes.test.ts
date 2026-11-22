// @vitest-environment node
/* Manim's basic shapes (geom/shapes.ts) against the shapes each library built
 * (fixtures/manim/gen_shapes.py): circles and dots of several radii, moved or not; rectangles and
 * rounded rectangles, one with corners that meet; lines with and without a buff, one shorter than
 * twice its buff; arrows of every length, buff, stroke width and tip length. Every point every
 * member holds must be Manim's, as the library stores it (`toPointPath`), and the default styles
 * the fixture records are the ones `MANIM_SHAPE_STYLE` lists. */
import { describe, expect, it } from 'vitest';
import {
  arrowShape,
  circleContour,
  lineContour,
  MANIM_SHAPE_STYLE,
  rectangleContour,
  shapeContours,
  toPointPath,
  type Contour,
} from '../../geom';
import type { GlyphStyle, Target } from '../../model';
import shapesCe from './fixtures/manim-shapes-ce.json';
import shapesGl from './fixtures/manim-shapes-gl.json';

interface Member {
  cls: string;
  points: [number, number][];
  fill: number[];
  stroke: number[];
  width: number;
}
interface ShapeCase {
  name: string;
  kind: 'circle' | 'dot' | 'rect' | 'line' | 'arrow';
  params: Record<string, number | [number, number]>;
  members: Member[];
}
interface Fixture {
  lib: Target;
  cases: ShapeCase[];
}

/** The largest difference between a point list as the library stores it and the fixture's. */
function worstOf(lib: Target, contours: Contour[], want: [number, number][]): number {
  const got = toPointPath(contours, lib).points;
  expect(got.length, 'point count').toBe(want.length * 2);
  let worst = 0;
  want.forEach(([x, y], i) => {
    worst = Math.max(worst, Math.abs(got[2 * i]! - x), Math.abs(got[2 * i + 1]! - y));
  });
  return worst;
}

const styleOf = (m: Member): GlyphStyle => ({
  fillOpacity: m.fill[3]!,
  strokeWidth: m.width,
  strokeOpacity: m.stroke[3]!,
});

describe.each([shapesCe, shapesGl] as unknown as Fixture[])('Manim $lib shapes', (fx) => {
  // ManimGL keeps its points as float32 (seven significant digits of a coordinate of a few units).
  const tolerance = fx.lib === 'ce' ? 1e-9 : 2e-6;
  const n = (v: number | [number, number]) => v as number;
  const v = (p: number | [number, number]) => p as [number, number];

  for (const c of fx.cases) {
    it(c.name, () => {
      const { params, members } = c;
      if (c.kind === 'circle' || c.kind === 'dot') {
        const contour = circleContour(fx.lib, n(params.radius!), v(params.center!));
        expect(worstOf(fx.lib, [contour], members[0]!.points)).toBeLessThan(tolerance);
        expect(styleOf(members[0]!)).toEqual(MANIM_SHAPE_STYLE[c.kind]);
      } else if (c.kind === 'rect') {
        const contour = rectangleContour(
          fx.lib,
          n(params.width!),
          n(params.height!),
          [0, 0],
          n(params.radius!),
        );
        expect(worstOf(fx.lib, [contour], members[0]!.points)).toBeLessThan(tolerance);
        expect(styleOf(members[0]!)).toEqual(MANIM_SHAPE_STYLE.rect);
      } else if (c.kind === 'line') {
        const contour = lineContour(fx.lib, v(params.start!), v(params.end!), n(params.buff!));
        expect(worstOf(fx.lib, [contour], members[0]!.points)).toBeLessThan(tolerance);
        expect(styleOf(members[0]!)).toEqual(MANIM_SHAPE_STYLE.line);
      } else {
        const arrow = arrowShape(v(params.start!), v(params.end!), {
          buff: n(params.buff!),
          strokeWidth: n(params.strokeWidth!),
          tipLength: n(params.tipLength!),
        });
        const [shaft, tip] = members as [Member, Member];
        expect(worstOf(fx.lib, [arrow.shaft], shaft.points)).toBeLessThan(tolerance);
        expect(worstOf(fx.lib, [arrow.tip], tip.points)).toBeLessThan(tolerance);
        // The fixture keeps the values ManimGL got to seven decimals.
        expect(arrow.tipLength).toBeCloseTo(n(params.tip!), fx.lib === 'ce' ? 9 : 6);
        expect(arrow.strokeWidth).toBeCloseTo(n(params.shaftWidth!), 6);
        expect(styleOf(shaft)).toEqual({ ...MANIM_SHAPE_STYLE.arrow, strokeWidth: shaft.width });
        expect(styleOf(tip)).toEqual(MANIM_SHAPE_STYLE.tip);
      }
    });
  }
});

describe('shapes on their own', () => {
  it('a circle is eight cubics in ManimCE and sixteen raised quadratics in ManimGL', () => {
    expect((circleContour('ce', 1).length - 2) / 6).toBe(8);
    expect((circleContour('gl', 1).length - 2) / 6).toBe(16);
    expect(toPointPath([circleContour('gl', 1)], 'gl').points).toHaveLength(2 * 33);
  });

  it('a rounded rectangle has an arc and a run per corner; corners that meet leave no run', () => {
    expect((rectangleContour('ce', 4, 2, [0, 0], 0.5).length - 2) / 6).toBe(8);
    expect((rectangleContour('gl', 4, 2, [0, 0], 0.5).length - 2) / 6).toBe(12);
    const met = rectangleContour('ce', 3, 1, [0, 0], 0.5);
    // The runs on the short sides are cubics of no length (as Manim's `Line` of two equal points).
    // (The end of the upper-left arc and the three points of the run to the lower-left one.)
    met.slice(18, 26).forEach((v, i) => expect(v).toBeCloseTo(i % 2 === 0 ? -1.5 : 0, 12));
    // ManimCE keeps a corner's cut within half the shorter side; ManimGL does not.
    expect(rectangleContour('ce', 3, 1, [0, 0], 0.8)).toEqual(met);
    expect(rectangleContour('gl', 3, 1, [0, 0], 0.8)).not.toEqual(
      rectangleContour('gl', 3, 1, [0, 0], 0.5),
    );
  });

  it('a line shorter than twice its buff stays whole in ManimCE and collapses in ManimGL', () => {
    const near = (got: number[], want: number[]) =>
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 12));
    near(lineContour('ce', [0, 0], [0.3, 0], 0.25), [0, 0, 0.1, 0, 0.2, 0, 0.3, 0]);
    near(lineContour('gl', [0, 0], [0.3, 0], 0.25), [0.15, 0, 0.15, 0, 0.15, 0, 0.15, 0]);
  });

  it('a shape object is built at its fitted size about the origin: box, circle, underline, cross', () => {
    const [box] = shapeContours('ce', 'box', 2, 1);
    expect(box).toEqual(rectangleContour('ce', 2, 1));
    const [rounded] = shapeContours('gl', 'box', 2, 1, 0.3);
    expect(rounded).toEqual(rectangleContour('gl', 2, 1, [0, 0], 0.3));
    // No size yet: square corners, whatever the radius (ManimGL would not clamp the cut).
    expect(shapeContours('gl', 'box', 0, 0, 0.3)[0]).toEqual(rectangleContour('gl', 0, 0));
    expect(shapeContours('ce', 'circle', 3, 3)[0]).toEqual(circleContour('ce', 1.5));
    expect(shapeContours('ce', 'underline', 4, 0)).toEqual([lineContour('ce', [-2, 0], [2, 0])]);
    const cross = shapeContours('gl', 'cross', 2, 1);
    expect(cross).toEqual([
      lineContour('gl', [-1, 0.5], [1, -0.5]),
      lineContour('gl', [1, 0.5], [-1, -0.5]),
    ]);
    // A cross line is one of those lines: the falling one as the cross lays it, the rising one
    // from the lower left corner (the cross runs it the other way); rising when nothing is said.
    expect(shapeContours('gl', 'cross_line', 2, 1, 0, 'ul_dr')).toEqual([cross[0]]);
    const rising = shapeContours('gl', 'cross_line', 2, 1, 0, 'dl_ur');
    expect(rising).toEqual([lineContour('gl', [-1, -0.5], [1, 0.5])]);
    expect(rising[0]!.slice(0, 2)).toEqual(cross[1]!.slice(-2));
    expect(rising[0]!.slice(-2)).toEqual(cross[1]!.slice(0, 2));
    expect(shapeContours('ce', 'cross_line', 2, 1)).toEqual(
      shapeContours('ce', 'cross_line', 2, 1, 0, 'dl_ur'),
    );
  });

  it('an arrow caps its tip and stroke width by its length', () => {
    const long = arrowShape([-1, 0], [1, 0]);
    expect(long.tipLength).toBe(0.35);
    expect(long.strokeWidth).toBe(6);
    expect(long.shaft).toEqual([-0.75, 0, -0.75 + 1.15 / 3, 0, -0.75 + 2.3 / 3, 0, 0.4, 0]);
    const short = arrowShape([0, 0], [0.3, 0]);
    expect(short.tipLength).toBeCloseTo(0.075, 12);
    expect(short.strokeWidth).toBeCloseTo(1.5, 12);
  });
});
