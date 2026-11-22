// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { matchPatterns } from '../../model';
import { labelGlyphs, mapLabels, withColorPackage } from '../labelled';
import { producerOf } from '../producers';
import type { FormulaRender, MathRenderRequest, RenderRequest } from '../types';

const request = (latex: string): MathRenderRequest => ({
  kind: 'math',
  latex,
  packages: [],
  preamble: '',
  target: 'ce',
  fontSize: 48,
  prefer: 'mathjax',
});

function render(latex: string, packages: string[] = []): FormulaRender {
  const result = producerOf('math').free({ ...request(latex), packages }, `k:${latex}`);
  if (!result.ok) throw new Error(result.error.message);
  return result.render;
}

/** An engine over MathJax, counting its renders. */
function mathJaxEngine() {
  const calls: RenderRequest[] = [];
  return {
    calls,
    render: vi.fn(async (req: RenderRequest) => {
      calls.push(req);
      return producerOf(req.kind).free(
        req,
        `k:${req.kind === 'math' ? req.latex : req.kind === 'tex' ? req.source : 'brace'}`,
      );
    }),
  };
}

describe('labelGlyphs', () => {
  it('tells which glyphs each pattern covers, through a render with colour groups', async () => {
    const latex = 'a + b x^2 = \\frac{x}{2}';
    const plain = render(latex);
    // MathJax's order: a + b x 2 = x 2 and the bar.
    expect(plain.glyphs.map((g) => g.label)).toEqual(['a', '+', 'b', 'x', '2', '=', 'x', '2', '—']);
    const engine = mathJaxEngine();
    const { labelled } = matchPatterns(latex, ['$x$', '+']);
    const out = await labelGlyphs(engine, request(latex), plain, labelled);
    if (!out.ok) throw new Error(out.error.message);
    expect(out.by).toBe('index');
    expect(out.labels).toEqual([null, 1, null, 0, null, null, 0, null, null]);
    // The labelled render asks the same backend, with the colour package.
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0]).toMatchObject({
      latex: labelled,
      packages: ['xcolor'],
      prefer: 'mathjax',
    });
  });

  it('needs no render when nothing matched, and passes a failed render on', async () => {
    const latex = 'y = 2';
    const plain = render(latex);
    const engine = mathJaxEngine();
    const none = await labelGlyphs(engine, request(latex), plain, latex);
    expect(none).toEqual({ ok: true, labels: [null, null, null], by: 'index', confidence: 1 });
    expect(engine.render).not.toHaveBeenCalled();
    // A pattern that cuts a macro's arguments makes the labelled source fail to render.
    const broken = await labelGlyphs(
      engine,
      request('\\sqrt{x}'),
      render('\\sqrt{x}'),
      '{\\color[RGB]{0,0,1}\\sqrt}{x}',
    );
    expect(broken.ok).toBe(false);
  });
});

describe('mapLabels', () => {
  it('falls back to matching by position when the glyph counts differ', () => {
    const plain = render('x+y');
    const labelled: FormulaRender = {
      ...plain,
      glyphs: plain.glyphs.slice(0, 2).map((g, i) => (i === 0 ? { ...g, fill: '#010001' } : g)),
    };
    const out = mapLabels(plain, labelled);
    expect(out.by).toBe('position');
    expect(out.labels).toEqual([0, null, null]);
    expect(out.confidence).toBeGreaterThan(0);
  });

  it('ignores a fill the plain render has already (a colour of the source, not a label)', () => {
    // ManimGL colours every `{{ }}` group of the source #000001, #000002… in the plain render
    // too; a `\color` the author wrote is there as well. Only a fill the labelled render adds
    // names a pattern.
    const base = render('a+x');
    const plain: FormulaRender = {
      ...base,
      glyphs: base.glyphs.map((g, i) => (i === 0 ? { ...g, fill: '#010001' } : g)),
    };
    const labelled: FormulaRender = {
      ...base,
      glyphs: base.glyphs.map((g, i) =>
        i === 0 ? { ...g, fill: '#010001' } : i === 2 ? { ...g, fill: '#010002' } : g,
      ),
    };
    expect(mapLabels(plain, labelled)).toMatchObject({ by: 'index', labels: [null, null, 1] });
    const shorter: FormulaRender = { ...labelled, glyphs: labelled.glyphs.slice(0, 2) };
    expect(mapLabels(plain, shorter)).toMatchObject({ by: 'position', labels: [null, null, null] });
  });
});

describe('withColorPackage', () => {
  it('adds xcolor unless a colour package is requested already', () => {
    expect(withColorPackage([])).toEqual(['xcolor']);
    expect(withColorPackage(['amsmath'])).toEqual(['amsmath', 'xcolor']);
    expect(withColorPackage(['color'])).toEqual(['color']);
    expect(withColorPackage(['xcolor', 'bm'])).toEqual(['xcolor', 'bm']);
  });
});
