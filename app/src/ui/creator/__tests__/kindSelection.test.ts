// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KINDS, type FormulaKind } from '../../../model';
import type { Selection } from '../../../store';
import {
  anyKindAll,
  kindRows,
  kindSelectionState,
  selectKindTitle,
  SELECT_KINDS,
  toggleKindSelection,
  type SelectKind,
} from '../kindSelection';

/** Two formulas, a LaTeX text between them, a font text, and a brace and a shape the Creator does
 * not list; `order` is the Creator list's (the text first, as a group would put it). */
const formulas: { id: string; kind: FormulaKind }[] = [
  { id: 'm1', kind: 'math' },
  { id: 't1', kind: 'tex' },
  { id: 'm2', kind: 'math' },
  { id: 'p1', kind: 'text' },
  { id: 'b1', kind: 'brace' },
  { id: 's1', kind: 'shape' },
];
const order = ['t1', 'm1', 'm2', 'p1'];
const press = (selection: Selection, kind: SelectKind) =>
  toggleKindSelection(selection, formulas, order, kind);

describe('the rows that select every object of a kind', () => {
  it('are one per kind the Creator lists, and none for braces, shapes or lines', () => {
    const listed = (Object.keys(KINDS) as FormulaKind[]).filter((kind) => KINDS[kind].listed);
    expect(SELECT_KINDS.map((info) => info.kind)).toEqual(listed);
    expect(SELECT_KINDS.map((info) => info.name)).toEqual([
      'Formulas',
      'LaTeX texts',
      'Font texts',
    ]);
  });

  it('a key adds every object of its kind to the formulas selected, in the list order', () => {
    expect(press({ kind: 'none' }, 'math')).toEqual({ kind: 'formulas', ids: ['m1', 'm2'] });
    // What was selected stays: the kinds add up, one key after the other.
    const texts = press({ kind: 'formula', id: 'p1' }, 'tex');
    expect(texts).toEqual({ kind: 'formulas', ids: ['t1', 'p1'] });
    expect(press(texts, 'math')).toEqual({ kind: 'formulas', ids: ['t1', 'm1', 'm2', 'p1'] });
    // Some of the kind selected already: the rest comes too.
    expect(press({ kind: 'formula', id: 'm2' }, 'math')).toEqual({
      kind: 'formulas',
      ids: ['m1', 'm2'],
    });
    // One object of the kind is the selection of one formula, as a click gives.
    expect(press({ kind: 'none' }, 'text')).toEqual({ kind: 'formula', id: 'p1' });
  });

  it('a selection of something else is replaced, as a click on a card replaces it', () => {
    expect(press({ kind: 'clips', ids: ['c1'] }, 'tex')).toEqual({ kind: 'formula', id: 't1' });
    expect(press({ kind: 'relation', id: 'r1' }, 'math')).toEqual({
      kind: 'formulas',
      ids: ['m1', 'm2'],
    });
  });

  it('pressed with its kind all selected, it takes that kind out and leaves the others', () => {
    const all: Selection = { kind: 'formulas', ids: ['t1', 'm1', 'm2', 'p1'] };
    expect(press(all, 'math')).toEqual({ kind: 'formulas', ids: ['t1', 'p1'] });
    expect(press({ kind: 'formulas', ids: ['t1', 'p1'] }, 'text')).toEqual({
      kind: 'formula',
      id: 't1',
    });
    expect(press({ kind: 'formula', id: 'p1' }, 'text')).toEqual({ kind: 'none' });
    // Pressed twice, a key gives back what there was besides its kind.
    const before: Selection = { kind: 'formula', id: 'p1' };
    expect(press(press(before, 'math'), 'math')).toEqual(before);
  });

  it('does nothing while the project has none of its kind', () => {
    const noFont = formulas.filter((f) => f.kind !== 'text');
    const selection: Selection = { kind: 'formula', id: 'm1' };
    expect(toggleKindSelection(selection, noFont, order, 'text')).toBe(selection);
    expect(kindSelectionState(selection, noFont, 'text')).toEqual({ total: 0, all: false });
  });

  it('says how much of a kind is selected, and the key says what it does', () => {
    const info = SELECT_KINDS.find((entry) => entry.kind === 'math')!;
    const some = kindSelectionState({ kind: 'formula', id: 'm1' }, formulas, 'math');
    expect(some).toEqual({ total: 2, all: false });
    expect(selectKindTitle(info, some)).toBe('Select all formulas (2), added to the selection');
    const all = kindSelectionState({ kind: 'formulas', ids: ['m1', 'm2'] }, formulas, 'math');
    expect(all).toEqual({ total: 2, all: true });
    expect(selectKindTitle(info, all)).toBe(
      'All formulas are selected (2): choose to deselect them',
    );
    const font = SELECT_KINDS.find((entry) => entry.kind === 'text')!;
    expect(selectKindTitle(font, { total: 0, all: false })).toBe('The project has no font texts');
  });

  it('lists the rows of the menu with their marks, ticks and tooltips; the key lit by any', () => {
    const noFont = formulas.filter((f) => f.kind !== 'text');
    const rows = kindRows({ kind: 'formulas', ids: ['m1', 'm2'] }, noFont);
    expect(rows.map((row) => [row.info.kind, row.mark, row.state, row.title])).toEqual([
      [
        'math',
        '∑',
        { total: 2, all: true },
        'All formulas are selected (2): choose to deselect them',
      ],
      ['tex', 'T', { total: 1, all: false }, 'Select all LaTeX texts (1), added to the selection'],
      ['text', 'P', { total: 0, all: false }, 'The project has no font texts'],
    ]);
    expect(anyKindAll(rows)).toBe(true);
    // Part of a kind is not all of it; a kind the project lacks is never all selected.
    expect(anyKindAll(kindRows({ kind: 'formula', id: 'm1' }, noFont))).toBe(false);
    expect(anyKindAll(kindRows({ kind: 'none' }, noFont))).toBe(false);
    expect(anyKindAll(kindRows({ kind: 'formula', id: 't1' }, noFont))).toBe(true);
  });
});
