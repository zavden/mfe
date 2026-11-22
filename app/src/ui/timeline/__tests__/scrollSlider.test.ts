import { describe, expect, it } from 'vitest';
import {
  keyScroll,
  MIN_THUMB,
  scrollForThumb,
  scrollPercent,
  scrollRange,
  sliderThumb,
  thumbHold,
  type ScrollView,
} from '../scrollSlider';

const view = (scrollLeft: number, clientWidth: number, scrollWidth: number): ScrollView => ({
  scrollLeft,
  clientWidth,
  scrollWidth,
});

describe('sliderThumb', () => {
  it('fills the bar while the whole timeline is in view, and cannot move', () => {
    // The content is as wide as the view (a scroller is never narrower than what it shows).
    expect(sliderThumb(view(0, 1000, 1000), 500)).toEqual({ left: 0, width: 500, movable: false });
    expect(sliderThumb(view(0, 1000, 1000), 500, 164)).toEqual({
      left: 0,
      width: 500,
      movable: false,
    });
  });

  it('is to the bar what the stretch in view is to the whole, and shorter the closer the zoom', () => {
    const twice = sliderThumb(view(0, 1000, 2000), 500);
    expect(twice).toEqual({ left: 0, width: 250, movable: true });
    const fourTimes = sliderThumb(view(0, 1000, 4000), 500);
    expect(fourTimes.width).toBe(125);
    expect(fourTimes.width).toBeLessThan(twice.width);
  });

  it('leaves what stays in place at the left out of both lengths', () => {
    // 836 px of lanes in view out of 1836: the header column (164 px) is no part of either.
    const thumb = sliderThumb(view(0, 1000, 2000), 500, 164);
    expect(thumb.width).toBeCloseTo((500 * 836) / 1836, 9);
  });

  it('goes from one end of the bar to the other as the view scrolls', () => {
    expect(sliderThumb(view(0, 1000, 2000), 500).left).toBe(0);
    expect(sliderThumb(view(500, 1000, 2000), 500).left).toBe(125);
    const end = sliderThumb(view(1000, 1000, 2000), 500);
    expect(end.left + end.width).toBe(500);
    // A scroll past an end (a view that bounces) keeps the thumb inside the bar.
    expect(sliderThumb(view(-40, 1000, 2000), 500).left).toBe(0);
    expect(sliderThumb(view(1040, 1000, 2000), 500).left).toBe(250);
  });

  it('is never shorter than what can be held, and still reaches both ends', () => {
    const start = sliderThumb(view(0, 1000, 200_000), 500);
    expect(start).toEqual({ left: 0, width: MIN_THUMB, movable: true });
    const end = sliderThumb(view(199_000, 1000, 200_000), 500);
    expect(end.left + end.width).toBe(500);
    expect(sliderThumb(view(99_500, 1000, 200_000), 500).left).toBe((500 - MIN_THUMB) / 2);
  });

  it('fills the bar when all it could travel is under a pixel', () => {
    // One pixel of scroll left over by rounding.
    expect(sliderThumb(view(0, 1000, 1001), 500)).toEqual({ left: 0, width: 500, movable: false });
    // A bar too short for the shortest thumb to move in.
    expect(sliderThumb(view(0, 1000, 9000), 24)).toEqual({ left: 0, width: 24, movable: false });
  });

  it('has no thumb in a bar without a width', () => {
    expect(sliderThumb(view(0, 1000, 2000), 0)).toEqual({ left: 0, width: 0, movable: false });
    expect(sliderThumb(view(0, 0, 0), 0)).toEqual({ left: 0, width: 0, movable: false });
  });

  it('fills the bar for a view that is not laid out', () => {
    expect(sliderThumb(view(0, 0, 0), 300)).toEqual({ left: 0, width: 300, movable: false });
    // Narrower than the column that stays: nothing of the timeline shows.
    expect(sliderThumb(view(0, 100, 2000), 300, 164).movable).toBe(false);
  });
});

describe('scrollForThumb', () => {
  it('is the reverse of sliderThumb', () => {
    for (const [client, whole, bar, fixed] of [
      [1000, 2000, 500, 0],
      [1336, 5444, 540, 164],
      [1000, 200_000, 500, 164], // the shortest thumb
    ] as const) {
      const range = whole - client;
      for (const share of [0, 0.25, 0.5, 0.8, 1]) {
        const at = view(share * range, client, whole);
        const thumb = sliderThumb(at, bar, fixed);
        // From any other scroll of the same view, the thumb's place gives its scroll back.
        expect(scrollForThumb(thumb.left, view(0, client, whole), bar, fixed)).toBeCloseTo(
          share * range,
          6,
        );
      }
    }
  });

  it('keeps the thumb inside the bar', () => {
    expect(scrollForThumb(-80, view(300, 1000, 2000), 500)).toBe(0);
    expect(scrollForThumb(900, view(300, 1000, 2000), 500)).toBe(1000);
  });

  it('leaves the scroll alone when the thumb cannot move', () => {
    expect(scrollForThumb(120, view(0, 1000, 1000), 500)).toBe(0);
    expect(scrollForThumb(120, view(0, 1000, 2000), 0)).toBe(0);
  });
});

describe('thumbHold', () => {
  const thumb = { left: 100, width: 60, movable: true };

  it('holds the thumb where it was pressed', () => {
    expect(thumbHold(100, thumb)).toBe(0);
    expect(thumbHold(145, thumb)).toBe(45);
    expect(thumbHold(160, thumb)).toBe(60);
  });

  it('holds it by its middle for a press beside it', () => {
    expect(thumbHold(20, thumb)).toBe(30);
    expect(thumbHold(400, thumb)).toBe(30);
  });
});

describe('keyScroll', () => {
  const at = view(1000, 1164, 5164);

  it('steps a tenth of the view with the arrows and all of it with Page Up and Page Down', () => {
    expect(keyScroll('ArrowRight', at, 164)).toBe(1100);
    expect(keyScroll('ArrowLeft', at, 164)).toBe(900);
    expect(keyScroll('PageDown', at, 164)).toBe(2000);
    expect(keyScroll('PageUp', at, 164)).toBe(0);
  });

  it('goes to the ends with Home and End, and never past them', () => {
    expect(keyScroll('Home', at, 164)).toBe(0);
    expect(keyScroll('End', at, 164)).toBe(4000);
    expect(keyScroll('ArrowLeft', view(30, 1164, 5164), 164)).toBe(0);
    expect(keyScroll('PageDown', view(3900, 1164, 5164), 164)).toBe(4000);
  });

  it('leaves the other keys alone', () => {
    for (const key of ['ArrowUp', 'ArrowDown', ' ', 'Enter', 'a', 'Tab'])
      expect(keyScroll(key, at, 164)).toBeNull();
  });
});

describe('scrollRange and scrollPercent', () => {
  it('measure the scroll against what there is to scroll', () => {
    expect(scrollRange(view(0, 1000, 3000))).toBe(2000);
    expect(scrollRange(view(0, 1000, 900))).toBe(0);
    expect(scrollPercent(view(500, 1000, 3000))).toBe(25);
    expect(scrollPercent(view(2000, 1000, 3000))).toBe(100);
    expect(scrollPercent(view(0, 1000, 1000))).toBe(0);
  });
});
