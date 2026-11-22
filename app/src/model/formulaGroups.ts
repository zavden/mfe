/* Groups of formulas (format 22): a way to keep the Creator's list in order. A group has a name
 * and formulas; the Creator shows it as one row that opens onto them, and a group stands for its
 * formulas wherever several formulas can be acted on. Nothing else reads it: the scene, the
 * timeline, the export and the video are the same with or without groups.
 *
 * The rule: a formula is in one group at most; only the kinds of object the Creator lists
 * (`KINDS.listed`) are in one; a group has a name and at least one formula; there are no groups
 * inside groups. `project.formulaGroups` is absent while the project has none.
 *
 * Where a group sits: the Creator's list follows `project.formulas`, and a group takes the place
 * of the first of its formulas (`formulaIds[0]`); its other formulas leave their own places and
 * come under it, in the group's order (`formulaListOrder`).
 *
 * A group that breaks the rule is put right, not refused (`repairFormulaGroups`): a formula that
 * went away leaves its group, a group left without formulas goes. The project store applies that
 * after every edit and the loader to a file, so deleting a formula takes it out of its group
 * whatever deleted it. Not to be confused with the groups of animation blocks (`groups.ts`). */
import { newId } from './ids';
import { kindOf } from './kinds';
import type { Formula, FormulaGroup, FormulaGroupId, FormulaId, Project } from './types';

const NO_GROUPS: readonly FormulaGroup[] = [];

/** The groups of formulas of a project (none while the field is absent). */
export function formulaGroupsOf(project: Pick<Project, 'formulaGroups'>): readonly FormulaGroup[] {
  return project.formulaGroups ?? NO_GROUPS;
}

/** The group a formula is in, if any. */
export function formulaGroupOf(
  project: Pick<Project, 'formulaGroups'>,
  formulaId: FormulaId,
): FormulaGroup | undefined {
  return formulaGroupsOf(project).find((group) => group.formulaIds.includes(formulaId));
}

/** The name a new group gets: `grp1`, or the first `grpN` no group has. */
export function nextFormulaGroupName(groups: readonly FormulaGroup[]): string {
  const used = new Set(groups.map((group) => group.name));
  for (let n = 1; ; n++) if (!used.has(`grp${n}`)) return `grp${n}`;
}

/** A group of the formulas `formulaIds`, in that order. */
export function createFormulaGroup(name: string, formulaIds: readonly FormulaId[]): FormulaGroup {
  return { id: newId('b'), name, formulaIds: [...formulaIds] };
}

/** The formulas the Creator lists, in the order it lists them: `project.formulas`, with each
 * group in the place of its first formula and its formulas together, in the group's order. */
export function formulaListOrder(
  project: Pick<Project, 'formulas' | 'formulaGroups'>,
): FormulaId[] {
  const listed = new Set(project.formulas.filter((f) => kindOf(f).listed).map((f) => f.id));
  const groupOf = new Map<FormulaId, FormulaGroup>();
  for (const group of formulaGroupsOf(project)) {
    for (const id of group.formulaIds) if (!groupOf.has(id)) groupOf.set(id, group);
  }
  const order: FormulaId[] = [];
  const placed = new Set<FormulaGroupId>();
  for (const formula of project.formulas) {
    if (!listed.has(formula.id)) continue;
    const group = groupOf.get(formula.id);
    if (!group) order.push(formula.id);
    else if (!placed.has(group.id) && membersOf(group, listed, groupOf)[0] === formula.id) {
      placed.add(group.id);
      order.push(...membersOf(group, listed, groupOf));
    }
  }
  return order;
}

/** The formulas of `group` that are its own to show: listed ones, each once, and not those an
 * earlier group already holds (a project that breaks the rule is still drawn). */
function membersOf(
  group: FormulaGroup,
  listed: ReadonlySet<FormulaId>,
  groupOf: ReadonlyMap<FormulaId, FormulaGroup>,
): FormulaId[] {
  return [...new Set(group.formulaIds)].filter((id) => listed.has(id) && groupOf.get(id) === group);
}

// --- Editing (on a project that may be an immer draft) ---------------------------------

/** Write the groups back: the field is absent while there is none. */
function setGroups(project: Project, groups: FormulaGroup[]): void {
  if (groups.length > 0) project.formulaGroups = groups;
  else delete project.formulaGroups;
}

/** Take the formulas `ids` out of whatever group holds them; a group left empty goes. */
function detach(project: Project, ids: ReadonlySet<FormulaId>): boolean {
  let changed = false;
  const groups: FormulaGroup[] = [];
  for (const group of formulaGroupsOf(project)) {
    const kept = group.formulaIds.filter((id) => !ids.has(id));
    if (kept.length !== group.formulaIds.length) {
      changed = true;
      group.formulaIds = kept;
    }
    if (kept.length > 0) groups.push(group);
  }
  if (changed) setGroups(project, groups);
  return changed;
}

/** The ids of `ids` that are formulas the Creator lists, in the order it lists them. */
function listedIds(project: Project, ids: Iterable<FormulaId>): FormulaId[] {
  const wanted = new Set(ids);
  return formulaListOrder(project).filter((id) => wanted.has(id));
}

/** Make a group of the formulas `ids` (in the list's order), named `name` or the next `grpN`:
 * those that were in another group leave it. Returns the group, or null when none of `ids` is a
 * formula the Creator lists. */
export function groupFormulas(
  project: Project,
  ids: Iterable<FormulaId>,
  name?: string,
): FormulaGroup | null {
  const members = listedIds(project, ids);
  if (members.length === 0) return null;
  detach(project, new Set(members));
  const groups = [...formulaGroupsOf(project)];
  const group = createFormulaGroup(name?.trim() || nextFormulaGroupName(groups), members);
  setGroups(project, [...groups, group]);
  return group;
}

/** Undo a group: its formulas are on their own again, none is deleted. */
export function ungroupFormulas(project: Project, groupId: FormulaGroupId): boolean {
  const groups = formulaGroupsOf(project);
  if (!groups.some((group) => group.id === groupId)) return false;
  setGroups(
    project,
    groups.filter((group) => group.id !== groupId),
  );
  return true;
}

/** Why `name` cannot be a group's name, or null when it can: any text but an empty one. */
export function validateFormulaGroupName(name: string): string | null {
  return name.trim() === '' ? 'The name cannot be empty.' : null;
}

/** Rename a group (the name loses the spaces around it). False when the name is empty or the
 * group is not there. */
export function renameFormulaGroup(
  project: Project,
  groupId: FormulaGroupId,
  name: string,
): boolean {
  const group = formulaGroupsOf(project).find((g) => g.id === groupId);
  if (!group || validateFormulaGroupName(name) !== null) return false;
  group.name = name.trim();
  return true;
}

/** Put the formulas `ids` into a group, after the ones it has (in the list's order): those that
 * were in another group leave it, those already in it stay where they are. Whether anything
 * changed. */
export function addToFormulaGroup(
  project: Project,
  groupId: FormulaGroupId,
  ids: Iterable<FormulaId>,
): boolean {
  const target = formulaGroupsOf(project).find((g) => g.id === groupId);
  if (!target) return false;
  const coming = listedIds(project, ids).filter((id) => !target.formulaIds.includes(id));
  if (coming.length === 0) return false;
  detach(project, new Set(coming));
  // `detach` may have replaced the list of groups: the group itself is the same object.
  target.formulaIds.push(...coming);
  return true;
}

/** Take the formulas `ids` out of their groups: they are on their own again. Whether anything
 * changed. */
export function removeFromFormulaGroups(project: Project, ids: Iterable<FormulaId>): boolean {
  return detach(project, new Set(ids));
}

/** After formulas were copied (`copies`: original → copy): the copy of a grouped formula joins
 * the same group, right after the original. */
export function groupCopies(project: Project, copies: ReadonlyMap<FormulaId, FormulaId>): void {
  for (const group of formulaGroupsOf(project)) {
    if (!group.formulaIds.some((id) => copies.has(id))) continue;
    group.formulaIds = group.formulaIds.flatMap((id) => {
      const copy = copies.get(id);
      return copy === undefined ? [id] : [id, copy];
    });
  }
}

// --- The rule ---------------------------------------------------------------------------

export type FormulaGroupFault =
  /** A formula id that names no formula of the project. */
  | 'unknown'
  /** A formula of a kind the Creator does not list (a brace, a shape). */
  | 'unlisted'
  /** A formula that an earlier group, or this one earlier, already holds. */
  | 'repeated'
  /** A group without a name. */
  | 'unnamed'
  /** A group without formulas. */
  | 'empty'
  /** A group whose id another group has. */
  | 'same-id';

export interface FormulaGroupProblem {
  fault: FormulaGroupFault;
  /** The group's place in `formulaGroups`, and the formula's in its `formulaIds` if it is one. */
  group: number;
  member?: number;
}

/** What breaks the rule of the groups of formulas, where it is. */
export function formulaGroupProblems(
  project: Pick<Project, 'formulas' | 'formulaGroups'>,
): FormulaGroupProblem[] {
  const groups = formulaGroupsOf(project);
  if (groups.length === 0) return [];
  const formulas = new Map<FormulaId, Formula>(project.formulas.map((f) => [f.id, f]));
  const problems: FormulaGroupProblem[] = [];
  const held = new Set<FormulaId>();
  const ids = new Set<FormulaGroupId>();
  groups.forEach((group, gi) => {
    if (ids.has(group.id)) problems.push({ fault: 'same-id', group: gi });
    ids.add(group.id);
    if (group.name.trim() === '') problems.push({ fault: 'unnamed', group: gi });
    let own = 0;
    group.formulaIds.forEach((id, mi) => {
      const formula = formulas.get(id);
      if (!formula) problems.push({ fault: 'unknown', group: gi, member: mi });
      else if (!kindOf(formula).listed) problems.push({ fault: 'unlisted', group: gi, member: mi });
      else if (held.has(id)) problems.push({ fault: 'repeated', group: gi, member: mi });
      else own += 1;
      held.add(id);
    });
    if (own === 0) problems.push({ fault: 'empty', group: gi });
  });
  return problems;
}

/** Whether the groups of formulas break their rule — or the field is there with no group. A pure
 * read, for the common case that nothing is to repair. */
export function hasBrokenFormulaGroups(
  project: Pick<Project, 'formulas' | 'formulaGroups'>,
): boolean {
  if (project.formulaGroups === undefined) return false;
  return project.formulaGroups.length === 0 || formulaGroupProblems(project).length > 0;
}

/** Put the groups of formulas right: a formula that is not there, that the Creator does not
 * list or that a group already holds leaves the group; a group without formulas goes; a group
 * without a name gets the next `grpN`, and one whose id another has, an id of its own. Nothing
 * of the formulas changes. Returns what was wrong; writes to `project` only then (it may be an
 * immer draft). */
export function repairFormulaGroups(project: Project): FormulaGroupProblem[] {
  if (project.formulaGroups === undefined) return [];
  const problems = formulaGroupProblems(project);
  if (problems.length === 0) {
    if (project.formulaGroups.length === 0) delete project.formulaGroups;
    return problems;
  }
  const formulas = new Map<FormulaId, Formula>(project.formulas.map((f) => [f.id, f]));
  const held = new Set<FormulaId>();
  const ids = new Set<FormulaGroupId>();
  const groups: FormulaGroup[] = [];
  for (const group of project.formulaGroups) {
    const kept = group.formulaIds.filter((id) => {
      const formula = formulas.get(id);
      const own = formula !== undefined && kindOf(formula).listed && !held.has(id);
      held.add(id);
      return own;
    });
    if (kept.length === 0) continue;
    if (kept.length !== group.formulaIds.length) group.formulaIds = kept;
    if (ids.has(group.id)) {
      let fresh: string;
      do fresh = newId('b');
      while (ids.has(fresh) || project.formulaGroups.some((g) => g.id === fresh));
      group.id = fresh;
    }
    ids.add(group.id);
    groups.push(group);
  }
  for (const group of groups) {
    if (group.name.trim() === '') group.name = nextFormulaGroupName(groups);
  }
  setGroups(project, groups);
  return problems;
}
