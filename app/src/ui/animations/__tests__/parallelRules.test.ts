// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clipLifetimes,
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createMorph,
  createPartTransform,
  createRelation,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type ClipAction,
  type Project,
} from '../../../model';
import { blockConflicts } from '../blockRange';
import { oneClipScene } from './fixtures';

/* The rules for blocks that run at the same time (ARCHITECTURE §5, "Blocks that run at the same
 * time"), generated over every pair of block kinds. On different glyphs two blocks run together
 * without an error. On a glyph both animate, validation reports `action-overlap` on the later
 * block and the planner (`blockConflicts`) refuses it; a glyph the later block names but leaves
 * out (brought or taken by the first block already) is a warning only, and the planner lets it
 * be. An Emphasis that only measures its glyphs (a Circumscribe) animates nothing: it runs with
 * anything, unless it starts while its glyphs are half drawn (`emphasis-target-busy`); an
 * Indicate animates them like a part Transform. Validation, the lifetime and the planner must
 * agree on every pair. Six glyphs: 0–2 on screen from the clip start, 3–5 hidden. */

const KINDS = [
  'appear',
  'disappear',
  'transform',
  'tween',
  'morph',
  'indicate',
  'circumscribe',
] as const;
type Kind = (typeof KINDS)[number];

const DURATION = 1;

/** The first block of the pair, at `start`: of `kind`, on one of two glyphs it can animate
 * (`slot`): an Appear brings hidden glyph 3 or 4, the others take on-screen glyph 0 or 1 (a Morph
 * copies it onto hidden glyph 3 or 4); a tween animates every glyph. */
function first(kind: Kind, slot: 0 | 1, start: number): ClipAction {
  const g = kind === 'appear' ? 3 + slot : slot;
  if (kind === 'morph') {
    return createMorph(start, {
      duration: DURATION,
      pairs: [{ from: [g], to: [3 + slot], style: null }],
    });
  }
  return second(kind, g, start);
}

/** The second block, at `start`, naming glyph `g`: an Appear of it, a Disappear of it, a part
 * Transform of it, a Morph copying it onto hidden glyph 5; a tween animates every glyph. */
function second(kind: Kind, g: number, start: number): ClipAction {
  switch (kind) {
    case 'appear':
      return createAppear(start, 'write', [g], { duration: DURATION });
    case 'disappear':
      return createDisappear(start, 'fade_out', [g], { duration: DURATION });
    case 'transform':
      return createPartTransform(start, [g], { duration: DURATION, shift: [1, 0] });
    case 'tween':
      return createTween(start, DURATION, { rotation: 10 });
    case 'morph':
      return createMorph(start, {
        duration: DURATION,
        pairs: [{ from: [g], to: [5], style: null }],
      });
    case 'indicate':
      return createEmphasis(start, 'indicate', [g], { duration: DURATION });
    case 'circumscribe':
      return createEmphasis(start, 'circumscribe', [g], { duration: DURATION });
  }
}

/** The first block draws, removes or morphs its glyph while it runs: a measuring block that
 * starts then would measure it half drawn. */
const halfDrawn = (kind: Kind) => kind === 'appear' || kind === 'disappear' || kind === 'morph';

/** The glyph the first block of `kind` animates, with `slot` 0: what a second block shares. */
const sharedGlyph = (kind: Kind) => (kind === 'appear' ? 3 : 0);

function scene(actions: ClipAction[]) {
  return oneClipScene({ glyphs: 6, start: 0, end: 10, hiddenGlyphs: [3, 4, 5], actions });
}
const errorCodes = (p: Project) =>
  validateProject(p)
    .filter((i) => i.severity === 'error')
    .map((i) => i.code);
const warningCodes = (p: Project) =>
  validateProject(p)
    .filter((i) => i.severity === 'warning')
    .map((i) => i.code);

describe('blocks that run at the same time: every pair of kinds', () => {
  const pairs = KINDS.flatMap((a) => KINDS.map((b) => [a, b] as const));

  it.each(pairs.filter(([a, b]) => a !== 'tween' && b !== 'tween'))(
    '%s then %s on different glyphs: no error, no conflict',
    (kindA, kindB) => {
      const a = first(kindA, 0, 2); // [2, 3)
      const g = kindB === 'appear' ? 4 : 1;
      const b = second(kindB, g, 2.5); // [2.5, 3.5)
      const { project, clip } = scene([a, b]);
      expect(errorCodes(project)).toEqual([]);
      expect(blockConflicts(project, clip, a.id)).toBeNull();
      expect(blockConflicts(project, clip, b.id)).toBeNull();
    },
  );

  it.each(pairs)(
    '%s then %s on one glyph: an error if both animate it, else a warning',
    (kindA, kindB) => {
      const g = sharedGlyph(kindA);
      const a = first(kindA, 0, 2);
      const b = second(kindB, g, 2.5);
      const { project, clip } = scene([a, b]);
      const life = clipLifetimes(project).get(clip.id)!;
      const animates = life.actions.get(b.id)!.glyphs.includes(g);
      const conflict = blockConflicts(project, clip, b.id);
      if (kindA === 'circumscribe' || kindB === 'circumscribe') {
        // A measuring block is busy on nothing and conflicts with nothing that moves its glyphs;
        // one that starts while the first block still draws, removes or morphs them is refused.
        if (!animates) {
          expect(errorCodes(project)).toEqual([]);
          expect(warningCodes(project)).toContain('action-skips-glyphs');
          expect(conflict).toBeNull();
        } else if (kindB === 'circumscribe' && halfDrawn(kindA)) {
          expect(errorCodes(project)).toEqual(['emphasis-target-busy']);
          expect(conflict).toMatch(/half drawn\.$/);
        } else {
          expect(errorCodes(project)).toEqual([]);
          expect(conflict).toBeNull();
        }
      } else if (kindA === 'morph' && kindB === 'morph') {
        // Two copies of one source may run together (the ownership rules, not the action rule).
        expect(animates).toBe(true);
        expect(errorCodes(project)).toEqual([]);
        expect(conflict).toBeNull();
      } else if (kindA === 'indicate' && kindB === 'appear') {
        // The Appear makes the glyph wait for it: the Indicate before it finds it off screen and
        // leaves it out, so the two never meet.
        expect(animates).toBe(true);
        expect(errorCodes(project)).toEqual([]);
        expect(warningCodes(project)).toContain('action-skips-glyphs');
        expect(conflict).toBeNull();
      } else if (animates) {
        expect(errorCodes(project)).toContain('action-overlap');
        // A Morph's own checks come first in the planner: its source is still being brought in.
        expect(conflict).toMatch(
          kindB === 'morph' ? /not fully on screen|at the same time\.$/ : /at the same time\.$/,
        );
      } else {
        // Brought or taken by the first block already: the second leaves it out.
        expect(['appear', 'disappear', 'indicate']).toContain(kindB);
        expect(errorCodes(project)).toEqual([]);
        expect(warningCodes(project)).toContain('action-skips-glyphs');
        expect(conflict).toBeNull();
      }
    },
  );

  it('a tween runs with nothing that animates glyphs: it animates every glyph', () => {
    const tween = createTween(2, DURATION, { rotation: 10 });
    for (const kind of KINDS) {
      const other = first(kind, 0, 2.5);
      const { project, clip } = scene([tween, other]);
      if (kind === 'circumscribe') {
        // It only measures its glyphs, which a tween moves whole.
        expect(errorCodes(project)).toEqual([]);
        expect(blockConflicts(project, clip, other.id)).toBeNull();
        continue;
      }
      expect(errorCodes(project)).toContain('action-overlap');
      expect(blockConflicts(project, clip, other.id)).not.toBeNull();
    }
    const alone = scene([tween]);
    expect(errorCodes(alone.project)).toEqual([]);
  });
});

describe('blocks that run at the same time: the intro, the outro and relation windows', () => {
  it('count on the glyphs they animate', () => {
    const { project, clip } = oneClipScene({
      glyphs: 3,
      start: 0,
      end: 10,
      intro: defaultIntro('write'), // [0, 1): brings 0–2
      fields: { outro: defaultOutro('fade_out') }, // [9, 10): takes them
      actions: [
        createPartTransform(0.5, [0], { duration: 0.5, shift: [1, 0] }),
        createPartTransform(9.2, [1], { duration: 0.5, shift: [1, 0] }),
      ],
    });
    const issues = validateProject(project).filter((i) => i.code === 'action-overlap');
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/^The Transform block and the intro/),
      expect.stringMatching(/^The Transform block and the outro/),
    ]);
    for (const action of clip.actions) {
      expect(blockConflicts(project, clip, action.id)).not.toBeNull();
    }
  });

  it('a relation window keeps a block off the glyphs of its pairs, and off those only', () => {
    const { project, clip, formula } = oneClipScene({ glyphs: 3, start: 0, end: 10 });
    const other = createClip(formula.id, project.tracks[1]!.id, 4, 12, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    project.clips.push(other);
    // a → other over [4, 5): glyph 0 of `clip` turns into glyph 0 of `other`.
    project.relations.push(
      createRelation(clip.id, other.id, {
        offset: 0,
        duration: 1,
        pairs: [{ from: [0], to: [0], style: null }],
      }),
    );
    const fine = createPartTransform(4.2, [1], { duration: 0.5, shift: [1, 0] });
    clip.actions.push(fine);
    expect(errorCodes(project)).toEqual([]);
    expect(blockConflicts(project, clip, fine.id)).toBeNull();
    const clash = createPartTransform(4.2, [0], { duration: 0.5, shift: [1, 0] });
    clip.actions.push(clash);
    expect(errorCodes(project)).toContain('action-overlap');
    expect(blockConflicts(project, clip, clash.id)).toMatch(/^A relation window animates glyph 0/);
  });
});
