/* What the Creator does with groups of formulas (model/formulaGroups.ts): make one of the
 * selected formulas, undo one, rename one, and change what is in one — put the selected
 * formulas, or a formula dropped on its row, into it, or take them out of theirs. Each is one
 * undo step; the formulas themselves are never changed, and the selection stays on them. */
import {
  addToFormulaGroup,
  formulaGroupsOf,
  formulaListOrder,
  groupFormulas,
  removeFromFormulaGroups,
  renameFormulaGroup,
  ungroupFormulas,
  validateFormulaGroupName,
  type FormulaGroupId,
  type FormulaId,
} from '../../../model';
import { useProjectStore, useUiStore } from '../../../store';
import { announce } from '../../announcer';
import { formulaSelection, selectedFormulaIds } from '../../selection';

const count = (n: number) => (n === 1 ? '1 formula' : `${n} formulas`);

/** The row of a group in the list, to focus it. */
export const groupRowElement = (id: FormulaGroupId) =>
  document.querySelector<HTMLElement>(
    `[data-testid="formula-list"] [data-group-id="${CSS.escape(id)}"]`,
  );

/** The row or block of a formula in the list. */
const formulaRowElement = (id: FormulaId) =>
  document.querySelector<HTMLElement>(
    `[data-testid="formula-list"] [data-formula-id="${CSS.escape(id)}"]`,
  );

/** Make a group of the selected formulas, named `grpN`: it takes the place of the first of them
 * in the list, closed, and they stay selected. Returns its id, or null when nothing was
 * selected. */
export function groupSelectedFormulas(): FormulaGroupId | null {
  const ids = selectedFormulaIds(useUiStore.getState().selection);
  let made = null as { id: FormulaGroupId; name: string; size: number } | null;
  useProjectStore.getState().update((draft) => {
    const group = groupFormulas(draft, ids);
    if (group) made = { id: group.id, name: group.name, size: group.formulaIds.length };
  });
  if (!made) return null;
  const { id, name, size } = made;
  announce(`Group ${name} made of ${count(size)}`);
  // The rows of its formulas are gone into it: the focus goes to the group.
  requestAnimationFrame(() => groupRowElement(id)?.focus());
  return id;
}

/** Undo a group: its formulas are on their own again, where the list has them. */
export function ungroup(groupId: FormulaGroupId): void {
  const group = formulaGroupsOf(useProjectStore.getState().project).find((g) => g.id === groupId);
  if (!group) return;
  const first = group.formulaIds[0];
  useProjectStore.getState().update((draft) => void ungroupFormulas(draft, groupId));
  // The selected formulas are back where the list has them: the selection follows that order.
  const ui = useUiStore.getState();
  if (ui.selection.kind === 'formulas') {
    const order = formulaListOrder(useProjectStore.getState().project);
    ui.select(formulaSelection(ui.selection.ids, order));
  }
  announce(`Group ${group.name} undone: ${count(group.formulaIds.length)} on their own`);
  requestAnimationFrame(() => first !== undefined && formulaRowElement(first)?.focus());
}

/** Put formulas into a group, after the ones it has: one that was in another group leaves it.
 * Whether anything changed. */
function addToGroup(groupId: FormulaGroupId, ids: readonly FormulaId[]): boolean {
  const project = useProjectStore.getState().project;
  const group = formulaGroupsOf(project).find((g) => g.id === groupId);
  const coming = ids.filter((id) => !group?.formulaIds.includes(id));
  if (!group || coming.length === 0) return false;
  let changed = false;
  useProjectStore.getState().update((draft) => {
    changed = addToFormulaGroup(draft, groupId, coming);
  });
  if (!changed) return false;
  const names = coming.map((id) => project.formulas.find((f) => f.id === id)?.name ?? id);
  announce(`${names.length === 1 ? names[0] : count(names.length)} added to group ${group.name}`);
  return true;
}

/** «Add to group ›» of the selected formulas' menu: they go into the group. When it is closed
 * their rows go into it, and the focus to its row. */
export function addSelectedToGroup(groupId: FormulaGroupId): void {
  if (!addToGroup(groupId, selectedFormulaIds(useUiStore.getState().selection))) return;
  requestAnimationFrame(() => {
    if (!document.activeElement || document.activeElement === document.body)
      groupRowElement(groupId)?.focus();
  });
}

/** A formula dropped on the row of a group goes into it (nothing happens when it is in it). */
export function dropFormulaOnGroup(groupId: FormulaGroupId, formulaId: FormulaId): void {
  addToGroup(groupId, [formulaId]);
}

/** «Remove from group» of the selected formulas' menu: those that are in a group are on their
 * own again, where the list has them; a group left without formulas goes. */
export function removeSelectedFromGroups(): void {
  const ids = selectedFormulaIds(useUiStore.getState().selection);
  const project = useProjectStore.getState().project;
  const grouped = ids.filter((id) =>
    formulaGroupsOf(project).some((g) => g.formulaIds.includes(id)),
  );
  if (grouped.length === 0) return;
  useProjectStore.getState().update((draft) => void removeFromFormulaGroups(draft, grouped));
  const ui = useUiStore.getState();
  if (ui.selection.kind === 'formulas') {
    const order = formulaListOrder(useProjectStore.getState().project);
    ui.select(formulaSelection(ui.selection.ids, order));
  }
  announce(
    `${count(grouped.length)} taken out of ${grouped.length === 1 ? 'its group' : 'their groups'}`,
  );
}

/** Rename a group. Returns why the name cannot be used, or null when it was taken (or is the
 * name the group has). */
export function renameGroup(groupId: FormulaGroupId, name: string): string | null {
  const error = validateFormulaGroupName(name);
  if (error) return error;
  const group = formulaGroupsOf(useProjectStore.getState().project).find((g) => g.id === groupId);
  if (!group || group.name === name.trim()) return null;
  useProjectStore.getState().update((draft) => void renameFormulaGroup(draft, groupId, name));
  return null;
}
