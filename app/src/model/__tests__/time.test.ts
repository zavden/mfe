// @vitest-environment node
/* model/time.ts: when a clip counts as on screen. */
import { describe, expect, it } from 'vitest';
import { onScreenAt } from '../index';

describe('onScreenAt', () => {
  // A 10 s scene: an inner clip [1, 4) and a clip [6, 10) that lasts until the scene's end.
  const inner = { start: 1, end: 4 };
  const last = { start: 6, end: 10 };

  it('is true inside the clip and false before its start', () => {
    expect(onScreenAt(inner, 1, 10)).toBe(true);
    expect(onScreenAt(inner, 2.5, 10)).toBe(true);
    expect(onScreenAt(inner, 0.5, 10)).toBe(false);
    expect(onScreenAt(inner, 1 - 1e-9, 10)).toBe(true); // within the tolerance
  });

  it('keeps an ordinary clip half-open: false at its end', () => {
    expect(onScreenAt(inner, 4, 10)).toBe(false);
    expect(onScreenAt(inner, 4 - 1e-9, 10)).toBe(false);
    expect(onScreenAt(inner, 10, 10)).toBe(false);
  });

  it('includes the end of the scene for a clip that lasts until then', () => {
    expect(onScreenAt(last, 9.5, 10)).toBe(true);
    expect(onScreenAt(last, 10, 10)).toBe(true);
    expect(onScreenAt(last, 10 - 1e-9, 10)).toBe(true);
    expect(onScreenAt({ start: 0, end: 10 - 1e-9 }, 10, 10)).toBe(true);
  });

  it('is false at the scene end for a clip that ends earlier', () => {
    expect(onScreenAt({ start: 6, end: 9 }, 10, 10)).toBe(false);
  });
});
