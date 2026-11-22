/* The order of a selection of formulas is the Creator list's (`formulaListOrder`,
 * docs/architecture/11a-ui-layer.md, "Groups of formulas"), which a group changes: it sits where
 * its first formula is and its formulas come together, in the group's order. Duplicate (it
 * selects the copies) and `pruneSelection` (what is left of a selection when a formula goes)
 * built theirs in the order of `project.formulas` (audit B1-01). */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addToFormulaGroup,
  createBraceFormula,
  createEmptyProject,
  createFormula,
  formulaListOrder,
  groupFormulas,
  type Project,
} from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { formulaSelection, pruneSelection, selectedFormulaIds } from '../../selection';
import { duplicateFormulas } from '../formulaActions';

const project = (): Project => useProjectStore.getState().project;

/** fa fb fc fd in the project, and the group [fb fc fa]: the Creator list is fb fc fa fd. */
function grouped(): Project {
  const start = createEmptyProject();
  for (const id of ['fa', 'fb', 'fc', 'fd'])
    start.formulas.push({ ...createFormula({ name: id }), id });
  const group = groupFormulas(start, ['fb', 'fc'])!;
  addToFormulaGroup(start, group.id, ['fa']);
  return start;
}

beforeEach(() => {
  loadProject(grouped());
  useUiStore.setState({ selection: { kind: 'none' } });
});

describe('the order of a selection of formulas follows the Creator list (audit B1-01)', () => {
  it('starts from a list that is not the project order', () => {
    expect(project().formulas.map((f) => f.id)).toEqual(['fa', 'fb', 'fc', 'fd']);
    expect(formulaListOrder(project())).toEqual(['fb', 'fc', 'fa', 'fd']);
  });

  it('Duplicate selects the copies in the order of the list', () => {
    const order = formulaListOrder(project());
    useUiStore.getState().select(formulaSelection(['fa', 'fb', 'fc', 'fd'], order));
    expect(selectedFormulaIds(useUiStore.getState().selection)).toEqual(['fb', 'fc', 'fa', 'fd']);

    const copies = duplicateFormulas(selectedFormulaIds(useUiStore.getState().selection));
    expect(copies).toHaveLength(4);
    const inListOrder = formulaListOrder(project()).filter((id) => copies.includes(id));
    expect(selectedFormulaIds(useUiStore.getState().selection)).toEqual(inListOrder);
    expect(copies).toEqual(inListOrder);
  });

  it('what is left of a selection when a formula goes is in the order of the list', () => {
    const order = formulaListOrder(project());
    const selection = formulaSelection(['fa', 'fb', 'fc', 'fd'], order);
    // fc goes (Delete on its row, or an Undo that takes it away): the store repairs the group.
    useProjectStore.getState().update((draft) => {
      draft.formulas = draft.formulas.filter((f) => f.id !== 'fc');
    });
    expect(formulaListOrder(project())).toEqual(['fb', 'fa', 'fd']);
    expect(pruneSelection(selection, project())).toEqual({
      kind: 'formulas',
      ids: ['fb', 'fa', 'fd'],
    });
  });

  it('keeps an object the list does not show, after the listed ones', () => {
    // A brace is not listed in the Creator: a selection that holds one keeps it when another
    // formula goes, after those of the list.
    useProjectStore.getState().update((draft) => {
      draft.formulas.unshift({ ...createBraceFormula({ name: 'b1' }), id: 'brace' });
    });
    const selection = { kind: 'formulas' as const, ids: ['brace', 'fd', 'fa', 'fc'] };
    useProjectStore.getState().update((draft) => {
      draft.formulas = draft.formulas.filter((f) => f.id !== 'fd');
    });
    expect(pruneSelection(selection, project())).toEqual({
      kind: 'formulas',
      ids: ['fc', 'fa', 'brace'],
    });
  });
});
