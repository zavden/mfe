import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { openWithProject, projectFile, setTime, type MfeWindow } from './helpers';
import { clipJson, projectJson } from './timelineHelpers';
import { canvasBoxOf, type Point } from './uxHelpers';

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Two clips apart on screen: alpha at x = −3 and beta at x = 3, both until 4 s. */
async function openTwoApart(page: Page): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 4);
  ca.initial.position = [-3, 0];
  const cb = clipJson('cb', 'fb', 't2', 0, 4);
  cb.initial.position = [3, 0];
  await openWithProject(page, projectJson([ca, cb]));
  await setTime(page, 2);
  await waitForDrawables(page, 9);
}

/** Page coordinates of a scene point, with the whole 16:9 frame shown (Fit). */
async function scenePoint(page: Page, [x, y]: Point): Promise<{ x: number; y: number }> {
  const box = await canvasBoxOf(page);
  const frameWidth = (8 * 16) / 9;
  return {
    x: box.x + box.width / 2 + (x * box.width) / frameWidth,
    y: box.y + box.height / 2 - (y * box.height) / 8,
  };
}

/** The whole formula's box of a clip at its initial position (scale 1, no rotation). */
async function boxOf(page: Page, clipId: string): Promise<Box> {
  return page.evaluate((id) => {
    const mfe = (window as MfeWindow).__mfe!;
    const clip = mfe.useProjectStore.getState().project.clips.find((c) => c.id === id)!;
    const [x, y] = (clip as unknown as { initial: { position: [number, number] } }).initial
      .position;
    const { bbox } = (
      mfe.useRenderStore.getState().resolved.get(clip.formulaId) as { render: { bbox: Box } }
    ).render;
    return { minX: x + bbox.minX, minY: y + bbox.minY, maxX: x + bbox.maxX, maxY: y + bbox.maxY };
  }, clipId);
}

const positionOf = async (page: Page, clipId: string) =>
  page.evaluate(
    (id) =>
      (
        (window as MfeWindow)
          .__mfe!.useProjectStore.getState()
          .project.clips.find((c) => c.id === id) as unknown as {
          initial: { position: [number, number] };
        }
      ).initial.position,
    clipId,
  );

const guidesOf = (page: Page) => page.getByTestId('preview-frame').getAttribute('data-snap-guides');

/** How many pixels of the preview canvas are exactly `hex` ('#rrggbb'). */
const pixelsOf = (page: Page, hex: string) =>
  page.evaluate((color) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count += 1;
    }
    return count;
  }, hex);

test.describe('Preview snapping', () => {
  test('a dragged clip sticks to the edge of another, with a guide; Ctrl held suspends it', async ({
    page,
  }) => {
    await openTwoApart(page);
    const a = await boxOf(page, 'ca');
    const b = await boxOf(page, 'cb');
    const half = (b.maxX - b.minX) / 2;
    // Put beta's left edge 0.06 units right of alpha's right edge: within the 8 px snap distance.
    const aimed = a.maxX + 0.06 + half;
    const from = await scenePoint(page, [3, 0]);
    const to = await scenePoint(page, [aimed, 0]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    expect(await guidesOf(page)).toContain(`x@${a.maxX.toFixed(4)}`);
    await page.mouse.up();
    expect(await guidesOf(page)).toBe('');
    const snapped = await positionOf(page, 'cb');
    expect(snapped[0]).toBeCloseTo(a.maxX + half, 6); // the edges meet exactly
    expect(snapped[1]).toBeCloseTo(0, 6); // and the centres (y) too

    // The same drag with Ctrl held goes where the pointer goes.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'cb')).toEqual([3, 0]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.move(to.x, to.y + 3, { steps: 8 });
    expect(await guidesOf(page)).toBe('');
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    const free = await positionOf(page, 'cb');
    expect(Math.abs(free[0] - aimed)).toBeLessThan(0.03);
    expect(free[0]).not.toBeCloseTo(a.maxX + half, 4);
  });

  test('spacing: between two formulas it sits as far from both; beyond them it keeps their gap', async ({
    page,
  }) => {
    // alpha at -5.5 and beta at 0.5 in a row; gamma, at 4.5, is dragged.
    const ca = clipJson('ca', 'fa', 't1', 0, 4);
    ca.initial.position = [-5.5, 0];
    const cb = clipJson('cb', 'fb', 't2', 0, 4);
    cb.initial.position = [0.5, 0];
    const cc = clipJson('cc', 'fc', 't3', 0, 4);
    cc.initial.position = [4.5, 0];
    const formulas = [
      { id: 'fa', name: 'alpha', source: 'alpha', color: '#58C4DD' },
      { id: 'fb', name: 'beta', source: 'beta', color: '#83C167' },
      { id: 'fc', name: 'gamma', source: 'gamma', color: '#FC6255' },
    ];
    const tracks = ['t1', 't2', 't3'].map((id) => ({ id, name: id, hidden: false, locked: false }));
    await openWithProject(page, projectFile('spacing', formulas, [ca, cb, cc], { tracks }));
    await setTime(page, 2);
    await waitForDrawables(page, 14); // 5 + 4 + 5 glyphs
    const a = await boxOf(page, 'ca');
    const b = await boxOf(page, 'cb');
    const c = await boxOf(page, 'cc');
    const drag = async (travel: number) => {
      const from = await scenePoint(page, [4.5, 0]);
      const to = await scenePoint(page, [4.5 + travel, 0]);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
    };

    // Between alpha and beta, 0.06 right of the spot as far from both: the two gaps are spans.
    const gap = (b.minX - a.maxX - (c.maxX - c.minX)) / 2;
    expect(gap).toBeGreaterThan(0.3);
    const between = a.maxX + gap - c.minX;
    await drag(between + 0.06);
    expect(await guidesOf(page)).toContain(`x=${gap.toFixed(4)}`);
    await page.mouse.up();
    expect((await positionOf(page, 'cc'))[0]).toBeCloseTo(4.5 + between, 5);

    // Beyond beta, 0.06 short of the gap alpha and beta keep: it lands at that gap.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'cc')).toEqual([4.5, 0]);
    const kept = b.minX - a.maxX;
    const beyond = b.maxX + kept - c.minX;
    await drag(beyond - 0.06);
    expect(await guidesOf(page)).toContain(`x=${kept.toFixed(4)}`);
    await page.mouse.up();
    expect((await positionOf(page, 'cc'))[0]).toBeCloseTo(4.5 + beyond, 5);
  });

  test('the guides are drawn in the preferred colour and width, yellow and thin by default', async ({
    page,
  }) => {
    await openTwoApart(page);
    const a = await boxOf(page, 'ca');
    const b = await boxOf(page, 'cb');
    const from = await scenePoint(page, [3, 0]);
    const to = await scenePoint(page, [a.maxX + 0.06 + (b.maxX - b.minX) / 2, 0]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    expect(await guidesOf(page)).toContain(`x@${a.maxX.toFixed(4)}`);

    const setPreferences = (patch: { guideColor?: string; guideWidth?: string }) =>
      page.evaluate((p) => (window as MfeWindow).__mfe!.usePreferences.getState().set(p), patch);
    const YELLOW = '#ffe74c';
    const MAGENTA = '#ff5c8d';
    await expect.poll(() => pixelsOf(page, YELLOW)).toBeGreaterThan(50);
    const thin = await pixelsOf(page, YELLOW);
    expect(await pixelsOf(page, MAGENTA)).toBe(0);

    // The preference repaints the guides while the drag goes on.
    await setPreferences({ guideColor: MAGENTA });
    await expect.poll(() => pixelsOf(page, MAGENTA)).toBe(thin);
    expect(await pixelsOf(page, YELLOW)).toBe(0);
    await setPreferences({ guideWidth: 'thick' });
    await expect.poll(() => pixelsOf(page, MAGENTA)).toBeGreaterThan(2 * thin);
    await page.mouse.up();
  });

  test('the magnet button turns the snapping off, and the choice survives a reload', async ({
    page,
  }) => {
    await openTwoApart(page);
    const snap = page.getByTestId('preview-snap');
    await expect(snap).toHaveAttribute('aria-pressed', 'true');
    await snap.click();
    await expect(snap).toHaveAttribute('aria-pressed', 'false');
    const a = await boxOf(page, 'ca');
    const b = await boxOf(page, 'cb');
    const half = (b.maxX - b.minX) / 2;
    const aimed = a.maxX + 0.06 + half;
    const from = await scenePoint(page, [3, 0]);
    const to = await scenePoint(page, [aimed, 0]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    expect(await guidesOf(page)).toBe('');
    await page.mouse.up();
    const free = await positionOf(page, 'cb');
    expect(Math.abs(free[0] - aimed)).toBeLessThan(0.03);
    expect(free[0]).not.toBeCloseTo(a.maxX + half, 4);

    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    await expect(page.getByTestId('preview-snap')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('preview-snap').click();
    await expect(page.getByTestId('preview-snap')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a dragged clip sticks to the centre of the frame', async ({ page }) => {
    // Alone on screen: the frame's centre lines are the only targets.
    const ca = clipJson('ca', 'fa', 't1', 0, 4);
    ca.initial.position = [-3, 0];
    await openWithProject(page, projectJson([ca]));
    await setTime(page, 2);
    await waitForDrawables(page, 5);
    const from = await scenePoint(page, [-3, 0]);
    const to = await scenePoint(page, [0.05, 0.04]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    const guides = (await guidesOf(page))!.split(' ');
    expect(guides).toContain('x@0.0000');
    expect(guides).toContain('y@0.0000');
    await page.mouse.up();
    expect(await positionOf(page, 'ca')).toEqual([0, 0]);
  });
});
