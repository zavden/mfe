import { expect, test, type Page } from './test';
import { openTwoApart, scenePoint } from './previewHelpers';
import { canvasBoxOf } from './uxHelpers';

/* The preview canvas sits on whole device pixels: its CSS box has an integer position and size
 * in device pixels and its bitmap is exactly that size, so the screen shows the bitmap 1:1 and a
 * one-pixel line (a snap guide) is one crisp row, not two blended ones. */

const near = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

async function bitmapOf(page: Page): Promise<[number, number]> {
  return page
    .getByTestId('preview-canvas')
    .evaluate((c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height]);
}

/** Whether the canvas box, in device pixels (`dpr` per CSS px), has integer edges and size, and
 * the bitmap matches it. */
async function alignedAt(page: Page, dpr: number): Promise<boolean> {
  const box = await canvasBoxOf(page);
  const [w, h] = await bitmapOf(page);
  const values = [box.x, box.y, box.width, box.height].map((v) => v * dpr);
  return (
    values.every(near) && w === Math.round(box.width * dpr) && h === Math.round(box.height * dpr)
  );
}

/** The rows of a one-pixel-wide column of the screen (at CSS x, over the canvas) whose colour is
 * exactly `hex`: what the compositor shows, not the bitmap. */
async function exactRowsOnScreen(page: Page, x: number, hex: string): Promise<number> {
  const box = await canvasBoxOf(page);
  const png = await page.screenshot({
    clip: { x, y: box.y, width: 1, height: box.height },
    scale: 'css',
  });
  return page.evaluate(
    async ([b64, color]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(color!.slice(i, i + 2), 16));
      let rows = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === r && data[i + 1] === g && data[i + 2] === b) rows += 1;
      }
      return rows;
    },
    [png.toString('base64'), hex] as const,
  );
}

test.describe('Preview pixels', () => {
  test('the canvas box and bitmap are whole device pixels, at any window size', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 }); // width-limited frame
    await openTwoApart(page);
    expect(await alignedAt(page, 1)).toBe(true);
    await page.setViewportSize({ width: 1920, height: 1080 }); // height-limited frame
    await expect.poll(() => alignedAt(page, 1)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(() => alignedAt(page, 1)).toBe(true);
    // The frame still fills the stage but for the padding and under a pixel of rounding.
    const stage = (await page.locator('.preview-stage').boundingBox())!;
    const box = await canvasBoxOf(page);
    expect(box.width).toBeGreaterThan(stage.width - 20 - 1);
    expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
  });

  test('the same at a device pixel ratio of 2', async ({ browser }) => {
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await openTwoApart(page);
    expect(await alignedAt(page, 2)).toBe(true);
    await context.close();
  });

  test('a horizontal snap guide shows as one crisp row on screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTwoApart(page);
    // Nudge beta up a little: it snaps to alpha (a shared edge or the centre line), with a
    // horizontal guide between the two formulas.
    const from = await scenePoint(page, [3, 0]);
    const to = await scenePoint(page, [3, 0.1]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-snap-guides', /y@/);
    const box = await canvasBoxOf(page);
    // A column between the two formulas, where only the guide is drawn.
    expect(await exactRowsOnScreen(page, Math.round(box.x + box.width / 2), '#ffe74c')).toBe(1);
    await page.mouse.up();
  });
});
