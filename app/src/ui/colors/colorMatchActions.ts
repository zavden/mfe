/* The edits of the Match colors dialog (Edit → Match colors, D55), each one undo step on the
 * project: lists created, renamed, duplicated and deleted; entries added, changed, moved and
 * removed. Pure helpers beside them: the next free list name, the colour a new entry starts
 * with, what each entry's pattern lacks, and the formulas the UI selection stands for. */
import {
  createColorMatch,
  normalizePattern,
  patternIssue,
  newId,
  projectIdEntries,
  type ColorMatch,
  type ColorMatchEntry,
  type ColorMatchId,
  type FormulaId,
  type Project,
} from '../../model';
import { useProjectStore, type Selection } from '../../store';
import { MANIM_COLORS } from '../project/colors';
import { highlightedClipIds, selectedFormulaIds } from '../selection';
import type { PaletteColors } from './palette';

/** "Match colors 1", "Match colors 2"…: the first name no list has. */
export function nextMatchName(lists: readonly Pick<ColorMatch, 'name'>[]): string {
  const taken = new Set(lists.map((l) => l.name));
  for (let n = 1; ; n++) {
    const name = `Match colors ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** `name`, or `name copy`, `name copy 2`…: the first the lists do not have. */
export function freeName(name: string, lists: readonly Pick<ColorMatch, 'name'>[]): string {
  const taken = new Set(lists.map((l) => l.name));
  if (!taken.has(name)) return name;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${name} copy` : `${name} copy ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The Manim colours a list's entries start with, in turn: the vivid ones first. */
const ENTRY_COLORS = MANIM_COLORS.filter((c) => c.name !== 'WHITE' && c.name !== 'GRAY');

/** The colour the entry at `index` of a list starts with. */
export function nextEntryColor(index: number): string {
  return ENTRY_COLORS[index % ENTRY_COLORS.length]!.hex;
}

/** What each entry's pattern lacks (`patternIssue`), or null when it can be matched. */
export function entryIssues(match: Pick<ColorMatch, 'entries'>): (string | null)[] {
  return match.entries.map((e) => patternIssue(normalizePattern(e.pattern)));
}

/** The formulas a selection stands for: the selected formulas of the Creator, or the formulas
 * of the selected clips (or of the clip of the selected block), each once. */
export function formulasOfSelection(
  project: Pick<Project, 'clips'>,
  selection: Selection,
): FormulaId[] {
  const formulas = selectedFormulaIds(selection);
  if (formulas.length > 0) return formulas;
  const clips = new Set(highlightedClipIds(selection));
  return [...new Set(project.clips.filter((c) => clips.has(c.id)).map((c) => c.formulaId))];
}

const update = (recipe: (draft: Project) => void) => useProjectStore.getState().update(recipe);
const listOf = (draft: Project, id: ColorMatchId) => draft.colorMatches.find((m) => m.id === id);

/** A new, empty list with the next free name. Its id. */
export function createColorMatchList(): ColorMatchId {
  const { colorMatches } = useProjectStore.getState().project;
  const list = createColorMatch(nextMatchName(colorMatches));
  update((draft) => {
    draft.colorMatches.push(list);
  });
  return list.id;
}

/** A palette supplies literal colors, never guessed LaTeX roles or automatic application. */
export function createPaletteMatchList(name: string, colors: PaletteColors): ColorMatchId {
  let id: ColorMatchId | null = null;
  update((draft) => {
    const taken = new Set(projectIdEntries(draft).map((entry) => entry.id));
    const list = createColorMatch(
      freeName(name, draft.colorMatches),
      (['variable', 'constant', 'operator', 'result'] as const).map((role) => ({
        pattern: '',
        color: colors[role],
      })),
    );
    // A broken generator must not hang the editor; valid imports share one global namespace.
    for (let attempts = 0; taken.has(list.id); attempts++) {
      if (attempts === 100) throw new Error('Could not allocate a unique match colors identity.');
      list.id = newId('m');
    }
    draft.colorMatches.push(list);
    id = list.id;
  });
  return id!;
}

/** A copy of the list `id` (entries included), after it. Its id, or null when `id` is gone. */
export function duplicateColorMatchList(id: ColorMatchId): ColorMatchId | null {
  const { colorMatches } = useProjectStore.getState().project;
  const source = colorMatches.find((m) => m.id === id);
  if (!source) return null;
  const copy = createColorMatch(
    freeName(source.name, colorMatches),
    source.entries.map((e) => ({ ...e })),
  );
  update((draft) => {
    const at = draft.colorMatches.findIndex((m) => m.id === id);
    draft.colorMatches.splice(at + 1, 0, copy);
  });
  return copy.id;
}

/** Rename the list; a blank name is ignored. */
export function renameColorMatchList(id: ColorMatchId, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const current = useProjectStore.getState().project.colorMatches.find((m) => m.id === id);
  if (!current || current.name === trimmed) return;
  update((draft) => {
    const list = listOf(draft, id);
    if (list) list.name = trimmed;
  });
}

export function deleteColorMatchList(id: ColorMatchId): void {
  update((draft) => {
    draft.colorMatches = draft.colorMatches.filter((m) => m.id !== id);
  });
}

/** Add an entry at the end (an empty pattern in the next colour unless given). Its index. */
export function addColorMatchEntry(id: ColorMatchId, entry: Partial<ColorMatchEntry> = {}): number {
  const current = useProjectStore.getState().project.colorMatches.find((m) => m.id === id);
  if (!current) return -1;
  const index = current.entries.length;
  update((draft) => {
    listOf(draft, id)?.entries.push({
      pattern: entry.pattern ?? '',
      color: entry.color ?? nextEntryColor(index),
    });
  });
  return index;
}

export function updateColorMatchEntry(
  id: ColorMatchId,
  index: number,
  patch: Partial<ColorMatchEntry>,
): void {
  const current = useProjectStore.getState().project.colorMatches.find((m) => m.id === id);
  const entry = current?.entries[index];
  if (!entry) return;
  if (
    (patch.pattern === undefined || patch.pattern === entry.pattern) &&
    (patch.color === undefined || patch.color === entry.color)
  ) {
    return;
  }
  update((draft) => {
    const target = listOf(draft, id)?.entries[index];
    if (target) Object.assign(target, patch);
  });
}

export function removeColorMatchEntry(id: ColorMatchId, index: number): void {
  update((draft) => {
    listOf(draft, id)?.entries.splice(index, 1);
  });
}

/** Move the entry one place up (`delta` −1) or down (+1); nothing past the ends. */
export function moveColorMatchEntry(id: ColorMatchId, index: number, delta: -1 | 1): void {
  const current = useProjectStore.getState().project.colorMatches.find((m) => m.id === id);
  const to = index + delta;
  if (!current || !current.entries[index] || to < 0 || to >= current.entries.length) return;
  update((draft) => {
    const entries = listOf(draft, id)?.entries;
    if (!entries) return;
    const [entry] = entries.splice(index, 1);
    entries.splice(to, 0, entry!);
  });
}
