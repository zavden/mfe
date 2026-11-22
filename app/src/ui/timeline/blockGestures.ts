/* Pointer gestures on an animation block: a press selects it, dragging its body moves it inside
 * its clip and dragging an edge resizes it. The block snaps (like clips) to the playhead, the
 * ruler grid, the edges of the clip's other blocks, the end of the intro, the start of the outro
 * and the clip's relation windows; Shift suspends that. It never leaves its allowed range
 * (ui/animations/blockRange); Shift does not change that. While it is dragged it takes the top
 * lane of its clip and keeps it afterwards (`topBlock` in the timeline store), and a readout under
 * it gives its time, what it runs alongside and, when the planner holds it short of where the
 * pointer asks, why (`blockDrag`; the block is marked meanwhile). One drag is one undo step;
 * Escape cancels it. Tracks that are locked can select but not edit. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ActionId, ClipId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { setBlockTiming } from '../animations/blockActions';
import {
  blockLimits,
  clampTiming,
  findBlock,
  sameTiming,
  type Timing,
} from '../animations/blockRange';
import type { BlockEdge } from './ActionBlock';
import { stoppedShort, stopReason } from './blockDrag';
import { snapEdges } from './clipOps';
import { blockSnapPoints } from './blockSnap';
import { DRAG_THRESHOLD, isMainClick } from '../pointer';
import { trackProjectPointer } from '../project/trackProjectPointer';
import { useTimelineStore } from './timelineStore';
import { snapOptionsAt } from './useTimelineGestures';
import { along } from './axis';

/** Press on a block (`edge`: its body or one of its edges). */
export function startBlockGesture(
  e: ReactPointerEvent,
  clipId: ClipId,
  actionId: ActionId,
  edge: BlockEdge,
): void {
  if (!isMainClick(e)) return;
  e.stopPropagation();
  if (edge !== 'move') e.preventDefault();
  useUiStore.getState().select({ kind: 'action', clipId, actionId });

  const project = useProjectStore.getState().project;
  const found = findBlock(project, clipId, actionId);
  if (!found) return;
  const { clip, action } = found;
  if (project.tracks.find((t) => t.id === clip.trackId)?.locked) return;

  // Everything the drag depends on is fixed when it starts: the block alone changes meanwhile.
  const limits = blockLimits(project, clip, actionId);
  const points = blockSnapPoints(project, clip, actionId, useUiStore.getState().time);
  const startX = along(e);
  const end0 = action.start + action.duration;
  let started = false;
  let last: Timing = { start: action.start, duration: action.duration };
  let lastStop: string | null = null;

  trackProjectPointer(e, {
    move: (ev, begin) => {
      if (!started) {
        if (Math.abs(along(ev) - startX) < DRAG_THRESHOLD) return;
        started = true;
        begin();
        useTimelineStore.getState().setTopBlock(actionId);
        useTimelineStore.getState().setBlockDrag({ actionId, stop: null });
      }
      const { pxPerSecond, snap } = useTimelineStore.getState();
      const dt = (along(ev) - startX) / pxPerSecond;
      let start = action.start;
      let end = end0;
      if (edge === 'move') {
        start += dt;
        end += dt;
      } else if (edge === 'start') start += dt;
      else end += dt;
      if (snap && !ev.shiftKey) {
        const options = snapOptionsAt(points, project.meta.fps);
        // The edge being moved first: the grid applies to it.
        const edges =
          edge === 'move'
            ? [clip.start + start, clip.start + end]
            : [clip.start + (edge === 'start' ? start : end)];
        const offset = snapEdges(edges, options);
        if (edge === 'move') {
          start += offset;
          end += offset;
        } else if (edge === 'start') start += offset;
        else end += offset;
      }
      const timing = clampTiming(project, clip, actionId, { start, end }, edge, limits);
      // Held short of the pointer: say why, for the block where the pointer asked it to be.
      const stop = stoppedShort(timing, { start, end }, edge)
        ? stopReason(project, clip, actionId, { start, end }, timing, edge)
        : null;
      if (stop !== lastStop) {
        lastStop = stop;
        useTimelineStore.getState().setBlockDrag({ actionId, stop });
      }
      if (sameTiming(timing, last)) return;
      last = timing;
      begin().run(() => setBlockTiming(clipId, actionId, timing));
    },
    end: () => {
      if (!started) return;
      useTimelineStore.getState().setBlockDrag(null);
    },
  });
}
