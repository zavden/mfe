/* The clock of an exported page: the scene's time with its pauses. The page is a presentation —
 * it plays up to the next pause and stops there until its reader goes on —, so the clock's own
 * notions are the **stops** (the pauses, in order) and the **slides** (the stretches between them).
 * A pause may skip its wait (D202): going on from it, the scene goes on from the end of the rest
 * it stands in (`playStart`). Which pauses are stops is the model's to say (`stopsOf`,
 * `model/slides.ts`): the editor's rehearsal stops at them too. Pure: the page feeds it the time of
 * each animation frame (`deck.ts`). */
import { MAX_FRAME_STEP } from '../embed/clock';

/** Times closer than this are one. */
const EPSILON = 1e-6;

/** The slide `time` is on, from 0: how many stops lie behind it. Standing on a stop is being at
 * the end of the slide before it — the scene stopped there —, unless `after`: then it is the
 * start of the next one, which is where playing goes on from. */
export function slideAt(stops: readonly number[], time: number, after = false): number {
  let index = 0;
  for (const stop of stops) {
    if (after ? stop <= time + EPSILON : stop < time - EPSILON) index++;
    else break;
  }
  return index;
}

/** The index in `pauses` (times, in order) of the one at `time`, the first when two share it;
 * null when none is there. */
export function pauseIndexAt(pauses: readonly number[], time: number): number | null {
  const index = pauses.findIndex((pause) => Math.abs(pause - time) <= EPSILON);
  return index < 0 ? null : index;
}

/** The first stop after `time`, or the end of the scene. */
export function nextStop(stops: readonly number[], duration: number, time: number): number {
  return stops.find((stop) => stop > time + EPSILON) ?? duration;
}

/** The last stop before `time`, or the start of the scene. */
export function previousStop(stops: readonly number[], time: number): number {
  let found = 0;
  for (const stop of stops) {
    if (stop < time - EPSILON) found = stop;
    else break;
  }
  return found;
}

export interface SlideTick {
  time: number;
  /** Still playing after this frame. */
  playing: boolean;
  /** The stop the frame reached and stopped at, if it did. */
  stopped: number | null;
  /** The frame reached the end of the scene. */
  ended: boolean;
}

/** One animation frame of playback from `time`: `elapsed` seconds of the page (held to
 * `MAX_FRAME_STEP`, so a tab that slept goes on from where it was) at `speed`. It stops at the
 * first stop it reaches, exactly there; with `through` it plays through the stops (the
 * continuous mode). At the end of the scene it stops, or with `loop` goes on from the start. */
export function advanceSlide(
  time: number,
  elapsed: number,
  speed: number,
  duration: number,
  stops: readonly number[],
  options: { through?: boolean; loop?: boolean } = {},
): SlideTick {
  const step = Math.min(Math.max(elapsed, 0), MAX_FRAME_STEP) * speed;
  const wanted = time + step;
  if (!options.through) {
    const stop = stops.find((s) => s > time + EPSILON);
    if (stop !== undefined && wanted >= stop - EPSILON) {
      return { time: stop, playing: false, stopped: stop, ended: false };
    }
  }
  if (wanted < duration - EPSILON)
    return { time: wanted, playing: true, stopped: null, ended: false };
  if (options.loop && duration > 0) {
    return { time: (wanted - duration) % duration, playing: true, stopped: null, ended: true };
  }
  return { time: duration, playing: false, stopped: null, ended: true };
}

/** Where Play starts from: where the page is, unless it stands at the end — then from the start,
 * as a video player does. */
export function playFromTime(time: number, duration: number): number {
  return time >= duration - EPSILON ? 0 : time;
}

/** A pause as the clock reads it: its time, and the time the scene goes on from when the page
 * stands there and goes on — its own time, or the end of the wait it skips. */
export interface ClockPause {
  time: number;
  resume: number;
}

/** Whether a pause skips its wait: going on from it, the scene goes on later. */
export const skipsWait = (pause: ClockPause): boolean => pause.resume > pause.time + EPSILON;

/** Where playing starts, and how. */
export interface PlayStart {
  time: number;
  /** It jumped over the wait of the pause it stood at. */
  skipped: boolean;
  /** The wait ended at the next stop: the page stands there at once, as if it had played to it. */
  stopped: boolean;
}

/** Where playing starts when the page is told to go on from `time`. Standing at a pause that
 * skips its wait (`pauses`: the scene's, in order) with the pauses in force — not `through` —, from
 * the end of that wait, which may be the next stop. Anywhere else as `playFromTime` says: a pause
 * passed by playing through it, or a seek into its wait, skips nothing. */
export function playStart(
  time: number,
  duration: number,
  pauses: readonly ClockPause[],
  stops: readonly number[],
  through: boolean,
): PlayStart {
  if (!through) {
    const index = pauseIndexAt(
      pauses.map((pause) => pause.time),
      time,
    );
    const resume = index === null ? time : pauses[index]!.resume;
    if (resume > time + EPSILON) {
      const stopped = stops.some((stop) => Math.abs(stop - resume) <= EPSILON);
      return { time: resume, skipped: true, stopped };
    }
  }
  return { time: playFromTime(time, duration), skipped: false, stopped: false };
}
