// @vitest-environment node
/* Where ManimCE and ManimGL differ, and the Phase 3 acceptance scenario. */
import { describe, expect, it } from 'vitest';
import { createTween, defaultIntro, defaultOutro } from '../../model';
import { createEvaluator } from '../index';
import { byKey, centerOf, plainClip, sceneWith, summary } from './sceneKit';

describe('CE vs GL', () => {
  it('Write traces outlines per glyph in CE, in the formula colour in GL', async () => {
    for (const [target, expected] of [
      ['ce', '#FF0000'],
      ['gl', '#FFFFFF'],
    ] as const) {
      const scene = await sceneWith({ a: 'ab' }, target);
      scene.f.a!.glyphColors = { '0': '#FF0000' };
      const clip = plainClip(scene, 'a', 0, 0, 3, { intro: defaultIntro('write') });
      const ev = createEvaluator(scene.project, scene.formulas);
      // Early in the intro glyph 0 is still in its outline stage.
      const d = byKey(ev.evaluate(0.2)).get(`${clip.id}:0`)!;
      expect(d.fill).toBeNull();
      expect(d.stroke).toMatchObject({ color: expected, width: 2 });
    }
  });

  it('DrawBorderThenFill traces per glyph in both', async () => {
    const scene = await sceneWith({ a: 'ab' }, 'gl');
    scene.f.a!.glyphColors = { '0': '#FF0000' };
    const clip = plainClip(scene, 'a', 0, 0, 3, { intro: defaultIntro('draw_border_then_fill') });
    const d = byKey(createEvaluator(scene.project, scene.formulas).evaluate(0.2)).get(
      `${clip.id}:0`,
    )!;
    expect(d.stroke).toMatchObject({ color: '#FF0000', width: 2 });
  });

  it('uses the formula colour override for the GL outline', async () => {
    const scene = await sceneWith({ a: 'ab' }, 'gl');
    const clip = plainClip(scene, 'a', 0, 0, 3, { intro: defaultIntro('write') });
    clip.initial.color = '#00FF00';
    const d = byKey(createEvaluator(scene.project, scene.formulas).evaluate(0.2)).get(
      `${clip.id}:0`,
    )!;
    expect(d.stroke!.color).toBe('#00FF00');
  });

  it('staggers GL after the formula group: the first glyph waits one lag slot', async () => {
    const draws = async (target: 'ce' | 'gl') => {
      const scene = await sceneWith({ a: 'abcde' }, target);
      const clip = plainClip(scene, 'a', 0, 0, 3, {
        intro: { ...defaultIntro('create'), lagRatio: 1 },
      });
      const ev = createEvaluator(scene.project, scene.formulas);
      // Create with lag 1: glyph k is drawn during [k, k+1] / n (n = 5 in CE, 6 in GL).
      return [0.05, 0.12, 0.25].map((t) => byKey(ev.evaluate(t)).has(`${clip.id}:0`));
    };
    expect(await draws('ce')).toEqual([true, true, true]);
    expect(await draws('gl')).toEqual([false, false, true]); // GL: glyph 0 starts at 1/6
  });

  it('scales the faded-in start state by `scale` in CE and by 1/scale in GL', async () => {
    const widthAt = async (target: 'ce' | 'gl') => {
      const scene = await sceneWith({ a: 'ab' }, target);
      const clip = plainClip(scene, 'a', 0, 0, 3, {
        intro: { ...defaultIntro('fade_in'), easing: 'linear', scale: 2 },
      });
      const ev = createEvaluator(scene.project, scene.formulas);
      const at = (t: number) => {
        const c = byKey(ev.evaluate(t)).get(`${clip.id}:0`)!.path.contours[0]!;
        return Math.abs(c[6]! - c[0]!);
      };
      return at(0.0001) / at(1);
    };
    expect(await widthAt('ce')).toBeCloseTo(2, 2);
    expect(await widthAt('gl')).toBeCloseTo(0.5, 2);
  });

  it('GrowFromCenter and ShrinkToCenter agree between targets', async () => {
    const run = async (target: 'ce' | 'gl') => {
      const scene = await sceneWith({ a: 'ab' }, target);
      plainClip(scene, 'a', 0, 0, 3, {
        intro: { ...defaultIntro('grow_from_center'), easing: 'linear' },
        outro: { ...defaultOutro('shrink_to_center'), easing: 'linear' },
      });
      const ev = createEvaluator(scene.project, scene.formulas);
      return [0.5, 2.5].map((t) =>
        summary(ev.evaluate(t)).map((d) => ({
          z: d.z,
          fill: d.fill,
          stroke: d.stroke,
          path: d.path,
        })),
      );
    };
    expect(await run('ce')).toEqual(await run('gl'));
  });
});

describe('Phase 3 acceptance: Write on one track, move + rotate on another', () => {
  it('playback frames and scrubbed frames are identical', async () => {
    const scene = await sceneWith({ a: 'a+b=c', b: 'xy' });
    plainClip(scene, 'a', 0, 0, 4, { intro: defaultIntro('write') });
    plainClip(scene, 'b', 1, 0.5, 4, {
      intro: defaultIntro('none'),
      actions: [createTween(1, 1.5, { position: [3, 1.5], rotation: 90 })],
    });
    const playback = createEvaluator(scene.project, scene.formulas);
    const fps = 60;
    const frames = Array.from({ length: Math.round(4 * fps) }, (_, k) => k / fps);
    const played = frames.map((t) => summary(playback.evaluate(t)));

    // Scrub backwards and in a scattered order on a fresh evaluator.
    const scrub = createEvaluator(scene.project, scene.formulas);
    const order = frames.map((_, k) => (k * 37) % frames.length);
    for (const k of order) expect(summary(scrub.evaluate(frames[k]!))).toEqual(played[k]);
    for (let k = frames.length - 1; k >= 0; k -= 11) {
      expect(summary(scrub.evaluate(frames[k]!))).toEqual(played[k]);
    }

    // The two clips behave as described.
    const ids = scene.project.clips.map((c) => c.id);
    const at = (t: number) => byKey(playback.evaluate(t));
    expect(at(0.25).get(`${ids[0]}:0`)!.stroke).not.toBeNull(); // being written
    expect(at(1.2).get(`${ids[0]}:0`)!.stroke).toBeNull(); // written
    const x = (t: number) => centerOf(at(t).get(`${ids[1]}:0`)!)[0];
    expect(x(2.5)).toBeGreaterThan(x(1)); // the second formula moves
    expect(x(1.2)).toBeCloseTo(x(1), 9); // …only during its tween [1.5, 3]
  });

  it('evaluates a few hundred glyphs at video rates', async () => {
    const scene = await sceneWith({ a: 'abcdefghijklmnopqrstuvwxyz'.repeat(12) });
    plainClip(scene, 'a', 0, 0, 5, {
      intro: { ...defaultIntro('write'), duration: 2 },
      actions: [createTween(2, 2, { position: [1, 1], rotation: 30 })],
    });
    const ev = createEvaluator(scene.project, scene.formulas);
    const frames = 240;
    const start = performance.now();
    let drawn = 0;
    for (let k = 0; k < frames; k++) drawn += ev.evaluate((k / frames) * 5).length;
    const ms = (performance.now() - start) / frames;
    expect(drawn).toBeGreaterThan(0);
    // ~312 glyphs; a frame should cost far less than the 16 ms of a 60 Hz refresh.
    expect(ms).toBeLessThan(8);
  });
});
