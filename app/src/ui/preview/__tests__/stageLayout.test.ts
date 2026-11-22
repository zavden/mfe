// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { alignedFrame, stageAspect, type Rect } from '../stageLayout';

const ASPECT = 16 / 9;
/** Whether `v` CSS px is a whole number of device pixels at `dpr`. */
const whole = (v: number, dpr: number) => Math.abs(v * dpr - Math.round(v * dpr)) < 1e-6;

describe('alignedFrame', () => {
  const stage: Rect = { left: 305, top: 74, width: 801.59375, height: 512.796875 };

  it('fits the stage minus the padding, limited by the width or by the height', () => {
    const wide = alignedFrame(stage, 10, ASPECT, 1);
    expect(wide.width).toBe(781); // 781.59 rounded down
    expect(wide.height).toBe(439); // 781 / (16/9) = 439.3
    expect(wide.width / wide.height).toBeCloseTo(ASPECT, 2);
    const tall = alignedFrame({ left: 401, top: 74, width: 1080, height: 500.5 }, 10, ASPECT, 1);
    expect(tall.height).toBe(480); // the room there is, under the padding
    expect(tall.width).toBe(853); // 480 × 16/9 = 853.3 rounded down
    expect(tall.top + tall.height).toBeLessThanOrEqual(500.5 - 10 + 1e-9);
  });

  it('lands on whole device pixels in viewport coordinates, centred within a pixel', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) {
      const frame = alignedFrame(stage, 10, ASPECT, dpr);
      for (const v of [stage.left + frame.left, stage.top + frame.top, frame.width, frame.height]) {
        expect(whole(v, dpr)).toBe(true);
      }
      // Centred: the slack on each side differs by less than a device pixel.
      const slackX = stage.width - frame.width - 2 * frame.left;
      const slackY = stage.height - frame.height - 2 * frame.top;
      expect(Math.abs(slackX)).toBeLessThan(2 / dpr);
      expect(Math.abs(slackY)).toBeLessThan(2 / dpr);
      // Inside the padding.
      expect(frame.left).toBeGreaterThanOrEqual(10 - 1 / dpr);
      expect(frame.top).toBeGreaterThanOrEqual(10 - 1 / dpr);
    }
  });

  it('keeps a frame that already fits exactly', () => {
    const frame = alignedFrame({ left: 0, top: 0, width: 820, height: 470 }, 10, ASPECT, 1);
    expect(frame).toEqual({ left: 10, top: 10, width: 800, height: 450 });
  });

  it('follows the project aspect and copes with a degenerate stage or ratio', () => {
    const square = alignedFrame(stage, 10, 1, 1);
    expect(square.width).toBe(492);
    expect(square.height).toBe(492);
    const empty = alignedFrame({ left: 0, top: 0, width: 0, height: 0 }, 10, ASPECT, 2);
    expect(empty).toEqual({ left: 10, top: 10, width: 0, height: 0 });
    const odd = alignedFrame(stage, 10, Number.NaN, 0);
    expect(odd.width / odd.height).toBeCloseTo(ASPECT, 2);
    expect(Number.isFinite(odd.left)).toBe(true);
  });
});

describe('the world view', () => {
  it('takes the stage whole: the stage inside its padding is its frame', () => {
    expect(stageAspect({ width: 820, height: 420 }, 10)).toBe(2);
    const stage = { left: 0, top: 0, width: 820, height: 420 };
    expect(alignedFrame(stage, 10, stageAspect(stage, 10), 1)).toEqual({
      left: 10,
      top: 10,
      width: 800,
      height: 400,
    });
    // A stage with no room keeps a shape.
    expect(stageAspect({ width: 10, height: 10 }, 10)).toBeCloseTo(16 / 9, 9);
  });
});
