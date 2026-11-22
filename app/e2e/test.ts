/* The `test` of every spec: Playwright's, plus what the whole suite needs around each test. A
 * spec imports `test` and `expect` from here, never from '@playwright/test'
 * (`build/__tests__/e2eConventions.test.ts` reads the specs for it): a test declared with
 * Playwright's own would run outside of what is set up here.
 *
 * For now that is one thing, the pauses that let a machine without a fan cool
 * (`build/e2ePlan.ts`): the run's reporter declares a pause, and each test waits for it to end
 * before it starts. The tests that were running when it was declared finish first. */
import { test as base } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { COOLDOWN_FILE_ENV, cooldownFor } from '../build/e2ePlan';

export { expect } from '@playwright/test';
export type {
  BrowserContext,
  Download,
  Frame,
  JSHandle,
  Locator,
  Page,
  TestInfo,
} from '@playwright/test';

const cooldown = cooldownFor(process.platform, process.env);

/** Until when the run is paused, in milliseconds since the epoch; 0 when it is not. */
function pausedUntil(): number {
  const file = process.env[COOLDOWN_FILE_ENV];
  if (!cooldown || !file) return 0;
  try {
    return Number(readFileSync(file, 'utf8')) || 0;
  } catch {
    return 0; // no pause was declared yet
  }
}

/** Wait while the run is paused. */
async function waitWhilePaused(): Promise<void> {
  for (let left = pausedUntil() - Date.now(); left > 0; left = pausedUntil() - Date.now()) {
    await new Promise((resolve) => setTimeout(resolve, left));
  }
}

export const test = base.extend<{ cooldown: void }>({
  cooldown: [
    // Playwright reads the fixtures a function asks for from its first parameter: it has to be
    // a destructuring pattern, empty here.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await waitWhilePaused();
      await use();
    },
    // A time of its own: the wait then counts neither against the test's 30 s nor in what the
    // test is said to take (Playwright reports the time spent of the test's own allowance).
    { auto: true, timeout: ((cooldown?.seconds ?? 0) + 60) * 1000 },
  ],
});
