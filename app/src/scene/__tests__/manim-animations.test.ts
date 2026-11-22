// @vitest-environment node
/* The intro/outro animations against ManimCE 0.22.1 and ManimGL 1.7.2: fixtures/manim/gen_anim.py
 * builds a five-glyph "formula" of polygons, runs the real Animation objects (`begin()`,
 * `interpolate(alpha)`) and records every glyph's curve anchors, fill and stroke. The evaluator
 * must reproduce them at the same alphas. */
import { describe, expect, it } from 'vitest';
import type { ResolvedFormula } from '../../engine';
import { toSnapshot } from '../../engine';
import {
  createClip,
  createEmptyProject,
  createFormula,
  defaultIntro,
  defaultOutro,
  type Easing,
  type IntroKind,
  type OutroKind,
  type Project,
  type Target,
} from '../../model';
import { createEvaluator } from '../index';
import { anchorsOf, compareColor, isDegenerate, polygonRender, type Curve } from './manimFixture';
import animCe from './fixtures/manim-anim-ce.json';
import animGl from './fixtures/manim-anim-gl.json';

interface FixtureGlyph {
  curves: number[][];
  fill: number[];
  stroke: number[];
  width: number;
}
interface FixtureCase {
  name: string;
  kind: string;
  easing: string;
  lag: number | null;
  params: { shift?: [number, number]; scale?: number };
  samples: { alpha: number; glyphs: FixtureGlyph[] }[];
}
interface Fixture {
  lib: 'ce' | 'gl';
  polygons: [number, number][][];
  colors: string[];
  cases: FixtureCase[];
}

const INTROS = new Set(['write', 'draw_border_then_fill', 'create', 'fade_in', 'grow_from_center']);

function buildScene(fixture: Fixture, test: FixtureCase) {
  const render = polygonRender(fixture);
  const { glyphs } = render;
  const project: Project = createEmptyProject();
  project.meta.target = fixture.lib as Target;
  const formula = createFormula({
    name: 'f',
    source: 'fixture',
    color: '#FFFFFF',
    glyphColors: Object.fromEntries(fixture.colors.map((c, i) => [String(i), c.toUpperCase()])),
    snapshot: toSnapshot(render),
  });
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 3);
  const isIntro = INTROS.has(test.kind);
  const spec = {
    easing: test.easing as Easing,
    lagRatio: test.lag,
    shift: test.params.shift ?? [0, 0],
    scale: test.params.scale ?? 1,
    duration: 1,
  };
  if (isIntro) {
    clip.intro = { ...defaultIntro(test.kind as IntroKind), ...spec };
    clip.outro = defaultOutro('none');
  } else {
    clip.intro = defaultIntro('none');
    clip.outro = { ...defaultOutro(test.kind as OutroKind), ...spec };
  }
  project.formulas.push(formula);
  project.clips.push(clip);
  const resolved: ResolvedFormula = {
    formula,
    render,
    canonToRender: glyphs.map((g) => g.index),
    confidence: 1,
  };
  return { project, formulas: new Map([[formula.id, resolved]]), isIntro, clip };
}

/** What Manim would visibly draw for a glyph: has fill with area, or a stroke with length. */
function manimVisible(g: FixtureGlyph): boolean {
  const live = g.curves.filter((c) => !isDegenerate(c as Curve));
  if (live.length === 0) return false;
  return g.fill[3]! > 1e-9 || (g.width > 1e-6 && g.stroke[3]! > 1e-9);
}

describe.each([animCe, animGl] as unknown as Fixture[])('Manim $lib animations', (fixture) => {
  for (const test of fixture.cases) {
    it(`${test.name}`, () => {
      const { project, formulas, isIntro } = buildScene(fixture, test);
      const evaluator = createEvaluator(project, formulas);
      const clipId = project.clips[0]!.id;
      for (const sample of test.samples) {
        // Intro: runs over [0, 1]. Outro: runs over [2, 3]; the scene ends at 3 (inclusive).
        const t = isIntro ? sample.alpha : 2 + sample.alpha;
        const drawn = evaluator.evaluate(t);
        sample.glyphs.forEach((expected, glyph) => {
          const where = `${test.name} α=${sample.alpha} glyph ${glyph}`;
          const d = drawn.find((x) => x.key === `${clipId}:${glyph}`);
          if (!manimVisible(expected)) {
            expect(d, `${where}: invisible in Manim`).toBeUndefined();
            return;
          }
          expect(d, `${where}: visible in Manim`).toBeDefined();
          if (!d) return;

          // Geometry: anchors of the non-degenerate curves, in order.
          const want = (expected.curves as Curve[]).filter((c) => !isDegenerate(c));
          const have = anchorsOf(d.path.contours).filter((c) => !isDegenerate(c));
          expect(have, `${where}: curve count`).toHaveLength(want.length);
          have.forEach((curve, k) =>
            curve.forEach((v, j) =>
              expect(v, `${where}: curve ${k}[${j}]`).toBeCloseTo(want[k]![j]!, 4),
            ),
          );

          // Fill.
          const fillOpacity = expected.fill[3]!;
          if (fillOpacity > 1e-9) {
            expect(d.fill, `${where}: fill`).not.toBeNull();
            expect(d.fill!.opacity, `${where}: fill opacity`).toBeCloseTo(fillOpacity, 5);
            compareColor(d.fill!.color, expected.fill, `${where}: fill`);
          } else {
            expect(d.fill, `${where}: no fill`).toBeNull();
          }

          // Stroke.
          if (expected.width > 1e-6 && expected.stroke[3]! > 1e-9) {
            expect(d.stroke, `${where}: stroke`).not.toBeNull();
            expect(d.stroke!.width, `${where}: stroke width`).toBeCloseTo(expected.width, 5);
            expect(d.stroke!.opacity, `${where}: stroke opacity`).toBeCloseTo(
              expected.stroke[3]!,
              5,
            );
            compareColor(d.stroke!.color, expected.stroke, `${where}: stroke`);
          } else {
            expect(d.stroke, `${where}: no stroke`).toBeNull();
          }
        });
      }
    });
  }
});
