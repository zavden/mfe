// @vitest-environment node
/* The relation morphs against ManimCE 0.22.1 and ManimGL 1.7.2: fixtures/manim/gen_morph.py builds
 * glyph shapes, runs the real ReplacementTransform / TransformFromCopy / FadeTransform (a VGroup on
 * both sides when either has several glyphs), calls `begin()` and `interpolate(alpha)` and records
 * every family member with points. `buildMorph` + `morphDrawables` must reproduce every point,
 * colour and opacity. */
import { describe, expect, it } from 'vitest';
import { lineTo, parseColor, translate, type Contour } from '../../geom';
import { TEXT_STYLE, type Easing, type RelationStyle, type Target } from '../../model';
import { rateFunction } from '../easing';
import { buildMorph, morphDrawables, type MorphGlyph } from '../anim/morph';
import { manimCurves, ourCurves } from './manimFixture';
import morphCe from './fixtures/manim-morph-ce.json';
import morphGl from './fixtures/manim-morph-gl.json';

type Seg = ['L', number[]] | ['C', number[], number[], number[]];
interface FixtureGlyph {
  shape: string;
  shift: [number, number];
  color: string;
  opacity: number;
}
interface FixturePiece {
  points: [number, number][];
  fill: number[];
  stroke: number[];
  width: number;
}
interface Scenario {
  name: string;
  style: RelationStyle;
  easing: Easing;
  pathArc: number;
  src: FixtureGlyph[];
  dst: FixtureGlyph[];
  samples: { alpha: number; pieces: FixturePiece[] }[];
}
interface Fixture {
  lib: Target;
  shapes: Record<string, [number[], ...Seg[]][]>;
  scenarios: Scenario[];
}

function contourOf(subpath: [number[], ...Seg[]]): Contour {
  const [start, ...segments] = subpath;
  const c: Contour = [start![0]!, start![1]!];
  for (const seg of segments) {
    if (seg[0] === 'L') lineTo(c, seg[1][0]!, seg[1][1]!);
    else c.push(...seg[1], ...seg[2], ...seg[3]);
  }
  return c;
}

function glyphsOf(fixture: Fixture, list: FixtureGlyph[], clipId: string): MorphGlyph[] {
  return list.map((g, glyph) => ({
    local: fixture.shapes[g.shape]!.map((sp) => contourOf(sp as [number[], ...Seg[]])),
    matrix: translate(g.shift[0], g.shift[1]),
    color: g.color.toUpperCase(),
    opacity: g.opacity,
    style: TEXT_STYLE,
    clipId,
    glyph,
  }));
}

describe.each([morphCe, morphGl] as unknown as Fixture[])(
  'Manim $lib relation morphs',
  (fixture) => {
    for (const sc of fixture.scenarios) {
      it(sc.name, () => {
        const morph = buildMorph({
          style: sc.style,
          target: fixture.lib,
          pathArc: sc.pathArc,
          src: glyphsOf(fixture, sc.src, 'A'),
          dst: glyphsOf(fixture, sc.dst, 'B'),
        });
        const rate = rateFunction(sc.easing, fixture.lib);
        for (const sample of sc.samples) {
          const where = `${sc.name} α=${sample.alpha}`;
          const drawn = morphDrawables(morph, rate(sample.alpha), 0);
          const expected = sample.pieces.filter((piece) => piece.fill[3]! > 1e-9);
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
            expect(d.fill!.opacity, `${where} piece ${k}: opacity`).toBeCloseTo(piece.fill[3]!, 5);
            const got = parseColor(d.fill!.color);
            piece.fill
              .slice(0, 3)
              .forEach((v, j) => expect(got[j]!, `${where} piece ${k}: rgb`).toBeCloseTo(v, 2));
            expect(d.stroke, `${where}: no stroke`).toBeNull();
          });
        }
      });
    }
  },
);
