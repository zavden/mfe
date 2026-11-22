#!/usr/bin/env node
/* The check of the project's page, docs/index.html: the page that docs/ opens at when it is served
 * (GitHub Pages from the folder docs/, or Netlify, netlify.toml) and that links into this
 * documentation. It borrows the documentation's components through site.js in its bare mode.
 *
 *   node docs/web/tools/check-landing.mjs                  the whole check
 *   node docs/web/tools/check-landing.mjs --shots <dir>    and a screenshot of each theme and width
 *   node docs/web/tools/check-landing.mjs --shots <dir> --full    whole pages
 *   node docs/web/tools/check-landing.mjs --static         the file alone, without Chrome
 *
 * First the file (a second, no browser): every relative href and src names a file of the
 * repository, and every #anchor of a page of the documentation an id of that page; everything the
 * page loads (scripts, stylesheets, images) is relative: nothing comes from the network; every
 * example a player, widget or Python block names has its data script in the head.
 * Then Chrome through withChrome (the machine lock and the CPU guard of tools/lib; no server): the
 * page opened from disk, dark and light, at 1280×800 and 375×740. It fails on a console error, a
 * page error, a file that does not load, site.js not done, a theme that is not the one the system
 * asked for, a page wider than the window, the documentation's own header or sidebar on it (the
 * bare mode did not hold), and a component that did not mount (players, widgets, the Python tabs,
 * the exported page). Once per run, the header's theme button switches the theme.
 * The exit code is 1 when anything failed. */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withChrome } from './lib/browser.mjs';
import { REPO, importFromApp } from './lib/paths.mjs';

const PAGE = 'docs/index.html';
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 375, height: 740 },
];
const THEMES = ['dark', 'light'];

function parseArgs(argv) {
  const options = { shots: null, full: false, browser: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--shots') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error('--shots needs a folder');
      options.shots = resolve(next);
      i += 1;
    } else if (arg === '--full') options.full = true;
    else if (arg === '--static') options.browser = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown option ${arg}`);
  }
  return options;
}

const isExternal = (value) => /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//');

/** The file a relative reference of the page names, from the repository's root; null for a
 * reference to another site, to the page itself (#…) or a data: address. */
function resolveLocal(reference) {
  const value = (reference || '').trim();
  if (!value || value.startsWith('#') || isExternal(value)) return null;
  const [pathPart] = value.split(/[?#]/);
  let decoded = pathPart;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    // keep it as written
  }
  return posix.normalize(posix.join(posix.dirname(PAGE), decoded));
}

const idsCache = new Map();
function idsOf(rel, JSDOM) {
  if (!idsCache.has(rel)) {
    const dom = new JSDOM(readFileSync(join(REPO, ...rel.split('/')), 'utf8'));
    idsCache.set(rel, new Set(Array.from(dom.window.document.querySelectorAll('[id]'), (n) => n.id)));
  }
  return idsCache.get(rel);
}

/** The checks of the file itself: a list of problems. */
async function checkFile() {
  const { JSDOM } = await importFromApp('jsdom/lib/api.js');
  const problems = [];
  const source = readFileSync(join(REPO, PAGE), 'utf8');
  const document = new JSDOM(source).window.document;
  const ownIds = new Set(Array.from(document.querySelectorAll('[id]'), (n) => n.id));

  // Loaded: relative, and there.
  const loaded = [
    ...Array.from(document.querySelectorAll('script[src]'), (n) => n.getAttribute('src')),
    ...Array.from(document.querySelectorAll('link[rel~="stylesheet"]'), (n) =>
      n.getAttribute('href'),
    ),
    ...Array.from(document.querySelectorAll('img[src], video[src], source[src]'), (n) =>
      n.getAttribute('src'),
    ),
    ...Array.from(document.querySelectorAll('video[poster]'), (n) => n.getAttribute('poster')),
  ];
  for (const value of loaded) {
    if (isExternal(value) && !value.startsWith('data:')) {
      problems.push(`the page loads a file from the network: ${value}`);
    }
  }
  const scripts = new Set(
    Array.from(document.querySelectorAll('script[src]'), (n) => resolveLocal(n.getAttribute('src'))),
  );

  // Every relative reference names a file, and an #anchor an id of it.
  const references = [
    ...Array.from(document.querySelectorAll('[href]'), (n) => n.getAttribute('href')),
    ...loaded,
  ];
  for (const value of references) {
    const hash = value.includes('#') ? value.slice(value.indexOf('#') + 1) : '';
    if (value.startsWith('#')) {
      if (hash && !ownIds.has(hash)) problems.push(`no id "${hash}" on the page: ${value}`);
      continue;
    }
    const rel = resolveLocal(value);
    if (!rel) continue;
    if (rel.startsWith('..') || !existsSync(join(REPO, ...rel.split('/')))) {
      problems.push(`no such file: ${value}`);
      continue;
    }
    if (hash && rel.endsWith('.html') && !idsOf(rel, JSDOM).has(hash)) {
      problems.push(`no id "${hash}" in ${rel}: ${value}`);
    }
  }

  // The data of every example a component names is loaded by the head.
  const named = [
    ...Array.from(document.querySelectorAll('[data-mfe-player]'), (n) =>
      n.getAttribute('data-mfe-player'),
    ),
    ...Array.from(document.querySelectorAll('[data-mfe-python]'), (n) =>
      n.getAttribute('data-mfe-python'),
    ),
  ];
  for (const node of document.querySelectorAll('[data-mfe-widget]')) {
    const name = node.getAttribute('data-mfe-widget');
    if (!scripts.has(`docs/web/widgets/${name}.js`)) {
      problems.push(`the widget "${name}" has no script in the head (web/widgets/${name}.js)`);
    }
    try {
      const options = JSON.parse(node.getAttribute('data-options') || '{}');
      if (options.example) named.push(options.example);
    } catch (error) {
      problems.push(`the options of the widget "${name}" are not JSON: ${error.message}`);
    }
  }
  for (const slug of new Set(named)) {
    if (!scripts.has(`docs/web/examples/${slug}.data.js`)) {
      problems.push(`the example "${slug}" has no data script in the head (web/examples/${slug}.data.js)`);
    }
  }
  if (!document.body.hasAttribute('data-docs-bare')) {
    problems.push('<body> has no data-docs-bare: site.js would put the documentation around it');
  }
  return problems;
}

/** What the page shows once site.js is done: read inside the page. */
function inspectPage() {
  const out = {};
  out.ready = document.documentElement.hasAttribute('data-docs-ready');
  out.theme = document.documentElement.getAttribute('data-theme');
  out.docsChrome = Boolean(
    document.querySelector('.site-header, .site-sidebar, .site-footer, .breadcrumbs'),
  );
  out.width = document.documentElement.clientWidth;
  out.scrollWidth = document.documentElement.scrollWidth;
  out.offenders = [];
  if (out.scrollWidth > out.width + 1) {
    for (const node of document.body.querySelectorAll('*')) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.right <= out.width + 1) continue;
      let parent = node.parentElement;
      let contained = false;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (
          /(auto|scroll|hidden|clip)/.test(style.overflowX) &&
          parent.getBoundingClientRect().right <= out.width + 1
        ) {
          contained = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!contained) {
        const cls = typeof node.className === 'string' ? node.className.trim() : '';
        out.offenders.push(
          `<${node.tagName.toLowerCase()}${cls ? `.${cls.split(/\s+/).join('.')}` : ''}> reaches ${Math.round(box.right)}px`,
        );
      }
      if (out.offenders.length >= 4) break;
    }
  }
  out.components = Array.from(
    document.querySelectorAll('[data-mfe-player], [data-mfe-widget], [data-mfe-python], .mfe-deck'),
    (node) => {
      if (node.matches('.mfe-deck')) {
        const problems = node.querySelector('.mfe-problems');
        return {
          name: `exported page ${node.getAttribute('data-scene')}`,
          ok: node.hasAttribute('data-mfe-state') && !problems,
          notice: problems ? problems.textContent.trim().replace(/\s+/g, ' ') : null,
        };
      }
      const kind = node.matches('[data-mfe-player]')
        ? 'player'
        : node.matches('[data-mfe-widget]')
          ? 'widget'
          : 'python';
      const name =
        node.getAttribute('data-mfe-player') ||
        node.getAttribute('data-mfe-widget') ||
        node.getAttribute('data-mfe-python');
      const error = node.getAttribute('data-mfe-error');
      const missing = node.getAttribute('data-state') === 'missing';
      return {
        name: `${kind} ${name}`,
        ok: node.hasAttribute('data-mfe-mounted') && !error && !missing,
        notice: error || (missing ? node.textContent.trim().slice(0, 160) : null),
      };
    },
  );
  return out;
}

async function checkInChrome(options) {
  const problems = [];
  const url = pathToFileURL(join(REPO, PAGE)).href;
  if (options.shots) mkdirSync(options.shots, { recursive: true });
  await withChrome(
    'landing check',
    async ({ browser }) => {
      for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
          const where = `${theme} ${viewport.width}`;
          const context = await browser.newContext({
            viewport,
            colorScheme: theme,
            deviceScaleFactor: 1,
          });
          const tab = await context.newPage();
          tab.on('console', (message) => {
            if (message.type() === 'error') problems.push(`[${where}] console error: ${message.text()}`);
          });
          tab.on('pageerror', (error) => problems.push(`[${where}] page error: ${error.message}`));
          tab.on('requestfailed', (request) => {
            const failed = request.url();
            const short = failed.startsWith('file://')
              ? failed.slice(pathToFileURL(REPO).href.length)
              : failed;
            problems.push(`[${where}] did not load: ${short}`);
          });
          await tab.goto(url, { waitUntil: 'load' });
          await tab
            .waitForFunction(() => document.documentElement.hasAttribute('data-docs-ready'), null, {
              timeout: 8_000,
            })
            .catch(() => {});
          // The players and widgets mount at once, the exported page once its runtime has read
          // its scene: a moment for it.
          await tab
            .waitForFunction(
              () => {
                const deck = document.querySelector('.mfe-deck');
                return !deck || deck.hasAttribute('data-mfe-state');
              },
              null,
              { timeout: 8_000 },
            )
            .catch(() => {});
          const state = await tab.evaluate(inspectPage);
          if (!state.ready) problems.push(`[${where}] site.js did not finish (no data-docs-ready)`);
          if (state.theme !== theme) {
            problems.push(`[${where}] the theme is "${state.theme}", the system asked for ${theme}`);
          }
          if (state.docsChrome) {
            problems.push(`[${where}] the documentation's header, sidebar or footer is on the page`);
          }
          if (state.scrollWidth > state.width + 1) {
            problems.push(
              `[${where}] the page is ${state.scrollWidth}px wide in a ${state.width}px window: ${state.offenders.join('; ') || 'nothing found'}`,
            );
          }
          for (const component of state.components) {
            if (!component.ok) {
              problems.push(
                `[${where}] ${component.name} did not mount${component.notice ? `: ${component.notice}` : ''}`,
              );
            }
          }
          if (options.shots) {
            if (options.full) {
              // Every player and widget is seen once, as a reader scrolling down sees it.
              const height = await tab.evaluate(() => document.documentElement.scrollHeight);
              for (let y = 0; y < height; y += viewport.height / 2) {
                await tab.evaluate((top) => window.scrollTo(0, top), y);
                await tab.waitForTimeout(120);
              }
              await tab.evaluate(() => window.scrollTo(0, 0));
              await tab.waitForTimeout(400);
            }
            await tab.screenshot({
              path: join(options.shots, `landing-${theme}-${viewport.width}.png`),
              fullPage: options.full,
            });
          }
          if (theme === 'dark' && viewport.width === 1280) {
            // The header's theme button: dark → light, and back.
            await tab.click('[data-lp-theme]');
            const after = await tab.evaluate(() => document.documentElement.getAttribute('data-theme'));
            if (after !== 'light') problems.push(`[${where}] the theme button left the theme ${after}`);
            await tab.click('[data-lp-theme]');
          }
          await context.close();
        }
      }
    },
    { server: false },
  );
  return problems;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (options.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
    return;
  }
  const problems = await checkFile();
  console.log(`${PAGE}: the file ${problems.length ? 'has problems' : 'is fine'}`);
  if (options.browser && !problems.length) {
    problems.push(...(await checkInChrome(options)));
    console.log(
      `${PAGE}: ${THEMES.length * VIEWPORTS.length} views in Chrome ${problems.length ? 'with problems' : 'are fine'}`,
    );
  }
  for (const problem of problems) console.log(`  ${problem}`);
  if (options.shots) console.log(`screenshots in ${options.shots}`);
  process.exitCode = problems.length ? 1 : 0;
}

await main();
