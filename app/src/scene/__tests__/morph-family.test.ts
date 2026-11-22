// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { padFamily } from '../anim/morph';

/* `add_n_more_submobjects`: repeat_indices = arange(n + k) · n // (n + k), split into groups;
 * each glyph is followed by (group size − 1) invisible copies of itself. */
const show = (n: number, k: number) =>
  padFamily(n, k)
    .map((e) => `${e.index}${e.visible ? '' : "'"}`)
    .join(' ');

describe('padFamily', () => {
  it('pads the smaller group the way Manim does', () => {
    expect(show(2, 0)).toBe('0 1');
    expect(show(2, 1)).toBe("0 0' 1");
    expect(show(1, 2)).toBe("0 0' 0'");
    expect(show(3, 2)).toBe("0 0' 1 1' 2");
    expect(show(2, 4)).toBe("0 0' 0' 1 1' 1'");
    expect(show(4, 1)).toBe("0 0' 1 2 3");
    expect(show(5, 3)).toBe("0 0' 1 1' 2 3 3' 4");
  });

  it('always yields n + k entries, each original once', () => {
    for (let n = 1; n <= 7; n++) {
      for (let k = 0; k <= 9; k++) {
        const list = padFamily(n, k);
        expect(list).toHaveLength(n + k);
        expect(list.filter((e) => e.visible).map((e) => e.index)).toEqual(
          Array.from({ length: n }, (_, i) => i),
        );
      }
    }
  });
});
