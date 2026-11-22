// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClip, createEmptyProject, type ClipAction } from '../../../model';
import { blockProgress, fitCamera, loopTime, playedSeconds, previewSpan } from '../blockPreview';

const clip = { ...createClip('f', 't', 2, 10), id: 'c' };
/** A Write block of the clip, `start` seconds into it. */
const block = (start: number, duration: number) =>
  ({
    id: 'w',
    kind: 'appear',
    anim: 'write',
    start,
    duration,
    glyphs: 'all',
  }) as unknown as ClipAction;

describe('the block preview', () => {
  it('loops over the block padded a little, inside its clip', () => {
    expect(previewSpan(clip, block(1, 2))).toEqual({ start: 2.7, end: 5.3 });
    // At the clip's edges the padding is cut.
    expect(previewSpan(clip, block(0, 8))).toEqual({ start: 2, end: 10 });
    // Never empty.
    expect(previewSpan(clip, block(0, 0), 0).end).toBeGreaterThan(2);
  });

  it('has played no time at a frame stamped before it started', () => {
    const span = { start: 2.7, end: 5.3 };
    // The frame began 4 ms before the preview was started in it: the loop is at its start, and
    // not 4 ms before it, which is its end (5.296 s was shown for a frame).
    expect(playedSeconds(1000, 1004)).toBe(0);
    expect(loopTime(playedSeconds(1000, 1004), span)).toBe(2.7);
    expect(loopTime((1000 - 1004) / 1000, span)).toBeCloseTo(5.296, 9);
    // From then on it is the time since the start.
    expect(playedSeconds(1004, 1004)).toBe(0);
    expect(playedSeconds(1504, 1004)).toBe(0.5);
  });

  it('lands a clock in the span, looping', () => {
    const span = { start: 2.7, end: 5.3 };
    expect(loopTime(0, span)).toBe(2.7);
    expect(loopTime(1, span)).toBeCloseTo(3.7, 9);
    expect(loopTime(2.6, span)).toBeCloseTo(2.7, 9);
    expect(loopTime(3.1, span)).toBeCloseTo(3.2, 9);
    expect(loopTime(-0.5, span)).toBeCloseTo(4.8, 9);
  });

  it('says how far through the block a time is, 0 before and 1 after', () => {
    expect(blockProgress(2, clip, block(1, 2))).toBe(0);
    expect(blockProgress(3, clip, block(1, 2))).toBe(0);
    expect(blockProgress(4, clip, block(1, 2))).toBe(0.5);
    expect(blockProgress(5, clip, block(1, 2))).toBe(1);
    expect(blockProgress(9, clip, block(1, 2))).toBe(1);
    expect(blockProgress(3, clip, block(1, 0))).toBe(1);
    expect(blockProgress(2.5, clip, block(1, 0))).toBe(0);
  });

  it('frames a box in the middle with a margin, within useful zooms; the frame without one', () => {
    const meta = createEmptyProject().meta;
    expect(fitCamera(null, meta)).toMatchObject({ center: [0, 0], zoom: 1, frameHeight: 8 });
    const camera = fitCamera({ minX: 1, minY: -1, maxX: 3, maxY: 1 }, meta);
    expect(camera.center).toEqual([2, 0]);
    // 2 wide and 2 tall, × 1.35: the frame's 8 units of height bound it, not its width.
    expect(camera.zoom).toBeCloseTo(8 / 2.7, 9);
    expect(fitCamera({ minX: -20, minY: -20, maxX: 20, maxY: 20 }, meta).zoom).toBe(0.5);
    expect(fitCamera({ minX: 0, minY: 0, maxX: 0.01, maxY: 0.01 }, meta).zoom).toBe(8);
    // A box with no area (nothing drawn): the whole frame.
    expect(fitCamera({ minX: 1, minY: 1, maxX: 1, maxY: 1 }, meta).zoom).toBe(1);
  });
});
