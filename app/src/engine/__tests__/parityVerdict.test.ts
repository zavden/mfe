// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { engineSkips, verdict } from '../../../../tests/parity/verdict.mjs';

/* The verdict of `npm run parity` (tests/parity/run.mjs), a pure function of what happened. */
describe('parity verdict', () => {
  const both = { ce: 'ok', gl: 'ok' } as const;
  const noSkips: string[] = [];

  it('fails when an interpreter that was found could not dump, whatever else passed', () => {
    expect(
      verdict({
        dumps: { ce: 'failed', gl: 'absent' },
        unexpected: 0,
        engineOk: true,
        engineSkipped: ['latexVsCE: results/ce.json missing or stale'],
      }),
    ).toEqual({ label: 'PARITY: FAILED (CE dump failed)', exit: 1 });
  });

  it('is incomplete, not green, without an interpreter; strict mode fails', () => {
    const run = {
      dumps: { ce: 'ok', gl: 'absent' },
      unexpected: 0,
      engineOk: true,
      engineSkipped: noSkips,
    } as const;
    expect(verdict(run)).toEqual({
      label: 'PARITY: INCOMPLETE (GL interpreter not found)',
      exit: 0,
    });
    expect(verdict({ ...run, strict: true }).exit).toBe(1);
    // The engine skips that interpreter's comparison too: the missing interpreter is the reason.
    expect(
      verdict({ ...run, engineSkipped: ['latexVsGL: results/gl.json missing or stale'] }).label,
    ).toBe('PARITY: INCOMPLETE (GL interpreter not found)');
  });

  it('is incomplete, never ok, when engine comparisons were skipped; strict mode fails', () => {
    const run = {
      dumps: both,
      unexpected: 0,
      engineOk: true,
      engineSkipped: [
        'latexVsCE: companion did not start: x',
        'latexVsGL: companion did not start: x',
      ],
    };
    expect(verdict(run)).toEqual({
      label:
        'PARITY: INCOMPLETE (engine skipped: latexVsCE: companion did not start: x; ' +
        'latexVsGL: companion did not start: x)',
      exit: 0,
    });
    expect(verdict({ ...run, strict: true }).exit).toBe(1);
  });

  it('fails on unexpected differences or engine failures, and is ok otherwise', () => {
    const run = { dumps: both, unexpected: 0, engineOk: true, engineSkipped: noSkips };
    const failures = { label: 'PARITY: UNEXPECTED FAILURES', exit: 1 };
    expect(verdict({ ...run, unexpected: 1 })).toEqual(failures);
    expect(verdict({ ...run, engineOk: false })).toEqual(failures);
    // A failed engine run is not merely incomplete because it also skipped something.
    expect(
      verdict({ ...run, engineOk: false, engineSkipped: ['latexVsGL: results/gl.json missing'] }),
    ).toEqual(failures);
    expect(verdict(run)).toEqual({ label: 'PARITY: OK', exit: 0 });
  });
});

describe('engineSkips', () => {
  it('lists every engine check that results/engine.json records as skipped, with why', () => {
    expect(
      engineSkips({
        latexVsCE: { skipped: 'companion did not start: boom' },
        latexVsGL: { compared: 70, failures: [] },
        mathjaxCE: { equalCount: 70, failures: [] },
        unexpected: [],
      }),
    ).toEqual(['latexVsCE: companion did not start: boom']);
    expect(engineSkips({ latexVsCE: { compared: 70, failures: [] }, unexpected: [] })).toEqual([]);
  });
});
