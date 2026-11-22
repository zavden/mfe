/* Manim's default lag_ratio per animation kind, for n animated glyphs.
 * Sources: Write._set_default_config_from_length (CE), Write.compute_lag_ratio (GL),
 * Create/ShowCreation lag_ratio=1.0; everything else inherits Animation's 0. */
import type { IntroKind, OutroKind, Target } from '../model';

export function defaultLagRatio(
  kind: IntroKind | OutroKind,
  glyphCount: number,
  target: Target,
): number {
  switch (kind) {
    case 'write':
    case 'unwrite':
      return target === 'ce'
        ? Math.min(4 / Math.max(1, glyphCount), 0.2)
        : Math.min(4 / (glyphCount + 1), 0.2);
    case 'create':
    case 'uncreate':
      return 1;
    default:
      return 0;
  }
}

/** Manim's lagged sub-interval for item i of n (Animation.get_sub_alpha):
 * full_length = (n - 1) * lag + 1; item i runs over [i·lag, i·lag + 1] / full_length. */
export function lagWindow(i: number, n: number, lagRatio: number): [number, number] {
  const full = (n - 1) * lagRatio + 1;
  const start = (i * lagRatio) / full;
  return [start, start + 1 / full];
}
