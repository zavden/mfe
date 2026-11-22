// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_MARGIN } from '../../submenuSide';
import {
  createHoverMenu,
  HOVER_CLOSE_DELAY,
  HOVER_OPEN_DELAY,
  placeHoverMenu,
  type HoverMenuOpen,
} from '../hoverMenu';

/** A menu, and what it told its caller. */
function menuLog() {
  const log: (HoverMenuOpen | null)[] = [];
  const menu = createHoverMenu((open) => log.push(open));
  return { menu, log };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a menu that opens on hover', () => {
  it('opens once the pointer has rested on the key a moment, not when it only crosses it', () => {
    const { menu, log } = menuLog();
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY - 1);
    expect(log).toEqual([]);
    menu.leave('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    expect(log).toEqual([]);
    expect(menu.open).toBeNull();
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    expect(log).toEqual(['hover']);
    expect(menu.open).toBe('hover');
  });

  it('stays open on the way from the key to the menu, and closes a moment after both are left', () => {
    const { menu, log } = menuLog();
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    menu.leave('key');
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY - 1);
    menu.enter('menu');
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY * 2);
    expect(log).toEqual(['hover']);
    // Back onto the key from the menu: still open.
    menu.leave('menu');
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY * 2);
    expect(log).toEqual(['hover']);
    menu.leave('key');
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY - 1);
    expect(menu.open).toBe('hover');
    vi.advanceTimersByTime(1);
    expect(log).toEqual(['hover', null]);
    expect(menu.open).toBeNull();
  });

  it('opens at once on a press, for the keyboard to go in, and a second press closes it', () => {
    const { menu, log } = menuLog();
    expect(menu.press()).toBe('opened');
    expect(log).toEqual(['press']);
    expect(menu.press()).toBe('closed');
    expect(log).toEqual(['press', null]);
    // Opened by the pointer, a press takes it as its own: opened again, not closed.
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    expect(menu.press()).toBe('opened');
    expect(log).toEqual(['press', null, 'hover', 'press']);
    expect(menu.press()).toBe('closed');
    // A press while the pointer is still on its way to open it: open now, and once.
    menu.leave('key');
    menu.enter('key');
    menu.press();
    vi.advanceTimersByTime(HOVER_OPEN_DELAY * 2);
    expect(log).toEqual(['press', null, 'hover', 'press', null, 'press']);
  });

  it('opens from ↓ or ↑ on the key whatever opened it, never closing it', () => {
    const { menu, log } = menuLog();
    menu.show();
    menu.show();
    expect(log).toEqual(['press']);
    menu.close();
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    menu.show();
    expect(log).toEqual(['press', null, 'hover', 'press']);
  });

  it('closes at once (Escape, a press elsewhere, Tab, the window resized), and again only after a new rest', () => {
    const { menu, log } = menuLog();
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    menu.close();
    menu.close();
    expect(log).toEqual(['hover', null]);
    // The pointer still on the key: nothing until it leaves and comes back.
    vi.advanceTimersByTime(HOVER_OPEN_DELAY * 4);
    expect(log).toEqual(['hover', null]);
    menu.leave('key');
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    expect(log).toEqual(['hover', null, 'hover']);
  });

  it('forgets the pointer on a menu taken away under it', () => {
    const { menu, log } = menuLog();
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    menu.leave('key');
    menu.enter('menu');
    // Escape takes the menu away under the pointer, which never hears that it left it.
    menu.close();
    menu.enter('key');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY);
    menu.leave('key');
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY);
    expect(log).toEqual(['hover', null, 'hover', null]);
  });

  it('stops its timers when told, and still works after', () => {
    const { menu, log } = menuLog();
    menu.enter('key');
    menu.stop();
    vi.advanceTimersByTime(HOVER_OPEN_DELAY * 2);
    expect(log).toEqual([]);
    menu.press();
    menu.leave('key');
    menu.stop();
    vi.advanceTimersByTime(HOVER_CLOSE_DELAY * 2);
    expect(log).toEqual(['press']);
    menu.close();
    expect(log).toEqual(['press', null]);
  });
});

describe('where the menu hangs', () => {
  const viewport = { width: 1280, height: 800 };
  const size = { width: 170, height: 96 };

  it('under the key, its left edge under the key’s, its top at the key’s foot', () => {
    expect(placeHoverMenu({ left: 97, bottom: 204 }, size, viewport)).toEqual({
      left: 97,
      top: 204,
    });
  });

  it('moved left to stay in the window, never past its left margin', () => {
    expect(placeHoverMenu({ left: 1200, bottom: 204 }, size, viewport)).toEqual({
      left: 1280 - 170 - MENU_MARGIN,
      top: 204,
    });
    expect(placeHoverMenu({ left: 2, bottom: 204 }, size, viewport).left).toBe(MENU_MARGIN);
    expect(
      placeHoverMenu({ left: 40, bottom: 204 }, { width: 2000, height: 96 }, viewport).left,
    ).toBe(MENU_MARGIN);
  });

  it('moved up only in a window too short for it', () => {
    expect(placeHoverMenu({ left: 97, bottom: 760 }, size, viewport).top).toBe(
      800 - 96 - MENU_MARGIN,
    );
    expect(placeHoverMenu({ left: 97, bottom: 60 }, size, { width: 1280, height: 100 }).top).toBe(
      MENU_MARGIN,
    );
  });
});
