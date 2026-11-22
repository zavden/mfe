/* A page of an exported folder in jsdom, for a test that runs in Node (the examples are read from
 * disk): its HTML, then its scripts run in the page in their order, as a browser opening the folder
 * from disk runs them — `mfe-runtime.js`, the scene's files, `custom.js` — and then the page's
 * `DOMContentLoaded` and `load`, at which the runtime mounts its decks. What the page says in its
 * console and what it throws is kept, to be read by the test. */
// @ts-expect-error jsdom ships no types, and the app has none of its own for it
import { JSDOM, VirtualConsole } from 'jsdom';
import type { MfeRuntime } from '../deck/index';

interface Dom {
  window: Window & typeof globalThis;
}

interface Console {
  on(event: string, listener: (...args: unknown[]) => void): Console;
}

export interface FolderPage {
  window: Window & typeof globalThis;
  document: Document;
  /** `window.MFE`, once `mfe-runtime.js` has run in the page. */
  readonly mfe: MfeRuntime;
  /** What the page logged as an error or a warning, and what it threw, in order. */
  errors: string[];
  warnings: string[];
}

/** The page `html` with `scripts` run in it in order (texts), once it has loaded. A script that
 * throws is said in `errors`, and the next ones run, as in a browser. `search` is the page's
 * address after its path (`?start=1.5`), which the scene's own page reads. */
export async function folderPage(
  html: string,
  scripts: readonly string[],
  search = '',
): Promise<FolderPage> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const virtualConsole = (new VirtualConsole() as Console)
    .on('error', (...args) => errors.push(args.map(String).join(' ')))
    .on('warn', (...args) => warnings.push(args.map(String).join(' ')))
    .on('jsdomError', (error) => errors.push(String((error as Error).stack ?? error)));
  const dom = new (JSDOM as new (html: string, options?: object) => Dom)(html, {
    url: `file:///folder/index.html${search}`,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
    virtualConsole,
  });
  const { window } = dom;
  const loaded = new Promise<void>((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });
  for (const script of scripts) {
    try {
      window.eval(script);
    } catch (error) {
      errors.push(String((error as Error).stack ?? error));
    }
  }
  await loaded;
  return {
    window,
    document: window.document,
    get mfe() {
      return (window as unknown as { MFE: MfeRuntime }).MFE;
    },
    errors,
    warnings,
  };
}
