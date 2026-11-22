#!/usr/bin/env node
/* Screenshots of the running app in each theme and viewport, through the system Chrome.
 *
 *   node .claude/skills/mfe-change/shot.mjs [options]
 *
 *   --project <file>   project to load (.mfe.json); default: the app's start state
 *   --size <WxH>       viewport, repeatable or comma-separated (default 1440x900)
 *   --theme <list>     themes to capture, comma-separated: dark, light (default dark,light)
 *   --target <testid>  capture only the element with this data-testid (default: the viewport)
 *   --steps <file>     ES module whose default export `async (page, { theme, width, height })`
 *                      runs after loading, before each capture (select, open a dialog, hover…)
 *   --wait <ms>        settle time before capturing (default 800)
 *   --out <dir>        output directory (default: <tmp>/mfe-shots)
 *   --name <prefix>    file name prefix (default: shot)
 *   --url <url>        app URL (default http://localhost:5199/). When nothing answers there, a Vite
 *                      dev server is started on that port and stopped at the end.
 *
 * Prints one line per file: <out>/<name>-<theme>-<W>x<H>.png. Page errors go to stderr and make
 * the exit code 1. */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const APP_DIR = fileURLToPath(new URL('../../../app/', import.meta.url));

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    size: { type: 'string', multiple: true },
    theme: { type: 'string', default: 'dark,light' },
    target: { type: 'string' },
    steps: { type: 'string' },
    wait: { type: 'string', default: '800' },
    out: { type: 'string', default: join(tmpdir(), 'mfe-shots') },
    name: { type: 'string', default: 'shot' },
    url: { type: 'string', default: 'http://localhost:5199/' },
  },
});

const sizes = (values.size ?? ['1440x900'])
  .flatMap((s) => s.split(','))
  .map((s) => {
    const match = /^(\d+)x(\d+)$/.exec(s.trim());
    if (!match) throw new Error(`--size wants WxH, got "${s}"`);
    return { width: Number(match[1]), height: Number(match[2]) };
  });
const themes = values.theme.split(',').map((t) => t.trim());
for (const theme of themes) {
  if (theme !== 'dark' && theme !== 'light') throw new Error(`unknown theme "${theme}"`);
}
const project = values.project ? readFileSync(resolve(values.project), 'utf8') : null;
const steps = values.steps
  ? (await import(pathToFileURL(resolve(values.steps)).href)).default
  : null;
const outDir = resolve(values.out);
mkdirSync(outDir, { recursive: true });

async function answers(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** Starts Vite on the URL's port unless something already serves it; returns a stop function. */
async function ensureServer(url) {
  if (await answers(url)) return () => {};
  const port = new URL(url).port || '80';
  // Vite by its own script, run by this Node: `npx` is `npx.cmd` on Windows, which nothing
  // starts without a shell.
  const vite = join(APP_DIR, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [vite, '--port', port, '--strictPort'], {
    cwd: APP_DIR,
    detached: true,
    stdio: 'ignore',
  });
  // The whole of it: its process group, or on Windows, which has none to signal, its tree.
  const stop = () => {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  const deadline = Date.now() + 60_000;
  while (!(await answers(url))) {
    if (child.exitCode !== null || Date.now() > deadline) {
      stop();
      throw new Error(`no dev server at ${url}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return stop;
}

const { chromium } = await import(
  pathToFileURL(join(APP_DIR, 'node_modules/@playwright/test/index.mjs')).href
);
const stopServer = await ensureServer(values.url);
const browser = await chromium.launch({ channel: 'chrome' });
let pageErrors = 0;
try {
  for (const { width, height } of sizes) {
    for (const theme of themes) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on('pageerror', (error) => {
        pageErrors += 1;
        console.error(`pageerror (${theme} ${width}x${height}): ${error.message}`);
      });
      await page.goto(values.url);
      await page.waitForFunction(() => window.__mfe !== undefined);
      if (project !== null) {
        await page.evaluate((text) => {
          const mfe = window.__mfe;
          const parsed = mfe.parseProject(text);
          if (!parsed.ok) throw new Error(parsed.error);
          mfe.loadProject(parsed.project);
        }, project);
      }
      const current = await page.evaluate(() => document.documentElement.dataset.theme ?? 'dark');
      if (current !== theme) await page.getByTestId('theme-toggle').click();
      if (steps) await steps(page, { theme, width, height });
      await page.waitForTimeout(Number(values.wait));
      const file = join(outDir, `${values.name}-${theme}-${width}x${height}.png`);
      if (values.target) await page.getByTestId(values.target).screenshot({ path: file });
      else await page.screenshot({ path: file });
      console.log(file);
      await page.close();
    }
  }
} finally {
  await browser.close();
  stopServer();
}
process.exitCode = pageErrors > 0 ? 1 : 0;
