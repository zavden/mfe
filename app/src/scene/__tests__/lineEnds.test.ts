// @vitest-environment node
/* A tween that carries the ends of a line (`TweenEnds`, D144), through the attach sync and the
 * evaluator: the sync measures the glyphs its ends go on when the tween starts and writes where
 * the line is drawn then (`drawn`), the clip is from then on at the centre of that line, and the
 * evaluator draws the line there — point by point on the way. What each kind of line is once
 * carried is held to both libraries in lineMoves.test.ts. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import { buildLine } from '../../geom';
import {
  createClip,
  createEndsTween,
  createLineFormula,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  type EndsTween,
  type LineFormula,
  type Target,
  type Vec2,
} from '../../model';
import { deriveAttachments, settleScene } from '../attach';
import { exportEvaluator } from '../evaluator';
import { drawnEnds, lineEndInput, lineEndsAt, manimLineEnds } from '../lines';
import { lineEndsInEffect } from '../lineStates';
import { actionStates, endsInEffect, patchKeyframe } from '../state';
import { plainClip, sceneWith } from './sceneKit';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** "a+b=c" up on the left and "x^2" down on the right, both over [0, 8); a free arrow over the
 * same time, from (−1, 3) to (1, 3). At 1 s a tween carries its ends onto the two formulas, at
 * 3 s another to two points with another stroke width, and at 5 s a plain one moves it. */
async function settled(target: Target) {
  const scene = await sceneWith({ a: 'a+b=c', b: 'x^2' }, target);
  const a = plainClip(scene, 'a', 0, 0, 8);
  a.initial.position = [-3, 1];
  const b = plainClip(scene, 'b', 1, 0, 8);
  b.initial.position = [3, -1.5];
  const formula = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 0] });
  scene.project.formulas.push(formula);
  const track = createTrack('Track of the line');
  scene.project.tracks.unshift(track);
  const clip = createClip(formula.id, track.id, 0, 8, none);
  clip.initial.position = [0, 3];
  const onto = createEndsTween(
    1,
    1,
    {
      start: { clipId: a.id, glyphs: 'all', anchor: 'down' },
      end: { clipId: b.id, glyphs: 'all', anchor: 'auto' },
      buff: 0.25,
    },
    {},
    'linear',
  );
  const away = createEndsTween(
    3,
    1,
    { start: { point: [-1, -2] }, end: { point: [1, -2] } },
    { strokeWidth: 2 },
    'linear',
  );
  clip.actions.push(onto, away);
  scene.project.clips.push(clip);
  const result = settleScene(scene.project, scene.formulas, refreshLocalRenders);
  const placed = result.project.clips.find((c) => c.id === clip.id)!;
  const evaluator = exportEvaluator(result.project, result.formulas);
  const line = result.project.formulas.find((f) => f.id === formula.id) as LineFormula;
  /** The members of the line at `t`: the first point of its shaft, the point of its tip. */
  const drawnAt = (t: number, from = evaluator) => {
    const own = from.evaluate(t).filter((d) => d.clipId === clip.id);
    const [shaft, tip] = own;
    return {
      start: shaft!.path.contours[0]!.slice(0, 2),
      point: tip!.path.contours[0]!.slice(0, 2),
      width: shaft!.stroke!.width,
    };
  };
  return { result, placed, line, evaluator, drawnAt, a, b, tweens: placed.actions as EndsTween[] };
}

const close = (have: readonly number[], want: readonly number[], digits = 9) =>
  have.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, digits));

describe.each(['ce', 'gl'] as const)('a tween that carries the ends of a line (%s)', (target) => {
  it('is measured when it starts: the line Manim draws between the glyphs then, and its centre', async () => {
    const { result, placed, line, evaluator, tweens, a, b } = await settled(target);
    expect(result.readiness).toEqual({ ready: true, pending: [] });
    expect(deriveAttachments(result.project, result.formulas)).toEqual([]);
    const [onto, away] = tweens as [EndsTween, EndsTween];
    // What Manim draws at 1 s: from under the first formula to the edge of the second.
    const from = lineEndInput(
      evaluator,
      target,
      { clipId: a.id, glyphs: 'all', anchor: 'down' },
      1,
    );
    const to = lineEndInput(evaluator, target, { clipId: b.id, glyphs: 'all', anchor: 'auto' }, 1);
    const expected = drawnEnds(target, null, manimLineEnds(target, from!, to!)!, 0.25);
    const drawn = onto.ends.drawn!;
    close(drawn.start, expected.start);
    close(drawn.end, expected.end);
    expect(drawn.trim).toBe(0);
    // The clip is then where Manim reads the centre of the arrow built there.
    const look = { ...line, strokeWidth: line.strokeWidth };
    close(drawn.center, buildLine(target, 'arrow', expected.start, expected.end, look).centre);
    const [first, second] = actionStates(placed);
    close(first!.to.position, drawn.center);
    // Two points are the two ends themselves.
    expect(away.ends.drawn).toMatchObject({ start: [-1, -2], end: [1, -2], trim: 0 });
    close(second!.to.position, away.ends.drawn!.center);
    expect(second!.to.strokeWidth).toBe(2);
  });

  it('is drawn where its tweens carry it: point by point on the way, then between its new ends', async () => {
    const { placed, line, drawnAt, tweens } = await settled(target);
    const [onto] = tweens as [EndsTween];
    const own = lineEndsAt(target, line, placed.initial);
    close(own.start, [-1, 3]);
    close(drawnAt(0.5).start, [-1, 3]);
    close(drawnAt(0.5).point, [1, 3]);
    const { start, end } = onto.ends.drawn!;
    // Half way, every point is half way.
    close(drawnAt(1.5).start, [(start[0] - 1) / 2, (start[1] + 3) / 2]);
    close(drawnAt(1.5).point, [(end[0] + 1) / 2, (end[1] + 3) / 2]);
    // There, and until the next one starts.
    close(drawnAt(2).start, start);
    close(drawnAt(2.9).point, end);
    expect(drawnAt(2.9).width).toBe(6);
    // The second: to two points, its stroke on the way to the one asked.
    expect(drawnAt(3.5).width).toBeCloseTo(4, 9);
    close(drawnAt(4.5).start, [-1, -2]);
    close(drawnAt(4.5).point, [1, -2]);
    expect(drawnAt(4.5).width).toBe(2);
  });

  it('is moved as it is by a plain tween after it', async () => {
    const { result, placed, tweens } = await settled(target);
    const [, away] = tweens as [EndsTween, EndsTween];
    const [cx, cy] = away.ends.drawn!.center;
    const moved = {
      ...result.project,
      clips: result.project.clips.map((c) =>
        c.id === placed.id
          ? {
              ...c,
              actions: [...c.actions, createTween(5, 1, { position: [cx + 1, cy + 2] as Vec2 })],
            }
          : c,
      ),
    };
    const own = exportEvaluator(moved, result.formulas)
      .evaluate(7)
      .filter((d) => d.clipId === placed.id);
    close(own[0]!.path.contours[0]!.slice(0, 2), [0, 0]);
    close(own[1]!.path.contours[0]!.slice(0, 2), [2, 0]);
    expect(own[0]!.stroke!.width).toBe(2);
  });

  it('is moved by its two ends when they are free: a place given to it moves them both', async () => {
    const { placed, line, tweens } = await settled(target);
    const [onto, away] = tweens as [EndsTween, EndsTween];
    const clip = structuredClone(placed);
    // Its second tween, between two points, is what places it at 4.5 s.
    expect(endsInEffect(clip, 4.5)?.id).toBe(away.id);
    expect(endsInEffect(clip, 0.5)).toBeNull();
    const [cx, cy] = away.ends.drawn!.center;
    patchKeyframe(clip, { kind: 'action', actionId: away.id }, { position: [cx + 1, cy - 2] });
    const moved = clip.actions.find((a) => a.id === away.id) as EndsTween;
    expect(moved.ends).toMatchObject({ start: { point: [0, -4] }, end: { point: [2, -4] } });
    close(moved.ends.drawn!.center, [cx + 1, cy - 2]);
    expect(moved.to.position).toBeUndefined();
    close(lineEndsInEffect(target, line, clip, 4.5).start, [0, -4]);
    // One with an end on glyphs stays: they place it.
    const before = structuredClone(onto.ends);
    patchKeyframe(clip, { kind: 'action', actionId: onto.id }, { position: [0, 0] });
    expect((clip.actions.find((a) => a.id === onto.id) as EndsTween).ends).toEqual(before);
  });
});
