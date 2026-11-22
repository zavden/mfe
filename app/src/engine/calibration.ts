/* Size calibration shared by the LaTeX backend and the text wrapper (docs/COMPANION.md, "Size"):
 * ManimCE draws `font_size / 960` scene units per SVG unit; ManimGL `font_size / (144 · h₀)`,
 * where h₀ is the height of a text-mode "0" in its template, measured once per session by the
 * LaTeX backend and otherwise taken from the reference machine. */
import type { Target } from '../model';

/** h₀ measured on the reference machine (TeX Live 2025, dvisvgm 3.6). */
export const GL_H0_FALLBACK = 6.874222;
/** ManimGL's `font_size_for_unit_height`. */
export const GL_FONT_SIZE_FOR_UNIT_HEIGHT = 144;
/** ManimCE's 1 / SCALE_FACTOR_PER_FONT_POINT. */
export const CE_POINTS_PER_UNIT = 960;
/** At equal font_size a ManimCE formula is this much larger than a ManimGL one: CE draws
 * font_size / 960 scene units per SVG unit, GL font_size / (144 · h₀). */
export const CE_GL_SIZE_RATIO =
  (GL_FONT_SIZE_FOR_UNIT_HEIGHT * GL_H0_FALLBACK) / CE_POINTS_PER_UNIT;
/** dvisvgm's SVG unit is the PostScript point (1/72 in); a TeX point is 1/72.27 in. */
export const BP_PER_TEX_PT = 72 / 72.27;

/** Scene units per SVG unit at `fontSize` for a target (`h0`: GL's calibration height). */
export function latexScale(target: Target, fontSize: number, h0: number): number {
  return target === 'ce'
    ? fontSize / CE_POINTS_PER_UNIT
    : fontSize / (GL_FONT_SIZE_FOR_UNIT_HEIGHT * h0);
}
