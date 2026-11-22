// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFormula } from '../../model';
import { createMockEngine } from '../../test/mockEngine';
import { toSnapshot } from '../key';
import { resolveFormula, resolveFormulaTransition } from '../resolve';

async function overlappingOccurrences() {
  const result = await createMockEngine().render({
    kind: 'math',
    latex: 'a+a',
    packages: [],
    preamble: '',
    target: 'ce',
    fontSize: 48,
    prefer: 'mathjax',
  });
  if (!result.ok) throw new Error(result.error.message);
  const render = {
    ...result.render,
    glyphs: result.render.glyphs.map((glyph, index) =>
      index === 2
        ? {
            ...glyph,
            bbox: result.render.glyphs[0]!.bbox,
            contours: result.render.glyphs[0]!.contours,
          }
        : glyph,
    ),
  };
  const formula = createFormula({
    source: 'a+a',
    snapshot: { ...toSnapshot(render), key: 'before' },
    glyphColors: { '0': '#FF0000', '2': '#0000FF' },
  });
  const previous = { ...resolveFormula(formula, render), confidence: 0.9 };
  return { formula, render, previous };
}

describe('retained render across canonical transitions', () => {
  it('keeps the two overlapping a occurrences distinct through the published map and its inverse', async () => {
    const { formula, render, previous } = await overlappingOccurrences();
    const next = {
      ...formula,
      snapshot: { ...formula.snapshot!, key: 'after' },
      glyphColors: { '2': '#FF0000', '0': '#0000FF' },
    };
    const transition = { from: 'before', to: 'after', map: [2, 1, 0] };
    // Geometry alone cannot distinguish the two a occurrences.
    expect(resolveFormula(next, render).canonToRender).toEqual([0, 1, 2]);
    const resolved = resolveFormulaTransition(next, previous, transition);
    expect(resolved.canonToRender).toEqual([2, 1, 0]);
    expect(resolved.formula.glyphColors['0']).toBe('#0000FF');
    expect(resolved.render.glyphs[resolved.canonToRender[0]!]!.index).toBe(2);
    expect(resolved.confidence).toBe(0.9);
    const undone = resolveFormulaTransition(formula, resolved, transition);
    expect(undone.canonToRender).toEqual([0, 1, 2]);
    expect(undone.confidence).toBe(0.9);
  });

  it('does not apply a transition from another canonical revision', async () => {
    const { formula, previous } = await overlappingOccurrences();
    const next = { ...formula, snapshot: { ...formula.snapshot!, key: 'after' } };
    const result = resolveFormulaTransition(next, previous, {
      from: 'unrelated',
      to: 'after',
      map: [2, 1, 0],
    });
    expect(result.canonToRender).toEqual([0, 1, 2]);
  });

  it.each([{ map: [0, 0, 2] }, { map: [0, 1, 9] }])(
    'does not trust an invalid transition $map',
    async ({ map }) => {
      const { formula, previous } = await overlappingOccurrences();
      const next = { ...formula, snapshot: { ...formula.snapshot!, key: 'after' } };
      expect(
        resolveFormulaTransition(next, previous, { from: 'before', to: 'after', map })
          .canonToRender,
      ).toEqual([0, 1, 2]);
    },
  );

  it('leaves an added canonical glyph absent from the retained render and reports partial coverage', async () => {
    const { formula, previous } = await overlappingOccurrences();
    const glyphs = formula.snapshot!.glyphs;
    const next = {
      ...formula,
      snapshot: {
        ...formula.snapshot!,
        key: 'after',
        glyphs: [glyphs[2]!, glyphs[0]!, glyphs[1]!, { ...glyphs[0]!, label: 'b' }],
      },
    };
    const result = resolveFormulaTransition(next, previous, {
      from: 'before',
      to: 'after',
      map: [1, 2, 0],
    });
    expect(result.canonToRender).toEqual([2, 0, 1, null]);
    expect(result.confidence).toBe(0.75);
  });
});
