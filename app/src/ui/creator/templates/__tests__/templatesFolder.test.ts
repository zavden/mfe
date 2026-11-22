// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ensureFolderWritable, isFolderWritable } from '../../../project/files';
import {
  createTemplatesFolderSync,
  readFolderTemplates,
  TEMPLATES_PATH,
  writeFolderTemplates,
  type TemplatesDirectory,
} from '../templatesFolder';
import {
  readLibrary,
  serializeLibrary,
  USER_TEMPLATE_LIMIT,
  type TemplateFields,
  type UserLibrary,
} from '../userLibrary';
import { createTemplateLibraryStore } from '../userLibraryStore';

const fields = (name: string): TemplateFields => ({
  name,
  category: '',
  description: '',
  latex: '#1+1',
  placeholders: [{ n: 1, value: 'a' }],
  packages: [],
});

const notFound = () => new DOMException('not there', 'NotFoundError');
const notAllowed = () => new DOMException('not allowed', 'NotAllowedError');

/** A folder as the browser hands it over: readable, and writable once the user allows it. */
function fakeFolder(name: string, initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const folders = new Set<string>();
  const state = {
    permission: 'prompt' as PermissionState,
    /** What the user answers when the browser asks. */
    answer: 'granted' as PermissionState,
    asked: 0,
    writes: 0,
    failWrites: false,
    failReads: false,
  };
  const directory = (prefix: string, own: string): TemplatesDirectory => ({
    kind: 'directory',
    name: own,
    async *values() {},
    queryPermission: async ({ mode }) => (mode === 'read' ? 'granted' : state.permission),
    requestPermission: async () => {
      state.asked += 1;
      state.permission = state.answer;
      return state.permission;
    },
    getDirectoryHandle: async (child, options) => {
      const path = `${prefix}${child}/`;
      if (state.failReads) throw new Error('the disk is gone');
      const there = folders.has(path) || [...files.keys()].some((key) => key.startsWith(path));
      if (!there) {
        if (!options?.create) throw notFound();
        if (state.permission !== 'granted') throw notAllowed();
        folders.add(path);
      }
      return directory(path, child);
    },
    getFileHandle: async (child, options) => {
      const path = `${prefix}${child}`;
      if (!files.has(path) && !options?.create) throw notFound();
      return {
        name: child,
        getFile: async () => ({ text: async () => files.get(path) ?? '' }) as File,
        createWritable: async () => {
          if (state.permission !== 'granted') throw notAllowed();
          if (state.failWrites) throw new Error('the disk is full');
          let data = '';
          return {
            write: async (chunk) => {
              data += chunk as string;
            },
            close: async () => {
              files.set(path, data);
              state.writes += 1;
            },
          };
        },
      };
    },
  });
  return { handle: directory('', name), files, state };
}

function setup(prefix = 't') {
  const items = new Map<string, string>();
  let ids = 0;
  let clock = 1000;
  const library = createTemplateLibraryStore({
    storage: {
      readItem: (key) => ({ ok: true, value: items.get(key) ?? null }),
      setItem: (key, value) => (items.set(key, value), true),
    },
    newId: () => `${prefix}${++ids}`,
    now: () => (clock += 10),
    withLock: (run) => run(),
  });
  const sync = createTemplatesFolderSync({
    library,
    isWritable: isFolderWritable,
    ensureWritable: ensureFolderWritable,
  });
  const stop = sync.start();
  return {
    library,
    sync,
    stop,
    /** The folder was listed (File → Sync folder…, the Projects dialog). */
    list: (folder: TemplatesDirectory | null) => sync.pull(folder),
    status: () => sync.state.getState().status,
  };
}

const inFolder = (folder: ReturnType<typeof fakeFolder>): UserLibrary => {
  const read = readLibrary(folder.files.get(TEMPLATES_PATH) ?? '');
  if (!read.ok) throw new Error(read.message);
  return read.library;
};
const names = (library: UserLibrary) => library.templates.map((t) => t.name);

describe('the folder’s templates file', () => {
  it('is read from templates/templates.json, and is null when the folder has none', async () => {
    const folder = fakeFolder('Course', { 'templates/templates.json': 'text', 'a.json': '{}' });
    expect(await readFolderTemplates(folder.handle)).toBe('text');
    expect(await readFolderTemplates(fakeFolder('Empty').handle)).toBeNull();
    expect(await readFolderTemplates(fakeFolder('Other', { 'templates/x.json': '' }).handle)).toBe(
      null,
    );
  });

  it('is written with its sub-folder made when it is not there', async () => {
    const folder = fakeFolder('Course');
    folder.state.permission = 'granted';
    await writeFolderTemplates(folder.handle, 'one');
    await writeFolderTemplates(folder.handle, 'two');
    expect([...folder.files]).toEqual([[TEMPLATES_PATH, 'two']]);
  });
});

describe('the templates of the synced folder', () => {
  it('have nowhere to go without a folder', async () => {
    const { library, list, status, sync } = setup();
    await list(null);
    await library.getState().createTemplate(fields('Sum'));
    await sync.writeNow();
    expect(status()).toBe('none');
    expect(sync.state.getState().folderName).toBeNull();
  });

  it('make no file, and ask nothing, while there is nothing to keep', async () => {
    const { list, status } = setup();
    const folder = fakeFolder('Course');
    await list(folder.handle);
    expect(status()).toBe('synced');
    expect(folder.state).toMatchObject({ asked: 0, writes: 0 });
    expect(folder.files.size).toBe(0);
  });

  it('are written with every change, once the browser was allowed to write the folder', async () => {
    const { library, list, status, sync } = setup();
    const folder = fakeFolder('Course');
    await list(folder.handle);
    const id = await library.getState().createTemplate(fields('Sum'));
    await sync.writeNow();
    expect(status()).toBe('synced');
    expect(sync.state.getState().folderName).toBe('Course');
    expect(folder.state.asked).toBe(1);
    expect(folder.files.get(TEMPLATES_PATH)).toBe(serializeLibrary(library.getState().library));
    await library.getState().setFavorite(id, true);
    await library.getState().createTemplate(fields('Product'));
    await sync.writeNow();
    expect(names(inFolder(folder))).toEqual(['Sum', 'Product']);
    expect(inFolder(folder).favorites).toEqual([id]);
    expect(folder.state.asked).toBe(1); // asked once
  });

  it('stay in the browser when the user says no, until asked to write again', async () => {
    const { library, list, status, sync } = setup();
    const folder = fakeFolder('Course');
    folder.state.answer = 'denied';
    await list(folder.handle);
    await library.getState().createTemplate(fields('Sum'));
    await list(folder.handle);
    expect(status()).toBe('denied');
    expect(folder.files.size).toBe(0);
    // The next change does not ask again.
    await library.getState().createTemplate(fields('Product'));
    await list(folder.handle);
    expect(folder.state.asked).toBe(1);
    expect(status()).toBe('denied');
    // "Write to the folder" does, and this time the answer is yes.
    folder.state.permission = 'prompt';
    folder.state.answer = 'granted';
    await sync.writeNow();
    expect(folder.state.asked).toBe(2);
    expect(status()).toBe('synced');
    expect(names(inFolder(folder))).toEqual(['Sum', 'Product']);
  });

  it('take in what the folder has when it is listed: the newer of each template', async () => {
    const { library, list, status } = setup();
    const mine = await library.getState().createTemplate(fields('Mine'));
    const theirs: UserLibrary = {
      templates: [
        {
          ...library.getState().library.templates[0]!,
          name: 'Mine, edited elsewhere',
          modified: 9e9,
        },
        { ...library.getState().library.templates[0]!, id: 'other', name: 'From the folder' },
      ],
      favorites: ['other'],
    };
    const folder = fakeFolder('Course', { [TEMPLATES_PATH]: serializeLibrary(theirs) });
    await list(folder.handle);
    expect(names(library.getState().library)).toEqual([
      'Mine, edited elsewhere',
      'From the folder',
    ]);
    expect(library.getState().library.favorites).toEqual(['other']);
    // The folder's file already says all that: nothing to write, nothing asked.
    expect(status()).toBe('synced');
    expect(folder.state).toMatchObject({ asked: 0, writes: 0 });

    // A library that has more than the folder's file: the file waits for a permission nobody
    // was asked for yet.
    const second = setup('s');
    await second.library.getState().createTemplate(fields('Only here'));
    await second.list(folder.handle);
    expect(names(second.library.getState().library)).toEqual([
      'Only here',
      'Mine, edited elsewhere',
      'From the folder',
    ]);
    expect(second.status()).toBe('pending');
    expect(folder.state.asked).toBe(0);
    await second.sync.writeNow();
    expect(second.status()).toBe('synced');
    expect(names(inFolder(folder))).toHaveLength(3);
    expect(mine).toBe('t1');
  });

  it('never write over a file they cannot read', async () => {
    const { library, list, status, sync } = setup();
    const folder = fakeFolder('Course', { [TEMPLATES_PATH]: '{"mine": true}' });
    folder.state.permission = 'granted';
    await list(folder.handle);
    expect(status()).toBe('failed');
    expect(sync.state.getState().message).toMatch(
      /is left as it is\. The file is not a templates file/,
    );
    await library.getState().createTemplate(fields('Sum'));
    await sync.writeNow();
    expect(folder.files.get(TEMPLATES_PATH)).toBe('{"mine": true}');
    expect(status()).toBe('failed');

    const newer = fakeFolder('Later', {
      [TEMPLATES_PATH]: '{"format":"mfe-templates","version":2,"templates":[]}',
    });
    newer.state.permission = 'granted';
    await list(newer.handle);
    expect(sync.state.getState().message).toMatch(/newer version of the editor/);
    expect(newer.state.writes).toBe(0);
  });

  it('never write the file with fewer templates than it holds: too many for one library', async () => {
    const { library, list, status, sync } = setup();
    const made = await library.getState().createTemplate(fields('Mine'));
    const base = library.getState().library.templates[0]!;
    const theirs: UserLibrary = {
      templates: Array.from({ length: USER_TEMPLATE_LIMIT }, (_, i) => ({
        ...base,
        id: `there${i}`,
        name: `There ${i}`,
      })),
      favorites: [],
    };
    const text = serializeLibrary(theirs);
    const folder = fakeFolder('Course', { [TEMPLATES_PATH]: text });
    folder.state.permission = 'granted';
    await list(folder.handle);
    // 501 together: neither side is changed, and the state says why and what to do.
    expect(status()).toBe('failed');
    expect(sync.state.getState().message).toBe(
      `The folder’s ${TEMPLATES_PATH} is left as it is, and so is the library here: together they hold 501 templates, and a library holds 500 at most. Delete 1 of them, here or in the folder’s file, and list the folder again.`,
    );
    expect(names(library.getState().library)).toEqual(['Mine']);
    expect(folder.files.get(TEMPLATES_PATH)).toBe(text);
    // A change here does not write over the file either, asked or not.
    await library.getState().createTemplate(fields('Another'));
    await sync.writeNow();
    expect(folder.files.get(TEMPLATES_PATH)).toBe(text);
    expect(folder.state.writes).toBe(0);
    expect(status()).toBe('failed');
    // With room made, listing the folder again takes its templates in and writes the file.
    await library.getState().removeTemplates([made, library.getState().library.templates[1]!.id]);
    theirs.templates.pop();
    folder.files.set(TEMPLATES_PATH, serializeLibrary(theirs));
    await list(folder.handle);
    expect(status()).toBe('synced');
    expect(library.getState().library.templates).toHaveLength(USER_TEMPLATE_LIMIT - 1);
  });

  it('never write the file without the entries it could not read as templates', async () => {
    const { library, list, status, sync } = setup();
    await library.getState().createTemplate(fields('Mine'));
    const base = library.getState().library.templates[0]!;
    const file = JSON.parse(
      serializeLibrary({
        templates: [{ ...base, id: 'good', name: 'From the folder' }],
        favorites: [],
      }),
    ) as { templates: unknown[] };
    // Two entries of another program, or of a version to come, that are not templates here.
    file.templates.push({ id: 'odd', name: 'No LaTeX' }, 'a line of text');
    const text = JSON.stringify(file);
    const folder = fakeFolder('Course', { [TEMPLATES_PATH]: text });
    folder.state.permission = 'granted';
    await list(folder.handle);
    // What can be read is taken in; the file keeps all it has.
    expect(names(library.getState().library)).toEqual(['Mine', 'From the folder']);
    expect(status()).toBe('failed');
    expect(sync.state.getState().message).toBe(
      `The folder’s ${TEMPLATES_PATH} is left as it is: 2 of its entries cannot be read as templates here, and writing the file again would drop them. Its other templates were taken in.`,
    );
    await library.getState().createTemplate(fields('Another'));
    await sync.writeNow();
    expect(folder.files.get(TEMPLATES_PATH)).toBe(text);
    expect(folder.state.writes).toBe(0);
  });

  it('say so when the folder cannot be read or written', async () => {
    const { library, list, status, sync } = setup();
    const folder = fakeFolder('Course');
    folder.state.permission = 'granted';
    folder.state.failWrites = true;
    await list(folder.handle);
    await library.getState().createTemplate(fields('Sum'));
    await sync.writeNow();
    expect(status()).toBe('failed');
    expect(sync.state.getState().message).toMatch(/could not be written: the disk is full/);
    // Mended, the next change writes it.
    folder.state.failWrites = false;
    await library.getState().createTemplate(fields('Product'));
    await sync.writeNow();
    expect(status()).toBe('synced');
    expect(names(inFolder(folder))).toEqual(['Sum', 'Product']);

    folder.state.failReads = true;
    await list(folder.handle);
    expect(status()).toBe('failed');
    expect(sync.state.getState().message).toMatch(/could not be read: the disk is gone/);
  });

  it('follow another folder from scratch, and stop when stopped', async () => {
    const { library, list, status, sync, stop } = setup();
    const first = fakeFolder('First');
    first.state.answer = 'denied';
    await list(first.handle);
    await library.getState().createTemplate(fields('Sum'));
    await list(first.handle);
    expect(status()).toBe('denied');
    // Another folder: the no was for the first one.
    const second = fakeFolder('Second');
    await list(second.handle);
    expect(status()).toBe('pending');
    await sync.writeNow();
    expect(status()).toBe('synced');
    expect(sync.state.getState().folderName).toBe('Second');
    expect(names(inFolder(second))).toEqual(['Sum']);
    stop();
    await library.getState().createTemplate(fields('After'));
    await list(second.handle); // listing still reads and writes; the library is no longer followed
    expect(second.state.writes).toBe(2);
  });
});
