import { describe, expect, it } from 'vitest';
import { MIN_THUMB, barThumb, scrollForThumbMove } from '../scrollbar';

describe('the thumb of a scrollbar drawn by hand', () => {
  it('is as long as the part in view, and placed as far along as the view is', () => {
    // A view of 200 px of 1000, on a bar of 400: a fifth of the bar, 80 px.
    expect(barThumb(0, 200, 1000, 400)).toEqual({ offset: 0, size: 80, movable: true });
    expect(barThumb(400, 200, 1000, 400)).toEqual({ offset: 160, size: 80, movable: true });
    expect(barThumb(800, 200, 1000, 400)).toEqual({ offset: 320, size: 80, movable: true });
  });

  it('is never too short to grab, and is not there when everything is in view', () => {
    expect(barThumb(0, 100, 100000, 300).size).toBe(MIN_THUMB);
    expect(barThumb(99900, 100, 100000, 300).offset).toBe(300 - MIN_THUMB);
    expect(barThumb(0, 500, 500, 300)).toEqual({ offset: 0, size: 300, movable: false });
    expect(barThumb(0, 500, 400, 300).movable).toBe(false);
    // A bar with no length yet (it is drawn only once there is something to scroll) says so.
    expect(barThumb(0, 500, 1000, 0)).toEqual({ offset: 0, size: 0, movable: true });
  });

  it('dragged, scrolls the view by as much of the content as the thumb moved of its travel', () => {
    // 320 px of travel for 800 px of scroll: 40 px of thumb are 100 px of content.
    expect(scrollForThumbMove(0, 40, 200, 1000, 400)).toBe(100);
    expect(scrollForThumbMove(400, -40, 200, 1000, 400)).toBe(300);
    // It stops at the ends.
    expect(scrollForThumbMove(700, 400, 200, 1000, 400)).toBe(800);
    expect(scrollForThumbMove(100, -400, 200, 1000, 400)).toBe(0);
    // Nothing to scroll: nothing moves.
    expect(scrollForThumbMove(0, 50, 500, 500, 300)).toBe(0);
  });
});
