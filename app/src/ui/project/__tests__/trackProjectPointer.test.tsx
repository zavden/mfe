import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  createClip,
  createEmptyProject,
  createFormula,
  defaultIntro,
  defaultOutro,
} from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { useTimelineGestures } from '../../timeline/useTimelineGestures';
import { useTimelineStore } from '../../timeline/timelineStore';

function pointer(type: string, x: number, y: number, target: EventTarget = window) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => {
    target.dispatchEvent(event);
  });
}

function setup() {
  const project = createEmptyProject();
  const formula = createFormula({ source: 'x' });
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  project.formulas = [formula];
  project.clips = [clip];
  loadProject(project);
  useTimelineStore.setState({ snap: false, pxPerSecond: 100 });
  const host = document.createElement('div');
  const pressed = document.createElement('div');
  host.append(pressed);
  document.body.append(host);
  const { result } = renderHook(() =>
    useTimelineGestures({ ruler: { current: host }, tracks: { current: host } }),
  );
  act(() =>
    result.current.startMove(
      {
        button: 0,
        clientX: 0,
        clientY: 10,
        pointerId: 1,
        currentTarget: pressed,
        stopPropagation() {},
        preventDefault() {},
      } as unknown as ReactPointerEvent,
      clip,
    ),
  );
  return { project, host, pressed };
}

afterEach(() => {
  pointer('pointercancel', 0, 0);
  cleanup();
  loadProject(createEmptyProject());
  document.body.replaceChildren();
});

it('keeps a cross-track gesture when its clip DOM node is replaced, then records one undo step', async () => {
  const { project, host, pressed } = setup();
  pointer('pointermove', 100, 60);
  expect(useProjectStore.getState().project.clips[0]!.trackId).toBe(project.tracks[1]!.id);
  const replacement = document.createElement('div');
  await act(async () => {
    pressed.remove();
    host.append(replacement);
  });
  pointer('lostpointercapture', 100, 60, replacement);
  expect(history.isGesturing()).toBe(true);
  pointer('pointermove', 200, 60);
  pointer('pointerup', 200, 60);
  expect(useProjectStore.getState().project.clips[0]).toMatchObject({
    start: 2,
    trackId: project.tracks[1]!.id,
  });
  history.undo();
  expect(useProjectStore.getState().project.clips[0]).toMatchObject({
    start: 0,
    trackId: project.tracks[0]!.id,
  });
  history.redo();
  expect(useProjectStore.getState().project.clips[0]).toMatchObject({
    start: 2,
    trackId: project.tracks[1]!.id,
  });
  pointer('pointermove', 300, 10);
  expect(useProjectStore.getState().project.clips[0]!.start).toBe(2);
});

it('still cancels if the owning timeline is removed', async () => {
  const { host } = setup();
  pointer('pointermove', 100, 60);
  await act(async () => {
    host.remove();
  });
  expect(history.isGesturing()).toBe(false);
  expect(useProjectStore.getState().project.clips[0]!.start).toBe(0);
  pointer('pointermove', 200, 60);
  pointer('pointerup', 200, 60);
  expect(useProjectStore.getState().project.clips[0]!.start).toBe(0);
});
