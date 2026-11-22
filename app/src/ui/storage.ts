/**
 * localStorage wrapper that never throws (storage can be blocked, e.g. in private windows,
 * sandboxed iframes or webviews). Shaped like `Pick<Storage, 'getItem' | 'setItem'>` so it can
 * be handed to react-resizable-panels as its layout storage.
 */
export const safeStorage = {
  /** Distinguish an empty store from denied reads before a read/modify/write operation. */
  readItem(key: string): { ok: true; value: string | null } | { ok: false } {
    try {
      return { ok: true, value: window.localStorage.getItem(key) };
    } catch {
      return { ok: false };
    }
  },
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  /** True when the value was stored. */
  setItem(key: string, value: string): boolean {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      // Persistence is a convenience; the autosave tells the user once when it has none.
      return false;
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // nothing to remove, or no storage
    }
  },
  /** Every key in the store (none when it is blocked). */
  keys(): string[] {
    try {
      const out: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key !== null) out.push(key);
      }
      return out;
    } catch {
      return [];
    }
  },
};

/** The same over sessionStorage: one store per tab, kept over a reload, gone with the tab. */
export const safeSession = {
  getItem(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): boolean {
    try {
      window.sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // nothing to remove, or no storage
    }
  },
};
