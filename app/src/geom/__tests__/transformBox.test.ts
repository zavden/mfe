// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { multiply, rotate, scale, transformBox, translate } from '..';

describe('transformBox', () => {
  const box = { minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 };

  it('moves and scales an upright box', () => {
    expect(transformBox(translate(3, 2), box)).toEqual({ minX: 2, minY: 1.5, maxX: 4, maxY: 2.5 });
    expect(transformBox(multiply(translate(1, 0), scale(2)), box)).toEqual({
      minX: -1,
      minY: -1,
      maxX: 3,
      maxY: 1,
    });
    // A flip keeps the box a box.
    expect(transformBox(scale(-1, 1), box)).toEqual(box);
  });

  it('encloses a turned box', () => {
    const turned = transformBox(rotate(90), box);
    expect(turned.minX).toBeCloseTo(-0.5);
    expect(turned.maxX).toBeCloseTo(0.5);
    expect(turned.minY).toBeCloseTo(-1);
    expect(turned.maxY).toBeCloseTo(1);
    const tilted = transformBox(rotate(45), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(tilted.maxX - tilted.minX).toBeCloseTo(Math.SQRT2);
    expect(tilted.maxY - tilted.minY).toBeCloseTo(Math.SQRT2);
  });
});
