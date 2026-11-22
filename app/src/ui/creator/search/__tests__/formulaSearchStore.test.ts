import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../../../model';
import { loadProject } from '../../../../store';
import {
  closeFormulaSearch,
  isFormulaSearchOpen,
  openFormulaSearch,
  startFormulaSearchTracking,
  toggleFormulaSearch,
  useFormulaSearch,
} from '../formulaSearchStore';

beforeEach(() => useFormulaSearch.setState({ open: false, tab: 'math', query: '', requests: 0 }));

const state = () => {
  const { open, tab, query, requests } = useFormulaSearch.getState();
  return { open, tab, query, requests };
};

describe('the state of the search of formulas', () => {
  it('starts closed, on the formulas, with nothing typed', () => {
    expect(state()).toEqual({ open: false, tab: 'math', query: '', requests: 0 });
    expect(isFormulaSearchOpen()).toBe(false);
  });

  it('opens, and each request after that is one more for its field', () => {
    openFormulaSearch();
    expect(state()).toMatchObject({ open: true, requests: 1 });
    expect(isFormulaSearchOpen()).toBe(true);
    openFormulaSearch();
    expect(state()).toMatchObject({ open: true, requests: 2 });
  });

  it('keeps its tab and its text when it closes, for the next time', () => {
    openFormulaSearch();
    useFormulaSearch.getState().setTab('tex');
    useFormulaSearch.getState().setQuery('alpha');
    closeFormulaSearch();
    expect(state()).toMatchObject({ open: false, tab: 'tex', query: 'alpha' });
    openFormulaSearch();
    expect(state()).toMatchObject({ open: true, tab: 'tex', query: 'alpha' });
  });

  it('closes without a change when it is not open', () => {
    const before = useFormulaSearch.getState();
    closeFormulaSearch();
    expect(useFormulaSearch.getState()).toBe(before);
  });

  it('is shown and taken away by the magnifier', () => {
    toggleFormulaSearch();
    expect(state()).toMatchObject({ open: true, requests: 1 });
    toggleFormulaSearch();
    expect(state()).toMatchObject({ open: false, requests: 1 });
  });

  it('closes and forgets its text with the document, while its service runs', () => {
    const fill = () => {
      openFormulaSearch();
      useFormulaSearch.getState().setTab('text');
      useFormulaSearch.getState().setQuery('alpha');
    };
    fill();
    loadProject(createEmptyProject());
    expect(state()).toMatchObject({ open: true, tab: 'text', query: 'alpha' }); // not started
    const stop = startFormulaSearchTracking();
    loadProject(createEmptyProject());
    expect(state()).toMatchObject({ open: false, tab: 'math', query: '' });
    stop();
    fill();
    loadProject(createEmptyProject());
    expect(state()).toMatchObject({ open: true, tab: 'text', query: 'alpha' });
  });
});
