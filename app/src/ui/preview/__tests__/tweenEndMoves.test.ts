// @vitest-environment node
/* Moving or freeing one end of the ends a Transform carries a line to, while the other is free
 * (audit A5-06): the free end stays where it is drawn, as it does when an end of the clip's own
 * ends moves (`moveLineEnd`). The point the tween holds for a free end beside one on glyphs is the
 * point Manim is given, the gap further out than where the line is drawn; the end that stays
 * starts from where it is drawn and is given that point once — never the point it holds, taken
 * for where it is drawn and pushed out again. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../../engine';
import {
  createClip,
  createEndsTween,
  createLineFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  type LineCurve,
  type Project,
  type Target,
  type TweenAction,
} from '../../../model';
import { settleScene } from '../../../scene';
import { plainClip, sceneWith } from '../../../scene/__tests__/sceneKit';
import { loadProject, useProjectStore, useRenderStore } from '../../../store';
import { freeLineEnd, moveLineEnd } from '../lineDraw';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** A Transform at 1 s of an arrow's ends: the start on "a+b=c", the end free at (3, 1), gap 0.25;
 * `gesture` moves the start, given the clip, the tween and the clip of "x^2". How far the free end
 * is drawn from where it was, once settled again. */
async function freeEndMoved(
  target: Target,
  gesture: (clipId: string, tweenId: string, other: string) => void,
  curve: LineCurve | null = null,
) {
  const scene = await sceneWith({ a: 'a+b=c', b: 'x^2' }, target);
  const a = plainClip(scene, 'a', 0, 0, 8);
  a.initial.position = [-3, 1];
  const b = plainClip(scene, 'b', 1, 0, 8);
  b.initial.position = [-3, -2];
  const formula = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 0], curve });
  scene.project.formulas.push(formula);
  const track = createTrack('Track of the line');
  scene.project.tracks.unshift(track);
  const clip = createClip(formula.id, track.id, 0, 8, none);
  clip.initial.position = [0, 3];
  const tween = createEndsTween(
    1,
    1,
    { start: { clipId: a.id, glyphs: 'all', anchor: 'auto' }, end: { point: [3, 1] }, buff: 0.25 },
    {},
    'linear',
  );
  clip.actions.push(tween);
  scene.project.clips.push(clip);
  const drawnOf = (p: Project) =>
    (p.clips.find((c) => c.id === clip.id)!.actions[0] as TweenAction).ends!.drawn!;

  const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
  const before = drawnOf(settled.project).end;
  loadProject(settled.project);
  useRenderStore.setState({ resolved: settled.formulas });
  gesture(clip.id, tween.id, b.id);
  const after = drawnOf(
    settleScene(useProjectStore.getState().project, settled.formulas, refreshLocalRenders).project,
  ).end;
  return Math.hypot(after[0] - before[0], after[1] - before[1]);
}

describe.each(['ce', 'gl'] as const)(
  'moving the end on glyphs of a Transform’s ends (%s)',
  (target) => {
    it('to other glyphs leaves the free end where it is drawn', async () => {
      const moved = await freeEndMoved(target, (clipId, tweenId, other) => {
        const to = { clipId: other, glyphs: 'all' as const, anchor: 'auto' as const };
        expect(moveLineEnd(clipId, 'start', to, false, { tween: tweenId })).toBe(true);
      });
      expect(moved).toBeLessThan(1e-4);
    });

    it('freeing it («Detach») leaves the free end where it is drawn', async () => {
      const moved = await freeEndMoved(target, (clipId, tweenId) => {
        expect(freeLineEnd(clipId, 'start', { tween: tweenId })).toBe(true);
      });
      expect(moved).toBeLessThan(1e-4);
    });

    it('back and forth, leaves the free end where it is drawn: no gap is added at each move', async () => {
      const moved = await freeEndMoved(target, (clipId, tweenId, other) => {
        const on = (clip: string) => ({
          clipId: clip,
          glyphs: 'all' as const,
          anchor: 'auto' as const,
        });
        const a = (
          useProjectStore.getState().project.clips.find((c) => c.id === clipId)!
            .actions[0] as TweenAction
        ).ends!.start as { clipId: string };
        const home = a.clipId;
        for (const host of [other, home, other, home]) {
          expect(moveLineEnd(clipId, 'start', on(host), false, { tween: tweenId })).toBe(true);
          // The sync measures the move before the next one, as in the app.
          const settled = settleScene(
            useProjectStore.getState().project,
            useRenderStore.getState().resolved,
            refreshLocalRenders,
          );
          loadProject(settled.project);
        }
      });
      expect(moved).toBeLessThan(1e-4);
    });

    it('on an arc, leaves the free end where it is drawn', async () => {
      const moved = await freeEndMoved(
        target,
        (clipId, tweenId, other) => {
          const to = { clipId: other, glyphs: 'all' as const, anchor: 'auto' as const };
          expect(moveLineEnd(clipId, 'start', to, false, { tween: tweenId })).toBe(true);
        },
        { shape: 'arc', degrees: 45, trim: 0 },
      );
      expect(moved).toBeLessThan(1e-4);
    });
  },
);
