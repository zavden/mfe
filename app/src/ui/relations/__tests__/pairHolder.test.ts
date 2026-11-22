// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMorph, type MorphAction } from '../../../model';
import { linkPair, removePair, removePairs, setPairStyle, setPairsStyle } from '../relationOps';

/* The pair operations of the relation editor on another holder of pairs: a Morph block keeps
 * its kind, id, timing and settings through every one of them. */
describe('pair operations on a Morph block', () => {
  const morph = createMorph(2, { style: 'copy', pathArc: 30 });
  const settings = (m: MorphAction) => ({ ...m, pairs: [] });

  it('links, restyles and removes pairs and keeps the rest of the block', () => {
    const linked = linkPair(morph, [2, 1], [5, 4]);
    if (!linked.ok) throw new Error(linked.message);
    const one: MorphAction = linked.relation;
    expect(one.pairs).toEqual([{ from: [1, 2], to: [4, 5], style: null }]);
    expect(settings(one)).toEqual(settings(morph));
    // The block's style is what pairs inherit: copies may share a source…
    const two = linkPair(one, [1], [7]);
    expect(two.ok).toBe(true);
    // …but a consuming pair cannot take a glyph another one consumes.
    const consumed = setPairStyle(one, 0, 'transform');
    expect(consumed.pairs[0]!.style).toBe('transform');
    expect(linkPair(consumed, [2], [8], 'fade')).toMatchObject({ ok: false });
    // Linking onto a target that has a pair adds the source to that pair.
    const joined = linkPair(one, [3], [5]);
    expect(joined.ok && joined.relation.pairs).toEqual([
      { from: [1, 2, 3], to: [4, 5], style: null },
    ]);
    const both = two.ok ? two.relation : one;
    expect(setPairsStyle(both, [0, 1], 'fade').pairs.map((p) => p.style)).toEqual(['fade', 'fade']);
    expect(removePair(both, 0).pairs).toEqual([{ from: [1], to: [7], style: null }]);
    expect(settings(removePairs(both, [0, 1]))).toEqual(settings(morph));
  });
});
