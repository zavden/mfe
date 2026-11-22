/* The rows of the Creator's list when the project has groups of formulas (model/formulaGroups.ts):
 * a formula on its own is a row; a group is a row in the place of its first formula and, while it
 * is open, its formulas follow it as rows of their own. A group stands for its formulas — the row
 * of a group is selected by selecting them (formulaSelection.ts) — so whatever acts on several
 * selected formulas acts on a group.
 *
 * Whether a group is open is a state of the view, not of the project. The list is not filtered:
 * the search of formulas is a panel of its own (search/), whose results are flat. Pure. */
import {
  formulaGroupsOf,
  kindOf,
  type Formula,
  type FormulaGroup,
  type FormulaGroupId,
  type FormulaId,
  type Project,
} from '../../../model';
import type { RowHighlight } from '../FormulaItem';
import type { ListRow } from '../formulaSelection';

export interface FormulaRow extends ListRow {
  kind: 'formula';
  formula: Formula;
  /** The open group the row belongs to, if it is one of its formulas. */
  group: FormulaGroup | null;
}

export interface GroupRow extends ListRow {
  kind: 'group';
  group: FormulaGroup;
  /** Every formula of the group, in its order: what its thumbnails and its count are of, and
   * what it shows under it while open. */
  members: Formula[];
  open: boolean;
}

export type CreatorRow = FormulaRow | GroupRow;

/** The key of a group's row (a formula's row has the formula's id). */
export const groupRowKey = (id: FormulaGroupId): string => `group:${id}`;

/** The group a row key names, or null for the key of a formula's row. */
export const groupOfRowKey = (key: string): FormulaGroupId | null =>
  key.startsWith('group:') ? key.slice('group:'.length) : null;

/** The rows of the list. `open`: the groups the view has open. */
export function creatorRows(
  project: Pick<Project, 'formulas' | 'formulaGroups'>,
  options: { open?: ReadonlySet<FormulaGroupId> } = {},
): CreatorRow[] {
  const listed = project.formulas.filter((f) => kindOf(f).listed);
  const byId = new Map<FormulaId, Formula>(listed.map((f) => [f.id, f]));

  // Each formula's group — the first that names it — and each group's own formulas.
  const groupOf = new Map<FormulaId, FormulaGroup>();
  const membersOf = new Map<FormulaGroupId, Formula[]>();
  for (const group of formulaGroupsOf(project)) {
    if (membersOf.has(group.id)) continue;
    const members: Formula[] = [];
    for (const id of group.formulaIds) {
      const formula = byId.get(id);
      if (!formula || groupOf.has(id)) continue;
      groupOf.set(id, group);
      members.push(formula);
    }
    membersOf.set(group.id, members);
  }

  const rows: CreatorRow[] = [];
  for (const formula of listed) {
    const group = groupOf.get(formula.id);
    if (!group) {
      rows.push({ kind: 'formula', key: formula.id, ids: [formula.id], formula, group: null });
      continue;
    }
    const members = membersOf.get(group.id)!;
    if (members[0] !== formula) continue; // the group is where its first formula is
    const open = options.open?.has(group.id) ?? false;
    rows.push({
      kind: 'group',
      key: groupRowKey(group.id),
      ids: members.map((f) => f.id),
      group,
      members,
      open,
    });
    if (!open) continue;
    for (const member of members)
      rows.push({ kind: 'formula', key: member.id, ids: [member.id], formula: member, group });
  }
  return rows;
}

/** The row that shows the formula `id`: its own, or the row of its group while that is closed. */
export function rowOfFormula(rows: readonly CreatorRow[], id: FormulaId): CreatorRow | undefined {
  return (
    rows.find((row) => row.kind === 'formula' && row.formula.id === id) ??
    rows.find((row) => row.kind === 'group' && row.ids.includes(id))
  );
}

/** How a row is drawn: selected when every formula it stands for is, else linked when one of
 * them is the formula of a selected clip. */
export function rowHighlight(
  row: ListRow,
  selected: ReadonlySet<FormulaId>,
  linked: ReadonlySet<FormulaId>,
): RowHighlight {
  if (row.ids.length > 0 && row.ids.every((id) => selected.has(id))) return 'selected';
  return row.ids.some((id) => linked.has(id)) ? 'linked' : 'none';
}

/** What the menu of the selected formulas can do with groups (model/formulaGroups.ts). */
export interface GroupChoices {
  /** Make a group of them: two or more that are not exactly one whole group already. */
  group: boolean;
  /** The groups they can be put into: every group that does not hold all of them — offered
   * while at least one of them is in no group. */
  addTo: FormulaGroup[];
  /** Take them out of their groups: at least one of them is in one. */
  remove: boolean;
}

export function groupChoices(
  project: Pick<Project, 'formulaGroups'>,
  selected: readonly FormulaId[],
): GroupChoices {
  const groups = formulaGroupsOf(project);
  const chosen = new Set(selected);
  const holding = groups.filter((g) => g.formulaIds.some((id) => chosen.has(id)));
  const grouped = selected.filter((id) => holding.some((g) => g.formulaIds.includes(id)));
  const whole =
    holding.length === 1 &&
    grouped.length === selected.length &&
    holding[0]!.formulaIds.every((id) => chosen.has(id));
  return {
    group: selected.length >= 2 && !whole,
    addTo:
      grouped.length < selected.length
        ? groups.filter((g) => !selected.every((id) => g.formulaIds.includes(id)))
        : [],
    remove: grouped.length > 0,
  };
}
