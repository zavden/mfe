import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRAWER_HEIGHT,
  DRAWER_SPLIT,
  ZEN_DRAWER_STORAGE_KEY,
  clampHeight,
  clampSplit,
  readDrawer,
  writeDrawer,
} from '../zenDrawer';

beforeEach(() => window.localStorage.clear());

const CLOSED = {
  creator: false,
  animations: false,
  height: DRAWER_HEIGHT.default,
  split: DRAWER_SPLIT.default,
};

describe('what Zen mode’s drawer keeps', () => {
  it('starts with both halves closed, at its default height and split', () => {
    expect(readDrawer()).toEqual(CLOSED);
    expect(DRAWER_SPLIT.default).toBeLessThan(0.5); // the Animations panel is the wider one
  });

  it('comes back as it was left', () => {
    const left = { creator: true, animations: true, height: 0.45, split: 0.3 };
    writeDrawer(left);
    expect(readDrawer()).toEqual(left);
    writeDrawer({ ...left, creator: false });
    expect(readDrawer()).toEqual({ ...left, creator: false });
  });

  it('keeps the height and the split within their bounds, and falls back on what it cannot read', () => {
    expect(clampHeight(0.05)).toBe(DRAWER_HEIGHT.min);
    expect(clampHeight(3)).toBe(DRAWER_HEIGHT.max);
    expect(clampSplit(0)).toBe(DRAWER_SPLIT.min);
    expect(clampSplit(1)).toBe(DRAWER_SPLIT.max);
    window.localStorage.setItem(
      ZEN_DRAWER_STORAGE_KEY,
      JSON.stringify({ creator: 'yes', animations: 1, height: 7, split: -2 }),
    );
    expect(readDrawer()).toEqual({
      creator: false,
      animations: false,
      height: DRAWER_HEIGHT.max,
      split: DRAWER_SPLIT.min,
    });
    window.localStorage.setItem(ZEN_DRAWER_STORAGE_KEY, 'not json');
    expect(readDrawer()).toEqual(CLOSED);
    window.localStorage.setItem(ZEN_DRAWER_STORAGE_KEY, JSON.stringify({ height: null }));
    expect(readDrawer()).toEqual(CLOSED);
  });

  it('reads what was kept when the drawer showed one panel at a time', () => {
    window.localStorage.setItem(
      ZEN_DRAWER_STORAGE_KEY,
      JSON.stringify({ open: true, shown: 'animations', height: 0.5 }),
    );
    expect(readDrawer()).toEqual({ ...CLOSED, animations: true, height: 0.5 });
    window.localStorage.setItem(
      ZEN_DRAWER_STORAGE_KEY,
      JSON.stringify({ open: false, shown: 'creator', height: 0.5 }),
    );
    expect(readDrawer()).toEqual({ ...CLOSED, height: 0.5 });
  });
});
