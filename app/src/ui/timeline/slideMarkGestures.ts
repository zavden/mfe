/* Pointer gestures on a mark of the Slides mode (SlideMarks.tsx, D200): a press and a release
 * without a drag put the playhead on the mark; past the drag threshold the mark is dragged along
 * the ruler, inside the pause zone it stands in — on a frame, snapped to the playhead and to the
 * zone's edges while the Snap key is on (Shift suspends it) —, and a mark out of place to the
 * nearest time where one may stand, in any zone (`markMoveTime`). A pause is never dragged onto
 * the frame of another pause: it waits where it was. One drag is one undo step; Escape cancels
 * it. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { SlideMarkId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { isDrag, isMainClick, screenPoint } from '../pointer';
import { trackProjectPointer } from '../project/trackProjectPointer';
import { markMoveTime, withMarkMoved } from '../slides/slideOps';
import { mainPlayback } from '../transport/mainPlayback';
import { along, boxOf } from './axis';
import { SNAP_DISTANCE } from './layout';
import { useTimelineStore } from './timelineStore';

/** Press on a mark; `onDragging` says when a drag starts and ends (the mark's tooltip follows it
 * meanwhile). */
export function startSlideMarkGesture(
  event: ReactPointerEvent<HTMLElement>,
  id: SlideMarkId,
  onDragging: (dragging: boolean) => void,
): void {
  if (!isMainClick(event)) return;
  // The ruler's own press would move the playhead to the pointer, not to the mark.
  event.stopPropagation();
  const project = useProjectStore.getState().project;
  const mark = project.slides?.marks.find((m) => m.id === id);
  const ruler = event.currentTarget.closest('.tl-ruler');
  if (!mark || !ruler) return;
  // Everything the drag depends on is fixed when it starts: the mark alone changes meanwhile.
  const left = boxOf(ruler).left;
  const timeAt = (point: { clientX: number; clientY: number }) =>
    (along(point) - left) / useTimelineStore.getState().pxPerSecond;
  // The mark keeps under the pointer the point it was grabbed by.
  const grab = timeAt(event) - mark.time;
  const press = screenPoint(event);
  const playhead = useUiStore.getState().time;
  let started = false;
  let last = mark.time;
  trackProjectPointer(event, {
    move: (ev, begin) => {
      if (!started) {
        if (!isDrag(ev, press)) return;
        started = true;
        onDragging(true);
      }
      const { snap, pxPerSecond } = useTimelineStore.getState();
      const time = markMoveTime(
        project,
        mark,
        timeAt(ev) - grab,
        snap && !ev.shiftKey ? { playhead, threshold: SNAP_DISTANCE / pxPerSecond } : null,
      );
      if (time === null || time === last) return;
      last = time;
      begin().update((draft) => {
        if (draft.slides) draft.slides.marks = withMarkMoved(draft.slides.marks, id, time);
      });
    },
    end: (_ev, cancelled) => {
      if (started) onDragging(false);
      else if (!cancelled) mainPlayback.seek(mark.time);
    },
  });
}
