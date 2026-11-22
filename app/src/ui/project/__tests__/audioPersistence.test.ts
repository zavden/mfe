import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../files')>()),
  hasFileSystemAccess: vi.fn(() => true),
  pickSaveHandle: vi.fn(),
  storeHandle: vi.fn(async () => undefined),
  downloadBlob: vi.fn(),
}));

let model: typeof import('../../../model');
let media: typeof import('../../../media');
let store: typeof import('../../../store');
let actions: typeof import('../actions');
let autosave: typeof import('../autosave');
let documents: typeof import('../documentStore');
let ownership: typeof import('../mediaOwnership');
let notices: typeof import('../noticeStore');
let dialogs: typeof import('../dialogStore');
let files: ReturnType<typeof vi.mocked<typeof import('../files')>>;
const stops: (() => void)[] = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => (resolve = yes));
  return { promise, resolve };
}

function destination(name = 'audio.mfe', pause = false) {
  const entered = deferred();
  const release = deferred();
  const chunks: BlobPart[] = [];
  const close = vi.fn(async () => undefined);
  const abort = vi.fn(async () => undefined);
  const handle = {
    name,
    getFile: vi.fn(),
    createWritable: vi.fn(async () => ({
      write: async (data: unknown) => {
        if (!ArrayBuffer.isView(data)) throw new Error('Expected a streamed package chunk');
        entered.resolve();
        if (pause) await release.promise;
        chunks.push(new Uint8Array(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      },
      close,
      abort,
    })),
  };
  return {
    handle,
    entered: entered.promise,
    release: release.resolve,
    close,
    abort,
    blob: () => new Blob(chunks),
  };
}

async function originalProject() {
  const original = await media.mediaRepository.storeOriginal(new Blob(['original bytes']), {
    ownerId: 'test-import',
  });
  const project = model.createEmptyProject('Audio project');
  project.audioAssets.push(
    model.createAudioAsset({
      ...original,
      name: 'Unused narration',
      originalName: 'narration.mp3',
      mimeType: 'audio/mpeg',
      duration: 4,
      sampleRate: 48000,
      channels: 1,
    }),
  );
  return project;
}

/** Press a button of the dialog that is (or is about to be) open; returns what it said. */
async function answerDialog(id: 'cancel' | 'confirm' | 'save') {
  await vi.waitFor(() => expect(dialogs.useDialogStore.getState().queue.length).toBe(1));
  const dialog = dialogs.useDialogStore.getState().queue[0]!;
  dialogs.useDialogStore.getState().settle(dialog.key, id);
  return dialog;
}

/** `originalProject`, with a second recording whose original the browser does not hold. */
async function incompleteProject() {
  const project = await originalProject();
  const lost = new Blob(['lost source']);
  project.audioAssets.push(
    model.createAudioAsset({
      contentHash: await media.hashBlob(lost),
      byteLength: lost.size,
      name: 'Interview',
      originalName: 'interview.wav',
      mimeType: 'audio/wav',
      duration: 1,
      sampleRate: 48000,
      channels: 1,
    }),
  );
  return { project, lost, lostHash: project.audioAssets[1]!.contentHash };
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
  notices = await import('../noticeStore');
  dialogs = await import('../dialogStore');
  files = vi.mocked(await import('../files'));
  files.hasFileSystemAccess.mockReturnValue(true);
  actions.replaceProject(model.createEmptyProject(), { fileName: null, handle: null });
  stops.push(documents.startDocumentTracking());
});

afterEach(async () => {
  while (stops.length) stops.pop()!();
  await autosave.waitForAutosaveMedia();
  await ownership.syncCurrentMediaOwnership().catch(() => undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('audio project persistence', () => {
  it('writes a valid package when All Files selects .mfe for a media-free Save As', async () => {
    const output = destination('empty.mfe');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    expect(await actions.saveProjectAs()).toBe(true);
    const manifest = await media.readPackageManifest(output.blob());
    expect(manifest.parsed.project.audioAssets).toEqual([]);
    expect(manifest.media).toEqual([]);
  });

  it('changes a legacy JSON destination to .mfe and saves the captured revision with unused originals', async () => {
    const project = await originalProject();
    const old = destination('old.mfe.json');
    actions.replaceProject(project, { fileName: old.handle.name, handle: old.handle });
    actions.renameProject('Captured');
    const output = destination('audio.mfe', true);
    files.pickSaveHandle.mockResolvedValue(output.handle);
    const saving = actions.saveProject();
    await output.entered;
    actions.renameProject('Edited during Save');
    output.release();
    expect(await saving, JSON.stringify(notices.useNoticeStore.getState().notices)).toBe(true);
    expect(old.handle.createWritable).not.toHaveBeenCalled();
    expect(files.pickSaveHandle).toHaveBeenCalledWith('captured.mfe', null);
    const summary = await media.readPackageManifest(output.blob());
    expect(summary.parsed.project.meta.name).toBe('Captured');
    expect(summary.parsed.project.audioAssets[0]?.name).toBe('Unused narration');
    expect(summary.media).toHaveLength(1);
    expect(documents.useDocumentStore.getState().dirty).toBe(true);
    expect(output.close).toHaveBeenCalledOnce();
  });

  it('writes the package with its originals as a copy when the project was replaced meanwhile', async () => {
    const project = await originalProject();
    actions.replaceProject(project, { fileName: null, handle: null });
    actions.renameProject('Captured');
    type Chosen = Awaited<ReturnType<typeof files.pickSaveHandle>>;
    let answer!: (handle: Chosen) => void;
    files.pickSaveHandle.mockReturnValue(new Promise<Chosen>((resolve) => (answer = resolve)));
    const saving = actions.saveProjectAs();
    actions.replaceProject(model.createEmptyProject('Replacement'), {
      fileName: null,
      handle: null,
    });
    // Only the pending save still owns the replaced project's original.
    await ownership.syncCurrentMediaOwnership();
    await media.mediaRepository.releaseOwner('test-import');
    const output = destination('copy.mfe');
    answer(output.handle as unknown as Chosen);
    expect(await saving, JSON.stringify(notices.useNoticeStore.getState().notices)).toBe(false);
    const summary = await media.readPackageManifest(output.blob());
    expect(summary.parsed.project.meta.name).toBe('Captured');
    expect(summary.media).toHaveLength(1);
    expect(output.close).toHaveBeenCalledOnce();
    expect(documents.useDocumentStore.getState()).toMatchObject({
      fileName: null,
      handle: null,
      dirty: false,
    });
    expect(store.useProjectStore.getState().project.meta.name).toBe('Replacement');
    expect(notices.useNoticeStore.getState().notices).toContainEqual(
      expect.objectContaining({ kind: 'warning', title: 'Saved a copy as copy.mfe' }),
    );
  });

  it('asks before saving without a missing original, and Cancel writes nothing', async () => {
    const { project } = await incompleteProject();
    const output = destination();
    actions.replaceProject(project, { fileName: output.handle.name, handle: output.handle });
    actions.renameProject('Still unsaved');
    const saving = actions.saveProject();
    const dialog = await answerDialog('cancel');
    expect(dialog.title).toBe('Save without the missing media?');
    expect(dialog.message).toBe(
      'The browser no longer holds one original of “Still unsaved”, so audio.mfe cannot contain it. ' +
        'What uses it stays in the project, marked as missing: a recording comes back when the ' +
        'same file is imported again in the Audio tab.',
    );
    expect(dialog.details).toEqual(['Interview (interview.wav)']);
    expect(dialog.buttons.map((button) => button.label)).toEqual([
      'Cancel',
      'Save without the missing media',
    ]);
    expect(await saving).toBe(false);
    expect(output.handle.createWritable).not.toHaveBeenCalled();
    expect(documents.useDocumentStore.getState().dirty).toBe(true);
    // The user decided: nothing failed.
    expect(notices.useNoticeStore.getState().notices).toEqual([]);
    // The save's hold on the recording that is there went with the command.
    expect((await media.mediaRepository.listOwners()).map((owner) => owner.id)).toEqual([
      'test-import',
    ]);
  });

  it('saves without the missing media when the user agrees, and the file opens whole', async () => {
    const { project, lostHash } = await incompleteProject();
    const present = project.audioAssets[0]!.contentHash;
    const output = destination();
    actions.replaceProject(project, { fileName: output.handle.name, handle: output.handle });
    actions.renameProject('Saved without it');
    const saving = actions.saveProject();
    await answerDialog('confirm');
    expect(await saving, JSON.stringify(notices.useNoticeStore.getState().notices)).toBe(true);
    expect(output.close).toHaveBeenCalledOnce();
    expect(documents.useDocumentStore.getState().dirty).toBe(false);
    const manifest = await media.readPackageManifest(output.blob());
    expect(manifest.missing).toEqual([lostHash]);
    expect(manifest.media.map((entry) => entry.contentHash)).toEqual([present]);
    // Both recordings are still in the project: the one without bytes keeps its place.
    expect(manifest.parsed.project.audioAssets.map((asset) => asset.name)).toEqual([
      'Unused narration',
      'Interview',
    ]);
    expect(manifest.parsed.project.meta.name).toBe('Saved without it');
  });

  it('stays unsaved when the recording comes back while the file without it is written', async () => {
    const { project, lost, lostHash } = await incompleteProject();
    const output = destination('audio.mfe', true);
    actions.replaceProject(project, { fileName: output.handle.name, handle: output.handle });
    actions.renameProject('Saved without it');
    const saving = actions.saveProject();
    await answerDialog('confirm');
    await output.entered;
    // The file is on its way, without the recording. The user imports it again meanwhile.
    await media.mediaRepository.storeOriginal(lost, { ownerId: 'reimport' });
    documents.useDocumentStore.getState().noteMediaReturned(lostHash);
    output.release();
    expect(await saving).toBe(true);
    expect((await media.readPackageManifest(output.blob())).missing).toEqual([lostHash]);
    expect(documents.useDocumentStore.getState().dirty).toBe(true);

    // The next Save writes it, asks nothing, and the document is saved.
    const complete = destination();
    documents.useDocumentStore.setState({ handle: complete.handle });
    expect(await actions.saveProject()).toBe(true);
    expect(dialogs.useDialogStore.getState().queue).toEqual([]);
    expect((await media.readPackageManifest(complete.blob())).missing).toEqual([]);
    expect(documents.useDocumentStore.getState().dirty).toBe(false);
  });

  it('asks once per command and lists every missing original', async () => {
    const { project } = await incompleteProject();
    await media.mediaRepository.releaseOwner('test-import');
    await media.mediaRepository.collectUnowned();
    actions.replaceProject(project, { fileName: null, handle: null });
    const output = destination('both.mfe');
    files.pickSaveHandle.mockResolvedValue(output.handle);
    const saving = actions.saveProjectAs();
    const dialog = await answerDialog('confirm');
    expect(dialog.message).toContain('no longer holds 2 originals of');
    expect(dialog.message).toContain('both.mfe cannot contain them');
    expect(dialog.message).toContain('What uses them stays in the project, marked as missing');
    expect(dialog.details).toEqual([
      'Unused narration (narration.mp3)',
      'Interview (interview.wav)',
    ]);
    expect(await saving).toBe(true);
    expect(dialogs.useDialogStore.getState().queue).toEqual([]);
    const manifest = await media.readPackageManifest(output.blob());
    expect(manifest.media).toEqual([]);
    expect(manifest.missing).toHaveLength(2);
  });

  it('asks the same when the browser can only download the file', async () => {
    files.hasFileSystemAccess.mockReturnValue(false);
    const { project, lostHash } = await incompleteProject();
    actions.replaceProject(project, { fileName: null, handle: null });
    actions.renameProject('Downloaded');
    const refused = actions.saveProject();
    await answerDialog('cancel');
    expect(await refused).toBe(false);
    expect(files.downloadBlob).not.toHaveBeenCalled();
    expect(documents.useDocumentStore.getState().dirty).toBe(true);

    const saving = actions.saveProject();
    const dialog = await answerDialog('confirm');
    expect(dialog.message).toContain('so downloaded.mfe cannot contain it');
    expect(await saving).toBe(true);
    const [name, blob] = files.downloadBlob.mock.calls[0]!;
    expect(name).toBe('downloaded.mfe');
    expect((await media.readPackageManifest(blob)).missing).toEqual([lostHash]);
  });

  it('brings a lost original back from the file it is about to replace, and asks nothing', async () => {
    const project = await originalProject();
    const hash = project.audioAssets[0]!.contentHash;
    // The file on disk is the complete package the project was opened from.
    const complete = await media.preparePackage(project);
    const onDisk = complete.toBlob();
    await complete.release();
    // Since then the browser lost its storage, with the page open.
    await media.mediaRepository.releaseOwner('test-import');
    await media.mediaRepository.collectUnowned();
    expect(await media.mediaRepository.getOriginal(hash)).toBeNull();

    const output = destination();
    output.handle.getFile.mockResolvedValue(onDisk);
    actions.replaceProject(project, { fileName: output.handle.name, handle: output.handle });
    stops.push(ownership.startMediaOwnership());
    actions.renameProject('Edited after the loss');
    expect(
      await actions.saveProject(),
      JSON.stringify(notices.useNoticeStore.getState().notices),
    ).toBe(true);
    expect(dialogs.useDialogStore.getState().queue).toEqual([]);
    // The new file is complete: the edit, and the recording the old file still had.
    const manifest = await media.readPackageManifest(output.blob());
    expect(manifest.parsed.project.meta.name).toBe('Edited after the loss');
    expect(manifest.missing).toEqual([]);
    expect(manifest.media.map((entry) => entry.contentHash)).toEqual([hash]);
    // And the recording is the open project's again.
    await ownership.syncCurrentMediaOwnership();
    expect(await (await media.mediaRepository.requireOriginal(hash)).text()).toBe('original bytes');
    expect((await media.mediaRepository.listOwners()).map((owner) => owner.hashes)).toEqual([
      [hash],
    ]);
    expect(notices.useNoticeStore.getState().notices).toMatchObject([
      { kind: 'info', title: 'Missing media restored' },
    ]);
  });

  it('does not replace a file that holds a lost original it cannot read back', async () => {
    const { project, lost, lostHash } = await incompleteProject();
    const present = project.audioAssets[0]!.contentHash;
    // The file on disk is complete; the browser lost both originals since.
    await media.mediaRepository.storeOriginal(lost, { ownerId: 'test-import' });
    const complete = await media.preparePackage(project);
    const onDisk = complete.toBlob();
    await complete.release();
    await media.mediaRepository.releaseOwner('test-import');
    await media.mediaRepository.collectUnowned();
    // Reading them back, the store takes one and has no room for the other.
    const store = media.mediaRepository.storeOriginal.bind(media.mediaRepository);
    vi.spyOn(media.mediaRepository, 'storeOriginal').mockImplementation(
      async (original, options) => {
        if (options.expectedHash === lostHash)
          throw new DOMException('Quota exhausted', 'QuotaExceededError');
        return store(original, options);
      },
    );

    const output = destination();
    output.handle.getFile.mockResolvedValue(onDisk);
    actions.replaceProject(project, { fileName: output.handle.name, handle: output.handle });
    stops.push(ownership.startMediaOwnership());
    actions.renameProject('Edited after the loss');
    expect(await actions.saveProject()).toBe(false);
    // No question to answer: the only file that still has the recording is left as it is.
    expect(dialogs.useDialogStore.getState().queue).toEqual([]);
    expect(output.handle.createWritable).not.toHaveBeenCalled();
    expect(documents.useDocumentStore.getState().dirty).toBe(true);
    const [notice] = notices.useNoticeStore.getState().notices;
    expect(notice).toMatchObject({ kind: 'error', title: 'Could not save audio.mfe' });
    expect(notice!.message).toBe(
      'audio.mfe still holds an original that the browser lost or holds damaged, and it could ' +
        'not be read back (the copy in the file may be damaged or changed by another program, ' +
        "or the browser's storage full). Saving over audio.mfe would destroy it: use File → " +
        'Save As… with another name.',
    );
    // What could be read back is the open project's again.
    await ownership.mediaOwnershipSettled();
    expect(await media.mediaRepository.getOriginal(present)).not.toBeNull();
    expect((await media.mediaRepository.listOwners()).map((owner) => owner.hashes)).toEqual([
      [present],
    ]);
  });

  it('does not replace a package it cannot read while originals are missing', async () => {
    const { project } = await incompleteProject();
    // A package by its signature, of a later version or damaged: what it holds is unknown.
    const header = new Uint8Array(16);
    header.set(new TextEncoder().encode('MFEPACK\n'));
    new DataView(header.buffer).setUint32(8, 99, true);
    const output = destination();
    output.handle.getFile.mockResolvedValue(new Blob([header, 'whatever follows']));
    actions.replaceProject(project, { fileName: output.handle.name, handle: output.handle });
    actions.renameProject('Edited');
    expect(await actions.saveProject()).toBe(false);
    expect(dialogs.useDialogStore.getState().queue).toEqual([]);
    expect(output.handle.createWritable).not.toHaveBeenCalled();
    expect(notices.useNoticeStore.getState().notices[0]).toMatchObject({
      kind: 'error',
      title: 'Could not save audio.mfe',
      message:
        'audio.mfe could not be read, so it may still hold the originals the browser lost. ' +
        'Saving over it could destroy them: use File → Save As… with another name.',
    });

    // A file that cannot be read at all (offline, locked) says as little about what it holds.
    notices.useNoticeStore.setState({ notices: [] });
    output.handle.getFile.mockRejectedValue(new DOMException('Offline', 'NotReadableError'));
    expect(await actions.saveProject()).toBe(false);
    expect(dialogs.useDialogStore.getState().queue).toEqual([]);
    expect(output.handle.createWritable).not.toHaveBeenCalled();
    expect(notices.useNoticeStore.getState().notices[0]?.message).toContain(
      'could not be read, so it may still hold',
    );
    // One that is not there any more holds nothing: the question is asked.
    output.handle.getFile.mockRejectedValue(new DOMException('Gone', 'NotFoundError'));
    const saving = actions.saveProject();
    await answerDialog('cancel');
    expect(await saving).toBe(false);
    output.handle.getFile.mockResolvedValue(new Blob([header, 'whatever follows']));

    // With nothing missing there is nothing it could hold that the browser lacks: it is replaced.
    const whole = await originalProject();
    actions.replaceProject(whole, { fileName: output.handle.name, handle: output.handle });
    actions.renameProject('Complete');
    expect(await actions.saveProject()).toBe(true);
    expect((await media.readPackageManifest(output.blob())).missing).toEqual([]);
  });

  it('asks when the file it replaces holds other recordings, or is not a project', async () => {
    const { project, lostHash } = await incompleteProject();
    const other = model.createEmptyProject('Another project');
    other.audioAssets.push(project.audioAssets[0]!);
    const unrelated = await media.preparePackage(other);
    for (const onDisk of [unrelated.toBlob(), new Blob(['{"version":17}']), new Blob([])]) {
      const output = destination();
      output.handle.getFile.mockResolvedValue(onDisk);
      actions.replaceProject(project, { fileName: output.handle.name, handle: output.handle });
      actions.renameProject('Edited');
      const saving = actions.saveProject();
      await answerDialog('confirm');
      expect(await saving).toBe(true);
      expect((await media.readPackageManifest(output.blob())).missing).toEqual([lostHash]);
    }
    await unrelated.release();
  });

  describe('opening a package', () => {
    /** A package of the project with one recording, as a library snapshot lists it. */
    async function packaged() {
      const project = await originalProject();
      project.meta.name = 'Packaged lecture';
      const prepared = await media.preparePackage(project);
      const packageBlob = prepared.toBlob();
      await prepared.release();
      await media.mediaRepository.releaseOwner('test-import');
      await media.mediaRepository.collectUnowned();
      const hash = project.audioAssets[0]!.contentHash;
      expect(await media.mediaRepository.getOriginal(hash)).toBeNull();
      const entry = {
        fileName: 'lecture.mfe',
        name: project.meta.name,
        modified: null,
        formulaCount: 0,
        project,
        textGeometry: {},
        text: '',
        packageBlob,
        handle: null,
      };
      return { entry, hash, size: packageBlob.size };
    }

    // Its container is whole and the project in it is of a newer app: not a damaged file.
    it('says why its project does not open, as a project file says it, and opens nothing', async () => {
      const { entry } = await packaged();
      const whole = entry.packageBlob;
      const head = new Uint8Array(await whole.slice(0, media.PACKAGE_HEADER_BYTES).arrayBuffer());
      const view = new DataView(head.buffer);
      const end = media.PACKAGE_HEADER_BYTES + view.getUint32(12, true);
      const manifest = JSON.parse(await whole.slice(media.PACKAGE_HEADER_BYTES, end).text()) as {
        project: { version: number };
      };
      manifest.project.version = 99;
      const json = new TextEncoder().encode(JSON.stringify(manifest));
      view.setUint32(12, json.length, true);
      const newer = new Blob([head, json, whole.slice(end)]);
      const reason =
        /^The project was saved by a newer version of the app \(format 99; this app reads up to \d+\)\.$/;

      // The folder's listing keeps the reason for the Projects dialog.
      const listed = await files.folderFile(new File([newer], 'lecture.mfe'), null);
      expect(listed).toMatchObject({ fileName: 'lecture.mfe', text: '' });
      expect(listed.unreadable).toMatch(reason);

      const before = store.useProjectStore.getState().project;
      expect(await actions.openLibraryEntry({ ...entry, packageBlob: newer })).toBe(false);
      expect(notices.useNoticeStore.getState().notices).toMatchObject([
        { kind: 'error', title: 'Could not open lecture.mfe', details: [] },
      ]);
      expect(notices.useNoticeStore.getState().notices[0]!.message).toMatch(reason);
      expect(store.useProjectStore.getState().project).toBe(before);
    });

    it('is a task: it reports how much of the file is in, and ends with the project open', async () => {
      const progress = await import('../progressStore');
      const { entry, hash, size } = await packaged();
      const seen: { title: string; message?: string; done: number; total: number }[] = [];
      const off = progress.useProgressStore.subscribe(({ tasks }) => {
        if (tasks[0]) seen.push(tasks[0]);
      });
      expect(await actions.openLibraryEntry(entry)).toBe(true);
      off();
      expect(seen[0]).toMatchObject({
        title: 'Opening lecture.mfe',
        message: 'Its recordings are checked and copied into the browser’s storage.',
      });
      expect(seen.at(-1)).toMatchObject({ done: size, total: size });
      expect(progress.useProgressStore.getState().tasks).toEqual([]);
      expect(store.useProjectStore.getState().project.meta.name).toBe('Packaged lecture');
      expect(await media.mediaRepository.getOriginal(hash)).not.toBeNull();
    });

    it('is one at a time: a second request meanwhile is ignored, and Cancel stops the only one', async () => {
      const progress = await import('../progressStore');
      const { entry, hash } = await packaged();
      // A double click on the entry asks twice, before any dialog can show.
      const first = actions.openLibraryEntry(entry);
      const second = actions.openLibraryEntry(entry);
      const seen = new Set<number>();
      const off = progress.useProgressStore.subscribe(({ tasks }) => {
        for (const task of tasks) seen.add(task.key);
        // Cancel what the dialog would show, as soon as its first bytes are in.
        const shown = tasks[0];
        if (shown && shown.done > 0 && !shown.cancelling) shown.cancel();
      });
      expect(await second).toBe(false);
      expect(await first).toBe(false);
      off();
      // One task ran, and cancelling it left nothing opening behind the user's back.
      expect(seen.size).toBe(1);
      expect(progress.useProgressStore.getState().tasks).toEqual([]);
      await ownership.mediaOwnershipSettled();
      expect(store.useProjectStore.getState().project.meta.name).not.toBe('Packaged lecture');
      expect(notices.useNoticeStore.getState().notices).toEqual([]);
      expect(await media.mediaRepository.getOriginal(hash)).toBeNull();
    });

    it('can be cancelled: nothing opens, nothing is said, and what was copied is let go', async () => {
      const progress = await import('../progressStore');
      const { entry, hash } = await packaged();
      // Cancel as soon as the first bytes are in.
      const off = progress.useProgressStore.subscribe(({ tasks: [task] }) => {
        if (task && task.done > 0 && !task.cancelling) task.cancel();
      });
      expect(await actions.openLibraryEntry(entry)).toBe(false);
      off();
      expect(progress.useProgressStore.getState().tasks).toEqual([]);
      expect(notices.useNoticeStore.getState().notices).toEqual([]);
      expect(dialogs.useDialogStore.getState().queue).toEqual([]);
      expect(store.useProjectStore.getState().project.meta.name).not.toBe('Packaged lecture');
      await ownership.mediaOwnershipSettled();
      expect(await media.mediaRepository.getOriginal(hash)).toBeNull();
      expect(
        (await media.mediaRepository.listOwners()).filter((owner) =>
          owner.id.startsWith('package-import'),
        ),
      ).toEqual([]);
    });
  });

  // B-50: Open reads the chosen file before it asks about unsaved work, and "Save" in that
  // question writes the file that is open. When the two are one file, what opens is what Save
  // wrote: the package is read a second time, and what the first read copied is let go.
  it('opens the package that Save wrote when the chosen file is the one that is open', async () => {
    const project = await originalProject();
    project.meta.name = 'Packaged lecture';
    const hash = project.audioAssets[0]!.contentHash;
    const first = await media.preparePackage(project);
    let onDisk: Blob = first.toBlob();
    await first.release();
    /** A handle of the one file on the test's disk: what Save writes to it, a later read gives. */
    const fileHandle = () => {
      const chunks: BlobPart[] = [];
      return {
        name: 'lecture.mfe',
        getFile: vi.fn(async () => new File([onDisk], 'lecture.mfe')),
        createWritable: vi.fn(async () => ({
          write: async (data: unknown) => {
            if (!ArrayBuffer.isView(data)) throw new Error('Expected a streamed package chunk');
            chunks.push(
              new Uint8Array(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
            );
          },
          close: async () => {
            onDisk = new Blob(chunks);
          },
          abort: async () => undefined,
        })),
      };
    };
    const open = fileHandle();
    actions.replaceProject(project, { fileName: open.name, handle: open });
    await ownership.syncCurrentMediaOwnership();
    await media.mediaRepository.releaseOwner('test-import');
    actions.renameProject('Edited lecture');
    expect(documents.useDocumentStore.getState().dirty).toBe(true);

    // The picker gives another handle for the same file.
    const again = fileHandle();
    const opening = actions.openLibraryEntry({
      fileName: again.name,
      name: 'Packaged lecture',
      modified: null,
      formulaCount: 0,
      project,
      textGeometry: {},
      text: '',
      handle: again,
    });
    await answerDialog('save');
    expect(await opening, JSON.stringify(notices.useNoticeStore.getState().notices)).toBe(true);

    expect((await media.readPackageManifest(onDisk)).parsed.project.meta.name).toBe(
      'Edited lecture',
    );
    expect(store.useProjectStore.getState().project.meta.name).toBe('Edited lecture');
    expect(documents.useDocumentStore.getState()).toMatchObject({ dirty: false, handle: again });
    expect(again.getFile).toHaveBeenCalledTimes(2);
    expect(notices.useNoticeStore.getState().notices).toEqual([]);
    // Neither read left an owner behind, and the recording is still the project's.
    await ownership.mediaOwnershipSettled();
    expect(
      (await media.mediaRepository.listOwners()).filter((owner) =>
        owner.id.startsWith('package-import'),
      ),
    ).toEqual([]);
    await media.mediaRepository.collectUnowned();
    expect(await media.mediaRepository.getOriginal(hash)).not.toBeNull();
  });

  it('pins originals across document replacement and pending physical publication', async () => {
    const project = await originalProject();
    const hash = project.audioAssets[0]!.contentHash;
    const output = destination('audio.mfe', true);
    actions.replaceProject(project, { fileName: output.handle.name, handle: output.handle });
    const saving = actions.saveProject();
    await output.entered;
    actions.replaceProject(model.createEmptyProject('Replacement'), {
      fileName: null,
      handle: null,
    });
    await media.mediaRepository.releaseOwner('test-import');
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
    expect(await media.mediaRepository.getOriginal(hash)).not.toBeNull();
    output.release();
    expect(await saving, JSON.stringify(notices.useNoticeStore.getState().notices)).toBe(true);
    expect(store.useProjectStore.getState().project.meta.name).toBe('Replacement');
    expect(documents.useDocumentStore.getState().handle).toBeNull();
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(1);
  });

  it('retains a deleted asset through Undo and Redo while unowned cleanup runs', async () => {
    const project = await originalProject();
    const hash = project.audioAssets[0]!.contentHash;
    actions.replaceProject(project, { fileName: null, handle: null });
    stops.push(ownership.startMediaOwnership());
    await ownership.syncCurrentMediaOwnership();
    await media.mediaRepository.releaseOwner('test-import');
    store.useProjectStore.getState().update((draft) => {
      draft.audioAssets = [];
    });
    await ownership.syncCurrentMediaOwnership();
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
    store.history.undo();
    expect(store.useProjectStore.getState().project.audioAssets[0]?.contentHash).toBe(hash);
    store.history.redo();
    await ownership.syncCurrentMediaOwnership();
    expect(await media.mediaRepository.getOriginal(hash)).not.toBeNull();
  });

  it('publishes audio recovery only after originals are pinned, then flushes metadata synchronously', async () => {
    const project = await originalProject();
    actions.replaceProject(project, { fileName: null, handle: null });
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
    actions.renameProject('Waiting for originals');
    await entered.promise;
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    expect(localStorage.getItem(key)).toBeNull();
    release.resolve();
    await vi.waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
    const recovered = JSON.parse(localStorage.getItem(key)!);
    expect(recovered).toMatchObject({ v: 4, name: 'Waiting for originals' });
    expect(
      (await media.mediaRepository.listOwners()).find((owner) => owner.id === recovered.mediaOwner)
        ?.hashes,
    ).toEqual([project.audioAssets[0]!.contentHash]);
    await media.mediaRepository.releaseOwner('test-import');
    actions.renameProject('Immediate reload');
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(key)!).name).toBe('Immediate reload');
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
  });

  it('lets the history owner go when the page leaves, after the last recovery write', async () => {
    const project = await originalProject();
    const hash = project.audioAssets[0]!.contentHash;
    stops.push(ownership.startMediaOwnership(), autosave.startAutosave(60_000));
    const kinds = async () =>
      (await media.mediaRepository.listOwners()).map((owner) => owner.id.split(':')[0]).sort();
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
    // The recording arrives and the page is closed at once: no autosave has run yet.
    actions.replaceProject(project, { fileName: null, handle: null });
    actions.renameProject('Closed right away');
    await ownership.syncCurrentMediaOwnership();
    await media.mediaRepository.releaseOwner('test-import');
    expect(await kinds()).toEqual(['history']);

    // Into the back/forward cache: the page may be shown again, and keeps its owner.
    window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    await entered.promise;
    expect(await kinds()).toEqual(['history']);
    // Leaving for good, with that write still on its way: the history holds on until the
    // recovery owner has the recording.
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await kinds()).toEqual(['history']);
    release.resolve();
    await vi.waitFor(async () => expect(await kinds()).toEqual(['recovery']));
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
    expect(await media.mediaRepository.getOriginal(hash)).not.toBeNull();
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    expect(JSON.parse(localStorage.getItem(key)!).name).toBe('Closed right away');
  });

  it('publishes recovery for a project that lacks an original, and owns it once it is back', async () => {
    const project = await originalProject();
    const present = project.audioAssets[0]!.contentHash;
    const lost = new Blob(['lost source']);
    const lostHash = await media.hashBlob(lost);
    project.audioAssets.push(
      model.createAudioAsset({
        contentHash: lostHash,
        byteLength: lost.size,
        name: 'Lost',
        originalName: 'lost.wav',
        mimeType: 'audio/wav',
        duration: 1,
        sampleRate: 48000,
        channels: 1,
      }),
    );
    actions.replaceProject(project, { fileName: null, handle: null });
    stops.push(ownership.startMediaOwnership(), autosave.startAutosave(1));
    actions.renameProject('Incomplete');
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    await vi.waitFor(() => expect(localStorage.getItem(key)).toContain('Incomplete'));
    const record = JSON.parse(localStorage.getItem(key)!);
    // The record says what the project is; its owner holds what there is of it.
    expect(record.text).toContain(lostHash);
    const held = async () =>
      (await media.mediaRepository.listOwners()).find((owner) => owner.id === record.mediaOwner)
        ?.hashes;
    expect(await held()).toEqual([present]);
    expect(JSON.stringify(notices.useNoticeStore.getState().notices)).not.toContain(
      'recovery could not be saved',
    );

    // Its originals are settled: a later edit is flushed at once when the page hides.
    actions.renameProject('Edited before leaving');
    window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    expect(JSON.parse(localStorage.getItem(key)!).name).toBe('Edited before leaving');

    // The same file is imported again (the Audio tab hands it over): the record gets it too.
    await media.mediaRepository.storeOriginal(lost, { ownerId: 'reimport' });
    await ownership.syncCurrentMediaOwnership();
    await vi.waitFor(async () => expect(await held()).toEqual([lostHash, present].sort()));
    await media.mediaRepository.releaseOwner('reimport');
    await media.mediaRepository.releaseOwner('test-import');
    // So when the page is gone, with its history, the record still has both recordings.
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(async () =>
      expect((await media.mediaRepository.listOwners()).map((owner) => owner.id)).toEqual([
        record.mediaOwner,
      ]),
    );
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
  });

  it('pins again when an original arrived while a recovery pin was on its way', async () => {
    const lost = new Blob(['lost source']);
    const lostHash = await media.hashBlob(lost);
    const project = model.createEmptyProject('Repair');
    project.audioAssets.push(
      model.createAudioAsset({
        contentHash: lostHash,
        byteLength: lost.size,
        name: 'Lost',
        originalName: 'lost.wav',
        mimeType: 'audio/wav',
        duration: 1,
        sampleRate: 48000,
        channels: 1,
      }),
    );
    // The recovery pin has read the store, and its answer is still on its way.
    const originalPin = media.mediaRepository.pinAvailable.bind(media.mediaRepository);
    const entered = deferred();
    const release = deferred();
    let held = false;
    vi.spyOn(media.mediaRepository, 'pinAvailable').mockImplementation(async (owner, hashes) => {
      const missing = await originalPin(owner, hashes);
      if (owner.startsWith('recovery:') && !held) {
        held = true;
        entered.resolve();
        await release.promise;
      }
      return missing;
    });
    actions.replaceProject(project, { fileName: null, handle: null });
    stops.push(ownership.startMediaOwnership(), autosave.startAutosave(1));
    actions.renameProject('Repair, edited');
    await entered.promise;
    // The same file is imported again meanwhile.
    await media.mediaRepository.storeOriginal(lost, { ownerId: 'reimport' });
    await ownership.syncCurrentMediaOwnership();
    release.resolve();
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    await vi.waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
    const record = JSON.parse(localStorage.getItem(key)!);
    await vi.waitFor(async () =>
      expect(
        (await media.mediaRepository.listOwners()).find((owner) => owner.id === record.mediaOwner)
          ?.hashes,
      ).toEqual([lostHash]),
    );
  });

  it('pins the recovery owner anew when media is handed over after the store was emptied', async () => {
    const project = await originalProject();
    const hash = project.audioAssets[0]!.contentHash;
    actions.replaceProject(project, { fileName: null, handle: null });
    stops.push(ownership.startMediaOwnership(), autosave.startAutosave(1));
    actions.renameProject('Before the loss');
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    await vi.waitFor(() => expect(localStorage.getItem(key)).toContain('Before the loss'));
    const record = JSON.parse(localStorage.getItem(key)!);
    const held = async () =>
      (await media.mediaRepository.listOwners()).find((owner) => owner.id === record.mediaOwner)
        ?.hashes;
    expect(await held()).toEqual([hash]);

    // The browser's storage goes under the open page, owners included.
    vi.stubGlobal('indexedDB', new IDBFactory());
    expect(await held()).toBeUndefined();
    // Edits are still published: the record says what the project is.
    actions.renameProject('After the loss');
    await vi.waitFor(() => expect(localStorage.getItem(key)).toContain('After the loss'));

    // The recording comes back (Save found it in the project's file, or it was imported again)
    // and is handed over: the record's owner exists again, and holds it.
    await media.mediaRepository.storeOriginal(new Blob(['original bytes']), {
      ownerId: 'restored',
    });
    await ownership.syncCurrentMediaOwnership();
    await vi.waitFor(async () => expect(await held()).toEqual([hash]));
    await media.mediaRepository.releaseOwner('restored');
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(async () =>
      expect((await media.mediaRepository.listOwners()).map((owner) => owner.id)).toEqual([
        record.mediaOwner,
      ]),
    );
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
  });

  it('keeps in the recovery owner what the document ever had, across hand-overs', async () => {
    const project = await originalProject();
    const deleted = project.audioAssets[0]!.contentHash;
    actions.replaceProject(project, { fileName: null, handle: null });
    stops.push(ownership.startMediaOwnership(), autosave.startAutosave(1));
    actions.renameProject('With the recording');
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    await vi.waitFor(() => expect(localStorage.getItem(key)).toContain('With the recording'));
    const record = JSON.parse(localStorage.getItem(key)!);
    const held = async () =>
      (await media.mediaRepository.listOwners()).find((owner) => owner.id === record.mediaOwner)
        ?.hashes;
    // Another tab copied this record while this one was not answering: the copy names the same
    // owner, and still needs the recording that is deleted here next.
    const added = await media.mediaRepository.storeOriginal(new Blob(['second source']), {
      ownerId: 'second-import',
    });
    store.useProjectStore.getState().update((draft) => {
      draft.audioAssets = [
        model.createAudioAsset({
          ...added,
          name: 'Second',
          originalName: 'second.wav',
          mimeType: 'audio/wav',
          duration: 1,
          sampleRate: 48000,
          channels: 1,
        }),
      ];
    });
    // The import hands its bytes over, and the autosave pins its owner anew.
    await ownership.syncCurrentMediaOwnership();
    await vi.waitFor(async () => expect(await held()).toContain(added.contentHash));
    expect(await held()).toEqual([added.contentHash, deleted].sort());
    // And again after the page was away and found its record gone.
    localStorage.removeItem(key);
    window.dispatchEvent(new Event('pageshow'));
    await vi.waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
    await autosave.waitForAutosaveMedia();
    expect(await held()).toEqual([added.contentHash, deleted].sort());
  });

  it('keeps the previous recovery record when the media store fails', async () => {
    const project = await originalProject();
    actions.replaceProject(project, { fileName: null, handle: null });
    stops.push(autosave.startAutosave(1));
    actions.renameProject('Recoverable');
    const key = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    await vi.waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
    const previous = localStorage.getItem(key);
    const added = await media.mediaRepository.storeOriginal(new Blob(['second source']), {
      ownerId: 'second-import',
    });
    const failing = vi
      .spyOn(media.mediaRepository, 'pinAvailable')
      .mockRejectedValue(new media.MediaStorageError('transaction', 'The database failed.'));
    store.useProjectStore.getState().update((draft) => {
      draft.audioAssets.push(
        model.createAudioAsset({
          ...added,
          name: 'Second',
          originalName: 'second.wav',
          mimeType: 'audio/wav',
          duration: 1,
          sampleRate: 48000,
          channels: 1,
        }),
      );
    });
    await vi.waitFor(() =>
      expect(
        notices.useNoticeStore
          .getState()
          .notices.some((notice) => notice.title === 'Audio recovery could not be saved'),
      ).toBe(true),
    );
    expect(localStorage.getItem(key)).toBe(previous);
    // A failed pin does not poison the writes after it.
    failing.mockRestore();
    actions.renameProject('Repaired recovery');
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem(key)!).name).toBe('Repaired recovery'),
    );
    expect(localStorage.getItem(key)).toContain(added.contentHash);
    const record = JSON.parse(localStorage.getItem(key)!);
    expect(
      (await media.mediaRepository.listOwners()).find((owner) => owner.id === record.mediaOwner)
        ?.hashes,
    ).toEqual([added.contentHash, project.audioAssets[0]!.contentHash].sort());
  });

  it("copies another tab's audio recovery without expiring its shared original ownership", async () => {
    const project = await originalProject();
    actions.replaceProject(project, { fileName: null, handle: null });
    const stop = autosave.startAutosave(1);
    actions.renameProject('Suspended audio tab');
    const oldSession = autosave.sessionId();
    const oldKey = autosave.AUTOSAVE_PREFIX + oldSession;
    await vi.waitFor(() => expect(localStorage.getItem(oldKey)).not.toBeNull());
    stop();
    await autosave.waitForAutosaveMedia();
    const originalRecord = JSON.parse(localStorage.getItem(oldKey)!);
    // A stale heartbeat may be a suspended tab: copying must not delete its recovery source.
    localStorage.setItem(
      autosave.ALIVE_PREFIX + oldSession,
      String(Date.now() - autosave.STALE_AFTER_MS - 1),
    );
    sessionStorage.clear();
    actions.replaceProject(model.createEmptyProject('New tab'), { fileName: null, handle: null });
    expect(autosave.restoreAutosave()).toBe(true);
    const newKey = autosave.AUTOSAVE_PREFIX + autosave.sessionId();
    expect(newKey).not.toBe(oldKey);
    expect(JSON.parse(localStorage.getItem(newKey)!).mediaOwner).toBe(originalRecord.mediaOwner);
    expect(localStorage.getItem(oldKey)).not.toBeNull();
    await media.mediaRepository.releaseOwner('test-import');
    expect((await media.mediaRepository.collectUnowned()).removed).toBe(0);
    expect(
      await media.mediaRepository.getOriginal(project.audioAssets[0]!.contentHash),
    ).not.toBeNull();
  });
});
