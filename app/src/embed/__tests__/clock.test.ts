// @vitest-environment node
/* The player's clock: the range it plays, where it starts, a frame of playback (the end, the loop,
 * the speeds, a stall), the frame steps of the keys and the readouts. */
import { describe, expect, it } from 'vitest';
import {
  advance,
  formatSeconds,
  formatSpeed,
  initialTime,
  MAX_FRAME_STEP,
  playFrom,
  progressOf,
  resolveRange,
  spokenTime,
  stepTime,
} from '../clock';

describe('the range', () => {
  it('is the whole scene by default, or the part asked for, inside the scene', () => {
    expect(resolveRange(6, null, null)).toEqual({ start: 0, end: 6 });
    expect(resolveRange(6, 1, 4.5)).toEqual({ start: 1, end: 4.5 });
    expect(resolveRange(6, 2, null)).toEqual({ start: 2, end: 6 });
    expect(resolveRange(6, null, 9)).toEqual({ start: 0, end: 6 });
  });

  it('is the whole scene when the part asked for would be empty', () => {
    expect(resolveRange(6, 4, 2)).toEqual({ start: 0, end: 6 });
    expect(resolveRange(6, 7, 8)).toEqual({ start: 0, end: 6 });
    expect(resolveRange(0, null, null)).toEqual({ start: 0, end: 0 });
  });

  it('starts where asked: a time inside it, or its end', () => {
    const range = { start: 1, end: 4 };
    expect(initialTime(range, null)).toBe(1);
    expect(initialTime(range, 2.5)).toBe(2.5);
    expect(initialTime(range, 0)).toBe(1);
    expect(initialTime(range, 'end')).toBe(4);
  });
});

describe('a frame of playback', () => {
  const range = { start: 1, end: 3 };

  it('moves by the time elapsed, at the speed', () => {
    expect(advance(1, 0.05, 1, range, false)).toEqual({ time: 1.05, playing: true });
    expect(advance(1, 0.05, 2, range, false).time).toBeCloseTo(1.1, 12);
    expect(advance(1, 0.05, 0.5, range, false).time).toBeCloseTo(1.025, 12);
  });

  it('stops at the end, or starts again from the start with the loop', () => {
    expect(advance(2.98, 0.05, 1, range, false)).toEqual({ time: 3, playing: false });
    const looped = advance(2.98, 0.05, 1, range, true);
    expect(looped.playing).toBe(true);
    expect(looped.time).toBeCloseTo(1.03, 12);
  });

  it('goes on from where it was after a stall, without jumping', () => {
    expect(advance(1, 5, 1, range, false).time).toBeCloseTo(1 + MAX_FRAME_STEP, 12);
    expect(advance(1, -1, 1, range, false).time).toBe(1);
  });

  it('plays again from the start once it stands at the end', () => {
    expect(playFrom(3, range)).toBe(1);
    expect(playFrom(2, range)).toBe(2);
  });
});

describe('the keys', () => {
  const range = { start: 0, end: 2 };

  it('step one frame on the grid of the frame rate, or a second, inside the range', () => {
    expect(stepTime(0, 60, range, 1, false)).toBeCloseTo(1 / 60, 12);
    expect(stepTime(0.51, 10, range, 1, false)).toBeCloseTo(0.6, 12);
    expect(stepTime(0.51, 10, range, -1, false)).toBeCloseTo(0.4, 12);
    expect(stepTime(0.5, 60, range, 1, true)).toBe(1.5);
    expect(stepTime(1.5, 60, range, 1, true)).toBe(2);
    expect(stepTime(0, 60, range, -1, false)).toBe(0);
  });
});

describe('the readouts', () => {
  it('say the time, the progress and the speed', () => {
    expect(formatSeconds(1.234)).toBe('1.23');
    expect(formatSeconds(-0.001)).toBe('0.00');
    expect(progressOf(2, { start: 1, end: 3 })).toBe(0.5);
    expect(progressOf(9, { start: 1, end: 3 })).toBe(1);
    expect(progressOf(0, { start: 0, end: 0 })).toBe(0);
    expect(spokenTime(1.5, { start: 0, end: 6 })).toBe('1.50 seconds of 6.00');
    expect(formatSpeed(0.5)).toBe('0.5×');
  });
});
