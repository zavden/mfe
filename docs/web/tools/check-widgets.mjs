#!/usr/bin/env node
/* The check of the widgets of the documentation: `authoring/widgets.html` opened from disk (as a
 * reader opens it), in both themes, at a desktop width and a phone's, and every widget on it
 * driven as a reader would drive it — glyphs linked and the transformation played, the window of a
 * relation dragged, a rate function's library switched, the end of a line put elsewhere, the
 * styles played, a palette chosen and a glyph's role read —, and a page of the system's temporary
 * folder whose head has only the widgets' scripts: they load the player, their examples' data and
 * their stylesheet themselves.
 *
 *   node docs/web/tools/check-widgets.mjs                 both themes, both widths
 *   node docs/web/tools/check-widgets.mjs --shots <dir>   and a screenshot of each widget
 *   --theme dark|light   --viewport 1280|375               only those
 *
 * It runs tools/build-widgets.mjs --check first (the scripts are what their sources make), then
 * Chrome through withChrome (the machine lock and the CPU guard; no dev server), as a reader whose
 * language writes decimals with a comma (the widgets write them with a period, as the app does).
 * It fails on a console error or a page error, a widget that did not mount (or one that should
 * show a notice and does not), a page wider than the window, a canvas without ink, and every step
 * below that does not do what it should. The exit code is 1 when anything failed.
 * widgets/README.md is the guide. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChrome } from './lib/browser.mjs';
import { WEB_DIR } from './lib/paths.mjs';

const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 375, height: 740 },
];
const THEMES = ['dark', 'light'];
const PAGE = pathToFileURL(join(WEB_DIR, 'authoring', 'widgets.html')).href;

function parseArgs(argv) {
  const options = { shots: null, themes: THEMES, viewports: VIEWPORTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return next;
    };
    if (arg === '--shots') options.shots = resolve(value());
    else if (arg === '--theme') options.themes = [value()].filter((t) => THEMES.includes(t));
    else if (arg === '--viewport') {
      const width = Number(value());
      options.viewports = VIEWPORTS.filter((v) => v.width === width);
    } else throw new Error(`unknown option ${arg}`);
  }
  return options;
}

/** How many pixels of a canvas are not its background (the scene's ink), read in the page. */
async function inkOf(locator) {
  return locator.evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const [r, g, b] = [data[0], data[1], data[2]];
    let ink = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) > 60) ink++;
    }
    return ink;
  });
}

const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/** The steps of each widget, by its place on the page. Each returns nothing, or throws what is
 * wrong. `w` is the widget's element, `card` its card. */
const STEPS = {
  async 'link-glyphs'(page, w, { index, shot }) {
    const card = w.locator('.mfe-w');
    const pairs = async () => Number(await card.getAttribute('data-pairs'));
    const glyph = (side, i) => card.locator(`.rg-glyph[data-side="${side}"][data-index="${i}"]`);
    if (index === 0) {
      // The example's own pairs, then one more: the parentheses' ( onto the 6 joins 3 → 6.
      if ((await pairs()) !== 7) throw new Error(`starts with ${await pairs()} pairs, not 7`);
      await glyph('from', 1).click();
      await glyph('to', 3).click();
      if ((await pairs()) !== 7) throw new Error('a joining link made a new pair');
      const message = await card.locator('.mfe-w-message').textContent();
      if (!/joined pair/.test(message)) throw new Error(`no “joined pair” message: “${message}”`);
      // The preview: the canvas has ink, and Play moves the time.
      await card.locator('.segmented-option[data-value="preview"]').click();
      if ((await card.getAttribute('data-view')) !== 'preview') throw new Error('no preview');
      const canvas = card.locator('.mfe-w-preview canvas');
      await page.waitForTimeout(150);
      if ((await inkOf(canvas)) < 20) throw new Error('the preview draws nothing');
      await shot('preview');
      const before = Number(await card.getAttribute('data-time'));
      if ((await card.getAttribute('data-playing')) !== 'true') {
        await card.locator('.mfe-player-play').click();
      }
      await page.waitForTimeout(400);
      const after = Number(await card.getAttribute('data-time'));
      if (near(before, after)) throw new Error('Play does not move the time');
      await card.locator('.mfe-player-play').click();
      await card.locator('.segmented-option[data-value="link"]').click();
      await card.locator('[data-action="reset"]').click();
      if ((await pairs()) !== 7) throw new Error('Reset does not bring the pairs back');
      return;
    }
    if (index === 1) {
      if ((await pairs()) !== 0) throw new Error('“start: empty” starts with pairs');
      // A click on each side links at once.
      await glyph('from', 2).click();
      await glyph('to', 1).click();
      if ((await pairs()) !== 1) throw new Error('a click on x and on x did not link them');
      // Suggest links by label, accepted.
      await card.locator('[data-action="suggest"]').click();
      await card.locator('[data-action="accept"]').click();
      if ((await pairs()) < 4) throw new Error(`Accept all left ${await pairs()} pairs`);
      // 2 and 3 onto the 6: the 2 is consumed by its own pair, and the editor says so.
      await glyph('from', 0).click({ modifiers: ['Shift'] });
      await glyph('from', 4).click({ modifiers: ['Shift'] });
      await glyph('to', 3).click({ modifiers: ['Shift'] });
      await card.locator('[data-action="link"]').click();
      const error = card.locator('.mfe-w-message.is-error');
      if ((await error.count()) === 0) throw new Error('a refused link shows no error');
      // Delete the link with the keys: the selected x and Delete.
      await glyph('from', 2).click();
      await glyph('from', 2).press('Delete');
      if (
        await card
          .locator('.rg-glyph[data-side="from"][data-index="2"][data-linked="true"]')
          .count()
      ) {
        throw new Error('Delete did not unlink the x');
      }
      return;
    }
    // The widget whose options it cannot read shows its notice.
    if (!(await w.getAttribute('data-mfe-error'))) throw new Error('no notice for a wrong option');
  },

  async 'relation-window'(page, w, { shot }) {
    const card = w.locator('.mfe-w');
    const offset = async () => Number(await card.getAttribute('data-offset'));
    const duration = async () => Number(await card.getAttribute('data-duration'));
    const o0 = await offset();
    const d0 = await duration();
    // Drag the window's body to the right: it moves (on the 0.05 s grid), its length stays.
    const body = card.locator('.mfe-w-handle.is-move');
    const box = await body.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    const o1 = await offset();
    if (!(o1 > o0)) throw new Error(`dragging the window did not move it (${o0} → ${o1})`);
    if (!near(await duration(), d0)) throw new Error('moving the window changed its length');
    // Drag its end far to the right: it stops where the clips leave no more room.
    const end = card.locator('.mfe-w-handle.is-end');
    const e = await end.boundingBox();
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
    await page.mouse.down();
    await page.mouse.move(e.x + 900, e.y + e.height / 2, { steps: 6 });
    await page.mouse.up();
    const windowEnd = (await offset()) + (await duration());
    // The target clip starts at 1.5 s; the source ends at 5 s: the window ends by then.
    if (!(windowEnd + 1.5 <= 5 + 1e-6)) throw new Error(`the window ends at ${windowEnd + 1.5} s`);
    if (!((await duration()) > d0)) throw new Error('dragging the end did not lengthen the window');
    await shot('dragged');
    // The keys: the start edge, two steps to the left.
    const before = await offset();
    await card.locator('.mfe-w-handle.is-start').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    if (!near(await offset(), before - 0.1, 1e-3)) {
      throw new Error(`← on the start edge: offset ${before} → ${await offset()}`);
    }
    if ((await inkOf(card.locator('canvas'))) < 20) throw new Error('the scene draws nothing');
    const readout = await card.locator('.mfe-w-summary').textContent();
    if (!/^Window \d+\.\d\d → \d+\.\d\d s/.test(readout)) {
      throw new Error(`the window reads “${readout}”: seconds are written with a period`);
    }
    // A finger on the timeline, as the browser sends it: a swipe up or down, which the browser
    // takes for the page (it cancels the pointer), seeks nothing; a tap seeks where it lands, as
    // a press of the mouse there does.
    if ((await card.getAttribute('data-playing')) === 'true') {
      await card.locator('.mfe-player-play').click();
    }
    const strip = card.locator('.mfe-w-strip');
    const sb = await strip.boundingBox();
    const press = (kind, steps) =>
      strip.evaluate(
        (node, { kind, steps }) => {
          // A pointer made up here is no pointer of the browser's, which it cannot capture.
          node.setPointerCapture = () => {};
          for (const [type, x, y] of steps) {
            node.dispatchEvent(
              new PointerEvent(type, {
                pointerId: kind === 'touch' ? 9 : 1,
                pointerType: kind,
                isPrimary: true,
                clientX: x,
                clientY: y,
                button: type === 'pointermove' ? -1 : 0,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
          delete node.setPointerCapture;
        },
        { kind, steps },
      );
    const time = async () => Number(await card.getAttribute('data-time'));
    const [xA, xB, y] = [sb.x + sb.width * 0.3, sb.x + sb.width * 0.8, sb.y + 10];
    const t0 = await time();
    await press('touch', [
      ['pointerdown', xA, y],
      ['pointermove', xA + 2, y + 40],
      ['pointercancel', 0, 0],
    ]);
    if (!near(await time(), t0)) {
      throw new Error(`a swipe on the timeline moved the time: ${t0} → ${await time()} s`);
    }
    await press('touch', [
      ['pointerdown', xA, y],
      ['pointerup', xA + 1, y + 1],
    ]);
    const tapped = await time();
    await press('mouse', [
      ['pointerdown', xB, y],
      ['pointerup', xB, y],
    ]);
    const other = await time();
    await press('mouse', [
      ['pointerdown', xA + 1, y],
      ['pointerup', xA + 1, y],
    ]);
    if (near(other, tapped) || !near(await time(), tapped, 1e-3)) {
      throw new Error(
        `a tap on the timeline went to ${tapped} s, a press there to ${await time()} s`,
      );
    }
    await card.locator('[data-action="reset"]').click();
  },

  async 'rate-functions'(page, w, { index }) {
    const card = w.locator('.mfe-w');
    const cards = await card.locator('.mfe-w-rate').count();
    if (index === 0 && cards !== 8) throw new Error(`${cards} rate functions, not the app's 8`);
    if (index === 1 && cards !== 3) throw new Error(`${cards} rate functions, not the 3 asked`);
    const smooth = card.locator('.mfe-w-rate[data-rate="smooth"] .mfe-w-curve-line');
    const before = await smooth.getAttribute('d');
    const other = index === 0 ? 'gl' : 'ce';
    await card.locator(`.segmented-option[data-value="${other}"]`).click();
    if ((await card.getAttribute('data-target')) !== other) throw new Error('no library switch');
    if ((await smooth.getAttribute('d')) === before) throw new Error('smooth is the same curve');
    // A click on a curve shows that moment: the middle of linear is half the way.
    const linear = card.locator('.mfe-w-rate[data-rate="linear"]');
    const chart = linear.locator('.mfe-w-curve');
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const value = Number(await linear.getAttribute('data-value'));
    if (!near(value, 0.5, 0.03)) throw new Error(`linear at the middle is ${value}`);
  },

  async 'line-anchors'(page, w, { shot }) {
    const card = w.locator('.mfe-w');
    const vector = async () => card.getAttribute('data-vector');
    const v0 = await vector();
    await card.locator('.mfe-w-compass-cell[data-side="start"][data-anchor="dr"]').click();
    if ((await card.getAttribute('data-start')) !== 'dr')
      throw new Error('the compass did not move the start');
    const v1 = await vector();
    if (v1 === v0) throw new Error('the line did not move');
    // A dot of the scene: the top edge of the end's formula.
    await card.locator('.mfe-w-stage').scrollIntoViewIfNeeded();
    await card
      .locator('.mfe-w-anchor-hit[data-side="end"][data-anchor="up"]')
      .click({ force: true });
    if ((await card.getAttribute('data-end')) !== 'up')
      throw new Error('a dot did not move the end');
    await card.locator('.mfe-w-compass-auto[data-side="end"]').click();
    if ((await card.getAttribute('data-end')) !== 'auto') throw new Error('Auto did not take');
    if ((await card.locator('.mfe-w-auto-mark').count()) !== 1) throw new Error('no mark for Auto');
    await shot('moved');
    if ((await inkOf(card.locator('canvas'))) < 20) throw new Error('the scene draws nothing');
    await card.locator('[data-action="reset"]').click();
    if ((await vector()) !== v0) throw new Error('Reset did not put the line back');
  },

  async 'style-compare'(page, w, { index }) {
    const card = w.locator('.mfe-w');
    const panels = card.locator('.mfe-w-panel');
    // The styles (all four, by default), then the three extras of a pair.
    const expected = index === 0 ? 4 : 3;
    if ((await panels.count()) !== expected) {
      throw new Error(`${await panels.count()} panels, not ${expected}`);
    }
    if ((await card.getAttribute('data-playing')) !== 'true') {
      await card.locator('.mfe-player-play').click();
    }
    // Into the window: every panel draws.
    const scrub = card.locator('.mfe-player-scrub');
    const box = await scrub.boundingBox();
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height / 2);
    for (let i = 0; i < expected; i++) {
      if ((await inkOf(panels.nth(i).locator('canvas'))) < 20) {
        throw new Error(`panel ${i + 1} draws nothing (${index === 0 ? 'styles' : 'extras'})`);
      }
    }
    if (index !== 0) return;
    // The time bar takes ↑ and ↓ as a slider does (a frame forward, a frame back), and keeps them
    // from the page, which would scroll.
    if ((await card.getAttribute('data-playing')) === 'true') {
      await card.locator('.mfe-player-play').click();
    }
    await scrub.focus();
    const time = async () => Number(await card.getAttribute('data-time'));
    const scrolled = () => page.evaluate(() => window.scrollY);
    const top = await scrolled();
    const times = [];
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowUp']) {
      await page.keyboard.press(key);
      times.push(await time());
    }
    if (!(times[1] < times[0] && near(times[2], times[0], 1e-3))) {
      throw new Error(`↑ ↓ ↑ on the time bar: ${times.join(' → ')} s`);
    }
    if ((await scrolled()) !== top) throw new Error('↑ and ↓ on the time bar scrolled the page');
  },

  async 'palette-roles'(page, w, { shot }) {
    const card = w.locator('.mfe-w');
    await card.locator('.mfe-w-palette[data-palette="ink-and-paper"]').click();
    if ((await card.getAttribute('data-palette')) !== 'ink-and-paper')
      throw new Error('no palette switch');
    const stage = card.locator('.mfe-w-stage');
    const tone = await stage.getAttribute('data-scene');
    if (tone !== 'light') throw new Error(`a light palette's scene reads as ${tone}`);
    // The keys read the role of each glyph.
    await stage.focus();
    await page.keyboard.press('ArrowRight');
    const tip = card.locator('.mfe-w-tip');
    if (!(await tip.isVisible())) throw new Error('the arrow keys pick no glyph');
    const text = await tip.textContent();
    if (
      !/^(formula|variable|constant|operator|result|text|muted|rectangle|circle|arrow) · #/.test(
        text,
      )
    ) {
      throw new Error(`the role of a glyph reads “${text}”`);
    }
    if ((await inkOf(card.locator('canvas'))) < 20) throw new Error('the scene draws nothing');
    await shot('ink-and-paper');
    await card.locator('.mfe-w-palette[data-palette="editor"]').click();
  },
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const built = spawnSync(
    process.execPath,
    [join(fileURLToPath(new URL('.', import.meta.url)), 'build-widgets.mjs'), '--check'],
    { encoding: 'utf8' },
  );
  if (built.status !== 0) {
    console.error(built.stderr || built.stdout);
    process.exit(1);
  }
  if (options.shots) mkdirSync(options.shots, { recursive: true });
  const problems = [];
  let steps = 0;
  await withChrome(
    'check-widgets',
    async ({ browser }) => {
      for (const theme of options.themes) {
        for (const viewport of options.viewports) {
          const where = `${theme} ${viewport.width}`;
          // A reader whose language writes 1,5: the widgets still write 1.5, as the app does.
          const context = await browser.newContext({
            viewport,
            colorScheme: theme,
            deviceScaleFactor: 1,
            locale: 'es-ES',
          });
          const page = await context.newPage();
          const events = [];
          page.on('console', (message) => {
            if (message.type() === 'error') events.push(`console error: ${message.text()}`);
          });
          page.on('pageerror', (error) => events.push(`page error: ${error.message}`));
          await page.goto(PAGE, { waitUntil: 'load' });
          await page.waitForFunction(
            () => document.documentElement.hasAttribute('data-docs-ready'),
            null,
            { timeout: 15_000 },
          );
          const widgets = page.locator('.mfe-widget');
          const count = await widgets.count();
          const seen = {};
          for (let i = 0; i < count; i++) {
            const w = widgets.nth(i);
            const name = await w.getAttribute('data-mfe-widget');
            const index = (seen[name] = (seen[name] ?? -1) + 1);
            const expectMissing = (await w.getAttribute('data-expect')) === 'missing';
            const mounted = await w.getAttribute('data-mfe-mounted');
            const error = await w.getAttribute('data-mfe-error');
            if (expectMissing ? !error : mounted === null || error) {
              problems.push(
                `[${where}] ${name} #${index + 1} ${error ? `shows “${error}”` : 'did not mount'}`,
              );
              continue;
            }
            await w.scrollIntoViewIfNeeded();
            const shot = async (what) => {
              if (!options.shots) return;
              await w.screenshot({
                path: join(
                  options.shots,
                  `${name}-${index + 1}-${what}.${theme}.${viewport.width}.png`,
                ),
              });
            };
            try {
              await STEPS[name]?.(page, w, { index, theme, viewport, shot });
              steps++;
            } catch (failure) {
              problems.push(`[${where}] ${name} #${index + 1}: ${failure.message}`);
            }
            if (options.shots && !expectMissing) {
              await page.waitForTimeout(150);
              await w.screenshot({
                path: join(options.shots, `${name}-${index + 1}.${theme}.${viewport.width}.png`),
              });
            }
          }
          const wide = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
          }));
          if (wide.scroll > wide.width + 1) {
            problems.push(
              `[${where}] the page is ${wide.scroll}px wide in a ${wide.width}px window`,
            );
          }
          for (const event of new Set(events)) problems.push(`[${where}] ${event}`);
          await context.close();
        }
      }
      // A page whose head has only the widgets' scripts: they load the player, their examples'
      // data and the stylesheet themselves.
      const bare = join(mkdtempSync(join(tmpdir(), 'mfe-widgets-')), 'bare.html');
      const asset = (path) => pathToFileURL(join(WEB_DIR, path)).href;
      writeFileSync(
        bare,
        [
          '<!doctype html><html lang="en"><head><meta charset="utf-8">',
          '<title>Widgets on their own · Manim Formula Editor</title>',
          '<meta name="mfe:id" content="authoring/widgets">',
          `<link rel="stylesheet" href="${asset('assets/site.css')}">`,
          ...['assets/nav.js', 'assets/search-index.js', 'assets/site.js'].map(
            (path) => `<script src="${asset(path)}" defer></script>`,
          ),
          `<script src="${asset('widgets/link-glyphs.js')}" defer></script>`,
          `<script src="${asset('widgets/rate-functions.js')}" defer></script>`,
          '</head><body><main id="content"><article class="doc"><h1>Widgets on their own</h1>',
          `<div class="mfe-widget" data-mfe-widget="link-glyphs" data-options='{"example": "widget-link"}'></div>`,
          '<div class="mfe-widget" data-mfe-widget="rate-functions"></div>',
          `<div class="mfe-widget" data-mfe-widget="link-glyphs" data-options='{"example": "no-such-example"}'></div>`,
          '</article></main></body></html>',
        ].join('\n'),
      );
      const context = await browser.newContext({ viewport: VIEWPORTS[0], colorScheme: 'dark' });
      const page = await context.newPage();
      const thrown = [];
      page.on('pageerror', (error) => thrown.push(error.message));
      await page.goto(pathToFileURL(bare).href, { waitUntil: 'load' });
      try {
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.mfe-widget .mfe-w').length === 2 &&
            document.querySelectorAll('.mfe-widget[data-mfe-error]').length === 1,
          null,
          { timeout: 10_000 },
        );
        const sheet = await page.evaluate(() =>
          Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((node) =>
            node.href.endsWith('/widgets/widgets.css'),
          ),
        );
        if (!sheet) problems.push('[on their own] the widgets did not load widgets.css');
        const notice = await page.getAttribute('.mfe-widget[data-mfe-error]', 'data-mfe-error');
        if (!/no-such-example\.data\.js/.test(notice)) {
          problems.push(`[on their own] the notice of a missing example reads “${notice}”`);
        }
        steps++;
      } catch {
        problems.push('[on their own] widgets without their scripts in the head did not show');
      }
      for (const message of thrown) problems.push(`[on their own] page error: ${message}`);
      await context.close();
      rmSync(dirname(bare), { recursive: true, force: true });
    },
    { server: false },
  );
  for (const problem of problems) console.log(`  ${problem}`);
  console.log(
    `widgets check: ${steps} widget run${steps === 1 ? '' : 's'} driven, ${problems.length} problem${problems.length === 1 ? '' : 's'}` +
      (options.shots ? ` · screenshots in ${options.shots}` : ''),
  );
  if (problems.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
