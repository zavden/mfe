/* Autosaves this version cannot read (a newer version's, or damaged ones): each is copied out of
 * its record before the record goes, so that the next autosave does not overwrite what is still
 * somebody's work. Each to a key of its own: with one key for them all, the copy of a second one
 * went over the first (audit A7-03). Every page load is a fresh module graph, as in
 * autosave.test.ts. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function pageLoad() {
  vi.resetModules();
  window.sessionStorage.clear();
  const autosave = await import('../autosave');
  const model = await import('../../../model');
  const store = await import('../../../store');
  const documents = await import('../documentStore');
  store.loadProject(model.createEmptyProject());
  documents.useDocumentStore.getState().markClean(store.useProjectStore.getState().project, {
    fileName: null,
    handle: null,
  });
  return autosave;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-16T22:00:00Z') });
  Object.defineProperty(performance, 'getEntriesByType', {
    configurable: true,
    value: (type: string) => (type === 'navigation' ? [{ type: 'navigate' }] : []),
  });
  window.localStorage.clear();
});
afterEach(() => {
  delete (performance as { getEntriesByType?: unknown }).getEntriesByType;
  vi.useRealTimers();
});

/** The record of a tab that closed in order (no alive mark), written by a newer version. */
function newerRecord(name: string, minutesAgo: number): string {
  const text = JSON.stringify({ format: 'manim-formula-editor', version: 99, meta: { name } });
  return JSON.stringify({
    v: 1,
    savedAt: Date.now() - minutesAgo * 60_000,
    name,
    fileName: `${name}.mfe.json`,
    dirty: true,
    text,
  });
}

const stored = () =>
  Object.keys(window.localStorage)
    .sort()
    .map((key) => [key, window.localStorage.getItem(key)] as const);
const copies = () => stored().filter(([key]) => key.startsWith('mfe.autosave.unreadable'));

describe('autosaves this version cannot read', () => {
  it('are each kept under a key of their own, their records gone', async () => {
    const first = newerRecord('first', 2);
    const second = newerRecord('second', 1);
    window.localStorage.setItem('mfe.autosave.s_aaaaaaaa', first);
    window.localStorage.setItem('mfe.autosave.s_bbbbbbbb', second);

    // A new tab takes the newest record of a closed tab, cannot read it and keeps a copy.
    expect((await pageLoad()).restoreAutosave()).toBe(false);
    expect(copies()).toEqual([['mfe.autosave.unreadable.s_bbbbbbbb', second]]);
    // The next new tab takes the other one: its copy does not go over the first.
    expect((await pageLoad()).restoreAutosave()).toBe(false);
    expect(copies()).toEqual([
      ['mfe.autosave.unreadable.s_aaaaaaaa', first],
      ['mfe.autosave.unreadable.s_bbbbbbbb', second],
    ]);
    expect(window.localStorage.getItem('mfe.autosave.s_aaaaaaaa')).toBeNull();
    expect(window.localStorage.getItem('mfe.autosave.s_bbbbbbbb')).toBeNull();
  });

  it('are not taken for records of tabs: nothing lists them to recover, nothing prunes them', async () => {
    window.localStorage.setItem('mfe.autosave.s_aaaaaaaa', newerRecord('first', 2));
    const autosave = await pageLoad();
    expect(autosave.restoreAutosave()).toBe(false);
    expect(copies()).toHaveLength(1);
    expect(autosave.recoverableAutosaves()).toEqual([]);
    // A copy an earlier version made, under the one key they all shared, stays where it is.
    window.localStorage.setItem('mfe.autosave.unreadable', 'an older copy');
    expect((await pageLoad()).recoverableAutosaves()).toEqual([]);
    expect(window.localStorage.getItem('mfe.autosave.unreadable')).toBe('an older copy');
  });

  it('are five at most: a sixth takes the place of the oldest', async () => {
    const { MAX_UNREADABLE } = await pageLoad();
    expect(MAX_UNREADABLE).toBe(5);
    const records = Array.from({ length: 6 }, (_, i) => newerRecord(`n${i}`, 60 - i));
    for (const [i, record] of records.entries()) {
      window.localStorage.setItem(`mfe.autosave.s_0000000${i}`, record);
      expect((await pageLoad()).restoreAutosave()).toBe(false);
    }
    // The first was the oldest (saved an hour ago): it is the one that went.
    expect(copies().map(([key]) => key)).toEqual(
      [1, 2, 3, 4, 5].map((i) => `mfe.autosave.unreadable.s_0000000${i}`),
    );
    expect(copies().map(([, value]) => value)).toEqual(records.slice(1));
  });
});
