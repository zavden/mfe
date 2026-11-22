// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTween,
  defaultCameraFrame,
  defaultIntro,
  defaultOutro,
} from '../../../model';
import { blockSnapPoints } from '../blockSnap';

describe('blockSnapPoints', () => {
  it('lists the playhead, the clip, the phases, the other blocks and the relation windows', () => {
    const project = createEmptyProject();
    const formula = createFormula({ name: 'f' });
    project.formulas.push(formula);
    const mine = createAppear(1, 'write', [0], { duration: 1 });
    const other = createTween(4, 1.5, { rotation: 5 });
    const clip = createClip(formula.id, project.tracks[0]!.id, 2, 12, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
      actions: [mine, other],
    });
    const from = createClip(formula.id, project.tracks[1]!.id, 0, 4);
    const unrelated = createClip(formula.id, project.tracks[1]!.id, 20, 24);
    const relation = createRelation(from.id, clip.id, { offset: 3, duration: 2 });
    project.clips.push(clip, from, unrelated);
    project.relations.push(relation);
    const points = blockSnapPoints(project, clip, mine.id, 7.25);
    // Absolute seconds: the playhead; the clip [2, 12]; intro end 3; outro start 11; the other
    // block [6, 7.5]; the relation window [5, 7]. Not the block's own edges.
    expect([...new Set(points)].sort((a, b) => a - b)).toEqual([2, 3, 5, 6, 7, 7.25, 7.5, 11, 12]);
    // With a camera, the edges of its moves too: where the locked region starts and ends.
    project.camera = {
      initial: defaultCameraFrame(),
      targets: [],
      moves: [{ id: 'n1', start: 8.25, duration: 0.5, easing: 'smooth', to: { kind: 'start' } }],
    };
    expect(blockSnapPoints(project, clip, mine.id, 7.25)).toEqual(
      expect.arrayContaining([8.25, 8.75]),
    );
  });
});
