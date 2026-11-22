// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fromFieldLatex, hasTopLevelBreaks, toFieldLatex } from '../alignedWrap';

describe('hasTopLevelBreaks', () => {
  it('finds row and column breaks outside any environment', () => {
    expect(hasTopLevelBreaks('a+b=c')).toBe(false);
    expect(hasTopLevelBreaks('A &= x_1 \\\\\n  &= x_2 \\\\\n  &= x_3')).toBe(true);
    expect(hasTopLevelBreaks('a \\\\ b')).toBe(true);
    expect(hasTopLevelBreaks('a & b')).toBe(true);
    expect(hasTopLevelBreaks('\\\\alpha')).toBe(true); // a row break, then the letters
    expect(hasTopLevelBreaks('')).toBe(false);
    expect(hasTopLevelBreaks('a\\')).toBe(false);
  });

  it('ignores escaped characters and comments', () => {
    expect(hasTopLevelBreaks('\\text{a \\& b}')).toBe(false);
    expect(hasTopLevelBreaks('\\{ \\} \\% \\_')).toBe(false);
    expect(hasTopLevelBreaks('a % b & c \\\\')).toBe(false);
    expect(hasTopLevelBreaks('a % b & c\nd \\\\ e')).toBe(true);
  });

  it('leaves the breaks inside an environment to that environment', () => {
    expect(hasTopLevelBreaks('\\begin{cases} a & b \\\\ c & d \\end{cases}')).toBe(false);
    expect(hasTopLevelBreaks('\\begin{aligned} a &= b \\\\ &= c \\end{aligned}')).toBe(false);
    expect(hasTopLevelBreaks('\\begin {pmatrix} 1 & 2 \\end {pmatrix}')).toBe(false);
    expect(hasTopLevelBreaks('\\begin{cases} a & b \\end{cases} \\\\ e')).toBe(true);
    expect(
      hasTopLevelBreaks(
        '\\begin{cases} \\begin{pmatrix} 1 & 2 \\end{pmatrix} & b \\end{cases} & e',
      ),
    ).toBe(true);
    // A stray \end opens nothing.
    expect(hasTopLevelBreaks('a \\end{cases} & b')).toBe(true);
    // \beginning is not \begin.
    expect(hasTopLevelBreaks('\\beginning & b')).toBe(true);
  });
});

describe('toFieldLatex', () => {
  it('wraps a formula with rows in aligned, on lines of its own', () => {
    expect(toFieldLatex('A &= x_1 \\\\\n  &= x_2')).toEqual({
      latex: '\\begin{aligned}\nA &= x_1 \\\\\n  &= x_2\n\\end{aligned}',
      wrapped: true,
    });
    // A trailing comment ends before \end{aligned}.
    expect(toFieldLatex('a \\\\ b % two rows').latex).toBe(
      '\\begin{aligned}\na \\\\ b % two rows\n\\end{aligned}',
    );
  });

  it('leaves other formulas as they are', () => {
    expect(toFieldLatex('a+b')).toEqual({ latex: 'a+b', wrapped: false });
    const cases = '\\begin{cases} a & b \\\\ c & d \\end{cases}';
    expect(toFieldLatex(cases)).toEqual({ latex: cases, wrapped: false });
  });
});

describe('fromFieldLatex', () => {
  it('removes the wrapper it added, as MathLive serialises it', () => {
    expect(fromFieldLatex('\\begin{aligned}A & =x_{1}\\\\ & =x_{2}\\end{aligned}', true)).toBe(
      'A & =x_{1}\\\\ & =x_{2}',
    );
    const shown = toFieldLatex('a & b \\\\ c & d');
    expect(fromFieldLatex(shown.latex, shown.wrapped)).toBe('a & b \\\\ c & d');
  });

  it('keeps an aligned environment the user wrote', () => {
    const own = '\\begin{aligned}a\\end{aligned}';
    expect(fromFieldLatex(own, false)).toBe(own);
  });

  it('keeps an environment inside the wrapper', () => {
    const inner = '\\begin{aligned}a\\end{aligned}\\\\ \\begin{cases}b & c\\end{cases}';
    expect(fromFieldLatex(`\\begin{aligned}${inner}\\end{aligned}`, true)).toBe(inner);
  });

  it('joins what was typed before or after the wrapper to the first or last row', () => {
    expect(fromFieldLatex('\\begin{aligned}a\\\\ b\\end{aligned}+1', true)).toBe('a\\\\ b+1');
    expect(fromFieldLatex('2\\begin{aligned}a\\\\ b\\end{aligned}', true)).toBe('2a\\\\ b');
  });

  it('reports a field that no longer starts with the wrapper as it is', () => {
    expect(fromFieldLatex('x', true)).toBe('x');
    expect(fromFieldLatex('\\begin{cases}a\\end{cases}', true)).toBe('\\begin{cases}a\\end{cases}');
    expect(fromFieldLatex('\\begin{aligned}a', true)).toBe('\\begin{aligned}a');
  });
});
