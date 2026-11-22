// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createEmptyProject,
  createFormula,
  createShapeFormula,
  createTexFormula,
  createTextFormula,
  groupFormulas,
  KINDS,
  setIdGenerator,
  type FormulaKind,
  type Project,
} from '../../../../model';
import { sequentialIds } from '../../../../test/sequentialIds';
import {
  emptyMessage,
  isSearchTab,
  searchFormulas,
  SEARCH_TABS,
  type SearchResults,
} from '../formulaSearch';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

/** Formulas alpha (x_1), beta (\frac{a}{b}), gamma (x_3); LaTeX texts title, note; a font text
 * caption; a brace and a shape, which the Creator does not list. */
function mixed(): Project {
  const project = createEmptyProject();
  project.formulas.push(
    createFormula({ name: 'alpha', source: 'x_1' }),
    createTexFormula({ name: 'title', source: 'The Alpha theorem' }),
    createFormula({ name: 'beta', source: '\\frac{a}{b}' }),
    createTextFormula({ name: 'caption', source: 'Hello fraction' }),
    createFormula({ name: 'gamma', source: 'x_3' }),
    createTexFormula({ name: 'note', source: 'see below' }),
    createBraceFormula({ name: 'alpha brace' }),
    createShapeFormula({ name: 'alpha box' }),
  );
  return project;
}

/** The names each tab lists, as `formulas | LaTeX texts | font texts`. */
const names = (results: SearchResults) =>
  SEARCH_TABS.map((tab) => results[tab.id].map((result) => result.formula.name).join(' ')).join(
    ' | ',
  );

describe('the tabs of the search', () => {
  it('are the kinds of object the Creator lists, each once', () => {
    const listed = (Object.keys(KINDS) as FormulaKind[]).filter((kind) => KINDS[kind].listed);
    expect(SEARCH_TABS.map((tab) => tab.id).sort()).toEqual([...listed].sort());
    expect(SEARCH_TABS.map((tab) => tab.label)).toEqual(['Formulas', 'Texts (LaTeX)', 'Fonts']);
    expect(isSearchTab('math')).toBe(true);
    expect(isSearchTab('brace')).toBe(false);
  });
});

describe('what the search lists', () => {
  it('is every listed object of each kind while nothing is typed', () => {
    expect(names(searchFormulas(mixed(), ''))).toBe('alpha beta gamma | title note | caption');
    expect(names(searchFormulas(mixed(), '   '))).toBe('alpha beta gamma | title note | caption');
  });

  it('is what has the text in its name or in its source, in the three tabs at once', () => {
    // «alpha» by its name and «title» by its source; the brace and the shape are never listed.
    expect(names(searchFormulas(mixed(), 'alpha'))).toBe('alpha | title | ');
    expect(names(searchFormulas(mixed(), 'fra'))).toBe('beta |  | caption');
    expect(names(searchFormulas(mixed(), 'x_'))).toBe('alpha gamma |  | ');
    expect(names(searchFormulas(mixed(), 'nothing like it'))).toBe(' |  | ');
  });

  it('takes no notice of capitals nor of the spaces around what was typed', () => {
    expect(names(searchFormulas(mixed(), '  ALPHA '))).toBe('alpha | title | ');
    expect(names(searchFormulas(mixed(), '\\FRAC'))).toBe('beta |  | ');
  });

  it('follows the order of the Creator list, a group where its first formula is', () => {
    const project = mixed();
    groupFormulas(project, ['f_5', 'f_1'], 'pair'); // gamma and alpha: listed alpha, gamma, beta
    expect(names(searchFormulas(project, ''))).toBe('alpha gamma beta | title note | caption');
  });

  it('says the group of each result, and finds the formulas of a group by its name', () => {
    const project = mixed();
    const group = groupFormulas(project, ['f_3', 'f_6'], 'Proofs')!; // beta and note
    const all = searchFormulas(project, '');
    expect(all.math.map((result) => result.group?.name ?? null)).toEqual([null, 'Proofs', null]);
    expect(all.tex.map((result) => result.group?.id ?? null)).toEqual([null, group.id]);
    expect(names(searchFormulas(project, 'proof'))).toBe('beta | note | ');
  });
});

describe('what a tab says when it lists nothing', () => {
  it('is nothing while it has results', () => {
    const project = mixed();
    expect(emptyMessage(project, 'math', searchFormulas(project, ''), '')).toBeNull();
  });

  it('tells a project without objects of the kind from a search that finds none', () => {
    const project = mixed();
    const none = searchFormulas(project, ' zzz ');
    expect(emptyMessage(project, 'math', none, ' zzz ')).toBe('No formula matches “zzz”.');
    expect(emptyMessage(project, 'tex', none, ' zzz ')).toBe('No LaTeX text matches “zzz”.');
    expect(emptyMessage(project, 'text', none, ' zzz ')).toBe('No font text matches “zzz”.');
    const empty = createEmptyProject();
    const nothing = searchFormulas(empty, 'zzz');
    expect(emptyMessage(empty, 'math', nothing, 'zzz')).toBe('No formulas yet.');
    expect(emptyMessage(empty, 'tex', nothing, 'zzz')).toBe('No LaTeX texts yet.');
    expect(emptyMessage(empty, 'text', nothing, '')).toBe('No font texts yet.');
  });
});
