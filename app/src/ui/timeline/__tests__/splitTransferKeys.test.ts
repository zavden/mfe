// @vitest-environment node
/* A split compares the scene before and after it drawable by drawable, by their keys
 * (`sceneDifference`): two transfers that faded a copy of one source at a time drew two pieces
 * under one key (audit A3-02), and a clip that has nothing to do with them would not split. */
import { describe, expect, it } from 'vitest';
import { createRelation, createTrack, validateProject } from '../../../model';
import { plainClip, sceneWith } from '../../../scene/__tests__/sceneKit';
import { planSplit } from '../splitClips';

describe('a split beside copies faded by two transfers at a time (audit A3-02)', () => {
  it.each([
    ['of two sources', [0, 1]],
    ['of one source', [0, 0]],
  ])('cuts a clip that has nothing to do with copies %s', async (_name, sources) => {
    // a (a+b=c) on [0, 6] and b (xy=z) on [1, 6]: two relations over [2, 3), each fading a copy
    // of a glyph of a into a glyph of b; c (w) on [1, 6] on a third track, cut at 4 s.
    const s = await sceneWith({ a: 'a+b=c', b: 'xy=z', c: 'w' });
    s.project.tracks.push(createTrack('Track 3'));
    const a = plainClip(s, 'a', 0, 0, 6);
    const b = plainClip(s, 'b', 1, 1, 6);
    const c = plainClip(s, 'c', 2, 1, 6);
    const window = { offset: 1, duration: 1 };
    s.project.relations.push(
      createRelation(a.id, b.id, {
        ...window,
        pairs: [{ from: [sources[0]!], to: [0], style: 'fade_copy' }],
      }),
      createRelation(a.id, b.id, {
        ...window,
        pairs: [{ from: [sources[1]!], to: [1], style: 'fade_copy' }],
      }),
    );
    expect(validateProject(s.project).filter((i) => i.severity === 'error')).toEqual([]);
    const plan = planSplit(s.project, [c.id], 4, { suffix: '_s', resolved: s.formulas });
    expect(plan.refused).toEqual([]);
    expect(plan.pieces.map((piece) => piece.clipId)).toEqual([c.id]);
  });
});
