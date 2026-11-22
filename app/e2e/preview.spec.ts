import { expect, test, type Page } from './test';
import { canvasStats, startApp, waitForDrawables } from './creatorHelpers';
import {
  canUndo,
  getProject,
  openWithProject,
  readExample,
  selectionOf,
  setTime,
  type MfeWindow,
} from './helpers';

/** At t = 1.5 the first clip of the example is fully on screen (its Write intro ended at 1 s and
 * the fade-out starts at 2 s), with or without animation support in the evaluator. */
async function openHello(page: Page, time = 1.5): Promise<void> {
  await openWithProject(page, readExample('hello.mfe.json'));
  await setTime(page, time);
  await waitForDrawables(page, 6);
}

async function canvasBox(page: Page) {
  const box = await page.getByTestId('preview-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

test.describe('Preview', () => {
  test('draws examples/hello.mfe.json white on black, centred, with the yellow plus', async ({
    page,
  }) => {
    // A frame big enough for the bars of the "+", about a pixel thick, to be more than a few pixels.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHello(page);
    const stats = await canvasStats(page);
    expect(stats.bounds).not.toBeNull();
    const b = stats.bounds!;
    // Centred on the frame (the formula's box is centred on its position (0, 0)).
    expect((b.minX + b.maxX) / 2).toBeGreaterThan(stats.width * 0.45);
    expect((b.minX + b.maxX) / 2).toBeLessThan(stats.width * 0.55);
    expect((b.minY + b.maxY) / 2).toBeGreaterThan(stats.height * 0.4);
    expect((b.minY + b.maxY) / 2).toBeLessThan(stats.height * 0.6);
    // Smaller than the frame, white glyphs plus the yellow "+", on a black background.
    expect(b.maxX - b.minX).toBeLessThan(stats.width * 0.5);
    expect(stats.white).toBeGreaterThan(100);
    expect(stats.yellow).toBeGreaterThan(5);
    const corner = await page.getByTestId('preview-canvas').evaluate((c) => {
      const ctx = (c as HTMLCanvasElement).getContext('2d')!;
      return [...ctx.getImageData(5, 5, 1, 1).data];
    });
    expect(corner).toEqual([0, 0, 0, 255]);
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-drawable-count', '6');
  });

  test('frame follows the project aspect ratio and background', async ({ page }) => {
    await openHello(page);
    let box = (await page.getByTestId('preview-frame').boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        const meta = (
          draft as unknown as { meta: { width: number; height: number; background: string } }
        ).meta;
        meta.width = 1000;
        meta.height = 1000;
        meta.background = '#102030';
      });
    });
    box = (await page.getByTestId('preview-frame').boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(1, 1);
    // The canvas is resized and redrawn on the next frames: wait for the new background.
    const pixel = () =>
      page.getByTestId('preview-canvas').evaluate((c) => {
        const ctx = (c as HTMLCanvasElement).getContext('2d')!;
        return [...ctx.getImageData(5, 5, 1, 1).data];
      });
    await expect.poll(pixel).toEqual([16, 32, 48, 255]);
  });

  test('the canvas follows the device pixel ratio', async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await openHello(page);
    const box = await canvasBox(page);
    const size = await page.getByTestId('preview-canvas').evaluate((c) => ({
      width: (c as HTMLCanvasElement).width,
      height: (c as HTMLCanvasElement).height,
    }));
    expect(size.width).toBeGreaterThanOrEqual(Math.floor(box.width * 2) - 1);
    expect(size.width).toBeLessThanOrEqual(Math.ceil(box.width * 2) + 1);
    expect(size.height / size.width).toBeCloseTo(box.height / box.width, 1);
    await context.close();
  });

  test('clicking selects the clip and highlights its formula; empty space deselects', async ({
    page,
  }) => {
    await openHello(page);
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['c_a1'] });
    await expect(page.locator('[data-testid="formula-item"][data-name="a1"]')).toHaveAttribute(
      'data-linked',
      'true',
    );

    // The selection box is an overlay on the canvas, not a drawable.
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-drawable-count', '6');

    await page.mouse.click(box.x + 20, box.y + 20);
    expect(await selectionOf(page)).toEqual({ kind: 'none' });
    await expect(page.locator('[data-testid="formula-item"][data-name="a1"]')).toHaveAttribute(
      'data-linked',
      'false',
    );
  });

  test('hovering highlights the glyph under the cursor', async ({ page }) => {
    await openHello(page);
    const box = await canvasBox(page);
    // Find a point well inside some glyph: the middle of the longest run of ink in the rows
    // around the canvas's middle (the first inked pixel of a row is a stroke's soft edge).
    const point = await page.getByTestId('preview-canvas').evaluate((c) => {
      const canvas = c as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const middle = Math.floor(canvas.height / 2);
      let best: { x: number; y: number; length: number } | null = null;
      for (let y = middle - 12; y <= middle + 12; y++) {
        const row = ctx.getImageData(0, y, canvas.width, 1).data;
        let start = -1;
        for (let x = 0; x <= canvas.width; x++) {
          const ink = x < canvas.width && row[x * 4]! > 200;
          if (ink && start < 0) start = x;
          if (!ink && start >= 0) {
            const length = x - start;
            // The middle of the run, at the middle of its row of pixels.
            if (!best || length > best.length) best = { x: start + length / 2, y: y + 0.5, length };
            start = -1;
          }
        }
      }
      return best;
    });
    expect(point).not.toBeNull();
    const scale =
      box.width /
      (await page.getByTestId('preview-canvas').evaluate((c) => (c as HTMLCanvasElement).width));
    await page.mouse.move(box.x + point!.x * scale, box.y + point!.y * scale);
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-hover', /^c_a1:\d$/);
    await page.mouse.move(box.x + 10, box.y + 10);
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-hover', '');
  });

  test('zoom with the buttons and Ctrl+wheel, pan with Alt+drag and the middle button, Fit', async ({
    page,
  }) => {
    await openHello(page);
    const frame = page.getByTestId('preview-frame');
    await expect(page.getByTestId('preview-fit')).toBeDisabled();
    await page.getByTestId('preview-zoom-in').click();
    await expect(frame).toHaveAttribute('data-zoom', '1.250');
    await expect(page.getByTestId('preview-zoom-label')).toHaveText('125%');
    await page.getByTestId('preview-zoom-out').click();
    await page.getByTestId('preview-zoom-out').click();
    await expect(frame).toHaveAttribute('data-zoom', '0.800');

    // The Manim frame boundary shows when zoomed out: the letterbox is the theme colour.
    const outside = await page.getByTestId('preview-canvas').evaluate((c) => {
      const ctx = (c as HTMLCanvasElement).getContext('2d')!;
      return [...ctx.getImageData(2, 2, 1, 1).data];
    });
    expect(outside.slice(0, 3)).not.toEqual([0, 0, 0]);

    await page.getByTestId('preview-fit').click();
    await expect(frame).toHaveAttribute('data-zoom', '1.000');

    const box = await canvasBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.wheel(0, -300); // wheel up = zoom in
    await page.keyboard.up('ControlOrMeta');
    await expect
      .poll(async () => Number(await frame.getAttribute('data-zoom')))
      .toBeGreaterThan(1.5);

    // Alt + drag on empty space (below the formula: over it, Alt picks glyphs) pans: the view
    // centre moves opposite to the pointer.
    const before = (await frame.getAttribute('data-center'))!.split(',').map(Number);
    await page.keyboard.down('Alt');
    await page.mouse.move(cx, cy + 120);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 120, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const after = (await frame.getAttribute('data-center'))!.split(',').map(Number);
    expect(after[0]!).toBeLessThan(before[0]!);
    expect(Math.abs(after[1]! - before[1]!)).toBeLessThan(0.01);
    // Alt+drag did not select or move anything.
    expect(await selectionOf(page)).toEqual({ kind: 'none' });
    expect((await getProject(page)).clips).toHaveLength(2);

    // Middle button pans too.
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx, cy + 60, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    const panned = (await frame.getAttribute('data-center'))!.split(',').map(Number);
    expect(panned[1]!).toBeGreaterThan(after[1]!);

    await page.getByTestId('preview-fit').click();
    await expect(frame).toHaveAttribute('data-center', '0.000,0.000');
  });

  test('dragging the selected clip moves it as one undo step; Escape cancels', async ({ page }) => {
    await openHello(page);
    const box = await canvasBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const unitsPerPixel = (8 * (16 / 9)) / box.width; // frame width in scene units / canvas width

    // Ctrl held after the press suspends the snapping (its own spec: previewSnap.spec.ts).
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.move(cx + 60, cy - 30, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    const moved = (await getProject(page)).clips.find((c) => c.id === 'c_a1') as unknown as {
      initial: { position: [number, number] };
    };
    expect(moved.initial.position[0]).toBeCloseTo(60 * unitsPerPixel, 1);
    expect(moved.initial.position[1]).toBeCloseTo(30 * unitsPerPixel, 1); // up is +y
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['c_a1'] });

    // The whole drag is one undo step.
    await page.keyboard.press('ControlOrMeta+z');
    const undone = (await getProject(page)).clips.find((c) => c.id === 'c_a1') as unknown as {
      initial: { position: [number, number] };
    };
    expect(undone.initial.position).toEqual([0, 0]);

    // Escape in mid-drag restores the position and leaves no history behind.
    await page.keyboard.press('ControlOrMeta+Shift+z'); // redo the first drag so history is non-trivial
    await page.keyboard.press('ControlOrMeta+z');
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy, { steps: 5 });
    const live = (await getProject(page)).clips.find((c) => c.id === 'c_a1') as unknown as {
      initial: { position: [number, number] };
    };
    expect(live.initial.position[0]).toBeGreaterThan(1);
    await page.keyboard.press('Escape');
    await page.mouse.move(cx + 140, cy, { steps: 3 });
    await page.mouse.up();
    const cancelled = (await getProject(page)).clips.find((c) => c.id === 'c_a1') as unknown as {
      initial: { position: [number, number] };
    };
    expect(cancelled.initial.position).toEqual([0, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('a click without movement does not edit the project', async ({ page }) => {
    await openHello(page);
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await canUndo(page)).toBe(false);
  });

  test('clips on locked tracks can be selected but not moved', async ({ page }) => {
    await openHello(page);
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        (draft as unknown as { tracks: { locked: boolean }[] }).tracks[0]!.locked = true;
      });
    });
    const box = await canvasBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy, { steps: 4 });
    await page.mouse.up();
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['c_a1'] });
    const clip = (await getProject(page)).clips.find((c) => c.id === 'c_a1') as unknown as {
      initial: { position: [number, number] };
    };
    expect(clip.initial.position).toEqual([0, 0]);
  });

  test('redraws when the theme changes and when formulas change colour', async ({ page }) => {
    await startApp(page);
    await page.getByTestId('preview-zoom-out').click();
    await page.getByTestId('preview-zoom-out').click();
    const letterbox = () =>
      page.getByTestId('preview-canvas').evaluate((c) => {
        const ctx = (c as HTMLCanvasElement).getContext('2d')!;
        return [...ctx.getImageData(2, 2, 1, 1).data].slice(0, 3);
      });
    const dark = await letterbox();
    await page.getByTestId('theme-toggle').click();
    await expect.poll(letterbox).not.toEqual(dark);
  });
});
