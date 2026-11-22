// @vitest-environment node
/* Store adapter regressions: decoder preparation and the device clock belong to a playback
 * generation, while live edits replace the plan without replacing the original document. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlan, AudioPlayback } from '../../../audio';
import { createClip, createEmptyProject, createFormula, defaultIntro } from '../../../model';
import { audioProject } from '../../../model/__tests__/audioFixtures';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { useTimelineStore } from '../../timeline/timelineStore';

const mocks = vi.hoisted(() => ({ create: vi.fn(), notify: vi.fn(), refresh: vi.fn() }));
vi.mock('../../../audio', async () => {
  const { createAudioPlan } = await import('../../../audio/plan');
  const { MissingOriginalError } = await import('../../../audio/types');
  return { createAudioPlan, createAudioPlayback: mocks.create, MissingOriginalError };
});
vi.mock('../../audio/audioRuntime', () => ({ editorAudioEngine: {} }));
vi.mock('../../project/noticeStore', () => ({ notify: mocks.notify }));
vi.mock('../../audio/missingMedia', async () => {
  const { create } = await import('zustand');
  return {
    useMissingMedia: create(() => ({ missing: new Set<string>(), checked: new Set<string>() })),
    refreshMissingMedia: mocks.refresh,
  };
});

import { MissingOriginalError } from '../../../audio/types';
import { useMissingMedia } from '../../audio/missingMedia';
import { useDocumentStore } from '../../project/documentStore';
import { mainPlayback, useAudioPlaybackStatus } from '../mainPlayback';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fakeAudio() {
  let generation = 0;
  let running = false;
  let time = 0;
  const starts: ReturnType<typeof deferred>[] = [];
  const playback: AudioPlayback = {
    start: vi.fn((_plan: AudioPlan, at: number) => {
      const own = ++generation;
      time = at;
      const pending = deferred();
      starts.push(pending);
      return pending.promise.then(() => {
        if (own === generation) running = true;
      });
    }),
    pause: vi.fn(() => {
      generation++;
      running = false;
      return time;
    }),
    currentTime: vi.fn(() => time),
    update: vi.fn(),
    setLoop: vi.fn(),
    get running() {
      return running;
    },
    get stats() {
      return { underruns: 0, queuedNodes: 0, peak: 0 };
    },
    dispose: vi.fn(async () => {
      generation++;
      running = false;
    }),
  };
  return {
    playback,
    starts,
    setTime: (next: number) => {
      time = next;
    },
  };
}

let backend: ReturnType<typeof fakeAudio>;
let now = 0;
let nextFrame = 0;
const pendingFrames = new Map<number, FrameRequestCallback>();

/** The store learns, at its next look, that these originals are missing. */
function lose(...hashes: string[]) {
  mocks.refresh.mockImplementation(async () => {
    const missing = new Set([...useMissingMedia.getState().missing, ...hashes]);
    useMissingMedia.setState({ missing, checked: missing });
    return missing;
  });
}

beforeEach(() => {
  mainPlayback.dispose();
  mocks.create.mockReset();
  mocks.notify.mockReset();
  mocks.refresh.mockReset();
  mocks.refresh.mockImplementation(async () => useMissingMedia.getState().missing);
  useMissingMedia.setState({ missing: new Set(), checked: new Set() });
  backend = fakeAudio();
  mocks.create.mockReturnValue(backend.playback);
  pendingFrames.clear();
  now = nextFrame = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pendingFrames.delete(id));
  loadProject(audioProject().project);
  useUiStore.setState({ time: 1, playing: false, selection: { kind: 'none' } });
  useTimelineStore.setState({ loop: false });
  mainPlayback.connect();
});

afterEach(() => {
  mainPlayback.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function ready(index = backend.starts.length - 1) {
  backend.starts[index]!.resolve();
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

function tick(milliseconds: number) {
  now = milliseconds;
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  for (const callback of callbacks) callback(milliseconds);
}

describe('main audio playback adapter', () => {
  it('cancels preparation without a late promise starting playback or publishing a frame', async () => {
    mainPlayback.play();
    expect(useAudioPlaybackStatus.getState().preparing).toBe(true);
    expect(useUiStore.getState().playing).toBe(false);
    mainPlayback.pause();
    await ready();
    expect(useAudioPlaybackStatus.getState().preparing).toBe(false);
    expect(useUiStore.getState()).toMatchObject({ time: 1, playing: false });
    expect(pendingFrames.size).toBe(0);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('keeps new documents and seeks safe from stale preparation and stale frame callbacks', async () => {
    mainPlayback.play();
    mainPlayback.seek(3);
    await ready();
    expect(useUiStore.getState()).toMatchObject({ time: 3, playing: false });
    mainPlayback.play();
    await ready();
    const stale = [...pendingFrames.values()][0]!;
    loadProject(createEmptyProject('Replacement'));
    stale(9000);
    expect(useUiStore.getState()).toMatchObject({ time: 0, playing: false });
    expect(pendingFrames.size).toBe(0);
    mainPlayback.play();
    stale(10000);
    expect(useProjectStore.getState().project.meta.name).toBe('Replacement');
    expect(useUiStore.getState().time).toBe(0);
  });

  it('uses the device position even when requestAnimationFrame is delayed', async () => {
    mainPlayback.play();
    await ready();
    backend.setTime(2.375);
    tick(900000);
    expect(useUiStore.getState()).toMatchObject({ time: 2.375, playing: true });
    backend.setTime(4.125);
    mainPlayback.pause();
    expect(useUiStore.getState()).toMatchObject({ time: 4.125, playing: false });
    expect(pendingFrames.size).toBe(0);
  });

  it('applies live gain and mute through plan updates, preserves playback, and forwards loop edits', async () => {
    mainPlayback.play();
    await ready();
    useProjectStore.getState().update((draft) => {
      draft.audioClips[0]!.volume[1]!.gain = 0.75;
    });
    expect(backend.playback.update).toHaveBeenCalledTimes(1);
    const firstPlan = vi.mocked(backend.playback.update).mock.calls[0]![0];
    expect(firstPlan.clips[0]!.volume[1]!.gain).toBe(0.75);
    useProjectStore.getState().update((draft) => {
      const track = draft.tracks.find((track) => track.kind === 'audio')!;
      track.muted = true;
    });
    expect(vi.mocked(backend.playback.update).mock.calls.at(-1)![0].clips).toEqual([]);
    expect(backend.playback.start).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().playing).toBe(true);
    useTimelineStore.getState().setLoop(true);
    expect(backend.playback.setLoop).toHaveBeenLastCalledWith(true);
  });

  it('replaces pending preparation on an audio edit and ignores the cancelled promise', async () => {
    mainPlayback.play();
    useProjectStore.getState().update((draft) => {
      draft.audioClips[0]!.volume[1]!.gain = 0.4;
    });
    expect(backend.playback.start).toHaveBeenCalledTimes(2);
    backend.starts[0]!.reject(new DOMException('Replaced', 'AbortError'));
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(useAudioPlaybackStatus.getState().preparing).toBe(true);
    await ready(1);
    expect(useUiStore.getState().playing).toBe(true);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('updates automatic audio duration when the last visual clip is extended', async () => {
    useProjectStore.getState().update((draft) => {
      const formula = createFormula({ source: 'x' });
      draft.formulas.push(formula);
      draft.clips.push(createClip(formula.id, draft.tracks[0]!.id, 0, 25));
    });
    mainPlayback.play();
    await ready();
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.end = 30;
    });
    expect(backend.playback.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(backend.playback.update).mock.calls[0]![0].duration).toBe(30);
  });

  it('plays a scene longer than an hour, with its audio', async () => {
    useProjectStore.getState().update((draft) => {
      draft.meta.duration = 4000;
    });
    useUiStore.setState({ time: 3700 });
    mainPlayback.play();
    await ready();
    const [plan, at] = vi.mocked(backend.playback.start).mock.calls[0]!;
    expect(plan.duration).toBe(4000);
    expect(plan.clips).toHaveLength(1);
    expect(at).toBe(3700);
    expect(useUiStore.getState().playing).toBe(true);
    backend.setTime(3900);
    tick(16);
    expect(useUiStore.getState()).toMatchObject({ time: 3900, playing: true });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  describe('rehearsing the pauses of the Slides mode', () => {
    /** A formula written over [5, 6] s with the narration: the scene rests over [0, 5] and after
     * 6 s. A pause at 2 s skips its wait, to 5 s; one at 1 s, to the pause at 2 s. */
    beforeEach(() => {
      useProjectStore.getState().update((draft) => {
        const formula = createFormula({ source: 'x' });
        draft.formulas.push(formula);
        draft.clips.push(
          createClip(formula.id, draft.tracks[0]!.id, 5, 15, {
            intro: { ...defaultIntro('write'), duration: 1 },
          }),
        );
        draft.slides = {
          marks: [
            { id: 'p1', time: 2, kind: 'pause', skipWait: true },
            { id: 'p2', time: 1, kind: 'pause', skipWait: true },
          ],
        };
      });
      useTimelineStore.setState({ stopAtPauses: true });
    });
    afterEach(() => useTimelineStore.setState({ stopAtPauses: false }));

    it('starts the sound where the next animation starts, from a pause that skips its wait', async () => {
      useUiStore.setState({ time: 2 });
      mainPlayback.play();
      await ready();
      expect(vi.mocked(backend.playback.start).mock.calls[0]![1]).toBe(5);
      expect(useUiStore.getState()).toMatchObject({ time: 5, playing: true });
    });

    it('stands at the next pause of the rest, playing nothing, when the wait ends there', async () => {
      useUiStore.setState({ time: 1 });
      mainPlayback.play();
      expect(backend.playback.start).not.toHaveBeenCalled();
      expect(useUiStore.getState()).toMatchObject({ time: 2, playing: false });
    });

    it('stands on the pause the device went past, and the next Play skips its wait', async () => {
      useUiStore.setState({ time: 1.5 });
      mainPlayback.play();
      await ready();
      // A frame later the device is 8 ms past the pause: no frame lands on it.
      backend.setTime(2.008);
      tick(16);
      expect(useUiStore.getState()).toMatchObject({ time: 2, playing: false });
      expect(pendingFrames.size).toBe(0);

      mainPlayback.play();
      await ready(1);
      expect(vi.mocked(backend.playback.start).mock.calls[1]![1]).toBe(5);
      expect(useUiStore.getState()).toMatchObject({ time: 5, playing: true });
    });

    it('skips nothing while the pauses are not rehearsed', async () => {
      useTimelineStore.setState({ stopAtPauses: false });
      useUiStore.setState({ time: 2 });
      mainPlayback.play();
      await ready();
      expect(vi.mocked(backend.playback.start).mock.calls[0]![1]).toBe(2);
    });
  });

  it('does not let cleanup from an old connection pause a newer audio run', async () => {
    const first = mainPlayback.connect();
    const second = mainPlayback.connect();
    mainPlayback.play();
    await ready();
    const pauses = vi.mocked(backend.playback.pause).mock.calls.length;
    first();
    expect(backend.playback.pause).toHaveBeenCalledTimes(pauses);
    expect(useUiStore.getState().playing).toBe(true);
    second();
    expect(useUiStore.getState().playing).toBe(false);
  });

  describe('with a recording whose original is missing', () => {
    /** A second recording, lost, with two clips; the first one still has its original. */
    function withLostRecording() {
      const lost = 'b'.repeat(64);
      // A document of its own: what an earlier one was told does not count.
      useDocumentStore.setState((state) => ({ session: state.session + 1 }));
      useProjectStore.getState().update((draft) => {
        const [asset] = draft.audioAssets;
        const [clip] = draft.audioClips;
        draft.audioAssets.push({ ...asset!, id: 'lost', name: 'Interview', contentHash: lost });
        draft.audioClips.push(
          { ...clip!, id: 'lost-1', assetId: 'lost', start: 30, end: 40 },
          { ...clip!, id: 'lost-2', assetId: 'lost', start: 50, end: 60 },
        );
      });
      return lost;
    }
    const startedWith = (call = -1) =>
      vi
        .mocked(backend.playback.start)
        .mock.calls.at(call)![0]
        .clips.map((clip) => clip.id);

    it('plays the rest, over the whole scene, and says once per document what it skips', async () => {
      const lost = withLostRecording();
      const kept = useProjectStore.getState().project.audioClips[0]!.id;
      useMissingMedia.setState({ missing: new Set([lost]) });
      mainPlayback.play();
      await ready();
      expect(startedWith()).toEqual([kept]);
      expect(vi.mocked(backend.playback.start).mock.calls[0]![0].duration).toBe(60);
      expect(useUiStore.getState().playing).toBe(true);
      expect(mocks.notify).toHaveBeenCalledTimes(1);
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'warning', title: '2 audio clips are skipped' }),
      );

      // Live edits keep skipping them, and playing again says nothing new.
      useProjectStore.getState().update((draft) => {
        draft.audioClips[0]!.volume[1]!.gain = 0.75;
      });
      expect(
        vi
          .mocked(backend.playback.update)
          .mock.calls.at(-1)![0]
          .clips.map((clip) => clip.id),
      ).toEqual([kept]);
      mainPlayback.pause();
      mainPlayback.play();
      await ready();
      expect(mocks.notify).toHaveBeenCalledTimes(1);

      // Another document with the same trouble is told about it.
      useDocumentStore.setState((state) => ({ session: state.session + 1 }));
      mainPlayback.pause();
      mainPlayback.play();
      await ready();
      expect(mocks.notify).toHaveBeenCalledTimes(2);
    });

    it('says nothing when the missing recording has no clip', async () => {
      const lost = withLostRecording();
      useProjectStore.getState().update((draft) => {
        draft.audioClips = draft.audioClips.filter((clip) => clip.assetId !== 'lost');
      });
      useMissingMedia.setState({ missing: new Set([lost]) });
      mainPlayback.play();
      await ready();
      expect(useUiStore.getState().playing).toBe(true);
      expect(mocks.notify).not.toHaveBeenCalled();
    });

    it('starts again without the clips when the loss shows up while preparing', async () => {
      const lost = withLostRecording();
      const kept = useProjectStore.getState().project.audioClips[0]!.id;
      lose(lost);
      mainPlayback.play();
      expect(startedWith()).toEqual([kept, 'lost-1', 'lost-2']);
      backend.starts[0]!.reject(new MissingOriginalError({ name: 'Interview', contentHash: lost }));
      await vi.waitFor(() => expect(backend.playback.start).toHaveBeenCalledTimes(2));
      expect(startedWith()).toEqual([kept]);
      await ready();
      expect(useUiStore.getState().playing).toBe(true);
      expect(mocks.notify).toHaveBeenCalledTimes(1);
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ title: '2 audio clips are skipped' }),
      );
    });

    it('goes on from where it stopped when the loss shows up while playing', async () => {
      const lost = withLostRecording();
      lose(lost);
      mainPlayback.play();
      await ready();
      backend.setTime(29.5);
      const { onError } = mocks.create.mock.calls[0]![1] as { onError(error: unknown): void };
      onError(new MissingOriginalError({ name: 'Interview', contentHash: lost }));
      expect(useUiStore.getState()).toMatchObject({ time: 29.5, playing: false });
      await vi.waitFor(() => expect(backend.playback.start).toHaveBeenCalledTimes(2));
      expect(vi.mocked(backend.playback.start).mock.calls[1]![1]).toBe(29.5);
      expect(startedWith()).not.toContain('lost-1');
      expect(mocks.notify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    });

    it('stays stopped if the user did something else before the loss was understood', async () => {
      const lost = withLostRecording();
      let learn!: () => void;
      mocks.refresh.mockImplementation(
        () =>
          new Promise((resolve) => {
            learn = () => {
              useMissingMedia.setState({ missing: new Set([lost]) });
              resolve(new Set([lost]));
            };
          }),
      );
      mainPlayback.play();
      await ready();
      const { onError } = mocks.create.mock.calls[0]![1] as { onError(error: unknown): void };
      onError(new MissingOriginalError({ name: 'Interview', contentHash: lost }));
      mainPlayback.seek(3);
      learn();
      for (let i = 0; i < 4; i++) await Promise.resolve();
      expect(backend.playback.start).toHaveBeenCalledTimes(1);
      expect(useUiStore.getState()).toMatchObject({ time: 3, playing: false });
    });

    it('reports a loss it cannot explain, and any other failure, as before', async () => {
      const lost = withLostRecording();
      mainPlayback.play();
      // The store looks again and still finds the original: something else is wrong.
      backend.starts[0]!.reject(new MissingOriginalError({ name: 'Interview', contentHash: lost }));
      await vi.waitFor(() =>
        expect(mocks.notify).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'error',
            title: 'Could not play audio',
            message: 'Original audio is missing: Interview. Reimport the original file.',
          }),
        ),
      );
      expect(backend.playback.start).toHaveBeenCalledTimes(1);
      mainPlayback.play();
      await ready();
      const { onError } = mocks.create.mock.calls[0]![1] as { onError(error: unknown): void };
      onError(new Error('The decoder failed'));
      await vi.waitFor(() =>
        expect(mocks.notify).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Audio playback stopped',
            message: 'The decoder failed',
          }),
        ),
      );
    });
  });
});
