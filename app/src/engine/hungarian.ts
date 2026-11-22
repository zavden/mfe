/* Minimum-cost assignment (Kuhn–Munkres with potentials), O(n²·m). Rectangular inputs allowed.
 * Ported from tests/parity/hungarian.mjs, which brute-force-checks the same algorithm. */

/** assignment[row] = column, or -1 when the row stays unassigned (more rows than columns). */
export function hungarian(cost: readonly (readonly number[])[]): {
  assignment: number[];
  total: number;
} {
  const rows = cost.length;
  if (rows === 0) return { assignment: [], total: 0 };
  const cols = cost[0]!.length;
  if (cols === 0) return { assignment: new Array<number>(rows).fill(-1), total: 0 };

  if (rows > cols) {
    const transposed = Array.from({ length: cols }, (_, j) => cost.map((row) => row[j]!));
    const inner = hungarian(transposed);
    const assignment = new Array<number>(rows).fill(-1);
    inner.assignment.forEach((row, col) => {
      if (row >= 0) assignment[row] = col;
    });
    return { assignment, total: inner.total };
  }

  const n = rows;
  const m = cols;
  // 1-based arrays; index 0 is a sentinel.
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0); // p[j] = row assigned to column j
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array<number>(n).fill(-1);
  let total = 0;
  for (let j = 1; j <= m; j++) {
    if (p[j] !== 0) {
      assignment[p[j]! - 1] = j - 1;
      total += cost[p[j]! - 1]![j - 1]!;
    }
  }
  return { assignment, total };
}
