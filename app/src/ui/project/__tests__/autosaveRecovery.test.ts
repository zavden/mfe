import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface PrivateDom {
  window: { localStorage: Storage; close(): void };
}

// jsdom is a test dependency without bundled declarations. Keep the boundary structural;
// production code and the dependency inventory need no test-only type package.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string; storageQuota: number }) => PrivateDom;
};

let autosave: typeof import('../autosave');
let model: typeof import('../../../model');
let store: typeof import('../../../store');
let documents: typeof import('../documentStore');
let notices: typeof import('../noticeStore');
const stops: (() => void)[] = [];
const windows: PrivateDom[] = [];

function freshApp() {
  store.loadProject(model.createEmptyProject());
  documents.useDocumentStore.getState().beginDocument(store.useProjectStore.getState().project, {
    fileName: null,
    handle: null,
  });
}

function rawRecord(name = 'Recovered unsaved project') {
  return JSON.stringify({
    v: 3,
    savedAt: Date.now(),
    name,
    fileName: null,
    dirty: true,
    documentId: 'd_recovery',
    text: model.serializeProject(model.createEmptyProject(name)),
  });
}

/** Native Storage enforces the quota; only the storage getter selects this private instance. */
function quotaStorage(key: string, raw: string, extraCapacity = 0) {
  const bounded = new JSDOM('', {
    url: 'http://autosave-test.invalid',
    storageQuota:
      key.length + raw.length + Math.min(300, Math.floor(raw.length / 2)) + extraCapacity,
  });
  windows.push(bounded);
  const storage = bounded.window.localStorage;
  storage.setItem(key, raw);
  if (extraCapacity === 0) expect(() => storage.setItem('second-copy', raw)).toThrow();
  const getter = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);
  return { storage, getter };
}

/** Read/delete operations stay native; this models a browser that denies only writes. */
function deniedStorage(key: string, raw: string) {
  const { storage, getter } = quotaStorage(key, raw, raw.length * 20);
  getter.mockReturnValue(
    new Proxy(storage, {
      get(target, property) {
        if (property === 'setItem')
          return () => {
            throw new DOMException('blocked', 'SecurityError');
          };
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  );
  return { storage, allowWrites: () => getter.mockReturnValue(storage) };
}

async function startServicesLikeApp() {
  const { createMockEngine } = await import('../../../test/mockEngine');
  // Startup restores before these services subscribe. Empty projects need no amendments.
  stops.push(store.startRenderSync(createMockEngine()));
  stops.push(store.startAttachSync());
  stops.push(documents.startDocumentTracking());
  stops.push(autosave.startAutosave());
}

function stopServices() {
  while (stops.length) stops.pop()!();
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ now: new Date('2026-11-07T12:00:00Z') });
  window.localStorage.clear();
  window.sessionStorage.clear();
  autosave = await import('../autosave');
  model = await import('../../../model');
  store = await import('../../../store');
  documents = await import('../documentStore');
  notices = await import('../noticeStore');
  freshApp();
  notices.useNoticeStore.getState().clear();
});

afterEach(() => {
  stopServices();
  vi.restoreAllMocks();
  for (const bounded of windows.splice(0)) bounded.window.close();
  vi.useRealTimers();
});

describe.each(['quota', 'write denied'] as const)('durable recovery with %s', (failure) => {
  const failedStorage = (key: string, raw: string) =>
    failure === 'quota' ? quotaStorage(key, raw).storage : deniedStorage(key, raw).storage;

  it('keeps the source through settled services, close and reload when takeover cannot copy', async () => {
    const key = autosave.AUTOSAVE_PREFIX + 'closed-tab';
    const raw = rawRecord();
    const storage = failedStorage(key, raw);
    if (failure === 'quota') expect(() => storage.setItem('second-copy', raw)).toThrow();

    expect(autosave.restoreAutosave()).toBe(true);
    expect(store.useProjectStore.getState().project.meta.name).toBe('Recovered unsaved project');
    expect(storage.getItem(key)).toBe(raw);
    expect(autosave.autosaveStatus()).toBe('blocked');
    expect(notices.useNoticeStore.getState().notices).toContainEqual(
      expect.objectContaining({
        title: 'No autosave in this browser',
      }),
    );

    await startServicesLikeApp();
    await vi.advanceTimersByTimeAsync(90_000);
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
    stopServices();
    expect(storage.getItem(key)).toBe(raw);
    freshApp();
    expect(autosave.restoreAutosave()).toBe(true);
    expect(store.useProjectStore.getState().project.meta.name).toBe('Recovered unsaved project');
    expect(storage.getItem(key)).toBe(raw);
  });

  it('restores legacy bytes in place if migration cannot copy them', () => {
    const key = autosave.LEGACY_AUTOSAVE_KEY;
    const raw = rawRecord('Legacy unsaved project');
    const storage = failedStorage(key, raw);
    expect(autosave.restoreAutosave()).toBe(true);
    expect(store.useProjectStore.getState().project.meta.name).toBe('Legacy unsaved project');
    expect(storage.getItem(key)).toBe(raw);
    expect(autosave.autosaveStatus()).toBe('blocked');
  });

  it('keeps unreadable bytes even after an edit when the backup cannot be written', async () => {
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    const raw = JSON.stringify({ v: 3, savedAt: Date.now(), text: '{"version":99}' });
    const storage = failedStorage(key, raw);
    expect(autosave.restoreAutosave()).toBe(false);
    expect(storage.getItem(key)).toBe(raw);
    expect(storage.getItem(`${autosave.AUTOSAVE_BACKUP_KEY}.${autosave.sessionId()}`)).toBeNull();
    expect(autosave.autosaveStatus()).toBe('blocked');
    expect(notices.useNoticeStore.getState().notices).toContainEqual(
      expect.objectContaining({
        title: 'Could not restore the autosaved project',
        action: { label: 'Download it', run: expect.any(Function) },
      }),
    );
    await startServicesLikeApp();
    store.useProjectStore.getState().update((draft) => {
      draft.meta.name = 'New work';
    });
    await vi.advanceTimersByTimeAsync(90_000);
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(key)).toBe(raw);
  });
});

it('retries a failed takeover without an edit, copying before removing the source', async () => {
  const key = autosave.AUTOSAVE_PREFIX + 'closed-tab';
  const raw = rawRecord();
  const { storage } = quotaStorage(key, raw, raw.length * 2);
  storage.setItem('filler', '.'.repeat(raw.length * 2));
  expect(autosave.restoreAutosave()).toBe(true);
  expect(storage.getItem(key)).toBe(raw);
  await startServicesLikeApp();
  storage.removeItem('filler');
  await vi.advanceTimersByTimeAsync(autosave.ALIVE_INTERVAL_MS + autosave.AUTOSAVE_DELAY_MS);
  const own = storage.getItem(autosave.AUTOSAVE_PREFIX + autosave.sessionId());
  expect(own).not.toBeNull();
  expect(JSON.parse(own!).text).toBe(JSON.parse(raw).text);
  expect(storage.getItem(key)).toBeNull();
  expect(autosave.autosaveStatus()).toBe('ok');
});

it('protects a failed recovery source from age and count pruning until a retry succeeds', async () => {
  const key = autosave.AUTOSAVE_PREFIX + 'closed-tab';
  const raw = rawRecord();
  const { storage, allowWrites } = deniedStorage(key, raw);
  expect(autosave.restoreAutosave()).toBe(true);
  await startServicesLikeApp();
  vi.setSystemTime(Date.now() + autosave.KEEP_RECOVERABLE_MS + 1);
  for (let i = 0; i < autosave.MAX_RECOVERABLE + 1; i++) {
    storage.setItem(autosave.AUTOSAVE_PREFIX + `other${i}`, rawRecord(`Other ${i}`));
  }
  autosave.recoverableAutosaves();
  expect(storage.getItem(key)).toBe(raw);
  allowWrites();
  await vi.advanceTimersByTimeAsync(autosave.ALIVE_INTERVAL_MS);
  expect(storage.getItem(autosave.AUTOSAVE_PREFIX + autosave.sessionId())).not.toBeNull();
  expect(storage.getItem(key)).toBeNull();
  expect(autosave.autosaveStatus()).toBe('ok');
});

it('retries an unreadable backup before writing new work over its original slot', async () => {
  const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
  const raw = JSON.stringify({ v: 3, savedAt: Date.now(), text: '{"version":99}' });
  const { storage, allowWrites } = deniedStorage(key, raw);
  expect(autosave.restoreAutosave()).toBe(false);
  await startServicesLikeApp();
  store.useProjectStore.getState().update((draft) => {
    draft.meta.name = 'New work';
  });
  await vi.advanceTimersByTimeAsync(autosave.AUTOSAVE_DELAY_MS);
  expect(storage.getItem(key)).toBe(raw);
  allowWrites();
  await vi.advanceTimersByTimeAsync(autosave.ALIVE_INTERVAL_MS);
  expect(
    storage.getItem(
      `${autosave.AUTOSAVE_BACKUP_KEY}.${key.slice(autosave.AUTOSAVE_PREFIX.length)}`,
    ),
  ).toBe(raw);
  expect(JSON.parse(storage.getItem(autosave.AUTOSAVE_PREFIX + autosave.sessionId())!).name).toBe(
    'New work',
  );
});

it('keeps one independent writer when inherited session storage can be read but not written', () => {
  window.sessionStorage.setItem(autosave.SESSION_KEY, 'inherited-owner');
  const session = window.sessionStorage;
  vi.spyOn(window, 'sessionStorage', 'get').mockReturnValue(
    new Proxy(session, {
      get(target, property) {
        if (property === 'setItem')
          return () => {
            throw new DOMException('blocked', 'SecurityError');
          };
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  );
  const writer = autosave.sessionId();
  expect(writer).not.toBe('inherited-owner');
  expect(autosave.sessionId()).toBe(writer);
  stops.push(autosave.startAutosave());
  store.useProjectStore.getState().update((draft) => {
    draft.meta.name = 'Independent work';
  });
  vi.advanceTimersByTime(autosave.AUTOSAVE_DELAY_MS);
  expect(window.localStorage.getItem(autosave.AUTOSAVE_PREFIX + writer)).not.toBeNull();
  expect(window.localStorage.getItem(autosave.AUTOSAVE_PREFIX + 'inherited-owner')).toBeNull();
});

it('recreates its own durable record when a cached page resumes after its recovery was taken', async () => {
  await startServicesLikeApp();
  store.useProjectStore.getState().update((draft) => {
    draft.meta.name = 'Cached work';
  });
  vi.advanceTimersByTime(autosave.AUTOSAVE_DELAY_MS);
  const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
  const raw = window.localStorage.getItem(key)!;
  window.dispatchEvent(new Event('pagehide'));
  // A different writer durably recovered this record while the page was in the cache.
  window.localStorage.setItem(autosave.AUTOSAVE_PREFIX + 'other-page', raw);
  window.localStorage.removeItem(key);
  window.dispatchEvent(new Event('pageshow'));
  expect(JSON.parse(window.localStorage.getItem(key)!).name).toBe('Cached work');
});
