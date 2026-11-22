import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, createFormula, type Project } from '../../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../../store';
import { useAnnouncer } from '../../../announcer';
import { duplicateFormulas } from '../../formulaActions';
import {
  addSelectedToGroup,
  dropFormulaOnGroup,
  groupSelectedFormulas,
  removeSelectedFromGroups,
  renameGroup,
  ungroup,
} from '../groupActions';
import { useGroupUi } from '../groupUiStore';

const project = (): Project => useProjectStore.getState().project;
const groups = () => (project().formulaGroups ?? []).map((g) => [g.name, ...g.formulaIds]);
const selection = () => useUiStore.getState().selection;

beforeEach(() => {
  const start = createEmptyProject();
  for (const id of ['fa', 'fb', 'fc', 'fd'])
    start.formulas.push({ ...createFormula({ name: id }), id });
  loadProject(start);
  useUiStore.setState({ selection: { kind: 'none' } });
  useGroupUi.setState({ open: new Set(), renaming: null });
});

describe('grouping the selected formulas', () => {
  it('makes one group of them in one step, closed, and leaves them selected', () => {
    useUiStore.getState().select({ kind: 'formulas', ids: ['fb', 'fd'] });
    const id = groupSelectedFormulas();
    expect(id).not.toBeNull();
    expect(groups()).toEqual([['grp1', 'fb', 'fd']]);
    expect(selection()).toEqual({ kind: 'formulas', ids: ['fb', 'fd'] });
    expect(useGroupUi.getState().open.has(id!)).toBe(false);
    expect(useAnnouncer.getState().text).toBe('Group grp1 made of 2 formulas');
    history.undo();
    expect(groups()).toEqual([]);
    expect(history.canUndo()).toBe(false);
  });

  it('does nothing without a selection of formulas', () => {
    expect(groupSelectedFormulas()).toBeNull();
    expect(history.canUndo()).toBe(false);
  });
});

describe('undoing a group', () => {
  it('frees its formulas in one step and puts the selection in the order of the list', () => {
    useUiStore.getState().select({ kind: 'formulas', ids: ['fb', 'fd'] });
    const id = groupSelectedFormulas()!;
    useProjectStore.getState().update((draft) => {
      draft.formulaGroups![0]!.formulaIds = ['fd', 'fb'];
    });
    useUiStore.getState().select({ kind: 'formulas', ids: ['fd', 'fb'] });
    ungroup(id);
    expect(groups()).toEqual([]);
    expect(project().formulas).toHaveLength(4);
    expect(selection()).toEqual({ kind: 'formulas', ids: ['fb', 'fd'] });
    history.undo();
    expect(groups()).toEqual([['grp1', 'fd', 'fb']]);
    ungroup('nope'); // not a group: nothing happens
    expect(groups()).toEqual([['grp1', 'fd', 'fb']]);
  });
});

describe('renaming a group', () => {
  it('takes any name but an empty one, and makes no step for the name it has', () => {
    useUiStore.getState().select({ kind: 'formulas', ids: ['fa', 'fb'] });
    const id = groupSelectedFormulas()!;
    history.clear();
    expect(renameGroup(id, '  ')).toBe('The name cannot be empty.');
    expect(renameGroup(id, ' grp1 ')).toBeNull();
    expect(history.canUndo()).toBe(false);
    expect(renameGroup(id, 'Chain rule')).toBeNull();
    expect(groups()).toEqual([['Chain rule', 'fa', 'fb']]);
    history.undo();
    expect(groups()).toEqual([['grp1', 'fa', 'fb']]);
  });
});

describe('changing what is in a group', () => {
  const select = (...ids: string[]) =>
    useUiStore
      .getState()
      .select(ids.length === 1 ? { kind: 'formula', id: ids[0]! } : { kind: 'formulas', ids });
  /** The group of fa and fb, and nothing selected. */
  const grouped = () => {
    select('fa', 'fb');
    const id = groupSelectedFormulas()!;
    history.clear();
    return id;
  };

  it('adds the selected formulas to a group in one step, and leaves them selected', () => {
    const id = grouped();
    select('fb', 'fd');
    addSelectedToGroup(id);
    expect(groups()).toEqual([['grp1', 'fa', 'fb', 'fd']]);
    expect(selection()).toEqual({ kind: 'formulas', ids: ['fb', 'fd'] });
    expect(useAnnouncer.getState().text).toBe('fd added to group grp1');
    history.undo();
    expect(groups()).toEqual([['grp1', 'fa', 'fb']]);
    // Nothing to add: no step.
    select('fa');
    addSelectedToGroup(id);
    expect(history.canUndo()).toBe(false);
  });

  it('moves a formula of another group when it is added, and drops the group left empty', () => {
    const one = grouped();
    select('fc');
    groupSelectedFormulas();
    select('fc', 'fd');
    addSelectedToGroup(one);
    expect(groups()).toEqual([['grp1', 'fa', 'fb', 'fc', 'fd']]);
    expect(useAnnouncer.getState().text).toBe('2 formulas added to group grp1');
  });

  it('puts a dropped formula into the group; one that is in it changes nothing', () => {
    const id = grouped();
    dropFormulaOnGroup(id, 'fc');
    expect(groups()).toEqual([['grp1', 'fa', 'fb', 'fc']]);
    history.clear();
    dropFormulaOnGroup(id, 'fa');
    dropFormulaOnGroup('nope', 'fd');
    dropFormulaOnGroup(id, 'nope');
    expect(groups()).toEqual([['grp1', 'fa', 'fb', 'fc']]);
    expect(history.canUndo()).toBe(false);
  });

  it('takes the selected formulas out of their groups in one step', () => {
    grouped();
    select('fb', 'fc');
    removeSelectedFromGroups();
    expect(groups()).toEqual([['grp1', 'fa']]);
    expect(useAnnouncer.getState().text).toBe('1 formula taken out of its group');
    select('fa');
    removeSelectedFromGroups();
    expect(groups()).toEqual([]);
    history.undo();
    history.undo();
    expect(groups()).toEqual([['grp1', 'fa', 'fb']]);
    // None of them is in a group: no step.
    history.clear();
    select('fc', 'fd');
    removeSelectedFromGroups();
    expect(history.canUndo()).toBe(false);
  });

  it('keeps the copy of a formula of a group in the group, after the original', () => {
    grouped();
    const [copy] = duplicateFormulas(['fa', 'fc']);
    expect(groups()).toEqual([['grp1', 'fa', copy, 'fb']]);
    history.undo();
    expect(groups()).toEqual([['grp1', 'fa', 'fb']]);
  });
});
