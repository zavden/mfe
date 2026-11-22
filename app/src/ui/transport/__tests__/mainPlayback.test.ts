// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, serializeProject } from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { newProject, openProjectText } from '../../project/actions';
import { useDocumentStore } from '../../project/documentStore';
import * as files from '../../project/files';
import { useTimelineStore } from '../../timeline/timelineStore';
import { mainPlayback } from '../mainPlayback';

let now: number;
let nextFrame: number;
const pending = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  mainPlayback.dispose();
  now = 0;
  nextFrame = 0;
  pending.clear();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => pending.delete(frame));
  vi.spyOn(files, 'storeHandle').mockResolvedValue(undefined);
  const project = createEmptyProject('Old');
  project.meta.duration = 10;
  loadProject(project);
  useDocumentStore.getState().beginDocument(useProjectStore.getState().project, {
    fileName: null,
    handle: null,
  });
  useUiStore.setState({ time: 0, playing: false, selection: { kind: 'none' } });
  useTimelineStore.setState({ loop: false });
  mainPlayback.connect();
});

afterEach(() => {
  mainPlayback.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function tick(time: number) {
  now = time;
  const callbacks = [...pending.values()];
  pending.clear();
  for (const callback of callbacks) callback(time);
}

describe('main playback store adapter', () => {
  it('uses live UiStore playback and current project/loop settings without a React render', () => {
    useUiStore.setState({ time: 1, playing: true });
    tick(500);
    expect(useUiStore.getState()).toMatchObject({ time: 1.5, playing: true });
    useProjectStore.getState().update((draft) => {
      draft.meta.duration = 2;
    });
    useTimelineStore.getState().setLoop(true);
    tick(2500);
    expect(useUiStore.getState()).toMatchObject({ time: 1.5, playing: true });
    useTimelineStore.getState().setLoop(false);
    tick(3000);
    expect(useUiStore.getState()).toMatchObject({ time: 2, playing: false });
    expect(pending.size).toBe(0);
  });

  it.each(['New', 'Open'] as const)(
    '%s during playback resets the playhead and prevents an old frame from owning the next document',
    async (command) => {
      mainPlayback.play();
      tick(1000);
      const stale = pending.values().next().value!;
      expect(useUiStore.getState()).toMatchObject({ time: 1, playing: true });

      if (command === 'New') await newProject();
      else {
        const project = createEmptyProject('Opened');
        project.meta.duration = 5;
        expect(
          openProjectText(serializeProject(project), { fileName: 'opened.mfe.json', handle: null }),
        ).toBe(true);
      }
      expect(useProjectStore.getState().project.meta.name).toBe(
        command === 'New' ? 'Untitled' : 'Opened',
      );
      expect(useUiStore.getState()).toMatchObject({ time: 0, playing: false });
      expect(pending.size).toBe(0);
      stale(8000);
      expect(useUiStore.getState()).toMatchObject({ time: 0, playing: false });

      mainPlayback.play();
      stale(9000);
      expect(useUiStore.getState()).toMatchObject({ time: 0, playing: true });
      tick(1500);
      expect(useUiStore.getState()).toMatchObject(
        command === 'New' ? { time: 0, playing: false } : { time: 0.5, playing: true },
      );
    },
  );
});
