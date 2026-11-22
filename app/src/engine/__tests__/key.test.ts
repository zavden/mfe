import { describe, expect, it } from 'vitest';
import { BACKEND_VERSIONS, isCurrentRender } from '../engine';
import { renderKey } from '../key';
import { renderRequestFor } from '../producers';
import type { FormulaRender } from '../types';

const formula = { kind: 'math' as const, source: 'a+b', packages: ['cancel'], fontSize: 48 };
const meta = { preamble: '', target: 'ce' as const };

/** A render whose key says it was made for `formula` in `meta` by the current MathJax backend. */
function renderOf(f = formula, m: { preamble: string; target: 'ce' | 'gl' } = meta): FormulaRender {
  const key = renderKey(renderRequestFor(f, m, 'auto'), 'mathjax', BACKEND_VERSIONS.mathjax);
  return { key, backend: 'mathjax' } as FormulaRender;
}

describe('render requests', () => {
  it('ask for the formula as the project sets it', () => {
    expect(renderRequestFor(formula, meta, 'latex')).toEqual({
      kind: 'math',
      latex: 'a+b',
      packages: ['cancel'],
      preamble: '',
      target: 'ce',
      fontSize: 48,
      prefer: 'latex',
    });
  });

  it('tell a current render from one made for other LaTeX, size or target', () => {
    expect(isCurrentRender(renderOf(), formula, meta)).toBe(true);
    expect(isCurrentRender(renderOf(), { ...formula, source: 'a+c' }, meta)).toBe(false);
    expect(isCurrentRender(renderOf(), { ...formula, fontSize: 36 }, meta)).toBe(false);
    expect(isCurrentRender(renderOf(), formula, { ...meta, target: 'gl' })).toBe(false);
  });
});
