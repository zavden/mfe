/* The timing of an animation block, for the editor: the timeline gestures, the Timing fields of
 * the Animations panel and the menus that add or duplicate a block all go through here, so they
 * agree. The rules are the model's (`model/conflicts.ts`: `actionConflicts` says why a block
 * cannot be where it is, as a typed reason); this module words them (`blockConflicts`) and finds
 * where an edit lands:
 *   - `blockLimits` is the free gap around the block's current window, from the busy spans of
 *     the glyphs it animates now (`rivalSpans`) and the moves of the camera: the block cannot be
 *     dragged past another animation of them, nor past a camera move;
 *   - `clampTiming` clamps a wanted position into the limits (and a copying morph before the
 *     transfer that consumes one of its sources) and then, if the move changes which glyphs the
 *     block animates so that it would collide, stops where it still did not;
 *   - `findBlockSlot` finds where a new (or copied) block fits nearest to a time.
 *
 * A block in a group (`model/groups.ts`) has the timing of its group: the limits are those all its
 * members share, and an edit lands where every one of them may be. */
import {
  actionConflicts,
  actionWindow,
  blockBounds,
  cameraClashSentence,
  cameraGap,
  cameraMoveEdges,
  clipLifetimeOf,
  groupMembers,
  isMorphKey,
  latestCopyStart,
  measuresOnly,
  newTimingError,
  rivalSpans,
  TIME_EPSILON,
  timingBaseline,
  timingMeasurementTimes,
  type ActionConflict,
  type ActionId,
  type Cause,
  type Clip,
  type ClipAction,
  type ClipId,
  type FormulaSnapshot,
  type Project,
  type Window,
} from '../../model';
import { round6 } from '../time';
import { MIN_ACTION_DURATION } from '../timeline/clipOps';
import { animationName } from './blockKinds';

/** A block's position in its clip: seconds from the clip start. */
export interface Timing {
  start: number;
  duration: number;
}

/** Which part of a block an edit moves: the whole block, its start edge or its end edge. */
export type TimingEdit = 'move' | 'start' | 'end';

/** A block of this length or longer is worth placing; a shorter one is not offered as the
 * shortened version of a new block. */
export const MIN_USABLE_DURATION = 0.25;

/** Why the block, where it is in `clip`, breaks a rule (`actionConflicts`), as a sentence naming
 * the glyphs, or null when it breaks none. The clip is passed explicitly so that a candidate
 * position can be tried on a copy. */
export function blockConflicts(project: Project, clip: Clip, actionId: ActionId): string | null {
  const conflict = actionConflicts(project, clip, actionId);
  return conflict ? conflictSentence(project, clip, actionId, conflict) : null;
}

/** The sentence for a conflict of the block `actionId` of `clip`. */
export function conflictSentence(
  project: Project,
  clip: Clip,
  actionId: ActionId,
  conflict: ActionConflict,
): string {
  const snapshot = project.formulas.find((f) => f.id === clip.formulaId)?.snapshot ?? null;
  const names = (glyphs: readonly number[]) => glyphNames(glyphs, snapshot);
  const are = (glyphs: readonly number[]) => (glyphs.length === 1 ? 'is' : 'are');
  switch (conflict.kind) {
    case 'bounds':
      return clip.actions.find((a) => a.id === actionId)?.kind === 'tween'
        ? 'A keyframe stays between the end of the intro and the start of the outro.'
        : 'A block stays inside its clip.';
    case 'consumed':
      return `It would bring back ${names(conflict.glyphs)}, which a relation or a Morph block turned into other glyphs.`;
    case 'absent-source':
      return `Source ${names(conflict.glyphs)} ${are(conflict.glyphs)} not fully on screen when the Morph block starts.`;
    case 'arriving-source':
      return `Source ${names(conflict.glyphs)} ${are(conflict.glyphs)} still arriving through another transfer when the Morph block starts.`;
    case 'target-on-screen':
      return `Target ${names(conflict.glyphs)} ${are(conflict.glyphs)} on screen already when the Morph block starts: ${conflict.glyphs.length === 1 ? 'it arrives' : 'they arrive'} through the block.`;
    case 'half-drawn':
      return `${capitalise(describeCause(clip, conflict.cause))} is still animating ${names(conflict.glyphs)} when the block starts: it would measure ${conflict.glyphs.length === 1 ? 'it' : 'them'} half drawn.`;
    case 'overlap':
      return `${capitalise(describeCause(clip, conflict.cause))} animates ${names(conflict.glyphs)} at the same time.`;
    case 'issue':
      // A camera move in the way: when it runs, not the rule's whole sentence.
      return cameraClashSentence(project, conflict.issue) ?? conflict.issue.message;
  }
}

/** "the intro", "the Write block at 2.00 s", "another Morph block", … */
export function describeCause(clip: Clip, cause: Cause): string {
  switch (cause.kind) {
    case 'intro':
      return 'the intro';
    case 'outro':
    case 'clip-end':
      return 'the outro';
    case 'transfer':
      return isMorphKey(cause.key) ? 'another Morph block' : 'a relation window';
    case 'action': {
      const action = clip.actions.find((a) => a.id === cause.actionId);
      if (!action) return 'another animation';
      const at = `at ${(clip.start + action.start).toFixed(2)} s`;
      return action.kind === 'tween'
        ? `the keyframe ${at}`
        : `the ${animationName(action)} block ${at}`;
    }
  }
}

/** "glyph 2 “b”", "glyphs 2 “b”, 4 “c”" (the index alone when the formula has no label for it). */
function glyphNames(glyphs: readonly number[], snapshot: FormulaSnapshot | null): string {
  const name = (glyph: number) => {
    const label = snapshot?.glyphs[glyph]?.label;
    return label && label !== '?' ? `${glyph} “${label}”` : String(glyph);
  };
  return `glyph${glyphs.length === 1 ? '' : 's'} ${glyphs.map(name).join(', ')}`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The blocks whose timing an edit of the block `actionId` changes: itself and the other members
 * of its group, which start and end with it. */
export function movedWith(clip: Clip, actionId: ActionId): ActionId[] {
  return groupMembers(clip, actionId).map((a) => a.id);
}

/** `clip` with the timing of these actions replaced. */
export function withTiming(clip: Clip, ids: readonly ActionId[], timing: Timing): Clip {
  return {
    ...clip,
    actions: clip.actions.map((a) => (ids.includes(a.id) ? { ...a, ...timing } : a)),
  };
}

/** The free gap around a block's current window (absolute seconds): its bounds, narrowed by the
 * nearest animation of the same glyphs before and after it, and by the nearest move of the camera
 * (`cameraGap`: nothing else animates while it moves, D190). Spans that already overlap the block
 * are ignored, so that a block in conflict can be dragged out of it. For a block in a group, the
 * gap every member is free in. Null when there is no such block. */
export function blockLimits(project: Project, clip: Clip, actionId: ActionId): Window | null {
  const members = groupMembers(clip, actionId);
  if (members.length === 0) return null;
  const life = clipLifetimeOf(project, clip);
  let lo = -Infinity;
  let hi = Infinity;
  for (const action of members) {
    const bounds = blockBounds(clip, action);
    const own = actionWindow(clip, action);
    lo = Math.max(lo, bounds.start);
    hi = Math.min(hi, bounds.end);
    for (const { span } of rivalSpans(project, clip, life, action)) {
      if (span.end <= own.start + TIME_EPSILON) lo = Math.max(lo, span.end);
      else if (span.start >= own.end - TIME_EPSILON) hi = Math.min(hi, span.start);
    }
    const camera = cameraGap(project, own);
    lo = Math.max(lo, camera.start);
    hi = Math.min(hi, camera.end);
  }
  return { start: lo, end: hi };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Candidate edges include measurement instants even when no animation starts there, and the
 * edges of the camera's moves, during which no block runs (the locked region, D190). */
function boundaryTimes(project: Project, clip: Clip): Set<number> {
  const times = timingMeasurementTimes(project, [clip.id]);
  for (const time of cameraMoveEdges(project)) times.add(time);
  for (const spans of clipLifetimeOf(project, clip).busy.values()) {
    for (const span of spans) times.add(span.start).add(span.end);
  }
  return times;
}

/** Two timings that differ by float noise only. */
export const sameTiming = (a: Timing, b: Timing) =>
  Math.abs(a.start - b.start) < 1e-9 && Math.abs(a.duration - b.duration) < 1e-9;

/** Where an edit of a block lands. `wanted` gives the edges the user asked for, relative to the
 * clip (`move` uses its start and keeps the duration; `start` and `end` move that edge only).
 * The result is inside the limits, at least MIN_ACTION_DURATION long, and, when the block did not
 * conflict before, still without a conflict: if the glyphs it animates change on the way, it stops
 * at the last position that was fine. A block in conflict moves freely, except where it would give
 * the project a validation error it does not have. `limits` may be passed to reuse them across a
 * gesture. The timing of a block in a group is its group's: the answer is where all its members
 * may be, and `setBlockTiming` gives it to all of them. */
export function clampTiming(
  project: Project,
  clip: Clip,
  actionId: ActionId,
  wanted: { start: number; end: number },
  edit: TimingEdit,
  limits: Window | null = blockLimits(project, clip, actionId),
): Timing {
  const action = clip.actions.find((a) => a.id === actionId);
  if (!action) return { start: wanted.start, duration: wanted.end - wanted.start };
  const orig: Timing = { start: action.start, duration: action.duration };
  if (!limits) return orig;
  const lo = limits.start - clip.start;
  const hi = limits.end - clip.start;
  const end = orig.start + orig.duration;
  let target: Timing;
  if (edit === 'move') {
    if (hi - lo < orig.duration - TIME_EPSILON) return orig;
    target = { start: clamp(wanted.start, lo, hi - orig.duration), duration: orig.duration };
  } else if (edit === 'start') {
    const start = clamp(wanted.start, lo, end - MIN_ACTION_DURATION);
    target = { start, duration: end - start };
  } else {
    const stop = clamp(wanted.end, orig.start + MIN_ACTION_DURATION, hi);
    target = { start: orig.start, duration: stop - orig.start };
  }
  // A copying morph stays before the transfer that consumes one of its sources: exactly there.
  const consumption = latestCopyStart(project, clip, action);
  const latest = consumption === null ? null : round6(consumption);
  if (latest !== null && edit !== 'end' && target.start > latest + TIME_EPSILON) {
    target = { start: latest, duration: edit === 'move' ? target.duration : end - latest };
  }
  target = { start: round6(target.start), duration: round6(target.duration) };
  if (sameTiming(target, orig)) return orig;

  // The gap was worked out for the glyphs the block animates now. Moving it can change them (an
  // appear brings what is off screen *then*), so check, and keep to what still works: a block
  // without a conflict stays without one; a block in conflict may be dragged out of it, or deeper,
  // but never where it gives the project a validation error it does not have.
  const before = timingBaseline(project, clip.id);
  const moved = movedWith(clip, actionId);
  const fine = (c: Clip) => moved.every((id) => actionConflicts(project, c, id, before) === null);
  const ok = fine(clip)
    ? fine
    : (c: Clip) => newTimingError(project, c, clipLifetimeOf(project, c), before) === null;
  if (ok(withTiming(clip, moved, target))) return target;
  // Check the same rounded values that will be stored, including during the search.
  const at = (f: number): Timing => ({
    start: round6(orig.start + (target.start - orig.start) * f),
    duration: round6(orig.duration + (target.duration - orig.duration) * f),
  });
  let good = 0;
  let bad = 1;
  for (let i = 0; i < 12; i++) {
    const f = (good + bad) / 2;
    if (ok(withTiming(clip, moved, at(f)))) good = f;
    else bad = f;
  }
  // Land exactly on the measurement or animation edge the search found. Include float/grid
  // tolerance on both sides of the bracket: a rounded probe may already touch the boundary.
  const fractions = new Set<number>();
  for (const time of boundaryTimes(project, clip)) {
    for (const [from, to] of [
      [orig.start, target.start],
      [orig.start + orig.duration, target.start + target.duration],
    ] as const) {
      const delta = to - from;
      if (Math.abs(delta) < TIME_EPSILON) continue;
      const f = (time - clip.start - from) / delta;
      const tolerance = (2 * TIME_EPSILON) / Math.abs(delta);
      if (f >= good - tolerance && f <= bad + tolerance && f >= 0 && f <= 1) fractions.add(f);
    }
  }
  for (const f of [...fractions].sort((a, b) => b - a)) {
    if (ok(withTiming(clip, moved, at(f)))) return at(f);
  }
  return at(good);
}

export interface SlotRequest {
  /** The block to place (a tween, appear, disappear, transform or morph): its kind, glyphs (or
   * pairs) and duration count; its start does not. It must not be in the clip yet. */
  block: ClipAction;
  /** The time it should start at, absolute seconds. */
  at: number;
  /** Only slots that start at `at` or later (a copy goes after the original). */
  after?: boolean;
  /** Accept a shorter block than `block.duration` (never below MIN_USABLE_DURATION). */
  shorten?: boolean;
  /** Blocks placed with it, at its time (the other members of a group being copied): the slot is
   * one where each of them fits too. They must not be in the clip yet either. */
  mates?: readonly ClipAction[];
}

/** The nearest place in the clip where the block fits without a conflict, or null. In order of
 * preference: at `at`; at `at`, shortened; the nearest start that fits; the nearest start that fits
 * shortened. */
export function findBlockSlot(project: Project, clip: Clip, request: SlotRequest): Timing | null {
  const { block, at } = request;
  const bounds = blockBounds(clip, block);
  const duration = block.duration;
  const before = timingBaseline(project, clip.id);
  const fits = (start: number, length: number): boolean => {
    start = round6(start);
    length = round6(length);
    if (start < bounds.start - TIME_EPSILON || start + length > bounds.end + TIME_EPSILON) {
      return false;
    }
    if (request.after && start < at - TIME_EPSILON) return false;
    const placed = [block, ...(request.mates ?? [])].map((b) => ({
      ...b,
      start: round6(start - clip.start),
      duration: length,
    }));
    const probe: Clip = { ...clip, actions: [...clip.actions, ...placed] };
    return placed.every((b) => actionConflicts(project, probe, b.id, before) === null);
  };
  const result = (start: number, length: number): Timing => ({
    start: round6(start - clip.start),
    duration: round6(length),
  });

  if (fits(at, duration)) return result(at, duration);

  const boundaries = boundaryTimes(project, clip);

  const starts = (length: number): number[] => {
    const found = new Set<number>([
      round6(clamp(at, bounds.start, bounds.end - length)),
      round6(bounds.start),
      round6(bounds.end - length),
    ]);
    for (const time of boundaries) {
      found.add(round6(time));
      if (!measuresOnly(block)) found.add(round6(time - length));
    }
    return [...found].sort((a, b) => Math.abs(a - at) - Math.abs(b - at) || a - b);
  };

  const shrink = (start: number): Timing | null => {
    if (fits(start, duration)) return result(start, duration);
    const least = Math.min(duration, MIN_USABLE_DURATION);
    if (!fits(start, least)) return null;
    let good = least;
    let bad = duration; // known not to fit, or `fits(start, duration)` would have been found
    for (let i = 0; i < 10; i++) {
      const length = (good + bad) / 2;
      if (fits(start, length)) good = length;
      else bad = length;
    }
    for (const time of [...boundaries].sort((a, b) => b - a)) {
      const length = round6(time - start);
      if (
        length < least ||
        length > duration ||
        length < good - TIME_EPSILON ||
        length > bad + TIME_EPSILON
      )
        continue;
      if (fits(start, length)) return result(start, length);
    }
    return result(start, good);
  };

  if (request.shorten && !request.after) {
    const here = shrink(at);
    if (here) return here;
  }
  for (const start of starts(duration)) {
    if (fits(start, duration)) return result(start, duration);
  }
  if (request.shorten) {
    for (const start of starts(Math.min(duration, MIN_USABLE_DURATION))) {
      const slot = shrink(start);
      if (slot) return slot;
    }
  }
  return null;
}

/** The clip and the block with these ids, for callers that hold only ids. */
export function findBlock(
  project: Project,
  clipId: ClipId,
  actionId: ActionId,
): { clip: Clip; action: ClipAction } | null {
  const clip = project.clips.find((c) => c.id === clipId);
  const action = clip?.actions.find((a) => a.id === actionId);
  return clip && action ? { clip, action } : null;
}
