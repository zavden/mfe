/* The affine and contour primitives the other geom modules build on. They live apart from
 * index.ts so that path.ts can use them without importing the barrel that re-exports it. */
import type { Box, Contour, Mat2D } from './types';

export const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];

/** m1 · m2 (apply m2 first, then m1). */
export function multiply(m1: Mat2D, m2: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Straight segment as a cubic, appended to `contour` (which must already have a start point). */
export function lineTo(contour: Contour, x: number, y: number): void {
  const x0 = contour[contour.length - 2]!;
  const y0 = contour[contour.length - 1]!;
  contour.push(
    x0 + (x - x0) / 3,
    y0 + (y - y0) / 3,
    x0 + (2 * (x - x0)) / 3,
    y0 + (2 * (y - y0)) / 3,
    x,
    y,
  );
}

/** Closed axis-aligned rectangle contour, traced as Manim's `Rectangle` is: from the (maxX, maxY)
 * corner through (minX, maxY) and (minX, minY) to (maxX, minY) (`Polygon(UR, UL, DL, DR)`). An
 * SVG `<rect>` (a TeX rule) becomes exactly that in both libraries, and where a contour starts
 * decides which points a morph pairs and where a traced outline begins. */
export function rectContour(b: Box): Contour {
  const c: Contour = [b.maxX, b.maxY];
  lineTo(c, b.minX, b.maxY);
  lineTo(c, b.minX, b.minY);
  lineTo(c, b.maxX, b.minY);
  lineTo(c, b.maxX, b.maxY);
  return c;
}
