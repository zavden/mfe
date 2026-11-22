// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addToFormulaGroup,
  createBraceFormula,
  createEmptyProject,
  createFormula,
  createFormulaGroup,
  groupFormulas,
  setIdGenerator,
  type Project,
} from '../../../../model';
import { sequentialIds } from '../../../../test/sequentialIds';
import {
  creatorRows,
  groupChoices,
  groupOfRowKey,
  groupRowKey,
  rowHighlight,
  rowOfFormula,
  type CreatorRow,
} from '../groupRows';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

/** Formulas alpha, beta, gamma, delta, epsilon (f_1 … f_5), sources x_1 … x_5, and a brace. */
function five(): Project {
  const project = createEmptyProject();
  ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].forEach((name, i) =>
    project.formulas.push(createFormula({ name, source: `x_${i + 1}` })),
  );
  project.formulas.push(createBraceFormula({ name: 'brace' }));
  return project;
}

/** A row as text: `beta`, `[grp1: beta delta]` (closed), `[grp1▾: …]` (open), `·beta` (inside). */
const text = (row: CreatorRow): string =>
  row.kind === 'formula'
    ? `${row.group ? '·' : ''}${row.formula.name}`
    : `[${row.group.name}${row.open ? '▾' : ''}: ${row.members.map((f) => f.name).join(' ')}]`;
const texts = (rows: CreatorRow[]) => rows.map(text);

describe('the rows of the Creator list', () => {
  it('are the listed formulas, one each, while there is no group', () => {
    const rows = creatorRows(five());
    expect(texts(rows)).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
    expect(rows.map((row) => [row.key, row.ids])).toEqual(
      ['f_1', 'f_2', 'f_3', 'f_4', 'f_5'].map((id) => [id, [id]]),
    );
  });

  it('have a closed group as one row, where its first formula was, standing for its formulas', () => {
    const project = five();
    const group = groupFormulas(project, ['f_2', 'f_4'])!;
    const rows = creatorRows(project);
    expect(texts(rows)).toEqual(['alpha', '[grp1: beta delta]', 'gamma', 'epsilon']);
    expect(rows[1]).toMatchObject({
      kind: 'group',
      key: groupRowKey(group.id),
      ids: ['f_2', 'f_4'],
      open: false,
    });
    expect(groupOfRowKey(rows[1]!.key)).toBe(group.id);
    expect(groupOfRowKey(rows[0]!.key)).toBeNull();
  });

  it('have the formulas of an open group under it, in the order of the group', () => {
    const project = five();
    const group = groupFormulas(project, ['f_2', 'f_4'])!;
    addToFormulaGroup(project, group.id, ['f_1']);
    const rows = creatorRows(project, { open: new Set([group.id]) });
    expect(texts(rows)).toEqual([
      '[grp1▾: beta delta alpha]',
      '·beta',
      '·delta',
      '·alpha',
      'gamma',
      'epsilon',
    ]);
    expect(rows[1]).toMatchObject({ kind: 'formula', key: 'f_2', ids: ['f_2'], group });
  });

  it('draw a project that breaks the rule: each formula once, no empty group', () => {
    const project = five();
    project.formulaGroups = [
      createFormulaGroup('one', ['gone', 'f_2', 'f_6', 'f_2']),
      createFormulaGroup('two', ['f_2', 'f_3']),
      createFormulaGroup('none', ['gone']),
    ];
    const open = new Set(project.formulaGroups.map((g) => g.id));
    expect(texts(creatorRows(project, { open }))).toEqual([
      'alpha',
      '[one▾: beta]',
      '·beta',
      '[two▾: gamma]',
      '·gamma',
      'delta',
      'epsilon',
    ]);
  });

  it('find the row that shows a formula: its own, or its closed group', () => {
    const project = five();
    const group = groupFormulas(project, ['f_2', 'f_4'])!;
    const closed = creatorRows(project);
    expect(rowOfFormula(closed, 'f_4')).toMatchObject({ kind: 'group' });
    expect(rowOfFormula(closed, 'f_3')).toMatchObject({ kind: 'formula', key: 'f_3' });
    const open = creatorRows(project, { open: new Set([group.id]) });
    expect(rowOfFormula(open, 'f_4')).toMatchObject({ kind: 'formula', key: 'f_4' });
    expect(rowOfFormula(open, 'nope')).toBeUndefined();
  });
});

describe('how a row is drawn', () => {
  const row = { key: 'group:g', ids: ['a', 'b'] };
  it('is selected when all its formulas are, linked when one is of a selected clip', () => {
    expect(rowHighlight(row, new Set(['a', 'b', 'c']), new Set())).toBe('selected');
    expect(rowHighlight(row, new Set(['a']), new Set())).toBe('none');
    expect(rowHighlight(row, new Set(['a']), new Set(['b']))).toBe('linked');
    expect(rowHighlight({ key: 'x', ids: [] }, new Set(['a']), new Set())).toBe('none');
  });
});

describe('what the menu of the selected formulas offers about groups', () => {
  it('groups two or more formulas, and has nothing else to offer without groups', () => {
    const project = five();
    expect(groupChoices(project, ['f_1'])).toEqual({ group: false, addTo: [], remove: false });
    expect(groupChoices(project, ['f_1', 'f_2'])).toEqual({
      group: true,
      addTo: [],
      remove: false,
    });
  });

  it('adds formulas on their own to a group, and removes the grouped ones', () => {
    const project = five();
    const one = groupFormulas(project, ['f_1', 'f_2'])!;
    const two = groupFormulas(project, ['f_3'])!;
    const groups = project.formulaGroups!;
    // A formula in no group: any group takes it.
    expect(groupChoices(project, ['f_5'])).toEqual({ group: false, addTo: groups, remove: false });
    // A grouped formula: out of its group (or, with others, into a new one).
    expect(groupChoices(project, ['f_1'])).toEqual({ group: false, addTo: [], remove: true });
    // Mixed: the loose one can join either group; the grouped one can leave.
    expect(groupChoices(project, ['f_1', 'f_5'])).toEqual({
      group: true,
      addTo: [one, two],
      remove: true,
    });
    // A whole group: it is a group already.
    expect(groupChoices(project, ['f_1', 'f_2'])).toEqual({
      group: false,
      addTo: [],
      remove: true,
    });
    // Part of a group and another group: a new group can be made of them.
    expect(groupChoices(project, ['f_1', 'f_3'])).toEqual({ group: true, addTo: [], remove: true });
  });
});
