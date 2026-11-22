/* The thumbnail of an object paints each glyph as the Preview does: a text glyph is filled, the
 * shaft of an arrow and the outline of a box are stroked and empty, an arrow's tip is filled. */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  producerOf,
  renderRequestFor,
  resolveFormula,
  type ResolvedFormula,
} from '../../../engine';
import { createFormula, createLineFormula, createShapeFormula, type Formula } from '../../../model';
import { FormulaThumb } from '../FormulaThumb';
import { drawnGlyphs } from '../glyphPaths';

/** `formula` as its producer builds it in the browser. */
function resolved(formula: Formula): ResolvedFormula {
  const request = renderRequestFor(formula, { preamble: '', target: 'ce' }, 'auto');
  const result = producerOf(formula.kind).free(request, 'key');
  if (!result.ok) throw new Error('no render');
  return resolveFormula(formula, result.render);
}

/** How the thumbnail of `formula` paints each of its glyphs, in their order: the paths that fill
 * it and the ones that stroke it (a stroke may be set on the group of its paths). */
function paintsOf(formula: Formula) {
  const drawn = resolved(formula);
  const { container } = render(
    <FormulaThumb formula={formula} resolved={drawn} background="#000000" />,
  );
  const paths = [...container.querySelectorAll('path')];
  const attribute = (path: Element, name: string) =>
    path.closest(`[${name}]`)?.getAttribute(name) ?? null;
  return drawnGlyphs(drawn).map((glyph) => {
    const own = paths.filter((path) => path.getAttribute('d') === glyph.d);
    return {
      paths: own,
      fills: own.filter((path) => (attribute(path, 'fill') ?? 'black') !== 'none'),
      strokes: own.filter((path) => (attribute(path, 'stroke') ?? 'none') !== 'none'),
      stroke: own.map((path) => attribute(path, 'stroke')).find((value) => value !== null),
    };
  });
}

describe('FormulaThumb', () => {
  it('strokes the shaft of a bent arrow, which has no fill, and fills its tip', () => {
    const arrow = createLineFormula({
      line: 'arrow',
      vector: [4, 0],
      color: '#FFFF00',
      curve: { shape: 'arc', degrees: 60, trim: 0 },
    });
    const [shaft, tip] = paintsOf(arrow);
    expect(shaft!.fills).toHaveLength(0);
    expect(shaft!.stroke).toBe('#FFFF00');
    // The stroke at its width in the scene (6 hundredths), and a hairline that keeps a thin line
    // seen in a small thumbnail.
    expect(shaft!.strokes.map((path) => path.getAttribute('stroke-width'))).toContain('0.06');
    expect(
      shaft!.strokes.some((path) => path.getAttribute('vector-effect') === 'non-scaling-stroke'),
    ).toBe(true);
    expect(tip!.fills).toHaveLength(1);
    expect(tip!.fills[0]).toHaveAttribute('fill', '#FFFF00');
  });

  it('strokes a box and leaves it empty; a fill of its own is painted in its colour', () => {
    const box = createShapeFormula({ shape: 'box', width: 2, height: 1, color: '#FFFF00' });
    const [outline] = paintsOf(box);
    expect(outline!.fills).toHaveLength(0);
    expect(outline!.stroke).toBe('#FFFF00');

    const filled = createShapeFormula({
      shape: 'box',
      width: 2,
      height: 1,
      color: '#FFFF00',
      fillColor: '#FF0000',
      style: { fillOpacity: 0.5, strokeWidth: 4, strokeOpacity: 1 },
    });
    const [painted] = paintsOf(filled);
    expect(painted!.fills).toHaveLength(1);
    expect(painted!.fills[0]).toHaveAttribute('fill', '#FF0000');
    expect(painted!.fills[0]).toHaveAttribute('fill-opacity', '0.5');
    expect(painted!.stroke).toBe('#FFFF00');
  });

  it('fills the glyphs of a formula, one path each, without a stroke', () => {
    const formula = createFormula({ source: 'a+b', color: '#FFFFFF' });
    const glyphs = paintsOf(formula);
    expect(glyphs).toHaveLength(3);
    for (const glyph of glyphs) {
      expect(glyph.paths).toHaveLength(1);
      expect(glyph.fills).toHaveLength(1);
      expect(glyph.fills[0]).toHaveAttribute('fill', '#FFFFFF');
      expect(glyph.strokes).toHaveLength(0);
    }
  });
});
