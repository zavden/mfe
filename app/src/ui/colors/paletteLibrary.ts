/* Portable palettes have no project identity; this bounded library is an editor preference. */
import { normalizePalette, type NormalizedManimPaletteV1, type PaletteRole } from './palette';
import {
  changeCustomRoles,
  namedSource,
  recolorSource,
  type CustomRoleChange,
} from './paletteEdit';

export const PALETTE_LIBRARY_LIMIT = 24;
export interface PaletteEntry {
  id: string;
  displayName: string;
  source: NormalizedManimPaletteV1;
  /** Made or changed in the editor (New palette, Duplicate, a recolored role): its name is the
   * editor's, so its source carries `displayName` and follows a rename. An imported palette that
   * was never changed has no such mark: its source stays the file it came from, name included. */
  authored?: true;
}
export interface PaletteLibrary {
  version: 1;
  activePaletteId: string | null;
  palettes: PaletteEntry[];
}
export const emptyPaletteLibrary = (): PaletteLibrary => ({
  version: 1,
  activePaletteId: null,
  palettes: [],
});

export interface StoredPaletteLibrary {
  library: PaletteLibrary;
  warnings: string[];
  /** The stored value may be written over: it was read, or there was none. */
  writable: boolean;
  /** The stored value cannot be read by any version of the editor (broken JSON, not a library):
   * nothing is lost by replacing it, which Reset library does. A library of another version is
   * not damaged: it is left alone, and never offered for replacement. */
  damaged: boolean;
}

const DAMAGED =
  'The palette library saved in this browser cannot be read: its data is damaged. ' +
  'Reset library replaces it with the palettes of this tab.';
const OTHER_VERSION =
  'The palette library saved in this browser was written by another version of the editor ' +
  'and is left untouched.';

export function readPaletteLibrary(text: string | null): StoredPaletteLibrary {
  const library = emptyPaletteLibrary();
  const warnings: string[] = [];
  if (text === null) return { library, warnings, writable: true, damaged: false };
  const damaged = { library, warnings: [DAMAGED], writable: false, damaged: true };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return damaged;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return damaged;
  const value = data as Record<string, unknown>;
  if (value.version !== 1) {
    return 'version' in value
      ? { library, warnings: [OTHER_VERSION], writable: false, damaged: false }
      : damaged;
  }
  if (!Array.isArray(value.palettes)) return damaged;
  const ids = new Set<string>();
  for (const raw of value.palettes) {
    try {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid palette entry.');
      const entry = raw as Record<string, unknown>;
      if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 200) {
        throw new Error('Invalid palette identity.');
      }
      if (ids.has(entry.id)) throw new Error(`Duplicate palette identity: ${entry.id}.`);
      if (
        typeof entry.displayName !== 'string' ||
        !entry.displayName.trim() ||
        entry.displayName.length > 120
      ) {
        throw new Error('Invalid palette display name.');
      }
      const normalized = normalizePalette(entry.source);
      if (library.palettes.length === PALETTE_LIBRARY_LIMIT)
        throw new Error('Palette library capacity exceeded.');
      ids.add(entry.id);
      library.palettes.push({
        id: entry.id,
        displayName: entry.displayName.trim(),
        source: normalized.palette,
        ...(entry.authored === true ? { authored: true as const } : {}),
      });
      warnings.push(...normalized.warnings.map((w) => w.message));
    } catch (error) {
      warnings.push(
        `Skipped one stored palette: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (typeof value.activePaletteId === 'string' && ids.has(value.activePaletteId)) {
    library.activePaletteId = value.activePaletteId;
  }
  return { library, warnings, writable: true, damaged: false };
}

export type PaletteOperation =
  | { kind: 'import'; entry: PaletteEntry }
  /** A palette of the editor's own. Unlike an import it is never taken for an entry with the same
   * colors: a duplicate is a second entry on purpose. */
  | { kind: 'create'; entry: PaletteEntry }
  | { kind: 'recolor'; id: string; role: PaletteRole; color: string }
  /** A change to the roles the user added to the palette (D154). */
  | { kind: 'custom-role'; id: string; change: CustomRoleChange }
  | { kind: 'activate'; id: string | null }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; id: string };

function freeDisplayName(name: string, entries: readonly PaletteEntry[]): string {
  const base = name.trim().slice(0, 120) || 'Scene theme';
  const taken = new Set(entries.map((entry) => entry.displayName));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, 120 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

const copyOf = (library: PaletteLibrary): PaletteLibrary => ({
  ...library,
  palettes: library.palettes.map((entry) => ({ ...entry })),
});

function addEntry(library: PaletteLibrary, entry: PaletteEntry, doing: string): PaletteEntry {
  if (library.palettes.length >= PALETTE_LIBRARY_LIMIT)
    throw new Error(
      `The palette library is full (${PALETTE_LIBRARY_LIMIT}). Delete an entry before ${doing} another.`,
    );
  if (library.palettes.some((existing) => existing.id === entry.id))
    throw new Error('Palette identity collision. Please try again.');
  const added = { ...entry, displayName: freeDisplayName(entry.displayName, library.palettes) };
  library.palettes.push(added);
  return added;
}

/** The editor's own palette: what Export writes is named as the editor names it. */
function author(entry: PaletteEntry, source = entry.source): void {
  entry.source = namedSource(source, entry.displayName);
  entry.authored = true;
}

/** Apply one intention to `library`, in place. It throws before changing anything, so a refused
 * intention leaves the library as it was. */
function applyOperation(
  library: PaletteLibrary,
  aliases: Map<string, string>,
  operation: PaletteOperation,
): void {
  if (operation.kind === 'import') {
    const same = library.palettes.find(
      (entry) => JSON.stringify(entry.source) === JSON.stringify(operation.entry.source),
    );
    if (same) {
      aliases.set(operation.entry.id, same.id);
      return;
    }
    addEntry(library, operation.entry, 'importing');
    return;
  }
  if (operation.kind === 'create') {
    author(addEntry(library, operation.entry, 'adding'));
    return;
  }
  const id = operation.id === null ? null : (aliases.get(operation.id) ?? operation.id);
  if (operation.kind === 'activate') {
    if (id !== null && !library.palettes.some((entry) => entry.id === id))
      throw new Error('This palette was removed in another tab.');
    library.activePaletteId = id;
  } else if (operation.kind === 'delete') {
    library.palettes = library.palettes.filter((entry) => entry.id !== id);
    if (library.activePaletteId === id) library.activePaletteId = null;
  } else if (operation.kind === 'recolor') {
    const entry = library.palettes.find((entry) => entry.id === id);
    if (!entry) throw new Error('This palette was removed in another tab.');
    const source = recolorSource(entry.source, operation.role, operation.color);
    if (source !== entry.source) author(entry, source);
  } else if (operation.kind === 'custom-role') {
    const entry = library.palettes.find((entry) => entry.id === id);
    if (!entry) throw new Error('This palette was removed in another tab.');
    const source = changeCustomRoles(entry.source, operation.change);
    if (source !== entry.source) author(entry, source);
  } else {
    const entry = library.palettes.find((entry) => entry.id === id);
    if (!entry) throw new Error('This palette was removed in another tab.');
    const name = operation.name.trim();
    if (!name || name.length > 120) throw new Error('Use a name from 1 to 120 characters.');
    entry.displayName = name;
    if (entry.authored) author(entry);
  }
}

/** Apply intentions to a copy of `base`, all or none: the first one that is refused throws.
 * `known` are the aliases of imports replayed before (an import that another tab stored first
 * goes by that tab's id). */
export function applyPaletteOperations(
  base: PaletteLibrary,
  operations: readonly PaletteOperation[],
  known: ReadonlyMap<string, string> = new Map(),
): {
  library: PaletteLibrary;
  aliases: Map<string, string>;
} {
  const library = copyOf(base);
  const aliases = new Map(known);
  for (const operation of operations) applyOperation(library, aliases, operation);
  return { library, aliases };
}

function describeOperation(operation: PaletteOperation): string {
  switch (operation.kind) {
    case 'import':
      return `Importing “${operation.entry.displayName}”`;
    case 'create':
      return `Adding “${operation.entry.displayName}”`;
    case 'recolor':
      return `Changing the ${operation.role} colour of a palette`;
    case 'custom-role': {
      const { change } = operation;
      if (change.do === 'add') return `Adding the role “${change.name.trim()}” to a palette`;
      if (change.do === 'delete') return `Deleting the role “${change.role}” of a palette`;
      return change.do === 'rename'
        ? `Renaming the role “${change.role}” of a palette`
        : `Changing the colour of the role “${change.role}” of a palette`;
    }
    case 'activate':
      return 'Activating a palette';
    case 'rename':
      return `Renaming a palette to “${operation.name.trim()}”`;
    case 'delete':
      return 'Deleting a palette';
  }
}

/** Replay on the latest library the intentions that were waiting for a save, including unsaved
 * imports deduplicated by another tab. One that no longer applies there (its palette was removed
 * meanwhile, the library filled up) is dropped and reported in `dropped`: kept, it would refuse
 * every later save. What was done to an import or a new palette that is dropped goes with it,
 * unreported. */
export function replayPaletteOperations(
  base: PaletteLibrary,
  operations: readonly PaletteOperation[],
): {
  library: PaletteLibrary;
  aliases: Map<string, string>;
  kept: PaletteOperation[];
  dropped: string[];
} {
  const library = copyOf(base);
  const aliases = new Map<string, string>();
  const kept: PaletteOperation[] = [];
  const dropped: string[] = [];
  const lost = new Set<string>();
  for (const operation of operations) {
    const adds = operation.kind === 'import' || operation.kind === 'create';
    if (!adds && operation.id !== null && lost.has(operation.id)) continue;
    try {
      applyOperation(library, aliases, operation);
      kept.push(operation);
    } catch (error) {
      if (adds) lost.add(operation.entry.id);
      const reason = error instanceof Error ? error.message : String(error);
      dropped.push(`${describeOperation(operation)} could not be kept: ${reason}`);
    }
  }
  return { library, aliases, kept, dropped };
}
