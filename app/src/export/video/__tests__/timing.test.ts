// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  frameDurationUs,
  frameTime,
  keyFrameInterval,
  resolveRange,
  timestampUs,
  totalFrames,
} from '../timing';

describe('frame timing', () => {
  it('defaults to the whole scene and clamps custom ranges', () => {
    expect(resolveRange(4, null)).toEqual([0, 4]);
    expect(resolveRange(4, [1, 3])).toEqual([1, 3]);
    expect(resolveRange(4, [-2, 9])).toEqual([0, 4]);
    expect(resolveRange(4, [3, 1])).toEqual([3, 3]);
    expect(resolveRange(4, [5, 6])).toEqual([4, 4]);
  });

  it('has round(duration · fps) frames', () => {
    expect(totalFrames(0, 4, 60)).toBe(240);
    expect(totalFrames(0, 2.5, 24)).toBe(60);
    expect(totalFrames(0.5, 1.25, 30)).toBe(23); // 22.5 rounds up
    expect(totalFrames(0, 1 / 120, 60)).toBe(1); // 0.5 rounds up
    expect(totalFrames(0, 0.001, 60)).toBe(0);
    expect(totalFrames(1, 1, 60)).toBe(0);
  });

  it('shows the scene at r0 + k / fps, so the last frame is one frame before the end', () => {
    expect(frameTime(0, 1.5, 30)).toBe(1.5);
    expect(frameTime(30, 1.5, 30)).toBe(2.5);
    const frames = totalFrames(0, 4, 60);
    expect(frameTime(frames - 1, 0, 60)).toBeCloseTo(4 - 1 / 60, 12);
  });

  it('timestamps never drift: the last frame ends at exactly frames / fps', () => {
    const failures: string[] = [];
    for (const fps of [24, 25, 29, 30, 48, 50, 60, 120]) {
      const frames = fps * 7 + 3;
      let sum = 0;
      for (let k = 0; k < frames; k++) {
        const duration = frameDurationUs(k, fps);
        if (!(duration > 0)) failures.push(`${k} @ ${fps}: duration ${duration} is not positive`);
        const end = timestampUs(k, fps) + duration;
        const next = timestampUs(k + 1, fps);
        if (end !== next)
          failures.push(`${k} @ ${fps}: frame ends at ${end}, next begins at ${next}`);
        sum += duration;
      }
      expect(sum).toBe(timestampUs(frames, fps));
      expect(sum).toBe(Math.round((frames * 1_000_000) / fps));
    }
    expect(failures).toEqual([]);
    expect(timestampUs(0, 30)).toBe(0);
    expect(timestampUs(1, 30)).toBe(33333);
  });

  it('forces a keyframe about every 2 seconds', () => {
    expect(keyFrameInterval(30)).toBe(60);
    expect(keyFrameInterval(60)).toBe(120);
    expect(keyFrameInterval(1)).toBe(2);
  });
});
