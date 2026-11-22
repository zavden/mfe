/* Colour helpers: '#RRGGBB' ⇄ floats, and the linear RGB interpolation Manim applies when it
 * blends two mobjects (ManimCE `VMobject.interpolate_color`, ManimGL `StructuredArray.interpolate`
 * on the rgba arrays). ManimGL's `interpolate_color` (which works on squared components) is only
 * used for gradients, never by `Transform`, so it is not offered here. */

export type Rgb = [r: number, g: number, b: number];

const HEX = /^#?([0-9a-fA-F]{6})$/;

/** Components in 0…1. Anything that is not '#RRGGBB' parses as black. */
export function parseColor(color: string): Rgb {
  const m = HEX.exec(color);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const byte = (v: number) => Math.min(255, Math.max(0, Math.round(v * 255)));

/** '#RRGGBB' (upper case) from components in 0…1. */
function formatColor([r, g, b]: Rgb): string {
  const n = (byte(r) << 16) | (byte(g) << 8) | byte(b);
  return `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
}

/** Whether two '#RRGGBB' colours are the same, whatever their case. */
export function sameColor(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

/** Linear interpolation of the RGB components, `alpha` = 0 → c1, 1 → c2. */
export function lerpColor(c1: string, c2: string, alpha: number): string {
  if (alpha <= 0 || c1 === c2) return c1;
  if (alpha >= 1) return c2;
  const a = parseColor(c1);
  const b = parseColor(c2);
  return formatColor([
    a[0] + (b[0] - a[0]) * alpha,
    a[1] + (b[1] - a[1]) * alpha,
    a[2] + (b[2] - a[2]) * alpha,
  ]);
}
