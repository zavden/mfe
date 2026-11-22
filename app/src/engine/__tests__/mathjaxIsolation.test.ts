// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEngine } from '../engine';
import { mathJaxSource, renderWithMathJax } from '../mathjax';
import { producerOf } from '../producers';
import type { MathRenderRequest, RenderResult } from '../types';

const request = (latex: string, preamble = ''): MathRenderRequest => ({
  kind: 'math',
  latex,
  preamble,
  packages: [],
  target: 'ce',
  fontSize: 48,
  prefer: 'mathjax',
});

function render(latex: string, preamble = '') {
  return renderWithMathJax(
    {
      tex: mathJaxSource(latex),
      preamble,
      packages: [],
      target: 'ce',
      fontSize: 48,
    },
    'same-source-control',
  );
}

function successful(result: RenderResult) {
  if (!result.ok) throw new Error(result.error.message);
  return result.render;
}

const labels = (result: RenderResult) => successful(result).glyphs.map((glyph) => glyph.label);

describe('source-local MathJax definitions', () => {
  it.each(['def', 'newcommand'])('does not leak a local \\%s into another formula', (command) => {
    const name = command === 'def' ? '\\sourceDefOnly' : '\\sourceNewOnly';
    const definition = command === 'def' ? `\\def${name}{b}` : `\\newcommand{${name}}{b}`;
    expect(labels(render(definition + name))).toEqual(['b']);
    expect(render(name).ok).toBe(false);
  });

  it.each(['plain-first', 'renewal-first'])(
    'restores preamble definitions in %s order',
    (order) => {
      const name = order === 'plain-first' ? '\\plainFirstLocal' : '\\renewalFirstLocal';
      const preamble = `\\newcommand{${name}}{a}`;
      if (order === 'plain-first') expect(labels(render(name, preamble))).toEqual(['a']);
      expect(labels(render(`\\renewcommand{${name}}{b}${name}`, preamble))).toEqual(['b']);
      expect(labels(render(name, preamble))).toEqual(['a']);
      expect(labels(render(`\\renewcommand{${name}}{c}${name}`, preamble))).toEqual(['c']);
      expect(labels(render(name, preamble))).toEqual(['a']);
    },
  );

  it('does not leak environment definitions', () => {
    const use = '\\begin{sourceOnlyEnvironment}x\\end{sourceOnlyEnvironment}';
    expect(labels(render('\\newenvironment{sourceOnlyEnvironment}{a}{b}' + use))).toEqual([
      'a',
      'x',
      'b',
    ]);
    expect(render(use).ok).toBe(false);
  });

  it('discards definitions from a source that fails', () => {
    expect(render('\\def\\failedSourceOnly{b}\\undefinedAfterDefinition').ok).toBe(false);
    expect(render('\\failedSourceOnly').ok).toBe(false);
    expect(labels(render('a'))).toEqual(['a']);
  });

  it('does not let a discarded preview change the project engine', async () => {
    const preamble = '\\newcommand{\\previewScopeOnly}{a}';
    const engine = createEngine({ companion: { fetch: null, autoStart: false } });
    try {
      const draft = request('\\renewcommand{\\previewScopeOnly}{b}\\previewScopeOnly', preamble);
      expect(labels(producerOf('math').free(draft, 'discarded-preview'))).toEqual(['b']);
      expect(labels(await engine.render(request('\\previewScopeOnly', preamble)))).toEqual(['a']);
    } finally {
      engine.dispose();
    }
  });

  it('returns equal glyphs for equal keys after cache clearing and in a new engine', async () => {
    const preamble = '\\newcommand{\\engineScopeOnly}{a}';
    const plain = request('\\engineScopeOnly', preamble);
    const engines = [0, 1].map(() =>
      createEngine({ companion: { fetch: null, autoStart: false } }),
    );
    try {
      const before = successful(await engines[0]!.render(plain));
      expect(
        labels(
          await engines[0]!.render(
            request('\\renewcommand{\\engineScopeOnly}{b}\\engineScopeOnly', preamble),
          ),
        ),
      ).toEqual(['b']);
      engines[0]!.clearCache();
      for (const engine of engines) {
        const after = successful(await engine.render(plain));
        expect(after.key).toBe(before.key);
        expect(after.glyphs).toEqual(before.glyphs);
        expect(after.warnings).toEqual(before.warnings);
      }
    } finally {
      for (const engine of engines) engine.dispose();
    }
  });
});
