// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBraceAttach,
  createBraceFormula,
  createClip,
  createFitTween,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  hasPlacementUses,
  placementTargets,
  placementUses,
  setIdGenerator,
  usesAnyOf,
  type Clip,
  type Project,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { smallProject } from './fixtures';

/* The list of what places a clip by glyphs of other clips (`placementUses`): who owns each
 * reference, when its targets are measured, where it is in the clip, and the targets as the
 * project holds them. The table below is written by hand, one row per case. */

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

/** `smallProject` — "a+b=c" over [0, 4), "c=b+a" over [2, 6) — without its relation, and an
 * object of `kind` over [1, 5) on a third track, which nothing places yet. */
function withObject(kind: 'brace' | 'shape') {
  const p: Project = smallProject();
  p.relations = [];
  const [ca, cb] = p.clips as [Clip, Clip];
  const track = createTrack('Track 3');
  p.tracks.push(track);
  const formula =
    kind === 'brace' ? createBraceFormula({ name: 'b1' }) : createShapeFormula({ name: 's1' });
  p.formulas.push(formula);
  const clip = createClip(formula.id, track.id, 1, 5, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  p.clips.push(clip);
  return { a: ca, b: cb, clip };
}

/** What a use says, without the objects themselves. */
const told = (clip: Clip) =>
  placementUses(clip).map((use) => ({
    owner: use.owner.kind === 'fit' ? `fit:${use.owner.index}` : 'attach',
    at: use.at,
    path: use.path,
    spots: use.spots.map((spot) => [spot.target.clipId, spot.path]),
  }));

describe('placementUses', () => {
  it('is empty for a clip nothing places', () => {
    const { a, clip } = withObject('brace');
    expect(placementUses(a)).toEqual([]);
    expect(hasPlacementUses(a)).toBe(false);
    expect(placementUses(clip)).toEqual([]);
  });

  it('lists an attachment, measured when its clip starts', () => {
    const { a, clip } = withObject('brace');
    clip.attach = createBraceAttach(a.id, [1, 2]);
    expect(told(clip)).toEqual([
      { owner: 'attach', at: 1, path: ['attach'], spots: [[a.id, ['attach']]] },
    ]);
    expect(hasPlacementUses(clip)).toBe(true);
  });

  it('lists the other clips an attachment spans, each at its own path', () => {
    const { a, b, clip } = withObject('brace');
    clip.attach = createBraceAttach(a.id, [1, 2], { also: [{ clipId: b.id, glyphs: [0] }] });
    expect(told(clip)).toEqual([
      {
        owner: 'attach',
        at: 1,
        path: ['attach'],
        spots: [
          [a.id, ['attach']],
          [b.id, ['attach', 'also', 0]],
        ],
      },
    ]);
  });

  it('lists a fit, measured when its tween starts, at its place among the actions', () => {
    const { b, clip } = withObject('shape');
    clip.actions.push(
      createTween(0.5, 0.5, {}),
      createFitTween(2.5, 1, { clipId: b.id, glyphs: [0] }),
    );
    expect(told(clip)).toEqual([
      {
        owner: 'fit:1',
        at: 3.5,
        path: ['actions', 1, 'fit'],
        spots: [[b.id, ['actions', 1, 'fit']]],
      },
    ]);
    expect(hasPlacementUses(clip)).toBe(true);
  });

  it('lists the other clips a fit spans', () => {
    const { a, b, clip } = withObject('shape');
    clip.actions.push(
      createFitTween(2, 1, { clipId: b.id, glyphs: [0] }, [{ clipId: a.id, glyphs: [1] }]),
    );
    expect(told(clip)).toEqual([
      {
        owner: 'fit:0',
        at: 3,
        path: ['actions', 0, 'fit'],
        spots: [
          [b.id, ['actions', 0, 'fit']],
          [a.id, ['actions', 0, 'fit', 'also', 0]],
        ],
      },
    ]);
  });

  it('lists the attachment first, then the fits in the order of the actions', () => {
    const { a, b, clip } = withObject('shape');
    clip.attach = createShapeAttach(a.id, [0]);
    clip.actions.push(
      createFitTween(1, 0.5, { clipId: b.id, glyphs: 'all' }),
      createFitTween(2, 0.5, { clipId: a.id, glyphs: [2] }),
    );
    expect(told(clip).map((use) => [use.owner, use.at])).toEqual([
      ['attach', 1],
      ['fit:0', 2],
      ['fit:1', 3],
    ]);
    // The same targets, in the same order, as the list that only names them.
    expect(
      placementUses(clip).flatMap((use) => use.spots.map((spot) => spot.target.clipId)),
    ).toEqual(placementTargets(clip).map((target) => target.clipId));
  });

  it('hands over the references themselves, which a draft can write', () => {
    const { a, b, clip } = withObject('shape');
    clip.attach = createShapeAttach(a.id, [0], undefined, [{ clipId: b.id, glyphs: [1] }]);
    const fit = createFitTween(1, 0.5, { clipId: b.id, glyphs: [0] });
    clip.actions.push(fit);
    const [attached, carried] = placementUses(clip);
    expect(attached!.spots[0]!.target).toBe(clip.attach);
    expect(attached!.spots[1]!.target).toBe((clip.attach as { also: unknown[] }).also[0]);
    expect(carried!.spots[0]!.target).toBe(fit.fit);
    expect(carried!.owner).toEqual({ kind: 'fit', tween: fit, index: 0 });
    carried!.spots[0]!.target.glyphs = [2];
    expect(fit.fit.glyphs).toEqual([2]);
  });

  it('says whether a use names one of some clips', () => {
    const { a, b, clip } = withObject('brace');
    clip.attach = createBraceAttach(a.id, [1], { also: [{ clipId: b.id, glyphs: [0] }] });
    const [use] = placementUses(clip);
    expect(usesAnyOf(use!, new Set([b.id]))).toBe(true);
    expect(usesAnyOf(use!, new Set([clip.id]))).toBe(false);
  });
});
