// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREVIEW_SCALE,
  isPreviewScale,
  listPreviewHeights,
  PREVIEW_SCALES,
  previewSizeWords,
  previewStepOfKey,
  previewStepOfPress,
  scaleLabel,
  steppedPreview,
} from '../previewSize';

describe('the size of the previews of the Creator list', () => {
  it('has four steps, from the standard size to three times it', () => {
    expect(PREVIEW_SCALES).toEqual([1, 1.5, 2, 3]);
    expect(DEFAULT_PREVIEW_SCALE).toBe(1);
    expect(PREVIEW_SCALES.map(scaleLabel)).toEqual(['1×', '1.5×', '2×', '3×']);
  });

  it('knows its steps, and nothing else', () => {
    for (const scale of PREVIEW_SCALES) expect(isPreviewScale(scale)).toBe(true);
    for (const other of [0, 0.5, 1.25, 2.5, 4, '1', '1.5', null, undefined, NaN, [1]]) {
      expect(isPreviewScale(other)).toBe(false);
    }
  });

  it('goes up and down a step at a time, and no further than its ends', () => {
    expect(PREVIEW_SCALES.map((scale) => steppedPreview(scale, 1))).toEqual([1.5, 2, 3, null]);
    expect(PREVIEW_SCALES.map((scale) => steppedPreview(scale, -1))).toEqual([null, 1, 1.5, 2]);
  });

  it('makes the rows 52, 78, 104 and 156 px tall, and a group’s renderings in proportion', () => {
    expect(PREVIEW_SCALES.map((scale) => listPreviewHeights(scale).row)).toEqual([
      52, 78, 104, 156,
    ]);
    expect(PREVIEW_SCALES.map((scale) => listPreviewHeights(scale).group)).toEqual([
      36, 54, 72, 108,
    ]);
  });

  it('goes larger on a click, smaller on a right-click or with Shift held', () => {
    expect(previewStepOfPress({ secondary: false, shift: false })).toBe(1);
    expect(previewStepOfPress({ secondary: true, shift: false })).toBe(-1);
    expect(previewStepOfPress({ secondary: false, shift: true })).toBe(-1);
    expect(previewStepOfPress({ secondary: true, shift: true })).toBe(-1);
  });

  it('takes ↑ larger, ↓ and Shift+Space smaller; the clicks and the rest are not its keys', () => {
    const key = (
      key: string,
      held: Partial<Record<'shift' | 'ctrl' | 'meta' | 'alt', true>> = {},
    ) =>
      previewStepOfKey({
        key,
        shiftKey: held.shift ?? false,
        ctrlKey: held.ctrl ?? false,
        metaKey: held.meta ?? false,
        altKey: held.alt ?? false,
      });
    expect(key('ArrowUp')).toBe(1);
    expect(key('ArrowDown')).toBe(-1);
    expect(key(' ', { shift: true })).toBe(-1);
    // Enter, Shift+Enter and Space click the key: the click says which way.
    for (const other of ['ArrowLeft', 'ArrowRight', 'Enter', ' ', '+', '-', 'Home', 'End']) {
      expect(key(other)).toBeNull();
    }
    expect(key('Enter', { shift: true })).toBeNull();
    for (const held of ['shift', 'ctrl', 'meta', 'alt'] as const) {
      expect(key('ArrowUp', { [held]: true })).toBeNull();
      expect(key('ArrowDown', { [held]: true })).toBeNull();
    }
    for (const held of ['ctrl', 'meta', 'alt'] as const) {
      expect(key(' ', { shift: true, [held]: true })).toBeNull();
    }
  });

  it('says the size now and what each button does, in the words of the view', () => {
    expect(previewSizeWords('list', 1.5)).toEqual({
      title: 'Preview size 1.5×: click for larger, right-click or Shift+click for smaller',
      status: 'Preview size 1.5×',
    });
    expect(previewSizeWords('grid', 2)).toEqual({
      title: 'Preview tooltip size 2×: click for larger, right-click or Shift+click for smaller',
      status: 'Preview tooltip size 2×',
    });
  });

  it('says when an end is reached, and only the press that goes back from it', () => {
    expect(previewSizeWords('list', 1)).toEqual({
      title: 'Preview size 1×, the smallest: click for larger',
      status: 'Preview size 1×, the smallest',
    });
    expect(previewSizeWords('list', 3)).toEqual({
      title: 'Preview size 3×, the largest: right-click or Shift+click for smaller',
      status: 'Preview size 3×, the largest',
    });
    expect(previewSizeWords('grid', 1).title).toBe(
      'Preview tooltip size 1×, the smallest: click for larger',
    );
    expect(previewSizeWords('grid', 3).title).toBe(
      'Preview tooltip size 3×, the largest: right-click or Shift+click for smaller',
    );
  });
});
