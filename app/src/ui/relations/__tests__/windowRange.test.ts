// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createMorph,
  createPartTransform,
  createRelation,
  createTrack,
  defaultCameraFrame,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type ClipAction,
  type IntroSpec,
  type Project,
  type Relation,
} from '../../../model';
import { clampWindow } from '../windowRange';

/** Two clips of one five-glyph formula, `a` on track 1 and `b` on track 2, both over [0, 10]
 * without intro or outro unless given, and a relation copying glyph 0 of `a` onto glyph 0 of `b`
 * over [2, 3). */
function scene(
  options: { aIntro?: IntroSpec; aActions?: ClipAction[]; bActions?: ClipAction[] } = {},
) {
  const project = createEmptyProject();
  const glyphs = Array.from({ length: 5 }, (_, i) => ({
    label: String(i),
    center: [i, 0] as [number, number],
    size: [1, 1] as [number, number],
  }));
  const snapshot = { backend: 'mathjax' as const, key: 'k', glyphs };
  const f = createFormula({ name: 'f', snapshot });
  const g = createFormula({ name: 'g', snapshot });
  project.formulas.push(f, g);
  const second = createTrack('Other');
  project.tracks.push(second);
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const a = createClip(f.id, project.tracks[0]!.id, 0, 10, {
    ...none,
    intro: options.aIntro ?? none.intro,
    actions: options.aActions ?? [],
  });
  const b = createClip(g.id, second.id, 0, 10, { ...none, actions: options.bActions ?? [] });
  project.clips.push(a, b);
  const relation = createRelation(a.id, b.id, {
    offset: 2,
    duration: 1,
    style: 'copy',
    pairs: [{ from: [0], to: [0], style: null }],
  });
  project.relations.push(relation);
  return { project, a, b, relation };
}

const errors = (project: Project) => validateProject(project).filter((i) => i.severity === 'error');

/** The project with the relation's window at `spec`. */
const placed = (project: Project, relation: Relation, spec: { offset: number; duration: number }) =>
  ({
    ...project,
    relations: project.relations.map((r) => (r.id === relation.id ? { ...r, ...spec } : r)),
  }) as Project;

describe('clampWindow', () => {
  it('keeps the window inside its range: after the source intro, before the clips end', () => {
    const { project, relation } = scene({ aIntro: defaultIntro('write') }); // [0, 1)
    expect(clampWindow(project, relation.id, { start: -1, end: 0 }, 'move')).toEqual({
      offset: 1,
      duration: 1,
    });
    expect(clampWindow(project, relation.id, { start: 9.5, end: 10.5 }, 'move')).toEqual({
      offset: 9,
      duration: 1,
    });
    expect(clampWindow(project, relation.id, { start: 2, end: 12 }, 'end')).toEqual({
      offset: 2,
      duration: 8,
    });
    // An edge never crosses the other: the minimum window stays.
    expect(clampWindow(project, relation.id, { start: 2.99, end: 3 }, 'start')).toEqual({
      offset: 2.95,
      duration: 0.05,
    });
    // Asked for where it is, the stored numbers come back as they are.
    expect(clampWindow(project, relation.id, { start: 2, end: 3 }, 'move')).toEqual({
      offset: 2,
      duration: 1,
    });
  });

  it('stops exactly where a block of the target clip animates a target glyph', () => {
    // A part transform of glyph 0 of `b` over [5, 6): the window may end at 5, not later.
    const { project, relation } = scene({
      bActions: [createPartTransform(5, [0], { duration: 1 })],
    });
    expect(errors(project)).toEqual([]);
    const moved = clampWindow(project, relation.id, { start: 5.5, end: 6.5 }, 'move');
    expect(moved).toEqual({ offset: 4, duration: 1 });
    expect(errors(placed(project, relation, moved!))).toEqual([]);
    // The end edge likewise; the start edge is free up to its own end.
    expect(clampWindow(project, relation.id, { start: 2, end: 5.5 }, 'end')).toEqual({
      offset: 2,
      duration: 3,
    });
    expect(clampWindow(project, relation.id, { start: 2.5, end: 3 }, 'start')).toEqual({
      offset: 2.5,
      duration: 0.5,
    });
    // Past the block it fits again.
    expect(clampWindow(project, relation.id, { start: 7, end: 8 }, 'move')).toEqual({
      offset: 7,
      duration: 1,
    });
  });

  it('stops where a block of the source clip animates a copied source glyph', () => {
    const { project, relation } = scene({
      aActions: [createPartTransform(5, [0], { duration: 1 })],
    });
    expect(errors(project)).toEqual([]);
    expect(clampWindow(project, relation.id, { start: 5.5, end: 6.5 }, 'move')).toEqual({
      offset: 4,
      duration: 1,
    });
  });

  it('keeps a copy before the transfer that consumes its source, exactly', () => {
    // A Morph block of `a` turns glyph 0 into glyph 2 over [6, 7): the copy may start at 6.
    const morph = createMorph(6, {
      style: 'transform',
      pairs: [{ from: [0], to: [2], style: null }],
    });
    const { project, relation } = scene({ aActions: [morph] });
    expect(errors(project)).toEqual([]);
    const moved = clampWindow(project, relation.id, { start: 7, end: 8 }, 'move');
    expect(moved).toEqual({ offset: 6, duration: 1 });
    expect(errors(placed(project, relation, moved!))).toEqual([]);
  });

  it('is null without a relation, a clip or room for a window', () => {
    const { project, relation, a } = scene();
    expect(clampWindow(project, 'nope', { start: 0, end: 1 }, 'move')).toBeNull();
    const short: Clip = { ...a, end: 0.01 };
    const tight: Project = { ...project, clips: [short, project.clips[1]!] };
    expect(clampWindow(tight, relation.id, { start: 0, end: 1 }, 'move')).toBeNull();
  });
});

describe('the locked region of the camera', () => {
  const withMove = (start: number, duration: number) => {
    const made = scene();
    made.project.camera = {
      initial: defaultCameraFrame(),
      targets: [],
      moves: [{ id: 'n1', start, duration, easing: 'smooth', to: { kind: 'start' } }],
    };
    return made;
  };

  it('stops a window at a camera move, on either side, and does not let it pass', () => {
    // The window runs over [2, 3); the camera moves over [4, 5).
    const { project, relation } = withMove(4, 1);
    expect(clampWindow(project, relation.id, { start: 3.5, end: 4.5 }, 'move')).toEqual({
      offset: 3,
      duration: 1,
    });
    expect(clampWindow(project, relation.id, { start: 6, end: 7 }, 'move')).toEqual({
      offset: 3,
      duration: 1,
    });
    expect(clampWindow(project, relation.id, { start: 2, end: 4.8 }, 'end')).toEqual({
      offset: 2,
      duration: 2,
    });
    // A move before it: its start goes back no further than where the move ends.
    const before = withMove(0.5, 1);
    expect(clampWindow(before.project, before.relation.id, { start: 1, end: 3 }, 'start')).toEqual({
      offset: 1.5,
      duration: 1.5,
    });
    expect(errors(project)).toEqual([]);
  });
});
