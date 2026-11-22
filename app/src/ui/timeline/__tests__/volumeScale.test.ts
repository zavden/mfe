// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { VOLUME_GRAPH_HEIGHT, volumeAt, volumeLine, volumeY } from '../volumeScale';

const H = VOLUME_GRAPH_HEIGHT;

describe('the vertical scale of a volume curve', () => {
  it('puts 100% at mid-height: silence to the original level gets half the graph', () => {
    expect(volumeY(0)).toBe(H - 4);
    expect(volumeY(1)).toBe(H / 2);
    expect(volumeY(4)).toBe(4);
    // Each half is linear: 50% halfway down, 250% halfway up.
    expect(volumeY(0.5)).toBe((volumeY(0) + volumeY(1)) / 2);
    expect(volumeY(2.5)).toBe((volumeY(1) + volumeY(4)) / 2);
    // A linear 0–400% scale gave this part a quarter of the height.
    expect(volumeY(0) - volumeY(1)).toBe((volumeY(0) - volumeY(4)) / 2);
  });

  it('reads a gain back from a height, within 0 and 400%', () => {
    for (const gain of [0, 0.1, 0.5, 0.99, 1, 1.01, 2, 3.3, 4])
      expect(volumeAt(volumeY(gain))).toBeCloseTo(gain, 12);
    expect(volumeAt(volumeY(1) - 10)).toBeCloseTo(2, 12);
    expect(volumeAt(volumeY(1) + 15)).toBeCloseTo(0.5, 12);
    expect(volumeAt(-50)).toBe(4);
    expect(volumeAt(H + 50)).toBe(0);
  });

  it('follows the size of the graph it is given', () => {
    expect(volumeY(1, 100)).toBe(50);
    expect(volumeY(0, 100)).toBe(96);
    expect(volumeAt(27, 100)).toBeCloseTo(2.5, 12);
  });

  it('draws a segment as a straight line, with a corner where it crosses 100%', () => {
    // 0% → 100%: one half of the scale, nothing to add.
    expect(
      volumeLine([
        { x: 0, gain: 0 },
        { x: 80, gain: 1 },
      ]),
    ).toEqual([
      [0, volumeY(0)],
      [80, volumeY(1)],
    ]);
    // 50% → 250% over 100 px crosses 100% a quarter of the way.
    expect(
      volumeLine([
        { x: 0, gain: 0.5 },
        { x: 100, gain: 2.5 },
      ]),
    ).toEqual([
      [0, volumeY(0.5)],
      [25, volumeY(1)],
      [100, volumeY(2.5)],
    ]);
    // Downwards too, and each segment of a longer curve on its own.
    expect(
      volumeLine([
        { x: 0, gain: 4 },
        { x: 30, gain: 0 },
        { x: 60, gain: 1 },
        { x: 90, gain: 1 },
      ]),
    ).toEqual([
      [0, volumeY(4)],
      [22.5, volumeY(1)],
      [30, volumeY(0)],
      [60, volumeY(1)],
      [90, volumeY(1)],
    ]);
  });
});
