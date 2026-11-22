import { expect, test } from './test';
import { clipJson, openTimeline, project } from './timelineHelpers';

interface DragImage {
  text: string | null;
  width: number;
  height: number;
  opacity: string;
  connected: boolean;
  offset: [number, number];
}

test.describe('Creator → Timeline drag image', () => {
  test('dragging a formula row shows a small semi-transparent chip, not the card', async ({
    page,
  }) => {
    // Record what the app passes to setDragImage (the browser's own drag image cannot be seen).
    await page.addInitScript(() => {
      const w = window as unknown as { __dragImages: DragImage[] };
      w.__dragImages = [];
      const original = DataTransfer.prototype.setDragImage;
      DataTransfer.prototype.setDragImage = function (element: Element, x: number, y: number) {
        const rect = element.getBoundingClientRect();
        w.__dragImages.push({
          text: element.textContent,
          width: rect.width,
          height: rect.height,
          opacity: getComputedStyle(element).opacity,
          connected: element.isConnected,
          offset: [x, y],
        });
        return original.call(this, element, x, y);
      };
    });
    await openTimeline(page, [clipJson('a', 'fa', 't1', 1, 4)]);

    const row = page.locator('[data-testid="formula-item"][data-formula-id="fb"]');
    const card = (await row.boundingBox())!;
    const events = await page.evaluate(() => {
      const log: string[] = [];
      for (const type of ['dragstart', 'drop']) {
        document.addEventListener(type, (event) => {
          const e = event as DragEvent;
          log.push(
            `${type}:${e.dataTransfer?.effectAllowed}:${e.dataTransfer?.getData('application/x-mfe-formula')}`,
          );
        });
      }
      (window as unknown as { __log: string[] }).__log = log;
      return log.length;
    });
    expect(events).toBe(0);

    await row.dragTo(page.getByTestId('track-lane-t2'));

    const images = await page.evaluate(
      () => (window as unknown as { __dragImages: DragImage[] }).__dragImages,
    );
    expect(images).toHaveLength(1);
    const chip = images[0]!;
    expect(chip.text).toContain('beta');
    expect(chip.connected).toBe(true); // in the document while the browser takes its snapshot
    expect(chip.height).toBeLessThanOrEqual(26);
    expect(chip.height).toBeLessThan(card.height / 2);
    expect(chip.width).toBeLessThan(card.width);
    expect(Number(chip.opacity)).toBeLessThan(1);

    // Taken down again once the drag has started; the drop still works as before.
    await expect(page.locator('.formula-drag-chip')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __log: string[] }).__log)).toEqual([
      'dragstart:copy:fb',
      'drop:copy:fb',
    ]);
    const dropped = (await project(page)).clips.filter((c) => c.id !== 'a');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ formulaId: 'fb', trackId: 't2' });
  });
});
