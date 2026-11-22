import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFormula,
  createTextFormula,
  serializeProject,
} from '../../../model';
import type { FolderFile } from '../files';
import {
  buildLibrary,
  compareEntries,
  describeEntry,
  displayFileName,
  filesOfSnapshot,
  filterEntries,
  folderFilesFromInput,
  formatModified,
  isLibrarySnapshot,
  readLibraryEntry,
  snapshotOf,
  topLevelFiles,
  unopenedTitle,
  type InputFile,
} from '../library';

/** The same text for the same name and count (ids are random: one project per name). */
const texts = new Map<string, string>();
function projectText(name: string, formulas = 0): string {
  const key = `${name}/${formulas}`;
  let text = texts.get(key);
  if (!text) {
    const project = createEmptyProject(name);
    for (let i = 0; i < formulas; i++) {
      project.formulas.push(createFormula({ name: `f${i + 1}`, source: 'x' }));
    }
    text = serializeProject(project);
    texts.set(key, text);
  }
  return text;
}

const file = (fileName: string, text: string, lastModified: number | null = 1000): FolderFile => ({
  fileName,
  lastModified,
  text,
  handle: null,
});

describe('readLibraryEntry', () => {
  it('describes a project file: name, date, formula count, the parsed project', () => {
    const entry = readLibraryEntry(file('quad.mfe.json', projectText('Quadratic', 3), 1234));
    expect(entry).toMatchObject({
      fileName: 'quad.mfe.json',
      name: 'Quadratic',
      modified: 1234,
      formulaCount: 3,
      handle: null,
    });
    expect(entry!.project.formulas.map((f) => f.name)).toEqual(['f1', 'f2', 'f3']);
    expect(entry!.text).toBe(projectText('Quadratic', 3));
  });

  it('keeps the geometry the file carries for its font texts, for their thumbnails', () => {
    const project = createEmptyProject('Titles');
    const geometry = { contentHash: 'a'.repeat(64), byteLength: 1, key: 'k', basisKey: 'b' };
    project.formulas.push(createTextFormula({ source: 'Title', geometry }));
    const section = { [geometry.contentHash]: { carried: true } };
    const entry = readLibraryEntry(file('t.mfe.json', serializeProject(project, section)));
    expect(entry!.textGeometry).toEqual(section);
    expect(entry!.project).toEqual(project);
    expect(readLibraryEntry(file('plain.mfe.json', projectText('Plain', 1)))!.textGeometry).toEqual(
      {},
    );
  });

  it('lists an older format, migrated as Open would migrate it', () => {
    const v3 = JSON.parse(projectText('Old', 1)) as { version: number; formulas: object[] };
    v3.version = 3;
    for (const formula of v3.formulas) delete (formula as { intro?: unknown }).intro;
    const entry = readLibraryEntry(file('old.mfe.json', JSON.stringify(v3)));
    expect(entry?.name).toBe('Old');
    expect(entry?.project.formulas[0]?.intro).toBeNull();
  });

  it('is null for JSON that is not a project, and for text that is not JSON', () => {
    expect(readLibraryEntry(file('settings.json', '{"theme":"dark"}'))).toBeNull();
    expect(readLibraryEntry(file('broken.json', '{'))).toBeNull();
  });
});

describe('buildLibrary', () => {
  it('sorts newest first, undated last, then by file name; counts the other json files', () => {
    const { entries, skipped } = buildLibrary([
      file('b.mfe.json', projectText('B'), 100),
      file('notes.json', '{"a":1}'),
      file('a10.mfe.json', projectText('A10'), null),
      file('a2.mfe.json', projectText('A2'), null),
      file('c.mfe.json', projectText('C'), 300),
      file('d.mfe.json', projectText('D'), 300),
    ]);
    expect(entries.map((e) => e.fileName)).toEqual([
      'c.mfe.json',
      'd.mfe.json',
      'b.mfe.json',
      'a2.mfe.json',
      'a10.mfe.json',
    ]);
    expect(skipped).toBe(1);
  });

  // A project its owner cannot open is a file they look for: it is named, with what Open says.
  it('names the projects that do not open, each with why, apart from what is no project', () => {
    const edited = (name: string, change: (raw: Record<string, unknown>) => void) => {
      const raw = JSON.parse(projectText(name)) as Record<string, unknown>;
      change(raw);
      return JSON.stringify(raw);
    };
    const newer = edited('Newer', (raw) => {
      raw.version = 99;
    });
    const malformed = edited('Malformed', (raw) => {
      (raw.meta as { fps: unknown }).fps = 'fast';
    });
    const damaged = 'The .mfe project is damaged or unsupported: its signature is not recognized.';
    const { entries, unopened, skipped } = buildLibrary([
      file('ok.mfe.json', projectText('Ok')),
      file('z-newer.mfe.json', newer),
      file('bad10.mfe.json', malformed),
      file('bad2.mfe.json', malformed),
      { ...file('lecture.mfe', ''), unreadable: damaged },
      file('notes.json', '{"a":1}'),
      file('broken.json', '{'),
    ]);
    expect(entries.map((entry) => entry.fileName)).toEqual(['ok.mfe.json']);
    // By file name, as a person reads numbers.
    expect(unopened).toEqual([
      { fileName: 'bad2.mfe.json', reason: 'The project file is malformed.' },
      { fileName: 'bad10.mfe.json', reason: 'The project file is malformed.' },
      { fileName: 'lecture.mfe', reason: damaged },
      {
        fileName: 'z-newer.mfe.json',
        reason: expect.stringMatching(
          /^The project was saved by a newer version of the app \(format 99; this app reads up to \d+\)\.$/,
        ),
      },
    ]);
    // The two files that are no projects, and only they.
    expect(skipped).toBe(2);
    expect(readLibraryEntry(file('z-newer.mfe.json', newer))).toBeNull();
    expect(buildLibrary([file('a.mfe.json', projectText('A'))]).unopened).toEqual([]);
  });

  // A save cut short by a full disk, a copy the cloud has half brought down: the text says nothing
  // of itself, and the name is the one the app gives its projects. Open says why it does not open;
  // counted with the files that are no projects, it would be looked for in vain.
  it('takes a file named as the app names its own for a project, whatever is left of its text', () => {
    const cutShort = projectText('Talk').slice(0, 40);
    const { entries, unopened, skipped } = buildLibrary([
      file('talk.mfe.json', cutShort),
      file('Empty.MFE.JSON', ''),
      file('other.mfe.json', '{"a":1}'),
      // The same texts under a name that is anybody's.
      file('talk.json', cutShort),
      file('other.json', '{"a":1}'),
    ]);
    expect(entries).toEqual([]);
    expect(unopened).toEqual([
      { fileName: 'Empty.MFE.JSON', reason: 'The file is not valid JSON.' },
      { fileName: 'other.mfe.json', reason: 'This is not a Manim Formula Editor project.' },
      { fileName: 'talk.mfe.json', reason: 'The file is not valid JSON.' },
    ]);
    expect(skipped).toBe(2);
  });

  it('heads them with how many they are', () => {
    expect(unopenedTitle(1)).toBe('One project of the folder does not open:');
    expect(unopenedTitle(3)).toBe('3 projects of the folder do not open:');
  });

  it('compareEntries is a total order on the same entry', () => {
    const [entry] = buildLibrary([file('a.mfe.json', projectText('A'))]).entries;
    expect(compareEntries(entry!, entry!)).toBe(0);
  });
});

describe('filterEntries', () => {
  const { entries } = buildLibrary([
    file('quad-v2.mfe.json', projectText('Fórmula cuadrática'), 400),
    file('notes.mfe.json', projectText('Completing the square'), 300),
    file('Square-Roots.mfe.json', projectText('Untitled'), 200),
    file('other.mfe.json', projectText('Untitled'), 100),
  ]);
  const found = (query: string) => filterEntries(entries, query).map((entry) => entry.fileName);

  it('finds a project by its name or by the name of its file, in the order of the list', () => {
    expect(found('square')).toEqual(['notes.mfe.json', 'Square-Roots.mfe.json']);
    expect(found('quad')).toEqual(['quad-v2.mfe.json']);
    expect(found('untitled')).toEqual(['Square-Roots.mfe.json', 'other.mfe.json']);
    expect(found('zzz')).toEqual([]);
  });

  it('compares without case and without accents, either way', () => {
    expect(found('FORMULA CUADRATICA')).toEqual(['quad-v2.mfe.json']);
    expect(found('fórmula')).toEqual(['quad-v2.mfe.json']);
    expect(found('róots')).toEqual(['Square-Roots.mfe.json']);
  });

  it('wants every word, each in the name or in the file name', () => {
    expect(found('untitled roots')).toEqual(['Square-Roots.mfe.json']);
    expect(found('the notes')).toEqual(['notes.mfe.json']);
    expect(found('untitled quad')).toEqual([]);
  });

  it('finds everything with no word to look for, as a list of its own', () => {
    expect(found('')).toEqual(entries.map((entry) => entry.fileName));
    expect(found('   ')).toHaveLength(4);
    expect(filterEntries(entries, '')).not.toBe(entries);
  });
});

describe('the webkitdirectory fallback', () => {
  const input = (path: string, text = '{}'): InputFile => ({
    name: path.split('/').pop()!,
    webkitRelativePath: path,
    lastModified: 42,
    text: async () => text,
  });

  it('keeps the json files directly in the folder and names the folder', () => {
    const picked = topLevelFiles([
      input('Projects/a.mfe.json'),
      input('Projects/sub/b.mfe.json'),
      input('Projects/readme.txt'),
      input('Projects/.hidden.json'),
      input('Projects/c.json'),
    ]);
    expect(picked.folderName).toBe('Projects');
    expect(picked.files.map((f) => f.name)).toEqual(['a.mfe.json', 'c.json']);
  });

  it('has no folder name without files', () => {
    expect(topLevelFiles([])).toEqual({ folderName: null, files: [] });
  });

  it('reads the files into folder files without handles', async () => {
    const files = await folderFilesFromInput([input('P/a.mfe.json', projectText('A'))]);
    expect(files).toEqual([
      { fileName: 'a.mfe.json', lastModified: 42, text: projectText('A'), handle: null },
    ]);
  });
});

describe('snapshots', () => {
  it('keeps the file names, dates and text, and comes back as folder files', () => {
    const files = [file('a.mfe.json', projectText('A'), 5), file('b.json', '{}', null)];
    const snapshot = snapshotOf('Projects', files, 999);
    expect(snapshot).toEqual({
      v: 1,
      folderName: 'Projects',
      takenAt: 999,
      files: [
        { fileName: 'a.mfe.json', lastModified: 5, text: projectText('A') },
        { fileName: 'b.json', lastModified: null, text: '{}' },
      ],
    });
    expect(isLibrarySnapshot(snapshot)).toBe(true);
    expect(filesOfSnapshot(snapshot)).toEqual(files);
  });

  it('keeps why a package could not be read, so the folder says it after a reload too', () => {
    const lost = { ...file('lecture.mfe', '', 9), unreadable: 'Its signature is not recognized.' };
    const snapshot = snapshotOf('Projects', [lost], 1);
    expect(snapshot.files).toEqual([
      {
        fileName: 'lecture.mfe',
        lastModified: 9,
        text: '',
        unreadable: 'Its signature is not recognized.',
      },
    ]);
    expect(isLibrarySnapshot(snapshot)).toBe(true);
    expect(filesOfSnapshot(snapshot)).toEqual([lost]);
    expect(buildLibrary(filesOfSnapshot(snapshot)).unopened).toEqual([
      { fileName: 'lecture.mfe', reason: 'Its signature is not recognized.' },
    ]);
    expect(
      isLibrarySnapshot({ ...snapshot, files: [{ ...snapshot.files[0]!, unreadable: 3 }] }),
    ).toBe(false);
  });

  it('rejects what is not a snapshot', () => {
    expect(isLibrarySnapshot(null)).toBe(false);
    expect(isLibrarySnapshot({ v: 2, folderName: 'x', takenAt: 1, files: [] })).toBe(false);
    expect(isLibrarySnapshot({ v: 1, folderName: 'x', takenAt: 1, files: [{}] })).toBe(false);
    expect(isLibrarySnapshot({ name: 'dir', kind: 'directory' })).toBe(false);
  });
});

describe('displayFileName', () => {
  it('drops the .mfe of .mfe.json and leaves other names alone', () => {
    expect(displayFileName('completing-the-square.mfe.json')).toBe('completing-the-square.json');
    expect(displayFileName('Quad.MFE.JSON')).toBe('Quad.json');
    expect(displayFileName('test-1.json')).toBe('test-1.json');
    expect(displayFileName('quadratic.mfev4.json')).toBe('quadratic.mfev4.json');
    expect(displayFileName('mfe.json')).toBe('mfe.json');
  });
});

describe('describeEntry', () => {
  it('counts the formulas and gives the date, when known', () => {
    const when = Date.UTC(2026, 9, 31, 12, 0);
    expect(formatModified(null)).toBe('');
    expect(formatModified(when)).toMatch(/^Oct 31, 2026, \d{1,2}:\d\d [AP]M$/);
    expect(describeEntry({ formulaCount: 1, modified: null })).toBe('1 formula');
    expect(describeEntry({ formulaCount: 3, modified: when })).toBe(
      `3 formulas · ${formatModified(when)}`,
    );
  });
});
