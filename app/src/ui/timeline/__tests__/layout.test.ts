import { describe, expect, it } from 'vitest';
import {
  blockShowsName,
  CAMERA_ROW_HEIGHT,
  fixedRowsHeight,
  phaseShowsName,
  RULER_HEIGHT,
} from '../layout';

describe('the room for the name of an animation (D189)', () => {
  it('shows a short name whole or not at all', () => {
    // «Grow»: four letters, 26 px, after the block's 28 px of edges, padding and icon.
    expect(blockShowsName(54, 'Grow')).toBe(true);
    expect(blockShowsName(53, 'Grow')).toBe(false);
  });

  it('asks a long name for four letters and its «…»', () => {
    // 34 px, however long the name is.
    expect(blockShowsName(62, 'Transform → f2')).toBe(true);
    expect(blockShowsName(61, 'Transform → f2')).toBe(false);
    expect(blockShowsName(62, 'Circumscribe · 12')).toBe(true);
  });

  it('counts the arrow of a group', () => {
    expect(blockShowsName(62, 'Write ×3', true)).toBe(false);
    expect(blockShowsName(75, 'Write ×3', true)).toBe(true);
  });

  it('gives an intro or an outro its name from the same room after its icon', () => {
    // 25 px of padding, icon and gap.
    expect(phaseShowsName(51, 'Grow')).toBe(true);
    expect(phaseShowsName(50, 'Grow')).toBe(false);
    expect(phaseShowsName(59, 'FadeOut')).toBe(true);
    expect(phaseShowsName(58, 'FadeOut')).toBe(false);
  });

  it('leaves a block of no length its icon', () => {
    expect(blockShowsName(6, 'Write')).toBe(false);
    expect(phaseShowsName(0, 'Write')).toBe(false);
  });
});

describe('the rows that stay put', () => {
  it('are the ruler and, with the multicamera on, the Camera row under it', () => {
    expect(fixedRowsHeight(false)).toBe(RULER_HEIGHT);
    expect(fixedRowsHeight(true)).toBe(RULER_HEIGHT + CAMERA_ROW_HEIGHT);
  });
});
