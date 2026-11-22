/* The files the e2e plan is made from (`e2ePlan.ts` has the rules): the specs of `e2e/` and the
 * times recorded for them. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SpecSeconds } from './e2ePlan';

/** `e2e/`, with its last separator. */
export const E2E_DIR = fileURLToPath(new URL('../e2e/', import.meta.url));
const SECONDS_FILE = fileURLToPath(new URL('../e2e/durations.json', import.meta.url));

/** A path with the separators the plan uses, on any system. */
export const slashed = (path: string): string => path.split('\\').join('/');

/** The specs of the suite, by their path inside `e2e/`. */
export function specFiles(): string[] {
  return readdirSync(E2E_DIR, { recursive: true, encoding: 'utf8' })
    .map(slashed)
    .filter((path) => path.endsWith('.spec.ts'))
    .sort();
}

/** The recorded times; none when the file is not there or cannot be read. */
export function readSeconds(): SpecSeconds {
  try {
    return JSON.parse(readFileSync(SECONDS_FILE, 'utf8')) as SpecSeconds;
  } catch {
    return {};
  }
}

/** Written as Prettier would leave it: the file is kept in the repository. */
export function writeSeconds(seconds: SpecSeconds): void {
  writeFileSync(SECONDS_FILE, `${JSON.stringify(seconds, null, 2)}\n`);
}
