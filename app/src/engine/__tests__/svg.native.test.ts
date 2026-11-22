// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDvisvgmSvg } from '../svg';
import { latexToSvg } from './texTools';

describe('parseDvisvgmSvg on live LaTeX output', () => {
  it('counts the glyphs of a few formulas like Manim', () => {
    const cases: [string, number][] = [
      ['\\sqrt{x+1}', 5],
      ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 6],
      ['\\text{office}', 4],
    ];
    for (const [tex, n] of cases) expect(parseDvisvgmSvg(latexToSvg(tex, 'ce'))).toHaveLength(n);
    expect(parseDvisvgmSvg(latexToSvg('\\text{office}', 'gl'))).toHaveLength(6);
  });

  it('reads the fill of a colour group as dvisvgm writes it', () => {
    const shapes = parseDvisvgmSvg(latexToSvg('a {\\color[RGB]{0,0,1}+} b', 'ce', ['xcolor']));
    expect(shapes.map((s) => s.fill)).toEqual([undefined, '#000001', undefined]);
  });
});
