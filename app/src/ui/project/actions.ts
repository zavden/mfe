/* Project lifecycle actions: New, Open, Save, Save As, and the unsaved-changes guard. Used by
 * the menu bar and the keyboard shortcuts. Every message goes through in-app dialogs/notices. */
import { parseProject, type Project } from '../../model';
import {
  fitsProjectFile,
  importEmbeddedTextGeometry,
  importPackage,
  discardImportedMedia,
  isProjectPackage,
  MediaStorageError,
  UnopenedProjectError,
  pinAvailableProjectMedia,
  preparePackage,
  prepareProjectFile,
  projectMediaHashes,
  recoverEmbeddedTextGeometry,
  recoverOriginals,
  textGeometryIdentity,
  type MediaLease,
  type PreparedPackage,
  type PreparedProjectFile,
  type ProjectPayload,
  type RefusedTextGeometry,
} from '../../media';
import { history, loadProject, onProjectAmended, useProjectStore, useUiStore } from '../../store';
import { refreshAudioMedia } from '../audio/audioRuntime';
import { mainPlayback } from '../transport/mainPlayback';
import { confirmDialog, showDialog } from './dialogStore';
import { useDocumentStore } from './documentStore';
import {
  downloadText,
  downloadBlob,
  ensureWritable,
  hasFileSystemAccess,
  loadStoredHandle,
  needsPermission,
  pickFileViaInput,
  pickOpenHandle,
  pickSaveHandle,
  storeHandle,
  suggestedFileName,
  writeToHandle,
  type FileHandleLike,
} from './files';
import type { LibraryEntry } from './library';
import { libraryFolderHandle } from './libraryStore';
import { notify } from './noticeStore';
import { withProgress } from './progressStore';
import { mayBeSameFile, reserveSave } from './saveQueue';
import type { StarterExample } from './starterExamples';
import { createNewEditorProject } from './newEditorProject';
import { syncCurrentMediaOwnership } from './mediaOwnership';
import { blockTextCompositionCommand } from '../text/textCompositionStore';

/** Replace the project and reset everything that points into the old one. */
export function replaceProject(project: Project, info: FileInfo): void {
  loadProject(project);
  mainPlayback.reset();
  useUiStore.getState().select({ kind: 'none' });
  useDocumentStore.getState().beginDocument(useProjectStore.getState().project, info);
  void storeHandle(info.handle, useDocumentStore.getState().documentId);
}

/** After the autosave restored a document that had a file, put its stored handle back (the
 * handle lives in IndexedDB, the autosave in localStorage) when it belongs to that document:
 * both carry the document's id, so a handle another tab stored for a file of the same name
 * (`a/scene.mfe.json` here, `b/scene.mfe.json` there) is left alone, and Save asks where. The
 * handle is also left alone when the document was replaced meanwhile. Plain Save then writes the
 * same file again, after the browser's permission question. */
export async function restoreDocumentHandle(): Promise<void> {
  const { session, fileName, documentId } = useDocumentStore.getState();
  if (!fileName) return;
  const stored = await loadStoredHandle();
  const now = useDocumentStore.getState();
  if (
    !stored ||
    stored.documentId !== documentId ||
    now.session !== session ||
    now.handle ||
    now.fileName !== stored.handle.name
  ) {
    return;
  }
  useDocumentStore.setState({ handle: stored.handle });
}

/** Whether the current project may be replaced, with what is not saved in mind: no (`cancel`),
 * yes (`proceed`: nothing is unsaved, or the user gave it up), or yes after a save the question
 * itself made (`saved`), which wrote a file. A drag that is still held is given up first: what it
 * moved is no change yet, and the question is about the project without it. */
async function askToReplace(): Promise<'cancel' | 'proceed' | 'saved'> {
  if (blockTextCompositionCommand()) return 'cancel';
  history.cancelForeignGesture();
  const { dirty, session } = useDocumentStore.getState();
  if (!dirty) return 'proceed';
  const choice = await showDialog({
    title: 'Unsaved changes',
    message: 'The current project has changes that were not saved to a file.',
    cancelId: 'cancel',
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'discard', label: "Don't save", tone: 'danger' },
      { id: 'save', label: 'Save', tone: 'primary' },
    ],
  });
  if (useDocumentStore.getState().session !== session) return 'cancel';
  if (choice === 'discard') return 'proceed';
  // Saved, unless the user edited meanwhile (the save wrote the earlier state).
  if (choice === 'save') {
    const saved = await saveProject();
    const document = useDocumentStore.getState();
    return saved && document.session === session && !document.dirty ? 'saved' : 'cancel';
  }
  return 'cancel';
}

/** Resolve true when it is fine to replace the current project: nothing unsaved, or the user
 * saved or discarded it (`askToReplace`). */
export async function confirmDiscard(): Promise<boolean> {
  return (await askToReplace()) !== 'cancel';
}

/** Rename the project (the name in the menu bar, also a field of Project settings…): one undo
 * step, none when the name does not change. An empty name becomes "Untitled". */
export function renameProject(name: string): void {
  const next = name.trim() || 'Untitled';
  if (next === useProjectStore.getState().project.meta.name) return;
  useProjectStore.getState().update((draft) => {
    draft.meta.name = next;
  });
}

export async function newProject(): Promise<void> {
  if (!(await confirmDiscard())) return;
  replaceProject(createNewEditorProject(), { fileName: null, handle: null });
}

/** First start only, after recovery had its chance. Repeated React initialization is harmless. */
export function initializeNewEditorProject(): void {
  if (
    useDocumentStore.getState().session !== 0 ||
    useProjectStore.getState().project !== useProjectStore.getInitialState().project
  )
    return;
  replaceProject(createNewEditorProject(), { fileName: null, handle: null });
}

interface FileInfo {
  fileName: string | null;
  handle: FileHandleLike | null;
}

type Opened = Extract<ReturnType<typeof parseProject>, { ok: true }>;

/** Tell that a project does not open, and why: the same notice for a `.mfe.json` and for the
 * project of a package. */
function notifyUnopened(fileName: string | null, error: string, details: readonly string[]): void {
  notify({
    kind: 'error',
    title: fileName ? `Could not open ${fileName}` : 'Could not open the file',
    message: error,
    details: details.slice(0, 6),
  });
}

/** Parse project text; an unreadable file is reported in an error notice. */
function parseOrNotify(text: string, info: FileInfo): Opened | null {
  const parsed = parseProject(text);
  if (parsed.ok) return parsed;
  notifyUnopened(info.fileName, parsed.error, parsed.details);
  return null;
}

/** Make a parsed file the current project and tell the user about what it contained: its issues
 * in a notice that is an error's — red, and there until dismissed — when one of them is an error,
 * and a warning's when they are warnings alone (red is for errors: D177, D187). */
function applyOpened(parsed: Opened, info: FileInfo): void {
  replaceProject(parsed.project, info);
  const problems = parsed.issues;
  if (problems.length > 0) {
    const errors = problems.filter((i) => i.severity === 'error').length;
    notify({
      kind: errors > 0 ? 'error' : 'warning',
      title: `Opened with ${problems.length} issue${problems.length === 1 ? '' : 's'}`,
      message:
        errors > 0
          ? 'The project contains errors; preview and export may not represent it faithfully.'
          : 'The project contains warnings.',
      details: problems.slice(0, 8).map((i) => i.message),
    });
  }
  if (parsed.migratedFrom !== null) {
    notify({
      kind: 'info',
      title: `Upgraded from format ${parsed.migratedFrom}`,
      message: 'Saving writes the current format.',
    });
  }
}

/** The file held geometry for these texts that could not be used: they are in the project as
 * texts whose geometry is missing, and the user learns which and why. */
function tellRefusedGeometry(fileName: string | null, refused: readonly RefusedTextGeometry[]) {
  const one = refused.length === 1;
  notify({
    kind: 'warning',
    title: one
      ? 'A text opened without its saved appearance'
      : `${refused.length} texts opened without their saved appearance`,
    message:
      `What ${fileName ?? 'the file'} holds of ${one ? 'its' : 'their'} geometry could not be ` +
      `used. ${one ? 'The text is' : 'The texts are'} in the project all the same, drawn as ` +
      `placeholder boxes. ${one ? 'Its' : 'Their'} appearance comes back from a file that ` +
      `still carries it, or from Refresh appearance in ${one ? 'its' : 'their'} editor, which ` +
      'needs the companion.',
    details: [
      ...refused.slice(0, 8).map(({ name, reason }) => `${name}: ${reason}`),
      ...(refused.length > 8 ? [`and ${refused.length - 8} more`] : []),
    ],
  });
}

/** Open project text without asking about unsaved changes, and without the geometry a file may
 * carry for its texts (`openProjectVia` brings that in). Returns false (after telling the user)
 * when it is unreadable. */
export function openProjectText(text: string, info: FileInfo): boolean {
  const parsed = parseOrNotify(text, info);
  if (!parsed) return false;
  applyOpened(parsed, info);
  return true;
}

/** Ask the user for a project file: native picker, or a file input as the fallback. `chosen`
 * learns the file's name before it is read (for the error when reading fails). */
async function pickProjectFile(chosen: (name: string) => void): Promise<ProjectFile | null> {
  if (hasFileSystemAccess()) {
    const handle = await pickOpenHandle();
    if (!handle) return null;
    chosen(handle.name);
    const file = await handle.getFile();
    return projectFile(file, { fileName: file.name, handle });
  }
  const file = await pickFileViaInput();
  if (!file) return null;
  chosen(file.name);
  return projectFile(file, { fileName: file.name, handle: null });
}

interface ProjectFile {
  text?: string;
  packageBlob?: Blob;
  info: FileInfo;
}

async function projectFile(file: File, info: FileInfo): Promise<ProjectFile> {
  return /\.mfe$/i.test(file.name)
    ? { packageBlob: file, info }
    : { text: await file.text(), info };
}

/** A file that was read, ready to become the project: `parsed` is null when it is no project
 * (the user was told). What its preparation copied into the browser's storage belongs to `lease`
 * until the project that opens takes it over, or it is given up (`importedHashes`). `refused`:
 * the texts whose geometry in the file could not be used. */
interface PreparedOpening {
  parsed: Opened | null;
  lease: MediaLease | null;
  importedHashes: string[];
  refused: RefusedTextGeometry[];
}

/** Read what `picked` holds: a package's recordings, or the text of a `.mfe.json` and the
 * geometry it carries for its texts, are checked and copied into the browser's storage. `name`
 * is the file's, for the task the user watches. */
async function prepareOpened(picked: ProjectFile, name: string | null): Promise<PreparedOpening> {
  if (picked.packageBlob) {
    // Every recording is hashed and copied into the browser's storage: with hundreds of
    // megabytes that takes a while, so it is a task the user watches and can cancel.
    const packageBlob = picked.packageBlob;
    const imported = await withProgress(
      {
        title: `Opening ${name ?? 'the project'}`,
        message: 'Its recordings are checked and copied into the browser’s storage.',
      },
      (onProgress, signal) => importPackage(packageBlob, { onProgress, signal }),
    );
    return {
      parsed: imported.parsed,
      lease: imported.lease,
      importedHashes: projectMediaHashes(imported.parsed.project),
      refused: [],
    };
  }
  const parsed = parseOrNotify(picked.text ?? '', picked.info);
  if (!parsed || Object.keys(parsed.textGeometry).length === 0) {
    return { parsed, lease: null, importedHashes: [], refused: [] };
  }
  // The geometry the file carries for its texts is in the browser's storage before the
  // project shows: they draw as they were saved, with no companion. A task like the
  // opening of a package: with a lot of text it takes a while, and can be cancelled.
  const { project, textGeometry } = parsed;
  const embedded = await withProgress(
    {
      title: `Opening ${name ?? 'the project'}`,
      message: 'The appearance of its texts is checked and stored in the browser.',
    },
    (onProgress, signal) =>
      importEmbeddedTextGeometry(project, textGeometry, { onProgress, signal }),
  );
  return {
    parsed,
    lease: embedded.lease,
    importedHashes: embedded.imported,
    refused: embedded.refused,
  };
}

/** A file is being opened: from the moment it is in hand until it shows or is given up. */
let opening = false;

/** Open the project `read` gives (a picker, a library entry): the file is read and parsed
 * first, and only a readable project asks about unsaved work. True when it was opened. One
 * opening at a time: a request that arrives while a file is on its way (a double click on a
 * project of the list) is ignored, so that what the user watches, and may cancel, is all there
 * is.
 *
 * "Save", in the question about unsaved work, writes a file after this one was read, and it may
 * be this very file: the one that is open chosen again, or the destination given to Save As. A
 * file the app can read again (one with a handle) is therefore read again after such a save, and
 * what opens is what it holds now. Whether the two are one file is not asked: handles cannot
 * always be compared, and a second read answers for every case. The first read still comes
 * before the question, so that a file that is no project asks nothing. */
async function openProjectVia(
  read: (chosen: (name: string) => void) => Promise<ProjectFile | null>,
): Promise<boolean> {
  if (blockTextCompositionCommand()) return false;
  let name: string | null = null;
  let prepared: PreparedOpening | null = null;
  let retainLease = false;
  let applied = false;
  const session = useDocumentStore.getState().session;
  let own = false;
  try {
    const picked = await read((chosen) => (name = chosen));
    if (!picked || opening) return false;
    opening = own = true;
    prepared = await prepareOpened(picked, name);
    if (!prepared.parsed) return false;
    if (useDocumentStore.getState().session !== session) return false;
    const answer = await askToReplace();
    if (answer === 'cancel') return false;
    if (useDocumentStore.getState().session !== session) return false;
    const { handle } = picked.info;
    if (answer === 'saved' && handle) {
      const before = prepared;
      prepared = null;
      if (before.lease) await discardImportedMedia(before.lease, before.importedHashes);
      prepared = await prepareOpened(await projectFile(await handle.getFile(), picked.info), name);
      if (!prepared.parsed) return false;
      // The leave to replace the project was given for the work that Save wrote. What was
      // edited while the file was read again is not part of it: that project stays.
      const document = useDocumentStore.getState();
      if (document.session !== session || document.dirty) return false;
    }
    const { parsed, lease, refused } = prepared;
    applyOpened(parsed, picked.info);
    applied = true;
    if (refused.length > 0) tellRefusedGeometry(picked.info.fileName, refused);
    if (lease) {
      // If the handoff fails, the durable import owner remains responsible for these bytes.
      retainLease = true;
      try {
        await syncCurrentMediaOwnership();
        retainLease = false;
      } catch (error) {
        notify({
          kind: 'warning',
          title: 'Project recovery needs attention',
          message:
            'The project opened, but the browser could not finish preparing source recovery. Keep its complete project file.',
          details: [String(error)],
        });
      }
    }
    return true;
  } catch (error) {
    // The user cancelled the opening: what was copied is already let go, and nothing is news.
    if (error instanceof MediaStorageError && error.code === 'cancelled') return false;
    // A package that is whole, with a project this app does not open: its reason, as a
    // `.mfe.json` gives it.
    if (error instanceof UnopenedProjectError) {
      notifyUnopened(name, error.message, error.details);
      return false;
    }
    notify({
      kind: 'error',
      title: name ? `Could not read ${name}` : 'Could not open a file',
      message:
        error instanceof MediaStorageError
          ? error.message
          : 'The browser may have lost access to it (moved, renamed or deleted). Try File → Open… again.',
      details: [String(error)],
    });
    return false;
  } finally {
    if (own) opening = false;
    if (prepared?.lease && !retainLease) {
      if (applied) await prepared.lease.release().catch(() => undefined);
      else await discardImportedMedia(prepared.lease, prepared.importedHashes);
    }
  }
}

/** File → Open: choose a file first, then (only if it is a readable project) make sure unsaved
 * work is saved or discarded. */
export async function openProject(): Promise<void> {
  await openProjectVia(pickProjectFile);
}

/** Open one of the examples the app carries (`starterExamples.ts`), as a file is opened: read by
 * the reader of files, after asking about unsaved work. It opens as a project without a file: it
 * is the user's to change, and Save asks where it goes. True when it was opened. */
export function openExample(example: StarterExample): Promise<boolean> {
  return openProjectVia((chosen) => {
    chosen(`the example “${example.name}”`);
    return Promise.resolve({ text: example.text(), info: { fileName: null, handle: null } });
  });
}

/** Open a project of the synced folder (the Projects dialog). A file with a handle is read
 * afresh and keeps it, so Save writes it in place; one of a snapshot opens as it was listed and
 * saves as a download. True when it was opened. */
export function openLibraryEntry(entry: LibraryEntry): Promise<boolean> {
  return openProjectVia(async (chosen) => {
    chosen(entry.fileName);
    const info = { fileName: entry.fileName, handle: entry.handle };
    if (entry.handle) return projectFile(await entry.handle.getFile(), info);
    if (/\.mfe$/i.test(entry.fileName)) {
      if (!entry.packageBlob)
        throw new Error('This folder snapshot has no original package. Sync the folder again.');
      return { packageBlob: entry.packageBlob, info };
    }
    return { text: entry.text, info };
  });
}

let nextSave = 0;
let lastSaved = 0;

interface SaveContext {
  id: number;
  session: number;
  documentId: string;
  project: Project;
  /** Only legacy derived metadata may follow this equivalent dirty baseline. Serialized
   * project/payloads above are frozen; new text geometry never follows either capture. */
  baseline: Project;
  fileName: string;
  queue: ReturnType<typeof reserveSave>;
  writing: boolean;
  /** The user chose the destination in a picker during this command: it is written whatever
   * becomes of the document meanwhile (see `saveTo`). */
  chosen: boolean;
  /** The user agreed to a file without the originals the browser no longer holds. */
  incomplete: boolean;
  /** The originals, by content hash, that the package being written does not carry. */
  lacking: string[];
  packaged: boolean;
  mediaReady: Promise<MediaLease | Error> | null;
}

const ownsDocument = (save: SaveContext) => useDocumentStore.getState().session === save.session;

/** Only successful commits advance the baseline: a newer failed/cancelled attempt must not hide
 * an earlier success. Saves to different files can finish independently; the newer success owns
 * the document's handle. A completion from a replaced document never owns the new one. */
function markSaved(save: SaveContext, info: FileInfo): void {
  if (!ownsDocument(save) || save.id < lastSaved) return;
  lastSaved = save.id;
  useDocumentStore.getState().markClean(save.baseline, { ...info, lacking: save.lacking });
  void storeHandle(info.handle, save.documentId);
}

/** What a save writes: a package, or the text of a `.mfe.json` with the geometry of its texts
 * inside. Either pins what it carries until it is released, and says what it goes without. */
type PreparedSave = PreparedPackage | PreparedProjectFile;

function prepareSave(save: SaveContext): Promise<PreparedSave> {
  return save.packaged
    ? preparePackage(save.project, { allowMissing: true })
    : prepareProjectFile(save.project);
}

/** Download fallback uses the same captured snapshot and document as the native save command. */
async function download(save: SaveContext): Promise<boolean> {
  if (!ownsDocument(save)) return false;
  let prepared: PreparedSave | undefined;
  try {
    await readyMedia(save);
    prepared = await prepareSave(save);
    if (!ownsDocument(save)) return false;
    if (!(await acceptIncomplete(save, save.fileName, prepared.missing))) return false;
    if (!ownsDocument(save)) return false;
    save.lacking = prepared.missing.map((payload) => payload.contentHash);
    if ('text' in prepared) downloadText(save.fileName, prepared.text);
    else downloadBlob(save.fileName, prepared.toBlob());
    markSaved(save, { fileName: save.fileName, handle: null });
    return true;
  } catch (error) {
    notify({
      kind: 'error',
      title: 'Could not save the complete project',
      message: error instanceof MediaStorageError ? error.message : String(error),
    });
    return false;
  } finally {
    await prepared?.release().catch(() => undefined);
  }
}

async function readyMedia(save: SaveContext): Promise<void> {
  const result = await save.mediaReady;
  if (result instanceof Error) throw result;
}

/** What the missing originals are called, for the user: a recording by its name and the file it
 * came from (the one to import again), a text by its name. */
function missingNames(project: Project, missing: readonly ProjectPayload[]): string[] {
  const hashes = new Set(missing.map((payload) => payload.contentHash));
  return [
    ...project.audioAssets
      .filter((asset) => hashes.has(asset.contentHash))
      .map((asset) =>
        asset.originalName && asset.originalName !== asset.name
          ? `${asset.name} (${asset.originalName})`
          : asset.name,
      ),
    ...project.formulas
      .filter(
        (formula) =>
          formula.kind === 'text' && formula.geometry && hashes.has(formula.geometry.contentHash),
      )
      .map((formula) => `${formula.name} (text appearance)`),
  ];
}

/** A project can be saved without the originals the browser no longer holds: the user decides,
 * knowing which they are. Asked once per command; true when the file may be written. */
async function acceptIncomplete(
  save: SaveContext,
  fileName: string,
  missing: readonly ProjectPayload[],
): Promise<boolean> {
  if (!missing.length || save.incomplete) return true;
  // The page may not know yet (the storage went under it): its clips get their marks now.
  refreshAudioMedia();
  const names = missingNames(save.project, missing);
  // Several objects can use one original (two texts with the same appearance).
  const count = new Set(missing.map((payload) => payload.contentHash)).size;
  const one = count === 1;
  const remedies = [
    missing.some((payload) => payload.role === 'audio-source')
      ? 'a recording comes back when the same file is imported again in the Audio tab'
      : '',
    missing.some((payload) => payload.role === 'text-geometry')
      ? 'a text is drawn as placeholder boxes until Refresh appearance, in its editor, shapes it again, which needs the companion'
      : '',
  ].filter(Boolean);
  save.incomplete = await confirmDialog({
    title: 'Save without the missing media?',
    message:
      `The browser no longer holds ${one ? 'one original' : `${count} originals`} of ` +
      `“${save.project.meta.name}”, so ${fileName} cannot contain ${one ? 'it' : 'them'}. ` +
      `What uses ${one ? 'it' : 'them'} stays in the project, marked as missing: ` +
      `${remedies.join('; ')}.`,
    details: [...names.slice(0, 8), ...(names.length > 8 ? [`and ${names.length - 8} more`] : [])],
    confirmLabel: 'Save without the missing media',
  });
  return save.incomplete;
}

/** The file about to be replaced may be the only place that still holds what the browser lost
 * (the project was opened from it before the browser's storage was cleared or evicted). Bring
 * those originals back from it, be it a package or a `.mfe.json` with the geometry of its texts
 * inside: `lease` owns what came back (`recovered`), and `unreadable` are the ones the file
 * holds that could not be read back. Nothing of either when the file has none of them, is not a
 * project (a new file, another format) or is not there any more. `opaque`: nobody knows what it
 * holds, because it cannot be read (offline, locked) or is a project that cannot be understood
 * (a package of a later version, a file that is damaged). */
async function originalsFrom(
  handle: FileHandleLike,
  missing: readonly ProjectPayload[],
): Promise<{
  lease: MediaLease | null;
  recovered: string[];
  unreadable: string[];
  opaque: boolean;
}> {
  const nothing = { lease: null, recovered: [], unreadable: [], opaque: false };
  try {
    const file = await handle.getFile();
    if (!file) return nothing;
    const { lease, recovered, unreadable } = (await isProjectPackage(file))
      ? await recoverOriginals(file, missing)
      : await recoverEmbeddedTextGeometry(file, missing);
    if (recovered.length) return { lease, recovered, unreadable, opaque: false };
    await lease.release().catch(() => undefined);
    return { lease: null, recovered, unreadable, opaque: false };
  } catch (error) {
    return { ...nothing, opaque: (error as { name?: string } | null)?.name !== 'NotFoundError' };
  }
}

/** A user-facing reason not to write a destination: the notice shows it as it is. */
class SaveRefusal extends Error {}

/** What a save writes, with everything the destination itself could give back. What came back
 * is the open document's again, if that is still the one being saved. A destination that holds
 * a lost original which could not be read back, or that may hold one, is not replaced: it is
 * the last copy. Neither is one whose copy came back and is still not what the browser gives
 * (the browser's own copy is the damaged one, and the file's the good one). */
async function completeSave(save: SaveContext, handle: FileHandleLike): Promise<PreparedSave> {
  const prepared = await prepareSave(save);
  if (!prepared.missing.length) return prepared;
  const found = await originalsFrom(handle, prepared.missing);
  if (!found.lease && !found.unreadable.length && !found.opaque) return prepared;
  await prepared.release().catch(() => undefined);
  try {
    if (found.opaque) {
      throw new SaveRefusal(
        `${handle.name} could not be read, so it may still hold the originals the browser ` +
          'lost. Saving over it could destroy them: use File → Save As… with another name.',
      );
    }
    const lastCopy = (count: number) => {
      const one = count === 1;
      return new SaveRefusal(
        `${handle.name} still holds ${one ? 'an original' : `${count} originals`} that the ` +
          `browser lost or holds damaged, and ${one ? 'it' : 'they'} could not be read back ` +
          '(the copy in the file may be damaged or changed by another program, or the ' +
          `browser's storage full). Saving over ${handle.name} would destroy ` +
          `${one ? 'it' : 'them'}: use File → Save As… with another name.`,
      );
    };
    if (found.unreadable.length) throw lastCopy(found.unreadable.length);
    const complete = await prepareSave(save);
    const lacking = new Set(complete.missing.map((payload) => payload.contentHash));
    const unused = found.recovered.filter((hash) => lacking.has(hash));
    if (unused.length) {
      await complete.release().catch(() => undefined);
      throw lastCopy(unused.length);
    }
    if (ownsDocument(save)) {
      notify({
        kind: 'info',
        title: 'Missing media restored',
        message: `${handle.name} still held originals that the browser had lost. They are back in the project.`,
      });
    }
    return complete;
  } finally {
    if (found.lease) {
      if (ownsDocument(save)) {
        await syncCurrentMediaOwnership().catch(() => undefined);
        refreshAudioMedia();
      }
      await found.lease.release().catch(() => undefined);
    }
  }
}

/** The bytes are in the file. The document they came from adopts it. If another document took
 * its place while the user was choosing this destination, the file is a copy: a notice says so
 * and the document that is open keeps its file, its handle and its unsaved state — unless the
 * copy went over that very file, which then no longer holds it. */
async function committed(save: SaveContext, handle: FileHandleLike): Promise<'saved' | 'copied'> {
  if (ownsDocument(save) || !save.chosen) {
    markSaved(save, { fileName: handle.name, handle });
    return 'saved';
  }
  const open = useDocumentStore.getState();
  // Without a handle only the name can tell; a needless "unsaved" costs one more Save.
  const overwritten = open.handle
    ? await mayBeSameFile(open.handle, handle)
    : open.fileName === handle.name;
  if (overwritten && useDocumentStore.getState().session === open.session) {
    useDocumentStore.setState({ baseline: save.project, dirty: true });
  }
  notify({
    kind: 'warning',
    title: `Saved a copy as ${handle.name}`,
    message: `${replaced(save)} ${handle.name} holds “${save.project.meta.name}”, not the project that is open now.`,
  });
  return 'copied';
}

/** What the notices about a copy start with: the document left at any point of the command. */
const replaced = (save: SaveContext) =>
  `“${save.project.meta.name}” was replaced by another project before it was saved.`;

/** Permission and destination waits precede a final ownership check. Once the writer has opened,
 * the captured project finishes in the background, leaving any replacement document alone. A
 * destination the user chose in the picker is written whatever became of the document meanwhile:
 * choosing it was the user's answer, and dropping it in silence would lose that. */
async function saveTo(
  save: SaveContext,
  handle: FileHandleLike,
): Promise<'saved' | 'copied' | 'refused' | 'cancelled' | 'failed'> {
  const abandoned = () => !ownsDocument(save) && !save.chosen;
  try {
    if (abandoned()) return 'cancelled';
    if (needsPermission(handle) && !(await ensureWritable(handle))) {
      if (ownsDocument(save)) return 'refused';
      if (save.chosen) {
        notify({
          kind: 'warning',
          title: `Not allowed to write ${handle.name}`,
          message: `${replaced(save)} The browser did not grant access to the file, so no copy was written.`,
        });
      }
      return 'cancelled';
    }
    if (abandoned()) return 'cancelled';
    await save.queue.waitForTurn(handle);
    if (abandoned()) return 'cancelled';
    if (save.packaged && !/\.mfe$/i.test(handle.name)) {
      throw new SaveRefusal(
        'A project with recordings, or with more text geometry than a .mfe.json carries, needs a .mfe package destination. Use Save As and keep the .mfe suffix.',
      );
    }
    await readyMedia(save);
    const prepared = await completeSave(save, handle);
    try {
      if (abandoned()) return 'cancelled';
      if (!(await acceptIncomplete(save, handle.name, prepared.missing))) return 'cancelled';
      if (abandoned()) return 'cancelled';
      save.lacking = prepared.missing.map((payload) => payload.contentHash);
      save.writing = true;
      if ('text' in prepared) {
        await writeToHandle(handle, prepared.text);
      } else {
        const writable = await handle.createWritable();
        try {
          await prepared.writeTo(writable);
          await writable.close();
        } catch (error) {
          await writable.abort?.().catch(() => undefined);
          throw error;
        }
      }
    } finally {
      await prepared.release().catch(() => undefined);
    }
    return await committed(save, handle);
  } catch (error) {
    notify({
      kind: 'error',
      title: `Could not save ${handle.name}`,
      // Save As cannot help with a project that is no longer open.
      message:
        save.chosen && !ownsDocument(save)
          ? `${replaced(save)} Its copy could not be written.`
          : error instanceof Error &&
              (save.packaged || error instanceof SaveRefusal || error instanceof MediaStorageError)
            ? error.message
            : 'The browser may have lost permission to the file, or the disk is full. Use File → Save As… to save a copy.',
      details: [String(error)],
    });
    return 'failed';
  }
}

/** The picker must open directly from the action's user gesture, before waiting for older saves.
 * A session change cancels the command while the picker has not answered, picker failures and
 * the download fallback included; a destination the user did choose is written (`saveTo`). */
async function saveAs(save: SaveContext): Promise<boolean> {
  if (!ownsDocument(save)) return false;
  if (!hasFileSystemAccess()) return download(save);
  let handle: FileHandleLike | null;
  try {
    handle = await pickSaveHandle(save.fileName, libraryFolderHandle());
  } catch (error) {
    if (!ownsDocument(save)) return false;
    // The picker can be unavailable (cross-origin frame, policy): fall back to a download.
    const downloaded = await download(save);
    if (downloaded) {
      notify({
        kind: 'warning',
        title: 'Saved as a download',
        message: `The file picker is not available here, so the project was downloaded as ${save.fileName}.`,
        details: [String(error)],
      });
    }
    return downloaded;
  }
  if (!handle) return false;
  save.chosen = true;
  // A replacement released this command's place in the save order, so that it would not hold
  // the new document's saves behind an open picker. It takes a new place, after them.
  if (!ownsDocument(save)) save.queue = reserveSave();
  // All Files can choose this reserved suffix even from the media-free JSON save picker.
  if (/\.mfe$/i.test(handle.name)) save.packaged = true;
  return (await saveTo(save, handle)) === 'saved';
}

/** Capture the exact manifest and payload dependencies before the first await. New source
 * geometry cannot change an active save's destination, serialized bytes or clean baseline.
 *
 * A drag that is still held (Ctrl/⌘+S with the button down) is given up before the project is
 * read, as by any command that is not the drag's: what it moved is no step yet, Escape would take
 * it back, and a file is a state the history can reach. */
async function runSave(as: boolean): Promise<boolean> {
  if (blockTextCompositionCommand()) return false;
  history.cancelForeignGesture();
  const { handle, session, documentId } = useDocumentStore.getState();
  const project = useProjectStore.getState().project;
  const hasPayloads = projectMediaHashes(project).length > 0;
  // Recordings need a package. The geometry of font texts goes inside the `.mfe.json`, unless
  // there is more of it than such a file carries, or the document already is a package.
  const packaged =
    project.audioAssets.length > 0 ||
    !fitsProjectFile(project) ||
    (!as && /\.mfe$/i.test(handle?.name ?? ''));
  const save: SaveContext = {
    id: ++nextSave,
    session,
    documentId,
    project,
    baseline: project,
    fileName: packaged
      ? suggestedFileName(project.meta.name, true)
      : suggestedFileName(project.meta.name),
    queue: reserveSave(),
    writing: false,
    chosen: false,
    incomplete: false,
    lacking: [],
    packaged,
    // Start before permission/picker waits; every captured revision owns its entire asset set,
    // as far as it is stored (what is missing is the user's to decide, before the file is
    // written).
    mediaReady: hasPayloads
      ? pinAvailableProjectMedia(project).catch((error: unknown) =>
          error instanceof Error ? error : new Error(String(error)),
        )
      : null,
  };
  const offAmend = onProjectAmended((before, after) => {
    if (before === save.baseline && textGeometryIdentity(before) === textGeometryIdentity(after))
      save.baseline = after;
  });
  const offDocument = useDocumentStore.subscribe((document) => {
    // A stale picker/permission/queued command cannot write. Stop it blocking the new document,
    // while an already-open writer, or a destination the user chose, keeps its place until its
    // physical commit settles.
    if (document.session !== session && !save.writing && !save.chosen) save.queue.release();
  });
  try {
    if (as || !handle || (packaged && !/\.mfe$/i.test(handle.name))) return await saveAs(save);
    const outcome = await saveTo(save, handle);
    if (outcome !== 'refused') return outcome === 'saved';
    if (!ownsDocument(save)) return false;
    notify({
      kind: 'warning',
      title: `Not allowed to write ${handle.name}`,
      message: 'The browser did not grant access to the file: choose where to save the project.',
    });
    return await saveAs(save);
  } finally {
    offAmend();
    offDocument();
    save.queue.release();
    const lease = await save.mediaReady;
    if (lease && !(lease instanceof Error)) await lease.release().catch(() => undefined);
  }
}

/** Save to the current file, or ask where if no file is held or its permission is refused.
 * Resolves true when the document that is open was saved. */
export function saveProject(): Promise<boolean> {
  return runSave(false);
}

/** Save As: the native picker (starting in the synced folder, when there is one) or a download. */
export function saveProjectAs(): Promise<boolean> {
  return runSave(true);
}
