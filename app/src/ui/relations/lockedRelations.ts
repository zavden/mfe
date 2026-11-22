/* The relations a locked track holds (D34, F12): a relation with either of its clips on a locked
 * track cannot be created, edited or deleted (`relationLock`). An edit of its other clip — the one
 * that is not locked — must leave what plays on the locked track as it is: the window of the
 * relation in scene time, inside both clips (after the intro of the source and before its end; from
 * the start of the target to the start of its outro).
 *
 * So every change of that clip stops where the window would no longer fit in it: the range
 * functions take `lockedLimits` (a trim, a drag, Alt + arrows, the fields of the clip, the length
 * of its intro and of its outro), and a change done whole or not at all asks `lockedBreak` (a
 * paste of a timing, an intro given from the clip's menu). When the clip is the target and its
 * start moves, the offset — counted from that start — follows, so that the window keeps its time
 * (`lockedWindowTimes`, then `restoreLockedWindows`): that is bookkeeping, not an edit of the
 * relation. `fitRelationWindows` never fits one. Deleting the clip, or splitting it so that the
 * relation would go to its second half, is refused (`lockedReason` says why).
 *
 * Pure. */
import {
  relationWindow,
  TIME_EPSILON,
  type Clip,
  type Project,
  type Relation,
  type RelationId,
  type Track,
  type Window,
} from '../../model';
import { round6 } from '../time';
import { relationLock } from './relationOps';

/** A relation of a clip whose other clip is on a locked track. */
export interface LockedRelation {
  relation: Relation;
  /** Its window in scene time. */
  window: Window;
  /** Whether the clip is the source of the relation (else its target). */
  source: boolean;
  /** The clip on the locked track, and that track. */
  other: Clip;
  track: Track;
}

/** The relations of `clip` whose other clip is on a locked track, with their windows in scene
 * time, in the project's order. */
export function lockedRelationsOf(project: Project, clip: Pick<Clip, 'id'>): LockedRelation[] {
  const out: LockedRelation[] = [];
  for (const relation of project.relations) {
    const source = relation.fromClipId === clip.id;
    if ((!source && relation.toClipId !== clip.id) || relation.fromClipId === relation.toClipId) {
      continue;
    }
    const otherId = source ? relation.toClipId : relation.fromClipId;
    const other = project.clips.find((c) => c.id === otherId);
    const track = other && project.tracks.find((t) => t.id === other.trackId);
    const to = project.clips.find((c) => c.id === relation.toClipId);
    if (!other || !track?.locked || !to) continue;
    out.push({ relation, window: relationWindow(relation, to), source, other, track });
  }
  return out;
}

/** How far an edit of `clip` may go and leave the windows of its locked relations where they are,
 * inside it: the latest it may start and the earliest it may end (each as it is, with the intro
 * and the outro it has), and how long its intro and its outro may be. Infinite when nothing holds
 * it. */
export interface LockedLimits {
  latestStart: number;
  earliestEnd: number;
  longestIntro: number;
  longestOutro: number;
}

export function lockedLimits(project: Project, clip: Clip): LockedLimits {
  const limits: LockedLimits = {
    latestStart: Infinity,
    earliestEnd: -Infinity,
    longestIntro: Infinity,
    longestOutro: Infinity,
  };
  for (const { window, source } of lockedRelationsOf(project, clip)) {
    if (source) {
      // A source holds its window after its intro and before its end.
      limits.latestStart = Math.min(limits.latestStart, window.start - clip.intro.duration);
      limits.earliestEnd = Math.max(limits.earliestEnd, window.end);
      limits.longestIntro = Math.min(limits.longestIntro, window.start - clip.start);
    } else {
      // A target, from its start to the start of its outro.
      limits.latestStart = Math.min(limits.latestStart, window.start);
      limits.earliestEnd = Math.max(limits.earliestEnd, window.end + clip.outro.duration);
      limits.longestOutro = Math.min(limits.longestOutro, clip.end - window.end);
    }
  }
  return limits;
}

/** How long the intro (or the outro) of `clip` may be beside its locked relations: what
 * `lockedLimits` says, or the length it has already when that is more (a window that does not fit
 * now does not keep it from staying as it is). Infinite when nothing holds it. */
export function lockedPhaseRoom(project: Project, clip: Clip, phase: 'intro' | 'outro'): number {
  const limits = lockedLimits(project, clip);
  const room = phase === 'intro' ? limits.longestIntro : limits.longestOutro;
  return Math.max(room, clip[phase].duration);
}

/** How far the window of `locked` lies outside `clip`: 0 when it fits in it. */
function overflow(locked: LockedRelation, clip: Clip): number {
  const { start, end } = locked.window;
  const [from, to] = locked.source
    ? [clip.start + clip.intro.duration, clip.end]
    : [clip.start, clip.end - clip.outro.duration];
  return Math.max(0, from - start) + Math.max(0, end - to);
}

/** The first locked relation of `clip` (as it is in `project`) whose window `changed` — that clip
 * after an edit — would no longer hold where it is, or null. A window that does not fit already
 * counts only when the edit leaves it further out. */
export function lockedBreak(project: Project, changed: Clip): LockedRelation | null {
  const clip = project.clips.find((c) => c.id === changed.id);
  if (!clip) return null;
  for (const locked of lockedRelationsOf(project, clip)) {
    if (overflow(locked, changed) > overflow(locked, clip) + TIME_EPSILON) return locked;
  }
  return null;
}

/** Where a locked relation plays: the start of its window in scene time, and how long it is. */
export interface LockedTime {
  start: number;
  duration: number;
}

/** Where the relations a locked track holds play (`relationLock`): what an edit puts back with
 * `restoreLockedWindows`. */
export function lockedWindowTimes(project: Project): Map<RelationId, LockedTime> {
  const out = new Map<RelationId, LockedTime>();
  for (const relation of project.relations) {
    if (relationLock(project, relation) === null) continue;
    const to = project.clips.find((c) => c.id === relation.toClipId);
    if (to)
      out.set(relation.id, { start: to.start + relation.offset, duration: relation.duration });
  }
  return out;
}

/** Put the windows of `times` back where they played (mutates a draft): the offset counted from
 * where the target starts now, the duration as it was. A window that is where it was stays exactly
 * as it is. */
export function restoreLockedWindows(
  draft: Project,
  times: ReadonlyMap<RelationId, LockedTime>,
): void {
  for (const relation of draft.relations) {
    const time = times.get(relation.id);
    const to = time && draft.clips.find((c) => c.id === relation.toClipId);
    if (!time || !to) continue;
    if (Math.abs(to.start + relation.offset - time.start) > 1e-9) {
      relation.offset = round6(time.start - to.start);
    }
    if (Math.abs(relation.duration - time.duration) > 1e-9) relation.duration = time.duration;
  }
}

/** The name of the object of the clip `clipId`. */
const nameOf = (project: Project, clipId: string) => {
  const clip = project.clips.find((c) => c.id === clipId);
  return project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? '?';
};

/** "relation from “a” to “b” (2.00–3.00 s)": a relation by its clips and where it plays, as the
 * reasons of a split name one. */
export function relationName(project: Project, relation: Relation): string {
  const to = project.clips.find((c) => c.id === relation.toClipId);
  const window = to ? relationWindow(relation, to) : null;
  const at = window ? ` (${window.start.toFixed(2)}–${window.end.toFixed(2)} s)` : '';
  return `relation from “${nameOf(project, relation.fromClipId)}” to “${nameOf(project, relation.toClipId)}”${at}`;
}

/** The locked track of a clip of `relation` — of its source first, as `relationLock` says it —, or
 * null. */
export function lockedTrackOf(project: Project, relation: Relation): Track | null {
  for (const clipId of [relation.fromClipId, relation.toClipId]) {
    const clip = project.clips.find((c) => c.id === clipId);
    const track = clip && project.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return track;
  }
  return null;
}

/** Why an edit is not made: `what` — what it would do to a relation a locked track holds —, then
 * `relationLock`'s sentence, which names the track and says what to do: "The relation from “a” to
 * “b” (2.00–3.00 s) would go with it. Track “Locked” is locked: unlock it on the timeline to
 * create, edit or delete relations of its clips." */
export function lockedReason(project: Project, relation: Relation, what: string): string {
  const lock = relationLock(project, relation);
  return lock ? `${what} ${lock}` : what;
}

/** Why the intro (or the outro) of the clip of the object `name` cannot be given an animation at
 * all: the window of `relation`, which a locked track holds, leaves it no room. */
export function lockedPhaseReason(
  project: Project,
  relation: Relation,
  phase: 'intro' | 'outro',
  name: string,
): string {
  return lockedReason(
    project,
    relation,
    `The ${relationName(project, relation)} leaves the ${phase} of “${name}” no room.`,
  );
}

/** The relation a locked track holds that leaves the intro (or the outro) of `clip` no room for an
 * animation even `shortest` long, or null. */
export function lockedPhaseBlocker(
  project: Project,
  clip: Clip,
  phase: 'intro' | 'outro',
  shortest: number,
): LockedRelation | null {
  if (clip[phase].duration >= shortest) return null;
  return lockedBreak(project, { ...clip, [phase]: { ...clip[phase], duration: shortest } });
}
