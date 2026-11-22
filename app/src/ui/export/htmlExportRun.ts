/* What the dialog of Export ▸ HTML does once its button is pressed: the scene's sound mixed into
 * a file, the folder written where the browser lets a folder be chosen — and the sound of an
 * earlier export removed from it, when this one does not use it —, and what it tells of what it
 * did. The forms themselves — the files, the zip, the single page — are the exporter's
 * (`export/html/exportHtml.ts`). */
import { createAudioPlan } from '../../audio';
import { exportAudio } from '../../export/audio';
import {
  KEPT_FILES,
  SOUND_FILES,
  type ExportedFile,
  type ExportedSound,
} from '../../export/html/exportHtml';
import { RECORD_TAIL, recordedSound, type SceneSound } from '../../export/html/packDeck';
import type { AudioReader } from '../../audio/types';
import { hashBlob } from '../../media';
import { sceneDuration, type Project } from '../../model';
import { editorAudioEngine } from '../audio/audioRuntime';
import { holdRecordings } from './soundSources';
import { soundLengthProblem } from './videoExportModel';

/** The part of FileSystemDirectoryHandle an export writes with. */
export interface WritableFolder {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<WritableFolder>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
    getFile(): Promise<Blob>;
  }>;
  removeEntry(name: string): Promise<void>;
}

interface PickerWindow {
  showDirectoryPicker?: (options: { mode: 'readwrite'; id?: string }) => Promise<WritableFolder>;
}

/** Whether this browser lets a folder be chosen to write into (Chrome, Edge). */
export function canWriteFolders(): boolean {
  return typeof (window as unknown as PickerWindow).showDirectoryPicker === 'function';
}

/** Ask where the scene's folder goes; null when the dialog is closed without choosing. */
export async function pickExportParent(): Promise<WritableFolder | null> {
  try {
    return await (window as unknown as PickerWindow).showDirectoryPicker!({
      mode: 'readwrite',
      id: 'mfe-html-export',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

/** What writing a folder did. */
export interface FolderWritten {
  /** The folder's name, inside the one chosen. */
  folder: string;
  written: string[];
  /** The files that were there and were left as they were (`KEPT_FILES`). */
  kept: string[];
  /** The sound of an earlier export, which this one does not use, removed from the folder: known
   * as the file the app wrote by the SHA-256 the earlier `scene.js` recorded. */
  removed: string[];
  /** A sound file this export does not use and that is still in the folder. */
  left: LeftSound[];
}

/** A sound file that stayed, and why: `unknown`, nothing tells that the app wrote it (no record
 * of it in the earlier `scene.js`, or other bytes than the recorded ones) — it may be its owner's;
 * `failed`, it is the app's and the folder did not let it be removed. */
export interface LeftSound {
  path: string;
  reason: 'unknown' | 'failed';
}

async function exists(folder: WritableFolder, name: string): Promise<boolean> {
  try {
    await folder.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** What the `scene.js` that is in a folder says of its sound, read before it is written over. */
async function earlierSound(root: WritableFolder): Promise<SceneSound | null> {
  try {
    const scene = await (await root.getFileHandle('scene.js')).getFile();
    return recordedSound(await scene.slice(Math.max(0, scene.size - RECORD_TAIL)).text());
  } catch {
    return null;
  }
}

/** Removes from a folder the sound an earlier export wrote there and this one did not write: a
 * folder handed over would carry a recording its page no longer plays. Only the file the earlier
 * `scene.js` names, and only while its bytes are the ones it recorded: any other `audio.m4a` or
 * `audio.wav` may be its owner's, and stays, to be told of. */
async function clearEarlierSound(
  root: WritableFolder,
  earlier: SceneSound | null,
  written: readonly string[],
  onChecking?: () => void,
): Promise<Pick<FolderWritten, 'removed' | 'left'>> {
  const removed: string[] = [];
  const left: LeftSound[] = [];
  for (const path of SOUND_FILES) {
    if (written.includes(path)) continue;
    let handle: Awaited<ReturnType<WritableFolder['getFileHandle']>>;
    try {
      handle = await root.getFileHandle(path);
    } catch {
      continue; // not there
    }
    let ours = false;
    if (earlier?.file === path) {
      // A sound of an hour is hundreds of megabytes to read.
      onChecking?.();
      try {
        ours = (await hashBlob(await handle.getFile())) === earlier.sha256;
      } catch {
        // It cannot be read: not known as the app's.
      }
    }
    if (!ours) {
      left.push({ path, reason: 'unknown' });
      continue;
    }
    try {
      await root.removeEntry(path);
      removed.push(path);
    } catch {
      left.push({ path, reason: 'failed' });
    }
  }
  return { removed, left };
}

/** Writes the scene's folder, `name`, inside `parent`: made when it is not there; written over
 * when it is, except the files its owner works in (`KEPT_FILES`: what was added to the scene, its
 * look, its page), which stay as they are when they exist. So a scene can go back to the editor
 * and be exported again over the folder an agent extended, without losing that work. Once written,
 * the sound of the earlier export goes when this one does not use it (`clearEarlierSound`;
 * `onChecking` is called before a file is read for it). */
export async function writeExportFolder(
  parent: WritableFolder,
  name: string,
  files: readonly ExportedFile[],
  options: { onChecking?: () => void } = {},
): Promise<FolderWritten> {
  const root = await parent.getDirectoryHandle(name, { create: true });
  const earlier = await earlierSound(root);
  const written: string[] = [];
  const kept: string[] = [];
  for (const file of files) {
    const parts = file.path.split('/');
    const leaf = parts.pop()!;
    let folder = root;
    for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true });
    if (KEPT_FILES.includes(file.path) && (await exists(folder, leaf))) {
      kept.push(file.path);
      continue;
    }
    const handle = await folder.getFileHandle(leaf, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.bytes);
    await writable.close();
    written.push(file.path);
  }
  const sound = await clearEarlierSound(root, earlier, written, options.onChecking);
  return { folder: name, written, kept, ...sound };
}

/** What is said once a folder is written. */
export function folderNotice(
  result: FolderWritten,
  parent: string,
): { title: string; message: string } {
  const kept =
    result.kept.length === 0
      ? ''
      : ` ${listed(result.kept)} ${result.kept.length === 1 ? 'was' : 'were'} there already and ${
          result.kept.length === 1 ? 'was' : 'were'
        } left as ${result.kept.length === 1 ? 'it was' : 'they were'}: your work on the scene is in ${
          result.kept.length === 1 ? 'it' : 'them'
        }.`;
  const removed = result.removed
    .map(
      (path) =>
        ` ${path}, the sound an earlier export wrote there, was removed: this page does not play it.`,
    )
    .join('');
  const left = result.left
    .map(({ path, reason }) =>
      reason === 'failed'
        ? ` ${path}, the sound an earlier export wrote there, could not be removed. This page does not play it: delete it if it should not go with the folder.`
        : ` ${path} is still in the folder, though this page does not play it: it is not known as a sound the app wrote there, so it was left. Delete it if it should not go with the folder.`,
    )
    .join('');
  return {
    title: `Exported to “${result.folder}” in “${parent}”`,
    message: `Open its index.html in a browser. To work on the scene with an agent, give it the folder: AGENTS.md is its guide.${kept}${removed}${left}`,
  };
}

function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Why the scene's sound cannot go in the page, or null: an export takes an hour of it at most. */
export function pageSoundProblem(project: Project): string | null {
  return soundLengthProblem(sceneDuration(project));
}

/** The bytes a second of the page's sound takes, roughly: AAC as the app encodes it, or PCM. */
export function pageSoundBytesPerSecond(aac: boolean): number {
  return aac ? 192_000 / 8 : 48_000 * 2 * 2;
}

/** The scene's whole sound, mixed as the Preview plays it and encoded for a page: AAC in an
 * `.m4a` where the browser encodes it (`aac`), else PCM in a `.wav`, which every browser plays and
 * is ten times the size; with the SHA-256 of the file, which the folder records. The recordings
 * are held while it is mixed. */
export async function mixPageSound(
  project: Project,
  aac: boolean,
  signal?: AbortSignal,
  deps: { exportAudio?: typeof exportAudio; reader?: AudioReader } = {},
): Promise<ExportedSound> {
  const tooLong = pageSoundProblem(project);
  if (tooLong) throw new Error(`${tooLong} Export the page without its sound.`);
  const plan = createAudioPlan(project);
  const lease = await holdRecordings(plan);
  try {
    const blob = await (deps.exportAudio ?? exportAudio)(plan, deps.reader ?? editorAudioEngine, {
      format: aac ? 'm4a' : 'wav',
      signal,
    });
    if (!blob) throw new Error('The sound of the scene could not be mixed.');
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      extension: aac ? 'm4a' : 'wav',
      mime: aac ? 'audio/mp4' : 'audio/wav',
      sha256: await hashBlob(blob, { signal }),
    };
  } finally {
    await lease.release().catch(() => undefined);
  }
}
