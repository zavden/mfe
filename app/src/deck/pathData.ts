/* Outlines as SVG path data, and back. A glyph's outline is cubic contours `[x0, y0, c1x, c1y,
 * c2x, c2y, x1, y1, …]` in scene units with y up (`geom` `Contour`); in a `d` attribute and in
 * `glyphs.js` it is `M x y C … Z`, absolute, with **y down**, as every SVG: the same numbers with
 * the sign of y changed. Each number is rounded to a ten-thousandth of a scene unit (a hundredth
 * of a pixel of a 1080p frame), one by one, so equal points stay equal and a closed contour stays
 * closed. Pure. */
import type { Contour } from '../geom';

/** Scene units per step of a written coordinate. */
export const QUANTUM = 1e-4;
const PER_UNIT = 1 / QUANTUM;

/** Points closer than this are equal when deciding whether a contour is closed, as the canvas
 * renderer decides it (`render/canvasRenderer.ts`). */
const CLOSE_EPSILON = 1e-8;

/** A coordinate as it is written: at most four decimals, no trailing zeros, `-0` as `0`. */
export function written(value: number): number {
  const rounded = Math.round(value * PER_UNIT) / PER_UNIT;
  return rounded === 0 ? 0 : rounded;
}

/** The path data of contours: `M x y C … Z` per contour. A contour of less than one curve draws
 * nothing and is left out; `Z` closes one whose last point is its first. */
export function pathData(contours: readonly Contour[]): string {
  let d = '';
  for (const c of contours) {
    const n = c.length;
    if (n < 8) continue;
    d += `M${written(c[0]!)} ${written(-c[1]!)}`;
    for (let i = 2; i + 5 < n; i += 6) {
      d +=
        `C${written(c[i]!)} ${written(-c[i + 1]!)} ${written(c[i + 2]!)} ` +
        `${written(-c[i + 3]!)} ${written(c[i + 4]!)} ${written(-c[i + 5]!)}`;
    }
    if (
      Math.abs(c[0]! - c[n - 2]!) < CLOSE_EPSILON &&
      Math.abs(c[1]! - c[n - 1]!) < CLOSE_EPSILON
    ) {
      d += 'Z';
    }
  }
  return d;
}

/** The contours of path data written by `pathData` (the commands `M`, `C` and `Z`, absolute,
 * numbers separated by spaces or commas; a `C` may carry several curves). Throws, saying where,
 * on anything else: the glyph file is generated, and one edited into another dialect of SVG would
 * otherwise draw something else without a word. */
export function parsePathData(d: string): Contour[] {
  const contours: Contour[] = [];
  let current: number[] | null = null;
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  const numbers = (count: number, command: string): number[] => {
    const out: number[] = [];
    for (let k = 0; k < count; k++) {
      const token = tokens[i];
      const value = token === undefined ? Number.NaN : Number(token);
      if (!Number.isFinite(value)) {
        throw new Error(
          `path data: "${command}" wants ${count} numbers, got "${token ?? 'the end'}"`,
        );
      }
      out.push(value);
      i++;
    }
    return out;
  };
  const isNumber = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]!);
  while (i < tokens.length) {
    const command = tokens[i++]!;
    if (command === 'M') {
      const [x, y] = numbers(2, 'M');
      current = [x!, -y!];
      contours.push(current);
    } else if (command === 'C') {
      if (!current) throw new Error('path data: a "C" before any "M"');
      do {
        const [c1x, c1y, c2x, c2y, x, y] = numbers(6, 'C');
        current.push(c1x!, -c1y!, c2x!, -c2y!, x!, -y!);
      } while (isNumber());
    } else if (command === 'Z') {
      current = null;
    } else {
      throw new Error(`path data: the command "${command}" is not one of M, C, Z`);
    }
  }
  // `-0` would make a point differ from itself in a comparison by `Object.is`.
  return contours.map((contour) => contour.map((value) => (value === 0 ? 0 : value)));
}
