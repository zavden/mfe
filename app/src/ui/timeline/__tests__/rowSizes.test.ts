import { describe, expect, it } from 'vitest';
import type { TrackId } from '../../../model';
import { ROW_HEIGHT } from '../layout';
import {
  AUDIO_ROW_HEIGHT,
  audioRowHeight,
  isStandard,
  laneHeight,
  MAX_ROW_SCALE,
  MAX_ROW_ZOOM,
  rowScale,
  scaleForHeight,
  STANDARD_SIZES,
  steppedScale,
  steppedZoom,
  visualRowHeight,
  withTrackScale,
  withZoom,
} from '../rowSizes';

const T1 = 't1' as TrackId;
const T2 = 't2' as TrackId;

describe('row sizes', () => {
  it('the standard sizes are the heights the timeline always had', () => {
    expect(visualRowHeight(1)).toBe(ROW_HEIGHT);
    expect(visualRowHeight(3)).toBe(ROW_HEIGHT + 2 * laneHeight(1));
    expect(visualRowHeight(0)).toBe(ROW_HEIGHT);
    expect(audioRowHeight()).toBe(AUDIO_ROW_HEIGHT);
    expect(isStandard(STANDARD_SIZES)).toBe(true);
    expect(rowScale(STANDARD_SIZES, T1)).toBe(1);
  });

  it('a lane is on whole pixels at any scale, and a track is its lanes plus the space around', () => {
    expect(laneHeight(1.25)).toBe(24); // 23.75
    expect(visualRowHeight(1, 1.25)).toBe(8 + 2 * 24);
    expect(visualRowHeight(2, 2)).toBe(8 + 3 * 38);
    expect(audioRowHeight(1.5)).toBe(168);
  });

  it('the zoom moves by steps, on their grid, between the standard height and three times it', () => {
    expect(steppedZoom(1, 1)).toBe(1.25);
    expect(steppedZoom(1.25, -1)).toBe(1);
    expect(steppedZoom(1, -1)).toBe(1);
    expect(steppedZoom(MAX_ROW_ZOOM, 1)).toBe(MAX_ROW_ZOOM);
    expect(steppedZoom(1.3, 1)).toBe(1.5);
    expect(withZoom(STANDARD_SIZES, 9).zoom).toBe(MAX_ROW_ZOOM);
    expect(withZoom(STANDARD_SIZES, 1)).toBe(STANDARD_SIZES);
  });

  it('a track resized by hand keeps its proportion to the others as the zoom changes', () => {
    const tall = withTrackScale(STANDARD_SIZES, T1, 2);
    expect(rowScale(tall, T1)).toBe(2);
    expect(rowScale(tall, T2)).toBe(1);
    expect(isStandard(tall)).toBe(false);
    const zoomed = withZoom(tall, 1.5);
    expect(rowScale(zoomed, T1)).toBe(3);
    expect(rowScale(zoomed, T2)).toBe(1.5);
    // Never taller than a track can be, nor lower than the standard height.
    expect(rowScale(withZoom(tall, 3), T1)).toBe(MAX_ROW_SCALE);
    const low = withTrackScale(withZoom(STANDARD_SIZES, 2), T1, 1);
    expect(rowScale(low, T1)).toBe(1);
    expect(rowScale(withZoom(low, 1), T1)).toBe(1);
  });

  it('a track goes back to the height of the others, and the same sizes are the same object', () => {
    const tall = withTrackScale(STANDARD_SIZES, T1, 2);
    expect(withTrackScale(tall, T1, 2)).toBe(tall);
    const back = withTrackScale(tall, T1, null);
    expect(back.tracks.has(T1)).toBe(false);
    expect(isStandard(back)).toBe(true);
    expect(withTrackScale(STANDARD_SIZES, T1, null)).toBe(STANDARD_SIZES);
    // The scale of the zoom itself is no size of its own.
    expect(withTrackScale(withZoom(STANDARD_SIZES, 2), T1, 2).tracks.size).toBe(0);
  });

  it('the keys of a track step its own scale on the same grid, up to what a track can be', () => {
    expect(steppedScale(1, 1)).toBe(1.25);
    expect(steppedScale(1.25, -1)).toBe(1);
    expect(steppedScale(1, -1)).toBe(1); // the standard height is the lowest
    expect(steppedScale(3, 1)).toBe(3.25); // beyond the zoom's range: a track alone
    expect(steppedScale(MAX_ROW_SCALE, 1)).toBe(MAX_ROW_SCALE);
    expect(steppedScale(3.9, 1)).toBe(MAX_ROW_SCALE);
    // A height between two marks (an edge was dragged): the nearest mark on the side asked.
    expect(steppedScale(1.4, 1)).toBe(1.5);
    expect(steppedScale(1.4, -1)).toBe(1.25);
    expect(steppedScale(1.4, 2)).toBe(1.75);
    expect(steppedScale(1.4, 0)).toBe(1.4);
    // With the sizes: the track alone, the others at the zoom's.
    const sizes = withZoom(STANDARD_SIZES, 1.5);
    const taller = withTrackScale(sizes, T1, steppedScale(rowScale(sizes, T1), 1));
    expect(rowScale(taller, T1)).toBe(1.75);
    expect(rowScale(taller, T2)).toBe(1.5);
    // Lower than the others too, down to the standard height.
    const lower = withTrackScale(sizes, T1, steppedScale(rowScale(sizes, T1), -2));
    expect(rowScale(lower, T1)).toBe(1);
  });

  it('the scale for a height is the inverse of the height at a scale', () => {
    expect(scaleForHeight(visualRowHeight(1, 2), 'visual', 1)).toBeCloseTo(2, 5);
    expect(scaleForHeight(visualRowHeight(3, 1.5), 'visual', 3)).toBeCloseTo(1.5, 1);
    expect(scaleForHeight(audioRowHeight(2), 'audio', 1)).toBe(2);
    expect(scaleForHeight(10, 'visual', 1)).toBe(1);
    expect(scaleForHeight(5000, 'audio', 1)).toBe(MAX_ROW_SCALE);
  });
});
