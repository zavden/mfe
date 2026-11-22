#!/usr/bin/env node
/* The browser check of the web documentation: every page opened from disk (file://, as a reader
 * opens it), in both themes, at a desktop width and a phone width.
 *
 *   node docs/web/tools/check.mjs                         every page
 *   node docs/web/tools/check.mjs --page basics/timeline  one page (repeat it, or a comma list)
 *   node docs/web/tools/check.mjs --shots <dir>           and a screenshot of each page and theme
 *   node docs/web/tools/check.mjs --shots <dir> --full    whole pages, not just the first screen
 *   --theme dark|light   --viewport 1280|375   only those      --no-build   skip the build
 *
 * It runs tools/build.mjs first (which writes assets/nav.js and assets/search-index.js): the
 * build's errors of the pages checked fail the check, and their warnings are shown. With --page,
 * the build's problems of the other pages and of the site are one line that fails nothing (another
 * author's draft does not fail your check); a run of every page fails on all of them. Then
 * Chrome through withChrome (the machine lock and the CPU guard of tools/lib; no dev server). On
 * every page, at 1280×800 and 375×740, dark and light, it fails on:
 *   - a console error, a page error, a file that does not load, an image that does not decode;
 *   - an image drawn stretched (its picture has another shape than its width and height) or
 *     larger than its picture (blurred);
 *   - a page wider than the window (horizontal scroll), naming what sticks out;
 *   - site.js not done (no data-docs-ready), the header, sidebar or footer missing, a theme on
 *     <html> that is not the one the system asked for;
 *   - a component that did not mount: tours, Python tabs, example cards, players, widgets and
 *     clips carry data-mfe-mounted once mounted; a notice (data-mfe-error, or a player's
 *     data-state="missing") is a failure, with its message. An exported page embedded in a page
 *     (`.mfe-deck`, tools/build-deck.mjs) is mounted when its runtime has written data-mfe-state
 *     on it; the panel of what is wrong with its scene (`.mfe-problems`) is a failure too.
 * It warns, failing nothing, of a player with data-autoplay whose stage is empty at the instant
 * it starts from (its data-start, or the start of its part): that instant is what the page shows
 * before it plays, and all a reader who asked for reduced motion sees.
 * Once per run it also checks that the theme toggle works (and is remembered, and that "System"
 * forgets it), that the search finds a word and opens the page, and that keys follow the system.
 * The exit code is 1 when anything failed. */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withChrome } from './lib/browser.mjs';
import { WEB_DIR } from './lib/paths.mjs';
import { build } from './build.mjs';

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 375, height: 740 },
];
const THEMES = ['dark', 'light'];

function parseArgs(argv) {
  const options = {
    pages: [],
    shots: null,
    full: false,
    build: true,
    themes: THEMES,
    viewports: VIEWPORTS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return next;
    };
    if (arg === '--page') options.pages.push(...value().split(','));
    else if (arg === '--shots') options.shots = resolve(value());
    else if (arg === '--full') options.full = true;
    else if (arg === '--no-build') options.build = false;
    else if (arg === '--theme') options.themes = [value()].filter((t) => THEMES.includes(t));
    else if (arg === '--viewport') {
      const width = Number(value());
      options.viewports = VIEWPORTS.filter((v) => v.width === width);
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown option ${arg}`);
  }
  options.pages = options.pages.map((id) => id.trim().replace(/\.html$/, '')).filter(Boolean);
  return options;
}

/** What a page shows once site.js is done: read inside the page. */
function inspectPage() {
  const describe = (node) => {
    const id = node.id ? `#${node.id}` : '';
    const cls =
      typeof node.className === 'string' && node.className.trim()
        ? `.${node.className.trim().split(/\s+/).join('.')}`
        : '';
    return `<${node.tagName.toLowerCase()}${id}${cls}>`;
  };
  const out = {};
  out.ready = document.documentElement.hasAttribute('data-docs-ready');
  out.theme = document.documentElement.getAttribute('data-theme');
  out.chrome = {
    header: !!document.querySelector('.site-header'),
    sidebar: !!document.querySelector('.site-sidebar'),
    footer: !!document.querySelector('.site-footer'),
  };
  const width = document.documentElement.clientWidth;
  out.width = width;
  out.scrollWidth = document.documentElement.scrollWidth;
  out.offenders = [];
  if (out.scrollWidth > width + 1) {
    for (const node of document.body.querySelectorAll('*')) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.right <= width + 1) continue;
      // Inside something that scrolls or clips on its own, it does not widen the page.
      let parent = node.parentElement;
      let contained = false;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (
          /(auto|scroll|hidden|clip)/.test(style.overflowX) &&
          parent.getBoundingClientRect().right <= width + 1
        ) {
          contained = true;
          break;
        }
        if (style.position === 'fixed') {
          contained = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!contained && getComputedStyle(node).position !== 'fixed') {
        out.offenders.push(`${describe(node)} reaches ${Math.round(box.right)}px`);
      }
      if (out.offenders.length >= 4) break;
    }
  }
  out.brokenImages = Array.from(document.images)
    .filter((img) => img.getAttribute('src') && img.complete && img.naturalWidth === 0)
    .map((img) => img.getAttribute('src'));
  // An image whose picture has another shape than the width and height the page gives it is
  // drawn stretched; one whose picture is smaller is drawn blurred.
  out.misfits = [];
  for (const img of document.images) {
    const width = Number(img.getAttribute('width'));
    const height = Number(img.getAttribute('height'));
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!(width > 0 && height > 0 && nw > 0 && nh > 0)) continue;
    const src = (img.currentSrc || img.src).split('/').slice(-3).join('/');
    if (Math.abs(nw * height - nh * width) / (nh * width) > 0.02) {
      out.misfits.push(
        `an image is drawn stretched: ${src} is ${nw}×${nh}, the page gives it ${width}×${height}`,
      );
    } else if (nw < width * 0.95) {
      out.misfits.push(
        `an image is drawn larger than its picture (blurred): ${src} is ${nw}×${nh}, the page gives it ${width}×${height}`,
      );
    }
  }
  const components = document.querySelectorAll(
    '.mfe-tour, [data-mfe-tour], [data-mfe-python], [data-mfe-example], [data-mfe-player], [data-mfe-widget], video.mfe-clip, .mfe-deck',
  );
  out.components = Array.from(components).map((node) => {
    // An exported page (its own runtime, not the site's): mounted once it says how it stands.
    if (node.matches('.mfe-deck')) {
      const problems = node.querySelector('.mfe-problems');
      return {
        kind: 'exported page',
        name: node.getAttribute('data-scene') || '',
        ok: node.hasAttribute('data-mfe-state') && !problems,
        notice: problems
          ? Array.from(problems.querySelectorAll('.mfe-problems-title, li'), (part) =>
              part.textContent.trim().replace(/\s+/g, ' '),
            ).join(' ')
          : null,
      };
    }
    const name =
      node.getAttribute('data-mfe-tour') ||
      node.getAttribute('data-mfe-python') ||
      node.getAttribute('data-mfe-example') ||
      node.getAttribute('data-mfe-player') ||
      node.getAttribute('data-mfe-widget') ||
      node.getAttribute('src') ||
      '';
    const kind = node.matches('[data-mfe-tour]')
      ? 'tour'
      : node.matches('[data-mfe-python]')
        ? 'python'
        : node.matches('[data-mfe-example]')
          ? 'example'
          : node.matches('[data-mfe-player]')
            ? 'player'
            : node.matches('[data-mfe-widget]')
              ? 'widget'
              : 'clip';
    const mounted = node.hasAttribute('data-mfe-mounted');
    const missing = node.getAttribute('data-state') === 'missing';
    const error = node.getAttribute('data-mfe-error');
    const noticeNode = node.querySelector('.mfe-notice, [class*="notice"]');
    const notice = error || (missing && noticeNode ? noticeNode.textContent.trim() : null);
    // A showcase may name an example on purpose without its data: its notice is what it shows.
    if (node.getAttribute('data-expect') === 'missing') {
      return { kind, name, ok: missing || Boolean(error), notice: 'expected a missing example' };
    }
    return { kind, name, ok: mounted && !missing && !error, notice };
  });
  // A player that plays by itself shows the instant it starts from before it plays, and nothing
  // else to a reader who asked for reduced motion: one whose stage is empty there (nothing drawn
  // at a tenth of its opacity or more) is reported.
  out.emptyStarts = [];
  document.querySelectorAll('[data-mfe-player]').forEach((node, index) => {
    const player = node.mfePlayer;
    if (!player || !player.options.autoplay) return;
    const { start, end } = player.range;
    const given = player.options.start;
    const at =
      given === 'end' ? end : given === null ? start : Math.min(Math.max(given, start), end);
    const drawn = (t) =>
      player.scene
        .evaluate(t)
        .some(
          (d) =>
            d.path.contours.some((c) => c.length >= 4) &&
            ((d.fill && d.fill.opacity >= 0.1) ||
              (d.stroke && d.stroke.opacity >= 0.1 && d.stroke.width > 0)),
        );
    if (!drawn(at)) {
      out.emptyStarts.push({ name: node.getAttribute('data-mfe-player'), index: index + 1, at });
    }
  });
  return out;
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
    console.log(
      'usage: node docs/web/tools/check.mjs [--page <id>] [--shots <dir> [--full]] [--theme dark|light] [--viewport 1280|375] [--no-build]',
    );
    return;
  }
  const started = Date.now();
  const result = await build({ write: options.build });
  let ids = Array.from(result.pages.keys()).sort((a, b) =>
    a === 'index' ? -1 : b === 'index' ? 1 : a.localeCompare(b),
  );
  if (options.pages.length) {
    const unknown = options.pages.filter((id) => !result.pages.has(id));
    if (unknown.length) {
      console.error(`no such page: ${unknown.join(', ')}`);
      process.exit(2);
    }
    ids = ids.filter((id) => options.pages.includes(id));
  }
  if (options.shots) mkdirSync(options.shots, { recursive: true });
  const fileUrl = (id, query = '') => pathToFileURL(join(WEB_DIR, `${id}.html`)).href + query;

  /** problem text → { page, where: Set } */
  const problems = new Map();
  const fail = (page, where, message) => {
    const key = `${page}\u0000${message}`;
    if (!problems.has(key)) problems.set(key, { page, message, where: new Set() });
    problems.get(key).where.add(where);
  };
  /** What a page should look at and fails nothing: `  <page>: <message>`, once each. */
  const warnings = new Set();

  // The build's word on the pages checked: their errors fail the check, their warnings are
  // shown. With --page, what belongs to other pages (another author's draft) and to the site as a
  // whole is one line and fails nothing; a run of every page reports and fails on all of it.
  const buildWarnings = [];
  const elsewhere = { errors: 0, warnings: 0, pages: new Set() };
  for (const [id, page] of result.pages) {
    const checked = ids.includes(id);
    for (const problem of page.problems) {
      if (checked) {
        if (problem.level === 'error') fail(id, 'build', problem.message);
        else buildWarnings.push(`  ${id}: ${problem.message}`);
      } else if (problem.level === 'error') {
        elsewhere.errors += 1;
        elsewhere.pages.add(id);
      } else elsewhere.warnings += 1;
    }
  }
  for (const problem of result.siteProblems) {
    if (!options.pages.length) {
      if (problem.level === 'error') fail('(site)', 'build', problem.message);
      else buildWarnings.push(`  (site): ${problem.message}`);
    } else if (problem.level === 'error') {
      elsewhere.errors += 1;
      elsewhere.pages.add('(site)');
    } else elsewhere.warnings += 1;
  }

  await withChrome(
    'docs check',
    async ({ browser }) => {
      for (const theme of options.themes) {
        for (const viewport of options.viewports) {
          const where = `${theme} ${viewport.width}`;
          const context = await browser.newContext({
            viewport,
            colorScheme: theme,
            deviceScaleFactor: 1,
          });
          const tab = await context.newPage();
          let events = [];
          tab.on('console', (message) => {
            if (message.type() === 'error') events.push(`console error: ${message.text()}`);
          });
          tab.on('pageerror', (error) => events.push(`page error: ${error.message}`));
          tab.on('requestfailed', (request) => {
            const url = request.url();
            const short = url.startsWith('file://')
              ? url.slice(pathToFileURL(WEB_DIR).href.length + 1)
              : url;
            events.push(`did not load: ${short} (${request.failure()?.errorText ?? 'failed'})`);
          });
          for (const id of ids) {
            events = [];
            await tab.goto(fileUrl(id), { waitUntil: 'load' });
            await tab
              .waitForFunction(
                () => document.documentElement.hasAttribute('data-docs-ready'),
                null,
                { timeout: 8_000 },
              )
              .catch(() => {});
            // Lazy images load now, so that a missing one is seen. Then every image is decoded,
            // as it is once a reader scrolls to it: an image with decoding="async" (a tour's) that
            // is still undecoded off screen is painted blank in a whole-page screenshot. And the
            // CSS transitions end (a tour's image fades in from 0.55 when it has loaded).
            await tab.evaluate(async () => {
              const images = Array.from(document.images);
              for (const img of images) if (img.loading === 'lazy') img.loading = 'eager';
              await Promise.all(
                images.map((img) =>
                  img.complete
                    ? null
                    : new Promise((done) => {
                        img.addEventListener('load', done, { once: true });
                        img.addEventListener('error', done, { once: true });
                        setTimeout(done, 3_000);
                      }),
                ),
              );
              const timeout = new Promise((done) => setTimeout(done, 3_000));
              await Promise.race([
                timeout,
                Promise.all(
                  images
                    .filter((img) => img.complete && img.naturalWidth > 0)
                    .map((img) => img.decode().catch(() => {})),
                ),
              ]);
              const transitions = () =>
                document.getAnimations().filter((animation) => animation instanceof CSSTransition);
              await Promise.race([
                timeout,
                Promise.all(transitions().map((animation) => animation.finished.catch(() => {}))),
              ]);
            });
            await tab.waitForTimeout(120);
            const state = await tab.evaluate(inspectPage);
            if (!state.ready)
              fail(id, where, 'site.js did not finish (no data-docs-ready on <html>)');
            if (state.theme !== theme)
              fail(id, where, `the theme is “${state.theme}”, the system asked for “${theme}”`);
            for (const [part, present] of Object.entries(state.chrome)) {
              if (!present) fail(id, where, `no ${part}`);
            }
            if (state.scrollWidth > state.width + 1) {
              fail(
                id,
                where,
                `the page is ${state.scrollWidth}px wide in a ${state.width}px window: ${state.offenders.join('; ') || 'nothing found'}`,
              );
            }
            for (const src of state.brokenImages)
              fail(id, where, `an image does not decode: ${src}`);
            for (const message of state.misfits) fail(id, where, message);
            for (const component of state.components) {
              if (!component.ok) {
                fail(
                  id,
                  where,
                  `the ${component.kind} “${component.name}” did not mount${component.notice ? `: ${component.notice}` : ''}`,
                );
              }
            }
            for (const empty of state.emptyStarts) {
              warnings.add(
                `  ${id}: the player “${empty.name}” (#${empty.index} of the page) plays by itself ` +
                  `from an empty stage at ${empty.at.toFixed(2)} s: give it a data-start where it ` +
                  'shows what it is about',
              );
            }
            for (const event of new Set(events)) fail(id, where, event);
            if (options.shots) {
              const name = `${id.replace(/\//g, '__')}.${theme}.${viewport.width}.png`;
              await tab.screenshot({ path: join(options.shots, name), fullPage: options.full });
            }
          }
          await context.close();
        }
      }

      // Once: the theme toggle, the search, the keys.
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        colorScheme: 'dark',
      });
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      const probe = ids.includes('start/overview') ? 'start/overview' : ids[0];
      await tab.goto(fileUrl(probe), { waitUntil: 'load' });
      await tab.waitForFunction(
        () => document.documentElement.hasAttribute('data-docs-ready'),
        null,
        { timeout: 8_000 },
      );
      const themeOf = () => tab.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const heard = tab.evaluate(
        () =>
          new Promise((done) => {
            document.addEventListener('mfe-docs:theme', (event) => done(event.detail.theme), {
              once: true,
            });
            setTimeout(() => done(null), 3_000);
          }),
      );
      await tab.click('[data-testid="docs-theme-toggle"]');
      if ((await themeOf()) !== 'light')
        fail(probe, 'toggle', 'the theme toggle did not switch to light');
      if ((await heard) !== 'light')
        fail(probe, 'toggle', 'no mfe-docs:theme event with the new theme');
      await tab.reload({ waitUntil: 'load' });
      await tab.waitForFunction(() => document.documentElement.hasAttribute('data-docs-ready'));
      if ((await themeOf()) !== 'light')
        fail(probe, 'toggle', 'the chosen theme was not remembered after a reload');
      const system = tab.locator('.footer-theme [data-value="system"]');
      if (await system.count()) {
        await system.click();
        if ((await themeOf()) !== 'dark')
          fail(probe, 'toggle', '“System” did not give the system’s theme back');
      } else fail(probe, 'toggle', 'no System choice in the footer');

      await tab.keyboard.press('/');
      const dialog = tab.locator('.search-dialog[open]');
      try {
        await dialog.waitFor({ timeout: 3_000 });
        await tab.keyboard.type('timeline');
        await tab.waitForTimeout(150);
        const found = await tab.locator('.search-result').count();
        if (!found) fail(probe, 'search', 'the search found nothing for “timeline”');
        else {
          const before = tab.url();
          await tab.keyboard.press('Enter');
          await tab.waitForURL((url) => url.href !== before, { timeout: 5_000 }).catch(() => {});
          if (tab.url() === before) fail(probe, 'search', 'Enter on a result did not open it');
        }
      } catch {
        fail(probe, 'search', 'the / key did not open the search');
      }

      const keyed = ids.find((id) => id === 'authoring/components');
      if (keyed) {
        for (const [system, expected] of [
          ['mac', '⌘'],
          ['windows', 'Ctrl'],
        ]) {
          await tab.goto(fileUrl(keyed, `?platform=${system}`), { waitUntil: 'load' });
          await tab.waitForFunction(() => document.documentElement.hasAttribute('data-docs-ready'));
          const text = await tab.evaluate(
            () => document.querySelector('kbd[data-keys*="Mod"]')?.textContent ?? '',
          );
          if (!text.includes(expected))
            fail(keyed, `keys ${system}`, `Mod is written “${text}” on ${system}`);
          // A Mac's modifiers in the order of its menus, the keys that are others there, and the
          // words for one system alone.
          const written = await tab.evaluate(() => ({
            redo: document.querySelector('kbd[data-keys="Mod+Shift+Z"]')?.textContent ?? '',
            saveAs: document.querySelector('kbd[data-keys-mac]')?.textContent ?? '',
            shown: ['.only-mac', '.not-mac'].map((selector) => {
              const node = document.querySelector(selector);
              return node ? getComputedStyle(node).display !== 'none' : null;
            }),
          }));
          const wanted =
            system === 'mac'
              ? { redo: '⇧⌘Z', saveAs: '⇧⌘S', shown: [true, false] }
              : { redo: 'Ctrl+Shift+Z', saveAs: 'Ctrl+Alt+S', shown: [false, true] };
          if (JSON.stringify(written) !== JSON.stringify(wanted))
            fail(
              keyed,
              `keys ${system}`,
              `on ${system} the page writes ${JSON.stringify(written)}, not ${JSON.stringify(wanted)}`,
            );
        }
      }
      for (const message of errors) fail(probe, 'once', `page error: ${message}`);
      await context.close();
    },
    { server: false },
  );

  const byPage = new Map();
  for (const problem of problems.values()) {
    if (!byPage.has(problem.page)) byPage.set(problem.page, []);
    byPage.get(problem.page).push(problem);
  }
  for (const [page, list] of byPage) {
    console.log(`  ${page}`);
    for (const problem of list)
      console.log(`    [${Array.from(problem.where).join(', ')}] ${problem.message}`);
  }
  if (buildWarnings.length) {
    console.log(
      `build warnings (they fail nothing; --strict of build.mjs makes them errors):\n${buildWarnings.join('\n')}`,
    );
  }
  if (warnings.size) {
    console.log(`warnings (they fail nothing):\n${Array.from(warnings).join('\n')}`);
  }
  if (elsewhere.errors || elsewhere.warnings) {
    const names = Array.from(elsewhere.pages);
    const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ', …' : '');
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    console.log(
      `not checked here: the build reports ${plural(elsewhere.errors, 'error')}` +
        (names.length ? ` (${shown})` : '') +
        ` and ${plural(elsewhere.warnings, 'warning')} on other pages and the site; they fail nothing in this run (node docs/web/tools/build.mjs lists them)`,
    );
  }
  const runs = ids.length * options.themes.length * options.viewports.length;
  console.log(
    `docs/web check: ${ids.length} page${ids.length === 1 ? '' : 's'} × ${options.themes.length} theme${options.themes.length === 1 ? '' : 's'} × ${options.viewports.length} width${options.viewports.length === 1 ? '' : 's'} (${runs} views), ` +
      `${problems.size} problem${problems.size === 1 ? '' : 's'} on ${byPage.size} page${byPage.size === 1 ? '' : 's'}` +
      (warnings.size ? `, ${warnings.size} warning${warnings.size === 1 ? '' : 's'}` : '') +
      ` · ${((Date.now() - started) / 1000).toFixed(1)} s` +
      (options.shots ? ` · screenshots in ${options.shots}` : ''),
  );
  if (problems.size) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
