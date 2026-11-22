/* Creation rules for attached braces, labels and shapes. Callers supply the project, playhead
 * and current editor defaults; plans contain fresh objects and a target track. Placement uses
 * the caller's draft, after any gesture cancellation. No stores, preferences or DOM are read. */
import {
  createBraceAttach,
  createClip,
  createShapeAttach,
  createTipAttach,
  createTrack,
  DEFAULT_SHAPE_BUFF,
  defaultIntro,
  defaultOutro,
  TIME_EPSILON,
  type AttachTarget,
  type Clip,
  type ClipId,
  type Formula,
  type FormulaKind,
  type GlyphStyle,
  type GlyphTarget,
  type IntroSpec,
  type Project,
  type ShapeKind,
  type Track,
  type TrackId,
} from '../../model';
import { createEditorFormula } from '../creator/newFormula';
import type { StandardScale } from '../creator/standardScale';
import type { PaletteColors } from '../colors/palette';
import { MIN_DURATION } from '../project/defaultAnimations';
import { round6 } from '../time';
import {
  MIN_CLIP_LENGTH,
  nearestFreeTrack,
  newTrackName,
  type TrackSide,
} from '../timeline/clipOps';
import { listNames } from './attachNames';

export interface AttachmentCreationDefaults {
  introDuration: number;
  standardScale: StandardScale;
  colors?: PaletteColors;
}

/** What a label at a brace's tip can be (D69): a formula, as `Brace.get_tex` makes one, or a
 * LaTeX text. */
export type LabelKind = Extract<FormulaKind, 'math' | 'tex'>;
export const LABEL_KINDS: readonly LabelKind[] = ['math', 'tex'];

/** What «Add shape ▸» offers, in its order: the five shapes, and a highlight — a box filled with
 * no stroke at no gap, on a track behind the glyphs. */
export type ShapeChoice = ShapeKind | 'highlight';
export const SHAPE_CHOICES: readonly ShapeChoice[] = [
  'box',
  'circle',
  'underline',
  'cross',
  'cross_line',
  'highlight',
];

/** The fill of a new highlight: translucent, so the glyphs read through it (Manim's
 * `BackgroundRectangle` fills at 0.75, to hide what is behind). */
export const HIGHLIGHT_FILL_OPACITY = 0.3;

interface ShapePreset {
  shape: ShapeKind;
  /** The style when it is not the shape's own default (`SHAPE_STYLES`). */
  style?: GlyphStyle;
  buff: number;
  /** On the nearest free track below the target's rather than above: drawn behind the glyphs. */
  below: boolean;
}

export const SHAPE_PRESETS: Readonly<Record<ShapeChoice, ShapePreset>> = {
  box: { shape: 'box', buff: DEFAULT_SHAPE_BUFF, below: false },
  circle: { shape: 'circle', buff: DEFAULT_SHAPE_BUFF, below: false },
  underline: { shape: 'underline', buff: DEFAULT_SHAPE_BUFF, below: false },
  cross: { shape: 'cross', buff: 0, below: false },
  cross_line: { shape: 'cross_line', buff: 0, below: false },
  highlight: {
    shape: 'box',
    style: { fillOpacity: HIGHLIGHT_FILL_OPACITY, strokeWidth: 0, strokeOpacity: 0 },
    buff: 0,
    below: true,
  },
};

/** When a new brace's or shape's clip runs (D66): from the playhead to the target's end — from
 * the end of the target's intro instead when the playhead is inside that intro, or outside the
 * clip: the first instant the target's glyphs are quiet, which is what the validation asks for. A
 * target hardly longer than its intro gets the shortest clip there is at its end. */
export function attachedClipWindow(
  target: Pick<Clip, 'start' | 'end' | 'intro'>,
  time: number,
): { start: number; end: number } {
  const earliest = target.start + target.intro.duration;
  const end = target.end;
  const latest = Math.max(end - MIN_CLIP_LENGTH, target.start);
  const wanted = time > earliest && time < end ? time : earliest;
  return { start: round6(Math.min(wanted, latest)), end: round6(end) };
}

/** When the clip of a new brace or shape over glyphs of several clips runs (D117): where the
 * windows each target gives it (`attachedClipWindow`) meet — from the last of their starts, when
 * the glyphs of all of them are quiet, to the first of their ends. Targets whose windows do not
 * meet get the shortest clip there is at that end (the validation then says which glyphs are not
 * quiet). One target: its own window. */
export function attachedWindowOver(
  targets: readonly Pick<Clip, 'start' | 'end' | 'intro'>[],
  time: number,
): { start: number; end: number } {
  const windows = targets.map((target) => attachedClipWindow(target, time));
  if (windows.length === 1) return windows[0]!;
  const end = Math.min(...windows.map((w) => w.end));
  const start = Math.max(...windows.map((w) => w.start));
  return { start: round6(Math.min(start, Math.max(end - MIN_CLIP_LENGTH, 0))), end: round6(end) };
}

/** The intro of a new label: FadeIn, as `BraceLabel.creation_anim` brings its label in, for the
 * preference's intro duration (the animation's own when the preference has none), no longer
 * than the clip. A brace and a shape come with none. */
export function labelIntro(length: number, preferred: number): IntroSpec {
  const base = defaultIntro('fade_in');
  const duration = Math.min(preferred > 0 ? preferred : base.duration, length);
  return { ...base, duration: round6(Math.max(duration, MIN_DURATION)) };
}

/** When a new label's clip runs (D69): over its brace's clip, the two coming in together as
 * `BraceLabel.creation_anim` brings them — or from the playhead to the brace's end, when the
 * playhead is inside the brace's clip and past its intro. */
export function labelClipWindow(
  brace: Pick<Clip, 'start' | 'end' | 'intro'>,
  time: number,
): { start: number; end: number } {
  const quiet = brace.start + brace.intro.duration;
  const latest = Math.max(brace.end - MIN_CLIP_LENGTH, brace.start);
  const wanted = time >= quiet && time < brace.end ? time : brace.start;
  return { start: round6(Math.min(wanted, latest)), end: round6(brace.end) };
}

/** Whether `clipId` is the clip of a brace (it takes labels, not braces, in the menus). */
export function isBraceClip(project: Project, clipId: ClipId): boolean {
  const clip = project.clips.find((c) => c.id === clipId);
  return project.formulas.find((f) => f.id === clip?.formulaId)?.kind === 'brace';
}

/** One brace, or one shape, over several whole clips (D123, D126): what it hangs on — the first
 * clip as the attachment's own target, the others as its `also` —, or why it cannot. */
export type SpanningAttachment =
  { ok: true; clipId: ClipId; also: AttachTarget[] } | { ok: false; reason: string };
export type SpanningBrace = SpanningAttachment;

/** What «Add brace» does for the selected clips `clipIds`, in their order, at the playhead
 * `time`: one brace over them all, as Manim's `Brace(VGroup(…))` — formulas, texts and shapes,
 * mixed or not. Null when the selection takes none: fewer than two clips of objects, or a brace
 * among them (a brace is never braced). Refused, with the reason, when the clips are never on
 * screen together from the playhead on: the brace would have no instant to be fitted at. */
export function planSpanningBrace(
  project: Project,
  clipIds: readonly ClipId[],
  time: number,
): SpanningAttachment | null {
  return planSpanning(project, clipIds, time, ['brace']);
}

/** What «Add shape» does for the selected clips: one shape around them all, as Manim fits a
 * `SurroundingRectangle` to a `VGroup` (D126) — formulas and texts. Null when the selection takes
 * none: fewer than two clips of objects, or a brace or a shape among them (no menu puts a shape
 * on either). Refused as a brace is when the clips are never on screen together. */
export function planSpanningShape(
  project: Project,
  clipIds: readonly ClipId[],
  time: number,
): SpanningAttachment | null {
  return planSpanning(project, clipIds, time, ['brace', 'shape']);
}

/** One attachment over the whole of each of the clips `clipIds`, none of them of a kind of
 * `never`: see `planSpanningBrace`. */
function planSpanning(
  project: Project,
  clipIds: readonly ClipId[],
  time: number,
  never: readonly FormulaKind[],
): SpanningAttachment | null {
  const clips = clipIds
    .map((id) => project.clips.find((c) => c.id === id))
    .filter((clip) => clip !== undefined);
  const kindOfClip = (clip: Clip) => project.formulas.find((f) => f.id === clip.formulaId)?.kind;
  if (clips.length < 2 || clips.some((clip) => never.includes(kindOfClip(clip)!))) return null;
  const windows = clips.map((clip) => attachedClipWindow(clip, time));
  const start = Math.max(...windows.map((w) => w.start));
  const end = Math.min(...windows.map((w) => w.end));
  if (end - start < MIN_CLIP_LENGTH - TIME_EPSILON) {
    return { ok: false, reason: 'The selected clips are never on screen together.' };
  }
  const [first, ...rest] = clips;
  return {
    ok: true,
    clipId: first!.id,
    also: rest.map((clip) => ({ clipId: clip.id, glyphs: 'all' as const })),
  };
}

export interface AttachmentCreationPlan {
  formula: Formula;
  clip: Clip;
  targetName: string;
  targetTrackId: TrackId;
  trackSide: TrackSide;
}

/** A new track right above `trackId`, or right below it (mutates a draft). */
export function newTrackBeside(draft: Project, trackId: TrackId, side: TrackSide): Track {
  const track = createTrack(newTrackName(draft.tracks));
  const index = Math.max(
    0,
    draft.tracks.findIndex((t) => t.id === trackId),
  );
  draft.tracks.splice(side === 'above' ? index : index + 1, 0, track);
  return track;
}

/** The plan of an object on `targets`: named after them all, and beside the track of the one
 * that is in front of the others when it goes above them, behind the others when it goes below
 * (a highlight), so that it is in front of, or behind, every glyph it spans. */
function attachmentPlan(
  project: Project,
  targets: readonly Clip[],
  formula: Formula,
  clip: Clip,
  trackSide: TrackSide = 'above',
): AttachmentCreationPlan {
  const names = targets.map(
    (target) => project.formulas.find((f) => f.id === target.formulaId)?.name ?? '?',
  );
  const rows = targets.map((target) => project.tracks.findIndex((t) => t.id === target.trackId));
  const row = trackSide === 'above' ? Math.min(...rows) : Math.max(...rows);
  return {
    formula,
    clip,
    targetName: listNames([...new Set(names)]),
    targetTrackId: project.tracks[row]?.id ?? targets[0]!.trackId,
    trackSide,
  };
}

/** The clips of the targets of a new attachment, in their order; null when one is gone. */
function targetClips(project: Project, targets: readonly AttachTarget[]): Clip[] | null {
  const clips: Clip[] = [];
  for (const target of targets) {
    const clip = project.clips.find((c) => c.id === target.clipId);
    if (!clip) return null;
    clips.push(clip);
  }
  return clips;
}

/** A brace on the target's glyphs — and on those of `also`, the other clips it spans —, with no
 * intro: it is there when its clip starts (the clip's menu gives it one, D118). Missing targets
 * produce no plan. */
export function planBraceCreation(
  project: Project,
  clipId: ClipId,
  glyphs: GlyphTarget,
  direction: number,
  time: number,
  defaults: AttachmentCreationDefaults,
  also: readonly AttachTarget[] = [],
): AttachmentCreationPlan | null {
  const targets = targetClips(project, [{ clipId, glyphs }, ...also]);
  if (!targets) return null;
  const target = targets[0]!;
  const { start, end } = attachedWindowOver(targets, time);
  const intro = defaultIntro('none');
  const formula = createEditorFormula(
    'brace',
    project.formulas,
    defaults.standardScale,
    { intro },
    defaults.colors,
  );
  const clip = createClip(formula.id, target.trackId, start, end, {
    intro,
    outro: defaultOutro('none'),
    attach: createBraceAttach(clipId, glyphs, { direction, also }),
  });
  return attachmentPlan(project, targets, formula, clip);
}

/** An empty label with its kind's standard scale, fading in at a brace's tip. */
export function planBraceLabelCreation(
  project: Project,
  braceClipId: ClipId,
  kind: LabelKind,
  time: number,
  defaults: AttachmentCreationDefaults,
): AttachmentCreationPlan | null {
  const brace = project.clips.find((c) => c.id === braceClipId);
  if (!brace || !isBraceClip(project, braceClipId)) return null;
  const { start, end } = labelClipWindow(brace, time);
  const intro = labelIntro(end - start, defaults.introDuration);
  const formula = createEditorFormula(
    kind,
    project.formulas,
    defaults.standardScale,
    {},
    defaults.colors,
  );
  const clip = createClip(formula.id, brace.trackId, start, end, {
    intro,
    outro: defaultOutro('none'),
    attach: createTipAttach(braceClipId),
  });
  return attachmentPlan(project, [brace], formula, clip);
}

/** A shape using its preset geometry, style and track side, on the target's glyphs and on those
 * of `also`, the other clips it spans; with no intro, as a brace: it is there when its clip
 * starts, and takes an animation from its clip's menu (D118). */
export function planShapeCreation(
  project: Project,
  clipId: ClipId,
  glyphs: GlyphTarget,
  choice: ShapeChoice,
  time: number,
  defaults: AttachmentCreationDefaults,
  also: readonly AttachTarget[] = [],
): AttachmentCreationPlan | null {
  const targets = targetClips(project, [{ clipId, glyphs }, ...also]);
  if (!targets) return null;
  const target = targets[0]!;
  const preset = SHAPE_PRESETS[choice];
  const { start, end } = attachedWindowOver(targets, time);
  const intro = defaultIntro('none');
  const formula = createEditorFormula(
    'shape',
    project.formulas,
    defaults.standardScale,
    {
      shape: preset.shape,
      ...(preset.style ? { style: { ...preset.style } } : {}),
      intro,
    },
    defaults.colors,
  );
  const clip = createClip(formula.id, target.trackId, start, end, {
    intro,
    outro: defaultOutro('none'),
    attach: createShapeAttach(clipId, glyphs, preset.buff, also),
  });
  return attachmentPlan(project, targets, formula, clip, preset.below ? 'below' : 'above');
}

/** Apply a creation plan in one edit. Choose the track from the actual draft: starting an
 * independent edit can cancel a gesture and restore tracks or gaps changed by that gesture. */
export function applyAttachmentCreation(draft: Project, plan: AttachmentCreationPlan): void {
  const { clip, targetTrackId, trackSide } = plan;
  const track =
    nearestFreeTrack(draft, targetTrackId, clip.start, clip.end, trackSide) ??
    newTrackBeside(draft, targetTrackId, trackSide);
  draft.formulas.push(plan.formula);
  draft.clips.push({ ...clip, trackId: track.id });
}
