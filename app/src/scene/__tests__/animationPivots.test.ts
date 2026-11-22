// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  LATEX_BACKEND_VERSION,
  renderKey,
  renderRequestFor,
  resolveFormula,
  toSnapshot,
  type FormulaRender,
} from '../../engine';
import { contoursBox, unionBox } from '../../geom';
import {
  createAppear,
  createClip,
  createEmptyProject,
  createFormula,
  createPartTransform,
  defaultIntro,
  defaultOutro,
  type Target,
} from '../../model';
import { createEvaluator } from '..';
import { criticalPoint } from '../measure';
import { contoursOf, type Pt } from './manimFixture';
import ce from './fixtures/manim-boxes-ce.json';
import gl from './fixtures/manim-boxes-gl.json';

function curved(target: Target) {
  const fx = target === 'ce' ? ce : gl;
  const project = createEmptyProject();
  project.meta.target = target;
  const formula = createFormula({ source: fx.formula });
  const glyphs = fx.transforms
    .find((t) => t.name === 'as-is')!
    .glyphs.map((points, index) => {
      const contours = contoursOf(points as Pt[], target);
      return {
        index,
        label: 'x2+bx+c'[index]!,
        kind: 'char' as const,
        contours,
        bbox: contoursBox(contours),
      };
    });
  const render: FormulaRender = {
    key: renderKey(renderRequestFor(formula, project.meta, 'auto'), 'latex', LATEX_BACKEND_VERSION),
    backend: 'latex',
    exact: true,
    target,
    fontSize: 48,
    glyphs,
    bbox: unionBox(glyphs.map((g) => g.bbox)),
    warnings: [],
  };
  formula.snapshot = toSnapshot(render);
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 5, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  clip.initial.scale = 3;
  clip.initial.rotation = target === 'ce' ? 40 : 60;
  project.clips.push(clip);
  return { project, clip, formulas: new Map([[formula.id, resolveFormula(formula, render)]]) };
}

describe.each(['ce', 'gl'] as const)('%s native curved-glyph pivots', (target) => {
  it.each([[[3]], [[3, 6]]])(
    'scales selected glyphs %j about their native critical centre',
    (selected) => {
      const s = curved(target);
      const before = createEvaluator(s.project, s.formulas);
      const pivot = criticalPoint(before.measure(s.clip.id, selected, 1)!, [0, 0]);
      const initial = before.evaluate(1).filter((d) => selected.includes(d.glyph));
      s.clip.actions.push(
        createPartTransform(1, selected, { duration: 1, scale: 3, easing: 'linear' }),
      );
      const ev = createEvaluator(s.project, s.formulas);
      for (const time of [1.5, 2.5]) {
        const factor = time < 2 ? 2 : 3;
        for (const d of ev.evaluate(time).filter((d) => selected.includes(d.glyph))) {
          const source = initial.find((g) => g.glyph === d.glyph)!;
          d.path.contours.forEach((contour, k) =>
            contour.forEach((v, i) => {
              expect(v).toBeCloseTo(
                pivot[i % 2]! + factor * (source.path.contours[k]![i]! - pivot[i % 2]!),
                8,
              );
            }),
          );
        }
      }
    },
  );

  it('grows a curved glyph about the same critical centre used by its Manim group', () => {
    const s = curved(target);
    const before = createEvaluator(s.project, s.formulas);
    const pivot = criticalPoint(before.measure(s.clip.id, [3], 0)!, [0, 0]);
    const source = before.points(s.clip.id, [3], 0)!;
    s.clip.actions.push(
      createAppear(1, 'grow_from_center', [3], { duration: 1, easing: 'linear' }),
    );
    const d = createEvaluator(s.project, s.formulas)
      .evaluate(1.5)
      .find((g) => g.glyph === 3)!;
    const original = contoursOf(
      Array.from(
        { length: source[0]!.placed.points.length / 2 },
        (_, i) => [source[0]!.placed.points[i * 2]!, source[0]!.placed.points[i * 2 + 1]!] as Pt,
      ),
      target,
    );
    d.path.contours.forEach((c, k) =>
      c.forEach((v, i) => {
        expect(v).toBeCloseTo(pivot[i % 2]! + 0.5 * (original[k]![i]! - pivot[i % 2]!), 5);
      }),
    );
  });
});
