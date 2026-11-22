// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hungarian } from '../hungarian';

/** Brute-force optimum over every injective assignment of the smaller side. */
function bruteForce(cost: number[][]): number {
  const small =
    cost.length <= cost[0]!.length ? cost : cost[0]!.map((_, j) => cost.map((r) => r[j]!));
  const k = small.length;
  const used = new Array<boolean>(small[0]!.length).fill(false);
  let best = Infinity;
  const rec = (i: number, sum: number) => {
    if (i === k) {
      best = Math.min(best, sum);
      return;
    }
    small[i]!.forEach((c, j) => {
      if (used[j]) return;
      used[j] = true;
      rec(i + 1, sum + c);
      used[j] = false;
    });
  };
  rec(0, 0);
  return best;
}

describe('hungarian', () => {
  it('matches brute force on random square and rectangular matrices', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let t = 0; t < 300; t++) {
      const rows = 1 + Math.floor(rand() * 6);
      const cols = 1 + Math.floor(rand() * 6);
      const cost = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => Math.floor(rand() * 20) - 5),
      );
      const { assignment, total } = hungarian(cost);
      const assigned = assignment.filter((c) => c >= 0);
      expect(new Set(assigned).size).toBe(assigned.length);
      expect(assigned).toHaveLength(Math.min(rows, cols));
      expect(assignment.reduce((s, c, r) => s + (c >= 0 ? cost[r]![c]! : 0), 0)).toBe(total);
      expect(total).toBe(bruteForce(cost));
    }
  });

  it('handles empty inputs', () => {
    expect(hungarian([])).toEqual({ assignment: [], total: 0 });
    expect(hungarian([[], []])).toEqual({ assignment: [-1, -1], total: 0 });
  });
});
