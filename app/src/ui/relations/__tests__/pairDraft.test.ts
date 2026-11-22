import { describe, expect, it } from 'vitest';
import type { GlyphPair } from '../../../model';
import { describeDropped, rebasePairs, rebaseSelection, transitionFor } from '../pairDraft';

const pair = (from: number[], to: number[]): GlyphPair => ({ from, to, style: null });

describe('pairDraft', () => {
  it('rebases the authored copies principal without promoting a lower mapped index', () => {
    const original: GlyphPair = {
      from: [0, 1],
      to: [3],
      style: null,
      extras: 'copies',
      principal: 0,
    };
    expect(rebasePairs([original], 'from', [2, 0, 1, 3]).pairs).toEqual([
      { ...original, from: [2, 0], principal: 2 },
    ]);
  });

  it('keeps a lost-principal copies pair available for manual repair, even with no sources', () => {
    const original: GlyphPair = { from: [0], to: [2], style: null, extras: 'copies', principal: 0 };
    const result = rebasePairs([original], 'from', [null, 0, 1]);
    expect(result.pairs).toEqual([{ ...original, from: [], principal: null }]);
    expect(result.droppedPairs).toBe(0);
    expect(rebasePairs(result.pairs, 'to', [0, 1, null]).pairs).toEqual([]);
  });

  it('takes one side of the pairs through a transition, keeping their order', () => {
    // Glyph 0 and 1 swap places, 2 is gone, 3 stays.
    const map = [1, 0, null, 3];
    const result = rebasePairs([pair([0], [5]), pair([1, 2], [6]), pair([2], [7])], 'from', map);
    expect(result.pairs).toEqual([pair([1], [5]), pair([0], [6])]);
    expect(result.droppedPairs).toBe(1);
    expect(result.droppedGlyphs).toBe(1);
    // The other side is left alone; two old glyphs onto one new one are not repeated.
    expect(rebasePairs([pair([0], [0, 1])], 'to', [2, 2]).pairs).toEqual([pair([0], [2])]);
    expect(describeDropped(result)).toBe('1 pair and 1 glyph');
    expect(describeDropped({ pairs: [], droppedPairs: 2, droppedGlyphs: 0 })).toBe('2 pairs');
  });

  it('takes a selection through a transition', () => {
    expect([...rebaseSelection(new Set([0, 2, 3]), [1, 0, null, 3])]).toEqual([1, 3]);
  });

  it('knows the transition that leads from the draft’s snapshot to the current one', () => {
    const transitions = { f: { from: 'k1', to: 'k2', map: [0, 1] } };
    expect(transitionFor(transitions, 'f', 'k1', 'k2')).toBe(transitions.f);
    expect(transitionFor(transitions, 'f', 'k0', 'k2')).toBeNull(); // two steps: unknown
    expect(transitionFor(transitions, 'f', 'k1', 'k3')).toBeNull();
    expect(transitionFor(transitions, 'g', 'k1', 'k2')).toBeNull();
    expect(transitionFor(transitions, 'f', null, 'k2')).toBeNull();
  });
});
