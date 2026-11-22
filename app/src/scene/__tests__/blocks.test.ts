// @vitest-environment node
/* Appear and disappear blocks in the evaluator (docs/ARCHITECTURE.md §5 "Glyph lifetime", §7):
 * which stint of a glyph is on screen at t, what animates it, and how blocks combine with tweens,
 * the intro, relations and the scene end. The looks themselves are checked against Manim in
 * manim-blocks.test.ts. */
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createDisappear,
  createRelation,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Project,
} from '../../model';
import { createEvaluator, rateFunction } from '../index';
import { byKey, centerOf, plainClip, sceneWith, summary } from './sceneKit';

const errors = (project: Project) => validateProject(project).filter((i) => i.severity === 'error');

describe('appear and disappear blocks', () => {
  it('a glyph taken off comes back whole, where the tweens moved the clip meanwhile', async () => {
    const scene = await sceneWith({ a: 'abcd' });
    const clip = plainClip(scene, 'a', 0, 0, 8, {
      actions: [
        createDisappear(1, 'fade_out', [0]), // [1, 2)
        createTween(3, 1, { position: [2, 0] }, 'smooth'), // [3, 4)
        createAppear(5, 'fade_in', [0]), // [5, 6)
      ],
    });
    expect(errors(scene.project)).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    const key = `${clip.id}:0`;
    const at = (t: number) => byKey(ev.evaluate(t));
    const fade = rateFunction('smooth', 'ce');
    expect(at(1.5).get(key)!.fill!.opacity).toBeCloseTo(1 - fade(0.5), 9);
    for (const t of [2, 2.5, 3.5, 4.5, 4.99]) expect(at(t).has(key), `t=${t}`).toBe(false);
    expect(at(5.5).get(key)!.fill!.opacity).toBeCloseTo(fade(0.5), 9);
    const before = centerOf(at(0.5).get(key)!);
    const after = centerOf(at(6.5).get(key)!);
    expect(after[0]).toBeCloseTo(before[0] + 2, 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(at(6.5).get(key)!.fill!.opacity).toBe(1);
    // The other glyphs never left.
    expect([1, 2, 3].every((g) => at(3.5).has(`${clip.id}:${g}`))).toBe(true);
  });

  it('an appear runs alongside the intro on other glyphs, each with its own lag', async () => {
    const scene = await sceneWith({ a: 'abcd' });
    scene.f.a!.hiddenGlyphs = [2];
    const clip = plainClip(scene, 'a', 0, 0, 4, {
      intro: defaultIntro('fade_in'), // [0, 1), glyphs 0, 1, 3
      actions: [createAppear(0.5, 'create', [2])], // [0.5, 1.5)
    });
    expect(errors(scene.project)).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    const smooth = rateFunction('smooth', 'ce');
    const drawn = byKey(ev.evaluate(0.75));
    expect(drawn.get(`${clip.id}:0`)!.fill!.opacity).toBeCloseTo(smooth(0.75), 9);
    // Create on one glyph: lag 1 over a single glyph is no lag; a quarter of the outline.
    const written = drawn.get(`${clip.id}:2`)!;
    expect(written.fill!.opacity).toBe(1);
    const full = byKey(ev.evaluate(2)).get(`${clip.id}:2`)!;
    expect(written.path.contours.flat().length).toBeLessThan(full.path.contours.flat().length);
    expect(byKey(ev.evaluate(0.4)).has(`${clip.id}:2`)).toBe(false);
  });

  it('several blocks at once on different glyphs', async () => {
    const scene = await sceneWith({ a: 'abcd' });
    scene.f.a!.hiddenGlyphs = [3];
    const clip = plainClip(scene, 'a', 0, 0, 4, {
      actions: [
        createAppear(1, 'fade_in', [3], { easing: 'linear' }),
        createDisappear(1, 'fade_out', [0, 1], { easing: 'linear' }),
      ],
    });
    expect(errors(scene.project)).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    const drawn = byKey(ev.evaluate(1.25));
    expect(drawn.get(`${clip.id}:0`)!.fill!.opacity).toBeCloseTo(0.75, 9);
    expect(drawn.get(`${clip.id}:1`)!.fill!.opacity).toBeCloseTo(0.75, 9);
    expect(drawn.get(`${clip.id}:2`)!.fill!.opacity).toBe(1);
    expect(drawn.get(`${clip.id}:3`)!.fill!.opacity).toBeCloseTo(0.25, 9);
    expect(ev.evaluate(2.5).map((d) => d.glyph)).toEqual([2, 3]);
  });

  it('the scene end is inclusive: a disappear that ends there leaves nothing', async () => {
    const scene = await sceneWith({ a: 'abc' });
    scene.f.a!.hiddenGlyphs = [2];
    const clip = plainClip(scene, 'a', 0, 0, 3, {
      actions: [createDisappear(2, 'uncreate', [0]), createAppear(2, 'write', [2])],
    });
    expect(errors(scene.project)).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    expect(ev.evaluate(3).map((d) => d.key)).toEqual([`${clip.id}:1`, `${clip.id}:2`]);
    expect(ev.evaluate(3).every((d) => d.fill?.opacity === 1 && d.stroke === null)).toBe(true);
  });

  it('an appear whose easing ends at 0 leaves its start look, as Manim finish() does', async () => {
    const scene = await sceneWith({ a: 'ab' });
    scene.f.a!.hiddenGlyphs = [1];
    const clip = plainClip(scene, 'a', 0, 0, 5, {
      actions: [
        createAppear(1, 'fade_in', [1], { easing: 'there_and_back' }), // [1, 2)
        createDisappear(3, 'fade_out', [1], { easing: 'linear' }), // [3, 4)
      ],
    });
    const ev = createEvaluator(scene.project, scene.formulas);
    const key = `${clip.id}:1`;
    expect(byKey(ev.evaluate(1.5)).get(key)!.fill!.opacity).toBeCloseTo(1, 9);
    expect(byKey(ev.evaluate(2.5)).has(key)).toBe(false); // on screen, but faded out again
    // The disappear starts from the plain glyph (the outro looks do not chain).
    expect(byKey(ev.evaluate(3.25)).get(key)!.fill!.opacity).toBeCloseTo(0.75, 9);
  });

  it('a glyph a relation brought in can leave and come back', async () => {
    const scene = await sceneWith({ a: 'ab', b: 'xyz' });
    const [t1, t2] = scene.project.tracks;
    const a = createClip(scene.f.a!.id, t1!.id, 0, 5, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    const b = createClip(scene.f.b!.id, t2!.id, 0, 9, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      actions: [
        createDisappear(5, 'uncreate', [0]), // [5, 6)
        createAppear(7, 'write', [0]), // [7, 8)
      ],
    });
    const relation = createRelation(a.id, b.id, {
      offset: 3, // [3, 4)
      duration: 1,
      pairs: [{ from: [0], to: [0], style: 'transform' }],
    });
    scene.project.clips.push(a, b);
    scene.project.relations.push(relation);
    expect(errors(scene.project)).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    const key = `${b.id}:0`;
    const at = (t: number) => byKey(ev.evaluate(t));
    expect(at(2).has(key)).toBe(false);
    expect(at(3.5).has(key)).toBe(false); // drawn by the morph, under the source's key
    expect(at(3.5).has(`${a.id}:0`)).toBe(true);
    expect(at(4.5).get(key)!.fill!.opacity).toBe(1);
    expect(at(5.5).has(key)).toBe(true); // half uncreated
    expect(at(6.5).has(key)).toBe(false);
    expect(at(7.5).has(key)).toBe(true); // being written
    expect(at(8.5).get(key)!.fill!.opacity).toBe(1);
  });

  it('stays pure and draws every key at most once', async () => {
    const scene = await sceneWith({ a: 'abcd' });
    scene.f.a!.hiddenGlyphs = [3];
    plainClip(scene, 'a', 0, 0, 6, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
      actions: [
        createAppear(1.5, 'grow_from_center', [3]),
        createDisappear(1.5, 'shrink_to_center', [0, 1]),
        createAppear(3, 'draw_border_then_fill', [0, 1]),
      ],
    });
    expect(errors(scene.project)).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    const frames = [];
    for (let t = 0; t <= ev.duration; t += 1 / 30) frames.push(t);
    const first = frames.map((t) => summary(ev.evaluate(t)));
    frames.reverse().forEach((t, i) => {
      const drawn = ev.evaluate(t);
      const keys = drawn.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(summary(drawn)).toEqual(first[frames.length - 1 - i]);
    });
  });
});
