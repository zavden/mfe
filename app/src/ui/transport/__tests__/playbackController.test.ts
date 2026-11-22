// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPlaybackController, type PlaybackState } from '../playbackController';

/** A delayed frame samples absolute elapsed time once, regardless of the missed frame count. */
function harness(initial: Partial<PlaybackState> = {}) {
  let state: PlaybackState = { time: 0, playing: false, duration: 10, loop: false, ...initial };
  let now = 1000;
  let nextFrame = 0;
  const pending = new Map<number, (now: number) => void>();
  const listeners = new Set<() => void>();
  const publish = (change: Partial<PlaybackState>) => {
    state = { ...state, ...change };
    for (const listener of [...listeners]) listener();
  };
  const controller = createPlaybackController(
    {
      read: () => state,
      setTime: (time) => publish({ time }),
      setPlaying: (playing) => publish({ playing }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    {
      now: () => now,
      requestFrame: (callback) => {
        pending.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelFrame: (frame) => void pending.delete(frame),
    },
  );
  controller.connect();
  return {
    controller,
    state: () => state,
    publish,
    pending,
    listeners,
    next: () => {
      const callback = pending.values().next().value;
      if (!callback) throw new Error('Expected a scheduled frame');
      return callback;
    },
    advance: (milliseconds: number) => {
      now += milliseconds;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(now);
    },
    /** The frames that are due, with a timestamp of the browser's: a frame's is the instant the
     * frame began, which may be before `now`. */
    frameAt: (timestamp: number) => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(timestamp);
    },
  };
}

describe('main playback lifecycle', () => {
  it('samples elapsed time after delayed frames, stops at the end, and restarts from zero', () => {
    const h = harness({ time: 1, duration: 4 });
    h.controller.play();
    h.advance(400);
    expect(h.state()).toMatchObject({ time: 1.4, playing: true });
    h.advance(6000);
    expect(h.state()).toMatchObject({ time: 4, playing: false });
    expect(h.pending.size).toBe(0);

    h.controller.play();
    expect(h.state()).toMatchObject({ time: 0, playing: true });
    h.advance(250);
    expect(h.state().time).toBe(0.25);
  });

  it('a frame that began before playing did does not take the scene back', () => {
    // The browser stamps a frame with the instant it began, and playing may begin later in that
    // same frame: the scene stood up to a frame before where it was played from, and a pause
    // right then left the playhead there, before the start of a clip it had been on.
    const h = harness({ time: 2 });
    h.controller.play(); // at 1000 on the clock
    h.frameAt(996);
    expect(h.state()).toMatchObject({ time: 2, playing: true });
    h.advance(100);
    expect(h.state().time).toBeCloseTo(2.1, 9); // and time runs from where playing began
    // From the start of the scene: no instant before it.
    const start = harness();
    start.controller.play();
    start.frameAt(984);
    expect(start.state()).toMatchObject({ time: 0, playing: true });
  });

  it('stops at a stop it reaches, exactly, and goes on from it to the next when played again', () => {
    const h = harness({ duration: 10, stops: [2, 6] });
    h.controller.play();
    h.advance(1900);
    expect(h.state()).toMatchObject({ time: 1.9, playing: true });
    h.advance(250);
    expect(h.state()).toMatchObject({ time: 2, playing: false });
    expect(h.pending.size).toBe(0);
    // From the stop: it is behind, and the next is at 6 s, however late the frame.
    h.controller.play();
    h.advance(500);
    expect(h.state()).toMatchObject({ time: 2.5, playing: true });
    h.advance(30_000);
    expect(h.state()).toMatchObject({ time: 6, playing: false });
    h.controller.play();
    h.advance(30_000);
    expect(h.state()).toMatchObject({ time: 10, playing: false });
  });

  it('goes on from the end of the wait a pause skips, when it starts where that pause is', () => {
    // A pause at 2 s skips its wait to 3 s (D202); another at 6 s skips to 7 s, the next stop.
    const skips = [
      { start: 2, end: 3 },
      { start: 6, end: 7 },
    ];
    const h = harness({ duration: 10, stops: [2, 6, 7], skips });
    h.controller.play();
    h.advance(30_000);
    expect(h.state()).toMatchObject({ time: 2, playing: false });
    // Played again: the playhead is over the wait at once, and goes on from its end.
    h.controller.play();
    expect(h.state()).toMatchObject({ time: 3, playing: true });
    h.advance(500);
    expect(h.state()).toMatchObject({ time: 3.5, playing: true });
    h.advance(30_000);
    expect(h.state()).toMatchObject({ time: 6, playing: false });
    // The end of this one is the next stop: the playhead stands there, and nothing plays.
    h.controller.play();
    expect(h.state()).toMatchObject({ time: 7, playing: false });
    expect(h.pending.size).toBe(0);
    h.controller.play();
    h.advance(30_000);
    expect(h.state()).toMatchObject({ time: 10, playing: false });
  });

  it('skips nothing from a time no pause skips at, nor without skips', () => {
    const h = harness({ duration: 10, time: 2.5, stops: [2], skips: [{ start: 2, end: 3 }] });
    h.controller.play();
    h.advance(250);
    expect(h.state()).toMatchObject({ time: 2.75, playing: true });
    h.controller.pause();
    h.publish({ time: 2, skips: undefined });
    h.controller.play();
    h.advance(250);
    expect(h.state()).toMatchObject({ time: 2.25, playing: true });
  });

  it('reads the stops afresh on every frame, and stops at none when there are none', () => {
    const h = harness({ duration: 10, stops: [2] });
    h.controller.play();
    h.advance(1000);
    h.publish({ stops: undefined });
    h.advance(2000);
    expect(h.state()).toMatchObject({ time: 3, playing: true });
    h.publish({ stops: [3.5] });
    h.advance(1000);
    expect(h.state()).toMatchObject({ time: 3.5, playing: false });
  });

  it('pauses at the published frame and resumes without counting the paused interval', () => {
    const h = harness({ time: 1 });
    h.controller.play();
    h.advance(250);
    h.controller.pause();
    h.advance(3000);
    expect(h.state()).toMatchObject({ time: 1.25, playing: false });
    h.controller.play();
    h.advance(500);
    h.controller.play(); // repeated play does not rebase the clock or add a frame
    expect(h.pending.size).toBe(1);
    h.advance(250);
    expect(h.state()).toMatchObject({ time: 2, playing: true });
  });

  it('wraps delayed frames and reads a changed loop setting without restarting its clock', () => {
    const h = harness({ time: 1.5, duration: 2, loop: true });
    h.controller.play();
    h.advance(5250);
    expect(h.state()).toMatchObject({ time: 0.75, playing: true });
    h.publish({ loop: false });
    h.advance(250);
    expect(h.state()).toMatchObject({ time: 2, playing: false });
    expect(h.pending.size).toBe(0);
  });

  it('uses the current duration when it grows or shrinks during playback', () => {
    const h = harness({ duration: 2 });
    h.controller.play();
    h.advance(500);
    h.publish({ duration: 4 });
    h.advance(2000);
    expect(h.state()).toMatchObject({ time: 2.5, playing: true });
    h.publish({ duration: 1 });
    h.advance(250);
    expect(h.state()).toMatchObject({ time: 1, playing: false });
  });

  it('ends an empty scene on its first frame even when looping', () => {
    const h = harness({ duration: 0, loop: true });
    h.controller.play();
    h.advance(20);
    expect(h.state()).toMatchObject({ time: 0, playing: false });
    expect(h.pending.size).toBe(0);
  });

  it('seeks and resets immediately, rejecting frames from before the command or a newer play', () => {
    const h = harness();
    h.controller.play();
    h.advance(1000);
    const beforeSeek = h.next();
    h.controller.seek(3.2);
    beforeSeek(7000);
    expect(h.state()).toMatchObject({ time: 3.2, playing: false });
    expect(h.pending.size).toBe(0);

    h.controller.play();
    beforeSeek(8000);
    h.advance(500);
    expect(h.state()).toMatchObject({ time: 3.7, playing: true });
    const beforeReset = h.next();
    h.controller.reset();
    beforeReset(9000);
    expect(h.state()).toMatchObject({ time: 0, playing: false });

    // Authored targets and the ruler retain their own upper-bound/snapping policy.
    h.controller.seek(12);
    expect(h.state().time).toBe(12);
    h.controller.seek(-1);
    expect(h.state().time).toBe(0);
  });

  it('follows external playing changes and reads the live playhead when resuming', () => {
    const h = harness();
    h.publish({ time: 2, playing: true });
    h.advance(500);
    expect(h.state().time).toBe(2.5);
    h.publish({ playing: false });
    h.advance(1000);
    expect(h.state().time).toBe(2.5);
    h.publish({ time: 5, playing: true });
    h.advance(500);
    expect(h.state().time).toBe(5.5);
  });

  it('disposes subscriptions and late frames; reconnecting resumes only the current lifecycle', () => {
    const h = harness({ time: 1, playing: true });
    h.advance(500);
    const late = h.next();
    h.controller.dispose();
    expect(h.pending.size).toBe(0);
    expect(h.listeners.size).toBe(0);
    late(9000);
    h.publish({ playing: false });
    h.publish({ playing: true });
    h.advance(2000);
    expect(h.state()).toMatchObject({ time: 1.5, playing: true });
    expect(h.pending.size).toBe(0);

    const oldCleanup = h.controller.connect();
    h.controller.connect();
    oldCleanup();
    late(10000);
    expect(h.pending.size).toBe(1);
    expect(h.listeners.size).toBe(1);
    h.advance(250);
    expect(h.state().time).toBe(1.75);
  });

  it('does not stop a newer run when publication replaces an ending run', () => {
    const h = harness({ duration: 2 });
    let replaced = false;
    h.listeners.add(() => {
      if (replaced || h.state().time !== 2) return;
      replaced = true;
      h.controller.reset();
      h.publish({ duration: 5 });
      h.controller.play();
    });
    h.controller.play();
    h.advance(3000);
    expect(h.state()).toMatchObject({ time: 0, playing: true });
    expect(h.pending.size).toBe(1);
    h.advance(250);
    expect(h.state().time).toBe(0.25);
  });
});
