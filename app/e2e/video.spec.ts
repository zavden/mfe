/* Export → Video…: the file the browser (WebCodecs) and the companion (ffmpeg) produce lasts
 * exactly frames / fps and shows the scene. The companion is a real one started on another port
 * and reached through page.route (the app always looks at 127.0.0.1:7799). */
import { expect, test, type Page } from './test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMPANION_URL,
  routeToCompanion,
  startCompanion,
  type RunningCompanion,
} from './companionHelpers';
import { forceFallbackFilePaths } from './creatorHelpers';
import { openWithProject, readExample } from './helpers';
import type { MfeWindow } from './helpers';
import {
  createClip,
  createEmphasis,
  createEmptyProject,
  createShapeFormula,
  defaultIntro,
  defaultOutro,
  serializeProject,
} from '../src/model';

/** The app never finds a companion (a developer may have a real one on :7799). */
async function noCompanion(page: Page): Promise<void> {
  await page.route(`${COMPANION_URL}/**`, (route) => route.abort('connectionrefused'));
}

/** Opens Export → Video… on the hello project (or on `json`), after `prepare` (a change to the
 * loaded project). */
async function openDialog(
  page: Page,
  prepare?: (page: Page) => Promise<void>,
  json = readExample('hello.mfe.json'),
): Promise<void> {
  // The tests read the file from the download; with the File System Access API the dialog would
  // ask where to write it instead.
  await forceFallbackFilePaths(page);
  await openWithProject(page, json);
  await prepare?.(page);
  // every formula of the project has a render
  await page.waitForFunction(() => {
    const mfe = (window as MfeWindow).__mfe!;
    return (
      mfe.useRenderStore.getState().resolved.size >=
      mfe.useProjectStore.getState().project.formulas.length
    );
  });
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-video').click();
  await expect(page.getByTestId('export-video')).toBeVisible();
}

/** 320 × 180 at 10 fps keeps the encode tiny. */
async function smallOutput(page: Page, fps = '10'): Promise<void> {
  await page.getByTestId('video-size-preset').selectOption('custom');
  await page.getByTestId('video-width').fill('320');
  await page.getByTestId('video-height').fill('180');
  await page.getByTestId('video-fps').selectOption('custom');
  await page.getByTestId('video-custom-fps').fill(fps);
}

async function summaryFrames(page: Page): Promise<number> {
  const text = (await page.getByTestId('video-summary').textContent()) ?? '';
  return Number(/^(\d+) frames/.exec(text)![1]);
}

interface Probe {
  duration: number;
  frames: number;
  codec: string;
  width: number;
  height: number;
}

function probe(path: string): Probe {
  const out = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-count_frames',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height,nb_read_frames:format=duration',
      '-of',
      'json',
      path,
    ],
    { encoding: 'utf8' },
  );
  const data = JSON.parse(out) as {
    format: { duration: string };
    streams: { codec_name: string; width: number; height: number; nb_read_frames: string }[];
  };
  const stream = data.streams[0]!;
  return {
    duration: Number(data.format.duration),
    frames: Number(stream.nb_read_frames),
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
  };
}

/** Number of non-dark pixels of the frame at `seconds` (the scene is white on black). */
function litPixels(path: string, seconds: number): number {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      String(seconds),
      '-i',
      path,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  let lit = 0;
  for (const value of raw) if (value > 80) lit++;
  return lit;
}

/** The box of the non-dark pixels of frame `index` of a video, in pixels. */
function litBox(path: string, index: number): { width: number; height: number } {
  const { width, height } = probe(path);
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-vf',
      `select=eq(n\\,${index})`,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  expect(raw.length).toBe(width * height);
  let [minX, minY, maxX, maxY] = [width, height, -1, -1];
  raw.forEach((value, at) => {
    if (value <= 80) return;
    const [x, y] = [at % width, Math.floor(at / width)];
    [minX, minY, maxX, maxY] = [
      Math.min(minX, x),
      Math.min(minY, y),
      Math.max(maxX, x),
      Math.max(maxY, y),
    ];
  });
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** MP4: the duration in the movie header and in the media header, from the file itself. */
function mp4Durations(buffer: Buffer): { movie: number; media: number } {
  const read = (kind: string): number => {
    const at = buffer.indexOf(kind);
    const version = buffer[at + 4]!;
    const base = at + 4 + 4 + (version === 1 ? 16 : 8); // after version+flags and the two times
    const timescale = buffer.readUInt32BE(base);
    const duration =
      version === 1 ? Number(buffer.readBigUInt64BE(base + 4)) : buffer.readUInt32BE(base + 4);
    return duration / timescale;
  };
  return { movie: read('mvhd'), media: read('mdhd') };
}

async function runExport(page: Page): Promise<{ path: string; name: string }> {
  const download = page.waitForEvent('download');
  await page.getByTestId('video-start').click();
  const file = await download;
  await expect(page.getByTestId('video-done')).toBeVisible();
  const path = (await file.path())!;
  // E2E_KEEP=<dir> keeps a copy of every exported file for a look
  if (process.env.E2E_KEEP)
    copyFileSync(path, join(process.env.E2E_KEEP, file.suggestedFilename()));
  return { path, name: file.suggestedFilename() };
}

test.describe('Export video: browser', () => {
  test.beforeEach(async ({ page }) => {
    await noCompanion(page);
  });

  test('MP4 H.264 lasts exactly frames / fps and shows the formulas', async ({ page }) => {
    await openDialog(page);
    await expect(page.getByTestId('video-encoder-browser')).toBeChecked();
    await expect(page.getByTestId('video-encoder-ffmpeg')).toBeDisabled();
    await expect(page.getByTestId('video-encoder-hint-ffmpeg')).toContainText('not running');
    await smallOutput(page);
    const frames = await summaryFrames(page);
    expect(frames).toBeGreaterThan(5);

    const { path, name } = await runExport(page);
    expect(name).toBe('Hello- one-to-one.mp4');
    const info = probe(path);
    expect(info).toMatchObject({ codec: 'h264', width: 320, height: 180, frames });
    expect(info.duration).toBeCloseTo(frames / 10, 6);
    const headers = mp4Durations(readFileSync(path));
    expect(headers.movie).toBeCloseTo(frames / 10, 6);
    expect(headers.media).toBeCloseTo(frames / 10, 6);
    expect(litPixels(path, frames / 20)).toBeGreaterThan(30); // mid-scene: not blank
  });

  test('a custom range exports only that part', async ({ page }) => {
    await openDialog(page);
    await smallOutput(page);
    const whole = await summaryFrames(page);
    await page.getByTestId('video-range-custom').check();
    await page.getByTestId('video-range-start').fill('0.5');
    await page.getByTestId('video-range-end').fill('1.5');
    await expect(page.getByTestId('video-summary')).toContainText('10 frames');
    expect(whole).toBeGreaterThan(10);
    const { path } = await runExport(page);
    const info = probe(path);
    expect(info.frames).toBe(10);
    expect(info.duration).toBeCloseTo(1, 6);
  });

  test('hidden tracks are exported: hiding is a preview toggle', async ({ page }) => {
    await openDialog(page, async () => {
      // Both tracks hidden: the preview shows nothing, the video shows the whole scene.
      await page.getByTestId('track-hide-t_1').click();
      await page.getByTestId('track-hide-t_2').click();
      await expect(page.getByTestId('track-hide-t_2')).toHaveAttribute('aria-pressed', 'true');
    });
    await smallOutput(page);
    const frames = await summaryFrames(page);
    const { path } = await runExport(page);
    expect(probe(path).frames).toBe(frames);
    expect(litPixels(path, frames / 20)).toBeGreaterThan(30);
  });

  test('WebM VP9 (and AV1 when supported)', async ({ page }) => {
    await openDialog(page);
    await smallOutput(page);
    const frames = await summaryFrames(page);
    const format = page.getByTestId('video-format');
    await expect(format.locator('option[value="vp9-webm"]')).toBeEnabled();
    await format.selectOption('vp9-webm');
    const webm = await runExport(page);
    expect(webm.name).toBe('Hello- one-to-one.webm');
    const info = probe(webm.path);
    expect(info).toMatchObject({ codec: 'vp9', width: 320, height: 180, frames });
    expect(info.duration).toBeCloseTo(frames / 10, 6);
    expect(litPixels(webm.path, frames / 20)).toBeGreaterThan(30);

    if (await format.locator('option[value="av1-mp4"]').isEnabled()) {
      await format.selectOption('av1-mp4');
      test.info().annotations.push({ type: 'av1', description: 'exported' });
      const av1 = await runExport(page);
      const av1Info = probe(av1.path);
      expect(av1Info).toMatchObject({ codec: 'av1', frames });
      expect(av1Info.duration).toBeCloseTo(frames / 10, 6);
    }
  });

  test('shows progress with the frame counter and can be cancelled', async ({ page }) => {
    await openDialog(page);
    // Full HD at 60 fps takes long enough to cancel
    await page.getByTestId('video-size-preset').selectOption('1080p');
    await page.getByTestId('video-start').click();
    await expect(page.getByTestId('video-progress-text')).toContainText(/frame \d+ of \d+/);
    await page.getByTestId('video-cancel').click();
    await expect(page.getByTestId('video-cancelled')).toBeVisible();
    await expect(page.getByTestId('video-start')).toBeEnabled();
  });

  test('a square video of a 16:9 project is the scene in the square frame, as Manim renders it', async ({
    page,
  }) => {
    // A FocusOn disc starts at the frame's half width plus its half height, and Manim's frame is
    // the video's: 4 + 4 in a square one, where the project's frame would give 7.11 + 4.
    const project = createEmptyProject('Square');
    Object.assign(project.meta, { width: 1920, height: 1080, fps: 10, duration: 4 });
    const shape = createShapeFormula({ name: 'box', width: 2, height: 1 });
    const clip = createClip(shape.id, project.tracks[0]!.id, 0, 4, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    clip.actions.push(
      createEmphasis(1, 'focus_on', 'all', {
        duration: 2,
        easing: 'linear',
        color: '#FFFFFF',
        opacity: 1,
      }),
    );
    project.formulas.push(shape);
    project.clips.push(clip);
    await openDialog(page, undefined, serializeProject(project));
    await page.getByTestId('video-size-preset').selectOption('custom');
    await page.getByTestId('video-width').fill('240');
    await page.getByTestId('video-height').fill('240');
    await page.getByTestId('video-fps').selectOption('custom');
    await page.getByTestId('video-custom-fps').fill('10');
    await expect(page.getByTestId('video-aspect-warning')).toBeVisible();
    const { path } = await runExport(page);
    expect(probe(path)).toMatchObject({ width: 240, height: 240, frames: 40 });
    // Frame 25 is t = 2.5 s, three quarters of the way of the block: a quarter of the radius 8
    // is left, a disc 4 units across over the 2 × 1 box, at 30 pixels a unit.
    const disc = litBox(path, 25);
    for (const side of [disc.width, disc.height]) {
      expect(side).toBeGreaterThan(116);
      expect(side).toBeLessThan(124);
    }
  });

  test('warns about a different aspect ratio', async ({ page }) => {
    await openDialog(page);
    await page.getByTestId('video-size-preset').selectOption('custom');
    await page.getByTestId('video-width').fill('600');
    await page.getByTestId('video-height').fill('600');
    await expect(page.getByTestId('video-aspect-warning')).toContainText(
      'differs from the project',
    );
  });
});

test('a companion older than 1.1 is not offered for ffmpeg (it has no /video)', async ({
  page,
}) => {
  await page.route(`${COMPANION_URL}/**`, (route) => {
    if (new URL(route.request().url()).pathname !== '/health') return route.abort();
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        name: 'mfe-companion',
        version: '1.0.0',
        protocol: 1,
        capabilities: { latex: false, dvisvgm: false, ffmpeg: true, manimCE: null, manimGL: null },
      }),
    });
  });
  await openDialog(page);
  await expect(page.getByTestId('video-encoder-ffmpeg')).toBeDisabled();
  await expect(page.getByTestId('video-encoder-hint-ffmpeg')).toHaveText(
    'This companion is older than 1.1 and cannot encode video. Update companion/mfe_companion.py.',
  );
});

test('a video the companion cannot take fails in the companion’s own words', async ({ page }) => {
  // What a companion 1.7 answers on a disk that is nearly full; a video over its limit fails the
  // same way, with the message of that.
  const message =
    "The disk of the companion's temporary folder (/tmp) is nearly full: less than 1 GiB is free " +
    'there, so the job was stopped. Free some room, or start the companion with the environment ' +
    'variable TMPDIR naming a folder on a disk with more room.';
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  };
  await page.route(`${COMPANION_URL}/**`, (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (pathname === '/health')
      return route.fulfill({
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify({
          name: 'mfe-companion',
          version: '1.7.0',
          protocol: 1,
          capabilities: {
            latex: false,
            dvisvgm: false,
            ffmpeg: true,
            manimCE: null,
            manimGL: null,
            manimRender: false,
          },
          limits: { videoBytes: 16 * 1024 ** 3 },
        }),
      });
    if (pathname === '/video' && request.method() === 'POST')
      return route.fulfill({
        status: 507,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify({ ok: false, error: { message, line: null, log: '' } }),
      });
    return route.abort();
  });
  await openDialog(page);
  await page.getByTestId('video-encoder-ffmpeg').check();
  // the limit this companion was started with (`serve --max-video-gib 16`)
  await expect(page.getByTestId('video-size-limit')).toHaveText(
    'Up to 16 GiB per video: the companion’s limit. Start it with --max-video-gib to give it another.',
  );
  await page.getByTestId('video-start').click();
  await expect(page.getByTestId('video-error')).toHaveText(message);
  await expect(page.getByTestId('video-start')).toBeEnabled(); // and another export can be tried
});

test('while the companion probes for Manim, the dialog says so and asks again soon', async ({
  page,
}) => {
  let probing = true;
  await page.route(`${COMPANION_URL}/**`, (route) => {
    if (new URL(route.request().url()).pathname !== '/health') return route.abort();
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        name: 'mfe-companion',
        version: '1.2.0',
        protocol: 1,
        capabilities: {
          latex: false,
          dvisvgm: false,
          ffmpeg: true,
          manimCE: probing ? null : { python: '/venv/bin/python', version: '0.22.1' },
          manimGL: null,
          manimProbing: probing,
          manimRender: true,
          manimSandbox: true,
        },
      }),
    });
  });
  await openDialog(page);
  await expect(page.getByTestId('video-encoder-hint-manim')).toHaveText(
    'The companion is still looking for Manim…',
  );
  probing = false; // found it: the next health check says so
  await expect(page.getByTestId('video-encoder-manim')).toBeEnabled({ timeout: 6000 });
});

test('warns when a formula on the timeline does not render with its current LaTeX', async ({
  page,
}) => {
  await noCompanion(page);
  await openWithProject(page, readExample('hello.mfe.json'));
  await page.waitForFunction(
    () => (window as MfeWindow).__mfe!.useRenderStore.getState().resolved.size === 2,
  );
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
      d.formulas[0]!.source = '\\frac{a';
    });
  });
  await page.waitForFunction(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const id = mfe.useProjectStore.getState().project.formulas[0]!.id;
    return mfe.useRenderStore.getState().entries[id]?.status === 'error';
  });
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-video').click();
  await expect(page.getByTestId('video-stale-formulas')).toHaveText(
    'a1 does not render with its current LaTeX: the video draws its last good render.',
  );
  await expect(page.getByTestId('video-start')).toBeEnabled();
});

test('waits while a formula re-renders: the old geometry is not exported', async ({ page }) => {
  await noCompanion(page);
  await openDialog(page);
  await expect(page.getByTestId('video-start')).toBeEnabled();
  const setStatus = (status: string) =>
    page.evaluate((status) => {
      const mfe = (window as MfeWindow).__mfe!;
      const id = mfe.useProjectStore.getState().project.formulas[0]!.id;
      const entry = mfe.useRenderStore.getState().entries[id]!;
      mfe.useRenderStore.getState().setEntry(id, { ...entry, status });
    }, status);
  await setStatus('loading');
  await expect(page.getByTestId('video-waiting-formulas')).toHaveText(
    'Waiting for a formula to render (a1)…',
  );
  await expect(page.getByTestId('video-start')).toBeDisabled();
  await setStatus('ok');
  await expect(page.getByTestId('video-waiting-formulas')).toHaveCount(0);
  await expect(page.getByTestId('video-start')).toBeEnabled();
});

test.describe('Export video: companion · ffmpeg', () => {
  let companion: RunningCompanion;
  // Made by the worker that runs the group. Made as the file is loaded, it was made by the runner
  // and by every other worker too, none of which removes it: a folder left per process, per run.
  let directory: string;

  test.beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'mfe-e2e-'));
    companion = await startCompanion();
  });

  test.afterAll(async () => {
    await companion.stop();
    rmSync(directory, { recursive: true, force: true });
  });

  test('MP4 through ffmpeg lasts exactly frames / fps', async ({ page }) => {
    await routeToCompanion(page, companion);
    await openDialog(page);
    await expect(page.getByTestId('video-size-limit')).toHaveCount(0); // the browser has no such limit
    await expect(page.getByTestId('video-encoder-ffmpeg')).toBeEnabled();
    await page.getByTestId('video-encoder-ffmpeg').check();
    // the real companion says its limit, 4 GiB unless it was started with another
    await expect(page.getByTestId('video-size-limit')).toHaveText(
      'Up to 4 GiB per video: the companion’s limit. Start it with --max-video-gib to give it another.',
    );
    await smallOutput(page);
    const frames = await summaryFrames(page);
    const { path, name } = await runExport(page);
    expect(name).toBe('Hello- one-to-one.mp4');
    const copy = join(directory, 'ffmpeg.mp4');
    writeFileSync(copy, readFileSync(path));
    const info = probe(copy);
    expect(info).toMatchObject({ codec: 'h264', width: 320, height: 180, frames });
    expect(info.duration).toBeCloseTo(frames / 10, 6);
    expect(litPixels(copy, frames / 20)).toBeGreaterThan(30);
  });
});
