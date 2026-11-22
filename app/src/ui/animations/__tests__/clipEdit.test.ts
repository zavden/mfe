// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Project,
} from '../../../model';
import {
  addKeyframeAt,
  editActionTiming,
  maxPhaseDuration,
  setPhaseDuration,
  setPhaseKind,
  stateBefore,
} from '../clipEdit';

function projectWith(start = 0, end = 10) {
  const project: Project = createEmptyProject();
  const formula = createFormula({ name: 'f' });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, start, end);
  project.clips.push(clip);
  return { project, clip };
}

describe('intro and outro edits', () => {
  it('limits a duration to what the other animation leaves', () => {
    const { clip } = projectWith(0, 3);
    expect(maxPhaseDuration(clip, 'intro')).toBe(2);
    setPhaseDuration(clip, 'intro', 5);
    expect(clip.intro.duration).toBe(2);
    setPhaseDuration(clip, 'outro', 5);
    expect(clip.outro.duration).toBe(1);
    setPhaseDuration(clip, 'intro', 0.01); // never below the minimum
    expect(clip.intro.duration).toBe(0.05);
  });

  it('applies the defaults of the new kind and keeps the clip valid', () => {
    const { project, clip } = projectWith(0, 10);
    setPhaseKind(clip, 'intro', 'draw_border_then_fill');
    expect(clip.intro).toMatchObject({
      kind: 'draw_border_then_fill',
      duration: 2,
      easing: 'double_smooth',
      lagRatio: null,
    });
    setPhaseKind(clip, 'intro', 'fade_in');
    clip.intro.shift = [1, 1];
    clip.intro.scale = 2;
    setPhaseKind(clip, 'intro', 'fade_in'); // staying on a fade keeps its parameters
    expect(clip.intro.shift).toEqual([1, 1]);
    setPhaseKind(clip, 'intro', 'write'); // leaving it resets them
    expect(clip.intro).toMatchObject({ shift: [0, 0], scale: 1, easing: 'linear' });
    setPhaseKind(clip, 'outro', 'none');
    expect(clip.outro).toMatchObject({ kind: 'none', duration: 0 });
    expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('drops an animation that cannot fit at all', () => {
    const { clip } = projectWith(0, 1);
    clip.outro = { ...defaultOutro('fade_out'), duration: 0.99 };
    clip.intro = defaultIntro('none');
    setPhaseKind(clip, 'intro', 'write');
    expect(clip.intro.kind).toBe('none');
    expect(clip.intro.duration).toBe(0);
  });

  it('refits tweens when the intro grows', () => {
    const { clip } = projectWith(0, 10);
    clip.actions = [createTween(1.2, 1, { rotation: 5 })];
    setPhaseDuration(clip, 'intro', 2);
    expect(clip.actions[0]).toMatchObject({ start: 2, duration: 0.2 });
  });
});

describe('tween timing', () => {
  it('keeps a tween clear of its neighbours', () => {
    const { project, clip } = projectWith(0, 10);
    clip.actions = [createTween(2, 1, { rotation: 1 }), createTween(5, 1, { rotation: 2 })];
    const [first, second] = clip.actions;
    // The first may use [1, 5): start up to 4, duration up to what is left.
    editActionTiming(project, clip, first!.id, { duration: 10 });
    expect(first).toMatchObject({ start: 2, duration: 3 });
    editActionTiming(project, clip, first!.id, { start: 4.5 });
    expect(first!.start).toBeCloseTo(4.5, 9);
    expect(first!.duration).toBeCloseTo(0.5, 9);
    editActionTiming(project, clip, first!.id, { start: 0 });
    expect(first!.start).toBe(1); // not before the intro ends
    // The second is bounded by the outro (9).
    editActionTiming(project, clip, second!.id, { duration: 10 });
    expect(second).toMatchObject({ start: 5, duration: 4 });
    expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('returns false for unknown actions', () => {
    const { project, clip } = projectWith();
    expect(editActionTiming(project, clip, 'nope', { start: 1 })).toBe(false);
  });
});

describe('add keyframe at the playhead', () => {
  it('creates a tween that starts at the playhead and targets the current state', () => {
    const { project, clip } = projectWith(2, 12);
    clip.initial.position = [1, 2];
    clip.initial.rotation = 30;
    const action = addKeyframeAt(project, clip, 5)!;
    expect(action).toMatchObject({ start: 3, duration: 1, easing: 'smooth' });
    expect(action.to).toEqual({ position: [1, 2], scale: 1, rotation: 30, opacity: 1 });
    expect(action.to.position).not.toBe(clip.initial.position); // a copy, not an alias
    expect(clip.actions).toHaveLength(1);
    expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('starts from the state the previous tween ends in, and fits the free time', () => {
    const { project, clip } = projectWith(0, 10);
    clip.actions = [createTween(2, 1, { position: [4, 0] }), createTween(4.5, 1, { scale: 3 })];
    const action = addKeyframeAt(project, clip, 3.2)!;
    expect(action.to).toMatchObject({ position: [4, 0], scale: 1 });
    // Free time after 3.2 ends where the next tween begins (4.5): 1 s of room, so 1 s.
    expect(action.duration).toBe(1);
    expect(clip.actions.map((a) => a.start)).toEqual([2, 3.2, 4.5]);
  });

  it('shortens the tween to the room that is left', () => {
    const { project, clip } = projectWith(0, 10);
    clip.actions = [createTween(4.5, 1, { scale: 3 })];
    const tight = addKeyframeAt(project, clip, 3.9)!; // 0.6 s left before 4.5
    expect(tight.duration).toBeCloseTo(0.6, 9);
  });

  it('refuses times that are not free', () => {
    const { project, clip } = projectWith(0, 10);
    clip.actions = [createTween(3, 2, { rotation: 5 })];
    expect(addKeyframeAt(project, clip, 0.5)).toBeNull(); // intro
    expect(addKeyframeAt(project, clip, 4)).toBeNull(); // inside a tween
    expect(addKeyframeAt(project, clip, 9.5)).toBeNull(); // outro
    expect(addKeyframeAt(project, clip, 12)).toBeNull(); // outside
    const other = createClip(clip.formulaId, project.tracks[1]!.id, 0, 10);
    project.clips.push(other);
    project.relations.push(createRelation(clip.id, other.id, { offset: 6, duration: 1 }));
    expect(addKeyframeAt(project, clip, 6.5)).toBeNull(); // a relation window
    expect(clip.actions).toHaveLength(1);
  });

  it('knows the state before an action', () => {
    const { clip } = projectWith();
    clip.actions = [createTween(2, 1, { scale: 2 }), createTween(4, 1, { rotation: 9 })];
    const second = clip.actions[1]!;
    expect(stateBefore(clip, second.id)).toMatchObject({ scale: 2, rotation: 0 });
    expect(stateBefore(clip, clip.actions[0]!.id)).toMatchObject({ scale: 1 });
  });
});
