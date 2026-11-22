/* Reading and writing project files in the browser.
 *
 * Chrome/Edge: the File System Access API (a handle lets Save overwrite the same file, a
 * directory handle lets the project library list a folder again and again). Everything else,
 * and any failure of the picker: an <input type=file> for opening (`webkitdirectory` for a
 * folder) and a Blob download for saving. */
import {
  MediaStorageError,
  PACKAGE_EXTENSION,
  PACKAGE_MIME_TYPE,
  readPackageManifest,
} from '../../media';
import { FILE_EXTENSION, serializeProject } from '../../model';

/** The part of FileSystemFileHandle the app uses. Real handles also answer `queryPermission` /
 * `requestPermission`: one kept across a reload has to be allowed again. */
/** The part of FileSystemWritableFileStream the app uses: a video is written in pieces at byte
 * positions as it is encoded, and thrown away (`abort`) when the export fails or is cancelled. */
export interface WritableLike {
  write(
    data: string | Blob | Uint8Array | { type: 'write'; position: number; data: Uint8Array },
  ): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
  /** Native handles can differ as objects while naming the same physical file. */
  isSameEntry?(other: FileHandleLike): Promise<boolean>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

/** The part of FileSystemDirectoryHandle the project library uses: the folder's name and its
 * entries (files and sub-folders, in no particular order). */
export interface DirectoryHandleLike {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<DirectoryEntry>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export type DirectoryEntry =
  | (FileHandleLike & { readonly kind: 'file' })
  | { readonly kind: 'directory'; readonly name: string };

type PermissionHandle = Pick<FileHandleLike, 'queryPermission' | 'requestPermission'>;

/** Whether `handle` is one the browser may want permission for before a read or a write (a real
 * handle, as kept across a reload). */
export function needsPermission(handle: PermissionHandle): boolean {
  return (
    typeof handle.queryPermission === 'function' && typeof handle.requestPermission === 'function'
  );
}

/** Whether the app may use `handle` in `mode`, asking the user when the browser needs that. The
 * question needs a user gesture: call this from an action. */
async function ensurePermission(
  handle: PermissionHandle,
  mode: 'read' | 'readwrite',
): Promise<boolean> {
  if (!needsPermission(handle)) return true;
  try {
    if ((await handle.queryPermission!({ mode })) === 'granted') return true;
    return (await handle.requestPermission!({ mode })) === 'granted';
  } catch {
    return false;
  }
}

/** Whether the app may write `handle`, asking the user when the browser needs that (Save). */
export function ensureWritable(handle: FileHandleLike): Promise<boolean> {
  return ensurePermission(handle, 'readwrite');
}

/** Whether the app may read `handle` (a folder kept across a reload), asking when needed. */
export function ensureReadable(handle: DirectoryHandleLike): Promise<boolean> {
  return ensurePermission(handle, 'read');
}

/** Whether the browser already allows reading `handle` without a question. */
export async function isReadable(handle: DirectoryHandleLike): Promise<boolean> {
  return isAllowed(handle, 'read');
}

async function isAllowed(handle: PermissionHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if (!needsPermission(handle)) return true;
  try {
    return (await handle.queryPermission!({ mode })) === 'granted';
  } catch {
    return false;
  }
}

/** Whether the app may write into the folder `handle`, asking the user when the browser needs
 * that: a folder is synced for reading, and the first file written into it (the templates) asks
 * for more. The question needs a user gesture. */
export function ensureFolderWritable(handle: DirectoryHandleLike): Promise<boolean> {
  return ensurePermission(handle, 'readwrite');
}

/** Whether the browser already allows writing into the folder `handle` without a question. */
export function isFolderWritable(handle: DirectoryHandleLike): Promise<boolean> {
  return isAllowed(handle, 'readwrite');
}

// --- Handles across reloads. IndexedDB can store a file or directory handle; localStorage (the
// autosave) cannot. The same store keeps the project library's folder snapshot. -------------

const DB_NAME = 'mfe';
const HANDLE_STORE = 'handles';
/** The current document's file handle. */
const HANDLE_KEY = 'document';
/** The project library's folder: a directory handle, or a snapshot of its files. */
export const LIBRARY_KEY = 'library';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('The database is blocked.'));
  });
}

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Keep `value` under `key` across reloads (null forgets it). Failures are ignored: without
 * IndexedDB, or with a value it cannot store, the app asks again after the next reload. */
export async function storeValue(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openHandleDb();
    const store = db.transaction(HANDLE_STORE, 'readwrite').objectStore(HANDLE_STORE);
    if (value !== null && value !== undefined) await settled(store.put(value, key));
    else await settled(store.delete(key));
    db.close();
  } catch {
    // Nothing to do: see above.
  }
}

/** What `storeValue` kept under `key`, if anything. */
export async function loadValue(key: string): Promise<unknown> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openHandleDb();
    const value: unknown = await settled(
      db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(key),
    );
    db.close();
    return value ?? null;
  } catch {
    return null;
  }
}

/** A file handle kept across reloads, with the id of the document it belongs to (null for one
 * stored by an earlier version of the app, which kept the handle alone). */
export interface StoredHandle {
  documentId: string | null;
  handle: FileHandleLike;
}

/** Remember `handle` as the file of the document `documentId` (a null handle forgets it). */
export function storeHandle(handle: FileHandleLike | null, documentId: string): Promise<void> {
  return storeValue(HANDLE_KEY, handle ? { documentId, handle } : null);
}

/** The handle `storeHandle` kept, if any, with its document's id. */
export async function loadStoredHandle(): Promise<StoredHandle | null> {
  const value = await loadValue(HANDLE_KEY);
  if (isHandle(value)) return { documentId: null, handle: value };
  if (typeof value !== 'object' || value === null) return null;
  const stored = value as Partial<StoredHandle>;
  if (typeof stored.documentId !== 'string' || !isHandle(stored.handle)) return null;
  return { documentId: stored.documentId, handle: stored.handle };
}

function isHandle(value: unknown): value is FileHandleLike {
  if (typeof value !== 'object' || value === null) return false;
  const handle = value as Partial<FileHandleLike>;
  return typeof handle.name === 'string' && typeof handle.createWritable === 'function';
}

export function isDirectoryHandle(value: unknown): value is DirectoryHandleLike {
  if (typeof value !== 'object' || value === null) return false;
  const handle = value as Partial<DirectoryHandleLike>;
  return (
    handle.kind === 'directory' &&
    typeof handle.name === 'string' &&
    typeof handle.values === 'function'
  );
}

interface PickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
  /** The folder the picker opens in (a handle). */
  startIn?: DirectoryHandleLike;
}

interface FsAccessWindow {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileHandleLike>;
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
}

const PICKER_TYPES = [
  {
    description: 'Manim Formula Editor project',
    accept: { 'application/json': ['.json'], [PACKAGE_MIME_TYPE]: [PACKAGE_EXTENSION] },
  },
];

/** Same-name collisions are the browser's business; this only builds a friendly default. */
export function suggestedFileName(projectName: string, packaged = false): string {
  const slug = projectName
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${slug || 'untitled'}${packaged ? PACKAGE_EXTENSION : FILE_EXTENSION}`;
}

function fsWindow(): FsAccessWindow {
  return window as unknown as FsAccessWindow;
}

export function hasFileSystemAccess(): boolean {
  const w = fsWindow();
  return typeof w.showOpenFilePicker === 'function' && typeof w.showSaveFilePicker === 'function';
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** The folder (or file) a handle names is gone: moved, renamed or deleted. */
export function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/** Chrome/Edge: a folder can be picked once and listed again later. */
export function hasDirectoryPicker(): boolean {
  return typeof fsWindow().showDirectoryPicker === 'function';
}

/** Ask for a folder with the native picker; null when the user cancels. */
export async function pickDirectoryHandle(): Promise<DirectoryHandleLike | null> {
  try {
    return await fsWindow().showDirectoryPicker!({ mode: 'read' });
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** A file of a folder, as the project library reads it. */
export interface FolderFile {
  fileName: string;
  /** Modification time (ms since the epoch), null when the browser does not say. */
  lastModified: number | null;
  text: string;
  /** A package (`.mfe`) that could not be read for the listing: why, in the words Open gives.
   * Its `text` is empty. */
  unreadable?: string;
  /** A snapshot retains a package Blob without reading its payload. Live entries reopen handles. */
  packageBlob?: Blob;
  /** The file's handle (Chrome/Edge: Save writes it); null for a file of a snapshot. */
  handle: FileHandleLike | null;
}

/** Whether a folder entry may be a project: a `.json` file that is not hidden. */
export function isProjectFileName(name: string): boolean {
  return /\.(json|mfe)$/i.test(name) && !name.startsWith('.');
}

/** Package summaries read bounded metadata only; opening is what imports the original bytes. */
export async function folderFile(
  file: Pick<File, 'name' | 'lastModified' | 'text'> & Partial<Pick<Blob, 'size' | 'slice'>>,
  handle: FileHandleLike | null,
): Promise<FolderFile> {
  const base = { fileName: file.name, lastModified: file.lastModified, handle };
  if (/\.mfe$/i.test(file.name)) {
    try {
      if (typeof file.size !== 'number' || typeof file.slice !== 'function') {
        return { ...base, text: '' };
      }
      const blob = file as unknown as Blob;
      const { parsed } = await readPackageManifest(blob);
      return {
        ...base,
        text: serializeProject(parsed.project),
        ...(!handle ? { packageBlob: blob } : {}),
      };
    } catch (error) {
      return {
        ...base,
        text: '',
        unreadable:
          error instanceof MediaStorageError ? error.message : 'The file could not be read.',
      };
    }
  }
  return { ...base, text: await file.text() };
}

/** The `.json` files directly in `dir` (sub-folders are not entered), with their contents. */
export async function listProjectFiles(dir: DirectoryHandleLike): Promise<FolderFile[]> {
  const files: FolderFile[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || !isProjectFileName(entry.name)) continue;
    const file = await entry.getFile();
    files.push(await folderFile(file, entry));
  }
  return files;
}

/** Ask for a project file with the native picker; null when the user cancels. */
export async function pickOpenHandle(): Promise<FileHandleLike | null> {
  try {
    const [handle] = await fsWindow().showOpenFilePicker!({ types: PICKER_TYPES, multiple: false });
    return handle ?? null;
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** Ask where to save with the native picker, starting in `startIn` when given (the synced
 * folder); null when the user cancels. */
export async function pickSaveHandle(
  suggestedName: string,
  startIn: DirectoryHandleLike | null = null,
): Promise<FileHandleLike | null> {
  const packaged = /\.mfe$/i.test(suggestedName);
  return pickSaveHandleFor(
    suggestedName,
    [
      {
        description: 'Manim Formula Editor project',
        accept: packaged
          ? { [PACKAGE_MIME_TYPE]: [PACKAGE_EXTENSION] }
          : { 'application/json': ['.json'] },
      },
    ],
    startIn,
  );
}

/** The save picker for files of other kinds (a video): `types` as the picker takes them. */
export async function pickSaveHandleFor(
  suggestedName: string,
  types: PickerOptions['types'],
  startIn: DirectoryHandleLike | null = null,
): Promise<FileHandleLike | null> {
  try {
    return await fsWindow().showSaveFilePicker!({
      types,
      suggestedName,
      ...(startIn ? { startIn } : {}),
    });
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

export async function writeToHandle(handle: FileHandleLike, text: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort?.();
    } catch {
      // Keep the original I/O failure even if the failed stream is already closed.
    }
    throw error;
  }
}

/** Fallback open: a throw-away file input. Resolves null when the dialog is cancelled (browsers
 * without the `cancel` event never resolve, which is harmless). */
export function pickFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.json,.mfe.json,.mfe,application/json,${PACKAGE_MIME_TYPE}`;
    input.hidden = true;
    input.setAttribute('data-testid', 'open-file-input');
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Fallback folder choice: a throw-away `webkitdirectory` input. The browser hands over every
 * file under the folder (sub-folders included, `webkitRelativePath` tells where); null when the
 * dialog is cancelled. */
export function pickFolderViaInput(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.hidden = true;
    input.setAttribute('data-testid', 'sync-folder-input');
    const done = (files: File[] | null) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(input.files ? [...input.files] : null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Save a Blob as a file through a throw-away link. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Fallback save: download the text as a file. */
export function downloadText(fileName: string, text: string): void {
  downloadBlob(fileName, new Blob([text], { type: 'application/json' }));
}
