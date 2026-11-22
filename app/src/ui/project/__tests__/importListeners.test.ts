// @vitest-environment node
/* A module that registers a listener when it is imported gives nothing a way to stop it: it runs
 * in every test that imports the module, and a hot reload leaves the old one behind. Listeners
 * belong to the services the layout starts (useAppServices.ts) and to effects, which end. This
 * reads the sources for the plain cases: a statement at the top of a module starts in the first
 * column. One inside a top-level block, or behind a function the module calls, passes unseen. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
/** `store.subscribe(…)`, alone, kept in a variable or exported; a call of an `on…` registration
 * (`onProjectLoaded`); a listener on the window or the document. */
const REGISTRATION =
  /^(?:export default |(?:export )?(?:const|let|var) \w+(?:: .+?)? = )?(?:[\w.]+\.subscribe\(|on[A-Z]\w*\(|(?:window|document|globalThis)\.addEventListener\()/;

function registrations(source: string): string[] {
  return source.split('\n').filter((line) => REGISTRATION.test(line));
}

describe('listeners registered by importing a module', () => {
  it('knows one when it sees it', () => {
    expect(
      registrations(
        [
          'useProjectStore.subscribe(syncPath);',
          'useProjectStore.temporal.subscribe(follow);',
          'onProjectLoaded(() => close());',
          'const off = useUiStore.subscribe(follow);',
          'export const stop: () => void = useRenderStore.subscribe(follow);',
          'export default useUiStore.subscribe(follow);',
          "window.addEventListener('pagehide', flush);",
          "globalThis.addEventListener('online', retry);",
          'export function startTracking(): () => void {',
          '  return useProjectStore.subscribe(follow);',
          '}',
          'onward(3);',
        ].join('\n'),
      ),
    ).toHaveLength(8);
  });

  it('there are none in the app', () => {
    const found: string[] = [];
    for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
      const path = join(entry.parentPath, entry.name);
      const file = relative(SRC, path).replaceAll('\\', '/');
      if (!entry.isFile() || !/\.tsx?$/.test(file)) continue;
      if (/(^|\/)(__tests__|test|data)\//.test(file) || /\.test\.tsx?$/.test(file)) continue;
      for (const line of registrations(readFileSync(path, 'utf8'))) found.push(`${file}: ${line}`);
    }
    expect(found).toEqual([]);
  });
});
