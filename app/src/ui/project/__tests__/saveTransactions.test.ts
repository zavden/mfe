import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, serializeProject } from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import {
  newProject,
  openLibraryEntry,
  renameProject,
  replaceProject,
  saveProject,
  saveProjectAs,
} from '../actions';
import { recoverAutosave } from '../autosave';
import { useDialogStore } from '../dialogStore';
import { startDocumentTracking, useDocumentStore } from '../documentStore';
import * as files from '../files';
import { useNoticeStore } from '../noticeStore';

// Keep the production serializer and writable adapter. Only browser acquisition/storage is mocked.
vi.mock('../files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../files')>()),
  hasFileSystemAccess: vi.fn(() => true),
  ensureWritable: vi.fn(async () => true),
  pickSaveHandle: vi.fn(),
  storeHandle: vi.fn(async () => undefined),
  downloadText: vi.fn(),
}));

const mocked = vi.mocked(files);
const project = () => useProjectStore.getState().project;
const doc = () => useDocumentStore.getState();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Private transactional file: pending writes become bytes only at close, as in the native API. */
function destination(name = 'scene.mfe.json', pause?: 'write' | 'close') {
  const initial = serializeProject(createEmptyProject('Existing file'));
  const state = { text: initial, opened: 0, committed: [] as string[], aborted: [] as number[] };
  const entered = deferred<void>();
  const release = deferred<void>();
  const fail = new Set<number>();
  const handles = new Set<files.FileHandleLike>();
  function handle() {
    const value = {
      name,
      isSameEntry: async (other: files.FileHandleLike) => handles.has(other),
      getFile: async () => new File([state.text], name),
      createWritable: async () => {
        const index = ++state.opened;
        let pending = '';
        return {
          write: async (data: Parameters<files.WritableLike['write']>[0]) => {
            if (index === 1 && pause === 'write') {
              entered.resolve();
              await release.promise;
            }
            if (fail.has(index)) throw new Error('disk full');
            if (typeof data !== 'string') throw new Error('Expected project text');
            pending = data;
          },
          close: async () => {
            if (index === 1 && pause === 'close') {
              entered.resolve();
              await release.promise;
            }
            state.text = pending;
            state.committed.push(JSON.parse(pending).meta.name);
          },
          abort: async () => {
            state.aborted.push(index);
          },
        };
      },
    };
    handles.add(value);
    return value;
  }
  return {
    initial,
    state,
    handle,
    entered: entered.promise,
    release: () => release.resolve(),
    fail,
  };
}

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));
let stopTracking: () => void;

beforeEach(() => {
  vi.resetAllMocks();
  mocked.hasFileSystemAccess.mockReturnValue(true);
  mocked.ensureWritable.mockResolvedValue(true);
  mocked.storeHandle.mockResolvedValue(undefined);
  localStorage.clear();
  loadProject(createEmptyProject('Project A'));
  doc().beginDocument(project(), { fileName: null, handle: null });
  useNoticeStore.getState().clear();
  stopTracking = startDocumentTracking();
});

afterEach(() => stopTracking());

describe('physical save transactions', () => {
  it.each([
    ['write', false],
    ['close', false],
    ['write', true],
    ['close', true],
  ] as const)('orders a delayed first %s (aliased handle: %s)', async (pause, alias) => {
    const file = destination('ordered.mfe.json', pause);
    const firstHandle = file.handle();
    useDocumentStore.setState({ handle: firstHandle });
    renameProject('First save');
    const first = saveProject();
    await file.entered;
    renameProject('Second save');
    const latest = project();
    const latestHandle = alias ? file.handle() : firstHandle;
    useDocumentStore.setState({ handle: latestHandle });
    const second = saveProject();
    await nextTurn();
    const openedWhileFirstPending = file.state.opened;
    file.release();
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(openedWhileFirstPending).toBe(1);
    expect(file.state.committed).toEqual(['First save', 'Second save']);
    expect(file.state.text).toBe(serializeProject(latest));
    expect(doc()).toMatchObject({ baseline: latest, dirty: false, handle: latestHandle });
  });

  it('reserves save order before an earlier permission request resolves', async () => {
    const file = destination();
    const handle = { ...file.handle(), queryPermission: vi.fn(), requestPermission: vi.fn() };
    useDocumentStore.setState({ handle });
    const permission = deferred<boolean>();
    mocked.ensureWritable.mockReturnValueOnce(permission.promise);
    renameProject('First save');
    const first = saveProject();
    renameProject('Second save');
    const latest = project();
    const second = saveProject();
    await nextTurn();
    const openedBeforePermission = file.state.opened;
    permission.resolve(true);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(openedBeforePermission).toBe(0);
    expect(file.state.text).toBe(serializeProject(latest));
    expect(file.state.committed).toEqual(['First save', 'Second save']);
  });

  it('keeps the last successful bytes and baseline when the newer write fails, and permits retry', async () => {
    const file = destination('retry.mfe.json', 'close');
    file.fail.add(2);
    const handle = file.handle();
    useDocumentStore.setState({ handle });
    renameProject('Saved earlier');
    const earlier = project();
    const first = saveProject();
    await file.entered;
    renameProject('Still unsaved');
    const latest = project();
    const second = saveProject();
    await nextTurn();
    file.release();
    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(file.state.text).toBe(serializeProject(earlier));
    expect(file.state.aborted).toEqual([2]);
    expect(doc()).toMatchObject({ baseline: earlier, dirty: true, handle });
    expect(await saveProject()).toBe(true);
    expect(file.state.text).toBe(serializeProject(latest));
    expect(doc()).toMatchObject({ baseline: latest, dirty: false });
  });

  it('a failed earlier write releases the next save', async () => {
    const file = destination('retry.mfe.json', 'write');
    file.fail.add(1);
    useDocumentStore.setState({ handle: file.handle() });
    const first = saveProject();
    await file.entered;
    renameProject('Successful later');
    const latest = project();
    const second = saveProject();
    file.release();
    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(file.state.text).toBe(serializeProject(latest));
    expect(doc()).toMatchObject({ baseline: latest, dirty: false });
  });

  it('Save As to a different file can commit while the earlier file is still closing', async () => {
    const oldFile = destination('old.mfe.json', 'close');
    useDocumentStore.setState({ handle: oldFile.handle() });
    const first = saveProject();
    await oldFile.entered;
    const newFile = destination('new.mfe.json');
    const newHandle = newFile.handle();
    mocked.pickSaveHandle.mockResolvedValue(newHandle);
    renameProject('New destination');
    const latest = project();
    try {
      expect(await saveProjectAs()).toBe(true);
      expect(newFile.state.text).toBe(serializeProject(latest));
    } finally {
      oldFile.release();
      await first;
    }
    expect(doc()).toMatchObject({ baseline: latest, dirty: false, handle: newHandle });
  });

  it('a later same-file save waits for an earlier picker without moving its snapshot', async () => {
    const file = destination();
    const handle = file.handle();
    useDocumentStore.setState({ handle });
    const picker = deferred<files.FileHandleLike | null>();
    mocked.pickSaveHandle.mockReturnValue(picker.promise);
    const first = saveProjectAs();
    renameProject('Latest command');
    const latest = project();
    const second = saveProject();
    await nextTurn();
    const openedBeforePicker = file.state.opened;
    picker.resolve(file.handle());
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(openedBeforePicker).toBe(0);
    expect(file.state.committed).toEqual(['Project A', 'Latest command']);
    expect(file.state.text).toBe(serializeProject(latest));
  });
});

describe('Save As command ownership', () => {
  it('a replacement can save while an old picker is open, whose choice then gets a copy', async () => {
    const picker = deferred<files.FileHandleLike | null>();
    mocked.pickSaveHandle.mockReturnValue(picker.promise);
    const original = project();
    const staleSave = saveProjectAs();
    const replacementFile = destination('b.mfe.json');
    const replacementHandle = replacementFile.handle();
    replaceProject(createEmptyProject('Project B'), {
      fileName: replacementHandle.name,
      handle: replacementHandle,
    });
    const replacement = project();
    const saving = saveProject();
    await nextTurn();
    const openedBeforeOldPicker = replacementFile.state.opened;
    const staleDestination = destination('a-copy.mfe.json');
    picker.resolve(staleDestination.handle());
    // False: the document that is open was not saved by the old command.
    expect(await Promise.all([staleSave, saving])).toEqual([false, true]);
    expect(openedBeforeOldPicker).toBe(1);
    // The destination the user chose for Project A receives it; Project B keeps its own file.
    expect(staleDestination.state.text).toBe(serializeProject(original));
    expect(staleDestination.state.opened).toBe(1);
    expect(replacementFile.state.text).toBe(serializeProject(replacement));
    expect(doc()).toMatchObject({ baseline: replacement, dirty: false, handle: replacementHandle });
    expect(useNoticeStore.getState().notices).toMatchObject([
      {
        kind: 'warning',
        title: 'Saved a copy as a-copy.mfe.json',
        message:
          '“Project A” was replaced by another project before it was saved. a-copy.mfe.json holds “Project A”, not the project that is open now.',
      },
    ]);
  });

  it('a copy over the file of the new document waits for its save and leaves it unsaved', async () => {
    const picker = deferred<files.FileHandleLike | null>();
    mocked.pickSaveHandle.mockReturnValue(picker.promise);
    const original = project();
    const oldSave = saveProjectAs();
    const file = destination('b.mfe.json', 'close');
    const handle = file.handle();
    replaceProject(createEmptyProject('Project B'), { fileName: handle.name, handle });
    const replacement = project();
    const saving = saveProject();
    await file.entered;
    // The user picks the very file Project B is being saved to, through another handle.
    picker.resolve(file.handle());
    await nextTurn();
    const openedWhileSaving = file.state.opened;
    file.release();
    expect(await Promise.all([oldSave, saving])).toEqual([false, true]);
    expect(openedWhileSaving).toBe(1);
    expect(file.state.committed).toEqual(['Project B', 'Project A']);
    // Its file holds Project A now: Project B has unsaved changes again, against that content.
    expect(project()).toBe(replacement);
    expect(doc()).toMatchObject({
      baseline: original,
      dirty: true,
      handle,
      fileName: 'b.mfe.json',
    });
  });

  it('cancels an old queued write while its already-open predecessor finishes in the background', async () => {
    const file = destination('old.mfe.json', 'close');
    useDocumentStore.setState({ handle: file.handle() });
    const original = project();
    const first = saveProject();
    await file.entered;
    renameProject('Queued old revision');
    const queued = saveProject();
    replaceProject(createEmptyProject('Project B'), { fileName: null, handle: null });
    const replacement = doc();
    file.release();
    expect(await Promise.all([first, queued])).toEqual([true, false]);
    expect(file.state.opened).toBe(1);
    expect(file.state.text).toBe(serializeProject(original));
    expect(doc()).toBe(replacement);
  });

  it('uses the same-session snapshot from before the picker and leaves later edits dirty', async () => {
    const picker = deferred<files.FileHandleLike | null>();
    mocked.pickSaveHandle.mockReturnValue(picker.promise);
    const original = project();
    const session = doc().session;
    const saving = saveProjectAs();
    renameProject('Later edit');
    const file = destination('a-copy.mfe.json');
    const handle = file.handle();
    picker.resolve(handle);
    expect(await saving).toBe(true);
    expect(mocked.pickSaveHandle).toHaveBeenCalledWith('project-a.mfe.json', null);
    expect(file.state.text).toBe(serializeProject(original));
    expect(doc()).toMatchObject({ session, baseline: original, dirty: true, handle });
    expect(project().meta.name).toBe('Later edit');
  });

  it('writes a copy and leaves the new document alone when a pending library read replaced the document', async () => {
    const read = deferred<File>();
    const incoming = destination('b.mfe.json').handle();
    incoming.getFile = () => read.promise;
    const opening = openLibraryEntry({
      name: 'Project B',
      fileName: incoming.name,
      modified: 1,
      formulaCount: 0,
      project: createEmptyProject('Project B'),
      textGeometry: {},
      text: '',
      handle: incoming,
    });
    const picker = deferred<files.FileHandleLike | null>();
    mocked.pickSaveHandle.mockReturnValue(picker.promise);
    const original = project();
    const saving = saveProjectAs();
    read.resolve(new File([serializeProject(createEmptyProject('Project B'))], incoming.name));
    expect(await opening).toBe(true);
    const replacement = doc();
    const file = destination('a-copy.mfe.json');
    picker.resolve(file.handle());
    expect(await saving).toBe(false);
    expect(file.state.text).toBe(serializeProject(original));
    expect(doc()).toBe(replacement);
    expect(doc().handle).toBe(incoming);
    expect(mocked.storeHandle).toHaveBeenLastCalledWith(incoming, replacement.documentId);
    expect(useNoticeStore.getState().notices).toMatchObject([
      { title: 'Saved a copy as a-copy.mfe.json' },
    ]);
  });

  it.each(['New', 'Recover autosave'] as const)(
    "the picker's choice gets a copy after %s",
    async (action) => {
      const picker = deferred<files.FileHandleLike | null>();
      mocked.pickSaveHandle.mockReturnValue(picker.promise);
      const saving = saveProjectAs();
      if (action === 'New') {
        await newProject();
      } else {
        localStorage.setItem(
          'mfe.autosave.save-test-recovery',
          JSON.stringify({
            v: 1,
            savedAt: Date.now(),
            fileName: 'recovered.mfe.json',
            dirty: true,
            documentId: 'd_recovery',
            text: serializeProject(createEmptyProject('Recovered')),
          }),
        );
        expect(await recoverAutosave('save-test-recovery')).toBe(true);
      }
      const replacement = doc();
      const file = destination('a-copy.mfe.json');
      picker.resolve(file.handle());
      expect(await saving).toBe(false);
      expect(file.state.committed).toEqual(['Project A']);
      expect(doc()).toBe(replacement);
    },
  );

  it('a copy that cannot be written says so and leaves the new document alone', async () => {
    const picker = deferred<files.FileHandleLike | null>();
    mocked.pickSaveHandle.mockReturnValue(picker.promise);
    const saving = saveProjectAs();
    replaceProject(createEmptyProject('Project B'), { fileName: null, handle: null });
    const replacement = doc();
    const file = destination('a-copy.mfe.json');
    file.fail.add(1);
    picker.resolve(file.handle());
    expect(await saving).toBe(false);
    expect(file.state.text).toBe(file.initial);
    expect(file.state.aborted).toEqual([1]);
    expect(doc()).toBe(replacement);
    expect(useNoticeStore.getState().notices).toMatchObject([
      {
        kind: 'error',
        title: 'Could not save a-copy.mfe.json',
        message:
          '“Project A” was replaced by another project before it was saved. Its copy could not be written.',
      },
    ]);
  });

  it('a replacement while the chosen file is being written still ends in a copy', async () => {
    const file = destination('a-copy.mfe.json', 'close');
    mocked.pickSaveHandle.mockResolvedValue(file.handle());
    const original = project();
    const saving = saveProjectAs();
    await file.entered;
    replaceProject(createEmptyProject('Project B'), { fileName: null, handle: null });
    const replacement = doc();
    file.release();
    expect(await saving).toBe(false);
    expect(file.state.text).toBe(serializeProject(original));
    expect(doc()).toBe(replacement);
    expect(useNoticeStore.getState().notices).toMatchObject([
      { title: 'Saved a copy as a-copy.mfe.json' },
    ]);
  });

  it('a document without a handle that has the name of the chosen file turns unsaved', async () => {
    const picker = deferred<files.FileHandleLike | null>();
    mocked.pickSaveHandle.mockReturnValue(picker.promise);
    const original = project();
    const saving = saveProjectAs();
    // Recovered from the autosave: it knows its file's name, and holds no handle to it.
    replaceProject(createEmptyProject('Project B'), { fileName: 'b.mfe.json', handle: null });
    expect(doc().dirty).toBe(false);
    picker.resolve(destination('b.mfe.json').handle());
    expect(await saving).toBe(false);
    expect(doc()).toMatchObject({ baseline: original, dirty: true, fileName: 'b.mfe.json' });
  });

  it('says that no copy was written when the chosen file may not be written', async () => {
    const picker = deferred<files.FileHandleLike | null>();
    mocked.pickSaveHandle.mockReturnValue(picker.promise);
    const saving = saveProjectAs();
    replaceProject(createEmptyProject('Project B'), { fileName: null, handle: null });
    const replacement = doc();
    const file = destination('a-copy.mfe.json');
    mocked.ensureWritable.mockResolvedValueOnce(false);
    picker.resolve({ ...file.handle(), queryPermission: vi.fn(), requestPermission: vi.fn() });
    expect(await saving).toBe(false);
    expect(file.state.opened).toBe(0);
    expect(doc()).toBe(replacement);
    expect(useNoticeStore.getState().notices).toMatchObject([
      {
        kind: 'warning',
        title: 'Not allowed to write a-copy.mfe.json',
        message:
          '“Project A” was replaced by another project before it was saved. The browser did not grant access to the file, so no copy was written.',
      },
    ]);
  });

  it('picker cancellation preserves the original handle, baseline and session', async () => {
    const handle = destination('original.mfe.json').handle();
    doc().markClean(project(), { handle, fileName: handle.name });
    renameProject('Unsaved edit');
    const original = doc();
    mocked.pickSaveHandle.mockResolvedValue(null);
    expect(await saveProjectAs()).toBe(false);
    expect(doc()).toBe(original);
    expect(mocked.downloadText).not.toHaveBeenCalled();
    expect(mocked.storeHandle).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'picker failure downloads only its captured session (replaced: %s)',
    async (replaced) => {
      const picker = deferred<files.FileHandleLike | null>();
      mocked.pickSaveHandle.mockReturnValue(picker.promise);
      const original = project();
      const saving = saveProjectAs();
      if (replaced)
        replaceProject(createEmptyProject('Project B'), { fileName: null, handle: null });
      else renameProject('Later edit');
      const beforeFailure = doc();
      picker.reject(new DOMException('blocked', 'SecurityError'));
      expect(await saving).toBe(!replaced);
      if (replaced) {
        expect(mocked.downloadText).not.toHaveBeenCalled();
        expect(doc()).toBe(beforeFailure);
        expect(useNoticeStore.getState().notices).toHaveLength(0);
      } else {
        expect(mocked.downloadText).toHaveBeenCalledWith(
          'project-a.mfe.json',
          serializeProject(original),
        );
        expect(doc()).toMatchObject({ baseline: original, dirty: true, handle: null });
      }
    },
  );

  it.each([false, true])(
    'permission refusal keeps the original context through Save As (replaced: %s)',
    async (replaced) => {
      const oldFile = destination('original.mfe.json');
      const handle = { ...oldFile.handle(), queryPermission: vi.fn(), requestPermission: vi.fn() };
      doc().markClean(project(), { fileName: handle.name, handle });
      const permission = deferred<boolean>();
      mocked.ensureWritable.mockReturnValueOnce(permission.promise);
      const original = project();
      const saving = saveProject();
      if (replaced)
        replaceProject(createEmptyProject('Project B'), { fileName: null, handle: null });
      else renameProject('Later edit');
      const beforeRefusal = doc();
      const copy = destination('copy.mfe.json');
      const copyHandle = copy.handle();
      mocked.pickSaveHandle.mockResolvedValue(copyHandle);
      permission.resolve(false);
      expect(await saving).toBe(!replaced);
      expect(oldFile.state.text).toBe(oldFile.initial);
      if (replaced) {
        expect(mocked.pickSaveHandle).not.toHaveBeenCalled();
        expect(copy.state.text).toBe(copy.initial);
        expect(doc()).toBe(beforeRefusal);
      } else {
        expect(copy.state.text).toBe(serializeProject(original));
        expect(doc()).toMatchObject({ baseline: original, dirty: true, handle: copyHandle });
      }
    },
  );
});

describe('a file command while a drag is still held', () => {
  /** A drag that is still held: what it wrote is not a step yet, and Escape would take it back. */
  function heldDrag() {
    const drag = history.beginGesture();
    drag.update((draft) => {
      draft.meta.name = 'Mid-drag';
    });
    expect(project().meta.name).toBe('Mid-drag');
    return drag;
  }

  it('Save gives the drag up and writes the project it leaves', async () => {
    const file = destination('held.mfe.json');
    const handle = file.handle();
    doc().markClean(project(), { fileName: handle.name, handle });
    renameProject('Committed');
    const committed = project();
    const drag = heldDrag();

    expect(await saveProject()).toBe(true);
    expect(file.state.committed).toEqual(['Committed']);
    expect(file.state.text).toBe(serializeProject(committed));
    expect(drag.active).toBe(false);
    expect(project()).toBe(committed);
    expect(doc()).toMatchObject({ baseline: committed, dirty: false });
    // The drag was no step, and the one before it is still there to undo.
    history.undo();
    expect(project().meta.name).toBe('Project A');
  });

  it('Save As gives it up too, before it suggests a name', async () => {
    const copy = destination('copy.mfe.json');
    mocked.pickSaveHandle.mockResolvedValue(copy.handle());
    const committed = project();
    const drag = heldDrag();

    expect(await saveProjectAs()).toBe(true);
    expect(mocked.pickSaveHandle).toHaveBeenCalledWith('project-a.mfe.json', null);
    expect(copy.state.text).toBe(serializeProject(committed));
    expect(drag.active).toBe(false);
    expect(doc()).toMatchObject({ baseline: committed, dirty: false });
  });

  it('New asks nothing about a drag over a project that has no changes', async () => {
    const drag = heldDrag();
    expect(doc().dirty).toBe(true);

    const created = newProject();
    await nextTurn();
    const asked = useDialogStore.getState().queue.length;
    useDialogStore.setState({ queue: [] });
    expect(asked).toBe(0);
    await created;
    expect(drag.active).toBe(false);
    expect(project().meta.name).not.toBe('Mid-drag');
    expect(doc().dirty).toBe(false);
  });
});
