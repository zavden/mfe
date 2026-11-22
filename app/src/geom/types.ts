/* Geometry primitives shared by engine/, scene/, render/ and export/. Scene units, y up. */
import type { Vec2 } from '../model';

export type { Vec2 };

/** Axis-aligned bounding box. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Affine matrix in canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat2D = [a: number, b: number, c: number, d: number, e: number, f: number];

/** One subpath of cubic Béziers: [x0, y0, c1x, c1y, c2x, c2y, x1, y1, …], length 2 + 6k.
 * Straight segments are cubics with control points at 1/3 and 2/3. A closed subpath ends on
 * its start point. */
export type Contour = number[];
