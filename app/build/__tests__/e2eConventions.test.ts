// @vitest-environment node
/* What the e2e specs have to do for the suite to say the same on a Mac as on Linux and Windows,
 * and to run as a whole the way `build/e2ePlan.ts` plans it. Read from their text, so that it
 * fails on any machine, not only on the one that would trip.
 *
 * The command key. The app takes ⌘ on a Mac where it takes Ctrl elsewhere (`commandForKey` in
 * `src/ui/project/shortcuts.ts`), and a Ctrl+click on a Mac is the secondary click: the browser
 * opens a menu and sends no `click`. A spec that presses `Control` therefore passes on Linux and
 * fails on a Mac; Playwright's `ControlOrMeta` is the key of the machine it runs on.
 *
 * The `test` of the suite. What surrounds every test (the pauses that let a Mac without a fan
 * cool) is set up in `e2e/test.ts`: a spec that took `test` from Playwright itself would run
 * outside of it.
 *
 * The order. The config runs the specs in bands, one project each: every spec has to be in
 * exactly one, or it would run twice, or never.
 *
 * The disk. A spec file is loaded by the runner and by every worker, and only one of them runs a
 * given group: what the file writes while it is loaded (a temporary folder made at the top of the
 * file or straight inside a `test.describe`) is written by all of them and removed by one. Seen
 * on Windows as folders left in TEMP after every run; Linux and macOS left them too. */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { E2E_DIR, readSeconds, specFiles } from '../e2eFiles';
import { specBands, specPattern } from '../e2ePlan';

/** `Control` as a key or a modifier, alone or in a chord: 'Control', "Control+z",
 * 'Shift+Control+z'. `ControlOrMeta` is not it, nor a header such as 'Access-Control-Allow-…'. */
const CONTROL_KEY = /['"`](?:[A-Za-z0-9]+\+)*Control(?=['"`+])/;

/** The one name the Control key itself has in the suite (`e2e/helpers.ts`): a few keys are
 * Control on every system — Distribute is Ctrl+Alt+H, and ⌃⌥H on a Mac —, and a spec that means
 * it says so by that name. */
const CONTROL_ITSELF = /\bexport const CONTROL_ITSELF = 'Control';/;

/** The lines of `source` that press Control, as `line: text`. */
function controlKeys(source: string): string[] {
  return source
    .split('\n')
    .flatMap((line, index) =>
      CONTROL_KEY.test(line) && !CONTROL_ITSELF.test(line) ? [`${index + 1}: ${line.trim()}`] : [],
    );
}

const WRITES = /\b(?:mkdtempSync|mkdirSync|writeFileSync|copyFileSync)\(/;

/** The lines of `source` that write to the disk while the file is being loaded, as `line: text`:
 * at the top of the file or straight inside a `test.describe`, not in a test, a hook or a
 * function. Read from the indentation Prettier gives: the line that opens the block a statement
 * is in is the nearest one above it that starts further left. */
function writesAtLoad(source: string): string[] {
  const lines = source.split('\n');
  const indent = (line: string) => line.length - line.trimStart().length;
  return lines.flatMap((line, index) => {
    if (!WRITES.test(line) || /^\s*(?:\/\/|\*|\/\*)/.test(line)) return [];
    let opener: string | null = null;
    for (let at = index - 1; at >= 0 && opener === null; at--) {
      const above = lines[at]!;
      if (above.trim() && indent(above) < indent(line)) opener = above;
    }
    const atLoad = opener === null || /^\s*test\.describe(?:\.\w+)?\(/.test(opener);
    return atLoad ? [`${index + 1}: ${line.trim()}`] : [];
  });
}

function sources(): { name: string; source: string }[] {
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => ({ name, source: readFileSync(E2E_DIR + name, 'utf8') }));
}

describe('the e2e specs on any platform', () => {
  it('tells a Control key from what only looks like one', () => {
    expect(controlKeys("await page.keyboard.press('Control+z');")).toHaveLength(1);
    expect(controlKeys('await page.keyboard.press("Control+\'");')).toHaveLength(1);
    expect(controlKeys("await page.keyboard.down('Control');")).toHaveLength(1);
    expect(controlKeys("await item.click({ modifiers: ['Shift', 'Control'] });")).toHaveLength(1);
    expect(controlKeys("await page.keyboard.press('Shift+Control+z');")).toHaveLength(1);
    expect(controlKeys('await page.keyboard.press(`Control+${key}`);')).toHaveLength(1);
    expect(controlKeys("await page.keyboard.press('ControlOrMeta+z');")).toEqual([]);
    expect(controlKeys("await item.click({ modifiers: ['ControlOrMeta'] });")).toEqual([]);
    expect(controlKeys("'Access-Control-Allow-Origin': '*',")).toEqual([]);
    expect(controlKeys('// Controls and items keep the selection.')).toEqual([]);
    // The Control key itself has one name, and a press of it is written with that name.
    expect(controlKeys("export const CONTROL_ITSELF = 'Control';")).toEqual([]);
    expect(controlKeys('await page.keyboard.press(`${CONTROL_ITSELF}+Alt+KeyH`);')).toEqual([]);
    expect(controlKeys("const CONTROL_ITSELF = 'Control+Alt';")).toHaveLength(1);
  });

  it('names the Control key itself once, in the helpers', () => {
    const named = sources().filter(({ source }) => CONTROL_ITSELF.test(source));
    expect(named.map(({ name }) => name)).toEqual(['helpers.ts']);
  });

  it('presses the command key of the platform, never Control', () => {
    const found = sources().flatMap(({ name, source }) =>
      controlKeys(source).map((line) => `e2e/${name}:${line}`),
    );
    expect(found, 'press ControlOrMeta: on a Mac the command key is ⌘').toEqual([]);
  });

  it('takes `test` from e2e/test.ts in every spec, never from Playwright itself', () => {
    const fromPlaywright = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]@playwright\/test['"]/;
    const fromSuite = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]\.\/test['"]/;
    const specs = sources().filter(({ name }) => name.endsWith('.spec.ts'));
    expect(specs.length).toBeGreaterThan(50);
    expect(
      specs.filter(({ source }) => fromPlaywright.test(source)).map(({ name }) => name),
      "import { test } from './test'",
    ).toEqual([]);
    expect(
      specs.filter(({ source }) => !fromSuite.test(source)).map(({ name }) => name),
      "import { test } from './test'",
    ).toEqual([]);
  });

  it('tells what a spec writes while it is loaded from what its tests write', () => {
    const atTop = "const directory = mkdtempSync(join(tmpdir(), 'mfe-e2e-'));";
    expect(writesAtLoad(atTop)).toHaveLength(1);
    expect(writesAtLoad(`test.describe('a group', () => {\n  ${atTop}\n});`)).toEqual([
      `2: ${atTop}`,
    ]);
    expect(writesAtLoad(`test.describe.serial('a group', () => {\n  ${atTop}\n});`)).toHaveLength(
      1,
    );
    // In a hook, a test or a function it is written when that runs.
    const inHook = `test.describe('a group', () => {\n  test.beforeAll(() => {\n    ${atTop}\n  });\n});`;
    expect(writesAtLoad(inHook)).toEqual([]);
    expect(writesAtLoad(`test('a test', async () => {\n  ${atTop}\n});`)).toEqual([]);
    expect(writesAtLoad(`function copy(path: string) {\n  writeFileSync(path, '');\n}`)).toEqual(
      [],
    );
    // Naming the functions is not calling them.
    expect(writesAtLoad("import { mkdtempSync, writeFileSync } from 'node:fs';")).toEqual([]);
    expect(writesAtLoad('// mkdtempSync(…) is called by the hook')).toEqual([]);
  });

  it('writes nothing to the disk while a spec is loaded', () => {
    const found = sources().flatMap(({ name, source }) =>
      writesAtLoad(source).map((line) => `e2e/${name}:${line}`),
    );
    expect(found, 'make it in a hook: every process that loads the file would').toEqual([]);
  });

  it('runs every spec in exactly one band of the order', () => {
    const specs = specFiles();
    const patterns = specBands(specs, readSeconds()).map((band) => specPattern(band.specs));
    const counts = specs.map((spec) => {
      const file = E2E_DIR + spec;
      return [spec, patterns.filter((pattern) => pattern.test(file)).length];
    });
    expect(counts.filter(([, count]) => count !== 1)).toEqual([]);
  });

  it('keeps the recorded times as seconds by spec', () => {
    for (const [spec, seconds] of Object.entries(readSeconds())) {
      expect(spec, spec).toMatch(/\.spec\.ts$/);
      expect(seconds, spec).toBeGreaterThan(0);
    }
  });
});
