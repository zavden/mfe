import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineSlider } from '../TimelineSlider';
import { useTimelineStore } from '../timelineStore';

/* jsdom lays nothing out: the view's sizes are given to the scrolling element, the bar's to the
 * slider, and a scroll event tells the slider to read them again (in a browser the resizes do
 * too). The bar starts at x = 0, so a pointer's `clientX` is its place along the bar. */

const BAR = 500;
/** The view: the header column (188 px) and 1000 px of lanes. */
const VIEW = 1188;

beforeEach(() => {
  useTimelineStore.setState({ pxPerSecond: 80 });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'timeline-slider' ? BAR : 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** The slider of a view over a timeline `whole` px wide, header column included. */
function mount(whole: number) {
  const scroll = document.createElement('div');
  scroll.id = 'the-timeline';
  scroll.append(document.createElement('div'));
  document.body.append(scroll);
  Object.defineProperty(scroll, 'clientWidth', { value: VIEW });
  Object.defineProperty(scroll, 'scrollWidth', { value: whole, writable: true });
  const { unmount } = render(
    <TimelineSlider scrollRef={{ current: scroll }} controls="the-timeline" />,
  );
  return {
    scroll,
    unmount,
    slider: screen.getByTestId('timeline-slider'),
    thumb: screen.getByTestId('timeline-slider-thumb'),
  };
}

const scrollTo = (scroll: HTMLElement, left: number) => {
  scroll.scrollLeft = left;
  fireEvent.scroll(scroll);
};

describe('TimelineSlider', () => {
  it('is the scroll bar of the timeline', () => {
    const { slider } = mount(2188);
    expect(slider).toHaveAttribute('role', 'scrollbar');
    expect(slider).toHaveAttribute('aria-controls', 'the-timeline');
    expect(slider).toHaveAttribute('aria-orientation', 'horizontal');
    expect(slider).toHaveAccessibleName('Timeline position');
  });

  it('fills the bar, out of reach, while the whole timeline is in view', () => {
    const { slider, thumb } = mount(VIEW);
    expect(thumb).toHaveStyle({ left: '0px', width: `${BAR}px` });
    expect(slider).toHaveClass('is-idle');
    expect(slider).toHaveAttribute('aria-disabled', 'true');
    expect(slider).toHaveAttribute('tabindex', '-1');
    expect(slider).toHaveAttribute('title', 'The whole timeline is in view');
  });

  it('has a thumb as long as the share in view, which follows the scroll of the view', () => {
    // 1000 px of lanes in view out of 2000: half the bar.
    const { scroll, slider, thumb } = mount(2188);
    expect(thumb).toHaveStyle({ left: '0px', width: '250px' });
    expect(slider).not.toHaveClass('is-idle');
    expect(slider).toHaveAttribute('aria-disabled', 'false');
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    expect(slider).toHaveAttribute('aria-valuetext', '0.0 s to 12.5 s');
    scrollTo(scroll, 400);
    expect(thumb).toHaveStyle({ left: '100px', width: '250px' });
    expect(slider).toHaveAttribute('aria-valuenow', '40');
    expect(slider).toHaveAttribute('aria-valuetext', '5.0 s to 17.5 s');
    // A closer zoom: the timeline is longer, the thumb shorter.
    (scroll as unknown as { scrollWidth: number }).scrollWidth = 4188;
    scrollTo(scroll, 0);
    expect(thumb).toHaveStyle({ left: '0px', width: '125px' });
  });

  it('scrolls the view as its thumb is dragged, until the release', () => {
    const { scroll, slider } = mount(2188);
    // Held 30 px into the thumb: its left end goes with the pointer, less those 30 px.
    fireEvent.pointerDown(slider, { button: 0, pointerId: 3, clientX: 30 });
    expect(slider).toHaveClass('is-dragging');
    expect(scroll.scrollLeft).toBe(0);
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 130 });
    expect(scroll.scrollLeft).toBe(400);
    fireEvent.pointerMove(window, { pointerId: 9, clientX: 300 }); // another pointer
    expect(scroll.scrollLeft).toBe(400);
    // Past the bar's ends the view stops at its own.
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 900 });
    expect(scroll.scrollLeft).toBe(1000);
    fireEvent.pointerMove(window, { pointerId: 3, clientX: -200 });
    expect(scroll.scrollLeft).toBe(0);
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 80 });
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 80 });
    expect(slider).not.toHaveClass('is-dragging');
    expect(scroll.scrollLeft).toBe(200);
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 200 });
    expect(scroll.scrollLeft).toBe(200);
  });

  it('brings the thumb under a press beside it, and Escape puts the view back', () => {
    const { scroll, slider } = mount(2188);
    scrollTo(scroll, 100); // the thumb is at 25…275
    // Its middle (125 px in) comes to the pointer: its left end at 225.
    fireEvent.pointerDown(slider, { button: 0, pointerId: 3, clientX: 350 });
    expect(scroll.scrollLeft).toBe(900);
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 300 });
    expect(scroll.scrollLeft).toBe(700);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(scroll.scrollLeft).toBe(100);
    expect(slider).not.toHaveClass('is-dragging');
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 400 });
    expect(scroll.scrollLeft).toBe(100);
  });

  it('answers the main button only, and nothing while there is nothing to move', () => {
    const { scroll, slider } = mount(2188);
    fireEvent.pointerDown(slider, { button: 1, pointerId: 3, clientX: 350 });
    fireEvent.pointerDown(slider, { button: 2, pointerId: 3, clientX: 350 });
    expect(slider).not.toHaveClass('is-dragging');
    expect(scroll.scrollLeft).toBe(0);
    document.body.replaceChildren();
    const idle = mount(VIEW);
    fireEvent.pointerDown(idle.slider, { button: 0, pointerId: 3, clientX: 350 });
    expect(idle.slider).not.toHaveClass('is-dragging');
    expect(idle.scroll.scrollLeft).toBe(0);
  });

  it('does not take the focus when pressed', () => {
    const { slider } = mount(2188);
    // `fireEvent` answers false when the default was prevented.
    expect(fireEvent.mouseDown(slider)).toBe(false);
  });

  it('moves the view with the keys, which are then its own', () => {
    const { scroll, slider } = mount(4188);
    const key = (name: string, init: KeyboardEventInit = {}) =>
      fireEvent.keyDown(slider, { key: name, ...init });
    expect(key('ArrowRight')).toBe(false);
    expect(scroll.scrollLeft).toBe(100);
    expect(key('PageDown')).toBe(false);
    expect(scroll.scrollLeft).toBe(1100);
    expect(key('ArrowLeft')).toBe(false);
    expect(scroll.scrollLeft).toBe(1000);
    expect(key('End')).toBe(false);
    expect(scroll.scrollLeft).toBe(3000);
    expect(key('PageUp')).toBe(false);
    expect(scroll.scrollLeft).toBe(2000);
    expect(key('Home')).toBe(false);
    expect(scroll.scrollLeft).toBe(0);
    // Any other key, and the shortcuts made with a modifier, go on to whoever listens.
    expect(key('ArrowDown')).toBe(true);
    expect(key(' ')).toBe(true);
    expect(key('ArrowRight', { altKey: true })).toBe(true);
    expect(key('ArrowRight', { ctrlKey: true })).toBe(true);
    expect(key('End', { metaKey: true })).toBe(true);
    expect(scroll.scrollLeft).toBe(0);
  });

  it('ends a drag when it is taken away', () => {
    const { scroll, slider, unmount } = mount(2188);
    fireEvent.pointerDown(slider, { button: 0, pointerId: 3, clientX: 30 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 130 });
    expect(scroll.scrollLeft).toBe(400);
    unmount();
    // The drag was given up: the view is back, and the pointer moves nothing any more.
    expect(scroll.scrollLeft).toBe(0);
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 230 });
    expect(scroll.scrollLeft).toBe(0);
  });
});
