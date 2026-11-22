/* Playback clock arithmetic and time formatting. The lifecycle lives in playbackController.ts;
 * these are the pure calculations. */

export interface PlaybackFrame {
  /** Playhead time, seconds. */
  time: number;
  /** True when playback reached the end and is not looping. */
  ended: boolean;
}

/** Where the playhead is `elapsed` seconds after starting from `t0`: it stops at `duration`, or
 * wraps around when `loop` is set. */
export function playbackFrame(
  t0: number,
  elapsed: number,
  duration: number,
  loop: boolean,
): PlaybackFrame {
  const t = t0 + elapsed;
  if (duration <= 0) return { time: 0, ended: true };
  if (t < duration) return { time: t, ended: false };
  if (loop) return { time: t % duration, ended: false };
  return { time: duration, ended: true };
}

/** The first of `stops` playback reached going from `from` to `to`: after `from` — a stop it
 * started on is behind it — and at or before `to`. Null when it reached none, and when it did not
 * go forwards (a loop took it back to the start). */
export function stopReached(from: number, to: number, stops: readonly number[]): number | null {
  if (!(to > from)) return null;
  for (const stop of stops) {
    if (stop > from + 1e-6 && stop <= to + 1e-6) return stop;
  }
  return null;
}

/** A stretch playback jumps over when it goes on from a pause of the Slides mode that skips its
 * wait (D202): from the pause to where the next animation starts (`skippedWait`, `model/slides.ts`). */
export interface SkippedWait {
  start: number;
  end: number;
}

/** Where playing goes on from `time`: past the wait a pause there skips (one of `skips` that starts
 * at `time`), to its end — and standing there (`stand`), not playing, when that end is one of
 * `stops`: the next pause of the rest, where the scene stops again. `time` itself, playing, when
 * no pause there skips its wait. */
export function skipFrom(
  time: number,
  skips: readonly SkippedWait[],
  stops: readonly number[],
): { time: number; stand: boolean } {
  const skip = skips.find((s) => Math.abs(s.start - time) <= 1e-6);
  if (!skip) return { time, stand: false };
  return { time: skip.end, stand: stops.some((stop) => Math.abs(stop - skip.end) <= 1e-6) };
}

/** Index of the video frame that is on screen at time t (frame k covers [k/fps, (k+1)/fps)). */
export function frameIndex(t: number, fps: number): number {
  return Math.max(0, Math.floor(t * fps + 1e-6));
}

/** `MM:SS:FF` — minutes, seconds and the frame within the second. */
export function formatTimecode(t: number, fps: number): string {
  const total = frameIndex(t, fps);
  const frames = total % fps;
  const seconds = Math.floor(total / fps);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}:${pad(frames)}`;
}

/** Playhead time one frame (or one second) away, kept on the frame grid and inside the scene. */
export function stepTime(
  t: number,
  fps: number,
  duration: number,
  direction: -1 | 1,
  big: boolean,
): number {
  const next = big ? t + direction : (frameIndex(t, fps) + direction) / fps;
  const snapped = big ? next : Math.round(next * fps) / fps;
  return Math.min(Math.max(snapped, 0), Math.max(duration, 0));
}
