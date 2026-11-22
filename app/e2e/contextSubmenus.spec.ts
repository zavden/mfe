import { expect, test } from './test';
import { openSubmenu } from './helpers';
import { openTwoApart, scenePoint } from './previewHelpers';

/* The sections of a long context menu are submenus (R1): an entry with a › chevron whose panel
 * opens beside it, level with it, on hover or from the keyboard. One submenu is open at a time;
 * → opens, ← closes and goes back to the entry, Escape closes the whole menu. */

const menu = (page: Parameters<typeof openSubmenu>[0]) => page.getByTestId('preview-menu');

test('the clip menu of the preview keeps Copy properties at the top and the rest in submenus', async ({
  page,
}) => {
  await openTwoApart(page);
  const at = await scenePoint(page, [-3, 0]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(page.getByTestId('preview-menu-copy-properties')).toBeFocused();
  for (const entry of ['paste', 'align', 'distribute', 'brace', 'shape', 'match']) {
    const button = page.getByTestId(`preview-menu-${entry}`);
    await expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(page.getByTestId('preview-menu-align')).toHaveText('Align›');
  await expect(page.getByTestId('preview-menu-align')).toHaveAccessibleName('Align');
  // Closed: the items are not in the page.
  await expect(page.getByTestId('preview-menu-align-left')).toHaveCount(0);

  // Hover opens a panel beside its entry, level with it; hovering another entry swaps it.
  await openSubmenu(page, 'preview-menu-align');
  const entry = (await page.getByTestId('preview-menu-align').boundingBox())!;
  const panel = (await page.getByTestId('preview-menu-align-submenu').boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(entry.x + entry.width - 1);
  expect(Math.abs(panel.y + 5 - entry.y)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('preview-menu-align')).toHaveAttribute('aria-expanded', 'true');
  await openSubmenu(page, 'preview-menu-distribute');
  await expect(page.getByTestId('preview-menu-align-submenu')).toHaveCount(0);
  await expect(page.getByTestId('preview-menu-distribute-h')).toBeVisible();
  // Hovering a plain item closes it.
  await page.getByTestId('preview-menu-copy-properties').hover();
  await expect(page.getByTestId('preview-menu-distribute-submenu')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
});

test('the submenus are walked with the keyboard: → opens, ← goes back, Escape closes all', async ({
  page,
}) => {
  await openTwoApart(page);
  const at = await scenePoint(page, [-3, 0]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu-copy-properties')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('preview-menu-paste')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('preview-menu-align')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('preview-menu-align-left')).toBeFocused();
  // The arrows stay inside the panel.
  await page.keyboard.press('End');
  await expect(page.getByTestId('preview-menu-align-symbol')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('preview-menu-align-left')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('preview-menu-align-submenu')).toHaveCount(0);
  await expect(page.getByTestId('preview-menu-align')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('preview-menu-align-left')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByTestId('preview-menu-align-submenu')).toHaveCount(0);
});
