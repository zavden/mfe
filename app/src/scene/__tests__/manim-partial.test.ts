// @vitest-environment node
/* Partial paths and colour interpolation against values sampled from the real libraries
 * (fixtures/manim/gen_partial.py, gen_partial_gl.py, gen_color_gl.py). */
import { describe, expect, it } from 'vitest';
import {
  curveCount,
  integerInterpolate,
  lerpColor,
  parseColor,
  partialContours,
  partialQuadraticPoints,
  pointsToContours,
  toPointPath,
  type Contour,
} from '../../geom';
import { TEXT_STYLE } from '../../model';
import { createLook, type LookInput } from '../anim/looks';
import { ourCurves } from './manimFixture';
import colorsGl from './fixtures/manim-color-gl.json';
import partialCe from './fixtures/manim-partial-ce.json';
import partialGl from './fixtures/manim-partial-gl.json';

/** The fixture stores curves as [p0, h1, h2, p3] per curve; contours chain them. */
function contourFrom(curves: number[][]): Contour {
  const c: Contour = [curves[0]![0]!, curves[0]![1]!];
  for (const k of curves) c.push(...k.slice(2));
  return c;
}

describe('partialContours (ManimCE pointwise_become_partial)', () => {
  it('integerInterpolate matches Manim', () => {
    expect(integerInterpolate(0, 10, 0.46)[0]).toBe(4);
    expect(integerInterpolate(0, 10, 0.46)[1]).toBeCloseTo(0.6, 12);
    expect(integerInterpolate(0, 10, 1)).toEqual([9, 1]);
    expect(integerInterpolate(0, 10, 0)).toEqual([0, 0]);
    expect(integerInterpolate(0, 2, 0.5)).toEqual([1, 0]);
  });

  for (const [i, sample] of partialCe.partial.entries()) {
    it(`matches Manim for sample ${i} (a=${sample.a}, b=${sample.b})`, () => {
      const contours = sample.contours.map(contourFrom);
      const got = ourCurves(partialContours(contours, sample.a, sample.b));
      expect(got).toHaveLength(sample.curves.length);
      got.forEach((curve, k) => {
        curve.forEach((v, j) => expect(v).toBeCloseTo(sample.curves[k]![j]!, 6));
      });
    });
  }

  it('splits by curve count, not arc length, and keeps subpaths apart', () => {
    // A long line followed by three tiny ones: the first curve takes a quarter of the parameter.
    const c: Contour = [0, 0, 3, 0, 6, 0, 10, 0];
    for (let k = 0; k < 3; k++) c.push(10, 0.1 * (k + 1), 10, 0.1 * (k + 1), 10, 0.1 * (k + 1));
    expect(curveCount([c])).toBe(4);
    const half = partialContours([c], 0, 0.25);
    expect(ourCurves(half)[0]![6]).toBeCloseTo(10, 9); // the long curve is already complete
    const two = partialContours([c, [1, 1, 1, 1, 1, 1, 1, 1]], 0.6, 0.9);
    expect(two).toHaveLength(2); // spans both subpaths
  });

  it('returns the input unchanged for the whole path and nothing for an empty one', () => {
    const c: Contour = [0, 0, 1, 0, 2, 0, 3, 0];
    expect(partialContours([c], 0, 1)[0]).toBe(c);
    expect(partialContours([], 0, 0.5)).toEqual([]);
  });
});

describe('partialQuadraticPoints (ManimGL pointwise_become_partial)', () => {
  for (const [i, sample] of partialGl.partial.entries()) {
    it(`matches Manim for sample ${i} (a=${sample.a}, b=${sample.b})`, () => {
      const points = Float64Array.from(sample.points.flat());
      expect((points.length / 2 - 1) / 2).toBe(sample.curves);
      const got = Array.from(partialQuadraticPoints(points, sample.a, sample.b));
      const want = sample.portion.flat();
      expect(got).toHaveLength(want.length);
      // ManimGL keeps its points in float32: a few units in the seventh digit.
      got.forEach((v, k) => expect(v).toBeCloseTo(want[k]!, 5));
    });
  }

  it('returns the input for the whole path and nothing for an empty one', () => {
    const points = Float64Array.from([0, 0, 1, 0, 2, 0]);
    expect(partialQuadraticPoints(points, 0, 1)).toBe(points);
    expect(partialQuadraticPoints(new Float64Array([0, 0]), 0, 0.5)).toHaveLength(0);
  });
});

describe('partial glyphs per target', () => {
  // A square: three straight sides, then a curved one back to the start. ManimCE keeps four
  // cubics; ManimGL stores one quadratic per line and two for the curve, five in all, so the
  // same fraction of the path reaches different points in the two libraries.
  const square: Contour = [0, 0, 1 / 3, 0, 2 / 3, 0, 1, 0, 1, 1 / 3, 1, 2 / 3, 1, 1];
  square.push(2 / 3, 1, 1 / 3, 1, 0, 1, -0.3, 0.9, 0.3, 0.1, 0, 0);
  const input = (target: 'ce' | 'gl'): LookInput => ({
    local: [square],
    matrix: [1, 0, 0, 1, 0, 0],
    color: '#FFFFFF',
    opacity: 1,
    style: TEXT_STYLE,
    groupColor: '#FFFFFF',
    center: [0.5, 0.5],
    target,
    shift: [0, 0],
    scale: 1,
  });
  const endOf = (look: ReturnType<typeof createLook>): [number, number] => {
    const c = look!.contours[look!.contours.length - 1]!;
    return [c[c.length - 2]!, c[c.length - 1]!];
  };

  it('cuts the outline by cubic curves for ManimCE and by ManimGL quadratics for ManimGL', () => {
    expect(curveCount([square])).toBe(4);
    expect((toPointPath([square], 'gl').points.length / 2 - 1) / 2).toBe(5);
    // Three fifths of the way: GL has finished the three lines; CE is halfway up the third side.
    const ce = endOf(createLook(input('ce'), 0.6));
    expect(ce[0]).toBeCloseTo(0.6, 9);
    expect(ce[1]).toBeCloseTo(1, 9);
    const gl = endOf(createLook(input('gl'), 0.6));
    expect(gl[0]).toBeCloseTo(0, 9);
    expect(gl[1]).toBeCloseTo(1, 9);
    // Four fifths of the way in GL is the end of the first of the two quadratics of the curved
    // side: the point where GL's approximation splits the cubic (its inflection, here (0, ½)).
    const glMid = endOf(createLook(input('gl'), 0.8));
    const path = toPointPath([square], 'gl');
    const quads = pointsToContours(path, path.points);
    const c = quads[0]!;
    expect(glMid[0]).toBeCloseTo(c[c.length - 8]!, 9);
    expect(glMid[1]).toBeCloseTo(c[c.length - 7]!, 9);
  });

  it('shows the whole glyph at progress 1 in both libraries', () => {
    for (const target of ['ce', 'gl'] as const) {
      expect(createLook(input(target), 1)!.contours).toEqual([square]);
    }
  });
});

describe('colour interpolation', () => {
  it('is linear in RGB, like Transform in ManimCE and ManimGL', () => {
    const gl = colorsGl as { from: string; to: string; alpha: number; gl: number[] }[];
    for (const [i, sample] of partialCe.colors.entries()) {
      const mixed = parseColor(lerpColor(sample.from, sample.to, sample.alpha));
      // The fixtures blend opacity 0.8 → 1 as well; only the RGB part is compared.
      sample.ce.slice(0, 3).forEach((v, k) => expect(mixed[k]!).toBeCloseTo(v, 2));
      gl[i]!.gl.slice(0, 3).forEach((v, k) => expect(mixed[k]!).toBeCloseTo(v, 2));
    }
  });

  it('is not the squared-space interpolate_color of ManimGL', () => {
    // black → white at ½: linear gives #808080, squared space gives #B4B4B4.
    expect(lerpColor('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});
