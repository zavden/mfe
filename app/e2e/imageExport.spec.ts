/* Export ▸ Image…: the frame at the playhead as a PNG file. The file written is opened: its
 * header says its size, and its pixels, read back by the browser, say what was drawn. */
import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import { COMPANION_URL } from './companionHelpers';
import { forceFallbackFilePaths } from './creatorHelpers';
import { openWithProject, readExample, setTime, type MfeWindow } from './helpers';

const HELLO = readExample('hello.mfe.json');

/** The header of a PNG file: its signature, then the IHDR chunk. */
function header(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    signature: [...bytes.subarray(0, 8)],
    chunk: String.fromCharCode(...bytes.subarray(12, 16)),
    width: view.getUint32(16),
    height: view.getUint32(20),
    /** 2: RGB, 6: RGB with an alpha channel. */
    colourType: bytes[25],
  };
}
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface Pixels {
  width: number;
  height: number;
  /** The top-left pixel: where nothing of the scene is drawn. */
  corner: number[];
  /** How many pixels are not as the corner is, and the box around them. */
  inked: number;
  box: { left: number; top: number; right: number; bottom: number } | null;
  /** The least and the most opaque pixel. */
  alpha: [number, number];
}

/** The pixels of a PNG file, decoded by the browser. */
function pixels(page: Page, bytes: Uint8Array): Promise<Pixels> {
  return page.evaluate(async (base64) => {
    const binary = atob(base64);
    const raw = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw], { type: 'image/png' }));
    const { width, height } = bitmap;
    const ctx = new OffscreenCanvas(width, height).getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    const corner = [...data.subarray(0, 4)];
    let inked = 0;
    let [left, top, right, bottom] = [width, height, -1, -1];
    let [least, most] = [255, 0];
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]!;
      if (alpha < least) least = alpha;
      if (alpha > most) most = alpha;
      if (
        data[i] === corner[0] &&
        data[i + 1] === corner[1] &&
        data[i + 2] === corner[2] &&
        alpha === corner[3]
      )
        continue;
      inked++;
      const x = (i / 4) % width;
      const y = Math.floor(i / 4 / width);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    return {
      width,
      height,
      corner,
      inked,
      box: inked > 0 ? { left, top, right, bottom } : null,
      alpha: [least, most] as [number, number],
    };
  }, Buffer.from(bytes).toString('base64'));
}

/** Loads `json` with every formula rendered by MathJax (no companion), the playhead at `time`. */
async function open(page: Page, json: string, time: number): Promise<void> {
  await page.route(`${COMPANION_URL}/**`, (route) => route.abort('connectionrefused'));
  await openWithProject(page, json);
  await page.waitForFunction(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const { formulas } = mfe.useProjectStore.getState().project;
    const { entries } = mfe.useRenderStore.getState();
    return formulas.every((formula) => entries[formula.id]?.status === 'ok');
  });
  await setTime(page, time);
}

async function openDialog(page: Page): Promise<void> {
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-image').click();
  await expect(page.getByTestId('export-image')).toBeVisible();
}

/** Presses Export and reads the file the browser downloads. */
async function exported(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  const downloading = page.waitForEvent('download');
  await page.getByTestId('image-start').click();
  const download = await downloading;
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
}

/** The picture of `json` at `time`, in an app started for it: `prepare` changes the project
 * first, `choose` the dialog's options. */
async function picture(
  page: Page,
  json: string,
  time: number,
  steps: { prepare?: (page: Page) => Promise<void>; choose?: (page: Page) => Promise<void> } = {},
): Promise<{ name: string; bytes: Uint8Array }> {
  await open(page, json, time);
  await steps.prepare?.(page);
  await openDialog(page);
  await steps.choose?.(page);
  return exported(page);
}

// The tests read the file from the download; with the File System Access API the dialog would ask
// where to write it instead (the last test but one gives it a picker of its own).
test.beforeEach(({ page }) => forceFallbackFilePaths(page));

test('Export ▸ Image… writes the frame at the playhead as a PNG of the project’s size', async ({
  page,
}) => {
  await open(page, HELLO, 1);
  await openDialog(page);
  await expect(page.getByTestId('image-instant')).toHaveText('At 1 s (00:01:00)');
  // It says what the picture has that the Preview may not show.
  await expect(page.getByTestId('export-image')).toContainText(
    'through the scene’s camera, and with the tracks hidden in the Preview drawn too',
  );
  await expect(page.getByTestId('image-scale-1')).toBeChecked();
  await expect(page.getByTestId('image-scale-1').locator('xpath=..')).toContainText(
    '1× · 1920 × 1080 (the project’s size)',
  );
  await expect(page.getByTestId('image-scale-2').locator('xpath=..')).toContainText(
    '2× · 3840 × 2160',
  );
  await expect(page.getByTestId('image-transparent')).not.toBeChecked();

  const file = await exported(page);
  // Named after the project and the instant: each frame of a project has its file.
  expect(file.name).toBe('Hello- one-to-one 1.00s.png');
  expect(header(file.bytes)).toMatchObject({
    signature: PNG_SIGNATURE,
    chunk: 'IHDR',
    width: 1920,
    height: 1080,
  });
  const drawn = await pixels(page, file.bytes);
  expect(drawn).toMatchObject({ width: 1920, height: 1080 });
  // The scene's background, opaque everywhere, and the formula on it.
  expect(drawn.corner).toEqual([0, 0, 0, 255]);
  expect(drawn.alpha).toEqual([255, 255]);
  expect(drawn.inked).toBeGreaterThan(1000);
  await expect(page.getByTestId('image-done')).toHaveText(
    /^Saved Hello- one-to-one 1\.00s\.png \(1920 × 1080, \d+ kB\)\.$/,
  );
  // The dialog stays, with the file to take again.
  await expect(page.getByTestId('image-download')).toBeVisible();
  await page.getByTestId('image-close').click();
  await expect(page.getByTestId('export-image')).toHaveCount(0);
});

test('at 2× the picture has twice the pixels of the same frame', async ({ page }) => {
  const boxes: NonNullable<Pixels['box']>[] = [];
  for (const scale of [1, 2] as const) {
    const file = await picture(page, HELLO, 1, {
      choose: (p) => p.getByTestId(`image-scale-${scale}`).check(),
    });
    expect(header(file.bytes)).toMatchObject({ width: 1920 * scale, height: 1080 * scale });
    if (scale === 2) {
      await expect(page.getByTestId('image-done')).toContainText('(3840 × 2160, ');
    }
    boxes.push((await pixels(page, file.bytes)).box!);
  }
  const [once, twice] = boxes as [NonNullable<Pixels['box']>, NonNullable<Pixels['box']>];
  // The formula is where it was, twice as large (a pixel of slack for the edges' rounding).
  for (const side of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(twice[side] - 2 * once[side])).toBeLessThanOrEqual(2);
  }
});

test('a transparent picture keeps what is drawn, over nothing', async ({ page }) => {
  const file = await picture(page, HELLO, 1, {
    choose: async (p) => {
      await p.getByTestId('image-transparent').check();
      await expect(p.getByTestId('export-image')).toContainText('Only what is drawn, over nothing');
    },
  });
  expect(header(file.bytes)).toMatchObject({ width: 1920, height: 1080, colourType: 6 });
  const drawn = await pixels(page, file.bytes);
  expect(drawn.corner).toEqual([0, 0, 0, 0]);
  expect(drawn.alpha).toEqual([0, 255]);
  expect(drawn.inked).toBeGreaterThan(1000);
});

test('the picture is of the playhead’s instant, with the tracks hidden in the Preview', async ({
  page,
}) => {
  /** The picture at `time`: its file's name and the box of what is drawn; `prepare` changes the
   * project first. */
  const at = async (time: number, prepare?: (page: Page) => Promise<void>) => {
    const file = await picture(page, HELLO, time, { prepare });
    return { name: file.name, box: (await pixels(page, file.bytes)).box };
  };
  // Hello: one formula during [0, 3), another during [2, 5), each in its place.
  const first = await at(1);
  const second = await at(4);
  expect(first.box).not.toBeNull();
  expect(second.box).not.toBeNull();
  expect(second.box).not.toEqual(first.box);
  // Each has a file of its own, named with its instant.
  expect([first.name, second.name]).toEqual([
    'Hello- one-to-one 1.00s.png',
    'Hello- one-to-one 4.00s.png',
  ]);
  // Hiding a track is a toggle of the Preview: the picture, as a video, draws it all the same.
  const hidden = await at(1, async () => {
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      mfe.useProjectStore.getState().update((draft) => {
        for (const track of draft.tracks) track.hidden = true;
      });
    });
  });
  expect(hidden.box).toEqual(first.box);
});

test('the dialog opens as it was left, for the pictures of a session; a reload starts again', async ({
  page,
}) => {
  await open(page, HELLO, 1);
  await openDialog(page);
  await page.getByTestId('image-scale-2').check();
  await page.getByTestId('image-transparent').check();
  // Left so without exporting, or after a picture: the next one starts from it.
  await page.getByTestId('image-close').click();
  await setTime(page, 4);
  await openDialog(page);
  await expect(page.getByTestId('image-scale-2')).toBeChecked();
  await expect(page.getByTestId('image-transparent')).toBeChecked();
  const file = await exported(page);
  expect(header(file.bytes)).toMatchObject({ width: 3840, height: 2160, colourType: 6 });
  await page.getByTestId('image-close').click();
  // Changed back, it is that which is kept.
  await openDialog(page);
  await page.getByTestId('image-transparent').uncheck();
  await page.getByTestId('image-close').click();
  await openDialog(page);
  await expect(page.getByTestId('image-scale-2')).toBeChecked();
  await expect(page.getByTestId('image-transparent')).not.toBeChecked();

  // It is the session's, not a preference: a page loaded again has the project's size, opaque.
  await open(page, HELLO, 1);
  await openDialog(page);
  await expect(page.getByTestId('image-scale-1')).toBeChecked();
  await expect(page.getByTestId('image-transparent')).not.toBeChecked();
});

test('the picture is filmed through the scene’s camera', async ({ page }) => {
  // The camera example: from 2.5 s to 3.9 s its camera rests in a frame 3 units tall.
  const camera = readExample('camera.mfe.json');
  const without = JSON.stringify({ ...JSON.parse(camera), camera: undefined });
  const inked: number[] = [];
  for (const json of [camera, without]) {
    const file = await picture(page, json, 3);
    inked.push((await pixels(page, file.bytes)).inked);
  }
  const [close, still] = inked as [number, number];
  expect(still).toBeGreaterThan(1000);
  // Seen from 3 units instead of 8, what is in the frame covers several times the pixels.
  expect(close).toBeGreaterThan(3 * still);
});

test('the picture is the one of the click, whatever moves while the browser asks where it goes', async ({
  page,
}) => {
  // The picture of 1 s, to compare with.
  const reference = await pixels(page, (await picture(page, HELLO, 1)).bytes);
  await page.getByTestId('image-close').click();

  // A browser with file pickers: the picker gives a file of the page's own storage, when told to.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('frame.png', { create: true });
    const w = window as unknown as {
      showOpenFilePicker: () => Promise<unknown>;
      showSaveFilePicker: (options: { suggestedName: string }) => Promise<unknown>;
      __picker: { asked: string | null; release(): void };
    };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    w.__picker = { asked: null, release };
    // The app takes a browser for one with pickers when it has the two of them.
    w.showOpenFilePicker = () => Promise.reject(new DOMException('No file', 'AbortError'));
    w.showSaveFilePicker = async (options) => {
      w.__picker.asked = options.suggestedName;
      await gate;
      return handle;
    };
  });
  await openDialog(page);
  await page.getByTestId('image-start').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __picker: { asked: string } }).__picker.asked),
    )
    .toBe('Hello- one-to-one 1.00s.png');
  // While the picker is open the playhead goes elsewhere, and the project changes.
  await setTime(page, 4);
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      draft.meta.background = '#ff0000';
    });
  });
  await page.evaluate(() =>
    (window as unknown as { __picker: { release(): void } }).__picker.release(),
  );
  await expect(page.getByTestId('image-done')).toHaveText(
    /^Written to frame\.png \(1920 × 1080, \d+ kB\)\.$/,
  );
  // Written to the file chosen: nothing to download again.
  await expect(page.getByTestId('image-download')).toHaveCount(0);
  const written = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle('frame.png')).getFile();
    return [...new Uint8Array(await file.arrayBuffer())];
  });
  const drawn = await pixels(page, Uint8Array.from(written));
  expect(drawn.corner).toEqual([0, 0, 0, 255]);
  expect(drawn.box).toEqual(reference.box);
  expect(drawn.inked).toBe(reference.inked);
});

test('Export waits for a formula that is rendering, and the dialog stops the playback', async ({
  page,
}) => {
  await open(page, HELLO, 0);
  await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setPlaying(true));
  await openDialog(page);
  // The instant is the playhead's: it stays where the dialog found it.
  await expect
    .poll(() => page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().playing))
    .toBe(false);
  const instant = await page.getByTestId('image-instant').textContent();
  await expect(page.getByTestId('image-start')).toBeEnabled();

  // A render in progress, anywhere on the timeline.
  const name = await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const formula = mfe.useProjectStore.getState().project.formulas[1]!;
    const { entries, setEntry } = mfe.useRenderStore.getState();
    setEntry(formula.id, { ...entries[formula.id]!, status: 'loading' });
    return formula.name;
  });
  await expect(page.getByTestId('image-waiting-formulas')).toHaveText(
    `Waiting for a formula to render (${name})…`,
  );
  await expect(page.getByTestId('image-start')).toBeDisabled();
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const formula = mfe.useProjectStore.getState().project.formulas[1]!;
    const { entries, setEntry } = mfe.useRenderStore.getState();
    setEntry(formula.id, { ...entries[formula.id]!, status: 'ok' });
  });
  await expect(page.getByTestId('image-waiting-formulas')).toHaveCount(0);
  await expect(page.getByTestId('image-start')).toBeEnabled();
  await expect(page.getByTestId('image-instant')).toHaveText(instant!);
});
