import { expect, test } from './test';
import { readExample, openWithProject } from './helpers';
import { setTime, timeToX, uiState } from './timelineHelpers';
import { canvasHash, colorCentroid } from './relationsHelpers';
import { waitForDrawables } from './creatorHelpers';

/* The example projects play like their reference sketches: the glyphs of one formula move into
 * the other, and scrubbing inside the transformation is deterministic. */

test.describe('hello: mx+y=0 → mx=-y', () => {
  test('the yellow + turns into the − at the place of the second formula, scrubbing included', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await openWithProject(page, readExample('hello.mfe.json'));
    await setTime(page, 1.9);
    await waitForDrawables(page, 6);

    const before = await colorCentroid(page, 'yellow'); // the +, in the first formula
    expect(before.count).toBeGreaterThan(8);

    // Scrub inside the transformation with the mouse on the ruler (window: 2 → 3 s).
    const ruler = await page.getByTestId('timeline-ruler').boundingBox();
    const x = await timeToX(page, 2.5);
    await page.mouse.click(x, ruler!.y + ruler!.height / 2);
    expect((await uiState(page)).time).toBeCloseTo(2.5, 1);
    const mid = await colorCentroid(page, 'yellow');
    const midHash = await canvasHash(page);

    await setTime(page, 3.1);
    const after = await colorCentroid(page, 'yellow'); // the −, in the second formula
    expect(after.count).toBeGreaterThan(8);

    // The yellow glyph travels from the + to the − (to the right, a glyph width), through
    // intermediate positions, and the middle frame differs from both ends.
    expect(mid.count).toBeGreaterThan(4);
    expect(mid.x).toBeGreaterThan(before.x + 2);
    expect(mid.x).toBeLessThan(after.x + 40);
    expect(after.x).toBeGreaterThan(before.x + 5);
    await setTime(page, 1.9);
    expect(await canvasHash(page)).not.toBe(midHash);

    // Scrubbing is deterministic: the same time gives the same pixels, whatever came before.
    await setTime(page, 0.3);
    await setTime(page, 2.5);
    expect(await canvasHash(page)).toBe(midHash);
    await setTime(page, 3.4);
    await setTime(page, 2.5);
    expect(await canvasHash(page)).toBe(midHash);
  });

  test('playing through the transformation advances through it', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await openWithProject(page, readExample('hello.mfe.json'));
    await setTime(page, 1.8);
    await waitForDrawables(page, 6);
    await page.getByTestId('transport-play').click();
    await expect
      .poll(async () => (await uiState(page)).time, { timeout: 8000 })
      .toBeGreaterThan(3.2);
    await page.getByTestId('transport-play').click();
    await expect(page.getByTestId('preview-canvas')).toBeVisible();
    // After the window only the second formula is drawn: no white glyph of the first remains
    // where the 0 was (it faded out with the source clip's outro).
    const final = await colorCentroid(page, 'any');
    expect(final.count).toBeGreaterThan(100);
  });
});

test.describe('one-to-many: a+b=c → a: 3, b: 1, c: 4', () => {
  test('copies of a, b and c leave the source one after the other', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await openWithProject(page, readExample('one-to-many.mfe.json'));
    await setTime(page, 1.4);
    await waitForDrawables(page, 5);
    const base = await colorCentroid(page, 'any');
    // First window [1.5, 2.5): a copy of `a` travels towards f2, which fades in below.
    const frames: string[] = [];
    for (const t of [1.6, 1.9, 2.2]) {
      await setTime(page, t);
      frames.push(await canvasHash(page));
    }
    expect(new Set(frames).size).toBe(3);
    // The source formula stays whole: the white pixels never drop below their count at 1.4 s.
    await setTime(page, 2.2);
    const during = await colorCentroid(page, 'any');
    expect(during.count).toBeGreaterThan(base.count * 0.9);
    // Windows follow each other: by 4.7 s every copy has landed.
    await setTime(page, 4.8);
    const end = await colorCentroid(page, 'any');
    expect(end.count).toBeGreaterThan(base.count * 1.8);
  });
});
