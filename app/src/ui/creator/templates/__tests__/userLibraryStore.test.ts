// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { planImport, readLibrary, serializeLibrary, type TemplateFields } from '../userLibrary';
import {
  createTemplateLibraryStore,
  TEMPLATES_DAMAGED_KEY,
  TEMPLATES_STORAGE_KEY,
} from '../userLibraryStore';

const fields = (name: string, latex = '#1+#2'): TemplateFields => ({
  name,
  category: 'Mine',
  description: '',
  latex,
  placeholders: [
    { n: 1, value: 'a' },
    { n: 2, value: 'b' },
  ],
  packages: [],
});

/** A browser's storage, which can be made to refuse reads or writes. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const state = { readable: true, writable: true, writes: 0 };
  return {
    items,
    state,
    readItem: (key: string) =>
      state.readable
        ? ({ ok: true, value: items.get(key) ?? null } as const)
        : ({ ok: false } as const),
    setItem: (key: string, value: string) => {
      if (!state.writable) return false;
      items.set(key, value);
      state.writes += 1;
      return true;
    },
  };
}

function tab(storage: ReturnType<typeof fakeStorage>, name = 't') {
  let ids = 0;
  let clock = 1000;
  return createTemplateLibraryStore({
    storage,
    newId: () => `${name}${++ids}`,
    now: () => (clock += 10),
    withLock: (run) => run(),
  });
}

const stored = (storage: ReturnType<typeof fakeStorage>) => {
  const read = readLibrary(storage.items.get(TEMPLATES_STORAGE_KEY) ?? '');
  if (!read.ok) throw new Error(read.message);
  return read.library;
};
const names = (library: { templates: { name: string }[] }) => library.templates.map((t) => t.name);

describe('the template library of a browser', () => {
  it('starts empty and writes every change at once', async () => {
    const storage = fakeStorage();
    const store = tab(storage);
    expect(store.getState().library).toEqual({ templates: [], favorites: [] });
    const id = await store.getState().createTemplate(fields('Sum'));
    expect(id).toBe('t1');
    expect(names(stored(storage))).toEqual(['Sum']);
    await store.getState().updateTemplate(id, fields('Sum of two'));
    await store.getState().setFavorite(id, true);
    await store.getState().setFavorite('algebra-square-of-a-sum', true);
    const copy = await store.getState().duplicateTemplate(id);
    expect(stored(storage)).toEqual(store.getState().library);
    expect(names(stored(storage))).toEqual(['Sum of two', 'Sum of two copy']);
    expect(stored(storage).favorites).toEqual([id, 'algebra-square-of-a-sum']);
    expect(stored(storage).templates[0]!.modified).toBeGreaterThan(1010);
    await store.getState().removeTemplates([id]);
    expect(names(stored(storage))).toEqual(['Sum of two copy']);
    expect(stored(storage).templates[0]!.id).toBe(copy);
    expect(stored(storage).favorites).toEqual(['algebra-square-of-a-sum']);
    expect(store.getState()).toMatchObject({ unsaved: false, warnings: [] });
  });

  it('reads what was stored before', () => {
    const storage = fakeStorage();
    const first = tab(storage);
    return first
      .getState()
      .createTemplate(fields('Kept'))
      .then(() => expect(names(tab(storage).getState().library)).toEqual(['Kept']));
  });

  it('refuses a change that cannot be made, and writes nothing', async () => {
    const storage = fakeStorage();
    const store = tab(storage);
    await expect(store.getState().createTemplate(fields('Bad', '#1+#5'))).rejects.toThrow(
      '#5 is in the LaTeX and has no value.',
    );
    await expect(store.getState().updateTemplate('gone', fields('X'))).rejects.toThrow(
      /no longer in the library/,
    );
    await expect(store.getState().duplicateTemplate('gone')).rejects.toThrow(/no longer/);
    expect(storage.state.writes).toBe(0);
    // The queue goes on after a refusal.
    await store.getState().createTemplate(fields('Good'));
    expect(names(stored(storage))).toEqual(['Good']);
  });

  it('makes each change on what the storage holds, so two tabs do not undo each other', async () => {
    const storage = fakeStorage();
    const one = tab(storage, 'a');
    const two = tab(storage, 'b');
    await one.getState().createTemplate(fields('From one'));
    await two.getState().createTemplate(fields('From two'));
    expect(names(stored(storage))).toEqual(['From one', 'From two']);
    expect(names(one.getState().library)).toEqual(['From one']);
    one.getState().refresh();
    expect(names(one.getState().library)).toEqual(['From one', 'From two']);
  });

  it('keeps a change the storage did not take, says so, and writes it with the next', async () => {
    const storage = fakeStorage();
    const store = tab(storage);
    storage.state.writable = false;
    await store.getState().createTemplate(fields('Unsaved'));
    expect(store.getState().unsaved).toBe(true);
    expect(store.getState().warnings[0]).toMatch(/could not be saved/);
    expect(storage.items.has(TEMPLATES_STORAGE_KEY)).toBe(false);
    // Another tab's write is not read over what this tab holds.
    store.getState().refresh();
    expect(names(store.getState().library)).toEqual(['Unsaved']);
    storage.state.writable = true;
    await store.getState().createTemplate(fields('Second'));
    expect(names(stored(storage))).toEqual(['Unsaved', 'Second']);
    expect(store.getState()).toMatchObject({ unsaved: false, warnings: [] });
  });

  it('works in the tab alone when the storage cannot be read', async () => {
    const storage = fakeStorage();
    storage.state.readable = false;
    const store = tab(storage);
    expect(store.getState().warnings[0]).toMatch(/does not let the editor keep templates/);
    await store.getState().createTemplate(fields('In memory'));
    expect(names(store.getState().library)).toEqual(['In memory']);
    expect(store.getState().unsaved).toBe(true);
    expect(storage.state.writes).toBe(0);
  });

  it('sets a library it cannot read aside, and starts empty', async () => {
    const storage = fakeStorage({ [TEMPLATES_STORAGE_KEY]: '{"broken' });
    const store = tab(storage);
    expect(store.getState().library.templates).toEqual([]);
    expect(store.getState().warnings[0]).toMatch(/were set aside/);
    expect(storage.items.get(TEMPLATES_DAMAGED_KEY)).toBe('{"broken');
    await store.getState().createTemplate(fields('Fresh'));
    expect(names(stored(storage))).toEqual(['Fresh']);
    expect(storage.items.get(TEMPLATES_DAMAGED_KEY)).toBe('{"broken');
    // Said until the storage is read again and found well.
    expect(store.getState().warnings[0]).toMatch(/were set aside/);
    store.getState().refresh();
    expect(store.getState().warnings).toEqual([]);
    expect(names(store.getState().library)).toEqual(['Fresh']);
  });

  it('leaves a library of a later version alone', async () => {
    const newer = '{"format":"mfe-templates","version":2,"templates":[],"favorites":[]}';
    const storage = fakeStorage({ [TEMPLATES_STORAGE_KEY]: newer });
    const store = tab(storage);
    expect(store.getState().warnings[0]).toMatch(/newer version/);
    await store.getState().createTemplate(fields('Tab only'));
    expect(storage.items.get(TEMPLATES_STORAGE_KEY)).toBe(newer);
    expect(storage.items.has(TEMPLATES_DAMAGED_KEY)).toBe(false);
    expect(store.getState()).toMatchObject({ unsaved: true });
    expect(names(store.getState().library)).toEqual(['Tab only']);
  });

  it('writes without a lock where the browser gives none', async () => {
    const storage = fakeStorage();
    const refused = createTemplateLibraryStore({
      storage,
      newId: () => 'x',
      now: () => 1,
      withLock: () => Promise.reject(new DOMException('no locks here', 'SecurityError')),
    });
    await refused.getState().createTemplate(fields('No lock'));
    const none = createTemplateLibraryStore({
      storage,
      newId: () => 'y',
      now: () => 2,
      withLock: null,
    });
    await none.getState().createTemplate(fields('None'));
    expect(names(stored(storage))).toEqual(['No lock', 'None']);
  });

  it('imports a file as planned and takes in another copy of the library', async () => {
    const storage = fakeStorage();
    const store = tab(storage);
    const id = await store.getState().createTemplate(fields('Mine'));
    const other = tab(fakeStorage(), 'o');
    await other.getState().createTemplate(fields('Theirs'));
    const file = readLibrary(serializeLibrary(other.getState().library));
    if (!file.ok) throw new Error('unreadable');
    await store
      .getState()
      .importLibrary(planImport(store.getState().library, file.library), 'skip');
    expect(names(stored(storage))).toEqual(['Mine', 'Theirs']);

    // The folder's copy has a newer "Mine" and a star.
    const folder = structuredClone(store.getState().library);
    folder.templates[0] = {
      ...folder.templates[0]!,
      name: 'Mine, edited elsewhere',
      modified: 9e9,
    };
    folder.favorites = [id];
    await store.getState().mergeLibrary(folder);
    expect(names(stored(storage))).toEqual(['Mine, edited elsewhere', 'Theirs']);
    expect(stored(storage).favorites).toEqual([id]);
  });
});
