// @vitest-environment node
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createAttach,
  createClip,
  createDisappear,
  createMorph,
  createPartTransform,
  createTween,
  droppedTotal,
  emptyRemapReport,
  remapGlyphRefs,
  type TweenAction,
} from '../index';
import { smallProject } from './fixtures';

/** The glyphs a clip's attachment names (a label beside some glyphs). */
const glyphsOf = (clip: { attach: unknown }) =>
  (clip.attach as { glyphs?: unknown } | null)?.glyphs;

describe('remapGlyphRefs', () => {
  it('remaps colours of the formula and its clips, and the matching pair side', () => {
    const p = smallProject();
    const [a, b] = p.formulas;
    const [ca] = p.clips;
    a!.glyphColors = { '0': '#FF0000', '2': '#00FF00' };
    ca!.initial.glyphColors = { '4': '#0000FF' };
    ca!.actions.push(createTween(1.5, 0.5, { glyphColors: { '1': '#FFFF00' } }));
    a!.hiddenGlyphs = [0, 4];
    b!.glyphColors = { '0': '#123456' };

    // a+b=c → b+a=c: a 0→2, + 1→1, b 2→0, = 3→3, c 4→4
    const next = produce(p, (draft) => {
      const report = remapGlyphRefs(draft, a!.id, [2, 1, 0, 3, 4]);
      expect(report).toEqual({
        droppedColors: 0,
        droppedHidden: 0,
        droppedPairGlyphs: 0,
        droppedPairs: 0,
        droppedActionGlyphs: 0,
        droppedAttachGlyphs: 0,
        detached: 0,
        droppedFits: 0,
      });
    });

    expect(next.formulas[0]!.glyphColors).toEqual({ '2': '#FF0000', '0': '#00FF00' });
    expect(next.formulas[0]!.hiddenGlyphs).toEqual([2, 4]); // kept ascending
    expect(next.clips[0]!.initial.glyphColors).toEqual({ '4': '#0000FF' });
    expect((next.clips[0]!.actions[0] as TweenAction).to.glyphColors).toEqual({ '1': '#FFFF00' });
    // Relation a → b: only the source side belongs to formula a.
    expect(next.relations[0]!.pairs).toEqual([{ from: [2], to: [3], style: null }]);
    // Other formulas are untouched; the input project is not mutated.
    expect(next.formulas[1]!.glyphColors).toEqual({ '0': '#123456' });
    expect(p.formulas[0]!.glyphColors).toEqual({ '0': '#FF0000', '2': '#00FF00' });
  });

  it('drops references to glyphs without a counterpart and empty pairs', () => {
    const p = smallProject();
    const [a] = p.formulas;
    a!.glyphColors = { '0': '#FF0000', '1': '#00FF00' };
    a!.hiddenGlyphs = [0, 1];
    p.relations[0]!.pairs.push({ from: [1, 2], to: [0], style: null });

    const report = remapGlyphRefs(p, a!.id, [null, 0]);

    expect(report).toEqual({
      droppedColors: 1,
      droppedHidden: 1,
      droppedPairGlyphs: 2,
      droppedPairs: 1,
      droppedActionGlyphs: 0,
      droppedAttachGlyphs: 0,
      detached: 0,
      droppedFits: 0,
    });
    expect(a!.glyphColors).toEqual({ '0': '#00FF00' });
    expect(a!.hiddenGlyphs).toEqual([0]);
    expect(p.relations[0]!.pairs).toEqual([{ from: [0], to: [0], style: null }]);
  });

  it('remaps the glyph lists of actions, keeping them ascending; "all" stays', () => {
    const p = smallProject();
    const [a] = p.formulas;
    const [ca] = p.clips;
    ca!.actions.push(
      createAppear(1, 'write', [0, 2, 4]),
      createDisappear(1.5, 'fade_out', 'all'),
      createPartTransform(2, [1, 3], { shift: [1, 0] }),
    );
    // 0 → 3, 1 → gone, 2 → 0, 3 → 0 (merged), 4 → 1
    const report = remapGlyphRefs(p, a!.id, [3, null, 0, 0, 1]);
    expect(report.droppedActionGlyphs).toBe(1);
    const [appear, disappear, transform] = ca!.actions;
    expect(appear?.kind === 'appear' && appear.glyphs).toEqual([0, 1, 3]);
    expect(disappear?.kind === 'disappear' && disappear.glyphs).toBe('all');
    expect(transform?.kind === 'transform' && transform.glyphs).toEqual([0]);
  });

  it('remaps both sides of a relation between two clips of the same formula', () => {
    const p = smallProject();
    const [a] = p.formulas;
    const [t1, t2] = p.tracks;
    const c1 = createClip(a!.id, t1!.id, 10, 12);
    const c2 = createClip(a!.id, t2!.id, 11, 13);
    p.clips.push(c1, c2);
    p.relations = [
      {
        id: 'r_self',
        fromClipId: c1.id,
        toClipId: c2.id,
        offset: 0,
        duration: 1,
        easing: 'smooth',
        style: 'transform',
        pathArc: 0,
        pairs: [{ from: [0, 4], to: [4, 0], style: null }],
      },
    ];

    remapGlyphRefs(p, a!.id, [1, 1, 2, 3, 0]);

    expect(p.relations[0]!.pairs).toEqual([{ from: [1, 0], to: [0, 1], style: null }]);
  });
});

describe('remapGlyphRefs: morph blocks', () => {
  it('remaps both sides of the pairs, drops a pair left without a side and keeps the order', () => {
    const p = smallProject();
    const [a] = p.formulas;
    const [ca] = p.clips;
    const morph = createMorph(1.5, {
      pairs: [
        { from: [4], to: [0], style: null },
        { from: [1], to: [2, 3], style: 'copy' },
        { from: [0, 2], to: [3], style: null },
      ],
    });
    ca!.actions.push(morph);
    // a+b=c → a+b=: c (4) is gone, b (2) and = (3) swap places.
    const next = produce(p, (draft) => {
      const report = remapGlyphRefs(draft, a!.id, [0, 1, 3, 2, null]);
      expect(report.droppedPairs).toBe(1);
      expect(report.droppedPairGlyphs).toBe(1);
    });
    const remapped = next.clips[0]!.actions[0]!;
    if (remapped.kind !== 'morph') throw new Error('not a morph');
    expect(remapped.pairs).toEqual([
      { from: [1], to: [3, 2], style: 'copy' },
      { from: [0, 3], to: [2], style: null },
    ]);
    // The other formula's clips are left alone.
    expect(next.clips[0]!.actions[0]).not.toBe(morph);
    expect(morph.pairs).toHaveLength(3);
  });

  it('drops a glyph that lands on both sides of a pair, and the pair when that empties a side', () => {
    const p = smallProject();
    const [a] = p.formulas;
    p.clips[0]!.actions.push(
      createMorph(1.5, {
        pairs: [
          { from: [2], to: [3], style: null }, // 2 and 3 collapse onto one glyph: gone
          { from: [1, 2], to: [3, 4], style: null }, // keeps 1 → 4
        ],
      }),
    );
    // a+b=c → a+bc: b (2) and = (3) collapse onto 2, c (4) becomes 3.
    const next = produce(p, (draft) => {
      const report = remapGlyphRefs(draft, a!.id, [0, 1, 2, 2, 3]);
      expect(report.droppedPairs).toBe(1);
      expect(report.droppedPairGlyphs).toBe(4);
    });
    const remapped = next.clips[0]!.actions[0]!;
    if (remapped.kind !== 'morph') throw new Error('not a morph');
    expect(remapped.pairs).toEqual([{ from: [1], to: [3], style: null }]);
  });
});

describe('remapGlyphRefs: attached objects', () => {
  it('remaps the glyphs an object hangs on, ascending; detaches one left without any', () => {
    const p = smallProject();
    const [a, b] = p.formulas;
    const [ca, cb] = p.clips;
    const [t1] = p.tracks;
    const c3 = createClip(b!.id, t1!.id, 5, 6, { attach: createAttach(ca!.id, [3, 1]) });
    const c4 = createClip(b!.id, t1!.id, 6, 7, { attach: createAttach(ca!.id, [1]) });
    const c5 = createClip(b!.id, t1!.id, 7, 8, { attach: createAttach(ca!.id, 'all') });
    const c6 = createClip(a!.id, t1!.id, 8, 9, { attach: createAttach(cb!.id, [1]) });
    p.clips.push(c3, c4, c5, c6);
    // 0 → 3, 1 → gone, 2 → 0, 3 → 0 (merged), 4 → 1
    const report = remapGlyphRefs(p, a!.id, [3, null, 0, 0, 1]);
    expect(report.droppedAttachGlyphs).toBe(2);
    expect(report.detached).toBe(1);
    expect(glyphsOf(p.clips[2]!)).toEqual([0]);
    expect(p.clips[3]!.attach).toBeNull();
    expect(glyphsOf(p.clips[4]!)).toBe('all');
    // Attached to a clip of another formula: untouched.
    expect(glyphsOf(p.clips[5]!)).toEqual([1]);
  });
});

describe('remap reports', () => {
  it('count everything a remap dropped', () => {
    expect(droppedTotal(emptyRemapReport())).toBe(0);
    expect(droppedTotal({ ...emptyRemapReport(), droppedColors: 2, droppedPairs: 1 })).toBe(3);
    expect(droppedTotal({ ...emptyRemapReport(), droppedAttachGlyphs: 1, detached: 1 })).toBe(2);
  });
});
