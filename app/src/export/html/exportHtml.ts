/* What Export ▸ HTML gives, in each of its forms: the files of the folder as bytes — with the
 * scene's sound beside them when it has one —, the same folder as a zip, and the page as one
 * file. What the scene carries of the Slides mode, for the dialog to say. Pure: the sound comes
 * mixed and encoded (`ui/export/`), the engine as text (`runtimeAssets.ts`). */
import type { ResolvedFormula } from '../../engine';
import {
  coveredMarks,
  exportedMarks,
  skippedWait,
  type CoveredMark,
  type FormulaId,
  type Project,
} from '../../model';
import { packDeck, sceneName, type RuntimeAssets } from './packDeck';
import { dataAddress, singleFilePage } from './singleFile';
import { storeZip } from './storeZip';

/** A file of an export, as bytes. */
export interface ExportedFile {
  path: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** The scene's sound, mixed and encoded. */
export interface ExportedSound {
  bytes: Uint8Array<ArrayBuffer>;
  /** `m4a` or `wav`: the file is `audio.<extension>`. */
  extension: 'm4a' | 'wav';
  mime: string;
  /** The SHA-256 of `bytes`, 64 hex digits: the folder's `scene.js` records it beside the file's
   * name, and a later export over the folder knows the file by it. */
  sha256: string;
}

/** The names the scene's sound has in a folder: one of them, by how the browser encodes it. */
export const SOUND_FILES: readonly string[] = ['audio.m4a', 'audio.wav'];

export interface HtmlExportInput {
  project: Project;
  resolved: ReadonlyMap<FormulaId, ResolvedFormula>;
  assets: RuntimeAssets;
  sound?: ExportedSound | null;
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** The files a re-export leaves alone when the folder has them already: they are where the
 * scene's owner works — what is added to the scene, its look, its page. */
export const KEPT_FILES: readonly string[] = ['custom.js', 'player.css', 'index.html'];

/** The project as the page gets it: with the marks of the Slides mode an export carries, and
 * no other. A mark out of place is left out here, where the dialog says so, and not in the page,
 * which would otherwise warn of it every time it is opened. */
export function sceneForPage(project: Project): Project {
  if (!project.slides) return project;
  const marks = exportedMarks(project);
  if (marks.length === project.slides.marks.length) return project;
  return { ...project, slides: { ...project.slides, marks } };
}

/** The folder: its files, in order, the sound last. */
export function exportedFolder(input: HtmlExportInput): ExportedFile[] {
  const sound = input.sound ?? null;
  const audio = sound ? { file: `audio.${sound.extension}`, sha256: sound.sha256 } : null;
  const files: ExportedFile[] = packDeck(
    sceneForPage(input.project),
    input.resolved,
    input.assets,
    audio,
  ).map((file) => ({ path: file.path, bytes: utf8(file.text) }));
  if (sound && audio) files.push({ path: audio.file, bytes: sound.bytes });
  return files;
}

/** The folder as a zip: its files under a folder of the scene's name, so that it unpacks into
 * one folder wherever it is unpacked. */
export function exportedZip(input: HtmlExportInput, when: Date = new Date()): ExportedFile {
  const name = sceneName(input.project);
  const bytes = storeZip(
    exportedFolder(input).map((file) => ({ path: `${name}/${file.path}`, bytes: file.bytes })),
    when,
  );
  return { path: `${name}.zip`, bytes };
}

/** The page as one file, its sound inside it. */
export function exportedSingle(input: HtmlExportInput): ExportedFile {
  const { resolved, assets } = input;
  const project = sceneForPage(input.project);
  const sound = input.sound ?? null;
  const guide =
    packDeck(project, resolved, assets).find((file) => file.path === 'AGENTS.md')?.text ?? null;
  const page = singleFilePage(project, resolved, assets, {
    audio: sound ? dataAddress(sound.bytes, sound.mime) : null,
    guide,
  });
  return { path: `${sceneName(project)}.html`, bytes: utf8(page) };
}

/** What a scene carries of the Slides mode, as an export says it before it is made. */
export interface MarksSummary {
  pauses: number;
  /** Of the pauses, those that skip the wait after them (D202): the page goes on past it. */
  skipping: number;
  comments: number;
  /** The marks left out, with why: under an animation, or past the end of the scene. */
  leftOut: CoveredMark[];
}

export function marksSummary(project: Project): MarksSummary {
  const marks = exportedMarks(project);
  const pauses = marks.filter((mark) => mark.kind === 'pause');
  return {
    pauses: pauses.length,
    skipping: pauses.filter((pause) => skippedWait(project, pause) !== null).length,
    comments: marks.filter((mark) => mark.kind === 'comment').length,
    leftOut: coveredMarks(project),
  };
}
