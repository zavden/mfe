import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyProject,
  createFormula,
  parseProject,
  serializeProject,
  type Project,
} from '../../../model';
import { createMockEngine } from '../../../test/mockEngine';
import { history, loadProject, startRenderSync, useProjectStore, useUiStore } from '../../../store';
import {
  confirmDiscard,
  newProject,
  openExample,
  openLibraryEntry,
  openProject,
  openProjectText,
  renameProject,
  restoreDocumentHandle,
  saveProject,
  saveProjectAs,
} from '../actions';
import { useDialogStore } from '../dialogStore';
import { useLibraryStore } from '../libraryStore';
import { startDocumentTracking, useDocumentStore } from '../documentStore';
import * as files from '../files';
import { useNoticeStore } from '../noticeStore';
import { FIRST_EXAMPLE, STARTER_EXAMPLES, type StarterExample } from '../starterExamples';

vi.mock('../files', async (importOriginal) => {
  const original = await importOriginal<typeof import('../files')>();
  return {
    ...original,
    hasFileSystemAccess: vi.fn(() => false),
    ensureWritable: vi.fn(async () => true),
    storeHandle: vi.fn(async () => undefined),
    loadStoredHandle: vi.fn(async () => null),
    pickOpenHandle: vi.fn(),
    pickSaveHandle: vi.fn(),
    writeToHandle: vi.fn(),
    pickFileViaInput: vi.fn(),
    downloadText: vi.fn(),
  };
});

const mocked = vi.mocked(files);
const project = () => useProjectStore.getState().project;
const doc = () => useDocumentStore.getState();
const notices = () => useNoticeStore.getState().notices;

function projectWith(name: string, formulas: string[]): Project {
  const p = createEmptyProject(name);
  p.formulas = formulas.map((n) => createFormula({ name: n, source: 'x' }));
  return p;
}

/** Answer the dialog that is (or will be) on screen. */
async function answer(id: string) {
  await vi.waitFor(() => expect(useDialogStore.getState().queue.length).toBeGreaterThan(0));
  const dialog = useDialogStore.getState().queue[0]!;
  useDialogStore.getState().settle(dialog.key, id);
}

const handleNamed = (name: string) => ({ name, getFile: vi.fn(), createWritable: vi.fn() });

/** The next write finishes (or fails) when the test says so. */
function deferredWrite() {
  let finish!: () => void;
  let begin!: () => void;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mocked.writeToHandle.mockImplementationOnce(() => {
    begin();
    return pending;
  });
  return { started, finish: () => finish() };
}

const addFormula = (name: string) =>
  useProjectStore.getState().update((d) => {
    d.formulas.push(createFormula({ name }));
  });

/** A project of the synced folder, as the Projects dialog lists it. */
const entryOf = (name: string, handle: files.FileHandleLike | null, text?: string) => ({
  fileName: `${name}.mfe.json`,
  name,
  modified: 1,
  formulaCount: 1,
  project: projectWith(name, ['q']),
  textGeometry: {},
  text: text ?? serializeProject(projectWith(name, ['q'])),
  handle,
});

let stopTracking: () => void;
afterEach(() => stopTracking());

beforeEach(() => {
  vi.clearAllMocks();
  mocked.hasFileSystemAccess.mockReturnValue(false);
  mocked.writeToHandle.mockResolvedValue(undefined);
  mocked.ensureWritable.mockResolvedValue(true);
  mocked.loadStoredHandle.mockResolvedValue(null);
  loadProject(createEmptyProject());
  doc().markClean(project(), { fileName: null, handle: null });
  useDialogStore.setState({ queue: [] });
  useNoticeStore.getState().clear();
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
  stopTracking = startDocumentTracking();
});

describe('opening', () => {
  it('opens project text: replaces the project, clears history, selection and time', () => {
    useUiStore.setState({ selection: { kind: 'formula', id: 'x' }, time: 3 });
    useProjectStore.getState().update((d) => {
      d.formulas.push(createFormula({ name: 'old' }));
    });
    const text = serializeProject(projectWith('Opened', ['a', 'b']));
    expect(openProjectText(text, { fileName: 'opened.mfe.json', handle: null })).toBe(true);
    expect(project().meta.name).toBe('Opened');
    expect(project().formulas.map((f) => f.name)).toEqual(['a', 'b']);
    expect(history.canUndo()).toBe(false);
    expect(useUiStore.getState().selection).toEqual({ kind: 'none' });
    expect(useUiStore.getState().time).toBe(0);
    expect(doc()).toMatchObject({ dirty: false, fileName: 'opened.mfe.json' });
    expect(notices()).toHaveLength(0);
  });

  it('shows unreadable files as an error notice and keeps the project', () => {
    useProjectStore.getState().update((d) => {
      d.formulas.push(createFormula({ name: 'keep' }));
    });
    expect(openProjectText('not json', { fileName: 'bad.mfe.json', handle: null })).toBe(false);
    expect(openProjectText('{"format":"other"}', { fileName: null, handle: null })).toBe(false);
    expect(project().formulas.map((f) => f.name)).toEqual(['keep']);
    expect(notices().map((n) => n.kind)).toEqual(['error', 'error']);
    expect(notices()[0]!.title).toMatch(/bad\.mfe\.json/);
  });

  it('opens a file with semantic issues and lists them in a warning', () => {
    const broken = projectWith('Broken', ['a', 'a']); // duplicate names
    broken.formulas[0]!.glyphColors = { '3': '#FF0000' }; // colours without a snapshot
    expect(
      openProjectText(serializeProject(broken), { fileName: 'b.mfe.json', handle: null }),
    ).toBe(true);
    expect(project().meta.name).toBe('Broken');
    const [notice] = notices();
    expect(notice).toMatchObject({ kind: 'warning' });
    expect(notice!.title).toMatch(/Opened with 2 issues/);
    expect(notice!.details!.join(' ')).toMatch(/used more than once/);
  });

  it('opens a file with errors and says so in an error notice, which stays until dismissed', () => {
    const broken = projectWith('Too long', ['a']);
    broken.meta.duration = 1e300; // past the longest scene: an error (`scene-length`)
    expect(
      openProjectText(serializeProject(broken), { fileName: 'long.mfe.json', handle: null }),
    ).toBe(true);
    expect(project().meta.name).toBe('Too long');
    const [notice] = notices();
    expect(notice).toMatchObject({ kind: 'error' });
    expect(notice!.title).toMatch(/Opened with \d+ issues?/);
    expect(notice!.message).toMatch(/contains errors/);
  });

  it('opens through the file input fallback', async () => {
    const file = new File([serializeProject(projectWith('From input', ['q']))], 'input.mfe.json');
    mocked.pickFileViaInput.mockResolvedValue(file);
    await openProject();
    expect(project().meta.name).toBe('From input');
    expect(doc().fileName).toBe('input.mfe.json');
    expect(doc().handle).toBeNull();
  });

  it('opens through the File System Access API and keeps the handle', async () => {
    mocked.hasFileSystemAccess.mockReturnValue(true);
    const handle = {
      name: 'picked.mfe.json',
      getFile: async () =>
        new File([serializeProject(projectWith('Picked', []))], 'picked.mfe.json'),
      createWritable: vi.fn(),
    };
    mocked.pickOpenHandle.mockResolvedValue(handle);
    await openProject();
    expect(project().meta.name).toBe('Picked');
    expect(doc().handle).toBe(handle);
  });

  it('does nothing when the picker is cancelled', async () => {
    mocked.pickFileViaInput.mockResolvedValue(null);
    await openProject();
    expect(project().meta.name).toBe('Untitled');
    expect(notices()).toHaveLength(0);
  });
});

describe('Save As and the synced folder', () => {
  it('starts the picker in the synced folder when Chrome/Edge keep one', async () => {
    mocked.hasFileSystemAccess.mockReturnValue(true);
    const dir = { kind: 'directory' as const, name: 'Projects', values: vi.fn() };
    useLibraryStore.setState({ folder: { kind: 'live', name: 'Projects', handle: dir } });
    mocked.pickSaveHandle.mockResolvedValue(null);
    await saveProjectAs();
    expect(mocked.pickSaveHandle).toHaveBeenCalledWith('untitled.mfe.json', dir);
    useLibraryStore.setState({ folder: null });
    await saveProjectAs();
    expect(mocked.pickSaveHandle).toHaveBeenLastCalledWith('untitled.mfe.json', null);
  });
});

describe('opening from the project library', () => {
  it('reads a file with a handle afresh and keeps the handle for Save', async () => {
    const onDisk = serializeProject(projectWith('Fresh', ['later']));
    const handle = {
      name: 'live.mfe.json',
      getFile: async () => new File([onDisk], 'live.mfe.json'),
      createWritable: vi.fn(),
    };
    expect(await openLibraryEntry(entryOf('Live', handle))).toBe(true);
    expect(project().meta.name).toBe('Fresh');
    expect(project().formulas.map((f) => f.name)).toEqual(['later']);
    expect(doc()).toMatchObject({ fileName: 'Live.mfe.json', handle, dirty: false });
    expect(mocked.storeHandle).toHaveBeenLastCalledWith(handle, doc().documentId);
  });

  it('opens a snapshot entry from its text, without a handle', async () => {
    expect(await openLibraryEntry(entryOf('Snap', null))).toBe(true);
    expect(project().meta.name).toBe('Snap');
    expect(doc()).toMatchObject({ fileName: 'Snap.mfe.json', handle: null });
  });

  it('asks about unsaved work first and keeps the project on Cancel', async () => {
    useProjectStore.getState().update((d) => {
      d.formulas.push(createFormula({ name: 'work' }));
    });
    const pending = openLibraryEntry(entryOf('Other', null));
    await answer('cancel');
    expect(await pending).toBe(false);
    expect(project().formulas.map((f) => f.name)).toEqual(['work']);
  });

  it('reports a file that can no longer be read', async () => {
    const handle = {
      name: 'gone.mfe.json',
      getFile: () => Promise.reject(new DOMException('gone', 'NotFoundError')),
      createWritable: vi.fn(),
    };
    expect(await openLibraryEntry(entryOf('Gone', handle))).toBe(false);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.title).toBe('Could not read Gone.mfe.json');
    expect(project().meta.name).toBe('Untitled');
  });

  it('reports a snapshot file that is no longer a project', async () => {
    expect(await openLibraryEntry(entryOf('Bad', null, '{"x":1}'))).toBe(false);
    expect(notices()[0]!.title).toBe('Could not open Bad.mfe.json');
  });
});

describe('opening an example of the app', () => {
  it('opens it as a project without a file, with nothing to undo and nothing to tell', async () => {
    expect(await openExample(FIRST_EXAMPLE)).toBe(true);
    expect(project().meta.name).toBe('Completing the square');
    expect(project().formulas.length).toBeGreaterThan(1);
    expect(project().clips.length).toBeGreaterThan(1);
    // It is the user's project now, and has no file: Save asks where it goes.
    expect(doc()).toMatchObject({ fileName: null, handle: null, dirty: false });
    expect(history.canUndo()).toBe(false);
    expect(notices()).toEqual([]);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('opens each of them', async () => {
    for (const example of STARTER_EXAMPLES) {
      expect(await openExample(example)).toBe(true);
      expect(project().meta.name).toBe(example.name);
      expect(notices()).toEqual([]);
    }
  });

  it('asks about unsaved work first: Cancel keeps the project, Don’t save opens the example', async () => {
    addFormula('work');
    const cancelled = openExample(FIRST_EXAMPLE);
    await answer('cancel');
    expect(await cancelled).toBe(false);
    expect(project().formulas.map((f) => f.name)).toEqual(['work']);
    expect(doc().dirty).toBe(true);

    const discarded = openExample(FIRST_EXAMPLE);
    await answer('discard');
    expect(await discarded).toBe(true);
    expect(project().meta.name).toBe('Completing the square');
    expect(doc().dirty).toBe(false);
  });

  it('reports one that is no project, and keeps the project', async () => {
    const broken: StarterExample = { id: 'broken', name: 'Broken', text: () => '{"x":1}' };
    expect(await openExample(broken)).toBe(false);
    expect(notices()[0]!.title).toBe('Could not open the file');
    expect(project().meta.name).toBe('Untitled');
  });
});

describe('unsaved changes guard', () => {
  const edit = () =>
    useProjectStore.getState().update((d) => {
      d.formulas.push(createFormula({ name: 'work' }));
    });

  it('does not ask when the project is clean', async () => {
    expect(await confirmDiscard()).toBe(true);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('New asks first: Cancel keeps the project, Don’t save discards it', async () => {
    edit();
    const cancelled = newProject();
    await answer('cancel');
    await cancelled;
    expect(project().formulas).toHaveLength(1);

    const discarded = newProject();
    await answer('discard');
    await discarded;
    expect(project().formulas).toHaveLength(0);
    expect(doc().dirty).toBe(false);
    expect(mocked.downloadText).not.toHaveBeenCalled();
  });

  it('Save saves (download fallback) and then continues', async () => {
    edit();
    const pending = newProject();
    await answer('save');
    await pending;
    expect(mocked.downloadText).toHaveBeenCalledTimes(1);
    expect(project().formulas).toHaveLength(0);
  });

  it('Open picks the file first, then asks, and stays put when cancelled', async () => {
    edit();
    mocked.pickFileViaInput.mockResolvedValue(
      new File([serializeProject(projectWith('Other', ['z']))], 'other.mfe.json'),
    );
    const cancelled = openProject();
    await answer('cancel');
    await cancelled;
    expect(project().formulas.map((f) => f.name)).toEqual(['work']);

    const discarded = openProject();
    await answer('discard');
    await discarded;
    expect(project().meta.name).toBe('Other');
  });

  it('after Save in the dialog, an edit made during the save keeps the project', async () => {
    useDocumentStore.setState({ handle: handleNamed('slow.mfe.json') });
    edit();
    const write = deferredWrite();
    const pending = newProject();
    await answer('save');
    await vi.waitFor(() => expect(mocked.writeToHandle).toHaveBeenCalled());
    edit(); // during the save
    write.finish();
    await pending;
    expect(project().formulas).toHaveLength(2); // New did not happen
    expect(doc().dirty).toBe(true);
  });

  it('a completed save from the discard dialog cannot discard a replacement document', async () => {
    useDocumentStore.setState({ handle: handleNamed('old.mfe.json') });
    edit();
    const write = deferredWrite();
    const pending = newProject();
    await answer('save');
    await write.started;
    openProjectText(serializeProject(projectWith('Replacement', [])), {
      fileName: 'replacement.mfe.json',
      handle: null,
    });
    const replacement = doc();
    write.finish();
    await pending;
    expect(project().meta.name).toBe('Replacement');
    expect(doc()).toBe(replacement);
  });

  it('Open does not ask about unsaved work when the chosen file is unreadable', async () => {
    edit();
    mocked.pickFileViaInput.mockResolvedValue(new File(['nope'], 'bad.mfe.json'));
    await openProject();
    expect(useDialogStore.getState().queue).toHaveLength(0);
    expect(project().formulas).toHaveLength(1);
    expect(notices()[0]).toMatchObject({ kind: 'error' });
  });

  // Open reads the chosen file before it asks. "Save", in the question, may write that very file
  // (it is the one that is open, or the destination Save As is given): what opens is then what
  // Save wrote, not what was read before it.
  describe('Open after Save in the question', () => {
    const FIRST = 'first/lesson.mfe.json';
    const OTHER = 'other/lesson.mfe.json';
    /** The files of a disk of the test's: what Save writes to one, a later read of it gives. */
    const disk = new Map<string, string>();
    const read = (path: string) => new File([disk.get(path)!], path.slice(path.indexOf('/') + 1));
    /** A handle of the file at `path`: a new object each time, as a picker gives one for a file
     * it gave before. */
    const handleAt = (path: string) => ({
      path,
      name: path.slice(path.indexOf('/') + 1),
      getFile: vi.fn(async () => read(path)),
      createWritable: vi.fn(),
    });
    const summary = (p: Project) => ({
      name: p.meta.name,
      formulas: p.formulas.map((f) => f.name),
    });
    const shown = () => summary(project());
    const stored = (path: string) => {
      const parsed = parseProject(disk.get(path)!);
      if (!parsed.ok) throw new Error(parsed.error);
      return summary(parsed.project);
    };

    beforeEach(() => {
      disk.clear();
      disk.set(FIRST, serializeProject(projectWith('Lesson', [])));
      disk.set(OTHER, serializeProject(projectWith('Another lesson', [])));
      mocked.hasFileSystemAccess.mockReturnValue(true);
      mocked.writeToHandle.mockImplementation(async (handle, text) => {
        disk.set((handle as ReturnType<typeof handleAt>).path, text);
      });
    });

    /** The file at `first/` is open, with work that is not saved. */
    async function openAndEdit() {
      const handle = handleAt(FIRST);
      mocked.pickOpenHandle.mockResolvedValueOnce(handle);
      await openProject();
      edit();
      expect(doc()).toMatchObject({ dirty: true, fileName: 'lesson.mfe.json', handle });
      return handle;
    }

    /** File → Open… of `handle`, and "Save" in the question. */
    async function openAnsweringSave(handle: ReturnType<typeof handleAt>) {
      mocked.pickOpenHandle.mockResolvedValueOnce(handle);
      const pending = openProject();
      await answer('save');
      await pending;
    }

    it('opens what Save wrote when the chosen file is the one that is open', async () => {
      await openAndEdit();
      const again = handleAt(FIRST);
      await openAnsweringSave(again);
      expect(stored(FIRST)).toEqual({ name: 'Lesson', formulas: ['work'] });
      expect(shown()).toEqual({ name: 'Lesson', formulas: ['work'] });
      expect(doc()).toMatchObject({ dirty: false, handle: again });
      expect(notices()).toEqual([]);
      // The next Save writes what is on screen: nothing of the saved work is lost.
      renameProject('Final title');
      expect(await saveProject()).toBe(true);
      expect(stored(FIRST)).toEqual({ name: 'Final title', formulas: ['work'] });
    });

    it('opens the other file when it only has the name of the one that is open', async () => {
      await openAndEdit();
      const other = handleAt(OTHER);
      await openAnsweringSave(other);
      expect(shown()).toEqual({ name: 'Another lesson', formulas: [] });
      expect(doc()).toMatchObject({ dirty: false, handle: other });
      renameProject('Final title');
      expect(await saveProject()).toBe(true);
      expect(stored(OTHER)).toEqual({ name: 'Final title', formulas: [] });
      expect(stored(FIRST)).toEqual({ name: 'Lesson', formulas: ['work'] });
    });

    it('does the same for a project of the synced folder', async () => {
      await openAndEdit();
      const again = handleAt(FIRST);
      const pending = openLibraryEntry(entryOf('lesson', again));
      await answer('save');
      expect(await pending).toBe(true);
      expect(shown()).toEqual({ name: 'Lesson', formulas: ['work'] });
      expect(doc()).toMatchObject({ dirty: false, handle: again });
    });

    it('opens what Save As wrote when its destination is the file being opened', async () => {
      edit(); // a document that has no file yet
      mocked.pickSaveHandle.mockResolvedValueOnce(handleAt(FIRST));
      const chosen = handleAt(FIRST);
      await openAnsweringSave(chosen);
      expect(stored(FIRST)).toEqual({ name: 'Untitled', formulas: ['work'] });
      expect(shown()).toEqual({ name: 'Untitled', formulas: ['work'] });
      expect(doc()).toMatchObject({ dirty: false, fileName: 'lesson.mfe.json', handle: chosen });
    });

    it('keeps the saved document, and says why, when the file cannot be read again', async () => {
      const open = await openAndEdit();
      const again = handleAt(FIRST);
      again.getFile
        .mockImplementationOnce(async () => read(FIRST))
        .mockRejectedValueOnce(new DOMException('gone', 'NotFoundError'));
      await openAnsweringSave(again);
      expect(stored(FIRST)).toEqual({ name: 'Lesson', formulas: ['work'] });
      expect(shown()).toEqual({ name: 'Lesson', formulas: ['work'] });
      // The document that was open, not one opened anew: its file, its handle, its history.
      expect(doc()).toMatchObject({ dirty: false, handle: open });
      expect(history.canUndo()).toBe(true);
      expect(notices().map((n) => n.title)).toEqual(['Could not read lesson.mfe.json']);
    });

    it('keeps the document when it is edited while the file is read again', async () => {
      await openAndEdit();
      const other = handleAt(OTHER);
      let finishRead!: () => void;
      const reading = new Promise<void>((resolve) => {
        finishRead = resolve;
      });
      other.getFile
        .mockImplementationOnce(async () => read(OTHER))
        .mockImplementationOnce(async () => {
          await reading;
          return read(OTHER);
        });
      mocked.pickOpenHandle.mockResolvedValueOnce(other);
      const pending = openProject();
      await answer('save');
      await vi.waitFor(() => expect(other.getFile).toHaveBeenCalledTimes(2));
      addFormula('later'); // the leave to replace the project was for the work saved before it
      finishRead();
      await pending;
      expect(shown()).toEqual({ name: 'Lesson', formulas: ['work', 'later'] });
      expect(doc().dirty).toBe(true);
      expect(stored(FIRST)).toEqual({ name: 'Lesson', formulas: ['work'] });
      expect(notices()).toEqual([]);
    });

    it('reads a file once when nothing was saved on the way', async () => {
      await openAndEdit();
      const other = handleAt(OTHER);
      mocked.pickOpenHandle.mockResolvedValueOnce(other);
      const pending = openProject();
      await answer('discard');
      await pending;
      expect(shown()).toEqual({ name: 'Another lesson', formulas: [] });
      expect(other.getFile).toHaveBeenCalledTimes(1);
      expect(stored(FIRST)).toEqual({ name: 'Lesson', formulas: [] });
    });
  });
});

describe('saving', () => {
  it('downloads <name>.mfe.json without the File System Access API, and marks the project saved', async () => {
    useProjectStore.getState().update((d) => {
      d.meta.name = 'My Scene';
      d.formulas.push(createFormula({ name: 'a', source: 'x' }));
    });
    expect(doc().dirty).toBe(true);
    expect(await saveProject()).toBe(true);
    const [fileName, text] = mocked.downloadText.mock.calls[0]!;
    expect(fileName).toBe('my-scene.mfe.json');
    const parsed = parseProject(text);
    expect(parsed.ok && parsed.project.formulas.map((f) => f.name)).toEqual(['a']);
    expect(doc().baseline).toBe(project());
  });

  it('Save writes to the kept handle; Save As asks for a new one', async () => {
    mocked.hasFileSystemAccess.mockReturnValue(true);
    const handle = { name: 'one.mfe.json', getFile: vi.fn(), createWritable: vi.fn() };
    const other = { name: 'two.mfe.json', getFile: vi.fn(), createWritable: vi.fn() };
    mocked.pickSaveHandle.mockResolvedValueOnce(handle).mockResolvedValueOnce(other);

    expect(await saveProject()).toBe(true); // no handle yet: asks where
    expect(mocked.pickSaveHandle).toHaveBeenCalledWith('untitled.mfe.json', null);
    expect(mocked.writeToHandle).toHaveBeenLastCalledWith(handle, serializeProject(project()));
    expect(doc()).toMatchObject({ fileName: 'one.mfe.json', dirty: false });

    expect(await saveProject()).toBe(true); // overwrites silently
    expect(mocked.pickSaveHandle).toHaveBeenCalledTimes(1);
    expect(mocked.writeToHandle).toHaveBeenCalledTimes(2);

    expect(await saveProjectAs()).toBe(true);
    expect(mocked.writeToHandle).toHaveBeenLastCalledWith(other, expect.any(String));
    expect(doc().handle).toBe(other);
  });

  it('a cancelled picker saves nothing and leaves the project dirty', async () => {
    mocked.hasFileSystemAccess.mockReturnValue(true);
    mocked.pickSaveHandle.mockResolvedValue(null);
    useProjectStore.getState().update((d) => {
      d.formulas.push(createFormula({ name: 'a' }));
    });
    expect(await saveProject()).toBe(false);
    expect(doc().dirty).toBe(true);
    expect(mocked.writeToHandle).not.toHaveBeenCalled();
  });

  it('falls back to a download when the picker fails, and reports a failed write', async () => {
    mocked.hasFileSystemAccess.mockReturnValue(true);
    mocked.pickSaveHandle.mockRejectedValue(new Error('SecurityError'));
    expect(await saveProjectAs()).toBe(true);
    expect(mocked.downloadText).toHaveBeenCalledTimes(1);
    expect(notices()[0]).toEqual({
      id: expect.any(Number),
      kind: 'warning',
      title: 'Saved as a download',
      message:
        'The file picker is not available here, so the project was downloaded as untitled.mfe.json.',
      details: ['Error: SecurityError'],
    });

    const handle = { name: 'x.mfe.json', getFile: vi.fn(), createWritable: vi.fn() };
    useDocumentStore.setState({ handle });
    mocked.writeToHandle.mockRejectedValue(new Error('disk full'));
    expect(await saveProject()).toBe(false);
    expect(notices().at(-1)).toEqual({
      id: expect.any(Number),
      kind: 'error',
      title: 'Could not save x.mfe.json',
      message:
        'The browser may have lost permission to the file, or the disk is full. Use File → Save As… to save a copy.',
      details: ['Error: disk full'],
    });
  });

  it('an edit during a slow save stays unsaved: the file has the earlier state', async () => {
    const handle = handleNamed('slow.mfe.json');
    useDocumentStore.setState({ handle });
    addFormula('a');
    const written = project();
    const write = deferredWrite();
    const saving = saveProject();
    addFormula('b');
    write.finish();
    expect(await saving).toBe(true);
    expect(mocked.writeToHandle).toHaveBeenCalledWith(handle, serializeProject(written));
    expect(doc()).toMatchObject({ baseline: written, dirty: true, fileName: 'slow.mfe.json' });
    history.undo();
    expect(doc().dirty).toBe(false); // back at the saved state
  });

  it('New during a save: the file and its handle stay with the old document', async () => {
    useDocumentStore.setState({ handle: handleNamed('old.mfe.json'), fileName: 'old.mfe.json' });
    const write = deferredWrite();
    const saving = saveProject();
    await write.started;
    await newProject(); // nothing unsaved: no question
    const fresh = project();
    write.finish();
    expect(await saving).toBe(true);
    expect(doc()).toMatchObject({ baseline: fresh, dirty: false, fileName: null, handle: null });
    expect(await saveProject()).toBe(true); // the new document has no file: asks (download here)
    expect(mocked.downloadText).toHaveBeenCalledTimes(1);
    expect(mocked.writeToHandle).toHaveBeenCalledTimes(1);
  });

  it('of two overlapping saves, the second writes and sets the saved state after the first', async () => {
    useDocumentStore.setState({ handle: handleNamed('twice.mfe.json') });
    const first = deferredWrite();
    const saving1 = saveProject();
    await first.started;
    addFormula('a');
    const latest = project();
    const second = deferredWrite();
    const saving2 = saveProject();
    expect(mocked.writeToHandle).toHaveBeenCalledTimes(1);
    first.finish();
    expect(await saving1).toBe(true);
    await second.started;
    second.finish();
    expect(await saving2).toBe(true);
    expect(doc()).toMatchObject({ baseline: latest, dirty: false });
  });

  it('a render that amends the project during the save does not make it unsaved', async () => {
    const stopSync = startRenderSync(createMockEngine());
    try {
      useProjectStore.getState().update((d) => {
        d.formulas.push(createFormula({ name: 'a', source: 'a+b' })); // no snapshot until rendered
      });
      useDocumentStore.setState({ handle: handleNamed('amend.mfe.json') });
      const write = deferredWrite();
      const saving = saveProject();
      await new Promise((resolve) => setTimeout(resolve, 0)); // the render lands and amends
      expect(project().formulas[0]!.snapshot).not.toBeNull();
      write.finish();
      expect(await saving).toBe(true);
      expect(doc()).toMatchObject({ baseline: project(), dirty: false });
    } finally {
      stopSync();
    }
  });

  it('Save As reports a failed write as such, without a download', async () => {
    mocked.hasFileSystemAccess.mockReturnValue(true);
    mocked.pickSaveHandle.mockResolvedValue(handleNamed('x.mfe.json'));
    mocked.writeToHandle.mockRejectedValue(new Error('disk full'));
    addFormula('a');
    expect(await saveProjectAs()).toBe(false);
    expect(mocked.downloadText).not.toHaveBeenCalled();
    expect(doc().dirty).toBe(true);
    expect(notices().at(-1)).toMatchObject({
      kind: 'error',
      title: 'Could not save x.mfe.json',
      details: ['Error: disk full'],
    });
  });

  it('says what to do when a chosen file cannot be read', async () => {
    mocked.hasFileSystemAccess.mockReturnValue(true);
    mocked.pickOpenHandle.mockResolvedValue({
      name: 'moved.mfe.json',
      getFile: () => Promise.reject(new Error('NotFoundError')),
      createWritable: vi.fn(),
    });
    await openProject();
    expect(notices().at(-1)).toEqual({
      id: expect.any(Number),
      kind: 'error',
      title: 'Could not read moved.mfe.json',
      message:
        'The browser may have lost access to it (moved, renamed or deleted). Try File → Open… again.',
      details: ['Error: NotFoundError'],
    });
  });
});

describe('renameProject', () => {
  it('renames the project as one undo step, trims, and ignores no change', () => {
    history.clear();
    renameProject('  My scene ');
    expect(project().meta.name).toBe('My scene');
    expect(history.canUndo()).toBe(true);
    history.clear();
    renameProject('My scene'); // the same name: no step
    expect(history.canUndo()).toBe(false);
    renameProject('   ');
    expect(project().meta.name).toBe('Untitled');
  });
});

describe('the file handle across reloads', () => {
  it('Save asks the browser for permission first, and falls back to Save As when refused', async () => {
    const handle = {
      ...handleNamed('kept.mfe.json'),
      queryPermission: vi.fn(),
      requestPermission: vi.fn(),
    };
    useDocumentStore.setState({ handle, fileName: 'kept.mfe.json' });
    expect(await saveProject()).toBe(true);
    expect(mocked.ensureWritable).toHaveBeenCalledWith(handle);
    expect(mocked.writeToHandle).toHaveBeenCalledWith(handle, expect.any(String));
    await vi.waitFor(() =>
      expect(mocked.storeHandle).toHaveBeenLastCalledWith(handle, doc().documentId),
    );
    mocked.ensureWritable.mockResolvedValueOnce(false);
    expect(await saveProject()).toBe(true); // Save As: the download fallback here
    expect(mocked.downloadText).toHaveBeenCalled();
    expect(notices().some((n) => n.title === 'Not allowed to write kept.mfe.json')).toBe(true);
    expect(mocked.storeHandle).toHaveBeenLastCalledWith(null, doc().documentId);
  });

  it('puts the stored handle back after a restore when it matches the document', async () => {
    const handle = handleNamed('kept.mfe.json');
    mocked.loadStoredHandle.mockResolvedValue({ documentId: 'd_kept', handle });
    doc().markDirty({ fileName: 'kept.mfe.json', documentId: 'd_kept' }); // as the restore does
    await restoreDocumentHandle();
    expect(doc().handle).toBe(handle);
    // Another file name: left alone.
    doc().markDirty({ fileName: 'other.mfe.json', documentId: 'd_kept' });
    await restoreDocumentHandle();
    expect(doc().handle).toBeNull();
    // A document replaced while the handle was loading: left alone too.
    doc().markDirty({ fileName: 'kept.mfe.json', documentId: 'd_kept' });
    const pending = restoreDocumentHandle();
    doc().beginDocument(project(), { fileName: null, handle: null });
    await pending;
    expect(doc().handle).toBeNull();
  });

  it('leaves alone a handle another document stored for a file of the same name', async () => {
    // Two tabs: this one autosaved `a/scene.mfe.json` with unsaved work, the other one saved
    // `b/scene.mfe.json` last and so stored its handle. The names match, the documents do not.
    const other = handleNamed('scene.mfe.json');
    mocked.loadStoredHandle.mockResolvedValue({ documentId: 'd_other', handle: other });
    doc().markDirty({ fileName: 'scene.mfe.json', documentId: 'd_this' });
    await restoreDocumentHandle();
    expect(doc().handle).toBeNull();
    // Save asks where (the download fallback here) instead of writing the other file.
    expect(await saveProject()).toBe(true);
    expect(mocked.writeToHandle).not.toHaveBeenCalled();
    expect(mocked.downloadText).toHaveBeenCalledTimes(1);
    // A handle stored by an earlier version of the app (no document id) is left alone too.
    mocked.loadStoredHandle.mockResolvedValue({ documentId: null, handle: other });
    doc().markDirty({ fileName: 'scene.mfe.json', documentId: 'd_this' });
    await restoreDocumentHandle();
    expect(doc().handle).toBeNull();
  });

  it('remembers the handle of an opened file and forgets it on New', async () => {
    mocked.hasFileSystemAccess.mockReturnValue(true);
    const handle = {
      name: 'picked.mfe.json',
      getFile: async () =>
        new File([serializeProject(projectWith('Picked', []))], 'picked.mfe.json'),
      createWritable: vi.fn(),
    };
    mocked.pickOpenHandle.mockResolvedValue(handle);
    await openProject();
    const opened = doc().documentId;
    expect(mocked.storeHandle).toHaveBeenLastCalledWith(handle, opened);
    await newProject();
    expect(doc().documentId).not.toBe(opened);
    expect(mocked.storeHandle).toHaveBeenLastCalledWith(null, doc().documentId);
  });
});
