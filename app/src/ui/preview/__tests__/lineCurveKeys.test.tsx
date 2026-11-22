/* The keys of «Edit curve» (`useLineCurveKeys.ts`): the mode's before what has the focus hears
 * them — the timeline, which deletes the selected clip on Delete, hears keys on the window after
 * every capture listener —, wherever the playhead is, and Delete and Backspace with no point
 * selected too. */
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createLineFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  type SplineNode,
} from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { useLineCurveEdit } from '../lineCurve';
import { useLineCurveKeys } from '../useLineCurveKeys';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
const NODES: SplineNode[] = [
  { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
  { at: [0.5, 0.2], in: [0.4, 0.2], out: [0.6, 0.2], smooth: true },
  { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
];

/** What the listener after the mode's heard: the keys left to the rest of the app. */
let heard: string[] = [];
const after = (event: KeyboardEvent) => heard.push(event.key);

/** A free spline of three points over [0, 4), the playhead at 1 s and the mode on it, its keys
 * heard. Its clip's id. */
function setup(): string {
  const project = createEmptyProject();
  project.tracks = [createTrack('Track 1')];
  const formula = createLineFormula({
    name: 'l1',
    vector: [2, 0],
    curve: { shape: 'spline', nodes: NODES },
  });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4, none);
  project.clips.push(clip);
  loadProject(project);
  useUiStore.getState().setTime(1);
  expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
  renderHook(() => useLineCurveKeys());
  heard = [];
  window.addEventListener('keydown', after);
  return clip.id;
}

/** Press `key` with a button of the page focused; whether it was taken. */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  const button = document.body.appendChild(document.createElement('button'));
  button.focus();
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  button.dispatchEvent(event);
  button.remove();
  return event.defaultPrevented;
}

const points = () => {
  const line = useProjectStore.getState().project.formulas[0]!;
  return line.kind === 'line' && line.curve?.shape === 'spline' ? line.curve.nodes.length : 0;
};

afterEach(() => {
  cleanup();
  window.removeEventListener('keydown', after);
  useLineCurveEdit.setState({ clipId: null, original: null, selected: null });
  loadProject(createEmptyProject());
});

describe('the keys of «Edit curve»', () => {
  it('takes Delete and Backspace with no point selected, and removes nothing', () => {
    const clipId = setup();
    expect(press('Delete')).toBe(true);
    expect(press('Backspace')).toBe(true);
    expect(heard).toEqual([]);
    expect(points()).toBe(3);
    expect(useProjectStore.getState().project.clips.map((c) => c.id)).toEqual([clipId]);
    expect(useLineCurveEdit.getState().clipId).toBe(clipId);
  });

  it('removes the selected point with Delete, and with Backspace', () => {
    setup();
    useLineCurveEdit.getState().select({ node: 1, part: 'at' });
    expect(press('Backspace')).toBe(true);
    expect(points()).toBe(2);
    expect(heard).toEqual([]);
  });

  it('leaves with Enter or Escape with the line off screen', () => {
    const clipId = setup();
    useUiStore.getState().setTime(6);
    expect(press('Enter')).toBe(true);
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    expect(useLineCurveEdit.getState().open(clipId)).toBe(true);
    useUiStore.getState().setTime(6);
    expect(press('Escape')).toBe(true);
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    expect(heard).toEqual([]);
  });

  it('leaves a key held with Ctrl, ⌘ or Alt to the shortcuts', () => {
    const clipId = setup();
    useLineCurveEdit.getState().select({ node: 1, part: 'at' });
    expect(press('Enter', { ctrlKey: true })).toBe(false);
    expect(press('Escape', { altKey: true })).toBe(false);
    expect(press('Backspace', { metaKey: true })).toBe(false);
    expect(heard).toEqual(['Enter', 'Escape', 'Backspace']);
    expect(useLineCurveEdit.getState().clipId).toBe(clipId);
    expect(points()).toBe(3);
  });

  it('leaves the other keys alone', () => {
    setup();
    expect(press('ArrowLeft')).toBe(false);
    expect(press('a')).toBe(false);
    expect(heard).toEqual(['ArrowLeft', 'a']);
  });
});
