// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXT_LAYOUT } from '../../model';
import { mathJaxTextSource, parboxPoints, texNumber, texSource, textRows } from '../textSource';

const layout = (patch: Partial<typeof DEFAULT_TEXT_LAYOUT>) => ({
  ...DEFAULT_TEXT_LAYOUT,
  ...patch,
});

describe('texSource', () => {
  it('leaves a text as wide as it comes, centred, at the normal spacing alone', () => {
    expect(texSource({ source: 'Hello $x$', layout: layout({}), fontSize: 48 }, 'ce')).toBe(
      'Hello $x$',
    );
  });

  it('puts a width into a \\parbox of as many TeX points as the scene units take', () => {
    // CE: W · 960 / (0.99626 · font_size); GL: W · 144 · h₀ / (0.99626 · font_size).
    expect(parboxPoints(4, 48, 'ce')).toBeCloseTo((4 * 960) / 48 / (72 / 72.27), 6);
    expect(parboxPoints(4, 48, 'gl')).toBeCloseTo((4 * 144 * 6.874222) / 48 / (72 / 72.27), 6);
    expect(texSource({ source: 'Hello', layout: layout({ width: 4 }), fontSize: 48 }, 'ce')).toBe(
      '\\parbox{80.3pt}{\\centering Hello\\par}',
    );
    expect(texSource({ source: 'Hello', layout: layout({ width: 4 }), fontSize: 48 }, 'gl')).toBe(
      '\\parbox{82.8pt}{\\centering Hello\\par}',
    );
    // Half the size, twice the points: the box stays 4 units wide.
    expect(texSource({ source: 'Hello', layout: layout({ width: 4 }), fontSize: 24 }, 'ce')).toBe(
      '\\parbox{160.6pt}{\\centering Hello\\par}',
    );
  });

  it('aligns the lines inside the width and spreads them', () => {
    const left = layout({ width: 2, align: 'left', lineSpacing: 1.5 });
    expect(texSource({ source: 'a b', layout: left, fontSize: 48 }, 'ce')).toBe(
      '\\parbox{40.15pt}{\\raggedright \\linespread{1.5}\\selectfont a b\\par}',
    );
    const right = layout({ width: 2, align: 'right' });
    expect(texSource({ source: 'a b', layout: right, fontSize: 48 }, 'ce')).toMatch(
      /^\\parbox\{40\.15pt\}\{\\raggedleft a b\\par\}$/,
    );
    // Without a width the spacing still applies, in a group of its own.
    expect(
      texSource({ source: 'a\\\\b', layout: layout({ lineSpacing: 0.8 }), fontSize: 48 }, 'gl'),
    ).toBe('{\\linespread{0.8}\\selectfont a\\\\b\\par}');
  });

  it('writes numbers with up to four decimals and no trailing zeros', () => {
    expect(texNumber(80.3)).toBe('80.3');
    expect(texNumber(1)).toBe('1');
    expect(texNumber(1.23456)).toBe('1.2346');
  });
});

describe('textRows', () => {
  it('breaks at \\\\ and at blank lines, joins the lines of a paragraph, drops empty rows', () => {
    expect(textRows('Hello\nworld \\\\ bye\\\\[2pt]\n\n  Next   one\n')).toEqual([
      'Hello world',
      'bye',
      'Next one',
    ]);
    expect(textRows('')).toEqual([]);
    expect(textRows('  \n\n ')).toEqual([]);
  });
});

describe('mathJaxTextSource', () => {
  it('stacks the rows in text mode, centred or aligned, with the spacing as a row gap', () => {
    expect(mathJaxTextSource(['a', 'b $x$'], layout({}))).toBe(
      '\\begin{gathered}\\text{a}\\\\\\text{b $x$}\\end{gathered}',
    );
    expect(mathJaxTextSource(['a', 'b'], layout({ align: 'left' }))).toBe(
      '\\begin{array}{l}\\text{a}\\\\\\text{b}\\end{array}',
    );
    expect(mathJaxTextSource(['a', 'b'], layout({ align: 'right', lineSpacing: 1.5 }))).toBe(
      '\\begin{array}{r}\\text{a}\\\\[0.6em]\\text{b}\\end{array}',
    );
  });
});
