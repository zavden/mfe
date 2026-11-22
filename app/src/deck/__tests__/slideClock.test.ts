// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { stopsOf } from '../../model';
import {
  advanceSlide,
  nextStop,
  pauseIndexAt,
  playFromTime,
  playStart,
  previousStop,
  slideAt,
} from '../slideClock';

describe('slides and stops', () => {
  const stops = [2, 6];
  it('counts the stops behind a time; standing on one is the end of its slide', () => {
    expect(slideAt(stops, 0)).toBe(0);
    expect(slideAt(stops, 1.9)).toBe(0);
    expect(slideAt(stops, 2)).toBe(0);
    expect(slideAt(stops, 2, true)).toBe(1);
    expect(slideAt(stops, 2.1)).toBe(1);
    expect(slideAt(stops, 6)).toBe(1);
    expect(slideAt(stops, 9)).toBe(2);
    expect(slideAt([], 5)).toBe(0);
  });

  it('finds the next stop, or the end, and the one before, or the start', () => {
    expect(nextStop(stops, 10, 0)).toBe(2);
    expect(nextStop(stops, 10, 2)).toBe(6);
    expect(nextStop(stops, 10, 6)).toBe(10);
    expect(nextStop(stops, 10, 10)).toBe(10);
    expect(previousStop(stops, 10)).toBe(6);
    expect(previousStop(stops, 6)).toBe(2);
    expect(previousStop(stops, 2.5)).toBe(2);
    expect(previousStop(stops, 2)).toBe(0);
    expect(previousStop(stops, 0)).toBe(0);
  });
});

describe('pauseIndexAt', () => {
  it('finds the pause at a time, to a millionth of a second, the first of two', () => {
    expect(pauseIndexAt([1.5, 3.5], 3.5)).toBe(1);
    expect(pauseIndexAt([1.5, 3.5], 1.5 + 1e-7)).toBe(0);
    expect(pauseIndexAt([1.5, 3.5], 1.501)).toBeNull();
    expect(pauseIndexAt([0, 2, 2], 2)).toBe(1);
    expect(pauseIndexAt([0, 2], 0)).toBe(0);
    expect(pauseIndexAt([], 0)).toBeNull();
  });
});

describe('advanceSlide', () => {
  const stops = [2, 6];
  it('plays on between stops', () => {
    expect(advanceSlide(1, 0.016, 1, 10, stops)).toEqual({
      time: 1.016,
      playing: true,
      stopped: null,
      ended: false,
    });
  });

  it('stops at the stop it reaches, exactly there, and goes on from it afterwards', () => {
    expect(advanceSlide(1.99, 0.016, 1, 10, stops)).toEqual({
      time: 2,
      playing: false,
      stopped: 2,
      ended: false,
    });
    // From the stop: it is behind, the next one is at 6 s.
    expect(advanceSlide(2, 0.016, 1, 10, stops)).toMatchObject({ time: 2.016, playing: true });
  });

  it('never skips a stop, however long the frame took', () => {
    expect(advanceSlide(1.95, 30, 2, 10, stops)).toMatchObject({ time: 2, stopped: 2 });
  });

  it('holds a frame to a tenth of a second: a tab that slept goes on from where it was', () => {
    expect(advanceSlide(3, 30, 1, 10, stops).time).toBeCloseTo(3.1, 9);
    expect(advanceSlide(3, -5, 1, 10, stops).time).toBe(3);
  });

  it('plays through the stops in the continuous mode', () => {
    expect(advanceSlide(1.99, 0.05, 1, 10, stops, { through: true })).toMatchObject({
      time: 2.04,
      playing: true,
      stopped: null,
    });
  });

  it('stops at the end of the scene, or loops', () => {
    expect(advanceSlide(9.99, 0.05, 1, 10, stops)).toEqual({
      time: 10,
      playing: false,
      stopped: null,
      ended: true,
    });
    const looped = advanceSlide(9.99, 0.05, 1, 10, stops, { loop: true, through: true });
    expect(looped.playing).toBe(true);
    expect(looped.ended).toBe(true);
    expect(looped.time).toBeCloseTo(0.04, 9);
  });

  it('plays at a speed', () => {
    expect(advanceSlide(3, 0.05, 2, 10, stops).time).toBeCloseTo(3.1, 9);
  });
});

describe('playFromTime', () => {
  it('starts again from the start when the page stands at the end', () => {
    expect(playFromTime(10, 10)).toBe(0);
    expect(playFromTime(4, 10)).toBe(4);
  });
});

describe('playStart', () => {
  // A pause at 2 s that skips its wait to 3 s, one at 6 s that keeps it, one at 7 s that skips
  // its wait to the pause at 7.5 s, and one at the start that skips the scene's first rest.
  const pauses = [
    { time: 0, resume: 0.5 },
    { time: 2, resume: 3 },
    { time: 6, resume: 6 },
    { time: 7, resume: 7.5 },
    { time: 7.5, resume: 7.5 },
  ];
  const stops = stopsOf(
    10,
    pauses.map((pause) => pause.time),
  );
  const start = (time: number, through = false) => playStart(time, 10, pauses, stops, through);

  it('goes on from the end of the wait of a pause that skips it, where it stands', () => {
    expect(start(2)).toEqual({ time: 3, skipped: true, stopped: false });
    expect(start(2 + 1e-7)).toEqual({ time: 3, skipped: true, stopped: false });
    expect(start(0)).toEqual({ time: 0.5, skipped: true, stopped: false });
  });

  it('stands at once at the next pause when the wait ends there', () => {
    expect(start(7)).toEqual({ time: 7.5, skipped: true, stopped: true });
  });

  it('skips nothing played through, at a pause that keeps its wait, or anywhere else', () => {
    expect(start(2, true)).toEqual({ time: 2, skipped: false, stopped: false });
    expect(start(6)).toEqual({ time: 6, skipped: false, stopped: false });
    // Inside the wait (a seek put it there), and just past the pause.
    expect(start(2.5)).toEqual({ time: 2.5, skipped: false, stopped: false });
    expect(start(2.001)).toEqual({ time: 2.001, skipped: false, stopped: false });
    // At the end: from the start, which it did not stand at.
    expect(start(10)).toEqual({ time: 0, skipped: false, stopped: false });
    expect(playStart(2, 10, [], [], false)).toEqual({ time: 2, skipped: false, stopped: false });
  });
});
