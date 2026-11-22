// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizePalette, PALETTE_ROLES } from '../palette';
import {
  applyPaletteOperations,
  emptyPaletteLibrary,
  PALETTE_LIBRARY_LIMIT,
  readPaletteLibrary,
  replayPaletteOperations,
  type PaletteOperation,
} from '../paletteLibrary';
import { DEFAULT_PALETTE_COLORS } from '../paletteEdit';
import { createPaletteStore, PALETTE_STORAGE_KEY } from '../paletteStore';

const source = (name = 'Example') =>
  normalizePalette({
    format: 'manim-palette',
    version: 1,
    name,
    colors: Object.fromEntries(PALETTE_ROLES.map((role) => [role, '#123456'])),
  }).palette;

function environment() {
  let raw: string | null = null;
  let writable = true;
  let readable = true;
  let writes = 0;
  let id = 0;
  let tail = Promise.resolve();
  const storage = {
    readItem: () => (readable ? { ok: true as const, value: raw } : { ok: false as const }),
    setItem: (_key: string, text: string) => {
      writes++;
      if (!writable) return false;
      raw = text;
      return true;
    },
  };
  const deps = {
    storage,
    newId: () => `palette_${++id}`,
    withLock: (run: () => Promise<void>) => {
      const next = tail.then(run);
      tail = next.catch(() => {});
      return next;
    },
  };
  return {
    deps,
    setRaw: (value: string) => {
      raw = value;
    },
    raw: () => raw,
    writes: () => writes,
    writable: (value: boolean) => {
      writable = value;
    },
    readable: (value: boolean) => {
      readable = value;
    },
  };
}

describe('palette preference transactions', () => {
  it('preserves identity across rename/export and only activates explicitly', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    const id = await store.getState().importPalette(source());
    expect(store.getState().library.activePaletteId).toBeNull();
    await store.getState().rename(id, 'My name');
    await store.getState().activate(id);
    expect(store.getState().library.palettes[0]).toMatchObject({
      id,
      displayName: 'My name',
      source: { name: 'Example' },
    });
    expect(await store.getState().importPalette(source())).toBe(id);
    expect(store.getState().library.palettes).toHaveLength(1);
    const reloaded = createPaletteStore(env.deps);
    expect(reloaded.getState().library).toEqual(store.getState().library);
    await reloaded.getState().remove(id);
    expect(reloaded.getState().library.activePaletteId).toBeNull();
  });

  it('serializes concurrent tab imports and refreshes the current library without lost entries', async () => {
    const env = environment();
    const a = createPaletteStore(env.deps);
    const b = createPaletteStore(env.deps);
    const [idA, idB] = await Promise.all([
      a.getState().importPalette(source('A')),
      b.getState().importPalette(source('B')),
    ]);
    a.getState().refresh();
    expect(a.getState().library.palettes.map((p) => p.id)).toEqual([idA, idB]);
    await Promise.all([a.getState().rename(idA, 'Renamed A'), b.getState().activate(idB)]);
    a.getState().refresh();
    expect(a.getState().library.palettes[0]?.displayName).toBe('Renamed A');
    expect(a.getState().library.activePaletteId).toBe(idB);
    const [one, two] = await Promise.all([
      a.getState().importPalette(source('Same')),
      b.getState().importPalette(source('Same')),
    ]);
    expect(one).toBe(two);
    expect(JSON.parse(env.raw()!).palettes).toHaveLength(3);
  });

  it('replays unsaved ID-based intents over another tab, including deduplicated imports', async () => {
    const env = environment();
    const a = createPaletteStore(env.deps);
    env.writable(false);
    const local = await a.getState().importPalette(source());
    await a.getState().rename(local, 'Unsaved name');
    await a.getState().activate(local);
    expect(a.getState().unsaved).toBe(true);
    env.writable(true);
    const b = createPaletteStore(env.deps);
    const durable = await b.getState().importPalette(source());
    await b.getState().importPalette(source('Other tab'));
    a.getState().refresh();
    expect(a.getState().library.activePaletteId).toBe(local);
    await a.getState().retrySave();
    expect(a.getState().unsaved).toBe(false);
    expect(a.getState().library.activePaletteId).toBe(durable);
    expect(a.getState().library.palettes).toHaveLength(2);
    expect(a.getState().library.palettes[0]?.displayName).toBe('Unsaved name');
  });

  it('keeps denied reads and absent or rejected browser coordination in memory', async () => {
    const env = environment();
    env.readable(false);
    const denied = createPaletteStore(env.deps);
    await denied.getState().importPalette(source());
    expect(env.writes()).toBe(0);
    expect(denied.getState().unsaved).toBe(true);
    env.readable(true);
    await denied.getState().retrySave();
    expect(denied.getState().unsaved).toBe(false);
    const writes = env.writes();
    for (const withLock of [
      null,
      async () => {
        throw new Error('Denied lock');
      },
    ]) {
      const memory = createPaletteStore({ ...env.deps, withLock });
      await memory.getState().importPalette(source('Session only'));
      expect(memory.getState().unsaved).toBe(true);
      expect(memory.getState().library.palettes).toHaveLength(2);
    }
    expect(env.writes()).toBe(writes);
  });

  it('protects an unknown library version from overwriting while allowing session use', async () => {
    const env = environment();
    const future = JSON.stringify({ version: 99, palettes: ['future data'] });
    env.setRaw(future);
    const store = createPaletteStore(env.deps);
    await store.getState().importPalette(source());
    await store.getState().retrySave();
    expect(store.getState().library.palettes).toHaveLength(1);
    expect(store.getState().unsaved).toBe(true);
    expect(env.raw()).toBe(future);
    expect(env.writes()).toBe(0);
  });

  it('drops a waiting change that no longer applies, says so, and goes on saving', async () => {
    const env = environment();
    const a = createPaletteStore(env.deps);
    const kept = await a.getState().importPalette(source('Kept'));
    const doomed = await a.getState().importPalette(source('Doomed'));
    env.writable(false);
    await a.getState().activate(doomed);
    await a.getState().rename(kept, 'Kept, renamed');
    expect(a.getState().unsaved).toBe(true);
    env.writable(true);
    // Elsewhere the palette is deleted: activating it can never be replayed again.
    const b = createPaletteStore(env.deps);
    await b.getState().remove(doomed);

    // The next change is not held hostage by it…
    const fresh = await a.getState().importPalette(source('Fresh'));
    expect(a.getState().unsaved).toBe(false);
    expect(a.getState().library.palettes.map((entry) => entry.displayName)).toEqual([
      'Kept, renamed',
      'Fresh',
    ]);
    expect(a.getState().library.activePaletteId).toBeNull();
    expect(a.getState().warnings).toEqual([
      'Activating a palette could not be kept: This palette was removed in another tab.',
    ]);
    expect(JSON.parse(env.raw()!).palettes.map((entry: { id: string }) => entry.id)).toEqual([
      kept,
      fresh,
    ]);
    // …and it is gone for good: the following save has nothing to report.
    await a.getState().activate(fresh);
    expect(a.getState().warnings).toEqual([]);
    expect(a.getState().library.activePaletteId).toBe(fresh);
  });

  it('Retry saving gets through a waiting change that can no longer apply', async () => {
    const env = environment();
    const a = createPaletteStore(env.deps);
    const doomed = await a.getState().importPalette(source('Doomed'));
    env.writable(false);
    await a.getState().rename(doomed, 'Renamed');
    env.writable(true);
    await createPaletteStore(env.deps).getState().remove(doomed);
    await a.getState().retrySave();
    expect(a.getState().unsaved).toBe(false);
    expect(a.getState().library.palettes).toEqual([]);
    expect(a.getState().warnings).toEqual([
      'Renaming a palette to “Renamed” could not be kept: This palette was removed in another tab.',
    ]);
    // A clean tab that looks again shows the library as it is, without the notice.
    a.getState().refresh();
    expect(a.getState().warnings).toEqual([]);
  });

  it('saves what was waiting even when the new change is refused', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    const id = await store.getState().importPalette(source());
    env.writable(false);
    await store.getState().rename(id, 'Waiting');
    env.writable(true);
    await expect(store.getState().rename(id, '   ')).rejects.toThrow('1 to 120');
    expect(store.getState().unsaved).toBe(false);
    expect(JSON.parse(env.raw()!).palettes[0].displayName).toBe('Waiting');
  });

  it('offers to reset a stored library that cannot be read, keeping the palettes of the tab', async () => {
    const env = environment();
    env.setRaw('{"version":1,"palettes":[');
    const store = createPaletteStore(env.deps);
    expect(store.getState().damaged).toBe(true);
    expect(store.getState().unsaved).toBe(true);
    expect(store.getState().warnings).toEqual([
      'The palette library saved in this browser cannot be read: its data is damaged. Reset library replaces it with the palettes of this tab.',
    ]);
    const id = await store.getState().importPalette(source('This tab'));
    await store.getState().retrySave();
    // Retrying never writes over what it could not read.
    expect(env.writes()).toBe(0);
    expect(store.getState().damaged).toBe(true);

    await store.getState().resetLibrary();
    expect(store.getState()).toMatchObject({ damaged: false, unsaved: false, warnings: [] });
    expect(JSON.parse(env.raw()!)).toEqual({
      version: 1,
      activePaletteId: null,
      palettes: [{ id, displayName: 'This tab', source: source('This tab') }],
    });
    expect(createPaletteStore(env.deps).getState()).toMatchObject({
      damaged: false,
      unsaved: false,
      library: store.getState().library,
    });
  });

  it.each([
    ['not JSON at all', 'palettes!'],
    ['JSON that is not a library', '[1, 2]'],
    ['a version 1 without its list', '{"version":1}'],
    ['no version', '{"palettes":[]}'],
  ])('calls %s damaged', (_name, raw) => {
    const env = environment();
    env.setRaw(raw);
    expect(createPaletteStore(env.deps).getState().damaged).toBe(true);
  });

  it('does not offer to reset the library of a newer version, nor resets it when asked', async () => {
    const env = environment();
    const future = JSON.stringify({ version: 2, palettes: [] });
    env.setRaw(future);
    const store = createPaletteStore(env.deps);
    expect(store.getState().damaged).toBe(false);
    expect(store.getState().unsaved).toBe(true);
    expect(store.getState().warnings).toEqual([
      'The palette library saved in this browser was written by another version of the editor and is left untouched.',
    ]);
    await store.getState().resetLibrary();
    expect(env.raw()).toBe(future);
    expect(env.writes()).toBe(0);
  });

  it('resetting a library that reads well again saves like a retry', async () => {
    const env = environment();
    env.setRaw('broken');
    const store = createPaletteStore(env.deps);
    const local = await store.getState().importPalette(source('Mine'));
    // Meanwhile the stored value was repaired elsewhere, with a palette of its own.
    env.setRaw(JSON.stringify(emptyPaletteLibrary()));
    const other = await createPaletteStore(env.deps).getState().importPalette(source('Theirs'));
    await store.getState().resetLibrary();
    expect(store.getState().library.palettes.map((entry) => entry.id)).toEqual([other, local]);
    expect(store.getState()).toMatchObject({ damaged: false, unsaved: false });
  });

  it('deduplicates before capacity checks and keeps a rejected operation atomic', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    for (let n = 0; n < 24; n++) await store.getState().importPalette(source(String(n)));
    const before = env.raw();
    const first = store.getState().library.palettes[0]!;
    expect(await store.getState().importPalette(first.source)).toBe(first.id);
    await expect(store.getState().importPalette(source('Overflow'))).rejects.toThrow('full');
    expect(env.raw()).toBe(before);
    expect(store.getState().library.palettes).toHaveLength(24);
    expect(PALETTE_STORAGE_KEY).toBe('mfe.palettes.v1');
  });
});

it('retains valid records, rejects duplicate IDs, and never overwrites by source name', () => {
  const entry = { id: 'one', displayName: 'Same', source: source('Same') };
  const restored = readPaletteLibrary(
    JSON.stringify({
      version: 1,
      activePaletteId: 'missing',
      palettes: [entry, { ...entry, displayName: 'Duplicate ID' }, { id: 'bad' }],
    }),
  );
  expect(restored.library.palettes).toEqual([entry]);
  expect(restored.warnings).toHaveLength(2);
  expect(restored.library.activePaletteId).toBeNull();
  const next = applyPaletteOperations(emptyPaletteLibrary(), [
    { kind: 'import', entry },
    {
      kind: 'import',
      entry: {
        ...entry,
        id: 'two',
        source: { ...entry.source, colors: { ...entry.source.colors, formula: '#ABCDEF' } },
      },
    },
  ]).library;
  expect(next.palettes.map((p) => p.displayName)).toEqual(['Same', 'Same (2)']);
});

it('drops a waiting import the library has no room for, with what was done to it', () => {
  const full = emptyPaletteLibrary();
  for (let n = 0; n < PALETTE_LIBRARY_LIMIT; n++) {
    full.palettes.push({ id: `p${n}`, displayName: `Palette ${n}`, source: source(String(n)) });
  }
  const before = structuredClone(full);
  const stillApplies: PaletteOperation = { kind: 'rename', id: 'p0', name: 'Still applies' };
  const replay = replayPaletteOperations(full, [
    { kind: 'import', entry: { id: 'late', displayName: 'Late', source: source('Late') } },
    { kind: 'rename', id: 'late', name: 'Never there' },
    { kind: 'activate', id: 'late' },
    stillApplies,
    { kind: 'activate', id: null },
  ]);
  expect(replay.dropped).toEqual([
    'Importing “Late” could not be kept: The palette library is full (24). Delete an entry before importing another.',
  ]);
  expect(replay.kept).toEqual([stillApplies, { kind: 'activate', id: null }]);
  expect(replay.library.palettes).toHaveLength(PALETTE_LIBRARY_LIMIT);
  expect(replay.library.palettes[0]!.displayName).toBe('Still applies');
  expect(replay.library.activePaletteId).toBeNull();
  expect(full).toEqual(before);
});

describe('palettes made and changed in the editor', () => {
  it('creates a palette of the editor’s own colors, saved and named apart', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    const first = await store.getState().createPalette();
    const second = await store.getState().createPalette();
    expect(second).not.toBe(first);
    expect(store.getState().library.palettes).toMatchObject([
      { id: first, displayName: 'New palette', authored: true },
      { id: second, displayName: 'New palette (2)', authored: true },
    ]);
    expect(store.getState().library.palettes[0]!.source.colors).toEqual(DEFAULT_PALETTE_COLORS);
    // What Export writes is named as the editor names it.
    expect(store.getState().library.palettes.map((entry) => entry.source.name)).toEqual([
      'New palette',
      'New palette (2)',
    ]);
    // Creating never activates, and what was saved reads back whole.
    expect(store.getState().library.activePaletteId).toBeNull();
    expect(createPaletteStore(env.deps).getState().library).toEqual(store.getState().library);
  });

  it('duplicates a palette as a second entry, which an import of the same file is not', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    const original = await store.getState().importPalette(source('Lesson'));
    const copy = await store.getState().duplicate(original);
    expect(copy).not.toBe(original);
    expect(store.getState().library.palettes).toEqual([
      { id: original, displayName: 'Lesson', source: source('Lesson') },
      { id: copy, displayName: 'Lesson copy', source: source('Lesson copy'), authored: true },
    ]);
    // The same file again is still the entry it was.
    expect(await store.getState().importPalette(source('Lesson'))).toBe(original);
    expect(await store.getState().duplicate(original)).not.toBe(copy);
    expect(store.getState().library.palettes.map((entry) => entry.displayName)).toEqual([
      'Lesson',
      'Lesson copy',
      'Lesson copy (2)',
    ]);
    await expect(store.getState().duplicate('gone')).rejects.toThrow('removed');
  });

  it('recolors one role of one palette, and marks it as the editor’s', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    const kept = await store.getState().importPalette(source('Kept'));
    const edited = await store.getState().importPalette(source('Edited'));
    await store.getState().activate(edited);
    const revision = store.getState().revision;
    await store.getState().recolor(edited, 'result', '#00ff7f');
    const [first, second] = store.getState().library.palettes;
    expect(first).toEqual({ id: kept, displayName: 'Kept', source: source('Kept') });
    expect(second).toMatchObject({ id: edited, displayName: 'Edited', authored: true });
    expect(second!.source.colors).toEqual({ ...source().colors, result: '#00FF7F' });
    expect(store.getState().library.activePaletteId).toBe(edited);
    expect(store.getState().revision).toBe(revision + 1);
    expect(createPaletteStore(env.deps).getState().library).toEqual(store.getState().library);
    // The color it already has is no change: nothing is marked, nothing republished.
    await store.getState().recolor(kept, 'result', '#123456');
    expect(store.getState().library.palettes[0]).not.toHaveProperty('authored');
    expect(store.getState().revision).toBe(revision + 1);
    await expect(store.getState().recolor(kept, 'result', 'green')).rejects.toThrow('HEX');
    await expect(store.getState().recolor('gone', 'result', '#000000')).rejects.toThrow('removed');
    expect(store.getState().library.palettes[0]).toEqual(first);
  });

  it('changes the roles the user added to one palette, saved at once, and marks it as the editor’s', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    const kept = await store.getState().importPalette(source('Kept'));
    const edited = await store.getState().importPalette(source('Edited'));
    const change = store.getState().changeCustomRole;
    await change(edited, { do: 'add', name: 'highlight', color: '#ffd400' });
    await change(edited, { do: 'add', name: 'glow', color: '#00bbff' });
    await change(edited, { do: 'rename', role: 'glow', name: 'Accent 2' });
    await change(edited, { do: 'recolor', role: 'highlight', color: '#ff0000' });
    const [first, second] = store.getState().library.palettes;
    expect(first).toEqual({ id: kept, displayName: 'Kept', source: source('Kept') });
    expect(second).toMatchObject({ id: edited, displayName: 'Edited', authored: true });
    expect(second!.source.customRoles).toEqual([
      { name: 'highlight', color: '#FF0000' },
      { name: 'Accent 2', color: '#00BBFF' },
    ]);
    expect(second!.source.colors).toEqual(source().colors);
    // What the browser holds reads back the same, roles included.
    expect(createPaletteStore(env.deps).getState().library).toEqual(store.getState().library);
    await change(edited, { do: 'delete', role: 'highlight' });
    expect(store.getState().library.palettes[1]!.source.customRoles).toEqual([
      { name: 'Accent 2', color: '#00BBFF' },
    ]);
    // A change that cannot be made is refused whole, and one that changes nothing marks nothing.
    const revision = store.getState().revision;
    await expect(change(edited, { do: 'add', name: 'accent 2', color: '#000000' })).rejects.toThrow(
      'already has a role named',
    );
    await expect(change('gone', { do: 'add', name: 'x', color: '#000000' })).rejects.toThrow(
      'removed',
    );
    await change(kept, { do: 'delete', role: 'nothing' });
    expect(store.getState().library.palettes[0]).not.toHaveProperty('authored');
    expect(store.getState().revision).toBe(revision);
  });

  it('names the source of the editor’s palettes as the editor does, and of no other', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    const kept = await store.getState().importPalette(source('From a file'));
    const edited = await store.getState().importPalette(source('Also from a file'));
    await store.getState().rename(edited, 'Renamed before');
    expect(store.getState().library.palettes[1]!.source.name).toBe('Also from a file');
    await store.getState().recolor(edited, 'text', '#000000');
    expect(store.getState().library.palettes[1]!.source.name).toBe('Renamed before');
    await store.getState().rename(edited, 'Renamed after');
    await store.getState().rename(kept, 'Shown name');
    expect(store.getState().library.palettes.map((entry) => entry.source.name)).toEqual([
      'From a file',
      'Renamed after',
    ]);
    // So the file Export writes is the entry it came from when it is imported again.
    const exported = JSON.parse(JSON.stringify(store.getState().library.palettes[1]!.source));
    expect(await store.getState().importPalette(normalizePalette(exported).palette)).toBe(edited);
    expect(createPaletteStore(env.deps).getState().library).toEqual(store.getState().library);
  });

  it('keeps unsaved creations and colors in the tab, and saves them on retry', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    env.writable(false);
    const id = await store.getState().createPalette();
    await store.getState().recolor(id, 'text', '#ABCDEF');
    await store.getState().rename(id, 'Mine');
    expect(store.getState()).toMatchObject({ unsaved: true });
    expect(env.raw()).toBeNull();
    env.writable(true);
    await store.getState().retrySave();
    expect(store.getState().unsaved).toBe(false);
    const saved = readPaletteLibrary(env.raw()).library.palettes;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id,
      displayName: 'Mine',
      authored: true,
      source: { name: 'Mine' },
    });
    expect(saved[0]!.source.colors.text).toBe('#ABCDEF');
  });

  it('refuses a new palette when the library is full, leaving it as it was', async () => {
    const env = environment();
    const store = createPaletteStore(env.deps);
    for (let n = 0; n < 24; n++) await store.getState().importPalette(source(String(n)));
    const before = env.raw();
    await expect(store.getState().createPalette()).rejects.toThrow(
      'The palette library is full (24). Delete an entry before adding another.',
    );
    const first = store.getState().library.palettes[0]!.id;
    await expect(store.getState().duplicate(first)).rejects.toThrow('full');
    expect(env.raw()).toBe(before);
  });
});

it('drops a waiting new palette the library has no room for, with its colors', () => {
  const full = emptyPaletteLibrary();
  for (let n = 0; n < PALETTE_LIBRARY_LIMIT; n++) {
    full.palettes.push({ id: `p${n}`, displayName: `Palette ${n}`, source: source(String(n)) });
  }
  const stillApplies: PaletteOperation = {
    kind: 'recolor',
    id: 'p0',
    role: 'arrow',
    color: '#FF0000',
  };
  const replay = replayPaletteOperations(full, [
    { kind: 'create', entry: { id: 'late', displayName: 'Late', source: source('Late') } },
    { kind: 'recolor', id: 'late', role: 'text', color: '#000000' },
    stillApplies,
    { kind: 'recolor', id: 'gone', role: 'text', color: '#000000' },
  ]);
  expect(replay.dropped).toEqual([
    'Adding “Late” could not be kept: The palette library is full (24). Delete an entry before adding another.',
    'Changing the text colour of a palette could not be kept: This palette was removed in another tab.',
  ]);
  expect(replay.kept).toEqual([stillApplies]);
  expect(replay.library.palettes[0]).toMatchObject({ authored: true });
  expect(replay.library.palettes[0]!.source.colors.arrow).toBe('#FF0000');
});

it('reads the mark of an editor’s palette back, and only a true one', () => {
  const entry = { id: 'one', displayName: 'Mine', source: source('Mine') };
  const read = (authored: unknown) =>
    readPaletteLibrary(
      JSON.stringify({ version: 1, activePaletteId: null, palettes: [{ ...entry, authored }] }),
    ).library.palettes[0];
  expect(read(true)).toEqual({ ...entry, authored: true });
  expect(read(false)).toEqual(entry);
  expect(read('yes')).toEqual(entry);
});
