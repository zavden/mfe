// @vitest-environment node
/* Part transforms drawn by the evaluator: the chosen glyphs move, scale and recolour relative to
 * where they are, follow the whole-formula tweens afterwards, and a relation morphs them from
 * where they ended up. */
import { describe, expect, it } from 'vitest';
import { boxSize, contoursBox } from '../../geom';
import { createPartTransform, createRelation, createTween } from '../../model';
import { createEvaluator } from '../index';
import { byKey, centerOf, plainClip, sceneWith } from './sceneKit';

const close = (a: readonly number[], b: readonly number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
};

describe('part transforms', () => {
  it('moves only the chosen glyphs, which then follow the whole-formula tween', async () => {
    const scene = await sceneWith({ a: 'a+b' });
    const clip = plainClip(scene, 'a', 0, 0, 6);
    clip.actions.push(
      createPartTransform(1, [2], { duration: 1, shift: [1, 0.5], scale: 2 }),
      createTween(3, 1, { position: [2, 0], scale: 0.5 }),
    );
    const ev = createEvaluator(scene.project, scene.formulas);
    const at = (t: number, g: number) => byKey(ev.evaluate(t)).get(`${clip.id}:${g}`)!;
    const c2 = centerOf(at(0.5, 2));
    const c0 = centerOf(at(0.5, 0));
    const size2 = boxSize(contoursBox(at(0.5, 2).path.contours));

    // Half way (linear easing is not the default: smooth): the centre moves with the eased shift
    // while the other glyphs stay put.
    const mid = centerOf(at(1.5, 2));
    close(mid, [c2[0] + 0.5, c2[1] + 0.25]);
    close(centerOf(at(1.5, 0)), c0);
    close(boxSize(contoursBox(at(1.5, 2).path.contours)), [size2[0] * 1.5, size2[1] * 1.5]);

    // Done: shifted by (1, 0.5) and twice the size about its own centre.
    close(centerOf(at(2.5, 2)), [c2[0] + 1, c2[1] + 0.5]);
    close(boxSize(contoursBox(at(2.5, 2).path.contours)), [size2[0] * 2, size2[1] * 2]);

    // After the tween (scale 0.5 about the formula origin, then moved to (2, 0)) the part keeps
    // its place in the formula: every scene point p became 0.5 · p + (2, 0).
    close(centerOf(at(5, 2)), [0.5 * (c2[0] + 1) + 2, 0.5 * (c2[1] + 0.5)]);
    close(centerOf(at(5, 0)), [0.5 * c0[0] + 2, 0.5 * c0[1]]);
    close(boxSize(contoursBox(at(5, 2).path.contours)), [size2[0], size2[1]]);
  });

  it('recolours and fades the part, leaving the other glyphs alone', async () => {
    const scene = await sceneWith({ a: 'ab' });
    const clip = plainClip(scene, 'a', 0, 0, 4);
    clip.actions.push(
      createPartTransform(1, [0], {
        duration: 1,
        color: '#FF0000',
        opacity: 0.5,
        easing: 'linear',
      }),
    );
    const ev = createEvaluator(scene.project, scene.formulas);
    const at = (t: number, g: number) => byKey(ev.evaluate(t)).get(`${clip.id}:${g}`)!;
    expect(at(1.5, 0).fill).toEqual({ color: '#FF8080', opacity: 0.75 });
    expect(at(2.5, 0).fill).toEqual({ color: '#FF0000', opacity: 0.5 });
    expect(at(2.5, 1).fill).toEqual({ color: '#FFFFFF', opacity: 1 });
  });

  it('starts a relation morph from where the part ended up', async () => {
    const scene = await sceneWith({ a: 'ab', b: 'xy' });
    const ca = plainClip(scene, 'a', 0, 0, 4);
    const cb = plainClip(scene, 'b', 1, 3, 5);
    ca.actions.push(createPartTransform(1, [0], { duration: 1, shift: [0, 1.5] }));
    scene.project.relations.push(
      createRelation(ca.id, cb.id, {
        offset: 0,
        duration: 1,
        pairs: [{ from: [0], to: [0], style: null }],
      }),
    );
    const ev = createEvaluator(scene.project, scene.formulas);
    const moved = centerOf(byKey(ev.evaluate(2.5)).get(`${ca.id}:0`)!);
    const original = centerOf(byKey(ev.evaluate(0.5)).get(`${ca.id}:0`)!);
    close(moved, [original[0], original[1] + 1.5]);
    // The morph piece carries the source glyph's key and begins at the moved position.
    const piece = byKey(ev.evaluate(3.0001)).get(`${ca.id}:0`)!;
    const start = centerOf(piece);
    expect(Math.abs(start[0] - moved[0])).toBeLessThan(0.01);
    expect(Math.abs(start[1] - moved[1])).toBeLessThan(0.01);
  });
});
