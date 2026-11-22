/* The formula editor's live preview and the companion: it follows the companion as it comes and
 * goes, and a render that throws is an error, not "Rendering…" for good. */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine, type Engine } from '../../../engine/engine';
import { createCompanionClient } from '../../../engine/companion';
import { fakeCompanion } from '../../../engine/__tests__/fakeCompanion';
import fracSvg from '../../../engine/__tests__/fixtures/frac.svg?raw';
import { createEmptyProject, createFormula } from '../../../model';
import { loadProject, useRenderStore } from '../../../store';
import { FormulaEditor } from '../FormulaEditor';

const hoisted = vi.hoisted(() => ({ engine: null as Engine | null }));
vi.mock('../../../engine/instance', () => ({ getEngine: () => hoisted.engine! }));

const fake = fakeCompanion(() => ({
  ok: true,
  svg: fracSvg,
  glyphs: [
    { label: 'a', kind: 'char', font: 'cmmi10', code: 97 },
    { label: '—', kind: 'rule', font: null, code: null },
    { label: 'b', kind: 'char', font: 'cmmi10', code: 98 },
  ],
  cached: false,
  ms: 1,
  warnings: [],
}));
const client = createCompanionClient({ fetch: fake.fetch, autoStart: false, watchFocus: false });

function openEditor() {
  const project = createEmptyProject();
  const formula = createFormula({ name: 'f1', source: '\\frac{a}{b}' });
  project.formulas.push(formula);
  loadProject(project);
  render(<FormulaEditor formulaId={formula.id} onClose={() => {}} />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  hoisted.engine = createEngine({ companion: client });
  useRenderStore.setState({ prefer: 'latex', entries: {}, resolved: new Map() });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('formula editor preview', () => {
  it('renders again when the companion comes up', async () => {
    fake.online = false;
    await client.check();
    openEditor();
    expect(await screen.findByTestId('editor-error')).toHaveTextContent(/not running/);
    fake.online = true;
    await act(async () => {
      await client.check();
    });
    expect(await screen.findByText('3 glyphs · exact (LaTeX)')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-error')).not.toBeInTheDocument();
  });

  it('shows a render that throws as an error', async () => {
    hoisted.engine = {
      ...createEngine({ companion: client }),
      render: () => Promise.reject(new Error('boom')),
    };
    openEditor();
    expect(await screen.findByTestId('editor-error')).toHaveTextContent(
      'This formula could not be rendered (internal error: boom).',
    );
  });
});
