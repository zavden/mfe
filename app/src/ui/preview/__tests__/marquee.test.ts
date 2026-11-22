// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import type { ClipId } from '../../../model';
import { clipsTouching, marqueeRect, mergeMarquee } from '../marquee';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});

describe('marqueeRect', () => {
  const expected = box(-1, -2, 3, 4);

  it('is normalised whichever corner the drag starts from', () => {
    expect(marqueeRect([-1, -2], [3, 4])).toEqual(expected); // from the bottom-left
    expect(marqueeRect([3, 4], [-1, -2])).toEqual(expected); // from the top-right
    expect(marqueeRect([-1, 4], [3, -2])).toEqual(expected); // from the top-left
    expect(marqueeRect([3, -2], [-1, 4])).toEqual(expected); // from the bottom-right
  });

  it('is a point when the pointer has not moved, a segment when it moved along one axis', () => {
    expect(marqueeRect([1, 2], [1, 2])).toEqual(box(1, 2, 1, 2));
    expect(marqueeRect([1, 2], [5, 2])).toEqual(box(1, 2, 5, 2));
    expect(marqueeRect([1, 2], [1, -3])).toEqual(box(1, -3, 1, 2));
  });
});

describe('clipsTouching', () => {
  const boxes = new Map<ClipId, Box>([
    ['a', box(0, 0, 2, 1)],
    ['b', box(4, 0, 6, 1)],
    ['c', box(0, 3, 2, 4)],
  ]);

  it('picks the boxes the rectangle overlaps and leaves the ones it misses', () => {
    expect(clipsTouching(boxes, box(1, 0.5, 5, 0.8))).toEqual(['a', 'b']);
    expect(clipsTouching(boxes, box(2.5, -1, 3.5, 5))).toEqual([]); // between all of them
    expect(clipsTouching(boxes, box(-1, 2, 3, 5))).toEqual(['c']);
  });

  it('picks a box the rectangle lies inside, and one inside the rectangle', () => {
    expect(clipsTouching(boxes, box(0.5, 0.2, 1, 0.4))).toEqual(['a']);
    expect(clipsTouching(boxes, box(-1, -1, 10, 10))).toEqual(['a', 'b', 'c']);
  });

  it('counts a shared edge or a shared corner as touching', () => {
    expect(clipsTouching(boxes, box(2, -5, 3, 5))).toEqual(['a', 'c']); // a's and c's right edge
    expect(clipsTouching(boxes, box(3, 1, 4, 2))).toEqual(['b']); // b's top-left corner
    expect(clipsTouching(boxes, box(-3, 4, -2, 6))).toEqual([]);
    expect(clipsTouching(boxes, box(-1, 4, 0, 6))).toEqual(['c']); // c's top-left corner
  });

  it('misses a box just past an edge', () => {
    expect(clipsTouching(boxes, box(2.000001, -5, 3, 5))).toEqual([]);
  });

  it('lets a degenerate rectangle touch the boxes it crosses', () => {
    expect(clipsTouching(boxes, box(-1, 0.5, 5, 0.5))).toEqual(['a', 'b']); // a horizontal line
    expect(clipsTouching(boxes, box(1, -1, 1, 5))).toEqual(['a', 'c']); // a vertical line
    expect(clipsTouching(boxes, box(1, 0.5, 1, 0.5))).toEqual(['a']); // a point inside a
    expect(clipsTouching(boxes, box(3, 2, 3, 2))).toEqual([]); // a point outside everything
  });

  it("keeps the map's order, not the rectangle's direction", () => {
    const reversed = new Map<ClipId, Box>([...boxes].reverse());
    const all = box(-1, -1, 10, 10);
    expect(clipsTouching(reversed, all)).toEqual(['c', 'b', 'a']);
  });

  it('touches nothing in an empty map', () => {
    expect(clipsTouching(new Map(), box(-10, -10, 10, 10))).toEqual([]);
  });
});

describe('mergeMarquee', () => {
  it('adds the touched clips after the initial selection when additive', () => {
    expect(mergeMarquee(['a', 'b'], ['c', 'd'], true)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lists a clip once when it was selected and is touched too', () => {
    expect(mergeMarquee(['a', 'b'], ['c', 'b', 'a'], true)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the initial selection when nothing is touched', () => {
    expect(mergeMarquee(['b', 'a'], [], true)).toEqual(['b', 'a']);
    expect(mergeMarquee([], [], true)).toEqual([]);
  });

  it('is the touched clips alone when not additive', () => {
    expect(mergeMarquee(['a', 'b'], ['c', 'b'], false)).toEqual(['c', 'b']);
    expect(mergeMarquee(['a', 'b'], [], false)).toEqual([]);
  });

  it('does not change its inputs', () => {
    const initial = ['a'];
    const touched = ['b'];
    const merged = mergeMarquee(initial, touched, true);
    merged.push('z');
    expect(initial).toEqual(['a']);
    expect(touched).toEqual(['b']);
    expect(mergeMarquee(initial, touched, false)).not.toBe(touched);
  });
});
