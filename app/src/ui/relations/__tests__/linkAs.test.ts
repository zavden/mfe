// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  setIdGenerator,
  type GlyphPair,
  type Issue,
  type RelationStyle,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { boxSnapshot } from '../../../model/__tests__/fixtures';
import { hintedProblem, linkOffer, type LinkGlyphs } from '../linkAs';
import { draftProblems, relationEligibility, type RelationDraft } from '../relationDraft';
import { linkPair, type PairHolder } from '../relationOps';

const holder = (pairs: GlyphPair[], style: PairHolder['style'] = 'transform'): PairHolder => ({
  pairs,
  style,
});
const link = (
  h: PairHolder,
  from: readonly number[],
  to: readonly number[],
  style: null | PairHolder['style'],
  separate: boolean,
) => linkPair(h, from, to, style, undefined, { separate });
const none = () => [];
/** A choice of style onto free targets that nothing holds back. */
const free = (style: RelationStyle, label: string) => ({
  key: style,
  style,
  separate: false,
  label,
  blocked: null,
  warning: null,
});
const issue = (severity: Issue['severity'], message: string, pair: number): Issue => ({
  severity,
  code: 'target-conflict',
  message,
  path: ['relations', 0, 'pairs', pair],
});

describe('linkOffer', () => {
  it('offers every style for free glyphs, in the order of the style lists', () => {
    const offer = linkOffer(holder([]), [2, 1, 2], [0], link, none);
    expect(offer).toEqual({
      from: [1, 2],
      to: [0],
      joins: null,
      refused: null,
      choices: [
        free('transform', 'Link as Transform'),
        free('copy', 'Link as Copy'),
        free('fade', 'Link as Fade transform'),
        free('fade_copy', 'Link as Fade copy'),
      ],
    });
  });

  it('has nothing to offer for one side, or for glyphs linked to each other already', () => {
    expect(linkOffer(holder([]), [1], [], link, none)).toBeNull();
    expect(linkOffer(holder([]), [], [1], link, none)).toBeNull();
    const pairs: GlyphPair[] = [{ from: [0, 1], to: [3], style: null }];
    expect(linkOffer(holder(pairs), [0], [3], link, none)).toBeNull();
    expect(linkOffer(holder(pairs), [0, 1], [3], link, none)).toBeNull();
    // A glyph more than the pair holds is something to link.
    expect(linkOffer(holder(pairs), [0, 2], [3], link, none)).not.toBeNull();
  });

  it('blocks the styles that would consume a source another pair consumes', () => {
    const pairs: GlyphPair[] = [{ from: [0], to: [0], style: null }];
    const offer = linkOffer(holder(pairs), [0], [1], link, none)!;
    const reason =
      'Source glyph (0) is already consumed by another pair. Make one of the pairs a copy.';
    expect(offer.choices.map((c) => [c.style, c.blocked])).toEqual([
      ['transform', reason],
      ['copy', null],
      ['fade', reason],
      // A copy that cross-fades leaves the source too.
      ['fade_copy', null],
    ]);
    expect(offer.refused).toBeNull();
    // With the other pair a copy, the source is free for every style.
    const copied: GlyphPair[] = [{ from: [0], to: [0], style: 'copy' }];
    expect(linkOffer(holder(copied), [0], [1], link, none)!.choices.every((c) => !c.blocked)).toBe(
      true,
    );
  });

  it('joins the pair whose targets are linked onto, with that pair’s style', () => {
    const pairs: GlyphPair[] = [
      { from: [0], to: [0], style: null },
      { from: [1], to: [1], style: 'fade' },
    ];
    // Join the pair — or, onto all its targets, bring them through a pair of its own (D167).
    const apart = (style: RelationStyle, label: string) => ({
      ...free(style, label),
      key: `separate-${style}`,
      separate: true,
    });
    expect(linkOffer(holder(pairs, 'copy'), [2], [0], link, none)).toEqual({
      from: [2],
      to: [0],
      joins: 0,
      refused: null,
      choices: [
        {
          key: 'join',
          style: null,
          separate: false,
          label: 'Join pair 1 (Copy)',
          blocked: null,
          warning: null,
        },
        apart('transform', 'Separate pair as Transform'),
        apart('copy', 'Separate pair as Copy'),
        apart('fade', 'Separate pair as Fade transform'),
        apart('fade_copy', 'Separate pair as Fade copy'),
      ],
    });
    expect(linkOffer(holder(pairs), [2], [1], link, none)!.choices[0]!.label).toBe(
      'Join pair 2 (Fade transform)',
    );
    // Targets of two pairs that bring different glyphs: nothing can be made, said once.
    const mixed = linkOffer(holder(pairs), [2], [0, 1], link, none)!;
    expect(mixed.joins).toBeNull();
    expect(mixed.choices.map((c) => c.key)).toEqual(['transform', 'copy', 'fade', 'fade_copy']);
    expect(mixed.choices[0]!.blocked).toMatch(/linked in different pairs/);
    expect(mixed.refused).toBe(mixed.choices[0]!.blocked);
    // A source the pair holds already is not linked onto its target again, joined or apart.
    const twice = linkOffer(holder(pairs), [0, 2], [0], link, none)!;
    expect(twice.refused).toBe('Source glyph (0) is in pair 1 already.');
    expect(twice.choices.map((c) => c.key)).toEqual([
      'join',
      'separate-transform',
      'separate-copy',
      'separate-fade',
      'separate-fade_copy',
    ]);
  });

  it('onto targets that several pairs bring, it is one more pair of its own', () => {
    const pairs: GlyphPair[] = [
      { from: [0], to: [5], style: null },
      { from: [1], to: [5], style: 'copy' },
    ];
    const offer = linkOffer(holder(pairs), [2], [5], link, none)!;
    expect(offer.joins).toBeNull();
    expect(offer.choices.map((c) => [c.key, c.separate, c.label, c.blocked])).toEqual([
      ['transform', true, 'Link as Transform', null],
      ['copy', true, 'Link as Copy', null],
      ['fade', true, 'Link as Fade transform', null],
      ['fade_copy', true, 'Link as Fade copy', null],
    ]);
    // Onto some of the targets of a pair of several: it can only join.
    const wide: GlyphPair[] = [{ from: [0], to: [5, 6], style: null }];
    expect(linkOffer(holder(wide), [2], [5], link, none)!.choices.map((c) => c.key)).toEqual([
      'join',
    ]);
  });

  it('says once a reason that every style shares', () => {
    const refuse = () => ({ ok: false as const, message: 'Not these glyphs.' });
    const offer = linkOffer(holder([]), [0], [1], refuse, none)!;
    expect(offer.refused).toBe('Not these glyphs.');
    expect(offer.choices.every((c) => c.blocked === 'Not these glyphs.')).toBe(true);
  });

  it('reads the rules of the project: a new error blocks, a new warning is said, old ones are not', () => {
    const old = issue('error', 'An old problem.', 0);
    const problems = (pairs: GlyphPair[]): Issue[] => {
      const added = pairs.at(-1);
      const out = pairs.length > 0 ? [old] : [];
      if (pairs.length < 2) return out;
      if (added?.style === 'transform') out.push(issue('error', 'It is consumed elsewhere.', 1));
      if (added?.style === 'fade') {
        out.push(issue('warning', 'It is hidden then.', 1), issue('error', 'It arrives twice.', 1));
      }
      if (added?.style === 'copy') out.push(issue('warning', 'It is hidden then.', 1));
      return out;
    };
    const pairs: GlyphPair[] = [{ from: [0], to: [0], style: 'copy' }];
    const offer = linkOffer(holder(pairs), [1], [1], link, problems)!;
    expect(offer.choices).toEqual([
      { ...free('transform', 'Link as Transform'), blocked: 'It is consumed elsewhere.' },
      { ...free('copy', 'Link as Copy'), warning: 'It is hidden then.' },
      { ...free('fade', 'Link as Fade transform'), blocked: 'It arrives twice.' },
      free('fade_copy', 'Link as Fade copy'),
    ]);
    expect(offer.refused).toBeNull();
  });
});

describe('linkOffer with the rules of a project', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = setIdGenerator(sequentialIds());
  });
  afterEach(() => restore());

  /** Clips `a` and `b` over [0, 10] with a relation a → b at [6, 7] that consumes glyph 0 of `a`
   * into glyph 0 of `b`, and the draft of a second relation a → b at `start`. */
  function twice(start: number) {
    const project = createEmptyProject();
    const [a, b] = ['a', 'b'].map((name, i) => {
      const formula = createFormula({ name, snapshot: boxSnapshot(['w', 'x', 'y', 'z']) });
      project.formulas.push(formula);
      const clip = createClip(formula.id, project.tracks[i]!.id, 0, 10);
      project.clips.push(clip);
      return clip;
    }) as [ReturnType<typeof createClip>, ReturnType<typeof createClip>];
    project.relations.push(
      createRelation(a.id, b.id, {
        offset: 6,
        duration: 1,
        pairs: [{ from: [0], to: [0], style: 'transform' }],
      }),
    );
    const relation = createRelation(a.id, b.id, { offset: start, duration: 1 });
    const draft = (pairs: GlyphPair[]): RelationDraft => ({
      relation: { ...relation, pairs },
      outro: a.outro,
      intro: b.intro,
      startsEmpty: false,
      matchOut: false,
      matchIn: false,
    });
    return {
      holder: { ...relation, pairs: [] },
      problems: (pairs: GlyphPair[]) => draftProblems(project, draft(pairs)),
      // As the relation editor says it: the word its canvas has for the glyph.
      explain: (issue: Issue, glyphs: LinkGlyphs) => {
        const { ineligible, notes } = relationEligibility(project, relation);
        return hintedProblem(
          issue,
          glyphs,
          { from: a.id, to: b.id },
          { from: new Map([...notes.from, ...ineligible.from]), to: ineligible.to },
          (_, g) => 'wxyz'[g]!,
        );
      },
    };
  }

  it('lets a glyph that a later relation consumes be copied, not consumed', () => {
    const { holder: h, problems } = twice(2);
    const offer = linkOffer(h, [0], [1], link, problems)!;
    expect(offer.choices.map((c) => [c.style, c.blocked !== null])).toEqual([
      ['transform', true],
      ['copy', false],
      ['fade', true],
      ['fade_copy', false],
    ]);
    expect(offer.refused).toBeNull();
    expect(offer.choices[0]!.blocked).toBe(
      'Source glyph 0 of "a" is consumed by more than one pair.',
    );
    // A glyph nothing else touches takes every style.
    expect(linkOffer(h, [1], [1], link, problems)!.choices.every((c) => !c.blocked)).toBe(true);
  });

  it('says a problem with the word the canvas has for the glyph: who else takes it', () => {
    const early = twice(2);
    const copyOnly = linkOffer(early.holder, [0, 1], [1], link, early.problems, early.explain)!;
    expect(copyOnly.choices[0]!.blocked).toBe(
      'Source glyph w (0) — relation 2 of 2 (a → b) consumes it: here it can only be copied.',
    );
    expect(copyOnly.choices[1]!.blocked).toBeNull();
    const late = twice(8);
    const gone = linkOffer(late.holder, [0], [1], link, late.problems, late.explain)!;
    expect(gone.refused).toBe('Source glyph w (0) — consumed earlier by relation 1 of 2 (a → b).');
    const brought = linkOffer(late.holder, [1], [0], link, late.problems, late.explain)!;
    expect(brought.refused).toBe('Target glyph w (0) — brought in by relation 1 of 2 (a → b).');
  });

  it('keeps the message of a problem that names no glyph of the link with a hint', () => {
    const problem: Issue = {
      severity: 'error',
      code: 'target-conflict',
      message: 'As validation says it.',
      path: [],
      identity: {
        subject: { kind: 'relation', relationId: 'r' },
        participants: [],
        glyphs: [
          { clipId: 'a', index: 0 },
          { clipId: 'b', index: 5 },
        ],
      },
    };
    const clips = { from: 'a', to: 'b' };
    const hints = { from: new Map([[1, 'busy']]), to: new Map([[5, 'taken']]) };
    const name = () => 'x';
    // Glyph 0 of the source has no hint; glyph 5 of the target is not one of the link's.
    expect(hintedProblem(problem, { from: [0], to: [2] }, clips, hints, name)).toBeNull();
    expect(hintedProblem(problem, { from: [0], to: [5] }, clips, hints, name)).toBe(
      'Target glyph x (5) — taken.',
    );
    expect(
      hintedProblem(
        { ...problem, identity: undefined },
        { from: [0], to: [5] },
        clips,
        hints,
        name,
      ),
    ).toBeNull();
    // One clip on both sides (a Morph block): the glyph is on the side of the link that holds it.
    const one = { from: 'a', to: 'a' };
    const both = { from: new Map([[0, 'not yet on screen']]), to: new Map([[0, 'linked']]) };
    expect(hintedProblem(problem, { from: [3], to: [0] }, one, both, name)).toBe(
      'Target glyph x (0) — linked.',
    );
    expect(hintedProblem(problem, { from: [0], to: [3] }, one, both, name)).toBe(
      'Source glyph x (0) — not yet on screen.',
    );
  });

  it('refuses every style for a glyph the other relation already took, and says it once', () => {
    // After the other relation: its source is gone, and its target arrived through it.
    const { holder: h, problems } = twice(8);
    const gone = linkOffer(h, [0], [1], link, problems)!;
    expect(gone.choices.every((c) => c.blocked !== null)).toBe(true);
    const brought = linkOffer(h, [1], [0], link, problems)!;
    expect(brought.refused).not.toBeNull();
    expect(brought.choices.every((c) => c.blocked === brought.refused)).toBe(true);
  });
});
