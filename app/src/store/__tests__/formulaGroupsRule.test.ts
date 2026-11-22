import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, createFormula, groupFormulas, type Project } from '../../model';
import { history, loadProject, useProjectStore } from '../projectStore';

/* The project store keeps the rule of the groups of formulas (model/formulaGroups.ts) after
 * every edit: whatever deletes a formula takes it out of its group, as part of that step. */

const project = (): Project => useProjectStore.getState().project;
const groups = () => (project().formulaGroups ?? []).map((g) => [g.name, ...g.formulaIds]);

beforeEach(() => {
  const start = createEmptyProject();
  for (const [id, name] of [
    ['fa', 'a'],
    ['fb', 'b'],
    ['fc', 'c'],
  ] as const)
    start.formulas.push({ ...createFormula({ name }), id });
  loadProject(start);
});

describe('the rule of the groups of formulas, kept by the project store', () => {
  it('takes a deleted formula out of its group, in the step that deleted it', () => {
    const { update } = useProjectStore.getState();
    update((draft) => void groupFormulas(draft, ['fa', 'fb']));
    expect(groups()).toEqual([['grp1', 'fa', 'fb']]);
    update((draft) => {
      draft.formulas = draft.formulas.filter((f) => f.id !== 'fa');
    });
    expect(groups()).toEqual([['grp1', 'fb']]);
    history.undo();
    expect(groups()).toEqual([['grp1', 'fa', 'fb']]);
    expect(project().formulas.map((f) => f.id)).toEqual(['fa', 'fb', 'fc']);
  });

  it('drops a group left without formulas, and the field with the last group', () => {
    const { update } = useProjectStore.getState();
    update((draft) => void groupFormulas(draft, ['fa', 'fb']));
    update((draft) => {
      draft.formulas = draft.formulas.filter((f) => f.id === 'fc');
    });
    expect('formulaGroups' in project()).toBe(false);
    history.undo();
    expect(groups()).toEqual([['grp1', 'fa', 'fb']]);
  });

  it('leaves the project object alone when an edit breaks nothing', () => {
    const { update } = useProjectStore.getState();
    update((draft) => void groupFormulas(draft, ['fa', 'fb']));
    const before = project();
    update((draft) => {
      draft.meta.name = 'Renamed';
    });
    expect(project().formulaGroups).toBe(before.formulaGroups);
  });
});
