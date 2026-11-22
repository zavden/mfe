import { defineConfig, type ReporterDescription } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSeconds, specFiles } from './build/e2eFiles';
import { COOLDOWN_FILE_ENV, cooldownFor, specBands, specPattern } from './build/e2ePlan';

// E2E_PORT lets parallel checkouts run their suites side by side without sharing a server.
const PORT = Number(process.env.E2E_PORT ?? 5174);

// The pauses that let a machine without a fan cool (a Mac has them by itself, `build/e2ePlan.ts`).
// The reporter declares them in a file the workers read: its name travels in the environment,
// which the workers inherit, so that it is set once, by the process that starts the run.
const cooldown = cooldownFor(process.platform, process.env);
if (cooldown) process.env[COOLDOWN_FILE_ENV] ??= join(tmpdir(), `mfe-e2e-cooldown-${process.pid}`);

const reporters: ReporterDescription[] = [['list']];
if (cooldown) reporters.push(['./e2e/cooldownReporter.ts']);
// MFE_E2E_RECORD=1 on a run of the whole suite rewrites the times the order comes from.
if (process.env.MFE_E2E_RECORD === '1') reporters.push(['./e2e/durationsReporter.ts']);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: reporters,
  // The slowest specs first (`e2e/durations.json`): the projects run in this order, and the
  // files of a project in alphabetical order. `npx playwright test e2e/x.spec.ts` still runs
  // that spec alone.
  projects: specBands(specFiles(), readSeconds()).map((band) => ({
    name: band.name,
    testMatch: specPattern(band.specs),
  })),
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Use the system Chrome; no browser downloads.
    channel: 'chrome',
    headless: true,
    // The preview is a 2D canvas and the specs read its pixels. Where Chrome draws a canvas on
    // the GPU (a Mac, headless too), reading it moves it to software: the same picture drawn
    // before and after a read is then not the same pixels, and each of the two anti-aliases its
    // own way. Drawn in software, a picture is the same whenever it is read, here as on Linux,
    // where a headless Chrome has no GPU to draw with.
    launchOptions: { args: ['--disable-accelerated-2d-canvas'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
