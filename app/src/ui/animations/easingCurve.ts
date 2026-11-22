/* The easing curve of a block (R2, D75): the rate function of its easing under the project's
 * target, sampled for an SVG path, and where the block's progress lands on it. Pure. */
import type { Easing, Target } from '../../model';
import { rateFunction } from '../../scene';

/** `samples` + 1 points of the curve, from t = 0 to t = 1. */
export function curvePoints(easing: Easing, target: Target, samples = 64): [number, number][] {
  const f = rateFunction(easing, target);
  const points: [number, number][] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    points.push([t, f(t)]);
  }
  return points;
}

/** An SVG path of the curve in a `width` × `height` box with `pad` around it, y up. */
export function curvePath(
  points: readonly [number, number][],
  width: number,
  height: number,
  pad: number,
): string {
  const x = (t: number) => pad + t * (width - 2 * pad);
  const y = (v: number) => height - pad - v * (height - 2 * pad);
  return points
    .map(([t, v], i) => `${i === 0 ? 'M' : 'L'}${x(t).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(' ');
}

/** Where progress `t` sits on the curve, in the same box. */
export function curvePoint(
  easing: Easing,
  target: Target,
  t: number,
  width: number,
  height: number,
  pad: number,
): { x: number; y: number; value: number } {
  const value = rateFunction(easing, target)(t);
  return {
    x: pad + t * (width - 2 * pad),
    y: height - pad - value * (height - 2 * pad),
    value,
  };
}
