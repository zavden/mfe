import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTimelineVertical } from '../axis';
import { flyMode, isFlyKey, useFlyKey, useFlying } from '../useFlyKey';

const key = (patch: Partial<Parameters<typeof isFlyKey>[0]> = {}) => ({
  key: 't',
  code: 'KeyT',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...patch,
});

describe('the fly key', () => {
  it('is T, alone or with Shift', () => {
    expect(isFlyKey(key())).toBe(true);
    expect(isFlyKey(key({ key: 'T' }))).toBe(true);
    expect(isFlyKey(key({ key: 's', code: 'KeyS' }))).toBe(false);
  });

  it('is not T with Ctrl, ⌘ or Alt, which is another command’s', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const)
      expect(isFlyKey(key({ [modifier]: true }))).toBe(false);
  });

  it('is the key where T is on a keyboard of another script', () => {
    // A Cyrillic layout types «е» with the key of T: the physical key counts (`letterOf`).
    expect(isFlyKey(key({ key: 'е' }))).toBe(true);
  });

  it('moves the playhead with Shift, the view without', () => {
    expect(flyMode(true)).toBe('playhead');
    expect(flyMode(false)).toBe('view');
  });
});

describe('T held', () => {
  afterEach(() => setTimelineVertical(false));

  const press = (type: 'keydown' | 'keyup', init: KeyboardEventInit) =>
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent(type, { bubbles: true, ...init }));
    });
  const move = (x: number, y: number, shiftKey = false) =>
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, shiftKey }));
    });
  /** A view 200 px long over 1000 px of time. */
  const view = () => {
    const scroll = document.createElement('div');
    Object.defineProperties(scroll, {
      clientWidth: { value: 200 },
      scrollWidth: { value: 1000 },
    });
    return scroll;
  };
  const T = { key: 't', code: 'KeyT' };
  const SHIFT_T = { key: 'T', code: 'KeyT', shiftKey: true };

  it('with Shift takes the playhead to the pointer at once, and on with every move', () => {
    const scrubTo = vi.fn();
    const scroll = view();
    const ref = { current: scroll };
    const { result } = renderHook(() => useFlyKey(ref, scrubTo));
    move(120, 40);
    expect(scrubTo).not.toHaveBeenCalled();
    press('keydown', SHIFT_T);
    expect(result.current).toBe('playhead');
    expect(scrubTo).toHaveBeenLastCalledWith(120);
    expect(document.documentElement.dataset.timelineFlying).toBe('playhead-across');
    move(180, 90, true);
    expect(scrubTo).toHaveBeenLastCalledWith(180);
    // The view does not move while the playhead does.
    expect(scroll.scrollLeft).toBe(0);
    // Released, the playhead stays: the mouse moves nothing.
    press('keyup', SHIFT_T);
    expect(result.current).toBeNull();
    expect(document.documentElement.dataset.timelineFlying).toBeUndefined();
    move(20, 90, true);
    expect(scrubTo).toHaveBeenCalledTimes(2);
  });

  it('says what the mouse moves to whoever asks, and nothing once it is gone', () => {
    const scrubTo = vi.fn();
    const ref = { current: view() };
    const { unmount } = renderHook(() => useFlyKey(ref, scrubTo));
    expect(useFlying.getState().mode).toBeNull();
    press('keydown', T);
    expect(useFlying.getState().mode).toBe('view');
    press('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true });
    expect(useFlying.getState().mode).toBe('playhead');
    press('keyup', SHIFT_T);
    expect(useFlying.getState().mode).toBeNull();
    // The timeline taken away with the key held: nobody would hear its release.
    press('keydown', T);
    expect(useFlying.getState().mode).toBe('view');
    unmount();
    expect(useFlying.getState().mode).toBeNull();
  });

  it('follows the pointer down the screen in the vertical timeline', () => {
    setTimelineVertical(true);
    const scrubTo = vi.fn();
    const ref = { current: view() };
    renderHook(() => useFlyKey(ref, scrubTo));
    move(120, 40);
    press('keydown', SHIFT_T);
    expect(scrubTo).toHaveBeenLastCalledWith(40);
    expect(document.documentElement.dataset.timelineFlying).toBe('playhead-down');
    move(300, 75, true);
    expect(scrubTo).toHaveBeenLastCalledWith(75);
    press('keyup', SHIFT_T);
  });

  it('changes what the mouse moves as Shift is pressed and let go', () => {
    const scrubTo = vi.fn();
    const scroll = view();
    const ref = { current: scroll };
    const { result } = renderHook(() => useFlyKey(ref, scrubTo));
    move(100, 0);
    press('keydown', T);
    expect(result.current).toBe('view');
    move(110, 0);
    // A scrollbar as long as the view: 10 px of 200 are 50 px of the 1000.
    expect(scroll.scrollLeft).toBe(50);
    expect(scrubTo).not.toHaveBeenCalled();
    press('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true });
    expect(result.current).toBe('playhead');
    expect(scrubTo).toHaveBeenLastCalledWith(110);
    move(130, 0, true);
    expect(scroll.scrollLeft).toBe(50);
    expect(scrubTo).toHaveBeenLastCalledWith(130);
    press('keyup', { key: 'Shift', code: 'ShiftLeft' });
    expect(result.current).toBe('view');
    // Only the moves made without Shift move the view.
    move(134, 0);
    expect(scroll.scrollLeft).toBe(70);
    expect(scrubTo).toHaveBeenCalledTimes(2);
    press('keyup', T);
    expect(result.current).toBeNull();
  });

  it('is a letter in a field, and ends with any other key', () => {
    const scrubTo = vi.fn();
    const ref = { current: view() };
    const { result } = renderHook(() => useFlyKey(ref, scrubTo));
    const field = document.body.appendChild(document.createElement('input'));
    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...SHIFT_T }));
    });
    expect(result.current).toBeNull();
    field.remove();
    press('keydown', SHIFT_T);
    expect(result.current).toBe('playhead');
    press('keydown', { key: 'z', code: 'KeyZ' });
    expect(result.current).toBeNull();
  });
});
