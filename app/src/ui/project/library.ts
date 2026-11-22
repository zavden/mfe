/* The project library: what the synced folder holds, as the Projects dialog lists it. Pure:
 * reading the folder is `files.ts`, keeping it is `libraryStore.ts`.
 *
 * A folder is listed one level deep: every `.json` or `.mfe` file directly in it that parses as a
 * project is an entry (older formats are migrated, as Open does). A file that is a project and
 * does not open — one saved by a newer version of the app, one with a field out of place, a
 * package that is damaged — is named with why (`unopened`), in the words Open gives: counted with
 * the files that are no projects, its owner would look for it in vain. A file is a project by
 * what it says of itself or, when its text says nothing that can be read (a save cut short, a
 * copy half synced), by the name the app gives its own files (`.mfe.json`). The other `.json`
 * files are counted as skipped. Entries are sorted by modification time, newest first, then by file
 * name; the dialog's search keeps the ones whose name or file name has its words
 * (`filterEntries`). */
import { parseProject, type EmbeddedTextGeometry, type Project } from '../../model';
import { folderFile, isProjectFileName, type FileHandleLike, type FolderFile } from './files';

export interface LibraryEntry {
  fileName: string;
  /** The project's name (its `meta.name`). */
  name: string;
  /** Modification time (ms since the epoch), null when unknown. */
  modified: number | null;
  formulaCount: number;
  /** The project as parsed (migrated to the current format): for the thumbnails. */
  project: Project;
  /** The geometry the file carries for its font texts, as read: for their thumbnails. Empty for
   * a package, whose geometry is among its payloads, which a listing does not read. */
  textGeometry: EmbeddedTextGeometry;
  /** The file as listed; what Open reads when there is no handle (a snapshot). */
  text: string;
  /** Snapshots retain the original package without loading its payload into memory. */
  packageBlob?: Blob;
  /** Chrome/Edge: the file's handle, so that Save writes the file in place; null in a snapshot. */
  handle: FileHandleLike | null;
}

/** A file of the folder that is a project and does not open. */
export interface UnopenedFile {
  fileName: string;
  /** Why, as File → Open says it of that file. */
  reason: string;
}

export interface Library {
  entries: LibraryEntry[];
  /** The projects that do not open, by file name. */
  unopened: UnopenedFile[];
  /** `.json` files that are not projects. */
  skipped: number;
}

/** Whether `fileName` is the name the app gives the projects it saves. */
const hasOwnName = (fileName: string) => /\.mfe\.json$/i.test(fileName);

/** What a file of the folder is: a project that opens, one that does not, or (null) no project. */
function listFile(file: FolderFile): { entry: LibraryEntry } | { unopened: UnopenedFile } | null {
  if (file.unreadable !== undefined) {
    return { unopened: { fileName: file.fileName, reason: file.unreadable } };
  }
  const parsed = parseProject(file.text);
  if (!parsed.ok) {
    return parsed.isProject || hasOwnName(file.fileName)
      ? { unopened: { fileName: file.fileName, reason: parsed.error } }
      : null;
  }
  return {
    entry: {
      fileName: file.fileName,
      name: parsed.project.meta.name,
      modified: file.lastModified,
      formulaCount: parsed.project.formulas.length,
      project: parsed.project,
      textGeometry: parsed.textGeometry,
      text: file.text,
      ...(file.packageBlob ? { packageBlob: file.packageBlob } : {}),
      handle: file.handle,
    },
  };
}

/** The entry for a file, or null when it is not a project that opens. */
export function readLibraryEntry(file: FolderFile): LibraryEntry | null {
  const listed = listFile(file);
  return listed && 'entry' in listed ? listed.entry : null;
}

/** The file name as the dialog shows it beside the project's name: `.mfe.json` becomes `.json`
 * (the `.mfe` says nothing there), any other name stays. */
export function displayFileName(fileName: string): string {
  return fileName.replace(/\.mfe\.json$/i, '.json');
}

/** Newest first; files without a date last; then by file name. */
export function compareEntries(a: LibraryEntry, b: LibraryEntry): number {
  if (a.modified !== b.modified) {
    if (a.modified === null) return 1;
    if (b.modified === null) return -1;
    return b.modified - a.modified;
  }
  return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
}

/** `text` as a search compares it: without case and without accents. */
const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The entries a search finds (D153): the ones with every word of `query` in the project's name or
 * in its file's name, case and accents apart, in the order they are listed. No word finds all. */
export function filterEntries(entries: readonly LibraryEntry[], query: string): LibraryEntry[] {
  const words = folded(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((entry) => {
    const text = `${folded(entry.name)}\n${folded(entry.fileName)}`;
    return words.every((word) => text.includes(word));
  });
}

/** The library of a folder's files. */
export function buildLibrary(files: readonly FolderFile[]): Library {
  const entries: LibraryEntry[] = [];
  const unopened: UnopenedFile[] = [];
  let skipped = 0;
  for (const file of files) {
    const listed = listFile(file);
    if (!listed) skipped++;
    else if ('entry' in listed) entries.push(listed.entry);
    else unopened.push(listed.unopened);
  }
  entries.sort(compareEntries);
  unopened.sort((a, b) =>
    a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' }),
  );
  return { entries, unopened, skipped };
}

/** The line over the projects that do not open. */
export function unopenedTitle(count: number): string {
  return count === 1
    ? 'One project of the folder does not open:'
    : `${count} projects of the folder do not open:`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** "Oct 31, 2026, 10:40 PM"; empty when the time is unknown. */
export function formatModified(ms: number | null): string {
  return ms === null ? '' : DATE_FORMAT.format(ms);
}

/** The second line of an entry: "3 formulas · Oct 31, 2026, 10:40 PM". */
export function describeEntry(entry: Pick<LibraryEntry, 'formulaCount' | 'modified'>): string {
  const count = `${entry.formulaCount} formula${entry.formulaCount === 1 ? '' : 's'}`;
  const date = formatModified(entry.modified);
  return date ? `${count} · ${date}` : count;
}

// --- The `webkitdirectory` fallback -----------------------------------------------------------

/** What a `webkitdirectory` input gives for each file: `webkitRelativePath` is
 * "folder/sub/file.json" from the chosen folder. */
export interface InputFile {
  readonly name: string;
  readonly webkitRelativePath: string;
  readonly lastModified: number;
  text(): Promise<string>;
  readonly size?: number;
  slice?: Blob['slice'];
}

/** The folder's name and the project-like files directly in it (sub-folders are left out). */
export function topLevelFiles<T extends InputFile>(
  files: readonly T[],
): { folderName: string | null; files: T[] } {
  const first = files[0]?.webkitRelativePath.split('/')[0];
  return {
    folderName: first || null,
    files: files.filter((file) => {
      const parts = file.webkitRelativePath.split('/');
      return parts.length === 2 && isProjectFileName(file.name);
    }),
  };
}

/** Read the files of a `webkitdirectory` input into folder files (no handles). */
export async function folderFilesFromInput(files: readonly InputFile[]): Promise<FolderFile[]> {
  return Promise.all(files.map((file) => folderFile(file, null)));
}

// --- The snapshot kept for browsers without directory handles ----------------------------------

/** A folder as it was when it was synced: the project files and their text. The app lists it
 * after a reload; Sync folder again takes a new one. */
export interface LibrarySnapshot {
  v: 1;
  folderName: string;
  takenAt: number;
  /** `unreadable`: why a package could not be read when the folder was synced (`FolderFile`); a
   * snapshot taken before the app kept it has none, and lists such a file as no project. */
  files: {
    fileName: string;
    lastModified: number | null;
    text: string;
    unreadable?: string;
    packageBlob?: Blob;
  }[];
}

export function snapshotOf(
  folderName: string,
  files: readonly FolderFile[],
  takenAt: number,
): LibrarySnapshot {
  return {
    v: 1,
    folderName,
    takenAt,
    files: files.map(({ fileName, lastModified, text, unreadable, packageBlob }) => ({
      fileName,
      lastModified,
      text,
      ...(unreadable !== undefined ? { unreadable } : {}),
      ...(packageBlob ? { packageBlob } : {}),
    })),
  };
}

export function isLibrarySnapshot(value: unknown): value is LibrarySnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Partial<LibrarySnapshot>;
  return (
    snapshot.v === 1 &&
    typeof snapshot.folderName === 'string' &&
    typeof snapshot.takenAt === 'number' &&
    Array.isArray(snapshot.files) &&
    snapshot.files.every(
      (file) =>
        typeof file === 'object' &&
        file !== null &&
        typeof file.fileName === 'string' &&
        typeof file.text === 'string' &&
        (file.unreadable === undefined || typeof file.unreadable === 'string') &&
        (file.lastModified === null || typeof file.lastModified === 'number'),
    )
  );
}

/** The folder files of a snapshot (no handles). */
export function filesOfSnapshot(snapshot: LibrarySnapshot): FolderFile[] {
  return snapshot.files.map((file) => ({ ...file, handle: null }));
}
