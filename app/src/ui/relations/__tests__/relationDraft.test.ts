// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { smallProject } from '../../../model/__tests__/fixtures';
import {
  createAppear,
  createDisappear,
  createMorph,
  createRelation,
  validateProject,
  type Relation,
} from '../../../model';
import {
  draftProblems,
  initialDraft,
  neverShownGlyphs,
  pairSeverities,
  projectWithDraft,
  relationEligibility,
  resolveDraft,
  unpairedGlyphs,
} from '../relationDraft';

/** The small project: clip a [0, 4] (5 glyphs) → clip b [2, 6] (4 glyphs), pair 0 → 3. */
function setup() {
  const project = smallProject();
  const [from, to] = project.clips;
  const relation = project.relations[0]!;
  return { project, from: from!, to: to!, relation };
}

describe('relation draft', () => {
  it('runs a matched outro from the window start to the end of the source clip', () => {
    const { from, to, relation } = setup();
    const draft = { ...initialDraft(relation, from, to), matchOut: true };
    const windowStart = to.start + relation.offset;
    expect(resolveDraft(draft, from, to).outro.duration).toBeCloseTo(from.end - windowStart);
    // Unmatched, it keeps its own duration.
    expect(resolveDraft({ ...draft, matchOut: false }, from, to).outro).toEqual(from.outro);
  });

  it('saves into a copy of the project, with the outro and intro on their clips', () => {
    const { project, from, to, relation } = setup();
    const draft = initialDraft(relation, from, to);
    const outro = { ...draft.outro, duration: 0.5 };
    const next = projectWithDraft(project, { ...draft, outro });
    expect(next.clips.find((c) => c.id === from.id)!.outro.duration).toBe(0.5);
    expect(project.clips[0]!.outro.duration).toBe(from.outro.duration);
  });

  it('leaves out of the outro and intro the glyphs its pairs carry, except copies at the source', () => {
    const { project, from, to, relation } = setup();
    const draft = initialDraft(relation, from, to);
    expect(unpairedGlyphs(project, draft, 5, 4)).toEqual({
      leaving: [1, 2, 3, 4],
      entering: [0, 1, 2],
    });
    const copy = { ...relation, pairs: [{ ...relation.pairs[0]!, style: 'copy' as const }] };
    expect(unpairedGlyphs(project, { ...draft, relation: copy }, 5, 4).leaving).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it('leaves out the glyphs Morph blocks bring in or take away (audit A3-03)', () => {
    // a (5 glyphs, [0, 4]) → b (4 glyphs, [2, 6]), a:0 → b:3 over [2, 3).
    const { project, from, to, relation } = setup();
    // b's Morph block copies b:2 into b:1 over [3, 4): b:1 skips the intro.
    to.actions.push(
      createMorph(1, { duration: 1, style: 'copy', pairs: [{ from: [2], to: [1], style: null }] }),
    );
    // a's Morph block turns a:4 into a:2 over [2, 3): a:4 is gone before the outro.
    from.actions.push(
      createMorph(2, {
        duration: 1,
        style: 'transform',
        pairs: [{ from: [4], to: [2], style: null }],
      }),
    );
    expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([]);
    const { leaving, entering } = unpairedGlyphs(project, initialDraft(relation, from, to), 5, 4);
    // What plays: b:1 is not in b's intro, a:4 is not in a's outro.
    expect(leaving).toEqual([1, 2, 3]);
    expect(entering).toEqual([0, 2]);
  });

  it('leaves out what blocks of the clips bring in or take out, and what the target hides', () => {
    const { project, from, to, relation } = setup();
    // a's Disappear takes a:1 out before its outro; b's Appear brings b:0 at 4 s; b hides b:2.
    from.actions.push(createDisappear(1, 'fade_out', [1], { duration: 0.5 }));
    to.actions.push(createAppear(2, 'write', [0], { duration: 0.5 }));
    to.startHidden = [2];
    const draft = initialDraft(relation, from, to);
    expect(unpairedGlyphs(project, draft, 5, 4)).toEqual({ leaving: [2, 3, 4], entering: [1] });
    // A target that starts empty: what nothing brings stays out — b:0 comes with the Appear.
    expect(unpairedGlyphs(project, { ...draft, startsEmpty: true }, 5, 4).entering).toEqual([1, 2]);
  });

  it('carries whether the target starts empty, and saves it on the target clip alone', () => {
    const { project, from, to, relation } = setup();
    const draft = initialDraft(relation, from, to);
    expect(draft.startsEmpty).toBe(false);
    const next = projectWithDraft(project, { ...draft, startsEmpty: true });
    expect(next.clips.find((c) => c.id === to.id)!.startsEmpty).toBe(true);
    expect('startsEmpty' in next.clips.find((c) => c.id === from.id)!).toBe(false);
    expect('startsEmpty' in project.clips[1]!).toBe(false);
    // A target that starts empty opens so, and unchecking takes the mark off the clip.
    const empty = next.clips.find((c) => c.id === to.id)!;
    const again = initialDraft(relation, from, empty);
    expect(again.startsEmpty).toBe(true);
    const back = projectWithDraft(next, { ...again, startsEmpty: false });
    expect('startsEmpty' in back.clips.find((c) => c.id === to.id)!).toBe(false);
  });

  it('leaves the intro of a target that starts empty as it is, matched or not', () => {
    const { from, to, relation } = setup(); // b on [2, 6] fades in over 1 s; the window is [2, 3)
    const moved = { ...relation, offset: 1, duration: 1.5 }; // [3, 4.5)
    const matched = { ...initialDraft(moved, from, to), matchIn: true };
    // Matched, the intro runs from the start of the clip to the end of the window…
    expect(resolveDraft(matched, from, to).intro.duration).toBeCloseTo(2.5);
    // … unless the clip starts empty: nothing would be seen of it, and its blocks would be cut.
    const empty = resolveDraft({ ...matched, startsEmpty: true }, from, to);
    expect(empty.intro).toEqual(to.intro);
    expect(empty.matchIn).toBe(true);
  });

  it('counts what never shows of a target that starts empty', () => {
    const { project, from, to, relation } = setup(); // the pair brings b:3
    const draft = { ...initialDraft(relation, from, to), startsEmpty: true };
    expect(neverShownGlyphs(project, draft, 4)).toEqual([0, 1, 2]);
    // An Appear block of the clip brings two more: they do not stay out.
    project.clips[1]!.actions.push(createAppear(1.5, 'write', [0, 1], { duration: 0.5 }));
    expect(neverShownGlyphs(project, draft, 4)).toEqual([2]);
    // Without the mark every glyph shows: the intro brings the rest.
    expect(neverShownGlyphs(project, { ...draft, startsEmpty: false }, 4)).toEqual([]);
  });

  it('says so when the target would start empty with nothing to fill it', () => {
    const { project, from, to, relation } = setup();
    const bare = { ...initialDraft({ ...relation, pairs: [] }, from, to), startsEmpty: true };
    expect(draftProblems(project, bare).map((p) => p.code)).toEqual(['starts-empty-unused']);
    // One pair is enough.
    const filled = { ...initialDraft(relation, from, to), startsEmpty: true };
    expect(draftProblems(project, filled)).toEqual([]);
  });

  it('says so too of a target that leaves all its glyphs out itself, and nothing else of its list', () => {
    const { project, from, relation } = setup(); // b has four glyphs
    // The first half of a split that showed nothing: with no pair, it still never shows.
    project.clips[1]!.startHidden = [0, 1, 2, 3];
    const target = project.clips[1]!;
    const bare = initialDraft({ ...relation, pairs: [] }, from, target);
    expect(draftProblems(project, bare).map((p) => p.code)).toEqual(['start-hidden-unused']);
    expect(draftProblems(project, initialDraft(relation, from, target))).toEqual([]);
    // A glyph of the list that does not exist is not the relation's to mend: it was there before.
    project.clips[1]!.startHidden = [0, 9];
    expect(draftProblems(project, initialDraft(relation, from, project.clips[1]!))).toEqual([]);
  });

  it('reports the problems of the saved relation and the pairs they are about', () => {
    const { project, from, to, relation } = setup();
    const broken = {
      ...relation,
      pairs: [...relation.pairs, { from: [99], to: [0], style: null }],
    };
    const problems = draftProblems(project, initialDraft(broken, from, to));
    expect(problems.length).toBeGreaterThan(0);
    expect(pairSeverities(problems)).toEqual(new Map([[1, 'error']]));
    expect(draftProblems(project, initialDraft(relation, from, to))).toEqual([]);
  });

  it('tells a pair with only warnings from a pair with an error (D177)', () => {
    const { project, from, to, relation } = setup();
    // Glyph 0 of a leaves at 1 s, before the relation takes it: it appears out of nowhere.
    from.actions.push(createDisappear(1, 'fade_out', [0], { duration: 0.5 }));
    const broken = {
      ...relation,
      pairs: [...relation.pairs, { from: [99], to: [0], style: null }],
    };
    const problems = draftProblems(project, initialDraft(broken, from, to));
    expect(problems.filter((p) => p.path[3] === 0).map((p) => [p.severity, p.code])).toEqual([
      ['warning', 'source-hidden'],
    ]);
    expect(pairSeverities(problems)).toEqual(
      new Map([
        [0, 'warning'],
        [1, 'error'],
      ]),
    );
    // Another relation's pairs are left out when its index is given.
    expect(pairSeverities(problems, 1).size).toBe(0);
  });
});

describe('what other transfers keep from a relation', () => {
  /** A second relation a → b over [2 + offset, …), with no pairs yet: the draft. */
  function second(offset: number) {
    const { project, from, to, relation } = setup();
    const draft = createRelation(from.id, to.id, { offset, duration: 0.5 });
    return { project, from, to, first: relation, draft };
  }
  const entries = (map: Map<number, string>) => [...map];

  it('is nothing for the only relation of its clips', () => {
    const { project, relation } = setup();
    const { ineligible, notes } = relationEligibility(project, relation);
    expect([ineligible.from.size, ineligible.to.size, notes.from.size]).toEqual([0, 0, 0]);
  });

  it('dims the target another relation brings, and the source it consumed earlier', () => {
    // The first relation takes a:0 into b:3 over [2, 3); the draft starts at 3.2.
    const { project, draft } = second(1.2);
    const { ineligible, notes, consumed } = relationEligibility(project, draft);
    // The other relation is named as it will be numbered once the draft is saved.
    expect(entries(ineligible.to)).toEqual([[3, 'brought in by relation 1 of 2 (a → b)']]);
    expect(entries(ineligible.from)).toEqual([[0, 'consumed earlier by relation 1 of 2 (a → b)']]);
    expect(notes.from.size).toBe(0);
    // Gone before the draft starts, it is not even there to copy: dimmed, not outlined.
    expect(consumed.from.size).toBe(0);
  });

  it('only notes a source consumed at the same time or later: it can still be copied', () => {
    const { project, draft } = second(0); // [2, 2.5): starts with the first
    const { ineligible, notes, consumed } = relationEligibility(project, draft);
    expect(ineligible.from.size).toBe(0);
    expect(entries(notes.from)).toEqual([
      [0, 'relation 1 of 2 (a → b) consumes it: here it can only be copied'],
    ]);
    // What the drawing outlines in red dashes (D184): the same glyph, with the same words.
    expect(entries(consumed.from)).toEqual(entries(notes.from));
    expect(entries(ineligible.to)).toEqual([[3, 'brought in by relation 1 of 2 (a → b)']]);
  });

  it('agrees with validation: a pair on a dimmed glyph is an error, on a free one it is not', () => {
    const { project, draft } = second(1.2);
    const errors = (relation: Relation) =>
      validateProject({ ...project, relations: [...project.relations, relation] })
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.code);
    const pair = (from: number, to: number, style: 'copy' | null = null) => ({
      ...draft,
      pairs: [{ from: [from], to: [to], style }],
    });
    expect(errors(pair(2, 1))).toEqual([]);
    expect(errors(pair(2, 3))).toEqual(['target-conflict']);
    expect(errors(pair(0, 1))).toEqual(['source-consumed-twice']);
    expect(errors(pair(0, 1, 'copy'))).toEqual(['source-used-after-consumed']);
    // The noted source: copied, fine; consumed, not.
    const early = { ...draft, offset: 0 };
    const at = (style: 'copy' | null) => ({
      ...early,
      pairs: [{ from: [0], to: [1], style }],
    });
    expect(errors(at('copy'))).toEqual([]);
    expect(errors(at(null))).toEqual(['source-consumed-twice']);
  });

  it('numbers the relation it blames among several of the same clips, and names a Morph block', () => {
    const { project, from, to, draft } = second(1.2);
    project.relations.push(
      createRelation(from.id, to.id, {
        offset: 0.2,
        duration: 0.5,
        pairs: [{ from: [4], to: [0], style: null }],
      }),
    );
    // b's own Morph block takes b:3 (arrived by 3) into b:2 over [4.5, 5.5): a copy.
    project.clips[1]!.actions.push(
      createMorph(2.5, { pairs: [{ from: [3], to: [2], style: null }] }),
    );
    const { ineligible } = relationEligibility(project, draft);
    expect(entries(ineligible.to).sort(([x], [y]) => x - y)).toEqual([
      [0, 'brought in by relation 2 of 3 (a → b)'],
      [2, 'brought in by a Morph block'],
      [3, 'brought in by relation 1 of 3 (a → b)'],
    ]);
    expect(entries(ineligible.from).sort(([x], [y]) => x - y)).toEqual([
      [0, 'consumed earlier by relation 1 of 3 (a → b)'],
      [4, 'consumed earlier by relation 2 of 3 (a → b)'],
    ]);
  });

  it('dims a source another relation is still bringing in when the window starts', () => {
    const { project, from, to } = setup();
    // b → a, bringing a:1 over [2.2, 3.2); the draft a → b starts at 3, inside it.
    project.relations.push(
      createRelation(to.id, from.id, {
        offset: 2.2,
        duration: 1,
        pairs: [{ from: [0], to: [1], style: 'copy' }],
      }),
    );
    const draft = createRelation(from.id, to.id, { offset: 1, duration: 0.5 });
    expect(entries(relationEligibility(project, draft).ineligible.from)).toEqual([
      [0, 'consumed earlier by relation 1 of 2 (a → b)'],
      [1, 'still arriving through the relation b → a'],
    ]);
    // Once it has arrived the glyph is free.
    const later = { ...draft, offset: 1.3 };
    expect(relationEligibility(project, later).ineligible.from.has(1)).toBe(false);
    // Before it starts to arrive it is not there to consume: it could only be copied, out of
    // nowhere.
    const sooner = { ...draft, offset: 0.1 };
    const early = relationEligibility(project, sooner);
    expect(early.ineligible.from.has(1)).toBe(false);
    expect(early.notes.from.get(1)).toBe(
      'the relation b → a brings it in later: it is not on screen yet',
    );
  });

  it('notes a source another relation copies later, and dims a target taken while it arrives', () => {
    const { project, from, to } = setup(); // a:0 → b:3 over [2, 3)
    // The first relation made a copy, later: a:0 is copied over [4, 5).
    project.relations[0]!.style = 'copy';
    project.relations[0]!.offset = 2;
    // b sends its glyph 1 back to a:4 over [3.5, 4.5): a copy.
    project.relations.push(
      createRelation(to.id, from.id, {
        offset: 3.5,
        duration: 1,
        pairs: [{ from: [1], to: [4], style: 'copy' }],
      }),
    );
    // The draft a → b over [3, 4).
    const draft = createRelation(from.id, to.id, { offset: 1, duration: 1 });
    const { ineligible, notes } = relationEligibility(project, draft);
    // Consumed here at 3, a:0 could not be copied at 4. The other relation plays after the
    // draft: it is the second of the two.
    expect(notes.from.get(0)).toBe(
      'relation 2 of 2 (a → b) copies it later: here it can only be copied',
    );
    // b:1 leaves for a at 3.5, when the draft would still be bringing it.
    expect(ineligible.to.get(1)).toBe('the relation b → a takes it before it would have arrived');
  });
});
