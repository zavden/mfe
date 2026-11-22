import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDrag, isMainClick, screenPoint, trackPointer } from '../pointer';

const pointer = (type: string, pointerId: number) =>
  Object.assign(new Event(type), { pointerId }) as PointerEvent;

describe('isDrag', () => {
  const pressed = { clientX: 10, clientY: 10 };

  it('is a drag from the threshold on, in any direction', () => {
    expect(isDrag({ clientX: 12, clientY: 10 }, pressed)).toBe(false);
    expect(isDrag({ clientX: 10, clientY: 13 }, pressed)).toBe(true);
    expect(isDrag({ clientX: 8, clientY: 8 }, pressed)).toBe(false);
    expect(isDrag({ clientX: 7, clientY: 8 }, pressed)).toBe(true);
  });

  it('measures from the press as the screen gave it: a copy of the event', () => {
    const event = { clientX: 400, clientY: 90, pointerId: 1, shiftKey: true };
    const kept = screenPoint(event);
    expect(kept).toEqual({ clientX: 400, clientY: 90 });
    expect(isDrag({ clientX: 400, clientY: 91 }, kept)).toBe(false);
    expect(isDrag({ clientX: 397, clientY: 90 }, kept)).toBe(true);
  });
});

describe('isMainClick', () => {
  afterEach(() => vi.restoreAllMocks());
  const press = (button: number, ctrlKey = false) => isMainClick({ button, ctrlKey });

  it('is the main button, with Ctrl held too, where Ctrl+click is no other click', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
    expect(press(0)).toBe(true);
    expect(press(0, true)).toBe(true);
    expect(press(1)).toBe(false);
    expect(press(2)).toBe(false);
  });

  it('is not a Ctrl+click on a Mac: the secondary click', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(press(0)).toBe(true);
    expect(press(0, true)).toBe(false);
    expect(press(2)).toBe(false);
  });
});

describe('trackPointer', () => {
  it('follows one pointer until it is released', () => {
    const move = vi.fn();
    const end = vi.fn();
    trackPointer(1, { move, end });
    window.dispatchEvent(pointer('pointermove', 2)); // another pointer
    window.dispatchEvent(pointer('pointermove', 1));
    window.dispatchEvent(pointer('pointerup', 1));
    window.dispatchEvent(pointer('pointermove', 1)); // after the end
    expect(move).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith(expect.any(Event), false);
  });

  it('cancels on Escape, unless the key is left to others', () => {
    const end = vi.fn();
    trackPointer(1, { move: () => {}, end });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(end).toHaveBeenCalledWith(null, true);

    const kept = vi.fn();
    trackPointer(2, { move: () => {}, end: kept }, { escape: false });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(kept).not.toHaveBeenCalled();
    window.dispatchEvent(pointer('pointerup', 2));
    expect(kept).toHaveBeenCalledWith(expect.any(Event), false);
  });
});
