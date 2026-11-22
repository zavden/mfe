/* A real companion for the specs that need one. It listens on a free port; the app always looks
 * at 127.0.0.1:7799, so the page's requests are routed there. */
import type { Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { companionTemp, stopCompanion } from '../build/harnessCompanion';
import { findManimPython, pythonCommand } from '../build/python';

export const COMPANION_URL = 'http://127.0.0.1:7799';
// A path of the system, not the path of a URL: on Windows that one is `/C:/…`, with `%20` for
// a space, and no program opens it.
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const COMPANION_SCRIPT = path.join(REPO, 'companion', 'mfe_companion.py');

/** The interpreter of the ManimCE the export check uses (`MFE_CE_PYTHON`, else the virtualenv
 * next to the repository), or null on a machine without it. */
export function manimCePython(): string | null {
  const found = process.env.MFE_CE_PYTHON ?? findManimPython(REPO, 'manim_ce');
  return existsSync(found) ? found : null;
}

export interface RunningCompanion {
  process: ChildProcess;
  port: number;
  /** Ends it with what it started and removes its temporary folder. */
  stop(): Promise<void>;
}

/** Start `mfe_companion.py serve` with `args` and wait until it listens. Its temporary files go
 * into a folder of its own, which `stop()` removes: ended by a harness, a companion cannot clean
 * up after itself on Windows (`build/harnessCompanion.ts`). */
export async function startCompanion(args: string[] = []): Promise<RunningCompanion> {
  const temp = companionTemp();
  const process = spawn(
    pythonCommand(),
    [COMPANION_SCRIPT, 'serve', '--port', '0', '--no-disk-cache', '--no-sandbox', ...args],
    { stdio: ['ignore', 'ignore', 'pipe'], env: temp.env },
  );
  const listening = new Promise<number>((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('the companion did not start')), 20_000);
    // No Python under that name: the test fails saying so, not the worker with an uncaught error.
    process.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`the companion did not start: ${error.message}`));
    });
    process.stderr!.on('data', (chunk: Buffer) => {
      text += chunk.toString();
      const found = /127\.0\.0\.1:(\d+)/.exec(text);
      if (found) {
        clearTimeout(timer);
        resolve(Number(found[1]));
      }
    });
  });
  let port: number;
  try {
    port = await listening;
  } catch (error) {
    await stopCompanion(process, temp); // nothing is left of a companion that did not start
    throw error;
  }
  return { process, port, stop: () => stopCompanion(process, temp) };
}

/** The app of `page` finds `companion` where it looks for one. */
export async function routeToCompanion(page: Page, companion: RunningCompanion): Promise<void> {
  await page.route(`${COMPANION_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({
        url: `http://127.0.0.1:${companion.port}${url.pathname}${url.search}`,
      }),
    });
  });
}
