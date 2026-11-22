/* Small geometry helpers. Agents may add functions here; existing signatures are frozen. */
import type { Box, Contour, Mat2D, Vec2 } from './types';

export { IDENTITY, lineTo, multiply, rectContour } from './primitives';

export type * from './types';

export function translate(x: number, y: number): Mat2D {
  return [1, 0, 0, 1, x, y];
}

export function scale(sx: number, sy: number = sx): Mat2D {
  return [sx, 0, 0, sy, 0, 0];
}

/** Counter-clockwise rotation in degrees (y up). */
export function rotate(degrees: number): Mat2D {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}

/** Inverse of an affine matrix (its linear part must be invertible). */
export function invert(m: Mat2D): Mat2D {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function applyToPoint(m: Mat2D, p: Vec2): Vec2 {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

export function transformContour(m: Mat2D, contour: Contour): Contour {
  const out = new Array<number>(contour.length);
  for (let i = 0; i < contour.length; i += 2) {
    const x = contour[i]!;
    const y = contour[i + 1]!;
    out[i] = m[0] * x + m[2] * y + m[4];
    out[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  return out;
}

/** The axis-aligned box of `box`'s corners after `m` (a turned box is enclosed). */
export function transformBox(m: Mat2D, box: Box): Box {
  const corners: Vec2[] = [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.minX, box.maxY],
    [box.maxX, box.maxY],
  ].map((p) => applyToPoint(m, p as Vec2));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const EMPTY_BOX: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** Display box over cubic points, control handles included. Native Manim size and critical
 * boxes use target-specific point lists; scene/measure.ts owns that separate contract. */
export function contoursBox(contours: readonly Contour[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of contours) {
    for (let i = 0; i < c.length; i += 2) {
      const x = c[i]!;
      const y = c[i + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? { ...EMPTY_BOX } : { minX, minY, maxX, maxY };
}

export function unionBox(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { ...EMPTY_BOX };
  return boxes.reduce((acc, b) => ({
    minX: Math.min(acc.minX, b.minX),
    minY: Math.min(acc.minY, b.minY),
    maxX: Math.max(acc.maxX, b.maxX),
    maxY: Math.max(acc.maxY, b.maxY),
  }));
}

export function boxCenter(b: Box): Vec2 {
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}

export function boxSize(b: Box): Vec2 {
  return [b.maxX - b.minX, b.maxY - b.minY];
}

/** The same contour traced the other way round: it starts where it ended (the same point, for
 * a closed contour) and runs its segments backwards. */
export function reverseContour(contour: Contour): Contour {
  const n = contour.length;
  if (n < 2) return [...contour];
  const out: Contour = [contour[n - 2]!, contour[n - 1]!];
  for (let i = n - 8; i >= 0; i -= 6) {
    // Segment i: handles at i + 2 … i + 5, end at i + 6; reversed, its handles swap.
    out.push(
      contour[i + 4]!,
      contour[i + 5]!,
      contour[i + 2]!,
      contour[i + 3]!,
      contour[i]!,
      contour[i + 1]!,
    );
  }
  return out;
}

/** Signed area of the polygon of the anchors of every contour, summed (shoelace: positive when
 * they run counter-clockwise in a y-up frame). ManimGL's `get_area_vector` for a VMobject. */
export function contoursSignedArea(contours: readonly Contour[]): number {
  let twice = 0;
  for (const c of contours) {
    const count = Math.floor((c.length - 2) / 6) + 1;
    for (let k = 0; k < count; k++) {
      const i = 6 * k;
      const j = 6 * ((k + 1) % count);
      twice += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
    }
  }
  return twice / 2;
}

/** SVG path data (absolute M/C/Z), e.g. for debugging or SVG export. Contours whose last
 * point equals the first are closed with Z. */
export function contoursToSvgPath(contours: readonly Contour[], digits = 4): string {
  const f = (n: number) => +n.toFixed(digits);
  const parts: string[] = [];
  for (const c of contours) {
    if (c.length < 2) continue;
    parts.push(`M${f(c[0]!)} ${f(c[1]!)}`);
    for (let i = 2; i + 5 < c.length + 0; i += 6) {
      parts.push(
        `C${f(c[i]!)} ${f(c[i + 1]!)} ${f(c[i + 2]!)} ${f(c[i + 3]!)} ${f(c[i + 4]!)} ${f(c[i + 5]!)}`,
      );
    }
    const closed = c.length > 2 && c[0] === c[c.length - 2] && c[1] === c[c.length - 1];
    if (closed) parts.push('Z');
  }
  return parts.join('');
}

export { ellipseContour, exactContoursBox, parseSvgPath, parseSvgTransform } from './path';
export {
  braceShape,
  braceTip,
  braceTipIndex,
  CE_BRACE_MIN_WIDTH,
  ceBraceShape,
  GL_BRACE_PIECES,
  glBraceShape,
  type BraceTarget,
} from './brace';
export {
  ARROW_BUFF,
  ARROW_STROKE_WIDTH,
  ARROW_TIP_LENGTH,
  arrowShape,
  circleContour,
  DEFAULT_STROKE_WIDTH,
  DOT_RADIUS,
  lineContour,
  MANIM_SHAPE_STYLE,
  rectangleContour,
  shapeContours,
  type ArrowOptions,
  type ArrowShape,
  type ShapeTarget,
} from './shapes';
export {
  arcDrawn,
  arcUndrawn,
  arrowValues,
  buildLine,
  dashSpans,
  lineParts,
  similarityOnto,
  splineStretches,
  traceAt,
  type ArrowTrace,
  type LineBuild,
  type LineOptions,
  type LinePart,
} from './lines';

export { lerpColor, parseColor, sameColor, type Rgb } from './color';
export {
  ARC_SAMPLES,
  STRAIGHT_PATH_THRESHOLD,
  ARC_SPLINE_LIMIT,
  arcLengths,
  arcSpline,
  chordFrame,
  cubicAt,
  equalSplines,
  isStraightSpline,
  nearestPoint,
  pathShift,
  placeAtFraction,
  pointAtFraction,
  pointAtPlace,
  splineSegments,
  splitCubic,
  splitSpline,
  straightSpline,
  type ArcLengths,
  type Cubic,
  type PathSpline,
  type SplineNode,
  type SplinePlace,
} from './spline';
export { curveCount, integerInterpolate, partialContours, partialQuadraticPoints } from './partial';

export {
  alignPointPaths,
  interpolateAlongPath,
  interpolatePoints,
  pathPair,
  pointPathBox,
  pointsCenter,
  pointsToContours,
  toPointPath,
  transformPointPath,
  type MorphTarget,
  type PathPair,
  type PointPath,
} from './morph';
