/* Manim rate functions, per target. CE and GL define some of them differently
 * (CE `smooth` is a normalised sigmoid, GL `smooth` is the quintic Bézier
 * [0,0,0,1,1,1]); the preview must use the curves of the project target.
 * Sources: manim/utils/rate_functions.py (CE 0.22), manimlib/utils/rate_functions.py (GL 1.7).
 * They are ports of the two libraries' own functions (MIT): the notice of each travels with
 * every build and with the engine of an exported page (`build/thirdParty.ts`,
 * `build/licenses/ManimCE-LICENSE.txt` and `ManimGL-LICENSE.txt`). */
import type { Easing, Target } from '../model';

export type RateFunction = (t: number) => number;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function ceSmooth(t: number, inflection = 10): number {
  const error = sigmoid(-inflection / 2);
  return Math.min(Math.max((sigmoid(inflection * (t - 0.5)) - error) / (1 - 2 * error), 0), 1);
}

function glSmooth(t: number): number {
  const s = 1 - t;
  return t ** 3 * (10 * s * s + 5 * s * t + t * t);
}

function family(smooth: (t: number) => number): Record<Easing, RateFunction> {
  return {
    linear: (t) => t,
    smooth,
    rush_into: (t) => 2 * smooth(t / 2),
    rush_from: (t) => 2 * smooth(t / 2 + 0.5) - 1,
    slow_into: (t) => Math.sqrt(1 - (1 - t) * (1 - t)),
    double_smooth: (t) => (t < 0.5 ? 0.5 * smooth(2 * t) : 0.5 * (1 + smooth(2 * t - 1))),
    there_and_back: (t) => smooth(t < 0.5 ? 2 * t : 2 * (1 - t)),
    // Up, a third of the time held at the top (`pause_ratio = 1 / 3`), down.
    there_and_back_with_pause: (t) => {
      const a = 2 / (1 - 1 / 3);
      if (t < 0.5 - 1 / 6) return smooth(a * t);
      if (t < 0.5 + 1 / 6) return 1;
      return smooth(a - a * t);
    },
  };
}

const CURVES: Record<Target, Record<Easing, RateFunction>> = {
  ce: family((t) => ceSmooth(t)),
  gl: family(glSmooth),
};

/** The rate function for `easing` under `target`; input is clamped to [0, 1]. */
export function rateFunction(easing: Easing, target: Target): RateFunction {
  const f = CURVES[target][easing];
  return (t) => f(clamp01(t));
}
