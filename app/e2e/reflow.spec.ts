import { expect, test, type Page } from './test';
import { openWithProject, readExample } from './helpers';

/* A narrow window — a phone, or the desktop at 400 % zoom (WCAG reflow: 320 CSS px wide): the
 * four panels stack, each as tall as most of the window, the page scrolls down and never
 * sideways, the bars wrap their controls; the resizable layout comes back with the room. */

const PANELS = ['panel-creator', 'panel-preview', 'panel-animations', 'panel-timeline'];

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth;
  });

/** The right edge of an element, relative to the window. */
const rightOf = async (page: Page, testId: string) => {
  const box = (await page.getByTestId(testId).boundingBox())!;
  return box.x + box.width;
};

test('at 320 px the panels stack in order and nothing needs a sideways scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await openWithProject(page, readExample('hello.mfe.json'));
  await expect(page.getByTestId('timeline-view')).toBeVisible();
  await expect(page.locator('main.app-main')).toHaveAttribute('data-layout', 'stacked');
  expect(await noSidewaysScroll(page)).toBe(true);

  // Top to bottom: Creator, Preview, Animations, Timeline; each at least most of the window.
  const boxes = await Promise.all(PANELS.map((id) => page.getByTestId(id).boundingBox()));
  for (let i = 1; i < boxes.length; i += 1) {
    expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
  }
  for (const box of boxes) {
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(box!.height).toBeGreaterThanOrEqual(240);
  }

  // The menu bar wraps: every menu button and the theme toggle are inside the window.
  for (const id of [
    'menu-file',
    'menu-edit',
    'menu-view',
    'menu-preferences',
    'menu-help',
    'export-button',
    'export-button-menu',
    'theme-toggle',
  ]) {
    expect(await rightOf(page, id)).toBeLessThanOrEqual(320);
  }
  await expect(page.getByTestId('project-name')).toBeVisible();

  // The main area scrolls to the panels below; their controls are usable there.
  await page.getByTestId('panel-timeline').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('timeline-snap')).toBeInViewport();
  expect(await rightOf(page, 'timeline-snap')).toBeLessThanOrEqual(320);
  await page.getByTestId('panel-preview').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('transport-play')).toBeInViewport();
  expect(await rightOf(page, 'transport-play')).toBeLessThanOrEqual(320);
  expect(await noSidewaysScroll(page)).toBe(true);

  // A menu near the right edge hangs from its button's right edge, inside the window.
  await page.getByTestId('export-button-menu').click();
  const exportMenu = page.getByRole('menu', { name: 'Export', exact: true });
  await expect(exportMenu).toBeVisible();
  const menuBox = (await exportMenu.boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(320);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.keyboard.press('Escape');

  // With the room back, the resizable panels return.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('main.app-main')).toHaveAttribute('data-layout', 'panels');
  await expect(page.getByTestId('mfe-layout-top')).toBeVisible();
  await expect(page.locator('.separator')).toHaveCount(3);
});
