// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAppear,
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createFormula,
  createMorph,
  createShapeAttach,
  createShapeFormula,
  createTexFormula,
  createTipAttach,
  createPartTransform,
  createRelation,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  MAX_SCENE_SECONDS,
  PATH_ARC_LIMIT,
  setIdGenerator,
  validateProject,
  type Clip,
  type IssueCode,
  type Project,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { boxSnapshot, smallProject } from './fixtures';

const codes = (p: Project): IssueCode[] => validateProject(p).map((i) => i.code);

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

describe('validateProject', () => {
  it('accepts a consistent project', () => {
    expect(validateProject(smallProject())).toEqual([]);
  });

  it('warns about a {{ }} group that spans an alignment tab, which ManimGL cannot compile', () => {
    const p = smallProject();
    p.relations = [];
    const [a] = p.formulas;
    a!.source = '{{A &= x_1}} \\\\ &= x_2';
    const [issue, ...rest] = validateProject(p).filter((i) => i.code === 'group-alignment');
    expect(rest).toEqual([]);
    expect(issue!.severity).toBe('warning');
    expect(issue!.path).toEqual(['formulas', 0, 'source']);
    expect(issue!.message).toMatch(/^A \{\{ \}\} group of "a" spans an alignment tab/);
    // Groups inside one cell, nested braces and an escaped ampersand are fine.
    for (const ok of ['{{A}} &= x', 'A &= {{\\frac{x}{y}}} \\\\ &= {{ z }}', '{{a \\& b}} &= c']) {
      a!.source = ok;
      expect(codes(p)).not.toContain('group-alignment');
    }
    a!.source = '{{\\frac{a}{b} &= c}}';
    expect(codes(p)).toContain('group-alignment');
  });

  it('flags dangling references and duplicate ids', () => {
    const p = smallProject();
    p.clips[0]!.formulaId = 'nope';
    p.relations[0]!.id = p.clips[1]!.id;
    expect(codes(p)).toEqual(expect.arrayContaining(['dangling-ref', 'duplicate-id']));
  });

  it('flags overlapping clips on one track', () => {
    const p = smallProject();
    p.clips[1]!.trackId = p.clips[0]!.trackId;
    expect(codes(p)).toContain('track-overlap');
  });

  it('flags every clip that starts while another of its track is on, not only its neighbour', () => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'f', source: 'x' });
    p.formulas.push(f);
    const track = p.tracks[0]!.id;
    // B and C both lie inside A; C starts after B has ended, so its neighbour says nothing of it.
    p.clips.push(
      createClip(f.id, track, 0, 10),
      createClip(f.id, track, 1, 2),
      createClip(f.id, track, 3, 4),
      // D starts when A ends: half-open windows, no overlap.
      createClip(f.id, track, 10, 12),
    );
    const flagged = validateProject(p).filter((i) => i.code === 'track-overlap');
    expect(flagged.map((i) => i.path)).toEqual([
      ['clips', 1, 'start'],
      ['clips', 2, 'start'],
    ]);
    expect(flagged.every((i) => i.severity === 'error')).toBe(true);
    // In whatever order the file lists them.
    p.clips.reverse();
    expect(
      validateProject(p)
        .filter((i) => i.code === 'track-overlap')
        .map((i) => i.path),
    ).toEqual([
      ['clips', 2, 'start'],
      ['clips', 1, 'start'],
    ]);
  });

  it('checks the intro a formula chose like a clip intro', () => {
    const p = smallProject();
    p.formulas[0]!.intro = { ...defaultIntro('none'), duration: 0.5 };
    const issue = validateProject(p).find((i) => i.code === 'animation-duration');
    expect(issue?.path).toEqual(['formulas', 0, 'intro', 'duration']);
    p.formulas[0]!.intro = defaultIntro('write');
    expect(codes(p)).not.toContain('animation-duration');
  });

  it('checks intro/outro durations', () => {
    const p = smallProject();
    p.clips[0]!.intro = { ...defaultIntro('none'), duration: 0.5 };
    p.clips[1]!.intro = defaultIntro('draw_border_then_fill'); // 2 s
    p.clips[1]!.outro = { ...defaultOutro('fade_out'), duration: 2.5 }; // 4.5 s > 4 s clip
    expect(codes(p)).toEqual(
      expect.arrayContaining(['animation-duration', 'clip-animations-overflow']),
    );
  });

  it('keeps actions inside the free part of the clip and apart from each other', () => {
    const p = smallProject();
    const clip = p.clips[0]!; // [0,4], intro 1 s, outro 1 s
    clip.actions.push(createTween(0.5, 1, { scale: 2 })); // starts during the intro
    expect(codes(p)).toContain('action-bounds');
    clip.actions = [createTween(1, 0.5, { scale: 2 }), createTween(1.2, 0.5, { rotation: 90 })];
    expect(codes(p)).toContain('action-overlap');
  });

  it('forbids actions during a relation window of the clip', () => {
    const p = smallProject(); // relation window = [2, 3)
    p.clips[0]!.actions.push(createTween(2.5, 0.4, { position: [1, 1] }));
    expect(codes(p)).toContain('action-overlap');
  });

  it('keeps the relation window inside both clips', () => {
    const p = smallProject();
    p.relations[0]!.offset = 1.5; // [3.5, 4.5) past the source end (4)
    expect(codes(p)).toContain('relation-window');
    p.relations[0]!.offset = -1; // before the target starts
    expect(codes(p)).toContain('relation-window');
  });

  it('flags self and empty relations', () => {
    const p = smallProject();
    const [ca, cb] = p.clips;
    p.relations.push(createRelation(ca!.id, ca!.id));
    p.relations.push(
      createRelation(ca!.id, cb!.id, { pairs: [{ from: [], to: [1], style: null }] }),
    );
    expect(codes(p)).toEqual(expect.arrayContaining(['relation-self', 'pair-empty']));
  });

  it('checks glyph indices against the snapshot', () => {
    const p = smallProject();
    p.relations[0]!.pairs.push({ from: [9], to: [1], style: null });
    expect(codes(p)).toContain('glyph-range');
  });

  it("checks a morph block's pairs: indices of its formula, both sides non-empty", () => {
    const p = smallProject();
    p.relations = [];
    const morph = createMorph(1.5, {
      pairs: [
        { from: [0], to: [9], style: null },
        { from: [], to: [1], style: null },
      ],
    });
    p.clips[0]!.actions.push(morph);
    const issues = validateProject(p);
    expect(issues.map((i) => [i.code, i.path])).toEqual(
      expect.arrayContaining([
        ['glyph-range', ['clips', 0, 'actions', 0, 'pairs', 0, 'to']],
        ['pair-empty', ['clips', 0, 'actions', 0, 'pairs', 1]],
      ]),
    );
  });

  it("checks a pair's path: it must run from (0, 0) to (1, 0) of the chord", () => {
    const p = smallProject();
    const node = (at: [number, number]) => ({ at, in: null, out: null, smooth: false });
    const pair = p.relations[0]!.pairs[0]!;
    pair.path = { nodes: [node([0, 0]), node([0.5, 0.3]), node([1, 0])] };
    expect(codes(p)).not.toContain('pair-path');
    pair.path = { nodes: [node([0, 0]), node([1, 0.1])] };
    expect(validateProject(p).map((i) => [i.code, i.path])).toContainEqual([
      'pair-path',
      ['relations', 0, 'pairs', 0, 'path'],
    ]);
    // A morph block's pairs are checked the same way.
    p.relations = [];
    const morph = createMorph(1.5, {
      pairs: [{ from: [0], to: [1], style: null, path: { nodes: [node([0.1, 0]), node([1, 0])] } }],
    });
    p.clips[0]!.actions.push(morph);
    expect(validateProject(p).map((i) => [i.code, i.path])).toContainEqual([
      'pair-path',
      ['clips', 0, 'actions', 0, 'pairs', 0, 'path'],
    ]);
  });

  it('checks hidden glyphs, and warns when one is a source before a relation brings it in', () => {
    const p = smallProject();
    const [a, b] = p.formulas;
    a!.hiddenGlyphs = [7];
    expect(codes(p)).toContain('glyph-range');
    // r0 moves glyph 0 of a, which is hidden and never arrives: out of nowhere.
    a!.hiddenGlyphs = [0];
    const issue = validateProject(p).find((i) => i.code === 'source-hidden');
    expect(issue?.severity).toBe('warning');
    expect(issue?.path).toEqual(['relations', 0, 'pairs', 0, 'from']);
    a!.hiddenGlyphs = [];
    // A hidden glyph of b that r0 brings in (window [2, 3)) can leave through a later relation.
    b!.hiddenGlyphs = [2, 3];
    const later = createClip(a!.id, p.tracks[0]!.id, 4.5, 9);
    p.clips.push(later);
    p.relations.push(
      createRelation(p.clips[1]!.id, later.id, { pairs: [{ from: [3], to: [0], style: null }] }),
    );
    expect(codes(p)).not.toContain('source-hidden');
    // Glyph 2 never arrives.
    p.relations[1]!.pairs.push({ from: [2], to: [1], style: null });
    expect(codes(p).filter((c) => c === 'source-hidden')).toHaveLength(1);
  });

  it('lets a target arrive through several pairs of one relation only when they bring the same glyphs', () => {
    const p = smallProject(); // r0: glyph 0 of a → glyph 3 of b
    const r = p.relations[0]!;
    // A join taken apart (D167): two pairs of the relation onto the same target.
    r.pairs.push({ from: [1], to: [3], style: 'copy' });
    expect(codes(p)).not.toContain('target-conflict');
    // A pair that shares only some of its targets is refused, and the message says why.
    r.pairs[1] = { from: [1], to: [2, 3], style: 'copy' };
    const apart = validateProject(p).find((i) => i.code === 'target-conflict');
    expect(apart?.path).toEqual(['relations', 0, 'pairs', 1, 'to']);
    expect(apart?.message).toBe(
      'The relation brings in glyph 3 of "b" through pairs with different targets: pairs that share a target must bring the same glyphs.',
    );
    // The same targets in another order, or named twice, are the same glyphs.
    r.pairs[0] = { from: [0], to: [3, 2], style: null };
    r.pairs[1] = { from: [1], to: [2, 3, 2], style: 'copy' };
    expect(codes(p)).not.toContain('target-conflict');
  });

  it('allows one relation per target glyph', () => {
    const p = smallProject();
    const [ca, cb] = p.clips as [Clip, Clip];
    p.relations.push(
      createRelation(ca.id, cb.id, { offset: 1.5, pairs: [{ from: [1], to: [3], style: 'copy' }] }),
    );
    const conflict = validateProject(p).find((i) => i.code === 'target-conflict');
    expect(conflict?.path).toEqual(['relations', 1, 'pairs', 0, 'to']);
    expect(conflict?.message).toBe('Target glyph 3 of "b" is brought in by more than one pair.');
    // Two pairs of one relation and one of another: the other relation is the one named.
    p.relations[0]!.pairs.push({ from: [2], to: [3], style: 'copy' });
    expect(validateProject(p).find((i) => i.code === 'target-conflict')?.path).toEqual([
      'relations',
      1,
      'pairs',
      0,
      'to',
    ]);
  });

  it('counts the pairs of morph blocks as owners and consumers too', () => {
    const p = smallProject(); // r0 brings glyph 3 of b in during [2, 3)
    const cb = p.clips[1]!; // b [2, 6]: fade-in 1 s, fade-out 1 s
    const morph = createMorph(1.5, { pairs: [{ from: [0], to: [3], style: null }] }); // [3.5, 4.5)
    cb.actions.push(morph);
    const conflict = validateProject(p).find((i) => i.code === 'target-conflict');
    expect(conflict?.path).toEqual(['clips', 1, 'actions', 0, 'pairs', 0, 'to']);
    expect(conflict?.message).toBe(
      'The Morph block brings in glyph 3 of "b", which another pair brings in too.',
    );
    // A morph that consumes a glyph a later relation also consumes.
    morph.pairs = [{ from: [1], to: [2], style: 'transform' }];
    const third = createClip(p.formulas[0]!.id, 'elsewhere', 4, 8);
    p.clips.push(third);
    p.relations.push(
      createRelation(cb.id, third.id, {
        offset: 1, // [5, 6)
        pairs: [{ from: [1], to: [1], style: null }],
      }),
    );
    expect(codes(p)).toContain('source-consumed-twice');
    // Copied by the morph after the relation consumed it: the relation at [5, 6), the morph later.
    morph.pairs = [{ from: [1], to: [2], style: 'copy' }];
    morph.start = 3.4; // [5.4, 6.4) overlaps the outro, but the ownership rule is what we test
    expect(codes(p)).toContain('source-used-after-consumed');
  });

  it('never lets a glyph be on both sides of one morph block', () => {
    const p = smallProject();
    p.relations = [];
    p.clips[0]!.actions.push(
      createMorph(1.5, {
        pairs: [
          { from: [0, 1], to: [3], style: null },
          { from: [3], to: [4], style: null },
          { from: [2], to: [2], style: null },
        ],
      }),
    );
    const [issue, ...rest] = validateProject(p).filter((i) => i.code === 'morph-both-sides');
    expect(rest).toEqual([]);
    expect(issue!.severity).toBe('error');
    expect(issue!.path).toEqual(['clips', 0, 'actions', 0]);
    expect(issue!.message).toBe(
      'The Morph block has glyphs 2, 3 of "a" on both sides: a glyph cannot be a source and a target of the same block.',
    );
  });

  it('allows a source glyph to be consumed once, and copied only before that', () => {
    const p = smallProject();
    const [ca] = p.clips;
    const formulaB = p.formulas[1]!;
    const third = createClip(formulaB.id, p.tracks[1]!.id, 7, 9);
    p.clips.push(third);
    // Consumed twice: by r0 at [2,3) and by a new relation into `third`.
    ca!.end = 8;
    p.relations.push(
      createRelation(ca!.id, third.id, { pairs: [{ from: [0], to: [0], style: null }] }),
    );
    expect(codes(p)).toContain('source-consumed-twice');
    // Copied after being consumed.
    p.relations[1]!.style = 'copy';
    expect(codes(p)).toContain('source-used-after-consumed');
    // Copied before being consumed: fine.
    p.relations[1]!.offset = -5; // window [2, 3) — same start as the consuming relation
    third.start = 2;
    third.trackId = 'elsewhere';
    expect(codes(p)).not.toContain('source-used-after-consumed');
  });
});

describe('validateProject: LaTeX texts', () => {
  it('wants a positive width or none, and a positive line spacing', () => {
    const p = createEmptyProject('t');
    const text = createTexFormula({ name: 't1', source: 'Hi' });
    p.formulas.push(text);
    expect(codes(p)).toEqual([]);
    text.layout = { width: -1, align: 'center', lineSpacing: 1 };
    expect(codes(p)).toEqual(['invalid-layout']);
    text.layout = { width: 3, align: 'center', lineSpacing: 0 };
    const issues = validateProject(p);
    expect(issues.map((i) => i.code)).toEqual(['invalid-layout']);
    expect(issues[0]!.path).toEqual(['formulas', 0, 'layout', 'lineSpacing']);
  });
});

describe('validateProject: animation blocks', () => {
  /** Clip a of smallProject alone: [0, 4], write [0, 1), fade-out [3, 4); 5 glyphs. */
  const oneClip = () => {
    const p = smallProject();
    p.relations = [];
    p.clips = [p.clips[0]!];
    return p;
  };
  const issuesOf = (p: Project, code: IssueCode) =>
    validateProject(p).filter((i) => i.code === code);

  it('lets blocks run at once on different glyphs, also next to the intro', () => {
    const p = oneClip();
    p.formulas[0]!.hiddenGlyphs = [4];
    p.clips[0]!.actions.push(
      createAppear(0.5, 'fade_in', [4]), // [0.5, 1.5): during the intro, on a glyph it skips
      createPartTransform(1.2, [0, 1], { shift: [0, 1] }), // [1.2, 2.2)
      createDisappear(1.5, 'fade_out', [3], { duration: 0.5 }),
    );
    expect(validateProject(p)).toEqual([]);
  });

  it('forbids two things animating one glyph at once, naming both', () => {
    const p = oneClip();
    const clip = p.clips[0]!;
    const part = createPartTransform(1.2, [0, 1], { scale: 2 });
    const fade = createDisappear(1.5, 'fade_out', [1, 2], { duration: 0.5 });
    clip.actions.push(part, fade);
    const [issue, ...rest] = issuesOf(p, 'action-overlap');
    expect(rest).toEqual([]);
    expect(issue!.path).toEqual(['clips', 0, 'actions', 1]);
    expect(issue!.message).toBe(
      'The FadeOut block and the Transform block animate glyph 1 of "a" at the same time; Manim cannot run both on one glyph.',
    );
    // A transform during the intro on glyphs the intro writes.
    clip.actions = [createPartTransform(0.5, [2], { shift: [1, 0] })];
    expect(issuesOf(p, 'action-overlap')[0]!.message).toMatch(/^The Transform block and the intro/);
    // A tween animates every glyph.
    clip.actions = [createTween(1.5, 1, { scale: 2 }), createAppear(2, 'write', 'all')];
    p.formulas[0]!.hiddenGlyphs = [4];
    expect(issuesOf(p, 'action-overlap')).toHaveLength(1);
  });

  it('checks blocks against relation windows on the glyphs of the pairs only', () => {
    const p = smallProject(); // a:0 → b:3 during [2, 3)
    const [ca, cb] = p.clips;
    ca!.actions.push(createPartTransform(2, [1], { shift: [1, 0] }));
    cb!.actions.push(createPartTransform(1, [2, 3], { shift: [1, 0] })); // [3, 4): after the window
    expect(validateProject(p)).toEqual([]);
    ca!.actions.push(createPartTransform(2.5, [0], { shift: [1, 0], duration: 0.5 }));
    expect(issuesOf(p, 'action-overlap')[0]!.path).toEqual(['clips', 0, 'actions', 1]);
    // A copied source stays on screen, but the window still animates it.
    p.relations[0]!.style = 'copy';
    expect(issuesOf(p, 'action-overlap')).toHaveLength(1);
  });

  it('keeps blocks inside the clip', () => {
    const p = oneClip();
    p.clips[0]!.actions.push(createDisappear(3.5, 'fade_out', 'all')); // ends at 4.5 > 4
    expect(issuesOf(p, 'action-bounds')[0]!.message).toBe(
      'An animation block must lie inside its clip.',
    );
  });

  it('warns about listed glyphs a block leaves out, and blocks that animate nothing', () => {
    const p = oneClip();
    p.formulas[0]!.hiddenGlyphs = [4];
    const first = createAppear(1.2, 'fade_in', [3], { duration: 0.2 }); // 3 waits for it
    const appear = createAppear(1.5, 'write', [3, 4], { duration: 0.5 }); // 3 is there already
    const gone = createDisappear(2.2, 'uncreate', [4], { duration: 0.2 }); // fine: 4 is back
    const nothing = createDisappear(2.5, 'fade_out', 'all', { duration: 0.4 });
    const again = createAppear(2.95, 'fade_in', [0], { duration: 0.05 });
    p.clips[0]!.actions.push(first, appear, gone, nothing, again);
    expect(issuesOf(p, 'action-skips-glyphs').map((i) => i.message)).toEqual([
      'The Write block leaves out glyph 3 of "a": it is on screen already.',
    ]);
    // `nothing` took every glyph; `again` brings 0 back; the outro then has only glyph 0.
    expect(issuesOf(p, 'action-empty')).toEqual([]);
    p.clips[0]!.actions.push(createDisappear(3.2, 'fade_out', [1], { duration: 0.2 }));
    expect(issuesOf(p, 'action-empty').map((i) => i.path)).toEqual([['clips', 0, 'actions', 5]]);
    expect(issuesOf(p, 'action-skips-glyphs')[1]!.message).toBe(
      'The FadeOut block leaves out glyph 1 of "a": it is not on screen.',
    );
  });

  it('warns about an intro with nothing left to animate: its glyphs wait for Appear blocks', () => {
    const p = oneClip(); // a 1 s Write intro
    const write = createAppear(0, 'write', 'all', { duration: 1.5 });
    p.clips[0]!.actions.push(write);
    expect(issuesOf(p, 'intro-empty').map((i) => [i.message, i.path])).toEqual([
      [
        'The Write intro of "a" animates no glyph: its glyphs wait for Appear blocks.',
        ['clips', 0, 'intro'],
      ],
    ]);
    // Glyphs left for the intro: nothing to say.
    write.glyphs = [0, 1];
    expect(issuesOf(p, 'intro-empty')).toEqual([]);
    // Hidden glyphs that empty it together with the blocks are mentioned.
    write.glyphs = [0, 1, 2, 3];
    p.formulas[0]!.hiddenGlyphs = [4];
    expect(issuesOf(p, 'intro-empty')[0]!.message).toBe(
      'The Write intro of "a" animates no glyph: its glyphs wait for Appear blocks or are hidden at the start.',
    );
    // Hidden glyphs alone are what hidden glyphs are for: no block, no warning.
    p.clips[0]!.actions = [];
    p.formulas[0]!.hiddenGlyphs = [0, 1, 2, 3, 4];
    expect(issuesOf(p, 'intro-empty')).toEqual([]);
    // An intro of kind none has nothing to animate anyway.
    p.formulas[0]!.hiddenGlyphs = [];
    p.clips[0]!.actions = [createAppear(0, 'write', 'all', { duration: 1.5 })];
    p.clips[0]!.intro = defaultIntro('none');
    expect(issuesOf(p, 'intro-empty')).toEqual([]);
  });

  it('does not let an appear bring back a glyph a relation consumed', () => {
    const p = smallProject(); // a:0 leaves through the pair during [2, 3)
    p.clips[0]!.actions.push(createAppear(3, 'fade_in', [0], { duration: 0.5 }));
    const [issue] = issuesOf(p, 'appear-consumed');
    expect(issue!.severity).toBe('error');
    expect(issue!.message).toBe(
      'The FadeIn block cannot bring back glyph 0 of "a": a relation or a Morph block turned it into other glyphs.',
    );
    // With 'all' the consumed glyph is not a candidate at all.
    p.clips[0]!.actions = [createAppear(3, 'fade_in', 'all', { duration: 0.5 })];
    expect(issuesOf(p, 'appear-consumed')).toEqual([]);
  });

  it('checks a morph block against the intro, the outro and the blocks of its glyphs', () => {
    const p = oneClip(); // a [0, 4]: write [0, 1), fade-out [3, 4)
    const clip = p.clips[0]!;
    // During the intro, on a glyph the intro writes (its source): conflict, named.
    clip.actions.push(createMorph(0.5, { pairs: [{ from: [0], to: [3], style: null }] }));
    const [intro] = issuesOf(p, 'action-overlap');
    expect(intro!.path).toEqual(['clips', 0, 'actions', 0]);
    expect(intro!.message).toBe(
      'The Morph block and the intro animate glyph 0 of "a" at the same time; Manim cannot run both on one glyph.',
    );
    // A Disappear on the morph's target while the morph brings it.
    clip.actions = [
      createMorph(1.5, { pairs: [{ from: [0], to: [3], style: null }] }), // [1.5, 2.5)
      createDisappear(2, 'fade_out', [3], { duration: 0.5 }),
    ];
    const [disappear] = issuesOf(p, 'action-overlap');
    expect(disappear!.path).toEqual(['clips', 0, 'actions', 1]);
    expect(disappear!.message).toMatch(/^The FadeOut block and the Morph block animate glyph 3/);
    // Two copies of one source in one block, and a consuming morph during the outro (its source
    // is left out of the outro, its target arrives and leaves with the clip): both fine.
    clip.actions = [
      createMorph(1.5, {
        pairs: [
          { from: [0], to: [3], style: null },
          { from: [0], to: [4], style: null },
        ],
      }),
      createMorph(3.2, { duration: 0.6, pairs: [{ from: [1], to: [2], style: 'transform' }] }),
    ];
    p.formulas[0]!.hiddenGlyphs = [2];
    expect(issuesOf(p, 'action-overlap')).toEqual([]);
    // A copy during the outro takes a glyph the outro fades: conflict with the outro.
    clip.actions[1] = createMorph(3.2, {
      duration: 0.6,
      pairs: [{ from: [1], to: [2], style: 'copy' }],
    });
    expect(issuesOf(p, 'action-overlap')[0]!.message).toMatch(
      /^The Morph block and the outro animate glyph 1/,
    );
  });

  it('warns when a morph takes a source that is not on screen, naming the block', () => {
    const p = oneClip();
    p.formulas[0]!.hiddenGlyphs = [3, 4];
    p.clips[0]!.actions.push(createMorph(1.5, { pairs: [{ from: [3], to: [4], style: null }] }));
    const [issue] = issuesOf(p, 'source-hidden');
    expect(issue!.severity).toBe('warning');
    expect(issue!.message).toBe(
      'Source glyph 3 of "a" is not on screen when the Morph block starts, so it appears out of nowhere.',
    );
    expect(issue!.path).toEqual(['clips', 0, 'actions', 0, 'pairs', 0, 'from']);
  });

  it('forbids a morph that takes a source another transfer is still bringing in', () => {
    const p = oneClip();
    p.clips[0]!.actions.push(
      createMorph(1.5, { pairs: [{ from: [0], to: [3], style: null }] }), // [1.5, 2.5)
      createMorph(2, { pairs: [{ from: [3], to: [4], style: null }] }), // starts half way
    );
    const [issue, ...rest] = issuesOf(p, 'source-arriving');
    expect(rest).toEqual([]);
    expect(issue!.severity).toBe('error');
    expect(issue!.message).toBe(
      'Source glyph 3 of "a" is still arriving through another Morph block when the Morph block starts.',
    );
    expect(issue!.path).toEqual(['clips', 0, 'actions', 1, 'pairs', 0, 'from']);
    expect(issuesOf(p, 'source-hidden')).toEqual([]);
    // Started when the first one ends, the source is there.
    p.clips[0]!.actions[1]!.start = 2.5;
    expect(issuesOf(p, 'source-arriving')).toEqual([]);
    // The same through a relation that is still bringing the glyph in.
    const q = smallProject(); // r0 brings glyph 3 of b in during [2, 3)
    q.clips[1]!.actions.push(
      createMorph(0.5, { pairs: [{ from: [3], to: [2], style: null }] }), // [2.5, 3.5)
    );
    const [viaRelation] = issuesOf(q, 'source-arriving');
    expect(viaRelation!.message).toBe(
      'Source glyph 3 of "b" is still arriving through a relation when the Morph block starts.',
    );
  });

  it('never brings a consumed glyph back through a later pair', () => {
    const p = oneClip();
    p.clips[0]!.actions.push(
      createMorph(1, { duration: 0.5, pairs: [{ from: [0], to: [3], style: 'transform' }] }),
      createMorph(2, { duration: 0.5, pairs: [{ from: [2], to: [0], style: null }] }),
    );
    const [issue, ...rest] = issuesOf(p, 'target-consumed');
    expect(rest).toEqual([]);
    expect(issue!.severity).toBe('error');
    expect(issue!.path).toEqual(['clips', 0, 'actions', 1, 'pairs', 0, 'to']);
    expect(issue!.message).toBe(
      'The Morph block cannot bring back glyph 0 of "a": a relation or a Morph block turned it into other glyphs.',
    );
    // Through a relation into the clip after a morph consumed the glyph.
    const q = smallProject(); // a [0, 4] → b [2, 6], r0 at [2, 3) consumes a:0
    const cb = q.clips[1]!;
    cb.actions.push(
      createMorph(0.5, { duration: 0.5, pairs: [{ from: [1], to: [0], style: 'fade' }] }), // [2.5, 3)
    );
    const third = createClip(q.formulas[0]!.id, 'elsewhere', 3, 5);
    q.clips.push(third);
    q.relations.push(
      createRelation(third.id, cb.id, {
        offset: 1.5, // [3.5, 4.5), brings b:1 back after the morph consumed it
        pairs: [{ from: [0], to: [1], style: null }],
      }),
    );
    const [viaRelation] = issuesOf(q, 'target-consumed');
    expect(viaRelation!.message).toMatch(/^The relation cannot bring back glyph 1 of "b"/);
    expect(viaRelation!.path).toEqual(['relations', 1, 'pairs', 0, 'to']);
  });

  it('blames the pair that consumes later in time, and names the Morph block', () => {
    const p = smallProject(); // r0 consumes a:0 at [2, 3)
    p.clips[0]!.actions.push(
      createMorph(1, { duration: 0.5, pairs: [{ from: [0], to: [2], style: 'transform' }] }), // [1, 1.5)
    );
    const [issue] = issuesOf(p, 'source-consumed-twice');
    expect(issue!.path).toEqual(['relations', 0, 'pairs', 0, 'from']);
    expect(issue!.message).toBe('Source glyph 0 of "a" is consumed by more than one pair.');
    p.clips[0]!.actions[0]!.start = 3; // the morph is the later one now: [3, 3.5)
    const [later] = issuesOf(p, 'source-consumed-twice');
    expect(later!.path).toEqual(['clips', 0, 'actions', 0, 'pairs', 0, 'from']);
    expect(later!.message).toBe(
      'The Morph block consumes glyph 0 of "a", which another pair consumes too.',
    );
  });

  it('warns when a relation takes a source that a block took off screen', () => {
    const p = smallProject();
    p.clips[0]!.actions.push(createDisappear(1, 'fade_out', [0], { duration: 0.5 }));
    const [issue] = issuesOf(p, 'source-hidden');
    expect(issue!.message).toBe(
      'Source glyph 0 of "a" is not on screen when the relation starts, so it appears out of nowhere.',
    );
    expect(issue!.path).toEqual(['relations', 0, 'pairs', 0, 'from']);
  });
});

describe('validateProject: several sources to one target (D54)', () => {
  /** `a` (x+y, 3 glyphs) on [0, 8], `b` (z) on [2, 9] and `c` (w) on [5, 9]; a → b over [3, 4). */
  function scene(extras?: 'separate' | 'merge' | 'copies') {
    const p = createEmptyProject('t');
    const [fa, fb, fc] = [
      createFormula({ name: 'a', source: 'x+y' }),
      createFormula({ name: 'b', source: 'z' }),
      createFormula({ name: 'c', source: 'w' }),
    ];
    p.formulas.push(fa, fb, fc);
    p.tracks.push({ ...createTrack('Three'), id: 't3' });
    const a = createClip(fa.id, p.tracks[0]!.id, 0, 8, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    const b = createClip(fb.id, p.tracks[1]!.id, 2, 9, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    const c = createClip(fc.id, 't3', 5, 9, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    p.clips.push(a, b, c);
    p.relations.push(
      createRelation(a.id, b.id, {
        offset: 1,
        duration: 1,
        pairs: [{ from: [0, 2], to: [0], style: null, extras }],
      }),
    );
    return { p, a, b, c };
  }

  it('lets a later pair consume a source that a `copies` pair only copied, and not otherwise', () => {
    const copies = scene('copies');
    copies.p.relations.push(
      createRelation(copies.a.id, copies.c.id, {
        offset: 0,
        duration: 1,
        pairs: [{ from: [2], to: [0], style: null }],
      }),
    );
    expect(codes(copies.p)).not.toContain('source-consumed-twice');
    const separate = scene();
    separate.p.relations.push(
      createRelation(separate.a.id, separate.c.id, {
        offset: 0,
        duration: 1,
        pairs: [{ from: [2], to: [0], style: null }],
      }),
    );
    expect(codes(separate.p)).toContain('source-consumed-twice');
  });

  it('keeps the copy of an extra source before the pair that consumes it', () => {
    const { p, a, c } = scene('copies');
    // c starts at 5: a → c over [5, 6) consumes glyph 2 after it was copied at [3, 4): fine.
    p.relations.push(
      createRelation(a.id, c.id, {
        offset: 0,
        duration: 1,
        pairs: [{ from: [2], to: [0], style: null }],
      }),
    );
    expect(codes(p)).not.toContain('source-used-after-consumed');
    // Consumed first (a → c moved to start at 2), copied after: the copy is too late.
    p.clips.find((clip) => clip.id === c.id)!.start = 2;
    expect(codes(p)).toContain('source-used-after-consumed');
  });
});

describe('validateProject: attached objects (R4)', () => {
  /** "a+b=c" on track 1 over [0, 6) (Write 1 s, FadeOut 1 s) and a label "x" on track 2 over
   * [3, 5), attached to its glyphs 2 and 3. */
  function scene() {
    const p = createEmptyProject('attach');
    const [t1, t2] = p.tracks;
    const a = createFormula({
      name: 'a',
      source: 'a+b=c',
      snapshot: boxSnapshot(['a', '+', 'b', '=', 'c']),
    });
    const x = createFormula({ name: 'x', source: 'x', snapshot: boxSnapshot(['x']) });
    const ca = createClip(a.id, t1!.id, 0, 6, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    const cx = createClip(x.id, t2!.id, 3, 5, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      attach: createAttach(ca.id, [2, 3]),
    });
    p.formulas.push(a, x);
    p.clips.push(ca, cx);
    return { p, a, x, ca, cx };
  }
  const attachIssues = (p: Project) =>
    validateProject(p).filter((i) => i.code.startsWith('attach'));

  it('accepts an object attached to quiet glyphs of another clip', () => {
    const { p } = scene();
    expect(validateProject(p)).toEqual([]);
  });

  it('keeps the brace rule for braces, and braces to the brace rule', () => {
    const { p, ca, cx, x } = scene();
    cx.attach = createBraceAttach(ca.id, [2, 3]);
    const notBrace = validateProject(p).find((i) => i.code === 'attach-rule');
    expect(notBrace).toMatchObject({ severity: 'error', path: ['clips', 1, 'attach', 'rule'] });
    expect(notBrace!.message).toContain(`"${x.name}" is not a brace`);
    const brace = createBraceFormula({ name: 'b1', width: 1 });
    p.formulas.push(brace);
    cx.formulaId = brace.id;
    expect(codes(p)).not.toContain('attach-rule');
    cx.attach = createAttach(ca.id, [2, 3]);
    expect(validateProject(p).find((i) => i.code === 'attach-rule')!.message).toContain(
      '"b1" is a brace',
    );
    cx.attach = null; // a detached brace is fine
    expect(codes(p)).not.toContain('attach-rule');
  });

  it('keeps the shape rule for shapes, and shapes to the shape rule', () => {
    const { p, ca, cx, x } = scene();
    cx.attach = createShapeAttach(ca.id, [2, 3]);
    const notShape = validateProject(p).find((i) => i.code === 'attach-rule');
    expect(notShape).toMatchObject({ severity: 'error', path: ['clips', 1, 'attach', 'rule'] });
    expect(notShape!.message).toBe(
      `"${x.name}" is not a shape: it cannot attach with the shape rule.`,
    );
    const shape = createShapeFormula({ name: 's1', shape: 'underline' });
    p.formulas.push(shape);
    cx.formulaId = shape.id;
    expect(codes(p)).not.toContain('attach-rule');
    cx.attach = createBraceAttach(ca.id, [2, 3]);
    expect(validateProject(p).find((i) => i.code === 'attach-rule')!.message).toBe(
      '"s1" is a shape: it attaches with the shape rule.',
    );
    cx.attach = null; // a detached shape is fine
    expect(codes(p)).not.toContain('attach-rule');
  });

  it('hangs a label at the tip of a brace, and nothing else at a tip', () => {
    const { p, ca, cx, x } = scene();
    const brace = createBraceFormula({ name: 'b1', width: 1 });
    p.formulas.push(brace);
    const t3 = createTrack('Track 3');
    p.tracks.push(t3);
    const cb = createClip(brace.id, t3.id, 2, 6, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      attach: createBraceAttach(ca.id, [2, 3]),
    });
    p.clips.push(cb);
    cx.attach = createTipAttach(cb.id);
    expect(attachIssues(p)).toEqual([]);
    // At the tip of a formula: not a brace.
    cx.attach = createTipAttach(ca.id, 0.3);
    const wrong = validateProject(p).find((i) => i.code === 'attach-rule');
    expect(wrong).toMatchObject({ severity: 'error', path: ['clips', 1, 'attach', 'clipId'] });
    expect(wrong!.message).toBe(`"${x.name}" hangs at the tip of a brace, but "a" is not a brace.`);
    // A brace hangs with the brace rule, never at a tip.
    cb.attach = createTipAttach(ca.id);
    expect(validateProject(p).find((i) => i.path.join() === 'clips,2,attach,rule')?.message).toBe(
      '"b1" is a brace: it attaches with the brace rule.',
    );
  });

  it('checks the target clip, the glyphs and the chain of attachments', () => {
    const { p, cx, ca, x } = scene();
    cx.attach = createAttach('nope', [0]);
    expect(validateProject(p).find((i) => i.code === 'dangling-ref')?.path).toEqual([
      'clips',
      1,
      'attach',
      'clipId',
    ]);
    cx.attach = createAttach(cx.id, [0]);
    expect(codes(p)).toContain('attach-self');
    cx.attach = createAttach(ca.id, []);
    expect(codes(p)).toContain('attach-empty');
    cx.attach = createAttach(ca.id, [2, 7]);
    expect(validateProject(p).find((i) => i.code === 'glyph-range')?.path).toEqual([
      'clips',
      1,
      'attach',
      'glyphs',
    ]);
    // a hangs on x, which hangs on a: neither can be placed.
    cx.attach = createAttach(ca.id, [2]);
    ca.attach = createAttach(cx.id, 'all');
    const cycles = validateProject(p).filter((i) => i.code === 'attach-cycle');
    expect(cycles.map((i) => i.path)).toEqual([
      ['clips', 0, 'attach'],
      ['clips', 1, 'attach'],
    ]);
    expect(cycles[0]!.message).toContain(`"${x.name}" → "a"`);
  });

  it('refuses a start while the target glyphs are still drawn, animated by a block or moved by a transfer', () => {
    const { p, ca, cx } = scene();
    cx.start = 0.5; // inside the Write intro
    cx.end = 2;
    const [busy] = attachIssues(p);
    expect(busy).toMatchObject({ severity: 'error', code: 'attach-target-busy' });
    expect(busy!.message).toMatch(/glyphs 2, 3 of "a" while the intro is still animating them/);
    expect(busy!.message).toContain('at 0.5 s');
    // Exactly when the intro ends, or exactly when it starts: Manim measures whole glyphs.
    cx.start = 1;
    expect(attachIssues(p)).toEqual([]);
    cx.start = 0;
    expect(attachIssues(p)).toEqual([]);
    // Inside the outro.
    cx.start = 5.5;
    cx.end = 6;
    expect(codes(p)).toContain('attach-target-busy');
    // A Disappear block on glyph 2 at [2, 3): busy at 2.5, not on glyph 3 only.
    cx.start = 2.5;
    cx.end = 4;
    ca.actions.push(createDisappear(2, 'fade_out', [2]));
    expect(attachIssues(p).map((i) => i.code)).toEqual(['attach-target-busy']);
    expect(attachIssues(p)[0]!.message).toMatch(/glyph 2 of "a" while the FadeOut block/);
    cx.attach = createAttach(ca.id, [3]);
    expect(attachIssues(p)).toEqual([]);
    // A tween or a part Transform of the target is fine: the interpolated glyphs are measured.
    ca.actions = [
      createTween(2, 1, { position: [1, 1] }),
      createPartTransform(2, [3], { shift: [0, 1] }),
    ];
    expect(attachIssues(p)).toEqual([]);
    expect(codes(p)).not.toContain('attach-target-busy');
    // A relation moving glyph 3 away over [3, 4): busy at 3.5.
    ca.actions = [];
    const { p: q, ca: qa, cx: qx } = scene();
    const [, , t3] = [...q.tracks, createTrack('Track 3')];
    q.tracks.push(t3!);
    const b = createFormula({ name: 'b', source: 'd', snapshot: boxSnapshot(['d']) });
    const cb = createClip(b.id, t3!.id, 3, 6, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    q.formulas.push(b);
    q.clips.push(cb);
    q.relations.push(
      createRelation(qa.id, cb.id, {
        offset: 0,
        duration: 1,
        pairs: [{ from: [3], to: [0], style: null }],
      }),
    );
    qx.start = 3.5;
    expect(attachIssues(q).map((i) => i.code)).toEqual(['attach-target-busy']);
    expect(attachIssues(q)[0]!.message).toMatch(/glyph 3 of "a" while a relation window/);
  });

  it('refuses glyphs that left the screen, and warns about glyphs not on screen yet', () => {
    const { p, ca, cx } = scene();
    // The target clip ended before the object attaches.
    cx.start = 6.5;
    cx.end = 7;
    const [gone] = attachIssues(p);
    expect(gone).toMatchObject({ severity: 'error', code: 'attach-target-gone' });
    expect(gone!.message).toMatch(/^Glyphs 2, 3 of "a" have left the screen/);
    // A transfer consumed glyph 2 over [3, 4): gone at 4.5, glyph 3 still there.
    const [, , t3] = [...p.tracks, createTrack('Track 3')];
    p.tracks.push(t3!);
    const b = createFormula({ name: 'b', source: 'd', snapshot: boxSnapshot(['d']) });
    const cb = createClip(b.id, t3!.id, 3, 6, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    p.formulas.push(b);
    p.clips.push(cb);
    p.relations.push(
      createRelation(ca.id, cb.id, {
        offset: 0,
        duration: 1,
        pairs: [{ from: [2], to: [0], style: null }],
      }),
    );
    cx.start = 4.5;
    cx.end = 5;
    expect(attachIssues(p).map((i) => [i.code, i.severity])).toEqual([
      ['attach-target-gone', 'error'],
    ]);
    expect(attachIssues(p)[0]!.message).toMatch(/^Glyph 2 of "a" has left the screen/);
    // Not there yet: the target starts later, or the glyph is hidden.
    p.relations = [];
    ca.start = 4;
    ca.end = 8;
    cx.start = 3;
    cx.end = 4;
    const [hidden] = attachIssues(p);
    expect(hidden).toMatchObject({ severity: 'warning', code: 'attach-target-hidden' });
    expect(hidden!.message).toMatch(
      /^Glyphs 2, 3 of "a" are not on screen when "x" attaches to them \(at 3 s\)/,
    );
    ca.start = 0;
    ca.end = 6;
    p.formulas[0]!.hiddenGlyphs = [3];
    expect(attachIssues(p).map((i) => i.code)).toEqual(['attach-target-hidden']);
    expect(attachIssues(p)[0]!.message).toMatch(/^Glyph 3 of "a" is not on screen/);
  });
});

describe('emphasis blocks', () => {
  /** One clip of formula `a` (5 glyphs) on [0, 4] with a 1 s write and a 1 s fade-out. */
  function scene(): Project {
    const p = smallProject();
    p.relations = [];
    p.clips = [p.clips[0]!];
    return p;
  }

  it('keeps a block inside its clip and its glyphs within the formula', () => {
    const p = scene();
    p.clips[0]!.actions.push(createEmphasis(3.5, 'indicate', [1, 9], { duration: 1 }));
    expect(codes(p)).toContain('action-bounds');
    expect(codes(p)).toContain('glyph-range');
  });

  it('reports an Indicate of a glyph the intro is still writing, naming the block', () => {
    const p = scene();
    p.clips[0]!.actions.push(createEmphasis(0.5, 'indicate', [1]));
    const [overlap, ...rest] = validateProject(p).filter((i) => i.code === 'action-overlap');
    expect(rest).toEqual([]);
    expect(overlap!.message).toMatch(/^The Indicate block and the intro animate glyph 1 of "a"/);
  });

  it('lets a Circumscribe run with a tween and an Indicate, but not start while the intro draws its glyphs', () => {
    const p = scene();
    const clip = p.clips[0]!;
    clip.actions.push(
      createTween(1.5, 1, { position: [1, 0] }),
      createEmphasis(1.5, 'circumscribe', [1, 2]),
      createEmphasis(2.5, 'indicate', [3], { duration: 0.4 }),
    );
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    clip.actions.push(createEmphasis(0.5, 'flash', 'all'));
    const [busy, ...rest] = validateProject(p).filter((i) => i.code === 'emphasis-target-busy');
    expect(rest).toEqual([]);
    expect(busy).toMatchObject({ severity: 'error', path: ['clips', 0, 'actions', 3] });
    expect(busy!.message).toMatch(
      /^The Flash block starts while the intro is still animating glyphs 0, 1, 2, 3, 4 of "a" \(at 0.5 s\): Manim would measure them half drawn/,
    );
    // Exactly when the intro ends: whole glyphs.
    clip.actions[3]!.start = 1;
    expect(codes(p)).not.toContain('emphasis-target-busy');
  });

  it('warns about a listed glyph off screen, and about a block that animates nothing', () => {
    const p = scene();
    p.formulas[0]!.hiddenGlyphs = [4];
    p.clips[0]!.actions.push(createEmphasis(2, 'focus_on', [4]));
    expect(codes(p)).toEqual(['action-skips-glyphs', 'action-empty']);
    expect(validateProject(p)[0]!.message).toMatch(/^The FocusOn block leaves out glyph 4/);
  });
});

describe('the arc of a relation or of a Morph block', () => {
  const arcErrors = (p: Project) =>
    validateProject(p)
      .filter((issue) => issue.code === 'path-arc')
      .map((issue) => `${issue.severity} ${issue.path.join('.')}`);

  it('is within the turn its fields take, either way', () => {
    expect(PATH_ARC_LIMIT).toBe(360);
    for (const degrees of [0, 30, -90, 360, -360]) {
      const p = smallProject();
      p.relations[0]!.pathArc = degrees;
      expect(arcErrors(p)).toEqual([]);
    }
    for (const degrees of [360.5, -361, 900_000, 1e300, -1e300, Infinity]) {
      const p = smallProject();
      p.relations[0]!.pathArc = degrees;
      expect(arcErrors(p)).toEqual(['error relations.0.pathArc']);
    }
  });

  it('a Morph block’s too', () => {
    const p = smallProject();
    p.relations = [];
    const morph = createMorph(1.5, { pairs: [{ from: [0], to: [3], style: null }] });
    p.clips[0]!.actions.push(morph);
    expect(arcErrors(p)).toEqual([]);
    morph.pathArc = 1e300;
    expect(arcErrors(p)).toEqual(['error clips.0.actions.0.pathArc']);
  });
});

describe('the length of a scene', () => {
  const lengthErrors = (p: Project) =>
    validateProject(p)
      .filter((issue) => issue.code === 'scene-length')
      .map((issue) => `${issue.severity} ${issue.path.join('.')}`);

  it('is a day at most: its duration, and the end of each of its clips', () => {
    expect(MAX_SCENE_SECONDS).toBe(86_400);
    const p = smallProject();
    expect(lengthErrors(p)).toEqual([]);
    p.meta.duration = MAX_SCENE_SECONDS;
    expect(lengthErrors(p)).toEqual([]);
    for (const duration of [MAX_SCENE_SECONDS + 1, 36_000_000, 1e300, Infinity]) {
      p.meta.duration = duration;
      expect(lengthErrors(p)).toEqual(['error meta.duration']);
    }
    p.meta.duration = null;
    p.clips[1]!.end = 1e15;
    expect(lengthErrors(p)).toEqual(['error clips.1.end']);
  });
});
