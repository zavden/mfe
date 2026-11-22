// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmptyProject,
  createFormula,
  createMorph,
  createPartTransform,
  createRelation,
  clipLifetimes,
  defaultIntro,
  defaultOutro,
  remapGlyphRefs,
  type FormulaSnapshot,
  type GlyphPair,
  type Issue,
  type MorphAction,
  type Project,
  validateProject,
} from '../../../model';
import {
  appearTarget,
  findMorph,
  INTRO_TARGET,
  lineOrder,
  linkMorphPair,
  morphAlive,
  morphEligibility,
  morphLock,
  morphPairSeverities,
  morphProblems,
  morphSummary,
  openMorphDraft,
  rebaseMorphPairs,
  suggestMorphPairs,
  takenOutEarlier,
  whyNoSuggestion,
  withMorphPairs,
} from '../morphDraft';

/* The owner's derivation `A &= x_1 \\ &= x_2 \\ &= x_3`: ten glyphs in three aligned rows, in the
 * order MathJax gives them (A = x 1 | = x 2 | = x 3), the columns at the same x. */
const LABELS = ['A', '=', 'x', '1', '=', 'x', '2', '=', 'x', '3'];
function threeRows(): FormulaSnapshot {
  const at = (x: number, row: number, sub = false): [number, number] => [
    x,
    -row * 1.2 - (sub ? 0.15 : 0),
  ];
  const centers: [number, number][] = [
    at(0, 0),
    at(0.6, 0),
    at(1.2, 0),
    at(1.45, 0, true),
    at(0.6, 1),
    at(1.2, 1),
    at(1.45, 1, true),
    at(0.6, 2),
    at(1.2, 2),
    at(1.45, 2, true),
  ];
  return {
    backend: 'mathjax',
    key: 'rows',
    glyphs: LABELS.map((label, i) => ({ label, center: centers[i]!, size: [0.3, 0.4] })),
  };
}

const ROW1 = [0, 1, 2, 3];
const ROWS23 = [4, 5, 6, 7, 8, 9];
const ALL = [...ROW1, ...ROWS23];

/** The derivation on track 1 over [0, 10] (Write 1 s, FadeOut 1 s) and a Morph block (copy) at
 * 2 s. Nothing is hidden by default: the owner's flow (a target skips the intro by arriving). */
function derivation(hidden: number[] = []) {
  const p: Project = createEmptyProject('morph');
  const f = createFormula({
    name: 'steps',
    source: 'A &= x_1 \\\\ &= x_2 \\\\ &= x_3',
    snapshot: threeRows(),
    hiddenGlyphs: hidden,
  });
  p.formulas.push(f);
  const clip = createClip(f.id, p.tracks[0]!.id, 0, 10, {
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
  });
  const morph = createMorph(2);
  clip.actions.push(morph);
  p.clips.push(clip);
  return { p, f, clip, morph };
}

/** The second step: the first block (2 s) saved with = → = and x → x of row 1 → row 2, the "2"
 * written by an Appear block at 3 s, and a second Morph block at 4 s. */
function secondStep(hidden: number[] = []) {
  const { p, clip } = derivation(hidden);
  clip.actions[0] = createMorph(2, { pairs: [pair([1], [4]), pair([2], [5])] });
  clip.actions.push(createAppear(3, 'write', [6]));
  const second = createMorph(4);
  clip.actions.push(second);
  return { p, clip, second };
}

const pair = (from: number[], to: number[], style: GlyphPair['style'] = null): GlyphPair => ({
  from,
  to,
  style,
});

describe('morphEligibility', () => {
  it('on an unhidden formula, every glyph the intro brought can be a source and a target', () => {
    const { p, clip, morph } = derivation();
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.window).toEqual({ start: 2, end: 3 });
    expect(e.sources).toEqual(ALL);
    expect(e.targets).toEqual(ALL);
    expect(e.notSource.size + e.notTarget.size).toBe(0);
    // Not dimmed, but with a hint: linked, a target skips the intro.
    expect([...e.targetNotes]).toEqual(ALL.map((g) => [g, INTRO_TARGET]));
  });

  it('with rows 2–3 hidden, they can be targets but not sources', () => {
    const { p, clip, morph } = derivation(ROWS23);
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.sources).toEqual(ROW1);
    expect(e.targets).toEqual(ALL);
    expect([...e.notSource]).toEqual(ROWS23.map((g) => [g, 'not on screen yet']));
    expect([...e.targetNotes.keys()]).toEqual(ROW1);
  });

  it('ignores the block’s own pairs, so linking never changes what is offered', () => {
    const { p, clip, morph } = derivation();
    const before = morphEligibility(p, clip.id, morph.id);
    morph.pairs = [pair([1], [4]), pair([2], [5], 'transform')];
    expect(morphEligibility(p, clip.id, morph.id)).toEqual(before);
  });

  it('leaves out the targets other transfers bring in or take from before it', () => {
    const { p, f, clip, morph } = derivation();
    const first = createMorph(1.2, { duration: 0.6, pairs: [pair([1], [4])] });
    clip.actions.unshift(first);
    const other = createClip(f.id, p.tracks[1]!.id, 0, 10);
    p.clips.push(other);
    p.relations.push(createRelation(other.id, clip.id, { offset: 2, pairs: [pair([0], [7])] }));
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.notTarget.get(4)).toBe('brought in by another Morph block');
    expect(e.notTarget.get(7)).toBe('brought in by a relation');
    // The first block copies "=" of row 1 at 1.2 s: it has to be on screen then, not arrive here.
    expect(e.notTarget.get(1)).toBe('a source of an earlier transfer');
    expect(e.targets).toEqual([0, 2, 3, 5, 6, 8, 9]);
    // The first block's target is on screen by 2 s: a source of this one. The relation's is
    // still arriving.
    expect(e.notSource.get(7)).toBe('still arriving');
    expect(e.sources).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9]);
    // Ending later, the first block is still delivering its target when this one starts.
    first.duration = 1;
    expect(morphEligibility(p, clip.id, morph.id)!.notSource.get(4)).toBe('still arriving');
  });

  it('says why: still coming in, gone, consumed earlier, on screen earlier', () => {
    const { p, f, clip, morph } = derivation();
    // "1" leaves at 1–1.5 s; "x" (row 2) is still being written at 2 s; "2" was written at 0.5 s.
    clip.actions.push(createDisappear(1, 'fade_out', [3], { duration: 0.5 }));
    clip.actions.push(createAppear(1.5, 'fade_in', [5], { duration: 1 }));
    clip.actions.push(createAppear(0.5, 'write', [6], { duration: 1 }));
    // "A" goes into another clip at 1.5 s (transform: consumed).
    const other = createClip(f.id, p.tracks[1]!.id, 0, 10);
    p.clips.push(other);
    p.relations.push(
      createRelation(clip.id, other.id, { offset: 1.5, duration: 0.4, pairs: [pair([0], [9])] }),
    );
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.notSource.get(3)).toBe('off screen by then');
    expect(e.notTarget.get(3)).toBe(takenOutEarlier('the FadeOut block'));
    expect(e.notSource.get(5)).toBe('not on screen yet');
    expect(e.notTarget.get(5)).toBe('still arriving');
    expect(e.notTarget.get(6)).toBe('on screen already (brought by the Write block)');
    expect(e.notSource.get(0)).toBe('consumed earlier');
    expect(e.notTarget.get(0)).toBe('consumed earlier');
    expect(e.sources).toEqual([1, 2, 4, 6, 7, 8, 9]);
    expect(e.targets).toEqual([1, 2, 4, 7, 8, 9]);
  });

  it('lists only the glyphs of the formula, and nothing for a block that is gone', () => {
    const { p, clip, morph } = derivation();
    morph.pairs = [pair([1], [42])]; // a stale index: not a glyph of the snapshot
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.sources).toEqual(ALL);
    expect(e.targets).toEqual(ALL);
    expect(morphEligibility(p, clip.id, 'nope')).toBeNull();
    p.formulas[0]!.snapshot = null;
    expect(morphEligibility(p, clip.id, morph.id)).toMatchObject({ sources: [], targets: [] });
  });

  it('leaves out what something else animates during the block (C1: the outro)', () => {
    const { p, clip, morph } = derivation();
    // The clip's outro runs over [9, 10]: a block at 9.2 s overlaps it on every glyph.
    morph.start = 9.2;
    morph.duration = 0.5;
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.sources).toEqual([]);
    expect(e.targets).toEqual([]);
    expect(e.notSource.get(1)).toBe('busy during the block (the outro)');
    expect(e.notTarget.get(4)).toBe('busy during the block (the outro)');
    expect(suggestMorphPairs(p, clip.id, morph.id, [])).toEqual([]);
    expect(whyNoSuggestion(p, clip.id, morph.id, [])).toBe(
      'Nothing to suggest: every glyph is busy during the block (the outro). Move the block first.',
    );
  });

  it('says that a glyph an Appear block brought before the block is on screen already', () => {
    const { p, clip, morph } = derivation();
    clip.actions.push(createAppear(1.2, 'write', [6], { duration: 0.5 })); // [1.2, 1.7)
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.sources).toContain(6);
    expect(e.notTarget.get(6)).toBe('on screen already (brought by the Write block)');
  });

  it('leaves out a glyph a part transform moves during the block (C1), on both sides', () => {
    const { p, clip, morph } = derivation();
    clip.actions.push(createPartTransform(2.5, [1], { shift: [1, 0] }));
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.notSource.get(1)).toBe('busy during the block (the Transform block)');
    expect(e.notTarget.get(1)).toBe('busy during the block (the Transform block)');
    expect(e.sources).not.toContain(1);
    // Row 2's "=" has no source before it now; row 3's takes row 2's.
    const offered = suggestMorphPairs(p, clip.id, morph.id, []);
    expect(offered).toEqual([pair([2], [5]), pair([4], [7])]);
    expect(morphProblems(p, clip.id, morph.id, offered)).toEqual([]);
  });

  it('lets a target overlap the intro, which it leaves once linked', () => {
    const { p, clip, morph } = derivation();
    morph.start = 0.5; // the Write intro runs over [0, 1]
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.targets).toEqual(ALL);
    expect(e.sources).toEqual([]); // nothing is fully on screen yet
  });

  it('notes a target an Appear block brings later: linked, that block leaves it out', () => {
    const { p, clip, morph } = derivation();
    clip.actions.push(createAppear(3, 'write', [6]));
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.targets).toContain(6);
    expect(e.targetNotes.get(6)).toBe(appearTarget('the Write block'));
    expect(appearTarget('the Write block')).toBe(
      'brought by the Write block: linked, that block leaves it out',
    );
    // Linked (the subscript 1 turns into the 2), the Problems list says so.
    const problems = morphProblems(p, clip.id, morph.id, [pair([3], [6])]);
    expect(problems.map((i) => [i.severity, i.code, i.path])).toEqual([
      ['warning', 'action-skips-glyphs', ['clips', 0, 'actions', 1]],
      ['warning', 'action-empty', ['clips', 0, 'actions', 1]],
    ]);
  });

  it('keeps out a glyph a Disappear block took out earlier, saying what linking would do', () => {
    const { p, clip, morph } = derivation();
    clip.actions.push(createDisappear(1, 'fade_out', [9], { duration: 0.5 }));
    const e = morphEligibility(p, clip.id, morph.id)!;
    expect(e.notTarget.get(9)).toBe(
      'taken out earlier by the FadeOut block: linked, it would not be on screen before this block, and that block would leave it out',
    );
    // Linked anyway, it validates, and the Problems list shows what happened to that block.
    const problems = morphProblems(p, clip.id, morph.id, [pair([2], [9])]);
    expect(problems.every((i) => i.severity === 'warning')).toBe(true);
    expect(problems.map((i) => i.path)).toContainEqual(['clips', 0, 'actions', 1]);
  });

  it('a target the intro brought, once linked, skips the intro and validates', () => {
    const { p, clip, morph } = derivation();
    const pairs = [pair([1], [4]), pair([2], [5])];
    expect(morphProblems(p, clip.id, morph.id, pairs)).toEqual([]);
    const life = clipLifetimes(withMorphPairs(p, clip.id, morph.id, pairs)).get(clip.id)!;
    expect(life.intro).toEqual([0, 1, 2, 3, 6, 7, 8, 9]);
    expect(life.stints.get(4)![0]!.enter).toMatchObject({ start: 2, cause: { kind: 'transfer' } });
  });
});

describe('lineOrder', () => {
  it('reads an aligned derivation row by row, subscripts with their row', () => {
    expect(lineOrder(threeRows())).toEqual(ALL);
  });

  it('keeps rows apart when their columns do not line up', () => {
    // a = b + c  /  = c + b, with the second row's glyphs at other x positions.
    const at = (label: string, x: number, y: number) => ({
      label,
      center: [x, y] as [number, number],
      size: [0.3, 0.4] as [number, number],
    });
    const snapshot: FormulaSnapshot = {
      backend: 'mathjax',
      key: 'k',
      glyphs: [
        at('a', 0, 0),
        at('=', 0.5, 0),
        at('b', 1, 0),
        at('+', 1.5, 0),
        at('c', 2, 0),
        at('=', 0.5, -1),
        at('c', 1, -1),
        at('+', 1.5, -1),
        at('b', 2, -1),
      ],
    };
    expect(lineOrder(snapshot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('suggestMorphPairs', () => {
  it('proposes = → = and x → x from row 1 to row 2 on the first step', () => {
    const { p, clip, morph } = derivation();
    expect(suggestMorphPairs(p, clip.id, morph.id, [])).toEqual([pair([1], [4]), pair([2], [5])]);
  });

  it('proposes the same with rows 2–3 hidden', () => {
    const { p, clip, morph } = derivation(ROWS23);
    expect(suggestMorphPairs(p, clip.id, morph.id, [])).toEqual([pair([1], [4]), pair([2], [5])]);
  });

  it('on the second step takes row 2 → row 3, never into what the first step brings', () => {
    for (const hidden of [[], ROWS23]) {
      const { p, clip, second } = secondStep(hidden);
      const e = morphEligibility(p, clip.id, second.id)!;
      expect(e.notTarget.get(4)).toBe('brought in by another Morph block');
      expect(e.notTarget.get(6)).toBe('on screen already (brought by the Write block)'); // at 3 s
      // Row 3 is on screen from the intro unless hidden: a source then, but none comes before.
      expect(e.sources).toEqual(hidden.length > 0 ? [0, 1, 2, 3, 4, 5, 6] : ALL);
      expect(suggestMorphPairs(p, clip.id, second.id, [])).toEqual([
        pair([4], [7]),
        pair([5], [8]),
      ]);
    }
  });

  it('skips the glyphs the draft holds already, on either side', () => {
    const { p, clip, morph } = derivation();
    expect(suggestMorphPairs(p, clip.id, morph.id, [pair([1], [4])])).toEqual([pair([2], [5])]);
    // A glyph the draft uses as a source is no target to offer (4 here) nor a source: row 3's
    // "=" then takes the nearest free one, row 1's.
    expect(suggestMorphPairs(p, clip.id, morph.id, [pair([4], [9])])).toEqual([
      pair([2], [5]),
      pair([1], [7]),
    ]);
    const both = [pair([1], [4]), pair([2], [5])];
    expect(suggestMorphPairs(p, clip.id, morph.id, both)).toEqual([]);
    expect(whyNoSuggestion(p, clip.id, morph.id, both)).toMatch(/linked already/);
  });

  it('follows the lines, not the columns, and says why it has nothing', () => {
    const { p, clip, morph } = derivation();
    // No two glyphs share a label: nothing to propose.
    p.formulas[0]!.snapshot!.glyphs.forEach((g, i) => (g.label = `g${i}`));
    expect(suggestMorphPairs(p, clip.id, morph.id, [])).toEqual([]);
    expect(whyNoSuggestion(p, clip.id, morph.id, [])).toBe(
      'Nothing to suggest: no glyph that can arrive has a glyph with the same label before it that is on screen when the block starts.',
    );
    // During the intro nothing is fully on screen yet.
    morph.start = 0.5;
    expect(whyNoSuggestion(p, clip.id, morph.id, [])).toBe(
      'Nothing to suggest: no glyph is fully on screen when the block starts.',
    );
  });
});

describe('linkMorphPair', () => {
  const holder = (pairs: GlyphPair[] = []) => ({ pairs, style: 'copy' as const });
  const label = (g: number) => LABELS[g]!;

  it('links like the relation editor and keeps the pairs ascending', () => {
    const r = linkMorphPair(holder(), [2, 1], [5, 4], label);
    expect(r).toEqual({ ok: true, relation: holder([pair([1, 2], [4, 5])]) });
    // Copies may share a source; a link onto a target that has a pair joins that pair.
    const once = holder([pair([1], [4])]);
    expect(linkMorphPair(once, [1], [7]).ok).toBe(true);
    expect(linkMorphPair(once, [2], [4], label)).toEqual({
      ok: true,
      joined: 0,
      message: 'Glyph x (2) joined pair 1: = (1), x (2) → = (4).',
      relation: holder([pair([1, 2], [4])]),
    });
  });

  it('never puts a glyph on both sides of the block', () => {
    expect(linkMorphPair(holder(), [1], [1], label)).toEqual({
      ok: false,
      message:
        'Glyph = (1) cannot turn into itself: a glyph is never on both sides of one Morph block.',
    });
    const once = holder([pair([1], [4])]);
    expect(linkMorphPair(once, [4], [7], label)).toEqual({
      ok: false,
      message: 'Glyph = (4) is a target of pair 1: it cannot also be a source of this block.',
    });
    expect(linkMorphPair(once, [2], [1], label)).toEqual({
      ok: false,
      message: 'Glyph = (1) is a source of pair 1: it cannot also be a target of this block.',
    });
  });
});

describe('morphProblems', () => {
  it('reports what the pairs break elsewhere: a relation whose source now arrives (R2 a)', () => {
    const { p, f, clip, morph } = derivation();
    const other = createClip(f.id, p.tracks[1]!.id, 0, 10);
    p.clips.push(other);
    // The relation copies "=" of row 2 over [2.5, 3.5): fine while the intro brings it.
    p.relations.push(
      createRelation(clip.id, other.id, { offset: 2.5, style: 'copy', pairs: [pair([4], [0])] }),
    );
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    // The block bringing it over [2, 3) would leave it still arriving: an error, on the relation.
    const problems = morphProblems(p, clip.id, morph.id, [pair([1], [4])]);
    expect(problems.map((i) => [i.code, i.path])).toContainEqual([
      'source-arriving',
      ['relations', 0, 'pairs', 0, 'from'],
    ]);
    // Eligibility does not offer it: the relation keeps it busy during the block.
    expect(morphEligibility(p, clip.id, morph.id)!.notTarget.get(4)).toBe(
      'busy during the block (a relation window)',
    );
  });

  it('reports an Appear block that would bring back a glyph the pairs consume (R2 b)', () => {
    const { p, clip, morph } = derivation();
    clip.actions.push(createDisappear(4, 'fade_out', [1], { duration: 0.5 }));
    clip.actions.push(createAppear(6, 'fade_in', [1], { duration: 0.5 }));
    const problems = morphProblems(p, clip.id, morph.id, [pair([1], [4], 'transform')]);
    expect(problems.map((i) => [i.severity, i.code, i.path])).toContainEqual([
      'error',
      'appear-consumed',
      ['clips', 0, 'actions', 2],
    ]);
  });

  it('holds every error the pairs add to the project, wherever it is reported', () => {
    const key = (i: Issue) => `${i.code}|${i.path.join('.')}|${i.message}`;
    const cases: { setup: () => ReturnType<typeof derivation>; drafts: GlyphPair[][] }[] = [
      {
        setup: () => {
          const d = derivation();
          d.clip.actions.push(createMorph(5, { pairs: [pair([4], [7])] }));
          d.clip.actions.push(createPartTransform(2.5, [2], { shift: [1, 0] }));
          d.clip.actions.push(createDisappear(4, 'fade_out', [1], { duration: 0.5 }));
          d.clip.actions.push(createAppear(6, 'fade_in', [1], { duration: 0.5 }));
          const other = createClip(d.f.id, d.p.tracks[1]!.id, 0, 10);
          d.p.clips.push(other);
          d.p.relations.push(
            createRelation(d.clip.id, other.id, { offset: 2.5, pairs: [pair([5], [0])] }),
          );
          return d;
        },
        drafts: [
          [pair([1], [7])],
          [pair([2], [8])],
          [pair([1], [4], 'transform')],
          [pair([3], [5])],
          [pair([1], [4]), pair([4], [8])],
          [pair([0, 3], [6, 9], 'fade')],
        ],
      },
      { setup: () => derivation(ROWS23), drafts: [[pair([5], [8])], [pair([1], [1])]] },
    ];
    for (const { setup, drafts } of cases) {
      for (const pairs of drafts) {
        const { p, clip, morph } = setup();
        const before = new Set(validateProject(withMorphPairs(p, clip.id, morph.id, [])).map(key));
        const added = validateProject(withMorphPairs(p, clip.id, morph.id, pairs)).filter(
          (i) => i.severity === 'error' && !before.has(key(i)),
        );
        const shown = new Set(morphProblems(p, clip.id, morph.id, pairs).map(key));
        for (const issue of added) expect(shown.has(key(issue)), key(issue)).toBe(true);
      }
    }
  });

  it('has nothing to say of a good step', () => {
    const { p, clip, morph } = derivation();
    expect(morphProblems(p, clip.id, morph.id, [pair([1], [4]), pair([2], [5])])).toEqual([]);
  });

  it('reports the block’s own issues and outlines the pairs they are about', () => {
    const { p, clip, morph } = derivation(ROWS23);
    const path = findMorph(p, clip.id, morph.id)!.path;
    // A source not on screen yet: a warning on pair 1.
    const hidden = morphProblems(p, clip.id, morph.id, [pair([1], [4]), pair([5], [8])]);
    expect(hidden.map((i) => [i.severity, i.code])).toEqual([['warning', 'source-hidden']]);
    // Its outline wears the warning colour, not the red of an error (D177).
    expect(morphPairSeverities(hidden, path, [pair([1], [4]), pair([5], [8])])).toEqual(
      new Map([[1, 'warning']]),
    );
    // A glyph on both sides (as a loaded file may have it): every pair that holds it.
    const both = [pair([1], [4]), pair([4], [7]), pair([2], [5])];
    const issues = morphProblems(p, clip.id, morph.id, both);
    expect(issues.map((i) => i.code)).toContain('morph-both-sides');
    expect(morphPairSeverities(issues, path, both)).toEqual(
      new Map([
        [0, 'error'],
        [1, 'error'],
      ]),
    );
  });

  it('includes the overlaps of the clip and the conflicts the pairs cause elsewhere', () => {
    const { p, clip, morph } = derivation();
    // A part transform of "=" (row 1) while the block copies it: reported on the later block.
    clip.actions.push(createPartTransform(2.5, [1], { shift: [1, 0] }));
    const overlap = morphProblems(p, clip.id, morph.id, [pair([1], [4])]);
    expect(overlap.map((i) => [i.code, i.path])).toEqual([
      ['action-overlap', ['clips', 0, 'actions', 1]],
    ]);
    clip.actions.pop();
    // A later Morph block brings "=" of row 3 already: the conflict is reported on it.
    const later = createMorph(5, { pairs: [pair([4], [7])] });
    clip.actions.push(later);
    const conflict = morphProblems(p, clip.id, morph.id, [pair([1], [7])]);
    expect(conflict.map((i) => [i.code, i.path])).toEqual([
      ['target-conflict', ['clips', 0, 'actions', 1, 'pairs', 0, 'to']],
    ]);
    // …which is not this block's doing when it does not touch that glyph.
    expect(morphProblems(p, clip.id, morph.id, [pair([1], [4])])).toEqual([]);
  });
});

describe('opening and keeping the editor', () => {
  it('starts from a copy of the block’s pairs, or says why it cannot open', () => {
    const { p, clip, morph } = derivation();
    morph.pairs = [pair([1], [4])];
    const opened = openMorphDraft(p, clip.id, morph.id);
    expect(opened).toEqual({ ok: true, pairs: [pair([1], [4])] });
    if (opened.ok) expect(opened.pairs).not.toBe(morph.pairs);
    expect(openMorphDraft(p, clip.id, 'gone')).toEqual({
      ok: false,
      message: 'This Morph block no longer exists.',
    });
    p.tracks[0]!.locked = true;
    expect(morphLock(p, clip.id)).toMatch(/^Track “.+” is locked: unlock it on the timeline/);
    expect(openMorphDraft(p, clip.id, morph.id)).toMatchObject({ ok: false });
    p.formulas.splice(0, 1);
    expect(morphAlive(p, clip.id, morph.id)).toBe(false);
    expect(openMorphDraft(p, clip.id, morph.id)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/formula of this clip no longer exists/),
    });
  });

  it('puts a draft of pairs into a copy of the project, leaving the project alone', () => {
    const { p, clip, morph } = derivation();
    const next = withMorphPairs(p, clip.id, morph.id, [pair([1], [4])]);
    expect((next.clips[0]!.actions[0] as MorphAction).pairs).toEqual([pair([1], [4])]);
    expect(morph.pairs).toEqual([]);
    expect(morphSummary(2, morphEligibility(p, clip.id, morph.id))).toBe(
      '2 pairs · 10 glyphs on screen to start from · 10 can arrive',
    );
  });
});

describe('rebaseMorphPairs', () => {
  it('takes both sides through the one transition and drops a pair that loses a side', () => {
    // A re-render that swaps glyphs 1 and 4 and loses glyph 5.
    const map = [0, 4, 2, 3, 1, null, 6, 7, 8, 9];
    expect(rebaseMorphPairs([pair([1], [4]), pair([2], [5]), pair([1, 5], [7, 8])], map)).toEqual({
      pairs: [pair([4], [1]), pair([4], [7, 8])],
      droppedPairs: 1,
      droppedGlyphs: 1,
    });
  });

  it('drops a glyph that lands on both sides of a pair, as the project remap does', () => {
    // A re-render that merges glyphs 1 and 4 into glyph 1 (no matcher does today; the rule is the
    // project's, `remapGlyphRefs`, and the draft must stay what the project has).
    const map = [0, 1, 2, 3, 1, 5, 6, 7, 8, 9];
    const pairs = [pair([1], [4]), pair([1, 2], [4, 5]), pair([7], [8])];
    const rebased = rebaseMorphPairs(pairs, map);
    expect(rebased).toEqual({
      pairs: [pair([2], [5]), pair([7], [8])],
      droppedPairs: 1,
      droppedGlyphs: 4,
    });
    const project = createEmptyProject();
    const formula = createFormula({ name: 'f', snapshot: threeRows() });
    project.formulas.push(formula);
    const morph = createMorph(2, { pairs: structuredClone(pairs) });
    project.clips.push(
      createClip(formula.id, project.tracks[0]!.id, 0, 10, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
        actions: [morph],
      }),
    );
    remapGlyphRefs(project, formula.id, map);
    expect((project.clips[0]!.actions[0] as MorphAction).pairs).toEqual(rebased.pairs);
  });
});
