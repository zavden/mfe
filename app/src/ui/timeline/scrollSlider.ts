/* The geometry of the timeline's slider (TimelineSlider.tsx): a bar in the toolbar whose thumb is
 * to the bar what the stretch of time in view is to the whole timeline. While everything is in
 * view the thumb is as long as the bar, and there is nothing to move; the closer the zoom, the
 * shorter the thumb, and moving it scrolls the timeline sideways. Lengths are CSS px. */

/** What a scrolling element tells about its sideways scroll. */
export interface ScrollView {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

/** The shortest thumb: what can still be seen and held at the closest zoom of a long scene. */
export const MIN_THUMB = 24;

/** The thumb's travel (px) under which it counts as filling the bar: a pixel of scroll left
 * over by rounding is not something to move along. */
const LEAST_TRAVEL = 1;

export interface SliderThumb {
  /** From the bar's left end. */
  left: number;
  width: number;
  /** False when there is nothing to scroll: the thumb then fills the bar. */
  movable: boolean;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** How far the view can scroll. */
export const scrollRange = (view: ScrollView): number =>
  Math.max(0, view.scrollWidth - view.clientWidth);

/** The thumb of a bar `bar` wide for `view`. `fixed` is the width of what stays in place at the
 * view's left while the rest scrolls under it (the column of track headers): it is no part of
 * the timeline, neither of what is in view nor of the whole. */
export function sliderThumb(view: ScrollView, bar: number, fixed = 0): SliderThumb {
  if (!(bar > 0)) return { left: 0, width: 0, movable: false };
  const range = scrollRange(view);
  const whole = view.scrollWidth - fixed;
  const shown = view.clientWidth - fixed;
  const full = { left: 0, width: bar, movable: false };
  if (range <= 0 || whole <= 0 || shown <= 0) return full;
  const width = Math.min(bar, Math.max(MIN_THUMB, (bar * shown) / whole));
  const travel = bar - width;
  if (travel < LEAST_TRAVEL) return full;
  return { left: travel * clamp(view.scrollLeft / range, 0, 1), width, movable: true };
}

/** The scroll that puts the thumb's left end at `left` (kept inside the bar): the reverse of
 * `sliderThumb`. The view's own scroll when the thumb cannot move. */
export function scrollForThumb(left: number, view: ScrollView, bar: number, fixed = 0): number {
  const thumb = sliderThumb(view, bar, fixed);
  if (!thumb.movable) return view.scrollLeft;
  return clamp(left / (bar - thumb.width), 0, 1) * scrollRange(view);
}

/** Where on the thumb a press at `x` of the bar holds it (from the thumb's left end): where it
 * was pressed, or its middle for a press beside it — the thumb then comes under the pointer. */
export function thumbHold(x: number, thumb: SliderThumb): number {
  return x >= thumb.left && x <= thumb.left + thumb.width ? x - thumb.left : thumb.width / 2;
}

/** The share of the view an arrow key scrolls. */
const KEY_STEP = 0.1;

/** Where a key takes the view's scroll: the arrows a tenth of what is in view, Page Up and Page
 * Down all of it, Home and End to the ends. Null for any other key. */
export function keyScroll(key: string, view: ScrollView, fixed = 0): number | null {
  const range = scrollRange(view);
  const page = Math.max(1, view.clientWidth - fixed);
  const by = (delta: number) => clamp(view.scrollLeft + delta, 0, range);
  switch (key) {
    case 'ArrowLeft':
      return by(-page * KEY_STEP);
    case 'ArrowRight':
      return by(page * KEY_STEP);
    case 'PageUp':
      return by(-page);
    case 'PageDown':
      return by(page);
    case 'Home':
      return 0;
    case 'End':
      return range;
    default:
      return null;
  }
}

/** The view's scroll as a whole percentage of its range (0 when there is none). */
export function scrollPercent(view: ScrollView): number {
  const range = scrollRange(view);
  return range > 0 ? Math.round(clamp(view.scrollLeft / range, 0, 1) * 100) : 0;
}
