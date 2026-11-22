/* The timeline's slider: a bar in the toolbar with a thumb as long, against the bar, as the
 * stretch of time in view is against the whole timeline (scrollSlider.ts). While everything is in
 * view the thumb fills the bar and there is nothing to move; the closer the zoom, the shorter it
 * gets, and dragging it scrolls the timeline sideways — a press beside it brings it under the
 * pointer first. Escape puts the view back where the drag found it.
 *
 * It is the scroll bar of the timeline's scrolling element, which stays the one place where the
 * scroll is kept: the slider reads it (its scroll events, its size and the size of its content)
 * and writes `scrollLeft`. Like the buttons beside it, a press does not take the focus; reached
 * with Tab, the arrows, Page Up, Page Down, Home and End move the view. */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { keepFocus } from '../focus';
import { isMainClick, trackPointer } from '../pointer';
import {
  keyScroll,
  scrollForThumb,
  scrollPercent,
  sliderThumb,
  thumbHold,
  type ScrollView,
} from './scrollSlider';
import { useTimelineStore } from './timelineStore';
import { useHeaderWidth } from './headerWidth';

interface TimelineSliderProps {
  /** The timeline's scrolling element. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Its id, for assistive technology (`aria-controls`). */
  controls: string;
}

const viewOf = (scroll: HTMLElement): ScrollView => ({
  scrollLeft: scroll.scrollLeft,
  clientWidth: scroll.clientWidth,
  scrollWidth: scroll.scrollWidth,
});

const seconds = (value: number) => `${Math.max(0, value).toFixed(1)} s`;

export function TimelineSlider({ scrollRef, controls }: TimelineSliderProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ScrollView>({ scrollLeft: 0, clientWidth: 0, scrollWidth: 0 });
  const [bar, setBar] = useState(0);
  const [dragging, setDragging] = useState(false);
  const px = useTimelineStore((s) => s.pxPerSecond);
  /** Ends the drag under way, if any. */
  const stopDrag = useRef<(() => void) | null>(null);

  useEffect(() => {
    const scroll = scrollRef.current;
    const barElement = barRef.current;
    if (!scroll || !barElement) return;
    const read = () => {
      const next = viewOf(scroll);
      // The tracks scroll up and down too: that changes nothing here.
      setView((current) =>
        current.scrollLeft === next.scrollLeft &&
        current.clientWidth === next.clientWidth &&
        current.scrollWidth === next.scrollWidth
          ? current
          : next,
      );
      setBar(barElement.clientWidth);
    };
    read();
    scroll.addEventListener('scroll', read, { passive: true });
    // The view's size, the size of what it scrolls (the zoom, the scene's length) and the bar's.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(scroll);
    if (scroll.firstElementChild) observer?.observe(scroll.firstElementChild);
    observer?.observe(barElement);
    return () => {
      scroll.removeEventListener('scroll', read);
      observer?.disconnect();
    };
  }, [scrollRef]);

  useEffect(() => () => stopDrag.current?.(), []);

  const header = useHeaderWidth();
  const thumb = sliderThumb(view, bar, header);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroll = scrollRef.current;
    const barElement = event.currentTarget;
    if (!isMainClick(event) || !scroll || stopDrag.current) return;
    const width = barElement.clientWidth;
    const pressed = sliderThumb(viewOf(scroll), width, header);
    if (!pressed.movable) return;
    const barLeft = () => barElement.getBoundingClientRect().left;
    const hold = thumbHold(event.clientX - barLeft(), pressed);
    const from = scroll.scrollLeft;
    const follow = (clientX: number) => {
      scroll.scrollLeft = scrollForThumb(clientX - barLeft() - hold, viewOf(scroll), width, header);
    };
    follow(event.clientX);
    try {
      // The drag goes on over the other panels and outside the window, under one cursor.
      barElement.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still drags the thumb while it is over the page.
    }
    setDragging(true);
    stopDrag.current = trackPointer(event.pointerId, {
      move: (e) => follow(e.clientX),
      end: (_e, cancelled) => {
        stopDrag.current = null;
        setDragging(false);
        if (cancelled) scroll.scrollLeft = from;
      },
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const scroll = scrollRef.current;
    if (!scroll || event.ctrlKey || event.metaKey || event.altKey) return;
    const next = keyScroll(event.key, viewOf(scroll), header);
    if (next === null) return;
    // The key is the slider's: the arrows step the playhead otherwise (Transport).
    event.preventDefault();
    scroll.scrollLeft = next;
  };

  const from = view.scrollLeft / px;
  const to = (view.scrollLeft + view.clientWidth - header) / px;
  return (
    <div
      className={`tl-slider${thumb.movable ? '' : ' is-idle'}${dragging ? ' is-dragging' : ''}`}
      ref={barRef}
      role="scrollbar"
      aria-label="Timeline position"
      aria-controls={controls}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={scrollPercent(view)}
      aria-valuetext={`${seconds(from)} to ${seconds(to)}`}
      aria-disabled={!thumb.movable}
      tabIndex={thumb.movable ? 0 : -1}
      title={thumb.movable ? 'Drag to move along the timeline' : 'The whole timeline is in view'}
      data-testid="timeline-slider"
      onMouseDown={keepFocus}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div
        className="tl-slider-thumb"
        data-testid="timeline-slider-thumb"
        style={{ left: thumb.left, width: thumb.width }}
      />
    </div>
  );
}
