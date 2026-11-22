/* Placeholder boxes: what a font text looks like while nothing has shaped it. Pango shapes text
 * with the fonts of the machine the companion runs on, and the browser cannot read them, so
 * without a companion there are no contours. This module lays the text out roughly instead: one
 * box per grapheme, on the lines the author broke, sized by a measurer the caller injects (the
 * app measures with a canvas, `textMeasure.ts`; a tool without one uses `fixedTextMeasurer`).
 *
 * Which graphemes get a box depends on the source alone, never on the measurer nor on the
 * browser: box k of a source is the same grapheme on every machine, so the glyph references made
 * on boxes can be carried to the real glyphs by source range once a companion shapes the text
 * (`textMatch.ts`).
 * Where they sit is approximate by definition: no kerning, no ligatures, left to right only.
 *
 * The constants that take a font size to scene units were measured with real Manim
 * (`../MANIM-QUIRKS.md` §7 bis, `tests/parity/text_children.py` and `text_boxes.py`). Pure. */
import { rectContour, unionBox, type Box } from '../geom';
import type { FormulaSnapshot, GlyphStyle, Target, TextFont, TextSourceRange } from '../model';
import type { FormulaRender, Glyph } from './types';

/** Part of the key of a render made of boxes: bumped when the rule that says which graphemes
 * get a box, or their order, changes. */
export const TEXT_BOXES_VERSION = 'boxes+1';

/** At equal font_size a ManimCE `Text` is this much larger than a ManimGL one. ManimCE draws an em
 * as font_size / 72 scene units. ManimGL calibrates its texts on the machine: the digit zero of
 * Pango's default font is font_size / 144 units tall, so its em is font_size / (144 · d₀) units,
 * d₀ being that zero's height in em. The ratio is 2 · d₀: 1.4678 with Noto Sans (d₀ = 0.7339), the
 * default font of the reference machine, and a few percent away with another default font. Measured
 * over 168 texts (eight fonts, three sizes): 1.4677 ± 0.0003 in width. */
export const TEXT_CE_GL_SIZE_RATIO = 1.4678;

/** One em of a `Text` of `fontSize`, in scene units. */
export function textEmUnits(fontSize: number, target: Target): number {
  const ce = fontSize / 72;
  return target === 'ce' ? ce : ce / TEXT_CE_GL_SIZE_RATIO;
}

/** From one baseline to the next, in em. ManimCE sets each line itself, 1.3 font sizes in points
 * below the last one, which is 0.975 em whatever the font. ManimGL lets Pango space them at 0.96
 * of the font's own line height. */
export function textLinePitch(target: Target, fontLineHeight: number): number {
  return target === 'ce' ? 0.975 : 0.96 * fontLineHeight;
}

/** How wide a tab is. ManimCE replaces it by four spaces before shaping; ManimGL keeps Pango's
 * tab stops, one every eight spaces. */
const CE_TAB_SPACES = 4;
const GL_TAB_STOP_SPACES = 8;

/** The ink of one grapheme set alone, in em, around the pen on the baseline: `left` and
 * `descent` are positive when the ink reaches left of the pen and below the baseline. */
export interface TextInk {
  /** How far the pen moves. */
  advance: number;
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

/** What measures text for the boxes. */
export interface TextMeasurer {
  ink(grapheme: string, font: TextFont): TextInk;
  /** Ascent plus descent of the font's line, in em (what Pango calls the font's height). */
  lineHeight(font: TextFont): number;
}

/** A measurer that knows no font: every letter as wide as an average one. For the tools that
 * have no canvas; the boxes it gives are in the right order and of a plausible size. */
export const fixedTextMeasurer: TextMeasurer = {
  ink(grapheme) {
    const wide = /^[\p{Lu}\p{Nd}mw@%&]/u.test(grapheme);
    const narrow = /^[ijl.,:;'|!()[\]\s]/u.test(grapheme);
    const advance = narrow ? 0.3 : wide ? 0.68 : 0.55;
    const tall = /^[\p{Lu}\p{Nd}bdfhklt]/u.test(grapheme) || !/^\p{Ll}/u.test(grapheme);
    const low = /^[gjpqy,;]/u.test(grapheme);
    const small = /^[.,_]/u.test(grapheme);
    return {
      advance,
      left: -0.04,
      right: advance - 0.04,
      ascent: small ? 0.1 : tall ? 0.72 : 0.52,
      descent: low ? 0.2 : 0,
    };
  },
  lineHeight: () => 1.2,
};

/** The size of a box whose grapheme the measurer found no ink for. */
const BLANK_INK = { left: -0.05, width: 0.4, ascent: 0.5 } as const;

const MARK = /^\p{M}$/u;
const EMOJI_MODIFIER = /^\p{Emoji_Modifier}$/u;
const REGIONAL_INDICATOR = /^\p{Regional_Indicator}$/u;
const JOINER = '\u200d';

/** Graphemes of `text` with their UTF-16 offsets, by a rule of this module's own: a code point
 * takes with it the combining marks that follow it (accents, variation selectors), an emoji
 * modifier, a zero-width joiner and what it ties to it, and the second regional indicator of a
 * flag. The browser's own segmenter is not used: it follows the Unicode library of each browser
 * and of each of its versions, and box k must be the same piece of text in all of them. Where
 * the rule is coarser than Unicode's (a syllable of Hangul written jamo by jamo), there are
 * more boxes, the same ones everywhere. */
function graphemes(text: string, offset: number): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  let at = offset;
  let joined = false;
  for (const char of text) {
    const last = out.at(-1);
    const more =
      last !== undefined &&
      (joined ||
        char === JOINER ||
        MARK.test(char) ||
        EMOJI_MODIFIER.test(char) ||
        (REGIONAL_INDICATOR.test(char) && REGIONAL_INDICATOR.test(last.text)));
    if (more) {
      last.text += char;
      last.end += char.length;
    } else out.push({ text: char, start: at, end: at + char.length });
    joined = char === JOINER;
    at += char.length;
  }
  return out;
}

/** Whether a grapheme draws nothing whatever the font: spaces, and the characters that only
 * steer the layout (joiners, direction marks, controls). Decided by the text alone. */
const invisible = (grapheme: string) => /^[\p{White_Space}\p{Cf}\p{Cc}]+$/u.test(grapheme);

interface Piece {
  text: string;
  start: number;
  end: number;
  line: number;
  boxed: boolean;
}

/** The graphemes of `source` in order, by lines (a line break belongs to no line). */
function pieces(source: string): Piece[] {
  const out: Piece[] = [];
  let offset = 0;
  source.split('\n').forEach((row, line) => {
    for (const grapheme of graphemes(row, offset)) {
      out.push({ ...grapheme, line, boxed: !invisible(grapheme.text) });
    }
    offset += row.length + 1;
  });
  return out;
}

/** The source range of each box of `source`, in box order: all the measurer-free part of the
 * layout. Glyph k of a render of boxes stands for range k. */
export function textBoxRanges(source: string): TextSourceRange[] {
  return pieces(source)
    .filter((piece) => piece.boxed)
    .map(({ start, end }) => ({ start, end }));
}

export interface TextBox {
  /** Position among the boxes: the glyph index of the render. */
  index: number;
  /** The grapheme it stands for. */
  label: string;
  range: TextSourceRange;
  /** Scene units, y up; the union of all boxes is centred on the origin. */
  box: Box;
}

export interface TextBoxLayout {
  boxes: TextBox[];
  /** Union of the boxes (all zeros for a text that draws nothing). */
  bbox: Box;
}

export interface TextBoxRequest {
  source: string;
  font: TextFont;
  fontSize: number;
  target: Target;
}

/** The boxes of a text as `target`'s library would roughly set it: left-aligned lines, the pen
 * moved by each grapheme's own advance, the whole centred like a new `Text`. */
export function layoutTextBoxes(request: TextBoxRequest, measure: TextMeasurer): TextBoxLayout {
  const { source, font, target } = request;
  const em = textEmUnits(request.fontSize, target);
  const pitch = textLinePitch(target, measure.lineHeight(font));
  const space = measure.ink(' ', font).advance;
  const boxes: TextBox[] = [];
  let line = -1;
  let pen = 0;
  for (const piece of pieces(source)) {
    if (piece.line !== line) {
      line = piece.line;
      pen = 0;
    }
    if (piece.text === '\t') {
      const stop = GL_TAB_STOP_SPACES * space;
      pen =
        target === 'ce' || stop <= 0
          ? pen + CE_TAB_SPACES * space
          : (Math.floor(pen / stop + 1e-9) + 1) * stop;
      continue;
    }
    const ink = measure.ink(piece.text, font);
    if (piece.boxed) {
      const noInk = !(ink.left + ink.right > 0) || !(ink.ascent + ink.descent > 0);
      const left = noInk ? BLANK_INK.left : ink.left;
      const right = noInk ? BLANK_INK.left + BLANK_INK.width : ink.right;
      const ascent = noInk ? BLANK_INK.ascent : ink.ascent;
      const descent = noInk ? 0 : ink.descent;
      const baseline = -line * pitch;
      boxes.push({
        index: boxes.length,
        label: piece.text,
        range: { start: piece.start, end: piece.end },
        box: {
          minX: (pen - left) * em,
          maxX: (pen + right) * em,
          minY: (baseline - descent) * em,
          maxY: (baseline + ascent) * em,
        },
      });
    }
    const known = Number.isFinite(ink.advance) && ink.advance >= 0;
    pen += known ? ink.advance : piece.boxed ? BLANK_INK.width : 0;
  }
  if (boxes.length === 0) return { boxes, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  const union = boxes.reduce(
    (all, { box }) => ({
      minX: Math.min(all.minX, box.minX),
      minY: Math.min(all.minY, box.minY),
      maxX: Math.max(all.maxX, box.maxX),
      maxY: Math.max(all.maxY, box.maxY),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const cx = (union.minX + union.maxX) / 2;
  const cy = (union.minY + union.maxY) / 2;
  const shift = (box: Box): Box => ({
    minX: box.minX - cx,
    minY: box.minY - cy,
    maxX: box.maxX - cx,
    maxY: box.maxY - cy,
  });
  return { boxes: boxes.map((item) => ({ ...item, box: shift(item.box) })), bbox: shift(union) };
}

/** How a placeholder box is painted: a faint fill inside a thin outline, in the text's colour,
 * so that it reads as a stand-in and not as a drawn rectangle. */
export const TEXT_BOX_STYLE: Readonly<GlyphStyle> = {
  fillOpacity: 0.3,
  strokeWidth: 1.5,
  strokeOpacity: 1,
};

/** What a render of boxes says of itself (among its warnings). */
export const TEXT_BOXES_WARNING =
  'Placeholder boxes, one per character: nothing has shaped this text. The companion draws its real glyphs.';

/** What boxes drawn where the saved glyphs were say of themselves. */
export const TEXT_SAVED_BOXES_WARNING =
  'Placeholder boxes where its glyphs were: the saved appearance of this text is not at hand. Open the project file that carries it, or let the companion shape it again.';

const boxGlyph = (index: number, label: string, box: Box): Glyph => ({
  index,
  label,
  kind: 'char',
  contours: [rectContour(box)],
  bbox: box,
  style: { ...TEXT_BOX_STYLE },
});

/** A font text as boxes: the render of a text nothing has shaped, with `key` as its key. It is
 * Pango's by name (a text has no other backend) and never exact; `boxes` says which piece of the
 * source each glyph stands for. */
export function textBoxesRender(
  request: TextBoxRequest,
  key: string,
  measure: TextMeasurer,
): FormulaRender {
  const layout = layoutTextBoxes(request, measure);
  return {
    key,
    backend: 'pango',
    exact: false,
    target: request.target,
    fontSize: request.fontSize,
    glyphs: layout.boxes.map((item) => boxGlyph(item.index, item.label, item.box)),
    bbox: layout.bbox,
    warnings: [TEXT_BOXES_WARNING],
    boxes: { source: request.source, ranges: layout.boxes.map((item) => item.range) },
  };
}

/** A font text as the boxes of the glyphs it had: for a text whose saved geometry is not at hand
 * while its snapshot, which keeps where each glyph was and how large, still belongs to it. Glyph
 * k is canonical glyph k. */
export function savedBoxesRender(
  snapshot: FormulaSnapshot,
  request: Pick<TextBoxRequest, 'target' | 'fontSize'>,
  key: string,
  warning: string = TEXT_SAVED_BOXES_WARNING,
): FormulaRender {
  const glyphs = snapshot.glyphs.map((glyph, index) =>
    boxGlyph(index, glyph.label, {
      minX: glyph.center[0] - glyph.size[0] / 2,
      minY: glyph.center[1] - glyph.size[1] / 2,
      maxX: glyph.center[0] + glyph.size[0] / 2,
      maxY: glyph.center[1] + glyph.size[1] / 2,
    }),
  );
  return {
    key,
    backend: 'pango',
    exact: false,
    target: request.target,
    fontSize: request.fontSize,
    glyphs,
    bbox: glyphs.length
      ? unionBox(glyphs.map((glyph) => glyph.bbox))
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    warnings: [warning],
  };
}
