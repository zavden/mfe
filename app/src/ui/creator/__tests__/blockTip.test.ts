import { describe, expect, it } from 'vitest';
import {
  createBlockTip,
  placeTip,
  PRESS_SLOP,
  TIP_HEIGHT,
  TIP_PREVIEW,
  TIP_WIDTH,
  tipSize,
} from '../blockTip';

/** A tooltip controller over blocks named by a string, and what it told its caller. */
function tipLog() {
  const log: string[] = [];
  const tip = createBlockTip<string>({
    onShow: (block) => log.push(`show ${block}`),
    onHide: () => log.push('hide'),
  });
  return { tip, log };
}

describe('createBlockTip', () => {
  it('shows at once, and says nothing more while the pointer moves on the same block', () => {
    const { tip, log } = tipLog();
    tip.move('a', 10, 10);
    expect(log).toEqual(['show a']);
    tip.move('a', 11, 10);
    tip.move('a', 60, 45);
    expect(log).toEqual(['show a']);
  });

  it('goes straight to another block, and hides off the blocks', () => {
    const { tip, log } = tipLog();
    tip.move('a', 10, 10);
    tip.move('b', 120, 10);
    expect(log).toEqual(['show a', 'show b']);
    tip.move(null, 120, 300);
    tip.move(null, 121, 300);
    expect(log).toEqual(['show a', 'show b', 'hide']);
    tip.move('b', 120, 10);
    expect(log).toEqual(['show a', 'show b', 'hide', 'show b']);
  });

  it('cancel hides once, and the next move shows again', () => {
    const { tip, log } = tipLog();
    tip.cancel();
    expect(log).toEqual([]);
    tip.move('a', 10, 10);
    tip.cancel();
    tip.cancel();
    expect(log).toEqual(['show a', 'hide']);
    tip.move('a', 10, 10);
    expect(log).toEqual(['show a', 'hide', 'show a']);
  });

  it('a press hides until the pointer has moved off the spot', () => {
    const { tip, log } = tipLog();
    tip.move('a', 10, 10);
    tip.press('a', 10, 10);
    expect(log).toEqual(['show a', 'hide']);
    // The hand shakes between the two clicks of a double-click: nothing flashes.
    tip.move('a', 11, 12);
    tip.cancel(); // a move with the button down
    tip.move('a', 10 + PRESS_SLOP - 1, 10);
    expect(log).toEqual(['show a', 'hide']);
    tip.move('a', 10 + PRESS_SLOP, 10);
    expect(log).toEqual(['show a', 'hide', 'show a']);
    // And from then on the spot means nothing.
    tip.cancel();
    tip.move('a', 10, 10);
    expect(log).toEqual(['show a', 'hide', 'show a', 'hide', 'show a']);
  });

  it('after a press, another block shows whatever the distance', () => {
    const { tip, log } = tipLog();
    tip.move('a', 10, 10);
    tip.press('a', 10, 10);
    tip.move('b', 11, 10);
    expect(log).toEqual(['show a', 'hide', 'show b']);
  });
});

describe('placeTip', () => {
  const viewport = { width: 1200, height: 800 };
  const block = { left: 20, right: 120, top: 200, bottom: 300 };

  it('goes to the right of the block, level with its top', () => {
    expect(placeTip(block, viewport)).toEqual({ left: 128, top: 200 });
  });

  it('goes to the left when the right has no room', () => {
    const far = { left: 1000, right: 1100, top: 200, bottom: 300 };
    expect(placeTip(far, viewport)).toEqual({ left: 1000 - 8 - TIP_WIDTH, top: 200 });
  });

  it('stays in a window with room on neither side', () => {
    const narrow = { width: 300, height: 800 };
    expect(placeTip({ left: 100, right: 200, top: 200, bottom: 300 }, narrow)).toEqual({
      left: 300 - TIP_WIDTH - 6,
      top: 200,
    });
  });

  it('is level with the foot of the block when it would run past the window', () => {
    const low = { left: 20, right: 120, top: 800 - TIP_HEIGHT, bottom: 790 };
    expect(placeTip(low, viewport)).toEqual({ left: 128, bottom: 10 });
    // A block cut by the foot of the window: the tooltip stays whole.
    expect(placeTip({ ...low, bottom: 840 }, viewport)).toEqual({ left: 128, bottom: 6 });
    // And one cut by its top.
    expect(placeTip({ ...block, top: -30, bottom: 70 }, viewport)).toEqual({ left: 128, top: 6 });
  });
});

describe('the tooltip at the sizes of the previews (D173)', () => {
  const window = { width: 1280, height: 800 };

  it('is 288 × 122 at 1×, its rendering 274 × 62 — the size it always had', () => {
    expect([TIP_WIDTH, TIP_HEIGHT]).toEqual([288, 122]);
    expect(tipSize(1, window)).toEqual({ width: 288, height: 122, preview: TIP_PREVIEW });
    expect(TIP_PREVIEW).toEqual({ width: 274, height: 62 });
  });

  it('makes its rendering as many times wider and taller, the caption and keys as they are', () => {
    const sizes = [1, 1.5, 2, 3].map((scale) => tipSize(scale, window));
    expect(sizes.map((size) => size.preview)).toEqual([
      { width: 274, height: 62 },
      { width: 411, height: 93 },
      { width: 548, height: 124 },
      { width: 822, height: 186 },
    ]);
    expect(sizes.map((size) => [size.width, size.height])).toEqual([
      [288, 122],
      [425, 153],
      [562, 184],
      [836, 246],
    ]);
  });

  it('in a window too small for it, is as large as fits, in proportion, never under 1×', () => {
    // In whole pixels, at most the window less its margins.
    const narrow = tipSize(3, { width: 600, height: 800 });
    expect(narrow.width).toBe(600 - 12);
    expect(narrow.preview.width / narrow.preview.height).toBeCloseTo(274 / 62, 1);
    const short = tipSize(3, { width: 1280, height: 200 });
    expect(short.height).toBeLessThanOrEqual(200 - 12);
    expect(short.height).toBeGreaterThan(200 - 14);
    expect(short.preview.width / short.preview.height).toBeCloseTo(274 / 62, 1);
    expect(tipSize(3, { width: 200, height: 100 })).toEqual(tipSize(1, window));
  });

  it('at 3× stays inside the window beside a block near its right edge or its foot', () => {
    const size = tipSize(3, window);
    const inside = (
      place: { left: number; top: number } | { left: number; bottom: number },
    ): boolean => {
      const top = 'top' in place ? place.top : window.height - place.bottom - size.height;
      return (
        place.left >= 6 &&
        place.left + size.width <= window.width - 6 &&
        top >= 6 &&
        top + size.height <= window.height - 6
      );
    };
    // Near the right edge: to the left of the block.
    const right = { left: 1100, right: 1200, top: 200, bottom: 300 };
    expect(placeTip(right, window, size)).toEqual({ left: 1100 - 8 - 836, top: 200 });
    expect(inside(placeTip(right, window, size))).toBe(true);
    // Near the foot: level with the block's foot.
    const low = { left: 20, right: 120, top: 650, bottom: 750 };
    expect(placeTip(low, window, size)).toEqual({ left: 128, bottom: 50 });
    expect(inside(placeTip(low, window, size))).toBe(true);
    // Both at once.
    expect(inside(placeTip({ ...right, top: 650, bottom: 750 }, window, size))).toBe(true);
  });

  it('is never pushed past the top of a short window by the foot of a block high in it', () => {
    const short = { width: 1280, height: 300 };
    const size = tipSize(1.5, short);
    expect(size.height).toBe(153);
    // Level with the foot of the block (bottom 190) it would start at 300 − 110 − 153 = 37: fine.
    expect(placeTip({ left: 20, right: 120, top: 160, bottom: 190 }, short, size)).toEqual({
      left: 128,
      bottom: 110,
    });
    // A block higher up has room under its own top: level with it.
    expect(placeTip({ left: 20, right: 120, top: 100, bottom: 120 }, short, size)).toEqual({
      left: 128,
      top: 100,
    });
    // In a window shorter still, neither fits: level with the foot (bottom 120) the top would be
    // at 260 − 120 − 153 = −13; it is held at the margin instead.
    const shorter = { width: 1280, height: 260 };
    expect(tipSize(1.5, shorter).height).toBe(153);
    expect(placeTip({ left: 20, right: 120, top: 120, bottom: 140 }, shorter, size)).toEqual({
      left: 128,
      bottom: 260 - 153 - 6,
    });
  });
});
