// @vitest-environment node
/* The looks and the morph on glyphs with a style of their own, against ManimCE and ManimGL:
 * fixtures/manim/gen_strokes.py builds a "formula" of a stroked circle, a filled polygon like a
 * glyph, a rectangle painted both ways, a thick line, a dot and a box with no stroke at all, runs
 * the real intros and outros (`begin()`, `interpolate(alpha)`) and records every member's curve
 * anchors, fill and stroke; then transforms between members of different styles, with every family
 * member's points. The evaluator must reproduce them at the same alphas: the paints of every
 * animation end at the glyph's own style, and a morph interpolates the stroke as it does the fill. */
import { describe, expect, it } from 'vitest';
import { contoursBox, parseColor, translate, unionBox } from '../../geom';
import type { FormulaRender, Glyph, ResolvedFormula } from '../../engine';
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
  type RelationStyle,
  type Target,
} from '../../model';
import { rateFunction } from '../easing';
import { createEvaluator } from '../index';
import {
  createLook,
  drawBorderThenFillLook,
  fadeInLook,
  placed,
  type LookInput,
} from '../anim/looks';
import { buildMorph, morphDrawables, type MorphGlyph } from '../anim/morph';
import {
  anchorsOf,
  contoursOf,
  expectPaints,
  isDegenerate,
  manimCurves,
  ourCurves,
  type Curve,
  type Pt,
} from './manimFixture';
import strokesCe from './fixtures/manim-strokes-ce.json';
import strokesGl from './fixtures/manim-strokes-gl.json';

interface FixtureGlyph {
  name: string;
  color: string;
  fillOpacity: number;
  strokeWidth: number;
  strokeOpacity: number;
  points: Pt[];
}
interface Sampled {
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
  samples: { alpha: number; glyphs: Sampled[] }[];
}
interface FixturePiece {
  points: Pt[];
  fill: number[];
  stroke: number[];
  width: number;
}
interface FixtureMorph {
  name: string;
  style: RelationStyle;
  easing: string;
  src: number;
  dst: number;
  samples: { alpha: number; pieces: FixturePiece[] }[];
}
interface Fixture {
  lib: Target;
  glyphs: FixtureGlyph[];
  cases: FixtureCase[];
  morphs: FixtureMorph[];
}

const INTROS = new Set(['write', 'draw_border_then_fill', 'create', 'fade_in', 'grow_from_center']);

/** The fixture's members as a render: their contours as built, each with its own style. */
function glyphsOf(fixture: Fixture): Glyph[] {
  return fixture.glyphs.map((g, index) => {
    const contours = contoursOf(g.points, fixture.lib);
    return {
      index,
      label: g.name,
      kind: 'char',
      contours,
      bbox: contoursBox(contours),
      style: {
        fillOpacity: g.fillOpacity,
        strokeWidth: g.strokeWidth,
        strokeOpacity: g.strokeOpacity,
      },
    };
  });
}

function buildScene(fixture: Fixture, test: FixtureCase) {
  const glyphs = glyphsOf(fixture);
  const render: FormulaRender = {
    key: 'fixture',
    backend: 'mathjax',
    exact: false,
    target: fixture.lib,
    fontSize: 48,
    glyphs,
    bbox: unionBox(glyphs.map((g) => g.bbox)),
    warnings: [],
  };
  const project: Project = createEmptyProject();
  project.meta.target = fixture.lib;
  const formula = createFormula({
    name: 'f',
    source: 'fixture',
    color: '#FFFFFF',
    glyphColors: Object.fromEntries(fixture.glyphs.map((g, i) => [String(i), g.color])),
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

/** What Manim would visibly draw: a fill with opacity, or a stroke with width and opacity. */
function manimVisible(fill: number[], stroke: number[], width: number, live: number): boolean {
  if (live === 0) return false;
  return fill[3]! > 1e-9 || (width > 1e-6 && stroke[3]! > 1e-9);
}

describe.each([strokesCe, strokesGl] as unknown as Fixture[])(
  'Manim $lib styled looks',
  (fixture) => {
    for (const test of fixture.cases) {
      it(test.name, () => {
        const { project, formulas, isIntro } = buildScene(fixture, test);
        const evaluator = createEvaluator(project, formulas);
        const clipId = project.clips[0]!.id;
        for (const sample of test.samples) {
          const t = isIntro ? sample.alpha : 2 + sample.alpha;
          const drawn = evaluator.evaluate(t);
          sample.glyphs.forEach((expected, glyph) => {
            const where = `${test.name} α=${sample.alpha} ${fixture.glyphs[glyph]!.name}`;
            const d = drawn.find((x) => x.key === `${clipId}:${glyph}`);
            const want = (expected.curves as Curve[]).filter((c) => !isDegenerate(c));
            if (!manimVisible(expected.fill, expected.stroke, expected.width, want.length)) {
              expect(d, `${where}: invisible in Manim`).toBeUndefined();
              return;
            }
            expect(d, `${where}: visible in Manim`).toBeDefined();
            if (!d) return;
            const have = anchorsOf(d.path.contours).filter((c) => !isDegenerate(c));
            expect(have, `${where}: curve count`).toHaveLength(want.length);
            have.forEach((curve, k) =>
              curve.forEach((v, j) =>
                expect(v, `${where}: curve ${k}[${j}]`).toBeCloseTo(want[k]![j]!, 4),
              ),
            );
            expectPaints(d, expected, where);
          });
        }
      });
    }
  },
);

describe.each([strokesCe, strokesGl] as unknown as Fixture[])('Manim $lib cut paths', (fixture) => {
  it('a traced outline and a path being created are partial; a whole glyph is not', () => {
    const [circle, glyph] = glyphsOf(fixture);
    const input = (g: Glyph): LookInput => ({
      local: g.contours,
      matrix: translate(0, 0),
      color: '#FFFFFF',
      opacity: 1,
      style: g.style!,
      groupColor: '#FFFFFF',
      center: [0, 0],
      target: fixture.lib,
      shift: [0, 0],
      scale: 1,
    });
    for (const g of [circle!, glyph!]) {
      expect(createLook(input(g), 0.4)!.partial).toBe(true);
      expect(createLook(input(g), 1)!.partial).toBe(false);
      expect(drawBorderThenFillLook(input(g), 0.3, '#FFFFFF')!.partial).toBe(true);
      expect(drawBorderThenFillLook(input(g), 0.7, '#FFFFFF')!.partial).toBe(false);
      expect(placed(input(g))!.partial).toBe(false);
      expect(fadeInLook(input(g), 0.5)!.partial).toBe(false);
    }
  });
});

describe.each([strokesCe, strokesGl] as unknown as Fixture[])(
  'Manim $lib styled morphs',
  (fixture) => {
    const morphGlyph = (index: number, clipId: string): MorphGlyph => {
      const g = fixture.glyphs[index]!;
      return {
        local: contoursOf(g.points, fixture.lib),
        matrix: translate(0, 0),
        color: g.color.toUpperCase(),
        opacity: 1,
        style: {
          fillOpacity: g.fillOpacity,
          strokeWidth: g.strokeWidth,
          strokeOpacity: g.strokeOpacity,
        },
        clipId,
        glyph: index,
      };
    };
    for (const sc of fixture.morphs) {
      it(sc.name, () => {
        const morph = buildMorph({
          style: sc.style,
          target: fixture.lib,
          pathArc: 0,
          src: [morphGlyph(sc.src, 'A')],
          dst: [morphGlyph(sc.dst, 'B')],
        });
        const rate = rateFunction(sc.easing as Easing, fixture.lib);
        for (const sample of sc.samples) {
          const where = `${sc.name} α=${sample.alpha}`;
          const drawn = morphDrawables(morph, rate(sample.alpha), 0);
          const expected = sample.pieces.filter((piece) =>
            manimVisible(piece.fill, piece.stroke, piece.width, 1),
          );
          expect(drawn, `${where}: visible pieces`).toHaveLength(expected.length);
          expected.forEach((piece, k) => {
            const d = drawn[k]!;
            const want = manimCurves(piece, fixture.lib);
            const have = ourCurves(d.path.contours);
            expect(have, `${where} piece ${k}: curve count`).toHaveLength(want.length);
            have.forEach((curve, c) =>
              curve.forEach((v, j) =>
                expect(v, `${where} piece ${k} curve ${c}[${j}]`).toBeCloseTo(want[c]![j]!, 4),
              ),
            );
            expectPaints(d, piece, `${where} piece ${k}`);
            const got = parseColor((d.fill ?? d.stroke)!.color);
            expect(got).toHaveLength(3);
          });
        }
      });
    }
  },
);
