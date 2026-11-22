/* Formula engine contract: an object's render request in, glyphs out (docs/ARCHITECTURE.md,
 * "Formula engine").
 *
 * Two backends implement it:
 *   - MathJax 3.2.2 in the browser (always available; glyph order may differ from Manim's)
 *   - the local companion (LaTeX + dvisvgm; glyph order identical to Manim's submobjects)
 * The tests have a third of their own, which draws boxes (`src/test/mockEngine.ts`).
 */
import type { Box, Contour, Vec2 } from '../geom';
import type {
  Formula,
  FormulaKind,
  GlyphStyle,
  LineCurve,
  LineKind,
  LineTip,
  RenderBackend,
  ShapeDiagonal,
  ShapeKind,
  Target,
  TextLayout,
  TextFont,
  TextGeometryArtifact,
  TextRequestBasis,
  TextSourceRange,
} from '../model';

/** What the engine is asked to render: one request shape per kind of object, built by the kind's
 * glyph producer (`producers.ts`, `renderRequestFor`); `kind` tells them apart. */
export interface RenderRequestBase {
  kind: FormulaKind;
  /** Project-level preamble (ProjectMeta.preamble). */
  preamble: string;
  target: Target;
  fontSize: number;
  /** 'auto' = latex when the companion is online, else mathjax. */
  prefer: 'auto' | RenderBackend;
}

/** A `math` object: LaTeX in math mode, as Manim's `MathTex` (CE) / `Tex` (GL) typeset it. */
export interface MathRenderRequest extends RenderRequestBase {
  kind: 'math';
  latex: string;
  packages: string[];
}

/** A `tex` object: LaTeX in text mode with its layout, as Manim's `Tex` (CE) / `TexText` (GL)
 * typeset it (`textSource.ts`). `packages` carries only the colour package of a labelled render. */
export interface TexRenderRequest extends RenderRequestBase {
  kind: 'tex';
  source: string;
  layout: TextLayout;
  packages: string[];
}

/** Literal Unicode shaped by Pango, with target-native manual-line layout. */
export interface TextRenderRequest extends RenderRequestBase {
  kind: 'text';
  source: string;
  font: TextFont;
}

/** A `brace` object: Manim's brace of a target `width` wide, built as geometry in either mode
 * (`geom/brace.ts`); `sharpness` is ManimCE's. Its font size is Manim's default: ManimCE's brace
 * has no size of its own and ManimGL's is built at 48. */
export interface BraceRenderRequest extends RenderRequestBase {
  kind: 'brace';
  width: number;
  sharpness: number;
}

/** A `shape` object: Manim's shape of the kind, fitted to a box `width` × `height` and built as
 * geometry in either mode (`geom/shapes.ts`); `cornerRadius` rounds a box, `diagonal` is the one
 * a cross line runs along; `style` is how it paints its path, which its glyphs carry. Its font
 * size plays no part. */
export interface ShapeRenderRequest extends RenderRequestBase {
  kind: 'shape';
  shape: ShapeKind;
  width: number;
  height: number;
  cornerRadius: number;
  diagonal: ShapeDiagonal;
  style: GlyphStyle;
}

/** A `line` object: Manim's line of the kind along `vector`, from where it is drawn to where it
 * ends, built as geometry in either mode (`geom/lines.ts`): its stroke width, an arrow's tip and
 * a dashed line's dash, as the object has them (Manim's caps for a short arrow are applied when
 * it is built). Its font size plays no part. */
export interface LineRenderRequest extends RenderRequestBase {
  kind: 'line';
  line: LineKind;
  vector: Vec2;
  strokeWidth: number;
  tipLength: number;
  dashLength: number;
  curve: LineCurve | null;
  tip: LineTip;
  startTip: LineTip;
}

export type RenderRequest =
  | MathRenderRequest
  | TexRenderRequest
  | TextRenderRequest
  | BraceRenderRequest
  | ShapeRenderRequest
  | LineRenderRequest;

export interface Glyph {
  /** Position in this render's glyph list (the render index, not the canonical index). */
  index: number;
  /** Human-readable label: "x", "+", "∑", "—" for rules… */
  label: string;
  /** 'rule' = a filled rectangle drawn by TeX (fraction bar, radical overline). */
  kind: 'char' | 'rule';
  /** Formula-local scene units (y up) at the request's fontSize and target calibration; the
   * union box of all glyphs is centred on the origin, like a freshly created MathTex. */
  contours: Contour[];
  /** Box over all points including control points (Manim's convention). */
  bbox: Box;
  /** The fill the SVG gave the glyph, as written (`#000001`), when it has one of its own or
   * inherits one: a labelled render names each glyph's pattern this way (`labelled.ts`). */
  fill?: string;
  /** How the glyph paints its path (`TEXT_STYLE` when absent: filled, no stroke); a shape's
   * producer sets it from the object's fields. */
  style?: GlyphStyle;
}

export interface FormulaRender {
  /** renderKey(request, backend, engineVersion). */
  key: string;
  backend: RenderBackend;
  /** True when the glyph order is Manim's submobject order for `target` (latex backend). */
  exact: boolean;
  target: Target;
  fontSize: number;
  glyphs: Glyph[];
  /** Union of glyph boxes; centred on the origin. */
  bbox: Box;
  /** Non-fatal notes, e.g. "package xyz has no MathJax support; rendered without it". */
  warnings: string[];
  /** Verified native geometry and request provenance, before durable ownership promotion. */
  text?: TextGeometryArtifact;
  /** A font text nothing has shaped, drawn as placeholder boxes (`textBoxes.ts`): the source they
   * lay out and, per glyph, the piece of it the glyph stands for. `exact` is false and there is
   * no `text`. */
  boxes?: { source: string; ranges: TextSourceRange[] };
}

export interface RenderError {
  message: string;
  backend: RenderBackend;
  /** 1-based line in the user's LaTeX when known. */
  line?: number;
  /** Raw compiler log excerpt (latex backend only). */
  log?: string;
  /** Bounded native admission is busy; render sync can retry without inventing geometry. */
  retryAfterMs?: number;
  /** Nothing was said about the source: the backend cannot be reached, or does not render this
   * here (no companion, none that shapes text for the library). The engine draws a font text as
   * placeholder boxes then. */
  unavailable?: boolean;
}

export type RenderResult = { ok: true; render: FormulaRender } | { ok: false; error: RenderError };

// --- Companion protocol v1 (docs/COMPANION.md) ---------------------------------

/** GET /health. */
export interface CompanionHealth {
  name: 'mfe-companion';
  version: string;
  protocol: 1;
  capabilities: {
    latex: boolean;
    dvisvgm: boolean;
    ffmpeg: boolean;
    /** The `/video` formats whose file can carry a soundtrack: the ones whose audio encoder the
     * companion's ffmpeg has (`mp4` also stands for Render with Manim, whose result is an MP4).
     * Absent in companions older than 1.5, which take no sound. */
    videoAudio?: CompanionVideoFormat[];
    /** Python interpreters with Manim available for "Render with Manim". */
    manimCE: { python: string; version: string } | null;
    manimGL: { python: string; version: string } | null;
    /** The interpreters are still being probed (for a few seconds after start): manimCE and
     * manimGL may still appear. Absent in companions older than 1.2. */
    manimProbing?: boolean;
    /** POST /manim-render accepts jobs (the companion was started with --allow-manim-render).
     * Absent in companions older than 1.1. */
    manimRender?: boolean;
    /** Render with Manim runs inside the bubblewrap sandbox (only meaningful with manimRender). */
    manimSandbox?: boolean;
    /** POST /tex takes `mode: 'text'` (companion 1.3). Absent in older companions, which typeset
     * every request as math. */
    textMode?: boolean;
    /** Font text (Pango), by library (companion 1.6): null where the companion has no interpreter
     * of that library; absent in a companion without font text. */
    pango?: Partial<Record<Target, CompanionPango | null>>;
  };
  /** What the companion holds its jobs to (companion 1.7). `videoBytes`: the largest video a
   * `/video` job writes, 4 GiB unless `serve --max-video-gib` gave another; a larger one fails and
   * says so. Absent in older companions, whose ffmpeg stopped at 4 GiB as if all were well. */
  limits?: { videoBytes?: number };
}

/** Where the companion's text worker of a library stands. It starts with the first `GET /fonts`
 * or `POST /text` that names the library, never with the companion: `unused` until then,
 * `preparing` while it starts (Manim's import, the font catalog, the digest of the fonts), `ready`
 * with the font environment it shapes in, `failed` when the last start did not work (a new
 * request tries again). */
export type CompanionPango =
  | { state: 'unused' | 'preparing' }
  | { state: 'failed'; message?: string }
  | { state: 'ready'; adapterVersion: string; environmentKey: string };

/** POST /tex body. */
export interface CompanionTexRequest {
  latex: string;
  packages: string[];
  preamble: string;
  target: Target;
  /** How the source is read (companion 1.3, `capabilities.textMode`): a formula (ManimCE `MathTex`,
   * ManimGL `Tex`; the default) or text (ManimCE `Tex`, ManimGL `TexText`). Older companions ignore
   * the field and typeset math. */
  mode?: 'math' | 'text';
}

/** One entry per shape element of the SVG (document order, outside <defs>). */
export interface CompanionGlyphInfo {
  /** Unicode label ("x", "+", "∑"), "—" for rules, "?" when unknown. */
  label: string;
  kind: 'char' | 'rule';
  /** TeX font name (e.g. "cmmi10"); null for rules or when unknown. */
  font: string | null;
  /** Character code in that font; null for rules or when unknown. */
  code: number | null;
}

/** POST /tex response (HTTP 200 in both cases). */
export type CompanionTexResponse =
  | {
      ok: true;
      /** dvisvgm --no-fonts output, unmodified. */
      svg: string;
      glyphs: CompanionGlyphInfo[];
      cached: boolean;
      /** Compile time in milliseconds (0 when cached). */
      ms: number;
      warnings: string[];
    }
  | {
      ok: false;
      error: {
        message: string;
        /** 1-based line in the user's LaTeX, when the error is inside it. */
        line: number | null;
        /** Excerpt of the LaTeX log around the error. */
        log: string;
      };
    };

export type CompanionState =
  | { status: 'unsupported' }
  | { status: 'checking' }
  | { status: 'offline' }
  | { status: 'online'; health: CompanionHealth };

export interface CompanionFontFace {
  name: string;
  weight: string;
  slant: string;
  synthetic: boolean;
}

export interface CompanionFontCatalog {
  ok: true;
  target: Target;
  adapterVersion: string;
  environmentKey: string;
  fonts: { family: string; faces: CompanionFontFace[]; variable?: boolean }[];
  limits?: Record<string, number>;
}

export interface CompanionTextRequest extends TextRequestBasis {
  requestId?: string;
}

export type CompanionTextResponse =
  | (Pick<
      TextGeometryArtifact,
      'glyphs' | 'bbox' | 'logicalBBox' | 'lines' | 'provenance' | 'diagnostics' | 'warnings'
    > & {
      ok: true;
      target: Target;
      adapterVersion: string;
      environmentKey: string;
      requestKey: string;
      cached?: boolean;
      ms?: number;
    })
  | {
      ok: false;
      error: { message: string; log?: string };
      diagnostics?: TextGeometryArtifact['diagnostics'];
    };

export interface FormulaEngine {
  /** Identifies backend + version; part of every render key. */
  readonly version: string;
  render(request: RenderRequest, signal?: AbortSignal): Promise<RenderResult>;
  companion(): CompanionState;
  /** Subscribe to companion state changes; returns an unsubscribe function. */
  onCompanionChange(listener: (state: CompanionState) => void): () => void;
}

/** A glyph reduced to what matching needs (snapshots and renders both provide it). */
export interface GlyphLike {
  label: string;
  center: Vec2;
  size: Vec2;
}

export interface GlyphMatch {
  /** For each glyph of `from`, its index in `to`, or null when it has no counterpart. */
  map: (number | null)[];
  /** 0…1; below 0.8 the UI should ask the user to check the mapping. */
  confidence: number;
}

/**
 * - 'position': same formula, different renderer (MathJax ↔ LaTeX, CE ↔ GL, engine upgrade).
 *   Hungarian assignment on centres normalised by the total height.
 * - 'edit': the LaTeX changed; align by label sequence first, then by position.
 * - 'sequence': unchanged content in the same renderer reflowed; preserve ordered occurrences.
 */
export type MatchMode = 'position' | 'edit' | 'sequence';

/** A formula plus everything the scene needs to draw it right now. */
export interface ResolvedFormula {
  formula: Formula;
  render: FormulaRender;
  /** canonical index → render index (null = this render lacks that glyph). Identity when
   * formula.snapshot.key === render.key. */
  canonToRender: (number | null)[];
  /** Confidence of canonToRender (1 for identity). */
  confidence: number;
}

export type ResolvedFormulas = ReadonlyMap<string, ResolvedFormula>;

// --- Jobs: video encoding and Manim rendering (companion 1.1, docs/COMPANION.md) ----------

export type CompanionJobKind = 'video' | 'manim';
export type CompanionVideoFormat = 'mp4' | 'webm' | 'mov' | 'gif';
export type CompanionQuality = 'low' | 'medium' | 'high';

/** POST /video body. Width and height must be even except for gif. */
export interface CompanionVideoRequest {
  format: CompanionVideoFormat;
  quality: CompanionQuality;
  width: number;
  height: number;
  fps: number;
  /** Exact number of PNG frames the app will send. */
  frames: number;
  /** A soundtrack will be sent (`sendJobAudio`): `finish` waits for it and ffmpeg adds it to the
   * file. Needs the format in `capabilities.videoAudio`. */
  audio?: boolean;
}

/** POST /manim-render body. `width`/`height`/`fps` are given together or not at all (then the
 * `quality` preset decides). `frames` only scales the progress bar. */
export interface CompanionManimRequest {
  target: Target;
  code: string;
  /** Python class name of the Scene in `code`. */
  scene: string;
  quality?: CompanionQuality;
  width?: number;
  height?: number;
  fps?: number;
  frames?: number;
  /** A soundtrack of `frames / fps` seconds will be sent (`sendJobAudio`): Manim starts when it
   * has arrived, and ffmpeg adds it to the video. Needs `width`, `height`, `fps` and `frames`, and
   * `mp4` in `capabilities.videoAudio`. */
  audio?: boolean;
}

/** A video job: receiving, encoding, then an end. A Manim job: running, then an end; with a
 * soundtrack, receiving before and encoding after (ffmpeg adds the sound). */
export type CompanionJobState =
  'receiving' | 'encoding' | 'running' | 'done' | 'failed' | 'cancelled';

/** Answer of the job endpoints (create, status, frames, finish). */
export interface CompanionJobStatus {
  ok: true;
  id: string;
  kind: CompanionJobKind;
  state: CompanionJobState;
  elapsedS: number;
  /** Total frames (video jobs: exact; Manim jobs: the expected number, or null). */
  frames: number | null;
  /** Video jobs: frames received / encoded so far. */
  received?: number;
  encoded?: number;
  /** Jobs with a soundtrack: the size of its WAV file and how much of it has arrived. */
  audioBytes?: number;
  audioReceived?: number;
  /** Manim jobs: frames rendered so far (best effort) and the animation being rendered. */
  frame?: number;
  animation?: number | null;
  /** Manim jobs: runs inside the bubblewrap sandbox. */
  sandboxed?: boolean;
  /** Result size and MIME type, when state is 'done'. */
  bytes?: number;
  mime?: string;
  /** When state is 'failed': what went wrong and the end of the log. */
  error?: { message: string; line: null; log: string };
  /** POST /video only: limits for the frames requests. */
  maxRequestBytes?: number;
  maxFrameBytes?: number;
  /** Creating a job with a soundtrack only: the limit of one audio request. */
  maxAudioRequestBytes?: number;
  /** POST /video/<id>/frames only: frames in that request. */
  accepted?: number;
}
