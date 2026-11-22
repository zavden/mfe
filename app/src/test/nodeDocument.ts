/* A document for a test that runs in Node — one that reads the examples from disk, which the
 * jsdom environment cannot (`model/__tests__/fixtures.ts`) — and still needs elements: jsdom's own,
 * made by hand. */
// @ts-expect-error jsdom ships no types, and the app has none of its own for it
import { JSDOM } from 'jsdom';

interface Dom {
  window: Window & typeof globalThis;
}

/** An empty page, with its window. */
export function nodeDocument(html = '<!doctype html><body></body>'): Document {
  const dom = new (JSDOM as new (html: string, options?: object) => Dom)(html, {
    pretendToBeVisual: true,
  });
  return dom.window.document;
}

/** A page whose own scripts run, as a browser runs them: its window, once it has loaded. What the
 * page says to its console goes to `said`. */
export async function nodePage(
  html: string,
): Promise<{ window: Window & typeof globalThis; said: string[] }> {
  const said: string[] = [];
  const dom = new (JSDOM as new (html: string, options?: object) => Dom)(html, {
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    beforeParse(window: Window & typeof globalThis) {
      for (const level of ['error', 'warn'] as const) {
        window.console[level] = (...args: unknown[]) => said.push(`${level}: ${args.join(' ')}`);
      }
    },
  });
  const { window } = dom;
  if (window.document.readyState !== 'complete') {
    await new Promise<void>((resolve) => window.addEventListener('load', () => resolve()));
  }
  return { window, said };
}
