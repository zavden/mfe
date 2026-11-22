import { defineConfig } from '@playwright/test';

// The production build, opened from disk as a user opens it (`npm run dist-check` builds it
// first). No server: `dist/index.html` must work from file://.
export default defineConfig({
  testDir: './build',
  testMatch: 'dist.spec.ts',
  // Its own folder: a run empties its output first, and the traces of the e2e suite that ran
  // just before (`verify.sh`) are what tells why a spec failed.
  outputDir: './test-results/dist',
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    // Use the system Chrome; no browser downloads.
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
});
