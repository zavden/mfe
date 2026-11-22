import { afterEach, describe, expect, it } from 'vitest';
import {
  across,
  along,
  arrowOf,
  boxOf,
  setTimelineVertical,
  timelineVertical,
  wheelOf,
} from '../axis';
import { headerWidth } from '../headerWidth';
import { HEADER_WIDTH, VERTICAL_HEADER_WIDTH } from '../layout';
import { STANDARD_SIZES, VERTICAL_SIZES } from '../rowSizes';
import { useTimelineStore } from '../timelineStore';

afterEach(() => {
  useTimelineStore.getState().setVertical(false);
  setTimelineVertical(false);
});

const point = { clientX: 30, clientY: 400 };
const element = {
  getBoundingClientRect: () => ({
    left: 10,
    top: 200,
    right: 60,
    bottom: 700,
    width: 50,
    height: 500,
  }),
} as unknown as Element;

describe('the timeline’s own space', () => {
  it('is the screen’s while the timeline is horizontal', () => {
    expect(timelineVertical()).toBe(false);
    expect([along(point), across(point)]).toEqual([30, 400]);
    expect(boxOf(element)).toEqual({
      left: 10,
      top: 200,
      right: 60,
      bottom: 700,
      width: 50,
      height: 500,
    });
    expect(wheelOf({ deltaX: 3, deltaY: 100 })).toEqual({ x: 3, y: 100 });
  });

  it('is turned a quarter while it is vertical: time runs down, the tracks towards the left', () => {
    setTimelineVertical(true);
    expect(timelineVertical()).toBe(true);
    // Across the tracks the space grows away from the ruler, which is on the right.
    expect([along(point), across(point)]).toEqual([400, -30]);
    // A column 50 px wide and 500 px tall is 500 px of time and 50 px across the tracks: its top,
    // the side the ruler is on, is its right edge.
    expect(boxOf(element)).toEqual({
      left: 200,
      top: -60,
      right: 700,
      bottom: -10,
      width: 500,
      height: 50,
    });
    // A point 20 px to the left of that edge is 20 px into the box across the tracks.
    expect(across({ clientX: 40, clientY: 0 }) - boxOf(element).top).toBe(20);
    // The wheel that turns down the screen goes along time; to the right, towards the ruler.
    expect(wheelOf({ deltaX: 3, deltaY: 100 })).toEqual({ x: 100, y: -3 });
    expect(Object.is(wheelOf({ deltaX: 0, deltaY: 100 }).y, 0)).toBe(true);
  });

  it('takes the arrow that goes the same way on the screen', () => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'];
    expect(keys.map(arrowOf)).toEqual(keys);
    setTimelineVertical(true);
    // Down the screen is later in time, which is ArrowRight in the timeline's space; to the
    // right of the screen is towards the ruler and the first track, which is ArrowUp there.
    expect(keys.map(arrowOf)).toEqual(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter']);
  });
});

describe('the timeline’s store, told which way it is drawn', () => {
  it('tells the axis, and the headers are a shorter band along a vertical timeline', () => {
    expect(headerWidth()).toBe(HEADER_WIDTH);
    useTimelineStore.getState().setVertical(true);
    expect(timelineVertical()).toBe(true);
    expect(headerWidth()).toBe(VERTICAL_HEADER_WIDTH);
    expect(VERTICAL_HEADER_WIDTH).toBeLessThan(HEADER_WIDTH);
    useTimelineStore.getState().setVertical(false);
    expect(timelineVertical()).toBe(false);
    expect(headerWidth()).toBe(HEADER_WIDTH);
  });

  it('keeps the sizes of the tracks of each way, wider at first when vertical', () => {
    const store = useTimelineStore.getState();
    store.setRowSizes(STANDARD_SIZES);
    useTimelineStore.setState({ otherRowSizes: VERTICAL_SIZES });
    store.setVertical(true);
    expect(useTimelineStore.getState().rowSizes).toBe(VERTICAL_SIZES);
    expect(VERTICAL_SIZES.zoom).toBeGreaterThan(STANDARD_SIZES.zoom);
    // A size changed while vertical stays the vertical timeline's.
    const taller = { zoom: 2, tracks: new Map() };
    useTimelineStore.getState().setRowSizes(taller);
    useTimelineStore.getState().setVertical(false);
    expect(useTimelineStore.getState().rowSizes).toBe(STANDARD_SIZES);
    useTimelineStore.getState().setVertical(true);
    expect(useTimelineStore.getState().rowSizes).toBe(taller);
    // Told the same way twice, nothing is traded.
    useTimelineStore.getState().setVertical(true);
    expect(useTimelineStore.getState().rowSizes).toBe(taller);
  });
});
