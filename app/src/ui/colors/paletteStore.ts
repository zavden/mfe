/* Per-browser palette preferences. Short locked operations replay intents, never stale snapshots.
 * A change that could not be saved waits, and is replayed with the next one or with Retry saving;
 * one that no longer applies by then is dropped with a notice, so it cannot hold the others. */
import { create } from 'zustand';
import { safeStorage } from '../storage';
import { normalizePalette, type NormalizedManimPaletteV1, type PaletteRole } from './palette';
import { newPaletteSource, type CustomRoleChange } from './paletteEdit';
import {
  applyPaletteOperations,
  readPaletteLibrary,
  replayPaletteOperations,
  type PaletteEntry,
  type PaletteLibrary,
  type PaletteOperation,
  type StoredPaletteLibrary,
} from './paletteLibrary';

export const PALETTE_STORAGE_KEY = 'mfe.palettes.v1';
export const PALETTE_LOCK_NAME = 'mfe.palettes.v1.write';

interface PaletteStorage {
  readItem(key: string): { ok: true; value: string | null } | { ok: false };
  setItem(key: string, value: string): boolean;
}
interface PaletteStoreDependencies {
  storage: PaletteStorage;
  newId(): string;
  /** Null when the origin/browser cannot coordinate cooperating tabs. */
  withLock: ((run: () => Promise<void>) => Promise<void>) | null;
}
export interface PaletteState {
  library: PaletteLibrary;
  revision: number;
  unsaved: boolean;
  /** The stored library cannot be read by any version of the editor: `resetLibrary` may replace
   * it (a library of another version is never offered that). */
  damaged: boolean;
  warnings: string[];
  busy: boolean;
  importPalette(source: NormalizedManimPaletteV1): Promise<string>;
  /** A new palette with the colors the editor uses without one; resolves to its id. */
  createPalette(): Promise<string>;
  /** A second entry with the colors of `id`, named after it; resolves to its id. */
  duplicate(id: string): Promise<string>;
  /** One role of a palette in another color. Like every change here it is saved at once and
   * touches no project: Apply palette… recolors what exists. */
  recolor(id: string, role: PaletteRole, color: string): Promise<void>;
  /** A change to the roles the user added to a palette (`changeCustomRoles`): one more, another
   * name or color for one, or one less. Saved at once, like a recolor. */
  changeCustomRole(id: string, change: CustomRoleChange): Promise<void>;
  activate(id: string | null): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  retrySave(): Promise<void>;
  /** Replace a damaged stored library with the palettes this tab holds. */
  resetLibrary(): Promise<void>;
  refresh(): void;
}

export function createPaletteStore(deps: PaletteStoreDependencies) {
  let pending: PaletteOperation[] = [];
  let queue = Promise.resolve();
  const read = (): StoredPaletteLibrary => {
    const result = deps.storage.readItem(PALETTE_STORAGE_KEY);
    return result.ok
      ? readPaletteLibrary(result.value)
      : {
          ...readPaletteLibrary(null),
          writable: false,
          warnings: ['Palette storage could not be read.'],
        };
  };
  const initial = read();
  const store = create<PaletteState>()((set, get) => {
    const publish = (
      library: PaletteLibrary,
      unsaved: boolean,
      warnings: string[],
      damaged = false,
    ) => {
      const changed = JSON.stringify(library) !== JSON.stringify(get().library);
      set({
        library: changed ? library : get().library,
        revision: get().revision + Number(changed),
        unsaved,
        damaged,
        warnings,
      });
    };
    const transact = (
      operation?: PaletteOperation,
      { reset = false } = {},
    ): Promise<Map<string, string>> => {
      const job = queue.then(async () => {
        set({ busy: true });
        let aliases = new Map<string, string>();
        const keepInMemory = (warnings: string[], damaged = false) => {
          const next = applyPaletteOperations(get().library, operation ? [operation] : []);
          aliases = next.aliases;
          if (operation) pending.push(operation);
          publish(next.library, true, warnings, damaged);
        };
        try {
          if (!deps.withLock) {
            keepInMemory([
              'This browser cannot coordinate palette storage. Changes are kept in this tab only.',
            ]);
            return aliases;
          }
          let entered = false;
          try {
            await deps.withLock(async () => {
              entered = true;
              const latest = read();
              // A damaged library is written over only when that was asked for; what replaces it
              // is what this tab holds, which is all that is left of it.
              const replace = reset && latest.damaged;
              if (!latest.writable && !replace) {
                keepInMemory(latest.warnings, latest.damaged);
                return;
              }
              const replayed = replace
                ? { library: get().library, aliases, kept: pending, dropped: [] }
                : replayPaletteOperations(latest.library, pending);
              let next = { library: replayed.library, aliases: replayed.aliases };
              let kept = replayed.kept;
              let refused: { error: unknown } | null = null;
              if (operation) {
                try {
                  next = applyPaletteOperations(replayed.library, [operation], replayed.aliases);
                  kept = [...kept, operation];
                } catch (error) {
                  // Refused, and nothing was waiting: nothing to write. Otherwise what waited is
                  // still saved, and the caller is told of the refusal afterwards.
                  if (pending.length === 0) throw error;
                  refused = { error };
                }
              }
              aliases = next.aliases;
              const saved = deps.storage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(next.library));
              pending = saved ? [] : kept;
              publish(
                next.library,
                !saved,
                [
                  ...(replace && saved ? [] : latest.warnings),
                  ...replayed.dropped,
                  ...(!saved
                    ? [
                        'Palette changes could not be saved. Export them or retry before closing this tab.',
                      ]
                    : []),
                ],
                replace && !saved,
              );
              if (refused) throw refused.error;
            });
          } catch (error) {
            if (entered) throw error;
            keepInMemory([
              'Palette storage coordination is unavailable. Changes are kept in this tab only.',
            ]);
          }
          return aliases;
        } finally {
          set({ busy: false });
        }
      });
      queue = job.then(
        () => {},
        () => {},
      );
      return job;
    };
    return {
      library: initial.library,
      revision: 0,
      unsaved: !initial.writable,
      damaged: initial.damaged,
      warnings: initial.warnings,
      busy: false,
      async importPalette(source) {
        const normalized = normalizePalette(source).palette;
        const id = deps.newId();
        const aliases = await transact({
          kind: 'import',
          entry: { id, displayName: normalized.name || 'Scene theme', source: normalized },
        });
        return aliases.get(id) ?? id;
      },
      async createPalette() {
        const id = deps.newId();
        const displayName = 'New palette';
        await transact({
          kind: 'create',
          entry: { id, displayName, source: newPaletteSource(displayName) },
        });
        return id;
      },
      async duplicate(from) {
        const original = get().library.palettes.find((entry) => entry.id === from);
        if (!original) throw new Error('This palette was removed in another tab.');
        const id = deps.newId();
        await transact({
          kind: 'create',
          entry: { id, displayName: `${original.displayName} copy`, source: original.source },
        });
        return id;
      },
      async recolor(id, role, color) {
        await transact({ kind: 'recolor', id, role, color });
      },
      async changeCustomRole(id, change) {
        await transact({ kind: 'custom-role', id, change });
      },
      async activate(id) {
        await transact({ kind: 'activate', id });
      },
      async rename(id, name) {
        await transact({ kind: 'rename', id, name });
      },
      async remove(id) {
        await transact({ kind: 'delete', id });
      },
      async retrySave() {
        await transact();
      },
      async resetLibrary() {
        await transact(undefined, { reset: true });
      },
      refresh() {
        if (pending.length || get().busy) return;
        const latest = read();
        if (!latest.writable) {
          set({ unsaved: true, damaged: latest.damaged, warnings: latest.warnings });
          return;
        }
        publish(latest.library, false, latest.warnings);
      },
    };
  });
  return store;
}

export const usePaletteStore = createPaletteStore({
  storage: safeStorage,
  newId: () =>
    `palette_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  withLock:
    typeof navigator !== 'undefined' && navigator.locks
      ? (run) => navigator.locks.request(PALETTE_LOCK_NAME, run)
      : null,
});

export function getActivePalette(): PaletteEntry | null {
  const { library } = usePaletteStore.getState();
  return library.palettes.find((entry) => entry.id === library.activePaletteId) ?? null;
}

/** Installed once by the app, with symmetrical cleanup for StrictMode/remounts. */
export function watchPaletteLibrary(): () => void {
  const refresh = () => usePaletteStore.getState().refresh();
  const onStorage = (event: StorageEvent) => {
    if (event.key === PALETTE_STORAGE_KEY || event.key === null) refresh();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refresh);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', refresh);
  };
}
