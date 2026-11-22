/* Per-glyph progress of an intro or outro, as Manim computes it.
 *
 * Manim does not ease the animation as a whole: `Animation.interpolate` lags the raw alpha per
 * submobject (`get_sub_alpha`) and applies the rate function to each sub-alpha
 * (CE: `rate_func(value − lower)`; GL: `rate_func(clip(value − lower, 0, 1))`). With a lag
 * ratio of 0 this equals easing the whole animation. Reversed animations (CE `Unwrite`,
 * `Uncreate`; GL `Uncreate`) evaluate `rate_func(1 − sub)` instead. `rateFunction` clamps its
 * input to [0, 1], which both libraries do through `unit_interval` / `clip`. */
import type { RateFunction } from '../easing';
import { lagWindow } from '../lag';

/** Progress of item `index` of `count` at overall alpha ∈ [0, 1]. */
export function subProgress(
  alpha: number,
  index: number,
  count: number,
  lagRatio: number,
  rate: RateFunction,
  reverse = false,
): number {
  const [start, end] = lagWindow(index, count, lagRatio);
  let raw = (alpha - start) / (end - start);
  // Snap float noise at the window edges so that "exactly finished" is not "almost finished".
  if (Math.abs(raw) < 1e-12) raw = 0;
  else if (Math.abs(raw - 1) < 1e-12) raw = 1;
  return rate(reverse ? 1 - raw : raw);
}
