// @vitest-environment node
/* Appear and disappear blocks against ManimCE 0.22.1 and ManimGL 1.7.2: fixtures/manim/gen_blocks.py
 * puts some glyphs of the five-glyph polygon "formula" (as gen_anim.py) in a real Scene, then plays
 * Write / Create / FadeIn / … on VGroups of other glyphs, and FadeOut / Uncreate / … on glyphs on
 * screen — later bringing them back — the way Scene.play does (membership, begin, interpolate,
 * finish, clean_up_from_scene, with the restoring removers of ARCHITECTURE §8). Every glyph is
 * recorded with whether it is in the scene. The evaluator must draw the same at the same times. */
import { describe, expect, it } from 'vitest';
import type { ResolvedFormula } from '../../engine';
import { toSnapshot } from '../../engine';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmptyProject,
  createFormula,
  defaultIntro,
  defaultOutro,
  validateProject,
  type AppearKind,
  type DisappearKind,
  type Easing,
  type Project,
  type Target,
} from '../../model';
import { createEvaluator, type Drawable } from '../index';
import { anchorsOf, compareColor, isDegenerate, polygonRender, type Curve } from './manimFixture';
import blocksCe from './fixtures/manim-blocks-ce.json';
import blocksGl from './fixtures/manim-blocks-gl.json';

interface FixtureGlyph {
  onScreen: boolean;
  curves: number[][];
  fill: number[];
  stroke: number[];
  width: number;
}
interface FixtureAction {
  kind: 'appear' | 'disappear';
  anim: string;
  glyphs: number[];
  easing: string;
  lag: number | null;
  shift?: [number, number];
  scale?: number;
}
interface FixturePlay {
  actions: FixtureAction[];
  samples: { alpha: number; glyphs: FixtureGlyph[] }[];
  after: FixtureGlyph[];
}
interface FixtureCase {
  name: string;
  initial: number[];
  before: FixtureGlyph[];
  plays: FixturePlay[];
}
interface Fixture {
  lib: 'ce' | 'gl';
  polygons: [number, number][][];
  colors: string[];
  cases: FixtureCase[];
}

/** Play k runs over [1 + 2k, 2 + 2k); the clip ends one second after the last play. */
const playStart = (k: number) => 1 + 2 * k;

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
  // Glyphs not on screen at the start are hidden glyphs of the formula: off screen until an
  // appear brings them.
  formula.hiddenGlyphs = glyphs.map((g) => g.index).filter((g) => !test.initial.includes(g));
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, playStart(test.plays.length) + 2, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  test.plays.forEach((play, k) => {
    for (const a of play.actions) {
      const fields = {
        duration: 1,
        easing: a.easing as Easing,
        lagRatio: a.lag,
        shift: a.shift ?? [0, 0],
        scale: a.scale ?? 1,
      };
      clip.actions.push(
        a.kind === 'appear'
          ? createAppear(playStart(k), a.anim as AppearKind, a.glyphs, fields)
          : createDisappear(playStart(k), a.anim as DisappearKind, a.glyphs, fields),
      );
    }
  });
  project.formulas.push(formula);
  project.clips.push(clip);
  const resolved: ResolvedFormula = {
    formula,
    render,
    canonToRender: glyphs.map((g) => g.index),
    confidence: 1,
  };
  return { project, formulas: new Map([[formula.id, resolved]]), clip };
}

/** What Manim would visibly draw for a glyph: in the scene, with fill or a stroke of length. */
function manimVisible(g: FixtureGlyph): boolean {
  if (!g.onScreen) return false;
  const live = g.curves.filter((c) => !isDegenerate(c as Curve));
  if (live.length === 0) return false;
  return g.fill[3]! > 1e-9 || (g.width > 1e-6 && g.stroke[3]! > 1e-9);
}

function compare(drawn: Drawable[], clipId: string, glyphs: FixtureGlyph[], at: string) {
  glyphs.forEach((expected, glyph) => {
    const where = `${at} glyph ${glyph}`;
    const d = drawn.find((x) => x.key === `${clipId}:${glyph}`);
    if (!manimVisible(expected)) {
      expect(d, `${where}: invisible in Manim`).toBeUndefined();
      return;
    }
    expect(d, `${where}: visible in Manim`).toBeDefined();
    if (!d) return;

    const want = (expected.curves as Curve[]).filter((c) => !isDegenerate(c));
    const have = anchorsOf(d.path.contours).filter((c) => !isDegenerate(c));
    expect(have, `${where}: curve count`).toHaveLength(want.length);
    have.forEach((curve, k) =>
      curve.forEach((v, j) => expect(v, `${where}: curve ${k}[${j}]`).toBeCloseTo(want[k]![j]!, 4)),
    );

    const fillOpacity = expected.fill[3]!;
    if (fillOpacity > 1e-9) {
      expect(d.fill, `${where}: fill`).not.toBeNull();
      expect(d.fill!.opacity, `${where}: fill opacity`).toBeCloseTo(fillOpacity, 5);
      compareColor(d.fill!.color, expected.fill, `${where}: fill`);
    } else {
      expect(d.fill, `${where}: no fill`).toBeNull();
    }

    if (expected.width > 1e-6 && expected.stroke[3]! > 1e-9) {
      expect(d.stroke, `${where}: stroke`).not.toBeNull();
      expect(d.stroke!.width, `${where}: stroke width`).toBeCloseTo(expected.width, 5);
      expect(d.stroke!.opacity, `${where}: stroke opacity`).toBeCloseTo(expected.stroke[3]!, 5);
      compareColor(d.stroke!.color, expected.stroke, `${where}: stroke`);
    } else {
      expect(d.stroke, `${where}: no stroke`).toBeNull();
    }
  });
}

describe.each([blocksCe, blocksGl] as unknown as Fixture[])('Manim $lib blocks', (fixture) => {
  for (const test of fixture.cases) {
    it(test.name, () => {
      const { project, formulas, clip } = buildScene(fixture, test);
      expect(validateProject(project)).toEqual([]);
      const evaluator = createEvaluator(project, formulas);
      compare(evaluator.evaluate(0.5), clip.id, test.before, `${test.name} before`);
      test.plays.forEach((play, k) => {
        for (const sample of play.samples) {
          const t = playStart(k) + sample.alpha;
          compare(
            evaluator.evaluate(t),
            clip.id,
            sample.glyphs,
            `${test.name} play ${k} α=${sample.alpha}`,
          );
        }
        compare(
          evaluator.evaluate(playStart(k) + 1.5),
          clip.id,
          play.after,
          `${test.name} after play ${k}`,
        );
      });
    });
  }
});
