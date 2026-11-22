/* Ids in sequence for the tests: f_1, f_2, c_1… A project built under
 * `setIdGenerator(sequentialIds())` has the same ids on every run, which a snapshot needs and
 * which the order of events at one instant depends on. The app's ids are random (`model/ids.ts`). */
import type { IdKind } from '../model';

export function sequentialIds(): (kind: IdKind) => string {
  const counters = new Map<IdKind, number>();
  return (kind) => {
    const n = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, n);
    return `${kind}_${n}`;
  };
}
