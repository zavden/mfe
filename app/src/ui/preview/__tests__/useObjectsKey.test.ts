import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isObjectsKey, useObjectsHeld, useObjectsKey } from '../useObjectsKey';

const key = (patch: Partial<Parameters<typeof isObjectsKey>[0]> = {}) => ({
  key: 'f',
  code: 'KeyF',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...patch,
});

describe('the key that reaches the objects', () => {
  it('is F, alone or with Shift', () => {
    expect(isObjectsKey(key())).toBe(true);
    expect(isObjectsKey(key({ key: 'F' }))).toBe(true);
    expect(isObjectsKey(key({ key: 't', code: 'KeyT' }))).toBe(false);
  });

  it('is not F with Ctrl, ⌘ or Alt, which is another command’s', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const)
      expect(isObjectsKey(key({ [modifier]: true }))).toBe(false);
  });

  it('is the key where F is on a keyboard of another script', () => {
    // A Cyrillic layout types «а» with the key of F: the physical key counts (`letterOf`).
    expect(isObjectsKey(key({ key: 'а' }))).toBe(true);
  });
});

describe('F held', () => {
  afterEach(() => document.body.replaceChildren());

  /** A key event on `target`; whether somebody prevented it. */
  const press = (
    type: 'keydown' | 'keyup',
    init: KeyboardEventInit,
    target: Element = document.body,
  ) => {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    act(() => {
      target.dispatchEvent(event);
    });
    return event.defaultPrevented;
  };
  const F = { key: 'f', code: 'KeyF' };

  it('is held from its press to its release, and typed nowhere', () => {
    const { result } = renderHook(() => useObjectsKey(true));
    expect(result.current).toBe(false);
    expect(press('keydown', F)).toBe(true);
    expect(result.current).toBe(true);
    expect(useObjectsHeld.getState().held).toBe(true);
    press('keyup', F);
    expect(result.current).toBe(false);
    expect(useObjectsHeld.getState().held).toBe(false);
  });

  it('starts with Shift down too: the transform handles are asked for with it', () => {
    const { result } = renderHook(() => useObjectsKey(true));
    press('keydown', { key: 'F', code: 'KeyF', shiftKey: true });
    expect(result.current).toBe(true);
    // Shift, Ctrl and Alt pressed and let go meanwhile do not end it.
    press('keydown', { key: 'Control', ctrlKey: true });
    press('keyup', { key: 'Control' });
    press('keyup', { key: 'Shift' });
    expect(result.current).toBe(true);
    press('keyup', F);
    expect(result.current).toBe(false);
  });

  it('keeps its repeats from everyone, with whatever is held by then', () => {
    const heard: string[] = [];
    const listen = (event: KeyboardEvent) => void heard.push(event.key);
    window.addEventListener('keydown', listen);
    const { result } = renderHook(() => useObjectsKey(true));
    press('keydown', F);
    heard.length = 0;
    // Ctrl held for a drag without snapping: the repeats would be Ctrl+F, the search of formulas.
    expect(press('keydown', { ...F, ctrlKey: true, repeat: true })).toBe(true);
    expect(press('keydown', { ...F, altKey: true, repeat: true })).toBe(true);
    expect(heard).toEqual([]);
    expect(result.current).toBe(true);
    // Another key is nobody's business here.
    expect(press('keydown', { key: 'ArrowLeft' })).toBe(false);
    expect(heard).toEqual(['ArrowLeft']);
    window.removeEventListener('keydown', listen);
  });

  it('is not taken with Ctrl, ⌘ or Alt, in a field, nor from a repeat of a key held before', () => {
    const { result } = renderHook(() => useObjectsKey(true));
    expect(press('keydown', { ...F, ctrlKey: true })).toBe(false);
    expect(press('keydown', { ...F, metaKey: true })).toBe(false);
    expect(press('keydown', { ...F, altKey: true })).toBe(false);
    expect(press('keydown', { ...F, repeat: true })).toBe(false);
    const field = document.createElement('input');
    document.body.append(field);
    expect(press('keydown', F, field)).toBe(false);
    expect(result.current).toBe(false);
  });

  it('ends when the window loses the focus, and when ⌘ is let go', () => {
    const { result } = renderHook(() => useObjectsKey(true));
    press('keydown', F);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current).toBe(false);
    // A Mac never tells of a letter released while ⌘ is down.
    press('keydown', F);
    press('keydown', { key: 'Meta', metaKey: true });
    expect(result.current).toBe(true);
    press('keyup', { key: 'Meta' });
    expect(result.current).toBe(false);
  });

  it('has no work outside the world view: the key is nobody’s there', () => {
    const { result, rerender } = renderHook(({ on }) => useObjectsKey(on), {
      initialProps: { on: false },
    });
    expect(press('keydown', F)).toBe(false);
    expect(result.current).toBe(false);
    press('keyup', F);
    // Held as the world view goes: it is let go of.
    rerender({ on: true });
    press('keydown', F);
    expect(result.current).toBe(true);
    rerender({ on: false });
    expect(result.current).toBe(false);
    expect(useObjectsHeld.getState().held).toBe(false);
  });
});
