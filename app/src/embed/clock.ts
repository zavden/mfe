/* The player's clock: the part of the scene it plays, how time moves while it plays, the frame
 * steps of the keys and the readouts. Pure: the DOM player (`player.ts`) feeds it the time of
 * each animation frame. */

/** The part of the scene a player plays, in seconds of the scene. */
export interface Range {
  start: number;
  end: number;
}

/** The speeds a player offers. */
export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/** The longest step one animation frame may take (s): after a stall (a tab in the background, a
 * busy page) playback goes on from where it was instead of jumping. */
export const MAX_FRAME_STEP = 0.1;

/** The range `[from, to]` of a scene `duration` long: each end inside the scene, the start before
 * the end. A missing end is the scene's; a range that would be empty is the whole scene. */
export function resolveRange(duration: number, from: number | null, to: number | null): Range {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const clamp = (t: number) => Math.min(Math.max(t, 0), length);
  const start = from === null || !Number.isFinite(from) ? 0 : clamp(from);
  const end = to === null || !Number.isFinite(to) ? length : clamp(to);
  return end > start ? { start, end } : { start: 0, end: length };
}

/** Where a player shows the scene before it plays: `start` (a time, or the range's end), held
 * inside the range; the range's start when there is none. */
export function initialTime(range: Range, start: number | 'end' | null): number {
  if (start === 'end') return range.end;
  if (start === null || !Number.isFinite(start)) return range.start;
  return Math.min(Math.max(start, range.start), range.end);
}

export interface Tick {
  time: number;
  /** Still playing after this frame. */
  playing: boolean;
}

/** One animation frame of playback: `elapsed` seconds of the page (held to `MAX_FRAME_STEP`) at
 * `speed`. At the range's end it stops there, or with `loop` goes on from its start. */
export function advance(
  time: number,
  elapsed: number,
  speed: number,
  range: Range,
  loop: boolean,
): Tick {
  const step = Math.min(Math.max(elapsed, 0), MAX_FRAME_STEP) * speed;
  const next = time + step;
  if (next < range.end) return { time: Math.max(next, range.start), playing: true };
  const length = range.end - range.start;
  if (loop && length > 0)
    return { time: range.start + ((next - range.start) % length), playing: true };
  return { time: range.end, playing: false };
}

/** Where Play starts from: where the player is, unless it stands at the end of the range — then
 * from its start, as a video player does. */
export function playFrom(time: number, range: Range): number {
  return time >= range.end - 1e-6 ? range.start : time;
}

/** The time one frame (or, `big`, one second) away, on the frame grid of `fps`, inside the
 * range: the arrow keys (as the app's transport steps, `ui/transport/playback.ts`). */
export function stepTime(
  time: number,
  fps: number,
  range: Range,
  direction: -1 | 1,
  big: boolean,
): number {
  const rate = fps > 0 ? fps : 60;
  const next = big ? time + direction : (Math.floor(time * rate + 1e-6) + direction) / rate;
  return Math.min(Math.max(next, range.start), range.end);
}

/** How far into the range `time` is, from 0 to 1. */
export function progressOf(time: number, range: Range): number {
  const length = range.end - range.start;
  if (length <= 0) return 0;
  return Math.min(Math.max((time - range.start) / length, 0), 1);
}

/** Seconds as the readout shows them: "1.25". */
export function formatSeconds(time: number): string {
  return (Math.round(Math.max(time, 0) * 100) / 100).toFixed(2);
}

/** What a screen reader says of the time: "1.25 seconds of 6.00". */
export function spokenTime(time: number, range: Range): string {
  return `${formatSeconds(time)} seconds of ${formatSeconds(range.end)}`;
}

/** A speed as its button shows it: "0.5×". */
export function formatSpeed(speed: number): string {
  return `${speed}×`;
}
