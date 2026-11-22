// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createBraceFormula, createEmptyProject, createFormula } from '../../model';
import {
  createEngine,
  expectedRenderKey,
  isExactSnapshot,
  refreshLocalRenders,
  renderKey,
  renderRequestFor,
  resolveFormula,
  toSnapshot,
  type RenderRequest,
} from '../index';
import { createMockEngine, mockTokens } from '../../test/mockEngine';

const request: RenderRequest = {
  kind: 'math',
  latex: '\\frac{a}{b}+\\pi',
  packages: [],
  preamble: '',
  target: 'ce',
  fontSize: 48,
  prefer: 'auto',
};

describe('mock engine', () => {
  it('tokenises visible symbols', () => {
    expect(mockTokens(request.latex).map((t) => t.label)).toEqual(['—', 'a', 'b', '+', 'π']);
  });

  it('draws no glyph for alignment marks and line breaks', () => {
    // As in LaTeX and MathJax: the ten glyphs A = x 1 = x 2 = x 3, in reading order.
    expect(mockTokens('A &= x_1 \\\\ &= x_2 \\\\ &= x_3').map((t) => t.label)).toEqual(
      'A=x1=x2=x3'.split(''),
    );
    expect(mockTokens('\\{a\\,b\\}').map((t) => t.label)).toEqual(['{', 'a', 'b', '}']);
  });

  it('renders centred glyphs with a stable key', async () => {
    const engine = createMockEngine();
    const result = await engine.render(request);
    if (!result.ok) throw new Error(result.error.message);
    const { render } = result;
    expect(render.glyphs).toHaveLength(5);
    expect(render.exact).toBe(false);
    expect((render.bbox.minX + render.bbox.maxX) / 2).toBeCloseTo(0, 9);
    expect((render.bbox.minY + render.bbox.maxY) / 2).toBeCloseTo(0, 9);
    expect(render.key).toBe(renderKey(request, 'mathjax', engine.version));
  });

  it('fails on an empty formula', async () => {
    const result = await createMockEngine().render({ ...request, latex: '  ' });
    expect(result.ok).toBe(false);
  });
});

describe('render keys and snapshots', () => {
  it('ignores `prefer` but not content', () => {
    const k = renderKey(request, 'latex', 'v1');
    expect(renderKey({ ...request, prefer: 'mathjax' }, 'latex', 'v1')).toBe(k);
    expect(renderKey({ ...request, latex: 'x' }, 'latex', 'v1')).not.toBe(k);
    expect(renderKey(request, 'mathjax', 'v1')).not.toBe(k);
    expect(renderKey(request, 'latex', 'v2')).not.toBe(k);
  });

  it('resolves to identity when the snapshot came from the same render', async () => {
    const result = await createMockEngine().render(request);
    if (!result.ok) throw new Error(result.error.message);
    const formula = createFormula({ source: request.latex, snapshot: toSnapshot(result.render) });
    const resolved = resolveFormula(formula, result.render);
    expect(resolved.canonToRender).toEqual([0, 1, 2, 3, 4]);
    expect(resolved.confidence).toBe(1);
  });
});

describe('local kinds', () => {
  it('renders a brace exactly without the companion, whatever the preference', async () => {
    const engine = createEngine({ companion: { fetch: null } });
    try {
      const brace = createBraceFormula({ width: 1.5 });
      const meta = { preamble: '', target: 'ce' as const };
      for (const prefer of ['latex', 'mathjax', 'auto'] as const) {
        const result = await engine.render(renderRequestFor(brace, meta, prefer));
        if (!result.ok) throw new Error(result.error.message);
        expect(result.render.backend).toBe('latex');
        expect(result.render.exact).toBe(true);
        expect(result.render.key).toBe(expectedRenderKey(brace, meta, 'latex'));
        expect(isExactSnapshot({ ...brace, snapshot: toSnapshot(result.render) }, meta)).toBe(true);
      }
      expect(engine.cacheSize()).toBe(1);
      // The mock engine builds it the same way.
      const mock = await createMockEngine().render(renderRequestFor(brace, meta, 'auto'));
      if (!mock.ok) throw new Error(mock.error.message);
      expect(mock.render.key).toBe(expectedRenderKey(brace, meta, 'latex'));
      expect(mock.render.glyphs).toHaveLength(1);
    } finally {
      engine.dispose();
    }
  });

  it('refreshLocalRenders renders the braces whose width changed, snapshot included', () => {
    const brace = createBraceFormula({ name: 'b1', width: 2 });
    const math = createFormula({ name: 'f1', source: 'x' });
    const project = { ...createEmptyProject(), formulas: [math, brace] };
    const first = refreshLocalRenders(project, new Map());
    expect(first.project).not.toBe(project);
    expect(first.project.formulas[0]).toBe(math); // a math formula is the render sync's business
    expect(first.formulas.has(math.id)).toBe(false);
    const render = first.formulas.get(brace.id)!.render;
    expect(render.key).toBe(expectedRenderKey(brace, project.meta, 'latex'));
    expect(render.bbox.maxX - render.bbox.minX).toBeCloseTo(2, 9);
    expect(first.project.formulas[1]!.snapshot?.key).toBe(render.key);
    // Nothing stale: the same values back.
    const again = refreshLocalRenders(first.project, first.formulas);
    expect(again.project).toBe(first.project);
    expect(again.formulas).toBe(first.formulas);
    // A new width: a new render.
    const wider = {
      ...first.project,
      formulas: [math, { ...first.project.formulas[1]!, width: 3 }],
    };
    const third = refreshLocalRenders(wider, first.formulas);
    expect(third.formulas.get(brace.id)!.render.bbox.maxX).toBeCloseTo(1.5, 9);
  });
});
