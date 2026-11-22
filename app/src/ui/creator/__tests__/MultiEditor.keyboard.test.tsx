import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { resolveFormula, toSnapshot } from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import { createEmptyProject, createFormula } from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore } from '../../../store';
import { MultiEditor } from '../MultiEditor';

beforeEach(async () => {
  const project = createEmptyProject();
  const result = await createMockEngine().render({
    kind: 'math',
    latex: 'abc',
    packages: [],
    preamble: '',
    target: 'ce',
    fontSize: 48,
    prefer: 'auto',
  });
  if (!result.ok) throw new Error(result.error.message);
  project.formulas = ['first', 'second'].map((id) => ({
    ...createFormula({ name: id, source: 'abc', snapshot: toSnapshot(result.render) }),
    id,
  }));
  loadProject(project);
  useRenderStore.setState({ entries: {}, resolved: new Map() });
  for (const formula of project.formulas) {
    useRenderStore.getState().setEntry(formula.id, {
      status: 'ok',
      resolved: resolveFormula(formula, result.render),
      error: null,
    });
  }
});

it('picks particular glyphs by keyboard in both views and preserves selection and focus through undo', async () => {
  const user = userEvent.setup();
  render(<MultiEditor ids={['first', 'second']} onClose={() => {}} />);
  const first = within(screen.getByTestId('multi-card-first')).getByRole('button', {
    name: 'Glyph 1: b',
  });
  const second = within(screen.getByTestId('multi-card-second')).getByRole('button', {
    name: 'Glyph 1: b',
  });
  first.focus();
  await user.keyboard('{Enter}');
  second.focus();
  await user.keyboard('{Control>} {/Control}');
  expect(first).toHaveAttribute('aria-pressed', 'true');
  expect(second).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('multi-summary')).toHaveTextContent('2 glyphs in 2 formulas');
  fireEvent.click(screen.getByTestId('multi-palette-YELLOW'));
  expect(useProjectStore.getState().project.formulas.map((f) => f.glyphColors)).toEqual([
    { '1': '#FFFF00' },
    { '1': '#FFFF00' },
  ]);
  expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  act(() => history.undo());
  expect(useProjectStore.getState().project.formulas.map((f) => f.glyphColors)).toEqual([{}, {}]);
  expect(second).toHaveFocus();
  expect(second).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByTestId('multi-view-cards'));
  expect(screen.getByTestId('multi-second-chip-1')).toBe(second);
  expect(second).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByTestId('multi-hide'));
  expect(useProjectStore.getState().project.formulas.map((f) => f.hiddenGlyphs)).toEqual([
    [1],
    [1],
  ]);
  expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  act(() => history.undo());
  expect(useProjectStore.getState().project.formulas.map((f) => f.hiddenGlyphs)).toEqual([[], []]);
  expect(second).toHaveFocus();
  fireEvent.click(screen.getByTestId('multi-view-grid'));
  expect(first).toHaveAttribute('aria-pressed', 'true');
});
