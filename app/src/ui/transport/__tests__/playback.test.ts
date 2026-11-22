// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  formatTimecode,
  frameIndex,
  playbackFrame,
  skipFrom,
  stepTime,
  stopReached,
} from '../playback';

describe('playbackFrame', () => {
  it('advances from t0 and stops at the end', () => {
    expect(playbackFrame(1, 0.5, 4, false)).toEqual({ time: 1.5, ended: false });
    expect(playbackFrame(1, 3, 4, false)).toEqual({ time: 4, ended: true });
    expect(playbackFrame(1, 30, 4, false)).toEqual({ time: 4, ended: true });
  });

  it('wraps around when looping', () => {
    expect(playbackFrame(1, 3.5, 4, true).time).toBeCloseTo(0.5, 12);
    expect(playbackFrame(0, 9, 4, true)).toMatchObject({ time: 1, ended: false });
  });

  it('ends immediately in an empty scene', () => {
    expect(playbackFrame(0, 1, 0, true)).toEqual({ time: 0, ended: true });
  });
});

describe('stopReached', () => {
  const stops = [2, 6];
  it('gives the first stop reached going forwards, and none it started on', () => {
    expect(stopReached(1.9, 2.05, stops)).toBe(2);
    expect(stopReached(1.9, 2, stops)).toBe(2);
    expect(stopReached(2, 2.05, stops)).toBeNull();
    expect(stopReached(1, 1.5, stops)).toBeNull();
    // A frame that took long passes none by: the first one stops it.
    expect(stopReached(1, 9, stops)).toBe(2);
    expect(stopReached(0, 9, [])).toBeNull();
  });

  it('gives none when playback did not go forwards: a loop took it back', () => {
    expect(stopReached(9.9, 0.1, stops)).toBeNull();
    expect(stopReached(3, 3, stops)).toBeNull();
  });
});

describe('frames and timecode', () => {
  it('numbers frames with a little float tolerance', () => {
    expect(frameIndex(0, 60)).toBe(0);
    expect(frameIndex(1.5, 60)).toBe(90);
    expect(frameIndex(3 * (1 / 60), 60)).toBe(3);
    expect(frameIndex(0.99999999, 60)).toBe(60); // 59.9999994, within the tolerance
    expect(frameIndex(-1, 60)).toBe(0);
  });

  it('formats MM:SS:FF', () => {
    expect(formatTimecode(0, 60)).toBe('00:00:00');
    expect(formatTimecode(1.5, 60)).toBe('00:01:30');
    expect(formatTimecode(61.25, 60)).toBe('01:01:15');
    expect(formatTimecode(2.5, 30)).toBe('00:02:15');
  });

  it('steps by a frame or a second, on the frame grid, inside the scene', () => {
    expect(stepTime(0, 60, 10, 1, false)).toBeCloseTo(1 / 60, 12);
    expect(stepTime(0.5, 60, 10, 1, false)).toBeCloseTo(31 / 60, 12);
    expect(stepTime(0.5, 60, 10, -1, false)).toBeCloseTo(29 / 60, 12);
    expect(stepTime(0, 60, 10, -1, false)).toBe(0);
    expect(stepTime(9.99, 60, 10, 1, true)).toBe(10);
    expect(stepTime(2.2, 60, 10, 1, true)).toBeCloseTo(3.2, 12);
    expect(stepTime(2.2, 60, 0, 1, true)).toBe(0);
  });
});

describe('skipFrom', () => {
  const skips = [
    { start: 1.5, end: 2 },
    { start: 4.25, end: 4.75 },
  ];
  it('goes on from the end of the wait a pause at the playhead skips', () => {
    expect(skipFrom(1.5, skips, [1.5, 4.25])).toEqual({ time: 2, stand: false });
    expect(skipFrom(1.5 + 1e-7, skips, [])).toEqual({ time: 2, stand: false });
  });

  it('stands at the end of the wait when it is a stop: the next pause of the rest', () => {
    expect(skipFrom(4.25, skips, [4.25, 4.75])).toEqual({ time: 4.75, stand: true });
  });

  it('leaves a time where no pause skips its wait as it is, playing', () => {
    expect(skipFrom(1.6, skips, [1.5])).toEqual({ time: 1.6, stand: false });
    expect(skipFrom(2, skips, [])).toEqual({ time: 2, stand: false });
    expect(skipFrom(1.5, [], [1.5])).toEqual({ time: 1.5, stand: false });
  });
});
