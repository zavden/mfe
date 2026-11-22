/* Main playback lifecycle. The host supplies live state and a monotonic frame clock; this
 * module does not depend on React, browser globals, or the editor's stores. */
import { playbackFrame, skipFrom, stopReached, type SkippedWait } from './playback';

export interface PlaybackState {
  time: number;
  playing: boolean;
  duration: number;
  loop: boolean;
  /** Times playback stops at when it reaches them, in order (the pauses of the Slides mode while
   * they are rehearsed); none when absent. Read afresh on every frame, as the duration is. */
  stops?: readonly number[];
  /** The waits skipped when playing starts at a pause that skips its wait (D202), while the pauses
   * are rehearsed: playing goes on from the end of the one that starts where the playhead stands
   * (`skipFrom`). None when absent. */
  skips?: readonly SkippedWait[];
}

export interface PlaybackHost {
  read(): PlaybackState;
  setTime(time: number): void;
  setPlaying(playing: boolean): void;
  /** Notify after state changes. Duration and loop are also read afresh on every frame. */
  subscribe(listener: () => void): () => void;
}

export interface PlaybackClock {
  /** Milliseconds on the same monotonic clock as the frame callback's timestamp. */
  now(): number;
  requestFrame(callback: (now: number) => void): number;
  cancelFrame(frame: number): void;
}

export interface PlaybackController {
  play(): void;
  pause(): void;
  /** Pause at the caller's position; callers retain their scene bounds and frame snapping. */
  seek(time: number): void;
  reset(): void;
  /** Attach the clock to live state, including an already-playing host. Returns its cleanup. */
  connect(): () => void;
  /** Detach and cancel frames without changing host state. A later connect can resume it. */
  dispose(): void;
}

export function createPlaybackController(
  host: PlaybackHost,
  clock: PlaybackClock,
): PlaybackController {
  let unsubscribe: (() => void) | null = null;
  let connection: object | null = null;
  let run: { from: number; startedAt: number; last: number } | null = null;
  let frame: number | null = null;

  const stopClock = () => {
    run = null;
    if (frame !== null) clock.cancelFrame(frame);
    frame = null;
  };

  const synchronize = () => {
    const state = host.read();
    if (!state.playing) {
      stopClock();
      return;
    }
    if (run) return;
    const start = state.time >= state.duration - 1e-6 ? 0 : state.time;
    const skip = skipFrom(start, state.skips ?? [], state.stops ?? []);
    if (skip.stand) {
      // Over the wait, to the next pause: playback stands there, as at a stop it reached.
      host.setPlaying(false);
      host.setTime(skip.time);
      return;
    }
    const from = skip.time;
    const started = { from, startedAt: clock.now(), last: from };
    run = started;
    if (from !== state.time) host.setTime(from);
    if (run !== started) return;
    const tick = (now: number) => {
      // A cancelled frame may already be queued. It must not publish into another run/document.
      if (run !== started) return;
      frame = null;
      const current = host.read();
      // A frame's timestamp is the instant the frame began, which may be before playing did in
      // that same frame: no time has passed then, and the scene stands where it was played from.
      const result = playbackFrame(
        started.from,
        Math.max(0, now - started.startedAt) / 1000,
        current.duration,
        current.loop,
      );
      // A stop reached since the last frame: playback stands there, exactly, as if paused.
      const stop = current.stops ? stopReached(started.last, result.time, current.stops) : null;
      started.last = result.time;
      host.setTime(stop ?? result.time);
      // Publication can synchronously pause, seek, reset, or dispose this run.
      if (run !== started) return;
      if (stop !== null || result.ended) host.setPlaying(false);
      else frame = clock.requestFrame(tick);
    };
    frame = clock.requestFrame(tick);
  };

  const pause = () => {
    stopClock();
    host.setPlaying(false);
  };
  const seek = (time: number) => {
    pause();
    host.setTime(Math.max(0, time));
  };
  const dispose = () => {
    connection = null;
    unsubscribe?.();
    unsubscribe = null;
    stopClock();
  };

  return {
    play: () => host.setPlaying(true),
    pause,
    seek,
    reset: () => seek(0),
    connect: () => {
      dispose();
      const ownConnection = {};
      connection = ownConnection;
      unsubscribe = host.subscribe(synchronize);
      synchronize();
      return () => {
        if (connection === ownConnection) dispose();
      };
    },
    dispose,
  };
}
