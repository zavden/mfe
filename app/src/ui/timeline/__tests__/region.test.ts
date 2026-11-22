// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  OPEN_REGION_LENGTH,
  regionBetween,
  regionInside,
  regionKeyEdge,
  regionLabel,
  regionWithin,
  withEdge,
  withEndAt,
  withStartAt,
} from '../region';

const FPS = 60;

describe('the region of the timeline', () => {
  it('lies between two times, whichever comes first, on frames and from 0 on', () => {
    expect(regionBetween(1, 3, FPS)).toEqual({ start: 1, end: 3 });
    expect(regionBetween(3, 1, FPS)).toEqual({ start: 1, end: 3 });
    expect(regionBetween(1.004, 2.996, FPS)).toEqual({ start: 1, end: 3 });
    expect(regionBetween(-2, 0.5, FPS)).toEqual({ start: 0, end: 0.5 });
    // 30 fps: the frames are a thirtieth apart.
    expect(regionBetween(0.02, 0.09, 30)).toEqual({ start: 0.033333, end: 0.1 });
  });

  it('is not made shorter than a frame: a press without a drag marks nothing', () => {
    expect(regionBetween(2, 2, FPS)).toBeNull();
    expect(regionBetween(2, 2.004, FPS)).toBeNull();
    expect(regionBetween(-1, -3, FPS)).toBeNull();
    expect(regionBetween(2, 2 + 1 / FPS, FPS)).toEqual({ start: 2, end: 2.016667 });
  });

  it('moves one end, which stops a frame from the other', () => {
    const region = { start: 1, end: 3 };
    expect(withEdge(region, 'start', 2, FPS)).toEqual({ start: 2, end: 3 });
    expect(withEdge(region, 'end', 2, FPS)).toEqual({ start: 1, end: 2 });
    expect(withEdge(region, 'start', -4, FPS)).toEqual({ start: 0, end: 3 });
    expect(withEdge(region, 'start', 5, FPS)).toEqual({ start: 2.983333, end: 3 });
    expect(withEdge(region, 'end', 0, FPS)).toEqual({ start: 1, end: 1.016667 });
    expect(withEdge(region, 'end', 7.5, FPS)).toEqual({ start: 1, end: 7.5 });
  });

  it('I puts the start at the playhead and keeps an end that comes after it', () => {
    expect(withStartAt({ start: 1, end: 3 }, 2, 10, FPS)).toEqual({ start: 2, end: 3 });
    expect(withStartAt({ start: 1, end: 3 }, 0, 10, FPS)).toEqual({ start: 0, end: 3 });
  });

  it('I with no end after the playhead runs to the end of the scene', () => {
    expect(withStartAt(null, 2, 10, FPS)).toEqual({ start: 2, end: 10 });
    expect(withStartAt({ start: 1, end: 3 }, 3, 10, FPS)).toEqual({ start: 3, end: 10 });
    expect(withStartAt({ start: 1, end: 3 }, 6, 10, FPS)).toEqual({ start: 6, end: 10 });
  });

  it('I where the scene ends makes a region of the open length', () => {
    expect(withStartAt(null, 10, 10, FPS)).toEqual({ start: 10, end: 10 + OPEN_REGION_LENGTH });
    expect(withStartAt(null, 0, 0, FPS)).toEqual({ start: 0, end: OPEN_REGION_LENGTH });
  });

  it('O puts the end at the playhead and keeps a start that comes before it', () => {
    expect(withEndAt({ start: 1, end: 3 }, 2, FPS)).toEqual({ start: 1, end: 2 });
    expect(withEndAt({ start: 1, end: 3 }, 8, FPS)).toEqual({ start: 1, end: 8 });
  });

  it('O with no start before the playhead starts with the scene', () => {
    expect(withEndAt(null, 2, FPS)).toEqual({ start: 0, end: 2 });
    expect(withEndAt({ start: 1, end: 3 }, 1, FPS)).toEqual({ start: 0, end: 1 });
    expect(withEndAt({ start: 1, end: 3 }, 0.5, FPS)).toEqual({ start: 0, end: 0.5 });
  });

  it('O at the start of the scene marks nothing', () => {
    expect(withEndAt(null, 0, FPS)).toBeNull();
    expect(withEndAt({ start: 1, end: 3 }, 0, FPS)).toBeNull();
  });

  it('is said with two decimals', () => {
    expect(regionLabel({ start: 1, end: 3 })).toBe('1.00–3.00 s');
    expect(regionLabel({ start: 0.5, end: 12.016667 })).toBe('0.50–12.02 s');
  });

  it('is inside a stretch that holds both its ends', () => {
    const region = { start: 1, end: 3 };
    expect(regionInside(region, 1, 3)).toBe(true);
    expect(regionInside(region, 0, 10)).toBe(true);
    expect(regionInside(region, 1.5, 10)).toBe(false);
    expect(regionInside(region, 0, 2.9)).toBe(false);
    // Float noise at an end does not put it outside.
    expect(regionInside({ start: 0.1 + 0.2, end: 3 }, 0.3, 3)).toBe(true);
  });

  it('is cut where a shorter timeline ends, and gone when nothing of it is left', () => {
    const region = { start: 4, end: 9 };
    expect(regionWithin(region, 12, FPS)).toBe(region);
    expect(regionWithin(region, 9, FPS)).toBe(region);
    expect(regionWithin(region, 6.5, FPS)).toEqual({ start: 4, end: 6.5 });
    expect(regionWithin(region, 4, FPS)).toBeNull();
    expect(regionWithin(region, 2, FPS)).toBeNull();
  });

  it('I and O are its keys: the plain letters, whatever the case', () => {
    const press = (key: string, more: Partial<Parameters<typeof regionKeyEdge>[0]> = {}) =>
      regionKeyEdge({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        ...more,
      });
    expect(press('i')).toBe('start');
    expect(press('o')).toBe('end');
    expect(press('I')).toBe('start'); // Caps Lock
    expect(press('a')).toBeNull();
    expect(press('Enter', { code: 'Enter' })).toBeNull();
    expect(press('Escape', { code: 'Escape' })).toBeNull();
    // With a modifier the letters are other commands' (Ctrl/⌘+O opens a project).
    expect(press('o', { ctrlKey: true })).toBeNull();
    expect(press('o', { metaKey: true })).toBeNull();
    expect(press('i', { altKey: true })).toBeNull();
    expect(press('I', { shiftKey: true })).toBeNull();
    // A layout of another script: the key where a Latin keyboard has the letter.
    expect(press('ш', { code: 'KeyI' })).toBe('start');
    expect(press('щ', { code: 'KeyO' })).toBe('end');
    // A Latin layout that has the letter elsewhere keeps the letter (Dvorak: C is on KeyI).
    expect(press('c', { code: 'KeyI' })).toBeNull();
    expect(press('i', { code: 'KeyG' })).toBe('start');
    // A key that is no character has no letter under it to borrow.
    expect(press('Process', { code: 'KeyI' })).toBeNull();
  });
});
