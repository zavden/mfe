/* The main playhead's store/browser adapter. Commands work before the Transport mounts; its
 * effect connects the clock and owns disposal. BlockPreview keeps its independent local clock. */
import { create } from 'zustand';
import {
  createAudioPlan,
  createAudioPlayback,
  MissingOriginalError,
  type AudioPlayback,
} from '../../audio';
import {
  exportedPauses,
  sceneDuration,
  skippedWait,
  stopsOf,
  type Project,
  type Window,
} from '../../model';
import { onProjectLoaded, useProjectStore, useUiStore } from '../../store';
import { editorAudioEngine } from '../audio/audioRuntime';
import { refreshMissingMedia, useMissingMedia } from '../audio/missingMedia';
import { useDocumentStore } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { useTimelineStore } from '../timeline/timelineStore';
import { skipFrom, stopReached } from './playback';
import { createPlaybackController, type PlaybackController } from './playbackController';

export const useAudioPlaybackStatus = create<{
  preparing: boolean;
  peak: number;
  underruns: number;
}>(() => ({ preparing: false, peak: 0, underruns: 0 }));

let audioMode = false;
let generation = 0;
let audio: AudioPlayback | null = null;
let frame: number | null = null;
let publishingTime = false;
let lastMeterAt = 0;
let connection: (() => void) | null = null;

const visualPlayback = createPlaybackController(
  {
    read: () => {
      const { time, playing } = useUiStore.getState();
      return {
        time,
        playing: playing && !audioMode,
        duration: sceneDuration(useProjectStore.getState().project),
        loop: useTimelineStore.getState().loop,
        stops: rehearsedStops(),
        skips: rehearsedSkips(),
      };
    },
    setTime: (time) => useUiStore.getState().setTime(time),
    setPlaying: (playing) => useUiStore.getState().setPlaying(playing),
    subscribe: (listener) => useUiStore.subscribe(listener),
  },
  {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (frame) => cancelAnimationFrame(frame),
  },
);

/** The times playback stops at: the pauses of the Slides mode, while «Stop at pauses» is on —
 * the stops of the exported page (`stopsOf`, `model/slides.ts`), so the rehearsal is the page's.
 * None while it is off or the mode is. */
export function rehearsedStops(): readonly number[] {
  const { project } = useProjectStore.getState();
  if (!project.slides || !useTimelineStore.getState().stopAtPauses) return NO_STOPS;
  return stopsOf(
    sceneDuration(project),
    exportedPauses(project).map((pause) => pause.time),
  );
}
const NO_STOPS: readonly number[] = [];

/** The waits the pauses skip (D202) while «Stop at pauses» is on — the page's, `skippedWait` of
 * each pause it stops at —: playing from a pause that skips its wait goes on where the next
 * animation starts. None while it is off: played through, the scene keeps its rests. */
export function rehearsedSkips(): readonly Window[] {
  const { project } = useProjectStore.getState();
  if (!project.slides || !useTimelineStore.getState().stopAtPauses) return NO_SKIPS;
  let skips = skipsOf.get(project);
  if (!skips) {
    skips = exportedPauses(project).flatMap((pause) => {
      const skipped = skippedWait(project, pause);
      return skipped ? [skipped] : [];
    });
    skipsOf.set(project, skips);
  }
  return skips;
}
const NO_SKIPS: readonly Window[] = [];
// Read on every frame: worked out once for a project (a value: an edit makes another).
const skipsOf = new WeakMap<Project, Window[]>();

/** What plays: the project's audio but the clips whose original is known to be missing. They
 * are skipped, so that the rest of the scene plays, and the user is told once per document. */
function audiblePlan(project: Project) {
  const { missing } = useMissingMedia.getState();
  if (missing.size) tellSkipped(project, missing);
  return createAudioPlan(project, { unavailable: missing });
}

let toldSkipped = -1;

function tellSkipped(project: Project, missing: ReadonlySet<string>): void {
  const session = useDocumentStore.getState().session;
  if (toldSkipped === session) return;
  const lost = new Set(
    project.audioAssets.filter((asset) => missing.has(asset.contentHash)).map((asset) => asset.id),
  );
  const skipped = project.audioClips.filter((clip) => lost.has(clip.assetId)).length;
  if (!skipped) return;
  toldSkipped = session;
  notify({
    kind: 'warning',
    title: skipped === 1 ? 'An audio clip is skipped' : `${skipped} audio clips are skipped`,
    message:
      'Their media is missing, so playback goes on without them. The clips are marked in the timeline.',
  });
}

/** An original turned out to be missing while playing (the browser's storage went under the
 * open page). True when a fresh look found what the plan did not know: playing again skips it. */
async function learnedOfLoss(error: unknown): Promise<boolean> {
  if (!(error instanceof MissingOriginalError)) return false;
  const known = useMissingMedia.getState().missing;
  if (known.has(error.contentHash)) return false;
  return (await refreshMissingMedia()).has(error.contentHash);
}

function stopAudio(): void {
  generation++;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  audio?.pause();
  audioMode = false;
  useAudioPlaybackStatus.setState({ preparing: false, peak: 0 });
}

function pause(): void {
  const position = audioMode ? audio?.currentTime() : undefined;
  stopAudio();
  visualPlayback.pause();
  if (position !== undefined) useUiStore.getState().setTime(position);
}

/** Playback stands on a pause of the Slides mode it reached: on the pause itself, not where the
 * device's clock had got to by the frame that saw it — `pause()` reads the device, and from a
 * time past the pause the next Play finds no pause whose wait to skip. */
function standAt(stop: number): void {
  stopAudio();
  visualPlayback.pause();
  useUiStore.getState().setTime(stop);
}

async function playAudio(): Promise<void> {
  stopAudio();
  visualPlayback.pause();
  audioMode = true;
  const own = ++generation;
  useAudioPlaybackStatus.setState({ preparing: true, underruns: 0 });
  try {
    audio ??= createAudioPlayback(editorAudioEngine, {
      onError(error) {
        pause();
        const stopped = generation;
        void learnedOfLoss(error).then((learned) => {
          // Go on from where it stopped, unless the user did something else meanwhile.
          if (learned && stopped === generation) void playAudio();
          else if (!learned)
            notify({
              kind: 'error',
              title: 'Audio playback stopped',
              message: error instanceof Error ? error.message : String(error),
            });
        });
      },
      onUnderrun(count) {
        useAudioPlaybackStatus.setState({ underruns: count });
        if (count === 1)
          notify({
            kind: 'warning',
            title: 'Audio could not keep up',
            message:
              'Playback skipped late samples to preserve synchronization. Pause background work or reduce simultaneous audio tracks.',
          });
      },
      onPeak(peak) {
        if (performance.now() - lastMeterAt < 100) return;
        lastMeterAt = performance.now();
        useAudioPlaybackStatus.setState({ peak });
      },
    });
    const plan = audiblePlan(useProjectStore.getState().project);
    await audio.start(plan, useUiStore.getState().time, { loop: useTimelineStore.getState().loop });
    if (own !== generation) return;
    useAudioPlaybackStatus.setState({ preparing: false });
    if (!audio.running) {
      pause();
      return;
    }
    useUiStore.getState().setPlaying(true);
    let last = useUiStore.getState().time;
    const tick = () => {
      if (own !== generation || !audioMode || !audio) return;
      frame = null;
      const time = audio.currentTime();
      // A pause of the Slides mode reached while it is rehearsed: playback stands on it.
      const stop = stopReached(last, time, rehearsedStops());
      last = time;
      publishingTime = true;
      useUiStore.getState().setTime(stop ?? time);
      publishingTime = false;
      if (own !== generation) return;
      if (stop !== null) {
        standAt(stop);
        return;
      }
      if (
        !audio.running ||
        (!useTimelineStore.getState().loop &&
          time >= sceneDuration(useProjectStore.getState().project) - 1e-6)
      ) {
        pause();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  } catch (error) {
    if (own !== generation) return;
    pause();
    const stopped = generation;
    if (await learnedOfLoss(error)) {
      if (stopped === generation) void playAudio();
      return;
    }
    notify({
      kind: 'error',
      title: 'Could not play audio',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Over the wait a pause skips, where the playhead stands at one that skips it while the pauses
 * are rehearsed (D202): the playhead goes to the end of that wait, where the sound then starts.
 * Whether it stands there instead — the next pause of the rest — with nothing to play. (The
 * visual clock does the same when it starts: `PlaybackState.skips`.) */
function skipRehearsedWait(): boolean {
  const { time } = useUiStore.getState();
  const skip = skipFrom(time, rehearsedSkips(), rehearsedStops());
  if (skip.time !== time) mainPlayback.seek(skip.time);
  return skip.stand;
}

/** Visual-only documents retain the tested lightweight clock. Audio documents prepare a
 * bounded lookahead first, then both the playhead and canvas follow the device's output clock. */
export const mainPlayback: PlaybackController = {
  play() {
    if (!useProjectStore.getState().project.audioClips.length) visualPlayback.play();
    else if (!skipRehearsedWait()) void playAudio();
  },
  pause,
  seek(time) {
    stopAudio();
    visualPlayback.seek(time);
  },
  reset() {
    stopAudio();
    visualPlayback.reset();
  },
  connect() {
    connection?.();
    const offVisual = visualPlayback.connect();
    const offProject = useProjectStore.subscribe((state, previous) => {
      if (!audioMode || !audio || state.project === previous.project) return;
      const next = state.project;
      const old = previous.project;
      if (
        next.audioClips === old.audioClips &&
        next.audioAssets === old.audioAssets &&
        next.tracks === old.tracks &&
        sceneDuration(next) === sceneDuration(old)
      )
        return;
      if (useAudioPlaybackStatus.getState().preparing) {
        void playAudio();
        return;
      }
      try {
        audio.update(audiblePlan(next));
      } catch (error) {
        pause();
        notify({ kind: 'error', title: 'Could not update audio playback', message: String(error) });
      }
    });
    const offLoop = useTimelineStore.subscribe((state, previous) => {
      if (state.loop !== previous.loop) audio?.setLoop(state.loop);
    });
    const offUi = useUiStore.subscribe((state, previous) => {
      if (audioMode && previous.playing && !state.playing) stopAudio();
      else if (audioMode && !publishingTime && state.time !== previous.time) {
        const time = state.time;
        mainPlayback.seek(time);
      } else if (
        !audioMode &&
        state.playing &&
        !previous.playing &&
        useProjectStore.getState().project.audioClips.length
      )
        void playAudio();
    });
    const offLoad = onProjectLoaded(() => mainPlayback.reset());
    const cleanup = () => {
      offVisual();
      offProject();
      offLoop();
      offUi();
      offLoad();
      if (connection === cleanup) {
        if (audioMode) pause();
        connection = null;
      }
    };
    connection = cleanup;
    return cleanup;
  },
  dispose() {
    connection?.();
    stopAudio();
    visualPlayback.dispose();
    void audio?.dispose();
    audio = null;
  },
};
