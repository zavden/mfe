/* Browser routes for publication ownership. Companion replies are ordinary synthetic protocol
 * responses; file destinations use real Chromium OPFS bytes and writable streams. */
import { expect, test, type Page } from './test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { forceFallbackFilePaths } from './creatorHelpers';
import { openWithProject, readExample, type MfeWindow } from './helpers';

const COMPANION = 'http://127.0.0.1:7799';
const sentinel = 'Existing destination contents';
type HarnessWindow = MfeWindow & {
  __video: {
    writes: number;
    closes: number;
    aborts: number;
    entered: boolean;
    release(): void;
    bytes(): Promise<number[]>;
  };
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function destination(page: Page, pause?: 'write' | 'close' | 'failure') {
  await page.evaluate(
    async ({ sentinel, pause }) => {
      const w = window as unknown as HarnessWindow;
      const dir = await navigator.storage.getDirectory();
      const handle = await dir.getFileHandle('video-destination.webm', { create: true });
      const initial = await handle.createWritable();
      await initial.write(sentinel);
      await initial.close();
      let release!: () => void;
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      w.__video = {
        writes: 0,
        closes: 0,
        aborts: 0,
        entered: false,
        release,
        bytes: async () => [...new Uint8Array(await (await handle.getFile()).arrayBuffer())],
      };
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          name: handle.name,
          createWritable: async () => {
            const stream = await handle.createWritable();
            let aborted = false;
            return {
              async write(data: FileSystemWriteChunkType) {
                w.__video.writes++;
                if (pause === 'failure')
                  throw new DOMException('No space left on device', 'QuotaExceededError');
                if (pause === 'write' && w.__video.writes === 1) {
                  w.__video.entered = true;
                  await wait;
                }
                if (aborted) throw new DOMException('Cancelled', 'AbortError');
                await stream.write(data);
              },
              async close() {
                w.__video.closes++;
                if (pause === 'close') {
                  w.__video.entered = true;
                  await wait;
                }
                await stream.close();
              },
              async abort() {
                w.__video.aborts++;
                aborted = true;
                release();
                await stream.abort();
              },
            };
          },
        }),
      });
    },
    { sentinel, pause },
  );
}

async function openDialog(page: Page) {
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-video').click();
  await expect(page.getByTestId('export-video')).toBeVisible();
  await page.getByTestId('video-size-preset').selectOption('custom');
  await page.getByTestId('video-width').fill('320');
  await page.getByTestId('video-height').fill('180');
  await page.getByTestId('video-fps').selectOption('custom');
  await page.getByTestId('video-custom-fps').fill('10');
}

async function load(page: Page) {
  await openWithProject(page, readExample('hello.mfe.json'));
  await page.waitForFunction(() => {
    const mfe = (window as MfeWindow).__mfe!;
    return (
      mfe.useRenderStore.getState().resolved.size >=
      mfe.useProjectStore.getState().project.formulas.length
    );
  });
}

async function companion(page: Page, pauseCleanup = true) {
  const entered = deferred();
  const release = deferred();
  const deleted = deferred();
  const paths: string[] = [];
  await page.route(`${COMPANION}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    paths.push(`${method} ${path}`);
    const headers = { 'access-control-allow-origin': '*' };
    if (path === '/health')
      return route.fulfill({
        headers,
        json: {
          name: 'mfe-companion',
          version: '1.2.0',
          protocol: 1,
          capabilities: {
            latex: false,
            dvisvgm: false,
            ffmpeg: true,
            manimRender: true,
            manimCE: { python: '/ce', version: '0.22.0' },
            manimGL: null,
          },
        },
      });
    if (method === 'DELETE') {
      entered.resolve();
      if (pauseCleanup) await release.promise;
      await route.fulfill({ headers, json: { ok: true } });
      deleted.resolve();
      return;
    }
    if (path.endsWith('/result'))
      return route.fulfill({ headers, contentType: 'video/mp4', body: Buffer.from([1, 2, 3]) });
    const state =
      path === '/video' || path.endsWith('/frames')
        ? 'receiving'
        : path === '/manim-render'
          ? 'running'
          : 'done';
    return route.fulfill({
      headers,
      json: {
        ok: true,
        id: 'publication-job',
        state,
        frame: 1,
        frames: 1,
        received: 1,
        maxFrameBytes: 64 * 1024 * 1024,
        maxRequestBytes: 128 * 1024 * 1024,
      },
    });
  });
  return { entered, release, deleted, paths };
}

for (const encoder of ['ffmpeg', 'manim'] as const) {
  for (const toFile of [false, true]) {
    for (const action of ['cancel', 'close'] as const) {
      test(`${encoder} ${toFile ? 'file' : 'blob'}: ${action} during cleanup prevents publication`, async ({
        page,
      }) => {
        const service = await companion(page);
        if (!toFile) await forceFallbackFilePaths(page);
        await load(page);
        if (toFile) await destination(page);
        await openDialog(page);
        await page.getByTestId(`video-encoder-${encoder}`).check();
        const downloads: string[] = [];
        page.on('download', (download) => downloads.push(download.suggestedFilename()));
        await page.getByTestId('video-start').click();
        await service.entered.promise;
        await page.getByTestId(action === 'cancel' ? 'video-cancel' : 'video-close').click();
        if (toFile)
          await expect
            .poll(() => page.evaluate(() => (window as unknown as HarnessWindow).__video.aborts))
            .toBe(1);
        service.release.resolve();
        await service.deleted.promise;
        if (action === 'cancel') await expect(page.getByTestId('video-cancelled')).toBeVisible();
        else {
          await expect(page.getByTestId('export-video')).not.toBeVisible();
          await page.waitForTimeout(100); // allow the completed cleanup continuation to run after unmount
        }
        expect(downloads).toEqual([]);
        if (toFile) {
          const state = await page.evaluate(async () => {
            const h = (window as unknown as HarnessWindow).__video;
            return { closes: h.closes, aborts: h.aborts, bytes: await h.bytes() };
          });
          expect(state).toEqual({ closes: 0, aborts: 1, bytes: [...Buffer.from(sentinel)] });
        }
      });
    }
  }
}

test('a companion result reports destination failure and preserves the existing native file', async ({
  page,
}) => {
  const service = await companion(page, false);
  await load(page);
  await destination(page, 'failure');
  await openDialog(page);
  await page.getByTestId('video-encoder-ffmpeg').check();
  const healthBefore = service.paths.filter((path) => path.endsWith('/health')).length;
  await page.getByTestId('video-start').click();
  await expect(page.getByTestId('video-error')).toContainText('No space left on device');
  expect(service.paths.filter((path) => path.endsWith('/health'))).toHaveLength(healthBefore);
  const state = await page.evaluate(async () => {
    const h = (window as unknown as HarnessWindow).__video;
    return { closes: h.closes, aborts: h.aborts, bytes: await h.bytes() };
  });
  expect(state).toEqual({ closes: 0, aborts: 1, bytes: [...Buffer.from(sentinel)] });
});

for (const format of ['vp9-webm', 'avc-mp4'] as const) {
  test(`native ${format} drain cancellation aborts without another write or commit`, async ({
    page,
  }) => {
    await page.route(`${COMPANION}/**`, (route) => route.abort('connectionrefused'));
    await load(page);
    await destination(page, 'write');
    await openDialog(page);
    await page.getByTestId('video-format').selectOption(format);
    await page.getByTestId('video-start').click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).__video.entered);
    await page.getByTestId('video-cancel').click();
    await expect(page.getByTestId('video-cancelled')).toBeVisible();
    const state = await page.evaluate(async () => {
      const h = (window as unknown as HarnessWindow).__video;
      return { writes: h.writes, closes: h.closes, aborts: h.aborts, bytes: await h.bytes() };
    });
    expect(state).toEqual({ writes: 1, closes: 0, aborts: 1, bytes: [...Buffer.from(sentinel)] });
  });
}

for (const [theme, format, codec] of [
  ['dark', 'vp9-webm', 'vp9'],
  ['light', 'avc-mp4', 'h264'],
] as const) {
  test(`native ${codec} commit is irreversible and decodes correctly (${theme})`, async ({
    page,
  }, info) => {
    await page.addInitScript((theme) => localStorage.setItem('mfe.theme', theme), theme);
    await page.route(`${COMPANION}/**`, (route) => route.abort('connectionrefused'));
    await load(page);
    await destination(page, 'close');
    await openDialog(page);
    await page.getByTestId('video-format').selectOption(format);
    const summary = (await page.getByTestId('video-summary').textContent())!;
    const frames = Number(/^(\d+) frames/.exec(summary)![1]);
    await page.getByTestId('video-start').click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).__video.entered);
    await expect(page.getByTestId('video-committing')).toBeVisible();
    await expect(page.getByTestId('video-cancel')).toBeDisabled();
    await expect(page.getByTestId('video-close')).toHaveText('Close');
    await page.screenshot({ path: info.outputPath(`committing-${theme}.png`) });
    await page.getByTestId('video-close').click();
    await page.evaluate(() => (window as unknown as HarnessWindow).__video.release());
    await expect
      .poll(async () => {
        const bytes = await page.evaluate(() =>
          (window as unknown as HarnessWindow).__video.bytes(),
        );
        return Buffer.from(bytes).equals(Buffer.from(sentinel));
      })
      .toBe(false);
    const bytes = await page.evaluate(() => (window as unknown as HarnessWindow).__video.bytes());
    const path = info.outputPath(codec === 'vp9' ? 'video.webm' : 'video.mp4');
    writeFileSync(path, Buffer.from(bytes));
    const probe = JSON.parse(
      execFileSync(
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
      ),
    );
    expect(probe.streams[0]).toMatchObject({
      codec_name: codec,
      width: 320,
      height: 180,
      nb_read_frames: String(frames),
    });
    expect(Number(probe.format.duration)).toBeCloseTo(frames / 10, 6);
    execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-']);
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).__video.aborts)).toBe(0);
  });
}
