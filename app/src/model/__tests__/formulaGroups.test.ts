// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addToFormulaGroup,
  createBraceFormula,
  createEmptyProject,
  createFormula,
  createFormulaGroup,
  formulaGroupOf,
  formulaGroupProblems,
  formulaGroupsOf,
  formulaListOrder,
  groupCopies,
  groupFormulas,
  hasBrokenFormulaGroups,
  nextFormulaGroupName,
  parseProject,
  removeFromFormulaGroups,
  renameFormulaGroup,
  repairFormulaGroups,
  serializeProject,
  setIdGenerator,
  ungroupFormulas,
  validateProject,
  FORMAT_VERSION,
  type Project,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { smallProject } from './fixtures';

/* The groups of formulas of the Creator (format 22): `project.formulaGroups`, a name and formulas
 * each, there only while the project has one. */

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

/** A project with the formulas a, b, c, d, e (ids f_1 … f_5) and a brace (f_6), unlisted. */
function five(): Project {
  const project = createEmptyProject();
  for (const name of ['a', 'b', 'c', 'd', 'e']) project.formulas.push(createFormula({ name }));
  project.formulas.push(createBraceFormula({ name: 'brace' }));
  return project;
}

const groupsOf = (project: Project) =>
  formulaGroupsOf(project).map((group) => [group.name, ...group.formulaIds]);

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

describe('grouping formulas', () => {
  it('makes a group named grp1 of the formulas, in the order of the list', () => {
    const project = five();
    expect(formulaGroupsOf(project)).toEqual([]);
    const group = groupFormulas(project, ['f_4', 'f_2']);
    expect(group).toMatchObject({ name: 'grp1', formulaIds: ['f_2', 'f_4'] });
    expect(group!.id).toBe('b_1');
    expect(project.formulaGroups).toEqual([group]);
    expect(formulaGroupOf(project, 'f_4')).toBe(group);
    expect(formulaGroupOf(project, 'f_1')).toBeUndefined();
  });

  it('numbers the next group after the names taken, and takes a name when given one', () => {
    const project = five();
    groupFormulas(project, ['f_1', 'f_2']);
    expect(groupFormulas(project, ['f_3', 'f_4'])!.name).toBe('grp2');
    renameFormulaGroup(project, 'b_1', 'Algebra');
    expect(nextFormulaGroupName(formulaGroupsOf(project))).toBe('grp1');
    expect(groupFormulas(project, ['f_5'], '  Limits ')!.name).toBe('Limits');
  });

  it('moves a formula of another group into the new one; a group left empty goes', () => {
    const project = five();
    groupFormulas(project, ['f_1', 'f_2']);
    groupFormulas(project, ['f_2', 'f_3']);
    expect(groupsOf(project)).toEqual([
      ['grp1', 'f_1'],
      ['grp2', 'f_2', 'f_3'],
    ]);
    groupFormulas(project, ['f_1', 'f_5']);
    expect(groupsOf(project)).toEqual([
      ['grp2', 'f_2', 'f_3'],
      ['grp1', 'f_1', 'f_5'],
    ]);
  });

  it('leaves out what the Creator does not list, and makes no group of nothing', () => {
    const project = five();
    expect(groupFormulas(project, ['f_6', 'nope'])).toBeNull();
    expect('formulaGroups' in project).toBe(false);
    expect(groupFormulas(project, ['f_6', 'f_1'])!.formulaIds).toEqual(['f_1']);
  });

  it('ungroups: the formulas stay, the field goes with the last group', () => {
    const project = five();
    groupFormulas(project, ['f_1', 'f_2']);
    expect(ungroupFormulas(project, 'nope')).toBe(false);
    expect(ungroupFormulas(project, 'b_1')).toBe(true);
    expect('formulaGroups' in project).toBe(false);
    expect(project.formulas).toHaveLength(6);
  });

  it('renames a group to any text but an empty one', () => {
    const project = five();
    groupFormulas(project, ['f_1', 'f_2']);
    expect(renameFormulaGroup(project, 'b_1', '   ')).toBe(false);
    expect(renameFormulaGroup(project, 'b_1', ' Trig identities ')).toBe(true);
    expect(project.formulaGroups![0]!.name).toBe('Trig identities');
  });
});

describe('the members of a group', () => {
  it('adds formulas after the ones it has, taking them from their groups', () => {
    const project = five();
    groupFormulas(project, ['f_3', 'f_4']);
    groupFormulas(project, ['f_5']);
    expect(addToFormulaGroup(project, 'b_1', ['f_5', 'f_1', 'f_3'])).toBe(true);
    expect(groupsOf(project)).toEqual([['grp1', 'f_3', 'f_4', 'f_1', 'f_5']]);
    expect(addToFormulaGroup(project, 'b_1', ['f_1'])).toBe(false);
    expect(addToFormulaGroup(project, 'nope', ['f_2'])).toBe(false);
  });

  it('removes formulas from their groups; the group of the last one goes', () => {
    const project = five();
    groupFormulas(project, ['f_1', 'f_2']);
    expect(removeFromFormulaGroups(project, ['f_3'])).toBe(false);
    expect(removeFromFormulaGroups(project, ['f_1'])).toBe(true);
    expect(groupsOf(project)).toEqual([['grp1', 'f_2']]);
    removeFromFormulaGroups(project, ['f_2']);
    expect('formulaGroups' in project).toBe(false);
  });

  it('puts the copy of a grouped formula in the group, after the original', () => {
    const project = five();
    groupFormulas(project, ['f_1', 'f_2']);
    groupCopies(
      project,
      new Map([
        ['f_1', 'copy_1'],
        ['f_3', 'copy_3'],
      ]),
    );
    expect(groupsOf(project)).toEqual([['grp1', 'f_1', 'copy_1', 'f_2']]);
  });
});

describe('the order of the list', () => {
  it('is the order of the formulas while there is no group, without the unlisted kinds', () => {
    expect(formulaListOrder(five())).toEqual(['f_1', 'f_2', 'f_3', 'f_4', 'f_5']);
  });

  it('has a group where its first formula is, with its formulas together in its order', () => {
    const project = five();
    groupFormulas(project, ['f_3', 'f_5']);
    expect(formulaListOrder(project)).toEqual(['f_1', 'f_2', 'f_3', 'f_5', 'f_4']);
    // A formula added later comes after the ones the group had, and the group stays put.
    addToFormulaGroup(project, 'b_1', ['f_1']);
    expect(formulaListOrder(project)).toEqual(['f_2', 'f_3', 'f_5', 'f_1', 'f_4']);
  });

  it('draws a project that breaks the rule: each formula once, with its first group', () => {
    const project = five();
    project.formulaGroups = [
      createFormulaGroup('one', ['f_2', 'gone', 'f_2', 'f_6']),
      createFormulaGroup('two', ['f_2', 'f_1']),
    ];
    expect(formulaListOrder(project)).toEqual(['f_1', 'f_2', 'f_3', 'f_4', 'f_5']);
  });
});

describe('the rule of the groups', () => {
  it('finds nothing wrong with groups made by the operations', () => {
    const project = five();
    expect(hasBrokenFormulaGroups(project)).toBe(false);
    groupFormulas(project, ['f_1', 'f_2']);
    groupFormulas(project, ['f_3']);
    expect(formulaGroupProblems(project)).toEqual([]);
    expect(hasBrokenFormulaGroups(project)).toBe(false);
    expect(validateProject(project)).toEqual([]);
  });

  it('says what a group holds that it cannot, and validation reports it', () => {
    const project = five();
    project.formulaGroups = [
      createFormulaGroup('one', ['f_1', 'gone', 'f_6', 'f_1']),
      createFormulaGroup('', ['f_1']),
    ];
    project.formulaGroups[1]!.id = project.formulaGroups[0]!.id;
    expect(formulaGroupProblems(project)).toEqual([
      { fault: 'unknown', group: 0, member: 1 },
      { fault: 'unlisted', group: 0, member: 2 },
      { fault: 'repeated', group: 0, member: 3 },
      { fault: 'same-id', group: 1 },
      { fault: 'unnamed', group: 1 },
      { fault: 'repeated', group: 1, member: 0 },
      { fault: 'empty', group: 1 },
    ]);
    expect(hasBrokenFormulaGroups(project)).toBe(true);
    const issues = validateProject(project).map((issue) => [issue.code, issue.path.join('.')]);
    expect(issues).toEqual([
      ['duplicate-id', 'formulaGroups.1.id'],
      ['dangling-ref', 'formulaGroups.0.formulaIds.1'],
      ['formula-group', 'formulaGroups.0.formulaIds.2'],
      ['formula-group', 'formulaGroups.0.formulaIds.3'],
      ['formula-group', 'formulaGroups.1.name'],
      ['formula-group', 'formulaGroups.1.formulaIds.0'],
      ['formula-group', 'formulaGroups.1.formulaIds'],
    ]);
  });

  it('repairs: what a group cannot hold leaves it, an empty group goes, the rest stays', () => {
    const project = five();
    project.formulaGroups = [
      createFormulaGroup('one', ['f_1', 'gone', 'f_6', 'f_1', 'f_2']),
      createFormulaGroup('', ['f_1']),
      createFormulaGroup('  ', ['f_3', 'f_2']),
    ];
    project.formulaGroups[2]!.id = project.formulaGroups[0]!.id;
    expect(repairFormulaGroups(project)).not.toEqual([]);
    expect(groupsOf(project)).toEqual([
      ['one', 'f_1', 'f_2'],
      ['grp1', 'f_3'],
    ]);
    expect(new Set(project.formulaGroups!.map((group) => group.id)).size).toBe(2);
    expect(hasBrokenFormulaGroups(project)).toBe(false);
    expect(repairFormulaGroups(project)).toEqual([]);
    expect(project.formulas).toHaveLength(6);
  });

  it('repairs a field left with no group by taking it away', () => {
    const project = five();
    project.formulaGroups = [];
    expect(hasBrokenFormulaGroups(project)).toBe(true);
    repairFormulaGroups(project);
    expect('formulaGroups' in project).toBe(false);
  });
});

describe('the groups of formulas, in the file', () => {
  it('are kept by a save and a load, as the last field, and absent without groups', () => {
    const plain = serializeProject(smallProject());
    expect(plain).not.toContain('"formulaGroups"');
    const project = smallProject();
    const ids = project.formulas.map((f) => f.id);
    expect(ids.length).toBeGreaterThan(1);
    groupFormulas(project, ids.slice(0, 2), 'Pair');
    const text = serializeProject(project);
    const again = opened(text);
    expect(again.formulaGroups).toEqual(project.formulaGroups);
    expect(Object.keys(again).at(-1)).toBe('formulaGroups');
    expect(serializeProject(again)).toBe(text);
  });

  it('are not in a file of format 21, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 21');
    expect(old).not.toBe(text);
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(21);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect('formulaGroups' in result.project).toBe(false);
    expect(serializeProject(result.project)).toBe(text);
  });

  it('are put right when a file breaks their rule, with a warning and no formula lost', () => {
    const project = smallProject();
    const ids = project.formulas.map((f) => f.id);
    project.formulaGroups = [
      createFormulaGroup('kept', [ids[0]!, 'gone']),
      createFormulaGroup('lost', ['gone']),
    ];
    const result = parseProject(serializeProject(project));
    if (!result.ok) throw new Error(result.error);
    expect(result.project.formulaGroups).toEqual([
      { id: project.formulaGroups[0]!.id, name: 'kept', formulaIds: [ids[0]] },
    ]);
    expect(result.project.formulas).toHaveLength(ids.length);
    const repaired = result.issues.filter((issue) => issue.code === 'formula-group-repaired');
    expect(repaired).toHaveLength(1);
    expect(repaired[0]!.severity).toBe('warning');
    expect(result.issues.some((issue) => issue.code === 'formula-group')).toBe(false);
  });

  it('are refused when the file gives them another shape', () => {
    const project = smallProject();
    (project as { formulaGroups?: unknown }).formulaGroups = [{ id: 'b_x', name: 'x' }];
    expect(parseProject(serializeProject(project)).ok).toBe(false);
  });
});
