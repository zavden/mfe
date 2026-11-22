/* What a menu shows of a list of match colours beside its name: its colours. */
import type { ColorMatch } from '../../model';

/** At most this many swatches beside a name; a list with more colours says how many more. */
export const MATCH_SWATCH_LIMIT = 8;

/** The colours `match` gives, each once (whatever its case), in the order of its entries. */
export function matchColors(match: ColorMatch): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const { color } of match.entries) {
    const key = color.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(color);
  }
  return colors;
}
