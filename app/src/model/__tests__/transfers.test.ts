// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createMorph,
  createRelation,
} from '../defaults';
import {
  effectiveExtras,
  glyphTransfers,
  isMorphKey,
  sourceRoles,
  transferKey,
} from '../transfers';
import type { PathSpline } from '../types';

/** A custom path: the chord with its middle pulled aside. */
const bump: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.3, 0.3], smooth: false },
    { at: [1, 0], in: [0.7, 0.3], out: null, smooth: false },
  ],
};

describe('glyphTransfers', () => {
  it('lowers each relation to a keyed transfer with its window and effective pair styles', () => {
    const p = createEmptyProject('t');
    const [f1, f2] = [
      createFormula({ name: 'a', source: 'a' }),
      createFormula({ name: 'b', source: 'b' }),
    ];
    p.formulas.push(f1, f2);
    const a = createClip(f1.id, p.tracks[0]!.id, 0, 6);
    const b = createClip(f2.id, p.tracks[1]!.id, 2, 8);
    p.clips.push(a, b);
    const relation = createRelation(a.id, b.id, {
      offset: 1,
      duration: 0.5,
      style: 'copy',
      easing: 'linear',
      pathArc: 30,
      pairs: [
        { from: [0], to: [1], style: null },
        { from: [1, 2], to: [0], style: 'fade', path: bump },
      ],
    });
    p.relations.push(relation);
    const [transfer, ...rest] = glyphTransfers(p);
    expect(rest).toEqual([]);
    expect(transfer).toEqual({
      key: `relation:${relation.id}`,
      origin: { kind: 'relation', relationId: relation.id },
      fromClipId: a.id,
      toClipId: b.id,
      start: 3, // b.start + offset
      end: 3.5,
      easing: 'linear',
      style: 'copy',
      pathArc: 30,
      pairs: [
        { from: [0], to: [1], style: 'copy', extras: 'merge', path: null, routes: [] },
        { from: [1, 2], to: [0], style: 'fade', extras: 'separate', path: bump, routes: [] },
      ],
      path: ['relations', 0],
    });
    expect(transferKey(transfer!.origin)).toBe(transfer!.key);
    // The pairs are copies: the project is left alone.
    transfer!.pairs[0]!.from.push(9);
    expect(relation.pairs[0]!.from).toEqual([0]);
  });

  it('lowers a morph block to a transfer from its clip to itself, after the relations', () => {
    const p = createEmptyProject('t');
    const f = createFormula({ name: 'a', source: 'a &= b \\\\ &= c' });
    p.formulas.push(f);
    const a = createClip(f.id, p.tracks[0]!.id, 1, 9);
    const b = createClip(f.id, p.tracks[1]!.id, 0, 9);
    p.clips.push(a, b);
    const morph = createMorph(2, {
      duration: 1.5,
      easing: 'linear',
      pathArc: 20,
      pairs: [
        { from: [1, 2], to: [3, 4], style: null },
        { from: [0], to: [5], style: 'transform' },
      ],
    });
    a.actions.push(morph);
    const relation = createRelation(b.id, a.id, { pairs: [{ from: [0], to: [6], style: null }] });
    p.relations.push(relation);
    const transfers = glyphTransfers(p);
    expect(transfers.map((t) => t.key)).toEqual([`relation:${relation.id}`, `morph:${morph.id}`]);
    expect(transfers[1]).toEqual({
      key: `morph:${morph.id}`,
      origin: { kind: 'morph', clipId: a.id, actionId: morph.id },
      fromClipId: a.id,
      toClipId: a.id,
      start: 3, // a.start + morph.start
      end: 4.5,
      easing: 'linear',
      style: 'copy',
      pathArc: 20,
      pairs: [
        { from: [1, 2], to: [3, 4], style: 'copy', extras: 'merge', path: null, routes: [] },
        { from: [0], to: [5], style: 'transform', extras: 'merge', path: null, routes: [] },
      ],
      path: ['clips', 0, 'actions', 0],
    });
    expect(transferKey(transfers[1]!.origin)).toBe(transfers[1]!.key);
    expect(isMorphKey(transfers[1]!.key)).toBe(true);
    expect(isMorphKey(transfers[0]!.key)).toBe(false);
    // The pairs are copies: the project is left alone.
    transfers[1]!.pairs[0]!.to.push(9);
    expect(morph.pairs[0]!.to).toEqual([3, 4]);
  });

  it('leaves out a relation to or from a clip that is not there', () => {
    const p = createEmptyProject('t');
    const f = createFormula({ name: 'a', source: 'a' });
    p.formulas.push(f);
    const a = createClip(f.id, p.tracks[0]!.id, 0, 6);
    p.clips.push(a);
    p.relations.push(
      createRelation(a.id, 'gone', { pairs: [{ from: [0], to: [0], style: null }] }),
    );
    p.relations.push(
      createRelation('gone', a.id, { pairs: [{ from: [0], to: [0], style: null }] }),
    );
    expect(glyphTransfers(p)).toEqual([]);
  });
});

describe('effectiveExtras and sourceRoles (D54)', () => {
  it('applies to pairs of several sources and one target only, separate unless stored', () => {
    expect(effectiveExtras({ from: [1, 14], to: [8] })).toBe('separate');
    expect(effectiveExtras({ from: [1, 14], to: [8], extras: 'copies' })).toBe('copies');
    expect(effectiveExtras({ from: [1, 14], to: [8], extras: 'merge' })).toBe('merge');
    expect(effectiveExtras({ from: [1], to: [8], extras: 'copies' })).toBe('merge');
    expect(effectiveExtras({ from: [1, 2], to: [8, 9], extras: 'copies' })).toBe('merge');
    expect(effectiveExtras({ from: [1, 1], to: [8] })).toBe('merge'); // one source, repeated
  });

  it('consumes every source, copies them all, or consumes the first and copies the rest', () => {
    const pair = { from: [14, 1], to: [8] };
    expect(sourceRoles(pair, 'transform')).toEqual({ consumed: [1, 14], copied: [], lead: null });
    expect(sourceRoles(pair, 'fade')).toEqual({ consumed: [1, 14], copied: [], lead: null });
    expect(sourceRoles(pair, 'copy')).toEqual({ consumed: [], copied: [1, 14], lead: null });
    expect(sourceRoles({ ...pair, extras: 'copies' }, 'transform')).toEqual({
      consumed: [1],
      copied: [14],
      lead: 1,
    });
    expect(sourceRoles({ ...pair, extras: 'copies' }, 'copy')).toEqual({
      consumed: [],
      copied: [1, 14],
      lead: null,
    });
    // `copies` on a one-to-one pair means nothing: the source is consumed.
    expect(sourceRoles({ from: [3], to: [8], extras: 'copies' }, 'transform')).toEqual({
      consumed: [3],
      copied: [],
      lead: null,
    });
  });
});
