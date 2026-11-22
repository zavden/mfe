// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  validateProject,
  type GlyphPair,
  type PathSpline,
} from '../../../model';
import { boxSnapshot } from '../../../model/__tests__/fixtures';
import {
  joinable,
  joinBlocker,
  joinPairs,
  pairsOfTarget,
  splitPair,
  splittable,
} from '../pairShare';
import { editedRoutes, linkPair, wearsEditedPath, type PairHolder } from '../relationOps';

/* A join taken apart and put back (D167): pairs of one holder that bring the same target. */

const curve = (v: number): PathSpline => ({
  nodes: [
    { at: [0, 0], in: null, out: [0.3, v], smooth: false },
    { at: [1, 0], in: [0.7, v], out: null, smooth: false },
  ],
});
const holder = (pairs: GlyphPair[], style: PairHolder['style'] = 'transform'): PairHolder => ({
  pairs,
  style,
});

describe('splitPair', () => {
  it('makes a pair of each source, in the place of the pair and in glyph order', () => {
    const before = holder([
      { from: [9], to: [9], style: null },
      { from: [4, 1, 2], to: [7], style: 'fade' },
      { from: [8], to: [8], style: null },
    ]);
    expect(splittable(before.pairs[1]!)).toBe(true);
    expect(splitPair(before, 1).pairs).toEqual([
      { from: [9], to: [9], style: null },
      { from: [1], to: [7], style: 'fade' },
      { from: [2], to: [7], style: 'fade' },
      { from: [4], to: [7], style: 'fade' },
      { from: [8], to: [8], style: null },
    ]);
  });

  it('gives each source the path it followed: its route’s own, else the pair’s', () => {
    const own = curve(0.5);
    const common = curve(-0.2);
    const pair: GlyphPair = {
      from: [0, 1],
      to: [3],
      style: null,
      path: common,
      routes: [{ from: 1, to: 3, path: own }],
    };
    expect(splitPair(holder([pair]), 0).pairs).toEqual([
      { from: [0], to: [3], style: null, path: common },
      { from: [1], to: [3], style: null, path: own },
    ]);
  });

  it('keeps what each source played: the others of a copies pair become copies', () => {
    const pair: GlyphPair = {
      from: [0, 1, 2],
      to: [3],
      style: null,
      extras: 'copies',
      principal: 1,
    };
    expect(splitPair(holder([pair]), 0).pairs).toEqual([
      { from: [0], to: [3], style: 'copy' },
      { from: [1], to: [3], style: null },
      { from: [2], to: [3], style: 'copy' },
    ]);
    // A pair that copies everything keeps its own style on every part.
    const copies: GlyphPair = { from: [0, 1], to: [3], style: 'copy', extras: 'copies' };
    expect(splitPair(holder([copies]), 0).pairs.map((p) => p.style)).toEqual(['copy', 'copy']);
  });

  it('leaves alone what cannot be taken apart: one source, or several targets', () => {
    const one = holder([{ from: [0], to: [3], style: null }]);
    expect(splittable(one.pairs[0]!)).toBe(false);
    expect(splitPair(one, 0)).toBe(one);
    const wide = holder([{ from: [0, 1], to: [3, 4], style: null }]);
    expect(splittable(wide.pairs[0]!)).toBe(false);
    expect(splitPair(wide, 0)).toBe(wide);
    expect(splitPair(one, 5)).toBe(one);
  });
});

describe('joinPairs', () => {
  it('puts the pairs that bring one target into one, in the place of the first', () => {
    const before = holder([
      { from: [2], to: [7], style: null },
      { from: [8], to: [8], style: null },
      { from: [1], to: [7], style: null },
      { from: [4], to: [7], style: null },
    ]);
    expect(pairsOfTarget(before.pairs, 2)).toEqual([0, 2, 3]);
    expect(joinable(before.pairs, 0)).toBe(true);
    expect(joinable(before.pairs, 1)).toBe(false);
    const joined = joinPairs(before, 3)!;
    expect(joined).toMatchObject({ index: 0, from: [0, 2, 3] });
    expect(joined.holder.pairs).toEqual([
      { from: [1, 2, 4], to: [7], style: null },
      { from: [8], to: [8], style: null },
    ]);
    expect(joinPairs(before, 1)).toBeNull();
  });

  it('keeps each source on its path: one common path, or routes of their own', () => {
    const a = curve(0.5);
    const b = curve(-0.2);
    const same = joinPairs(
      holder([
        { from: [0], to: [3], style: null, path: a },
        { from: [1], to: [3], style: null, path: structuredClone(a) },
      ]),
      0,
    )!;
    expect(same.holder.pairs).toEqual([{ from: [0, 1], to: [3], style: null, path: a }]);
    const apart = joinPairs(
      holder([
        { from: [0], to: [3], style: null, path: a },
        { from: [1], to: [3], style: null, path: b },
        { from: [2], to: [3], style: null },
      ]),
      0,
    )!;
    expect(apart.holder.pairs).toEqual([
      {
        from: [0, 1, 2],
        to: [3],
        style: null,
        routes: [
          { from: 0, to: 3, path: a },
          { from: 1, to: 3, path: b },
        ],
      },
    ]);
  });

  it('is the way back from a split', () => {
    const own = curve(0.5);
    for (const pair of [
      { from: [0, 1, 2], to: [3], style: 'fade' as const },
      { from: [0, 1], to: [3], style: null, routes: [{ from: 1, to: 3, path: own }] },
      { from: [0, 1, 2], to: [3], style: null, extras: 'copies' as const, principal: 1 },
    ] satisfies GlyphPair[]) {
      const split = splitPair(holder([pair]), 0);
      expect(split.pairs).toHaveLength(pair.from.length);
      expect(joinBlocker(split, 0)).toBeNull();
      const back = joinPairs(split, 0)!;
      expect(back.holder.pairs).toEqual([pair]);
    }
  });

  it('refuses pairs that one pair could not play the same, and says why', () => {
    // A fade, a transform and a copy: as one pair, the copied glyph would be consumed.
    const mixed = holder([
      { from: [0], to: [3], style: 'fade' },
      { from: [1], to: [3], style: null },
      { from: [2], to: [3], style: 'copy' },
    ]);
    expect(joinBlocker(mixed, 1)).toBe(
      'The pairs have styles that one pair cannot hold: give them one style, or one style and copies.',
    );
    expect(joinPairs(mixed, 1)).toBeNull();
    // Two transforms and a copy: the same.
    const two = holder([
      { from: [0], to: [3], style: null },
      { from: [1], to: [3], style: null },
      { from: [2], to: [3], style: 'copy' },
    ]);
    expect(joinBlocker(two, 0)).not.toBeNull();
    // One style for all, or one that transforms with copies around it, can be joined.
    two.pairs[1] = { from: [1], to: [3], style: 'copy' };
    expect(joinBlocker(two, 0)).toBeNull();
    expect(joinPairs(two, 0)!.holder.pairs).toEqual([
      { from: [0, 1, 2], to: [3], style: null, extras: 'copies', principal: 0 },
    ]);
    // Nothing to join: no reason either.
    expect(joinBlocker(holder([{ from: [0], to: [3], style: null }]), 0)).toBeNull();
  });

  it('refuses a pair that merges its sources: joined, each of them would arrive on its own', () => {
    // a:0 and a:1 merge into b:3 (Manim's alignment: a:1 fades into the target); a:2 arrives
    // through a pair of its own, as «Link as ▸ Separate pair as Transform» makes it. One pair of
    // the three would play every source apart: a:1 would arrive whole (audit A3-01).
    const merged = holder([
      { from: [0, 1], to: [3], style: null, extras: 'merge' },
      { from: [2], to: [3], style: null },
    ]);
    const reason =
      'One of the pairs merges its sources («Merge (Manim)»): joined with another, each source would arrive on its own. Set it to «Separate» first.';
    expect(joinBlocker(merged, 0)).toBe(reason);
    expect(joinBlocker(merged, 1)).toBe(reason);
    expect(joinPairs(merged, 0)).toBeNull();
    // A fade that merges, the same.
    merged.pairs[0] = { from: [0, 1], to: [3], style: 'fade', extras: 'merge' };
    merged.pairs[1] = { from: [2], to: [3], style: 'fade' };
    expect(joinBlocker(merged, 0)).toBe(reason);
    // Set to «Separate», the two are one pair that plays what they played.
    merged.pairs[0] = { from: [0, 1], to: [3], style: 'fade', extras: 'separate' };
    expect(joinBlocker(merged, 0)).toBeNull();
    expect(joinPairs(merged, 0)!.holder.pairs).toEqual([
      { from: [0, 1, 2], to: [3], style: 'fade' },
    ]);
  });

  it('refuses pairs that hold one source twice, and a pair that plays nothing', () => {
    const twice = holder([
      { from: [0], to: [3], style: null },
      { from: [0], to: [3], style: 'copy' },
    ]);
    expect(joinBlocker(twice, 0)).toBe(
      'Two of the pairs hold the same source: one pair holds a glyph once.',
    );
    expect(joinPairs(twice, 0)).toBeNull();
    const lost = holder([
      { from: [0, 1], to: [3], style: null, extras: 'copies', principal: null },
      { from: [2], to: [3], style: null },
    ]);
    expect(joinBlocker(lost, 1)).toBe(
      'One of the pairs has lost its principal source: repair it first.',
    );
    expect(joinPairs(lost, 1)).toBeNull();
    // Nor is such a pair taken apart: its parts would start to play.
    expect(splittable(lost.pairs[0]!)).toBe(false);
    expect(splitPair(lost, 0)).toBe(lost);
  });
});

describe('linking onto targets that have pairs', () => {
  const label = { from: (g: number) => 'abc'[g]!, to: (g: number) => 'xyz'[g]! };

  it('joins the one pair, or stays a pair of its own when asked to', () => {
    const one = holder([{ from: [0], to: [1], style: null }]);
    const joined = linkPair(one, [2], [1], 'copy', label);
    expect(joined.ok && joined.relation.pairs).toEqual([{ from: [0, 2], to: [1], style: null }]);
    const apart = linkPair(one, [2], [1], 'copy', label, { separate: true });
    expect(apart.ok && apart.relation.pairs).toEqual([
      { from: [0], to: [1], style: null },
      { from: [2], to: [1], style: 'copy' },
    ]);
    expect(apart.ok && apart.message).toBeUndefined();
    // The same glyph twice onto one target would be one route played twice: whatever the style.
    for (const style of [null, 'copy'] as const) {
      expect(linkPair(one, [0, 2], [1], style, label, { separate: true })).toEqual({
        ok: false,
        message: 'Source glyph a (0) is in pair 1 already.',
      });
    }
    // Apart, a source that a pair onto ANOTHER target consumes can only be copied.
    const elsewhere = holder([
      { from: [0], to: [0], style: null },
      { from: [2], to: [1], style: null },
    ]);
    expect(linkPair(elsewhere, [0], [1], null, label, { separate: true })).toEqual({
      ok: false,
      message:
        'Source glyph a (0) is already consumed by another pair. Make one of the pairs a copy.',
    });
    expect(linkPair(elsewhere, [0], [1], 'copy', label, { separate: true }).ok).toBe(true);
  });

  it('is one more pair onto targets that several pairs bring, and says so', () => {
    const split = holder([
      { from: [0], to: [1], style: null },
      { from: [1], to: [1], style: 'copy' },
    ]);
    const more = linkPair(split, [2], [1], null, label);
    expect(more.ok && more.relation.pairs[2]).toEqual({ from: [2], to: [1], style: null });
    expect(more.ok && more.message).toBe(
      'Glyph c (2) made a pair of its own onto y (1), which 2 pairs bring already.',
    );
    // A source one of them holds is not linked onto that target again.
    expect(linkPair(split, [1], [1], 'copy', label)).toEqual({
      ok: false,
      message: 'Source glyph b (1) is in pair 2 already.',
    });
  });

  it('refuses a separate pair that would bring only some of a pair’s targets', () => {
    const wide = holder([{ from: [0], to: [1, 2], style: null }]);
    expect(linkPair(wide, [2], [1], null, label, { separate: true })).toEqual({
      ok: false,
      message: 'A separate pair brings the same targets as pair 1: y (1), z (2).',
    });
    // All of them, in any order: a pair of its own, with the targets in the pair's order.
    const whole = linkPair(wide, [2], [2, 1], 'copy', label, { separate: true });
    expect(whole.ok && whole.relation.pairs[1]).toEqual({ from: [2], to: [1, 2], style: 'copy' });
  });

  it('makes pairs the project accepts', () => {
    const project = createEmptyProject();
    const [a, b] = ['a', 'b'].map((name, i) => {
      const formula = createFormula({ name, snapshot: boxSnapshot(['w', 'x', 'y', 'z']) });
      project.formulas.push(formula);
      const clip = createClip(formula.id, project.tracks[i]!.id, 0, 10);
      project.clips.push(clip);
      return clip;
    });
    const relation = createRelation(a!.id, b!.id, {
      offset: 2,
      pairs: [{ from: [0, 1, 2], to: [3], style: null, extras: 'copies', principal: 0 }],
    });
    project.relations.push(relation);
    const errors = () => validateProject(project).filter((i) => i.severity === 'error');
    expect(errors()).toEqual([]);
    relation.pairs = splitPair(relation, 0).pairs;
    expect(relation.pairs).toHaveLength(3);
    expect(errors()).toEqual([]);
    relation.pairs = joinPairs(relation, 1)!.holder.pairs;
    expect(relation.pairs).toHaveLength(1);
    expect(errors()).toEqual([]);
  });
});

describe('the mark of an edited path', () => {
  const own = curve(0.5);
  const pair: GlyphPair = { from: [0, 1], to: [3], style: null };

  it('counts a route with a path of its own, when the pair plays that route', () => {
    const routed = { ...pair, routes: [{ from: 1, to: 3, path: own }] };
    expect(wearsEditedPath(pair, { pathArc: 0 })).toBe(false);
    expect(wearsEditedPath(routed, { pathArc: 0 })).toBe(true);
    expect(editedRoutes(routed, { pathArc: 0, style: 'transform' })).toHaveLength(1);
    // A fade that merges its sources plays no route: the stored path is not played.
    const merged = { ...routed, extras: 'merge' as const };
    expect(editedRoutes(merged, { pathArc: 0, style: 'fade' })).toEqual([]);
    expect(wearsEditedPath(merged, { pathArc: 0, style: 'fade' })).toBe(false);
  });

  it('does not count a route’s path that is what the route would follow anyway', () => {
    const same = { ...pair, path: own, routes: [{ from: 1, to: 3, path: structuredClone(own) }] };
    expect(editedRoutes(same, { pathArc: 0 })).toEqual([]);
    const chord: PathSpline = {
      nodes: [
        { at: [0, 0], in: null, out: null, smooth: false },
        { at: [1, 0], in: null, out: null, smooth: false },
      ],
    };
    expect(
      editedRoutes({ ...pair, routes: [{ from: 1, to: 3, path: chord }] }, { pathArc: 0 }),
    ).toEqual([]);
    // Against the pair's curve, a straight route is a path of its own.
    expect(
      editedRoutes(
        { ...pair, path: own, routes: [{ from: 1, to: 3, path: chord }] },
        { pathArc: 0 },
      ),
    ).toHaveLength(1);
  });
});

describe('pairs that fade a copy (D185)', () => {
  it('are joined into one pair of that style when they all play it', () => {
    const before = holder([
      { from: [1], to: [7], style: 'fade_copy' },
      { from: [2], to: [7], style: 'fade_copy' },
    ]);
    expect(joinBlocker(before, 0)).toBeNull();
    expect(joinPairs(before, 0)!.holder.pairs).toEqual([
      { from: [1, 2], to: [7], style: 'fade_copy' },
    ]);
  });

  it('are joined with plain copies around one of them: it is the principal', () => {
    const before = holder([
      { from: [1], to: [7], style: 'copy' },
      { from: [2], to: [7], style: 'fade_copy' },
      { from: [4], to: [7], style: 'copy' },
    ]);
    const joined = joinPairs(before, 1)!.holder;
    expect(joined.pairs).toEqual([
      { from: [1, 2, 4], to: [7], style: 'fade_copy', extras: 'copies', principal: 2 },
    ]);
    // Taken apart again, each source plays what it played.
    expect(splitPair(joined, 0).pairs).toEqual(before.pairs);
  });

  it('are not joined with a pair that consumes its source another way', () => {
    const mixed = holder([
      { from: [1], to: [7], style: 'fade_copy' },
      { from: [2], to: [7], style: 'fade' },
    ]);
    expect(joinBlocker(mixed, 0)).toMatch(/styles that one pair cannot hold/);
  });

  it('keep the style on every part when a pair of several sources is taken apart', () => {
    const before = holder([{ from: [2, 1], to: [7], style: null }], 'fade_copy');
    expect(splitPair(before, 0).pairs).toEqual([
      { from: [1], to: [7], style: null },
      { from: [2], to: [7], style: null },
    ]);
  });
});
