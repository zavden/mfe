/* Several pages of the app over one localStorage and one media database, as in a browser. Every
 * "tab" is its own module graph: its own stores, its own autosave writer and its own owners.
 * The originals a page still needs must survive every pass of the collection, whoever runs it;
 * the others must go once nobody can come back for them. */
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 3600_000;
let factory: IDBFactory;

interface Tab {
  autosave: typeof import('../autosave');
  media: typeof import('../../../media');
  collection: typeof import('../mediaCollection');
  session: Map<string, string>;
  id: string;
  restored: boolean;
  /** The originals the open project declares. */
  hashes(): string[];
  /** Import a recording as the Audio tab does; resolves once the autosave holds it too. */
  importSound(text: string): Promise<string>;
  /** Delete every recording of the project (Undo can bring them back). */
  deleteSounds(): Promise<void>;
  /** File → New, discarding what was there. */
  startNew(name: string): Promise<void>;
  /** An edit that is not about media. */
  rename(name: string): Promise<void>;
  /** Edit → Undo. */
  undo(): Promise<void>;
  /** The page goes into the back/forward cache (pagehide, persisted), as it is. */
  hide(): void;
  /** The user comes back to it (pageshow, persisted). */
  show(): Promise<void>;
  /** Wait until what the page has to write is written: its record and its owners. */
  settled(): Promise<void>;
  /** The page leaves in order (pagehide). */
  close(): Promise<void>;
  /** The page dies: nothing runs, so its record, its mark and its owners stay as they were. */
  crash(): Promise<void>;
}

const tabs: Tab[] = [];
const recordOf = (id: string) => localStorage.getItem(`mfe.autosave.${id}`);
const markOf = (id: string) => localStorage.getItem(`mfe.alive.${id}`);

async function open(session = new Map<string, string>()): Promise<Tab> {
  vi.resetModules();
  vi.doMock('../../storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../storage')>()),
    safeSession: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => (session.set(key, value), true),
    },
  }));
  const autosave = await import('../autosave');
  const media = await import('../../../media');
  const model = await import('../../../model');
  const store = await import('../../../store');
  const documents = await import('../documentStore');
  const actions = await import('../actions');
  const ownership = await import('../../../store/mediaOwnership');
  const services = await import('../mediaOwnership');
  const collection = await import('../mediaCollection');
  const restored = autosave.restoreAutosave();
  if (!restored) actions.initializeNewEditorProject();
  const id = autosave.sessionId();
  // Every tab listens to its own window; here they share one, so each tab's page-lifecycle
  // listeners are kept apart and called by name (`hide`, `show`).
  const lifecycle = new Map<string, EventListener[]>();
  const listen = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
    lifecycle.set(type, [...(lifecycle.get(type) ?? []), listener as EventListener]);
  });
  const stops = [
    documents.startDocumentTracking(),
    services.startMediaOwnership(),
    autosave.startAutosave(1),
  ];
  listen.mockRestore();
  const fire = (type: string) => {
    const event = Object.assign(new Event(type), { persisted: true });
    for (const listener of lifecycle.get(type) ?? []) listener(event);
  };
  let live = true;
  const project = () => store.useProjectStore.getState().project;
  const settled = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5)); // the autosave's delay
    await autosave.waitForAutosaveMedia();
    await ownership.mediaOwnershipSettled();
  };
  const stop = () => {
    live = false;
    for (const end of stops) end();
  };
  const tab: Tab = {
    autosave,
    media,
    collection,
    session,
    id,
    restored,
    hashes: () => media.projectMediaHashes(project()),
    async importSound(text) {
      const imported = await media.importAudioOriginal(
        new Blob([text], { type: 'audio/wav' }) as Blob & { name?: string },
        async () => ({ duration: 2, sampleRate: 48000, channels: 1 }),
      );
      store.useProjectStore.getState().update((draft) => {
        draft.audioAssets.push(imported.asset);
      });
      await ownership.syncCurrentMediaOwnership();
      await imported.lease.release();
      await settled();
      return imported.asset.contentHash;
    },
    async deleteSounds() {
      store.useProjectStore.getState().update((draft) => {
        draft.audioAssets = [];
      });
      await settled();
    },
    async startNew(name) {
      actions.replaceProject(model.createEmptyProject(name), { fileName: null, handle: null });
      store.useProjectStore.getState().update((draft) => {
        draft.meta.name = `${name}, edited`;
      });
      await settled();
    },
    async rename(name) {
      store.useProjectStore.getState().update((draft) => {
        draft.meta.name = name;
      });
      await settled();
    },
    async undo() {
      store.history.undo();
      await settled();
    },
    hide: () => fire('pagehide'),
    async show() {
      fire('pageshow');
      await settled();
    },
    settled,
    async close() {
      if (!live) return;
      await settled();
      // What pagehide does: the autosave flushes and removes its mark (its stop function does
      // the same), and the history owner is released.
      const released = ownership.releaseMediaOwnership();
      stop();
      await released;
    },
    async crash() {
      if (!live) return;
      await settled();
      const left = { record: recordOf(id), mark: markOf(id) };
      stop();
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

/** Let `ms` pass for the owners: nobody wrote them for that long. */
async function ageOwners(ms: number): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('mfe-original-media', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('owners', 'readwrite');
    const owners = transaction.objectStore('owners');
    const all = owners.getAll();
    all.onsuccess = () => {
      for (const owner of all.result as { updatedAt: number }[])
        owners.put({ ...owner, updatedAt: owner.updatedAt - ms });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

/** The mark of a page that stopped answering `ms` ago. */
function staleMark(id: string, ms = 2 * 60_000): void {
  localStorage.setItem(`mfe.alive.${id}`, String(Date.now() - ms));
}

const ownersOf = async (tab: Tab) =>
  (await tab.media.mediaRepository.listOwners()).map((owner) => owner.id).sort();
const stored = async (tab: Tab, hash: string) =>
  (await tab.media.mediaRepository.getOriginal(hash)) !== null;
const PAST_GRACE = 10 * 60_000 + 1;

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  factory = new IDBFactory();
  vi.stubGlobal('indexedDB', factory);
  localStorage.clear();
});

afterEach(async () => {
  for (const tab of tabs.splice(0)) await tab.close();
  vi.doUnmock('../../storage');
  vi.unstubAllGlobals();
});

describe('what a page that left in order leaves behind', () => {
  it('keeps the originals of its autosave record, which a later page recovers', async () => {
    // A page that was open before, with its own work: it will not take the record over.
    const watcher = await open(new Map());
    const tab = await open();
    const kept = await tab.importSound('narration');
    await tab.close();
    expect(recordOf(tab.id)).toContain(kept);
    // The history owner went with the page. Only the record's owner holds the recording now.
    expect((await ownersOf(watcher)).map((id) => id.split(':')[0])).toEqual(['recovery']);
    await ageOwners(30 * DAY);
    expect(await watcher.collection.collectMedia()).toEqual({ released: [], removed: 0, bytes: 0 });

    const later = await open(new Map());
    expect(later.restored).toBe(true);
    expect(later.hashes()).toEqual([kept]);
    expect(await stored(later, kept)).toBe(true);
  });

  it('frees a replaced project and a deleted recording once their page is gone', async () => {
    const tab = await open();
    const replaced = await tab.importSound('narration');
    await tab.startNew('Another project');
    const deleted = await tab.importSound('effect');
    await tab.deleteSounds();
    // While the page is open nothing goes, however long ago it wrote its owners: Undo brings
    // the effect back, and what it still holds of the first project is its own business.
    const watcher = await open(new Map());
    await ageOwners(DAY);
    expect((await watcher.collection.collectMedia()).released).toEqual([]);
    expect(await stored(watcher, deleted)).toBe(true);
    expect(await stored(watcher, replaced)).toBe(true);

    await tab.close();
    const collected = await watcher.collection.collectMedia();
    expect(collected.removed).toBe(2);
    expect(await stored(watcher, deleted)).toBe(false);
    expect(await stored(watcher, replaced)).toBe(false);
    expect(await ownersOf(watcher)).toEqual([]);
  });

  it('releases the owners a page could not release itself, after a grace', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    // A save that never ended and an import that never reached the project, of a page that died.
    await tab.media.pinProjectMedia(
      { audioAssets: [{ contentHash: hash }], formulas: [] } as never,
      tab.media.mediaOwnerId('save'),
    );
    await tab.media.mediaRepository.storeOriginal(new Blob(['never used']), {
      ownerId: tab.media.mediaOwnerId('import'),
    });
    await tab.startNew('Nothing here');
    await tab.crash();
    localStorage.removeItem(`mfe.autosave.${tab.id}`);
    localStorage.removeItem(`mfe.alive.${tab.id}`);

    const other = await open(new Map());
    // Owners written lately are left alone, whatever became of their page.
    expect(await other.collection.collectMedia()).toEqual({ released: [], removed: 0, bytes: 0 });
    await ageOwners(PAST_GRACE);
    const collected = await other.collection.collectMedia();
    expect(collected.released.map((id) => id.split(':')[0]).sort()).toEqual([
      'history',
      'import',
      'recovery',
      'save',
    ]);
    expect(collected.removed).toBe(2);
    expect(await ownersOf(other)).toEqual([]);
  });
});

describe('what a page that stopped answering keeps', () => {
  it('keeps everything while its record exists: the page may be suspended', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    await tab.deleteSounds(); // only its undo history holds the recording now
    await tab.crash();
    staleMark(tab.id);

    const other = await open(new Map());
    expect(other.restored).toBe(true); // it took the record over; the source stays, hidden
    expect(markOf(tab.id)).toMatch(/^taken:/);
    await ageOwners(PAST_GRACE);
    expect((await other.collection.collectMedia()).released).toEqual([]);
    expect(await stored(other, hash)).toBe(true);
  });

  it('keeps the recording of a hidden record that only its own tab can still recover', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    await tab.crash();
    staleMark(tab.id);

    // Another tab takes the work over, the user throws it away there and closes that tab.
    const other = await open(new Map());
    expect(other.hashes()).toEqual([hash]);
    await other.startNew('Thrown away');
    await other.close();

    const watcher = await open(new Map());
    await ageOwners(PAST_GRACE);
    await watcher.collection.collectMedia();
    expect(await stored(watcher, hash)).toBe(true);
    await watcher.close();

    // The first tab was only discarded by the browser: it loads again and has its recording.
    (document as { wasDiscarded?: boolean }).wasDiscarded = true;
    try {
      const back = await open(tab.session);
      expect(back.restored).toBe(true);
      expect(back.hashes()).toEqual([hash]);
      expect(await stored(back, hash)).toBe(true);
    } finally {
      delete (document as { wasDiscarded?: boolean }).wasDiscarded;
    }
  });

  it('gives up a page without a record a day after its last sign', async () => {
    const tab = await open();
    const session = new Map<string, string>();
    const clean = await open(session);
    // A page that opened a file and changed nothing: owners, but no autosave record.
    const original = await clean.media.mediaRepository.storeOriginal(new Blob(['from a file']), {
      ownerId: clean.media.mediaOwnerId('history'),
    });
    await clean.crash();
    expect(recordOf(clean.id)).toBeNull();
    staleMark(clean.id, DAY - 60_000);
    await ageOwners(DAY);
    expect((await tab.collection.collectMedia()).released).toEqual([]);
    expect(await stored(tab, original.contentHash)).toBe(true);

    staleMark(clean.id, DAY + 60_000);
    expect((await tab.collection.collectMedia()).released).toHaveLength(1);
    expect(await stored(tab, original.contentHash)).toBe(false);
  });
});

describe('a page in the back/forward cache', () => {
  it('keeps what it owns, although it looks closed and another tab took its work', async () => {
    const tab = await open();
    const undoable = await tab.importSound('narration');
    await tab.deleteSounds();
    const current = await tab.importSound('effect');
    // The user follows a link: the page goes into the cache as it is, and its mark goes.
    tab.hide();
    expect(markOf(tab.id)).toBeNull();

    // A new tab takes its work over (the record of a closed tab, as far as it can tell), the
    // user throws it away there and closes that tab too.
    const other = await open(new Map());
    expect(other.hashes()).toEqual([current]);
    expect(recordOf(tab.id)).toBeNull();
    await other.rename('Continued elsewhere');
    await other.startNew('Thrown away');
    await other.close();

    const watcher = await open(new Map());
    await ageOwners(PAST_GRACE);
    const collected = await watcher.collection.collectMedia();
    expect(collected.released.every((id) => !id.includes(tab.id))).toBe(true);
    expect(await stored(watcher, current)).toBe(true);
    expect(await stored(watcher, undoable)).toBe(true);

    // Back: the page is shown as it was, with its recording and what Undo brings back.
    await tab.show();
    expect(tab.hashes()).toEqual([current]);
    const record = JSON.parse(recordOf(tab.id)!) as { mediaOwner: string };
    const owners = await tab.media.mediaRepository.listOwners();
    expect(owners.find((owner) => owner.id === record.mediaOwner)?.hashes).toContain(current);
    await tab.undo();
    await tab.undo();
    expect(tab.hashes()).toEqual([undoable]);
    expect(await stored(tab, undoable)).toBe(true);
  });

  it('is given up a day after it left: no cache lasts that long', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    await tab.startNew('Nothing to recover');
    tab.hide();
    const away = `mfe.away.${tab.id}`;
    expect(Number(localStorage.getItem(away))).toBeGreaterThan(Date.now() - 1000);

    const watcher = await open(new Map());
    await ageOwners(DAY);
    expect((await watcher.collection.collectMedia()).released).toEqual([]);
    localStorage.setItem(away, String(Date.now() - DAY - 60_000));
    const collected = await watcher.collection.collectMedia();
    expect(collected.released.map((id) => id.split(':')[0]).sort()).toEqual([
      'history',
      'recovery',
    ]);
    expect(await stored(watcher, hash)).toBe(false);

    // A tab that starts later sweeps the mark it left.
    const later = await open(new Map());
    expect(localStorage.getItem(away)).toBeNull();
    await later.close();
  });

  it('drops its away mark when it is shown again', async () => {
    const tab = await open();
    tab.hide();
    expect(localStorage.getItem(`mfe.away.${tab.id}`)).not.toBeNull();
    await tab.show();
    expect(localStorage.getItem(`mfe.away.${tab.id}`)).toBeNull();
    expect(markOf(tab.id)).not.toBeNull();
  });
});

describe('a page that comes back after it was given up', () => {
  it('owns its originals again, and names an owner that exists', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    const before = JSON.parse(recordOf(tab.id)!) as { mediaOwner: string };
    // Into the back/forward cache, where its away mark could not be written (no room).
    tab.hide();
    localStorage.removeItem(`mfe.away.${tab.id}`);

    // A new tab takes its work over and goes on with it under an owner of its own.
    const other = await open(new Map());
    expect(other.hashes()).toEqual([hash]);
    expect(recordOf(tab.id)).toBeNull();
    await other.rename('Continued elsewhere');
    await ageOwners(PAST_GRACE);
    const collected = await other.collection.collectMedia();
    expect(collected.released).toContain(before.mediaOwner);
    expect(collected.released.map((id) => id.split(':')[0]).sort()).toEqual([
      'history',
      'recovery',
    ]);
    expect(await stored(other, hash)).toBe(true);

    // The user presses Back: the first page is shown again, as it was.
    await tab.show();
    const record = JSON.parse(recordOf(tab.id)!) as { mediaOwner: string };
    const owners = await tab.media.mediaRepository.listOwners();
    expect(owners.find((owner) => owner.id === record.mediaOwner)?.hashes).toEqual([hash]);
    expect(owners.find((owner) => owner.id.startsWith(`history:${tab.id}:`))?.hashes).toEqual([
      hash,
    ]);

    // So when the other tab is gone with its record, the recording is still there.
    await other.close();
    localStorage.removeItem(`mfe.autosave.${other.id}`);
    await ageOwners(PAST_GRACE);
    await tab.collection.collectMedia();
    expect(await stored(tab, hash)).toBe(true);
  });
});

describe('what the collection never touches', () => {
  it('leaves alone the pages that are open, their saves and their imports', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    const lease = await tab.media.pinProjectMedia(
      { audioAssets: [{ contentHash: hash }], formulas: [] } as never,
      tab.media.mediaOwnerId('save'),
    );
    const unpublished = await tab.media.mediaRepository.storeOriginal(new Blob(['importing']), {
      ownerId: tab.media.mediaOwnerId('import'),
    });
    await tab.startNew('Replaced while saving');

    const other = await open(new Map());
    await ageOwners(DAY * 30);
    expect((await other.collection.collectMedia()).released).toEqual([]);
    expect(await stored(other, hash)).toBe(true);
    expect(await stored(other, unpublished.contentHash)).toBe(true);
    await lease.release();
  });

  it('leaves alone the owner named by the backup of an unreadable record', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    await tab.close();
    const record = JSON.parse(recordOf(tab.id)!) as { v: number; mediaOwner: string };
    // A record of a later version of the app, set aside by a page that could not read it.
    localStorage.removeItem(`mfe.autosave.${tab.id}`);
    localStorage.setItem('mfe.autosave.unreadable', JSON.stringify({ ...record, v: 99 }));

    const other = await open(new Map());
    await ageOwners(DAY * 30);
    expect((await other.collection.collectMedia()).released).toEqual([]);
    expect(await stored(other, hash)).toBe(true);
  });

  it('judges nobody when the page cannot see its own alive mark', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    await tab.startNew('Nothing here');
    await tab.crash();
    localStorage.removeItem(`mfe.autosave.${tab.id}`);
    localStorage.removeItem(`mfe.alive.${tab.id}`);

    const other = await open(new Map());
    await ageOwners(PAST_GRACE);
    // Storage that does not keep what this page writes says nothing about the other pages.
    localStorage.removeItem(`mfe.alive.${other.id}`);
    expect(await other.collection.collectMedia()).toEqual({ released: [], removed: 0, bytes: 0 });
    expect(await stored(other, hash)).toBe(true);
  });
});

describe('owners written by the version before this one', () => {
  it('are left alone for a week, whatever the alive marks say: their page may be open', async () => {
    const tab = await open();
    // An open tab of the earlier version: its owners carry a page name of its own, which no
    // alive mark speaks for. A recording that only its undo history holds:
    const undoable = await tab.media.mediaRepository.storeOriginal(new Blob(['undo only']), {
      ownerId: 'history:mh2k3j9a-4fzyo82mvyr:1',
    });
    await ageOwners(DAY);
    expect((await tab.collection.collectMedia()).released).toEqual([]);
    expect(await stored(tab, undoable.contentHash)).toBe(true);
    await ageOwners(7 * DAY);
    expect((await tab.collection.collectMedia()).released).toEqual([
      'history:mh2k3j9a-4fzyo82mvyr:1',
    ]);
    expect(await stored(tab, undoable.contentHash)).toBe(false);
  });
});

describe('when the collection runs', () => {
  it('runs after startup and again after the autosave pruned a record', async () => {
    const tab = await open();
    const hash = await tab.importSound('narration');
    await tab.close();
    // A week-old record: the File menu's listing ends it.
    const record = JSON.parse(recordOf(tab.id)!) as { savedAt: number };
    localStorage.setItem(
      `mfe.autosave.${tab.id}`,
      JSON.stringify({ ...record, savedAt: Date.now() - 8 * DAY }),
    );
    await ageOwners(8 * DAY);

    const other = await open(new Map());
    const stop = other.collection.startMediaCollection(1);
    try {
      // Startup pruned it already (the listing runs when no record is this tab's).
      expect(recordOf(tab.id)).toBeNull();
      await vi.waitFor(async () => expect(await stored(other, hash)).toBe(false));

      // Later, another old record appears and the menu is opened.
      const later = await other.media.mediaRepository.storeOriginal(new Blob(['old work']), {
        ownerId: 'recovery:mfe.autosave.s_oldrecrd:0',
      });
      localStorage.setItem(
        'mfe.autosave.s_oldrecrd',
        JSON.stringify({
          v: 4,
          mediaOwner: 'recovery:mfe.autosave.s_oldrecrd:0',
          savedAt: Date.now() - 8 * DAY,
          name: 'Old work',
          text: '{}',
        }),
      );
      await ageOwners(PAST_GRACE);
      await other.collection.collectMedia();
      expect(await stored(other, later.contentHash)).toBe(true);
      expect(other.autosave.recoverableAutosaves()).toEqual([]);
      await vi.waitFor(async () => expect(await stored(other, later.contentHash)).toBe(false));
    } finally {
      stop();
    }
  });
});
