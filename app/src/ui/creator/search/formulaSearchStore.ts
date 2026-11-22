/* The state of the search of formulas (D131, `FormulaSearchPanel`): whether its panel is over the
 * Preview, the tab it shows and what was typed. A state of the view, not of the project: while the
 * app is open the panel comes back on the tab and with the text it was left with. It ends with the
 * document — the next one has other objects to look for. */
import { create } from 'zustand';
import { captureFocus } from '../../focus';
import { onDocumentReplaced } from '../../project/documentStore';
import { DEFAULT_SEARCH_TAB, type SearchTab } from './formulaSearch';

interface FormulaSearchState {
  /** The panel is up, in the Preview's place. */
  open: boolean;
  tab: SearchTab;
  /** What was typed, as typed. */
  query: string;
  /** How many times the search was asked for: each one takes the focus to its field, the panel
   * already open or not. */
  requests: number;
  setTab(tab: SearchTab): void;
  setQuery(query: string): void;
}

export const useFormulaSearch = create<FormulaSearchState>()((set) => ({
  open: false,
  tab: DEFAULT_SEARCH_TAB,
  query: '',
  requests: 0,
  setTab: (tab) => set({ tab }),
  setQuery: (query) => set({ query }),
}));

/** Gives the focus back to what had it when the search opened. */
let restoreFocus: (() => void) | null = null;

/** Show the search, or go back to its field when it is already there. */
export function openFormulaSearch(): void {
  if (!useFormulaSearch.getState().open) restoreFocus = captureFocus();
  useFormulaSearch.setState((state) => ({ open: true, requests: state.requests + 1 }));
}

/** Take the search away: the Preview is back. The tab and the text stay for the next time. */
export function closeFormulaSearch(): void {
  if (useFormulaSearch.getState().open) useFormulaSearch.setState({ open: false });
}

/** Once the panel is gone: the focus it had goes back to what had it before the search — the
 * magnifier, when that opened it. A focus that has moved on to something else stays there. */
export function returnSearchFocus(): void {
  const restore = restoreFocus;
  restoreFocus = null;
  const active = document.activeElement;
  if (active === null || active === document.body) restore?.();
}

/** The magnifier of the Creator: it shows the search, and takes it away when it is there. */
export function toggleFormulaSearch(): void {
  if (useFormulaSearch.getState().open) closeFormulaSearch();
  else openFormulaSearch();
}

/** Whether the search covers the Preview: what the Preview does with keys waits meanwhile. */
export const isFormulaSearchOpen = (): boolean => useFormulaSearch.getState().open;

/** Close the search and forget its text with the document (one of the app's services,
 * `sessionTracking.ts`). Returns the function that stops it. */
export function startFormulaSearchTracking(): () => void {
  return onDocumentReplaced(() =>
    useFormulaSearch.setState({ open: false, tab: DEFAULT_SEARCH_TAB, query: '' }),
  );
}
