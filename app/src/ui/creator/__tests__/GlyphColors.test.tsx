import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFormula, toSnapshot, type FormulaRender } from '../../../engine';
import { rectContour } from '../../../geom';
import { createEmptyProject, createFormula, type Formula } from '../../../model';
import { loadProject, useProjectStore } from '../../../store';
import { PREFERENCES_STORAGE_KEY, usePreferences } from '../../preferences';
import { GlyphColors, type GlyphEdits } from '../GlyphColors';
import { GlyphListToggle } from '../GlyphListToggle';

/** A render of `labels`, one box per glyph, in a row. */
function rendered(labels: string): FormulaRender {
  const glyphs = [...labels].map((label, index) => {
    const bbox = { minX: index, minY: 0, maxX: index + 0.8, maxY: 1 };
    return { index, label, kind: 'char' as const, contours: [rectContour(bbox)], bbox };
  });
  return {
    key: labels,
    backend: 'latex',
    exact: true,
    target: 'ce',
    fontSize: 48,
    glyphs,
    bbox: { minX: 0, minY: 0, maxX: labels.length, maxY: 1 },
    warnings: [],
  };
}

function view(formula: Formula, edits?: GlyphEdits, emptyHint?: string) {
  const picture = formula.snapshot ? rendered(formula.snapshot.key) : null;
  return render(
    <GlyphColors
      formula={formula}
      resolved={picture ? resolveFormula(formula, picture) : null}
      background="#000000"
      stale={false}
      edits={edits}
      emptyHint={emptyHint}
    />,
  );
}

const formulaOf = (fields: Partial<Formula> = {}) =>
  ({
    ...createFormula({ name: 'f', source: 'abc' }),
    snapshot: toSnapshot(rendered('abc')),
    ...fields,
  }) as Formula;

beforeEach(() => {
  const project = createEmptyProject();
  project.formulas = [formulaOf({ hiddenGlyphs: [2] })];
  loadProject(project);
  usePreferences.setState({ glyphList: false });
});
afterEach(cleanup);

/** Glyph `index` in the drawing. */
const glyph = (index: number) => screen.getByTestId(`glyph-${index}`);
const chips = () => screen.queryAllByTestId(/^glyph-chip-\d+$/);

describe('the glyph view', () => {
  it('writes to the project by default, one undo step each', () => {
    const formula = useProjectStore.getState().project.formulas[0]!;
    view(formula);
    fireEvent.click(glyph(1));
    fireEvent.click(screen.getByTestId('palette-RED'));
    fireEvent.click(screen.getByTestId('glyph-hide'));
    const now = useProjectStore.getState().project.formulas[0]!;
    expect(now.glyphColors).toEqual({ '1': '#FC6255' });
    expect(now.hiddenGlyphs).toEqual([1, 2]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(2);
  });

  it('hands its edits to the caller that takes them, and leaves the project alone', () => {
    const before = useProjectStore.getState().project;
    const edits = { color: vi.fn(), hidden: vi.fn(), clearColors: vi.fn() };
    // A draft: glyphs the project does not have, under the id of an object it has.
    const draft = formulaOf({
      id: before.formulas[0]!.id,
      glyphColors: { '0': '#00ff00' },
      hiddenGlyphs: [2],
    });
    view(draft, edits);
    fireEvent.click(glyph(0));
    fireEvent.click(glyph(1), { shiftKey: true });
    fireEvent.click(screen.getByTestId('palette-RED'));
    expect(edits.color).toHaveBeenLastCalledWith([0, 1], '#FC6255');
    fireEvent.click(screen.getByTestId('glyph-clear-selected'));
    expect(edits.color).toHaveBeenLastCalledWith([0, 1], null);
    fireEvent.click(screen.getByTestId('glyph-hide'));
    expect(edits.hidden).toHaveBeenLastCalledWith([0, 1], true);
    fireEvent.click(screen.getByTestId('glyph-show-all'));
    expect(edits.hidden).toHaveBeenLastCalledWith([2], false);
    fireEvent.click(screen.getByTestId('glyph-clear-all'));
    expect(edits.clearColors).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('says what the caller says where there are no glyphs', () => {
    view(formulaOf({ snapshot: null }), undefined, 'Nothing to colour yet.');
    expect(screen.getByTestId('glyph-view-empty').textContent).toBe('Nothing to colour yet.');
  });
});

describe('the list of glyphs under the drawing', () => {
  it('is left out unless the preference asks for it', () => {
    view(useProjectStore.getState().project.formulas[0]!);
    expect(screen.queryByTestId('glyph-chips')).toBeNull();
    expect(chips()).toHaveLength(0);
    // The drawing and the tools do not depend on it.
    expect(glyph(2)).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByTestId('glyph-select-all')).toBeEnabled();
  });

  it('shows a key per glyph, which picks it as a click on the drawing does', () => {
    usePreferences.setState({ glyphList: true });
    view(useProjectStore.getState().project.formulas[0]!);
    expect(chips().map((chip) => chip.getAttribute('data-label'))).toEqual(['a', 'b', 'c']);
    expect(chips()[2]).toHaveAttribute('data-hidden', 'true');
    fireEvent.click(chips()[0]!);
    fireEvent.click(chips()[1]!, { ctrlKey: true });
    expect(chips().map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'false',
    ]);
    expect(glyph(0)).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('glyph-selection').textContent).toBe('2 selected: 0, 1');
  });

  it('comes and goes with its key, without the selection, and the browser remembers it', () => {
    const formula = useProjectStore.getState().project.formulas[0]!;
    render(<GlyphListToggle />);
    view(formula);
    const key = screen.getByTestId('glyph-list-toggle');
    expect(key).toHaveAttribute('aria-pressed', 'false');
    expect(key).toHaveAccessibleName('Glyph list');
    fireEvent.click(glyph(1));

    fireEvent.click(key);
    expect(key).toHaveAttribute('aria-pressed', 'true');
    expect(chips()).toHaveLength(3);
    expect(chips()[1]).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!).glyphList).toBe(true);

    fireEvent.click(key);
    expect(key).toHaveAttribute('aria-pressed', 'false');
    expect(chips()).toHaveLength(0);
    expect(screen.getByTestId('glyph-selection').textContent).toBe('1 selected: 1');
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!).glyphList).toBe(false);
  });

  it('has a key that cannot be pressed where there is nothing to list', () => {
    render(<GlyphListToggle disabled />);
    fireEvent.click(screen.getByTestId('glyph-list-toggle'));
    expect(screen.getByTestId('glyph-list-toggle')).toBeDisabled();
    expect(usePreferences.getState().glyphList).toBe(false);
  });
});
