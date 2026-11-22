/* Vitest config for the export validation suite in tests/export (npm run export-check). It lives
 * outside app/, so the dev server must be allowed to read the repository root. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    dir: '..',
    include: ['tests/export/**/*.check.ts'],
    testTimeout: 15 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
