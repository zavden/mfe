/* The exported page in the specs: Export ▸ HTML of the project the app has open, written to a
 * folder of the test and opened from disk, as its reader opens it. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page, TestInfo } from '@playwright/test';
import { expect } from './test';
import type { MfeWindow } from './helpers';

export interface DeckFile {
  path: string;
  text: string;
}

/** The files Export ▸ HTML writes of the project the app has open, once every formula of it is
 * rendered. The packer is the app's own module, asked of the dev server as the app loads it. */
export async function packOpenProject(page: Page): Promise<DeckFile[]> {
  await page.waitForFunction(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const { project } = mfe.useProjectStore.getState();
    const { resolved } = mfe.useRenderStore.getState();
    return project.formulas.every(
      (formula) => formula.source.trim() === '' || resolved.has(formula.id),
    );
  });
  return page.evaluate(async () => {
    const mfe = (window as MfeWindow).__mfe!;
    // Not literals: the type checker has no module to find at an address of the dev server.
    const modules = ['/src/export/html/packDeck.ts', '/src/export/html/runtimeAssets.ts'];
    const { packDeck } = (await import(/* @vite-ignore */ modules[0]!)) as {
      packDeck: (project: unknown, resolved: unknown, assets: unknown) => DeckFile[];
    };
    const { RUNTIME_ASSETS } = (await import(/* @vite-ignore */ modules[1]!)) as {
      RUNTIME_ASSETS: unknown;
    };
    return packDeck(
      mfe.useProjectStore.getState().project,
      mfe.useRenderStore.getState().resolved,
      RUNTIME_ASSETS,
    );
  });
}

/** Writes files into a folder of the test's own and gives the folder. */
export function writeDeck(testInfo: TestInfo, files: readonly DeckFile[], folder = 'deck'): string {
  const root = testInfo.outputPath(folder);
  for (const file of files) {
    const target = join(root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
  }
  return root;
}

/** The address of a file of an exported folder, opened from disk. */
export function deckAddress(root: string, file = 'index.html', search = ''): string {
  return pathToFileURL(join(root, file)).href + search;
}

/** What the page's console and its errors said, from now on: an exported page says nothing when
 * all is well. */
export function watchPage(page: Page): string[] {
  const said: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      said.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => said.push(`pageerror: ${error.message}`));
  return said;
}

/** Exports the project the app has open and opens the exported page from disk, in `page`. Waits
 * until its deck is mounted; gives the folder. */
export async function openExportedDeck(
  page: Page,
  testInfo: TestInfo,
  search = '',
): Promise<string> {
  const root = writeDeck(testInfo, await packOpenProject(page));
  await page.goto(deckAddress(root, 'index.html', search));
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(1);
  return root;
}

/** What a spec reads and calls of a deck of the exported page (`app/src/deck/deck.ts`). */
export interface PageDeck {
  time: number;
  duration: number;
  playing: boolean;
  slide: number;
  slides: number;
  speed: number;
  through: boolean;
  muted: boolean;
  hasSound: boolean;
  pauses: { time: number; note: string; resume: number }[];
  atPause: number | null;
  comments: { time: number; text: string }[];
  problems: { severity: string; file: string; where: string; message: string }[];
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(time: number): void;
  on(
    event: 'time' | 'play' | 'pause' | 'slide' | 'end' | 'change',
    listener: () => void,
  ): () => void;
  box(
    ref: string,
    time?: number,
  ): { x: number; y: number; width: number; height: number; cx: number; cy: number } | null;
}

/** Runs `body` in the exported page with its deck (the first one, or the one at `index`) and
 * gives what it returns. `body` is sent as its text: it reads nothing of the spec around it. */
export function onDeck<T>(page: Page, body: (deck: PageDeck) => T, index = 0): Promise<T> {
  return page.evaluate(`(${body.toString()})(window.MFE.decks[${index}])`) as Promise<T>;
}
