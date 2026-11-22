// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { boxCenter, boxSize } from '../../geom';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import {
  MATHJAX_BACKEND_VERSION,
  MATHJAX_VERSION,
  mathJaxSource,
  renderWithMathJax,
  type MathJaxJob,
} from '../mathjax';
import { mathJaxSetup } from '../packages';

const base: Omit<MathJaxJob, 'tex'> = { packages: [], preamble: '', target: 'ce', fontSize: 48 };

/** `latex` typeset as the math producer hands it over: inside align*. */
function render(latex: string, extra: Partial<MathJaxJob> = {}) {
  const result = renderWithMathJax({ ...base, tex: mathJaxSource(latex), ...extra }, 'k');
  if (!result.ok) throw new Error(result.error.message);
  return result.render;
}

describe('MathJax backend', () => {
  it('renders \\frac{a}{b} as a, b and the bar, centred', () => {
    const r = render('\\frac{a}{b}');
    expect(r.glyphs.map((g) => g.label)).toEqual(['a', 'b', '—']);
    expect(r.glyphs.map((g) => g.kind)).toEqual(['char', 'char', 'rule']);
    expect(r.exact).toBe(false);
    expect(r.backend).toBe('mathjax');
    const [cx, cy] = boxCenter(r.bbox);
    expect(cx).toBeCloseTo(0, 9);
    expect(cy).toBeCloseTo(0, 9);
    // y up: the numerator is above the denominator.
    expect(boxCenter(r.glyphs[0]!.bbox)[1]).toBeGreaterThan(boxCenter(r.glyphs[1]!.bbox)[1]);
  });

  it('scales with the font size and the target calibration', () => {
    const h48 = boxSize(render('x').bbox)[1];
    const h96 = boxSize(render('x', { fontSize: 96 }).bbox)[1];
    expect(h96 / h48).toBeCloseTo(2, 9);
    const gl = boxSize(render('x', { target: 'gl' }).bbox)[1];
    expect(h48 / gl).toBeCloseTo(1.031, 2);
    // An x is about 0.43 em; at font_size 48 in CE that is roughly 0.21 scene units.
    expect(h48).toBeGreaterThan(0.18);
    expect(h48).toBeLessThan(0.25);
  });

  it('drops empty geometry (function application) and keeps operator names', () => {
    const r = render('\\sin x');
    expect(r.glyphs.map((g) => g.label)).toEqual(['s', 'i', 'n', 'x']);
  });

  it('handles stretchy constructions with nested viewports', () => {
    const r = render('\\overbrace{a+b}^{n}');
    expect(r.glyphs.length).toBeGreaterThan(4);
    for (const g of r.glyphs) expect(Number.isFinite(g.bbox.minX)).toBe(true);
  });

  it('returns TeX errors instead of red error text', () => {
    const result = renderWithMathJax({ ...base, tex: mathJaxSource('\\undefinedmacro x') }, 'k');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/undefinedmacro/);
      expect(result.error.backend).toBe('mathjax');
    }
  });

  it('loads extensions only when the package is requested', () => {
    expect(renderWithMathJax({ ...base, tex: mathJaxSource('\\cancel{x}') }, 'k').ok).toBe(false);
    const r = render('\\cancel{x}', { packages: ['cancel'] });
    expect(r.glyphs.map((g) => g.label)).toEqual(['x', '╱']);
    expect(render('\\dv{f}{x}', { target: 'gl' }).glyphs.length).toBe(5);
  });

  it('lets a requested braket package override the GL template physics', () => {
    const labels = (target: 'ce' | 'gl') =>
      render('\\braket{\\phi | \\psi}', { target, packages: ['braket'] }).glyphs.map(
        (g) => g.label,
      );
    expect(labels('gl')).toEqual(['⟨', 'φ', '|', 'ψ', '⟩']);
    expect(labels('ce')).toEqual(['⟨', 'φ', '|', 'ψ', '⟩']);
  });

  it('keeps the fill a colour command gives a glyph (labelled renders)', () => {
    const r = render('a {\\color[RGB]{0,0,1}+} b', { packages: ['xcolor'] });
    expect(r.glyphs.map((g) => g.label)).toEqual(['a', '+', 'b']);
    expect(r.glyphs.map((g) => g.fill)).toEqual([undefined, '#000001', undefined]);
  });

  it('applies macro approximations and warns about unknown packages', () => {
    const r = render('\\bm{v}', { packages: ['bm', 'nosuchpackage'] });
    expect(r.glyphs).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/nosuchpackage/);
  });

  it('runs preamble definitions', () => {
    const r = render('\\R', { preamble: '\\usepackage{bm}\n\\newcommand{\\R}{\\mathbb{R}}' });
    expect(r.glyphs).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it('typesets multi-line align content', () => {
    const r = render('a &= b \\\\ c &= d');
    expect(r.glyphs.map((g) => g.label)).toEqual(['a', '=', 'b', 'c', '=', 'd']);
  });

  it('warns about characters missing from the font', () => {
    const r = render('x\\text{ж}');
    expect(r.glyphs).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/ж/);
  });

  it('wraps formulas like Manim and versions its keys', () => {
    expect(mathJaxSource('x')).toBe('\\begin{align*}x\\end{align*}');
    expect(MATHJAX_BACKEND_VERSION).toMatch(/^mathjax-3\.2\.2\+\d+$/);
    // The version Help → About shows is the installed one.
    expect(MATHJAX_VERSION).toBe(mathjax.version);
  });
});

describe('package mapping', () => {
  it('starts from the target template', () => {
    expect(mathJaxSetup('ce', [], '').extensions).not.toContain('physics');
    expect(mathJaxSetup('gl', [], '').extensions).toContain('physics');
  });

  it('reads \\usepackage from the preamble and strips comments', () => {
    const s = mathJaxSetup(
      'ce',
      [],
      '% \\usepackage{nope}\n\\usepackage[x]{cancel,bm}\n\\def\\a{b}',
    );
    expect(s.extensions).toContain('cancel');
    expect(s.macros.bm).toBeDefined();
    expect(s.definitions).toBe('\\def\\a{b}');
    expect(s.warnings).toEqual([]);
  });
});
