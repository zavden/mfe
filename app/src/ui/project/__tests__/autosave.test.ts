/* One page of the app and its autosave. Every case is a page load of its own: a fresh module
 * graph, so the writer id the autosave keeps in its module and the stores never pass from one case
 * to the next, whatever the order they run in. Another "tab" inside a case is the same page after
 * its sessionStorage was emptied, which gives the writer another id (`autosaveTabs.test.ts` has
 * real pages side by side). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let autosave: typeof import('../autosave');
let model: typeof import('../../../model');
let store: typeof import('../../../store');
let storage: typeof import('../../storage');
let documents: typeof import('../documentStore');
let notices: typeof import('../noticeStore');

const addFormula = (name: string) =>
  store.useProjectStore.getState().update((d) => {
    d.formulas.push(model.createFormula({ name, source: 'x' }));
  });
const names = () => store.useProjectStore.getState().project.formulas.map((f) => f.name);

interface StoredRecord {
  v: number;
  name: string;
  text: string;
  dirty: boolean;
  fileName: string | null;
  documentId: string;
  savedAt: number;
}
const ownKey = () => autosave.AUTOSAVE_PREFIX + autosave.sessionId();
const stored = (key = ownKey()) => {
  const raw = storage.safeStorage.getItem(key);
  return raw ? (JSON.parse(raw) as StoredRecord) : null;
};
const alive = (session = autosave.sessionId()) =>
  storage.safeStorage.getItem(autosave.ALIVE_PREFIX + session) !== null;

/** What Navigation Timing says about the page being loaded. */
let navigation: 'navigate' | 'reload' = 'navigate';
/** A new tab: its own session; the shared localStorage stays. */
const newTab = () => {
  navigation = 'navigate';
  window.sessionStorage.clear();
};
/** A reload of the tab of `session` (its sessionStorage). The old page's alive mark is left as
 * it is: a page that crashed never removed it. */
const inTab = (session: string) => {
  navigation = 'reload';
  window.sessionStorage.setItem(autosave.SESSION_KEY, session);
};
/** A page load: a fresh, empty application state. */
const freshApp = () => {
  store.loadProject(model.createEmptyProject());
  documents.useDocumentStore.getState().markClean(store.useProjectStore.getState().project, {
    fileName: null,
    handle: null,
  });
};

/** The services a case started and has not stopped. A case that fails before its `stop()` leaves
 * nothing listening to the stores of the next one: `afterEach` stops what is left. */
const running = new Set<() => void>();
const started = (stopService: () => void) => {
  const stop = () => {
    if (running.delete(stop)) stopService();
  };
  running.add(stop);
  return stop;
};
const startAutosave = (delay?: number) => started(autosave.startAutosave(delay));
/** Work in the current tab: a formula, autosaved. */
const work = (name: string, delay = 100) => {
  const stop = startAutosave(delay);
  addFormula(name);
  vi.advanceTimersByTime(delay + 50);
  return stop;
};

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ now: new Date('2026-11-03T10:00:00Z') });
  Object.defineProperty(performance, 'getEntriesByType', {
    configurable: true,
    value: (type: string) => (type === 'navigation' ? [{ type: navigation }] : []),
  });
  window.localStorage.clear();
  newTab();
  autosave = await import('../autosave');
  model = await import('../../../model');
  store = await import('../../../store');
  storage = await import('../../storage');
  documents = await import('../documentStore');
  notices = await import('../noticeStore');
  freshApp();
  started(documents.startDocumentTracking());
});
afterEach(() => {
  // Last started, first stopped: the document tracking outlives the autosave it serves.
  for (const stop of [...running].reverse()) stop();
  // A spy a failed case left on Storage would block the storage of every case after it.
  vi.restoreAllMocks();
  delete (performance as { getEntriesByType?: unknown }).getEntriesByType;
  vi.useRealTimers();
});

describe('autosave', () => {
  it("writes the project debounced under this tab's key, as a project file", () => {
    const stop = startAutosave(400);
    addFormula('f1');
    addFormula('f2');
    expect(stored()).toBeNull();
    vi.advanceTimersByTime(399);
    expect(stored()).toBeNull();
    vi.advanceTimersByTime(2);
    const record = stored()!;
    expect(record).toMatchObject({ v: 3, name: 'Untitled' });
    const parsed = model.parseProject(record.text);
    expect(parsed.ok && parsed.project.formulas.map((f) => f.name)).toEqual(['f1', 'f2']);
    expect(
      storage.safeStorage.keys().filter((k) => k.startsWith(autosave.AUTOSAVE_PREFIX)),
    ).toEqual([ownKey()]);
    stop();
  });

  it('goes on under one record when the browser’s storage is emptied under the page', () => {
    // "Clear site data" with the tab open: the session and every record go, the page stays.
    const stop = work('kept');
    const before = autosave.sessionId();
    expect(stored()).not.toBeNull();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.advanceTimersByTime(autosave.ALIVE_INTERVAL_MS + 100);
    // The page writes under another id now, and its work is back in the store, once.
    const after = autosave.sessionId();
    expect(after).not.toBe(before);
    const record = stored(autosave.AUTOSAVE_PREFIX + after)!;
    const parsed = model.parseProject(record.text);
    expect(parsed.ok && parsed.project.formulas.map((f) => f.name)).toEqual(['kept']);
    // Both ids are this page's: what it owns in the media store is named after the first.
    expect(alive(before)).toBe(true);
    expect(alive(after)).toBe(true);
    // No write at every heartbeat from then on: the record is where the page looks for it.
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    vi.advanceTimersByTime(autosave.ALIVE_INTERVAL_MS * 5);
    expect(
      writes.mock.calls.filter(([key]) => String(key).startsWith(autosave.AUTOSAVE_PREFIX)),
    ).toEqual([]);
    expect(stored(autosave.AUTOSAVE_PREFIX + after)!.savedAt).toBe(record.savedAt);
    writes.mockRestore();
    // An edit is written under the same id, and the page leaves no mark behind.
    addFormula('later');
    vi.advanceTimersByTime(500);
    expect(model.parseProject(stored(autosave.AUTOSAVE_PREFIX + after)!.text)).toMatchObject({
      ok: true,
    });
    expect(
      storage.safeStorage.keys().filter((k) => k.startsWith(autosave.AUTOSAVE_PREFIX)),
    ).toEqual([autosave.AUTOSAVE_PREFIX + after]);
    stop();
    expect(alive(before)).toBe(false);
    expect(alive(after)).toBe(false);
  });

  it('flushes a pending write when the page is hidden or closed, and marks the tab alive', () => {
    const stop = startAutosave(10_000);
    expect(alive()).toBe(true);
    addFormula('f1');
    expect(stored()).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(stored()).not.toBeNull();
    // The page went away: a new tab may take the record over.
    expect(alive()).toBe(false);
    window.dispatchEvent(new Event('pageshow')); // back from the cache
    expect(alive()).toBe(true);
    addFormula('f2');
    stop(); // unmount flushes too
    expect(JSON.stringify(stored())).toContain('f2');
    expect(alive()).toBe(false);
  });

  it('records the file name and whether there were unsaved changes', () => {
    const stop = startAutosave(100);
    documents.useDocumentStore
      .getState()
      .markClean(store.useProjectStore.getState().project, { fileName: 'a.mfe.json' });
    addFormula('f1');
    vi.advanceTimersByTime(150);
    expect(stored()).toMatchObject({ fileName: 'a.mfe.json', dirty: true });
    stop();
  });

  it('restores the project after a reload, with its unsaved state', () => {
    documents.useDocumentStore
      .getState()
      .markClean(store.useProjectStore.getState().project, { fileName: 'a.mfe.json' });
    work('f1')();
    // "Reload": the same tab, a fresh application state.
    freshApp();
    expect(autosave.restoreAutosave()).toBe(true);
    expect(names()).toEqual(['f1']);
    expect(documents.useDocumentStore.getState()).toMatchObject({
      dirty: true,
      fileName: 'a.mfe.json',
      baseline: null,
    });
  });

  it('keeps the document id, so the restored document gets back its own file handle', () => {
    const { documentId } = documents.useDocumentStore.getState();
    work('f1')();
    expect(stored()).toMatchObject({ v: 3, documentId });
    freshApp();
    documents.useDocumentStore.getState().beginDocument(store.useProjectStore.getState().project, {
      fileName: null,
      handle: null,
    });
    expect(documents.useDocumentStore.getState().documentId).not.toBe(documentId);
    expect(autosave.restoreAutosave()).toBe(true);
    expect(documents.useDocumentStore.getState()).toMatchObject({ dirty: true, documentId });
    // A record of version 1 (no id) restores under a fresh id: no stored handle matches it.
    const text = stored()!.text;
    storage.safeStorage.setItem(
      ownKey(),
      JSON.stringify({ v: 1, savedAt: 0, fileName: 'old.mfe.json', dirty: false, text }),
    );
    expect(autosave.restoreAutosave()).toBe(true);
    expect(documents.useDocumentStore.getState()).toMatchObject({
      dirty: false,
      fileName: 'old.mfe.json',
    });
    expect(documents.useDocumentStore.getState().documentId).not.toBe(documentId);
  });

  it('restores a clean document as clean', () => {
    const stop = startAutosave(100);
    addFormula('f1');
    documents.useDocumentStore
      .getState()
      .markClean(store.useProjectStore.getState().project, { fileName: 'b.mfe.json' });
    vi.advanceTimersByTime(150);
    stop();
    freshApp();
    expect(autosave.restoreAutosave()).toBe(true);
    expect(documents.useDocumentStore.getState()).toMatchObject({
      dirty: false,
      fileName: 'b.mfe.json',
    });
  });

  it("two open tabs keep their own records and never restore each other's", () => {
    const a = autosave.sessionId();
    const stopA = startAutosave(100); // tab A stays open (alive)
    addFormula('a1');
    vi.advanceTimersByTime(150);

    newTab();
    freshApp();
    expect(autosave.restoreAutosave()).toBe(false); // nothing to take over: A is alive
    expect(names()).toEqual([]);
    const b = autosave.sessionId();
    expect(b).not.toBe(a);
    const stopB = startAutosave(100);
    addFormula('b1');
    vi.advanceTimersByTime(150);
    expect(stored(autosave.AUTOSAVE_PREFIX + a)?.text).toContain('a1');
    expect(stored(autosave.AUTOSAVE_PREFIX + b)?.text).toContain('b1');
    expect(autosave.recoverableAutosaves()).toEqual([]);

    // Each tab reloads into its own work: its old page stops, then the new one starts.
    stopA();
    inTab(a);
    freshApp();
    expect(autosave.restoreAutosave()).toBe(true);
    expect(names()).toEqual(['a1']);
    stopB();
    inTab(b);
    freshApp();
    expect(autosave.restoreAutosave()).toBe(true);
    expect(names()).toEqual(['b1']);
  });

  it('a new tab takes over the newest record of a tab that is gone, and lists the rest', () => {
    const a = autosave.sessionId();
    work('a1')(); // closed: its alive mark is gone
    vi.advanceTimersByTime(60_000);
    newTab();
    freshApp();
    const b = autosave.sessionId();
    work('b1')();

    newTab();
    freshApp();
    expect(autosave.restoreAutosave()).toBe(true);
    expect(names()).toEqual(['b1']);
    expect(documents.useDocumentStore.getState()).toMatchObject({ dirty: true, baseline: null });
    // B's record is this tab's now; A's waits in the menu.
    expect(stored()?.text).toContain('b1');
    expect(storage.safeStorage.getItem(autosave.AUTOSAVE_PREFIX + b)).toBeNull();
    expect(autosave.recoverableAutosaves()).toEqual([
      { session: a, name: 'Untitled', fileName: null, dirty: true, savedAt: expect.any(Number) },
    ]);
  });

  it("File → Recover autosave brings back a listed record, which becomes this tab's", async () => {
    const a = autosave.sessionId();
    work('a1')();
    newTab();
    freshApp();
    expect(autosave.restoreAutosave()).toBe(true); // took A over (the newest)
    expect(names()).toEqual(['a1']);
    // Another gone tab's record appears meanwhile (say, a crashed tab, a minute later).
    storage.safeStorage.setItem(
      autosave.AUTOSAVE_PREFIX + 'crashed',
      JSON.stringify({ ...stored()!, name: 'Other', text: stored()!.text.replace('a1', 'c1') }),
    );
    expect(autosave.recoverableAutosaves().map((r) => r.name)).toEqual(['Other']);
    documents.useDocumentStore
      .getState()
      .markClean(store.useProjectStore.getState().project, { fileName: 'a.mfe.json' });
    await expect(autosave.recoverAutosave('crashed')).resolves.toBe(true);
    expect(names()).toEqual(['c1']);
    expect(storage.safeStorage.getItem(autosave.AUTOSAVE_PREFIX + 'crashed')).toBeNull();
    expect(stored()?.text).toContain('c1');
    expect(autosave.recoverableAutosaves()).toEqual([]);
    expect(a).not.toBe(autosave.sessionId());
    // Gone meanwhile (another tab took it): said so. The document is clean, so no question.
    documents.useDocumentStore
      .getState()
      .markClean(store.useProjectStore.getState().project, { fileName: 'c.mfe.json' });
    await expect(autosave.recoverAutosave('crashed')).resolves.toBe(false);
    expect(notices.useNoticeStore.getState().notices.at(-1)).toMatchObject({
      title: 'That autosave is gone',
    });
  });

  it('counts a tab as gone a minute after its last alive mark (a crash)', () => {
    const a = autosave.sessionId();
    work('a1')();
    storage.safeStorage.setItem(autosave.ALIVE_PREFIX + a, String(Date.now())); // as if it never closed
    newTab();
    freshApp();
    vi.advanceTimersByTime(autosave.STALE_AFTER_MS - 1000);
    expect(autosave.restoreAutosave()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(autosave.restoreAutosave()).toBe(true);
    expect(names()).toEqual(['a1']);
  });

  it('migrates the one record of older versions as the record of a gone tab', () => {
    const text = JSON.stringify(model.createEmptyProject());
    // However old: it is what the app last showed.
    storage.safeStorage.setItem(
      autosave.LEGACY_AUTOSAVE_KEY,
      JSON.stringify({ v: 2, savedAt: 1, fileName: 'old.mfe.json', dirty: false, text }),
    );
    expect(autosave.restoreAutosave()).toBe(true);
    expect(documents.useDocumentStore.getState()).toMatchObject({
      dirty: false,
      fileName: 'old.mfe.json',
    });
    expect(storage.safeStorage.getItem(autosave.LEGACY_AUTOSAVE_KEY)).toBeNull();
    expect(storage.safeStorage.getItem(autosave.AUTOSAVE_PREFIX + 'legacy')).toBeNull();
    expect(stored()?.fileName).toBe('old.mfe.json');
  });

  it('drops week-old records and keeps the newest five', () => {
    const text = JSON.stringify(model.createEmptyProject());
    const now = Date.now();
    for (let i = 0; i < 7; i++) {
      storage.safeStorage.setItem(
        autosave.AUTOSAVE_PREFIX + `t${i}`,
        JSON.stringify({ v: 3, savedAt: now - i * 3600_000, name: `p${i}`, dirty: true, text }),
      );
    }
    storage.safeStorage.setItem(
      autosave.AUTOSAVE_PREFIX + 'old',
      JSON.stringify({ v: 3, savedAt: now - autosave.KEEP_RECOVERABLE_MS - 1, name: 'old', text }),
    );
    expect(autosave.recoverableAutosaves().map((r) => r.name)).toEqual([
      'p0',
      'p1',
      'p2',
      'p3',
      'p4',
    ]);
    expect(storage.safeStorage.getItem(autosave.AUTOSAVE_PREFIX + 'old')).toBeNull();
    expect(storage.safeStorage.getItem(autosave.AUTOSAVE_PREFIX + 't6')).toBeNull();
  });

  it('ignores missing, corrupt and foreign records', () => {
    expect(autosave.restoreAutosave()).toBe(false);
    storage.safeStorage.setItem(ownKey(), 'not json');
    expect(autosave.restoreAutosave()).toBe(false);
    storage.safeStorage.setItem(ownKey(), JSON.stringify({ v: 2, text: '{}' }));
    expect(autosave.restoreAutosave()).toBe(false);
    storage.safeStorage.setItem(ownKey(), JSON.stringify({ v: 1, text: '{"format":"other"}' }));
    expect(autosave.restoreAutosave()).toBe(false);
    expect(store.useProjectStore.getState().project.formulas).toEqual([]);
  });

  it('keeps an autosave it cannot read, says so and offers it as a download', () => {
    notices.useNoticeStore.getState().clear();
    const text = JSON.stringify({ format: 'manim-formula-editor', version: 99 });
    const raw = JSON.stringify({ v: 1, savedAt: 0, fileName: null, dirty: true, text });
    storage.safeStorage.setItem(ownKey(), raw);
    expect(autosave.restoreAutosave()).toBe(false);
    const [notice] = notices.useNoticeStore.getState().notices;
    expect(notice).toMatchObject({
      kind: 'error',
      title: 'Could not restore the autosaved project',
      message: expect.stringMatching(/^The project was saved by a newer version of the app/),
      action: { label: 'Download it' },
    });
    // The copy, under a key of its record's own, stays while the next autosave writes the record.
    const copy = `${autosave.AUTOSAVE_BACKUP_KEY}.${autosave.sessionId()}`;
    expect(storage.safeStorage.getItem(copy)).toBe(raw);
    work('f1', 10)();
    expect(storage.safeStorage.getItem(copy)).toBe(raw);
    expect(stored()?.text).not.toBe(text);
  });

  it('survives blocked storage, and says once that there is no autosave', () => {
    notices.useNoticeStore.getState().clear();
    expect(autosave.autosaveStatus()).toBe('ok');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const stop = startAutosave(10);
    addFormula('f1');
    expect(() => vi.advanceTimersByTime(20)).not.toThrow();
    expect(autosave.autosaveStatus()).toBe('blocked');
    addFormula('f2');
    vi.advanceTimersByTime(20);
    stop();
    vi.restoreAllMocks();
    expect(notices.useNoticeStore.getState().notices).toEqual([
      {
        id: expect.any(Number),
        kind: 'warning',
        title: 'No autosave in this browser',
        message:
          'The browser does not let the app keep an autosave (its storage is blocked or full). Save to a file to keep your work.',
      },
    ]);
  });

  it('says when a record was saved', () => {
    const now = Date.parse('2026-11-03T10:00:00Z');
    expect(autosave.timeAgo(now - 20_000, now)).toBe('just now');
    expect(autosave.timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(autosave.timeAgo(now - 3 * 3600_000, now)).toBe('3 h ago');
    expect(autosave.timeAgo(now - 26 * 3600_000, now)).toBe('yesterday');
    expect(autosave.timeAgo(now - 4 * 24 * 3600_000, now)).toBe('4 days ago');
  });
});
