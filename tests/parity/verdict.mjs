/* The verdict of a parity run (run.mjs), a pure function of what happened: run.mjs prints its
 * label and exits with its code. */

/**
 * @param {object} run
 * @param {Record<string, 'absent' | 'failed' | 'ok'>} run.dumps per interpreter: not found,
 *   found but failed to dump, or dumped
 * @param {number} run.unexpected CE vs GL differences that are not known exceptions
 * @param {boolean} run.engineOk the engine checks (Vitest) passed and wrote results/engine.json
 * @param {string[]} run.engineSkipped engine checks that were skipped, with why (engineSkips)
 * @param {boolean} [run.strict] an incomplete run fails (MFE_PARITY_STRICT=1)
 * @returns {{ label: string, exit: number }}
 */
export function verdict({ dumps, unexpected, engineOk, engineSkipped, strict = false }) {
  const named = (status) =>
    Object.entries(dumps)
      .filter(([, s]) => s === status)
      .map(([name]) => name.toUpperCase());
  const failed = named('failed');
  if (failed.length > 0) {
    return { label: `PARITY: FAILED (${failed.join(', ')} dump failed)`, exit: 1 };
  }
  if (unexpected > 0 || !engineOk) return { label: 'PARITY: UNEXPECTED FAILURES', exit: 1 };
  // A missing interpreter is the plainer reason: its engine comparison was skipped as well.
  const absent = named('absent');
  if (absent.length > 0) {
    return {
      label: `PARITY: INCOMPLETE (${absent.join(', ')} interpreter not found)`,
      exit: strict ? 1 : 0,
    };
  }
  if (engineSkipped.length > 0) {
    return {
      label: `PARITY: INCOMPLETE (engine skipped: ${engineSkipped.join('; ')})`,
      exit: strict ? 1 : 0,
    };
  }
  return { label: 'PARITY: OK', exit: 0 };
}

/**
 * The engine checks that results/engine.json (engine.parity.ts) records as skipped, as
 * `"<check>: <why>"` (for instance a companion that did not start).
 * @param {Record<string, unknown>} report the parsed results/engine.json
 * @returns {string[]}
 */
export function engineSkips(report) {
  return Object.entries(report)
    .filter(([, value]) => typeof value === 'object' && value !== null && 'skipped' in value)
    .map(([key, value]) => `${key}: ${value.skipped}`);
}
