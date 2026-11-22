/* Export → Video…: the editable draft, its validation and the availability rules of the three
 * encoders. Pure functions, no React. */
import {
  companionCommand,
  type CompanionManimRequest,
  type CompanionQuality,
  type CompanionState,
  type CompanionVideoFormat,
} from '../../engine/connection';
import {
  sceneDuration,
  visualProject,
  type Project,
  type ProjectMeta,
  type Target,
} from '../../model';
import { AUDIO_EXPORT_SECONDS } from '../../audio';
import { sceneClassName, totalFrames } from '../../export/metadata';

export type EncoderId = 'browser' | 'ffmpeg' | 'manim';
export type BrowserFormat = 'avc-mp4' | 'av1-mp4' | 'vp9-webm';

export const SIZE_PRESETS = [
  { id: '720p', width: 1280, height: 720, label: '720p (1280 × 720)' },
  { id: '1080p', width: 1920, height: 1080, label: '1080p (1920 × 1080)' },
  { id: '1440p', width: 2560, height: 1440, label: '1440p (2560 × 1440)' },
  { id: '2160p', width: 3840, height: 2160, label: '2160p (3840 × 2160)' },
] as const;
export const FPS_PRESETS = [24, 25, 30, 60] as const;

export const BROWSER_FORMATS: readonly {
  id: BrowserFormat;
  label: string;
  codec: 'avc' | 'av1' | 'vp9';
  container: 'mp4' | 'webm';
}[] = [
  { id: 'avc-mp4', label: 'MP4 · H.264', codec: 'avc', container: 'mp4' },
  { id: 'av1-mp4', label: 'MP4 · AV1', codec: 'av1', container: 'mp4' },
  { id: 'vp9-webm', label: 'WebM · VP9', codec: 'vp9', container: 'webm' },
];

export const FFMPEG_FORMATS: readonly {
  id: CompanionVideoFormat;
  label: string;
  extension: string;
}[] = [
  { id: 'mp4', label: 'MP4 · H.264', extension: 'mp4' },
  { id: 'webm', label: 'WebM · VP9', extension: 'webm' },
  { id: 'mov', label: 'MOV · ProRes 422 HQ', extension: 'mov' },
  { id: 'gif', label: 'GIF', extension: 'gif' },
];

export const MAX_GIF_FPS = 50;
/** How far past the scene's end a typed range end may be (the display rounds to 1 ms). */
const RANGE_TOLERANCE_S = 0.0005;
export const MIN_SIDE = 16;
export const MAX_WIDTH = 7680;
export const MAX_HEIGHT = 4320;

export interface Draft {
  encoder: EncoderId;
  browserFormat: BrowserFormat;
  ffmpegFormat: CompanionVideoFormat;
  quality: CompanionQuality;
  manimTarget: Target;
  /** 'project', a SIZE_PRESETS id or 'custom'. */
  sizePreset: string;
  width: string;
  height: string;
  /** 'project', a preset value or 'custom'. */
  fps: string;
  customFps: string;
  rangeMode: 'whole' | 'custom';
  start: string;
  end: string;
}

export function initialDraft(
  meta: Pick<ProjectMeta, 'width' | 'height' | 'fps' | 'target'>,
  duration: number,
): Draft {
  return {
    encoder: 'browser',
    browserFormat: 'avc-mp4',
    ffmpegFormat: 'mp4',
    quality: 'medium',
    manimTarget: meta.target,
    sizePreset: 'project',
    width: String(meta.width),
    height: String(meta.height),
    fps: 'project',
    customFps: String(meta.fps),
    rangeMode: 'whole',
    start: '0',
    // rounded down: a rounded-up default would be longer than the scene and fail validation
    end: String(Math.floor(duration * 1000) / 1000),
  };
}

// --- Availability ---------------------------------------------------------------------------

export interface Availability {
  ok: boolean;
  /** Why the option is disabled (or a caution when it is not). */
  reason: string | null;
}

const PROBING_MANIM = 'The companion is still looking for Manim…';

function companionProblem(state: CompanionState): string | null {
  switch (state.status) {
    case 'online':
      return null;
    case 'checking':
      return 'Looking for the companion…';
    case 'unsupported':
      return 'This environment cannot reach the companion.';
    default:
      return `The companion is not running. Start it: ${companionCommand()}`;
  }
}

export function encoderAvailability(
  state: CompanionState,
  browserCanEncode: boolean,
): Record<EncoderId, Availability> {
  const browser: Availability = browserCanEncode
    ? { ok: true, reason: null }
    : {
        ok: false,
        reason:
          'This browser cannot encode video (WebCodecs is missing). Use Chrome or Edge, or the companion.',
      };
  const problem = companionProblem(state);
  let ffmpeg: Availability;
  let manim: Availability;
  if (state.status !== 'online') {
    ffmpeg = { ok: false, reason: problem };
    manim = { ok: false, reason: problem };
  } else {
    const caps = state.health.capabilities;
    // `manimRender` came with 1.1, together with the /video jobs.
    const before11 = caps.manimRender === undefined;
    ffmpeg = before11
      ? {
          ok: false,
          reason:
            'This companion is older than 1.1 and cannot encode video. Update companion/mfe_companion.py.',
        }
      : caps.ffmpeg
        ? { ok: true, reason: null }
        : {
            ok: false,
            reason: 'ffmpeg is not installed on the companion’s machine (or not on PATH).',
          };
    if (!caps.manimRender) {
      manim = {
        ok: false,
        reason: before11
          ? 'This companion is older than 1.1 and cannot render with Manim.'
          : 'Rendering with Manim is off. Restart the companion with --allow-manim-render (it runs the Python code the app sends).',
      };
    } else if (!caps.manimCE && !caps.manimGL) {
      manim = {
        ok: false,
        reason: caps.manimProbing
          ? PROBING_MANIM
          : 'No Manim interpreter is configured. Start the companion with --ce-python and/or --gl-python.',
      };
    } else {
      manim = {
        ok: true,
        reason: caps.manimSandbox
          ? null
          : 'Manim will run without a sandbox: the exported Python code gets all your permissions.',
      };
    }
  }
  return { browser, ffmpeg, manim };
}

/** Whether Manim can render for `target`: the interpreter must be configured. */
export function manimTargetAvailability(state: CompanionState, target: Target): Availability {
  if (state.status !== 'online') return { ok: false, reason: companionProblem(state) };
  const caps = state.health.capabilities;
  const found = target === 'ce' ? caps.manimCE : caps.manimGL;
  if (found) return { ok: true, reason: null };
  if (caps.manimProbing) return { ok: false, reason: PROBING_MANIM };
  return {
    ok: false,
    reason: `No ${target === 'ce' ? 'ManimCE (--ce-python)' : 'ManimGL (--gl-python)'} interpreter is configured on the companion.`,
  };
}

/** The codec of the sound the companion's ffmpeg writes into a video of `format`. */
export function companionAudioCodec(format: CompanionVideoFormat): 'AAC' | 'Opus' | null {
  return format === 'gif' ? null : format === 'webm' ? 'Opus' : 'AAC';
}

/** Whether the companion can add the project's sound to a video of `format`: its ffmpeg encodes
 * the soundtrack the app sends, in a second pass (companion 1.5). */
export function companionAudioAvailability(
  state: CompanionState,
  format: CompanionVideoFormat,
): Availability {
  const codec = companionAudioCodec(format);
  if (!codec) return { ok: false, reason: 'A GIF has no sound.' };
  if (state.status !== 'online') return { ok: false, reason: companionProblem(state) };
  const caps = state.health.capabilities;
  if (!caps.ffmpeg)
    return {
      ok: false,
      reason:
        'ffmpeg is not installed on the companion’s machine (or not on PATH): it adds the sound.',
    };
  if (caps.videoAudio === undefined)
    return {
      ok: false,
      reason:
        'This companion is older than 1.5 and cannot add sound. Update companion/mfe_companion.py.',
    };
  if (!caps.videoAudio.includes(format))
    return {
      ok: false,
      reason: `The companion’s ffmpeg has no ${
        codec === 'Opus' ? 'Opus encoder (libopus)' : 'AAC encoder'
      }: it cannot add sound to this format.`,
    };
  return { ok: true, reason: null };
}

/** A number of bytes as the companion says its limit: whole GiB as it is given them
 * (`--max-video-gib`), and whatever else a companion reports. */
function sizeText(bytes: number): string {
  for (const [unit, size] of [
    ['GiB', 1024 ** 3],
    ['MiB', 1024 ** 2],
  ] as const) {
    if (bytes >= size) {
      const value = bytes / size;
      return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
    }
  }
  return `${bytes} bytes`;
}

/** What the dialog says of how large a video the companion's ffmpeg may write, or null when there
 * is nothing to say (no companion, or one that encodes no video). The companion writes the video
 * in its temporary folder and fails the job, saying so, when it passes its limit (companion 1.7,
 * `limits.videoBytes`). An older one stopped ffmpeg at 4 GiB, which ended as if all were well: a
 * `caution`, since the video that comes back may be cut short. */
export function companionVideoLimit(
  state: CompanionState,
): { text: string; caution: boolean } | null {
  if (state.status !== 'online') return null;
  const { capabilities, limits } = state.health;
  if (!capabilities.ffmpeg || capabilities.manimRender === undefined) return null;
  const bytes = limits?.videoBytes;
  if (typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0)
    return {
      text: `Up to ${sizeText(bytes)} per video: the companion’s limit. Start it with --max-video-gib to give it another.`,
      caution: false,
    };
  return {
    text: 'This companion is older than 1.7: a video over 4 GiB may come back cut short, with no warning. Update companion/mfe_companion.py.',
    caution: true,
  };
}

/** Why `seconds` of sound cannot go into a file, or null when they can: an export mixes an hour at
 * most. The dialog says so beforehand and leaves the sound out; the run refuses. (The length is
 * rounded up: a range a moment over the hour does not read "60 minutes".) */
export function soundLengthProblem(seconds: number): string | null {
  if (seconds <= AUDIO_EXPORT_SECONDS + 1e-6) return null;
  return (
    `An export takes at most ${AUDIO_EXPORT_SECONDS / 60} minutes of sound, ` +
    `and this one lasts ${Math.ceil(seconds / 6) / 10} minutes.`
  );
}

// --- Validation -----------------------------------------------------------------------------

export interface DraftContext {
  meta: Pick<ProjectMeta, 'width' | 'height' | 'fps'>;
  /** Scene length in seconds. */
  duration: number;
}

export interface ExportValues {
  width: number;
  height: number;
  fps: number;
  /** null = whole scene. */
  range: [number, number] | null;
  frames: number;
  seconds: number;
}

/** The project as Render with Manim exports it: the output's size and frame rate take the place
 * of the project's in its metadata, so that the generated Python — its frame-safe durations, the
 * frame width of a frame that is not 16:9, its header — describes the very video the companion
 * renders with the same values. It carries no marks of the Slides mode: in the Python they are
 * comments nobody reads here, and a note about one out of place — one in a tail of sound alone is
 * past the end of this render — says nothing about the video. The project itself is left alone. */
export function exportProject(
  project: Project,
  values: Pick<ExportValues, 'width' | 'height' | 'fps'>,
): Project {
  const { width, height, fps } = values;
  const exported = { ...visualProject(project), meta: { ...project.meta, width, height, fps } };
  delete exported.slides;
  return exported;
}

/** A native render always covers the complete visual projection. Recompute at the run boundary
 * as well as in the dialog: caller-supplied audio duration/ranges cannot reach the companion. */
export function manimExportValues(project: Project, values: ExportValues): ExportValues {
  const frames = totalFrames(0, sceneDuration(project, 'visual'), values.fps);
  return { ...values, range: null, frames, seconds: frames / values.fps };
}

export type DraftResult =
  | { ok: true; values: ExportValues; errors: Record<string, never> }
  | { ok: false; values: null; errors: Record<string, string> };

function parseWhole(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

function parseSeconds(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function sizeOf(draft: Draft, meta: Pick<ProjectMeta, 'width' | 'height'>) {
  if (draft.sizePreset === 'project')
    return { width: String(meta.width), height: String(meta.height) };
  const preset = SIZE_PRESETS.find((p) => p.id === draft.sizePreset);
  if (preset) return { width: String(preset.width), height: String(preset.height) };
  return { width: draft.width, height: draft.height };
}

export function validateDraft(draft: Draft, context: DraftContext): DraftResult {
  const errors: Record<string, string> = {};
  const size = sizeOf(draft, context.meta);
  const width = parseWhole(size.width, MIN_SIDE, MAX_WIDTH);
  const height = parseWhole(size.height, MIN_SIDE, MAX_HEIGHT);
  if (width === null) errors.width = `Width: a whole number from ${MIN_SIDE} to ${MAX_WIDTH}.`;
  if (height === null) errors.height = `Height: a whole number from ${MIN_SIDE} to ${MAX_HEIGHT}.`;
  const gif = draft.encoder === 'ffmpeg' && draft.ffmpegFormat === 'gif';
  if (!gif) {
    if (width !== null && width % 2) errors.width = 'Width must be even for this format.';
    if (height !== null && height % 2) errors.height = 'Height must be even for this format.';
  }

  let fps: number | null;
  if (draft.fps === 'project') fps = context.meta.fps;
  else if (draft.fps === 'custom') fps = parseWhole(draft.customFps, 1, 240);
  else fps = Number(draft.fps);
  if (fps === null) errors.fps = 'Frame rate: a whole number from 1 to 240.';
  else if (gif && fps > MAX_GIF_FPS)
    errors.fps = `GIF supports at most ${MAX_GIF_FPS} frames per second.`;

  let range: [number, number] | null = null;
  let start = 0;
  let end = context.duration;
  // Render with Manim always renders the whole scene (the Python exporter has no range)
  if (draft.rangeMode === 'custom' && draft.encoder !== 'manim') {
    const a = parseSeconds(draft.start);
    const b = parseSeconds(draft.end);
    if (a === null) errors.start = 'Start: a number of seconds.';
    if (b === null) errors.end = 'End: a number of seconds.';
    if (a !== null && b !== null) {
      // the field shows the length rounded to milliseconds: accept that much over
      if (b > context.duration + RANGE_TOLERANCE_S)
        errors.end = `End: the scene lasts ${round3(context.duration)} s.`;
      else if (b <= a) errors.end = 'End must be after the start.';
      else {
        start = a;
        end = Math.min(b, context.duration);
        range = [a, end];
      }
    }
  }
  if (fps !== null && !errors.start && !errors.end && totalFrames(start, end, fps) < 1) {
    errors.range = 'Nothing to export: the scene or range is shorter than one frame.';
  }
  if (Object.keys(errors).length > 0 || width === null || height === null || fps === null) {
    return { ok: false, values: null, errors };
  }
  const frames = totalFrames(start, end, fps);
  return {
    ok: true,
    values: { width, height, fps, range, frames, seconds: frames / fps },
    errors: {},
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** A caution when the output's aspect ratio is not the project's: the frame is 8 units tall and
 * 8·w/h wide, so a different aspect shows a different amount of space at the sides. */
export function aspectWarning(
  width: number,
  height: number,
  meta: Pick<ProjectMeta, 'width' | 'height'>,
): string | null {
  const output = width / height;
  const project = meta.width / meta.height;
  if (Math.abs(output / project - 1) < 0.005) return null;
  return (
    `The aspect ratio (${round2(output)}) differs from the project's (${round2(project)}). ` +
    'The Manim frame is 8 units tall and 8·width/height wide, so the video shows ' +
    `${output > project ? 'more' : 'less'} space at the sides than the preview.`
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- Names ---------------------------------------------------------------------------------

/** `<project name>.<ext>` with characters that file systems reject replaced; `unnamed` is the
 * name of the file of a project that has none left. */
export function videoFileName(projectName: string, extension: string, unnamed = 'video'): string {
  const base = projectName
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[-. ]+|[-. ]+$/g, '');
  return `${base || unnamed}.${extension}`;
}

/** A size in bytes, in the unit that reads best. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const MAX_SCENE_NAME = 64; // the companion's limit

/** The Scene class of a render with Manim: the name the Python export gives it
 * (`sceneClassName`), cut to the companion's 64 characters. */
export function manimSceneName(projectName: string): string {
  return sceneClassName(projectName).slice(0, MAX_SCENE_NAME);
}

export function manimRequestFrom(
  target: Target,
  code: string,
  scene: string,
  values: ExportValues,
  quality: CompanionQuality,
): CompanionManimRequest {
  return {
    target,
    code,
    scene,
    quality,
    width: values.width,
    height: values.height,
    fps: values.fps,
    frames: values.frames,
  };
}
