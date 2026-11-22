// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DIRECTION_ARROWS, DIRECTION_LABELS, DIRECTIONS, glyphAlignDelta } from '../glyphAlign';

const reference = { minX: 1, minY: 2, maxX: 2, maxY: 2.5 }; // centre (1.5, 2.25)
const target = { minX: -3, minY: -1, maxX: -2.4, maxY: -0.2 }; // centre (-2.7, -0.6)

describe('glyphAlignDelta', () => {
  it('moves one axis for a side, both for a corner or the centre', () => {
    expect(glyphAlignDelta(reference, target, 'LEFT')).toEqual([4, 0]);
    expect(glyphAlignDelta(reference, target, 'RIGHT')).toEqual([4.4, 0]);
    expect(glyphAlignDelta(reference, target, 'UP')).toEqual([0, 2.7]);
    expect(glyphAlignDelta(reference, target, 'DOWN')).toEqual([0, 3]);
    expect(glyphAlignDelta(reference, target, 'UL')).toEqual([4, 2.7]);
    expect(glyphAlignDelta(reference, target, 'UR')).toEqual([4.4, 2.7]);
    expect(glyphAlignDelta(reference, target, 'DL')).toEqual([4, 3]);
    expect(glyphAlignDelta(reference, target, 'DR')).toEqual([4.4, 3]);
    expect(glyphAlignDelta(reference, target, 'CENTER')).toEqual([4.2, 2.85]);
  });

  it('is zero once the glyphs line up, and rounds away float noise', () => {
    expect(glyphAlignDelta(reference, reference, 'DR')).toEqual([0, 0]);
    const noisy = { minX: 0.1 + 0.2, minY: 0, maxX: 1, maxY: 1 };
    expect(glyphAlignDelta({ minX: 0.3, minY: 0, maxX: 1, maxY: 1 }, noisy, 'LEFT')).toEqual([
      0, 0,
    ]);
  });

  it('lists the nine directions as the compass draws them, each with a label and an arrow', () => {
    expect(DIRECTIONS).toEqual(['UL', 'UP', 'UR', 'LEFT', 'CENTER', 'RIGHT', 'DL', 'DOWN', 'DR']);
    for (const d of DIRECTIONS) {
      expect(DIRECTION_LABELS[d]).not.toBe('');
      expect(DIRECTION_ARROWS[d]).toHaveLength(1);
    }
  });
});
