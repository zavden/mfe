/* Pointer gestures of the timeline's region (D180, `region.ts`): drawing it on the ruler with
 * Shift held, and dragging one of its two ends by its mark. The region is view state, so no
 * gesture here is an undo step; Escape during one brings back the region as it was
 * (`trackPointer`). A mark pressed and let go without a drag is a press on the ruler there: the
 * playhead goes to it.
 *
 * An end goes where the playhead would: on a frame, and with Ctrl/⌘ held on the small ticks of
 * the ruler alone (D174). It snaps too, as a clip's edge does — to the playhead, the edges of the
 * clips and the ruler's grid, while the Snap key is on; Shift suspends that for an end being
 * dragged, and cannot for a region being drawn, whose key it is. */
import { useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import { useProjectStore } from '../../store';
import { isDrag, isMainClick, screenPoint, trackPointer } from '../pointer';
import { snapOffset } from './clipOps';
import { regionBetween, withEdge, type RegionEdge, type TimeRegion } from './region';
import { nearestTick } from './ruler';
import { useTimelineStore } from './timelineStore';
import { snapOptions } from './useTimelineGestures';
import { along } from './axis';

/** The keys that say how an end follows the pointer. */
interface EdgeKeys {
  /** Ctrl/⌘: on the small ticks of the ruler alone. */
  byTick: boolean;
  /** Snapping suspended (Shift, for an end being dragged). */
  free: boolean;
}

/** Where an end of the region goes for the time `t` under the pointer, within `[0, limit]`. */
function edgeTime(t: number, limit: number, { byTick, free }: EdgeKeys): number {
  const { project } = useProjectStore.getState();
  t = Math.min(Math.max(t, 0), limit);
  const options = snapOptions(project, new Set());
  if (byTick) return nearestTick(t, options.grid, limit);
  if (useTimelineStore.getState().snap && !free) t += snapOffset(t, options);
  return Math.min(Math.max(t, 0), limit);
}

/** `timeAt` gives the time under a client x and `seekTo` puts the playhead there, as a press on
 * the ruler does (`useTimelineGestures`); `limit` is the last second the ruler lays out. */
export function useRegionGestures(
  timeAt: (clientX: number) => number,
  seekTo: (clientX: number) => void,
  limit: number,
) {
  /** Shift pressed on the ruler: past the drag threshold, the region between where the pointer
   * was pressed and where it is. Let go before that, or shorter than a frame, the press marks
   * nothing and the region stays as it was. */
  const startRegion = useCallback(
    (e: ReactPointerEvent) => {
      if (!isMainClick(e)) return;
      e.preventDefault();
      // What comes back when nothing is drawn: the region as it was marked.
      const before = useTimelineStore.getState().markedRegion;
      const press = screenPoint(e);
      const anchor = edgeTime(timeAt(along(e)), limit, {
        byTick: e.ctrlKey || e.metaKey,
        free: false,
      });
      let started = false;
      let drawn: TimeRegion | null = null;
      trackPointer(e.pointerId, {
        move: (ev) => {
          if (!started) {
            if (!isDrag(ev, press)) return;
            started = true;
          }
          const { fps } = useProjectStore.getState().project.meta;
          const to = edgeTime(timeAt(along(ev)), limit, {
            byTick: ev.ctrlKey || ev.metaKey,
            free: false,
          });
          drawn = regionBetween(anchor, to, fps);
          useTimelineStore.getState().setRegion(drawn);
        },
        end: (_ev, cancelled) => {
          if (started && (cancelled || !drawn)) useTimelineStore.getState().setRegion(before);
        },
      });
    },
    [timeAt, limit],
  );

  /** Press on one of the region's two marks: past the drag threshold, drag that end — the other
   * stays, and stops it a frame away. Let go before that, it was a press on the ruler. */
  const startRegionEdge = useCallback(
    (e: ReactPointerEvent, edge: RegionEdge) => {
      if (!isMainClick(e)) return;
      e.preventDefault();
      e.stopPropagation(); // the ruler's own press would move the playhead at once
      // The mark dragged is the one shown; Escape brings back the region as it was marked.
      const { region: before, markedRegion: marked } = useTimelineStore.getState();
      if (!before) return;
      const press = screenPoint(e);
      // The mark keeps under the pointer the point it was grabbed by.
      const grab = timeAt(along(e)) - before[edge];
      let started = false;
      trackPointer(e.pointerId, {
        move: (ev) => {
          if (!started) {
            if (!isDrag(ev, press)) return;
            started = true;
          }
          const { fps } = useProjectStore.getState().project.meta;
          const t = edgeTime(timeAt(along(ev)) - grab, limit, {
            byTick: ev.ctrlKey || ev.metaKey,
            free: ev.shiftKey,
          });
          useTimelineStore.getState().setRegion(withEdge(before, edge, t, fps));
        },
        end: (_ev, cancelled) => {
          if (cancelled) useTimelineStore.getState().setRegion(marked);
          else if (!started) seekTo(along(press));
        },
      });
    },
    [timeAt, seekTo, limit],
  );

  return { startRegion, startRegionEdge };
}
