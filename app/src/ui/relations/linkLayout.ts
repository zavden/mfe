/* Where the drawing that links glyphs (GlyphLinkCanvas.tsx) puts its two formulas, in shared
 * coordinates (scene units, y up), with the margins around them. Two layouts:
 *   - 'stacked': both centred on x = 0, the source above a gap, the target below it. The links
 *     go through the gap;
 *   - 'side': both centred on y = 0, the source at the left of a gap, the target at its right.
 *     The links are arcs over the formulas, so there is room over them. A formula of several
 *     lines has each line of the source beside the same line of the target, and the two can be
 *     brought near together — stacked, a line and its copy are a whole formula apart.
 * The raw preview of the relation editor (RawPreview.tsx) animates the formulas on the same spots,
 * so the two pictures coincide. Pure. */
import { boxSize, type Box } from '../../geom';

export type PairLayout = 'stacked' | 'side';

/** A translation of a formula's own coordinates into the shared ones. */
export interface LinkOffset {
  dx: number;
  dy: number;
}

export interface LinkFrame {
  layout: PairLayout;
  /** What the spacing is proportional to: the gap between the formulas and the margins. */
  unit: number;
  from: LinkOffset;
  to: LinkOffset;
  /** Stacked: the free band between the formulas, where the junctions of the links go. Side by
   * side there is none across: both are 0. */
  gapTop: number;
  gapBottom: number;
  /** The box of the whole drawing. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The size of the text that glyphs of these boxes are: the median of their longer sides — a
 * letter's height, the width of a sign. Not the height of a formula, which several lines make
 * tall, nor its tallest glyph, which a big delimiter is: neither says how large the text is.
 * 0 without glyphs. */
export function textSize(boxes: readonly Box[]): number {
  const sides = boxes
    .map((box) => Math.max(...boxSize(box)))
    .filter((side) => Number.isFinite(side) && side > 0)
    .sort((a, b) => a - b);
  if (sides.length === 0) return 0;
  const middle = sides.length >> 1;
  return sides.length % 2 === 1 ? sides[middle]! : (sides[middle - 1]! + sides[middle]!) / 2;
}

/** The size of the text of the formulas of a drawing: `textSize` of all their glyphs. The
 * drawing and the raw preview ask it of the same renders, so that they lay out alike. */
export function rendersTextSize(
  ...renders: readonly { glyphs: readonly { bbox: Box }[] }[]
): number {
  return textSize(renders.flatMap((render) => render.glyphs.map((glyph) => glyph.bbox)));
}

/** The unit of a drawing whose text is `text` large: a little over half a letter. */
const UNIT_OF_TEXT = 0.6;
/** The text a drawing is spaced for at least: a formula of one dot is not laid out by its dot. */
const LEAST_TEXT = 0.05;
/** The gap between the two formulas, in units: some three letters. */
const GAP = 5;
/** Side by side, the room over the formulas for the arcs of the pairs of their first line, as a
 * share of the drawing's width: the arcs are the screen's (some hundred pixels of them, one over
 * another), and it is by its width that a drawing side by side fits its element. */
const ARC_ROOM = 0.15;
/** Stacked, the room over the source for the keys of the view, which are over the upper right
 * corner of the drawing, as a share of the drawing's width: the keys are the screen's (34 px down
 * from the top of the element), and a line that ends under them is as wide as the drawing, which
 * then fits its element — some 660 px across in the dialog — by its width. A short formula keeps
 * the room of its text: it is drawn large, and ends far from the corner. */
const KEYS_ROOM = 0.055;

/** The frame of the drawing for the boxes of the source (`a`) and of the target (`b`), whose
 * text is `text` large (`textSize` of the glyphs of both). */
export function linkFrame(a: Box, b: Box, text: number, layout: PairLayout = 'stacked'): LinkFrame {
  const [w1, h1] = boxSize(a);
  const [w2, h2] = boxSize(b);
  const unit = Math.max(text, LEAST_TEXT) * UNIT_OF_TEXT;
  const gap = unit * GAP;
  const pad = unit * 0.8;
  // Room under the formulas for the index badge of a hovered glyph (indices are not shown
  // otherwise: stacked glyphs, as in fractions, would put them on top of each other), and as
  // much at least over a stacked source.
  const labelRoom = unit;
  if (layout === 'side') {
    const halfH = Math.max(h1, h2) / 2;
    const left = -gap / 2 - w1 - pad;
    const right = gap / 2 + w2 + pad;
    return {
      layout,
      unit,
      // Both formulas centred on y = 0; the source ends at the gap, the target starts after it.
      from: { dx: -gap / 2 - a.maxX, dy: -(a.minY + a.maxY) / 2 },
      to: { dx: gap / 2 - b.minX, dy: -(b.minY + b.maxY) / 2 },
      gapTop: 0,
      gapBottom: 0,
      left,
      right,
      top: halfH + (right - left) * ARC_ROOM + pad,
      bottom: -halfH - labelRoom - pad,
    };
  }
  const halfW = Math.max(w1, w2, unit * 4) / 2;
  const left = -halfW - pad;
  const right = halfW + pad;
  return {
    layout,
    unit,
    // Both formulas centred on x = 0; the source sits above the gap, the target below it.
    from: { dx: -(a.minX + a.maxX) / 2, dy: gap / 2 - a.minY },
    to: { dx: -(b.minX + b.maxX) / 2, dy: -gap / 2 - b.maxY },
    gapTop: gap / 2,
    gapBottom: -gap / 2,
    left,
    right,
    top: gap / 2 + h1 + Math.max(labelRoom, (right - left) * KEYS_ROOM) + pad,
    bottom: -gap / 2 - h2 - labelRoom - pad,
  };
}
