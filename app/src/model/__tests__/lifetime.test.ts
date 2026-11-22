// @vitest-environment node
/* model/lifetime.ts: which glyphs each intro, outro and action animates, and when every glyph is
 * on screen (docs/ARCHITECTURE.md §5, "Glyph lifetime"). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createFormula,
  createMorph,
  createPartTransform,
  createRelation,
  createTween,
  defaultIntro,
  defaultOutro,
  parseProject,
  setIdGenerator,
  type Project,
  appearSkipReason,
  clipLifetimes,
  measuringConflicts,
  type Stint,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { readExample } from '../../test/examples';
import { smallProject } from './fixtures';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

/** [enter start, enter cause, exit start, exit cause] of each stint of a glyph. */
function stints(list: Stint[] | undefined): [number, string, number, string][] {
  return (list ?? []).map((s) => [
    s.enter.start,
    s.enter.cause.kind,
    s.exit.start,
    s.exit.cause.kind,
  ]);
}

/** One clip of formula `a` (5 glyphs) on [0, 4] with a 1 s write and a 1 s fade-out. */
function oneClip(): Project {
  const p = smallProject();
  p.relations = [];
  p.clips = [p.clips[0]!];
  return p;
}

describe('clipLifetimes', () => {
  it('brings every glyph in with the intro and takes it out with the outro', () => {
    const p = oneClip();
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.glyphs).toEqual([0, 1, 2, 3, 4]);
    expect(life.intro).toEqual([0, 1, 2, 3, 4]);
    expect(life.outro).toEqual([0, 1, 2, 3, 4]);
    expect(stints(life.stints.get(2))).toEqual([[0, 'intro', 3, 'outro']]);
    expect(life.busy.get(2)!.map((s) => [s.start, s.end])).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });

  it('leaves hidden glyphs off screen for the whole clip', () => {
    const p = oneClip();
    p.formulas[0]!.hiddenGlyphs = [1, 3];
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.intro).toEqual([0, 2, 4]);
    expect(life.outro).toEqual([0, 2, 4]);
    expect(life.stints.has(1)).toBe(false);
  });

  it('follows relations: targets arrive by the pair, consumed sources leave by it', () => {
    const p = smallProject(); // a [0, 4] glyph 0 → b [2, 6] glyph 3 during [2, 3)
    const [ca, cb] = p.clips;
    const lives = clipLifetimes(p);
    const a = lives.get(ca!.id)!;
    const b = lives.get(cb!.id)!;
    expect(a.outro).toEqual([1, 2, 3, 4]);
    expect(stints(a.stints.get(0))).toEqual([[0, 'intro', 2, 'transfer']]);
    expect(b.intro).toEqual([0, 1, 2]);
    expect(stints(b.stints.get(3))).toEqual([[2, 'transfer', 5, 'outro']]);
    expect(a.absentSources).toEqual([]);
  });

  it('keeps a copied source on screen but busy during the window', () => {
    const p = smallProject();
    p.relations[0]!.style = 'copy';
    const a = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(a.outro).toEqual([0, 1, 2, 3, 4]);
    expect(a.busy.get(0)!.map((s) => s.cause.kind)).toEqual(['intro', 'transfer', 'outro']);
  });

  it('reveals hidden glyphs with an appear action', () => {
    const p = oneClip();
    p.formulas[0]!.hiddenGlyphs = [3, 4];
    const appear = createAppear(1.5, 'write', [3, 4]); // [1.5, 2.5)
    p.clips[0]!.actions.push(appear);
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.actions.get(appear.id)).toEqual({ glyphs: [3, 4], skipped: [] });
    expect(stints(life.stints.get(4))).toEqual([[1.5, 'action', 3, 'outro']]);
    expect(life.outro).toEqual([0, 1, 2, 3, 4]);
    expect(life.busy.get(4)!.map((s) => [s.start, s.end])).toEqual([
      [1.5, 2.5],
      [3, 4],
    ]);
    expect(life.busy.has(0) && life.busy.get(0)!.some((s) => s.cause.kind === 'action')).toBe(
      false,
    );
  });

  it('lets the glyphs an appear names first wait for it instead of the intro', () => {
    const p = oneClip(); // intro: a 1 s write
    const write = createAppear(0, 'write', 'all', { duration: 1.5 });
    p.clips[0]!.actions.push(write);
    let life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.intro).toEqual([]);
    expect(life.waiting).toEqual([0, 1, 2, 3, 4]);
    expect(life.actions.get(write.id)).toEqual({ glyphs: [0, 1, 2, 3, 4], skipped: [] });
    expect(stints(life.stints.get(2))).toEqual([[0, 'action', 3, 'outro']]);
    expect(life.busy.get(2)!.map((s) => [s.start, s.end, s.cause.kind])).toEqual([
      [0, 1.5, 'action'],
      [3, 4, 'outro'],
    ]);

    // Anywhere in the clip, and only for the glyphs it names.
    write.start = 2;
    write.glyphs = [3];
    life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.intro).toEqual([0, 1, 2, 4]);
    expect(life.waiting).toEqual([3]);
    expect(stints(life.stints.get(3))).toEqual([[2, 'action', 3, 'outro']]);

    // A glyph a disappear names first comes in with the intro; the appear brings it back.
    const gone = createDisappear(1.2, 'fade_out', [3], { duration: 0.3 });
    p.clips[0]!.actions.unshift(gone);
    life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.intro).toEqual([0, 1, 2, 3, 4]);
    expect(life.waiting).toEqual([]);
    expect(stints(life.stints.get(3))).toEqual([
      [0, 'intro', 1.2, 'action'],
      [2, 'action', 3, 'outro'],
    ]);
    // The order of the blocks in the clip breaks a tie in time.
    gone.start = 2;
    life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.waiting).toEqual([]);
    p.clips[0]!.actions.reverse();
    life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.waiting).toEqual([3]);
  });

  it('skips explicitly listed glyphs that do not change state, saying why', () => {
    const p = smallProject(); // b's glyph 3 arrives by relation during [2, 3)
    const cb = p.clips[1]!;
    p.formulas[1]!.hiddenGlyphs = [1];
    const early = createAppear(0.25, 'fade_in', [0, 1, 3]); // [2.25, 3.25): 0 waits for it
    cb.actions.push(early);
    let life = clipLifetimes(p).get(cb.id)!;
    expect(life.actions.get(early.id)).toEqual({
      glyphs: [0, 1],
      skipped: [{ glyph: 3, reason: 'on-screen' }], // the pair started bringing it at 2
    });
    early.start = 0; // [2, 3), with the window moved to [2.5, 3.5): 3 is still to arrive
    p.relations[0]!.offset = 0.5;
    life = clipLifetimes(p).get(cb.id)!;
    expect(life.actions.get(early.id)!.skipped).toEqual([{ glyph: 3, reason: 'arrives-later' }]);

    // In a, glyph 0 leaves through the pair at 2.5: it cannot come back, and a later disappear
    // finds it (and the hidden glyph 1) off screen.
    const ca = p.clips[0]!;
    p.formulas[0]!.hiddenGlyphs = [1];
    const gone = createDisappear(3, 'fade_out', [0, 1], { duration: 0.25 });
    const back = createAppear(3.5, 'fade_in', [0], { duration: 0.25 });
    ca.actions.push(gone, back);
    life = clipLifetimes(p).get(ca.id)!;
    expect(life.actions.get(gone.id)).toEqual({
      glyphs: [],
      skipped: [
        { glyph: 0, reason: 'off-screen' },
        { glyph: 1, reason: 'off-screen' },
      ],
    });
    expect(life.actions.get(back.id)!.skipped).toEqual([{ glyph: 0, reason: 'consumed' }]);
  });

  it('says why an Appear of every glyph would leave one out, as an Appear that lists it is told (audit A8-02)', () => {
    // a [0, 4] glyph 0 → b [2, 6] glyph 3 over [2, 3): a consumes 0 then, b brings 3 then.
    const p = smallProject();
    const lives = clipLifetimes(p);
    for (const clip of p.clips) {
      const life = lives.get(clip.id)!;
      for (let time = clip.start; time <= clip.end - 0.5; time += 0.25) {
        for (const glyph of life.glyphs) {
          // An Appear of that glyph alone there: what the lifetime says it skips it for.
          const probe = createAppear(time - clip.start, 'fade_in', [glyph], { duration: 0.25 });
          const placed = structuredClone(p);
          placed.clips.find((c) => c.id === clip.id)!.actions.push(probe);
          const skipped = clipLifetimes(placed).get(clip.id)!.actions.get(probe.id)!.skipped;
          const reason = skipped.find((s) => s.reason !== 'on-screen')?.reason ?? null;
          expect(appearSkipReason(life, glyph, time), `${clip.id} glyph ${glyph} at ${time}`).toBe(
            reason,
          );
        }
      }
    }
    // Before 2 s b's glyph 3 is still to come; from 2 s a's glyph 0 is gone for good.
    expect(appearSkipReason(lives.get(p.clips[1]!.id)!, 3, 2)).toBeNull();
    expect(appearSkipReason(lives.get(p.clips[1]!.id)!, 3, 1.5)).toBe('arrives-later');
    expect(appearSkipReason(lives.get(p.clips[0]!.id)!, 0, 2)).toBe('consumed');
  });

  it('lets a glyph leave and come back', () => {
    const p = oneClip();
    const out = createDisappear(1.2, 'fade_out', [1, 2], { duration: 0.5 });
    const back = createAppear(2, 'fade_in', [2], { duration: 0.5 });
    p.clips[0]!.actions.push(back, out); // unsorted on purpose
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(stints(life.stints.get(2))).toEqual([
      [0, 'intro', 1.2, 'action'],
      [2, 'action', 3, 'outro'],
    ]);
    expect(stints(life.stints.get(1))).toEqual([[0, 'intro', 1.2, 'action']]);
    expect(life.outro).toEqual([0, 2, 3, 4]);
  });

  it('keeps the busy spans of tweens (every glyph) and transforms (their glyphs)', () => {
    const p = oneClip();
    const tween = createTween(1, 0.5, { scale: 2 });
    const part = createPartTransform(2, [1, 4], { shift: [1, 0] });
    p.clips[0]!.actions.push(tween, part);
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.actions.get(tween.id)!.glyphs).toEqual([0, 1, 2, 3, 4]);
    expect(life.actions.get(part.id)!.glyphs).toEqual([1, 4]);
    expect(life.busy.get(4)!.map((s) => s.start)).toEqual([0, 1, 2, 3]);
    expect(life.busy.get(0)!.map((s) => s.start)).toEqual([0, 1, 3]);
  });

  it('lets a glyph that comes on screen during the outro leave with the clip', () => {
    const p = oneClip();
    p.formulas[0]!.hiddenGlyphs = [4];
    p.clips[0]!.actions.push(createAppear(3.2, 'fade_in', [4], { duration: 0.5 }));
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.outro).toEqual([0, 1, 2, 3]);
    expect(stints(life.stints.get(4))).toEqual([[3.2, 'action', 4, 'clip-end']]);
  });

  it('keeps a glyph that a pair consumes during the outro out of the outro', () => {
    const p = smallProject();
    const [ca, cb] = p.clips;
    cb!.start = 1;
    p.relations[0]!.offset = 2.2; // window [3.2, 3.8), inside a's outro [3, 4)
    p.relations[0]!.duration = 0.6;
    const a = clipLifetimes(p).get(ca!.id)!;
    expect(a.outro).toEqual([1, 2, 3, 4]);
    expect(stints(a.stints.get(0))).toEqual([[0, 'intro', 3.2, 'transfer']]);
  });

  it('follows a morph block: its targets skip the intro and arrive by its pairs, sources go by style', () => {
    const p = oneClip(); // a [0, 4]: write 1 s, fade-out 1 s; glyphs a + b = c
    const morph = createMorph(1.5, {
      duration: 1,
      pairs: [
        { from: [0], to: [3], style: null }, // copy: a stays, = arrives
        { from: [1], to: [4], style: 'transform' }, // + becomes c
      ],
    });
    p.clips[0]!.actions.push(morph);
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(life.intro).toEqual([0, 1, 2]);
    expect(life.waiting).toEqual([]);
    expect(stints(life.stints.get(3))).toEqual([[1.5, 'transfer', 3, 'outro']]);
    expect(stints(life.stints.get(4))).toEqual([[1.5, 'transfer', 3, 'outro']]);
    expect(stints(life.stints.get(1))).toEqual([[0, 'intro', 1.5, 'transfer']]);
    expect(stints(life.stints.get(0))).toEqual([[0, 'intro', 3, 'outro']]);
    expect(life.outro).toEqual([0, 2, 3, 4]);
    // As an action the morph lists both sides; its pairs are the transfer spans.
    expect(life.actions.get(morph.id)).toEqual({ glyphs: [0, 1, 3, 4], skipped: [] });
    const key = `morph:${morph.id}`;
    expect(life.busy.get(0)!.map((s) => s.cause)).toEqual([
      { kind: 'intro' },
      { kind: 'transfer', key, pair: 0 },
      { kind: 'outro' },
    ]);
    expect(life.busy.get(3)!.map((s) => [s.start, s.end, s.cause.kind])).toEqual([
      [1.5, 2.5, 'transfer'],
      [3, 4, 'outro'],
    ]);
    expect(life.absentSources).toEqual([]);
    // A second morph whose source is a target of the first, starting when the first ends: fine.
    const second = createMorph(2.5, {
      duration: 0.5,
      pairs: [{ from: [3], to: [2], style: null }],
    });
    p.clips[0]!.actions.push(second);
    p.formulas[0]!.hiddenGlyphs = [];
    const twice = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(twice.absentSources).toEqual([]);
    // Started half way through the first one, the source is still arriving through it.
    second.start = 2;
    const overlapping = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(overlapping.absentSources).toEqual([]);
    expect(overlapping.arrivingSources).toEqual([
      { key: `morph:${second.id}`, pair: 0, glyphs: [3], through: `morph:${morph.id}` },
    ]);
    // A source nothing brings in is absent, not arriving.
    p.formulas[0]!.hiddenGlyphs = [2];
    second.pairs = [{ from: [2], to: [4], style: null }];
    p.clips[0]!.actions = [second];
    const hidden = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(hidden.absentSources).toEqual([{ key: `morph:${second.id}`, pair: 0, glyphs: [2] }]);
    expect(hidden.arrivingSources).toEqual([]);
  });

  it('does not bring a consumed glyph back through a later pair', () => {
    const p = oneClip();
    const first = createMorph(1, {
      duration: 0.5,
      pairs: [{ from: [0], to: [3], style: 'transform' }],
    });
    const second = createMorph(2, { duration: 0.5, pairs: [{ from: [2], to: [0], style: null }] });
    p.clips[0]!.actions.push(first, second);
    const life = clipLifetimes(p).get(p.clips[0]!.id)!;
    // As a target of a pair, glyph 0 skips the intro; the first morph takes it (absent: validation
    // reports both pairs) and the second does not bring it back; glyph 3 arrives by the first.
    expect(life.intro).toEqual([1, 2, 4]);
    expect(life.stints.has(0)).toBe(false);
    expect(life.outro).toEqual([1, 2, 3, 4]);
    expect(life.absentSources).toEqual([{ key: `morph:${first.id}`, pair: 0, glyphs: [0] }]);
  });

  it('records sources that are not fully on screen when their window starts', () => {
    const p = smallProject();
    p.formulas[0]!.hiddenGlyphs = [0];
    const a = clipLifetimes(p).get(p.clips[0]!.id)!;
    expect(a.absentSources).toEqual([
      { key: `relation:${p.relations[0]!.id}`, pair: 0, glyphs: [0] },
    ]);
  });

  it.each(['hello.mfe.json', 'one-to-many.mfe.json'])(
    'agrees with the relation-only rules on %s',
    (name) => {
      const parsed = parseProject(readExample(name));
      if (!parsed.ok) throw new Error(parsed.error);
      const { project } = parsed;
      const lives = clipLifetimes(project);
      for (const clip of project.clips) {
        const life = lives.get(clip.id)!;
        const hidden = new Set(project.formulas.find((f) => f.id === clip.formulaId)!.hiddenGlyphs);
        const arriving = new Set<number>();
        const consumed = new Set<number>();
        for (const r of project.relations) {
          for (const pair of r.pairs) {
            if (r.toClipId === clip.id) pair.to.forEach((g) => arriving.add(g));
            if (r.fromClipId === clip.id && (pair.style ?? r.style) !== 'copy') {
              pair.from.forEach((g) => consumed.add(g));
            }
          }
        }
        const never = [...hidden].filter((g) => !arriving.has(g));
        expect(life.intro).toEqual(life.glyphs.filter((g) => !hidden.has(g) && !arriving.has(g)));
        expect(life.outro).toEqual(
          life.glyphs.filter((g) => !consumed.has(g) && !never.includes(g)),
        );
      }
    },
  );

  it('ignores relations whose clips are missing', () => {
    const p = smallProject();
    p.relations.push(
      createRelation(p.clips[0]!.id, 'nope', { pairs: [{ from: [1], to: [0], style: null }] }),
    );
    const extra = createClip(p.formulas[0]!.id, p.tracks[0]!.id, 5, 7, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    p.clips.push(extra);
    const lives = clipLifetimes(p);
    expect(lives.get(p.clips[0]!.id)!.outro).toEqual([1, 2, 3, 4]);
    // `none` intro and outro: instantaneous, never busy.
    const life = lives.get(extra.id)!;
    expect(stints(life.stints.get(0))).toEqual([[5, 'intro', 7, 'outro']]);
    expect(life.busy.size).toBe(0);
  });
});

describe('clipLifetimes: several sources to one target (D54)', () => {
  /** Formula `a` (3 glyphs) on [0, 6] and `b` on [2, 8]; a → b over [3, 4) with one pair. */
  function twoClips(pair: {
    from: number[];
    to: number[];
    extras?: 'separate' | 'merge' | 'copies';
  }) {
    const p = createEmptyProject('t');
    const fa = createFormula({ name: 'a', source: 'x+y' });
    const fb = createFormula({ name: 'b', source: 'z' });
    p.formulas.push(fa, fb);
    const a = createClip(fa.id, p.tracks[0]!.id, 0, 6, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    const b = createClip(fb.id, p.tracks[1]!.id, 2, 8, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    p.clips.push(a, b);
    p.relations.push(
      createRelation(a.id, b.id, { offset: 1, duration: 1, pairs: [{ style: null, ...pair }] }),
    );
    return { p, a, b };
  }

  it('consumes every source by default (separate) and when merging', () => {
    for (const extras of [undefined, 'separate', 'merge'] as const) {
      const { p, a } = twoClips({ from: [0, 2], to: [0], extras });
      const life = clipLifetimes(p).get(a.id)!;
      expect(life.stints.get(0)!.map((s) => s.exit.cause.kind)).toEqual(['transfer']);
      expect(life.stints.get(2)!.map((s) => s.exit.cause.kind)).toEqual(['transfer']);
    }
  });

  it('with copies, consumes the first source and keeps the others on screen, busy', () => {
    const { p, a } = twoClips({ from: [2, 0], to: [0], extras: 'copies' });
    const life = clipLifetimes(p).get(a.id)!;
    expect(life.stints.get(0)!.map((s) => s.exit.cause.kind)).toEqual(['transfer']);
    // Still there at the end: the (instant) outro takes it with the rest.
    expect(life.stints.get(2)!.map((s) => [s.exit.start, s.exit.cause.kind])).toEqual([
      [6, 'outro'],
    ]);
    expect(life.busy.get(2)!.map((s) => [s.start, s.end, s.cause.kind])).toEqual([
      [3, 4, 'transfer'],
    ]);
  });
});

describe('emphasis blocks', () => {
  it('act on the targeted glyphs on screen when they start; only Indicate and Wiggle keep them busy', () => {
    const p = oneClip();
    p.formulas[0]!.hiddenGlyphs = [4];
    const clip = p.clips[0]!;
    const indicate = createEmphasis(1.5, 'indicate', [1, 2]);
    const circumscribe = createEmphasis(1.5, 'circumscribe', 'all');
    const flash = createEmphasis(2, 'flash', [3, 4]);
    const wiggle = createEmphasis(2, 'wiggle', [3]);
    clip.actions.push(indicate, circumscribe, flash, wiggle);
    const life = clipLifetimes(p).get(clip.id)!;
    expect(life.actions.get(indicate.id)).toEqual({ glyphs: [1, 2], skipped: [] });
    // 'all' is every glyph on screen then: the hidden one is left out silently.
    expect(life.actions.get(circumscribe.id)).toEqual({ glyphs: [0, 1, 2, 3], skipped: [] });
    expect(life.actions.get(flash.id)).toEqual({
      glyphs: [3],
      skipped: [{ glyph: 4, reason: 'off-screen' }],
    });
    const busy = (g: number) => life.busy.get(g)!.map((s) => [s.start, s.end, s.cause.kind]);
    expect(busy(1)).toEqual([
      [0, 1, 'intro'],
      [1.5, 2.5, 'action'],
      [3, 4, 'outro'],
    ]);
    // The Circumscribe and the Flash keep nothing busy; the Wiggle does.
    expect(busy(0)).toEqual([
      [0, 1, 'intro'],
      [3, 4, 'outro'],
    ]);
    expect(busy(3)).toEqual([
      [0, 1, 'intro'],
      [2, 4, 'action'],
      [3, 4, 'outro'],
    ]);
    // Nothing changes what is on screen.
    for (const g of [0, 1, 2, 3])
      expect(stints(life.stints.get(g))).toEqual([[0, 'intro', 3, 'outro']]);
    expect(stints(life.stints.get(4))).toEqual([]);
  });

  it('measuringConflicts: what is still drawing, removing or morphing some glyphs at an instant', () => {
    const p = oneClip();
    const clip = p.clips[0]!;
    clip.actions.push(createDisappear(2, 'fade_out', [2]), createTween(1.2, 0.5, { rotation: 5 }));
    const life = clipLifetimes(p).get(clip.id)!;
    const at = (t: number, glyphs: number[]) =>
      measuringConflicts(clip, life, glyphs, t).map((c) => [c.cause.kind, c.glyphs]);
    expect(at(0.5, [1, 2])).toEqual([['intro', [1, 2]]]);
    // Exactly when the intro ends, or starts: whole glyphs. A tween only moves them.
    expect(at(1, [1, 2])).toEqual([]);
    expect(at(0, [1, 2])).toEqual([]);
    expect(at(1.4, [1, 2])).toEqual([]);
    expect(at(2.5, [1, 2])).toEqual([['action', [2]]]);
    expect(at(3.5, [1, 2])).toEqual([['outro', [1]]]);
  });
});
