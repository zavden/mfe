// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { floorToMs, round6, snapToFrame } from '../time';

describe('time values', () => {
  it('round6 removes float noise, and never writes -0', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(round6(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(round6(-1e-9), 0)).toBe(true);
    expect(Object.is(round6(-0), 0)).toBe(true);
  });

  it('floorToMs rounds a time down to the millisecond, without the float noise of a sum', () => {
    expect(4.4 + 2.2).toBe(6.6000000000000005);
    expect(floorToMs(4.4 + 2.2)).toBe(6.6);
    // 1.001 * 1000 is 1000.9999…: a plain floor would take a millisecond off.
    expect(floorToMs(1.001)).toBe(1.001);
    expect(floorToMs(4.35)).toBe(4.35);
    // Down, never up: the default end of a range must not pass the end of the scene.
    expect(floorToMs(6.6006)).toBe(6.6);
    expect(floorToMs(0)).toBe(0);
  });

  it('snapToFrame lands on the nearest frame of the rate', () => {
    expect(snapToFrame(0.51, 24)).toBe(0.5);
    expect(snapToFrame(1 / 3, 30)).toBe(0.333333);
    expect(snapToFrame(0.3, 10)).toBe(0.3);
  });
});
