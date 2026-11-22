/* How each kind of item is captured in one theme: a shot (one image), a clip (a short video and
 * its poster), a tour (one image per step and the boxes of what each step is about) and data
 * (JSON read out of the app). Each item and theme gets a browser context of its own, so that it
 * starts from the project just opened, nothing selected and the default preferences. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApp } from '../lib/browser.mjs';
import { Kit } from './kit.mjs';
import { installOverlay, OVERLAY_ASSETS } from './overlay.mjs';
import { DEFAULTS, encodeClip, jpegSize } from './output.mjs';

/** The width (CSS px) a page shows an image at, at most: its column. A wider image is shown
 * narrower, so the overlays drawn on it grow by the ratio, and its density can be 1. */
export const DISPLAY_WIDTH = 800;

/** Where the keys pressed float in a clip by default. The site draws a clip's pause and replay
 * buttons in a bar under it (`.clip-controls` of assets/site.css; they sat over its bottom-right
 * corner before 2026-11-16), and, with reduced motion, a button that starts it in its centre. */
export const KEYS_AT = 'bottom-left';

/** WebP quality of the images (0–1). */
export const QUALITY = DEFAULTS.quality;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The steps of an item: a function, or a list of them, run in turn with (page, kit). */
async function runSteps(steps, page, kit) {
  for (const step of [steps ?? []].flat()) await step(page, kit);
}

/** Where a failing item leaves what there is to look at (`<page-id>/<item>.<theme>.png` and
 * `.txt`): a folder of the system's temporary directory, never `media/`. */
export const FAILURES_DIR = join(tmpdir(), 'mfe-capture-failures');

/** Opens the app for an item in a theme, with the overlay installed and the item's setup run.
 * Should the setup fail, what the page showed is saved (`saveFailure`) before the error goes on. */
async function open({ browser, item, theme, scale, recording = false, readProject, warn, pageId }) {
  const project = item.project ? readProject(item.project) : null;
  const { page, context, errors } = await openApp(browser, {
    theme,
    viewport: item.viewport,
    deviceScaleFactor: scale,
    project,
  });
  // What the app throws or logs as an error is said (it may be a bug to report), but for its
  // looking for the companion (port 7799), which the tools never start. It is kept too, for the
  // report of an item that fails.
  const problems = errors.map((error) => `page error: ${error}`);
  for (const problem of problems) warn(problem);
  page.on('pageerror', (error) => {
    problems.push(`page error: ${error.message}`);
    warn(`page error: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error' || /:7799\b/.test(message.location()?.url ?? '')) return;
    problems.push(`console: ${message.text()}`);
    warn(`console: ${message.text()}`);
  });
  const opened = { page, context, errors, problems, kit: null, item, theme, pageId };
  try {
    await page.evaluate(installOverlay, OVERLAY_ASSETS);
    opened.kit = new Kit({ page, theme, recording, readProject, warn });
    await opened.kit.settle();
    await runSteps(item.setup, page, opened.kit);
  } catch (error) {
    await saveFailure(opened, error, 'setup');
    await context.close();
    throw error;
  }
  return opened;
}

/** What the app was doing when an item failed: the playhead, the selection, the dialogs and
 * menus open, the focus, the formulas that failed to render. */
async function stateOf(page) {
  return page.evaluate(() => {
    const mfe = window.__mfe;
    const named = (element) =>
      element.getAttribute('aria-label') ||
      element.querySelector('h1, h2, h3, [class*="title"]')?.textContent.trim() ||
      element.dataset.testid ||
      element.className;
    const focused = document.activeElement;
    const state = {
      url: location.href,
      dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog')]
        .filter((element) => element.getClientRects().length > 0)
        .map(named),
      menus: [...document.querySelectorAll('[role="menu"]')].map(named),
      focus: focused
        ? `${focused.tagName.toLowerCase()}${focused.dataset?.testid ? ` ${focused.dataset.testid}` : ''}`
        : null,
    };
    if (mfe) {
      const ui = mfe.useUiStore.getState();
      const { project } = mfe.useProjectStore.getState();
      const { entries } = mfe.useRenderStore.getState();
      Object.assign(state, {
        playhead: ui.time,
        playing: ui.playing,
        selection: ui.selection,
        formulas: project.formulas.length,
        clips: project.clips.length,
        renders: project.formulas
          .filter((formula) => entries[formula.id]?.status !== 'ok')
          .map((formula) => `${formula.name}: ${entries[formula.id]?.status ?? 'not rendered'}`),
      });
    } else state.app = 'window.__mfe is missing: the app did not start';
    return state;
  });
}

/** Saves what a failing item leaves to look at — a screenshot of the whole window, the page
 * errors and console errors seen, the state of the app and the error — in
 * `FAILURES_DIR/<page-id>/`, and names the files on the error (`error.saved`). Never throws. */
async function saveFailure(opened, error, when) {
  const { page, item, theme, pageId, problems } = opened;
  try {
    const dir = join(FAILURES_DIR, ...(pageId ?? 'unknown').split('/'));
    mkdirSync(dir, { recursive: true });
    const base = join(dir, `${item.name}.${theme}`);
    const saved = [];
    try {
      await page.evaluate(() => window.__mfeCapture?.clearHighlights());
      await page.screenshot({ path: `${base}.png`, timeout: 10_000 });
      saved.push(`${base}.png`);
    } catch (shotError) {
      problems.push(`(no screenshot: ${String(shotError.message ?? shotError).split('\n')[0]})`);
    }
    let state;
    try {
      state = JSON.stringify(await stateOf(page), null, 2);
    } catch (stateError) {
      state = `(the page could not be read: ${String(stateError.message ?? stateError).split('\n')[0]})`;
    }
    const text = [
      `${pageId} ${item.name} (${theme}) failed in its ${when}, ${new Date().toISOString()}`,
      '',
      String(error?.stack ?? error),
      '',
      `Page errors and console errors (${problems.length}):`,
      ...(problems.length ? problems.map((p) => `  ${p}`) : ['  none']),
      '',
      'The app when it failed:',
      state,
      '',
    ].join('\n');
    writeFileSync(`${base}.txt`, text);
    saved.push(`${base}.txt`);
    if (error && typeof error === 'object') error.saved = saved;
  } catch {
    // nothing more to save
  }
}

/** The area an item captures (viewport CSS px, whole pixels, inside the viewport): its `target`
 * grown by its `padding`, or the whole viewport. */
async function cropOf(kit, item, { even = false } = {}) {
  const { width: vw, height: vh } = item.viewport;
  if (!item.target) return { x: 0, y: 0, width: vw, height: vh };
  const box = await kit.box(item.target, { pad: item.padding ?? 0 });
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  let right = Math.min(vw, Math.ceil(box.x + box.width));
  let bottom = Math.min(vh, Math.ceil(box.y + box.height));
  if (even) {
    // A VP9 picture in 4:2:0 has even sides.
    if ((right - left) % 2) right += right < vw ? 1 : -1;
    if ((bottom - top) % 2) bottom += bottom < vh ? 1 : -1;
  }
  if (right - left < 2 || bottom - top < 2) throw new Error('the target is outside the viewport');
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The ratio by which a page shrinks an image `width` CSS px wide. */
function shrinkOf(width) {
  return Math.max(1, width / DISPLAY_WIDTH);
}

/** The density of a still image: the item's `scale`, else what keeps it sharp on a screen of
 * density 2 where a page shows it (at most `DISPLAY_WIDTH` wide): 2 up to 1000 CSS px, 1.5 up
 * to 1280, then 1 (a whole window, 1440 px shown in 800, still has 1.8 pixels for each). */
function densityOf(item, crop) {
  if (item.scale) return item.scale;
  if (crop.width <= 1000) return 2;
  return crop.width < 1280 ? 1.5 : 1;
}

async function still(kit, crop, { cursor = false } = {}) {
  const { page } = kit;
  await page.evaluate(
    ({ cursor, x, y }) => {
      window.__mfeCapture.showCursor(cursor);
      if (cursor) window.__mfeCapture.placeCursor(x, y);
      window.__mfeCapture.hideCaret(true);
    },
    { cursor, ...kit.mouse },
  );
  await kit.settle();
  return page.screenshot({ type: 'png', clip: crop, animations: 'disabled', caret: 'hide' });
}

/** A screenshot. Returns its file: `[{ name, kind, bytes, width, height, scale }]`. */
export async function captureShot({ browser, item, theme, readProject, warn, encoder, pageId }) {
  const scale = item.scale ?? 2;
  const opened = await open({ browser, item, theme, scale, readProject, warn, pageId });
  const { page, context, kit } = opened;
  try {
    await runSteps(item.steps, page, kit);
    const crop = await cropOf(kit, item);
    kit.crop = crop;
    kit.displayScale = shrinkOf(crop.width);
    if (item.highlight) await kit.highlight(item.highlight);
    const png = await still(kit, crop, { cursor: item.cursor });
    const density = densityOf(item, crop);
    const webp = await encoder.encode(png, {
      ratio: density / scale,
      quality: item.quality ?? QUALITY,
    });
    return [
      {
        name: `${item.name}.${theme}.webp`,
        kind: 'shot',
        bytes: webp.bytes,
        width: crop.width,
        height: crop.height,
        scale: density,
      },
    ];
  } catch (error) {
    await saveFailure(opened, error, 'steps');
    throw error;
  } finally {
    await context.close();
  }
}

/** The number of the image each step of a tour shows (from 1). A step that changes nothing on
 * screen — no `act`, no `highlight`, the pointer as before, and no highlight to take away — shows
 * the image of the step before: only the boxes move. */
export function tourImages(steps) {
  const numbers = [];
  steps.forEach((step, i) => {
    const before = steps[i - 1];
    const fresh =
      i === 0 ||
      step.act ||
      step.highlight ||
      before.highlight ||
      Boolean(step.cursor) !== Boolean(before.cursor);
    numbers.push(fresh ? (numbers[i - 1] ?? 0) + 1 : numbers[i - 1]);
  });
  return numbers;
}

/** A tour: one image per step (shared by the steps that change nothing, `tourImages`) and the
 * boxes of each step's `focus`, in CSS px of the image. */
export async function captureTour({ browser, item, theme, readProject, warn, encoder, pageId }) {
  const scale = item.scale ?? 2;
  const opened = await open({ browser, item, theme, scale, readProject, warn, pageId });
  const { page, context, kit } = opened;
  let at = 0;
  try {
    const crop = await cropOf(kit, item);
    kit.crop = crop;
    kit.displayScale = shrinkOf(crop.width);
    const density = densityOf(item, crop);
    const numbers = tourImages(item.steps);
    const files = [];
    const steps = [];
    for (const [i, step] of item.steps.entries()) {
      const n = i + 1;
      at = n;
      const fresh = i === 0 || numbers[i] !== numbers[i - 1];
      await runSteps(step.act, page, kit);
      if (fresh) {
        await kit.clearHighlight();
        if (step.highlight) await kit.highlight(step.highlight);
      }
      const boxes = [];
      for (const target of [step.focus ?? []].flat()) {
        const box = await kit.box(target, { pad: step.focusPadding ?? 0 });
        const left = Math.max(box.x, crop.x);
        const top = Math.max(box.y, crop.y);
        const right = Math.min(box.x + box.width, crop.x + crop.width);
        const bottom = Math.min(box.y + box.height, crop.y + crop.height);
        if (right <= left || bottom <= top) {
          warn(`step ${n}: a focus is outside the image`);
          continue;
        }
        boxes.push({
          x: Math.round(left - crop.x),
          y: Math.round(top - crop.y),
          w: Math.round(right - left),
          h: Math.round(bottom - top),
        });
      }
      const image = `${item.name}-${numbers[i]}`;
      if (fresh) {
        const png = await still(kit, crop, { cursor: step.cursor ?? item.cursor });
        const webp = await encoder.encode(png, {
          ratio: density / scale,
          quality: item.quality ?? QUALITY,
        });
        files.push({
          name: `${image}.${theme}.webp`,
          kind: 'tour-step',
          bytes: webp.bytes,
          width: crop.width,
          height: crop.height,
          scale: density,
        });
      }
      steps.push({ image, caption: step.caption, boxes });
    }
    return { files, tour: { width: crop.width, height: crop.height, steps } };
  } catch (error) {
    await saveFailure(opened, error, at ? `step ${at}` : 'start');
    throw error;
  } finally {
    await context.close();
  }
}

/** A clip: the item's `act` recorded (frames of the page's screencast, from the first move to
 * a short rest after the last), cropped and encoded by ffmpeg, and its poster: the image the
 * clip starts on. */
export async function captureClip({ browser, item, theme, readProject, warn, encoder, pageId }) {
  const scale = item.scale ?? 1;
  const opened = await open({ browser, item, theme, scale, readProject, warn, pageId });
  const { page, context, kit } = opened;
  const dir = mkdtempSync(join(tmpdir(), 'mfe-capture-'));
  try {
    const crop = await cropOf(kit, item, { even: scale === 1 });
    kit.crop = crop;
    kit.displayScale = shrinkOf(crop.width);
    const start = item.cursorStart
      ? await kit.point(item.cursorStart)
      : { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 };
    await page.mouse.move(start.x, start.y);
    kit.mouse = start;
    await page.evaluate(
      ({ crop, scale, keysAt }) => {
        const overlay = window.__mfeCapture;
        overlay.setScale(scale);
        overlay.showCursor(true);
        overlay.showKeys(true);
        overlay.placeKeys(crop, keysAt);
      },
      { crop, scale: kit.displayScale, keysAt: item.keysAt ?? KEYS_AT },
    );
    if (item.highlight) await kit.highlight(item.highlight);
    await kit.settle();
    const poster = await page.screenshot({ type: 'png', clip: crop, animations: 'disabled' });

    const frames = [];
    let failure = null;
    await page.screencast.start({
      size: { width: item.viewport.width * scale, height: item.viewport.height * scale },
      quality: 90,
      onFrame: ({ data, timestamp }) => {
        try {
          const file = `frame-${String(frames.length + 1).padStart(5, '0')}.jpg`;
          writeFileSync(join(dir, file), data);
          frames.push({
            file,
            timestamp,
            arrived: Date.now(),
            size: frames.length ? null : jpegSize(data),
          });
        } catch (error) {
          failure = error;
        }
      },
    });
    kit.recording = true;
    let stoppedAt = 0;
    try {
      await sleep(item.holdStart ?? 500);
      await runSteps(item.act, page, kit);
      // A clip loops: the pointer goes back to where it started (the act puts the app back).
      if (item.loop !== false) {
        await sleep(400);
        await kit.move(start);
      }
      await sleep(item.holdEnd ?? 900);
    } finally {
      kit.recording = false;
      stoppedAt = Date.now();
      await page.screencast.stop();
    }
    if (failure) throw failure;
    if (frames.length < 2) throw new Error('the recording has no frames');
    const first = frames[0].timestamp;
    const last = frames[frames.length - 1];
    const end = (last.timestamp - first + (stoppedAt - last.arrived)) / 1000;
    const timed = frames.map((frame) => ({
      file: frame.file,
      time: (frame.timestamp - first) / 1000,
    }));
    const ratio = frames[0].size ? frames[0].size.width / item.viewport.width : scale;
    const even = (value) => Math.floor(value / 2) * 2;
    const pixels = {
      x: Math.round(crop.x * ratio),
      y: Math.round(crop.y * ratio),
      width: even(crop.width * ratio),
      height: even(crop.height * ratio),
    };
    const out = join(dir, 'clip.webm');
    await encodeClip({
      frames: timed,
      end,
      crop: pixels,
      out,
      fps: item.fps ?? DEFAULTS.fps,
      crf: item.crf ?? DEFAULTS.crf,
      dir,
    });
    const webm = readFileSync(out);
    const posterWebp = await encoder.encode(poster, { ratio: 1, quality: item.quality ?? QUALITY });
    const size = {
      width: Math.round(pixels.width / ratio),
      height: Math.round(pixels.height / ratio),
    };
    return [
      {
        name: `${item.name}.${theme}.webm`,
        kind: 'clip',
        bytes: webm,
        ...size,
        scale: ratio,
        duration: end,
      },
      {
        name: `${item.name}.${theme}.webp`,
        kind: 'poster',
        bytes: posterWebp.bytes,
        width: crop.width,
        height: crop.height,
        scale,
      },
    ];
  } catch (error) {
    await saveFailure(opened, error, 'act');
    throw error;
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Data: what the item's `extract(page, kit)` returns, from the app in the dark theme. */
export async function captureData({ browser, item, readProject, warn, pageId }) {
  const opened = await open({
    browser,
    item,
    theme: 'dark',
    scale: 1,
    readProject,
    warn,
    pageId,
  });
  const { page, context, kit } = opened;
  try {
    return await item.extract(page, kit);
  } catch (error) {
    await saveFailure(opened, error, 'extract');
    throw error;
  } finally {
    await context.close();
  }
}
