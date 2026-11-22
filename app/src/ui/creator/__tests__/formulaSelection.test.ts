// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clickFormula,
  clickRow,
  listKeyOf,
  navigateFormulas,
  navigateRows,
} from '../formulaSelection';

const order = ['a', 'b', 'c', 'd', 'e'];
const click = (
  current: Parameters<typeof clickFormula>[0],
  id: string,
  modifiers: { toggle?: boolean; range?: boolean; anchor?: string | null; visible?: string[] } = {},
) =>
  clickFormula(current, id, {
    order,
    visible: modifiers.visible ?? order,
    anchor: modifiers.anchor ?? null,
    toggle: modifiers.toggle ?? false,
    range: modifiers.range ?? false,
  });

describe('formula selection in the Creator', () => {
  it('a click selects one formula; Ctrl/⌘ toggles, keeping list order', () => {
    expect(click({ kind: 'none' }, 'c')).toEqual({ kind: 'formula', id: 'c' });
    const two = click({ kind: 'formula', id: 'd' }, 'b', { toggle: true });
    expect(two).toEqual({ kind: 'formulas', ids: ['b', 'd'] });
    expect(click(two, 'd', { toggle: true })).toEqual({ kind: 'formula', id: 'b' });
    expect(click({ kind: 'formula', id: 'b' }, 'b', { toggle: true })).toEqual({ kind: 'none' });
    // A plain click on one of several leaves just that one.
    expect(click(two, 'd')).toEqual({ kind: 'formula', id: 'd' });
  });

  it('Shift selects the range from the last clicked formula, along the visible list', () => {
    expect(click({ kind: 'formula', id: 'b' }, 'd', { range: true, anchor: 'b' })).toEqual({
      kind: 'formulas',
      ids: ['b', 'c', 'd'],
    });
    // With Ctrl/⌘ too, the range is added to what was selected.
    expect(
      click({ kind: 'formula', id: 'e' }, 'b', { range: true, toggle: true, anchor: 'a' }),
    ).toEqual({ kind: 'formulas', ids: ['a', 'b', 'e'] });
    // A search hides c: the range skips it.
    expect(
      click({ kind: 'formula', id: 'b' }, 'd', {
        range: true,
        anchor: 'b',
        visible: ['a', 'b', 'd'],
      }),
    ).toEqual({ kind: 'formulas', ids: ['b', 'd'] });
    // Without an anchor it is a plain click.
    expect(click({ kind: 'none' }, 'c', { range: true })).toEqual({ kind: 'formula', id: 'c' });
  });
});

describe('navigateFormulas', () => {
  const order = ['a', 'b', 'c', 'd'];
  const opts = (anchor: string | null = null) => ({ order, visible: order, anchor });
  const none = { shift: false, ctrl: false };

  it('moves and selects with the arrows, Home and End', () => {
    const one = { kind: 'formula', id: 'b' } as const;
    expect(navigateFormulas(one, 'b', 'ArrowDown', none, opts('b'))).toEqual({
      focus: 'c',
      selection: { kind: 'formula', id: 'c' },
      anchor: 'c',
    });
    expect(navigateFormulas(one, 'b', 'ArrowUp', none, opts())?.focus).toBe('a');
    expect(navigateFormulas(one, 'a', 'ArrowUp', none, opts())?.focus).toBe('a'); // stays
    expect(navigateFormulas(one, 'b', 'End', none, opts())?.focus).toBe('d');
    expect(navigateFormulas(one, 'c', 'Home', none, opts())?.focus).toBe('a');
  });

  it('in a grid of blocks, ↑/↓ move a row and ←/→ a block, bounded by the first and the last', () => {
    const one = { kind: 'formula', id: 'b' } as const;
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const grid = { order: seven, visible: seven, anchor: 'b', columns: 3 };
    expect(navigateFormulas(one, 'b', 'ArrowDown', none, grid)?.focus).toBe('e');
    expect(navigateFormulas(one, 'e', 'ArrowUp', none, grid)?.focus).toBe('b');
    expect(navigateFormulas(one, 'c', 'ArrowRight', none, grid)?.focus).toBe('d');
    expect(navigateFormulas(one, 'd', 'ArrowLeft', none, grid)?.focus).toBe('c');
    expect(navigateFormulas(one, 'a', 'ArrowLeft', none, grid)?.focus).toBe('a');
    expect(navigateFormulas(one, 'f', 'ArrowDown', none, grid)?.focus).toBe('g');
    expect(navigateFormulas(one, 'b', 'ArrowUp', none, grid)?.focus).toBe('a');
    expect(navigateFormulas(one, 'b', 'ArrowDown', { shift: true, ctrl: false }, grid)).toEqual({
      focus: 'e',
      selection: { kind: 'formulas', ids: ['b', 'c', 'd', 'e'] },
      anchor: 'b',
    });
    // The list: ←/→ do nothing.
    expect(navigateFormulas(one, 'b', 'ArrowRight', none, opts('b'))).toBeNull();
  });

  it('extends a range with Shift, moves only the focus with Ctrl, toggles with Ctrl+Space', () => {
    const one = { kind: 'formula', id: 'b' } as const;
    const shift = navigateFormulas(one, 'b', 'ArrowDown', { shift: true, ctrl: false }, opts('b'));
    expect(shift).toEqual({
      focus: 'c',
      selection: { kind: 'formulas', ids: ['b', 'c'] },
      anchor: 'b',
    });
    expect(
      navigateFormulas(one, 'b', 'ArrowDown', { shift: false, ctrl: true }, opts('b')),
    ).toEqual({ focus: 'c', selection: null, anchor: 'b' });
    expect(navigateFormulas(one, 'd', ' ', { shift: false, ctrl: true }, opts('b'))).toEqual({
      focus: 'd',
      selection: { kind: 'formulas', ids: ['b', 'd'] },
      anchor: 'd',
    });
    expect(navigateFormulas(one, 'd', ' ', none, opts('b'))?.selection).toEqual({
      kind: 'formula',
      id: 'd',
    });
  });
});

describe('rows that stand for several formulas (a group)', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  // a, the group of b and d (closed), c, e.
  const rows = [
    { key: 'a', ids: ['a'] },
    { key: 'group:g', ids: ['b', 'd'] },
    { key: 'c', ids: ['c'] },
    { key: 'e', ids: ['e'] },
  ];
  const click = (
    current: Parameters<typeof clickRow>[0],
    key: string,
    modifiers: { toggle?: boolean; range?: boolean; anchor?: string | null } = {},
  ) =>
    clickRow(current, key, {
      order,
      rows,
      anchor: modifiers.anchor ?? null,
      toggle: modifiers.toggle ?? false,
      range: modifiers.range ?? false,
    });

  it('a click on a group selects its formulas; on a formula, that one', () => {
    expect(click({ kind: 'none' }, 'group:g')).toEqual({ kind: 'formulas', ids: ['b', 'd'] });
    expect(click({ kind: 'formulas', ids: ['b', 'd'] }, 'c')).toEqual({ kind: 'formula', id: 'c' });
    // A key that is no row changes nothing.
    const current = { kind: 'formula', id: 'a' } as const;
    expect(click(current, 'nope')).toBe(current);
  });

  it('Ctrl/⌘ adds the formulas of a group, or takes them all away when all were selected', () => {
    const withGroup = click({ kind: 'formula', id: 'a' }, 'group:g', { toggle: true });
    expect(withGroup).toEqual({ kind: 'formulas', ids: ['a', 'b', 'd'] });
    expect(click(withGroup, 'group:g', { toggle: true })).toEqual({ kind: 'formula', id: 'a' });
    // One of its formulas selected already: the click completes the group.
    expect(click({ kind: 'formula', id: 'd' }, 'group:g', { toggle: true })).toEqual({
      kind: 'formulas',
      ids: ['b', 'd'],
    });
  });

  it('a Shift range runs along the rows and takes the formulas of each', () => {
    expect(click({ kind: 'formula', id: 'a' }, 'c', { range: true, anchor: 'a' })).toEqual({
      kind: 'formulas',
      ids: ['a', 'b', 'c', 'd'],
    });
    expect(click({ kind: 'none' }, 'e', { range: true, anchor: 'group:g' })).toEqual({
      kind: 'formulas',
      ids: ['b', 'c', 'd', 'e'],
    });
  });

  it('the keys walk the rows, a group among them', () => {
    const none = { shift: false, ctrl: false };
    const options = (anchor: string | null) => ({ order, rows, anchor });
    expect(
      navigateRows({ kind: 'formula', id: 'a' }, 'a', 'ArrowDown', none, options('a')),
    ).toEqual({
      focus: 'group:g',
      selection: { kind: 'formulas', ids: ['b', 'd'] },
      anchor: 'group:g',
    });
    expect(
      navigateRows(
        { kind: 'formulas', ids: ['b', 'd'] },
        'group:g',
        'ArrowDown',
        none,
        options(null),
      ),
    ).toEqual({ focus: 'c', selection: { kind: 'formula', id: 'c' }, anchor: 'c' });
    // Shift extends from the anchor over the group.
    expect(
      navigateRows(
        { kind: 'formula', id: 'a' },
        'a',
        'End',
        { shift: true, ctrl: false },
        options('a'),
      ),
    ).toEqual({
      focus: 'e',
      selection: { kind: 'formulas', ids: ['a', 'b', 'c', 'd', 'e'] },
      anchor: 'a',
    });
    // Ctrl moves the focus alone; Space then selects the group, Ctrl+Space adds it.
    expect(
      navigateRows(
        { kind: 'formula', id: 'a' },
        'a',
        'ArrowDown',
        { shift: false, ctrl: true },
        options('a'),
      ),
    ).toEqual({ focus: 'group:g', selection: null, anchor: 'a' });
    expect(
      navigateRows(
        { kind: 'formula', id: 'a' },
        'group:g',
        ' ',
        { shift: false, ctrl: true },
        options('a'),
      ),
    ).toEqual({
      focus: 'group:g',
      selection: { kind: 'formulas', ids: ['a', 'b', 'd'] },
      anchor: 'group:g',
    });
    expect(navigateRows({ kind: 'none' }, 'nope', 'ArrowDown', none, options(null))).toBeNull();
  });
});

describe('listKeyOf: the key of the list a key press is', () => {
  const LIST = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);
  const GRID = new Set([...LIST, 'ArrowLeft', 'ArrowRight']);
  const press = (
    key: string,
    mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {},
  ) => ({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it('is a key the view walks with, and what is held with it', () => {
    for (const mac of [false, true]) {
      expect(listKeyOf(press('ArrowDown'), LIST, mac)).toEqual({
        key: 'ArrowDown',
        modifiers: { shift: false, ctrl: false },
      });
      expect(listKeyOf(press('ArrowUp', { shiftKey: true }), LIST, mac)).toEqual({
        key: 'ArrowUp',
        modifiers: { shift: true, ctrl: false },
      });
      // Ctrl or ⌘: the focus alone.
      expect(listKeyOf(press('End', { ctrlKey: true }), LIST, mac)?.modifiers.ctrl).toBe(true);
      expect(listKeyOf(press('End', { metaKey: true }), LIST, mac)?.modifiers.ctrl).toBe(true);
      // ← and → are the block view's.
      expect(listKeyOf(press('ArrowRight'), LIST, mac)).toBeNull();
      expect(listKeyOf(press('ArrowRight'), GRID, mac)?.key).toBe('ArrowRight');
      // Not with Alt, and not a key of another kind.
      expect(listKeyOf(press('ArrowDown', { altKey: true }), LIST, mac)).toBeNull();
      expect(listKeyOf(press('Enter'), LIST, mac)).toBeNull();
      expect(listKeyOf(press('F2'), LIST, mac)).toBeNull();
    }
  });

  it('takes Ctrl+Space for the row added or taken out', () => {
    expect(listKeyOf(press(' ', { ctrlKey: true }), LIST, false)).toEqual({
      key: ' ',
      modifiers: { shift: false, ctrl: true },
    });
    // Where the system lets them through, on a Mac too.
    expect(listKeyOf(press(' ', { ctrlKey: true }), LIST, true)?.modifiers.ctrl).toBe(true);
    expect(listKeyOf(press(' ', { metaKey: true }), LIST, true)?.modifiers.ctrl).toBe(true);
  });

  it('takes ⌘+Return for it on a Mac, where ⌘+Space and Ctrl+Space are the system’s', () => {
    const toggle = { key: ' ', modifiers: { shift: false, ctrl: true } };
    expect(listKeyOf(press('Enter', { metaKey: true }), LIST, true)).toEqual(toggle);
    expect(listKeyOf(press('Enter', { metaKey: true }), GRID, true)).toEqual(toggle);
    // Return alone opens the formula, and so does it with any other key held.
    expect(listKeyOf(press('Enter'), LIST, true)).toBeNull();
    expect(listKeyOf(press('Enter', { ctrlKey: true }), LIST, true)).toBeNull();
    expect(listKeyOf(press('Enter', { metaKey: true, shiftKey: true }), LIST, true)).toBeNull();
    expect(listKeyOf(press('Enter', { metaKey: true, altKey: true }), LIST, true)).toBeNull();
    expect(listKeyOf(press('Enter', { metaKey: true, ctrlKey: true }), LIST, true)).toBeNull();
    // Elsewhere Ctrl+Enter is Enter: it opens the formula.
    expect(listKeyOf(press('Enter', { ctrlKey: true }), LIST, false)).toBeNull();
    expect(listKeyOf(press('Enter', { metaKey: true }), LIST, false)).toBeNull();
  });

  it('adds the row to the selection and takes it out, as a click with ⌘ does', () => {
    const asked = listKeyOf(press('Enter', { metaKey: true }), LIST, true)!;
    const options = { order, visible: order, anchor: 'a' };
    const added = navigateFormulas(
      { kind: 'formula', id: 'a' },
      'c',
      asked.key,
      asked.modifiers,
      options,
    );
    expect(added).toEqual({
      focus: 'c',
      selection: { kind: 'formulas', ids: ['a', 'c'] },
      anchor: 'c',
    });
    const out = navigateFormulas(added!.selection!, 'c', asked.key, asked.modifiers, options);
    expect(out?.selection).toEqual({ kind: 'formula', id: 'a' });
  });
});
