/* The search of the project's objects (D131): what the panel in the Preview's place lists
 * (`FormulaSearchPanel`). One tab per kind the Creator lists — formulas, LaTeX texts, font texts —
 * each with the objects of its kind that match, in the order of the Creator's list. An object
 * matches when what was typed is in its name, in its source or in the name of its group; nothing
 * typed matches them all. The results are flat: a group of formulas is no folder here, each result
 * says which group it is in. Pure. */
import {
  formulaGroupsOf,
  formulaListOrder,
  type Formula,
  type FormulaGroup,
  type FormulaId,
  type FormulaKind,
  type Project,
} from '../../../model';

/** A tab of the search: a kind of object the Creator lists. */
export type SearchTab = Extract<FormulaKind, 'math' | 'tex' | 'text'>;

export interface SearchTabInfo {
  id: SearchTab;
  label: string;
  /** What the tab says while the project has no object of its kind. */
  none: string;
  /** How it starts what it says when the project has some and none matches. */
  noMatch: string;
}

export const SEARCH_TABS: readonly SearchTabInfo[] = [
  { id: 'math', label: 'Formulas', none: 'No formulas yet.', noMatch: 'No formula matches' },
  {
    id: 'tex',
    label: 'Texts (LaTeX)',
    none: 'No LaTeX texts yet.',
    noMatch: 'No LaTeX text matches',
  },
  { id: 'text', label: 'Fonts', none: 'No font texts yet.', noMatch: 'No font text matches' },
];

export const DEFAULT_SEARCH_TAB: SearchTab = 'math';

/** Whether a kind of object has a tab of the search. */
export const isSearchTab = (kind: FormulaKind): kind is SearchTab =>
  SEARCH_TABS.some((tab) => tab.id === kind);

export interface SearchResult {
  formula: Formula;
  /** The group of formulas it is in, if any. */
  group: FormulaGroup | null;
}

/** The results of every tab: a tab's count is the length of its list. */
export type SearchResults = Record<SearchTab, SearchResult[]>;

const within = (text: string, q: string) => text.toLowerCase().includes(q);

/** What the search lists for `query`, as typed. */
export function searchFormulas(
  project: Pick<Project, 'formulas' | 'formulaGroups'>,
  query: string,
): SearchResults {
  const q = query.trim().toLowerCase();
  const byId = new Map<FormulaId, Formula>(project.formulas.map((f) => [f.id, f]));
  // Each formula's group: the first that names it, as in the Creator's list.
  const groupOf = new Map<FormulaId, FormulaGroup>();
  for (const group of formulaGroupsOf(project)) {
    for (const id of group.formulaIds) if (!groupOf.has(id)) groupOf.set(id, group);
  }
  const results: SearchResults = { math: [], tex: [], text: [] };
  for (const id of formulaListOrder(project)) {
    const formula = byId.get(id);
    if (!formula || !isSearchTab(formula.kind)) continue;
    const group = groupOf.get(id) ?? null;
    const found =
      q === '' ||
      within(formula.name, q) ||
      within(formula.source, q) ||
      (group !== null && within(group.name, q));
    if (found) results[formula.kind].push({ formula, group });
  }
  return results;
}

/** What a tab says in the place of its results when it has none, or null when it has some. */
export function emptyMessage(
  project: Pick<Project, 'formulas'>,
  tab: SearchTab,
  results: SearchResults,
  query: string,
): string | null {
  if (results[tab].length > 0) return null;
  const info = SEARCH_TABS.find((entry) => entry.id === tab)!;
  if (!project.formulas.some((formula) => formula.kind === tab)) return info.none;
  return `${info.noMatch} “${query.trim()}”.`;
}
