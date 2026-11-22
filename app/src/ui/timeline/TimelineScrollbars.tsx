/* The scrollbars of the vertical timeline (Zen mode, D188). The well's own scrollbars would be
 * turned with it: the browser's are hidden, and these are drawn by hand in the well's place,
 * outside what is turned, so they read the screen as it is. The bar of time runs down the left
 * edge, away from the ruler; the bar of the tracks, along the bottom, is there only while the
 * tracks do not all fit. The first track is on the right, beside the ruler (D193): the thumb of
 * the tracks starts at the right end of its bar and goes to the left as the view goes on. */
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { isMainClick, trackPointer } from '../pointer';
import { barThumb, scrollForThumbMove } from './scrollbar';

type Axis = 'time' | 'tracks';

interface View {
  scroll: number;
  client: number;
  total: number;
}

/** The scroller's view along an axis. Time is its x and the tracks its y, as it is laid out. */
function viewOf(element: HTMLElement, axis: Axis): View {
  return axis === 'time'
    ? { scroll: element.scrollLeft, client: element.clientWidth, total: element.scrollWidth }
    : { scroll: element.scrollTop, client: element.clientHeight, total: element.scrollHeight };
}

function Bar({
  axis,
  scrollRef,
  onOverflow,
}: {
  axis: Axis;
  scrollRef: RefObject<HTMLDivElement | null>;
  onOverflow?(overflows: boolean): void;
}) {
  const [view, setView] = useState<View>({ scroll: 0, client: 0, total: 0 });
  const [bar, setBar] = useState(0);
  const [barElement, setBarElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !barElement) return;
    const read = () => {
      const next = viewOf(scroll, axis);
      setView((now) =>
        now.scroll === next.scroll && now.client === next.client && now.total === next.total
          ? now
          : next,
      );
      // On the screen the bar of time stands and the bar of the tracks lies.
      setBar(axis === 'time' ? barElement.clientHeight : barElement.clientWidth);
    };
    read();
    scroll.addEventListener('scroll', read, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(scroll);
    if (scroll.firstElementChild) observer?.observe(scroll.firstElementChild);
    observer?.observe(barElement);
    return () => {
      scroll.removeEventListener('scroll', read);
      observer?.disconnect();
    };
  }, [axis, scrollRef, barElement]);

  const thumb = barThumb(view.scroll, view.client, view.total, bar);
  useEffect(() => onOverflow?.(thumb.movable), [onOverflow, thumb.movable]);

  const set = (value: number) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    if (axis === 'time') scroll.scrollLeft = value;
    else scroll.scrollTop = value;
  };
  /** Where a point of the screen is along the bar, the way its view goes on: down the screen for
   * the time, to the left for the tracks. */
  const along = (event: { clientX: number; clientY: number }) =>
    axis === 'time' ? event.clientY : -event.clientX;

  const onThumbDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMainClick(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const scroll = scrollRef.current;
    if (!scroll) return;
    const from = viewOf(scroll, axis);
    const start = along(event);
    trackPointer(event.pointerId, {
      move: (e) =>
        set(scrollForThumbMove(from.scroll, along(e) - start, from.client, from.total, bar)),
      end: (_, cancelled) => {
        if (cancelled) set(from.scroll);
      },
    });
  };

  /** A press on the bar beside the thumb: a view's length that way. */
  const onBarDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMainClick(event) || !thumb.movable) return;
    const box = event.currentTarget.getBoundingClientRect();
    // From the end of the bar the view starts at: its top, or its right end.
    const at = axis === 'time' ? event.clientY - box.top : box.right - event.clientX;
    const step = view.client * 0.9;
    set(view.scroll + (at < thumb.offset ? -step : step));
  };

  return (
    <div
      className={`tl-bar is-${axis}${thumb.movable ? '' : ' is-idle'}`}
      data-testid={`timeline-bar-${axis}`}
      ref={setBarElement}
      aria-hidden="true"
      onPointerDown={onBarDown}
    >
      {thumb.movable && (
        <div
          className="tl-bar-thumb"
          data-testid={`timeline-bar-${axis}-thumb`}
          style={
            axis === 'time'
              ? { top: thumb.offset, height: thumb.size }
              : { right: thumb.offset, width: thumb.size }
          }
          onPointerDown={onThumbDown}
        />
      )}
    </div>
  );
}

export function TimelineScrollbars({
  scrollRef,
  onTracksOverflow,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The tracks do not all fit (or do again): the well leaves the bar its room. */
  onTracksOverflow(overflows: boolean): void;
}) {
  return (
    <>
      <Bar axis="time" scrollRef={scrollRef} />
      <Bar axis="tracks" scrollRef={scrollRef} onOverflow={onTracksOverflow} />
    </>
  );
}
