// @vitest-environment node
/* Emphasis blocks against ManimCE 0.22.1 and ManimGL 1.7.2: fixtures/manim/gen_emphasis.py plays
 * each effect on some glyphs of the five-glyph polygon "formula" (as gen_anim.py), as is or scaled
 * and rotated, in a real Scene — Indicate and Wiggle move the glyphs; Circumscribe, Flash and
 * FocusOn draw a temporary mobject (the frame, the twelve lines, the disc), recorded with whether
 * it is in the scene — and records every point and paint at sampled alphas, then what is left
 * after the animation. The evaluator must draw the same at the same instants, and nothing of the
 * effect afterwards. */
import { describe, expect, it } from 'vitest';
import { contoursBox, unionBox } from '../../geom';
import type { FormulaRender, Glyph, ResolvedFormula } from '../../engine';
import { toSnapshot } from '../../engine';
import {
  createClip,
  createEmphasis,
  createEmptyProject,
  createFormula,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Easing,
  type EmphasisKind,
  type Project,
  type Target,
} from '../../model';
import { createEvaluator, type Drawable } from '../index';
import { anchorsOf, expectPaints, isDegenerate, polygonContour, type Curve } from './manimFixture';
import emphasisCe from './fixtures/manim-emphasis-ce.json';
import emphasisGl from './fixtures/manim-emphasis-gl.json';

type Pt = [number, number];
interface FixtureGlyph {
  onScreen: boolean;
  points: Pt[];
  fill: number[];
  stroke: number[];
  width: number;
}
interface FixtureTemp extends FixtureGlyph {
  cls: string;
}
interface FixtureCase {
  name: string;
  effect: EmphasisKind;
  glyphs: number[];
  transform?: string;
  params: Record<string, number | string | null>;
  center: Pt;
  before: FixtureGlyph[];
  samples: { alpha: number; glyphs: FixtureGlyph[]; temp: FixtureTemp[] }[];
  after: { glyphs: FixtureGlyph[]; temp: FixtureTemp[] };
}
interface Fixture {
  lib: Target;
  polygons: Pt[][];
  colors: string[];
  focusRadius: number;
  cases: FixtureCase[];
}

/** The block runs over [START, START + 1); the clip over [0, 4]. */
const START = 1;

/** The block's fields from the generator's keyword arguments. */
function fieldsOf(params: FixtureCase['params']): Parameters<typeof createEmphasis>[3] {
  const fields: Parameters<typeof createEmphasis>[3] = { duration: 1 };
  for (const [key, value] of Object.entries(params)) {
    switch (key) {
      case 'scale_factor':
      case 'scale_value':
        fields.scale = value as number;
        break;
      case 'color':
        fields.color = (value as string).toUpperCase();
        break;
      case 'rate_func':
        fields.easing = value as Easing;
        break;
      case 'rotation_angle':
        fields.angle = ((value as number) * 180) / Math.PI;
        break;
      case 'n_wiggles':
        fields.wiggles = value as number;
        break;
      case 'buff':
        fields.buff = value as number;
        break;
      case 'stroke_width':
        fields.strokeWidth = value as number;
        break;
      case 'time_width':
        fields.timeWidth = value as number;
        break;
      case 'opacity':
        fields.opacity = value as number;
        break;
      case 'z_index':
        break;
      default:
        throw new Error(`unknown parameter ${key}`);
    }
  }
  return fields;
}

function buildScene(fixture: Fixture, test: FixtureCase) {
  const glyphs: Glyph[] = fixture.polygons.map((corners, index) => {
    const contours = [polygonContour(corners)];
    return { index, label: String(index), kind: 'char', contours, bbox: contoursBox(contours) };
  });
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
    glyphColors: Object.fromEntries(fixture.colors.map((c, i) => [String(i), c.toUpperCase()])),
    snapshot: toSnapshot(render),
  });
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  // `top.scale(1.3).rotate(20 * DEGREES)` about the formula's centre, the origin.
  if (test.transform === 'scaled-rotated')
    clip.initial = { ...clip.initial, scale: 1.3, rotation: 20 };
  const action = createEmphasis(START, test.effect, test.glyphs, fieldsOf(test.params));
  clip.actions.push(action);
  project.formulas.push(formula);
  project.clips.push(clip);
  const resolved: ResolvedFormula = {
    formula,
    render,
    canonToRender: glyphs.map((g) => g.index),
    confidence: 1,
  };
  return { project, formulas: new Map([[formula.id, resolved]]), clip, action };
}

/** The anchors of the curves Manim draws of a point list: the start and the end of each cubic
 * (ManimCE, four points each) or quadratic (ManimGL, shared anchors), the collapsed ones left
 * out (a partial path keeps them; nothing is drawn of them). */
function drawnCurves(points: Pt[], lib: Target): Curve[] {
  const out: Curve[] = [];
  if (lib === 'ce') {
    for (let i = 0; i + 3 < points.length; i += 4) out.push([...points[i]!, ...points[i + 3]!]);
  } else {
    for (let i = 0; i + 2 < points.length; i += 2) out.push([...points[i]!, ...points[i + 2]!]);
  }
  return out.filter((c) => !isDegenerate(c));
}

function visible(m: FixtureGlyph, lib: Target): boolean {
  if (!m.onScreen || drawnCurves(m.points, lib).length === 0) return false;
  return m.fill[3]! > 1e-9 || (m.width > 1e-6 && m.stroke[3]! > 1e-9);
}

function compareCurves(d: Drawable, expected: FixtureGlyph, lib: Target, where: string) {
  const want = drawnCurves(expected.points, lib);
  const have = anchorsOf(d.path.contours).filter((c) => !isDegenerate(c));
  expect(have, `${where}: curve count`).toHaveLength(want.length);
  have.forEach((curve, k) =>
    curve.forEach((v, j) => expect(v, `${where}: curve ${k}[${j}]`).toBeCloseTo(want[k]![j]!, 4)),
  );
}

/** The glyphs: each drawn iff Manim draws it, with the same curves and paints. */
function compareGlyphs(
  drawn: Drawable[],
  clipId: string,
  glyphs: FixtureGlyph[],
  lib: Target,
  at: string,
) {
  glyphs.forEach((expected, glyph) => {
    const where = `${at} glyph ${glyph}`;
    const d = drawn.find((x) => x.key === `${clipId}:${glyph}`);
    if (!visible(expected, lib)) {
      expect(d, `${where}: invisible in Manim`).toBeUndefined();
      return;
    }
    expect(d, `${where}: visible in Manim`).toBeDefined();
    if (!d) return;
    expect(d.role).toBe('object');
    compareCurves(d, expected, lib, where);
    expectPaints(d, expected, where);
  });
}

/** The temporary mobject's members in order (the frame; the twelve lines; the disc): the
 * evaluator's temp drawables of the block, in key order, are the ones Manim draws. */
function compareTemp(
  drawn: Drawable[],
  eventId: string,
  temp: FixtureTemp[],
  lib: Target,
  at: string,
) {
  const ours = drawn.filter((d) => d.key.startsWith(`${eventId}:`));
  const theirs = temp.filter((m) => visible(m, lib));
  expect(
    ours.map((d) => d.key),
    `${at}: ${theirs.length} member(s) drawn by Manim`,
  ).toHaveLength(theirs.length);
  ours.forEach((d, i) => {
    const where = `${at} member ${i}`;
    expect(d.role, where).toBe('temp');
    expect(d.glyph, where).toBe(-1);
    compareCurves(d, theirs[i]!, lib, where);
    expectPaints(d, theirs[i]!, where);
  });
}

describe.each([emphasisCe, emphasisGl] as unknown as Fixture[])(
  'Manim $lib emphasis',
  (fixture) => {
    for (const test of fixture.cases) {
      it(test.name, () => {
        const { project, formulas, clip, action } = buildScene(fixture, test);
        expect(validateProject(project)).toEqual([]);
        const evaluator = createEvaluator(project, formulas);
        const eventId = `emphasis:${action.id}`;
        compareGlyphs(
          evaluator.evaluate(0.5),
          clip.id,
          test.before,
          fixture.lib,
          `${test.name} before`,
        );
        for (const sample of test.samples) {
          const at = `${test.name} α=${sample.alpha}`;
          const drawn = evaluator.evaluate(START + sample.alpha);
          compareGlyphs(drawn, clip.id, sample.glyphs, fixture.lib, at);
          compareTemp(drawn, eventId, sample.temp, fixture.lib, at);
        }
        const after = evaluator.evaluate(START + 1.5);
        compareGlyphs(after, clip.id, test.after.glyphs, fixture.lib, `${test.name} after`);
        expect(
          after.filter((d) => d.role === 'temp'),
          `${test.name} after: no effect left`,
        ).toEqual([]);
      });
    }

    it('starts a FocusOn from a disc as wide as the frame', () => {
      // 16:9 at 8 units tall: frame_x_radius + frame_y_radius = 64/9 + 4.
      expect(fixture.focusRadius).toBeCloseTo((8 * 16) / 9 / 2 + 4, 6);
    });
  },
);
