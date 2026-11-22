/* One picture of Export ▸ Image…, from the click on its button to the file: where it goes — a
 * file the user chooses, when the browser has the File System Access API, else a download —, the
 * frame drawn (`export/image/frameImage.ts`) and how it ends. The project, its renders and the
 * instant are the ones of the click: they come in with it, before anything is asked. What it
 * touches of the world comes in as `deps`, so that a test runs it with fakes. */
import type { ResolvedFormulas } from '../../engine';
import { frameImage, imageSize, type FrameImageOptions } from '../../export';
import type { Project } from '../../model';
import {
  downloadBlob,
  hasFileSystemAccess,
  pickSaveHandleFor,
  type FileHandleLike,
} from '../project/files';
import { imageFileName } from './imageExportModel';

export interface ImageRunInput {
  /** The project and its renders as they are when Export is clicked. */
  project: Project;
  resolved: ResolvedFormulas;
  options: FrameImageOptions;
}

/** Where the export stands, as the dialog shows it. */
export type ImageRun =
  | { status: 'idle' }
  | { status: 'running' }
  /** `blob` is null when the picture was written to a file the user chose. */
  | {
      status: 'done';
      fileName: string;
      size: number;
      width: number;
      height: number;
      blob: Blob | null;
    }
  | { status: 'error'; message: string };

/** What the run touches outside itself (`liveDeps` is the app's). */
export interface ImageRunDeps {
  frameImage: typeof frameImage;
  hasFileSystemAccess(): boolean;
  /** Ask where to save the picture; null when the user cancelled. */
  pickDestination(fileName: string): Promise<FileHandleLike | null>;
  downloadBlob(fileName: string, blob: Blob): void;
}

export const liveDeps: ImageRunDeps = {
  frameImage,
  hasFileSystemAccess,
  pickDestination: (fileName) =>
    pickSaveHandleFor(fileName, [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }]),
  downloadBlob,
};

const said = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Run one export, reporting where it stands; a cancelled picker reports nothing (nothing
 * started). `ownsRun` says whether the picture is still wanted — the dialog is open, on the
 * document it was opened on —: once it is not, nothing is written and nothing more is reported. */
export async function runImageExport(
  input: ImageRunInput,
  report: (run: ImageRun) => void,
  deps: ImageRunDeps = liveDeps,
  ownsRun: () => boolean = () => true,
): Promise<void> {
  const { project, resolved, options } = input;
  const fileName = imageFileName(project.meta.name, options.time);
  // The picker comes first: it needs the click that started the export.
  let handle: FileHandleLike | null = null;
  if (deps.hasFileSystemAccess()) {
    try {
      handle = await deps.pickDestination(fileName);
    } catch (error) {
      report({ status: 'error', message: `Could not open the file: ${said(error)}` });
      return;
    }
    if (!handle) return;
  }
  if (!ownsRun()) return;
  report({ status: 'running' });
  let picture;
  try {
    picture = await deps.frameImage(project, resolved, options);
  } catch (error) {
    // A canvas has a largest size, and a picture has to fit in memory: the browser's own words
    // say which, and the size they were said of.
    const { width, height } = imageSize(project.meta, options.scale);
    if (!ownsRun()) return;
    report({
      status: 'error',
      message:
        `The browser could not make a picture of ${width} × ${height} pixels (it said: “${said(error)}”).` +
        (options.scale > 1 ? ' Export it at 1×.' : ''),
    });
    return;
  }
  if (!ownsRun()) return;
  const { blob, width, height } = picture;
  try {
    if (handle) {
      const writable = await handle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        // A file begun is not left half-written.
        await writable.abort?.().catch(() => undefined);
        throw error;
      }
      report({ status: 'done', fileName: handle.name, size: blob.size, width, height, blob: null });
    } else {
      deps.downloadBlob(fileName, blob);
      report({ status: 'done', fileName, size: blob.size, width, height, blob });
    }
  } catch (error) {
    report({ status: 'error', message: `Could not write the file: ${said(error)}` });
  }
}
