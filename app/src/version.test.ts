// @vitest-environment node
/* The app's version is written in `package.json` and, twice, in the lockfile that npm keeps beside
 * it; the app reads the first. A bump that forgot one of them is caught here. */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { APP_VERSION } from './version';

const json = (path: string) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as {
    version: string;
    packages?: Record<string, { version: string }>;
  };

it('is the version of package.json, which the lockfile repeats', () => {
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(json('package.json').version).toBe(APP_VERSION);
  const lock = json('package-lock.json');
  expect(lock.version).toBe(APP_VERSION);
  expect(lock.packages?.['']?.version).toBe(APP_VERSION);
});
