import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createColorMatch,
  createEmptyProject,
  createFormula,
  createRelation,
  createTween,
  projectIdEntries,
  setIdGenerator,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { ColorMatchDialogHost } from '../ColorMatchDialog';
import { createPaletteMatchList } from '../colorMatchActions';
import { useColorMatchDialog } from '../colorMatchDialogStore';
import { emptyPaletteLibrary } from '../paletteLibrary';
import { usePaletteStore } from '../paletteStore';
import { installTestPalette } from './paletteFixtures';

const project = () => useProjectStore.getState().project;

beforeEach(() => {
  loadProject(createEmptyProject());
  useUiStore.setState({ selection: { kind: 'none' } });
  usePaletteStore.setState(usePaletteStore.getInitialState(), true);
  useColorMatchDialog.getState().close();
});

afterEach(() => {
  act(() => {
    useColorMatchDialog.getState().close();
    usePaletteStore.setState(usePaletteStore.getInitialState(), true);
    loadProject(createEmptyProject());
    useUiStore.setState({ selection: { kind: 'none' } });
  });
});

describe('Match colors from a palette', () => {
  it('creates four copied empty patterns with one undo, a free name and a globally unique project ID', () => {
    const entry = installTestPalette();
    const p = createEmptyProject();
    const formula = createFormula({
      source: 'x',
      color: '#123456',
      glyphColors: { '0': '#ABCDEF' },
    });
    p.formulas.push(formula);
    const a = createClip(formula.id, p.tracks[0]!.id, 0, 4, {
      actions: [createTween(1, 1, { color: '#FEDCBA' })],
    });
    const b = createClip(formula.id, p.tracks[0]!.id, 4, 8);
    p.clips.push(a, b);
    p.relations.push(createRelation(a.id, b.id));
    p.colorMatches.push(
      createColorMatch(entry.displayName),
      createColorMatch(`${entry.displayName} copy`),
    );
    loadProject(p);
    const before = project();
    const reserved = projectIdEntries(p).map((item) => item.id);
    const sequence = [...reserved, 'm_unique'];
    const generatedKinds: string[] = [];
    const restore = setIdGenerator((kind) => {
      generatedKinds.push(kind);
      const id = sequence.shift();
      if (!id) throw new Error('Unexpected identity allocation.');
      return id;
    });
    let id: string;
    try {
      id = createPaletteMatchList(entry.displayName, entry.source.colors);
    } finally {
      restore();
    }
    const list = project().colorMatches.at(-1)!;
    expect(list).toEqual({
      id: 'm_unique',
      name: 'Class palette copy 2',
      entries: [
        { pattern: '', color: entry.source.colors.variable },
        { pattern: '', color: entry.source.colors.constant },
        { pattern: '', color: entry.source.colors.operator },
        { pattern: '', color: entry.source.colors.result },
      ],
    });
    expect(id!).toBe(list.id);
    expect(id!).not.toBe(entry.id);
    expect(generatedKinds).toEqual(Array(reserved.length + 1).fill('m'));
    expect(project().formulas).toBe(before.formulas);
    expect(project().clips).toBe(before.clips);
    expect(project().relations).toBe(before.relations);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    history.undo();
    expect(project()).toBe(before);
    expect(usePaletteStore.getState().library.activePaletteId).toBe(entry.id);
    history.redo();
    expect(project().colorMatches.at(-1)).toEqual(list);
  });

  it('disables palette creation without an active palette and leaves project/history untouched', () => {
    installTestPalette(false);
    const existing = createColorMatch('Authored list');
    const p = createEmptyProject();
    p.colorMatches.push(existing);
    loadProject(p);
    useColorMatchDialog.getState().open(existing.id);
    render(<ColorMatchDialogHost />);
    const before = project();
    act(() => useColorMatchDialog.getState().openNewFromPalette());
    expect(screen.getByTestId('match-colors-from-palette')).toBeDisabled();
    expect(project()).toBe(before);
    expect(useColorMatchDialog.getState().shown).toBe(existing.id);
    expect(history.canUndo()).toBe(false);
  });

  it('opens the new list on its first empty pattern and never applies guessed semantic patterns', async () => {
    const entry = installTestPalette();
    const p = createEmptyProject();
    const formula = createFormula({
      source: 'x',
      color: '#123456',
      glyphColors: { '0': '#ABCDEF' },
    });
    const existing = createColorMatch('Authored list');
    p.formulas.push(formula);
    p.colorMatches.push(existing);
    loadProject(p);
    useUiStore.getState().select({ kind: 'formula', id: formula.id });
    useColorMatchDialog.getState().open(existing.id);
    const user = userEvent.setup();
    render(<ColorMatchDialogHost />);
    await user.click(screen.getByTestId('match-colors-from-palette'));
    expect(screen.getByTestId('match-colors-name')).toHaveValue(entry.displayName);
    expect(screen.getByTestId('match-colors-pattern-0')).toHaveFocus();
    expect(screen.getAllByTestId(/^match-colors-pattern-\d$/)).toHaveLength(4);
    for (let index = 0; index < 4; index++) {
      expect(screen.getByTestId(`match-colors-pattern-${index}`)).toHaveValue('');
    }
    expect(screen.getByTestId('match-colors-apply')).toBeDisabled();
    expect(project().formulas[0]).toEqual(formula);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    const template = project().colorMatches.at(-1)!;
    act(() => usePaletteStore.setState({ library: emptyPaletteLibrary(), revision: 2 }));
    expect(project().colorMatches.at(-1)).toBe(template);
    expect(screen.getByTestId('match-colors-from-palette')).toBeDisabled();
  });

  it('focuses the first pattern when opening a palette template from a closed dialog', () => {
    installTestPalette();
    useColorMatchDialog.getState().openNewFromPalette();
    render(<ColorMatchDialogHost />);
    expect(screen.getByTestId('match-colors-pattern-0')).toHaveFocus();
    expect(useColorMatchDialog.getState().focusFirstPattern).toBe(false);
  });
});
