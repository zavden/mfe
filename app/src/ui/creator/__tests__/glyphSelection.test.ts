// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clampSelection,
  clickGlyph,
  marqueeSelection,
  NO_SELECTION,
  selectAll,
} from '../glyphSelection';

const plain = { shift: false, toggle: false };
const list = (s: { selected: ReadonlySet<number> }) => [...s.selected].sort((a, b) => a - b);

describe('glyph selection', () => {
  it('a plain click selects just that glyph and sets the anchor', () => {
    const s = clickGlyph(clickGlyph(NO_SELECTION, 2, plain), 4, plain);
    expect(list(s)).toEqual([4]);
    expect(s.anchor).toBe(4);
  });

  it('Shift+click selects the range from the anchor, in either direction', () => {
    const start = clickGlyph(NO_SELECTION, 2, plain);
    expect(list(clickGlyph(start, 5, { shift: true, toggle: false }))).toEqual([2, 3, 4, 5]);
    expect(list(clickGlyph(start, 0, { shift: true, toggle: false }))).toEqual([0, 1, 2]);
    // The anchor stays, so a second Shift+click re-ranges from the same glyph.
    const ranged = clickGlyph(start, 5, { shift: true, toggle: false });
    expect(list(clickGlyph(ranged, 3, { shift: true, toggle: false }))).toEqual([2, 3]);
  });

  it('Shift+click without an anchor selects the glyph', () => {
    expect(list(clickGlyph(NO_SELECTION, 3, { shift: true, toggle: false }))).toEqual([3]);
  });

  it('Ctrl/⌘+click toggles and moves the anchor; Ctrl+Shift extends', () => {
    let s = clickGlyph(NO_SELECTION, 1, plain);
    s = clickGlyph(s, 4, { shift: false, toggle: true });
    expect(list(s)).toEqual([1, 4]);
    s = clickGlyph(s, 1, { shift: false, toggle: true });
    expect(list(s)).toEqual([4]);
    // The anchor is the last glyph clicked (1), as in a file manager.
    s = clickGlyph(s, 6, { shift: true, toggle: true });
    expect(list(s)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('selectAll and clampSelection', () => {
    expect(list(selectAll(3))).toEqual([0, 1, 2]);
    const s = clampSelection(selectAll(5), 2);
    expect(list(s)).toEqual([0, 1]);
    const unchanged = selectAll(2);
    expect(clampSelection(unchanged, 5)).toBe(unchanged);
  });

  it('a marquee selects what it touches, or adds it with Ctrl/⌘ or Shift', () => {
    const base = clickGlyph(NO_SELECTION, 7, plain);
    const replaced = marqueeSelection(base, [4, 2, 3], false);
    expect(list(replaced)).toEqual([2, 3, 4]);
    expect(replaced.anchor).toBe(2); // a Shift range then starts from the first
    const added = marqueeSelection(base, [4, 2], true);
    expect(list(added)).toEqual([2, 4, 7]);
    expect(added.anchor).toBe(7);
    expect(list(marqueeSelection(base, [], false))).toEqual([]);
    expect(list(marqueeSelection(base, [], true))).toEqual([7]);
  });
});
