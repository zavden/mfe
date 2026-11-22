import { expect, test, type Page } from './test';
import { canUndo, openWithProject, type MfeWindow } from './helpers';
import { clipJson, projectJson } from './timelineHelpers';

/* Preferences → Split suffix… (D169): the suffix "Split at playhead" adds to an object's name to
 * name the copy that takes the second half of the clip — `f1_s` by default. A preference of the
 * browser, not of the project: ASCII letters, digits and "_", at most 16 of them. */

const suffix = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.usePreferences.getState().splitSuffix);
const projectText = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify((window as MfeWindow).__mfe!.useProjectStore.getState().project),
  );
const item = (page: Page) => page.getByTestId('menu-item-preferences-split-suffix');

test.beforeEach(async ({ page }) => {
  await openWithProject(page, projectJson([clipJson('ca', 'fa', 't1', 0, 4)]));
});

test('Preferences → Split suffix… takes a suffix, shown in the menu and remembered', async ({
  page,
}) => {
  const before = await projectText(page);
  await page.getByTestId('menu-preferences').click();
  await expect(item(page)).toHaveText('Split suffix (_s)…');
  await item(page).click();
  const dialog = page.getByTestId('split-suffix-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Split suffix' })).toBeVisible();
  const input = page.getByTestId('split-suffix-input');
  await expect(input).toHaveValue('_s');
  await expect(input).toBeFocused();
  await expect(page.getByTestId('split-suffix-example')).toHaveText('f1 → f1_s');

  await input.fill('_part');
  await expect(page.getByTestId('split-suffix-example')).toHaveText('f1 → f1_part');
  await page.getByTestId('split-suffix-save').click();
  await expect(dialog).toHaveCount(0);
  expect(await suffix(page)).toBe('_part');

  // The menu shows it back.
  await page.getByTestId('menu-preferences').click();
  await expect(item(page)).toHaveText('Split suffix (_part)…');
  await page.keyboard.press('Escape');

  // A preference, not a project edit: no undo step, the project unchanged.
  expect(await canUndo(page)).toBe(false);
  expect(await projectText(page)).toBe(before);

  // Remembered by the browser.
  await page.reload();
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  expect(await suffix(page)).toBe('_part');
  await page.getByTestId('menu-preferences').click();
  await expect(item(page)).toHaveText('Split suffix (_part)…');
  await item(page).click();
  await expect(page.getByTestId('split-suffix-input')).toHaveValue('_part');
});

test('a text that is not a suffix cannot be saved, by the button or by Enter', async ({ page }) => {
  await page.getByTestId('menu-preferences').click();
  await item(page).click();
  const dialog = page.getByTestId('split-suffix-dialog');
  const input = page.getByTestId('split-suffix-input');
  const error = page.getByTestId('split-suffix-error');
  const save = page.getByTestId('split-suffix-save');

  await input.fill('');
  await expect(error).toHaveText('The suffix cannot be empty.');
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(save).toBeDisabled();

  for (const bad of ['-copy', '_s 2', 'é', 'a'.repeat(17)]) {
    await input.fill(bad);
    await expect(error).toContainText('at most 16 characters');
    await expect(page.getByTestId('split-suffix-example')).toHaveCount(0);
    await expect(save).toBeDisabled();
    await input.press('Enter');
    await expect(dialog).toBeVisible();
  }
  expect(await suffix(page)).toBe('_s');

  // Valid again: Enter saves it.
  await input.fill('_2');
  await expect(error).toHaveCount(0);
  await expect(save).toBeEnabled();
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(await suffix(page)).toBe('_2');

  // Cancel keeps what was saved.
  await page.getByTestId('menu-preferences').click();
  await item(page).click();
  await page.getByTestId('split-suffix-input').fill('_x');
  await page.getByTestId('split-suffix-cancel').click();
  await expect(dialog).toHaveCount(0);
  expect(await suffix(page)).toBe('_2');
});
