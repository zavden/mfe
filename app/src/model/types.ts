/* Project data model: the file format, whose version is `FORMAT_VERSION` (defaults.ts).
 *
 * Pure, JSON-serialisable data: no classes, no functions, no Maps. The zod schema in
 * schema.ts mirrors these interfaces exactly and is checked against them at compile time.
 *
 * Conventions (docs/ARCHITECTURE.md, "Conventions"):
 *   - Space:   Manim scene units. Origin at the frame centre, +x right, +y up. The frame is
 *              8 units tall and 8 * width / height units wide (14.22 at 16:9).
 *   - Time:    seconds. Intervals are half-open: [start, end).
 *   - Angles:  degrees, counter-clockwise (exported as `n * DEGREES`).
 *   - Colours: '#RRGGBB', upper case.
 *   - Glyphs:  "canonical" indices, i.e. positions in `Formula.snapshot.glyphs`. Every glyph
 *              reference in the project (colours, hidden glyphs, relation pairs, actions) uses
 *              this index space.
 */

export type Target = 'ce' | 'gl';

/** Which backend made a glyph decomposition: MathJax, real LaTeX/dvisvgm, or native Pango. */
export type RenderBackend = 'mathjax' | 'latex' | 'pango';

export type Vec2 = [number, number];

export type FormulaId = string;
export type TrackId = string;
export type ClipId = string;
export type RelationId = string;
export type ActionId = string;
/** Names a group of blocks within its clip (`model/groups.ts`). */
export type GroupId = string;
/** A group of formulas of the Creator (`model/formulaGroups.ts`). */
export type FormulaGroupId = string;
export type ColorMatchId = string;
export type AudioAssetId = string;
export type AudioClipId = string;
export type AudioVolumePointId = string;
export type CameraTargetId = string;
export type CameraMoveId = string;
export type SlideMarkId = string;

/** Rate functions available in both ManimCE and ManimGL, named as in Manim. Their exact
 * curves differ slightly between CE and GL (e.g. `smooth`); the preview follows the
 * project target. `there_and_back` and `there_and_back_with_pause` (a third of the time held
 * at the top) come back to where they started: pulses (`endsAtStart`). */
export type Easing =
  | 'smooth'
  | 'linear'
  | 'rush_into'
  | 'rush_from'
  | 'slow_into'
  | 'double_smooth'
  | 'there_and_back'
  | 'there_and_back_with_pause';

export type IntroKind =
  | 'none'
  | 'write'
  | 'fade_in'
  | 'grow_from_center'
  | 'draw_border_then_fill'
  | 'create'
  /** Manim's `GrowArrow` (format 29, D145): an arrow or a double arrow grows from its start. */
  | 'grow_arrow';

export type OutroKind = 'none' | 'unwrite' | 'fade_out' | 'shrink_to_center' | 'uncreate';

/** Animations that bring glyphs on screen in the middle of a clip: the intro kinds. */
export type AppearKind = Exclude<IntroKind, 'none'>;

/** Animations that take glyphs off screen in the middle of a clip: the outro kinds. */
export type DisappearKind = Exclude<OutroKind, 'none'>;

/** How a relation moves glyphs from the source formula into the target formula.
 *  - transform: the source glyphs become the target glyphs (ReplacementTransform).
 *  - copy:      a copy of the source glyphs becomes the target; the source stays (TransformFromCopy).
 *  - fade:      cross-fade while moving (FadeTransform). Consumes the source like `transform`.
 *  - fade_copy: a copy of the source glyphs cross-fades into the target; the source stays, as
 *               with `copy` (FadeTransform of a copy; format 33). */
export type RelationStyle = 'transform' | 'copy' | 'fade' | 'fade_copy';

// --- Project -----------------------------------------------------------------

export interface Project {
  format: 'manim-formula-editor';
  version: 36;
  meta: ProjectMeta;
  formulas: Formula[];
  /** Timeline rows, top to bottom. Visual rows alone determine visual stacking order. */
  tracks: Track[];
  clips: Clip[];
  /** Project-owned original media, including sources with no current clip instances. */
  audioAssets: AudioAsset[];
  /** Independent audio instances; never mobjects, glyph sources or relation endpoints. */
  audioClips: AudioClip[];
  relations: Relation[];
  /** The match colours (Edit → Match colors): named lists of LaTeX pattern → colour, applied to
   * formulas on request (D55). */
  colorMatches: ColorMatch[];
  /** The groups of formulas of the Creator's list (format 22, `formulaGroups.ts`): after every
   * field a project always has, absent while there is none. They keep the list in order and
   * nothing else: the scene, the timeline and the export are the same without them. */
  formulaGroups?: FormulaGroup[];
  /** The scene's camera (format 34, `camera.ts`): absent while the multicamera is off. Without it
   * the frame is Manim's all along, and the app, the Python and the video are what they are in a
   * project that never had one. */
  camera?: SceneCamera;
  /** The Slides mode (format 35, `slides.ts`): the last field, absent while the mode is off. Its
   * marks are for the exports that can stop or carry words — the page of Export ▸ HTML stops at
   * each pause, and the Python and the page carry the comments —: the scene, the preview and the
   * video are the same without them. */
  slides?: Slides;
}

/** What the Slides mode keeps: the marks its ruler shows. */
export interface Slides {
  /** In no order of their own (the app keeps them by time). A mark stands where nothing animates
   * — between animations, or just where one ends or starts (`slides.ts`, `markStanding`) — and
   * within the scene: one that does not is left out of every export, and the project says so
   * (`slide-mark-busy`, `slide-mark-outside`). */
  marks: SlideMark[];
}

/** A mark of the Slides mode, at an instant of the scene: a pause, where the exported page stops
 * until its reader goes on, or a comment, words for whoever works on the scene after the export
 * (in the Python, a `# NOTE`; in the page's folder, a task of its guide and a note of the page). */
export interface SlideMark {
  id: SlideMarkId;
  /** Scene seconds: it belongs to no clip, and stays at its instant when clips move. */
  time: number;
  kind: SlideMarkKind;
  /** A comment's words, or the note of a pause; any number of lines. Absent when there are none
   * (a comment without words says nothing: `slide-mark-empty`). */
  text?: string;
  /** A pause that skips its wait (format 36, D202): when the exported page — or the rehearsal of
   * the Preview — goes on from it, the scene jumps to where the next animation starts, over the
   * rest of the stretch in which nothing happens (`skippedWait`, `slides.ts`). Only where the
   * scene really stopped: played through, the wait is the timeline's, and so it is in the Python
   * and in a video. Absent (or false) on a pause that keeps its wait; nothing on a comment. */
  skipWait?: boolean;
}

export type SlideMarkKind = 'pause' | 'comment';

/** The camera of the scene, Manim's `self.camera.frame`: where it is at 0 s, the frames set aside
 * for it to go to, and its moves in time. */
export interface SceneCamera {
  /** The frame at 0 s. Manim's own is `{ center: [0, 0], height: 8 }`. */
  initial: CameraFrame;
  /** The target cameras: frames with a name, which any number of moves can go to. */
  targets: TargetCamera[];
  /** The camera moves, in no order of their own; no two overlap in time (they may touch). */
  moves: CameraMove[];
  /** The lock of the timeline's Camera row; absent when it is not locked. */
  locked?: boolean;
}

/** A frame of the scene: what a camera sees. Its width is not kept: it is its height times the
 * project's aspect (`meta.width / meta.height`), so a camera has the picture's shape at every
 * instant, as in Manim, whose moves interpolate the centre and the height in a straight line. */
export interface CameraFrame {
  /** The scene point at its middle. */
  center: Vec2;
  /** Its height in scene units, between `MIN_CAMERA_HEIGHT` and `MAX_CAMERA_HEIGHT`. The zoom
   * the app shows is `FRAME_HEIGHT / height`. */
  height: number;
}

/** A target camera: a frame with a name, drawn in the preview. */
export interface TargetCamera extends CameraFrame {
  id: CameraTargetId;
  /** What the app calls it ("Camera 1" until renamed): any text but an empty one. */
  name: string;
}

/** Where a camera move takes the camera: to a frame of its own, to a target camera (the move
 * follows the target when it is moved), or back to the frame of 0 s (`initial`). */
export type CameraDestination =
  | { kind: 'frame'; frame: CameraFrame }
  | { kind: 'target'; target: CameraTargetId }
  | { kind: 'start' };

/** A camera move: the block of the Camera row. While one runs nothing else animates (the locked
 * region, `cameraRegionIssues`). With an easing that ends where it started (`endsAtStart`) the
 * camera goes to `to` and comes back. */
export interface CameraMove {
  id: CameraMoveId;
  /** Scene seconds: the camera belongs to no clip. */
  start: number;
  duration: number;
  easing: Easing;
  to: CameraDestination;
}

/** Formulas the Creator shows as one row that opens onto them. */
export interface FormulaGroup {
  id: FormulaGroupId;
  /** What the Creator calls it (`grp1` until renamed): any text but an empty one. */
  name: string;
  /** Its formulas, in the order they have inside it; the group sits in the list where the first
   * of them would. A formula is in one group at most, and only the kinds the Creator lists are
   * in one; at least one. */
  formulaIds: FormulaId[];
}

export interface ProjectMeta {
  name: string;
  /** Manim flavour used for exact rendering, size calibration, easing curves and code export. */
  target: Target;
  /** Output resolution in pixels. Also fixes the frame aspect ratio. */
  width: number;
  height: number;
  fps: number;
  background: string;
  /** Extra LaTeX preamble for every formula, after its packages (e.g. \newcommand lines). */
  preamble: string;
  /** Scene length in seconds; null means "until the last clip ends". */
  duration: number | null;
}

// --- Formulas: the objects of the Creator ---------------------------------------

/** The kinds of object a project holds: `math` (a formula), `tex` (a LaTeX text), `text` (literal
 * Pango text), `brace` and `shape` (geometry fitted to glyphs of another clip). `Formula` stays the name of the
 * union, and `formulas` / `formulaId` the JSON keys: every kind is a glyph object the timeline
 * animates alike. What a kind can do is in `kinds.ts`. */
export type FormulaKind = 'math' | 'tex' | 'text' | 'brace' | 'shape' | 'line';

/** What every kind of object has. */
export interface FormulaBase {
  id: FormulaId;
  kind: FormulaKind;
  /** Display name and base of the exported Python variable (e.g. "f1"). Unique per project. */
  name: string;
  /** The object's source text; the kind says how it is read (`math`: LaTeX in math mode; `tex`:
   * LaTeX in text mode). */
  source: string;
  tag: FormulaTag;
  /** Manim `font_size`. */
  fontSize: number;
  /** Colour of every glyph without a per-glyph colour. */
  color: string;
  /** Canonical glyph index (as a decimal string key) → colour. */
  glyphColors: Record<string, string>;
  /** Canonical indices (ascending, no repeats) of the glyphs every clip of this formula leaves
   * out of its intro: such a glyph appears when an incoming relation or an `appear` action brings
   * it in, and otherwise stays hidden for the whole clip. */
  hiddenGlyphs: number[];
  /** The intro every new clip of this formula starts with (its hidden glyphs and relation targets
   * stay out of it, as of any intro); null = the editor's preference (Edit → Always add intro).
   * Changing it carries along the clips that still had the previous intro, as far as each one's
   * blocks, outgoing relations and outro leave room (`ui/creator/formulaActions.ts`). */
  intro: IntroSpec | null;
  /** Where every new clip of this object starts (the centre of its box, in scene units), as the
   * object was placed in its editor; absent = the centre of the frame. Read once, when a clip is
   * made (`startPosition.ts`): the clips that exist keep their own position. */
  startPosition?: Vec2;
  /** Glyph decomposition that defines the canonical index space; null until first rendered. */
  snapshot: FormulaSnapshot | null;
}

/** A formula: `source` is single-string LaTeX in math mode, rendered like `MathTex(source)`
 * (align* environment). */
export interface MathFormula extends FormulaBase {
  kind: 'math';
  /** Package names for \usepackage{...}, in order. */
  packages: string[];
}

/** The lines of a LaTeX text: as wide as they come (`width: null`, each `\\` line centred, as
 * Manim's `Tex` / `TexText` set them) or inside a box `width` scene units wide, where LaTeX breaks
 * the lines and sets them left, centred or right; `lineSpacing` scales the distance between
 * lines (1 = LaTeX's). The app writes the LaTeX wrapper (`engine/textSource.ts`). */
export interface TextLayout {
  width: number | null;
  align: TextAlign;
  lineSpacing: number;
}

export type TextAlign = 'left' | 'center' | 'right';

/** A LaTeX text: `source` is LaTeX in text mode (`$…$` for maths, `\\` for a line break, a blank
 * line for a paragraph), rendered like `Tex(source)` (ManimCE) / `TexText(source)` (ManimGL) with
 * the wrapper its layout needs. It has no packages of its own: the project preamble serves it. */
export interface TexFormula extends FormulaBase {
  kind: 'tex';
  layout: TextLayout;
}

/** Whole-object typography for literal Unicode text. These are authored requests; actual
 * fallback faces belong to a geometry artifact's provenance, never to this font selection. */
export interface TextFont {
  family: string;
  weight: 'normal' | 'bold';
  slant: 'normal' | 'italic';
}

/** Everything authored that shapes the first-release text kind. Manual newlines, left
 * alignment and target-native line spacing are fixed by the versioned native adapter. */
export interface TextRequestBasis {
  source: string;
  font: TextFont;
  fontSize: number;
  target: Target;
}

/** A declared immutable package payload. No native paths, browser keys or font bytes enter
 * the manifest. The basis key permits checking source freshness before loading the payload. */
export interface TextGeometryRef {
  contentHash: string;
  byteLength: number;
  key: string;
  basisKey: string;
}

export interface TextFormula extends FormulaBase {
  kind: 'text';
  font: TextFont;
  /** Last durable geometry; it may describe an older source while a new render is pending. */
  geometry: TextGeometryRef | null;
}

/** Half-open offsets in the exact basis source, in UTF-16 code units. Neither end may split
 * a surrogate pair. Source ranges and drawable indices are deliberately different spaces. */
export interface TextSourceRange {
  start: number;
  end: number;
}

export interface TextGeometryBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Same contour convention as geom.Contour/Glyph, without a model -> engine dependency. Glyph
 * `index` is the child of that index in Manim's `Text`, whose children all draw. */
export interface TextGeometryGlyph {
  index: number;
  label: string;
  kind: 'char' | 'rule';
  contours: number[][];
  bbox: TextGeometryBox;
  sourceRanges: TextSourceRange[];
}

export interface TextGeometryLine extends TextSourceRange {
  baseline: number;
  bbox: TextGeometryBox;
}

export interface TextResolvedFont {
  family: string;
  face: string;
  weight: string;
  slant: string;
  fontHash: string | null;
  faceIndex: number | null;
  ranges: TextSourceRange[];
}

export interface TextGeometryProvenance {
  environmentKey: string;
  adapterVersion: string;
  /** Quantized ordered contours, checked by generated native exports before paint/placement. */
  geometrySignature?: string;
  versions: Record<string, string>;
  /** Native coordinate to scene-unit scale; 1 when extracting final constructor points. */
  calibration: number;
  resolvedFonts: TextResolvedFont[];
}

export interface TextGeometryDiagnostic {
  code: string;
  message: string;
  ranges: TextSourceRange[];
}

/** Versioned, immutable, owned geometry. Its request basis stays with stale geometry so a
 * fresh process can distinguish the old source from newer authored text and repair references. */
export interface TextGeometryArtifact {
  format: 'mfe-text-geometry';
  version: 1;
  basis: TextRequestBasis;
  basisKey: string;
  key: string;
  glyphs: TextGeometryGlyph[];
  bbox: TextGeometryBox;
  logicalBBox: TextGeometryBox;
  lines: TextGeometryLine[];
  provenance: TextGeometryProvenance;
  diagnostics: TextGeometryDiagnostic[];
  warnings: string[];
}

/** A brace (Manim's `Brace`), pegged to glyphs of another clip through its clip's `attach`
 * (`rule: 'brace'`). Its `source` is empty: nothing is typeset, its glyphs are geometry
 * (`geom/brace.ts`: ManimCE's path, the six pieces of ManimGL's `\underbrace`). `width` is the
 * width of the target it was fitted to, in scene units — derived by the attach sync while its
 * clip is attached (as the placement is), kept when it is detached —; `sharpness` is ManimCE's
 * (how long the straight runs are for the width; ManimGL has no such thing). */
export interface BraceFormula extends FormulaBase {
  kind: 'brace';
  sharpness: number;
  width: number;
}

/** The shapes Manim fits to glyphs of another clip (D71): a rectangle around them (Manim's
 * `SurroundingRectangle`; filled, with no stroke, it is the highlight behind them), a circle
 * through the corners of their box, a line under them (`Underline`), a cross over them (`Cross`)
 * and a cross line, one line over a diagonal of their box as each line of a cross is (D128). */
export type ShapeKind = 'box' | 'circle' | 'underline' | 'cross' | 'cross_line';

/** The diagonal a cross line runs along, from its first corner to its second: from the lower left
 * corner of the box up to the upper right one, or from the upper left one down to the lower right
 * one. */
export type ShapeDiagonal = 'dl_ur' | 'ul_dr';

/** A shape pegged to glyphs of another clip through its clip's `attach` (`rule: 'shape'`). Its
 * `source` is empty: nothing is typeset, its glyphs are geometry (`geom/shapes.ts`) fitted to a
 * box `width` × `height`, in scene units — derived by the attach sync while its clip is attached
 * (as the placement is), kept when it is detached —, painted with its own `style` (the opacity of
 * its fill, the width and opacity of its stroke; `color` is the colour of its stroke, and of its
 * fill unless it has a `fillColor`) and, for a box, with its corners rounded by `cornerRadius`
 * (ManimCE's `corner_radius`, ManimGL's `round_corners`; 0 = square corners). */
export interface ShapeFormula extends FormulaBase {
  kind: 'shape';
  shape: ShapeKind;
  style: GlyphStyle;
  /** The colour of its fill (Manim's `fill_color`), when it is not the stroke's: absent, the fill
   * takes `color` — and the colour a clip overrides it with — as the stroke does (D123). */
  fillColor?: string;
  /** A cross line's diagonal; absent, the rising one (`diagonalOf`). No other shape has one. */
  diagonal?: ShapeDiagonal;
  cornerRadius: number;
  width: number;
  height: number;
}

/** The lines Manim draws between two points (D137): a `Line`, a `DashedLine`, an `Arrow` (a tip at
 * its end) and a `DoubleArrow` (a tip at each end). */
export type LineKind = 'line' | 'dashed' | 'arrow' | 'double_arrow';

/** The shape of an arrow's tip (D146): Manim's triangle, ManimCE's `StealthTip` — a notched
 * arrowhead with a stroke of its own — and a dot as wide as the tip is long
 * (`ArrowCircleFilledTip`). ManimGL has the first; the export draws it the other two. */
export type LineTip = 'triangle' | 'stealth' | 'dot';

/** How a line is bent (D145). An arc is Manim's `path_arc`: `degrees` of a circle between the two
 * ends, counter-clockwise from the start for a positive value (so the line bulges to the right of
 * its way); `trim` is the part of that arc the gap at each end took (`EndsAttach.buff`, which
 * Manim leaves along the arc), a fraction of it from 0 to a half — derived by the attach sync, as
 * `vector` is, and 0 for a line with no gap. A spline is cubic curves through `nodes`, in the frame
 * of the line's two ends — the first at (0, 0), the last at (1, 0), as a custom path's
 * (`PathSpline`) —, so it stretches and turns with them; a handle that is not there sits a third
 * of the way to the next control point of its stretch. */
export type LineCurve =
  { shape: 'arc'; degrees: number; trim: number } | { shape: 'spline'; nodes: SplineNode[] };

/** A line or an arrow between two ends (format 26, D137). Its `source` is empty: nothing is
 * typeset, its glyphs are geometry (`geom/lines.ts`: the line — an arrow's shaft —, then its tips,
 * or the dashes of a dashed line). `vector` runs from where it is drawn to where it ends, in scene
 * units: the user's while the line is free — its clip's position is the centre of what is drawn,
 * as for every object —, derived by the attach sync while an end is on glyphs of another clip
 * (`EndsAttach`), as the placement is, and kept when it is detached. A line has no scale of its
 * own: its length is its ends. `strokeWidth` is Manim's `stroke_width` and `tipLength` an arrow's
 * `tip_length`, both before Manim caps them by the length of a short arrow; `dashLength` is a
 * dashed line's `dash_length`. `color` paints the line and its tips. `curve` bends it between its
 * ends (format 28, D145; null: straight) — `vector` still runs from the one to the other —, and
 * `tip` and `startTip` are the shapes of an arrow's tip and of the tip at the start of a double
 * arrow (D146); a kind without that tip keeps the value for when it has it. */
export interface LineFormula extends FormulaBase {
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

export type Formula =
  MathFormula | TexFormula | TextFormula | BraceFormula | ShapeFormula | LineFormula;

/** The object type of one kind. */
export type FormulaOfKind<K extends FormulaKind> = Extract<Formula, { kind: K }>;

/** Identification in lists, the timeline and the relation diagrams. */
export interface FormulaTag {
  color: string;
  /** A short label: an emoji or 1–3 characters. null = use the formula name. */
  icon: string | null;
}

/** Lightweight copy of a render, stored so glyph references survive re-rendering with a
 * different backend, an engine upgrade, or an edit of the source (see engine matching). */
export interface FormulaSnapshot {
  backend: RenderBackend;
  /** Key of the render this snapshot was taken from (engine `renderKey`). */
  key: string;
  glyphs: GlyphSnapshot[];
}

/** How a glyph paints its path, as Manim styles a VMobject: the opacity of its fill, the width of
 * its stroke (Manim `stroke_width` units, 1 = 0.01 scene units) and the opacity of that stroke —
 * one colour for both, the glyph's. A text glyph is filled and has no stroke (`TEXT_STYLE`); a
 * circle is stroked and empty; an arrow's shaft is stroked and its tip filled. The clip's
 * opacity scales both opacities. */
export interface GlyphStyle {
  fillOpacity: number;
  strokeWidth: number;
  strokeOpacity: number;
}

export interface GlyphSnapshot {
  /** Human-readable glyph label: "x", "+", "∑", "—" for rules (fraction bars, radicals)… */
  label: string;
  /** Bounding-box centre, formula-local scene units at the formula's fontSize; the formula's
   * bounding box is centred on the origin (as Manim centres a MathTex). */
  center: Vec2;
  /** Bounding-box width and height, same units. */
  size: Vec2;
}

// --- Timeline ----------------------------------------------------------------

interface TrackBase {
  id: TrackId;
  name: string;
  locked: boolean;
}

export interface VisualTrack extends TrackBase {
  kind: 'visual';
  /** Preview-only visibility; hidden visuals still export. */
  hidden: boolean;
  muted: false;
}

export interface AudioTrack extends TrackBase {
  kind: 'audio';
  hidden: false;
  /** Authored silence, applied to both preview and export. */
  muted: boolean;
}

export type Track = VisualTrack | AudioTrack;

/** Metadata of one original source. Bytes live in durable media storage, keyed by contentHash,
 * and travel inside portable packages; no decoded samples or binary data enter this model. */
export interface AudioAsset {
  id: AudioAssetId;
  name: string;
  originalName: string;
  mimeType: string;
  byteLength: number;
  /** SHA-256 of the original bytes, lowercase hexadecimal. */
  contentHash: string;
  /** Actual source length in seconds, before any clip trims. */
  duration: number;
  sampleRate: number;
  channels: number;
}

/** Linear amplitude control point in source seconds: 1 = 100%, 0 = silence, 4 = 400%.
 * Points are strictly ordered by time; outside the point range the nearest value is held. */
export interface AudioVolumePoint {
  id: AudioVolumePointId;
  time: number;
  gain: number;
}

export interface AudioClip {
  id: AudioClipId;
  assetId: AudioAssetId;
  trackId: TrackId;
  start: number;
  end: number;
  /** Source seconds at timeline start. Source end is sourceStart + end - start (rate 1). */
  sourceStart: number;
  /** Instance-owned curve, including points outside the visible source window. Empty = unity. */
  volume: AudioVolumePoint[];
}

/** Small common view for timeline operations; media-specific data stays in its own collection. */
export interface TemporalClip {
  kind: 'visual' | 'audio';
  id: ClipId | AudioClipId;
  trackId: TrackId;
  start: number;
  end: number;
}

/** One appearance of a formula on the timeline. Each clip becomes one mobject in Manim. */
export interface Clip {
  id: ClipId;
  formulaId: FormulaId;
  trackId: TrackId;
  /** The intro starts at `start`; the outro ends at `end`. */
  start: number;
  end: number;
  /** State at `start`; tween actions change it over time. */
  initial: ClipState;
  /** Brings in every glyph that no incoming relation brings in. */
  intro: IntroSpec;
  /** Takes out every glyph that no outgoing relation consumed. */
  outro: OutroSpec;
  /** The animation blocks drawn on the clip, sorted by start. Two things may animate the clip at
   * once only on different glyphs (see validate.ts); a tween animates all of them. */
  actions: ClipAction[];
  /** Pegged to glyphs of another clip (R4): the clip's placement at its start is derived from
   * those glyphs as they are then (`scene/attach.ts`); null = placed freely. */
  attach: ClipAttach | null;
  /** Locked in the preview (format 20): the preview draws the clip and leaves it alone — a
   * press goes through it to what is under it, and nothing the preview does selects or moves it.
   * The timeline and the panels edit it as any other. Absent when it is not. */
  previewLocked?: boolean;
  /** The clip starts empty (format 31): none of its glyphs comes in with the intro, as the
   * formula's `hiddenGlyphs` do not — each appears when an incoming relation, a Morph block or
   * an Appear block brings it, and one nothing brings never shows (`startHiddenGlyphs`,
   * lifetime.ts). Only a clip of a formula or a text takes it. Absent when it does not. */
  startsEmpty?: boolean;
  /** Glyphs of the clip that stay out of its intro (format 33), besides the `hiddenGlyphs` of its
   * formula and in this clip alone: canonical indices, ascending and without repeats. Each
   * appears when an incoming relation, a Morph block or an Appear block brings it, and one
   * nothing brings never shows in this clip (`startHiddenGlyphs`, lifetime.ts) — what
   * `startsEmpty` says of every glyph. A split writes it, for the glyphs that only came on screen
   * after the cut (`ui/timeline/splitClips.ts`). Only a clip of a formula or a text takes it.
   * Absent when the clip leaves none out. */
  startHidden?: number[];
}

/** How an attached object is placed from the box of its target glyphs. `next_to`: beside them,
 * as Manim's `next_to(target, side, buff)`; `brace`: a brace fitted to them, as Manim's
 * `Brace(target, direction, buff)`; `tip`: a label at the tip of a brace, as Manim's
 * `brace.put_at_tip(label, buff=…)`; `shape`: a shape fitted to them, as Manim's
 * `SurroundingRectangle(target, buff=…)`, `Underline` and `Cross` fit theirs; `ends`: a line
 * between two ends, as Manim's `Line(start, end, buff=…)` and `Arrow` run between two mobjects. */
export type AttachRule = 'next_to' | 'brace' | 'tip' | 'shape' | 'ends';

/** The side of the target the object goes on: Manim's DOWN, UP, LEFT, RIGHT. */
export type AttachSide = 'down' | 'up' | 'left' | 'right';

/** An object pegged to glyphs of another clip (R4, D65). Its placement is derived from the
 * target glyphs as they are when the attached clip starts — the target's state, tweens and part
 * transforms at that instant, measured with the box rule of the project's Manim library — and
 * stays static afterwards, as a `Brace` or a `next_to` does in Manim. The attach sync
 * (`store/attachSync.ts`) writes the derived placement into the clip's initial state without an
 * undo step; detaching (`attach: null`) freezes the object where it is. */
interface AttachBase extends AttachTarget {
  rule: AttachRule;
}

/** Glyphs of a clip that an object hangs on. */
export interface AttachTarget {
  /** The clip the object hangs on. */
  clipId: ClipId;
  /** Canonical glyphs of the target clip's formula it hangs on. */
  glyphs: GlyphTarget;
}

/** What a brace's and a shape's attachment share: they are fitted to their target, which can be
 * glyphs of several clips (format 21, D117). */
interface FittedAttachBase extends AttachBase {
  /** The glyphs of other clips the object spans as well: it is fitted to the glyphs of `clipId`
   * and of these together, as Manim fits a `Brace(VGroup(…))` or a `SurroundingRectangle(
   * VGroup(…))` to a group — all of them measured when the object's clip starts. Absent when the
   * object hangs on one clip. Deleting the clip of any of its targets frees such an object where
   * it is (`attach: null`) instead of deleting it with the clip. */
  also?: AttachTarget[];
}

/** Beside the target glyphs, on one side of them, `buff` away (scene units). */
export interface NextToAttach extends AttachBase {
  rule: 'next_to';
  side: AttachSide;
  buff: number;
}

/** A brace fitted to the target glyphs (the clip's object is a `brace`): `direction` is where it
 * points, in degrees counter-clockwise from DOWN — 0 below the glyphs, 180 above, −90 on their
 * left, 90 on their right, anything else at an angle —, and the sync also derives the clip's
 * rotation (the direction) and the object's `width` (the target's, across the direction).
 * `buff` is the gap between the glyphs and the brace. */
export interface BraceAttach extends FittedAttachBase {
  rule: 'brace';
  direction: number;
  buff: number;
}

/** A label at the tip of a brace: `clipId` is the brace's clip, and the target is the whole brace
 * (`glyphs` is always 'all'). The label goes beside the tip as Manim's `brace.put_at_tip(label,
 * buff=…)` puts it — `next_to(tip, np.round(direction), buff)`: the brace's direction from its
 * centre to its tip, rounded to a side or a corner — `buff` away; null is the gap `Brace.get_tex`
 * leaves in the project's library (`BRACE_LABEL_BUFF`: 0.25 in ManimCE, 0.1 in ManimGL). The label
 * is an object like any other: its intros, colours, relations and morphs are its clip's. */
export interface TipAttach extends AttachBase {
  rule: 'tip';
  glyphs: 'all';
  buff: number | null;
}

/** A shape fitted to the target glyphs (the clip's object is a `shape`), as Manim fits it to
 * them when the shape's clip starts: a box is their box `buff` wider on every side
 * (`SurroundingRectangle(target, buff=…)`), a circle runs through the corners of their box `buff`
 * further out, an underline is as wide as they are and hangs `buff` below them
 * (`Underline(target, buff=…)`), a cross stretches over their box (`Cross(target)`: `buff` does
 * not apply). The sync also derives the object's `width` and `height`, and keeps the clip
 * unturned. */
export interface ShapeAttach extends FittedAttachBase {
  rule: 'shape';
  buff: number;
}

/** Where on its glyphs an end of a line is (format 27, D140): `auto`, the edge Manim finds
 * towards the line's other end — `Line(a, b)` given the mobject —, or one of the nine points of
 * the glyphs' box, Manim's `get_corner(UL)` … `get_left()` … `get_center()`: the line is then
 * given that point. */
export type LineAnchor =
  'auto' | 'ul' | 'up' | 'ur' | 'left' | 'center' | 'right' | 'dl' | 'down' | 'dr';

/** An end of a line on glyphs of a clip: which glyphs, and where on them. */
export interface LineGlyphEnd extends AttachTarget {
  anchor: LineAnchor;
}

/** One end of a line: on glyphs of a clip, or free at a point of the scene. */
export type LineEnd = LineGlyphEnd | LineEndPoint;

/** A free end, at a point of the scene — what Manim's `Line` is given for it. */
export interface LineEndPoint {
  point: Vec2;
}

/** A line or an arrow with an end on glyphs of another clip (the clip's object is a `line`; D137):
 * Manim's `Line(start, end, buff=…)` given a mobject for that end — the whole formula, some of its
 * glyphs — and a mobject or a point for the other. For an end whose `anchor` is `auto` the
 * library finds where the line leaves the glyphs towards its other end (`scene/lines.ts`: the two
 * libraries mean different points by it); an end with another anchor is the point of the glyphs'
 * box it names. Manim shortens the line by `buff` at each end, a free one too. The glyphs are
 * measured when the line's clip starts; the sync derives the object's `vector` and the clip's
 * position, and keeps the clip unturned. At least one end is on glyphs: a line with two free ends
 * has no attachment, and is where its clip puts it. */
export interface EndsAttach {
  rule: 'ends';
  start: LineEnd;
  end: LineEnd;
  buff: number;
}

export type ClipAttach = NextToAttach | BraceAttach | TipAttach | ShapeAttach | EndsAttach;

export interface Placement {
  /** Centre of the formula's bounding box, scene units. */
  position: Vec2;
  /** Uniform scale on top of the formula's fontSize. */
  scale: number;
  /** Degrees, counter-clockwise, about the formula centre. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface Appearance {
  /** 0…1, applied to fill (and stroke while drawing). */
  opacity: number;
  /** Overrides `Formula.color` (not per-glyph formula colours); null = no override. */
  color: string | null;
  /** Canonical glyph index → colour. Highest precedence. */
  glyphColors: Record<string, string>;
  /** A shape's paint where a Transform has set it (D123, `shapePaint.ts`): the width of its
   * stroke (Manim's `stroke_width`), the opacity of its stroke and of its fill (0…1, before
   * `opacity`) and the colour of its fill. Absent: the object's own (`ShapeFormula.style`,
   * `fillColor`). Read on a shape's clip only — and `strokeWidth` on a line's too, in a tween
   * that carries its ends (`TweenEnds`, D144): the `stroke_width` the line arrives with. */
  strokeWidth?: number;
  strokeOpacity?: number;
  fillOpacity?: number;
  fillColor?: string;
}

/** Glyph colour precedence: clip glyphColors > clip color > formula glyphColors > formula color. */
export type ClipState = Placement & Appearance;

export interface ClipAnimationSpec<K extends string> {
  kind: K;
  /** Seconds; 0 when kind is 'none'. */
  duration: number;
  easing: Easing;
  /** Stagger between glyphs (Manim `lag_ratio`); null = Manim's default for the kind. */
  lagRatio: number | null;
  /** fade_in / fade_out only: offset of the faded state (Manim `shift`), scene units. */
  shift: Vec2;
  /** fade_in / fade_out only: Manim's `scale` argument, passed as is. The faded state is at
   * scale `scale` in CE; GL's FadeIn starts at `1 / scale` (FadeOut ends at `scale` in both). */
  scale: number;
}

export type IntroSpec = ClipAnimationSpec<IntroKind>;
export type OutroSpec = ClipAnimationSpec<OutroKind>;

interface ActionBase {
  id: ActionId;
  /** Seconds, relative to the clip start. */
  start: number;
  duration: number;
  easing: Easing;
}

/** What the blocks that name glyphs share: they can be in a group. */
interface GroupMember {
  /** The group the block is in: with the other blocks of its clip that carry the same one it is
   * one thing on the timeline, which starts and ends together (`model/groups.ts`). Absent for a
   * block on its own. */
  group?: GroupId;
}

/** Animates the clip from its current state to `to` (omitted fields keep their value;
 * `to.glyphColors` is merged into the current per-glyph colours). Moves the whole formula. */
export interface TweenAction extends ActionBase {
  kind: 'tween';
  to: Partial<ClipState>;
  /** A shape's clip only (D123): the tween carries the shape to surround other glyphs, as
   * Manim's `Transform(shape, SurroundingRectangle(other))` does. Absent for a plain tween. */
  fit?: TweenFit;
  /** A line's clip only (D144, format 30): the tween carries the two ends of the line elsewhere.
   * Absent for a plain tween, which moves the line as it is. */
  ends?: TweenEnds;
}

/** Where a line was drawn for a tween that carries its ends (`TweenEnds.drawn`): from where to
 * where once the gap is left at each end, the part of an arc that gap took at each end
 * (`LineCurve.trim`), and the centre Manim reads of the line as it is then (`get_center()`),
 * which is where the clip is from then on. */
export interface LineEndsDrawn {
  start: Vec2;
  end: Vec2;
  trim: number;
  center: Vec2;
}

/** Where a tween carries a line (D144, format 30): its two ends once the tween has ended, each on
 * glyphs of a clip or free at a point, as the ends of a line's attachment are (`EndsAttach`), and
 * the gap left at them while one is on glyphs (`buff`; two free ends are the two points). The
 * glyphs are measured when the tween starts, as Manim builds the new line then; the attach sync
 * writes what it finds into `drawn` (null until it has). What the line is once it is there
 * depends on its kind, as the Python that plays it does (`scene/lineStates.ts`):
 *
 *   - an arrow or a double arrow is **built anew** between the new ends — its tips and its stroke
 *     capped by its new length —, and played by `Transform(arrow, new_arrow)`;
 *   - a line and a dashed line are **carried**: the same points — the same dashes —, moved, turned
 *     and stretched so that the line runs between the new ends, as Manim's
 *     `line.animate.put_start_and_end_on(a, b)` carries them.
 *
 * `degrees` gives an arc other degrees (null: the ones it has): an arrow is built with them, and
 * a line — not a dashed one, whose dashes are only carried — is built anew for them, as an arrow
 * is. `to` holds the appearance the line arrives with: its colour, its opacity and its stroke
 * width (`strokeWidth`). While the tween runs the line goes point by point from what it is to
 * what it becomes. Once it has ended the clip is where that line's centre is (`drawn.center`),
 * unturned; a plain tween after it moves the line as it is then. */
export interface TweenEnds {
  start: LineEnd;
  end: LineEnd;
  buff: number;
  degrees: number | null;
  drawn: LineEndsDrawn | null;
}

/** The box a shape was fitted to (`scene/shapes.ts`): where its centre goes and how big it is,
 * in scene units — a circle's diameter is its width, an underline's height 0. */
export interface ShapeFitBox {
  center: Vec2;
  width: number;
  height: number;
}

/** Where a tween carries a shape (D123): to surround the glyphs of a clip — and of others
 * (`also`), as an attachment does —, fitted to them as its Manim class fits it, with the gap its
 * clip's attachment has. The glyphs are measured when the tween starts, as Manim builds the new
 * shape then; the attach sync writes what it finds into `fitted` (null until it has), as it
 * writes the size of an attached shape into its object. While the tween runs the shape goes
 * point by point from where it is to that fit; once it ends it is that fit, unturned and at
 * scale 1 — what an earlier tween did to its place, size and turn is gone, its colours and
 * paint go on —, so `to` holds an appearance only. Nothing follows the shape there. */
export interface TweenFit extends AttachTarget {
  also?: AttachTarget[];
  fitted: ShapeFitBox | null;
}

/** The glyphs an action applies to: every glyph of the formula (also after a LaTeX edit), or
 * canonical indices (ascending, no repeats). */
export type GlyphTarget = 'all' | number[];

/** Brings glyphs that are off screen onto it: hidden glyphs of the formula, or glyphs an earlier
 * Disappear took out. Targeted glyphs already on screen, or still to arrive through a relation,
 * are left out (validation warns about explicit ones). */
export interface AppearAction extends ActionBase, GlyphAnimationFields, GroupMember {
  kind: 'appear';
  anim: AppearKind;
}

/** Takes glyphs that are on screen off it; targeted glyphs that are not on screen are left out. */
export interface DisappearAction extends ActionBase, GlyphAnimationFields, GroupMember {
  kind: 'disappear';
  anim: DisappearKind;
}

/** What Appear and Disappear blocks share: the glyphs they act on and the options of their
 * Manim animation. */
interface GlyphAnimationFields {
  glyphs: GlyphTarget;
  /** As in ClipAnimationSpec. */
  lagRatio: number | null;
  shift: Vec2;
  scale: number;
}

/** Moves or restyles some glyphs relative to where they are, like Manim's
 * `VGroup(...).animate.shift(v).scale(k)`. Glyphs off screen move along. */
export interface PartTransformAction extends ActionBase, GroupMember {
  kind: 'transform';
  glyphs: number[];
  /** Scene units, screen axes. */
  shift: Vec2;
  /** About the centre of the glyphs' bounding box. */
  scale: number;
  /** Degrees, counter-clockwise, a true rotation about that centre. */
  rotation: number;
  /** null = unchanged. */
  color: string | null;
  /** 0…1; null = unchanged. */
  opacity: number | null;
}

/** Moves glyphs of the formula onto other glyphs of the same formula during the block — the
 * within-formula morph (docs/ARCHITECTURE.md §5): the next line of an aligned derivation grows
 * out of the previous one. Lowered to a glyph transfer from the clip to itself
 * (`model/transfers.ts`), so its pairs play like a relation's: sources are consumed or copied,
 * targets arrive (and so skip the intro, like relation targets). Both sides of a pair are
 * canonical indices of the one formula; a glyph is never on both sides within one block. */
export interface MorphAction extends ActionBase {
  kind: 'morph';
  /** Default style of the pairs; `copy` for a new block (the line the glyphs come from stays). */
  style: RelationStyle;
  /** Manim `path_arc`, degrees (0 = straight paths). */
  pathArc: number;
  /** In their authored order. */
  pairs: GlyphPair[];
}

/** The Emphasis effects (D73): Manim's animations that draw attention to some glyphs for a
 * moment and leave them as they were. `indicate` and `wiggle` animate the glyphs themselves;
 * the other three only measure them when the block starts and draw something of their own. */
export type EmphasisKind = 'indicate' | 'wiggle' | 'circumscribe' | 'flash' | 'focus_on';

/** Draws attention to `glyphs` (those on screen when the block starts) for the block's duration,
 * as Manim's `Indicate`, `Wiggle`, `Circumscribe`, `Flash` and `FocusOn` do, leaving them as
 * they were. Every field is kept whatever the effect, at Manim's default when the effect does not
 * use it, so that changing the effect changes nothing the block did not show:
 *   - `indicate`: the glyphs swell by `scale` (1.2) and turn `color` (#FFFF00) and back; a pulse,
 *     so `easing` is `there_and_back` or `there_and_back_with_pause` (`PULSE_EASINGS`);
 *   - `wiggle`: they swell by `scale` (1.1) and rock by `angle` degrees (3.6) `wiggles` times (6),
 *     as the export's `_Wiggle` helper does about a pivot fixed when it begins;
 *   - `circumscribe`: a rectangle `buff` (0.1) around them, in `color` with `strokeWidth` (4),
 *     traced and untraced in one pass with `timeWidth` (0.3) of it visible at a time;
 *   - `flash`: twelve lines of `color` shooting out of their centre, each library's own tempo;
 *   - `focus_on`: a disc of `color` (#888888) and `opacity` (0.2) shrinking from the whole frame
 *     onto their centre, drawn over everything. */
export interface EmphasisAction extends ActionBase, GroupMember {
  kind: 'emphasis';
  effect: EmphasisKind;
  glyphs: GlyphTarget;
  color: string;
  /** > 0. */
  scale: number;
  /** Degrees. */
  angle: number;
  /** A positive integer. */
  wiggles: number;
  /** Scene units. */
  buff: number;
  /** Manim `stroke_width` units, ≥ 0. */
  strokeWidth: number;
  /** A fraction of the frame's path, > 0. */
  timeWidth: number;
  /** 0…1. */
  opacity: number;
}

export type ClipAction =
  TweenAction | AppearAction | DisappearAction | PartTransformAction | MorphAction | EmphasisAction;

// --- Relations (Animations menu) ---------------------------------------------

/** A glyph-level transformation from one clip into another. Two clips can have several, in either
 * direction (format 31). */
export interface Relation {
  id: RelationId;
  fromClipId: ClipId;
  toClipId: ClipId;
  /** Window start, relative to the target clip's start. The window is
   * [to.start + offset, to.start + offset + duration). */
  offset: number;
  duration: number;
  easing: Easing;
  style: RelationStyle;
  /** Manim `path_arc`, degrees (0 = straight paths). */
  pathArc: number;
  pairs: GlyphPair[];
}

/** How the sources of a pair with several of them and one target reach it (D54). Manim's own
 * family alignment (`merge`) pads the target with invisible copies, so every source but the first
 * fades out as it arrives; `separate` gives each source its own transform onto the target, so
 * they all arrive and coincide; `copies` has the authored principal make the transform and the
 * others send a copy, staying where they are. Initially the principal is the lowest index. */
export type PairExtras = 'separate' | 'merge' | 'copies';

/** A node of a pair's custom path (`GlyphPair.path`): an anchor with the handles of the
 * segments around it, in the chord's frame — u along the chord from the centre of the glyph at
 * the start to its centre at the end (0 to 1), v across it to the left, both as fractions of
 * the chord's length, so the path deforms with the formulas. A null handle sits on its anchor.
 * `geom/spline.ts` has the maths. */
export interface SplineNode {
  at: Vec2;
  /** Handle of the segment arriving at the anchor; null = on the anchor (unused on the first
   * node). */
  in: Vec2 | null;
  /** Handle of the segment leaving the anchor; null = on the anchor (unused on the last). */
  out: Vec2 | null;
  /** The handles stay collinear when one is dragged (a corner's are free). */
  smooth: boolean;
}

/** A custom path (D48): cubic Béziers between the nodes — at least two, the first anchored at
 * (0, 0) and the last at (1, 0) — that the centre of each glyph of the pair travels at a uniform
 * speed by length, its shape interpolated along the way. */
export interface PathSpline {
  nodes: SplineNode[];
}

/** A custom path of its own for one route of a pair (D167): the source glyph `from` on its way
 * to the target glyph `to`, both canonical indices of the pair. The routes a pair plays are
 * `pairRoutes` (`transfers.ts`); one that the pair does not play is kept and ignored. */
export interface PairRoute {
  from: number;
  to: number;
  path: PathSpline;
}

/** n source glyphs → m target glyphs (canonical indices; both sides non-empty). Pairs of one
 * relation (or Morph block) may bring the same target glyphs when they bring exactly the same
 * ones: a join taken apart, each source with its own style and path (D167). */
export interface GlyphPair {
  from: number[];
  to: number[];
  /** Overrides `Relation.style` for this pair; null = inherit. */
  style: RelationStyle | null;
  /** Several sources, one target: how the sources beyond the first arrive; absent = `separate`.
   * Ignored for other shapes of pair. */
  extras?: PairExtras;
  /** The custom path of the pair's glyphs; absent = the transfer's `pathArc` (straight at 0). A
   * pair with a path ignores `pathArc`. */
  path?: PathSpline;
  /** The routes with a path of their own, which they follow instead of `path` (or of the arc);
   * absent when none has one. At most one per route. */
  routes?: PairRoute[];
  /** The authored source of a `copies` pair that makes the transform. Initially the lowest
   * canonical source index, then remapped with that glyph. Omission initializes that choice;
   * null records a lost principal and requires manual repair, even if only one source remains.
   * Kept through style/extras changes, ignored outside `copies` mode. */
  principal?: number | null;
}

// --- Match colours (Edit menu) -----------------------------------------------

/** A named list of LaTeX patterns and their colours. Applying it to a formula colours every
 * glyph of every occurrence of each pattern (`model/texPattern.ts`), writing the formula's
 * `glyphColors`; a later entry wins where patterns overlap. */
export interface ColorMatch {
  id: ColorMatchId;
  name: string;
  entries: ColorMatchEntry[];
}

export interface ColorMatchEntry {
  /** LaTeX as typed ("x", "\\frac{a}{b}"; `$…$` around it is ignored). */
  pattern: string;
  color: string;
}
