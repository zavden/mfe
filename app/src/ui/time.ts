/* Times (and other values) the editor computes and writes into the project. */

/** Removes float noise from values written by arithmetic (µs resolution for times). */
export const round6 = (x: number): number => Math.round(x * 1e6) / 1e6 + 0; // never -0

/** `seconds` rounded down to the millisecond (what a field with a step of 0.001 holds), once the
 * float noise of a sum is gone: 4.4 + 2.2 gives 6.6, and 1.001 stays 1.001 (a plain floor of
 * 1.001 * 1000 = 1000.999… would not). Down, so that the default end of a range never passes the
 * time it comes from. */
export const floorToMs = (seconds: number): number =>
  Math.floor(Math.round(seconds * 1e6) / 1e3) / 1e3;

/** `t` on the frame grid of `fps`, without float noise. */
export function snapToFrame(t: number, fps: number): number {
  const frame = 1 / fps;
  return round6(Math.round(t / frame) * frame);
}
