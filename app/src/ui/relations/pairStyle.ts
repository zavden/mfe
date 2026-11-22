/* How a pair's style is shown on the relation editor's canvas: a badge at the junction of its
 * links ("T", "C", "F", "FC", or "I:" + the relation's style when the pair inherits it). */
import { sourceRoles, type GlyphPair, type RelationStyle } from '../../model';

const STYLE_LETTER: Record<RelationStyle, string> = {
  transform: 'T',
  copy: 'C',
  fade: 'F',
  fade_copy: 'FC',
};

export const STYLE_NAME: Record<RelationStyle, string> = {
  transform: 'Transform',
  copy: 'Copy',
  fade: 'Fade transform',
  fade_copy: 'Fade copy',
};

export function pairStyleBadge(pair: GlyphPair, defaultStyle: RelationStyle): string {
  return pair.style ? STYLE_LETTER[pair.style] : `I:${STYLE_LETTER[defaultStyle]}`;
}

/** The source glyphs the pairs consume, each with the index of the first pair that does: a
 * Transform or a Fade transform takes its sources for good — with `copies`, its principal alone
 * (`sourceRoles`) —, so another pair can only copy them (D184). `defaultStyle` is what the pairs
 * without a style of their own inherit. */
export function consumedSources(
  pairs: readonly GlyphPair[],
  defaultStyle: RelationStyle,
): Map<number, number> {
  const out = new Map<number, number>();
  pairs.forEach((pair, index) => {
    for (const glyph of sourceRoles(pair, pair.style ?? defaultStyle).consumed) {
      if (!out.has(glyph)) out.set(glyph, index);
    }
  });
  return out;
}

/** What the tooltip of such a glyph says: which pair consumes it, and what is left to do with it. */
export function consumedNote(pair: GlyphPair, index: number, defaultStyle: RelationStyle): string {
  return `pair ${index + 1} consumes it (${STYLE_NAME[pair.style ?? defaultStyle]}): another pair can only copy it`;
}
