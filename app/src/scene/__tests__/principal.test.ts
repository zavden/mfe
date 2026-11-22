// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMorph, createRelation, type RelationStyle, type Target } from '../../model';
import { generatePython } from '../../export/codegen';
import { buildEvents, createEvaluator } from '../index';
import { byKey, centerOf, plainClip, sceneWith } from './sceneKit';

describe.each<Target>(['ce', 'gl'])('authored principal in %s preview and export', (target) => {
  it.each<RelationStyle>(['transform', 'fade'])(
    'animates the stored source through a relation with %s style',
    async (style) => {
      const scene = await sceneWith({ a: 'a+b', b: 'x' }, target);
      const a = plainClip(scene, 'a', 0, 0, 6);
      const b = plainClip(scene, 'b', 1, 1, 6);
      b.initial.position = [3, 0];
      scene.project.relations.push(
        createRelation(a.id, b.id, {
          offset: 1,
          easing: 'linear',
          style: 'copy',
          pairs: [{ from: [0, 2], to: [0], style, extras: 'copies', principal: 2 }],
        }),
      );
      const event = buildEvents(scene.project).find((e) => e.kind === 'transfer')!;
      expect(event.kind === 'transfer' && event.pairs[0]).toMatchObject({ principal: 2 });
      const evaluator = createEvaluator(scene.project, scene.formulas);
      const before = byKey(evaluator.evaluate(1.9));
      const during = evaluator.evaluate(2.5);
      expect(new Set(during.map((d) => d.key)).size).toBe(during.length);
      expect(centerOf(byKey(during).get(`${a.id}:0`)!)).toEqual(centerOf(before.get(`${a.id}:0`)!));
      expect(byKey(evaluator.evaluate(3.5)).has(`${a.id}:2`)).toBe(false);
      expect(byKey(evaluator.evaluate(3.5)).has(`${a.id}:0`)).toBe(true);
      const { code } = generatePython(scene.project, scene.formulas, {
        target,
        sceneName: 'Principal',
        indexing: 'positional',
        comments: false,
      });
      expect(code).toContain(
        target === 'ce'
          ? 'ReplacementTransform(a_g[0].copy(), b_g[0]'
          : 'TransformFromCopy(a_g[0], b_g[0]',
      );
      expect(code).toContain(
        style === 'fade'
          ? 'FadeTransform(a_g[2], b_g[0]'
          : target === 'ce'
            ? 'Transform(a_g[2], b_g[0]'
            : 'ReplacementTransform(a_g[2], b_g[0]',
      );
      expect(code).not.toContain('a_g[2].copy()');
    },
  );

  it('keeps a copied source stationary during a Morph and emits the same roles', async () => {
    const scene = await sceneWith({ a: 'a+b=c' }, target);
    const a = plainClip(scene, 'a', 0, 0, 6, {
      actions: [
        createMorph(2, {
          style: 'copy',
          easing: 'linear',
          pairs: [{ from: [0, 2], to: [4], style: 'transform', extras: 'copies', principal: 2 }],
        }),
      ],
    });
    const evaluator = createEvaluator(scene.project, scene.formulas);
    const before = byKey(evaluator.evaluate(1.9));
    const during = evaluator.evaluate(2.5);
    expect(new Set(during.map((d) => d.key)).size).toBe(during.length);
    expect(centerOf(byKey(during).get(`${a.id}:0`)!)).toEqual(centerOf(before.get(`${a.id}:0`)!));
    const after = byKey(evaluator.evaluate(3.5));
    expect(after.has(`${a.id}:0`)).toBe(true);
    expect(after.has(`${a.id}:2`)).toBe(false);
    expect(after.has(`${a.id}:4`)).toBe(true);
    const { code } = generatePython(scene.project, scene.formulas, {
      target,
      sceneName: 'Principal',
      indexing: 'positional',
      comments: false,
    });
    expect(code).toContain(
      target === 'ce'
        ? 'ReplacementTransform(a_g[0].copy(), a_g[4]'
        : 'TransformFromCopy(a_g[0], a_g[4]',
    );
    expect(code).not.toContain('a_g[2].copy()');
  });
});
