/* Defaults and factories. Values follow Manim's own defaults (ManimCE 0.22 / ManimGL 1.7)
 * unless noted, so an untouched project exports to idiomatic Manim code. */
import { newId } from './ids';
import { initializePairPrincipal } from './transfers';
import type {
  AppearAction,
  AppearKind,
  AudioAsset,
  AudioClip,
  AudioTrack,
  AttachSide,
  AttachTarget,
  BraceAttach,
  BraceFormula,
  CameraFrame,
  Clip,
  ClipState,
  ColorMatch,
  ColorMatchEntry,
  DisappearAction,
  DisappearKind,
  Easing,
  EmphasisAction,
  EmphasisKind,
  EndsAttach,
  Formula,
  FormulaBase,
  FormulaKind,
  GlyphStyle,
  GlyphTarget,
  IntroKind,
  IntroSpec,
  LineAnchor,
  LineEnd,
  LineEndPoint,
  LineFormula,
  LineKind,
  LineTip,
  MathFormula,
  MorphAction,
  NextToAttach,
  OutroKind,
  OutroSpec,
  PartTransformAction,
  Project,
  ProjectMeta,
  Relation,
  SceneCamera,
  ShapeAttach,
  ShapeFormula,
  ShapeKind,
  Slides,
  Target,
  TexFormula,
  ShapeDiagonal,
  TextFormula,
  TextFont,
  TextLayout,
  TipAttach,
  TweenAction,
  TweenEnds,
  TweenFit,
  VisualTrack,
} from './types';

export const FORMAT_ID = 'manim-formula-editor';
export const FORMAT_VERSION = 36;

/** Manim frame height in scene units (both CE and GL). */
export const FRAME_HEIGHT = 8;
export const DEFAULT_FONT_SIZE = 48;
export const DEFAULT_COLOR = '#FFFFFF';
/** The style of a text glyph (MathTex, Tex, a brace): filled, no stroke. */
export const TEXT_STYLE: Readonly<GlyphStyle> = {
  fillOpacity: 1,
  strokeWidth: 0,
  strokeOpacity: 1,
};
/** The two Manim libraries a project can target, by name. */
export const TARGET_NAMES: Record<Target, string> = { ce: 'ManimCE', gl: 'ManimGL' };
/** Manim `run_time` default. */
const DEFAULT_DURATION = 1;

/** Palette for formula tags, assigned round-robin to new formulas. */
export const TAG_COLORS = [
  '#58C4DD', // Manim BLUE
  '#83C167', // GREEN
  '#FFFF00', // YELLOW
  '#FC6255', // RED
  '#9A72AC', // PURPLE
  '#FF862F', // ORANGE
  '#5CD0B3', // TEAL
  '#D147BD', // PINK
] as const;

export function frameWidth(meta: Pick<ProjectMeta, 'width' | 'height'>): number {
  return (FRAME_HEIGHT * meta.width) / meta.height;
}

export function defaultMeta(name = 'Untitled'): ProjectMeta {
  return {
    name,
    target: 'ce',
    width: 1920,
    height: 1080,
    fps: 60,
    background: '#000000',
    preamble: '',
    duration: null,
  };
}

export function createTrack(name: string): VisualTrack {
  return { id: newId('t'), kind: 'visual', name, hidden: false, muted: false, locked: false };
}

export function createAudioTrack(name: string): AudioTrack {
  return { id: newId('t'), kind: 'audio', name, hidden: false, muted: false, locked: false };
}

export function createAudioAsset(fields: Omit<AudioAsset, 'id'>): AudioAsset {
  return { id: newId('s'), ...fields };
}

export function createAudioClip(
  assetId: string,
  trackId: string,
  start: number,
  end: number,
  fields: Partial<Omit<AudioClip, 'id' | 'assetId' | 'trackId' | 'start' | 'end'>> = {},
): AudioClip {
  return {
    id: newId('c'),
    assetId,
    trackId,
    start,
    end,
    sourceStart: 0,
    volume: [],
    ...fields,
  };
}

export function createEmptyProject(name = 'Untitled'): Project {
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    meta: defaultMeta(name),
    formulas: [],
    // Tracks stack upwards (new ones are added on top), so they are numbered from the bottom.
    tracks: [createTrack('Track 2'), createTrack('Track 1')],
    clips: [],
    audioAssets: [],
    audioClips: [],
    relations: [],
    colorMatches: [],
  };
}

/** A match colour list; its entries are what the Match colors dialog shows (D55). */
export function createColorMatch(name: string, entries: ColorMatchEntry[] = []): ColorMatch {
  return { id: newId('m'), name, entries };
}

/** A formula (`math`). The field order is the file's (`schema.ts`, `formulaOfKind`). */
export function createFormula(fields: Partial<Omit<MathFormula, 'id'>> = {}): MathFormula {
  return {
    id: newId('f'),
    kind: 'math',
    name: 'f',
    source: '',
    packages: [],
    tag: { color: TAG_COLORS[0], icon: null },
    fontSize: DEFAULT_FONT_SIZE,
    color: DEFAULT_COLOR,
    glyphColors: {},
    hiddenGlyphs: [],
    intro: null,
    snapshot: null,
    ...fields,
  };
}

/** A text as wide as it comes, centred, at LaTeX's line spacing. */
export const DEFAULT_TEXT_LAYOUT: Readonly<TextLayout> = {
  width: null,
  align: 'center',
  lineSpacing: 1,
};

/** A LaTeX text (`tex`). */
export function createTexFormula(fields: Partial<Omit<TexFormula, 'id'>> = {}): TexFormula {
  return {
    id: newId('f'),
    kind: 'tex',
    name: 't',
    source: '',
    layout: { ...DEFAULT_TEXT_LAYOUT },
    tag: { color: TAG_COLORS[0], icon: null },
    fontSize: DEFAULT_FONT_SIZE,
    color: DEFAULT_COLOR,
    glyphColors: {},
    hiddenGlyphs: [],
    intro: null,
    snapshot: null,
    ...fields,
  };
}

/** Explicit typography; a target-aware catalog can choose another installed family. */
export const DEFAULT_TEXT_FONT: Readonly<TextFont> = {
  family: 'Noto Sans',
  weight: 'normal',
  slant: 'normal',
};

export function createTextFormula(fields: Partial<Omit<TextFormula, 'id'>> = {}): TextFormula {
  return {
    id: newId('f'),
    kind: 'text',
    name: 'p',
    source: '',
    font: { ...DEFAULT_TEXT_FONT },
    geometry: null,
    tag: { color: TAG_COLORS[0], icon: null },
    fontSize: DEFAULT_FONT_SIZE,
    color: DEFAULT_COLOR,
    glyphColors: {},
    hiddenGlyphs: [],
    intro: null,
    snapshot: null,
    ...fields,
  };
}

/** Manim's default gap between a brace and its target (`Brace(..., buff=0.2)`, both libraries). */
export const DEFAULT_BRACE_BUFF = 0.2;
/** ManimCE's default `sharpness` of a brace. */
export const DEFAULT_BRACE_SHARPNESS = 2;
/** The four sides of a brace as its `direction`: degrees counter-clockwise from DOWN. */
export const BRACE_SIDE_DEGREES: Readonly<Record<AttachSide, number>> = {
  down: 0,
  up: 180,
  left: -90,
  right: 90,
};

/** A brace (`brace`): no source, ManimCE's sharpness, no width until it is fitted to a target;
 * its clips grow from the centre, as Manim's `BraceLabel.creation_anim` makes a brace. */
export function createBraceFormula(fields: Partial<Omit<BraceFormula, 'id'>> = {}): BraceFormula {
  return {
    id: newId('f'),
    kind: 'brace',
    name: 'b',
    source: '',
    sharpness: DEFAULT_BRACE_SHARPNESS,
    width: 0,
    tag: { color: TAG_COLORS[0], icon: null },
    fontSize: DEFAULT_FONT_SIZE,
    color: DEFAULT_COLOR,
    glyphColors: {},
    hiddenGlyphs: [],
    intro: defaultIntro('grow_from_center'),
    snapshot: null,
    ...fields,
  };
}

/** Manim's default gap between a shape and its target: `SMALL_BUFF`, the `buff` of
 * `SurroundingRectangle` and `Underline`. */
export const DEFAULT_SHAPE_BUFF = 0.1;

/** Manim's default colour of each shape: `SurroundingRectangle`'s `PURE_YELLOW` (ManimGL's
 * `YELLOW` is the same #FFFF00; ManimCE's `YELLOW` is not, so the export writes the hex), `Circle`'s
 * and `Cross`'s `RED`, `Underline`'s white. A cross line is one line of a cross: its colour. */
export const SHAPE_COLORS: Readonly<Record<ShapeKind, string>> = {
  box: '#FFFF00',
  circle: '#FC6255',
  underline: '#FFFFFF',
  cross: '#FC6255',
  cross_line: '#FC6255',
};

/** Manim's default style of each shape: stroked at the default width, no fill; a cross's lines
 * are 6 wide, and so is a cross line. */
export const SHAPE_STYLES: Readonly<Record<ShapeKind, Readonly<GlyphStyle>>> = {
  box: { fillOpacity: 0, strokeWidth: 4, strokeOpacity: 1 },
  circle: { fillOpacity: 0, strokeWidth: 4, strokeOpacity: 1 },
  underline: { fillOpacity: 0, strokeWidth: 4, strokeOpacity: 1 },
  cross: { fillOpacity: 0, strokeWidth: 6, strokeOpacity: 1 },
  cross_line: { fillOpacity: 0, strokeWidth: 6, strokeOpacity: 1 },
};

/** The diagonal of a cross line that names none: the rising one, as a stroke through a term. */
export const DEFAULT_SHAPE_DIAGONAL: ShapeDiagonal = 'dl_ur';

/** A shape (`shape`): a box unless `fields` says otherwise, in Manim's colour and style for the
 * shape, with square corners and no size until it is fitted to a target; its clips are created
 * (`Create`), as Manim's examples bring a `SurroundingRectangle` in. */
export function createShapeFormula(fields: Partial<Omit<ShapeFormula, 'id'>> = {}): ShapeFormula {
  const shape = fields.shape ?? 'box';
  return {
    id: newId('f'),
    kind: 'shape',
    name: 's',
    source: '',
    shape,
    style: { ...SHAPE_STYLES[shape] },
    cornerRadius: 0,
    width: 0,
    height: 0,
    tag: { color: TAG_COLORS[0], icon: null },
    fontSize: DEFAULT_FONT_SIZE,
    color: SHAPE_COLORS[shape],
    glyphColors: {},
    hiddenGlyphs: [],
    intro: defaultIntro('create'),
    snapshot: null,
    ...fields,
  };
}

/** Manim's default stroke width of each line: `DEFAULT_STROKE_WIDTH`, and an `Arrow`'s 6. */
export const LINE_STROKE_WIDTHS: Readonly<Record<LineKind, number>> = {
  line: 4,
  dashed: 4,
  arrow: 6,
  double_arrow: 6,
};
/** Manim's `DEFAULT_ARROW_TIP_LENGTH` and `DEFAULT_DASH_LENGTH`. */
export const DEFAULT_TIP_LENGTH = 0.35;
export const DEFAULT_DASH_LENGTH = 0.05;
/** How short and how tall the frame of a scene camera can be, in scene units: Manim's frame at
 * the closest and at the farthest the preview's own view goes (64× and 0.1×). A frame past them is
 * a number of a file (`camera-frame`). */
export const MIN_CAMERA_HEIGHT = FRAME_HEIGHT / 64;
export const MAX_CAMERA_HEIGHT = FRAME_HEIGHT / 0.1;

/** Manim's own frame: about the origin, `FRAME_HEIGHT` tall. */
export function defaultCameraFrame(): CameraFrame {
  return { center: [0, 0], height: FRAME_HEIGHT };
}

/** The camera of a project whose multicamera has just been turned on: Manim's frame, no target
 * camera and no move. With it alone, the scene is the one without it. */
export function createSceneCamera(): SceneCamera {
  return { initial: defaultCameraFrame(), targets: [], moves: [] };
}

/** What a project whose Slides mode has just been turned on holds: no mark. */
export function createSlides(): Slides {
  return { marks: [] };
}

/** The longest a scene is, in seconds: a day. No field of the editor is meant to reach it; it is
 * the line past which a time is taken for a mistake of a file (`scene-length`), not for a scene. */
export const MAX_SCENE_SECONDS = 86_400;
/** How far the arc of a relation or of a Morph block turns, in degrees either way: what its fields
 * stop at, and past which a project is in error (`path-arc`). */
export const PATH_ARC_LIMIT = 360;
/** The shortest dash of a dashed line: what its fields stop at, and under which a project is in
 * error (`line-dash`). A dashed line is a mobject per dash, so a dash a thousand times shorter is
 * a thousand times the mobjects, in the preview as in Manim. */
export const MIN_DASH_LENGTH = 0.01;
/** Manim's default gap between a line and what it runs between: none for a `Line`, an `Arrow`'s
 * `MED_SMALL_BUFF`. */
export const LINE_BUFFS: Readonly<Record<LineKind, number>> = {
  line: 0,
  dashed: 0,
  arrow: 0.25,
  double_arrow: 0.25,
};

/** The shapes of an arrow's tip, in the order a menu lists them. */
export const LINE_TIPS = ['triangle', 'stealth', 'dot'] as const satisfies readonly LineTip[];
/** The arc a line takes when it is bent into one (D145), in degrees, and how far an arc may go
 * either way: near a whole turn its two ends are one point of the circle. */
export const DEFAULT_LINE_ARC = 30;
export const LINE_ARC_LIMIT = 300;

/** Whether a line has tips: an arrow, a double arrow. */
export function hasTips(line: LineKind): boolean {
  return line === 'arrow' || line === 'double_arrow';
}

/** A line (`line`): a plain one unless `fields` says otherwise, white, with Manim's stroke width
 * for its kind, tip and dashes, one unit long to the right until its ends are put; with no intro,
 * as a shape: it is there when its clip starts (D137). */
export function createLineFormula(fields: Partial<Omit<LineFormula, 'id'>> = {}): LineFormula {
  const line = fields.line ?? 'line';
  return {
    id: newId('f'),
    kind: 'line',
    name: 'l',
    source: '',
    line,
    vector: [1, 0],
    strokeWidth: LINE_STROKE_WIDTHS[line],
    tipLength: DEFAULT_TIP_LENGTH,
    dashLength: DEFAULT_DASH_LENGTH,
    curve: null,
    tip: 'triangle',
    startTip: 'triangle',
    tag: { color: TAG_COLORS[0], icon: null },
    fontSize: DEFAULT_FONT_SIZE,
    color: DEFAULT_COLOR,
    glyphColors: {},
    hiddenGlyphs: [],
    intro: defaultIntro('none'),
    snapshot: null,
    ...fields,
  };
}

/** An object of `kind` with the fields every kind has (`fields`) and the kind's own defaults. */
export function createFormulaOfKind(
  kind: FormulaKind,
  fields: Partial<Omit<FormulaBase, 'id' | 'kind'>> = {},
): Formula {
  switch (kind) {
    case 'math':
      return createFormula(fields);
    case 'tex':
      return createTexFormula(fields);
    case 'text':
      return createTextFormula(fields);
    case 'brace':
      return createBraceFormula(fields);
    case 'shape':
      return createShapeFormula(fields);
    case 'line':
      return createLineFormula(fields);
  }
}

export function defaultClipState(): ClipState {
  return {
    position: [0, 0],
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    color: null,
    glyphColors: {},
  };
}

/* Per-kind defaults. Durations of Write/Unwrite depend on the glyph count in Manim
 * (1 s below 15 glyphs, else 2 s); the factory uses 1 s and the UI may adjust.
 * lagRatio null = Manim's default, resolved by scene/ for the target:
 *   write/unwrite: CE min(4 / max(1, n), 0.2), GL min(4 / (n + 1), 0.2)
 *   create/uncreate: 1.0      fade/grow/shrink/draw_border_then_fill: 0 */
const INTRO_EASING: Record<IntroKind, Easing> = {
  none: 'linear',
  write: 'linear',
  fade_in: 'smooth',
  grow_from_center: 'smooth',
  draw_border_then_fill: 'double_smooth',
  create: 'smooth',
  grow_arrow: 'smooth',
};

const INTRO_DURATION: Record<IntroKind, number> = {
  none: 0,
  write: 1,
  fade_in: 1,
  grow_from_center: 1,
  draw_border_then_fill: 2,
  create: 1,
  grow_arrow: 1,
};

const OUTRO_EASING: Record<OutroKind, Easing> = {
  none: 'linear',
  unwrite: 'linear',
  fade_out: 'smooth',
  shrink_to_center: 'smooth',
  uncreate: 'smooth',
};

const OUTRO_DURATION: Record<OutroKind, number> = {
  none: 0,
  unwrite: 1,
  fade_out: 1,
  shrink_to_center: 1,
  uncreate: 1,
};

export function defaultIntro(kind: IntroKind = 'write'): IntroSpec {
  return {
    kind,
    duration: INTRO_DURATION[kind],
    easing: INTRO_EASING[kind],
    lagRatio: null,
    shift: [0, 0],
    scale: 1,
  };
}

export function defaultOutro(kind: OutroKind = 'fade_out'): OutroSpec {
  return {
    kind,
    duration: OUTRO_DURATION[kind],
    easing: OUTRO_EASING[kind],
    lagRatio: null,
    shift: [0, 0],
    scale: 1,
  };
}

export function createClip(
  formulaId: string,
  trackId: string,
  start: number,
  end: number,
  fields: Partial<Omit<Clip, 'id' | 'formulaId' | 'trackId' | 'start' | 'end'>> = {},
): Clip {
  return {
    id: newId('c'),
    formulaId,
    trackId,
    start,
    end,
    initial: defaultClipState(),
    intro: defaultIntro(),
    outro: defaultOutro(),
    actions: [],
    attach: null,
    ...fields,
  };
}

/** The distance Manim leaves between two mobjects placed `next_to` each other by default
 * (`DEFAULT_MOBJECT_TO_MOBJECT_BUFFER` in ManimCE, `DEFAULT_MOBJECT_TO_MOBJECT_BUFF` in ManimGL). */
export const DEFAULT_ATTACH_BUFF = 0.25;

/** An attachment to glyphs of `clipId`: beside them, below, at Manim's default gap unless
 * `fields` says otherwise. */
export function createAttach(
  clipId: string,
  glyphs: GlyphTarget,
  fields: Partial<Omit<NextToAttach, 'clipId' | 'glyphs' | 'rule'>> = {},
): NextToAttach {
  return { clipId, glyphs, rule: 'next_to', side: 'down', buff: DEFAULT_ATTACH_BUFF, ...fields };
}

/** A brace's attachment to glyphs of `clipId`: below them (direction 0), at Manim's default gap
 * for a brace unless `fields` says otherwise — `also`, the glyphs of other clips it spans as
 * well. */
export function createBraceAttach(
  clipId: string,
  glyphs: GlyphTarget,
  fields: Partial<Omit<BraceAttach, 'clipId' | 'glyphs' | 'rule' | 'also'>> & {
    also?: readonly AttachTarget[];
  } = {},
): BraceAttach {
  const { also, ...rest } = fields;
  return {
    clipId,
    glyphs,
    rule: 'brace',
    direction: 0,
    buff: DEFAULT_BRACE_BUFF,
    ...rest,
    ...alsoField(also),
  };
}

/** The `also` of a fitted attachment: absent when the object hangs on one clip. */
function alsoField(also: readonly AttachTarget[] | undefined): { also?: AttachTarget[] } {
  return also && also.length > 0 ? { also: also.map((target) => ({ ...target })) } : {};
}

/** The gap `Brace.get_tex` leaves between a brace's tip and its label, what a label's `buff:
 * null` stands for: ManimCE passes none to `next_to`, whose default is 0.25; ManimGL passes its
 * `SMALL_BUFF`, 0.1. */
export const BRACE_LABEL_BUFF: Readonly<Record<Target, number>> = { ce: 0.25, gl: 0.1 };

/** The gap between a brace's tip and a label hanging there, in `target`'s library. */
export function labelBuff(attach: Pick<TipAttach, 'buff'>, target: Target): number {
  return attach.buff ?? BRACE_LABEL_BUFF[target];
}

/** A label's attachment at the tip of the brace of clip `braceClipId`: at the gap Manim leaves for
 * a brace label (`buff: null`) unless `buff` says otherwise. */
export function createTipAttach(braceClipId: string, buff: number | null = null): TipAttach {
  return { clipId: braceClipId, glyphs: 'all', rule: 'tip', buff };
}

/** A shape's attachment to glyphs of `clipId` — and of the clips of `also`, when it spans
 * several —: fitted to them at Manim's default gap unless `buff` says otherwise. */
export function createShapeAttach(
  clipId: string,
  glyphs: GlyphTarget,
  buff: number = DEFAULT_SHAPE_BUFF,
  also?: readonly AttachTarget[],
): ShapeAttach {
  return { clipId, glyphs, rule: 'shape', buff, ...alsoField(also) };
}

/** A line's attachment by its ends, each on glyphs of a clip or at a point of the scene, at
 * `buff` from what it runs between. */
export function createEndsAttach(start: LineEndSpec, end: LineEndSpec, buff: number): EndsAttach {
  const copy = (side: LineEndSpec): LineEnd =>
    'point' in side
      ? { point: [side.point[0], side.point[1]] }
      : {
          clipId: side.clipId,
          glyphs: side.glyphs === 'all' ? 'all' : [...side.glyphs],
          anchor: side.anchor ?? 'auto',
        };
  return { rule: 'ends', start: copy(start), end: copy(end), buff };
}

/** An end as `createEndsAttach` takes it: one on glyphs that names no anchor is `auto`. */
export type LineEndSpec = (AttachTarget & { anchor?: LineAnchor }) | LineEndPoint;

/** The anchors of a line's end on glyphs, `auto` first and then the nine points of the box row by
 * row from its upper left corner (as the compass shows them). */
export const LINE_ANCHORS = [
  'auto',
  'ul',
  'up',
  'ur',
  'left',
  'center',
  'right',
  'dl',
  'down',
  'dr',
] as const satisfies readonly LineAnchor[];

export function createTween(
  start: number,
  duration: number,
  to: TweenAction['to'],
  easing: Easing = 'smooth',
): TweenAction {
  return { id: newId('a'), kind: 'tween', start, duration, easing, to };
}

/** A tween that carries its shape to surround `target` — and the glyphs of `also`, the other
 * clips it spans — (`TweenFit`), not fitted yet: the attach sync measures the target when the
 * tween starts. `to` is the appearance it arrives with. */
export function createFitTween(
  start: number,
  duration: number,
  target: AttachTarget,
  also: readonly AttachTarget[] = [],
  to: TweenAction['to'] = {},
  easing: Easing = 'smooth',
): TweenAction & { fit: TweenFit } {
  return {
    ...createTween(start, duration, to, easing),
    fit: {
      clipId: target.clipId,
      glyphs: target.glyphs === 'all' ? 'all' : [...target.glyphs],
      ...alsoField(also),
      fitted: null,
    },
  };
}

/** A tween that carries the two ends of its line to `start` and `end` (`TweenEnds`), not
 * measured yet: the attach sync finds where the line is drawn when the tween starts. `to` is the
 * appearance it arrives with; `degrees`, an arc's new ones. */
export function createEndsTween(
  start: number,
  duration: number,
  ends: Pick<TweenEnds, 'start' | 'end'> & Partial<Pick<TweenEnds, 'buff' | 'degrees'>>,
  to: TweenAction['to'] = {},
  easing: Easing = 'smooth',
): TweenAction & { ends: TweenEnds } {
  const end = (side: LineEnd): LineEnd =>
    'point' in side
      ? { point: [side.point[0], side.point[1]] }
      : {
          clipId: side.clipId,
          glyphs: side.glyphs === 'all' ? 'all' : [...side.glyphs],
          anchor: side.anchor,
        };
  return {
    ...createTween(start, duration, to, easing),
    ends: {
      start: end(ends.start),
      end: end(ends.end),
      buff: ends.buff ?? 0,
      degrees: ends.degrees ?? null,
      drawn: null,
    },
  };
}

/** An Appear block with the defaults of its animation (as for the intro of the same kind). */
export function createAppear(
  start: number,
  anim: AppearKind,
  glyphs: GlyphTarget,
  fields: Partial<Omit<AppearAction, 'id' | 'kind' | 'start' | 'anim' | 'glyphs'>> = {},
): AppearAction {
  return glyphAnimation<AppearAction>('appear', start, anim, glyphs, defaultIntro(anim), fields);
}

/** A Disappear block with the defaults of its animation (as for the outro of the same kind). */
export function createDisappear(
  start: number,
  anim: DisappearKind,
  glyphs: GlyphTarget,
  fields: Partial<Omit<DisappearAction, 'id' | 'kind' | 'start' | 'anim' | 'glyphs'>> = {},
): DisappearAction {
  return glyphAnimation<DisappearAction>(
    'disappear',
    start,
    anim,
    glyphs,
    defaultOutro(anim),
    fields,
  );
}

/** A new Appear or Disappear block, timed like `spec` (the intro or outro of its animation). */
function glyphAnimation<T extends AppearAction | DisappearAction>(
  kind: T['kind'],
  start: number,
  anim: T['anim'],
  glyphs: GlyphTarget,
  spec: { duration: number; easing: Easing },
  fields: Partial<Omit<T, 'id' | 'kind' | 'start' | 'anim' | 'glyphs'>>,
): T {
  return {
    id: newId('a'),
    kind,
    start,
    duration: spec.duration,
    easing: spec.easing,
    anim,
    glyphs,
    lagRatio: null,
    shift: [0, 0],
    scale: 1,
    ...fields,
  } as T;
}

/** A Transform block for some glyphs that changes nothing until its fields are set. */
export function createPartTransform(
  start: number,
  glyphs: number[],
  fields: Partial<Omit<PartTransformAction, 'id' | 'kind' | 'start' | 'glyphs'>> = {},
): PartTransformAction {
  return {
    id: newId('a'),
    kind: 'transform',
    start,
    duration: DEFAULT_DURATION,
    easing: 'smooth',
    glyphs,
    shift: [0, 0],
    scale: 1,
    rotation: 0,
    color: null,
    opacity: null,
    ...fields,
  };
}

/** A Morph block (docs/ARCHITECTURE.md §5): pairs of glyphs of the one formula, `copy` by default
 * so that the line the glyphs come from stays. It names no pair until the editor adds some. */
export function createMorph(
  start: number,
  fields: Partial<Omit<MorphAction, 'id' | 'kind' | 'start'>> = {},
): MorphAction {
  return {
    id: newId('a'),
    kind: 'morph',
    start,
    duration: DEFAULT_DURATION,
    easing: 'smooth',
    style: 'copy',
    pathArc: 0,
    ...fields,
    pairs: (fields.pairs ?? []).map(initializePairPrincipal),
  };
}

/** The easings that come back to where they started (`endsAtStart`): what an Indicate may run
 * with, a pulse by nature (D73, ★ Q11). */
export const PULSE_EASINGS: readonly Easing[] = ['there_and_back', 'there_and_back_with_pause'];

export function isPulseEasing(easing: Easing): boolean {
  return PULSE_EASINGS.includes(easing);
}

type EmphasisFields = Omit<EmphasisAction, 'id' | 'kind' | 'start' | 'effect' | 'glyphs'>;

/** Manim's defaults of the Emphasis effects (D73): the duration and rate function of each class
 * and its own arguments; a field an effect does not use keeps the default of the effect that
 * does, so that a block changed to another effect shows what Manim would. */
const EMPHASIS_BASE: EmphasisFields = {
  duration: 1,
  easing: 'smooth',
  color: '#FFFF00',
  scale: 1.2,
  angle: 3.6,
  wiggles: 6,
  buff: 0.1,
  strokeWidth: 4,
  timeWidth: 0.3,
  opacity: 0.2,
};

export const EMPHASIS_DEFAULTS: Readonly<Record<EmphasisKind, Readonly<EmphasisFields>>> = {
  indicate: { ...EMPHASIS_BASE, easing: 'there_and_back' },
  wiggle: { ...EMPHASIS_BASE, duration: 2, scale: 1.1 },
  circumscribe: { ...EMPHASIS_BASE },
  flash: { ...EMPHASIS_BASE },
  focus_on: { ...EMPHASIS_BASE, duration: 2, color: '#888888' },
};

/** An Emphasis block of `effect` on `glyphs` with Manim's defaults. */
export function createEmphasis(
  start: number,
  effect: EmphasisKind,
  glyphs: GlyphTarget,
  fields: Partial<EmphasisFields> = {},
): EmphasisAction {
  return {
    id: newId('a'),
    kind: 'emphasis',
    start,
    effect,
    glyphs,
    ...EMPHASIS_DEFAULTS[effect],
    ...fields,
  };
}

export function createRelation(
  fromClipId: string,
  toClipId: string,
  fields: Partial<Omit<Relation, 'id' | 'fromClipId' | 'toClipId'>> = {},
): Relation {
  return {
    id: newId('r'),
    fromClipId,
    toClipId,
    offset: 0,
    duration: DEFAULT_DURATION,
    easing: 'smooth',
    style: 'transform',
    pathArc: 0,
    ...fields,
    pairs: (fields.pairs ?? []).map(initializePairPrincipal),
  };
}
