/* One video export, from the click on Export to the file (`useVideoExport.ts` runs it; the
 * dialog only describes the job): where the file goes — one the user chooses, written as it is
 * encoded, when the browser has the File System Access API; else assembled in memory and
 * downloaded at the end —, the encoder (the browser's WebCodecs, the companion's ffmpeg, or the
 * companion's Manim on the exported Python scene) with its progress put into words, and how it
 * ends: done, cancelled or failed. What it touches of the world comes in as `deps`, so that a
 * test runs it with fakes. */
import {
  companionClient,
  isTextBoxes,
  type CompanionClient,
  type CompanionQuality,
  type CompanionVideoFormat,
  type ResolvedFormulas,
} from '../../engine';
import {
  CompanionJobError,
  exportVideo,
  exportVideoViaCompanion,
  generatePython,
  renderWithManim,
  type JobProgress,
  type ManimProgress,
  type VideoCodec,
  type VideoProgress,
  type VideoSink,
} from '../../export';
import { createAudioPlan, type AudioPlan, type AudioReader } from '../../audio';
import { exportVideoWithAudio } from '../../export/video/audioMuxer';
import { isOutOfMemory } from '../../export/video/memoryFile';
import { exportAudio, type AudioExportFormat } from '../../export/audio';
import type { MediaLease } from '../../media';
import { editorAudioEngine, refreshAudioMedia } from '../audio/audioRuntime';
import { isBlank, type Project, type Target } from '../../model';
import { textHasShape, textIsWritten } from './readiness';
import { holdRecordings, MissingRecordingsError } from './soundSources';
import { exportEvaluator, sceneFraming } from '../../scene';
import {
  downloadBlob,
  hasFileSystemAccess,
  pickSaveHandleFor,
  type WritableLike,
} from '../project/files';
import { notify } from '../project/noticeStore';
import {
  exportProject,
  FFMPEG_FORMATS,
  manimExportValues,
  manimRequestFrom,
  manimSceneName,
  soundLengthProblem,
  videoFileName,
  type ExportValues,
} from './videoExportModel';

/** The encoder to run, with its own settings. */
export type VideoJob =
  | { encoder: 'browser'; codec: VideoCodec; container: 'mp4' | 'webm'; includeAudio?: boolean }
  | {
      encoder: 'ffmpeg';
      format: CompanionVideoFormat;
      quality: CompanionQuality;
      /** The companion's ffmpeg adds the project's sound (not to a GIF; companion 1.5). */
      includeAudio?: boolean;
    }
  | {
      encoder: 'manim';
      target: Target;
      quality: CompanionQuality;
      /** The companion's ffmpeg adds the project's sound, up to the end of the visual scene. */
      includeAudio?: boolean;
    }
  | { encoder: 'audio'; format: AudioExportFormat };

export interface VideoRunInput {
  job: VideoJob;
  values: ExportValues;
  /** The project and its renders as they are when Export is clicked. */
  project: Project;
  resolved: ResolvedFormulas;
}

/** Where the export stands, as the dialog shows it. */
export type VideoRun =
  | { status: 'idle' }
  | { status: 'running'; label: string; frame: number; total: number | null }
  /** Publication has started; cancelling cannot undo a writable's close or a download. */
  | { status: 'committing' }
  /** `blob` is null when the file was written as it was encoded (a file the user chose). */
  | { status: 'done'; fileName: string; size: number; blob: Blob | null }
  | { status: 'error'; message: string; log: string }
  | { status: 'cancelled' };

/** A file the user chose, written as the video is encoded. */
export interface FileDestination {
  name: string;
  writable: WritableLike;
  sink: VideoSink;
  /** Bytes written so far (the end of the furthest write). */
  size(): number;
}

/** What the run touches outside itself (`liveDeps` is the app's). */
export interface VideoRunDeps {
  companionClient(): CompanionClient;
  exportVideo: typeof exportVideo;
  exportVideoWithAudio?: typeof exportVideoWithAudio;
  exportAudio?: typeof exportAudio;
  audioReader?: AudioReader;
  pinAudio?: (project: Project, plan: AudioPlan) => Promise<MediaLease>;
  exportVideoViaCompanion: typeof exportVideoViaCompanion;
  renderWithManim: typeof renderWithManim;
  generatePython: typeof generatePython;
  hasFileSystemAccess(): boolean;
  openDestination(
    fileName: string,
    extension: string,
    mediaKind?: 'audio' | 'video',
  ): Promise<FileDestination | null>;
  downloadBlob(fileName: string, blob: Blob): void;
  notify(notice: Parameters<typeof notify>[0]): void;
}

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  gif: 'image/gif',
};

/** Ask where to save the video (the picker needs the click that started the export, so this
 * comes before any encoding); null when the user cancelled. */
export async function openDestination(
  fileName: string,
  extension: string,
  mediaKind: 'audio' | 'video' = 'video',
): Promise<FileDestination | null> {
  const mime =
    mediaKind === 'audio'
      ? `audio/${extension === 'm4a' ? 'mp4' : extension}`
      : (VIDEO_MIME[extension] ?? 'application/octet-stream');
  const handle = await pickSaveHandleFor(fileName, [
    {
      description: `${extension.toUpperCase()} ${mediaKind}`,
      accept: { [mime]: [`.${extension}`] },
    },
  ]);
  if (!handle) return null;
  const writable = await handle.createWritable();
  let bytes = 0;
  return {
    name: handle.name,
    writable,
    sink: {
      async write(data, position) {
        await writable.write({ type: 'write', position, data });
        bytes = Math.max(bytes, position + data.length);
      },
    },
    size: () => bytes,
  };
}

export const liveDeps: VideoRunDeps = {
  companionClient,
  exportVideo,
  exportVideoViaCompanion,
  renderWithManim,
  generatePython,
  hasFileSystemAccess,
  openDestination,
  downloadBlob,
  notify,
};

/** The file extension of a job's output. */
export function extensionOf(job: VideoJob): string {
  if (job.encoder === 'audio') return job.format;
  if (job.encoder === 'browser') return job.container;
  if (job.encoder === 'ffmpeg') return FFMPEG_FORMATS.find((f) => f.id === job.format)!.extension;
  return 'mp4';
}

type Progress = Omit<Extract<VideoRun, { status: 'running' }>, 'status'>;

export function browserProgress(p: VideoProgress): Progress {
  return { label: 'Encoding', frame: p.frame, total: p.totalFrames };
}

/** The sound is counted in samples, not in frames: say how far it is instead. */
function soundLabel(done: number, total: number): string {
  return `Sending the sound (${total > 0 ? Math.floor((100 * done) / total) : 100}%)`;
}

export function ffmpegProgress(p: JobProgress): Progress {
  if (p.phase === 'sound')
    return { label: soundLabel(p.frame, p.totalFrames), frame: 0, total: null };
  return {
    label:
      p.phase === 'rendering'
        ? 'Sending frames'
        : p.phase === 'encoding'
          ? 'ffmpeg is finishing the file…'
          : 'Downloading the video…',
    frame: p.frame,
    total: p.phase === 'rendering' ? p.totalFrames : null,
  };
}

export function manimProgress(p: ManimProgress, target: Target): Progress {
  if (p.phase === 'sound')
    return { label: soundLabel(p.frame, p.totalFrames ?? 0), frame: 0, total: null };
  if (p.phase === 'encoding')
    return { label: 'ffmpeg is adding the sound…', frame: p.frame, total: null };
  return {
    label:
      p.phase === 'downloading'
        ? 'Downloading the video…'
        : p.frame > 0
          ? `Manim ${target === 'ce' ? 'CE' : 'GL'} is rendering${
              p.animation === null ? '' : ` (animation ${p.animation + 1})`
            }`
          : 'Manim is starting…',
    frame: p.frame,
    total: p.phase === 'running' && p.frame > 0 ? p.totalFrames : null,
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** The Python scene for Manim (`project`: the export's, see `exportProject`), with the name of
 * its class, which is what the render asks for; code generation failures are reported like any
 * other. */
function generateForManim(
  project: Project,
  target: Target,
  resolved: ResolvedFormulas,
  deps: VideoRunDeps,
): { code: string; sceneName: string } {
  let generated;
  try {
    generated = deps.generatePython(project, resolved, {
      target,
      sceneName: manimSceneName(project.meta.name),
      indexing: 'auto',
      comments: true,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The Python exporter failed: ${reason}`, { cause: error });
  }
  if (generated.issues.length > 0) {
    deps.notify({
      kind: 'warning',
      title: 'Notes about the exported scene',
      details: generated.issues.map((issue) => issue.message),
    });
  }
  return { code: generated.code, sceneName: generated.sceneName };
}

/** What to say when the browser could not hold the file it was assembling in memory (the
 * companion's file arrives whole too, though the browser may keep it on disk). The engine's own
 * words go with it: they are what tells a lack of memory from anything that only reads like one. */
function outOfMemory(job: VideoJob, said: string): string {
  const what = said.startsWith('The browser ran out of memory')
    ? said // the app's own in-memory file: it says how far it got
    : `The browser ran out of memory while it assembled the file (it said: “${said}”).`;
  const advice =
    job.encoder === 'audio'
      ? 'Export a shorter range or a compressed format, or use a browser that writes the file as it is encoded'
      : job.encoder === 'browser'
        ? 'Export a shorter range, a smaller size or a lower frame rate, use the companion, or a browser that writes the file as it is encoded'
        : job.encoder === 'manim'
          ? // Manim renders the whole scene: there is no range to shorten.
            'Export a smaller size or a lower frame rate, or use a browser that writes the file as it arrives'
          : 'Export a shorter range, a smaller size or a lower frame rate, or use a browser that writes the file as it arrives';
  return `${what} ${advice} (Chrome or Edge).`;
}

/** Run one export, reporting where it stands; a cancelled picker reports nothing (nothing
 * started). Aborting before `committing` ends it as cancelled; a file begun is discarded. */
export async function runVideoExport(
  input: VideoRunInput,
  report: (run: VideoRun) => void,
  signal: AbortSignal,
  deps: VideoRunDeps = liveDeps,
  ownsRun: () => boolean = () => true,
): Promise<void> {
  const { job, project, resolved } = input;
  // Keep input.project as the captured document owner; only the native render receives this
  // projection. Audio-only edits must not change Python's duration, geometry or request totals.
  const renderedProject = job.encoder === 'manim' ? exportProject(project, input.values) : project;
  const values =
    job.encoder === 'manim' ? manimExportValues(renderedProject, input.values) : input.values;
  const extension = extensionOf(job);
  const fileName = videoFileName(project.meta.name, extension);
  // What the Browser and ffmpeg videos film: the scene in the frame of the video, which is
  // Manim's frame when it renders that size (the Python of "Render with Manim" is generated for
  // it too). Made by the branch that films: an audio export has no picture.
  const filmedScene = () =>
    exportEvaluator(project, resolved, { width: values.width, height: values.height });
  // Through the scene's camera, when it has one that moves: each frame of the video is the
  // camera's frame of its instant (D190). A scene without one is asked for as it always was.
  const framing = sceneFraming(project);
  const filmedThrough = framing ? { framing } : {};
  // Where the file goes: one the user chooses, written as it is encoded, when the browser has
  // the File System Access API; else it is assembled in memory and downloaded at the end.
  let file: FileDestination | null = null;
  let committing = false;
  // assigned by `planSound` (a closure: the declared type is the one that holds)
  let mediaLease = null as MediaLease | null;
  let fileAbort: Promise<void> | undefined;
  const abortFile = () => {
    if (!file || committing) return Promise.resolve();
    fileAbort ??= Promise.resolve()
      .then(() => file!.writable.abort?.())
      .catch(() => undefined);
    return fileAbort;
  };
  const onAbort = () => {
    void abortFile();
  };
  const assertOwnership = () => {
    signal.throwIfAborted();
    if (!ownsRun())
      throw new DOMException('The export no longer belongs to this document.', 'AbortError');
  };
  if (deps.hasFileSystemAccess()) {
    try {
      file =
        job.encoder === 'audio'
          ? await deps.openDestination(fileName, extension, 'audio')
          : await deps.openDestination(fileName, extension);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report({ status: 'error', message: `Could not open the file: ${message}`, log: '' });
      return;
    }
    if (!file) return; // the picker was cancelled: nothing started
  }
  // Guard the sink as well as publication: an exporter must not write after ownership is lost.
  const sink: VideoSink | null = file
    ? {
        write(data, position) {
          assertOwnership();
          return file!.sink.write(data, position);
        },
      }
    : null;
  const running = (progress: Progress) => report({ status: 'running', ...progress });
  /** The mix of `seconds` from where the export starts; its recordings are held until it ends. */
  const planSound = async (seconds: number): Promise<AudioPlan> => {
    const tooLong = soundLengthProblem(seconds);
    if (tooLong)
      throw new Error(
        `${tooLong} Export a shorter range${
          job.encoder === 'audio' ? '' : ', or the video without its sound'
        }.`,
      );
    const plan = createAudioPlan(project, { start: values.range?.[0] ?? 0, duration: seconds });
    mediaLease = deps.pinAudio
      ? await deps.pinAudio(project, plan)
      : await holdRecordings(plan).catch((error: unknown) => {
          // The page may not know yet (the storage went under it): its clips get their marks.
          if (error instanceof MissingRecordingsError) refreshAudioMedia();
          throw error;
        });
    assertOwnership();
    return plan;
  };
  const warnIfClipped = (clippedSamples: number) => {
    if (clippedSamples)
      deps.notify({
        kind: 'warning',
        title: 'Audio peaks exceeded 100%',
        message: 'The mix clips. Lower clip volumes and export again to avoid distortion.',
      });
  };
  running({ label: 'Starting…', frame: 0, total: values.frames });
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    assertOwnership();
    if (job.encoder !== 'audio') {
      const used = new Set(project.clips.map((clip) => clip.formulaId));
      for (const formula of project.formulas) {
        if (formula.kind !== 'text' || !used.has(formula.id) || isBlank(formula)) continue;
        // Drawn from its saved shape, or as the placeholder boxes the preview shows; with
        // neither there is nothing to film.
        const render = resolved.get(formula.id)?.render;
        if (!textHasShape(formula, resolved) && !(render && isTextBoxes(render))) {
          throw new Error(
            `Font text "${formula.name}" has no shape of its current source and font: the companion shapes it.`,
          );
        }
        // Manim gets the Python scene, which leaves out a text whose glyphs nothing counts.
        if (job.encoder === 'manim' && !textIsWritten(formula, project, resolved)) {
          throw new Error(
            `Nothing counts the glyphs of font text "${formula.name}" as it stands, so the scene for Manim would leave it out: Refresh appearance, in its editor, shapes it again.`,
          );
        }
      }
    }
    if (job.encoder === 'manim' && values.frames < 1)
      throw new Error('Nothing to export: the visual scene is shorter than one frame.');
    let blob: Blob | null;
    if (job.encoder === 'audio') {
      const plan = await planSound(values.seconds);
      let clippedSamples = 0;
      blob = await (deps.exportAudio ?? exportAudio)(plan, deps.audioReader ?? editorAudioEngine, {
        format: job.format,
        sink,
        signal,
        onProgress: (progress) => {
          clippedSamples = progress.clippedSamples;
          running({ label: 'Mixing audio', frame: progress.frame, total: progress.totalFrames });
        },
      });
      warnIfClipped(clippedSamples);
    } else if (
      job.encoder === 'browser' &&
      job.includeAudio !== false &&
      project.audioClips.length > 0
    ) {
      const plan = await planSound(values.frames / values.fps);
      let clippedSamples = 0;
      blob = await (deps.exportVideoWithAudio ?? exportVideoWithAudio)(
        filmedScene(),
        {
          background: project.meta.background,
          ...filmedThrough,
          width: values.width,
          height: values.height,
          fps: values.fps,
          codec: job.codec,
          container: job.container,
          bitrate: null,
          range: values.range,
          sink,
        },
        plan,
        deps.audioReader ?? editorAudioEngine,
        (progress) => {
          clippedSamples = progress.clippedSamples ?? 0;
          running(browserProgress(progress));
        },
        signal,
      );
      warnIfClipped(clippedSamples);
    } else if (job.encoder === 'browser') {
      blob = await deps.exportVideo(
        filmedScene(),
        {
          background: project.meta.background,
          ...filmedThrough,
          width: values.width,
          height: values.height,
          fps: values.fps,
          codec: job.codec,
          container: job.container,
          bitrate: null,
          range: values.range,
          sink,
        },
        (p) => running(browserProgress(p)),
        signal,
      );
    } else if (job.encoder === 'ffmpeg') {
      const plan =
        job.includeAudio && project.audioClips.length > 0
          ? await planSound(values.frames / values.fps)
          : null;
      let clippedSamples = 0;
      blob = await deps.exportVideoViaCompanion(
        deps.companionClient(),
        filmedScene(),
        {
          background: project.meta.background,
          ...filmedThrough,
          width: values.width,
          height: values.height,
          fps: values.fps,
          format: job.format,
          quality: job.quality,
          range: values.range,
          sink,
          ...(plan ? { soundtrack: { plan, reader: deps.audioReader ?? editorAudioEngine } } : {}),
        },
        (p) => {
          clippedSamples = p.clippedSamples ?? clippedSamples;
          running(ffmpegProgress(p));
        },
        signal,
      );
      warnIfClipped(clippedSamples);
    } else {
      // One export context: the Python is generated from the project with the output's size
      // and frame rate, the same values the request carries.
      const { code, sceneName } = generateForManim(renderedProject, job.target, resolved, deps);
      // The sound of the captured project, as long as the pictures Manim renders: what goes on
      // after the last animation is left out (the dialog says so).
      const plan =
        job.includeAudio && project.audioClips.length > 0
          ? await planSound(values.frames / values.fps)
          : null;
      let clippedSamples = 0;
      blob = await deps.renderWithManim(
        deps.companionClient(),
        manimRequestFrom(job.target, code, sceneName, values, job.quality),
        (p) => {
          clippedSamples = p.clippedSamples ?? clippedSamples;
          running(manimProgress(p, job.target));
        },
        signal,
        {
          sink,
          ...(plan ? { soundtrack: { plan, reader: deps.audioReader ?? editorAudioEngine } } : {}),
        },
      );
      warnIfClipped(clippedSamples);
    }
    // This gate is after ALL encoder, muxer drain and companion cleanup awaits. There is no
    // await between it and publication; once close/download starts the operation is irreversible.
    assertOwnership();
    if (!file && !blob) throw new Error('The encoder returned no file.');
    committing = true;
    signal.removeEventListener('abort', onAbort);
    report({ status: 'committing' });
    if (file) {
      await file.writable.close();
      report({ status: 'done', fileName: file.name, size: file.size(), blob: null });
    } else if (blob) {
      deps.downloadBlob(fileName, blob);
      report({ status: 'done', fileName, size: blob.size, blob });
    }
  } catch (error) {
    // A file begun is not left half-written.
    // A failed close still needs best-effort cleanup. A cancellation arriving after close began
    // cannot turn that failure (or a successful close) into a misleading cancelled result.
    const publicationStarted = committing;
    committing = false;
    await abortFile();
    if (!publicationStarted && (signal.aborted || isAbort(error))) {
      report({ status: 'cancelled' });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      // A file assembled in memory has no size it may not pass: the browser's memory is the
      // limit, and reaching it is said in the app's words, with the engine's. What a job of the
      // companion says of its own failure (ffmpeg or Manim out of memory there, say) is not
      // the browser's: it keeps its words and its log.
      if (!file && !(error instanceof CompanionJobError) && isOutOfMemory(error))
        report({ status: 'error', message: outOfMemory(job, message), log: '' });
      else
        report({
          status: 'error',
          message,
          log: error instanceof CompanionJobError ? error.log : '',
        });
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    await mediaLease?.release().catch(() => undefined);
  }
}
