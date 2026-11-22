/* The region of the timeline (D180): a stretch of time marked on the ruler — its start in green,
 * its end in red — that what is created next takes: a new animation block, a new relation's
 * window and the clip of a formula brought to the timeline start where it starts and last until
 * it ends, or are not made when they do not fit there (each says why). It is view state
 * (`timelineStore.ts`): not in the project, not undoable, and it stays until it is removed.
 *
 * This module is the geometry, pure: the region between two times, with one end moved, with its
 * start or its end put at the playhead (the I and O keys), and how it is said. */
import { TIME_EPSILON } from '../../model';
import { letterOf } from '../platform';
import { snapToFrame } from '../time';

/** A stretch of the timeline, absolute seconds on frames, `start` before `end`. */
export interface TimeRegion {
  start: number;
  end: number;
}

export type RegionEdge = 'start' | 'end';

/** How long a region made from one end alone is when nothing says where the other goes: I
 * pressed at the end of the scene, or past it. */
export const OPEN_REGION_LENGTH = 1;

/** The shortest region: a frame. */
const shortest = (fps: number) => 1 / fps;

const longEnough = (start: number, end: number, fps: number) =>
  end - start >= shortest(fps) - TIME_EPSILON;

/** The region between two times, whichever comes first, on the frames of `fps` and from 0 on;
 * null when it is shorter than a frame (a press without a drag marks nothing). */
export function regionBetween(a: number, b: number, fps: number): TimeRegion | null {
  const start = snapToFrame(Math.max(0, Math.min(a, b)), fps);
  const end = snapToFrame(Math.max(0, a, b), fps);
  return longEnough(start, end, fps) ? { start, end } : null;
}

/** `region` with one end at `t`: the end stops a frame from the other one, which stays. */
export function withEdge(region: TimeRegion, edge: RegionEdge, t: number, fps: number): TimeRegion {
  const frame = shortest(fps);
  return edge === 'start'
    ? { start: snapToFrame(Math.min(Math.max(0, t), region.end - frame), fps), end: region.end }
    : { start: region.start, end: snapToFrame(Math.max(t, region.start + frame), fps) };
}

/** The region once its start is put at `t` (the I key): the end stays where it is when it comes
 * after `t`; else — no region yet, or `t` at its end or past it — the region runs to the end of
 * the scene (`sceneEnd`), or for `OPEN_REGION_LENGTH` when the scene ends there or before. */
export function withStartAt(
  region: TimeRegion | null,
  t: number,
  sceneEnd: number,
  fps: number,
): TimeRegion {
  const start = snapToFrame(Math.max(0, t), fps);
  if (region && longEnough(start, region.end, fps)) return { start, end: region.end };
  const end = snapToFrame(sceneEnd, fps);
  return { start, end: longEnough(start, end, fps) ? end : start + OPEN_REGION_LENGTH };
}

/** The region once its end is put at `t` (the O key): the start stays where it is when it comes
 * before `t`; else — no region yet, or `t` at its start or before it — the region starts with the
 * scene, at 0. Null when `t` is the start of the scene: no region ends there. */
export function withEndAt(region: TimeRegion | null, t: number, fps: number): TimeRegion | null {
  const end = snapToFrame(Math.max(0, t), fps);
  if (region && longEnough(region.start, end, fps)) return { start: region.start, end };
  return longEnough(0, end, fps) ? { start: 0, end } : null;
}

/** `region` within a timeline that lays out `limit` seconds: cut there when it ends later, and
 * null when less than a frame of it is left. */
export function regionWithin(region: TimeRegion, limit: number, fps: number): TimeRegion | null {
  if (region.end <= limit + TIME_EPSILON) return region;
  return regionBetween(region.start, Math.max(region.start, limit), fps);
}

/** A key press, as far as the region's keys look at it. */
export type RegionKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
> & { code?: string };

/** Which end of the region a key press puts at the playhead: I its start, O its end. The plain
 * letter — none with Ctrl, ⌘, Alt or Shift held (Ctrl/⌘+O opens a project) —, or, on a layout
 * that writes another script, the key where a Latin keyboard has that letter (`letterOf`). */
export function regionKeyEdge(event: RegionKeyEvent): RegionEdge | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  const letter = letterOf(event);
  return letter === 'i' ? 'start' : letter === 'o' ? 'end' : null;
}

/** "1.00–3.00 s": a region as notices and menus say it. */
export function regionLabel(region: TimeRegion): string {
  return `${region.start.toFixed(2)}–${region.end.toFixed(2)} s`;
}

/** Whether `region` lies within `[start, end]`, its ends included. */
export function regionInside(region: TimeRegion, start: number, end: number): boolean {
  return region.start >= start - TIME_EPSILON && region.end <= end + TIME_EPSILON;
}
