// @vitest-environment node
/* Emphasis blocks in the evaluator (ARCHITECTURE §6): an Indicate and a Wiggle move the glyphs
 * and leave them as they were; a Circumscribe, a Flash and a FocusOn draw a temporary mobject,
 * built from the glyphs as they are when the block starts, on the clip's layer (the disc over
 * everything), that no click selects and the geometry ignores. */
import { describe, expect, it } from 'vitest';
import { boxCenter, boxSize, contoursBox, unionBox } from '../../geom';
import { createEmphasis, createTween } from '../../model';
import { createEvaluator } from '../index';
import { byKey, centerOf, plainClip, sceneWith } from './sceneKit';

const close = (a: readonly number[], b: readonly number[], digits = 6) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
};

describe('emphasis blocks', () => {
  it.each(['ce', 'gl'] as const)(
    'keeps finite signed Circumscribe spans out of persisted shape validation (%s)',
    async (target) => {
      const scene = await sceneWith({ a: 'x' }, target);
      const clip = plainClip(scene, 'a', 0, 0, 6);
      clip.actions.push(createEmphasis(1, 'circumscribe', 'all', { buff: -0.5, timeWidth: 1 }));
      const evaluator = createEvaluator(scene.project, scene.formulas);
      const glyphs = evaluator.measure(clip.id, 'all', 1)!.size;
      const frame = evaluator.evaluate(1.5).find((drawable) => drawable.role === 'temp');
      expect(frame).toBeDefined();
      const size = boxSize(contoursBox(frame!.path.contours));
      expect(size[0]).toBeCloseTo(Math.abs(glyphs.maxX - glyphs.minX - 1), 9);
      expect(size[1]).toBeCloseTo(Math.abs(glyphs.maxY - glyphs.minY - 1), 9);
    },
  );

  it('draws a Circumscribe frame as a temporary drawable of the clip, within its window only', async () => {
    const scene = await sceneWith({ a: 'a+b' });
    const clip = plainClip(scene, 'a', 0, 0, 6); // the first track: in front, z 1
    const block = createEmphasis(1, 'circumscribe', [0, 1]);
    clip.actions.push(block);
    const ev = createEvaluator(scene.project, scene.formulas);
    const temps = (t: number) => ev.evaluate(t).filter((d) => d.role === 'temp');
    expect(temps(0.9)).toEqual([]);
    expect(temps(2)).toEqual([]);
    const [frame, ...rest] = temps(1.5);
    expect(rest).toEqual([]);
    expect(frame).toMatchObject({
      key: `emphasis:${block.id}:frame`,
      clipId: clip.id,
      glyph: -1,
      z: 1,
      role: 'temp',
      partial: true,
      fill: null,
      stroke: { color: '#FFFF00', opacity: 1, width: 4 },
    });
    // Half way, with the default time width 0.3, the lit stretch is [0.35, 0.65] of the frame,
    // which runs from the upper right corner counter-clockwise: the lower part of the left side
    // and the left part of the bottom, on the glyphs' box plus the gap.
    const glyphs = ev.evaluate(1.5).filter((d) => d.role === 'object');
    const target = unionBox(glyphs.map((d) => contoursBox(d.path.contours)));
    const lit = contoursBox(frame!.path.contours);
    expect(lit.minX).toBeCloseTo(target.minX - 0.1, 6);
    expect(lit.minY).toBeCloseTo(target.minY - 0.1, 6);
    expect(lit.maxX).toBeLessThan(target.maxX);
    expect(lit.maxY).toBeLessThan(target.maxY);
    // The geometry knows the clip alone.
    expect(ev.geometry(1.5).map((g) => g.clipId)).toEqual([clip.id]);
  });

  it('measures the glyphs where they are when the block starts: a Flash stays put while a tween moves them', async () => {
    const scene = await sceneWith({ a: 'ab' });
    const clip = plainClip(scene, 'a', 0, 0, 6);
    clip.actions.push(createTween(1, 1, { position: [3, 0] }), createEmphasis(1, 'flash', 'all'));
    const ev = createEvaluator(scene.project, scene.formulas);
    const before = ev.evaluate(1).filter((d) => d.role === 'object');
    const start = boxCenter(unionBox(before.map((d) => contoursBox(d.path.contours))));
    // At the middle of a smooth Flash every line is whole (ManimCE's time width 1).
    const lines = ev.evaluate(1.5).filter((d) => d.role === 'temp');
    expect(lines).toHaveLength(12);
    const union = unionBox(lines.map((d) => contoursBox(d.path.contours)));
    close(boxCenter(union), start, 6);
    close(boxSize(union), [0.6, 0.6], 6);
    expect(lines[0]).toMatchObject({ partial: false, stroke: { color: '#FFFF00', width: 3 } });
    // The glyphs themselves have moved on.
    const moved = ev.evaluate(1.5).filter((d) => d.role === 'object');
    expect(centerOf(moved[0]!)[0]).toBeGreaterThan(centerOf(before[0]!)[0] + 1);
  });

  it('puts a FocusOn disc over every track, shrinking onto the glyphs while its fill rises', async () => {
    const scene = await sceneWith({ a: 'x' });
    const clip = plainClip(scene, 'a', 1, 0, 6);
    clip.initial = { ...clip.initial, position: [2, 1] };
    clip.actions.push(createEmphasis(1, 'focus_on', 'all', { duration: 2 }));
    const ev = createEvaluator(scene.project, scene.formulas);
    const glyph = ev.evaluate(1).find((d) => d.role === 'object')!;
    const point = centerOf(glyph);
    const [disc] = ev.evaluate(2).filter((d) => d.role === 'temp'); // half way: smooth(0.5) = 0.5
    expect(disc).toMatchObject({
      z: 2,
      fill: { color: '#888888', opacity: 0.1 },
      stroke: null,
      partial: false,
    });
    const box = contoursBox(disc!.path.contours);
    // 1920×1080: the frame is 14.22 wide, the starting radius 7.11 + 4; half of it is left.
    close(boxSize(box), [(64 / 9 + 4) / 1, (64 / 9 + 4) / 1], 6);
    close(boxCenter(box), [point[0] / 2, point[1] / 2], 6);
    expect(ev.evaluate(3).filter((d) => d.role === 'temp')).toEqual([]);
  });

  it.each([
    ['ce', { width: 320, height: 320 }, 4 + 4],
    ['gl', { width: 320, height: 320 }, 4 + 4],
    ['ce', { width: 1080, height: 1920 }, 2.25 + 4],
    ['gl', { width: 1080, height: 1920 }, 2.25 + 4],
  ] as const)(
    'sizes a FocusOn disc by the frame of the video being made, not by the project’s (%s, %o)',
    async (target, frame, radius) => {
      // Manim starts the disc at frame_x_radius + frame_y_radius, and its frame is the output's:
      // 8 tall and as wide as the video's pixels make it. The project here is 1920×1080.
      const scene = await sceneWith({ a: 'x' }, target);
      const clip = plainClip(scene, 'a', 1, 0, 6);
      clip.actions.push(createEmphasis(1, 'focus_on', 'all', { duration: 2 }));
      const ev = createEvaluator(scene.project, scene.formulas, { frame });
      const [disc] = ev.evaluate(2).filter((d) => d.role === 'temp'); // half way: half is left
      close(boxSize(contoursBox(disc!.path.contours)), [radius, radius], 6);
    },
  );

  it('an Indicate swells and recolours its glyphs about their centre and leaves them as they were', async () => {
    const scene = await sceneWith({ a: 'ab' });
    const clip = plainClip(scene, 'a', 0, 0, 6);
    clip.actions.push(createEmphasis(1, 'indicate', [0]));
    const ev = createEvaluator(scene.project, scene.formulas);
    const at = (t: number, g: number) => byKey(ev.evaluate(t)).get(`${clip.id}:${g}`)!;
    const before = at(0.5, 0);
    const size = boxSize(contoursBox(before.path.contours));
    const mid = at(1.5, 0); // there_and_back(0.5) = 1
    expect(mid.role).toBe('object');
    close(boxSize(contoursBox(mid.path.contours)), [size[0] * 1.2, size[1] * 1.2]);
    close(centerOf(mid), centerOf(before));
    expect(mid.fill).toEqual({ color: '#FFFF00', opacity: 1 });
    expect(at(1.5, 1).fill).toEqual({ color: '#FFFFFF', opacity: 1 });
    expect(ev.evaluate(1.5).some((d) => d.role === 'temp')).toBe(false);
    const after = at(2.5, 0);
    close(boxSize(contoursBox(after.path.contours)), size);
    expect(after.fill).toEqual({ color: '#FFFFFF', opacity: 1 });
  });

  it('with the pause easing an Indicate holds the top for the middle third', async () => {
    const scene = await sceneWith({ a: 'x' });
    const clip = plainClip(scene, 'a', 0, 0, 6);
    clip.actions.push(
      createEmphasis(1, 'indicate', 'all', { easing: 'there_and_back_with_pause', scale: 1.5 }),
    );
    const ev = createEvaluator(scene.project, scene.formulas);
    const width = (t: number) =>
      boxSize(contoursBox(byKey(ev.evaluate(t)).get(`${clip.id}:0`)!.path.contours))[0];
    const plain = width(0.5);
    expect(width(1.4)).toBeCloseTo(plain * 1.5, 6);
    expect(width(1.6)).toBeCloseTo(plain * 1.5, 6);
    expect(width(1.2)).toBeLessThan(plain * 1.5);
    expect(width(2)).toBeCloseTo(plain, 6);
  });

  it('a Wiggle turns its glyphs and leaves them as they were', async () => {
    const scene = await sceneWith({ a: 'ab' });
    const clip = plainClip(scene, 'a', 0, 0, 6);
    clip.actions.push(createEmphasis(1, 'wiggle', [0], { duration: 2 }));
    const ev = createEvaluator(scene.project, scene.formulas);
    const at = (t: number, g: number) => byKey(ev.evaluate(t)).get(`${clip.id}:${g}`)!;
    const before = at(0.5, 0).path.contours;
    const mid = at(1.3, 0).path.contours;
    expect(mid).not.toEqual(before);
    expect(at(1.3, 1).path.contours).toEqual(at(0.5, 1).path.contours);
    expect(at(3.5, 0).path.contours).toEqual(before);
  });

  it('draws no effect for a clip on a hidden track', async () => {
    const scene = await sceneWith({ a: 'x' });
    scene.project.tracks[0]!.hidden = true;
    const clip = plainClip(scene, 'a', 0, 0, 6);
    clip.actions.push(createEmphasis(1, 'circumscribe', 'all'));
    expect(createEvaluator(scene.project, scene.formulas).evaluate(1.5)).toEqual([]);
  });
});
