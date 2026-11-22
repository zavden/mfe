import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NARROW_LAYOUT, useMediaQuery } from '../useMediaQuery';

/** A `matchMedia` that answers `matches` for every query and lets a test change its mind. */
function fakeMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const lists: { matches: boolean }[] = [];
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = {
      matches,
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    lists.push(list);
    return list;
  });
  return {
    set(value: boolean) {
      matches = value;
      for (const list of lists) list.matches = value;
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('answers the query and follows it as it changes', () => {
    const media = fakeMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery(NARROW_LAYOUT));
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('is false where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery(NARROW_LAYOUT));
    expect(result.current).toBe(false);
  });
});
