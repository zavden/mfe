/* Helpers of the tests that compare the evaluator with what Manim drew (fixtures/manim-*.json,
 * written by the generators in fixtures/manim/). */
import { expect } from 'vitest';
import { contoursBox, lineTo, parseColor, unionBox, type Contour } from '../../geom';
import type { FormulaRender, Glyph } from '../../engine';
import type { Target } from '../../model';

/** A closed polygon as one cubic contour. */
export function polygonContour(corners: [number, number][]): Contour {
  const c: Contour = [corners[0]![0], corners[0]![1]];
  for (const p of corners.slice(1)) lineTo(c, p[0], p[1]);
  lineTo(c, corners[0]![0], corners[0]![1]);
  return c;
}

/** Fresh polygon geometry for the native animation fixtures; each case owns its render. */
export function polygonRender(fixture: {
  lib: Target;
  polygons: [number, number][][];
}): FormulaRender {
  const glyphs: Glyph[] = fixture.polygons.map((corners, index) => {
    const contours = [polygonContour(corners)];
    return { index, label: String(index), kind: 'char', contours, bbox: contoursBox(contours) };
  });
  return {
    key: 'fixture',
    backend: 'mathjax',
    exact: false,
    target: fixture.lib,
    fontSize: 48,
    glyphs,
    bbox: unionBox(glyphs.map((g) => g.bbox)),
    warnings: [],
  };
}

/** One cubic by its two anchors: [x0, y0, x1, y1]. */
export type Curve = [number, number, number, number];

/** The anchors of every cubic of `contours`. */
export function anchorsOf(contours: readonly Contour[]): Curve[] {
  const out: Curve[] = [];
  for (const c of contours) {
    for (let i = 0; i + 8 <= c.length; i += 6) out.push([c[i]!, c[i + 1]!, c[i + 6]!, c[i + 7]!]);
  }
  return out;
}

/** A cubic whose anchors coincide (Manim pads paths with them). */
export const isDegenerate = (c: Curve) => Math.abs(c[0] - c[2]) + Math.abs(c[1] - c[3]) < 1e-6;

/** `actual` (a CSS colour) matches Manim's rgb[a] to 2 decimals. */
export function compareColor(actual: string, expected: number[], message: string) {
  const got = parseColor(actual);
  expected.slice(0, 3).forEach((v, k) => expect(got[k]!, `${message} rgb[${k}]`).toBeCloseTo(v, 2));
}

export type Pt = [number, number];

const near = (a: Pt, b: Pt) =>
  Math.abs(a[0] - b[0]) <= 1e-6 + 1e-5 * Math.abs(b[0]) &&
  Math.abs(a[1] - b[1]) <= 1e-6 + 1e-5 * Math.abs(b[1]);

/** Contours (cubic, shared anchors) of a glyph given as Manim's point list: four points per cubic
 * in ManimCE, shared-anchor quadratics in ManimGL (raised to cubics). */
export function contoursOf(points: Pt[], lib: Target): Contour[] {
  const out: Contour[] = [];
  if (lib === 'ce') {
    let current: Contour | null = null;
    for (let i = 0; i + 3 < points.length; i += 4) {
      const [p0, c1, c2, p3] = [points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!];
      if (!current || !near(points[i - 1]!, p0)) {
        current = [p0[0], p0[1]];
        out.push(current);
      }
      current.push(...c1, ...c2, ...p3);
    }
    return out;
  }
  let current: Contour | null = null;
  for (let i = 0; i + 2 < points.length; i += 2) {
    const [p0, q, p1] = [points[i]!, points[i + 1]!, points[i + 2]!];
    // A curve whose handle sits on its start and whose end is elsewhere (by more than 1e-4) is the
    // jump to the next subpath (GL's `is_end`); a curve that is a point is an ordinary one.
    if (
      p0[0] === q[0] &&
      p0[1] === q[1] &&
      (Math.abs(q[0] - p1[0]) > 1e-4 || Math.abs(q[1] - p1[1]) > 1e-4)
    ) {
      current = null;
      continue;
    }
    if (!current) {
      current = [p0[0], p0[1]];
      out.push(current);
    }
    current.push(
      p0[0] + (2 / 3) * (q[0] - p0[0]),
      p0[1] + (2 / 3) * (q[1] - p0[1]),
      p1[0] + (2 / 3) * (q[0] - p1[0]),
      p1[1] + (2 / 3) * (q[1] - p1[1]),
      p1[0],
      p1[1],
    );
  }
  return out;
}

/** The visible curves of a Manim piece as cubic control polygons (GL's quadratics elevated, the
 * null curves that mark GL subpath ends dropped). */
export function manimCurves(piece: { points: Pt[] }, lib: Target): number[][] {
  const p = piece.points;
  const out: number[][] = [];
  if (lib === 'ce') {
    for (let i = 0; i + 3 < p.length; i += 4)
      out.push([...p[i]!, ...p[i + 1]!, ...p[i + 2]!, ...p[i + 3]!]);
    return out;
  }
  for (let i = 0; i + 2 < p.length; i += 2) {
    const [x0, y0] = p[i]!;
    const [qx, qy] = p[i + 1]!;
    const [x1, y1] = p[i + 2]!;
    // The jump to the next subpath (GL's `is_end`): the handle exactly on the start, the end elsewhere.
    if (qx === x0 && qy === y0 && (Math.abs(qx - x1) > 1e-4 || Math.abs(qy - y1) > 1e-4)) continue;
    out.push([
      x0,
      y0,
      x0 + (2 / 3) * (qx - x0),
      y0 + (2 / 3) * (qy - y0),
      x1 + (2 / 3) * (qx - x1),
      y1 + (2 / 3) * (qy - y1),
      x1,
      y1,
    ]);
  }
  return out;
}

/** Our curves as 8-number groups [p0, h1, h2, p3], contour after contour. */
export function ourCurves(contours: readonly Contour[]): number[][] {
  const out: number[][] = [];
  for (const c of contours) {
    for (let i = 0; i + 8 <= c.length; i += 6) out.push(c.slice(i, i + 8));
  }
  return out;
}

/** A drawable's fill and stroke against what Manim painted (RGBA lists and a stroke width): each
 * there exactly when Manim's is visible, with its colour, opacity and width. */
export function expectPaints(
  d: {
    fill: { color: string; opacity: number } | null;
    stroke: { color: string; opacity: number; width: number } | null;
  },
  expected: { fill: number[]; stroke: number[]; width: number },
  where: string,
): void {
  if (expected.fill[3]! > 1e-9) {
    expect(d.fill, `${where}: fill`).not.toBeNull();
    expect(d.fill!.opacity, `${where}: fill opacity`).toBeCloseTo(expected.fill[3]!, 5);
    compareColor(d.fill!.color, expected.fill, `${where}: fill`);
  } else {
    expect(d.fill, `${where}: no fill`).toBeNull();
  }
  if (expected.width > 1e-6 && expected.stroke[3]! > 1e-9) {
    expect(d.stroke, `${where}: stroke`).not.toBeNull();
    expect(d.stroke!.width, `${where}: stroke width`).toBeCloseTo(expected.width, 5);
    expect(d.stroke!.opacity, `${where}: stroke opacity`).toBeCloseTo(expected.stroke[3]!, 5);
    compareColor(d.stroke!.color, expected.stroke, `${where}: stroke`);
  } else {
    expect(d.stroke, `${where}: no stroke`).toBeNull();
  }
}
