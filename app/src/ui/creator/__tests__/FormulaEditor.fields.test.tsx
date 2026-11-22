/* The object fields of the formula editor, by kind: a size is the font size of what is typeset
 * from a source; a brace and a shape are fitted to their target and have none to set. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine, type Engine } from '../../../engine/engine';
import { createCompanionClient } from '../../../engine/companion';
import { fakeCompanion } from '../../../engine/__tests__/fakeCompanion';
import {
  createBraceFormula,
  createEmptyProject,
  createFormula,
  createShapeFormula,
  type Formula,
} from '../../../model';
import { loadProject, useRenderStore } from '../../../store';
import { FormulaEditor } from '../FormulaEditor';

const hoisted = vi.hoisted(() => ({ engine: null as Engine | null }));
vi.mock('../../../engine/instance', () => ({ getEngine: () => hoisted.engine! }));

const fake = fakeCompanion(() => ({
  ok: false,
  error: { message: 'unused', line: null, log: '' },
}));
const client = createCompanionClient({ fetch: fake.fetch, autoStart: false, watchFocus: false });

function openEditor(formula: Formula) {
  const project = createEmptyProject();
  project.formulas.push(formula);
  loadProject(project);
  render(<FormulaEditor formulaId={formula.id} onClose={() => {}} />);
}

beforeEach(() => {
  fake.online = false;
  hoisted.engine = createEngine({ companion: client });
  useRenderStore.setState({ prefer: 'auto', entries: {}, resolved: new Map() });
});
afterEach(cleanup);

describe('the Size field of the formula editor', () => {
  it('is there for a formula: its scale and its font size', () => {
    openEditor(createFormula({ name: 'f1', source: 'a+b' }));
    expect(screen.getByTestId('editor-scale')).toHaveValue('1');
    expect(screen.getByTestId('editor-font-size')).toHaveValue('48');
  });

  it.each([
    ['a brace', () => createBraceFormula({ name: 'b1', width: 2 })],
    ['a shape', () => createShapeFormula({ name: 's1', width: 2, height: 1 })],
  ])('is not there for %s, which is fitted to its target', (_what, make) => {
    openEditor(make());
    // The rest of the object's fields are: its name, its colour, what its clips appear with.
    expect(screen.getByTestId('editor-name')).toBeInTheDocument();
    expect(screen.getByTestId('editor-color')).toBeInTheDocument();
    expect(screen.getByTestId('editor-intro')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-scale')).toBeNull();
    expect(screen.queryByTestId('editor-font-size')).toBeNull();
    expect(screen.queryByText('Manim font_size')).toBeNull();
  });
});
