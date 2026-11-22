import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createFormula, serializeProject } from '../../../model';
import * as files from '../files';
import {
  libraryFolderHandle,
  refreshLibrary,
  restoreLibrary,
  syncFolder,
  useLibraryStore,
} from '../libraryStore';
import { useNoticeStore } from '../noticeStore';

vi.mock('../files', async (importOriginal) => {
  const original = await importOriginal<typeof import('../files')>();
  return {
    ...original,
    hasDirectoryPicker: vi.fn(() => false),
    pickDirectoryHandle: vi.fn(),
    pickFolderViaInput: vi.fn(),
    storeValue: vi.fn(async () => undefined),
    loadValue: vi.fn(async () => null),
  };
});

const mocked = vi.mocked(files);
const state = () => useLibraryStore.getState();
const notices = () => useNoticeStore.getState().notices;

function projectText(name: string, formulas = 1): string {
  const project = createEmptyProject(name);
  for (let i = 0; i < formulas; i++) project.formulas.push(createFormula({ name: `f${i}` }));
  return serializeProject(project);
}

function fileEntry(name: string, text: string, lastModified: number): files.DirectoryEntry {
  return {
    kind: 'file',
    name,
    getFile: async () => new File([text], name, { lastModified }),
    createWritable: vi.fn(),
  };
}

/** A folder handle with the permission methods of a real one. */
function folder(
  name: string,
  entries: files.DirectoryEntry[],
  permission: { query: PermissionState; request: PermissionState } = {
    query: 'granted',
    request: 'granted',
  },
): files.DirectoryHandleLike & { requestPermission: ReturnType<typeof vi.fn> } {
  return {
    kind: 'directory',
    name,
    async *values() {
      yield* entries;
    },
    queryPermission: vi.fn(async () => permission.query),
    requestPermission: vi.fn(async () => permission.request),
  };
}

const twoProjects = () => [
  fileEntry('old.mfe.json', projectText('Old'), 100),
  fileEntry('new.mfe.json', projectText('New', 2), 200),
  fileEntry('other.json', '{"not":"a project"}', 300),
];

beforeEach(() => {
  vi.clearAllMocks();
  mocked.hasDirectoryPicker.mockReturnValue(false);
  mocked.loadValue.mockResolvedValue(null);
  useLibraryStore.setState({ folder: null, status: 'idle', entries: [], skipped: 0 });
  useNoticeStore.getState().clear();
});

describe('syncFolder with a directory picker (Chrome/Edge)', () => {
  beforeEach(() => mocked.hasDirectoryPicker.mockReturnValue(true));

  it('lists the folder, newest first, keeps its handle and stores it', async () => {
    const dir = folder('Projects', twoProjects());
    mocked.pickDirectoryHandle.mockResolvedValue(dir);
    expect(await syncFolder()).toBe(true);
    expect(state().folder).toEqual({ kind: 'live', name: 'Projects', handle: dir });
    expect(state().status).toBe('ready');
    expect(state().entries.map((e) => [e.name, e.formulaCount, e.modified])).toEqual([
      ['New', 2, 200],
      ['Old', 1, 100],
    ]);
    expect(state().entries[0]!.handle?.name).toBe('new.mfe.json');
    expect(state().skipped).toBe(1);
    expect(mocked.storeValue).toHaveBeenCalledWith(files.LIBRARY_KEY, dir);
    expect(libraryFolderHandle()).toBe(dir);
  });

  it('does nothing when the picker is cancelled', async () => {
    mocked.pickDirectoryHandle.mockResolvedValue(null);
    expect(await syncFolder()).toBe(false);
    expect(state().status).toBe('idle');
    expect(mocked.storeValue).not.toHaveBeenCalled();
  });

  it('is blocked, and stores nothing, when the browser refuses to read the folder', async () => {
    const dir = folder('Private', twoProjects(), { query: 'prompt', request: 'denied' });
    mocked.pickDirectoryHandle.mockResolvedValue(dir);
    expect(await syncFolder()).toBe(false);
    expect(state()).toMatchObject({ status: 'blocked', entries: [] });
    expect(state().folder?.name).toBe('Private');
    expect(mocked.storeValue).not.toHaveBeenCalled();
  });

  it('reports a picker that is not available', async () => {
    mocked.pickDirectoryHandle.mockRejectedValue(new Error('policy'));
    expect(await syncFolder()).toBe(false);
    expect(notices()[0]).toMatchObject({
      kind: 'error',
      title: 'Could not open the folder picker',
    });
  });
});

describe('syncFolder through the webkitdirectory input', () => {
  const input = (path: string, text: string, lastModified = 5) =>
    Object.assign(new File([text], path.split('/').pop()!, { lastModified }), {
      webkitRelativePath: path,
    });

  it('takes a snapshot of the folder, lists it and stores it', async () => {
    mocked.pickFolderViaInput.mockResolvedValue([
      input('Docs/a.mfe.json', projectText('A'), 10),
      input('Docs/sub/b.mfe.json', projectText('B'), 20),
      input('Docs/c.mfe.json', projectText('C'), 30),
    ]);
    expect(await syncFolder()).toBe(true);
    expect(state().folder).toMatchObject({ kind: 'snapshot', name: 'Docs' });
    expect(state().entries.map((e) => e.name)).toEqual(['C', 'A']);
    expect(state().entries.every((e) => e.handle === null)).toBe(true);
    expect(libraryFolderHandle()).toBeNull();
    const [key, stored] = mocked.storeValue.mock.calls[0]!;
    expect(key).toBe(files.LIBRARY_KEY);
    expect(stored).toMatchObject({
      v: 1,
      folderName: 'Docs',
      files: [
        { fileName: 'a.mfe.json', lastModified: 10 },
        { fileName: 'c.mfe.json', lastModified: 30 },
      ],
    });
  });

  it('does nothing when the dialog is cancelled', async () => {
    mocked.pickFolderViaInput.mockResolvedValue(null);
    expect(await syncFolder()).toBe(false);
    expect(state().status).toBe('idle');
  });
});

describe('restoreLibrary', () => {
  it('lists a stored handle at once when the browser still allows reading it', async () => {
    const dir = folder('Projects', twoProjects());
    mocked.loadValue.mockResolvedValue(dir);
    await restoreLibrary();
    expect(state().status).toBe('ready');
    expect(state().entries).toHaveLength(2);
    // No question at startup: there is no user gesture to ask with.
    expect(dir.requestPermission).not.toHaveBeenCalled();
  });

  it('waits, blocked, when the browser wants to ask first; the next refresh may ask', async () => {
    const dir = folder('Projects', twoProjects(), { query: 'prompt', request: 'granted' });
    mocked.loadValue.mockResolvedValue(dir);
    await restoreLibrary();
    expect(state()).toMatchObject({ status: 'blocked', entries: [] });
    expect(await refreshLibrary()).toBe(false);
    expect(dir.requestPermission).not.toHaveBeenCalled();
    expect(await refreshLibrary(true)).toBe(true);
    expect(dir.requestPermission).toHaveBeenCalledTimes(1);
    expect(state().status).toBe('ready');
    expect(state().entries).toHaveLength(2);
  });

  it('lists a stored snapshot as it was', async () => {
    mocked.loadValue.mockResolvedValue({
      v: 1,
      folderName: 'Docs',
      takenAt: 77,
      files: [{ fileName: 'a.mfe.json', lastModified: 1, text: projectText('A') }],
    });
    await restoreLibrary();
    expect(state().folder).toEqual({ kind: 'snapshot', name: 'Docs', takenAt: 77 });
    expect(state().entries.map((e) => e.name)).toEqual(['A']);
    expect(await refreshLibrary(true)).toBe(true);
  });

  it('ignores anything else in the store', async () => {
    mocked.loadValue.mockResolvedValue({ name: 'x.mfe.json', createWritable: () => {} });
    await restoreLibrary();
    expect(state().status).toBe('idle');
  });
});

describe('refreshLibrary', () => {
  it('lists the folder again (a new file appears)', async () => {
    const entries = twoProjects();
    const dir = folder('Projects', entries);
    mocked.loadValue.mockResolvedValue(dir);
    await restoreLibrary();
    entries.push(fileEntry('third.mfe.json', projectText('Third'), 400));
    expect(await refreshLibrary()).toBe(true);
    expect(state().entries.map((e) => e.name)).toEqual(['Third', 'New', 'Old']);
  });

  it('marks a folder that is gone as missing, quietly', async () => {
    const dir = folder('Projects', twoProjects());
    mocked.loadValue.mockResolvedValue(dir);
    await restoreLibrary();
    dir.values = () => {
      throw new DOMException('gone', 'NotFoundError');
    };
    expect(await refreshLibrary()).toBe(false);
    expect(state().status).toBe('missing');
    expect(notices()).toHaveLength(0);
  });

  it('reports another failure to list the folder', async () => {
    const dir = folder('Projects', twoProjects());
    mocked.loadValue.mockResolvedValue(dir);
    await restoreLibrary();
    dir.values = () => {
      throw new Error('disk');
    };
    expect(await refreshLibrary()).toBe(false);
    expect(notices()[0]).toMatchObject({
      kind: 'error',
      title: 'Could not read the folder Projects',
    });
  });

  it('is false without a folder', async () => {
    expect(await refreshLibrary()).toBe(false);
  });
});

describe('overlapping listings: the latest one wins', () => {
  /** A promise and the functions that settle it. */
  function gate<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // A gate may be rejected when nobody awaits it any more (the listing was overtaken before
    // it read the folder): that is the point, not an unhandled rejection.
    promise.catch(() => {});
    return { promise, resolve, reject };
  }

  /** A folder whose listing waits for `wait` (and fails when it is rejected). */
  function slowFolder(name: string, entries: files.DirectoryEntry[], wait: Promise<void>) {
    const dir = folder(name, entries);
    dir.values = async function* () {
      await wait;
      yield* entries;
    };
    return dir;
  }

  const one = (name: string) => [fileEntry(`${name}.mfe.json`, projectText(name), 1)];

  beforeEach(() => mocked.hasDirectoryPicker.mockReturnValue(true));

  it('keeps a newly synced folder when an older refresh finishes after it', async () => {
    const slow = gate();
    const a = slowFolder('A', one('A'), slow.promise);
    useLibraryStore.setState({ folder: { kind: 'live', name: 'A', handle: a }, status: 'ready' });
    const refresh = refreshLibrary();
    const b = folder('B', one('B'));
    mocked.pickDirectoryHandle.mockResolvedValue(b);
    expect(await syncFolder()).toBe(true);
    slow.resolve();
    expect(await refresh).toBe(false);
    expect(state().folder).toEqual({ kind: 'live', name: 'B', handle: b });
    expect(state().status).toBe('ready');
    expect(state().entries.map((e) => e.name)).toEqual(['B']);
    expect(mocked.storeValue).toHaveBeenLastCalledWith(files.LIBRARY_KEY, b);
  });

  it('ignores an older refresh that fails after a newer sync', async () => {
    const slow = gate();
    const a = slowFolder('A', one('A'), slow.promise);
    useLibraryStore.setState({ folder: { kind: 'live', name: 'A', handle: a }, status: 'ready' });
    const refresh = refreshLibrary();
    mocked.pickDirectoryHandle.mockResolvedValue(folder('B', one('B')));
    expect(await syncFolder()).toBe(true);
    slow.reject(new Error('disk'));
    expect(await refresh).toBe(false);
    expect(state().status).toBe('ready');
    expect(state().folder?.name).toBe('B');
    expect(state().entries.map((e) => e.name)).toEqual(['B']);
    expect(notices()).toHaveLength(0);
  });

  it('ignores a permission answer for an older refresh that arrives after a newer sync', async () => {
    const answer = gate<PermissionState>();
    const a = folder('A', one('A'), { query: 'prompt', request: 'granted' });
    a.requestPermission.mockReturnValue(answer.promise);
    useLibraryStore.setState({ folder: { kind: 'live', name: 'A', handle: a }, status: 'blocked' });
    const refresh = refreshLibrary(true);
    mocked.pickDirectoryHandle.mockResolvedValue(folder('B', one('B')));
    expect(await syncFolder()).toBe(true);
    answer.resolve('denied');
    expect(await refresh).toBe(false);
    expect(state()).toMatchObject({ status: 'ready', folder: { name: 'B' } });
  });

  it('does not store a sync that a newer one overtook', async () => {
    const slow = gate();
    const a = slowFolder('A', one('A'), slow.promise);
    const b = folder('B', one('B'));
    mocked.pickDirectoryHandle.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const first = syncFolder();
    await vi.waitFor(() => expect(state().folder?.name).toBe('A'));
    expect(await syncFolder()).toBe(true);
    slow.resolve();
    expect(await first).toBe(false);
    expect(state().folder?.name).toBe('B');
    expect(mocked.storeValue).toHaveBeenCalledTimes(1);
    expect(mocked.storeValue).toHaveBeenLastCalledWith(files.LIBRARY_KEY, b);
  });

  it('lets a sync win over the startup restore of a stored handle that resolves later', async () => {
    const stored = gate<unknown>();
    mocked.loadValue.mockReturnValue(stored.promise);
    const restore = restoreLibrary();
    const b = folder('B', one('B'));
    mocked.pickDirectoryHandle.mockResolvedValue(b);
    expect(await syncFolder()).toBe(true);
    const a = folder('A', one('A'));
    stored.resolve(a);
    await restore;
    expect(state().folder).toEqual({ kind: 'live', name: 'B', handle: b });
    expect(state().entries.map((e) => e.name)).toEqual(['B']);
    expect(a.queryPermission).not.toHaveBeenCalled();
    expect(mocked.storeValue).toHaveBeenLastCalledWith(files.LIBRARY_KEY, b);
  });

  describe('snapshots (no directory picker)', () => {
    beforeEach(() => mocked.hasDirectoryPicker.mockReturnValue(false));

    /** A `webkitdirectory` input file whose text arrives when `wait` resolves. */
    const input = (path: string, text: string, wait: Promise<void> = Promise.resolve()) =>
      Object.assign(new File([text], path.split('/').pop()!, { lastModified: 1 }), {
        webkitRelativePath: path,
        text: async () => {
          await wait;
          return text;
        },
      });

    it('lets a sync win over the startup restore of a stored snapshot that resolves later', async () => {
      const stored = gate<unknown>();
      mocked.loadValue.mockReturnValue(stored.promise);
      const restore = restoreLibrary();
      mocked.pickFolderViaInput.mockResolvedValue([input('New/b.mfe.json', projectText('B'))]);
      expect(await syncFolder()).toBe(true);
      stored.resolve({
        v: 1,
        folderName: 'Old',
        takenAt: 1,
        files: [{ fileName: 'a.mfe.json', lastModified: 1, text: projectText('A') }],
      });
      await restore;
      expect(state().folder).toMatchObject({ kind: 'snapshot', name: 'New' });
      expect(state().entries.map((e) => e.name)).toEqual(['B']);
    });

    it('keeps the newer snapshot when an older one finishes reading after it', async () => {
      const slow = gate();
      mocked.pickFolderViaInput
        .mockResolvedValueOnce([input('Slow/a.mfe.json', projectText('A'), slow.promise)])
        .mockResolvedValueOnce([input('Fast/b.mfe.json', projectText('B'))]);
      const first = syncFolder();
      await vi.waitFor(() => expect(mocked.pickFolderViaInput).toHaveBeenCalledTimes(1));
      expect(await syncFolder()).toBe(true);
      slow.resolve();
      expect(await first).toBe(false);
      expect(state().folder).toMatchObject({ kind: 'snapshot', name: 'Fast' });
      expect(state().entries.map((e) => e.name)).toEqual(['B']);
      expect(mocked.storeValue).toHaveBeenCalledTimes(1);
      expect(mocked.storeValue.mock.lastCall![1]).toMatchObject({ folderName: 'Fast' });
    });
  });
});
