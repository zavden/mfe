/* The synced folder and its projects (D38). Not part of the project file, not undoable.
 *
 * Chrome/Edge keep a directory handle (IndexedDB): the folder is listed again whenever the
 * Projects dialog opens, after the browser's permission question once per session, and a
 * project opened from it carries its file handle, so Save writes it in place. Other browsers
 * get a snapshot of the folder from a `webkitdirectory` input (name, dates and contents, kept
 * in IndexedDB too); Sync folder again refreshes it. */
import { create } from 'zustand';
import {
  ensureReadable,
  hasDirectoryPicker,
  isDirectoryHandle,
  isNotFound,
  isReadable,
  listProjectFiles,
  LIBRARY_KEY,
  loadValue,
  pickDirectoryHandle,
  pickFolderViaInput,
  storeValue,
  type DirectoryHandleLike,
  type FolderFile,
} from './files';
import {
  buildLibrary,
  filesOfSnapshot,
  folderFilesFromInput,
  isLibrarySnapshot,
  snapshotOf,
  topLevelFiles,
  type LibraryEntry,
  type UnopenedFile,
} from './library';
import { notify } from './noticeStore';

export type LibraryFolder =
  /** Chrome/Edge: listed afresh from its handle. */
  | { kind: 'live'; name: string; handle: DirectoryHandleLike }
  /** A snapshot of the folder as it was at `takenAt`. */
  | { kind: 'snapshot'; name: string; takenAt: number };

export type LibraryStatus =
  /** No folder synced. */
  | 'idle'
  | 'loading'
  | 'ready'
  /** The browser did not grant access to the folder (a reload forgets it): Sync again or allow. */
  | 'blocked'
  /** The folder is gone (moved, renamed or deleted). */
  | 'missing';

export interface LibraryState {
  folder: LibraryFolder | null;
  status: LibraryStatus;
  entries: LibraryEntry[];
  /** The folder's projects that do not open, each with why. */
  unopened: UnopenedFile[];
  /** `.json` files of the folder that are not projects. */
  skipped: number;
  /** The Projects dialog is open. */
  dialogOpen: boolean;
}

export const useLibraryStore = create<LibraryState>()(() => ({
  folder: null,
  status: 'idle',
  entries: [],
  unopened: [],
  skipped: 0,
  dialogOpen: false,
}));

/** File → Projects…: the dialog, with the folder listed afresh (a user gesture: the browser may
 * ask for the folder once per session). */
export function openProjectsDialog(): void {
  useLibraryStore.setState({ dialogOpen: true });
  void refreshLibrary(true);
}

export function closeProjectsDialog(): void {
  useLibraryStore.setState({ dialogOpen: false });
}

/** Numbers the listings, syncs and restores: one that a newer operation overtook drops its result
 * without touching the state or the stored folder. */
let operation = 0;

function setLibrary(folder: LibraryFolder, files: readonly FolderFile[]): void {
  const { entries, unopened, skipped } = buildLibrary(files);
  useLibraryStore.setState({ folder, status: 'ready', entries, unopened, skipped });
}

/** List `handle` as the folder and keep it for the next session (a sync, a refresh and the
 * startup restore all store the folder they listed, so a refresh that overtakes a sync does not
 * leave the new folder unstored); false when the browser did not allow it or the folder is gone
 * (the state says which), or when a newer operation overtook this one (its state stands). */
async function listLive(handle: DirectoryHandleLike, ask: boolean): Promise<boolean> {
  const op = ++operation;
  const folder: LibraryFolder = { kind: 'live', name: handle.name, handle };
  useLibraryStore.setState({ folder, status: 'loading' });
  const allowed = ask ? await ensureReadable(handle) : await isReadable(handle);
  if (op !== operation) return false;
  if (!allowed) {
    useLibraryStore.setState({ status: 'blocked' });
    return false;
  }
  try {
    const files = await listProjectFiles(handle);
    if (op !== operation) return false;
    setLibrary(folder, files);
    void storeValue(LIBRARY_KEY, handle);
    return true;
  } catch (error) {
    if (op !== operation) return false;
    useLibraryStore.setState({ status: 'missing' });
    if (!isNotFound(error)) {
      notify({
        kind: 'error',
        title: `Could not read the folder ${handle.name}`,
        message: 'The browser could not list it. Sync the folder again.',
        details: [String(error)],
      });
    }
    return false;
  }
}

/** File → Sync folder…: pick the folder once (a user gesture). True when a folder was synced. */
export async function syncFolder(): Promise<boolean> {
  if (hasDirectoryPicker()) {
    let handle: DirectoryHandleLike | null;
    try {
      handle = await pickDirectoryHandle();
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Could not open the folder picker',
        message: 'The browser does not allow it here.',
        details: [String(error)],
      });
      return false;
    }
    if (!handle) return false;
    return listLive(handle, true);
  }
  const picked = await pickFolderViaInput();
  if (!picked) return false;
  const op = ++operation;
  const { folderName, files } = topLevelFiles(picked);
  const takenAt = Date.now();
  const folderFiles = await folderFilesFromInput(files);
  if (op !== operation) return false;
  setLibrary({ kind: 'snapshot', name: folderName ?? 'Folder', takenAt }, folderFiles);
  void storeValue(LIBRARY_KEY, snapshotOf(folderName ?? 'Folder', folderFiles, takenAt));
  return true;
}

/** List the synced folder again (Chrome/Edge), asking the browser's permission when it wants
 * it (`ask`, from a user gesture such as opening the Projects dialog). A snapshot stays as it
 * is. True when the library is up to date. */
export async function refreshLibrary(ask = false): Promise<boolean> {
  const { folder, status } = useLibraryStore.getState();
  if (!folder) return false;
  if (folder.kind === 'snapshot') return true;
  if (status === 'blocked' && !ask) return false;
  return listLive(folder.handle, ask);
}

/** At startup: the folder synced before (a handle lists at once when the browser still allows
 * it, else the library waits for a gesture; a snapshot lists as it was). */
export async function restoreLibrary(): Promise<void> {
  const op = ++operation;
  const value = await loadValue(LIBRARY_KEY);
  if (op !== operation) return;
  if (isDirectoryHandle(value)) {
    await listLive(value, false);
  } else if (isLibrarySnapshot(value)) {
    setLibrary(
      { kind: 'snapshot', name: value.folderName, takenAt: value.takenAt },
      filesOfSnapshot(value),
    );
  }
}

/** The synced folder's handle, for Save As to start in it (Chrome/Edge); null otherwise. */
export function libraryFolderHandle(): DirectoryHandleLike | null {
  const { folder } = useLibraryStore.getState();
  return folder?.kind === 'live' ? folder.handle : null;
}
