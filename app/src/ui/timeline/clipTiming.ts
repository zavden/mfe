/* Copy the timing of one clip of the timeline and paste a part of it onto others (D150): when it
 * starts, when it ends, how long it is, and how long its intro and its outro are. One Copy takes
 * them all — a small clipboard of the app's own, as the one of a clip's properties
 * (`preview/propertyClipboard.ts`) —; a Paste writes one of them:
 *
 * - **start** and **end** move the clip, as long as it was, to start (or to end) when the copied
 *   one does — two clips aligned on their left or on their right edge;
 * - **duration** moves its end, the clip starting where it does;
 * - **intro time** and **outro time** make its intro (its outro) last as long as the copied one.
 *
 * A paste does what it says or nothing (Alex, D150): where a drag would stop short — another clip
 * of the track in the way, a locked track, an intro that would run into a Transform, the window
 * of a relation with a clip on a locked track, which stays where it plays — the clip stays as it
 * is and a notice says what is in the way. It cuts nothing either: a clip made shorter than its
 * blocks or its relations reach stays too. Pasted onto several clips, each one is planned where
 * the ones before it left the timeline, all in one undo step.
 *
 * Pure but the clipboard and the two commands at the end. */
import { produce } from 'immer';
import { create } from 'zustand';
import {
  AUDIO_PROJECT_DURATION_LIMIT,
  TIME_EPSILON,
  trimAudioClip,
  type Clip,
  type Project,
} from '../../model';
import { history, useProjectStore } from '../../store';
import { setPhaseDuration, type Phase } from '../animations/clipEdit';
import { announce } from '../announcer';
import { notify } from '../project/noticeStore';
import {
  lockedBreak,
  lockedWindowTimes,
  relationName,
  restoreLockedWindows,
} from '../relations/lockedRelations';
import { fitRelationWindows, fitWindow } from '../relations/relationOps';
import { round6 } from '../time';
import { constrainMove, endBounds, fitActions, trackGaps, trimEnd } from './clipOps';
import { phaseLimits } from './phaseDrag';
import {
  isAudioClip,
  timelineClip,
  timelineClipName,
  timelineClips,
  type TimelineClip,
} from './timelineClips';

/** What Copy takes of a clip. */
export interface ClipTiming {
  /** The name of what it was copied from. */
  from: string;
  start: number;
  end: number;
  /** How long its intro and its outro are; null when it has none (an audio clip has neither). */
  intro: number | null;
  outro: number | null;
}

/** What a Paste writes. */
export type TimingPart = 'start' | 'end' | 'duration' | 'intro' | 'outro';

/** The parts in menu order, with their entries and what a notice calls them. */
export const TIMING_PARTS: readonly { id: TimingPart; label: string; noun: string }[] = [
  { id: 'start', label: 'Paste start', noun: 'start' },
  { id: 'end', label: 'Paste end', noun: 'end' },
  { id: 'duration', label: 'Paste duration', noun: 'duration' },
  { id: 'intro', label: 'Paste intro time', noun: 'intro time' },
  { id: 'outro', label: 'Paste outro time', noun: 'outro time' },
];

/** "1.5 s". */
export const seconds = (t: number): string => `${+t.toFixed(3)} s`;

/** The timing of `clip`, to copy. */
export function timingOf(project: Project, clip: TimelineClip): ClipTiming {
  const audio = isAudioClip(clip);
  return {
    from: timelineClipName(project, clip),
    start: clip.start,
    end: clip.end,
    intro: audio || clip.intro.kind === 'none' ? null : clip.intro.duration,
    outro: audio || clip.outro.kind === 'none' ? null : clip.outro.duration,
  };
}

/** The value of one part of a copied timing; null when the copied clip had no such thing. */
export function timingValue(timing: ClipTiming, part: TimingPart): number | null {
  if (part === 'start') return timing.start;
  if (part === 'end') return timing.end;
  if (part === 'duration') return round6(timing.end - timing.start);
  return timing[part];
}

/** What a paste writes to a clip. */
export type TimingChange =
  | { kind: 'move'; start: number; end: number }
  | { kind: 'length'; end: number }
  | { kind: 'phase'; phase: Phase; duration: number };

/** What pasting does to one clip: a change — none when the clip has that already — or why it
 * stays (the words follow the clip's name in a notice). */
export type TimingPlan = { ok: true; change: TimingChange | null } | { ok: false; reason: string };

const same = (a: number, b: number) => Math.abs(a - b) <= TIME_EPSILON;
const refuse = (reason: string): TimingPlan => ({ ok: false, reason });

/** The clip of the track of `clip` that lies over [start, end), if any: what is in its way. */
function obstacle(project: Project, clip: TimelineClip, start: number, end: number) {
  return timelineClips(project).find(
    (other) =>
      other.id !== clip.id &&
      other.trackId === clip.trackId &&
      other.start < end - TIME_EPSILON &&
      other.end > start + TIME_EPSILON,
  );
}

const span = (clip: Pick<TimelineClip, 'start' | 'end'>) =>
  `${seconds(clip.start)}–${seconds(clip.end)}`;

/** Whether `changed`, the clip `clip` would be, moves or shortens the window of a relation of
 * `clip` — a window lies inside both of its clips, after the intro of the source and before the
 * outro of the target. */
function cutsRelation(project: Project, clip: Clip, changed: Clip): boolean {
  const byId = new Map(project.clips.map((c) => [c.id, c]));
  return project.relations.some((relation) => {
    if (relation.fromClipId !== clip.id && relation.toClipId !== clip.id) return false;
    const from = byId.get(relation.fromClipId);
    const to = byId.get(relation.toClipId);
    if (!from || !to) return false;
    const before = fitWindow(relation, from, to);
    const after = fitWindow(
      relation,
      from.id === clip.id ? changed : from,
      to.id === clip.id ? changed : to,
    );
    return JSON.stringify(before) !== JSON.stringify(after);
  });
}

/** The blocks of a clip as `fitActions` leaves them, to compare. */
function fittedActions(clip: Clip): string {
  const copy = structuredClone(clip);
  fitActions(copy);
  return JSON.stringify(copy.actions);
}

/** Why `changed`, the clip it would be, would no longer hold the window of a relation with a clip
 * on a locked track where it plays (`lockedBreak`), or null: such a window is not moved, so the
 * clip stays. */
function lockedCut(project: Project, changed: Clip): string | null {
  const locked = lockedBreak(project, changed);
  if (!locked) return null;
  return `the ${relationName(project, locked.relation)} would no longer fit in it, and track “${locked.track.name}” is locked`;
}

function planMove(project: Project, clip: TimelineClip, dt: number): TimingPlan {
  if (same(dt, 0)) return { ok: true, change: null };
  const start = round6(clip.start + dt);
  const end = round6(clip.end + dt);
  if (start < -TIME_EPSILON) return refuse(`it would start before 0 s (at ${seconds(start)})`);
  if (!isAudioClip(clip)) {
    const locked = lockedCut(project, { ...clip, start, end });
    if (locked) return refuse(locked);
  }
  const shift = constrainMove(project, [{ clip, trackId: clip.trackId }], dt);
  if (shift !== null && same(shift, dt)) return { ok: true, change: { kind: 'move', start, end } };
  const other = obstacle(project, clip, start, end);
  return refuse(
    other
      ? `“${timelineClipName(project, other)}” (${span(other)}) is in its way on the same track`
      : `there is no room for it at ${span({ start, end })}`,
  );
}

function planLength(project: Project, clip: TimelineClip, length: number): TimingPlan {
  const end = round6(clip.start + length);
  if (same(end, clip.end)) return { ok: true, change: null };
  if (isAudioClip(clip)) {
    const asset = project.audioAssets.find((item) => item.id === clip.assetId);
    if (!asset) return refuse('its sound is missing');
    const gap = trackGaps(project, clip.trackId, new Set([clip.id])).find(
      (item) => item.start <= clip.start + TIME_EPSILON && item.end >= clip.end - TIME_EPSILON,
    );
    const trimmed = trimAudioClip(clip, 'end', end, asset.duration, {
      minStart: gap?.start ?? 0,
      maxEnd: Math.min(gap?.end ?? Infinity, AUDIO_PROJECT_DURATION_LIMIT),
      sampleRate: asset.sampleRate,
    });
    // A sound ends on one of its samples: the nearest one is the duration asked for.
    const sample = asset.sampleRate > 0 ? 1 / asset.sampleRate : 0;
    if (Math.abs(trimmed.end - end) <= sample + TIME_EPSILON)
      return { ok: true, change: { kind: 'length', end: trimmed.end } };
    const other = obstacle(project, clip, clip.start, end);
    return refuse(
      other
        ? `“${timelineClipName(project, other)}” (${span(other)}) is in its way on the same track`
        : `its sound has ${seconds(Math.max(0, trimmed.end - clip.start))} left from where it starts`,
    );
  }
  const changed = structuredClone(clip);
  trimEnd(changed, end);
  const locked = lockedCut(project, changed);
  if (locked) return refuse(locked);
  const [lo, hi] = endBounds(project, clip);
  if (end < lo - TIME_EPSILON) {
    return refuse(
      clip.intro.duration + clip.outro.duration > 0
        ? `its intro and its outro take ${seconds(lo - clip.start)}`
        : `a clip lasts ${seconds(lo - clip.start)} at least`,
    );
  }
  if (end > hi + TIME_EPSILON) {
    const other = obstacle(project, clip, clip.start, end);
    return refuse(
      other
        ? `“${timelineClipName(project, other)}” (${span(other)}) is in its way on the same track`
        : `there is room for ${seconds(hi - clip.start)} there`,
    );
  }
  if (JSON.stringify(changed.actions) !== fittedActions(clip))
    return refuse(`its animation blocks would be cut: it would end at ${seconds(end)}`);
  if (cutsRelation(project, clip, changed))
    return refuse(`a relation of it would be cut: it would end at ${seconds(end)}`);
  return { ok: true, change: { kind: 'length', end } };
}

function planPhase(project: Project, clip: TimelineClip, phase: Phase, wanted: number): TimingPlan {
  if (isAudioClip(clip)) return refuse(`a sound has no ${phase}`);
  if (clip[phase].kind === 'none') return refuse(`it has no ${phase}`);
  if (same(clip[phase].duration, wanted)) return { ok: true, change: null };
  const longer = structuredClone(clip);
  longer[phase].duration = round6(wanted);
  const locked = lockedCut(project, longer);
  if (locked) return refuse(locked);
  const limits = phaseLimits(clip, phase);
  if (wanted > limits.max + TIME_EPSILON) {
    return refuse(
      `its ${phase} can last ${seconds(limits.max)} at most, beside its ${
        phase === 'intro' ? 'outro' : 'intro'
      } and its Transforms`,
    );
  }
  if (wanted < limits.min - TIME_EPSILON)
    return refuse(`an ${phase} lasts ${seconds(limits.min)} at least`);
  const changed = structuredClone(clip);
  setPhaseDuration(changed, phase, wanted);
  if (JSON.stringify(changed.actions) !== fittedActions(clip))
    return refuse(`its animation blocks would be cut by an ${phase} of ${seconds(wanted)}`);
  if (cutsRelation(project, clip, changed))
    return refuse(`a relation of it would be cut by an ${phase} of ${seconds(wanted)}`);
  return { ok: true, change: { kind: 'phase', phase, duration: round6(wanted) } };
}

/** What pasting `part` of `timing` does to `clip` in `project`. */
export function planTimingPaste(
  project: Project,
  clip: TimelineClip,
  timing: ClipTiming,
  part: TimingPart,
): TimingPlan {
  const track = project.tracks.find((item) => item.id === clip.trackId);
  if (!track) return refuse('it is on no track');
  if (track.locked) return refuse(`its track, “${track.name}”, is locked`);
  const value = timingValue(timing, part);
  if (value === null) return refuse(`“${timing.from}” has no ${part}`);
  if (part === 'start') return planMove(project, clip, value - clip.start);
  if (part === 'end') return planMove(project, clip, value - clip.end);
  if (part === 'duration') return planLength(project, clip, value);
  return planPhase(project, clip, part, value);
}

/** Write a planned change to the clip `clipId` of a draft. */
export function applyTimingChange(draft: Project, clipId: string, change: TimingChange): void {
  const clip = timelineClip(draft, clipId);
  if (!clip) return;
  if (change.kind === 'move') {
    const lockedTimes = lockedWindowTimes(draft);
    clip.start = change.start;
    clip.end = change.end;
    // A window moves with its target clip; one the source no longer covers is fitted. One a
    // locked track holds stays where it plays: the plan made sure it still fits.
    restoreLockedWindows(draft, lockedTimes);
    fitRelationWindows(draft, [clipId]);
  } else if (change.kind === 'length') {
    if (isAudioClip(clip)) clip.end = change.end;
    else trimEnd(clip, change.end);
  } else if (!isAudioClip(clip)) {
    setPhaseDuration(clip, change.phase, change.duration);
  }
}

/** What pasting `part` of `timing` onto `clipIds` does, one clip after the other in the order of
 * the timeline — each planned where the ones before it left it: the changes to write, in that
 * order, and the clips that stay, with why. */
export function planTimingPastes(
  project: Project,
  clipIds: readonly string[],
  timing: ClipTiming,
  part: TimingPart,
): {
  changes: { clipId: string; change: TimingChange }[];
  stayed: { name: string; reason: string }[];
} {
  const wanted = new Set(clipIds);
  const order = timelineClips(project)
    .filter((clip) => wanted.has(clip.id))
    .sort((a, b) => a.start - b.start)
    .map((clip) => clip.id);
  const changes: { clipId: string; change: TimingChange }[] = [];
  const stayed: { name: string; reason: string }[] = [];
  let working = project;
  for (const clipId of order) {
    const clip = timelineClip(working, clipId);
    if (!clip) continue;
    const plan = planTimingPaste(working, clip, timing, part);
    if (!plan.ok) stayed.push({ name: timelineClipName(working, clip), reason: plan.reason });
    else if (plan.change) {
      const { change } = plan;
      changes.push({ clipId, change });
      working = produce(working, (draft) => applyTimingChange(draft, clipId, change));
    }
  }
  return { changes, stayed };
}

// --- The clipboard and its two commands ------------------------------------------------------

interface TimingClipboardState {
  /** The last copied timing; null until one is copied. */
  timing: ClipTiming | null;
  set(timing: ClipTiming | null): void;
}

export const useTimingClipboard = create<TimingClipboardState>()((set) => ({
  timing: null,
  set: (timing) => set({ timing }),
}));

/** Copy the timing of the clip `clipId`. Whether it did. */
export function copyTiming(clipId: string): boolean {
  const { project } = useProjectStore.getState();
  const clip = timelineClip(project, clipId);
  if (!clip) return false;
  const timing = timingOf(project, clip);
  useTimingClipboard.getState().set(timing);
  announce(`Copied the timing of ${timing.from}: ${span(clip)}`);
  return true;
}

/** Paste `part` of the copied timing onto the clips `clipIds`, as one undo step; a notice names
 * the clips that stay and says why. How many changed. */
export function pasteTiming(clipIds: readonly string[], part: TimingPart): number {
  const { timing } = useTimingClipboard.getState();
  if (!timing) return 0;
  // Its menu can open during a drag: what is planned is the timeline without it.
  history.cancelForeignGesture();
  const { project, update } = useProjectStore.getState();
  const { changes, stayed } = planTimingPastes(project, clipIds, timing, part);
  if (changes.length > 0) {
    update((draft) => {
      for (const { clipId, change } of changes) applyTimingChange(draft, clipId, change);
    });
  }
  const noun = TIMING_PARTS.find((item) => item.id === part)!.noun;
  if (stayed.length > 0) {
    notify({
      kind: 'info',
      title:
        stayed.length === 1
          ? `“${stayed[0]!.name}” keeps its ${noun}`
          : `${stayed.length} clips keep their ${noun}`,
      message: `The ${noun} of “${timing.from}” was not pasted where it does not fit:`,
      details: stayed.map(({ name, reason }) => `“${name}”: ${reason}.`),
    });
  }
  if (changes.length > 0) {
    announce(
      `Pasted the ${noun} of ${timing.from} onto ${changes.length === 1 ? '1 clip' : `${changes.length} clips`}`,
    );
  }
  return changes.length;
}
