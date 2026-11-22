/* Selecting every object of a kind from the Creator's toolbar (D155): one choice per kind the
 * Creator lists — formulas, LaTeX texts, font texts —, the rows of the menu of one key, «Select by
 * kind», left of «+ New» (D183, where there were three keys; KindMenu.tsx). A row adds every
 * object of its kind in the project to the selection of formulas (those in a folded group too,
 * and whatever the search of formulas shows or hides), so that two rows chosen one after the other
 * select both kinds; chosen while its kind is all selected, it takes that kind out of the
 * selection and leaves the others as they are. Braces, shapes and lines are of none of the three.
 * Pure. */
import { KINDS, type Formula, type FormulaId, type FormulaKind } from '../../model';
import type { Selection } from '../../store';
import { formulaSelection, selectedFormulaIds } from '../selection';

/** A kind a row selects: one the Creator lists. */
export type SelectKind = Extract<FormulaKind, 'math' | 'tex' | 'text'>;

export interface SelectKindInfo {
  kind: SelectKind;
  /** The objects of the kind, as the tooltips name them inside a sentence. */
  plural: string;
  /** The same, as the row of the menu names them. */
  name: string;
}

/** The rows, in the order the menu has them (a test keeps them equal to the `listed` kinds). */
export const SELECT_KINDS: readonly SelectKindInfo[] = [
  { kind: 'math', plural: 'formulas', name: 'Formulas' },
  { kind: 'tex', plural: 'LaTeX texts', name: 'LaTeX texts' },
  { kind: 'text', plural: 'font texts', name: 'Font texts' },
];

/** The name of the key that opens the menu, and of the menu. */
export const SELECT_KIND_LABEL = 'Select by kind';

/** How much of a kind the selection holds: how many objects of it the project has, and whether
 * every one of them is selected (never while it has none). */
export interface KindSelectionState {
  total: number;
  all: boolean;
}

export function kindSelectionState(
  selection: Selection,
  formulas: readonly Pick<Formula, 'id' | 'kind'>[],
  kind: SelectKind,
): KindSelectionState {
  const selected = new Set(selectedFormulaIds(selection));
  const ofKind = formulas.filter((f) => f.kind === kind);
  return {
    total: ofKind.length,
    all: ofKind.length > 0 && ofKind.every((f) => selected.has(f.id)),
  };
}

/** The selection after the key of `kind` is pressed: every object of the kind added to the
 * formulas selected — a selection of something else (clips, a relation, a block) is replaced, as a
 * click on a card replaces it —, or, when every one of them is selected already, the selection
 * without them. In the order of the Creator list (`order`); the same selection back when the
 * project has none of the kind. */
export function toggleKindSelection(
  selection: Selection,
  formulas: readonly Pick<Formula, 'id' | 'kind'>[],
  order: readonly FormulaId[],
  kind: SelectKind,
): Selection {
  const { total, all } = kindSelectionState(selection, formulas, kind);
  if (total === 0) return selection;
  const ofKind = new Set(formulas.filter((f) => f.kind === kind).map((f) => f.id));
  const selected = selectedFormulaIds(selection);
  const next = all ? selected.filter((id) => !ofKind.has(id)) : [...selected, ...ofKind];
  return formulaSelection(next, order);
}

/** What the row of a kind says it does: what choosing it would do now, or why it does nothing. */
export function selectKindTitle(info: SelectKindInfo, state: KindSelectionState): string {
  if (state.total === 0) return `The project has no ${info.plural}`;
  if (state.all) return `All ${info.plural} are selected (${state.total}): choose to deselect them`;
  return `Select all ${info.plural} (${state.total}), added to the selection`;
}

/** A row of the menu: its kind, the mark the list gives each object of it (∑, T, P), how much of
 * it is selected — it is ticked while all of it is, and off while the project has none — and its
 * tooltip. */
export interface KindRow {
  info: SelectKindInfo;
  mark: string;
  state: KindSelectionState;
  title: string;
}

export function kindRows(
  selection: Selection,
  formulas: readonly Pick<Formula, 'id' | 'kind'>[],
): KindRow[] {
  return SELECT_KINDS.map((info) => {
    const state = kindSelectionState(selection, formulas, info.kind);
    return { info, mark: KINDS[info.kind].mark, state, title: selectKindTitle(info, state) };
  });
}

/** Whether the key is lit: some kind is all selected. */
export const anyKindAll = (rows: readonly KindRow[]): boolean => rows.some((row) => row.state.all);
