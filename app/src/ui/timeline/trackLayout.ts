/* Vertical layout of the tracks. Animation blocks that overlap in time are stacked in lanes
 * inside their clip (the block dragged last, `top`, on the first lane), and a track grows so that
 * every lane keeps the full lane height; tracks with fewer lanes keep ROW_HEIGHT. A folded group
 * is one block, on one lane (`blockGroups.ts`). The lanes of a track are as tall as its scale
 * says (`rowSizes.ts`: the vertical zoom, and a track resized by hand), and each row carries the
 * height of its lanes. Everything that needs a y position on the timeline (rows, blocks,
 * relation arrows and bands, the track under a dragged clip, the link line) reads it from here.
 * Pure. */
import {
  TIME_EPSILON,
  type ActionId,
  type Clip,
  type ClipId,
  type Project,
  type TrackId,
} from '../../model';
import { ALL_FOLDED, drawnBlocks } from './blockGroups';
import { CLIP_INSET, HANDLE_WIDTH, LINK_PORT_RADIUS } from './layout';
import {
  audioRowHeight,
  laneHeight,
  rowScale,
  STANDARD_SIZES,
  visualRowHeight,
  type RowSizes,
} from './rowSizes';

export interface ClipLanes {
  /** Number of lanes the clip needs, at least 1 (an empty strip is one lane tall). */
  count: number;
  /** The lane of each block, from 0 (top): the members of a folded group share theirs. */
  laneOf: ReadonlyMap<ActionId, number>;
  /** The block that draws each block (`DrawnBlock.id`): itself, or the first member of its
   * folded group. */
  shownAs: ReadonlyMap<ActionId, ActionId>;
}

interface Interval {
  id: ActionId;
  start: number;
  end: number;
}

/** Whether `block` can share a lane with every block already in it: none of them overlaps it in
 * time (blocks that only touch share a lane). */
const fits = (lane: readonly Interval[], block: Interval) =>
  lane.every(
    (other) => other.end <= block.start + TIME_EPSILON || block.end <= other.start + TIME_EPSILON,
  );

/** Greedy interval partitioning: blocks in start order each take the first lane where they fit.
 * A block never moves because of one that starts after it, and blocks that only touch share a
 * lane. With `top`, that block takes the first lane before any other is placed: the block being
 * dragged, or dragged last, lies over those it runs alongside (the others keep their order). */
export function assignLanes(
  blocks: readonly Interval[],
  top: ActionId | null = null,
): Omit<ClipLanes, 'shownAs'> {
  const sorted = blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.start - b.block.start || a.index - b.index);
  const lanes: Interval[][] = [];
  const laneOf = new Map<ActionId, number>();
  const pinned = top === null ? undefined : blocks.find((b) => b.id === top);
  if (pinned) {
    lanes.push([pinned]);
    laneOf.set(pinned.id, 0);
  }
  for (const { block } of sorted) {
    if (block === pinned) continue;
    let lane = lanes.findIndex((l) => fits(l, block));
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane]!.push(block);
    laneOf.set(block.id, lane);
  }
  return { count: Math.max(1, lanes.length), laneOf };
}

/** The lanes of the blocks of `clip` as the timeline draws them: a block on its own and each
 * member of an unfolded group take a lane as their time asks, a folded group one lane for all
 * its members. `top` is the block dragged last — or its folded group. */
export function clipLanes(
  clip: Clip,
  top: ActionId | null = null,
  unfolded: ReadonlySet<string> = ALL_FOLDED,
): ClipLanes {
  const drawn = drawnBlocks(clip, unfolded);
  const shownAs = new Map<ActionId, ActionId>();
  for (const block of drawn) for (const member of block.members) shownAs.set(member.id, block.id);
  const lanes = assignLanes(
    drawn.map(({ id, members }) => ({
      id,
      start: members[0]!.start,
      end: members[0]!.start + members[0]!.duration,
    })),
    top === null ? null : (shownAs.get(top) ?? top),
  );
  const laneOf = new Map<ActionId, number>();
  for (const [id, shown] of shownAs) laneOf.set(id, lanes.laneOf.get(shown) ?? 0);
  return { count: lanes.count, laneOf, shownAs };
}

/** Height of a visual track whose clips need up to `lanes` lanes, at the standard scale or at
 * `scale`. */
export function rowHeight(lanes: number, scale = 1): number {
  return visualRowHeight(lanes, scale);
}

export interface TrackRow {
  trackId: TrackId;
  /** Position in `project.tracks` (0 = top). */
  index: number;
  /** Offset from the top of the tracks area, px. */
  top: number;
  height: number;
  /** Lanes of blocks the row makes room for. */
  lanes: number;
  /** What the row's lanes are multiplied by (`rowSizes.ts`): 1 at the standard height. */
  scale: number;
  /** Height of one lane of blocks of this row, px: of a block's lane, and of the lower part of
   * a clip, where its name and the relation windows are. */
  lane: number;
}

export interface TracksLayout {
  rows: readonly TrackRow[];
  /** Height of all rows together. */
  height: number;
  /** The lanes of every clip's blocks. */
  clips: ReadonlyMap<ClipId, ClipLanes>;
  rowOf(trackId: TrackId): TrackRow | undefined;
  /** Index of the row at `y` (px from the top of the tracks area), clamped to the first and last
   * row; -1 when there are no tracks. */
  indexAt(y: number): number;
}

/** Per project, the layout for each `top` block, set of unfolded groups and sizes it was asked
 * with. */
const cache = new WeakMap<
  Project,
  Map<ActionId | null, WeakMap<ReadonlySet<string>, WeakMap<RowSizes, TracksLayout>>>
>();

/** The layout of `project`'s tracks, with `topBlock` (the block dragged last, as the timeline
 * store has it) on the first lane of its clip, the groups of `unfolded` (`groupKey`s, as the
 * store has them too) drawn with a lane per member, and the tracks as tall as `sizes` says (the
 * store's too). */
export function tracksLayout(
  project: Project,
  topBlock: ActionId | null = null,
  unfolded: ReadonlySet<string> = ALL_FOLDED,
  sizes: RowSizes = STANDARD_SIZES,
): TracksLayout {
  const known = cache.get(project)?.get(topBlock)?.get(unfolded)?.get(sizes);
  if (known) return known;
  const clips = new Map<ClipId, ClipLanes>();
  const lanesOfTrack = new Map<TrackId, number>();
  for (const clip of project.clips) {
    const lanes = clipLanes(clip, topBlock, unfolded);
    clips.set(clip.id, lanes);
    lanesOfTrack.set(clip.trackId, Math.max(lanesOfTrack.get(clip.trackId) ?? 1, lanes.count));
  }
  const rows: TrackRow[] = [];
  let top = 0;
  project.tracks.forEach((track, index) => {
    const lanes = lanesOfTrack.get(track.id) ?? 1;
    const scale = rowScale(sizes, track.id);
    const height = track.kind === 'audio' ? audioRowHeight(scale) : rowHeight(lanes, scale);
    rows.push({ trackId: track.id, index, top, height, lanes, scale, lane: laneHeight(scale) });
    top += height;
  });
  const byTrack = new Map(rows.map((row) => [row.trackId, row]));
  const layout: TracksLayout = {
    rows,
    height: top,
    clips,
    rowOf: (trackId) => byTrack.get(trackId),
    indexAt: (y) => {
      if (rows.length === 0) return -1;
      const found = rows.findIndex((row) => y < row.top + row.height);
      return found < 0 ? rows.length - 1 : Math.max(0, found);
    },
  };
  let layouts = cache.get(project);
  if (!layouts) {
    layouts = new Map();
    cache.set(project, layouts);
  }
  let byFold = layouts.get(topBlock);
  if (!byFold) {
    byFold = new WeakMap();
    layouts.set(topBlock, byFold);
  }
  let bySizes = byFold.get(unfolded);
  if (!bySizes) {
    bySizes = new WeakMap();
    byFold.set(unfolded, bySizes);
  }
  bySizes.set(sizes, layout);
  return layout;
}

/** Centre of the link port of `clip` on `row` (TimelineLinkPorts), in px from time 0 and from the
 * top of the tracks area: in the middle of the clip's lower half, where no block goes, by its right
 * end just inside the trim handle — or by its left end on a clip too narrow for that. */
export function linkPortCenter(clip: Clip, row: TrackRow, px: number): [number, number] {
  const right = clip.end * px - HANDLE_WIDTH - 3 - LINK_PORT_RADIUS;
  const x = Math.max(clip.start * px + LINK_PORT_RADIUS, right);
  return [x, row.top + row.height - CLIP_INSET - row.lane / 2];
}
