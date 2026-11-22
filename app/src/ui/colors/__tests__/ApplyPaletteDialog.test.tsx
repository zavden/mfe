import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createFormula } from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import { history, loadProject, useProjectStore } from '../../../store';
import { useDocumentStore } from '../../project/documentStore';
import { ApplyPaletteDialog } from '../ApplyPaletteDialog';
import type { ApplyPaletteSnapshot } from '../applyPaletteActions';

const palette: ApplyPaletteSnapshot = {
  id: 'palette-a',
  revision: 1,
  displayName: 'Course',
  colors: {
    background: '#102030',
    formula: '#E0E1E2',
    variable: '#AABBCC',
    constant: '#CCDDEE',
    operator: '#345678',
    result: '#56789A',
    text: '#C1C2C3',
    muted: '#919293',
    rectangle: '#123456',
    circle: '#789ABC',
    arrow: '#ABCDEF',
  },
};

function setup() {
  const project = smallProject();
  loadProject(project);
  useDocumentStore.getState().beginDocument(project, { fileName: null, handle: null });
  return project;
}

afterEach(() => {
  cleanup();
  loadProject(createEmptyProject());
});

describe('ApplyPaletteDialog', () => {
  it('previews named skipped objects and applies with an optional background in one undo', () => {
    const project = setup();
    project.tracks[0]!.locked = true;
    const onClose = vi.fn();
    render(<ApplyPaletteDialog palette={palette} readPalette={() => palette} onClose={onClose} />);
    expect(screen.getByTestId('apply-palette-name')).toHaveTextContent('Course');
    expect(screen.getByTestId('apply-palette-counts')).toHaveTextContent(
      '1 object will change. 1 object skipped.',
    );
    expect(screen.getByTestId('apply-palette-skipped')).toHaveTextContent(
      'a: used on a locked track.',
    );
    expect(screen.getByTestId('apply-palette-background')).toBeChecked();
    expect(screen.getByTestId('apply-palette-background-note')).toHaveTextContent(
      'including behind locked objects',
    );
    fireEvent.click(screen.getByTestId('apply-palette-background'));
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().project.meta.background).toBe(project.meta.background);
    expect(useProjectStore.getState().project.formulas[0]!.color).toBe(project.formulas[0]!.color);
    expect(useProjectStore.getState().project.formulas[1]!.color).toBe(palette.colors.formula);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => history.undo());
    expect(useProjectStore.getState().project).toBe(project);
  });

  it('requires another confirmation when the current palette differs from the visible snapshot', () => {
    const project = setup();
    let selected = palette;
    const onClose = vi.fn();
    render(<ApplyPaletteDialog palette={palette} readPalette={() => selected} onClose={onClose} />);
    selected = {
      ...palette,
      revision: 2,
      displayName: 'Changed',
      colors: { ...palette.colors, formula: '#FF0000' },
    };
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(useProjectStore.getState().project).toBe(project);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('apply-palette-name')).toHaveTextContent('Changed');
    expect(screen.getByTestId('apply-palette-status')).toHaveTextContent(
      'Review the updated preview',
    );
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(useProjectStore.getState().project.formulas[0]!.color).toBe('#FF0000');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can review a newly activated palette after the previous palette was removed', () => {
    const project = setup();
    let selected: ApplyPaletteSnapshot | null = palette;
    const readPalette = () => selected;
    const onClose = vi.fn();
    const view = render(
      <ApplyPaletteDialog palette={selected} readPalette={readPalette} onClose={onClose} />,
    );
    selected = null;
    view.rerender(
      <ApplyPaletteDialog palette={selected} readPalette={readPalette} onClose={onClose} />,
    );
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(screen.getByTestId('apply-palette-empty')).toHaveTextContent('Activate a palette');
    expect(screen.getByTestId('apply-palette-confirm')).toBeDisabled();

    selected = {
      ...palette,
      id: 'replacement',
      revision: 3,
      displayName: 'Replacement',
      colors: { ...palette.colors, formula: '#123789' },
    };
    view.rerender(
      <ApplyPaletteDialog palette={selected} readPalette={readPalette} onClose={onClose} />,
    );
    expect(screen.getByTestId('apply-palette-confirm')).toHaveTextContent('Review updated preview');
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(screen.getByTestId('apply-palette-name')).toHaveTextContent('Replacement');
    expect(screen.getByTestId('apply-palette-confirm')).toHaveTextContent('Apply palette');
    expect(useProjectStore.getState().project).toBe(project);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(useProjectStore.getState().project.formulas[0]!.color).toBe('#123789');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('refreshes locks discovered during commit cancellation without applying the new counts', () => {
    const project = setup();
    const onClose = vi.fn();
    render(<ApplyPaletteDialog palette={palette} readPalette={() => palette} onClose={onClose} />);
    const gesture = history.beginGesture(() => {
      useProjectStore.getState().amend((draft) => {
        draft.tracks[0]!.locked = true;
      });
      gesture.finishCancellation();
    });
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(onClose).not.toHaveBeenCalled();
    expect(useProjectStore.getState().project.formulas).toEqual(project.formulas);
    expect(useProjectStore.getState().project.meta.background).toBe(project.meta.background);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    expect(screen.getByTestId('apply-palette-counts')).toHaveTextContent(
      '1 object will change. 1 object skipped.',
    );
    expect(screen.getByTestId('apply-palette-status')).toHaveTextContent(
      'Review the updated preview',
    );
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().project.formulas[0]).toEqual(project.formulas[0]);
    expect(useProjectStore.getState().project.formulas[1]!.color).toBe(palette.colors.formula);
  });

  it('closes when the document is replaced and never applies to its reused IDs', () => {
    const project = setup();
    const onClose = vi.fn();
    const view = render(
      <ApplyPaletteDialog palette={palette} readPalette={() => palette} onClose={onClose} />,
    );
    const next = structuredClone(project);
    next.formulas[0]!.name = 'Replacement';
    act(() => {
      loadProject(next);
      useDocumentStore.getState().beginDocument(next, { fileName: null, handle: null });
    });
    expect(onClose).toHaveBeenCalled();
    view.unmount();
    expect(useProjectStore.getState().project).toBe(next);
    expect(history.canUndo()).toBe(false);
  });

  it('keeps a no-op disabled, including after excluding a background-only change', () => {
    const project = setup();
    project.formulas.forEach((formula) => {
      formula.color = palette.colors.formula.toLowerCase();
    });
    render(<ApplyPaletteDialog palette={palette} readPalette={() => palette} onClose={() => {}} />);
    expect(screen.getByTestId('apply-palette-confirm')).toBeEnabled();
    fireEvent.click(screen.getByTestId('apply-palette-background'));
    expect(screen.getByTestId('apply-palette-confirm')).toBeDisabled();
    expect(screen.getByTestId('apply-palette-noop')).toHaveTextContent('No colours would change.');
    expect(history.canUndo()).toBe(false);
  });

  it('allows a stale no-op to be refreshed and requires a separate confirmation of new objects', () => {
    const project = setup();
    project.meta.background = palette.colors.background;
    project.formulas.forEach((formula) => {
      formula.color = palette.colors.formula;
    });
    const onClose = vi.fn();
    render(<ApplyPaletteDialog palette={palette} readPalette={() => palette} onClose={onClose} />);
    expect(screen.getByTestId('apply-palette-confirm')).toBeDisabled();
    const added = createFormula({ name: 'Added after preview' });
    act(() =>
      useProjectStore.getState().update((draft) => {
        draft.formulas.push(added);
      }),
    );
    expect(screen.getByTestId('apply-palette-confirm')).toHaveTextContent('Review updated preview');
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(useProjectStore.getState().project.formulas[2]!.color).toBe('#FFFFFF');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('apply-palette-counts')).toHaveTextContent('1 object will change.');
    expect(screen.getByTestId('apply-palette-confirm')).toHaveTextContent('Apply palette');
    fireEvent.click(screen.getByTestId('apply-palette-confirm'));
    expect(useProjectStore.getState().project.formulas[2]!.color).toBe(palette.colors.formula);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps command ownership valid through StrictMode mounting and cancel changes nothing', () => {
    const project = setup();
    const onClose = vi.fn();
    render(
      <StrictMode>
        <ApplyPaletteDialog palette={palette} readPalette={() => palette} onClose={onClose} />
      </StrictMode>,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('apply-palette-confirm')).toBeEnabled();
    fireEvent.click(screen.getByTestId('apply-palette-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().project).toBe(project);
    expect(history.canUndo()).toBe(false);
  });
});
