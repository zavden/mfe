/* Several pages of the app over one localStorage. Every "tab" here is its own module graph, so
 * it has its own stores and its own autosave writer, and its own sessionStorage, which survives
 * a reload and is copied by a duplicated tab, as in a browser. The clock is shared. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Navigation = 'navigate' | 'reload' | 'back_forward';
/** What Navigation Timing says about the page being loaded. */
let navigation: Navigation = 'navigate';

interface Tab {
  autosave: typeof import('../autosave');
  /** The tab's sessionStorage. */
  session: Map<string, string>;
  /** The writer id of this page. */
  id: string;
  /** Whether startup restored a project. */
  restored: boolean;
  names(): string[];
  /** An edit, autosaved. */
  work(name: string): void;
  /** File → New, discarding what was there; autosaved. */
  startNew(name: string): void;
  /** The notices this page showed. */
  notices(): { kind: string; title: string; action?: { label: string; run(): void } }[];
  /** The page leaves in order (pagehide): it flushes and removes its alive mark. */
  close(): void;
  /** The page dies: nothing runs, so its record and its alive mark stay as they were. */
  crash(): void;
}

const tabs: Tab[] = [];
const record = (id: string) => localStorage.getItem(`mfe.autosave.${id}`);
const mark = (id: string) => localStorage.getItem(`mfe.alive.${id}`);

async function open(
  session = new Map<string, string>(),
  kind: Navigation = 'navigate',
  sessionWritable = true,
): Promise<Tab> {
  vi.resetModules();
  vi.doMock('../../storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../storage')>()),
    safeSession: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (sessionWritable) session.set(key, value);
        return sessionWritable;
      },
    },
  }));
  navigation = kind;
  const autosave = await import('../autosave');
  const model = await import('../../../model');
  const store = await import('../../../store');
  const documents = await import('../documentStore');
  const actions = await import('../actions');
  const notices = await import('../noticeStore');
  // As App.tsx starts: the restore, else a new project; then the services.
  const restored = autosave.restoreAutosave();
  if (!restored) actions.initializeNewEditorProject();
  const id = autosave.sessionId();
  const stops = [documents.startDocumentTracking(), autosave.startAutosave()];
  let open = true;
  const tab: Tab = {
    autosave,
    session,
    id,
    restored,
    names: () => store.useProjectStore.getState().project.formulas.map((f) => f.name),
    work(name) {
      store.useProjectStore.getState().update((draft) => {
        draft.formulas.push(model.createFormula({ name, source: 'x' }));
      });
      vi.advanceTimersByTime(autosave.AUTOSAVE_DELAY_MS + 50);
    },
    startNew(name) {
      actions.replaceProject(model.createEmptyProject(name), { fileName: null, handle: null });
      tab.work(`${name}-work`);
    },
    notices: () => notices.useNoticeStore.getState().notices,
    close() {
      if (!open) return;
      open = false;
      for (const stop of stops) stop();
    },
    crash() {
      if (!open) return;
      const left = { record: record(id), mark: mark(id) };
      tab.close();
      for (const [key, value] of [
        [`mfe.autosave.${id}`, left.record],
        [`mfe.alive.${id}`, left.mark],
      ] as const) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
    },
  };
  tabs.push(tab);
  return tab;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') });
  localStorage.clear();
  navigation = 'navigate';
  Object.defineProperty(performance, 'getEntriesByType', {
    configurable: true,
    value: (type: string) => (type === 'navigation' ? [{ type: navigation }] : []),
  });
});

afterEach(() => {
  for (const tab of tabs.splice(0)) tab.close();
  delete (performance as { getEntriesByType?: unknown }).getEntriesByType;
  delete (document as { wasDiscarded?: boolean }).wasDiscarded;
  vi.doUnmock('../../storage');
  vi.useRealTimers();
});

describe('a reload continues its tab', () => {
  it('gets the work back at once after a crash, however fresh the alive mark', async () => {
    const tab = await open();
    tab.work('crashed-work');
    vi.advanceTimersByTime(20_000); // a heartbeat later: the mark is fresh
    tab.crash();
    expect(mark(tab.id)).not.toBeNull();

    const reloaded = await open(tab.session, 'reload');
    expect(reloaded.restored).toBe(true);
    expect(reloaded.names()).toEqual(['crashed-work']);
    // The record is this page's now; nothing of the dead page stays behind.
    expect(record(reloaded.id)).toContain('crashed-work');
    expect(record(tab.id)).toBeNull();
    expect(mark(tab.id)).toBeNull();
    expect(reloaded.autosave.recoverableAutosaves()).toEqual([]);
  });

  it('gets the work back after an ordinary reload', async () => {
    const tab = await open();
    tab.work('f1');
    tab.close();
    const reloaded = await open(tab.session, 'reload');
    expect(reloaded.restored).toBe(true);
    expect(reloaded.names()).toEqual(['f1']);
    expect(record(tab.id)).toBeNull();
  });

  it('continues too when the browser discarded the tab and loads it again', async () => {
    const tab = await open();
    tab.work('discarded-work');
    tab.crash(); // a discard runs no pagehide either
    Object.defineProperty(document, 'wasDiscarded', { configurable: true, value: true });
    const loadedAgain = await open(tab.session, 'navigate');
    expect(loadedAgain.restored).toBe(true);
    expect(loadedAgain.names()).toEqual(['discarded-work']);
    expect(record(tab.id)).toBeNull();
  });

  it("keeps a crashed tab's work for that tab while its mark is fresh", async () => {
    const tab = await open();
    tab.work('crashed-work');
    tab.crash();
    const other = await open();
    expect(other.restored).toBe(false);
    expect(other.names()).toEqual([]);
    expect(other.autosave.recoverableAutosaves()).toEqual([]);
    expect(record(tab.id)).toContain('crashed-work');
  });

  it('a duplicated tab leaves the live original alone', async () => {
    const original = await open();
    original.work('original-work');
    const duplicate = await open(new Map(original.session), 'back_forward');
    expect(duplicate.restored).toBe(false);
    expect(duplicate.id).not.toBe(original.id);
    expect(record(original.id)).toContain('original-work');
    expect(mark(original.id)).not.toBeNull();
  });

  it('does not take a reload as proof where the session id cannot be written', async () => {
    const original = await open();
    original.work('original-work');
    // A window opened from the original inherits its session id and cannot replace it; its
    // reload still finds the original's id there.
    const child = await open(new Map(original.session), 'reload', false);
    expect(child.restored).toBe(false);
    expect(record(original.id)).toContain('original-work');
    expect(mark(original.id)).not.toBeNull();
  });
});

describe('records of pages that stopped answering', () => {
  it("another tab takes a crashed tab's work once, and it is not offered again", async () => {
    const tab = await open();
    tab.work('crashed-work');
    tab.crash();
    vi.advanceTimersByTime(61_000);
    const other = await open();
    expect(other.restored).toBe(true);
    expect(other.names()).toEqual(['crashed-work']);
    const third = await open();
    expect(third.restored).toBe(false);
    expect(third.autosave.recoverableAutosaves()).toEqual([]);
    await expect(third.autosave.recoverAutosave(tab.id)).resolves.toBe(false);
    expect(third.names()).toEqual([]);
  });

  it('a discarded tab still finds its work after another tab took it and gave it up', async () => {
    const tab = await open();
    tab.work('background-work');
    tab.crash(); // discarded to save memory: no pagehide, and the mark goes stale
    vi.advanceTimersByTime(10 * 60_000);
    const other = await open();
    expect(other.names()).toEqual(['background-work']);
    other.startNew('Something else'); // "Don't save": the user knows it is in the other tab
    expect(record(other.id)).not.toContain('background-work');

    Object.defineProperty(document, 'wasDiscarded', { configurable: true, value: true });
    const back = await open(tab.session, 'navigate');
    expect(back.restored).toBe(true);
    expect(back.names()).toEqual(['background-work']);
    // Its tab has it again, under the new page's key: the hidden copy is no longer needed.
    expect(record(tab.id)).toBeNull();
    expect(mark(tab.id)).toBeNull();
  });

  it('a restored browser session takes its stale previous record, which is not offered again', async () => {
    const tab = await open();
    tab.work('before-the-restart');
    tab.crash();
    vi.advanceTimersByTime(5 * 60_000);
    const restoredSession = await open(new Map(tab.session), 'back_forward');
    expect(restoredSession.restored).toBe(true);
    expect(restoredSession.names()).toEqual(['before-the-restart']);
    expect(restoredSession.autosave.recoverableAutosaves()).toEqual([]);
    const other = await open();
    expect(other.restored).toBe(false);
  });

  it('a record that was taken goes for good once it is a week old', async () => {
    const tab = await open();
    tab.work('crashed-work');
    tab.crash();
    vi.advanceTimersByTime(61_000);
    const other = await open();
    expect(other.restored).toBe(true);
    expect(record(tab.id)).not.toBeNull(); // hidden, for its own tab
    other.close();
    vi.advanceTimersByTime(other.autosave.KEEP_RECOVERABLE_MS + 60_000);
    const later = await open();
    later.autosave.recoverableAutosaves();
    expect(record(tab.id)).toBeNull();
    expect(mark(tab.id)).toBeNull();
  });

  describe('pruning', () => {
    const HOUR = 3600_000;
    const DAY = 24 * HOUR;
    /** A record as another page left it; `mark` is its alive mark (none: the page closed). */
    async function leave(id: string, savedAt: number, mark?: string) {
      const { serializeProject, createEmptyProject } = await import('../../../model');
      localStorage.setItem(
        `mfe.autosave.${id}`,
        JSON.stringify({
          v: 3,
          savedAt,
          name: id,
          fileName: null,
          dirty: true,
          documentId: `d_${id}`,
          text: serializeProject(createEmptyProject(id)),
        }),
      );
      if (mark !== undefined) localStorage.setItem(`mfe.alive.${id}`, mark);
    }
    const listed = (tab: Tab) => tab.autosave.recoverableAutosaves().map((r) => r.name);

    it('keeps the newest five records of tabs that were closed', async () => {
      const tab = await open();
      const now = Date.now();
      for (let i = 0; i < 7; i++) await leave(`closed${i}`, now - (i + 1) * HOUR);
      expect(listed(tab)).toEqual(['closed0', 'closed1', 'closed2', 'closed3', 'closed4']);
      expect(record('closed5')).toBeNull();
      expect(record('closed6')).toBeNull();
    });

    it('never ends by count the record of a tab that may come back', async () => {
      const tab = await open();
      const now = Date.now();
      // Seven tabs that stopped answering: crashed, or discarded by the browser to save memory.
      for (let i = 0; i < 7; i++) {
        await leave(`quiet${i}`, now - (i + 1) * HOUR, String(now - (i + 1) * HOUR));
      }
      for (let i = 0; i < 3; i++) await leave(`closed${i}`, now - (i + 1) * 60_000);
      // The list is as short as ever…
      expect(listed(tab)).toEqual(['closed0', 'closed1', 'closed2', 'quiet0', 'quiet1']);
      // …but every quiet tab still has its record, the oldest one too,
      for (let i = 0; i < 7; i++) expect(record(`quiet${i}`)).not.toBeNull();
      // and gets it back when the browser loads it again.
      Object.defineProperty(document, 'wasDiscarded', { configurable: true, value: true });
      const back = await open(new Map([['mfe.session', 'quiet6']]), 'navigate');
      expect(back.restored).toBe(true);
      expect(back.autosave.recoverableAutosaves().map((r) => r.name)).not.toContain('quiet6');
    });

    it('ends a record a week after its page was last there, not after its last save', async () => {
      const tab = await open();
      const now = Date.now();
      await leave('closed-long-ago', now - 8 * DAY);
      await leave('quiet-long-ago', now - 9 * DAY, String(now - 8 * DAY));
      // Saved nine days ago, but its page was still open (idle) six days ago.
      await leave('quiet-lately', now - 9 * DAY, String(now - 6 * DAY));
      await leave('taken-long-ago', now - 9 * DAY, `taken:${now - 8 * DAY}`);
      expect(listed(tab)).toEqual(['quiet-lately']);
      for (const gone of ['closed-long-ago', 'quiet-long-ago', 'taken-long-ago']) {
        expect(record(gone)).toBeNull();
        expect(mark(gone)).toBeNull();
      }
    });

    it('keeps at most five records that another page took', async () => {
      const tab = await open();
      const now = Date.now();
      for (let i = 0; i < 7; i++) {
        await leave(`taken${i}`, now - 3 * DAY, `taken:${now - (i + 1) * HOUR}`);
      }
      expect(listed(tab)).toEqual([]);
      for (let i = 0; i < 5; i++) expect(record(`taken${i}`)).not.toBeNull();
      for (const gone of ['taken5', 'taken6']) {
        expect(record(gone)).toBeNull();
        expect(mark(gone)).toBeNull();
      }
    });
  });

  it('a tab that finds its record taken, and is not a reload, leaves no third copy', async () => {
    const tab = await open();
    tab.work('crashed-work');
    tab.crash();
    vi.advanceTimersByTime(61_000);
    const other = await open();
    expect(other.names()).toEqual(['crashed-work']);
    expect(mark(tab.id)).toMatch(/^taken:/);
    // The browser restarts and restores the tab: not a reload, yet it is that tab.
    const restoredSession = await open(new Map(tab.session), 'back_forward');
    expect(restoredSession.names()).toEqual(['crashed-work']);
    expect(record(tab.id)).toBeNull();
    expect(mark(tab.id)).toBeNull();
  });

  it.each(['resume', 'visibilitychange', 'pageshow', 'heartbeat'] as const)(
    'a suspended page whose record was taken is alive again when it runs (%s)',
    async (wake) => {
      const suspended = await open();
      suspended.work('still-open');
      // Frozen timers: the mark is a few minutes old although the page is there.
      localStorage.setItem(`mfe.alive.${suspended.id}`, String(Date.now() - 3 * 60_000));
      const other = await open();
      expect(other.restored).toBe(true);
      expect(mark(suspended.id)).toMatch(/^taken:/);

      if (wake === 'heartbeat') vi.advanceTimersByTime(suspended.autosave.ALIVE_INTERVAL_MS);
      else if (wake === 'pageshow') window.dispatchEvent(new Event('pageshow'));
      else document.dispatchEvent(new Event(wake));
      expect(Date.now() - Number(mark(suspended.id))).toBeLessThan(1000);
      // Two pages show that work now, each under its own key.
      expect(record(suspended.id)).toContain('still-open');
      expect(record(other.id)).toContain('still-open');
      const third = await open();
      expect(third.restored).toBe(false);
    },
  );

  it('a page that looked gone puts back a record that went missing', async () => {
    const suspended = await open();
    suspended.work('still-open');
    localStorage.setItem(`mfe.alive.${suspended.id}`, String(Date.now() - 3 * 60_000));
    localStorage.removeItem(`mfe.autosave.${suspended.id}`);
    localStorage.removeItem(`mfe.alive.${suspended.id}`);
    document.dispatchEvent(new Event('resume'));
    expect(mark(suspended.id)).not.toBeNull();
    expect(record(suspended.id)).toContain('still-open');
  });

  it('removes at startup the old alive marks that have no record', async () => {
    const now = Date.now();
    localStorage.setItem('mfe.alive.dead', String(now - 25 * 3600_000));
    localStorage.setItem('mfe.alive.takenlongago', `taken:${now - 25 * 3600_000}`);
    localStorage.setItem('mfe.alive.garbled', 'not a time');
    localStorage.setItem('mfe.alive.lately', String(now - 2 * 3600_000));
    const tab = await open();
    expect(mark('dead')).toBeNull();
    expect(mark('takenlongago')).toBeNull();
    expect(mark('garbled')).toBeNull();
    expect(mark('lately')).not.toBeNull();
    expect(mark(tab.id)).not.toBeNull();
  });

  it('a page back from the back/forward cache with nothing to save writes no record', async () => {
    const tab = await open();
    window.dispatchEvent(new Event('pagehide'));
    expect(mark(tab.id)).toBeNull();
    window.dispatchEvent(new Event('pageshow'));
    expect(mark(tab.id)).not.toBeNull();
    expect(record(tab.id)).toBeNull();
  });
});

describe('clocks that jumped', () => {
  it('a mark from far in the future does not keep a dead page alive', async () => {
    const tab = await open();
    tab.work('crashed-work');
    tab.crash();
    // The clock was an hour ahead when the page wrote its last mark (a dual boot, a bad sync).
    localStorage.setItem(`mfe.alive.${tab.id}`, String(Date.now() + 3600_000));
    const other = await open();
    expect(other.restored).toBe(true);
    expect(other.names()).toEqual(['crashed-work']);
  });

  it('a mark slightly ahead still protects its page, and the delayed look waits a minute at most', async () => {
    const before = await open();
    before.work('before-the-crash');
    before.crash();
    localStorage.setItem(`mfe.alive.${before.id}`, String(Date.now() + 30_000));
    const tab = await open(new Map(before.session), 'back_forward');
    expect(tab.restored).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(tab.names()).toEqual([]);
    vi.advanceTimersByTime(1_500);
    expect(tab.names()).toEqual(['before-the-crash']);
  });
});

describe('a previous page that still looks alive when the load is not a reload', () => {
  /** The browser died with a tab open; it starts again and restores the tab ten seconds later.
   * The dead page's mark is 15 s old then: it expires in 45 s. `meanwhile` runs while the
   * browser is down, as far as the storage goes. */
  async function restoredSession(meanwhile?: () => Promise<void>) {
    const before = await open();
    before.work('before-the-crash');
    vi.advanceTimersByTime(20_000);
    before.crash();
    await meanwhile?.();
    vi.advanceTimersByTime(10_000);
    const tab = await open(new Map(before.session), 'back_forward');
    // Fresh mark, no reload: that page could be open in another window.
    expect(tab.restored).toBe(false);
    expect(tab.names()).toEqual([]);
    return { before, tab };
  }

  it('a restored browser session gets its work back by itself when the old mark expires', async () => {
    const { tab } = await restoredSession();
    vi.advanceTimersByTime(44_000);
    expect(tab.names()).toEqual([]);
    vi.advanceTimersByTime(4_000);
    expect(tab.names()).toEqual(['before-the-crash']);
    expect(tab.notices()).toMatchObject([{ kind: 'info', title: 'Restored from the autosave' }]);
    expect(record(tab.id)).toContain('before-the-crash');
    const other = await open();
    expect(other.restored).toBe(false);
    expect(other.autosave.recoverableAutosaves()).toEqual([]);
  });

  it('only offers the work when the user already did something in the tab', async () => {
    const { before, tab } = await restoredSession();
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(48_000);
    expect(tab.names()).toEqual([]);
    const [notice] = tab.notices();
    expect(notice).toMatchObject({
      kind: 'warning',
      title: "Work from this tab's last session is available",
      action: { label: 'Recover' },
    });
    expect(tab.autosave.recoverableAutosaves().map((r) => r.session)).toEqual([before.id]);
    notice!.action!.run();
    await vi.waitFor(() => expect(tab.names()).toEqual(['before-the-crash']));
    expect(tab.autosave.recoverableAutosaves()).toEqual([]);
  });

  it("takes no other tab's record while it waits for its own", async () => {
    let closed!: Tab;
    const { tab } = await restoredSession(async () => {
      closed = await open();
      closed.work('closed-earlier');
      closed.close();
    });
    // `restoredSession` saw it start empty; the closed tab's record is only listed.
    expect(tab.autosave.recoverableAutosaves().map((r) => r.session)).toEqual([closed.id]);
    vi.advanceTimersByTime(48_000);
    expect(tab.names()).toEqual(['before-the-crash']);
    expect(tab.notices()).toMatchObject([{ title: 'Restored from the autosave' }]);
    expect(tab.autosave.recoverableAutosaves().map((r) => r.session)).toEqual([closed.id]);
  });

  it("never takes the work of a duplicated tab's original, which is open", async () => {
    const original = await open();
    original.work('original-work');
    const duplicate = await open(new Map(original.session), 'back_forward');
    vi.advanceTimersByTime(3 * 60_000);
    expect(duplicate.names()).toEqual([]);
    expect(duplicate.notices()).toEqual([]);
    expect(record(original.id)).toContain('original-work');
  });

  it('says nothing when another tab took the record first', async () => {
    const { tab } = await restoredSession();
    vi.advanceTimersByTime(46_000); // expired, not looked at yet
    const other = await open();
    expect(other.restored).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(tab.names()).toEqual([]);
    expect(tab.notices()).toEqual([]);
  });
});
