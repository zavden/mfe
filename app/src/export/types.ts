/* Exporter contracts (docs/ARCHITECTURE.md §8, "Export"). */
import type { ResolvedFormulas } from '../engine';
import type { Issue, Project, Target } from '../model';
import type { SceneEvaluator, SceneFraming } from '../scene';

export interface CodegenOptions {
  target: Target;
  /** Python class name of the generated Scene. */
  sceneName: string;
  /**
   * How glyphs are addressed in the generated code:
   *  - 'auto':       literal indices (`f1[0][3]` in CE, `f1[3]` in GL) for formulas rendered
   *                  exactly (companion); a positional-matching helper for the rest.
   *  - 'positional': always use the helper (robust across Manim versions and templates).
   */
  indexing: 'auto' | 'positional';
  /** Emit explanatory comments (formula names, relation names, timing). */
  comments: boolean;
}

export interface CodegenResult {
  code: string;
  /** The name of the Scene class in `code`, which the header names the file by: the name asked
   * for, unless the scene could not take it (`effectiveSceneName`). What downloads the file or
   * asks for a render names it by this, not by what it asked for. */
  sceneName: string;
  /** Things the user should know (inexact formulas, hidden tracks, unsupported packages…). */
  issues: Issue[];
  usedPositionalHelper: boolean;
}

export type GeneratePython = (
  project: Project,
  formulas: ResolvedFormulas,
  options: CodegenOptions,
) => CodegenResult;

export interface VideoOptions {
  /** Frame background (the project's `meta.background`). */
  background: string;
  width: number;
  height: number;
  fps: number;
  codec: 'avc' | 'vp9' | 'av1';
  container: 'mp4' | 'webm';
  /** Bits per second; null = encoder default for the resolution. */
  bitrate: number | null;
  /** Seconds; default the whole scene. */
  range: [number, number] | null;
  /** The frame each instant is filmed through, for a scene with a camera that moves
   * (`sceneFraming`); absent or null, Manim's still frame. */
  framing?: SceneFraming | null;
  /** Where the file goes as it is muxed (a file the user chose); the muxers write the headers
   * at their byte positions once the length is known. Without one the file is assembled in
   * memory and returned. */
  sink?: VideoSink | null;
}

/** A destination for the encoded file, written at byte positions (`ByteSink` of the companion
 * client: the same shape, so one file sink serves both). */
export interface VideoSink {
  write(data: Uint8Array, position: number): Promise<void>;
}

export interface VideoProgress {
  frame: number;
  totalFrames: number;
  /** Browser audio/video peaks, in linear amplitude before output saturation. */
  audioPeak?: number;
  clippedSamples?: number;
}

export type ExportVideo = (
  evaluator: SceneEvaluator,
  options: VideoOptions,
  onProgress: (progress: VideoProgress) => void,
  signal: AbortSignal,
) => Promise<Blob | null>;
