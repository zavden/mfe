// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { paintCases, type PaintCase } from '../../../../../tests/export/paintCases';
import {
  preparePaintCase,
  samplePaintCase,
  type PaintSamples,
} from '../../../../../tests/export/paintFixture';
import type { GlyphStyle } from '../../../model';

function at(samples: PaintSamples, time: number, glyphs: number[]) {
  const sample = samples.find((s) => s.time === time);
  expect(sample, `sample at ${time}`).toBeDefined();
  expect(
    sample!.glyphs.map((d) => d.glyph),
    `canonical glyphs at ${time}`,
  ).toEqual(glyphs);
  return sample!.glyphs;
}

function expectPaint(
  glyph: PaintSamples[number]['glyphs'][number],
  style: GlyphStyle,
  color: string,
  opacity: number,
) {
  expect(glyph.fill).toEqual(
    style.fillOpacity > 0 ? { color, opacity: style.fillOpacity * opacity } : null,
  );
  expect(glyph.stroke).toEqual(
    style.strokeOpacity > 0
      ? { color, opacity: style.strokeOpacity * opacity, width: style.strokeWidth }
      : null,
  );
}

function expectLineOpacities(fixture: PaintCase, samples: PaintSamples) {
  const prior = fixture.name.includes('lines-0') ? 0 : 1;
  for (const glyph of at(samples, 1.5, [0, 1])) {
    expect(glyph.stroke!.opacity).toBeCloseTo(glyph.glyph === prior ? 0.2 : 1);
  }
  if (fixture.name.includes('there_and_back')) {
    for (const glyph of at(samples, 3.5, [0, 1])) {
      expect(glyph.stroke!.opacity).toBeCloseTo(glyph.glyph === prior ? 0.2 : 1);
    }
  } else {
    for (const glyph of at(samples, 2, [0, 1])) {
      expect(glyph.stroke!.opacity).toBeCloseTo(glyph.glyph === prior ? 0.4 : 0.8);
    }
  }
}

for (const target of ['ce', 'gl'] as const) {
  describe(`${target} paint and canonical membership`, () => {
    for (const fixture of paintCases(target)) {
      it(fixture.name, () => {
        const prepared = preparePaintCase(fixture, target);
        expect(prepared.projectIssues.filter((i) => i.severity === 'error')).toEqual([]);
        expect(prepared.result.issues.filter((i) => i.severity === 'error')).toEqual([]);
        const code = prepared.result.code;
        // All 128 vectors retain every configured evaluator sample in ordinary unit runs.
        // paintArtifacts.ts separately writes the full matrix for the native CE/GL probe.
        const samples = samplePaintCase(fixture, prepared);
        expect(samples.map((sample) => sample.time)).toEqual(fixture.samples);
        const formula = fixture.project.formulas[0]!;
        if (formula.kind !== 'shape') throw new Error('shape fixture');

        if (fixture.check === 'reset') {
          expect(code).not.toContain('.set_opacity(');
          expectPaint(at(samples, 3.5, [0])[0]!, formula.style, '#FF0000', 0.5);
        }
        if (fixture.check === 'color') {
          const changesOpacity = fixture.name.endsWith('-0.5');
          for (const [time, color, opacity] of [
            [0.5, '#FF0000', 1],
            [0.75, '#BF4000', 0.875],
            [1, '#808000', 0.75],
            [1.5, '#00FF00', 0.5],
            [3.5, '#00FF00', 0.5],
          ] as const) {
            expectPaint(
              at(samples, time, [0])[0]!,
              formula.style,
              color,
              changesOpacity ? opacity : 1,
            );
          }
          const customTween = /-(90|flip)-/.test(fixture.name);
          expect(code).toContain(
            customTween ? 'colors=[("#FF0000", "#00FF00")]' : '.set_color("#00FF00")',
          );
          if (customTween && !changesOpacity) {
            expect(code).toContain('glyph.set_stroke(fill, opacity=s)');
          }
        }
        if (fixture.check === 'lines') {
          expectLineOpacities(fixture, samples);
          if (fixture.name.includes('-90-')) {
            const pairs = fixture.name.includes('lines-0')
              ? '[(0.2, 0.6), (1, 0.6)]'
              : '[(1, 0.6), (0.2, 0.6)]';
            expect(code).toContain(`stroke=${pairs}`);
          }
        }
        if (fixture.check === 'membership') {
          const returning = fixture.name.includes('unwrite-true-');
          at(samples, 0.5, [0, 1]);
          if (returning) at(samples, 2.5, []);
          at(samples, 3.5, returning ? [0, 1] : []);
          at(samples, 4.5, returning ? [0, 1] : []);
          if (target === 'ce') expect(code).not.toContain('VGroup(*shape[0])');
        }
        if (fixture.check === 'width') {
          const width = formula.style.strokeWidth;
          for (const glyph of at(samples, 3.5, [0, 1])) {
            expectPaint(glyph, formula.style, '#FF0000', 1);
          }
          // CE's width 6 is its native Cross default; GL must always override its taper.
          if (target === 'gl' || width !== 6) expect(code).toContain(`stroke_width=${width}`);
        }
      });
    }
  });
}
