// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import { linkFrame, rendersTextSize, textSize } from '../linkLayout';

/** A box `width` × `height` with its lower left corner at (`x`, `y`). */
const box = (width: number, height: number, x = 0, y = 0): Box => ({
  minX: x,
  minY: y,
  maxX: x + width,
  maxY: y + height,
});

describe('textSize', () => {
  it('is the median of the longer sides of the glyphs', () => {
    // A letter, a minus sign as wide as a letter is tall, a taller letter.
    expect(textSize([box(0.2, 0.25), box(0.3, 0.02), box(0.15, 0.4)])).toBeCloseTo(0.3);
    // Of an even count, the middle of the two in the middle.
    expect(textSize([box(0.2, 0.2), box(0.4, 0.1)])).toBeCloseTo(0.3);
    expect(textSize([box(0.2, 0.3)])).toBeCloseTo(0.3);
  });

  it('is not moved by a big delimiter, nor by how many lines the formula has', () => {
    const letters = Array.from({ length: 9 }, (_, i) => box(0.2, 0.23, i * 0.3));
    const withParenthesis = [...letters, box(0.15, 1.2), box(0.15, 1.2, 3)];
    expect(textSize(withParenthesis)).toBeCloseTo(textSize(letters));
    // The same letters five lines down: the boxes are where they are, their sizes do not change.
    const lower = letters.map((b) => ({ ...b, minY: b.minY - 5, maxY: b.maxY - 5 }));
    expect(textSize([...letters, ...lower])).toBeCloseTo(textSize(letters));
  });

  it('is 0 without glyphs, and leaves out a glyph without a box', () => {
    expect(textSize([])).toBe(0);
    const empty = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    expect(textSize([empty])).toBe(0);
    expect(textSize([empty, box(0.2, 0.3)])).toBeCloseTo(0.3);
    expect(textSize([box(0, 0)])).toBe(0);
  });

  it('is asked of the glyphs of every render of a drawing together', () => {
    const render = (...boxes: Box[]) => ({ glyphs: boxes.map((bbox) => ({ bbox })) });
    expect(
      rendersTextSize(render(box(0.2, 0.2), box(0.5, 0.5)), render(box(0.3, 0.1))),
    ).toBeCloseTo(0.3);
    expect(rendersTextSize()).toBe(0);
  });
});

describe('linkFrame', () => {
  const TEXT = 0.25;

  it('spaces the formulas by the size of the text: a taller formula has the same gap', () => {
    const line = linkFrame(box(4, 0.5), box(4, 0.5), TEXT);
    const derivation = linkFrame(box(4, 6), box(4, 6), TEXT);
    expect(derivation.unit).toBe(line.unit);
    expect(derivation.gapTop - derivation.gapBottom).toBeCloseTo(line.gapTop - line.gapBottom);
    // The drawing is taller by what the two formulas are, and no more.
    expect(derivation.top - derivation.bottom - (line.top - line.bottom)).toBeCloseTo(11);
    // A gap of some three letters between the two.
    expect(line.gapTop - line.gapBottom).toBeCloseTo(3 * TEXT);
  });

  it('grows with the text, and has a least text to be spaced for', () => {
    const small = linkFrame(box(4, 0.5), box(4, 0.5), TEXT);
    const large = linkFrame(box(4, 0.5), box(4, 0.5), 2 * TEXT);
    expect(large.unit).toBeCloseTo(2 * small.unit);
    const none = linkFrame(box(4, 0.5), box(4, 0.5), 0);
    expect(none.unit).toBeGreaterThan(0);
    expect(none.unit).toBe(linkFrame(box(4, 0.5), box(4, 0.5), 0.01).unit);
  });

  it('holds both formulas with a margin, centred, and is no narrower than four units', () => {
    const frame = linkFrame(box(4, 0.5, -1), box(2, 1, 3), TEXT);
    expect(frame.right).toBeCloseTo(-frame.left);
    expect(frame.right).toBeGreaterThan(2);
    expect(frame.top).toBeGreaterThan(frame.gapTop + 0.5);
    expect(frame.bottom).toBeLessThan(frame.gapBottom - 1);
    const narrow = linkFrame(box(0.1, 0.2), box(0.1, 0.2), TEXT);
    expect(narrow.right - narrow.left).toBeGreaterThanOrEqual(4 * narrow.unit);
  });

  it('leaves room over a stacked source for the keys of the view: a share of the width', () => {
    /** What a frame leaves over its source `h` tall, and under its target. */
    const over = (frame: ReturnType<typeof linkFrame>, h: number) => frame.top - frame.gapTop - h;
    const under = (frame: ReturnType<typeof linkFrame>, h: number) =>
      frame.gapBottom - h - frame.bottom;
    // A line of 12 units: the keys are 34 px of an element 660 px wide, which the drawing fills.
    const wide = linkFrame(box(12, 0.5), box(9, 0.5), TEXT);
    const width = wide.right - wide.left;
    expect(over(wide, 0.5) * (660 / width)).toBeGreaterThan(34);
    expect(over(wide, 0.5)).toBeGreaterThan(under(wide, 0.5));
    // Twice as wide, twice the room: the same pixels of it.
    const wider = linkFrame(box(24, 0.5), box(9, 0.5), TEXT);
    expect(over(wider, 0.5) / (wider.right - wider.left)).toBeCloseTo(over(wide, 0.5) / width, 2);
    // Under the target, the room is the text's, whatever the width.
    expect(under(wider, 0.5)).toBeCloseTo(under(wide, 0.5));
    // A short formula has the room of its text over it as under it: its drawing is drawn large,
    // and it ends far from the corner.
    const short = linkFrame(box(1, 0.5), box(1, 0.5), TEXT);
    expect(over(short, 0.5)).toBeCloseTo(under(short, 0.5));
    expect(over(short, 0.5)).toBeCloseTo(under(wide, 0.5));
  });

  it('lays the two side by side about y = 0, the source at the left of the same gap', () => {
    const a = box(4, 2, -1, 3);
    const b = box(3, 1, 5, -2);
    const stacked = linkFrame(a, b, TEXT);
    const side = linkFrame(a, b, TEXT, 'side');
    expect(stacked.layout).toBe('stacked');
    expect(side.layout).toBe('side');
    expect(side.unit).toBe(stacked.unit);
    // The source ends where the gap starts, the target starts where it ends: the same gap.
    const gap = stacked.gapTop - stacked.gapBottom;
    expect(a.maxX + side.from.dx).toBeCloseTo(-gap / 2);
    expect(b.minX + side.to.dx).toBeCloseTo(gap / 2);
    // Each centred on y = 0: a line of the one is beside the same line of the other.
    expect((a.minY + a.maxY) / 2 + side.from.dy).toBeCloseTo(0);
    expect((b.minY + b.maxY) / 2 + side.to.dy).toBeCloseTo(0);
    // The box holds both with a margin, and has no band across between them.
    expect(side.left).toBeLessThan(-gap / 2 - 4);
    expect(side.right).toBeGreaterThan(gap / 2 + 3);
    expect(side.bottom).toBeLessThan(-1);
    expect([side.gapTop, side.gapBottom]).toEqual([0, 0]);
  });

  it('leaves room over the formulas side by side for the arcs: a share of the width', () => {
    const narrow = linkFrame(box(2, 2), box(2, 2), TEXT, 'side');
    const wide = linkFrame(box(6, 2), box(6, 2), TEXT, 'side');
    const room = (frame: typeof narrow) => frame.top - 1;
    expect(room(narrow)).toBeGreaterThan(0.15 * (narrow.right - narrow.left));
    expect(room(wide)).toBeGreaterThan(room(narrow));
    // More over the formulas than under them.
    expect(room(narrow)).toBeGreaterThan(-1 - narrow.bottom);
  });
});
