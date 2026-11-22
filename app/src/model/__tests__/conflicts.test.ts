// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  actionConflicts,
  blockBounds,
  clipLifetimeOf,
  latestCopyStart,
  rivalSpans,
  timingErrorKeys,
} from '../conflicts';
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
} from '../defaults';
import { causesConflict, type Cause } from '../lifetime';
import type { Clip, ClipAction, Formula, Project } from '../types';

/** One formula of `glyphs` glyphs (labelled by index) on a clip [0, 10] without intro or outro. */
function scene(
  glyphs: number,
  actions: ClipAction[],
  fields: Partial<Clip> = {},
  hiddenGlyphs: number[] = [],
): { project: Project; clip: Clip; formula: Formula } {
  const project = createEmptyProject();
  const formula = createFormula({
    name: 'f',
    hiddenGlyphs,
    snapshot: {
      backend: 'mathjax',
      key: 'k',
      glyphs: Array.from({ length: glyphs }, (_, i) => ({
        label: String(i),
        center: [i, 0] as [number, number],
        size: [1, 1] as [number, number],
      })),
    },
  });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 10, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
    actions,
    ...fields,
  });
  project.clips.push(clip);
  return { project, clip, formula };
}

const moved = (clip: Clip, id: string, start: number): Clip => ({
  ...clip,
  actions: clip.actions.map((a) => (a.id === id ? { ...a, start } : a)),
});

describe('blockBounds', () => {
  it('keeps a tween between the intro and the outro, other blocks inside the clip', () => {
    const { clip } = scene(3, [], {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    expect(blockBounds(clip, createTween(2, 1, {}))).toEqual({ start: 1, end: 9 });
    expect(blockBounds(clip, createAppear(2, 'write', [0]))).toEqual({ start: 0, end: 10 });
  });
});

describe('causesConflict', () => {
  const { clip } = scene(3, [createTween(2, 1, {}), createAppear(5, 'write', [0])]);
  const [tween, appear] = clip.actions;
  const action = (id: string): Cause => ({ kind: 'action', actionId: id });
  const relation: Cause = { kind: 'transfer', key: 'relation:r1', pair: 0 };
  const morph: Cause = { kind: 'transfer', key: 'morph:a1', pair: 0 };

  it('holds an action against anything but, for a tween, the intro and the outro', () => {
    expect(causesConflict(clip, action(appear!.id), action(tween!.id))).toBe(true);
    expect(causesConflict(clip, action(appear!.id), { kind: 'intro' })).toBe(true);
    expect(causesConflict(clip, action(appear!.id), relation)).toBe(true);
    expect(causesConflict(clip, action(tween!.id), { kind: 'intro' })).toBe(false);
    expect(causesConflict(clip, { kind: 'outro' }, action(tween!.id))).toBe(false);
    expect(causesConflict(clip, action(tween!.id), relation)).toBe(true);
  });

  it("holds a morph block's pair like an action, except against another transfer", () => {
    expect(causesConflict(clip, morph, { kind: 'intro' })).toBe(true);
    expect(causesConflict(clip, morph, action(appear!.id))).toBe(true);
    expect(causesConflict(clip, morph, relation)).toBe(false);
    expect(causesConflict(clip, relation, { kind: 'outro' })).toBe(false);
    expect(causesConflict(clip, { kind: 'intro' }, { kind: 'outro' })).toBe(false);
  });
});

describe('actionConflicts', () => {
  it('names the animation a block runs alongside, with the glyphs they share', () => {
    const fade = createDisappear(1, 'fade_out', [1, 2], { duration: 1 });
    const write = createAppear(1.5, 'write', [1, 2, 3], { duration: 1 });
    const { project, clip } = scene(5, [fade, write], {}, [3]);
    expect(actionConflicts(project, clip, write.id)).toEqual({
      kind: 'overlap',
      cause: { kind: 'action', actionId: fade.id },
      glyphs: [1, 2],
    });
    // Seen from the other block, the same clash.
    expect(actionConflicts(project, clip, fade.id)).toEqual({
      kind: 'overlap',
      cause: { kind: 'action', actionId: write.id },
      glyphs: [1, 2],
    });
    const apart = moved(clip, write.id, 2.5);
    expect(actionConflicts(project, apart, write.id)).toBeNull();
    expect(actionConflicts(project, apart, fade.id)).toBeNull();
  });

  it('refuses a block outside its bounds, and a tween inside the intro', () => {
    const late = createDisappear(9.5, 'fade_out', [0], { duration: 1 });
    const tween = createTween(0.2, 1, { rotation: 5 });
    const { project, clip } = scene(3, [late, tween], { intro: defaultIntro('write') });
    expect(actionConflicts(project, clip, late.id)).toEqual({ kind: 'bounds' });
    expect(actionConflicts(project, clip, tween.id)).toEqual({ kind: 'bounds' });
    expect(actionConflicts(project, moved(clip, tween.id, 2), tween.id)).toBeNull();
    const early = createDisappear(0.5, 'fade_out', [0, 1], { duration: 1 });
    const intro = scene(3, [early], { intro: defaultIntro('write') });
    expect(actionConflicts(intro.project, intro.clip, early.id)).toEqual({
      kind: 'overlap',
      cause: { kind: 'intro' },
      glyphs: [0, 1],
    });
  });

  it('refuses an Appear of a consumed glyph, and a block over a relation window', () => {
    const fade = createAppear(8, 'fade_in', [3], { duration: 1 });
    const { project, clip } = scene(5, [fade]);
    const other = createClip(clip.formulaId, project.tracks[1]!.id, 0, 10);
    project.clips.push(other);
    const out = createRelation(clip.id, other.id, { offset: 6, duration: 1 });
    out.pairs.push({ from: [3], to: [3], style: 'transform' });
    project.relations.push(out);
    expect(actionConflicts(project, clip, fade.id)).toEqual({ kind: 'consumed', glyphs: [3] });
    const busy = createPartTransform(6.5, [3], { duration: 1 });
    const during = { ...clip, actions: [busy] };
    expect(actionConflicts(project, during, busy.id)).toEqual({
      kind: 'overlap',
      cause: { kind: 'transfer', key: `relation:${out.id}`, pair: 0 },
      glyphs: [3],
    });
  });

  it('tells what a Morph block needs: sources on screen, targets not yet', () => {
    // Glyph 2 is hidden and written at [2, 3]; the morph copies it onto hidden glyph 4.
    const write = createAppear(2, 'write', [2], { duration: 1 });
    const morph = createMorph(5, { pairs: [{ from: [2], to: [4], style: null }] });
    const { project, clip } = scene(5, [write, morph], {}, [2, 4]);
    expect(actionConflicts(project, clip, morph.id)).toBeNull();
    expect(actionConflicts(project, moved(clip, morph.id, 1), morph.id)).toEqual({
      kind: 'absent-source',
      glyphs: [2],
    });
    // Both morphs bring glyph 3: when the second starts, the first has brought it already.
    const first = createMorph(2, { pairs: [{ from: [0], to: [3], style: null }] });
    const second = createMorph(5, { pairs: [{ from: [1], to: [3], style: null }] });
    const taken = scene(5, [first, second]);
    expect(actionConflicts(taken.project, taken.clip, second.id)).toEqual({
      kind: 'target-on-screen',
      glyphs: [3],
    });
    expect(actionConflicts(taken.project, taken.clip, first.id)).toBeNull();
  });

  it('reports the validation error a position would add, and no other', () => {
    // The morph copies glyph 0 at [4, 5]; a relation consumes it at [6, 7].
    const morph = createMorph(4, { pairs: [{ from: [0], to: [3], style: 'copy' }] });
    const { project, clip } = scene(5, [morph], {}, [3]);
    const other = createClip(clip.formulaId, project.tracks[1]!.id, 0, 10);
    project.clips.push(other);
    const out = createRelation(clip.id, other.id, { offset: 6, duration: 1 });
    out.pairs.push({ from: [0], to: [0], style: 'transform' });
    project.relations.push(out);
    expect(actionConflicts(project, clip, morph.id)).toBeNull();
    expect(latestCopyStart(project, clip, morph)).toBe(6);
    const after = actionConflicts(project, moved(clip, morph.id, 7.5), morph.id);
    expect(after?.kind).toBe('issue');
    expect(after?.kind === 'issue' && after.issue.code).toBe('source-used-after-consumed');
    // Already there (a loaded file): that error is in the baseline, so the block may move.
    const loaded = { ...project, clips: [moved(clip, morph.id, 7.5), other] };
    expect(actionConflicts(loaded, loaded.clips[0]!, morph.id)).toBeNull();
    expect([...timingErrorKeys(loaded, [clip.id])]).toEqual([
      expect.stringMatching(/^source-used-after-consumed\|/),
    ]);
    expect(timingErrorKeys(project, [clip.id]).size).toBe(0);
  });
});

describe('rivalSpans', () => {
  it('leaves out the intro and the outro for a tween, not for other blocks', () => {
    const tween = createTween(2, 1, { rotation: 5 });
    const shift = createPartTransform(2, [0], { duration: 1, shift: [1, 0] });
    const { project, clip } = scene(2, [tween, shift], {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    const life = clipLifetimeOf(project, clip);
    const kinds = (action: ClipAction) =>
      rivalSpans(project, clip, life, action).map((r) => `${r.glyph}:${r.span.cause.kind}`);
    expect(kinds(tween)).toEqual(['0:action']);
    expect(kinds(shift)).toEqual(['0:intro', '0:action', '0:outro']);
  });
});

describe('emphasis blocks in the planner', () => {
  const moved = (clip: Clip, actionId: string, start: number): Clip => ({
    ...clip,
    actions: clip.actions.map((a) => (a.id === actionId ? { ...a, start } : a)),
  });

  it('an Indicate rivals the animations of its glyphs like a part transform', () => {
    const { project, clip } = scene(
      3,
      [createEmphasis(2, 'indicate', [0]), createTween(5, 1, { rotation: 10 })],
      { intro: defaultIntro('write'), outro: defaultOutro('fade_out') },
    );
    const indicate = clip.actions[0]!;
    const life = clipLifetimeOf(project, clip);
    const kinds = rivalSpans(project, clip, life, indicate).map(
      (r) => `${r.glyph}:${r.span.cause.kind}`,
    );
    expect(kinds).toEqual(['0:intro', '0:action', '0:outro']);
    expect(actionConflicts(project, clip, indicate.id)).toBeNull();
    expect(actionConflicts(project, moved(clip, indicate.id, 5), indicate.id)).toMatchObject({
      kind: 'overlap',
      glyphs: [0],
    });
  });

  it('a Circumscribe rivals nothing and may overlap a tween, but not start while its glyphs are drawn', () => {
    const { project, clip } = scene(
      3,
      [createEmphasis(5, 'circumscribe', 'all'), createTween(5, 1, { rotation: 10 })],
      { intro: defaultIntro('write') },
    );
    const frame = clip.actions[0]!;
    expect(rivalSpans(project, clip, clipLifetimeOf(project, clip), frame)).toEqual([]);
    expect(actionConflicts(project, clip, frame.id)).toBeNull();
    expect(actionConflicts(project, moved(clip, frame.id, 0.5), frame.id)).toMatchObject({
      kind: 'half-drawn',
      cause: { kind: 'intro' },
      glyphs: [0, 1, 2],
    });
    expect(actionConflicts(project, moved(clip, frame.id, 1), frame.id)).toBeNull();
    expect(actionConflicts(project, moved(clip, frame.id, 0), frame.id)).toBeNull();
  });

  it('causesConflict never holds a measuring block against anything', () => {
    const { clip } = scene(2, [
      createEmphasis(2, 'flash', 'all'),
      createEmphasis(2, 'wiggle', 'all'),
      createTween(3, 1, {}),
    ]);
    const cause = (i: number): Cause => ({ kind: 'action', actionId: clip.actions[i]!.id });
    expect(causesConflict(clip, cause(0), { kind: 'intro' })).toBe(false);
    expect(causesConflict(clip, cause(2), cause(0))).toBe(false);
    expect(causesConflict(clip, cause(1), { kind: 'intro' })).toBe(true);
    expect(causesConflict(clip, cause(1), cause(2))).toBe(true);
  });
});
