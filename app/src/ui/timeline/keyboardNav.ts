/* The keyboard model of the timeline's clips and blocks (pure): which item the arrows go to,
 * which item holds the Tab stop, how an item is described to assistive technology, where Alt +
 * arrows take a clip, and how far the view scrolls to show an item. The timeline is a grid of
 * tracks: ←/→ walk the clips of a track in time order (Home/End: its first and last), ↑/↓ go to
 * the track above or below — to the clip nearest in time — or, inside a clip, through the lanes
 * of its blocks: ↑ from a clip reaches its lowest lane, ↓ from the lowest lane comes back to the
 * clip, ←/→ walk a lane. A folded group of blocks is one item, as it is one block
 * (`blockGroups.ts`): the arrows reach it as its first member. */
import type { ActionId, Clip, ClipAction, ClipId, Project, Track } from '../../model';
import type { Selection } from '../../store';
import { blockLabel } from '../animations/blockKinds';
import { lockedBreak, lockedReason, relationName } from '../relations/lockedRelations';
import { constrainMove } from './clipOps';
import type { TracksLayout } from './trackLayout';
import {
  timelineClips,
  timelineClip,
  timelineClipName,
  isAudioClip,
  type TimelineClip,
} from './timelineClips';

export type TimelineItem =
  { kind: 'clip'; clipId: ClipId } | { kind: 'block'; clipId: ClipId; actionId: ActionId };

export type NavKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

const NAV_KEYS: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

export function isNavKey(key: string): key is NavKey {
  return NAV_KEYS.has(key);
}

export function sameItem(a: TimelineItem | null, b: TimelineItem | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind || a.clipId !== b.clipId) return false;
  return a.kind === 'clip' || (b.kind === 'block' && a.actionId === b.actionId);
}

/** The clips of a track in time order (ties by id, the drawing order). */
function clipsOfTrack(project: Project, trackId: string): TimelineClip[] {
  return timelineClips(project)
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
}

/** The item that holds the timeline's Tab stop: the selected block, else the first selected clip
 * in track and time order, else the first clip of the first track that has one; null with no
 * clips. */
export function tabStop(selection: Selection, project: Project): TimelineItem | null {
  if (selection.kind === 'action') {
    const clip = project.clips.find((c) => c.id === selection.clipId);
    if (clip?.actions.some((a) => a.id === selection.actionId)) {
      return { kind: 'block', clipId: clip.id, actionId: selection.actionId };
    }
  }
  const selected = new Set(selection.kind === 'clips' ? selection.ids : []);
  let first: TimelineClip | null = null;
  for (const track of project.tracks) {
    for (const clip of clipsOfTrack(project, track.id)) {
      if (selected.has(clip.id)) return { kind: 'clip', clipId: clip.id };
      first ??= clip;
    }
  }
  return first ? { kind: 'clip', clipId: first.id } : null;
}

/** How far `t` is from the clip's span (0 inside it). */
const distance = (clip: TimelineClip, t: number) => Math.max(clip.start - t, t - clip.end, 0);

/** The clip of `trackId` nearest to time `t` (the earliest of equals), or null. */
function nearestClip(project: Project, trackId: string, t: number): TimelineClip | null {
  let best: TimelineClip | null = null;
  for (const clip of clipsOfTrack(project, trackId)) {
    if (!best || distance(clip, t) < distance(best, t)) best = clip;
  }
  return best;
}

/** The nearest clip on the first track above (`-1`) or below (`+1`) `trackId` that has one. */
function clipOnOtherTrack(
  project: Project,
  trackId: string,
  direction: -1 | 1,
  t: number,
): TimelineItem | null {
  const index = project.tracks.findIndex((track) => track.id === trackId);
  for (let i = index + direction; i >= 0 && i < project.tracks.length; i += direction) {
    const found = nearestClip(project, project.tracks[i]!.id, t);
    if (found) return { kind: 'clip', clipId: found.id };
  }
  return null;
}

/** The blocks of `clip` drawn on `lane`, in time order: a folded group is its first member. */
function blocksOnLane(clip: Clip, layout: TracksLayout, lane: number): ClipAction[] {
  const lanes = layout.clips.get(clip.id);
  return clip.actions
    .filter(
      (a) => (lanes?.laneOf.get(a.id) ?? 0) === lane && (lanes?.shownAs.get(a.id) ?? a.id) === a.id,
    )
    .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
}

function nearestBlock(blocks: readonly ClipAction[], start: number): ClipAction | null {
  let best: ClipAction | null = null;
  for (const block of blocks) {
    const d = Math.max(block.start - start, start - (block.start + block.duration), 0);
    if (!best || d < Math.max(best.start - start, start - (best.start + best.duration), 0)) {
      best = block;
    }
  }
  return best;
}

const blockItem = (clipId: ClipId, block: ClipAction | null): TimelineItem | null =>
  block ? { kind: 'block', clipId, actionId: block.id } : null;

/** The item `key` moves to from `from`; null when there is none that way (the focus stays). */
export function moveItem(
  key: NavKey,
  from: TimelineItem,
  project: Project,
  layout: TracksLayout,
): TimelineItem | null {
  const clip = timelineClip(project, from.clipId);
  if (!clip) return null;
  if (from.kind === 'clip') {
    const row = clipsOfTrack(project, clip.trackId);
    const at = row.findIndex((c) => c.id === clip.id);
    switch (key) {
      case 'ArrowLeft':
        return at > 0 ? { kind: 'clip', clipId: row[at - 1]!.id } : null;
      case 'ArrowRight':
        return at < row.length - 1 ? { kind: 'clip', clipId: row[at + 1]!.id } : null;
      case 'Home':
        return at > 0 ? { kind: 'clip', clipId: row[0]!.id } : null;
      case 'End':
        return at < row.length - 1 ? { kind: 'clip', clipId: row[row.length - 1]!.id } : null;
      case 'ArrowUp': {
        // Into the clip's blocks first: the lowest lane, from its first block.
        const lanes = layout.clips.get(clip.id);
        if (!isAudioClip(clip) && lanes && lanes.laneOf.size > 0) {
          const lowest = Math.max(...lanes.laneOf.values());
          return blockItem(clip.id, blocksOnLane(clip, layout, lowest)[0] ?? null);
        }
        return clipOnOtherTrack(project, clip.trackId, -1, clip.start);
      }
      case 'ArrowDown':
        return clipOnOtherTrack(project, clip.trackId, 1, clip.start);
    }
  }
  if (isAudioClip(clip)) return null;
  const action = clip.actions.find((a) => a.id === from.actionId);
  if (!action) return null;
  const lanes = layout.clips.get(clip.id);
  const lane = lanes?.laneOf.get(action.id) ?? 0;
  const row = blocksOnLane(clip, layout, lane);
  // From any member of a folded group: from the block that draws it.
  const at = row.findIndex((a) => a.id === (lanes?.shownAs.get(action.id) ?? action.id));
  switch (key) {
    case 'ArrowLeft':
      return at > 0 ? blockItem(clip.id, row[at - 1]!) : null;
    case 'ArrowRight':
      return at < row.length - 1 ? blockItem(clip.id, row[at + 1]!) : null;
    case 'Home':
      return at > 0 ? blockItem(clip.id, row[0]!) : null;
    case 'End':
      return at < row.length - 1 ? blockItem(clip.id, row[row.length - 1]!) : null;
    case 'ArrowUp':
      if (lane > 0) {
        return blockItem(clip.id, nearestBlock(blocksOnLane(clip, layout, lane - 1), action.start));
      }
      return clipOnOtherTrack(project, clip.trackId, -1, clip.start + action.start);
    case 'ArrowDown': {
      const below = blocksOnLane(clip, layout, lane + 1);
      if (below.length > 0) return blockItem(clip.id, nearestBlock(below, action.start));
      return { kind: 'clip', clipId: clip.id };
    }
  }
}

const seconds = (t: number) => `${t.toFixed(2)} s`;

/** How a clip reads to assistive technology: "f1, 0.00 to 6.00 s, Track 1, 2 blocks, locked". */
export function clipDescription(
  clip: Clip,
  formulaName: string,
  track: Pick<Track, 'name' | 'locked'> | undefined,
): string {
  const parts = [formulaName, `${clip.start.toFixed(2)} to ${seconds(clip.end)}`];
  if (track) parts.push(track.name);
  const blocks = clip.actions.length;
  if (blocks > 0) parts.push(`${blocks} block${blocks === 1 ? '' : 's'}`);
  if (track?.locked) parts.push('locked');
  return parts.join(', ');
}

/** How a block reads: "Write · 2, 1.00 to 2.50 s, lane 1 of 2". */
export function blockDescription(
  action: ClipAction,
  clip: Clip,
  lane: number,
  laneCount: number,
): string {
  const start = clip.start + action.start;
  const parts = [blockLabel(action), `${start.toFixed(2)} to ${seconds(start + action.duration)}`];
  if (laneCount > 1) parts.push(`lane ${lane + 1} of ${laneCount}`);
  return parts.join(', ');
}

/** The scroll offset that shows the stretch [`left`, `left + width`) of the content, measured
 * from the end of a sticky `fixed` px band (the track headers, the ruler), in a viewport
 * `viewport` px long, moving as little as possible; a stretch too long for the viewport shows
 * its start. */
export function revealScroll(
  scroll: number,
  viewport: number,
  fixed: number,
  left: number,
  width: number,
): number {
  const contentLeft = fixed + left;
  const contentRight = contentLeft + width;
  if (contentLeft < scroll + fixed || width > viewport - fixed)
    return Math.max(0, contentLeft - fixed);
  if (contentRight > scroll + viewport) return Math.max(0, contentRight - viewport);
  return scroll;
}

/** Where Alt + arrows take a clip, or why it stays: `reason` in a few words, and `message` when
 * there is more to say — what stops it and what to do. */
export type Nudge =
  | { ok: true; trackId: string; start: number; end: number }
  | { ok: false; reason: string; message?: string };

/** Where Alt + arrows take `clip`: `dt` seconds along its track, or `dTrack` rows up (−1) or
 * down (+1); constrained like a drag (clear of the other clips, at or after time 0, around the
 * windows of its relations with clips on locked tracks), onto no locked track and never off the
 * top or the bottom. When such a window is what keeps it from moving at all, the message says
 * so. */
export function nudgedClip(
  project: Project,
  clip: TimelineClip,
  dt: number,
  dTrack: -1 | 0 | 1,
): Nudge {
  const own = project.tracks.find((t) => t.id === clip.trackId);
  if (own?.locked) return { ok: false, reason: `${own.name} is locked` };
  let trackId = clip.trackId;
  if (dTrack !== 0) {
    const index = project.tracks.findIndex((t) => t.id === clip.trackId);
    const target = project.tracks[index + dTrack];
    if (!target) return { ok: false, reason: dTrack < 0 ? 'No track above' : 'No track below' };
    if (target.locked) return { ok: false, reason: `${target.name} is locked` };
    if (target.kind !== (isAudioClip(clip) ? 'audio' : 'visual'))
      return { ok: false, reason: 'Choose a compatible track' };
    trackId = target.id;
  }
  const shift = constrainMove(project, [{ clip, trackId }], dt);
  if (shift === null || (dTrack === 0 && shift === 0 && dt !== 0)) {
    const moved = isAudioClip(clip)
      ? null
      : { ...clip, start: clip.start + dt, end: clip.end + dt };
    const locked = moved && lockedBreak(project, moved);
    if (!locked) return { ok: false, reason: 'No room that way' };
    const what = `The ${relationName(project, locked.relation)} would no longer fit in “${timelineClipName(project, clip)}”.`;
    return {
      ok: false,
      reason: 'No room that way',
      message: lockedReason(project, locked.relation, what),
    };
  }
  return { ok: true, trackId, start: clip.start + shift, end: clip.end + shift };
}
