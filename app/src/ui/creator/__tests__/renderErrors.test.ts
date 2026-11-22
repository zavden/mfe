// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RenderError } from '../../../engine';
import { describeRenderError } from '../renderErrors';

const mathjax = (message: string): RenderError => ({ message, backend: 'mathjax' });
const describe_ = (error: RenderError, latex: string, packages: string[] = []) =>
  describeRenderError(error, { source: latex, packages });

/** The companion's error for an undefined command (log as LaTeX writes it). */
const latexUndefined = (line: string): RenderError => ({
  message: 'Undefined control sequence.',
  backend: 'latex',
  line: 1,
  log:
    '! Undefined control sequence.\n' +
    `<argument> ...isvgm:raw <g id='unique000'>}${line} \n` +
    '                                                  {x}\\special {dvisvgm:raw <...\n' +
    'l.8 \\end{align*}\n',
});

describe('describeRenderError', () => {
  it('says what the formula left open instead of naming the align* wrapper', () => {
    const open = mathjax('Missing \\begin{align*} or extra \\end{align*}');
    expect(describe_(open, 'x^')).toBe('^ at the end needs an argument, as in x^{2}.');
    expect(describe_(open, 'x_ ')).toBe('_ at the end needs an argument, as in x_{2}.');
    expect(describe_(open, '\\left( x')).toBe(
      '\\left needs a matching \\right (\\right. closes it without a delimiter).',
    );
    expect(describe_(open, '{')).toBe('Missing close brace.');
    expect(describe_(mathjax('Missing argument for \\end'), '\\frac')).toBe(
      '\\frac at the end is missing its argument.',
    );
    expect(describe_(mathjax('\\begin{pmatrix} ended with \\end{align*}'), 'x')).toBe(
      '\\begin{pmatrix} is never closed: add \\end{pmatrix}.',
    );
    expect(describe_(mathjax('\\begin{align*} ended with \\end{pmatrix}'), 'x')).toBe(
      '\\end{pmatrix} has no matching \\begin{pmatrix}.',
    );
    // Nothing recognisable: still no wrapper in the message.
    expect(describe_(open, 'a')).not.toMatch(/align/);
  });

  it('does the same for the companion, whose LaTeX notices it later', () => {
    const missingOpen: RenderError = { message: 'Missing { inserted.', backend: 'latex' };
    expect(describe_(missingOpen, 'x^')).toBe('^ at the end needs an argument, as in x^{2}.');
    const missingClose: RenderError = { message: 'Missing } inserted.', backend: 'latex' };
    expect(describe_(missingClose, '\\frac{a')).toBe('Missing close brace.');
    // Other causes keep LaTeX's own message.
    expect(describe_(missingOpen, 'a')).toBe('Missing { inserted.');
  });

  it('names the undefined command and the package it comes from', () => {
    expect(describe_(mathjax('Undefined control sequence \\cancel'), '\\cancel{x}')).toBe(
      'Undefined control sequence \\cancel. It comes from the "cancel" package: add it under Packages.',
    );
    expect(describe_(mathjax('Undefined control sequence \\foo'), '\\foo')).toBe(
      'Undefined control sequence \\foo.',
    );
    // The companion names it only in its log.
    expect(describe_(latexUndefined('a+\\foo'), 'a+\\foo{x}')).toBe(
      'Undefined control sequence \\foo.',
    );
    expect(describe_(latexUndefined('\\qty'), '\\qty{x}')).toBe(
      'Undefined control sequence \\qty. It comes from the "physics" package: add it under Packages.',
    );
    // Already loaded (but not enough, e.g. unsupported by MathJax): no advice to add it.
    expect(describe_(mathjax('Undefined control sequence \\bm'), '\\bm{x}', ['bm'])).toBe(
      'Undefined control sequence \\bm.',
    );
  });

  it('gives the line only when the formula has more than one', () => {
    const error: RenderError = { message: 'Missing $ inserted.', backend: 'latex', line: 2 };
    expect(describe_(error, 'a')).toBe('Missing $ inserted.');
    expect(describe_(error, 'a\n\\text{b')).toBe('Missing $ inserted. (line 2)');
  });

  it('leaves other messages alone', () => {
    expect(describe_(mathjax('Missing close brace'), '\\frac{a')).toBe('Missing close brace');
    expect(describe_(mathjax("Unknown environment 'foo'"), 'x')).toBe("Unknown environment 'foo'");
  });
});
