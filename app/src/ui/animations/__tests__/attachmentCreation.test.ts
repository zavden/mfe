// @vitest-environment node
/* The attachment clip-window and intro rules, independent of stores and UI effects. */
import { describe, expect, it } from 'vitest';
import { defaultIntro } from '../../../model';
import { attachedClipWindow, labelClipWindow, labelIntro } from '../attachmentCreation';

describe('attachedClipWindow', () => {
  const target = { start: 2, end: 8, intro: defaultIntro('write') }; // the intro ends at 3 s
  it('runs from the playhead to the end of the target', () => {
    expect(attachedClipWindow(target, 5)).toEqual({ start: 5, end: 8 });
  });
  it('starts when the intro ends if the playhead is inside it, or outside the clip', () => {
    expect(attachedClipWindow(target, 2.5)).toEqual({ start: 3, end: 8 });
    expect(attachedClipWindow(target, 0)).toEqual({ start: 3, end: 8 });
    expect(attachedClipWindow(target, 9)).toEqual({ start: 3, end: 8 });
  });
  it('keeps the shortest clip at the end of a target hardly longer than its intro', () => {
    expect(attachedClipWindow({ start: 2, end: 2.95, intro: defaultIntro('write') }, 2.5)).toEqual({
      start: 2.85,
      end: 2.95,
    });
  });
});

describe('labelClipWindow', () => {
  const brace = { start: 2, end: 8, intro: defaultIntro('grow_from_center') }; // grows until 3 s
  it('runs over the brace, coming in with it, unless the playhead is past its intro', () => {
    expect(labelClipWindow(brace, 0)).toEqual({ start: 2, end: 8 });
    expect(labelClipWindow(brace, 2.5)).toEqual({ start: 2, end: 8 });
    expect(labelClipWindow(brace, 3)).toEqual({ start: 3, end: 8 });
    expect(labelClipWindow(brace, 5)).toEqual({ start: 5, end: 8 });
    expect(labelClipWindow(brace, 9)).toEqual({ start: 2, end: 8 });
  });
  it('keeps the shortest clip at the end of the brace', () => {
    expect(labelClipWindow(brace, 7.95)).toEqual({ start: 7.9, end: 8 });
  });
});

describe('labelIntro', () => {
  it('fades in for the preferred duration, no longer than the clip', () => {
    expect(labelIntro(5, 2)).toMatchObject({ kind: 'fade_in', duration: 2 });
    expect(labelIntro(0.5, 2).duration).toBe(0.5);
    expect(labelIntro(5, 0).duration).toBe(1); // no preference: the animation's own
  });
});
