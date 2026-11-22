// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  nativeContradiction,
  nativeSkipped,
  nativeTestFiles,
  skippedNativeBanner,
  skippedNativeReporter,
} from '../nativeGate';

describe('the native gate', () => {
  it('is left out only by MFE_SKIP_NATIVE=1, said in so many words', () => {
    expect(nativeSkipped({})).toBe(false);
    expect(nativeSkipped({ MFE_SKIP_NATIVE: '' })).toBe(false);
    expect(nativeSkipped({ MFE_SKIP_NATIVE: '0' })).toBe(false);
    expect(nativeSkipped({ MFE_SKIP_NATIVE: 'true' })).toBe(false);
    expect(nativeSkipped({ MFE_SKIP_NATIVE: '1' })).toBe(true);
  });

  it('calls a run that skips the native tests and asks for them a contradiction', () => {
    const skip = { MFE_SKIP_NATIVE: '1' };
    expect(nativeContradiction(skip, ['vitest', 'run', '--project', 'native'])).toContain(
      'MFE_SKIP_NATIVE=1 leaves the native tests out',
    );
    expect(nativeContradiction(skip, ['vitest', 'run', '--project=native'])).not.toBeNull();
    expect(nativeContradiction(skip, ['vitest', 'run', '--project', 'unit'])).toBeNull();
    expect(nativeContradiction(skip, ['vitest', 'run', 'src/native'])).toBeNull();
    expect(nativeContradiction({}, ['vitest', 'run', '--project', 'native'])).toBeNull();
  });

  it('finds the native test files of the app', () => {
    const files = nativeTestFiles(new URL('../../', import.meta.url));
    expect(files).toContain('src/engine/__tests__/svg.native.test.ts');
    expect(files.every((file) => /\.native\.test\.tsx?$/.test(file))).toBe(true);
    expect(files).toEqual([...files].sort());
  });

  it('says what was skipped, why, and that the run is not the gate', () => {
    const banner = skippedNativeBanner(['src/a.native.test.ts', 'src/b.native.test.tsx']);
    expect(banner).toContain('NATIVE TESTS SKIPPED ON PURPOSE (MFE_SKIP_NATIVE=1)');
    expect(banner).toContain('2 native test files were not run');
    expect(banner).toContain('src/a.native.test.ts');
    expect(banner).toContain('src/b.native.test.tsx');
    expect(banner).toContain('not the full gate');
    expect(skippedNativeBanner(['src/a.native.test.ts'])).toContain(
      '1 native test file was not run',
    );
    // A frame of its own, so it is not read as one more line of the summary.
    const lines = banner.split('\n');
    expect(lines[0]).toMatch(/^!{20,}$/);
    expect(lines.at(-1)).toBe(lines[0]);
  });

  it('prints the banner when the run starts and again after its summary', () => {
    const log = vi.fn();
    const reporter = skippedNativeReporter(['src/a.native.test.ts'], log);
    reporter.onInit!({} as never);
    expect(log).toHaveBeenCalledTimes(1);
    reporter.onTestRunEnd!([], [], 'passed');
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1]![0]).toContain('NATIVE TESTS SKIPPED ON PURPOSE');
    expect(log.mock.calls[1]![0]).toBe(log.mock.calls[0]![0]);
  });
});

/* The product's configuration and the tests' are two files: a tree of the product without its
 * tests keeps `vite.config.ts` as it is. */
describe('the two configurations', () => {
  const source = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

  it('the product’s knows nothing of Vitest nor of the native gate', () => {
    const product = source('vite.config.ts');
    expect(product).toContain("from 'vite';");
    // Its comment may name the other file; it imports nothing of it and has no `test` key.
    expect(product).not.toMatch(/from '[^']*vitest|nativeGate|\btest:/);
  });

  it('the tests’ is laid over the product’s, and holds the gate', () => {
    const tests = source('vitest.config.ts');
    expect(tests).toContain("import product from './vite.config.ts';");
    expect(tests).toMatch(/mergeConfig\(\s*product,/);
    for (const name of [
      'nativeSkipped()',
      'nativeContradiction()',
      "name: 'unit'",
      "name: 'native'",
    ])
      expect(tests, name).toContain(name);
  });
});
