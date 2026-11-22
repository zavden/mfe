/* Pure editing operations on clips and tracks, shared by the timeline interactions and the clip
 * properties panel. Everything here either reads a project or mutates a draft inside a store
 * `update` recipe; nothing touches stores or the DOM.
 *
 * Rules enforced (docs/ARCHITECTURE.md §5): clips on a track never overlap; a clip is at least
 * as long as its intro plus outro; tween actions stay between the intro end and the outro start
 * (they are clamped or dropped when an edit makes them not fit); a clip moved or trimmed keeps
 * the windows of its relations with clips on locked tracks inside it (`lockedRelations.ts`). */
import {
  actionWindow,
  attachTargets,
  AUDIO_PROJECT_DURATION_LIMIT,
  createClip,
  createTrack,
  kindOf,
  newClipState,
  newId,
  freeTweenEnd,
  placementUses,
  relationWindow,
  spansClips,
  TIME_EPSILON,
  usesAnyOf,
  type Clip,
  type ClipId,
  type FitTween,
  type FreedEndPoint,
  type Project,
  type Relation,
  type Track,
  type TrackId,
  type ClipAction,
  type FormulaId,
  type IntroSpec,
  type OutroSpec,
  type Window,
} from '../../model';
import { lockedLimits } from '../relations/lockedRelations';
import { relationLock } from '../relations/relationOps';
import { round6 } from '../time';
import { timelineClips, isAudioClip, type TimelineClip } from './timelineClips';
import { DROPPED_CLIP_LENGTH } from './layout';
import { regionLabel, type TimeRegion } from './region';

/** A clip cannot be shorter than this (seconds). */
export const MIN_CLIP_LENGTH = 0.1;
/** A tween that would be shorter than this after clamping is dropped. */
export const MIN_ACTION_DURATION = 0.05;

export interface Gap {
  start: number;
  /** Infinity for the open space after the last clip. */
  end: number;
}

/** Free time ranges of a track, ignoring the clips in `ignore`. Touching clips leave no gap. */
export function trackGaps(
  project: Project,
  trackId: TrackId,
  ignore: ReadonlySet<ClipId> = new Set(),
): Gap[] {
  const clips = timelineClips(project)
    .filter((c) => c.trackId === trackId && !ignore.has(c.id))
    .sort((a, b) => a.start - b.start);
  const gaps: Gap[] = [];
  let cursor = 0;
  for (const clip of clips) {
    if (clip.start > cursor + TIME_EPSILON) gaps.push({ start: cursor, end: clip.start });
    cursor = Math.max(cursor, clip.end);
  }
  gaps.push({ start: cursor, end: Infinity });
  return gaps;
}

/** The start nearest to `desired` where a clip of `length` fits on the track, always found
 * (the space after the last clip is unbounded). */
export function findFreeSlot(
  project: Project,
  trackId: TrackId,
  desired: number,
  length: number,
  ignore: ReadonlySet<ClipId> = new Set(),
): number {
  let best = Infinity;
  let bestStart = 0;
  for (const gap of trackGaps(project, trackId, ignore)) {
    if (gap.end - gap.start < length - TIME_EPSILON) continue;
    const start = Math.min(Math.max(desired, gap.start), gap.end - length);
    const distance = Math.abs(start - desired);
    if (distance < best) {
      best = distance;
      bestStart = start;
    }
  }
  return round6(bestStart);
}

/** Whether a new clip can take `region` whole on the track: no clip of the track is in it. */
export function regionFreeOn(project: Project, trackId: TrackId, region: TimeRegion): boolean {
  const start = findFreeSlot(project, trackId, region.start, region.end - region.start);
  return Math.abs(start - region.start) <= TIME_EPSILON;
}

/** Why no clip can take `region` at all, or null: it is shorter than a clip may be. */
export function regionClipBlocker(region: TimeRegion): string | null {
  return region.end - region.start < MIN_CLIP_LENGTH - TIME_EPSILON
    ? `The region (${regionLabel(region)}) is too short for a clip: nothing was added.`
    : null;
}

export interface Move {
  clip: TimelineClip;
  /** Track the clip would end up on. */
  trackId: TrackId;
}

type Interval = [number, number];

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi >= lo - TIME_EPSILON) out.push([lo, Math.max(lo, hi)]);
    }
  }
  return out;
}

/** How far `clip` can move, as a shift, and keep the windows of its locked relations inside it
 * (`lockedLimits`): an interval that holds 0, so that a window that does not fit already does
 * not move the clip, nor let it move further away. */
export function lockedShift(project: Project, clip: Clip): [number, number] {
  const { latestStart, earliestEnd } = lockedLimits(project, clip);
  return [Math.min(earliestEnd - clip.end, 0), Math.max(latestStart - clip.start, 0)];
}

/** The shift closest to `dt` that keeps every moved clip clear of the others on its target
 * track, at time ≥ 0 and around the windows of its relations with clips on locked tracks
 * (`lockedShift`). The moved clips are ignored as obstacles (they leave their places).
 * Null only if the constraints of the moved clips contradict each other; the free space after
 * the last clip of a track is unbounded, so a lone clip can always be placed. */
export function constrainMove(project: Project, moves: readonly Move[], dt: number): number | null {
  const moving = new Set(moves.map((m) => m.clip.id));
  let allowed: Interval[] = [[-Infinity, Infinity]];
  for (const { clip, trackId } of moves) {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (!track || track.locked || track.kind !== (isAudioClip(clip) ? 'audio' : 'visual'))
      return null;
    const own: Interval[] = [];
    for (const gap of trackGaps(project, trackId, moving)) {
      const lo = Math.max(gap.start - clip.start, -clip.start);
      const hi =
        Math.min(gap.end, isAudioClip(clip) ? AUDIO_PROJECT_DURATION_LIMIT : Infinity) - clip.end;
      if (hi >= lo - TIME_EPSILON) own.push([lo, Math.max(lo, hi)]);
    }
    allowed = intersect(allowed, own);
    if (!isAudioClip(clip)) allowed = intersect(allowed, [lockedShift(project, clip)]);
    if (allowed.length === 0) return null;
  }
  let best: number | null = null;
  for (const [lo, hi] of allowed) {
    const v = Math.min(Math.max(dt, lo), hi);
    if (best === null || Math.abs(v - dt) < Math.abs(best - dt)) best = v;
  }
  return best === null ? null : round6(best);
}

/** Bounds for trimming the start of `clip`: [earliest, latest] new start. A start trimmed later
 * stops where the window of a relation with a clip on a locked track would no longer fit
 * (`lockedLimits`; one that does not fit already keeps the start from going further). */
export function startBounds(project: Project, clip: Clip): [number, number] {
  const gap = trackGaps(project, clip.trackId, new Set([clip.id])).find(
    (g) => g.start <= clip.start + TIME_EPSILON && g.end >= clip.end - TIME_EPSILON,
  );
  const minLength = Math.max(MIN_CLIP_LENGTH, clip.intro.duration + clip.outro.duration);
  const { latestStart } = lockedLimits(project, clip);
  return [gap?.start ?? 0, Math.min(clip.end - minLength, Math.max(latestStart, clip.start))];
}

/** Bounds for trimming the end of `clip`: [earliest, latest] new end. An end trimmed earlier stops
 * where the window of a relation with a clip on a locked track would no longer fit, as a start
 * does (`startBounds`). */
export function endBounds(project: Project, clip: Clip): [number, number] {
  const gap = trackGaps(project, clip.trackId, new Set([clip.id])).find(
    (g) => g.start <= clip.start + TIME_EPSILON && g.end >= clip.end - TIME_EPSILON,
  );
  const minLength = Math.max(MIN_CLIP_LENGTH, clip.intro.duration + clip.outro.duration);
  const { earliestEnd } = lockedLimits(project, clip);
  return [Math.max(clip.start + minLength, Math.min(earliestEnd, clip.end)), gap?.end ?? Infinity];
}

/** Move the start edge of `clip` (mutates). Tween actions keep their absolute times. */
export function trimStart(clip: Clip, newStart: number): void {
  const delta = newStart - clip.start;
  for (const action of clip.actions) action.start = round6(action.start - delta);
  clip.start = round6(newStart);
  fitActions(clip);
}

/** Move the end edge of `clip` (mutates). */
export function trimEnd(clip: Clip, newEnd: number): void {
  clip.end = round6(newEnd);
  fitActions(clip);
}

/** Clamp actions into the clip — tweens into [intro end, outro start], which they cannot share
 * with the intro or the outro; drop those left shorter than MIN_ACTION_DURATION; keep them sorted
 * by start (mutates). */
export function fitActions(clip: Clip): void {
  const kept: ClipAction[] = [];
  for (const action of clip.actions) {
    const tween = action.kind === 'tween';
    const lo = tween ? clip.start + clip.intro.duration : clip.start;
    const hi = tween ? clip.end - clip.outro.duration : clip.end;
    const a = clip.start + action.start;
    const start = Math.max(a, lo);
    const end = Math.min(a + action.duration, hi);
    if (end - start < MIN_ACTION_DURATION - TIME_EPSILON) continue;
    action.start = round6(start - clip.start);
    action.duration = round6(end - start);
    kept.push(action);
  }
  clip.actions = kept.sort((a, b) => a.start - b.start);
}

/** Free windows inside the clip where a new tween can run: between the intro end and the outro
 * start, minus existing actions and the windows of relations touching the clip. */
export function freeActionWindows(project: Project, clip: Clip): Window[] {
  const busy: Window[] = clip.actions.map((a) => actionWindow(clip, a));
  const byId = new Map(project.clips.map((c) => [c.id, c]));
  for (const relation of project.relations) {
    if (relation.fromClipId !== clip.id && relation.toClipId !== clip.id) continue;
    const to = byId.get(relation.toClipId);
    if (to) busy.push(relationWindow(relation, to));
  }
  busy.sort((a, b) => a.start - b.start);
  const out: Window[] = [];
  let cursor = clip.start + clip.intro.duration;
  const limit = clip.end - clip.outro.duration;
  for (const w of busy) {
    if (w.start > cursor + TIME_EPSILON) out.push({ start: cursor, end: Math.min(w.start, limit) });
    cursor = Math.max(cursor, w.end);
  }
  if (limit > cursor + TIME_EPSILON) out.push({ start: cursor, end: limit });
  return out.filter((w) => w.end - w.start > TIME_EPSILON);
}

/** The free window containing absolute time `t`, clipped to start at `t`, or null. */
export function actionSlotAt(project: Project, clip: Clip, t: number): Window | null {
  for (const w of freeActionWindows(project, clip)) {
    if (t >= w.start - TIME_EPSILON && t < w.end - MIN_ACTION_DURATION + TIME_EPSILON) {
      return { start: Math.max(t, w.start), end: w.end };
    }
  }
  return null;
}

/** The clips among `ids` that may be edited: those not on a locked track (project order). */
export function editableClips(project: Project, ids: readonly ClipId[]): Clip[] {
  const unlocked = new Set(project.tracks.filter((t) => !t.locked).map((t) => t.id));
  return project.clips.filter((c) => ids.includes(c.id) && unlocked.has(c.trackId));
}

/** The clips attached to any of `ids` (`clip.attach`), and to those, and so on: what goes with
 * them when they are deleted. A brace or a shape over glyphs of several clips (`also`) is not one
 * of them: it stays, freed (`freedClips`). In the project's order, without the clips of `ids`
 * themselves. */
export function attachedClips(project: Pick<Project, 'clips'>, ids: ReadonlySet<ClipId>): Clip[] {
  const doomed = new Set(ids);
  const out: Clip[] = [];
  for (let grew = true; grew;) {
    grew = false;
    for (const clip of project.clips) {
      const attach = clip.attach;
      // What hangs on one clip — a line with an end or both on it, too — goes with that clip.
      if (
        doomed.has(clip.id) ||
        !attach ||
        spansClips(attach) ||
        !attachTargets(attach).some((target) => doomed.has(target.clipId))
      )
        continue;
      doomed.add(clip.id);
      out.push(clip);
      grew = true;
    }
  }
  return out;
}

/** The relation with a clip on a locked track (`relationLock`) that deleting the clip `id` would
 * delete — one of its own, or of an object attached to it, which goes with it —, or null. Such a
 * clip stays (D34): a relation of a locked clip is not deleted. */
export function lockedRelationGoing(project: Project, id: ClipId): Relation | null {
  const doomed = new Set([id, ...attachedClips(project, new Set([id])).map((c) => c.id)]);
  return (
    project.relations.find(
      (relation) =>
        (doomed.has(relation.fromClipId) || doomed.has(relation.toClipId)) &&
        relationLock(project, relation) !== null,
    ) ?? null
  );
}

/** The relations a locked track holds (`relationLock`) that deleting the clips `ids` — with the
 * objects attached to them — would delete through a clip that is on no locked track: the free clip
 * of such a relation. Deleting the track or the formula of that clip stops at them (D34, D187), as
 * deleting the clip does; a clip on a locked track goes with its own track or formula as it always
 * did. In the project's order. */
export function heldRelations(project: Project, ids: ReadonlySet<ClipId>): Relation[] {
  const locked = new Set(project.tracks.filter((track) => track.locked).map((track) => track.id));
  const free = new Set(
    [...project.clips.filter((clip) => ids.has(clip.id)), ...attachedClips(project, ids)]
      .filter((clip) => !locked.has(clip.trackId))
      .map((clip) => clip.id),
  );
  return project.relations.filter(
    (relation) =>
      (free.has(relation.fromClipId) || free.has(relation.toClipId)) &&
      relationLock(project, relation) !== null,
  );
}

/** The braces, shapes and lines over glyphs of several clips that lose one of those clips when
 * `ids` are deleted, with what goes with them: they are not deleted but freed, where they are
 * (D117).
 * In the project's order; never a clip that is deleted itself. */
export function freedClips(project: Pick<Project, 'clips'>, ids: ReadonlySet<ClipId>): Clip[] {
  const doomed = new Set(ids);
  for (const clip of attachedClips(project, ids)) doomed.add(clip.id);
  return project.clips.filter(
    (clip) =>
      !doomed.has(clip.id) &&
      clip.attach !== null &&
      spansClips(clip.attach) &&
      attachTargets(clip.attach).some((target) => doomed.has(target.clipId)),
  );
}

/** The tweens of `clip` that carry its shape to a clip of `doomed` (`TweenFit`): what deleting
 * those clips removes from it. */
export function fitsLosingTarget(
  clip: Pick<Clip, 'start' | 'attach' | 'actions'>,
  doomed: ReadonlySet<ClipId>,
): FitTween[] {
  return placementUses(clip).flatMap((use) =>
    use.owner.kind === 'fit' && usesAnyOf(use, doomed) ? [use.owner.tween] : [],
  );
}

/** Remove clips, the objects attached to them (and to those: deleting a target deletes what hangs
 * on it) and every relation of any of them (mutates a draft). A tween of another clip that
 * carried its shape to one of them goes with it (D123). A brace, a shape or a line over glyphs of
 * several clips stays when one of them goes, without its attachment: a free object where it was
 * (`freedClips`). A brace, a shape or a line object lives with its clips — it is reached from them
 * alone, the Creator does not list it (`KINDS`) —: one left without any goes too. An end a tween
 * carried a line to on one of them is left free where the line was drawn, at the point `freed`
 * works out from the project before the deletion (`freedEndPoint`; without it, the point it was
 * drawn at). */
export function deleteClips(draft: Project, ids: ReadonlySet<ClipId>, freed?: FreedEndPoint): void {
  draft.audioClips = draft.audioClips.filter((clip) => !ids.has(clip.id));
  const doomed = new Set(ids);
  for (const clip of attachedClips(draft, ids)) doomed.add(clip.id);
  for (const clip of freedClips(draft, ids)) clip.attach = null;
  draft.clips = draft.clips.filter((c) => !doomed.has(c.id));
  // A tween that carried a shape to a clip that goes has nowhere to carry it: it goes too. One
  // that carried an end of a line onto it keeps that end where it was drawn, free (D144).
  for (const clip of draft.clips) {
    const lost = new Set(fitsLosingTarget(clip, doomed).map((tween) => tween.id));
    if (lost.size > 0) clip.actions = clip.actions.filter((action) => !lost.has(action.id));
    for (const use of placementUses(clip)) {
      if (use.owner.kind !== 'ends') continue;
      const { tween } = use.owner;
      for (const { target, path } of use.spots) {
        if (!doomed.has(target.clipId)) continue;
        const side = path.at(-1) as 'start' | 'end';
        freeTweenEnd(tween, side, freed?.(clip.id, tween.id, side) ?? null);
      }
    }
  }
  draft.relations = draft.relations.filter(
    (r) => !doomed.has(r.fromClipId) && !doomed.has(r.toClipId),
  );
  const used = new Set(draft.clips.map((c) => c.formulaId));
  draft.formulas = draft.formulas.filter((f) => kindOf(f).listed || used.has(f.id));
}

/** Which way from a track: above it (drawn in front) or below it (behind). */
export type TrackSide = 'above' | 'below';

/** The unlocked track nearest to `trackId` on `side` of it (above: in front) with room for a clip
 * over [start, end); null when no track of that side has room. Only that side is searched (D137):
 * what goes in front of its target — a brace, a box, an arrow — never lands behind it, and a
 * highlight never in front; the caller opens a track on that side instead. The track itself is
 * never it: the clip would meet what it hangs on. */
export function nearestFreeTrack(
  project: Project,
  trackId: TrackId,
  start: number,
  end: number,
  side: TrackSide = 'above',
): Track | null {
  const index = project.tracks.findIndex((t) => t.id === trackId);
  if (index < 0) return null;
  const fits = (track: Track) =>
    track.kind === 'visual' &&
    !track.locked &&
    trackGaps(project, track.id).some(
      (g) => g.start <= start + TIME_EPSILON && g.end >= end - TIME_EPSILON,
    );
  const step = side === 'above' ? -1 : 1;
  for (let i = index + step; i >= 0 && i < project.tracks.length; i += step) {
    const track = project.tracks[i]!;
    if (fits(track)) return track;
  }
  return null;
}

/** Copies of `clips` (fresh ids), each placed in the nearest free space after the original on its
 * own track. A copy keeps its attachment; when its target is copied too, it hangs on the copy —
 * each target on its own, for a brace or a shape over glyphs of several clips: on the copies of
 * those copied along, on the others as they are. Pure: returns the copies without adding them. */
export function duplicateClips(project: Project, clips: readonly Clip[]): Clip[] {
  const out: Clip[] = [];
  const scratch: Project = { ...project, clips: [...project.clips] };
  const copyOf = new Map<ClipId, ClipId>();
  for (const clip of clips) {
    const length = clip.end - clip.start;
    const start = findFreeSlot(scratch, clip.trackId, clip.end, length);
    const copy: Clip = {
      ...structuredClone(clip),
      id: newId('c'),
      start,
      end: round6(start + length),
    };
    copy.actions = copy.actions.map((a) => ({ ...a, id: newId('a') }));
    copyOf.set(clip.id, copy.id);
    out.push(copy);
    scratch.clips.push(copy);
  }
  // What places a copy — its attachment, the fits of its tweens — goes to the copies of its
  // targets, where those were copied too.
  for (const copy of out) {
    for (const use of placementUses(copy)) {
      for (const { target } of use.spots) {
        target.clipId = copyOf.get(target.clipId) ?? target.clipId;
      }
    }
  }
  return out;
}

// --- Tracks --------------------------------------------------------------------

export function newTrackName(tracks: readonly Track[]): string {
  const names = new Set(tracks.map((t) => t.name));
  let n = tracks.length + 1;
  while (names.has(`Track ${n}`)) n++;
  return `Track ${n}`;
}

/** The name of a new audio track: «Audio N», N the first number no track's name has — the
 * toolbar's Audio button and a sound added to the timeline that needs a track of its own. */
export function newAudioTrackName(tracks: readonly Track[]): string {
  const names = new Set(tracks.map((t) => t.name));
  let n = 1;
  while (names.has(`Audio ${n}`)) n++;
  return `Audio ${n}`;
}

/** Remove a track with its clips and their relations (mutates a draft; `freed` as for
 * `deleteClips`). A lock does not keep a track from being deleted, visual or audio: it keeps its
 * clips from being edited. */
export function deleteTrack(draft: Project, trackId: TrackId, freed?: FreedEndPoint): void {
  const doomed = new Set(draft.clips.filter((c) => c.trackId === trackId).map((c) => c.id));
  deleteClips(draft, doomed, freed);
  draft.audioClips = draft.audioClips.filter((c) => c.trackId !== trackId);
  draft.tracks = draft.tracks.filter((t) => t.id !== trackId);
}

/** Swap a track with its neighbour above (delta −1) or below (+1) (mutates a draft). */
export function moveTrack(draft: Project, trackId: TrackId, delta: -1 | 1): void {
  const i = draft.tracks.findIndex((t) => t.id === trackId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= draft.tracks.length) return;
  const [track] = draft.tracks.splice(i, 1);
  draft.tracks.splice(j, 0, track!);
}

// --- Snapping ------------------------------------------------------------------

export interface SnapOptions {
  /** Points that attract (playhead, clip edges). */
  points: readonly number[];
  /** Grid step in seconds, 0 for no grid. */
  grid: number;
  /** Capture distance in seconds. */
  threshold: number;
}

/** Offset to add to the edges (which move together) so that one of them lands on a snap point
 * within the threshold, else so that the first lands on the grid; 0 when snapping is not
 * possible. Points win over the grid. */
export function snapEdges(
  edges: readonly number[],
  { points, grid, threshold }: SnapOptions,
): number {
  let best: number | null = null;
  for (const edge of edges) {
    for (const p of points) {
      const d = p - edge;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  if (best !== null) return best;
  const first = edges[0];
  if (grid > 0 && first !== undefined) return Math.round(first / grid) * grid - first;
  return 0;
}

/** `snapEdges` for a single time. */
export function snapOffset(t: number, options: SnapOptions): number {
  return snapEdges([t], options);
}

/** Put a clip of `formulaId` on the timeline without dragging (keyboard, screen readers): on the
 * first unlocked track from the top, at the free time nearest `time`, DROPPED_CLIP_LENGTH long
 * like a dropped one, and where its object keeps its new clips (`newClipState`); on a new track
 * on top when every track is locked. Mutates the draft and returns the new clip. */
export function addClipAt(
  draft: Project,
  formulaId: FormulaId,
  time: number,
  animations: { intro: IntroSpec; outro: OutroSpec },
): Clip {
  let track = draft.tracks.find((t) => t.kind === 'visual' && !t.locked);
  if (!track) {
    track = createTrack(newTrackName(draft.tracks));
    draft.tracks.unshift(track);
  }
  const start = findFreeSlot(draft, track.id, Math.max(0, time), DROPPED_CLIP_LENGTH);
  const formula = draft.formulas.find((f) => f.id === formulaId);
  const clip = createClip(formulaId, track.id, start, round6(start + DROPPED_CLIP_LENGTH), {
    ...animations,
    initial: newClipState(formula ?? {}),
  });
  draft.clips.push(clip);
  return clip;
}

/** `addClipAt` while a region is marked on the timeline (D180): the clip takes the region whole,
 * on the first unlocked track from the top that has it free — on a new track on top when none
 * has. Mutates the draft and returns the new clip. */
export function addClipIn(
  draft: Project,
  formulaId: FormulaId,
  region: TimeRegion,
  animations: { intro: IntroSpec; outro: OutroSpec },
): Clip {
  let track = draft.tracks.find(
    (t) => t.kind === 'visual' && !t.locked && regionFreeOn(draft, t.id, region),
  );
  if (!track) {
    track = createTrack(newTrackName(draft.tracks));
    draft.tracks.unshift(track);
  }
  const formula = draft.formulas.find((f) => f.id === formulaId);
  const clip = createClip(formulaId, track.id, region.start, region.end, {
    ...animations,
    initial: newClipState(formula ?? {}),
  });
  draft.clips.push(clip);
  return clip;
}
