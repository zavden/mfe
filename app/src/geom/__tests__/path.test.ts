// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  contoursBox,
  contoursSignedArea,
  ellipseContour,
  exactContoursBox,
  parseSvgPath,
  parseSvgTransform,
  applyToPoint,
  rectContour,
  reverseContour,
  type Contour,
} from '../index';

/** Point on segment k (0-based) of a contour at parameter t. */
function pointAt(c: Contour, k: number, t: number): [number, number] {
  const i = 2 + 6 * k;
  const p = [c[i - 2]!, c[i - 1]!, c[i]!, c[i + 1]!, c[i + 2]!, c[i + 3]!, c[i + 4]!, c[i + 5]!];
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    w[0]! * p[0]! + w[1]! * p[2]! + w[2]! * p[4]! + w[3]! * p[6]!,
    w[0]! * p[1]! + w[1]! * p[3]! + w[2]! * p[5]! + w[3]! * p[7]!,
  ];
}

describe('parseSvgPath', () => {
  it('turns lines into cubics with control points at 1/3 and 2/3', () => {
    expect(parseSvgPath('M0 0L3 6')).toEqual([[0, 0, 1, 2, 2, 4, 3, 6]]);
  });

  it('handles H, V, relative commands, implicit repeats and Z', () => {
    const [c] = parseSvgPath('m1 1 2 0 v2 h-2z');
    expect(c).toBeDefined();
    const anchors = [];
    for (let i = 0; i < c!.length; i += 6) anchors.push([c![i], c![i + 1]]);
    expect(anchors).toEqual([
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
      [1, 1],
    ]);
  });

  it('does not add a closing segment when the path already ends at its start', () => {
    const [c] = parseSvgPath('M0 0L1 0L0 0Z');
    expect(c).toHaveLength(2 + 12);
  });

  it('parses compact dvisvgm numbers', () => {
    const [c] = parseSvgPath('M3.875467 8.518057L.727273-.139477L1.5.5Z');
    expect(c!.slice(0, 2)).toEqual([3.875467, 8.518057]);
    expect(c!.slice(6, 8)).toEqual([0.727273, -0.139477]);
    expect(c!.slice(12, 14)).toEqual([1.5, 0.5]);
  });

  it('reflects control points for S and T', () => {
    const [s] = parseSvgPath('M0 0C0 1 1 1 1 0S2 -1 2 0');
    expect(s!.slice(8, 10)).toEqual([1, -1]); // reflection of (1, 1) about (1, 0)
    const [t] = parseSvgPath('M0 0Q1 1 2 0T4 0');
    // Second quadratic control point is (3, -1); elevated: start + 2/3 (q - start).
    expect(t![8]).toBeCloseTo(2 + (2 / 3) * 1, 12);
    expect(t![9]).toBeCloseTo((2 / 3) * -1, 12);
  });

  it('elevates quadratics exactly', () => {
    const [c] = parseSvgPath('M0 0Q1 2 2 0');
    for (const t of [0.25, 0.5, 0.8]) {
      const u = 1 - t;
      const expected = [2 * u * t * 1 + t * t * 2, 2 * u * t * 2];
      const got = pointAt(c!, 0, t);
      expect(got[0]).toBeCloseTo(expected[0]!, 12);
      expect(got[1]).toBeCloseTo(expected[1]!, 12);
    }
  });

  it('approximates arcs closely and handles packed flags', () => {
    // Half circle of radius 10 centred at (10, 0), from (0,0) to (20,0) through (10,-10).
    const [c] = parseSvgPath('M0 0a10 10 0 0120 0');
    expect(c).toBeDefined();
    const segments = (c!.length - 2) / 6;
    expect(segments).toBe(2);
    for (let k = 0; k < segments; k++) {
      for (const t of [0, 0.3, 0.5, 0.9]) {
        const [x, y] = pointAt(c!, k, t);
        expect(Math.hypot(x - 10, y)).toBeCloseTo(10, 2);
      }
    }
    expect(pointAt(c!, 0, 1)[1]).toBeCloseTo(-10, 9);
    expect(c!.slice(-2)).toEqual([20, 0]);
  });

  it('scales up radii that are too small and treats zero radii as lines', () => {
    const [c] = parseSvgPath('M0 0A1 1 0 0 1 4 0');
    expect(c!.slice(-2)).toEqual([4, 0]);
    expect(Math.min(...c!.filter((_, i) => i % 2 === 1))).toBeLessThan(-1.9);
    expect(parseSvgPath('M0 0A0 5 0 0 1 3 0')).toEqual([[0, 0, 1, 0, 2, 0, 3, 0]]);
  });

  it('starts a new contour after Z and after M; drops lone moves', () => {
    expect(parseSvgPath('M0 0L1 0ZL0 1').length).toBe(2);
    expect(parseSvgPath('M5 5')).toEqual([]);
    expect(parseSvgPath('M5 5Z')).toEqual([]);
    expect(parseSvgPath('')).toEqual([]);
  });

  it('keeps what precedes malformed data', () => {
    expect(parseSvgPath('M0 0L1 1L2 x')).toEqual([[0, 0, 1 / 3, 1 / 3, 2 / 3, 2 / 3, 1, 1]]);
  });
});

describe('parseSvgTransform', () => {
  it('composes lists left to right like SVG', () => {
    const m = parseSvgTransform('translate(10, 20) scale(2)');
    expect(applyToPoint(m, [1, 1])).toEqual([12, 22]);
    const n = parseSvgTransform('translate(0 -0.5) matrix(1 0 0 1 3 4)');
    expect(applyToPoint(n, [0, 0])).toEqual([3, 3.5]);
  });

  it('rotates about a point', () => {
    const m = parseSvgTransform('rotate(90 1 1)');
    const [x, y] = applyToPoint(m, [2, 1]);
    expect(x).toBeCloseTo(1, 12);
    expect(y).toBeCloseTo(2, 12);
  });

  it('returns the identity for empty or invalid input', () => {
    expect(parseSvgTransform(null)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseSvgTransform('frobnicate(2)')).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('exactContoursBox', () => {
  it('uses curve extrema, not control points', () => {
    const contours = parseSvgPath('M0 0C0 4 4 4 4 0Z');
    expect(contoursBox(contours).maxY).toBe(4);
    const exact = exactContoursBox(contours);
    expect(exact.maxY).toBeCloseTo(3, 12);
    expect(exact.minX).toBe(0);
    expect(exact.maxX).toBe(4);
  });

  it('matches the radius of an ellipse', () => {
    const box = exactContoursBox([ellipseContour(1, 2, 3, 4)]);
    expect(box.minX).toBeCloseTo(-2, 12);
    expect(box.maxY).toBeCloseTo(6, 12);
  });
});

describe('contour orientation', () => {
  it('measures the signed area of the anchors, holes subtracting', () => {
    // rectContour runs (maxX, maxY) → (minX, maxY) → …: counter-clockwise in a y-up frame (and
    // clockwise once the y axis is flipped, as importing an SVG does).
    const outer = rectContour({ minX: 0, minY: 0, maxX: 4, maxY: 2 });
    expect(contoursSignedArea([outer])).toBeCloseTo(8, 9);
    expect(contoursSignedArea([reverseContour(outer)])).toBeCloseTo(-8, 9);
    const hole = reverseContour(rectContour({ minX: 1, minY: 0.5, maxX: 2, maxY: 1.5 }));
    expect(contoursSignedArea([outer, hole])).toBeCloseTo(7, 9);
    expect(contoursSignedArea([[1, 1]])).toBe(0);
  });

  it("reverses a contour from its end, swapping each segment's handles", () => {
    const c: Contour = [0, 0, 1, 0, 2, 1, 3, 1, 4, 2, 5, 2, 6, 3];
    expect(reverseContour(c)).toEqual([6, 3, 5, 2, 4, 2, 3, 1, 2, 1, 1, 0, 0, 0]);
    expect(reverseContour(reverseContour(c))).toEqual(c);
    // A closed contour keeps its start.
    const square = rectContour({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(reverseContour(square).slice(0, 2)).toEqual(square.slice(0, 2));
    expect(reverseContour(square).slice(6, 8)).toEqual(square.slice(18, 20));
  });
});
