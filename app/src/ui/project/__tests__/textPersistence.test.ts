import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textGeometryFixture } from '../../../model/__tests__/textFixtures';

vi.mock('../files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../files')>()),
  hasFileSystemAccess: vi.fn(() => true),
  pickSaveHandle: vi.fn(),
  storeHandle: vi.fn(async () => undefined),
  downloadText: vi.fn(),
  downloadBlob: vi.fn(),
}));

let model: typeof import('../../../model');
let media: typeof import('../../../media');
let store: typeof import('../../../store');
let actions: typeof import('../actions');
let autosave: typeof import('../autosave');
let documents: typeof import('../documentStore');
let ownership: typeof import('../mediaOwnership');
let files: ReturnType<typeof vi.mocked<typeof import('../files')>>;
const stops: (() => void)[] = [];

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
}

function destination(name: string, pause?: 'write' | 'close') {
  const entered = deferred();
  const release = deferred();
  const chunks: BlobPart[] = [];
  const handle = {
    name,
    getFile: vi.fn(),
    createWritable: vi.fn(async () => {
      chunks.length = 0;
      return writable;
    }),
  };
  const writable = {
    write: async (data: unknown) => {
      if (pause === 'write') {
        entered.resolve();
        await release.promise;
      }
      if (typeof data === 'string') chunks.push(data);
      else if (ArrayBuffer.isView(data)) {
        chunks.push(new Uint8Array(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      } else throw new Error('Unexpected write');
    },
    close: async () => {
      if (pause === 'close') {
        entered.resolve();
        await release.promise;
      }
    },
    abort: vi.fn(async () => undefined),
  };
  return {
    handle,
    entered: entered.promise,
    release: () => release.resolve(),
    blob: () => new Blob(chunks),
  };
}

async function attachGeometry(suffix: string) {
  const artifact = textGeometryFixture('A');
  artifact.key += suffix;
  artifact.provenance.environmentKey += suffix;
  const stored = await media.storeTextGeometry(artifact);
  store.useProjectStore.getState().amend((draft) => {
    const formula = draft.formulas[0]!;
    if (formula.kind !== 'text') throw new Error('Expected text');
    formula.geometry = stored.reference;
  });
  await ownership.syncCurrentMediaOwnership();
  await stored.lease.release();
  return stored.reference;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('indexedDB', new IDBFactory());
  localStorage.clear();
  sessionStorage.clear();
  model = await import('../../../model');
  media = await import('../../../media');
  store = await import('../../../store');
  actions = await import('../actions');
  autosave = await import('../autosave');
  documents = await import('../documentStore');
  ownership = await import('../mediaOwnership');
  files = vi.mocked(await import('../files'));
  files.hasFileSystemAccess.mockReturnValue(true);
  const project = model.createEmptyProject('Text');
  project.formulas.push(
    model.createTextFormula({ source: 'A', font: textGeometryFixture().basis.font }),
  );
  actions.replaceProject(project, { fileName: null, handle: null });
  stops.push(documents.startDocumentTracking());
});

afterEach(async () => {
  while (stops.length) stops.pop()!();
  await autosave.waitForAutosaveMedia();
  await ownership.syncCurrentMediaOwnership().catch(() => undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('opening a .mfe.json that carries the geometry of its texts', () => {
  /** The open project, saved as a file with its geometry inside, as the library lists it; and a
   * browser that has never seen it. */
  async function carried(change: (value: { glyphs: { label: string }[] }) => void = () => {}) {
    const reference = await attachGeometry('-file');
    const project = store.useProjectStore.getState().project;
    const blob = await media.mediaRepository.requireOriginal(reference.contentHash);
    const value = JSON.parse(await blob.text());
    change(value);
    const text = model.serializeProject(project, { [reference.contentHash]: value });
    vi.stubGlobal('indexedDB', new IDBFactory());
    actions.replaceProject(model.createEmptyProject('Elsewhere'), { fileName: null, handle: null });
    const entry = {
      fileName: 'title.mfe.json',
      name: project.meta.name,
      modified: null,
      formulaCount: 1,
      project,
      textGeometry: {},
      text,
      handle: null,
    };
    return { entry, reference, project };
  }

  const importOwners = async () =>
    (await media.mediaRepository.listOwners()).filter((owner) =>
      owner.id.startsWith('text-geometry'),
    );

  it('stores it before the project shows, and hands it to the open document', async () => {
    const notices = await import('../noticeStore');
    const { entry, reference, project } = await carried();
    expect(await media.mediaRepository.getOriginal(reference.contentHash)).toBeNull();
    let storedWhenShown: boolean | undefined;
    const off = store.onProjectLoaded(() => {
      void media.mediaRepository
        .getOriginal(reference.contentHash)
        .then((blob) => (storedWhenShown = blob !== null));
    });
    expect(await actions.openLibraryEntry(entry)).toBe(true);
    off();
    expect(store.useProjectStore.getState().project).toEqual(project);
    expect(await media.loadTextGeometry(reference)).toMatchObject({ key: reference.key });
    expect(storedWhenShown).toBe(true);
    // The document owns it now, and the import let go.
    await ownership.mediaOwnershipSettled();
    expect(await importOwners()).toEqual([]);
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
    expect(notices.useNoticeStore.getState().notices).toEqual([]);
    expect(documents.useDocumentStore.getState()).toMatchObject({
      fileName: 'title.mfe.json',
      dirty: false,
    });
  });

  it('opens the project without a geometry that is not what the file says, and tells which', async () => {
    const notices = await import('../noticeStore');
    const { entry, reference } = await carried((value) => (value.glyphs[0]!.label = 'B'));
    expect(await actions.openLibraryEntry(entry)).toBe(true);
    expect(store.useProjectStore.getState().project.meta.name).toBe('Text');
    expect(await media.mediaRepository.getOriginal(reference.contentHash)).toBeNull();
    await expect(media.loadTextGeometry(reference)).rejects.toMatchObject({
      code: 'missing',
      message:
        'The saved appearance of this text is not in the browser’s storage. Open the project ' +
        'file that carries it, or use Refresh appearance in its editor, which needs the ' +
        'companion.',
    });
    expect(notices.useNoticeStore.getState().notices).toEqual([
      expect.objectContaining({
        kind: 'warning',
        title: 'A text opened without its saved appearance',
        message:
          'What title.mfe.json holds of its geometry could not be used. The text is in the ' +
          'project all the same, drawn as placeholder boxes. Its appearance comes back from a ' +
          'file that still carries it, or from Refresh appearance in its editor, which needs ' +
          'the companion.',
        details: [
          'p: The saved text geometry is damaged or unsupported. (Text geometry has a conflicting content hash.)',
        ],
      }),
    ]);
    await ownership.mediaOwnershipSettled();
    expect(await importOwners()).toEqual([]);
  });

  it('is a task the user watches and can cancel: nothing opens, and what was stored is let go', async () => {
    const progress = await import('../progressStore');
    const notices = await import('../noticeStore');
    const { entry, reference } = await carried();
    const seen: { title: string; message?: string; done: number; total: number }[] = [];
    const off = progress.useProgressStore.subscribe(({ tasks: [task] }) => {
      if (!task) return;
      seen.push({ ...task });
      // Cancel as soon as the first geometry is in.
      if (task.done > 0 && !task.cancelling) task.cancel();
    });
    expect(await actions.openLibraryEntry(entry)).toBe(false);
    off();
    expect(seen[0]).toMatchObject({
      title: 'Opening title.mfe.json',
      message: 'The appearance of its texts is checked and stored in the browser.',
    });
    expect(seen.some((task) => task.done === reference.byteLength)).toBe(true);
    expect(progress.useProgressStore.getState().tasks).toEqual([]);
    expect(store.useProjectStore.getState().project.meta.name).toBe('Elsewhere');
    expect(notices.useNoticeStore.getState().notices).toEqual([]);
    expect(await media.mediaRepository.getOriginal(reference.contentHash)).toBeNull();
    expect(await importOwners()).toEqual([]);
  });

  it('lets go of it when the user keeps the project that was open', async () => {
    const dialogs = await import('../dialogStore');
    const { entry, reference } = await carried();
    actions.renameProject('Unsaved work');
    const opening = actions.openLibraryEntry(entry);
    await vi.waitFor(() => expect(dialogs.useDialogStore.getState().queue).toHaveLength(1));
    const dialog = dialogs.useDialogStore.getState().queue[0]!;
    expect(dialog.title).toBe('Unsaved changes');
    dialogs.useDialogStore.getState().settle(dialog.key, 'cancel');
    expect(await opening).toBe(false);
    expect(store.useProjectStore.getState().project.meta.name).toBe('Unsaved work');
    expect(await media.mediaRepository.getOriginal(reference.contentHash)).toBeNull();
    expect(await importOwners()).toEqual([]);
  });
});

const LAST_COPY =
  'text.mfe.json still holds an original that the browser lost or holds damaged, and it could ' +
  'not be read back (the copy in the file may be damaged or changed by another program, or ' +
  "the browser's storage full). Saving over text.mfe.json would destroy it: use File → Save " +
  'As… with another name.';

describe('saving a project with font text and no recordings', () => {
  async function answerDialog(choice: 'confirm' | 'cancel') {
    const dialogs = await import('../dialogStore');
    await vi.waitFor(() => expect(dialogs.useDialogStore.getState().queue).toHaveLength(1));
    const dialog = dialogs.useDialogStore.getState().queue[0]!;
    dialogs.useDialogStore.getState().settle(dialog.key, choice);
    return dialog;
  }
  const noDialog = async () =>
    expect((await import('../dialogStore')).useDialogStore.getState().queue).toEqual([]);
  const storedText = async (hash: string) =>
    (await media.mediaRepository.requireOriginal(hash)).text();

  it('is one .mfe.json with the geometry inside, which another browser reads back', async () => {
    const reference = await attachGeometry('-inside');
    const output = destination('text.mfe.json');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    expect(await actions.saveProjectAs()).toBe(true);
    expect(files.pickSaveHandle).toHaveBeenCalledWith('text.mfe.json', null);
    const text = await output.blob().text();
    // The member's line holds the very bytes the browser stores under that hash.
    expect(text).toContain(
      `  "textGeometry": {\n    "${reference.contentHash}": ${await storedText(reference.contentHash)}\n  }\n}\n`,
    );
    expect(documents.useDocumentStore.getState()).toMatchObject({
      fileName: 'text.mfe.json',
      dirty: false,
    });
    await noDialog();
    const parsed = model.parseProject(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project).toEqual(store.useProjectStore.getState().project);
    vi.stubGlobal('indexedDB', new IDBFactory());
    const imported = await media.importEmbeddedTextGeometry(parsed.project, parsed.textGeometry);
    expect(imported.refused).toEqual([]);
    expect(await media.loadTextGeometry(reference)).toMatchObject({ key: reference.key });
    await imported.lease.release();
  });

  it('keeps a document that is a .mfe package a package, until Save As', async () => {
    const reference = await attachGeometry('-package');
    const packageFile = destination('text.mfe');
    actions.replaceProject(store.useProjectStore.getState().project, {
      fileName: 'text.mfe',
      handle: packageFile.handle,
    });
    actions.renameProject('Text again');
    expect(await actions.saveProject()).toBe(true);
    expect(
      (await media.readPackageManifest(packageFile.blob())).media.map((m) => m.contentHash),
    ).toEqual([reference.contentHash]);
    const json = destination('text-again.mfe.json');
    files.pickSaveHandle.mockResolvedValue(json.handle);
    expect(await actions.saveProjectAs()).toBe(true);
    expect(files.pickSaveHandle).toHaveBeenCalledWith('text-again.mfe.json', null);
    const parsed = model.parseProject(await json.blob().text());
    expect(parsed.ok && Object.keys(parsed.textGeometry)).toEqual([reference.contentHash]);
  });

  it('holds the geometry of the captured project while the file is being written', async () => {
    const original = await attachGeometry('-original');
    const output = destination('text.mfe.json', 'write');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    const saving = actions.saveProjectAs();
    await output.entered;
    const later = await attachGeometry('-later');
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
    output.release();
    expect(await saving).toBe(true);
    const parsed = model.parseProject(await output.blob().text());
    expect(parsed.ok && Object.keys(parsed.textGeometry)).toEqual([original.contentHash]);
    expect(later.contentHash).not.toBe(original.contentHash);
    expect(documents.useDocumentStore.getState().dirty).toBe(true);
  });

  it('asks before writing the file without a geometry the browser lost', async () => {
    const reference = await attachGeometry('-lost');
    vi.stubGlobal('indexedDB', new IDBFactory());
    const output = destination('text.mfe.json');
    output.handle.getFile.mockResolvedValue(new Blob([]));
    files.pickSaveHandle.mockResolvedValue(output.handle);
    let saving = actions.saveProjectAs();
    const dialog = await answerDialog('cancel');
    expect(dialog.message).toBe(
      'The browser no longer holds one original of “Text”, so text.mfe.json cannot contain it. ' +
        'What uses it stays in the project, marked as missing: a text is drawn as placeholder ' +
        'boxes until Refresh appearance, in its editor, shapes it again, which needs the ' +
        'companion.',
    );
    expect(dialog.details).toEqual(['p (text appearance)']);
    expect(await saving).toBe(false);
    expect(output.handle.createWritable).not.toHaveBeenCalled();

    saving = actions.saveProjectAs();
    await answerDialog('confirm');
    expect(await saving).toBe(true);
    const written = JSON.parse(await output.blob().text());
    expect(written.textGeometry).toBeUndefined();
    // The text still names its geometry: opened where it is stored, it has it.
    expect(written.formulas[0].geometry).toEqual(reference);
    expect(documents.useDocumentStore.getState().dirty).toBe(false);
  });

  it('takes a lost geometry back from the file it is about to replace, without a question', async () => {
    const notices = await import('../noticeStore');
    const reference = await attachGeometry('-on-disk');
    const output = destination('text.mfe.json');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    expect(await actions.saveProjectAs()).toBe(true);
    const onDisk = await output.blob().text();
    // The browser's storage goes under the page; the file still has the geometry.
    vi.stubGlobal('indexedDB', new IDBFactory());
    output.handle.getFile.mockResolvedValue(new Blob([onDisk]));
    actions.renameProject('Edited');
    expect(await actions.saveProject()).toBe(true);
    await noDialog();
    expect(notices.useNoticeStore.getState().notices).toEqual([
      expect.objectContaining({ kind: 'info', title: 'Missing media restored' }),
    ]);
    const parsed = model.parseProject(await output.blob().text());
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project.meta.name).toBe('Edited');
    expect(Object.keys(parsed.textGeometry)).toEqual([reference.contentHash]);
    expect(await media.loadTextGeometry(reference)).toMatchObject({ key: reference.key });
    await ownership.mediaOwnershipSettled();
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
  });

  it('does not replace a file whose geometry the browser cannot take back', async () => {
    const notices = await import('../noticeStore');
    await attachGeometry('-only-copy');
    const output = destination('text.mfe.json');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    expect(await actions.saveProjectAs()).toBe(true);
    const onDisk = await output.blob().text();
    vi.stubGlobal('indexedDB', new IDBFactory());
    output.handle.getFile.mockResolvedValue(new Blob([onDisk]));
    output.handle.createWritable.mockClear();
    vi.spyOn(media.mediaRepository, 'storeOriginal').mockRejectedValue(
      new media.MediaStorageError('quota', 'No room.'),
    );
    actions.renameProject('Edited');
    expect(await actions.saveProject()).toBe(false);
    await noDialog();
    expect(output.handle.createWritable).not.toHaveBeenCalled();
    expect(notices.useNoticeStore.getState().notices).toEqual([
      expect.objectContaining({
        kind: 'error',
        title: 'Could not save text.mfe.json',
        message: LAST_COPY,
      }),
    ]);
    expect(documents.useDocumentStore.getState().dirty).toBe(true);
  });

  it('does not replace a file whose member it cannot take back, and tells why', async () => {
    const notices = await import('../noticeStore');
    const reference = await attachGeometry('-changed-on-disk');
    const project = store.useProjectStore.getState().project;
    const value = JSON.parse(await storedText(reference.contentHash));
    // Someone edited the file by hand: the member is not what its hash names any more.
    value.glyphs[0].label = 'B';
    const onDisk = model.serializeProject(project, { [reference.contentHash]: value });
    vi.stubGlobal('indexedDB', new IDBFactory());
    const output = destination('text.mfe.json');
    output.handle.getFile.mockResolvedValue(new Blob([onDisk]));
    files.pickSaveHandle.mockResolvedValue(output.handle);
    expect(await actions.saveProjectAs()).toBe(false);
    await noDialog();
    expect(output.handle.createWritable).not.toHaveBeenCalled();
    expect(notices.useNoticeStore.getState().notices).toEqual([
      expect.objectContaining({ kind: 'error', message: LAST_COPY }),
    ]);
    // Another name is the way out: there the user is asked, and the file is written.
    const other = destination('other.mfe.json');
    other.handle.getFile.mockResolvedValue(new Blob([]));
    files.pickSaveHandle.mockResolvedValue(other.handle);
    const saving = actions.saveProjectAs();
    await answerDialog('confirm');
    expect(await saving).toBe(true);
    expect(JSON.parse(await other.blob().text()).textGeometry).toBeUndefined();
  });

  it('does not replace a project file that is cut short: nobody knows what it holds', async () => {
    const notices = await import('../noticeStore');
    await attachGeometry('-cut-short');
    const output = destination('text.mfe.json');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    expect(await actions.saveProjectAs()).toBe(true);
    const onDisk = await output.blob().text();
    vi.stubGlobal('indexedDB', new IDBFactory());
    output.handle.getFile.mockResolvedValue(new Blob([onDisk.slice(0, -30)]));
    output.handle.createWritable.mockClear();
    actions.renameProject('Edited');
    expect(await actions.saveProject()).toBe(false);
    await noDialog();
    expect(output.handle.createWritable).not.toHaveBeenCalled();
    expect(notices.useNoticeStore.getState().notices).toEqual([
      expect.objectContaining({
        kind: 'error',
        title: 'Could not save text.mfe.json',
        message:
          'text.mfe.json could not be read, so it may still hold the originals the browser ' +
          'lost. Saving over it could destroy them: use File → Save As… with another name.',
      }),
    ]);
  });

  it('does not replace the good copy of a geometry that the browser holds damaged', async () => {
    const notices = await import('../noticeStore');
    const reference = await attachGeometry('-damaged-here');
    const output = destination('text.mfe.json');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    expect(await actions.saveProjectAs()).toBe(true);
    const onDisk = await output.blob().text();
    output.handle.getFile.mockResolvedValue(new Blob([onDisk]));
    output.handle.createWritable.mockClear();
    // The browser's own copy goes bad, byte for byte as long as before.
    const good = await storedText(reference.contentHash);
    const bad = new Blob([good.replace('"label":"A"', '"label":"B"')]);
    expect(bad.size).toBe(reference.byteLength);
    const read = media.mediaRepository.getOriginal.bind(media.mediaRepository);
    vi.spyOn(media.mediaRepository, 'getOriginal').mockImplementation(async (hash) =>
      hash === reference.contentHash ? bad : read(hash),
    );
    vi.spyOn(media.mediaRepository, 'requireOriginal').mockImplementation(async (hash) =>
      hash === reference.contentHash ? bad : (await read(hash))!,
    );
    actions.renameProject('Edited');
    expect(await actions.saveProject()).toBe(false);
    await noDialog();
    expect(output.handle.createWritable).not.toHaveBeenCalled();
    // Nothing came back, so nothing is said to have.
    expect(notices.useNoticeStore.getState().notices).toEqual([
      expect.objectContaining({ kind: 'error', message: LAST_COPY }),
    ]);
  });

  it('is a package when its texts hold more geometry than a .mfe.json carries', async () => {
    // Five texts whose references state 16 MiB each: 80 MiB, over the 64 a .mfe.json carries.
    store.useProjectStore.getState().update((draft) => {
      const [text] = draft.formulas;
      draft.formulas = Array.from({ length: 5 }, (_, i) => ({
        ...text!,
        id: `t${i}`,
        name: `t${i}`,
        geometry: {
          contentHash: String(i).repeat(64),
          byteLength: 16 * 1024 * 1024,
          key: `k${i}`,
          basisKey: `b${i}`,
        },
      }));
    });
    const output = destination('text.mfe');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    const saving = actions.saveProjectAs();
    expect(files.pickSaveHandle).toHaveBeenCalledWith('text.mfe', null);
    // None of it is stored here: the package is written without it, on the user's word.
    await answerDialog('confirm');
    expect(await saving).toBe(true);
    expect((await media.readPackageManifest(output.blob())).missing).toHaveLength(5);

    // Where there is no picker the download is a package too, not an error about a suffix.
    files.hasFileSystemAccess.mockReturnValue(false);
    const current = store.useProjectStore.getState().project;
    actions.replaceProject(
      { ...current, meta: { ...current.meta, name: 'Again' } },
      { fileName: null, handle: null },
    );
    const downloading = actions.saveProject();
    await answerDialog('confirm');
    expect(await downloading).toBe(true);
    expect(files.downloadBlob.mock.calls[0]![0]).toBe('again.mfe');
    expect(files.downloadText).not.toHaveBeenCalled();
  });

  it('downloads the same file where the browser has no file picker', async () => {
    const reference = await attachGeometry('-download');
    files.hasFileSystemAccess.mockReturnValue(false);
    expect(await actions.saveProject()).toBe(true);
    expect(files.downloadText).toHaveBeenCalledTimes(1);
    const [name, text] = files.downloadText.mock.calls[0]!;
    expect(name).toBe('text.mfe.json');
    const parsed = model.parseProject(text);
    expect(parsed.ok && Object.keys(parsed.textGeometry)).toEqual([reference.contentHash]);
    expect(documents.useDocumentStore.getState()).toMatchObject({
      fileName: 'text.mfe.json',
      dirty: false,
    });
  });
});

describe('text artifact persistence ownership', () => {
  it('keeps a JSON Save capture source-only when geometry arrives during the picker', async () => {
    const selected = deferred<ReturnType<typeof destination>['handle']>();
    files.pickSaveHandle.mockReturnValueOnce(selected.promise);
    const before = store.useProjectStore.getState().project;
    const saving = actions.saveProjectAs();
    expect(files.pickSaveHandle).toHaveBeenCalledWith('text.mfe.json', null);
    await attachGeometry('-later');
    const output = destination('text.mfe.json');
    selected.resolve(output.handle);
    expect(await saving).toBe(true);
    const written = JSON.parse(await output.blob().text());
    expect(written.formulas[0].geometry).toBeNull();
    expect(documents.useDocumentStore.getState()).toMatchObject({ baseline: before, dirty: true });
    // The next Save writes the same file again, now with the geometry inside it.
    expect(await actions.saveProject()).toBe(true);
    expect(files.pickSaveHandle).toHaveBeenCalledTimes(1);
    const again = model.parseProject(await output.blob().text());
    if (!again.ok) throw new Error(again.error);
    const [formula] = again.project.formulas;
    if (formula?.kind !== 'text' || !formula.geometry) throw new Error('Expected a shaped text');
    expect(Object.keys(again.textGeometry)).toEqual([formula.geometry.contentHash]);
    expect(documents.useDocumentStore.getState().dirty).toBe(false);
  });

  it.each(['write', 'close'] as const)(
    'retains the exact package payload set while %s is pending',
    async (pause) => {
      const original = await attachGeometry('-original');
      const output = destination('text.mfe', pause);
      files.pickSaveHandle.mockResolvedValue(output.handle);
      const captured = store.useProjectStore.getState().project;
      const saving = actions.saveProjectAs();
      await output.entered;
      const later = await attachGeometry('-later');
      expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
      output.release();
      expect(await saving).toBe(true);
      const manifest = await media.readPackageManifest(output.blob());
      expect(manifest.media.map((entry) => entry.contentHash)).toEqual([original.contentHash]);
      expect(manifest.media.some((entry) => entry.contentHash === later.contentHash)).toBe(false);
      expect(documents.useDocumentStore.getState()).toMatchObject({
        baseline: captured,
        dirty: true,
      });
    },
  );

  it('makes a late artifact dirty without creating an authored history operation', async () => {
    const historyLength = store.useProjectStore.temporal.getState().pastStates.length;
    expect(documents.useDocumentStore.getState().dirty).toBe(false);
    await attachGeometry('-late');
    expect(documents.useDocumentStore.getState().dirty).toBe(true);
    expect(store.useProjectStore.temporal.getState().pastStates).toHaveLength(historyLength);
  });

  it('is unsaved once a geometry the browser had lost is stored again, until a file carries it', async () => {
    const reference = await attachGeometry('-back');
    const project = store.useProjectStore.getState().project;
    // The document has a file, which may have been written without that geometry.
    documents.useDocumentStore
      .getState()
      .markClean(project, { fileName: 'text.mfe', handle: null });
    const status = () => documents.documentStatus(documents.useDocumentStore.getState()).text;
    expect(status()).toBe('Saved');
    // What render sync does when a companion shapes the lost geometry again, to the same bytes:
    // the reference is put back as it was, which is no edit, and the return is announced.
    store.useProjectStore.getState().amend((draft) => {
      const formula = draft.formulas[0]!;
      if (formula.kind === 'text') formula.geometry = { ...reference };
    });
    expect(status()).toBe('Saved');
    const core = await import('../../../store/mediaOwnership');
    core.announceMediaReturned(reference.contentHash);
    expect(status()).toBe('Unsaved changes');
    expect([...documents.useDocumentStore.getState().mediaReturned]).toEqual([
      reference.contentHash,
    ]);
    // A save whose file carries it settles the matter.
    const output = destination('text.mfe.json');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    expect(await actions.saveProjectAs()).toBe(true);
    expect(await output.blob().text()).toContain(`"${reference.contentHash}": `);
    expect(status()).toBe('Saved');
    expect(documents.useDocumentStore.getState().mediaReturned.size).toBe(0);
  });

  it('publishes text recovery only after durable ownership and keeps metadata-only unload synchronous', async () => {
    const reference = await attachGeometry('-recovery');
    const originalPin = media.mediaRepository.pinAvailable.bind(media.mediaRepository);
    const entered = deferred();
    const release = deferred();
    vi.spyOn(media.mediaRepository, 'pinAvailable').mockImplementation(async (owner, hashes) => {
      if (owner.startsWith('recovery:')) {
        entered.resolve();
        await release.promise;
      }
      return originalPin(owner, hashes);
    });
    stops.push(autosave.startAutosave(1));
    actions.renameProject('Waiting');
    await entered.promise;
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    expect(localStorage.getItem(key)).toBeNull();
    release.resolve();
    await vi.waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
    const record = JSON.parse(localStorage.getItem(key)!);
    expect(record.v).toBe(4);
    expect(
      (await media.mediaRepository.listOwners()).find((owner) => owner.id === record.mediaOwner)
        ?.hashes,
    ).toEqual([reference.contentHash]);
    actions.renameProject('Unload source');
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(key)!).name).toBe('Unload source');
  });

  it('asks about a lost text appearance once, and does not offer to import it again', async () => {
    await attachGeometry('shared');
    // Two texts with the same appearance share one stored geometry.
    store.useProjectStore.getState().update((draft) => {
      const [first] = draft.formulas;
      draft.formulas.push({ ...first!, id: 'copy', name: 'Subtitle' });
      first!.name = 'Title';
    });
    // The browser's storage goes under the page.
    vi.stubGlobal('indexedDB', new IDBFactory());
    const output = destination('text.mfe');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    const dialogs = await import('../dialogStore');
    const saving = actions.saveProjectAs();
    await vi.waitFor(() => expect(dialogs.useDialogStore.getState().queue).toHaveLength(1));
    const dialog = dialogs.useDialogStore.getState().queue[0]!;
    expect(dialog.message).toBe(
      'The browser no longer holds one original of “Text”, so text.mfe cannot contain it. ' +
        'What uses it stays in the project, marked as missing: a text is drawn as placeholder ' +
        'boxes until Refresh appearance, in its editor, shapes it again, which needs the ' +
        'companion.',
    );
    expect(dialog.details).toEqual(['Title (text appearance)', 'Subtitle (text appearance)']);
    dialogs.useDialogStore.getState().settle(dialog.key, 'cancel');
    expect(await saving).toBe(false);
    expect(output.handle.createWritable).not.toHaveBeenCalled();
  });
});
