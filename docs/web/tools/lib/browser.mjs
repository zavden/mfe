/* Chrome on the app's dev server, for the tools that capture the app or read data out of it.
 *
 *   await withChrome('capture basics/timeline', async ({ browser }) => {
 *     const { page, errors } = await openApp(browser, { theme: 'light', project: text });
 *     await waitForRenders(page);
 *     …
 *   });
 *
 * `withChrome` takes a slot of the machine (a few heavy runs at a time), waits for a cool CPU,
 * starts the app's dev server on the slot's own port (5191, 5192, 5193…; never 5173) and the system
 * Chrome, and stops all of it at the end — or at once, if the CPU reaches 95 °C. The dev server has `window.__mfe`
 * (`app/src/devtools.ts`), and serves every module of `app/src/` by its path, so a page can
 * also read the app's own data: `page.evaluate(async () => (await import('/src/…')).name)`. */
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { currentSlot, killTree, recordServer, withMachineLock } from './lock.mjs';
import { APP_DIR, DOCS_APP_PORT, importFromApp } from './paths.mjs';
import { waitUntilCool, watchTemperature } from './temperature.mjs';

/** The URL of the dev server of the first slot. */
export const APP_URL = `http://localhost:${DOCS_APP_PORT}/`;

/** The URL of the dev server of the slot this process runs in (the first one outside a run). */
export function currentAppUrl() {
  return `http://localhost:${DOCS_APP_PORT + (currentSlot() ?? 0)}/`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function answers(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** Stops the documentation's dev servers left on `port` — a run killed before it could stop its
 * own. This process holds the slot of that port, so a server there belongs to no run. Only a
 * process that IS such a server is stopped: `node …/vite/bin/vite.js --port <port>
 * --strictPort`, checked by its own command, never a shell or a tool whose command line only
 * mentions those words. Returns whether it found one (never on Windows, which has no `pgrep`). */
export function stopOrphans(port) {
  if (process.platform === 'win32') return false;
  const found = spawnSync('pgrep', ['-f', '--', `--port ${port} --strictPort`], {
    encoding: 'utf8',
  });
  const candidates = (found.stdout ?? '').split(/\s+/).filter(Boolean).map(Number);
  const servers = candidates.filter((pid) => {
    const ps = spawnSync('ps', ['-o', 'comm=', '-o', 'args=', '-p', String(pid)], {
      encoding: 'utf8',
    });
    const [comm = '', ...rest] = (ps.stdout ?? '').trim().split(/\s+/);
    const argv = rest;
    return (
      /^node/.test(comm) &&
      /\/vite\/bin\/vite\.js$/.test(argv[1] ?? '') &&
      argv[2] === '--port' &&
      argv[3] === String(port)
    );
  });
  for (const pid of servers) {
    console.error(`stopping a dev server left on port ${port} by an earlier run (pid ${pid})`);
    try {
      process.kill(-pid, 'SIGTERM'); // its group, as the tools start it (detached)
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
  return servers.length > 0;
}

/** Starts the app's dev server on the port of the slot this process holds; returns the function
 * that stops it. */
async function startDevServer() {
  const url = currentAppUrl();
  const port = new URL(url).port;
  if ((await answers(url)) && stopOrphans(port)) {
    const until = Date.now() + 10_000;
    while ((await answers(url)) && Date.now() < until) await sleep(250);
  }
  if (await answers(url)) {
    throw new Error(`something already serves ${url}: stop it (the tools start their own)`);
  }
  // Vite by its own script, run by this Node: `npx` is `npx.cmd` on Windows.
  const vite = join(APP_DIR, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [vite, '--port', port, '--strictPort'], {
    cwd: APP_DIR,
    detached: true,
    stdio: 'ignore',
  });
  recordServer(child.pid);
  const stop = () => killTree(child.pid);
  const deadline = Date.now() + 90_000;
  while (!(await answers(url))) {
    if (child.exitCode !== null || Date.now() > deadline) {
      stop();
      throw new Error(`the app's dev server did not start at ${url}`);
    }
    await sleep(300);
  }
  return stop;
}

/** Runs `fn({ browser, appUrl })` with the system Chrome and, unless `server` is false, the app's
 * dev server; see the header. */
export async function withChrome(label, fn, { server = true, log = console.error } = {}) {
  return withMachineLock(
    label,
    async () => {
      await waitUntilCool(log);
      let stopServer = () => {};
      let browser = null;
      const watch = watchTemperature((celsius) => {
        log(`CPU at ${celsius} °C: stopping everything now`);
        stopServer();
        // Playwright ends the browsers it launched when the process exits; the lock is released
        // by its own exit handler.
        process.exit(2);
      });
      try {
        if (server) stopServer = await startDevServer();
        const { chromium } = await importFromApp('@playwright/test/index.mjs');
        // Chrome draws its own controls — the value of a number field, a date — in the language
        // of its interface, which on Linux comes from the environment, not from the context's
        // locale: English here, whatever the machine speaks.
        browser = await chromium.launch({
          channel: 'chrome',
          args: ['--lang=en-US'],
          env: { ...process.env, LANGUAGE: 'en_US', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
        });
        return await fn({ browser, appUrl: currentAppUrl() });
      } finally {
        watch.stop();
        if (browser) await browser.close().catch(() => {});
        stopServer();
        const highest = watch.highest();
        if (highest !== null) log(`highest CPU temperature during the run: ${highest} °C`);
      }
    },
    { log },
  );
}

/** Loads a project (the text of a `.mfe.json`) into the app, as File ▸ Open would. */
export async function loadProject(page, text) {
  await page.evaluate((source) => {
    const mfe = window.__mfe;
    const parsed = mfe.parseProject(source);
    if (!parsed.ok) throw new Error(parsed.error);
    mfe.loadProject(parsed.project);
  }, text);
}

/** Waits until no CSS transition runs in the page (the app eases its colours when the theme
 * changes: a capture taken during it mixes the two themes). */
export async function waitForTransitions(page, { timeout = 3_000 } = {}) {
  await page.waitForFunction(
    () => document.getAnimations().every((animation) => !(animation instanceof CSSTransition)),
    null,
    { timeout },
  );
}

/** Puts the app in the 'dark' or 'light' theme through its own toggle in the menu bar, and waits
 * for the colours to settle. */
export async function setTheme(page, theme) {
  for (let i = 0; i < 4; i += 1) {
    const current = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
    if (current === theme) {
      if (i > 0) await waitForTransitions(page);
      return;
    }
    await page.getByTestId('theme-toggle').click();
  }
  throw new Error(`could not switch the app to the ${theme} theme`);
}

/** Opens the app in a context of its own — viewport, pixel ratio, colour scheme and theme, an
 * English locale and UTC —, and a project when given. Returns the page, its context (close it when done) and the page errors seen
 * so far (the array keeps filling). */
export async function openApp(
  browser,
  {
    theme = 'dark',
    viewport = { width: 1440, height: 900 },
    deviceScaleFactor = 1,
    project = null,
    recordVideo,
    url = currentAppUrl(),
  } = {},
) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    colorScheme: theme,
    // The documentation is English: number fields show "11.2", not the machine's "11,2", and
    // times read the same on every machine.
    locale: 'en-US',
    timezoneId: 'UTC',
    ...(recordVideo ? { recordVideo } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__mfe !== undefined);
  if (project !== null) await loadProject(page, project);
  await setTheme(page, theme);
  return { context, page, errors };
}

/** Waits until every formula of the open project has finished rendering, and returns the ones
 * that failed (`[{ id, name, error }]`; a font text fails without the companion). A formula with
 * nothing written yet has nothing to render (its entry stays `idle`): it does not hold the wait. */
export async function waitForRenders(page, { timeout = 60_000 } = {}) {
  await page.waitForFunction(
    () => {
      const mfe = window.__mfe;
      const { project } = mfe.useProjectStore.getState();
      const { entries } = mfe.useRenderStore.getState();
      return project.formulas.every((formula) => {
        const entry = entries[formula.id];
        return entry !== undefined && entry.status !== 'loading';
      });
    },
    null,
    { timeout },
  );
  return page.evaluate(() => {
    const mfe = window.__mfe;
    const { project } = mfe.useProjectStore.getState();
    const { entries } = mfe.useRenderStore.getState();
    return project.formulas
      .filter((formula) => entries[formula.id]?.status === 'error')
      .map((formula) => ({
        id: formula.id,
        name: formula.name,
        error: String(entries[formula.id]?.error?.message ?? entries[formula.id]?.error ?? ''),
      }));
  });
}
