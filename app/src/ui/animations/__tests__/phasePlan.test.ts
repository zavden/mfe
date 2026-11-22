// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createEmphasis,
  createEmptyProject,
  createFormula,
  createPartTransform,
  createRelation,
  createShapeFormula,
  createTrack,
  createTween,
  defaultCameraFrame,
  defaultIntro,
  defaultOutro,
  type Clip,
  type ClipAction,
  type Project,
} from '../../../model';
import { planPhase } from '../phasePlan';

/* What an intro or an outro given from a clip's menu would run into (phasePlan.ts, D120). */

const snapshot = (glyphs: number) => ({
  backend: 'mathjax' as const,
  key: 'k',
  glyphs: Array.from({ length: glyphs }, (_, i) => ({
    label: String(i),
    center: [i, 0] as [number, number],
    size: [1, 1] as [number, number],
  })),
});

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** A formula `f` of four glyphs on clip `ca` over [1, 9), with `actions` and no intro or outro. */
function scene(actions: ClipAction[] = [], fields: Partial<Clip> = {}): Project {
  const project = createEmptyProject();
  project.tracks = [createTrack('Track 2'), createTrack('Track 1')];
  project.formulas.push({ ...createFormula({ name: 'f', snapshot: snapshot(4) }), id: 'f' });
  project.clips.push({
    ...createClip('f', project.tracks[1]!.id, 1, 9, { ...none, actions, ...fields }),
    id: 'ca',
  });
  return project;
}

const clipOf = (project: Project, id = 'ca') => project.clips.find((c) => c.id === id)!;
const plan = (project: Project, phase: 'intro' | 'outro', kind: string, id = 'ca') =>
  planPhase(project, clipOf(project, id), phase, kind as never);

describe('planPhase', () => {
  it('gives the animation its own length when nothing is in its way', () => {
    const project = scene([createEmphasis(3, 'indicate', 'all')]);
    const intro = plan(project, 'intro', 'write');
    expect(intro.conflicts).toEqual([]);
    expect(intro.fitted).toBeNull();
    expect(intro.whole.intro).toMatchObject({ kind: 'write', duration: 1 });
    const outro = plan(project, 'outro', 'fade_out');
    expect(outro.conflicts).toEqual([]);
    expect(outro.whole.outro).toMatchObject({ kind: 'fade_out', duration: 1 });
    // The clip it was asked about is not touched.
    expect(clipOf(project).intro.kind).toBe('none');
  });

  it('says that a Transform of the whole formula would be cut, and how long fits before it', () => {
    // A keyframe over [1.4, 2.4) of the scene: an intro of 1 s would cut 0.6 s off it.
    const project = scene([createTween(0.4, 1, { opacity: 0.5 })]);
    const { conflicts, whole, fitted } = plan(project, 'intro', 'write');
    expect(conflicts).toEqual([
      'The Transform of the whole formula at 1.40 s would be cut from 1.00 s to 0.40 s.',
    ]);
    expect(whole.actions[0]).toMatchObject({ start: 1, duration: 0.4 });
    expect(fitted!.intro).toMatchObject({ kind: 'write', duration: 0.4 });
    expect(fitted!.actions[0]).toMatchObject({ start: 0.4, duration: 1 });
  });

  it('says just “the Transform” on a brace or a shape, which have no part to tell it from', () => {
    for (const [object, time] of [
      [createBraceFormula({ name: 'b' }), 0.4],
      [createShapeFormula({ name: 's' }), 0],
    ] as const) {
      const project = scene([createTween(time, time === 0 ? 0.5 : 1, { opacity: 0.5 })]);
      project.formulas[0] = { ...object, id: 'f' };
      expect(plan(project, 'intro', 'fade_in').conflicts).toEqual([
        time === 0
          ? 'The Transform at 1.00 s would be removed: it has no room left.'
          : 'The Transform at 1.40 s would be cut from 1.00 s to 0.40 s.',
      ]);
    }
  });

  it('says that a Transform it leaves no room for would be removed', () => {
    const project = scene([createTween(0, 0.5, { opacity: 0.5 })]);
    const { conflicts, whole, fitted } = plan(project, 'intro', 'write');
    expect(conflicts).toEqual([
      'The Transform of the whole formula at 1.00 s would be removed: it has no room left.',
    ]);
    expect(whole.actions).toEqual([]);
    // It starts with the clip: no intro fits before it.
    expect(fitted).toBeNull();
  });

  it('an outro stops where the Transform ends', () => {
    // Over [7.5, 8.5): a FadeOut of 1 s, over [8, 9), would cut it; 0.5 s fit after it.
    const project = scene([createTween(6.5, 1, { opacity: 0.5 })]);
    const { conflicts, fitted } = plan(project, 'outro', 'fade_out');
    expect(conflicts).toHaveLength(1);
    expect(fitted!.outro).toMatchObject({ kind: 'fade_out', duration: 0.5 });
    expect(fitted!.actions[0]).toMatchObject({ start: 6.5, duration: 1 });
  });

  it('names the transformation an intro of its source would run into', () => {
    const project = scene();
    project.formulas.push({ ...createFormula({ name: 'g', snapshot: snapshot(4) }), id: 'g' });
    project.clips.push({ ...createClip('g', project.tracks[0]!.id, 1.5, 9, none), id: 'cb' });
    // f → g over [1.5, 2.5): f's glyphs leave while its intro would still write them.
    project.relations.push(
      createRelation('ca', 'cb', {
        pairs: [{ from: [0], to: [0], style: null }],
        offset: 0,
        duration: 1,
      }),
    );
    const { conflicts, fitted } = plan(project, 'intro', 'write');
    expect(conflicts[0]).toBe('The transformation f → g runs from 1.50 s to 2.50 s.');
    expect(fitted!.intro).toMatchObject({ kind: 'write', duration: 0.5 });
    // The outro of the target meets the same window from the other side: none here, far away.
    expect(plan(project, 'outro', 'fade_out', 'cb').conflicts).toEqual([]);
    // An intro of the target is no conflict: the glyphs a transformation brings stay out of it.
    expect(plan(project, 'intro', 'write', 'cb').conflicts).toEqual([]);
  });

  it('reports the blocks that animate the same glyphs meanwhile, in validation’s words', () => {
    const blocks = scene([
      createEmphasis(0.5, 'indicate', [1, 2]),
      createPartTransform(0.25, [3], { shift: [0, 1] }),
    ]);
    const { conflicts, fitted } = plan(blocks, 'intro', 'write');
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]).toContain('The Indicate block and the intro animate glyphs 1, 2 of "f"');
    expect(conflicts[1]).toContain('The Transform block and the intro animate glyph 3 of "f"');
    // Up to the first of the two.
    expect(fitted!.intro.duration).toBe(0.25);
    // An Appear block is not one: its glyphs wait for it, out of the intro.
    const appear = scene([createAppear(0.5, 'write', [1, 2])]);
    expect(plan(appear, 'intro', 'fade_in').conflicts).toEqual([]);
  });

  it('counts an object attached to the clip, which measures its glyphs as it starts', () => {
    const project = scene();
    project.formulas.push({ ...createBraceFormula({ name: 'b' }), id: 'b' });
    project.clips.push({
      ...createClip('b', project.tracks[0]!.id, 1.5, 9, {
        ...none,
        attach: createBraceAttach('ca', 'all', { direction: 270 }),
      }),
      id: 'cb',
    });
    const { conflicts, fitted } = plan(project, 'intro', 'write');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain('"b" is attached to glyphs 0, 1, 2, 3 of "f" while the intro');
    expect(fitted!.intro.duration).toBe(0.5);
  });

  it('taking the animation off never asks', () => {
    const project = scene([createTween(1, 1, { opacity: 0.5 })], {
      intro: defaultIntro('write'),
    });
    const { conflicts, whole } = plan(project, 'intro', 'none');
    expect(conflicts).toEqual([]);
    expect(whole.intro).toMatchObject({ kind: 'none', duration: 0 });
  });
});

describe('an intro or an outro and the camera', () => {
  /** The scene — clip `ca` over [1, 9) — with a camera move over `[start, start + duration)`. */
  const withMove = (start: number, duration: number) => {
    const project = scene();
    project.camera = {
      initial: defaultCameraFrame(),
      targets: [],
      moves: [{ id: 'n1', start, duration, easing: 'smooth', to: { kind: 'start' } }],
    };
    return project;
  };

  it('asks before an intro that would run while the camera moves, and offers one that ends there', () => {
    // A Write lasts 1 s, over [1, 2): the camera moves over [1.5, 2.5).
    const intro = plan(withMove(1.5, 1), 'intro', 'write');
    expect(intro.conflicts).toEqual([
      'The camera moves from 1.50 s to 2.50 s, and nothing else animates while it does.',
    ]);
    expect(intro.fitted?.intro).toMatchObject({ kind: 'write', duration: 0.5 });
    expect(intro.locked).toBeNull();
  });

  it('asks before an outro too, and offers one that starts where the move ends', () => {
    // A FadeOut lasts 1 s, over [8, 9): the camera moves over [7.75, 8.25).
    const outro = plan(withMove(7.75, 0.5), 'outro', 'fade_out');
    expect(outro.conflicts).toEqual([
      'The camera moves from 7.75 s to 8.25 s, and nothing else animates while it does.',
    ]);
    expect(outro.fitted?.outro).toMatchObject({ kind: 'fade_out', duration: 0.75 });
  });

  it('gives the animation whole when the camera moves at another time', () => {
    const intro = plan(withMove(2, 1), 'intro', 'write');
    expect(intro.conflicts).toEqual([]);
    expect(intro.fitted).toBeNull();
  });
});
