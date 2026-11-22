/* Selecting glyphs in the glyph view: click = just this one, Shift+click = the range from the
 * anchor, Ctrl/⌘+click = toggle; a marquee selects what it touches (with Ctrl/⌘ or Shift: adds
 * it). Pure, so it can be tested without a DOM. */

export interface GlyphSelection {
  selected: ReadonlySet<number>;
  /** The glyph a Shift+click range starts from. */
  anchor: number | null;
}

export const NO_SELECTION: GlyphSelection = { selected: new Set(), anchor: null };

export function clickGlyph(
  current: GlyphSelection,
  index: number,
  modifiers: { shift: boolean; toggle: boolean },
): GlyphSelection {
  if (modifiers.shift && current.anchor !== null) {
    const from = Math.min(current.anchor, index);
    const to = Math.max(current.anchor, index);
    const range = new Set<number>(modifiers.toggle ? current.selected : []);
    for (let i = from; i <= to; i++) range.add(i);
    return { selected: range, anchor: current.anchor };
  }
  if (modifiers.toggle) {
    const next = new Set(current.selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return { selected: next, anchor: index };
  }
  return { selected: new Set([index]), anchor: index };
}

/** A marquee over `indices`: just those, or added to `base` (the selection the drag started
 * from). A range then starts from the first of them, unless `base` had an anchor. */
export function marqueeSelection(
  base: GlyphSelection,
  indices: readonly number[],
  additive: boolean,
): GlyphSelection {
  const first = indices.length > 0 ? Math.min(...indices) : null;
  if (!additive) return { selected: new Set(indices), anchor: first };
  return { selected: new Set([...base.selected, ...indices]), anchor: base.anchor ?? first };
}

export function selectAll(count: number): GlyphSelection {
  return {
    selected: new Set(Array.from({ length: count }, (_, i) => i)),
    anchor: count > 0 ? 0 : null,
  };
}

/** Drop indices beyond `count` (the formula got fewer glyphs). */
export function clampSelection(current: GlyphSelection, count: number): GlyphSelection {
  const selected = new Set([...current.selected].filter((i) => i < count));
  if (selected.size === current.selected.size) return current;
  return {
    selected,
    anchor: current.anchor !== null && current.anchor < count ? current.anchor : null,
  };
}
