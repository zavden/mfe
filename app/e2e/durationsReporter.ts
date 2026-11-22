/* Records what the tests of each spec take, for the order of the suite (`build/e2ePlan.ts`):
 *
 *   MFE_E2E_RECORD=1 npx playwright test
 *
 * rewrites `e2e/durations.json` after a run of the whole suite. A spec whose tests all ran and
 * passed gets its new time; one with a failure keeps the time it had (a failed test waits for a
 * timeout, which is not what the spec takes). The config adds this reporter only when asked. */
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import { relative } from 'node:path';
import { E2E_DIR, readSeconds, slashed, specFiles, writeSeconds } from '../build/e2eFiles';
import { recordedSeconds, type SpecRun } from '../build/e2ePlan';

/** What one test took, in seconds. A pause it waited for is not in it (`e2e/test.ts`). */
function seconds(test: TestCase): number {
  return test.results.reduce((sum, result) => sum + result.duration, 0) / 1000;
}

export default class DurationsReporter implements Reporter {
  private suite: Suite | null = null;

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite;
  }

  onEnd(result: FullResult): void {
    if (!this.suite) return;
    const runs = new Map<string, SpecRun>();
    for (const test of this.suite.allTests()) {
      const spec = slashed(relative(E2E_DIR, test.location.file));
      const run = runs.get(spec) ?? { spec, seconds: 0, clean: true };
      run.seconds += seconds(test);
      // A skipped test is the spec's own doing; one that did not run, or failed, is not.
      if (test.results.length === 0 || !test.ok()) run.clean = false;
      runs.set(spec, run);
    }
    const specs = specFiles();
    const missing = specs.filter((spec) => !runs.has(spec));
    if (result.status === 'interrupted' || missing.length > 0) {
      console.log(
        `\n  The times were not recorded: ${
          missing.length > 0
            ? `${missing.length} of the ${specs.length} specs did not run`
            : 'the run was interrupted'
        }. Record them on a run of the whole suite.\n`,
      );
      return;
    }
    writeSeconds(recordedSeconds(readSeconds(), [...runs.values()], specs));
    const kept = [...runs.values()].filter((run) => !run.clean).length;
    console.log(
      `\n  Recorded the times of ${runs.size - kept} specs in e2e/durations.json` +
        (kept > 0 ? ` (${kept} with failures keep the time they had)` : '') +
        '\n',
    );
  }
}
