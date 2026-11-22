/* Pure operations on animation blocks that make a new block or a different one: the project
 * stores nothing here. Each returns what to put in the project, or why it cannot be done; the
 * store-facing wrappers are in blockActions.ts. */
import {
  actionConflicts,
  animatedWhole,
  createAppear,
  createDisappear,
  createEmphasis,
  createMorph,
  createPartTransform,
  createTween,
  defaultIntro,
  defaultOutro,
  groupMembers,
  isGroupable,
  newId,
  timingBaseline,
  type AppearAction,
  type AppearKind,
  type Clip,
  type ClipAction,
  type ClipId,
  type ClipState,
  type DisappearAction,
  type DisappearKind,
  type EmphasisAction,
  type EmphasisKind,
  EMPHASIS_DEFAULTS,
  type Project,
} from '../../model';
import { introWindow, outroWindow, TIME_EPSILON } from '../../model';
import { keyframeAt } from '../../scene';
import { endsForNewTween } from '../preview/lineDraw';
import { suggestMorphPairs } from '../morph/morphDraft';
import { round6, snapToFrame } from '../time';
import { MIN_ACTION_DURATION } from '../timeline/clipOps';
import { regionInside, regionLabel, type TimeRegion } from '../timeline/region';
import { animationName, clipSubject, wholeReason } from './blockKinds';
import {
  blockConflicts,
  conflictSentence,
  describeCause,
  findBlock,
  findBlockSlot,
  MIN_USABLE_DURATION,
  type Timing,
} from './blockRange';
import { complementGlyphs, parallelComplement, parallelWith } from './parallel';
import { isGlyphBlock, type GlyphBlock } from './splitBlock';

/** What the "Add animation" menus can create: a block of an appear / disappear animation, a
 * tween (a keyframe of the whole formula), a part transform, a morph within the formula or an
 * Emphasis effect on every glyph on screen. */
export type NewBlock =
  | { kind: 'appear'; anim: AppearKind }
  | { kind: 'disappear'; anim: DisappearKind }
  | { kind: 'tween' }
  /** A part transform; it names no glyph until the panel picks some. */
  | { kind: 'transform' }
  /** A morph within the formula; it has no pair until the pair editor adds some (unless
   * `NewBlockOptions.suggestPairs`). */
  | { kind: 'morph' }
  /** An Emphasis effect (D73) of every glyph on screen when it starts, at Manim's defaults. */
  | { kind: 'emphasis'; effect: EmphasisKind };

/** How `planNewBlock` fills the block in. */
export interface NewBlockOptions {
  /** A morph gets the pairs "Suggest" proposes where it lands (the "Suggest morph pairs"
   * preference); otherwise it has none. Other kinds ignore it. */
  suggestPairs?: boolean;
  /** The region marked on the timeline (D180): the block takes it whole — it starts where the
   * region starts and lasts until it ends —, wherever it was asked for, and is not made when it
   * does not fit there. */
  region?: TimeRegion;
}

/** The result of planning an edit: the block to put in the clip (with, at times, a note for the
 * user on how it was placed), or what stops it. `joins` names a block of the clip the new one
 * runs with, on other glyphs, as a piece of it: the two are grouped (`model/groups.ts`). */
export type Plan =
  | {
      ok: true;
      action: ClipAction;
      note?: { title: string; message: string };
      joins?: string;
    }
  | { ok: false; reason: string };

/** A copy of a block as a block on its own: the group is the original's, not the copy's. */
function ungrouped<A extends ClipAction>(action: A): A {
  const copy = structuredClone(action);
  if (isGroupable(copy)) delete copy.group;
  return copy;
}

/** "the Write block at 2.00 s", for notes. */
const describeOther = (clip: Clip, other: ClipAction) =>
  `the ${animationName(other)} block at ${(clip.start + other.start).toFixed(2)} s`;

/** A new block with its kind's defaults (start 0, every glyph for appear / disappear). */
function prototype(spec: NewBlock): ClipAction {
  if (spec.kind === 'appear') return createAppear(0, spec.anim, 'all');
  if (spec.kind === 'disappear') return createDisappear(0, spec.anim, 'all');
  if (spec.kind === 'transform') return createPartTransform(0, []);
  if (spec.kind === 'morph') return createMorph(0);
  if (spec.kind === 'emphasis') return createEmphasis(0, spec.effect, 'all');
  return createTween(0, 1, {});
}

/** Why a brace, a shape or a line takes no transform of a part and no morph: it is one piece
 * (D123). One that a saved project has keeps working; none can be made. */
const onePieceReason = (subject: 'brace' | 'shape' | 'line') =>
  `A ${subject} is one piece, without parts to animate apart: use Transform.`;

/** Why there is no room for a block of this kind in the clip, or after a block (a copy). A morph
 * without pairs (a new one, or a copy) animates no glyph yet, so only the clip's end can stop it. */
export function noRoomReason(
  action: ClipAction,
  where: 'in the clip' | 'after it' = 'in the clip',
): string {
  if (action.kind === 'morph') {
    if (action.pairs.length > 0) {
      return `There is no free time ${where} for this Morph block: wherever it could go, its glyphs are busy with other animations or its sources are not on screen.`;
    }
    return where === 'after it'
      ? `There is no room after it for a Morph block: the clip ends less than ${action.duration.toFixed(2)} s after it.`
      : `There is no room in the clip for a Morph block: the clip is shorter than ${MIN_USABLE_DURATION} s.`;
  }
  return action.kind === 'tween'
    ? `There is no free time ${where} for a keyframe: it needs time after the intro and before the outro, clear of relation windows and of other animations.`
    : `There is no free time ${where} for this animation: the intro, the outro, relation windows and other blocks already animate its glyphs.`;
}

/** The state of the clip at time `t`, as the target of a new keyframe (plain copies: `clip` may
 * be an immer draft). */
function keyframeTarget(clip: Clip, t: number): Partial<ClipState> {
  const state = keyframeAt(clip, t).state;
  return {
    position: [state.position[0], state.position[1]],
    scale: state.scale,
    rotation: state.rotation,
    opacity: state.opacity,
  };
}

/** Where a new block is asked for when it is wanted at `at`: there — except a new morph. It has no
 * pairs, so it fits anywhere; but inside the intro or the outro every glyph of the clip is busy
 * and nothing could be paired there (a dropped clip is 3 s long, with the intro and the outro
 * taking two of them). It is asked for between the two when they leave room. */
function wantedStart(clip: Clip, block: ClipAction, at: number): number {
  if (block.kind !== 'morph') return at;
  const free = { start: introWindow(clip).end, end: outroWindow(clip).start };
  if (free.end - free.start < block.duration - TIME_EPSILON) return at;
  return Math.min(Math.max(at, free.start), free.end - block.duration);
}

/** Where a menu asks for a new block: a time, and whether it is the playhead's — or the region
 * marked on the timeline, which the block takes whole (D180). */
export interface AddTime {
  /** Absolute seconds: with a region, where it starts. */
  time: number;
  atPlayhead: boolean;
  region?: TimeRegion;
  /** Whether the clip holds the region; a block cannot take one it does not. */
  regionInside?: boolean;
}

/** Where a menu of a clip adds an animation. In the `region` when one is marked on the timeline:
 * it wins over the playhead (D180). Else (D171) at the playhead when it lies inside the clip (its
 * ends included), as a new relation starts at the playhead (D166); else at the time that was
 * clicked — the clip's start from the keyboard —, on the frame grid of `fps`. */
export function clipMenuTime(
  clip: { start: number; end: number },
  playhead: number,
  clicked: number,
  fps: number,
  region: TimeRegion | null = null,
): AddTime {
  if (region) return regionAddTime(clip, region);
  const inside = playhead >= clip.start - TIME_EPSILON && playhead <= clip.end + TIME_EPSILON;
  return inside
    ? { time: playhead, atPlayhead: true }
    : { time: snapToFrame(clicked, fps), atPlayhead: false };
}

/** Where a menu of a clip adds an animation while `region` is marked: in it. */
export function regionAddTime(clip: { start: number; end: number }, region: TimeRegion): AddTime {
  return {
    time: region.start,
    atPlayhead: false,
    region,
    regionInside: regionInside(region, clip.start, clip.end),
  };
}

/** What the header of an "Add animation" menu says of where it adds, after the clip's name:
 * "playhead 2.00 s", or "5.20 s · the playhead is outside this clip"; with a region, "region
 * 1.00–3.00 s", or "region 1.00–3.00 s · not inside this clip". */
export function addTimeLabel({ time, atPlayhead, region, regionInside: inside }: AddTime): string {
  if (region) return `region ${regionLabel(region)}${inside ? '' : ' · not inside this clip'}`;
  return atPlayhead
    ? `playhead ${time.toFixed(2)} s`
    : `${time.toFixed(2)} s · the playhead is outside this clip`;
}

/** The timing of `block` in the `region`, which it takes whole, or why it cannot be there: the
 * clip does not hold the region, the region is too short for a block, or the block breaks a rule
 * there (`actionConflicts`, worded by `conflictSentence`). `block` must not be in the clip yet. */
function regionTiming(
  project: Project,
  clip: Clip,
  block: ClipAction,
  region: TimeRegion,
): Timing | { reason: string } {
  const label = regionLabel(region);
  if (!regionInside(region, clip.start, clip.end)) {
    return {
      reason: `The region (${label}) is not inside this clip (${clip.start.toFixed(2)}–${clip.end.toFixed(2)} s): nothing was added. Move the region, or remove it (Esc) to add at the playhead.`,
    };
  }
  const timing: Timing = {
    start: round6(region.start - clip.start),
    duration: round6(region.end - region.start),
  };
  if (timing.duration < MIN_ACTION_DURATION - TIME_EPSILON) {
    return {
      reason: `The region (${label}) is too short for an animation: nothing was added.`,
    };
  }
  const placed: ClipAction = { ...block, ...timing };
  const probe: Clip = { ...clip, actions: [...clip.actions, placed] };
  const conflict = actionConflicts(project, probe, placed.id, timingBaseline(project, clip.id));
  if (!conflict) return timing;
  return {
    reason: `It does not fit in the region (${label}): nothing was added. ${conflictSentence(project, probe, placed.id, conflict)}`,
  };
}

/** The notice for a new block asked for at the playhead (`playhead`, absolute seconds) that
 * starts somewhere else (`planNewBlock` moved it into the nearest free time): where it starts,
 * and why not there. Null when it starts at the playhead — a block only shortened there does.
 * `project` is the one the block was planned in, `made` the block planned for `spec`. */
export function playheadBlockNote(
  project: Project,
  clipId: ClipId,
  spec: NewBlock,
  made: ClipAction,
  playhead: number,
): { title: string; message: string } | null {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return null;
  const start = clip.start + made.start;
  if (Math.abs(start - playhead) <= TIME_EPSILON) return null;
  const why = notAtReason(project, clip, prototype(spec), playhead);
  return {
    title: 'No room at the playhead',
    message: `The ${animationName(made)} block starts at ${start.toFixed(2)} s, not at the playhead (${playhead.toFixed(2)} s): ${why}.`,
  };
}

/** Why a new `block` cannot start at absolute time `at` of the clip, as the end of a sentence:
 * what stops the shortest block `findBlockSlot` would place there. */
function notAtReason(project: Project, clip: Clip, block: ClipAction, at: number): string {
  if (at < clip.start - TIME_EPSILON || at > clip.end + TIME_EPSILON) {
    return 'the playhead is outside this clip';
  }
  if (Math.abs(wantedStart(clip, block, at) - at) > TIME_EPSILON) {
    return 'a new Morph block goes between the intro and the outro';
  }
  const probe: ClipAction = {
    ...block,
    start: round6(at - clip.start),
    duration: round6(Math.min(block.duration, MIN_USABLE_DURATION)),
  };
  const conflict = actionConflicts(
    project,
    { ...clip, actions: [...clip.actions, probe] },
    probe.id,
  );
  switch (conflict?.kind) {
    case 'bounds':
      return block.kind === 'tween'
        ? 'a keyframe stays between the end of the intro and the start of the outro'
        : 'the clip ends too soon after it';
    case 'overlap':
    case 'half-drawn':
      return `its glyphs are busy with ${describeCause(clip, conflict.cause)} then`;
    default:
      return 'its glyphs are busy there or the clip leaves no time';
  }
}

/** The project with `action` added to the clip, where `blockActions` puts a new block: after
 * the clip's other actions, then sorted by start (a stable sort keeps it after those that start
 * with it). */
function withBlock(project: Project, clipId: ClipId, action: ClipAction): Project {
  return {
    ...project,
    clips: project.clips.map((c) =>
      c.id === clipId
        ? { ...c, actions: [...c.actions, action].sort((a, b) => a.start - b.start) }
        : c,
    ),
  };
}

/** A new block that starts at absolute time `at`, with its kind's default duration, moved or
 * shortened into the nearest slot where it fits (a keyframe's target is the clip's state where
 * it starts) — or, with a `region` (D180), the block that takes the region whole, and no block
 * when it does not fit there. With `suggestPairs`, a morph takes the pairs Suggest proposes for the project with
 * it placed, so what is offered follows the window it got (without pairs it fits anywhere in its
 * clip, so it is placed first and paired then). An Appear or Disappear that lands alongside
 * other blocks stores the glyphs left for it there (`parallelComplement`) as an explicit list,
 * not `'all'`: `'all'` would take in the other block's glyphs as soon as either moved, and pull
 * every glyph out of the intro. When nothing is left for it there, it keeps `'all'` and the
 * plan's note says so. A block of an arrow keeps `'all'` there too: a block takes an arrow whole
 * (`animatedWhole`, audit A5-07). */
export function planNewBlock(
  project: Project,
  clipId: ClipId,
  spec: NewBlock,
  at: number,
  options: NewBlockOptions = {},
): Plan {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return { ok: false, reason: 'That clip no longer exists.' };
  const subject = clipSubject(project, clip);
  if (subject !== 'formula' && (spec.kind === 'transform' || spec.kind === 'morph')) {
    return { ok: false, reason: onePieceReason(subject) };
  }
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  const block = prototype(spec);
  const { region } = options;
  /** Where `candidate` goes: the region, or nowhere; without one, the slot nearest to `wanted`. */
  const place = (candidate: ClipAction, wanted: number): Timing | { reason: string } =>
    region
      ? regionTiming(project, clip, candidate, region)
      : (findBlockSlot(project, clip, { block: candidate, at: wanted, shorten: true }) ?? {
          reason: noRoomReason(candidate),
        });
  const slot = place(block, wantedStart(clip, block, at));
  if ('reason' in slot) return { ok: false, reason: slot.reason };
  const action: ClipAction = { ...block, ...slot };
  let note: { title: string; message: string } | undefined;
  if (action.kind === 'tween') {
    action.to = keyframeTarget(clip, clip.start + slot.start);
    // A Transform of a line carries its two ends (D144): it starts with the ones the line has
    // then, which place it — so it says an appearance only, and changes nothing until one moves.
    if (formula?.kind === 'line') {
      action.ends = endsForNewTween(project, clip, formula, clip.start + slot.start);
      action.to = { opacity: action.to.opacity };
    }
  }
  if (action.kind === 'morph' && options.suggestPairs) {
    const pairs = suggestMorphPairs(withBlock(project, clipId, action), clipId, action.id, []);
    // Suggestions can change another clip's attachment measurement. The empty prototype had
    // no lifetime effect; now place the completed Morph through the same constraints as any block.
    if (pairs.length > 0) {
      const paired: ClipAction = { ...action, pairs };
      const pairedSlot = place(paired, clip.start + action.start);
      if (!('reason' in pairedSlot)) {
        action.pairs = pairs;
        action.start = pairedSlot.start;
        action.duration = pairedSlot.duration;
      } else if (!region) {
        return { ok: false, reason: noRoomReason(paired) };
      } else {
        // In a region the block is where it was asked for: with the suggested pairs it would not
        // fit there, so it comes without them, and says so.
        note = {
          title: 'Suggested pairs left out',
          message: `The pairs Suggest proposes for this Morph block do not fit in the region (${regionLabel(region)}): the block was added without pairs. Open Edit pairs… to link them, or move the block.`,
        };
      }
    }
  }
  // A block of an arrow takes all of it, alongside other blocks too (`animatedWhole`).
  const whole = formula !== undefined && animatedWhole(formula);
  if (
    (action.kind === 'appear' || action.kind === 'disappear') &&
    action.glyphs === 'all' &&
    !whole
  ) {
    const placed = withBlock(project, clipId, action);
    const placedClip = placed.clips.find((c) => c.id === clipId)!;
    const others = parallelWith(placedClip, action);
    if (others.length > 0) {
      const left = parallelComplement(project, clip, action, others);
      if (left.length > 0) {
        action.glyphs = left;
      } else {
        const list = others.map((o) => describeOther(clip, o)).join(' and ');
        return {
          ok: true,
          action,
          note: {
            title: 'Nothing left to animate alongside',
            message: `The new ${animationName(action)} block runs with ${list}, which already animate${others.length === 1 ? 's' : ''} every glyph it could: choose its glyphs in the Animations panel, or move it.`,
          },
        };
      }
    }
  }
  return note ? { ok: true, action, note } : { ok: true, action };
}

/** The same block as a keyframe of the whole formula or as a transform of a part (its glyphs to
 * be picked), keeping its id, time and easing — moved or shortened if the other kind's bounds
 * need it (a keyframe stays clear of the intro, the outro and relation windows). */
export function planKindChange(
  project: Project,
  clipId: ClipId,
  actionId: string,
  kind: 'tween' | 'transform',
): Plan {
  const found = findBlock(project, clipId, actionId);
  if (!found) return { ok: false, reason: 'That block no longer exists.' };
  const { clip, action } = found;
  if (action.kind === kind) return { ok: true, action };
  if (action.kind !== 'tween' && action.kind !== 'transform') {
    return {
      ok: false,
      reason: 'Only a Transform block can change between the whole formula and a part.',
    };
  }
  const subject = clipSubject(project, clip);
  if (subject !== 'formula' && kind === 'transform') {
    return { ok: false, reason: onePieceReason(subject) };
  }
  const base = {
    id: action.id,
    start: action.start,
    duration: action.duration,
    easing: action.easing,
  };
  const block: ClipAction =
    kind === 'tween'
      ? { ...createTween(0, 1, {}), ...base }
      : { ...createPartTransform(0, []), ...base };
  // The block's own time is free for it: plan against the clip without it.
  const without: Clip = { ...clip, actions: clip.actions.filter((a) => a.id !== actionId) };
  const slot = findBlockSlot(project, without, {
    block,
    at: clip.start + action.start,
    shorten: true,
  });
  if (!slot) return { ok: false, reason: noRoomReason(block) };
  const converted: ClipAction = { ...block, ...slot };
  if (converted.kind === 'tween') converted.to = keyframeTarget(without, clip.start + slot.start);
  return { ok: true, action: converted };
}

/** A copy of a block for the glyphs it does not animate (`complementGlyphs`), at the block's own
 * time so that both run in parallel — "Duplicate for the other glyphs"; moved to the nearest fit,
 * with a note, when something else animates those glyphs then. Refused when nothing is left for
 * a copy to animate, or for a block that names no glyph list. */
export function planParallelCopy(project: Project, clipId: ClipId, actionId: string): Plan {
  const found = findBlock(project, clipId, actionId);
  if (!found) return { ok: false, reason: 'That animation no longer exists.' };
  const { clip, action } = found;
  if (!isGlyphBlock(action)) {
    return {
      ok: false,
      reason:
        'Only a block that names glyphs (Appear, Disappear, a part Transform or an Emphasis) can be duplicated for the other glyphs.',
    };
  }
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  if (formula && animatedWhole(formula)) return { ok: false, reason: wholeReason(formula) };
  const glyphs = complementGlyphs(project, clip, action);
  if (glyphs.length === 0) {
    const why =
      action.kind === 'appear'
        ? 'is already on screen'
        : action.kind === 'disappear'
          ? 'is off screen'
          : 'is named by it';
    return {
      ok: false,
      reason: `Every other glyph of the formula ${why} when the block starts: there is nothing left for a copy to animate.`,
    };
  }
  const copy: GlyphBlock = { ...ungrouped(action), id: newId('a'), glyphs } as GlyphBlock;
  const at = round6(clip.start + action.start);
  const slot = findBlockSlot(project, clip, { block: copy, at });
  if (!slot) return { ok: false, reason: noRoomReason(copy) };
  const placed: ClipAction = { ...copy, ...slot };
  // Alongside the block, it is a piece of it, as after a split: the two are one group.
  if (Math.abs(slot.start - action.start) < TIME_EPSILON) {
    return { ok: true, action: placed, joins: action.id };
  }
  const there: Clip = {
    ...clip,
    actions: [...clip.actions, { ...copy, start: action.start, duration: action.duration }],
  };
  const why = blockConflicts(project, there, copy.id);
  return {
    ok: true,
    action: placed,
    note: {
      title: 'The copy could not run alongside',
      message: `${why ? `${why} ` : ''}The copy for the other glyphs went to ${(clip.start + slot.start).toFixed(2)} s instead.`,
    },
  };
}

/** A copy of a block in the nearest free slot after it. A morph's copy keeps its settings but not
 * its pairs: a glyph arrives through one pair only, so the copy's targets must be chosen anew. */
export function planCopy(project: Project, clipId: ClipId, actionId: string): Plan {
  const found = findBlock(project, clipId, actionId);
  if (!found) return { ok: false, reason: 'That animation no longer exists.' };
  const { clip, action } = found;
  const copy: ClipAction = { ...ungrouped(action), id: newId('a') };
  if (copy.kind === 'morph') copy.pairs = [];
  const slot = findBlockSlot(project, clip, {
    block: copy,
    at: round6(clip.start + action.start + action.duration),
    after: true,
  });
  if (!slot) return { ok: false, reason: noRoomReason(copy, 'after it') };
  return { ok: true, action: { ...copy, ...slot } };
}

/** The result of planning a copy of a group: its blocks, or what stops it. */
export type GroupPlan = { ok: true; actions: ClipAction[] } | { ok: false; reason: string };

/** Copies of the blocks grouped with `actionId` (itself among them), a group of their own, in the
 * nearest free time after the group where all of them fit. */
export function planGroupCopy(project: Project, clipId: ClipId, actionId: string): GroupPlan {
  const clip = project.clips.find((c) => c.id === clipId);
  const members = clip ? groupMembers(clip, actionId) : [];
  if (!clip || members.length === 0) {
    return { ok: false, reason: 'That animation no longer exists.' };
  }
  const group = newId('g');
  const copies = members.map((member) => {
    const copy: ClipAction = { ...ungrouped(member), id: newId('a') };
    if (isGroupable(copy) && members.length > 1) copy.group = group;
    return copy;
  });
  const first = members[0]!;
  const slot = findBlockSlot(project, clip, {
    block: copies[0]!,
    mates: copies.slice(1),
    at: round6(clip.start + first.start + first.duration),
    after: true,
  });
  if (!slot) {
    return {
      ok: false,
      reason:
        'There is no free time after it for a copy of the group: the outro, relation windows and other blocks already animate its glyphs.',
    };
  }
  return { ok: true, actions: copies.map((copy) => ({ ...copy, ...slot })) };
}

/** The block as another Emphasis effect: it keeps its time and its glyphs and takes the new
 * effect's defaults for everything else, its easing among them (an Indicate pulses). */
export function convertEmphasis(action: EmphasisAction, effect: EmphasisKind): EmphasisAction {
  if (action.effect === effect) return action;
  return { ...action, ...EMPHASIS_DEFAULTS[effect], effect, duration: action.duration };
}

/** The block as another animation. Within a family only the animation changes; from appear to
 * disappear (or back) the block keeps its start, duration and glyphs. Either way the easing is
 * the new animation's default, the lag ratio goes back to Manim's, and shift and scale are kept
 * only between FadeIn and FadeOut. */
export function convertBlock(
  action: AppearAction | DisappearAction,
  kind: 'appear' | 'disappear',
  anim: AppearKind | DisappearKind,
): AppearAction | DisappearAction {
  if (action.kind === kind && action.anim === anim) return action;
  const fresh =
    kind === 'appear' ? defaultIntro(anim as AppearKind) : defaultOutro(anim as DisappearKind);
  const fades = (a: string) => a === 'fade_in' || a === 'fade_out';
  const keepFade = fades(anim) && fades(action.anim);
  return {
    id: action.id,
    kind,
    anim,
    start: action.start,
    duration: action.duration,
    easing: fresh.easing,
    glyphs: Array.isArray(action.glyphs) ? [...action.glyphs] : action.glyphs,
    lagRatio: null,
    shift: keepFade ? [action.shift[0], action.shift[1]] : [0, 0],
    scale: keepFade ? action.scale : 1,
    // Another animation at the same time: it stays in its group.
    ...(action.group === undefined ? {} : { group: action.group }),
  } as AppearAction | DisappearAction;
}
