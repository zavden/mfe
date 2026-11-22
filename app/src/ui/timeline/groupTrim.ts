/* Trimming several selected clips together (D168). Dragging an edge of one of the selected clips
 * moves that edge of every selected clip — of the scene and of the sound alike — by the same
 * time, each keeping its place: the group goes as far as all of them allow, and when one of them
 * meets something (its neighbour on the track, its shortest length, the ends of its recording,
 * the window of a relation with a clip on a locked track) they all stop. One clip alone is the
 * group of one, with the limits it always had.
 *
 * Pure: who takes part, how far the edge can go, and the edit on a draft of the project. The
 * gesture (`useTimelineGestures.ts`) reads the pointer and snaps the edge it holds. */
import {
  AUDIO_PROJECT_DURATION_LIMIT,
  trimAudioClip,
  type AudioAsset,
  type AudioClip,
  type Clip,
  type Project,
} from '../../model';
import { lockedWindowTimes, restoreLockedWindows } from '../relations/lockedRelations';
import { fitRelationWindows, keepWindowsInPlace, restoreWindows } from '../relations/relationOps';
import { round6 } from '../time';
import { audioEditable } from './audioCommands';
import { endBounds, startBounds, trackGaps, trimEnd, trimStart } from './clipOps';

export type TrimEdge = 'start' | 'end';

/** A clip that takes part in a trim, as it was when the drag began. */
export type TrimMember =
  { kind: 'clip'; clip: Clip } | { kind: 'audio'; clip: AudioClip; asset: AudioAsset };

/** The clip `id` as a member, or null when it cannot be trimmed: it is gone, its track is
 * locked, or it is a sound whose recording the project does not have. */
function memberOf(project: Project, id: string): TrimMember | null {
  const clip = project.clips.find((c) => c.id === id);
  if (clip) {
    const locked = project.tracks.find((t) => t.id === clip.trackId)?.locked ?? false;
    return locked ? null : { kind: 'clip', clip };
  }
  const audio = project.audioClips.find((c) => c.id === id);
  if (!audio || !audioEditable(project, audio)) return null;
  const asset = project.audioAssets.find((a) => a.id === audio.assetId);
  return asset ? { kind: 'audio', clip: audio, asset } : null;
}

/** Who a trim started on clip `pressed` moves: with it among several selected clips, every
 * selected clip that can be trimmed, in the order of the selection; otherwise itself alone.
 * None when the pressed clip cannot be trimmed. */
export function trimMembers(
  project: Project,
  selection: readonly string[],
  pressed: string,
): TrimMember[] {
  if (!memberOf(project, pressed)) return [];
  const ids = selection.length > 1 && selection.includes(pressed) ? selection : [pressed];
  return ids.flatMap((id) => memberOf(project, id) ?? []);
}

/** What keeps a sound's edge: its gap on the track and the length a project can have. */
function audioLimits(project: Project, clip: AudioClip, asset: AudioAsset) {
  const gap = trackGaps(project, clip.trackId, new Set([clip.id])).find(
    (item) => item.start <= clip.start + 1e-6 && item.end >= clip.end - 1e-6,
  );
  return {
    minStart: gap?.start ?? 0,
    maxEnd: Math.min(gap?.end ?? Infinity, AUDIO_PROJECT_DURATION_LIMIT),
    sampleRate: asset.sampleRate,
  };
}

/** Far enough for any clip: `trimAudioClip` wants finite times. */
const FAR = 1e7;

/** How far the `edge` of one member can go from where it is, in seconds: [back, forward]. */
export function memberRange(
  project: Project,
  member: TrimMember,
  edge: TrimEdge,
): [number, number] {
  const at = member.clip[edge];
  if (member.kind === 'clip') {
    const [lo, hi] =
      edge === 'start' ? startBounds(project, member.clip) : endBounds(project, member.clip);
    return [lo - at, hi - at];
  }
  const limits = audioLimits(project, member.clip, member.asset);
  const reach = (time: number) =>
    trimAudioClip(member.clip, edge, time, member.asset.duration, limits)[edge];
  return [reach(at - FAR) - at, reach(at + FAR) - at];
}

/** How far the edge of all the members can go together: as far as every one of them allows.
 * [0, 0] when one of them cannot move at all. */
export function trimRange(
  project: Project,
  members: readonly TrimMember[],
  edge: TrimEdge,
): [number, number] {
  let lo = -Infinity;
  let hi = Infinity;
  for (const member of members) {
    const [back, forward] = memberRange(project, member, edge);
    lo = Math.max(lo, Math.min(back, 0));
    hi = Math.min(hi, Math.max(forward, 0));
  }
  return members.length === 0 ? [0, 0] : [lo, hi];
}

/** Move the `edge` of every member by `dt` seconds on `draft`, from the project as it was when
 * the drag began (`start`, which the members were read from): each drag step starts over from
 * there. A clip of the scene keeps its blocks and its relation windows where they are in time,
 * as a trim of it alone does; a sound lands on a frame of its recording. */
export function applyTrim(
  draft: Project,
  start: Project,
  members: readonly TrimMember[],
  edge: TrimEdge,
  dt: number,
): void {
  const scene = members.flatMap((m) => (m.kind === 'clip' ? [m.clip] : []));
  for (const original of scene) {
    const target = draft.clips.find((c) => c.id === original.id);
    if (!target) continue;
    // Recompute from the clip as it was when the drag began.
    target.start = original.start;
    target.end = original.end;
    target.actions = structuredClone(original.actions);
    const value = round6(original[edge] + dt);
    if (edge === 'start') trimStart(target, value);
    else trimEnd(target, value);
  }
  if (scene.length > 0) {
    // Trimming does not move what the clips show: keep their windows where they are in time,
    // then fit those that no longer lie inside both clips — but for those a locked track holds,
    // which stay where they play (the trim stops before it would leave them: `trimRange`).
    restoreWindows(draft, start);
    if (edge === 'start') {
      for (const original of scene) keepWindowsInPlace(draft, original.id, original.start);
    }
    restoreLockedWindows(draft, lockedWindowTimes(start));
    fitRelationWindows(
      draft,
      scene.map((c) => c.id),
    );
  }
  for (const member of members) {
    if (member.kind !== 'audio') continue;
    const target = draft.audioClips.find((c) => c.id === member.clip.id);
    if (!target || !audioEditable(draft, target)) continue;
    const changed = trimAudioClip(
      member.clip,
      edge,
      member.clip[edge] + dt,
      member.asset.duration,
      audioLimits(start, member.clip, member.asset),
    );
    target.start = changed.start;
    target.end = changed.end;
    target.sourceStart = changed.sourceStart;
  }
}
