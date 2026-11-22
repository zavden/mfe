import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockEngine } from '../../../test/mockEngine';
import { createEmptyProject, createFormula } from '../../../model';
import { clearThumbRenders, thumbRender } from '../libraryThumbs';

describe('thumbRender', () => {
  const meta = createEmptyProject('T').meta;
  beforeEach(() => clearThumbRenders());

  it('renders a formula with MathJax and resolves it for that formula', async () => {
    const engine = createMockEngine();
    const formula = createFormula({ name: 'f', source: 'x+y' });
    const resolved = await thumbRender(formula, meta, engine);
    expect(resolved?.formula).toBe(formula);
    expect(resolved?.render.glyphs.map((g) => g.label)).toEqual(['x', '+', 'y']);
    expect(resolved?.canonToRender).toEqual([0, 1, 2]);
  });

  it('renders the same request once and resolves each formula on its own', async () => {
    const engine = createMockEngine();
    const render = vi.spyOn(engine, 'render');
    const a = createFormula({ name: 'a', source: 'x+y' });
    const b = createFormula({ name: 'b', source: 'x+y' });
    const [ra, rb] = await Promise.all([
      thumbRender(a, meta, engine),
      thumbRender(b, meta, engine),
    ]);
    expect(render).toHaveBeenCalledTimes(1);
    expect(ra?.render).toBe(rb?.render);
    expect(ra?.formula).toBe(a);
    expect(rb?.formula).toBe(b);
  });

  it('is null for an empty formula and for one that fails to render', async () => {
    const engine = createMockEngine();
    expect(await thumbRender(createFormula({ name: 'e', source: '  ' }), meta, engine)).toBeNull();
    vi.spyOn(engine, 'render').mockRejectedValue(new Error('boom'));
    expect(await thumbRender(createFormula({ name: 'f', source: 'z' }), meta, engine)).toBeNull();
  });
});
