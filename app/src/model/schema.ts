/* zod schema for the project file, whose version is `FORMAT_VERSION` (defaults.ts).
 *
 * Mirrors types.ts exactly; the compile-time checks at the bottom fail the build if the two
 * drift apart. The schema checks structure and value ranges only — cross-references and
 * timing rules live in validate.ts so that a structurally valid but inconsistent project can
 * still be opened and repaired.
 */
import { z } from 'zod';
import { MAX_AUDIO_GAIN } from './audio';
import { LINE_ANCHORS, LINE_ARC_LIMIT, LINE_TIPS } from './defaults';
import { TextFontSchema, TextGeometryRefSchema, TextSourceSchema } from './text';
import type { FormulaKind, Project } from './types';

/** '#RRGGBB'; lower case is accepted and normalised to upper case. */
const ColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'expected a colour like #FF8800')
  .transform((s) => s.toUpperCase());

const Vec2Schema = z.tuple([z.number(), z.number()]);
const FiniteVec2Schema = z.tuple([z.number().finite(), z.number().finite()]);
const Seconds = z.number().nonnegative();
const GlyphIndex = z.number().int().nonnegative();
const GlyphKey = z.string().regex(/^(0|[1-9]\d*)$/, 'expected a glyph index');
const GlyphColorsSchema = z.record(GlyphKey, ColorSchema);

export const TargetSchema = z.enum(['ce', 'gl']);
export const RenderBackendSchema = z.enum(['mathjax', 'latex', 'pango']);
export const EasingSchema = z.enum([
  'smooth',
  'linear',
  'rush_into',
  'rush_from',
  'slow_into',
  'double_smooth',
  'there_and_back',
  'there_and_back_with_pause',
]);
export const IntroKindSchema = z.enum([
  'none',
  'write',
  'fade_in',
  'grow_from_center',
  'draw_border_then_fill',
  'create',
  'grow_arrow',
]);
export const OutroKindSchema = z.enum([
  'none',
  'unwrite',
  'fade_out',
  'shrink_to_center',
  'uncreate',
]);
const AppearKindSchema = IntroKindSchema.exclude(['none']);
const DisappearKindSchema = OutroKindSchema.exclude(['none']);
export const RelationStyleSchema = z.enum(['transform', 'copy', 'fade', 'fade_copy']);
export const PairExtrasSchema = z.enum(['separate', 'merge', 'copies']);

const ProjectMetaSchema = z.object({
  name: z.string(),
  target: TargetSchema,
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(4320),
  fps: z.number().int().min(1).max(240),
  background: ColorSchema,
  preamble: z.string(),
  duration: Seconds.nullable(),
});

const GlyphSnapshotSchema = z.object({
  label: z.string(),
  center: Vec2Schema,
  size: Vec2Schema,
});

const FormulaSnapshotSchema = z.object({
  backend: RenderBackendSchema,
  key: z.string(),
  glyphs: z.array(GlyphSnapshotSchema),
});

/** The schema of one kind of object: the fields every kind has (`FormulaBase`) around the kind's
 * own, in the order `createFormula` writes them — zod outputs the keys in schema order, and a
 * saved file keeps it. */
function formulaOfKind<K extends FormulaKind, Own extends z.ZodRawShape>(kind: K, own: Own) {
  return z.object({
    id: z.string().min(1),
    kind: z.literal(kind),
    name: z.string(),
    source: z.string(),
    ...own,
    tag: z.object({ color: ColorSchema, icon: z.string().max(8).nullable() }),
    fontSize: z.number().positive(),
    color: ColorSchema,
    glyphColors: GlyphColorsSchema,
    hiddenGlyphs: z.array(z.number().int().nonnegative()),
    intro: animationSpec(IntroKindSchema).nullable(),
    startPosition: Vec2Schema.optional(),
    snapshot: FormulaSnapshotSchema.nullable(),
  });
}

const MathFormulaSchema = formulaOfKind('math', {
  packages: z.array(z.string().regex(/^[A-Za-z0-9_-]+$/, 'invalid package name')),
});

const TexFormulaSchema = formulaOfKind('tex', {
  layout: z.object({
    width: z.number().positive().nullable(),
    align: z.enum(['left', 'center', 'right']),
    lineSpacing: z.number().positive(),
  }),
});

const TextFormulaSchema = formulaOfKind('text', {
  source: TextSourceSchema,
  font: TextFontSchema,
  geometry: TextGeometryRefSchema.nullable(),
});

const BraceFormulaSchema = formulaOfKind('brace', {
  sharpness: z.number().positive(),
  width: z.number().nonnegative(),
});

const Opacity = z.number().min(0).max(1);

const ShapeFormulaSchema = formulaOfKind('shape', {
  shape: z.enum(['box', 'circle', 'underline', 'cross', 'cross_line']),
  style: z.object({
    fillOpacity: Opacity,
    strokeWidth: z.number().nonnegative(),
    strokeOpacity: Opacity,
  }),
  fillColor: ColorSchema.optional(),
  diagonal: z.enum(['dl_ur', 'ul_dr']).optional(),
  cornerRadius: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

const SplineNodeSchema = z.object({
  at: Vec2Schema,
  in: Vec2Schema.nullable(),
  out: Vec2Schema.nullable(),
  smooth: z.boolean(),
});

const LineCurveSchema = z.discriminatedUnion('shape', [
  z.object({
    shape: z.literal('arc'),
    degrees: z.number().min(-LINE_ARC_LIMIT).max(LINE_ARC_LIMIT),
    trim: z.number().min(0).max(0.5),
  }),
  z.object({ shape: z.literal('spline'), nodes: z.array(SplineNodeSchema).min(2) }),
]);

const LineFormulaSchema = formulaOfKind('line', {
  line: z.enum(['line', 'dashed', 'arrow', 'double_arrow']),
  vector: FiniteVec2Schema,
  strokeWidth: z.number().nonnegative(),
  tipLength: z.number().positive(),
  dashLength: z.number().positive(),
  curve: LineCurveSchema.nullable(),
  tip: z.enum(LINE_TIPS),
  startTip: z.enum(LINE_TIPS),
});

const FormulaSchema = z.discriminatedUnion('kind', [
  MathFormulaSchema,
  TexFormulaSchema,
  TextFormulaSchema,
  BraceFormulaSchema,
  ShapeFormulaSchema,
  LineFormulaSchema,
]);

const TrackSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('visual'),
    name: z.string(),
    hidden: z.boolean(),
    muted: z.literal(false),
    locked: z.boolean(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('audio'),
    name: z.string(),
    hidden: z.literal(false),
    muted: z.boolean(),
    locked: z.boolean(),
  }),
]);

const AudioAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/, 'expected a lowercase SHA-256 hash'),
  duration: z.number().finite().positive(),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().positive(),
});

const AudioClipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  trackId: z.string().min(1),
  start: Seconds.finite(),
  end: Seconds.finite(),
  sourceStart: Seconds.finite(),
  volume: z.array(
    z.object({
      id: z.string().min(1),
      time: Seconds.finite(),
      gain: z.number().finite().min(0).max(MAX_AUDIO_GAIN),
    }),
  ),
});

const ClipStateSchema = z.object({
  position: Vec2Schema,
  scale: z.number(),
  rotation: z.number(),
  flipX: z.boolean(),
  flipY: z.boolean(),
  opacity: z.number().min(0).max(1),
  color: ColorSchema.nullable(),
  glyphColors: GlyphColorsSchema,
  // A shape's paint, where a Transform has set it (`shapePaint.ts`).
  strokeWidth: z.number().nonnegative().optional(),
  strokeOpacity: Opacity.optional(),
  fillOpacity: Opacity.optional(),
  fillColor: ColorSchema.optional(),
});

function animationSpec<K extends z.ZodEnum>(kind: K) {
  return z.object({
    kind,
    duration: Seconds,
    easing: EasingSchema,
    lagRatio: z.number().nonnegative().nullable(),
    shift: Vec2Schema,
    scale: z.number().nonnegative(),
  });
}

const ActionId = z.string().min(1);
const ActionDuration = z.number().positive();
/** The group of a block that names glyphs (`groups.ts`); a block on its own has none. */
const GroupIdSchema = z.string().min(1).optional();
const GlyphListSchema = z.array(GlyphIndex);
const GlyphTargetSchema = z.union([z.literal('all'), GlyphListSchema]);

/** The glyphs of a clip something is fitted to or hangs on. */
const targetFields = { clipId: z.string().min(1), glyphs: GlyphTargetSchema };

/** An end of a line: glyphs of a clip and where on them (`anchor`, format 27), or a point of the
 * scene (format 26). */
const LineEndSchema = z.union([
  z.object({ ...targetFields, anchor: z.enum(LINE_ANCHORS) }),
  z.object({ point: FiniteVec2Schema }),
]);

const TweenActionSchema = z.object({
  id: ActionId,
  kind: z.literal('tween'),
  start: Seconds,
  duration: ActionDuration,
  easing: EasingSchema,
  to: ClipStateSchema.partial(),
  // A shape's tween that carries it to surround other glyphs (`TweenFit`); a plain tween has none.
  fit: z
    .object({
      ...targetFields,
      also: z.array(z.object(targetFields)).optional(),
      fitted: z
        .object({
          center: z.tuple([z.number().finite(), z.number().finite()]),
          width: z.number().nonnegative(),
          height: z.number().nonnegative(),
        })
        .nullable(),
    })
    .optional(),
  // A line's tween that carries its two ends elsewhere (`TweenEnds`, format 30).
  ends: z
    .object({
      start: LineEndSchema,
      end: LineEndSchema,
      buff: z.number().finite(),
      degrees: z.number().min(-LINE_ARC_LIMIT).max(LINE_ARC_LIMIT).nullable(),
      drawn: z
        .object({
          start: FiniteVec2Schema,
          end: FiniteVec2Schema,
          trim: z.number().min(0).max(0.5),
          center: FiniteVec2Schema,
        })
        .nullable(),
    })
    .optional(),
});

/** An Appear or Disappear block: its glyphs and the options of its Manim animation. */
function glyphAnimationAction<K extends string, A extends z.ZodType>(kind: K, anim: A) {
  return z.object({
    id: ActionId,
    kind: z.literal(kind),
    start: Seconds,
    duration: ActionDuration,
    easing: EasingSchema,
    anim,
    glyphs: GlyphTargetSchema,
    lagRatio: z.number().nonnegative().nullable(),
    shift: Vec2Schema,
    scale: z.number().nonnegative(),
    group: GroupIdSchema,
  });
}

const AppearActionSchema = glyphAnimationAction('appear', AppearKindSchema);
const DisappearActionSchema = glyphAnimationAction('disappear', DisappearKindSchema);

const PartTransformActionSchema = z.object({
  id: ActionId,
  kind: z.literal('transform'),
  start: Seconds,
  duration: ActionDuration,
  easing: EasingSchema,
  glyphs: GlyphListSchema,
  shift: Vec2Schema,
  scale: z.number().positive(),
  rotation: z.number(),
  color: ColorSchema.nullable(),
  opacity: z.number().min(0).max(1).nullable(),
  group: GroupIdSchema,
});

const PathSplineSchema = z.object({ nodes: z.array(SplineNodeSchema).min(2) });

const GlyphPairSchema = z.object({
  from: z.array(GlyphIndex),
  to: z.array(GlyphIndex),
  style: RelationStyleSchema.nullable(),
  extras: PairExtrasSchema.optional(),
  path: PathSplineSchema.optional(),
  routes: z
    .array(z.object({ from: GlyphIndex, to: GlyphIndex, path: PathSplineSchema }))
    .optional(),
  principal: GlyphIndex.nullable().optional(),
});

const MorphActionSchema = z.object({
  id: ActionId,
  kind: z.literal('morph'),
  start: Seconds,
  duration: ActionDuration,
  easing: EasingSchema,
  style: RelationStyleSchema,
  pathArc: z.number(),
  pairs: z.array(GlyphPairSchema),
});

export const EmphasisKindSchema = z.enum([
  'indicate',
  'wiggle',
  'circumscribe',
  'flash',
  'focus_on',
]);

const EmphasisActionSchema = z.object({
  id: ActionId,
  kind: z.literal('emphasis'),
  start: Seconds,
  duration: ActionDuration,
  easing: EasingSchema,
  effect: EmphasisKindSchema,
  glyphs: GlyphTargetSchema,
  color: ColorSchema,
  scale: z.number().positive(),
  angle: z.number(),
  wiggles: z.number().int().positive(),
  buff: z.number(),
  strokeWidth: z.number().nonnegative(),
  timeWidth: z.number().positive(),
  opacity: z.number().min(0).max(1),
  group: GroupIdSchema,
});

const attachFields = targetFields;
/** A brace or a shape can span glyphs of other clips as well (format 21): the last field of its
 * attachment, as the app writes it. */
const alsoField = { also: z.array(z.object(attachFields)).optional() };

const AttachSchema = z.discriminatedUnion('rule', [
  z.object({
    ...attachFields,
    rule: z.literal('next_to'),
    side: z.enum(['down', 'up', 'left', 'right']),
    buff: z.number().finite(),
  }),
  z.object({
    ...attachFields,
    rule: z.literal('brace'),
    direction: z.number().finite(),
    buff: z.number().finite(),
    ...alsoField,
  }),
  z.object({
    clipId: z.string().min(1),
    glyphs: z.literal('all'),
    rule: z.literal('tip'),
    buff: z.number().finite().nullable(),
  }),
  z.object({
    ...attachFields,
    rule: z.literal('shape'),
    buff: z.number().finite(),
    ...alsoField,
  }),
  z.object({
    rule: z.literal('ends'),
    start: LineEndSchema,
    end: LineEndSchema,
    buff: z.number().finite(),
  }),
]);

const ClipSchema = z.object({
  id: z.string().min(1),
  formulaId: z.string().min(1),
  trackId: z.string().min(1),
  start: Seconds,
  end: Seconds,
  initial: ClipStateSchema,
  intro: animationSpec(IntroKindSchema),
  outro: animationSpec(OutroKindSchema),
  actions: z.array(
    z.discriminatedUnion('kind', [
      TweenActionSchema,
      AppearActionSchema,
      DisappearActionSchema,
      PartTransformActionSchema,
      MorphActionSchema,
      EmphasisActionSchema,
    ]),
  ),
  attach: AttachSchema.nullable(),
  previewLocked: z.boolean().optional(),
  startsEmpty: z.boolean().optional(),
  startHidden: z.array(z.number().int().nonnegative()).optional(),
});

const RelationSchema = z.object({
  id: z.string().min(1),
  fromClipId: z.string().min(1),
  toClipId: z.string().min(1),
  offset: z.number(),
  duration: z.number().positive(),
  easing: EasingSchema,
  style: RelationStyleSchema,
  pathArc: z.number(),
  pairs: z.array(GlyphPairSchema),
});

const ColorMatchSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  entries: z.array(z.object({ pattern: z.string(), color: ColorSchema })),
});

/** A group of formulas of the Creator (format 22). What it must hold — formulas that exist, each
 * in one group, a name — is the loader's to put right (`repairFormulaGroups`), not a reason to
 * refuse the file. */
const FormulaGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  formulaIds: z.array(z.string().min(1)),
});

// --- The scene's camera (format 34) ---------------------------------------------

/** A frame of the scene. Its numbers are finite — a file can write `1e999` — and its height a
 * length; the bounds of a camera are a rule of the project (`camera-frame`), so that a file past
 * them opens and says so. */
const CameraFrameSchema = z.object({
  center: FiniteVec2Schema,
  height: z.number().finite().positive(),
});

const CameraDestinationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('frame'), frame: CameraFrameSchema }),
  z.object({ kind: z.literal('target'), target: z.string().min(1) }),
  z.object({ kind: z.literal('start') }),
]);

export const SceneCameraSchema = z.object({
  initial: CameraFrameSchema,
  // The name before the frame, as the app writes a target camera.
  targets: z.array(
    z.object({ id: z.string().min(1), name: z.string().min(1), ...CameraFrameSchema.shape }),
  ),
  moves: z.array(
    z.object({
      id: z.string().min(1),
      start: Seconds,
      duration: ActionDuration,
      easing: EasingSchema,
      to: CameraDestinationSchema,
    }),
  ),
  locked: z.boolean().optional(),
});

// --- The Slides mode (format 35) ------------------------------------------------

/** The marks of the Slides mode. Where a mark may stand is a rule of the project
 * (`slide-mark-busy`, `slide-mark-outside`), so that a file with one elsewhere opens and says so. */
export const SlidesSchema = z.object({
  marks: z.array(
    z.object({
      id: z.string().min(1),
      time: Seconds,
      kind: z.enum(['pause', 'comment']),
      text: z.string().optional(),
      skipWait: z.boolean().optional(),
    }),
  ),
});

export const ProjectSchema = z.object({
  format: z.literal('manim-formula-editor'),
  version: z.literal(36),
  meta: ProjectMetaSchema,
  formulas: z.array(FormulaSchema),
  tracks: z.array(TrackSchema),
  clips: z.array(ClipSchema),
  audioAssets: z.array(AudioAssetSchema),
  audioClips: z.array(AudioClipSchema),
  relations: z.array(RelationSchema),
  colorMatches: z.array(ColorMatchSchema),
  // After the fields every project has, as the app writes it: absent while the project has no
  // group.
  formulaGroups: z.array(FormulaGroupSchema).optional(),
  // Absent while the multicamera is off.
  camera: SceneCameraSchema.optional(),
  // The last field: absent while the Slides mode is off.
  slides: SlidesSchema.optional(),
});

// --- Compile-time agreement with types.ts --------------------------------------

// Mutual assignability (a strict identity check would trip over `?: T` vs `?: T | undefined`).
type Agrees<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Every optional field made required, all the way down. Mutual assignability alone lets an
 * optional field be on one side only — an object without it is assignable to one that may have
 * it, and back —, which is how a new optional field of types.ts would be left out of the schema,
 * and so dropped from every file read, without a word. Compared with their optional fields
 * required, the two sides must name the same fields. */
type DeepRequired<T> = T extends readonly unknown[]
  ? { [K in keyof T]: DeepRequired<T[K]> }
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<Exclude<T[K], undefined>> }
    : T;

const schemaMatchesTypes: Agrees<
  DeepRequired<z.output<typeof ProjectSchema>>,
  DeepRequired<Project>
> = true;
const inputMatchesTypes: Agrees<
  DeepRequired<z.input<typeof ProjectSchema>>,
  DeepRequired<Project>
> = true;
void schemaMatchesTypes;
void inputMatchesTypes;

// The check sees a field that only one side has, optional or not: each of these would be `true`
// under mutual assignability alone, and the build would pass.
const seesAnOptionalField: Agrees<
  DeepRequired<{ id: string; cameraId?: string }>,
  DeepRequired<{ id: string }>
> = false;
const seesANestedOptionalField: Agrees<
  DeepRequired<{ clips: { id: string; cameraId?: string }[] }>,
  DeepRequired<{ clips: { id: string }[] }>
> = false;
void seesAnOptionalField;
void seesANestedOptionalField;
