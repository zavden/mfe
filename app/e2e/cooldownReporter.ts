/* Declares the pauses of a run (`build/e2ePlan.ts`): it counts the tests as they end, in the one
 * process that sees them all, and every so many it writes until when the workers should wait
 * (`e2e/test.ts` reads it before each test). The config adds this reporter only to a run that has
 * pauses: a Mac, or one that asks for them. */
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { rmSync, writeFileSync } from 'node:fs';
import { COOLDOWN_FILE_ENV, cooldownFor, pauseAfter } from '../build/e2ePlan';

export default class CooldownReporter implements Reporter {
  private readonly cooldown = cooldownFor(process.platform, process.env);
  private readonly file = process.env[COOLDOWN_FILE_ENV];
  private total = 0;
  private ended = 0;
  private ran = 0;
  private pauses = 0;

  /** It says a line at each pause, beside the reporter that prints the run. */
  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.total = suite.allTests().length;
    this.forget();
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    this.ended++;
    if (result.status === 'skipped') return; // it heated nothing
    this.ran++;
    if (!this.cooldown || !this.file) return;
    if (!pauseAfter(this.ran, this.total - this.ended, this.cooldown.every)) return;
    writeFileSync(this.file, String(Date.now() + this.cooldown.seconds * 1000));
    this.pauses++;
    console.log(
      `\n  ${this.ran} tests have run: a pause of ${this.cooldown.seconds} s for the machine to ` +
        `cool (pause ${this.pauses}; MFE_E2E_COOL_EVERY=0 runs the suite without them)\n`,
    );
  }

  onEnd(): void {
    this.forget();
  }

  private forget(): void {
    if (this.file) rmSync(this.file, { force: true });
  }
}
