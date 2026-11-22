import { describe, expect, it } from 'vitest';
import { glyphLikes } from '../key';
import { buildGlyphs } from '../glyphs';
import { glyphsFromSvg, latexScale } from '../latex';
import { matchGlyphs } from '../match';
import { mathJaxSource, renderWithMathJax } from '../mathjax';
import { normalizeLabel } from '../glyphs';
import type { CompanionGlyphInfo, GlyphLike } from '../types';
import { composeGlyphMatches } from '../correspondence';
import fracSvg from './fixtures/frac.svg?raw';
import sumSvg from './fixtures/sum.svg?raw';
import vecSvg from './fixtures/vec.svg?raw';
import abcSvg from './fixtures/abc.svg?raw';
import abdcSvg from './fixtures/abdc.svg?raw';

const info = (labels: string[]): CompanionGlyphInfo[] =>
  labels.map((label) => ({
    label,
    kind: label === '—' ? 'rule' : 'char',
    font: null,
    code: null,
  }));

function latexGlyphs(svg: string, labels: string[]): GlyphLike[] {
  const { raw } = glyphsFromSvg(svg, info(labels));
  const { glyphs, bbox } = buildGlyphs(raw, latexScale('ce', 48, 0), 'ce');
  return glyphLikes({
    key: 'k',
    backend: 'latex',
    exact: true,
    target: 'ce',
    fontSize: 48,
    glyphs,
    bbox,
    warnings: [],
  });
}

function mathjaxGlyphs(latex: string): GlyphLike[] {
  const r = renderWithMathJax(
    { tex: mathJaxSource(latex), packages: [], preamble: '', target: 'ce', fontSize: 48 },
    'k',
  );
  if (!r.ok) throw new Error(r.error.message);
  return glyphLikes(r.render);
}

const CASES: [string, string, string[]][] = [
  ['\\frac{a}{b}', fracSvg, ['a', '—', 'b']],
  ['\\sum_{i=0}^{n} i^2', sumSvg, ['n', '∑', 'i', '=', '0', 'i', '2']],
  ['\\vec{v}\\cdot\\hat{n}', vecSvg, ['→', 'v', '⋅', '^', 'n']],
];

describe("matchGlyphs 'position' (MathJax → LaTeX)", () => {
  for (const [latex, svg, labels] of CASES) {
    it(`recovers the correspondence for ${latex}`, () => {
      const mj = mathjaxGlyphs(latex);
      const tex = latexGlyphs(svg, labels);
      expect(mj).toHaveLength(tex.length);
      const { map, confidence } = matchGlyphs(mj, tex, 'position');
      map.forEach((j, i) => {
        expect(j).not.toBeNull();
        expect(normalizeLabel(tex[j!]!.label)).toBe(normalizeLabel(mj[i]!.label));
      });
      expect(new Set(map).size).toBe(map.length);
      expect(confidence).toBeGreaterThan(0.8);
    });
  }

  it('orders differ between the backends (that is why matching exists)', () => {
    const mj = mathjaxGlyphs('\\frac{a}{b}').map((g) => g.label);
    expect(mj).toEqual(['a', 'b', '—']);
  });

  it('is the identity on itself with confidence 1', () => {
    const g = mathjaxGlyphs('e^{i\\pi}+1=0');
    const { map, confidence } = matchGlyphs(g, g, 'position');
    expect(map).toEqual(g.map((_, i) => i));
    expect(confidence).toBeCloseTo(1, 9);
  });

  it('handles rectangular inputs (a ligature) and lowers the confidence', () => {
    const glyph = (label: string, x: number, w = 0.2): GlyphLike => ({
      label,
      center: [x, 0],
      size: [w, 0.3],
    });
    // "office": GL/MathJax have six glyphs, CE merges "ffi" into one.
    const six = ['o', 'f', 'f', 'i', 'c', 'e'].map((l, i) => glyph(l, i * 0.25));
    const four = [glyph('o', 0), glyph('ﬃ', 0.5, 0.7), glyph('c', 1), glyph('e', 1.25)];
    const { map, confidence } = matchGlyphs(six, four, 'position');
    expect([map[0], map[4], map[5]]).toEqual([0, 2, 3]);
    expect(map.filter((j) => j === 1)).toHaveLength(1);
    expect(map.filter((j) => j === null)).toHaveLength(2);
    expect(confidence).toBeLessThan(0.8);
    const tex = latexGlyphs(fracSvg, ['a', '—', 'b']);
    expect(matchGlyphs([], tex, 'position')).toEqual({ map: [], confidence: 0 });
    expect(matchGlyphs([], [], 'position')).toEqual({ map: [], confidence: 1 });
    expect(matchGlyphs(tex, [], 'position').map).toEqual([null, null, null]);
  });

  it('is invariant to scale (CE vs GL sizes)', () => {
    const a = latexGlyphs(sumSvg, CASES[1]![2]);
    const b = a.map((g) => ({
      ...g,
      center: [g.center[0] * 0.97, g.center[1] * 0.97] as [number, number],
      size: [g.size[0] * 0.97, g.size[1] * 0.97] as [number, number],
    }));
    expect(matchGlyphs(a, b, 'position').map).toEqual(a.map((_, i) => i));
  });
});

describe("matchGlyphs 'edit'", () => {
  const g = (label: string, x: number, y = 0): GlyphLike => ({
    label,
    center: [x, y],
    size: [0.2, 0.3],
  });

  it('a+b=c → a+b+d=c keeps every glyph and skips the inserted ones', () => {
    const from = latexGlyphs(abcSvg, ['a', '+', 'b', '=', 'c']);
    const to = latexGlyphs(abdcSvg, ['a', '+', 'b', '+', 'd', '=', 'c']);
    const { map, confidence } = matchGlyphs(from, to, 'edit');
    expect(map).toEqual([0, 1, 2, 5, 6]);
    expect(confidence).toBeCloseTo(1, 9);
  });

  it('and the reverse edit maps the removed glyphs to null', () => {
    const from = latexGlyphs(abdcSvg, ['a', '+', 'b', '+', 'd', '=', 'c']);
    const to = latexGlyphs(abcSvg, ['a', '+', 'b', '=', 'c']);
    const { map, confidence } = matchGlyphs(from, to, 'edit');
    expect(map.filter((j) => j !== null)).toEqual([0, 1, 2, 3, 4]);
    expect(map[4]).toBeNull(); // d
    expect(confidence).toBeLessThan(1);
  });

  it('substitutes a changed glyph in place: \\frac{a}{b} → \\frac{a}{c}', () => {
    const from = [g('a', 0, 0.3), g('—', 0, 0), g('b', 0, -0.3)];
    const to = [g('a', 0, 0.3), g('—', 0, 0), g('c', 0, -0.3)];
    const { map, confidence } = matchGlyphs(from, to, 'edit');
    expect(map).toEqual([0, 1, 2]);
    expect(confidence).toBeLessThan(1);
    expect(confidence).toBeGreaterThan(0.8);
  });

  it('follows moved glyphs: a+b → b+a', () => {
    const from = [g('a', 0), g('+', 0.4), g('b', 0.8)];
    const to = [g('b', 0), g('+', 0.4), g('a', 0.8)];
    expect(matchGlyphs(from, to, 'edit').map).toEqual([2, 1, 0]);
  });

  it('handles empty sides', () => {
    expect(matchGlyphs([], [g('a', 0)], 'edit')).toEqual({ map: [], confidence: 1 });
    expect(matchGlyphs([g('a', 0)], [], 'edit').map).toEqual([null]);
  });
});

describe("matchGlyphs 'sequence' for unchanged content", () => {
  const row = (labels: string[], y: number): GlyphLike[] =>
    labels.map((label, i) => ({
      label,
      center: [i * 0.3, y],
      size: [0.2, 0.3],
    }));

  it('preserves ordered repeated occurrences regardless of row positions', () => {
    const from = row(['a', 'b', 'a', 'b', 'a'], 0);
    const to = from.map((glyph, index) => ({
      ...glyph,
      center: [(index % 2) * 0.3, -Math.floor(index / 2)] as [number, number],
    }));
    expect(matchGlyphs(from, to, 'sequence')).toEqual({ map: [0, 1, 2, 3, 4], confidence: 1 });
  });

  it('keeps occurrence order around a newly drawn line-break hyphen and reports uncertainty', () => {
    const match = matchGlyphs(row(['a', 'b', 'a'], 0), row(['a', '-', 'b', 'a'], -2), 'sequence');
    expect(match.map).toEqual([0, 2, 3]);
    expect(match.confidence).toBeLessThan(0.8);
  });

  it('does not guess which letter supplies a changed ligature', () => {
    const match = matchGlyphs(
      row(['o', 'f', 'f', 'i', 'c', 'e'], 0),
      row(['o', 'ﬃ', 'c', 'e'], -2),
      'sequence',
    );
    expect(match.map).toEqual([0, null, null, null, 2, 3]);
    expect(match.confidence).toBeLessThan(0.8);
  });

  it('composes partial maps without inventing missing counterparts or increasing confidence', () => {
    expect(
      composeGlyphMatches(
        { map: [2, null, 0, 5], confidence: 0.9 },
        { map: [4, 1, null], confidence: 0.6 },
      ),
    ).toEqual({ map: [null, null, 4, null], confidence: 0.6 });
  });
});
