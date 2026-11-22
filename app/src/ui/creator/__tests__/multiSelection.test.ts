// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clampMulti,
  clickMulti,
  marqueeMulti,
  NO_MULTI,
  selectAllMulti,
  targetsOf,
  type MultiSelection,
} from '../multiSelection';

const plain = { shift: false, toggle: false };
const view = (s: MultiSelection) =>
  Object.fromEntries([...s].map(([id, g]) => [id, [...g.selected].sort((a, b) => a - b)]));

describe('glyph selection across formulas', () => {
  it('a click selects one glyph of one formula; Ctrl/⌘ and Shift keep the others', () => {
    let s = clickMulti(NO_MULTI, 'a', 2, plain);
    s = clickMulti(s, 'b', 0, { shift: false, toggle: true });
    expect(view(s)).toEqual({ a: [2], b: [0] });
    s = clickMulti(s, 'b', 3, { shift: true, toggle: false }); // range from b's anchor
    expect(view(s)).toEqual({ a: [2], b: [0, 1, 2, 3] });
    s = clickMulti(s, 'a', 2, { shift: false, toggle: true }); // toggled off: a is dropped
    expect(view(s)).toEqual({ b: [0, 1, 2, 3] });
    expect(view(clickMulti(s, 'a', 1, plain))).toEqual({ a: [1] });
  });

  it('a marquee selects what it touches in any formula, or adds it', () => {
    const base = clickMulti(NO_MULTI, 'a', 0, plain);
    const touched = new Map([
      ['b', [1, 2]],
      ['c', [0]],
    ]);
    expect(view(marqueeMulti(base, touched, false))).toEqual({ b: [1, 2], c: [0] });
    expect(view(marqueeMulti(base, touched, true))).toEqual({ a: [0], b: [1, 2], c: [0] });
    expect(view(marqueeMulti(base, new Map(), false))).toEqual({});
  });

  it('selects all, clamps to the formulas there are, and lists the targets in order', () => {
    const counts = new Map([
      ['a', 2],
      ['b', 0],
      ['c', 1],
    ]);
    const all = selectAllMulti(counts);
    expect(view(all)).toEqual({ a: [0, 1], c: [0] });
    const s = clickMulti(clickMulti(NO_MULTI, 'c', 5, plain), 'x', 0, plain);
    expect(
      view(clampMulti(clickMulti(all, 'a', 4, { shift: false, toggle: true }), counts)),
    ).toEqual({ a: [0, 1], c: [0] });
    expect(view(clampMulti(s, counts))).toEqual({});
    expect(targetsOf(all, ['c', 'a'])).toEqual([
      { id: 'c', glyphs: [0] },
      { id: 'a', glyphs: [0, 1] },
    ]);
  });
});
