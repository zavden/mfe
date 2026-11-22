// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { curvePath, curvePoint, curvePoints } from '../easingCurve';

describe('the easing curve', () => {
  it('samples the rate function from 0 to 1, linear being the diagonal', () => {
    const points = curvePoints('linear', 'ce', 4);
    expect(points).toEqual([
      [0, 0],
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
      [1, 1],
    ]);
    const smooth = curvePoints('smooth', 'ce', 10);
    expect(smooth[0]![1]).toBeCloseTo(0, 6);
    expect(smooth[10]![1]).toBeCloseTo(1, 6);
    expect(smooth[2]![1]).toBeLessThan(0.2); // eases in
    expect(smooth[5]![1]).toBeCloseTo(0.5, 6);
  });

  it('draws the curve in a box with a pad, y up, and places the progress on it', () => {
    const path = curvePath(curvePoints('linear', 'gl', 2), 100, 50, 5);
    expect(path).toBe('M5.00 45.00 L50.00 25.00 L95.00 5.00');
    expect(curvePoint('linear', 'ce', 0.5, 100, 50, 5)).toEqual({ x: 50, y: 25, value: 0.5 });
    const back = curvePoint('there_and_back', 'ce', 1, 100, 50, 5);
    expect(back.value).toBeCloseTo(0, 6);
    expect(back.y).toBeCloseTo(45, 6);
  });
});
