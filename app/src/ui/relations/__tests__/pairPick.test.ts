// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box, Contour } from '../../../geom';
import { pickPairGlyph, type AimedGlyph, type AimedSide } from '../pairPick';

/** A rectangle as a closed contour of four straight cubics; `clockwise` turns it into a hole. */
function rect(minX: number, minY: number, maxX: number, maxY: number, clockwise = false): Contour {
  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  if (clockwise) corners.reverse();
  const out: number[] = [...corners[0]!];
  for (let i = 1; i <= 4; i++) {
    const [x0, y0] = corners[i - 1]!;
    const [x1, y1] = corners[i % 4]!;
    out.push(x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3);
    out.push(y0 + ((y1 - y0) * 2) / 3, x1, y1);
  }
  return out;
}

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});

/** A filled block. */
const block = (index: number, ...b: [number, number, number, number]): AimedGlyph => ({
  index,
  box: box(...b),
  contours: [rect(...b)],
});

/** A frame 0.1 thick: ink along its edge, none inside (the bowl of an "o", a radical's box). */
const frame = (
  index: number,
  ...[x0, y0, x1, y1]: [number, number, number, number]
): AimedGlyph => ({
  index,
  box: box(x0, y0, x1, y1),
  contours: [rect(x0, y0, x1, y1), rect(x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, true)],
});

const side = (which: 'from' | 'to', dy: number, glyphs: AimedGlyph[]): AimedSide => ({
  side: which,
  dx: 0,
  dy,
  glyphs,
});

describe('pickPairGlyph', () => {
  // Two blocks a unit apart, the same formula on both sides: the source 5 up, the target 5 down.
  const letters = [block(0, 0, 0, 1, 1), block(1, 2, 0, 3, 1)];
  const sides = [side('from', 5, letters), side('to', -5, letters)];

  it('takes the glyph with ink under the point, on the side the point is on', () => {
    expect(pickPairGlyph(sides, [0.5, 5.5], 0.2)).toEqual({ side: 'from', index: 0 });
    expect(pickPairGlyph(sides, [2.5, 5.5], 0.2)).toEqual({ side: 'from', index: 1 });
    expect(pickPairGlyph(sides, [2.5, -4.5], 0.2)).toEqual({ side: 'to', index: 1 });
    // Ink needs no circle.
    expect(pickPairGlyph(sides, [0.5, 5.5], 0)).toEqual({ side: 'from', index: 0 });
  });

  it('without ink, takes the nearest box within the circle, and nothing beyond it', () => {
    // Between the two blocks, nearer to the second.
    expect(pickPairGlyph(sides, [1.7, 5.5], 0.4)).toEqual({ side: 'from', index: 1 });
    expect(pickPairGlyph(sides, [1.3, 5.5], 0.4)).toEqual({ side: 'from', index: 0 });
    // Over a corner the distance is the corner's (0.5 here).
    expect(pickPairGlyph(sides, [3.3, 6.4], 0.51)).toEqual({ side: 'from', index: 1 });
    expect(pickPairGlyph(sides, [3.3, 6.4], 0.49)).toBeNull();
    // The gap between the two formulas is nobody's.
    expect(pickPairGlyph(sides, [0.5, 0], 1)).toBeNull();
  });

  it('counts a point inside a box as on the glyph: the bowl of an "o" is the "o"', () => {
    const o = frame(0, 0, 0, 1, 1);
    const dot = block(1, 1.05, 0, 1.2, 0.15);
    const drawing = [side('from', 0, [o, dot])];
    // In the bowl there is no ink, and the dot is 0.15 away: the "o" is at no distance.
    expect(pickPairGlyph(drawing, [0.9, 0.5], 0.3)).toEqual({ side: 'from', index: 0 });
    // Beside both, the nearer.
    expect(pickPairGlyph(drawing, [1.3, 0.3], 0.3)).toEqual({ side: 'from', index: 1 });
  });

  it('takes the smallest of the glyphs as near: the letter under a radical', () => {
    const radical = frame(0, 0, 0, 4, 2);
    const letter = frame(1, 1, 0.5, 2, 1.5);
    const drawing = [side('from', 0, [radical, letter])];
    // In the letter's box, on no ink: both boxes hold the point, the letter's is the smaller.
    expect(pickPairGlyph(drawing, [1.5, 1], 0.3)).toEqual({ side: 'from', index: 1 });
    // In the radical's box alone.
    expect(pickPairGlyph(drawing, [3, 1], 0.3)).toEqual({ side: 'from', index: 0 });
    // The radical's own ink, whatever else is near.
    expect(pickPairGlyph(drawing, [0.05, 1], 0.3)).toEqual({ side: 'from', index: 0 });
    // Ink wins over a box: a stroke of the radical that crosses the letter's box is the radical.
    const crossing = [side('from', 0, [block(0, 0, 0.9, 4, 1.1), letter])];
    expect(pickPairGlyph(crossing, [1.5, 1], 0.3)).toEqual({ side: 'from', index: 0 });
    // Where the ink of two glyphs overlaps, the smaller glyph.
    const overlapping = [side('from', 0, [block(0, 0, 0, 4, 2), block(1, 1, 0.5, 2, 1.5)])];
    expect(pickPairGlyph(overlapping, [1.5, 1], 0)).toEqual({ side: 'from', index: 1 });
    expect(pickPairGlyph(overlapping, [3.5, 1], 0)).toEqual({ side: 'from', index: 0 });
  });

  it('leaves out a glyph without a box, and answers nothing for no glyphs', () => {
    const empty: AimedGlyph = {
      index: 0,
      box: box(Infinity, Infinity, -Infinity, -Infinity),
      contours: [],
    };
    expect(pickPairGlyph([side('from', 0, [empty])], [0, 0], 10)).toBeNull();
    expect(pickPairGlyph([], [0, 0], 10)).toBeNull();
  });
});
