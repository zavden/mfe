// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { placeSubmenu, submenuSide } from '../submenuSide';

describe('submenuSide', () => {
  it('opens to the right when it fits there', () => {
    expect(submenuSide(100, 300, 150, 1000)).toBe('right');
    // Exactly up to the margin still fits.
    expect(submenuSide(100, 300, 150, 458)).toBe('right');
  });

  it('flips to the left when it leaves the window on the right and fits on the left', () => {
    expect(submenuSide(500, 700, 150, 800)).toBe('left');
  });

  it('takes the side that overflows less when neither fits', () => {
    // A 300 px window and a submenu 150 wide: the side with the smaller overflow.
    expect(submenuSide(100, 280, 150, 300)).toBe('left');
    expect(submenuSide(30, 250, 150, 300)).toBe('right');
  });
});

describe('placeSubmenu', () => {
  const entry = { left: 105, right: 275, top: 300 };
  const window = { width: 1000, height: 600 };

  it('opens to the right of its entry, level with it: its first item lines up with the entry', () => {
    expect(placeSubmenu(entry, { width: 200, height: 150 }, window)).toEqual({
      left: 276,
      top: 295,
      flipped: false,
    });
  });

  it('flips to the left of its entry when the window has no room on the right', () => {
    expect(
      placeSubmenu({ ...entry, left: 705, right: 875 }, { width: 200, height: 150 }, window),
    ).toEqual({
      left: 504,
      top: 295,
      flipped: true,
    });
  });

  it('moves up to stay inside the window, and no higher than the margin', () => {
    expect(placeSubmenu({ ...entry, top: 500 }, { width: 200, height: 150 }, window).top).toBe(442);
    expect(placeSubmenu({ ...entry, top: 500 }, { width: 200, height: 700 }, window).top).toBe(8);
    expect(placeSubmenu({ ...entry, top: 3 }, { width: 200, height: 150 }, window).top).toBe(8);
  });
});
