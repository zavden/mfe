// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GlyphPair } from '../../../model';
import {
  contextSelection,
  glyphClick,
  NO_SELECTION,
  pairEmphasis,
  pairsHolding,
} from '../pairGestures';
import type { SideSelection } from '../relationOps';

const sel = (from: number[], to: number[]): SideSelection => ({
  from: new Set(from),
  to: new Set(to),
});
const plain = (s: SideSelection) => ({ from: [...s.from].sort(), to: [...s.to].sort() });

describe('glyphClick', () => {
  it('selects one glyph, toggles with a modifier and links across at once', () => {
    const one = glyphClick(NO_SELECTION, 'from', 2, false);
    expect(one.kind === 'select' && plain(one.selection)).toEqual({ from: [2], to: [] });
    // The only selected glyph again: nothing.
    const again = glyphClick(sel([2], []), 'from', 2, false);
    expect(again.kind === 'select' && plain(again.selection)).toEqual({ from: [], to: [] });
    // Shift / Ctrl / ⌘ toggles on its own side.
    const more = glyphClick(sel([2], []), 'from', 4, true);
    expect(more.kind === 'select' && plain(more.selection)).toEqual({ from: [2, 4], to: [] });
    const less = glyphClick(sel([2, 4], [1]), 'from', 4, true);
    expect(less.kind === 'select' && plain(less.selection)).toEqual({ from: [2], to: [1] });
    // A plain click on an empty side while the other has a selection links.
    expect(glyphClick(sel([2, 4], []), 'to', 7, false)).toEqual({
      kind: 'link',
      from: [2, 4],
      to: [7],
    });
    expect(glyphClick(sel([], [5]), 'from', 0, false)).toEqual({
      kind: 'link',
      from: [0],
      to: [5],
    });
    // A plain click on a side that has a selection replaces it.
    const other = glyphClick(sel([2], [5]), 'to', 6, false);
    expect(other.kind === 'select' && plain(other.selection)).toEqual({ from: [2], to: [6] });
  });
});

describe('pairs of a selection', () => {
  const pairs: GlyphPair[] = [
    { from: [0], to: [3], style: null },
    { from: [1, 2], to: [4], style: null },
    { from: [0], to: [5], style: null },
  ];

  it('finds the pairs that hold selected or hovered glyphs', () => {
    expect(pairsHolding(pairs, sel([0], []))).toEqual([0, 2]);
    expect(pairsHolding(pairs, sel([], [4]))).toEqual([1]);
    // A glyph counts on its own side only.
    expect(pairsHolding(pairs, sel([4], [0]))).toEqual([]);
    const { selected, focus } = pairEmphasis(pairs, sel([], [3]), 1, { side: 'from', index: 0 });
    expect([...selected]).toEqual([0]);
    expect([...focus].sort()).toEqual([0, 1, 2]);
  });

  it('right-clicks on the selection, or on a glyph outside it, which becomes the selection', () => {
    const current = sel([1, 2], []);
    expect(contextSelection(current, { side: 'from', index: 1 })).toEqual({
      selection: current,
      changed: false,
    });
    expect(contextSelection(current, null)).toEqual({ selection: current, changed: false });
    // On its own side, a glyph outside the selection becomes the selection alone.
    const moved = contextSelection(current, { side: 'from', index: 4 });
    expect(moved.changed).toBe(true);
    expect(plain(moved.selection)).toEqual({ from: [4], to: [] });
    const replaced = contextSelection(sel([1], [3]), { side: 'to', index: 4 });
    expect(plain(replaced.selection)).toEqual({ from: [], to: [4] });
  });

  it('right-clicks across: the glyph joins a selection of the other side alone', () => {
    // Where a plain click would link at once, the right-click completes the two sides of a link.
    const across = contextSelection(sel([1, 2], []), { side: 'to', index: 4 });
    expect(across.changed).toBe(true);
    expect(plain(across.selection)).toEqual({ from: [1, 2], to: [4] });
    const back = contextSelection(sel([], [5]), { side: 'from', index: 0 });
    expect(plain(back.selection)).toEqual({ from: [0], to: [5] });
    // With nothing selected at all, the glyph is the selection.
    const first = contextSelection(sel([], []), { side: 'to', index: 4 });
    expect(plain(first.selection)).toEqual({ from: [], to: [4] });
  });
});
