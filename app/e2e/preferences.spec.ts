import { expect, test, type Page } from './test';
import { canUndo, openWithProject, type MfeWindow } from './helpers';
import { clipJson, projectJson } from './timelineHelpers';

const preferences = (page: Page) =>
  page.evaluate(() => {
    const { snapObjects, guideColor, guideWidth, pickColor, scaleStep } = (
      window as MfeWindow
    ).__mfe!.usePreferences.getState();
    return { snapObjects, guideColor, guideWidth, pickColor, scaleStep };
  });

const openMenu = (page: Page) => page.getByTestId('menu-preferences').click();

/** Choose `item` of the submenu `submenu` of the open Preferences menu. */
async function choose(page: Page, submenu: string, item: string): Promise<void> {
  await page.getByTestId(`menu-item-preferences-${submenu}`).hover();
  await page.getByTestId(`menu-item-preferences-${submenu}-${item}`).click();
}

const SUBMENU_NAMES: Record<string, string> = {
  'guide-color': 'Guide colour',
  'guide-width': 'Guide width',
  'pick-color': 'Glyph selection colour',
};

/** The ids of the checked items of a submenu of the Preferences menu (open it and close it). */
async function checkedIn(page: Page, submenu: string): Promise<string[]> {
  await openMenu(page);
  await page.getByTestId(`menu-item-preferences-${submenu}`).hover();
  const items = page.getByRole('menu', { name: SUBMENU_NAMES[submenu] }).getByRole('menuitemradio');
  const ids: string[] = [];
  for (const item of await items.all()) {
    if ((await item.getAttribute('aria-checked')) === 'true') {
      const testId = (await item.getAttribute('data-testid'))!;
      ids.push(testId.slice(`menu-item-preferences-${submenu}-`.length));
    }
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  return ids;
}

test.beforeEach(async ({ page }) => {
  await openWithProject(page, projectJson([clipJson('ca', 'fa', 't1', 0, 4)]));
});

test.describe('Preferences menu', () => {
  test('sits between View and Help', async ({ page }) => {
    const labels = await page.getByTestId('menu-bar').locator('.menu-button').allTextContents();
    expect(labels).toEqual(['File', 'Edit', 'View', 'Preferences', 'Help']);
    await openMenu(page);
    await expect(page.getByRole('menu', { name: 'Preferences' })).toBeVisible();
    await expect(page.getByTestId('menu-item-preferences-snap-objects')).toContainText(
      'Snap to objects',
    );
    await expect(page.getByTestId('menu-item-preferences-guide-color')).toContainText(
      'Guide colour',
    );
    await expect(page.getByTestId('menu-item-preferences-guide-width')).toContainText(
      'Guide width',
    );
  });

  test('the guide colour is yellow by default, can be changed, and is remembered', async ({
    page,
  }) => {
    expect(await preferences(page)).toMatchObject({ guideColor: '#ffe74c', guideWidth: 'thin' });
    expect(await checkedIn(page, 'guide-color')).toEqual(['yellow']);

    await openMenu(page);
    await choose(page, 'guide-color', 'magenta');
    await expect(page.getByRole('menu', { name: 'Preferences' })).toHaveCount(0); // the menu closes
    expect((await preferences(page)).guideColor).toBe('#ff5c8d');
    expect(await checkedIn(page, 'guide-color')).toEqual(['magenta']);

    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    expect((await preferences(page)).guideColor).toBe('#ff5c8d');
    expect(await checkedIn(page, 'guide-color')).toEqual(['magenta']);
  });

  test('the glyph selection colour is the yellow of the guides by default, a preference of its own', async ({
    page,
  }) => {
    await openMenu(page);
    await expect(page.getByTestId('menu-item-preferences-pick-color')).toContainText(
      'Glyph selection colour',
    );
    await page.keyboard.press('Escape');
    expect(await preferences(page)).toMatchObject({ pickColor: '#ffe74c', guideColor: '#ffe74c' });
    expect(await checkedIn(page, 'pick-color')).toEqual(['yellow']);

    await openMenu(page);
    await choose(page, 'pick-color', 'cyan');
    await expect(page.getByRole('menu', { name: 'Preferences' })).toHaveCount(0); // the menu closes
    expect(await preferences(page)).toMatchObject({ pickColor: '#4cc9f0', guideColor: '#ffe74c' });
    expect(await checkedIn(page, 'pick-color')).toEqual(['cyan']);
    expect(await checkedIn(page, 'guide-color')).toEqual(['yellow']);
    // Its colours are the guides', each with its swatch.
    await openMenu(page);
    await page.getByTestId('menu-item-preferences-pick-color').hover();
    await expect(
      page.getByTestId('menu-item-preferences-pick-color-magenta').locator('.menu-swatch'),
    ).toHaveCSS('background-color', 'rgb(255, 92, 141)');
    await expect(
      page.getByRole('menu', { name: 'Glyph selection colour' }).getByRole('menuitemradio'),
    ).toHaveCount(6);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    expect((await preferences(page)).pickColor).toBe('#4cc9f0');
    expect(await checkedIn(page, 'pick-color')).toEqual(['cyan']);
  });

  test('each colour shows its swatch', async ({ page }) => {
    await openMenu(page);
    await page.getByTestId('menu-item-preferences-guide-color').hover();
    const colours = {
      yellow: 'rgb(255, 231, 76)',
      orange: 'rgb(255, 159, 28)',
      magenta: 'rgb(255, 92, 141)',
      cyan: 'rgb(76, 201, 240)',
      green: 'rgb(110, 231, 110)',
      white: 'rgb(255, 255, 255)',
    };
    for (const [id, rgb] of Object.entries(colours)) {
      const item = page.getByTestId(`menu-item-preferences-guide-color-${id}`);
      await expect(item).toContainText(id[0]!.toUpperCase() + id.slice(1));
      await expect(item.locator('.menu-swatch')).toHaveCSS('background-color', rgb);
    }
  });

  test('the guide width can be changed, and is remembered', async ({ page }) => {
    expect(await checkedIn(page, 'guide-width')).toEqual(['thin']);
    await openMenu(page);
    await choose(page, 'guide-width', 'thick');
    expect((await preferences(page)).guideWidth).toBe('thick');
    expect(await checkedIn(page, 'guide-width')).toEqual(['thick']);
    await openMenu(page);
    await choose(page, 'guide-width', 'regular');
    expect((await preferences(page)).guideWidth).toBe('regular');
    expect(await checkedIn(page, 'guide-width')).toEqual(['regular']);

    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    expect((await preferences(page)).guideWidth).toBe('regular');
    expect(await checkedIn(page, 'guide-width')).toEqual(['regular']);
  });

  test('the scale step: four presets, a custom number or fraction, remembered', async ({
    page,
  }) => {
    await openMenu(page);
    await page.getByTestId('menu-item-preferences-scale-step').hover();
    const steps = page.getByRole('menu', { name: 'Scale step' }).getByRole('menuitemradio');
    await expect(steps).toContainText(['0.05', '0.1', '0.15', '0.2', 'Custom…']); // ✓ 0.05
    await expect(page.getByTestId('menu-item-preferences-scale-step-0.05')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByTestId('menu-item-preferences-scale-step-0.1').click();
    expect((await preferences(page)).scaleStep).toBe('0.1');

    // Custom: a dialog takes a number or a fraction and shows its value.
    await openMenu(page);
    await choose(page, 'scale-step', 'custom');
    const dialog = page.getByTestId('scale-step-dialog');
    await expect(dialog).toBeVisible();
    const input = page.getByTestId('scale-step-input');
    await expect(input).toHaveValue('0.1');
    await expect(input).toBeFocused();
    await input.fill('abc');
    await expect(page.getByTestId('scale-step-error')).toBeVisible();
    await expect(page.getByTestId('scale-step-save')).toBeDisabled();
    await input.fill('1/3');
    await expect(page.getByTestId('scale-step-value')).toHaveText('= 0.3333');
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    expect((await preferences(page)).scaleStep).toBe('1/3');

    // Remembered, and shown back as typed.
    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    expect((await preferences(page)).scaleStep).toBe('1/3');
    await openMenu(page);
    await page.getByTestId('menu-item-preferences-scale-step').hover();
    const custom = page.getByTestId('menu-item-preferences-scale-step-custom');
    await expect(custom).toContainText('Custom (1/3 = 0.3333)…'); // behind its check mark
    await expect(custom).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  test('works with the keyboard', async ({ page }) => {
    await openMenu(page);
    await page.getByTestId('menu-item-preferences-snap-objects').focus();
    await page.keyboard.press('ArrowDown'); // the separator is skipped
    await expect(page.getByTestId('menu-item-preferences-guide-color')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('menu-item-preferences-guide-color-yellow')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('menu-item-preferences-guide-color-magenta')).toBeFocused();
    await page.keyboard.press('Enter');
    expect((await preferences(page)).guideColor).toBe('#ff5c8d');
    await expect(page.getByTestId('menu-preferences')).toBeFocused();
  });

  test('Snap to objects and the preview magnet mirror each other', async ({ page }) => {
    const magnet = page.getByTestId('preview-snap');
    const item = page.getByTestId('menu-item-preferences-snap-objects');
    await openMenu(page);
    await expect(item).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await expect(magnet).toHaveAttribute('aria-pressed', 'true');

    await item.click();
    expect((await preferences(page)).snapObjects).toBe(false);
    await expect(magnet).toHaveAttribute('aria-pressed', 'false');
    await openMenu(page);
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');

    await magnet.click();
    await expect(magnet).toHaveAttribute('aria-pressed', 'true');
    await openMenu(page);
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await item.click();
    await expect(magnet).toHaveAttribute('aria-pressed', 'false');
  });

  test('changing a preference is not a project edit: no undo step', async ({ page }) => {
    const before = await page.evaluate(() =>
      JSON.stringify((window as MfeWindow).__mfe!.useProjectStore.getState().project),
    );
    expect(await canUndo(page)).toBe(false);
    await openMenu(page);
    await choose(page, 'guide-color', 'cyan');
    await openMenu(page);
    await choose(page, 'guide-width', 'thick');
    await openMenu(page);
    await page.getByTestId('menu-item-preferences-snap-objects').click();
    expect(await preferences(page)).toEqual({
      snapObjects: false,
      guideColor: '#4cc9f0',
      guideWidth: 'thick',
      pickColor: '#ffe74c', // its own preference: the guides' colour does not move it
      scaleStep: '0.05',
    });
    expect(await canUndo(page)).toBe(false);
    expect(
      await page.evaluate(() =>
        JSON.stringify((window as MfeWindow).__mfe!.useProjectStore.getState().project),
      ),
    ).toBe(before);
  });
});

test.describe('Edit menu: Suggest morph pairs', () => {
  const item = (page: Page) => page.getByTestId('menu-item-edit-auto-suggest-morph-pairs');
  const suggest = (page: Page) =>
    page.evaluate(
      () => (window as MfeWindow).__mfe!.usePreferences.getState().autoSuggestMorphPairs,
    );

  test('a checkbox after the intro and outro entries, off by default, remembered', async ({
    page,
  }) => {
    await page.getByTestId('menu-edit').click();
    await expect(item(page)).toHaveText('Suggest morph pairs');
    await expect(item(page)).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(item(page)).toHaveAttribute('aria-checked', 'false');
    // The last entry of the menu, right after the default intro and outro.
    const entries = page.getByRole('menu', { name: 'Edit' }).locator('[role^="menuitem"]');
    const testIds = await entries.evaluateAll((all) =>
      all.map((e) => e.getAttribute('data-testid')),
    );
    expect(testIds.slice(-4)).toEqual([
      'menu-item-edit-auto-intro',
      'menu-item-edit-auto-outro',
      'menu-item-edit-default-animations',
      'menu-item-edit-auto-suggest-morph-pairs',
    ]);
    expect(await suggest(page)).toBe(false);

    await item(page).click();
    await expect(page.getByRole('menu', { name: 'Edit' })).toHaveCount(0);
    expect(await suggest(page)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    expect(await suggest(page)).toBe(true);
    await page.getByTestId('menu-edit').click();
    await expect(item(page)).toHaveAttribute('aria-checked', 'true');
    await expect(item(page)).toContainText('Suggest morph pairs'); // behind its check mark
    await item(page).click();
    expect(await suggest(page)).toBe(false);
  });

  test('works with the keyboard and is not a project edit', async ({ page }) => {
    expect(await canUndo(page)).toBe(false);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-default-animations').focus();
    await page.keyboard.press('ArrowDown');
    await expect(item(page)).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await suggest(page)).toBe(true);
    await expect(page.getByTestId('menu-edit')).toBeFocused();
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-auto-intro').focus();
    await page.keyboard.press('End'); // the last entry
    await expect(item(page)).toBeFocused();
    await page.keyboard.press(' ');
    expect(await suggest(page)).toBe(false);
    expect(await canUndo(page)).toBe(false);
  });
});
