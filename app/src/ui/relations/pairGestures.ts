/* The gestures of a pair editor over its two glyph selections, as pure functions: what a click
 * on a glyph does, which pairs a selection holds, which pairs to emphasise and what a right-click
 * works on. They are the relation editor's rules (`RelationEditor.tsx`, which keeps its own
 * copy of them inline), shared with the pair editor of Morph blocks (`ui/morph/MorphEditor.tsx`).
 * Pure. */
import type { GlyphPair } from '../../model';
import type { SideSelection } from './relationOps';

export type PairSide = 'from' | 'to';

export interface SideGlyph {
  side: PairSide;
  index: number;
}

export const NO_SELECTION: SideSelection = { from: new Set(), to: new Set() };

export type GlyphClick =
  { kind: 'select'; selection: SideSelection } | { kind: 'link'; from: number[]; to: number[] };

/** A click on `glyph` of `side`. With Shift / Ctrl / ⌘ (`additive`) it toggles the glyph in the
 * selection of its side; on a side with nothing selected while the other side has a selection
 * it links at once; otherwise it selects that glyph alone (or nothing, when it was the only
 * selected glyph of its side). */
export function glyphClick(
  selection: SideSelection,
  side: PairSide,
  glyph: number,
  additive: boolean,
): GlyphClick {
  const mine = selection[side];
  const other = side === 'from' ? selection.to : selection.from;
  const put = (next: ReadonlySet<number>): GlyphClick => ({
    kind: 'select',
    selection: { ...selection, [side]: next },
  });
  if (additive) {
    const next = new Set(mine);
    if (next.has(glyph)) next.delete(glyph);
    else next.add(glyph);
    return put(next);
  }
  if (mine.size === 0 && other.size > 0) {
    return side === 'to'
      ? { kind: 'link', from: [...selection.from], to: [glyph] }
      : { kind: 'link', from: [glyph], to: [...selection.to] };
  }
  return put(mine.size === 1 && mine.has(glyph) ? new Set() : new Set([glyph]));
}

/** Whether `pair` holds `glyph` on `side`. */
export const holds = (pair: GlyphPair, { side, index }: SideGlyph): boolean =>
  (side === 'from' ? pair.from : pair.to).includes(index);

/** The pairs (by index) that hold a glyph of the selection on its side. */
export function pairsHolding(pairs: readonly GlyphPair[], selection: SideSelection): number[] {
  return pairs.flatMap((p, i) =>
    p.from.some((g) => selection.from.has(g)) || p.to.some((g) => selection.to.has(g)) ? [i] : [],
  );
}

/** The pairs of the selection (their badges can be clicked) and the pairs to emphasise: those,
 * the hovered row and every pair holding the hovered glyph. */
export function pairEmphasis(
  pairs: readonly GlyphPair[],
  selection: SideSelection,
  hoverPair: number | null,
  hoverGlyph: SideGlyph | null,
): { selected: Set<number>; focus: Set<number> } {
  const selected = new Set(pairsHolding(pairs, selection));
  const focus = new Set(selected);
  if (hoverPair !== null) focus.add(hoverPair);
  if (hoverGlyph) pairs.forEach((p, i) => holds(p, hoverGlyph) && focus.add(i));
  return { selected, focus };
}

/** The selection a right-click works on: the current one, unless the click is on a glyph
 * outside it (`changed`). On a side with nothing selected while the other side has a selection,
 * the glyph joins it — the two sides of a link, which the menu then offers to make («Link as»),
 * where a plain click links at once —; otherwise the glyph becomes the selection alone. */
export function contextSelection(
  selection: SideSelection,
  target: SideGlyph | null,
): { selection: SideSelection; changed: boolean } {
  if (!target || selection[target.side].has(target.index)) return { selection, changed: false };
  const other = target.side === 'from' ? selection.to : selection.from;
  if (selection[target.side].size === 0 && other.size > 0) {
    return {
      selection: { ...selection, [target.side]: new Set([target.index]) },
      changed: true,
    };
  }
  return {
    selection: {
      from: new Set(target.side === 'from' ? [target.index] : []),
      to: new Set(target.side === 'to' ? [target.index] : []),
    },
    changed: true,
  };
}
