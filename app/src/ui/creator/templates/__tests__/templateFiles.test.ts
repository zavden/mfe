import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialogStore } from '../../../project/dialogStore';
import { downloadText } from '../../../project/files';
import { useNoticeStore } from '../../../project/noticeStore';
import { exportTemplates, importTemplatesFile, TEMPLATES_EXPORT_NAME } from '../templateFiles';
import {
  emptyUserLibrary,
  readLibrary,
  serializeLibrary,
  userTemplate,
  type UserLibrary,
} from '../userLibrary';
import { useTemplateLibrary } from '../userLibraryStore';

vi.mock('../../../project/files', async (original) => ({
  ...(await original<typeof import('../../../project/files')>()),
  downloadText: vi.fn(),
}));

const template = (id: string, name: string, latex = '#1+1') =>
  userTemplate(
    id,
    {
      name,
      category: 'Mine',
      description: '',
      latex,
      placeholders: [{ n: 1, value: 'a' }],
      packages: [],
    },
    1000,
  );

const file = (library: UserLibrary | string, name = 'course.json') => ({
  name,
  text: async () => (typeof library === 'string' ? library : serializeLibrary(library)),
});

const library = () => useTemplateLibrary.getState().library;
const names = () => library().templates.map((t) => `${t.id}:${t.name}`);
const notices = () => useNoticeStore.getState().notices;
const dialog = () => useDialogStore.getState().queue[0];
/** The question is on screen once the file was read. */
const asked = () => vi.waitFor(() => expect(dialog()).toBeDefined());

beforeEach(async () => {
  window.localStorage.clear();
  useTemplateLibrary.setState({ library: emptyUserLibrary(), unsaved: false, warnings: [] });
  useNoticeStore.getState().clear();
  vi.mocked(downloadText).mockClear();
  await useTemplateLibrary.getState().importLibrary(
    {
      fresh: [template('a', 'A'), template('b', 'B')],
      clashes: [],
      same: 0,
      favorites: ['b', 'algebra-square-of-a-sum'],
    },
    'skip',
  );
});

describe('exportTemplates', () => {
  it('downloads the whole library as a templates file', () => {
    exportTemplates();
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [name, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe(TEMPLATES_EXPORT_NAME);
    expect(readLibrary(text)).toEqual({ ok: true, library: library(), skipped: 0 });
  });

  it('or the chosen templates, with their stars', () => {
    exportTemplates(['b']);
    const read = readLibrary(vi.mocked(downloadText).mock.calls[0]![1]);
    expect(read).toMatchObject({
      ok: true,
      library: { templates: [{ id: 'b', name: 'B' }], favorites: ['b'] },
    });
  });
});

describe('importTemplatesFile', () => {
  it('adds the templates and the stars the library does not have, and says what it did', async () => {
    const incoming = {
      templates: [template('a', 'A'), template('c', 'C'), template('d', 'D')],
      favorites: ['c', 'b'],
    };
    expect(await importTemplatesFile(file(incoming))).toBe(true);
    expect(names()).toEqual(['a:A', 'b:B', 'c:C', 'd:D']);
    expect(library().favorites).toEqual(['b', 'algebra-square-of-a-sum', 'c']);
    expect(dialog()).toBeUndefined();
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toMatchObject({
      kind: 'info',
      title: 'Imported course.json',
      message: '2 templates added, 1 favorite added.',
      details: ['1 template was there already.'],
    });
    // Kept by the browser, not only by the tab.
    const stored = readLibrary(window.localStorage.getItem('mfe.templates.v1')!);
    expect(stored).toMatchObject({ ok: true, library: library() });
  });

  it('asks about the templates the library has with other content: replace them', async () => {
    const incoming = { templates: [template('b', 'B changed'), template('c', 'C')], favorites: [] };
    const done = importTemplatesFile(file(incoming));
    await asked();
    expect(dialog()).toMatchObject({
      title: 'Some templates are already in your library',
      message: '1 template of course.json is in your library with other content:',
      details: ['B changed'],
    });
    expect(names()).toEqual(['a:A', 'b:B']); // nothing yet
    useDialogStore.getState().settle(dialog()!.key, 'replace');
    expect(await done).toBe(true);
    expect(names()).toEqual(['a:A', 'b:B changed', 'c:C']);
    expect(notices()[0]!.message).toBe('1 template added, 1 template replaced.');
  });

  it('or keep both, or keep the library’s, or leave it all', async () => {
    const incoming = { templates: [template('b', 'B changed')], favorites: [] };
    let done = importTemplatesFile(file(incoming));
    await asked();
    useDialogStore.getState().settle(dialog()!.key, 'cancel');
    expect(await done).toBe(false);
    expect(names()).toEqual(['a:A', 'b:B']);
    expect(notices()).toHaveLength(0);

    done = importTemplatesFile(file(incoming));
    await asked();
    useDialogStore.getState().settle(dialog()!.key, 'skip');
    expect(await done).toBe(true);
    expect(names()).toEqual(['a:A', 'b:B']);
    expect(notices()[0]).toMatchObject({
      message: 'Your library stays as it was.',
      details: ['1 template of yours kept as it was.'],
    });

    done = importTemplatesFile(file(incoming));
    await asked();
    useDialogStore.getState().settle(dialog()!.key, 'copy');
    expect(await done).toBe(true);
    expect(library().templates.map((t) => t.name)).toEqual(['A', 'B', 'B changed copy']);
    expect(library().templates[2]!.id).toMatch(/^tpl_[0-9a-f]{24}$/);
  });

  it('says so when there is nothing to take in', async () => {
    expect(
      await importTemplatesFile(file({ templates: [template('a', 'A')], favorites: ['b'] })),
    ).toBe(false);
    expect(notices()[0]).toMatchObject({
      kind: 'info',
      title: 'Nothing to import',
      message: 'Your library has the 1 template of course.json already.',
    });
    useNoticeStore.getState().clear();
    expect(await importTemplatesFile(file(emptyUserLibrary(), 'empty.json'))).toBe(false);
    expect(notices()[0]!.message).toBe('empty.json holds no templates.');
  });

  it('refuses what is not a templates file, and counts the entries that are not templates', async () => {
    expect(await importTemplatesFile(file('{"version":21,"formulas":[]}', 'project.json'))).toBe(
      false,
    );
    expect(notices()[0]).toMatchObject({
      kind: 'error',
      title: 'Could not import project.json',
      message: 'The file is not a templates file.',
    });
    expect(names()).toEqual(['a:A', 'b:B']);
    useNoticeStore.getState().clear();

    const text = JSON.parse(serializeLibrary({ templates: [template('c', 'C')], favorites: [] }));
    text.templates.push({ id: 'broken' }, { ...text.templates[0], id: 'e', latex: '#1+#4' });
    expect(await importTemplatesFile(file(JSON.stringify(text)))).toBe(true);
    expect(names()).toEqual(['a:A', 'b:B', 'c:C']);
    expect(notices()[0]!.details).toEqual(['2 entries of the file left out: not a template.']);
  });

  it('says so when the file cannot be read', async () => {
    const unreadable = { name: 'gone.json', text: () => Promise.reject(new Error('gone')) };
    expect(await importTemplatesFile(unreadable)).toBe(false);
    expect(notices()[0]).toMatchObject({ kind: 'error', title: 'Could not read gone.json' });
  });
});
