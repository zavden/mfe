import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { openWithProject, setTime } from './helpers';
import { clipJson, projectJson } from './timelineHelpers';

/* The view's toolbar of the preview (align by symbol, handles, snap, the zoom): in the title bar
 * of the Preview panel, off the picture. */

async function open(page: Page): Promise<void> {
  await openWithProject(page, projectJson([clipJson('ca', 'fa', 't1', 0, 4)]));
  await setTime(page, 2);
  await waitForDrawables(page, 1);
}

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test('the view toolbar sits at the end of the title bar of the Preview panel, off the picture', async ({
  page,
}) => {
  await open(page);
  const tools = await box(page, '[data-testid="preview-tools"]');
  const header = await box(page, '[data-testid="panel-preview"] .panel-header');
  const frame = await box(page, '[data-testid="preview-frame"]');
  const title = await box(page, '[data-testid="panel-preview"] .panel-title');
  // Inside the bar, at its far end, after the title.
  expect(tools.y).toBeGreaterThanOrEqual(header.y);
  expect(tools.y + tools.height).toBeLessThanOrEqual(header.y + header.height);
  expect(header.x + header.width - (tools.x + tools.width)).toBeLessThan(16);
  expect(tools.x).toBeGreaterThan(title.x + title.width);
  // Nothing of it is over the picture: its corner is the canvas's.
  expect(tools.y + tools.height).toBeLessThanOrEqual(frame.y);
  const corner = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.tagName,
    [frame.x + frame.width - 20, frame.y + 20],
  );
  expect(corner).toBe('CANVAS');
  // It works from there.
  const label = page.getByTestId('preview-zoom-label');
  await expect(label).toHaveText('100%');
  await page.getByTestId('preview-zoom-in').click();
  await expect(label).not.toHaveText('100%');
  await page.getByTestId('preview-fit').click();
  await expect(label).toHaveText('100%');
  await page.getByTestId('preview-snap').click();
  await expect(page.getByTestId('preview-snap')).toHaveAttribute('aria-pressed', 'false');
});

test('a title bar too narrow for the title and the toolbar keeps the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const panel = page.getByTestId('panel-preview');
  const header = (await panel.locator('.panel-header').boundingBox())!;
  const tools = (await page.getByTestId('preview-tools').boundingBox())!;
  // The whole toolbar is in the bar, its last button within reach.
  expect(tools.x).toBeGreaterThanOrEqual(header.x);
  expect(tools.x + tools.width).toBeLessThanOrEqual(header.x + header.width);
  await expect(page.getByTestId('preview-fit')).toBeInViewport();
  // The title is not drawn, and still names the panel for assistive technology.
  const title = (await panel.locator('.panel-title').boundingBox())!;
  expect(title.width).toBeLessThanOrEqual(1);
  await expect(panel.getByRole('heading', { name: 'Preview' })).toHaveCount(1);
});
