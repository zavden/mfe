/* Zooming the timeline: Ctrl/⌘ + wheel around the pointer (a pinch of the trackpad on a Mac, at
 * the rate of the gesture: `../pinch.ts`), the toolbar's buttons around the centre of the view,
 * and the whole timeline in view (`wholeZoom`: the zoom at which nothing is left to scroll, which
 * the zoom's minimum never stops short of). The time under the anchor stays where it was on
 * screen. */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { lowestZoom, wholeZoom } from './ruler';
import { useTimelineStore } from './timelineStore';
import { along, boxOf, timelineVertical, wheelOf } from './axis';
import { headerWidth } from './headerWidth';
import { zoomFactor } from '../pinch';

export function useTimelineZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  timeAt: (clientX: number) => number,
  /** The seconds the timeline lays out (`timelineExtent`), which `showAll` puts in view. */
  extent: number,
) {
  const px = useTimelineStore((s) => s.pxPerSecond);
  const setZoom = useTimelineStore((s) => s.setZoom);
  // The headers are another length when the timeline turns (headerWidth.ts).
  const vertical = useTimelineStore((s) => s.vertical);
  /** Time under the pointer to keep fixed on screen after a wheel zoom. */
  const anchor = useRef<{ time: number; offsetX: number } | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () =>
      useTimelineStore
        .getState()
        .setMinimumZoom(lowestZoom(extent, element.clientWidth - headerWidth()));
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [extent, scrollRef, vertical]);

  // Ctrl/⌘ + wheel zooms around the pointer; the plain wheel scrolls.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        // Horizontal, the browser scrolls. Vertical, the scroller is turned and the browser
        // would scroll it its own way: the wheel that turns down the screen goes along time
        // here, and the one that turns sideways — or with Shift — across the tracks.
        if (!timelineVertical()) return;
        e.preventDefault();
        const turn = wheelOf(e);
        const sideways = e.shiftKey && turn.y === 0;
        el.scrollLeft += sideways ? 0 : turn.x;
        el.scrollTop += sideways ? turn.x : turn.y;
        return;
      }
      e.preventDefault();
      const state = useTimelineStore.getState();
      anchor.current = {
        time: timeAt(along(e)),
        offsetX: along(e) - boxOf(el).left,
      };
      state.setZoom(state.pxPerSecond * zoomFactor(e, 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [timeAt, scrollRef]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = Math.max(0, headerWidth() + a.time * px - a.offsetX);
  }, [px, scrollRef]);

  const zoomBy = useCallback(
    (factor: number) => {
      const el = scrollRef.current;
      if (el) {
        const centre = el.clientWidth / 2;
        anchor.current = {
          time: (el.scrollLeft + centre - headerWidth()) / useTimelineStore.getState().pxPerSecond,
          offsetX: centre,
        };
      }
      setZoom(useTimelineStore.getState().pxPerSecond * factor);
    },
    [setZoom, scrollRef],
  );

  const showAll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setZoom(wholeZoom(extent, el.clientWidth - headerWidth()));
    el.scrollLeft = 0;
  };

  return { zoomBy, showAll };
}
