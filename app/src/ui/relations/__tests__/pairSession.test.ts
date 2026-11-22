import { describe, expect, it } from 'vitest';
import type { GlyphPair } from '../../../model';
import {
  changed,
  dropSharedGlyphs,
  identified,
  idsAt,
  indicesOf,
  reconcile,
  stripIds,
  type DraftPair,
  type Sides,
} from '../pairSession';

const pair = (from: number[], to: number[]): GlyphPair => ({ from, to, style: null });
const draft = (id: number, from: number[], to: number[]): DraftPair => ({ ...pair(from, to), id });
const none = { from: new Set<number>(), to: new Set<number>() };

describe('pair identity', () => {
  it('does not promote a Morph source when a shared glyph removes its principal', () => {
    const original: GlyphPair = {
      from: [0, 1],
      to: [0, 2],
      style: null,
      extras: 'copies',
      principal: 0,
    };
    expect(dropSharedGlyphs([original]).pairs).toEqual([
      { ...original, from: [1], to: [2], principal: null },
    ]);
  });

  it('gives ids to the pairs without one and keeps the ones they have', () => {
    const first = identified([pair([0], [1]), pair([2], [3])], 1);
    expect(first.pairs.map((p) => p.id)).toEqual([1, 2]);
    expect(first.next).toBe(3);
    // An operation spreads the pairs it changes and makes new ones: the ids travel, the new
    // pair takes the next id.
    const edited = [
      { ...first.pairs[1]!, style: 'fade' as const },
      pair([4], [5]),
      first.pairs[0]!,
    ];
    const again = identified(edited, first.next);
    expect(again.pairs.map((p) => p.id)).toEqual([2, 3, 1]);
    expect(again.next).toBe(4);
    expect(stripIds(again.pairs)).toEqual([
      { from: [2], to: [3], style: 'fade' },
      pair([4], [5]),
      pair([0], [1]),
    ]);
  });

  it('maps places to ids and back, leaving out what is gone', () => {
    const pairs = [draft(7, [0], [1]), draft(9, [2], [3]), draft(4, [4], [5])];
    expect(idsAt(pairs, [2, 0, 5])).toEqual([4, 7]);
    expect(indicesOf(pairs, [4, 7, 99])).toEqual([0, 2]); // the draft's order
  });

  it('compares drafts without their ids', () => {
    const base = [draft(1, [0], [1])];
    expect(changed([draft(5, [0], [1])], base)).toBe(false);
    expect(changed([draft(1, [0], [2])], base)).toBe(true);
    expect(changed([], base)).toBe(true);
  });
});

describe('reconcile', () => {
  const sides = (from: string | null, to: string | null): Sides => ({
    from: { id: 'fa', name: 'f1', key: from },
    to: { id: 'fb', name: 'f2', key: to },
  });
  const state = {
    keys: { from: 'a1', to: 'b1' },
    pairs: [draft(1, [0, 2], [0]), draft(2, [1], [1, 3])],
    base: [draft(1, [0, 2], [0])],
    selection: { from: new Set([0, 2]), to: new Set([3]) },
    suggestion: [draft(3, [3], [2])],
  };

  it('leaves everything alone while the snapshots are the ones the draft refers to', () => {
    const out = reconcile(state, sides('a1', 'b1'), {});
    expect(out.keys).toBe(state.keys);
    expect(out.pairs).toBe(state.pairs);
    expect(out.stale).toBeNull();
    expect(out.rebased).toBe(false);
    expect(out.dropped).toBeNull();
  });

  it('takes a side through a known transition: draft, baseline, selection and suggestion', () => {
    // On f1: glyph 0 and 1 swap, 2 is gone, 3 stays.
    const transitions = { fa: { from: 'a1', to: 'a2', map: [1, 0, null, 3] } };
    const out = reconcile(state, sides('a2', 'b1'), transitions);
    expect(out.keys).toEqual({ from: 'a2', to: 'b1' });
    expect(out.pairs).toEqual([draft(1, [1], [0]), draft(2, [0], [1, 3])]);
    expect(out.base).toEqual([draft(1, [1], [0])]);
    expect([...out.selection.from]).toEqual([1]);
    expect([...out.selection.to]).toEqual([3]); // the other side as it was
    expect(out.suggestion).toEqual([draft(3, [3], [2])]);
    expect(out.rebased).toBe(true);
    expect(out.stale).toBeNull();
    expect(out.dropped).toBe('“f1” was re-rendered: 1 glyph left the draft.');
    // Both sides at once, each through its own formula's transition.
    const both = reconcile(state, sides('a2', 'b2'), {
      ...transitions,
      fb: { from: 'b1', to: 'b2', map: [null, 0, null, null] },
    });
    expect(both.pairs).toEqual([draft(2, [0], [0])]);
    expect(both.dropped).toBe(
      '“f1” was re-rendered: 1 glyph left the draft. “f2” was re-rendered: 1 pair and 1 glyph left the draft.',
    );
  });

  it('holds the draft stale on an unknown step, until the snapshot comes back', () => {
    const out = reconcile(state, sides('a3', 'b1'), { fa: { from: 'a1', to: 'a2', map: [0] } });
    expect(out.stale).toBe(
      '“f1” was re-rendered while you edited: close the editor and open it again.',
    );
    expect(out.keys).toEqual(state.keys);
    expect(out.pairs).toBe(state.pairs);
    expect(out.rebased).toBe(false);
    // Back on the snapshot the draft refers to: good again.
    expect(reconcile({ ...state }, sides('a1', 'b1'), {}).stale).toBeNull();
  });

  it('adopts a first snapshot without re-basing anything', () => {
    const out = reconcile({ ...state, keys: { from: null, to: 'b1' } }, sides('a1', 'b1'), {});
    expect(out.keys).toEqual({ from: 'a1', to: 'b1' });
    expect(out.pairs).toBe(state.pairs);
    expect(out.rebased).toBe(false);
  });

  it('on a Morph block takes both sides through the one transition and parts shared glyphs', () => {
    const self: Sides = {
      from: { id: 'f', name: 'steps', key: 'k2' },
      to: { id: 'f', name: 'steps', key: 'k2' },
    };
    // Glyphs 1 and 2 merge into 1: the pair 1 → 2 would turn a glyph into itself.
    const transitions = { f: { from: 'k1', to: 'k2', map: [0, 1, 1, 2] } };
    const out = reconcile(
      {
        keys: { from: 'k1', to: 'k1' },
        pairs: [draft(1, [0], [3]), draft(2, [1], [2])],
        base: [],
        selection: none,
        suggestion: null,
      },
      self,
      transitions,
      true,
    );
    expect(out.keys).toEqual({ from: 'k2', to: 'k2' });
    expect(out.pairs).toEqual([draft(1, [0], [2])]);
    expect(out.dropped).toBe('“steps” was re-rendered: 1 pair and 2 glyphs left the draft.');
  });

  it('dropSharedGlyphs parts a glyph on both sides and drops a pair left one-sided', () => {
    const out = dropSharedGlyphs([pair([0, 1], [1, 2]), pair([3], [3]), pair([4], [5])]);
    expect(out.pairs).toEqual([pair([0], [2]), pair([4], [5])]);
    expect(out.droppedPairs).toBe(1);
    expect(out.droppedGlyphs).toBe(4);
  });
});
