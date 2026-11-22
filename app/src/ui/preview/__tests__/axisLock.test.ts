// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { alongAxis, heldAxis } from '../axisLock';

describe('heldAxis', () => {
  it('is the axis the pointer has gone further along, either way', () => {
    expect(heldAxis([1.2, 0.3])).toBe('x');
    expect(heldAxis([-1.2, 0.3])).toBe('x');
    expect(heldAxis([0.3, -1.2])).toBe('y');
    expect(heldAxis([-0.3, 1.2])).toBe('y');
  });

  it('is the horizontal one on a tie, and before the pointer has moved', () => {
    expect(heldAxis([0.5, -0.5])).toBe('x');
    expect(heldAxis([0, 0])).toBe('x');
  });
});

describe('alongAxis', () => {
  it('keeps the component of the axis and zeroes the other', () => {
    expect(alongAxis([1.25, -0.4], 'x')).toEqual([1.25, 0]);
    expect(alongAxis([1.25, -0.4], 'y')).toEqual([0, -0.4]);
  });
});
