/* The timeline's selection rectangle: a drag on empty lane space spans a rectangle in time (s)
 * and rows (px from the top of the tracks area), and the clips it touches get selected
 * (`preview/marquee.ts` has the rule that adds them to a selection with Shift/Ctrl). Pure. */
import type { ClipId, Project } from '../../model';
import type { TracksLayout } from './trackLayout';
import { timelineClips } from './timelineClips';

export interface TimeRect {
  t0: number;
  t1: number;
  y0: number;
  y1: number;
}

/** The rectangle between the press point and the pointer ([seconds, px]), normalised. */
export function timeRect(
  start: readonly [number, number],
  now: readonly [number, number],
): TimeRect {
  return {
    t0: Math.min(start[0], now[0]),
    t1: Math.max(start[0], now[0]),
    y0: Math.min(start[1], now[1]),
    y1: Math.max(start[1], now[1]),
  };
}

/** The clips whose stretch of time and whose row the rectangle touches (edges count), in the
 * project's order; clips on hidden or locked tracks included, as a click selects them too. */
export function clipsInRect(project: Project, layout: TracksLayout, rect: TimeRect): ClipId[] {
  const ids: ClipId[] = [];
  for (const clip of timelineClips(project)) {
    const row = layout.rowOf(clip.trackId);
    if (!row) continue;
    const inTime = clip.start <= rect.t1 && clip.end >= rect.t0;
    const inRows = row.top <= rect.y1 && row.top + row.height >= rect.y0;
    if (inTime && inRows) ids.push(clip.id);
  }
  return ids;
}
