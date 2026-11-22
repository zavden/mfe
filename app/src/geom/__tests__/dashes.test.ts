import { describe, expect, it } from 'vitest';
import { buildLine, dashSpans, MAX_DASHES } from '../lines';

/* A dashed line is drawn dash by dash, as Manim builds it: the count grows as the line's length
 * over the dash's. It stops at MAX_DASHES, so that no number in a file — a dash 1e-9 long is two
 * billion dashes on a line of four units — is more than the tab can draw. */
describe('the dashes of a dashed line', () => {
  it.each(['ce', 'gl'] as const)('are counted as Manim counts them (%s)', (target) => {
    expect(dashSpans(target, 4, 0.125)).toHaveLength(16);
    expect(dashSpans(target, 4, 0.0625)).toHaveLength(32);
  });

  it.each(['ce', 'gl'] as const)('are never more than the most a line draws (%s)', (target) => {
    for (const dashLength of [1e-6, 1e-9, 1e-12, 1e-300]) {
      const spans = dashSpans(target, 4, dashLength);
      expect(spans).toHaveLength(MAX_DASHES);
      // Still dashes along the whole line, in order.
      expect(spans[0]![0]).toBe(0);
      expect(spans.at(-1)![1]).toBeCloseTo(1, 6);
      expect(spans.every(([from, to]) => to > from)).toBe(true);
    }
  });

  it.each(['ce', 'gl'] as const)('a line of dashes too short to count is built (%s)', (target) => {
    const line = buildLine(target, 'dashed', [0, 0], [4, 0], {
      strokeWidth: 4,
      tipLength: 0.35,
      dashLength: 1e-9,
    });
    expect(line.parts).toHaveLength(MAX_DASHES);
    expect(line.parts.every((part) => part.role === 'dash')).toBe(true);
  });
});
