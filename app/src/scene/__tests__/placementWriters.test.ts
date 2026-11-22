// @vitest-environment node
/* The placements `deriveAttachments` finds are written by two functions: `applyAttachments` on a
 * draft, which is what the attach sync does in the app, and the pure one inside `settleScene`,
 * which is what the pins and the export check go through. Something new that is placed must be
 * taught to both: this holds the one to the other, pass by pass, over a scene with every rule and
 * a tween that carries a shape to other glyphs. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import {
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createEndsAttach,
  createFitTween,
  createLineFormula,
  createShapeAttach,
  createShapeFormula,
  createTipAttach,
  createTrack,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Formula,
  type Target,
} from '../../model';
import { applyAttachments, deriveAttachments, settleScene } from '../attach';
import { plainClip, sceneWith, type Scene } from './sceneKit';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** A clip of `formula`, an object the scene did not have, on a track of its own. */
function objectClip(scene: Scene, formula: Formula, fields: Partial<Clip>): Clip {
  const track = createTrack(`Track of ${formula.name}`);
  scene.project.tracks.push(track);
  scene.project.formulas.push(formula);
  const clip = createClip(formula.id, track.id, 1, 6, { ...none, ...fields });
  scene.project.clips.push(clip);
  return clip;
}

/** Two formulas apart, and on the first: a label beside it, a brace with a label at its tip, a
 * box, an arrow to the second, a dashed line from a point, and an underline that a tween carries
 * to glyphs of both. */
async function everyRule(target: Target): Promise<Scene> {
  const scene = await sceneWith({ host: 'a+b=c', other: 'x^2', beside: 'y', tip: 'z' }, target);
  const host = plainClip(scene, 'host', 0, 0, 6);
  host.initial.position = [-2, 1];
  const other = plainClip(scene, 'other', 1, 0, 6);
  other.initial.position = [3, -1.5];
  other.initial.scale = 1.5;
  scene.project.tracks.push(createTrack('Labels'), createTrack('Tips'));
  plainClip(scene, 'beside', 2, 1, 6, { attach: createAttach(host.id, [0, 1], { side: 'up' }) });
  const brace = objectClip(scene, createBraceFormula({ name: 'b1' }), {
    attach: createBraceAttach(host.id, [2, 3, 4], { direction: 30 }),
  });
  plainClip(scene, 'tip', 3, 2, 6, { attach: createTipAttach(brace.id) });
  objectClip(scene, createShapeFormula({ name: 's1', shape: 'box' }), {
    attach: createShapeAttach(host.id, 'all', 0.15, [{ clipId: other.id, glyphs: [0] }]),
  });
  objectClip(scene, createLineFormula({ name: 'l1', line: 'arrow' }), {
    attach: createEndsAttach(
      { clipId: host.id, glyphs: [0, 1] },
      { clipId: other.id, glyphs: 'all' },
      0.25,
    ),
  });
  objectClip(scene, createLineFormula({ name: 'l2', line: 'dashed' }), {
    attach: createEndsAttach({ point: [-5, -3] }, { clipId: host.id, glyphs: [4] }, 0),
  });
  objectClip(scene, createShapeFormula({ name: 's2', shape: 'underline' }), {
    attach: createShapeAttach(host.id, [0]),
    actions: [
      createFitTween(1, 1, { clipId: other.id, glyphs: 'all' }, [{ clipId: host.id, glyphs: [4] }]),
    ],
  });
  return scene;
}

describe('the two writers of a placement', () => {
  it.each(['ce', 'gl'] as const)('write the same project, pass by pass (%s)', async (target) => {
    const scene = await everyRule(target);
    let current = refreshLocalRenders(scene.project, scene.formulas);
    let passes = 0;
    for (; passes < 12; passes++) {
      const placements = deriveAttachments(current.project, current.formulas);
      if (placements.length === 0) break;
      const onDraft = produce(current.project, (draft) => applyAttachments(draft, placements));
      // One pass of the pure settle, its renders left as they are.
      const pure = settleScene(current.project, current.formulas, undefined, 1).project;
      expect(pure).toEqual(onDraft);
      current = refreshLocalRenders(onDraft, current.formulas);
    }
    // Something was placed, and the scene came to rest: every rule took part.
    expect(passes).toBeGreaterThan(0);
    expect(passes).toBeLessThan(12);
    const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    expect(settled.readiness).toEqual({ ready: true, pending: [] });
    expect(settled.project).toEqual(current.project);
    const fit = settled.project.clips.at(-1)!.actions[0]!;
    expect(fit.kind === 'tween' && fit.fit?.fitted).toBeTruthy();
    const arrow = settled.project.formulas.find((f) => f.name === 'l1')!;
    expect(arrow.kind === 'line' && arrow.vector).not.toEqual([1, 0]);
  });
});
