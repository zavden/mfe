/* The entries of the Creator's «+ New ▸» menu: one per kind of object the Creator lists (`KINDS`),
 * then any announced kinds that have no row yet, greyed out with "coming next". An announced
 * kind drops out of the second list the day its row lands. Pure. */
import { KINDS, type FormulaKind, type KindInfo } from '../../model';

/** The kind «+ New» itself creates. */
export const DEFAULT_KIND: FormulaKind = 'math';

export interface ComingKind {
  /** The kind's id to be; the menu entry's test id. */
  id: string;
  label: string;
}

/** Reserved for kinds announced in the menu before they exist. */
export const COMING_KINDS: readonly ComingKind[] = [];

export interface NewObjectChoice<K extends string = FormulaKind> {
  id: string;
  label: string;
  /** The kind the entry creates; null for an announced kind (the entry is disabled). */
  kind: K | null;
}

/** The menu's entries, in order: the listed kinds, then the announced ones. */
export function newObjectChoices<K extends string = FormulaKind>(
  kinds: Readonly<Record<K, KindInfo>> = KINDS as Readonly<Record<K, KindInfo>>,
  coming: readonly ComingKind[] = COMING_KINDS,
): NewObjectChoice<K>[] {
  const listed = (Object.keys(kinds) as K[]).filter((kind) => kinds[kind].listed);
  return [
    ...listed.map((kind) => ({ id: kind, label: kinds[kind].label, kind })),
    ...coming
      .filter((c) => !(c.id in kinds))
      .map((c) => ({ id: c.id, label: c.label, kind: null })),
  ];
}
