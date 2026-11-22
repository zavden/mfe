// @vitest-environment node
/* The same comparison as manim-morph.test.ts on real LaTeX glyphs (fixtures/manim/gen_morph_real.py):
 * `MathTex("mx+y=0")` → `MathTex("mx=-y")` with glyph groups of one or two glyphs, in the point
 * layout each library imports them in. */
import { describe, expect, it } from 'vitest';
import { IDENTITY, parseColor } from '../../geom';
import { TEXT_STYLE, type RelationStyle, type Target } from '../../model';
import { rateFunction } from '../easing';
import { buildMorph, morphDrawables, type MorphGlyph } from '../anim/morph';
import { contoursOf } from './manimFixture';
import realCe from './fixtures/manim-morph-real-ce.json';
import realGl from './fixtures/manim-morph-real-gl.json';

type Pt = [number, number];
interface Fixture {
  lib: Target;
  src: Pt[][];
  dst: Pt[][];
  scenarios: {
    name: string;
    from: number[];
    to: number[];
    style: RelationStyle;
    samples: { alpha: number; pieces: { points: Pt[]; fill: number[] }[] }[];
  }[];
}

function curvesOf(points: Pt[], lib: Target): number[][] {
  const out: number[][] = [];
  if (lib === 'ce') {
    for (let i = 0; i + 3 < points.length; i += 4) {
      out.push(points.slice(i, i + 4).flat());
    }
    return out;
  }
  for (const c of contoursOf(points, lib)) {
    for (let i = 0; i + 8 <= c.length; i += 6) out.push(c.slice(i, i + 8));
  }
  return out;
}

describe.each([realCe, realGl] as unknown as Fixture[])(
  'Manim $lib morphs of real glyphs',
  (fx) => {
    const glyph = (points: Pt[], clipId: string, index: number): MorphGlyph => ({
      local: contoursOf(points, fx.lib),
      matrix: IDENTITY,
      color: '#FFFFFF',
      opacity: 1,
      style: TEXT_STYLE,
      clipId,
      glyph: index,
    });
    for (const sc of fx.scenarios) {
      it(sc.name, () => {
        const morph = buildMorph({
          style: sc.style,
          target: fx.lib,
          pathArc: 0,
          src: sc.from.map((i) => glyph(fx.src[i]!, 'A', i)),
          dst: sc.to.map((i) => glyph(fx.dst[i]!, 'B', i)),
        });
        const rate = rateFunction('linear', fx.lib);
        for (const sample of sc.samples) {
          const where = `${sc.name} α=${sample.alpha}`;
          const drawn = morphDrawables(morph, rate(sample.alpha), 0);
          const expected = sample.pieces.filter((p) => p.fill[3]! > 1e-9);
          expect(drawn, `${where}: pieces`).toHaveLength(expected.length);
          expected.forEach((piece, k) => {
            const want = curvesOf(piece.points, fx.lib);
            const have = drawn[k]!.path.contours.flatMap((c) => {
              const out: number[][] = [];
              for (let i = 0; i + 8 <= c.length; i += 6) out.push(c.slice(i, i + 8));
              return out;
            });
            expect(have, `${where} piece ${k}: curves`).toHaveLength(want.length);
            have.forEach((curve, c) =>
              curve.forEach((v, j) =>
                expect(v, `${where} piece ${k} curve ${c}[${j}]`).toBeCloseTo(want[c]![j]!, 4),
              ),
            );
            expect(drawn[k]!.fill!.opacity).toBeCloseTo(piece.fill[3]!, 5);
            const rgb = parseColor(drawn[k]!.fill!.color);
            piece.fill.slice(0, 3).forEach((v, j) => expect(rgb[j]!).toBeCloseTo(v, 2));
          });
        }
      });
    }
  },
);
