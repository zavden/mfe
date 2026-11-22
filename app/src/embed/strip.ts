/* The timeline strip under a player: a small version of the app's timeline (`ui/timeline/`) laid
 * out for a width — the ruler, a row per visual track with its name, its clips (the formula's tag
 * colour and name, the intro and outro bands, the animation blocks in lanes over the clip), the
 * relation windows on both clips with the arrow between them, and the time ↔ x mapping of the
 * playhead and of a click. Only the part of the scene the player plays is shown. Pure: the DOM
 * of the strip (`stripView.ts`) draws what this returns. */
import { TIME_EPSILON, type Clip, type Project } from '../model';
import type { Range } from './clock';
import { blockCategory, blockLabel, shortAnimationLabel, type BlockCategory } from './labels';

/** Heights, CSS pixels. */
export const RULER_HEIGHT = 20;
/** Space above and below the clips of a row. */
export const CLIP_INSET = 3;
/** One lane of animation blocks, over the clip. */
export const LANE_HEIGHT = 14;
/** The lower part of a clip: its name and the relation windows. */
export const FOOT_HEIGHT = 16;
/** The column of the track names, where there is room for it. */
export const HEADER_WIDTH = 76;
/** Under this width the strip has no column of track names. */
export const NARROW_WIDTH = 420;
/** The least distance between two labelled ticks. */
const MIN_TICK_GAP = 56;
/** The steps of the labelled ticks, in seconds. */
const TICK_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];

export interface StripTick {
  /** Seconds of the scene. */
  time: number;
  x: number;
  /** A labelled tick (the full height of the ruler), or a small one. */
  major: boolean;
  /** "2s"; empty for a small tick, and for a labelled one too near the end for its label. */
  label: string;
}

export interface StripBand {
  /** From the clip's left edge. */
  left: number;
  width: number;
  /** The animation's short name ("Write"); empty when it has no room. */
  label: string;
}

export interface StripBlock {
  actionId: string;
  category: BlockCategory;
  label: string;
  /** From the clip's left edge. */
  left: number;
  width: number;
  /** Its lane over the clip, from 0 (top). */
  lane: number;
  /** "Write · 2, 1.00 → 1.50 s". */
  title: string;
}

export interface StripClip {
  clipId: string;
  /** The formula's name. */
  name: string;
  /** The formula's tag colour. */
  color: string;
  /** From the lanes' left edge (time `range.start`); clipped to the range. */
  left: number;
  width: number;
  /** The clip goes on before the range, after it. */
  cutStart: boolean;
  cutEnd: boolean;
  intro: StripBand | null;
  outro: StripBand | null;
  blocks: StripBlock[];
  /** "x + 3 = 5 · 0.00 → 3.00 s". */
  title: string;
}

export interface StripRow {
  trackId: string;
  name: string;
  /** From the top of the rows (under the ruler). */
  top: number;
  height: number;
  /** The lanes of blocks its clips need (at least 1). */
  lanes: number;
  clips: StripClip[];
}

export interface StripRelation {
  relationId: string;
  /** The window on the source clip's row and on the target clip's (from the lanes' left edge
   * and from the top of the rows). */
  windows: { left: number; width: number; top: number; height: number }[];
  /** The arrow from the source clip to the window on the target, an SVG path in the same
   * coordinates. */
  arrow: string;
  /** Its head: an SVG path. */
  head: string;
  title: string;
}

export interface StripLayout {
  range: Range;
  /** The column of the track names (0 when narrow). */
  header: number;
  /** The width of the lanes, where time runs. */
  lanes: number;
  pxPerSecond: number;
  /** Of the rows, under the ruler. */
  rowsHeight: number;
  rows: StripRow[];
  ticks: StripTick[];
  relations: StripRelation[];
}

const fmt = (t: number) => t.toFixed(2);

/** The x of a time, from the lanes' left edge. */
export function timeToX(layout: Pick<StripLayout, 'range' | 'pxPerSecond'>, time: number): number {
  return (time - layout.range.start) * layout.pxPerSecond;
}

/** The time at `x` (from the lanes' left edge), inside the range. */
export function xToTime(layout: Pick<StripLayout, 'range' | 'pxPerSecond'>, x: number): number {
  const t = layout.range.start + x / (layout.pxPerSecond || 1);
  return Math.min(Math.max(t, layout.range.start), layout.range.end);
}

/** Greedy lanes for blocks that overlap in time (blocks that only touch share a lane), in start
 * order, as the app's timeline assigns them (`ui/timeline/trackLayout.ts`, `assignLanes`). */
export function assignLanes(
  blocks: readonly { id: string; start: number; end: number }[],
): Map<string, number> {
  const lanes: { start: number; end: number }[][] = [];
  const out = new Map<string, number>();
  const sorted = blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.start - b.block.start || a.index - b.index);
  for (const { block } of sorted) {
    let lane = lanes.findIndex((l) =>
      l.every((o) => o.end <= block.start + TIME_EPSILON || block.end <= o.start + TIME_EPSILON),
    );
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane]!.push(block);
    out.set(block.id, lane);
  }
  return out;
}

/** The labelled ticks for a range drawn `width` pixels wide, and the small ones between them. */
export function rulerTicks(range: Range, width: number): StripTick[] {
  const length = range.end - range.start;
  if (length <= 0 || width <= 0) return [];
  const px = width / length;
  const step = TICK_STEPS.find((s) => s * px >= MIN_TICK_GAP) ?? TICK_STEPS.at(-1)!;
  const minor = step / (step === 0.25 || step === 15 ? 5 : step >= 1 && step % 5 === 0 ? 5 : 2);
  const ticks: StripTick[] = [];
  const first = Math.ceil(range.start / minor - 1e-9);
  for (let i = first; i * minor <= range.end + 1e-9; i++) {
    // `+ 0`: no tick at −0.
    const time = Math.round(i * minor * 1e6) / 1e6 + 0;
    const major = Math.abs(time / step - Math.round(time / step)) < 1e-6;
    const x = (time - range.start) * px + 0;
    const text = `${Number(time.toFixed(3))}s`;
    // A label the end of the strip would cut is left out (about 6 px a character).
    ticks.push({ time, x, major, label: major && x + 4 + text.length * 6 <= width ? text : '' });
  }
  return ticks;
}

/** The band of an intro or an outro, from the clip's left edge, clipped to what is shown. */
function band(
  kind: Clip['intro']['kind'] | Clip['outro']['kind'],
  start: number,
  end: number,
  clipLeft: number,
  layout: Pick<StripLayout, 'range' | 'pxPerSecond'>,
): StripBand | null {
  if (kind === 'none' || end - start <= TIME_EPSILON) return null;
  const from = Math.max(start, layout.range.start);
  const to = Math.min(end, layout.range.end);
  if (to <= from) return null;
  const left = timeToX(layout, from) - clipLeft;
  const width = (to - from) * layout.pxPerSecond;
  const label = shortAnimationLabel(kind);
  return { left, width, label: width >= label.length * 6 + 8 ? label : '' };
}

/** The strip of `project` for the part `range` of its scene, `width` CSS pixels wide in all. */
export function layoutStrip(project: Project, range: Range, width: number): StripLayout {
  const header = width >= NARROW_WIDTH ? HEADER_WIDTH : 0;
  const lanes = Math.max(0, width - header);
  const length = range.end - range.start;
  const pxPerSecond = length > 0 ? lanes / length : 0;
  const axis = { range, pxPerSecond };
  const formulas = new Map(project.formulas.map((f) => [f.id, f]));

  const rows: StripRow[] = [];
  let top = 0;
  for (const track of project.tracks) {
    if (track.kind !== 'visual') continue;
    const clips: StripClip[] = [];
    let laneCount = 1;
    for (const clip of project.clips) {
      if (clip.trackId !== track.id) continue;
      if (clip.end <= range.start + TIME_EPSILON || clip.start >= range.end - TIME_EPSILON) {
        continue;
      }
      const formula = formulas.get(clip.formulaId);
      const from = Math.max(clip.start, range.start);
      const to = Math.min(clip.end, range.end);
      const left = timeToX(axis, from);
      const clipWidth = Math.max(2, (to - from) * pxPerSecond);
      const laneOf = assignLanes(
        clip.actions.map((a) => ({
          id: a.id,
          start: clip.start + a.start,
          end: clip.start + a.start + a.duration,
        })),
      );
      const blocks: StripBlock[] = [];
      for (const action of clip.actions) {
        const start = clip.start + action.start;
        const end = start + action.duration;
        const shownFrom = Math.max(start, range.start);
        const shownTo = Math.min(end, range.end);
        if (shownTo <= shownFrom) continue;
        const label = blockLabel(action);
        blocks.push({
          actionId: action.id,
          category: blockCategory(action),
          label,
          left: timeToX(axis, shownFrom) - left,
          width: Math.max(3, (shownTo - shownFrom) * pxPerSecond),
          lane: laneOf.get(action.id) ?? 0,
          title: `${label}, ${fmt(start)} → ${fmt(end)} s`,
        });
      }
      for (const block of blocks) laneCount = Math.max(laneCount, block.lane + 1);
      const name = formula?.name ?? '?';
      clips.push({
        clipId: clip.id,
        name,
        color: formula?.tag.color ?? '#888888',
        left,
        width: clipWidth,
        cutStart: clip.start < range.start - TIME_EPSILON,
        cutEnd: clip.end > range.end + TIME_EPSILON,
        intro: band(clip.intro.kind, clip.start, clip.start + clip.intro.duration, left, axis),
        outro: band(clip.outro.kind, clip.end - clip.outro.duration, clip.end, left, axis),
        blocks,
        title: `${name}${formula?.source ? `: ${formula.source}` : ''} · ${fmt(clip.start)} → ${fmt(clip.end)} s`,
      });
    }
    const height = 2 * CLIP_INSET + laneCount * LANE_HEIGHT + FOOT_HEIGHT;
    rows.push({ trackId: track.id, name: track.name, top, height, lanes: laneCount, clips });
    top += height;
  }

  const rowOf = new Map(rows.map((row) => [row.trackId, row]));
  const clipById = new Map(project.clips.map((c) => [c.id, c]));
  const relations: StripRelation[] = [];
  for (const relation of project.relations) {
    const from = clipById.get(relation.fromClipId);
    const to = clipById.get(relation.toClipId);
    const fromRow = from && rowOf.get(from.trackId);
    const toRow = to && rowOf.get(to.trackId);
    if (!from || !to || !fromRow || !toRow) continue;
    const start = to.start + relation.offset;
    const end = start + relation.duration;
    const shownFrom = Math.max(start, range.start);
    const shownTo = Math.min(end, range.end);
    if (shownTo <= shownFrom) continue;
    const left = timeToX(axis, shownFrom);
    const windowWidth = Math.max(4, (shownTo - shownFrom) * pxPerSecond);
    const foot = (row: StripRow) => ({
      left,
      width: windowWidth,
      top: row.top + row.height - CLIP_INSET - FOOT_HEIGHT,
      height: FOOT_HEIGHT,
    });
    // The arrow leaves the middle of the source clip before the window and lands on the facing
    // edge of the target clip at the start of its window, as on the app's timeline.
    const fromStart = timeToX(axis, Math.max(from.start, range.start));
    const fromEnd = timeToX(axis, Math.min(from.end, range.end));
    const fromX = Math.min(Math.max(left - 24, fromStart + 6), Math.max(fromEnd - 6, fromStart));
    const toX = left + Math.min(windowWidth / 2, 10);
    const down = toRow.top > fromRow.top;
    const same = toRow === fromRow;
    const y0 = fromRow.top + fromRow.height / 2;
    const y1 = same
      ? fromRow.top + CLIP_INSET
      : down
        ? toRow.top + CLIP_INSET
        : toRow.top + toRow.height - CLIP_INSET;
    const mid = same ? fromRow.top - 6 : (y0 + y1) / 2;
    const arrow = `M${fromX} ${y0} C${fromX} ${mid} ${toX} ${mid} ${toX} ${y1}`;
    const tip = down || same ? -1 : 1;
    const head = `M${toX - 4} ${y1 + 6 * tip} L${toX} ${y1} L${toX + 4} ${y1 + 6 * tip} Z`;
    const name = (clip: Clip) => formulas.get(clip.formulaId)?.name ?? '?';
    relations.push({
      relationId: relation.id,
      windows: same ? [foot(toRow)] : [foot(fromRow), foot(toRow)],
      arrow,
      head,
      title: `${name(from)} → ${name(to)}, ${fmt(start)} → ${fmt(end)} s, ${relation.pairs.length} pair${relation.pairs.length === 1 ? '' : 's'}`,
    });
  }

  return {
    range,
    header,
    lanes,
    pxPerSecond,
    rowsHeight: top,
    rows,
    ticks: rulerTicks(range, lanes),
    relations,
  };
}
