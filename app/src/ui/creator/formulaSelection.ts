/* Selecting formulas in the Creator list: click = just this one, Ctrl/⌘+click = toggle, Shift+
 * click = the range from the last clicked one (Ctrl/⌘+Shift: added to the selection). One
 * formula is a `formula` selection, several a `formulas` one (ui/selection.ts).
 *
 * The list is made of rows, and a row stands for formulas: a formula's row for that formula, the
 * row of a group of formulas (groups/groupRows.ts) for the formulas of the group — a group is
 * selected by selecting them, there is no selection of a group. `clickRow` and `navigateRows`
 * work on rows; `clickFormula` and `navigateFormulas` are the same for a list of formulas only.
 * Pure, so it can be tested without a DOM. */
import type { FormulaId } from '../../model';
import type { Selection } from '../../store';
import { formulaSelection, selectedFormulaIds } from '../selection';

/** A row of the list: its key (a formula's id for the row of a formula) and the formulas it
 * stands for. */
export interface ListRow {
  key: string;
  ids: readonly FormulaId[];
}

/** The selection of the formulas `ids`: the very `formula` selection for one, as a click gives. */
function selectionOf(ids: readonly FormulaId[], order: readonly FormulaId[]): Selection {
  return ids.length === 1 ? { kind: 'formula', id: ids[0]! } : formulaSelection(ids, order);
}

export function clickRow(
  current: Selection,
  key: string,
  options: {
    /** Every formula, in list order: the order of a selection. */
    order: readonly FormulaId[];
    /** The rows the list shows now (the Creator's, or the results of the search of formulas): a
     * range runs along them. */
    rows: readonly ListRow[];
    /** The row a range starts from: the last one clicked. */
    anchor: string | null;
    toggle: boolean;
    range: boolean;
  },
): Selection {
  const { order, rows, anchor } = options;
  const selected = selectedFormulaIds(current);
  const at = rows.findIndex((row) => row.key === key);
  if (at < 0) return current;
  const from = anchor === null ? -1 : rows.findIndex((row) => row.key === anchor);
  if (options.range && from >= 0) {
    const range = rows.slice(Math.min(from, at), Math.max(from, at) + 1).flatMap((row) => row.ids);
    return formulaSelection(options.toggle ? [...selected, ...range] : range, order);
  }
  const { ids } = rows[at]!;
  if (options.toggle) {
    // A row whose formulas are all selected gives them up; any other brings all of its own.
    const next = new Set(selected);
    if (ids.every((id) => next.has(id))) for (const id of ids) next.delete(id);
    else for (const id of ids) next.add(id);
    return formulaSelection(next, order);
  }
  return selectionOf(ids, order);
}

export function clickFormula(
  current: Selection,
  id: FormulaId,
  options: {
    /** Every formula, in list order: the order of a selection. */
    order: readonly FormulaId[];
    /** The formulas the list shows now: a range runs along them. */
    visible: readonly FormulaId[];
    /** The formula a range starts from: the last one clicked. */
    anchor: FormulaId | null;
    toggle: boolean;
    range: boolean;
  },
): Selection {
  const { visible, ...rest } = options;
  // A formula the list does not show is a row of its own, which no range reaches.
  const shown = visible.includes(id);
  const rows = formulaRows(shown ? visible : [...visible, id]);
  return clickRow(current, id, { ...rest, range: rest.range && shown, rows });
}

const formulaRows = (ids: readonly FormulaId[]): ListRow[] =>
  ids.map((id) => ({ key: id, ids: [id] }));

export type ListKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | ' ';

/** What the list is asked by a key press on one of its rows: the key, and whether Shift (a range)
 * and Ctrl or ⌘ (the focus alone; with Space, the row added or taken out) are held. `keys` are
 * the keys the view walks with (the block view has ← and → too). Null for a key that is not the
 * list's, and for any key with Alt.
 *
 * On a Mac ⌘+Return is what Ctrl+Space is elsewhere, the click with ⌘ of the keyboard: ⌘+Space
 * opens Spotlight there and Ctrl+Space changes the language of the keyboard, the system's keys
 * both, which may never reach the page. */
export function listKeyOf(
  event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  keys: ReadonlySet<string>,
  mac: boolean,
): { key: ListKey; modifiers: { shift: boolean; ctrl: boolean } } | null {
  if (event.altKey) return null;
  const toggles = mac && event.key === 'Enter' && event.metaKey && !event.ctrlKey;
  if (toggles && !event.shiftKey && keys.has(' ')) {
    return { key: ' ', modifiers: { shift: false, ctrl: true } };
  }
  if (!keys.has(event.key)) return null;
  return {
    key: event.key as ListKey,
    modifiers: { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey },
  };
}

/** The formula list as a listbox: what a key does from the focused row. ↑/↓/Home/End move
 * and select (Shift: a range from the anchor; Ctrl: the focus only), Space selects the focused
 * row (Ctrl+Space: adds or removes it; ⌘+Return on a Mac, `listKeyOf`). In a grid of blocks (`columns` > 1, R3) ↑/↓ move a
 * row and ←/→ a block, the first and the last block bounding them. Null when the key does
 * nothing. */
export function navigateRows(
  current: Selection,
  focused: string,
  key: ListKey,
  modifiers: { shift: boolean; ctrl: boolean },
  options: {
    order: readonly FormulaId[];
    rows: readonly ListRow[];
    anchor: string | null;
    /** The columns of the grid of blocks; 1 (the list) leaves ←/→ alone. */
    columns?: number;
  },
): { focus: string; selection: Selection | null; anchor: string | null } | null {
  const { rows, order } = options;
  const columns = options.columns ?? 1;
  const index = rows.findIndex((row) => row.key === focused);
  if (index < 0) return null;
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && columns === 1) return null;
  if (key === ' ') {
    return {
      focus: focused,
      selection: clickRow(current, focused, {
        order,
        rows,
        anchor: options.anchor,
        toggle: modifiers.ctrl,
        range: false,
      }),
      anchor: focused,
    };
  }
  const step =
    key === 'ArrowDown'
      ? columns
      : key === 'ArrowUp'
        ? -columns
        : key === 'ArrowRight'
          ? 1
          : key === 'ArrowLeft'
            ? -1
            : 0;
  const target =
    key === 'Home'
      ? 0
      : key === 'End'
        ? rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, index + step));
  const focus = rows[target]!.key;
  if (modifiers.ctrl && !modifiers.shift) return { focus, selection: null, anchor: options.anchor };
  if (modifiers.shift) {
    const anchor = options.anchor ?? focused;
    return {
      focus,
      selection: clickRow(current, focus, { order, rows, anchor, toggle: false, range: true }),
      anchor,
    };
  }
  return {
    focus,
    selection: clickRow(current, focus, { order, rows, anchor: null, toggle: false, range: false }),
    anchor: focus,
  };
}

/** `navigateRows` for a list of formulas alone. */
export function navigateFormulas(
  current: Selection,
  focused: FormulaId,
  key: ListKey,
  modifiers: { shift: boolean; ctrl: boolean },
  options: {
    order: readonly FormulaId[];
    visible: readonly FormulaId[];
    anchor: FormulaId | null;
    /** The columns of the grid of blocks; 1 (the list) leaves ←/→ alone. */
    columns?: number;
  },
): { focus: FormulaId; selection: Selection | null; anchor: FormulaId | null } | null {
  const { visible, ...rest } = options;
  return navigateRows(current, focused, key, modifiers, { ...rest, rows: formulaRows(visible) });
}
