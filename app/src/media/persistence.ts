/* Imported media is the user's work, and a browser's storage is "best effort" by default: under
 * disk pressure it may evict everything an origin stored, originals included. Persistent storage
 * leaves that to the user. A browser may refuse, and no browser promises room: the project file
 * is still what holds a project for good. */

type StorageLike = Partial<Pick<StorageManager, 'persist' | 'persisted'>>;

/** A request made at most once: the first call asks, the others get its answer. */
export function persistentStorageRequest(
  storage: () => StorageLike | undefined = () => globalThis.navigator?.storage,
): () => Promise<boolean> {
  let asked: Promise<boolean> | null = null;
  return () =>
    (asked ??= (async () => {
      try {
        const manager = storage();
        if (await manager?.persisted?.()) return true;
        return (await manager?.persist?.()) === true;
      } catch {
        return false;
      }
    })());
}

/** Ask the browser to keep this origin's storage, once per page, when the first original is
 * imported. Chrome answers by itself, from how the site is used; Firefox asks the user. */
export const requestPersistentStorage = persistentStorageRequest();
