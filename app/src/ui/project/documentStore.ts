/* The document the user is working on: which file it came from and whether it has unsaved
 * changes. Not part of the project file and not undoable.
 *
 * "Dirty" means the project differs from the last loaded/saved one. The project is immutable
 * (immer), so identity is enough: undoing back to the saved state restores the very same
 * object. Derived data written by the render sync (`amend`) is not a user edit: when the
 * project was clean, the baseline follows the amendment. One thing outside the project counts
 * too: an original that came back to the browser, which the file may lack (`mediaReturned`).
 *
 * A save runs while the user goes on: it captures the project and the document `session`, and
 * when it finishes the baseline is what was written and `dirty` says whether the project moved
 * on meanwhile; a save of a document that was replaced (New, Open, a restore) leaves the new
 * one alone.
 *
 * Every document has an id that travels with its autosave (localStorage) and with its stored
 * file handle (IndexedDB), two independent slots of the browser: a project recovered from the
 * autosave gets back only the handle of the document it came from, never one another tab stored
 * for a file of the same name. */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { Project } from '../../model';
import { textGeometryIdentity } from '../../media';
import { onProjectAmended, onProjectLoaded, projectLoads, useProjectStore } from '../../store';
import { onMediaReturned } from '../../store/mediaOwnership';
import type { FileHandleLike } from './files';

export interface DocumentState {
  /** The project as last loaded or saved; null = no such state (e.g. restored unsaved work). */
  baseline: Project | null;
  dirty: boolean;
  /** Name of the file the project was opened from / saved to; null for a new project. */
  fileName: string | null;
  /** File System Access handle for plain Save, when the browser gave us one. */
  handle: FileHandleLike | null;
  /** Counts the documents this tab has shown: New, Open and a restore start a new one. */
  session: number;
  /** Identifies the document across the autosave and the stored file handle (see above). */
  documentId: string;
  /** A new document: `project` as just loaded from `info` (New, Open); a restore passes the id
   * the autosave kept. */
  beginDocument(
    project: Project,
    info: { fileName: string | null; handle: FileHandleLike | null; documentId?: string },
  ): void;
  /** `project` was saved to `info`; the project may have moved on since. `lacking`: the content
   * hashes of the originals the file was written without. */
  markClean(
    project: Project,
    info?: {
      fileName?: string | null;
      handle?: FileHandleLike | null;
      lacking?: readonly string[];
    },
  ): void;
  /** A new document with unsaved work and no known file state (autosave restore), keeping the
   * id the autosave kept when it has one. */
  markDirty(info?: { fileName?: string | null; documentId?: string }): void;
  /** The originals, by content hash, that the project lacked and that are stored again (the same
   * file was imported once more, or a companion shaped a text again to the very geometry the
   * browser had lost). The document's file may have been written, or opened, without
   * them, and a save would add them: the document is unsaved although the project did not
   * change. A needless save costs little; a "Saved" over a file without the recording would
   * cost the recording. A save takes out the ones its file carries. */
  mediaReturned: ReadonlySet<string>;
  /** Record one, for a document that has a file. */
  noteMediaReturned(contentHash: string): void;
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** `prefix` plus 8 random base-36 characters (like the project's entity ids). */
export function randomId(prefix: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let out = prefix;
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** A fresh document id, "d_…". */
export const newDocumentId = (): string => randomId('d_');

const NONE: ReadonlySet<string> = new Set();

export const useDocumentStore = create<DocumentState>()((set) => ({
  baseline: useProjectStore.getState().project,
  dirty: false,
  fileName: null,
  handle: null,
  session: 0,
  documentId: newDocumentId(),
  mediaReturned: NONE,
  beginDocument: (project, info) =>
    set((state) => ({
      session: state.session + 1,
      documentId: info.documentId ?? newDocumentId(),
      baseline: project,
      dirty: false,
      mediaReturned: NONE,
      fileName: info.fileName,
      handle: info.handle,
    })),
  markClean: (project, info = {}) =>
    set((state) => {
      // What came back while this file was being written without it is still to be saved.
      const still = new Set(
        (info.lacking ?? []).filter((contentHash) => state.mediaReturned.has(contentHash)),
      );
      return {
        baseline: project,
        dirty: useProjectStore.getState().project !== project || still.size > 0,
        mediaReturned: still,
        fileName: info.fileName === undefined ? state.fileName : info.fileName,
        handle: info.handle === undefined ? state.handle : info.handle,
      };
    }),
  markDirty: (info = {}) =>
    set((state) => ({
      session: state.session + 1,
      documentId: info.documentId ?? newDocumentId(),
      baseline: null,
      dirty: true,
      mediaReturned: NONE,
      fileName: info.fileName === undefined ? state.fileName : info.fileName,
      handle: null,
    })),
  noteMediaReturned: (contentHash) =>
    set((state) =>
      state.fileName === null
        ? {}
        : { mediaReturned: new Set([...state.mediaReturned, contentHash]), dirty: true },
    ),
}));

/** What the top bar says about the document: "Unsaved changes", "Saved" (to its file), "Not saved
 * yet", or "Recovered, not saved" when the unsaved work came back from this browser's autosave and
 * has not been saved since (only an autosave restore leaves no baseline). */
export function documentStatus(state: Pick<DocumentState, 'dirty' | 'fileName' | 'baseline'>): {
  text: 'Unsaved changes' | 'Recovered, not saved' | 'Saved' | 'Not saved yet';
  recovered: boolean;
} {
  const recovered = state.dirty && state.baseline === null;
  if (recovered) return { text: 'Recovered, not saved', recovered };
  if (state.dirty) return { text: 'Unsaved changes', recovered };
  return { text: state.fileName ? 'Saved' : 'Not saved yet', recovered };
}

/** Keep `dirty` in step with the project store. */
export function startDocumentTracking(): () => void {
  const sync = (project: Project) => {
    const { baseline, dirty, mediaReturned } = useDocumentStore.getState();
    const next = baseline !== project || mediaReturned.size > 0;
    if (next !== dirty) useDocumentStore.setState({ dirty: next });
  };
  sync(useProjectStore.getState().project);
  const offProject = useProjectStore.subscribe((state, previous) => {
    if (state.project !== previous.project) sync(state.project);
  });
  const offAmend = onProjectAmended((before, after) => {
    const { baseline, mediaReturned } = useDocumentStore.getState();
    if (baseline === before && textGeometryIdentity(before) === textGeometryIdentity(after)) {
      useDocumentStore.setState({ baseline: after, dirty: mediaReturned.size > 0 });
    }
  });
  // A payload the project named came back with nothing of the project changing (a lost text
  // geometry shaped again to the same bytes): as with a recording imported again, the file may
  // be without it.
  const offReturned = onMediaReturned((contentHash) =>
    useDocumentStore.getState().noteMediaReturned(contentHash),
  );
  return () => {
    offProject();
    offAmend();
    offReturned();
  };
}

export function useDocumentTracking(): void {
  useEffect(() => startDocumentTracking(), []);
}

/** For a command that asks before it writes: called before the question, it gives what tells,
 * when the answer comes, whether the document under the editors is still the one that was asked
 * about. It is another once a project was loaded (New, Open, a restore) or the document session
 * changed, and that one may have the ids of the first — a copy of the file, an earlier revision
 * of it —, so finding there the thing asked about tells nothing: the command writes nothing. An
 * edit, an undo or an amendment leaves the document the same. Nothing is listened to. */
export function currentDocumentCheck(): () => boolean {
  const loads = projectLoads();
  const { session } = useDocumentStore.getState();
  return () => projectLoads() === loads && useDocumentStore.getState().session === session;
}

/** Call `listener` whenever the document under the editors becomes another one: a project was
 * loaded (New, Open, a restore) or the document session changed. The new document may reuse the
 * ids of the old one, so whatever was bound to the old one must go, without writing into the new.
 * Returns the function that stops it. */
export function onDocumentReplaced(listener: () => void): () => void {
  const offLoad = onProjectLoaded(listener);
  const offSession = useDocumentStore.subscribe((state, before) => {
    if (state.session !== before.session) listener();
  });
  return () => {
    offLoad();
    offSession();
  };
}
