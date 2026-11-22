import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKEND_VERSIONS, renderKey, type ResolvedFormula } from '../../../engine';
import { packagesOf, parseProject, type Project } from '../../../model';
import { loadProject, useProjectStore, useRenderStore } from '../../../store';
import { PythonExportDialog } from '../PythonExportDialog';

/* The generator is run while the dialog draws. Whatever it throws at — a state of a project in
 * error that it was not written for (audit A8-01: a relation window before 0 s) — is the
 * dialog's to say, not the whole app's to fall with. */
const generator = vi.hoisted(() => ({ fails: false }));
vi.mock('../../../export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../export')>();
  return {
    ...actual,
    generatePython: (...args: Parameters<typeof actual.generatePython>) => {
      if (generator.fails) throw new TypeError("Cannot read properties of undefined (reading 'x')");
      return actual.generatePython(...args);
    },
  };
});

function hello(): Project {
  const parsed = parseProject(
    readFileSync(path.resolve(process.cwd(), '../examples/hello.mfe.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.project;
}

function renderAll(project: Project) {
  for (const formula of project.formulas) {
    const key = renderKey(
      {
        kind: 'math',
        latex: formula.source,
        packages: packagesOf(formula),
        preamble: project.meta.preamble,
        target: project.meta.target,
        fontSize: formula.fontSize,
        prefer: 'auto',
      },
      'latex',
      BACKEND_VERSIONS.latex,
    );
    const resolved = {
      formula,
      render: {
        key,
        backend: 'latex',
        exact: true,
        target: project.meta.target,
        fontSize: formula.fontSize,
        glyphs: [],
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        warnings: [],
      },
      canonToRender: formula.snapshot!.glyphs.map((_, i) => i),
      confidence: 1,
    } as unknown as ResolvedFormula;
    useRenderStore.getState().setEntry(formula.id, { status: 'ok', resolved, error: null });
  }
}

beforeEach(() => {
  generator.fails = false;
  useRenderStore.getState().retain([]);
  loadProject(hello());
  renderAll(useProjectStore.getState().project);
});

describe('PythonExportDialog, when the generator throws', () => {
  it('says so in the dialog, with no code to copy or download', () => {
    generator.fails = true;
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    const failure = screen.getByTestId('export-python-failure');
    expect(failure).toHaveAttribute('role', 'alert');
    expect(failure).toHaveTextContent('The scene could not be written as Python');
    expect(failure).toHaveTextContent("Cannot read properties of undefined (reading 'x')");
    expect(screen.queryByTestId('export-python-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-python-waiting')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-python-copy')).toBeDisabled();
    expect(screen.getByTestId('export-python-download')).toBeDisabled();
  });

  it('writes the code again once the project is one it can write', () => {
    generator.fails = true;
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(screen.getByTestId('export-python-failure')).toBeInTheDocument();
    generator.fails = false;
    act(() => useProjectStore.getState().update((draft) => void (draft.meta.name = 'Again')));
    expect(screen.queryByTestId('export-python-failure')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-python-code')).toHaveTextContent('MathTex(r"mx+y=0")');
  });
});
