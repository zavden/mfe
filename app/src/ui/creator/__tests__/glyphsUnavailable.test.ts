// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { glyphsUnavailable } from '../glyphsUnavailable';

const f = (source: string) => ({ kind: 'math' as const, name: 'f1', source, packages: [] });

describe('glyphsUnavailable', () => {
  it('says why a formula has no glyphs to show', () => {
    expect(glyphsUnavailable(f(' '), undefined)).toBe('f1 is empty.');
    expect(
      glyphsUnavailable(f('\\frac{a'), {
        status: 'error',
        error: { message: 'Missing close brace', backend: 'mathjax' },
      }),
    ).toBe('f1 does not render: Missing close brace');
    expect(glyphsUnavailable(f('\\quad'), { status: 'ok', error: null })).toBe(
      'f1 draws no glyphs.',
    );
    expect(glyphsUnavailable(f('x'), { status: 'loading', error: null })).toBe(
      'Rendering the glyphs…',
    );
    expect(glyphsUnavailable(f('x'), undefined)).toBe('Rendering the glyphs…');
  });
});
