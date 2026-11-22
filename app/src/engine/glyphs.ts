/* Shared glyph assembly for both backends: SVG-space shapes → formula-local glyphs.
 *
 * Follows what Manim does to a freshly parsed SVG: flip y, centre the union box of all points
 * (control points included, `contoursBox`) on the origin, then scale uniformly. Because all
 * three are linear, they collapse into one matrix applied to every contour. ManimGL's
 * `SVGMobject` then runs `ensure_positive_orientation()`: a glyph whose anchors wind clockwise
 * (negative signed area) has its points reversed — its contours in reverse order, each traced
 * backwards from the same start. TeX rules (`<rect>`, imported as `Rectangle`) are the usual
 * case; where a contour starts and which way it runs decide how a morph pairs its points and
 * where Write begins to trace it. ManimCE keeps every glyph as flipped. */
import {
  boxCenter,
  contoursBox,
  contoursSignedArea,
  reverseContour,
  transformContour,
  unionBox,
  type Box,
  type Contour,
  type Mat2D,
} from '../geom';
import type { Target } from '../model';
import type { Glyph } from './types';

export interface RawGlyph {
  label: string;
  kind: Glyph['kind'];
  /** SVG units, y down. */
  contours: Contour[];
  /** As Glyph.fill. */
  fill?: string;
}

export function buildGlyphs(
  raw: readonly RawGlyph[],
  scale: number,
  target: Target,
): { glyphs: Glyph[]; bbox: Box } {
  const all = contoursBox(raw.flatMap((g) => g.contours));
  const [cx, cy] = boxCenter(all);
  // x' = s·(x − cx), y' = −s·(y − cy)
  const m: Mat2D = [scale, 0, 0, -scale, -scale * cx, scale * cy];
  const glyphs = raw.map((g, index): Glyph => {
    let contours = g.contours.map((c) => transformContour(m, c));
    if (target === 'gl' && contoursSignedArea(contours) < 0) {
      contours = contours.map(reverseContour).reverse();
    }
    return {
      index,
      label: g.label,
      kind: g.kind,
      contours,
      bbox: contoursBox(contours),
      ...(g.fill ? { fill: g.fill } : {}),
    };
  });
  return { glyphs, bbox: unionBox(glyphs.map((g) => g.bbox)) };
}

/** Display form of a label: NFKC when that yields a single code point (MathJax's math-italic
 * "𝑎" becomes "a", "ℎ" becomes "h"); anything else unchanged. */
export function displayLabel(label: string): string {
  const nfkc = label.normalize('NFKC');
  return [...nfkc].length === 1 ? nfkc : label;
}

/** Canonical form of a label for comparisons: displayLabel plus a few TeX/Unicode synonyms
 * ("-" and "−", "∣" and "|"…). "?" means unknown and never counts as agreement. */
export function normalizeLabel(label: string): string {
  const base = displayLabel(label);
  return LABEL_SYNONYMS[base] ?? base;
}

const LABEL_SYNONYMS: Record<string, string> = {
  '-': '−',
  '∗': '*',
  '∣': '|',
  '‖': '∥',
  '〈': '⟨',
  '〉': '⟩',
  '·': '⋅',
  // MathJax draws \overline and \underline with a stretched en dash; TeX uses a rule.
  '–': '—',
  // Accents: TeX fonts have spacing accents, MathJax uses combining or modifier characters.
  '\u20D7': '→',
  '\u0302': '^',
  ˆ: '^',
  '\u0303': '~',
  '˜': '~',
  '\u0307': '˙',
  '\u0308': '¨',
  '\u0304': '¯',
  ˉ: '¯',
};
