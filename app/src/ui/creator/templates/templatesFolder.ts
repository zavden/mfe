/* The user's templates in the synced folder (D121): the file `templates/templates.json` of the
 * folder File → Sync folder… names, beside the copy the browser keeps. A sub-folder, so that the
 * project library, which lists the folder one level deep, does not count the file among the
 * projects' ones.
 *
 * Reading it needs what the folder was synced with; writing it needs more — the folder is synced
 * for reading —, which the browser asks the user for the first time a template is saved (and
 * again after a reload, as it sees fit). Told no, the templates stay in the browser and the
 * library says so. Only a browser with directory handles (Chrome, Edge) can do any of this. */
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  ensureFolderWritable,
  isFolderWritable,
  isNotFound,
  writeToHandle,
  type DirectoryHandleLike,
  type FileHandleLike,
} from '../../project/files';
import { useLibraryStore } from '../../project/libraryStore';
import {
  mergeLibraries,
  overLimit,
  readLibrary,
  serializeLibrary,
  USER_TEMPLATE_LIMIT,
} from './userLibrary';
import { useTemplateLibrary, type TemplateLibraryState } from './userLibraryStore';

export const TEMPLATES_FOLDER = 'templates';
export const TEMPLATES_FILE = 'templates.json';
export const TEMPLATES_PATH = `${TEMPLATES_FOLDER}/${TEMPLATES_FILE}`;

/** The part of FileSystemDirectoryHandle that reaches a file of a folder by name. */
export interface TemplatesDirectory extends DirectoryHandleLike {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<TemplatesDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
}

function reachesFiles(dir: DirectoryHandleLike): dir is TemplatesDirectory {
  const handle = dir as Partial<TemplatesDirectory>;
  return (
    typeof handle.getDirectoryHandle === 'function' && typeof handle.getFileHandle === 'function'
  );
}

/** The text of the folder's templates file; null when it has none. */
export async function readFolderTemplates(dir: TemplatesDirectory): Promise<string | null> {
  try {
    const folder = await dir.getDirectoryHandle(TEMPLATES_FOLDER);
    const file = await (await folder.getFileHandle(TEMPLATES_FILE)).getFile();
    return await file.text();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Write the folder's templates file, making the sub-folder and the file when they are not
 * there. */
export async function writeFolderTemplates(dir: TemplatesDirectory, text: string): Promise<void> {
  const folder = await dir.getDirectoryHandle(TEMPLATES_FOLDER, { create: true });
  await writeToHandle(await folder.getFileHandle(TEMPLATES_FILE, { create: true }), text);
}

export type TemplatesFolderStatus =
  /** No folder is synced, or this browser keeps no handle of it. */
  | 'none'
  /** The folder's file is the library. */
  | 'synced'
  /** The folder's file is behind: writing it waits for the browser's permission, which is asked
   * with the next change or with `writeNow`. */
  | 'pending'
  /** The user told the browser not to let the editor write the folder. */
  | 'denied'
  /** The file could not be read or written; `message` says why. */
  | 'failed';

export interface TemplatesFolderState {
  status: TemplatesFolderStatus;
  folderName: string | null;
  message: string | null;
}

export interface TemplatesFolderSync {
  state: UseBoundStore<StoreApi<TemplatesFolderState>>;
  /** The folder was listed: read its file, take in what it has that the library has not (and of
   * a template both have, the newer), and write the file when that is allowed already. */
  pull(folder: DirectoryHandleLike | null): Promise<void>;
  /** Write the library to the folder, asking the browser's permission if it wants it (from a
   * user gesture). */
  writeNow(): Promise<void>;
  /** Follow the library: every change of it goes to the folder. The result stops it. */
  start(): () => void;
}

export interface TemplatesFolderDependencies {
  library: StoreApi<TemplateLibraryState>;
  isWritable(folder: DirectoryHandleLike): Promise<boolean>;
  ensureWritable(folder: DirectoryHandleLike): Promise<boolean>;
}

export function createTemplatesFolderSync(deps: TemplatesFolderDependencies): TemplatesFolderSync {
  const state = create<TemplatesFolderState>()(() => ({
    status: 'none',
    folderName: null,
    message: null,
  }));
  let folder: TemplatesDirectory | null = null;
  /** What the folder's file is known to hold; null when it has no file. */
  let written: string | null = null;
  /** The folder's file cannot be read as a library, or holds what the library here cannot take
   * — entries that are not templates, or more templates than fit —: it is never written over,
   * since what would be written is less than it has. */
  let unreadable = false;
  let declined = false;
  /** The library is changing because the folder's copy is being taken in. */
  let merging = false;
  let queue: Promise<void> = Promise.resolve();
  const set = (status: TemplatesFolderStatus, message: string | null = null) =>
    state.setState({ status, folderName: folder?.name ?? null, message });
  const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
  /** One at a time, in the order asked; what goes wrong is said by the state, never thrown. */
  const inTurn = (job: () => Promise<void>): Promise<void> => {
    queue = queue.then(job).catch((error: unknown) => {
      set(
        'failed',
        `The templates of the folder could not be brought up to date: ${reason(error)}`,
      );
    });
    return queue;
  };

  const push = async (ask: boolean): Promise<void> => {
    if (!folder) return set('none');
    if (unreadable) return;
    const library = deps.library.getState().library;
    const text = serializeLibrary(library);
    if (text === written) return set('synced');
    // Nothing to keep yet: no file is made for an empty library.
    if (written === null && library.templates.length + library.favorites.length === 0) {
      return set('synced');
    }
    let allowed = await deps.isWritable(folder);
    if (!allowed && ask && !declined) {
      allowed = await deps.ensureWritable(folder);
      declined = !allowed;
    }
    if (!allowed) return set(declined ? 'denied' : 'pending');
    try {
      await writeFolderTemplates(folder, text);
      written = text;
      set('synced');
    } catch (error) {
      set('failed', `The folder’s ${TEMPLATES_PATH} could not be written: ${reason(error)}`);
    }
  };

  return {
    state,
    pull: (listed) =>
      inTurn(async () => {
        const next = listed && reachesFiles(listed) ? listed : null;
        if (next !== folder) {
          folder = next;
          written = null;
          unreadable = false;
          declined = false;
        }
        if (!folder) return set('none');
        let text: string | null;
        try {
          text = await readFolderTemplates(folder);
        } catch (error) {
          unreadable = true;
          return set(
            'failed',
            `The folder’s ${TEMPLATES_PATH} could not be read: ${reason(error)}`,
          );
        }
        unreadable = false;
        written = text;
        if (text !== null) {
          const read = readLibrary(text);
          if (!read.ok) {
            unreadable = true;
            return set(
              'failed',
              `The folder’s ${TEMPLATES_PATH} is left as it is. ${read.message}`,
            );
          }
          // The file is written back as the library here: never with less than it has.
          const ours = deps.library.getState().library;
          const together = mergeLibraries(ours, read.library);
          const over = overLimit(together);
          if (over > 0) {
            unreadable = true;
            return set(
              'failed',
              `The folder’s ${TEMPLATES_PATH} is left as it is, and so is the library here: together they hold ${together.templates.length} templates, and a library holds ${USER_TEMPLATE_LIMIT} at most. Delete ${over} of them, here or in the folder’s file, and list the folder again.`,
            );
          }
          merging = true;
          try {
            await deps.library.getState().mergeLibrary(read.library);
          } finally {
            merging = false;
          }
          if (read.skipped > 0) {
            unreadable = true;
            return set(
              'failed',
              `The folder’s ${TEMPLATES_PATH} is left as it is: ${read.skipped} of its entries cannot be read as templates here, and writing the file again would drop them. Its other templates were taken in.`,
            );
          }
        }
        await push(false);
      }),
    writeNow: () =>
      inTurn(async () => {
        declined = false;
        await push(true);
      }),
    start: () =>
      deps.library.subscribe((now, before) => {
        if (now.library !== before.library && !merging) void inTurn(() => push(true));
      }),
  };
}

/** The templates of the folder File → Sync folder… names. */
export const templatesFolder = createTemplatesFolderSync({
  library: useTemplateLibrary,
  isWritable: isFolderWritable,
  ensureWritable: ensureFolderWritable,
});

export const useTemplatesFolder = templatesFolder.state;

/** Keep the folder's templates and the browser's together: read the folder's whenever it is
 * listed, write it with every change of the library. Started once by the app; the result stops
 * it. */
export function startTemplatesFolder(): () => void {
  const listed = () => {
    const { folder, status } = useLibraryStore.getState();
    if (status !== 'ready') return;
    void templatesFolder.pull(folder?.kind === 'live' ? folder.handle : null);
  };
  const stopLibrary = templatesFolder.start();
  const stopFolder = useLibraryStore.subscribe((now, before) => {
    const again =
      before.status !== 'ready' || now.folder !== before.folder || now.entries !== before.entries;
    if (now.status === 'ready' && again) listed();
  });
  // A folder listed before this started.
  listed();
  return () => {
    stopLibrary();
    stopFolder();
  };
}
