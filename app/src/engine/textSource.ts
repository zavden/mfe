/* What a `tex` object stands for in LaTeX (PLAN-OBJETOS Prompt 6, F3a): the user writes the text
 * in text mode, with `$…$` for maths, `\\` for a line break and a blank line for a paragraph;
 * the app wraps it for the width, alignment and line spacing of its layout, in the same way for
 * the companion (exact mode, `mode: "text"`) and for the exported `Tex` / `TexText`. The width
 * is a `\parbox` in TeX points: P = W · 960 / (0.99626 · font_size) for ManimCE and
 * P = W · 144 · h₀ / (0.99626 · font_size) for ManimGL (measured with `\rule{100pt}` in
 * PLAN-RUTA §3.3), so that P points come out W scene units wide; the alignment is `\centering`,
 * `\raggedright` or `\raggedleft`, the line spacing `\linespread`. MathJax (free mode) gets the
 * rows of the text, each inside `\text{…}`, in a `gathered` (centred) or an `array`. */
import type { Target, TextLayout } from '../model';
import {
  BP_PER_TEX_PT,
  CE_POINTS_PER_UNIT,
  GL_FONT_SIZE_FOR_UNIT_HEIGHT,
  GL_H0_FALLBACK,
} from './calibration';

/** What `texSource` reads of a text object. */
export interface TextSpec {
  source: string;
  layout: TextLayout;
  fontSize: number;
}

/** A number for a TeX dimension or factor: up to four decimals, no trailing zeros. */
export function texNumber(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '');
}

/** The `\parbox` width in TeX points that comes out `width` scene units wide at `fontSize`. */
export function parboxPoints(width: number, fontSize: number, target: Target): number {
  const svgUnitsPerSceneUnit =
    (target === 'ce' ? CE_POINTS_PER_UNIT : GL_FONT_SIZE_FOR_UNIT_HEIGHT * GL_H0_FALLBACK) /
    fontSize;
  return (width * svgUnitsPerSceneUnit) / BP_PER_TEX_PT;
}

/** One em of the text at `fontSize` in scene units: the document's 10 pt font (10 TeX points,
 * `10 · BP_PER_TEX_PT` SVG units), scaled as the target scales SVG units. */
export function emUnits(fontSize: number, target: Target): number {
  const svgUnitsPerSceneUnit =
    (target === 'ce' ? CE_POINTS_PER_UNIT : GL_FONT_SIZE_FOR_UNIT_HEIGHT * GL_H0_FALLBACK) /
    fontSize;
  return (10 * BP_PER_TEX_PT) / svgUnitsPerSceneUnit;
}

/** TeX's interword space in text, in ems (cmr10's 3.33 pt at 10 pt). */
export const SPACE_EM = 1 / 3;

const ALIGN_COMMAND: Readonly<Record<TextLayout['align'], string>> = {
  left: '\\raggedright',
  center: '\\centering',
  right: '\\raggedleft',
};

/** The LaTeX the companion compiles and the export writes for a text object: its source inside
 * the wrapper its layout needs (none for a text as wide as it comes, centred, at the normal line
 * spacing). */
export function texSource(text: TextSpec, target: Target): string {
  const { source, layout } = text;
  const spacing =
    layout.lineSpacing === 1 ? '' : `\\linespread{${texNumber(layout.lineSpacing)}}\\selectfont `;
  if (layout.width === null) return spacing ? `{${spacing}${source}\\par}` : source;
  const points = texNumber(parboxPoints(layout.width, text.fontSize, target));
  return `\\parbox{${points}pt}{${ALIGN_COMMAND[layout.align]} ${spacing}${source}\\par}`;
}

/** The rows of a text as the user broke them: paragraphs at blank lines, lines at `\\` (with
 * an optional `[gap]`); a newline inside a paragraph is a space. Empty rows are dropped. */
export function textRows(source: string): string[] {
  return source
    .split(/\n[ \t]*\n/)
    .flatMap((paragraph) => paragraph.split(/\\\\(?:\[[^\]]*\])?/))
    .map((row) => row.replace(/\s+/g, ' ').trim())
    .filter((row) => row !== '');
}

/** The TeX MathJax typesets for rows of text: each row inside `\text{…}` — maths in `$…$` and
 * the text macros work inside — one under the other, centred (`gathered`) or in an `array`
 * column for the alignment; the line spacing widens or narrows the gaps between rows. */
export function mathJaxTextSource(rows: readonly string[], layout: TextLayout): string {
  const gap = layout.lineSpacing === 1 ? '' : `[${texNumber((layout.lineSpacing - 1) * 1.2)}em]`;
  const body = rows.map((row) => `\\text{${row}}`).join(`\\\\${gap}`);
  if (layout.align === 'center') return `\\begin{gathered}${body}\\end{gathered}`;
  const column = layout.align === 'left' ? 'l' : 'r';
  return `\\begin{array}{${column}}${body}\\end{array}`;
}
