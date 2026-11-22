/* How the unit tests run (Vitest), apart from the product's configuration (`vite.config.ts`: the
 * development server and the build), which this one is laid over — the tests see the app through
 * the same plugins. The build itself knows nothing of Vitest. `npm run export-check` has a
 * configuration of its own (`vitest.export.config.ts`). */
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import {
  NATIVE_TESTS,
  nativeContradiction,
  nativeSkipped,
  nativeTestFiles,
  skippedNativeReporter,
} from './build/nativeGate.ts';
import product from './vite.config.ts';

const skipNative = nativeSkipped();
const contradiction = nativeContradiction();
if (contradiction) throw new Error(contradiction);

export default mergeConfig(
  product,
  defineConfig({
    test: {
      isolate: true,
      // The native project is required unless MFE_SKIP_NATIVE=1 leaves it out on purpose; the
      // run then says so before and after its summary (build/nativeGate.ts).
      ...(skipNative
        ? {
            reporters: [
              'default',
              skippedNativeReporter(nativeTestFiles(new URL('.', import.meta.url))),
            ],
          }
        : {}),
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'jsdom',
            include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
            exclude: [...configDefaults.exclude, NATIVE_TESTS],
            setupFiles: ['./src/test/setup.ts'],
          },
        },
        ...(skipNative
          ? []
          : [
              {
                extends: true as const,
                test: {
                  name: 'native',
                  environment: 'jsdom' as const,
                  include: [NATIVE_TESTS],
                  setupFiles: ['./src/test/setupDom.ts'],
                  globalSetup: ['./src/test/requireNativeTools.ts'],
                  fileParallelism: false,
                  sequence: { groupOrder: 1 },
                },
              },
            ]),
      ],
    },
  }),
);
