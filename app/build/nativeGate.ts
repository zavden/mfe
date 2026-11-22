/* The native tests (`*.native.test.ts`: real LaTeX, dvisvgm and Python) are a required part of
 * `npm test`: a machine without those tools fails the gate instead of passing with them skipped
 * (`src/test/requireNativeTools.ts`). `MFE_SKIP_NATIVE=1` is the way out — a machine without TeX,
 * a quick run: the native project is left out on purpose, and the run says so where it cannot be
 * missed, before the tests and again after their summary. Such a run is not the gate. */
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Reporter } from 'vitest/node';

/** The files of the Vitest project `native` (relative to `app/`). */
export const NATIVE_TESTS = 'src/**/*.native.test.{ts,tsx}';

/** Whether this run leaves the native tests out. Only `1` does: a variable left at `0`, or set by
 * accident to anything else, keeps the gate whole. */
export function nativeSkipped(env: Record<string, string | undefined> = process.env): boolean {
  return env.MFE_SKIP_NATIVE === '1';
}

/** A run that asks for the native project (`--project native`, as `npm run test:native` does)
 * while the variable leaves it out contradicts itself: the message to fail with, or null. */
export function nativeContradiction(
  env: Record<string, string | undefined> = process.env,
  argv: readonly string[] = process.argv,
): string | null {
  const asked = argv.some(
    (arg, index) =>
      arg === '--project=native' || (arg === 'native' && argv[index - 1] === '--project'),
  );
  return nativeSkipped(env) && asked
    ? 'MFE_SKIP_NATIVE=1 leaves the native tests out, and this run asks for them ' +
        '(--project native). Unset the variable, or run the unit project.'
    : null;
}

/** The native test files under `root` (the `app/` folder), sorted. */
export function nativeTestFiles(root: URL | string): string[] {
  const cwd = typeof root === 'string' ? root : fileURLToPath(root);
  return globSync(NATIVE_TESTS, { cwd })
    .map((file) => file.replaceAll('\\', '/'))
    .sort();
}

export function skippedNativeBanner(files: readonly string[]): string {
  const rule = '!'.repeat(78);
  const count =
    files.length === 1
      ? '1 native test file was not run'
      : `${files.length} native test files were not run`;
  return [
    rule,
    '  NATIVE TESTS SKIPPED ON PURPOSE (MFE_SKIP_NATIVE=1)',
    `  ${count}:`,
    ...files.map((file) => `    ${file}`),
    '  This run is not the full gate: unset MFE_SKIP_NATIVE to run it.',
    rule,
  ].join('\n');
}

/** A reporter beside Vitest's own: the banner when the run starts and after its summary. */
export function skippedNativeReporter(
  files: readonly string[],
  log: (text: string) => void = (text) => console.log(`\n${text}\n`),
): Reporter {
  const banner = skippedNativeBanner(files);
  return {
    onInit: () => log(banner),
    onTestRunEnd: () => log(banner),
  };
}
