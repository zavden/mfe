/* Vitest config for the engine parity checks in tests/parity/*.parity.ts (npm run parity).
 * They live outside app/, so the dev server must be allowed to read the repository root. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    dir: '..',
    include: ['tests/parity/**/*.parity.ts'],
    testTimeout: 600_000,
    hookTimeout: 60_000,
  },
});
