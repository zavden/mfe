/* The user's templates and favourites as this browser keeps them (D121): a preference of the
 * editor, like the palettes — not part of a project, not undoable.
 *
 * Every change is made on what the storage holds at that moment, under a lock where the browser
 * has one, so that a second tab cannot write over the first one's; then it is written at once. A
 * change the storage does not take stays in this tab and is written with the next one. A stored
 * library that cannot be read is set aside under another key, never written over; one of a later
 * version of the editor is left as it is, and changes then last as long as the tab. */
import { create } from 'zustand';
import { safeStorage } from '../../storage';
import {
  applyImport,
  copyName,
  emptyUserLibrary,
  fieldsOf,
  mergeLibraries,
  overLimit,
  readLibrary,
  removeTemplates,
  sameLibrary,
  saveTemplate,
  serializeLibrary,
  setFavorite,
  USER_TEMPLATE_LIMIT,
  userTemplate,
  type ImportPlan,
  type TemplateFields,
  type UserLibrary,
} from './userLibrary';

export const TEMPLATES_STORAGE_KEY = 'mfe.templates.v1';
export const TEMPLATES_LOCK_NAME = 'mfe.templates.v1.write';
/** Where a stored library that could not be read is kept, so that nothing is lost. */
export const TEMPLATES_DAMAGED_KEY = 'mfe.templates.v1.damaged';

const NO_STORAGE =
  'This browser does not let the editor keep templates: they last until this tab is closed. ' +
  'Export them to keep them.';
const NEWER =
  'The templates saved in this browser were written by a newer version of the editor and are ' +
  'left untouched: what you change now lasts until this tab is closed.';
const DAMAGED =
  'The templates saved in this browser could not be read and were set aside: the library ' +
  'starts empty.';
const NOT_SAVED =
  'The templates could not be saved in this browser. Export them before closing this tab.';

interface TemplateStorage {
  readItem(key: string): { ok: true; value: string | null } | { ok: false };
  setItem(key: string, value: string): boolean;
}

export interface TemplateStoreDependencies {
  storage: TemplateStorage;
  newId(): string;
  now(): number;
  /** Null when the browser cannot hold a lock between tabs: changes are written without one. */
  withLock: ((run: () => Promise<void>) => Promise<void>) | null;
}

export interface TemplateLibraryState {
  library: UserLibrary;
  /** This tab holds changes the browser's storage does not. */
  unsaved: boolean;
  /** What is wrong with the storage, said where the templates are listed. */
  warnings: string[];
  /** A new template; resolves to its id. */
  createTemplate(fields: TemplateFields): Promise<string>;
  updateTemplate(id: string, fields: TemplateFields): Promise<void>;
  /** A copy of one of the user's templates, named after it; resolves to its id. */
  duplicateTemplate(id: string): Promise<string>;
  removeTemplates(ids: readonly string[]): Promise<void>;
  /** Star or unstar a template: one of the user's or one of the editor's. */
  setFavorite(id: string, favorite: boolean): Promise<void>;
  /** Carry out an import as planned (`planImport`). */
  importLibrary(plan: ImportPlan, clashes: 'replace' | 'copy' | 'skip'): Promise<void>;
  /** Take in another copy of the library (the synced folder's): the newer of each template. */
  mergeLibrary(theirs: UserLibrary): Promise<void>;
  /** Read again what the storage holds (another tab wrote it). */
  refresh(): void;
}

interface Stored {
  library: UserLibrary;
  /** The storage may be written. */
  writable: boolean;
  warnings: string[];
}

export function createTemplateLibraryStore(deps: TemplateStoreDependencies) {
  const read = (): Stored => {
    const item = deps.storage.readItem(TEMPLATES_STORAGE_KEY);
    if (!item.ok) return { library: emptyUserLibrary(), writable: false, warnings: [NO_STORAGE] };
    if (item.value === null) return { library: emptyUserLibrary(), writable: true, warnings: [] };
    const parsed = readLibrary(item.value);
    if (parsed.ok) return { library: parsed.library, writable: true, warnings: [] };
    if (parsed.reason === 'newer') {
      return { library: emptyUserLibrary(), writable: false, warnings: [NEWER] };
    }
    // Not a library at all: out of the way, where it can still be found, and start afresh.
    const kept = deps.storage.setItem(TEMPLATES_DAMAGED_KEY, item.value);
    return { library: emptyUserLibrary(), writable: kept, warnings: [DAMAGED] };
  };

  let queue: Promise<unknown> = Promise.resolve();
  const initial = read();

  return create<TemplateLibraryState>()((set, get) => {
    /** Make `change` on the library as it is stored now, and store the result. Rejects with the
     * reason when the change itself is refused; nothing is written then. */
    const transact = (change: (library: UserLibrary) => UserLibrary): Promise<void> => {
      const run = async () => {
        const stored = read();
        // What this tab could not save is newer than what the storage holds.
        const base = get().unsaved ? get().library : stored.library;
        const next = change(base);
        const saved =
          stored.writable && deps.storage.setItem(TEMPLATES_STORAGE_KEY, serializeLibrary(next));
        set({
          library: sameLibrary(next, get().library) ? get().library : next,
          unsaved: !saved,
          warnings: saved || !stored.writable ? stored.warnings : [NOT_SAVED],
        });
      };
      const job = queue.then(async () => {
        if (!deps.withLock) return run();
        let entered = false;
        try {
          await deps.withLock(() => {
            entered = true;
            return run();
          });
        } catch (error) {
          // The change was refused; or the browser gave no lock (a sandboxed page), and the
          // change is made without one.
          if (entered) throw error;
          await run();
        }
      });
      queue = job.catch(() => {});
      return job;
    };

    return {
      library: initial.library,
      unsaved: false,
      warnings: initial.warnings,
      async createTemplate(fields) {
        const id = deps.newId();
        await transact((library) => saveTemplate(library, userTemplate(id, fields, deps.now())));
        return id;
      },
      async updateTemplate(id, fields) {
        await transact((library) => {
          if (!library.templates.some((t) => t.id === id)) {
            throw new Error('This template is no longer in the library.');
          }
          return saveTemplate(library, userTemplate(id, fields, deps.now()));
        });
      },
      async duplicateTemplate(from) {
        const id = deps.newId();
        await transact((library) => {
          const original = library.templates.find((t) => t.id === from);
          if (!original) throw new Error('This template is no longer in the library.');
          const fields = { ...fieldsOf(original), name: copyName(original.name, library) };
          return saveTemplate(library, userTemplate(id, fields, deps.now()));
        });
        return id;
      },
      async removeTemplates(ids) {
        await transact((library) => removeTemplates(library, ids));
      },
      async setFavorite(id, favorite) {
        await transact((library) => setFavorite(library, id, favorite));
      },
      async importLibrary(plan, clashes) {
        await transact((library) => applyImport(library, plan, clashes, deps.newId));
      },
      async mergeLibrary(theirs) {
        await transact((library) => {
          const merged = mergeLibraries(library, theirs);
          // Never kept past what is read back: the caller sees to it first (`overLimit`).
          if (overLimit(merged) > 0) {
            throw new Error(`The library is full: it holds ${USER_TEMPLATE_LIMIT} templates.`);
          }
          return merged;
        });
      },
      refresh() {
        if (get().unsaved) return;
        const stored = read();
        set({
          library: sameLibrary(stored.library, get().library) ? get().library : stored.library,
          warnings: stored.warnings,
        });
      },
    };
  });
}

export const useTemplateLibrary = createTemplateLibraryStore({
  storage: safeStorage,
  newId: () =>
    `tpl_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  now: () => Date.now(),
  withLock:
    typeof navigator !== 'undefined' && navigator.locks
      ? (run) => navigator.locks.request(TEMPLATES_LOCK_NAME, run)
      : null,
});

/** Follow what another tab writes. Started once by the app; the result stops it. */
export function watchTemplateLibrary(): () => void {
  const refresh = () => useTemplateLibrary.getState().refresh();
  const onStorage = (event: StorageEvent) => {
    if (event.key === TEMPLATES_STORAGE_KEY || event.key === null) refresh();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refresh);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', refresh);
  };
}
