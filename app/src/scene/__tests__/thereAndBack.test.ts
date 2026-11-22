// @vitest-environment node
/* A tween whose easing ends at 0 (`there_and_back`) leaves the clip where it started, as Manim's
 * `finish()` does: in the events, the evaluator, the editor overlays and the keyframe edits. */
import { describe, expect, it } from 'vitest';
import { contoursBox, boxCenter } from '../../geom';
import { createTween, type Easing } from '../../model';
import {
  buildEvents,
  createEvaluator,
  endsAtStart,
  keyframeAt,
  placementAt,
  rateFunction,
  type TweenEvent,
} from '../index';
import { plainClip, sceneWith } from './sceneKit';

/** Every easing (the Record type makes the list exhaustive). */
const EASINGS = Object.keys({
  smooth: 1,
  linear: 1,
  rush_into: 1,
  rush_from: 1,
  slow_into: 1,
  double_smooth: 1,
  there_and_back: 1,
  there_and_back_with_pause: 1,
} satisfies Record<Easing, 1>) as Easing[];

describe('there_and_back tweens', () => {
  it('endsAtStart matches the easings whose rate is 0 at the end, in both targets', () => {
    for (const easing of EASINGS) {
      for (const target of ['ce', 'gl'] as const) {
        expect(endsAtStart(easing), `${easing} ${target}`).toBe(
          rateFunction(easing, target)(1) < 0.5,
        );
      }
    }
  });

  async function pulseScene() {
    const scene = await sceneWith({ f: 'x' });
    const pulse = createTween(1, 1, { position: [2, 0], scale: 2 }, 'there_and_back');
    const move = createTween(3, 1, { position: [0, 1] }, 'smooth');
    const clip = plainClip(scene, 'f', 0, 0, 6, { actions: [pulse, move] });
    return { scene, clip, pulse, move };
  }

  it('the next tween starts from the state before the pulse', async () => {
    const { scene, move } = await pulseScene();
    const tweens = buildEvents(scene.project).filter((e): e is TweenEvent => e.kind === 'tween');
    const next = tweens.find((e) => e.actionId === move.id)!;
    expect(next.from.position).toEqual([0, 0]);
    expect(next.from.scale).toBe(1);
    expect(next.to.position).toEqual([0, 1]);
  });

  it('the evaluator and the overlays show the start state after the pulse', async () => {
    const { scene, clip } = await pulseScene();
    const ev = createEvaluator(scene.project, scene.formulas);
    const center = (t: number) => boxCenter(contoursBox(ev.evaluate(t)[0]!.path.contours));
    const before = center(0.5);
    expect(center(1.5)[0]).toBeGreaterThan(before[0] + 0.5); // out at the middle of the pulse
    const [x, y] = center(2.5);
    expect(x).toBeCloseTo(before[0], 6);
    expect(y).toBeCloseTo(before[1], 6);
    expect(placementAt(clip, 2.5, 'ce')).toMatchObject({ position: [0, 0], scale: 1 });
  });

  it('after the pulse, edits change the keyframe before it; during it, the pulse target', async () => {
    const { clip, pulse } = await pulseScene();
    expect(keyframeAt(clip, 1.5).ref).toEqual({ kind: 'action', actionId: pulse.id });
    expect(keyframeAt(clip, 2.5)).toMatchObject({
      ref: { kind: 'initial' },
      state: { position: [0, 0], scale: 1 },
    });
  });
});
