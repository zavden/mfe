import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createTexFormula,
  createTrack,
  groupFormulas,
} from '../../../../model';
import { loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../../store';
import { FORMULA_MIME } from '../../../dnd';
import { useFormulaEditor } from '../../formulaEditorStore';
import { FormulaSearchPanel } from '../FormulaSearchPanel';
import { closeFormulaSearch, openFormulaSearch, useFormulaSearch } from '../formulaSearchStore';

/** Formulas alpha (x^2, one clip), beta (\frac{a}{b}) and gamma (x_3), the last two in the group
 * «Pair»; a LaTeX text «heading». */
beforeEach(() => {
  const next = createEmptyProject();
  next.formulas.push(
    { ...createFormula({ name: 'alpha', source: 'x^2' }), id: 'f_a' },
    { ...createFormula({ name: 'beta', source: '\\frac{a}{b}' }), id: 'f_b' },
    { ...createFormula({ name: 'gamma', source: 'x_3' }), id: 'f_c' },
    { ...createTexFormula({ name: 'heading', source: 'About x^2' }), id: 't_h' },
  );
  groupFormulas(next, ['f_b', 'f_c'], 'Pair');
  const track = createTrack('Track 1');
  next.tracks.push(track);
  next.clips.push(createClip('f_a', track.id, 0, 2));
  loadProject(next);
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
  useRenderStore.setState({ prefer: 'auto', entries: {}, resolved: new Map() });
  useFormulaSearch.setState({ open: false, tab: 'math', query: '', requests: 0 });
  useFormulaEditor.setState({ editing: null });
});
afterEach(() => act(() => closeFormulaSearch()));

const results = () => screen.queryAllByTestId('formula-search-result');
const names = () => results().map((element) => element.getAttribute('data-name'));
const result = (name: string) => results().find((e) => e.getAttribute('data-name') === name)!;
const count = (tab: string) => screen.getByTestId(`formula-search-tab-${tab}`).dataset.count;
const type = (value: string) =>
  fireEvent.change(screen.getByTestId('formula-search-input'), { target: { value } });
const selection = () => useUiStore.getState().selection;

function opened() {
  render(<FormulaSearchPanel />);
  act(() => openFormulaSearch());
}

describe('the search of formulas', () => {
  it('is not there until it is asked for, and is gone when it closes', () => {
    render(<FormulaSearchPanel />);
    expect(screen.queryByTestId('formula-search')).toBeNull();
    act(() => openFormulaSearch());
    expect(screen.getByTestId('formula-search')).toBeTruthy();
    fireEvent.click(screen.getByTestId('formula-search-close'));
    expect(screen.queryByTestId('formula-search')).toBeNull();
  });

  it('opens on its field, and lists every object of the tab while nothing is typed', () => {
    opened();
    expect(document.activeElement).toBe(screen.getByTestId('formula-search-input'));
    expect(names()).toEqual(['alpha', 'beta', 'gamma']);
    expect([count('math'), count('tex'), count('text')]).toEqual(['3', '1', '0']);
    expect(screen.getByTestId('formula-search-tab-math').getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('filters by name or source, and counts what each tab finds', () => {
    opened();
    type('x^2');
    expect(names()).toEqual(['alpha']);
    expect([count('math'), count('tex'), count('text')]).toEqual(['1', '1', '0']);
    fireEvent.click(screen.getByTestId('formula-search-tab-tex'));
    expect(names()).toEqual(['heading']);
    fireEvent.click(screen.getByTestId('formula-search-tab-text'));
    expect(names()).toEqual([]);
    expect(screen.getByTestId('formula-search-empty').textContent).toBe('No font texts yet.');
    fireEvent.click(screen.getByTestId('formula-search-tab-math'));
    type('zzz');
    expect(screen.getByTestId('formula-search-empty').textContent).toBe(
      'No formula matches “zzz”.',
    );
  });

  it('walks its tabs with the arrows', () => {
    opened();
    const tab = (id: string) => screen.getByTestId(`formula-search-tab-${id}`);
    tab('math').focus();
    fireEvent.keyDown(tab('math'), { key: 'ArrowRight' });
    expect(useFormulaSearch.getState().tab).toBe('tex');
    expect(document.activeElement).toBe(tab('tex'));
    fireEvent.keyDown(tab('tex'), { key: 'End' });
    expect(useFormulaSearch.getState().tab).toBe('text');
    fireEvent.keyDown(tab('text'), { key: 'ArrowRight' });
    expect(useFormulaSearch.getState().tab).toBe('math');
  });

  it('shows of each result its name, its source, its clips and its group', () => {
    opened();
    const alpha = within(result('alpha'));
    expect(alpha.getByTestId('formula-search-name').textContent).toBe('alpha');
    expect(alpha.getByTestId('formula-search-source').textContent).toBe('x^2');
    expect(alpha.getByTestId('formula-search-clips').textContent).toBe('▭ 1');
    expect(alpha.queryByTestId('formula-search-group')).toBeNull();
    const beta = within(result('beta'));
    expect(beta.queryByTestId('formula-search-clips')).toBeNull();
    expect(beta.getByTestId('formula-search-group').textContent).toBe('Pair');
    // The name of a group finds its formulas.
    type('pair');
    expect(names()).toEqual(['beta', 'gamma']);
  });

  it('selects a result with a click and stays open; Ctrl and Shift select several', () => {
    opened();
    fireEvent.click(result('beta'));
    expect(selection()).toEqual({ kind: 'formula', id: 'f_b' });
    expect(result('beta').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('formula-search')).toBeTruthy();
    fireEvent.click(result('alpha'), { ctrlKey: true });
    expect(selection()).toEqual({ kind: 'formulas', ids: ['f_a', 'f_b'] });
    fireEvent.click(result('alpha'));
    fireEvent.click(result('gamma'), { shiftKey: true });
    expect(selection()).toEqual({ kind: 'formulas', ids: ['f_a', 'f_b', 'f_c'] });
  });

  it('marks the result whose formula a selected clip is of', () => {
    opened();
    const [clip] = useProjectStore.getState().project.clips;
    expect(result('alpha').getAttribute('data-linked')).toBe('false');
    act(() => useUiStore.getState().select({ kind: 'clips', ids: [clip!.id] }));
    expect(result('alpha').getAttribute('data-linked')).toBe('true');
    expect(result('beta').getAttribute('data-linked')).toBe('false');
  });

  it('opens the editor of a result on a double-click and on Enter, and stays open', () => {
    opened();
    fireEvent.doubleClick(result('beta'));
    expect(useFormulaEditor.getState().editing).toMatchObject({ id: 'f_b' });
    expect(selection()).toEqual({ kind: 'formula', id: 'f_b' });
    act(() => useFormulaEditor.getState().close());
    result('gamma').focus();
    fireEvent.keyDown(result('gamma'), { key: 'Enter' });
    expect(useFormulaEditor.getState().editing).toMatchObject({ id: 'f_c' });
    expect(screen.getByTestId('formula-search')).toBeTruthy();
  });

  it('walks its results with the arrows, one tab stop among them', () => {
    opened();
    expect(results().map((element) => element.tabIndex)).toEqual([0, -1, -1]);
    result('alpha').focus();
    fireEvent.keyDown(result('alpha'), { key: 'End' });
    expect(document.activeElement).toBe(result('gamma'));
    expect(selection()).toEqual({ kind: 'formula', id: 'f_c' });
    expect(results().map((element) => element.tabIndex)).toEqual([-1, -1, 0]);
    fireEvent.keyDown(result('gamma'), { key: 'Home' });
    expect(document.activeElement).toBe(result('alpha'));
  });

  it('opens the menu of the selected formulas on a right-click, the result selected first', () => {
    opened();
    fireEvent.click(result('alpha'));
    fireEvent.contextMenu(result('gamma'));
    expect(selection()).toEqual({ kind: 'formula', id: 'f_c' });
    expect(screen.getByTestId('formula-menu-header').textContent).toBe('gamma');
    expect(screen.getByTestId('formula-menu-add-to-timeline')).toBeTruthy();
  });

  it('gives a dragged result to the timeline, as a card of the Creator does', () => {
    opened();
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      setDragImage: () => {},
      effectAllowed: 'none',
    };
    fireEvent.dragStart(result('beta'), { dataTransfer });
    expect(data.get(FORMULA_MIME)).toBe('f_b');
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(selection()).toEqual({ kind: 'formula', id: 'f_b' });
    expect(result('beta').getAttribute('draggable')).toBe('true');
  });
});

describe('Escape, while the search is open', () => {
  it('closes it from its field, keeping the text and the tab for the next time', () => {
    opened();
    type('alp');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      screen.getByTestId('formula-search-input').dispatchEvent(escape);
    });
    expect(screen.queryByTestId('formula-search')).toBeNull();
    // The key is spent: a search field would empty itself.
    expect(escape.defaultPrevented).toBe(true);
    expect(useFormulaSearch.getState()).toMatchObject({ open: false, query: 'alp', tab: 'math' });
    act(() => openFormulaSearch());
    const field = screen.getByTestId<HTMLInputElement>('formula-search-input');
    expect(field.value).toBe('alp');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
  });

  it('closes it from anywhere else in the app', () => {
    opened();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByTestId('formula-search')).toBeNull();
  });

  it('is left to a menu, to a field that takes an edit back and to whoever took the key', () => {
    opened();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = menu.appendChild(document.createElement('button'));
    const field = document.createElement('input');
    field.setAttribute('data-own-escape', '');
    document.body.append(menu, field);
    fireEvent.keyDown(item, { key: 'Escape' });
    fireEvent.keyDown(field, { key: 'Escape' });
    const taken = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    taken.preventDefault();
    document.body.dispatchEvent(taken);
    fireEvent.keyDown(document.body, { key: 'Escape', ctrlKey: true });
    expect(screen.getByTestId('formula-search')).toBeTruthy();
    menu.remove();
    field.remove();
  });
});

describe('the focus, when the search closes', () => {
  it('goes back to what had it before the search opened', () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    opened();
    expect(document.activeElement).toBe(screen.getByTestId('formula-search-input'));
    fireEvent.keyDown(screen.getByTestId('formula-search-input'), { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('stays where it went, when it left the search before that', () => {
    const opener = document.body.appendChild(document.createElement('button'));
    const other = document.body.appendChild(document.createElement('button'));
    opener.focus();
    opened();
    other.focus();
    fireEvent.keyDown(other, { key: 'Escape' });
    expect(screen.queryByTestId('formula-search')).toBeNull();
    expect(document.activeElement).toBe(other);
    opener.remove();
    other.remove();
  });
});
