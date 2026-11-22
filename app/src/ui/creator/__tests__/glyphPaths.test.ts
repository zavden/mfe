// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { atLeastSize, meetScale, viewBoxOf, viewBoxRect } from '../glyphPaths';

describe('atLeastSize (the frame of a glyph in the glyph view)', () => {
  it('grows a thin box evenly around its centre to the least size', () => {
    // A fraction bar: wide and 0.04 tall, with a least size of 0.1 each way.
    const bar = { minX: -1, minY: 0.2, maxX: 1, maxY: 0.24 };
    const frame = atLeastSize(bar, 0.1, 0.1);
    expect(frame.minX).toBe(-1);
    expect(frame.maxX).toBe(1);
    expect(frame.maxY - frame.minY).toBeCloseTo(0.1, 12);
    expect((frame.minY + frame.maxY) / 2).toBeCloseTo(0.22, 12);
  });

  it('grows each way on its own: a tall thin box only in width', () => {
    const stroke = { minX: 0.5, minY: -1, maxX: 0.52, maxY: 1 };
    const frame = atLeastSize(stroke, 0.3, 0.3);
    expect(frame.maxX - frame.minX).toBeCloseTo(0.3, 12);
    expect((frame.minX + frame.maxX) / 2).toBeCloseTo(0.51, 12);
    expect([frame.minY, frame.maxY]).toEqual([-1, 1]);
  });

  it('leaves a box at least that large as it is', () => {
    const letter = { minX: 0, minY: 0, maxX: 0.4, maxY: 0.5 };
    expect(atLeastSize(letter, 0.1, 0.1)).toEqual(letter);
    expect(atLeastSize(letter, 0.4, 0.5)).toEqual(letter);
    expect(atLeastSize(letter, 0, 0)).toEqual(letter);
  });

  it('gives a box of no size the least size around its point', () => {
    expect(atLeastSize({ minX: 2, minY: 3, maxX: 2, maxY: 3 }, 0.2, 0.4)).toEqual({
      minX: 1.9,
      minY: 2.8,
      maxX: 2.1,
      maxY: 3.2,
    });
  });
});

describe('meetScale (CSS pixels per unit of a drawing shown whole)', () => {
  it('is the smaller of the two ratios: the drawing fits in the box', () => {
    expect(meetScale(400, 200, 4, 1)).toBe(100); // as wide as the box
    expect(meetScale(400, 200, 2, 2)).toBe(100); // as tall as the box
    expect(meetScale(457, 198, 3.7321, 1.7588)).toBeCloseTo(198 / 1.7588, 9);
  });

  it('is null while the box or the drawing has no size', () => {
    expect(meetScale(0, 200, 4, 1)).toBeNull();
    expect(meetScale(400, 0, 4, 1)).toBeNull();
    expect(meetScale(400, 200, 0, 1)).toBeNull();
    expect(meetScale(400, 200, 4, Number.NaN)).toBeNull();
  });
});

describe('viewBoxRect', () => {
  it('is the viewBox of viewBoxOf, the formula with a margin, y flipped', () => {
    const bbox = { minX: -1, minY: -0.5, maxX: 2, maxY: 0.5 };
    // A margin of 10% of the larger side (3) on each side.
    const [x, y, w, h] = viewBoxRect(bbox, 0.1);
    expect(x).toBeCloseTo(-1.3, 12);
    expect(y).toBeCloseTo(-0.8, 12);
    expect(w).toBeCloseTo(3.6, 12);
    expect(h).toBeCloseTo(1.6, 12);
    // The text of the attribute, as it was written before viewBoxRect.
    const pad = Math.max(3, 1, 0.2) * 0.1;
    expect(viewBoxOf(bbox)).toBe(
      `${bbox.minX - pad} ${-bbox.maxY - pad} ${3 + 2 * pad} ${1 + 2 * pad}`,
    );
  });
});
