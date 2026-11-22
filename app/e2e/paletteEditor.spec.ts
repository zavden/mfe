import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import { addFormulaViaUi, closeEditor, startApp } from './creatorHelpers';
import { canUndo, getProject } from './helpers';

async function openLibrary(page: Page) {
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-editor-palettes').click();
  await expect(page.getByTestId('palette-library')).toBeVisible();
}

const entries = (page: Page) => page.getByTestId('palette-library').getByRole('option');

/** Press Export JSON and read the file it writes. */
async function exportSelected(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('palette-export').click();
  const file = await download;
  return {
    fileName: file.suggestedFilename(),
    text: readFileSync(await file.path(), 'utf8'),
  };
}

test('a palette is made in the editor, duplicated, and exported under the name it has there', async ({
  page,
}) => {
  await startApp(page);
  const before = await getProject(page);
  await openLibrary(page);
  await expect(entries(page)).toHaveCount(1);

  // From the keyboard: the button keeps the focus while the palette is saved, so the next key
  // goes where the last one did.
  await page.getByTestId('palette-new').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('palette-name')).toHaveValue('New palette');
  await expect(entries(page)).toHaveCount(2);
  await expect(page.getByTestId('palette-new')).toBeFocused();
  // Made, not activated: Manim defaults stay the active choice.
  await expect(page.getByTestId('palette-defaults')).toContainText('Active');
  await expect(page.getByTestId('palette-activate')).toBeEnabled();

  await page.getByTestId('palette-name').fill('Lesson 3');
  await page.getByTestId('palette-rename').click();
  await expect(entries(page).nth(1)).toHaveText('Lesson 3');
  await page.getByTestId('palette-duplicate').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('palette-name')).toHaveValue('Lesson 3 copy');
  await expect(entries(page)).toHaveCount(3);
  await expect(page.getByTestId('palette-duplicate')).toBeFocused();
  await expect(entries(page).nth(2)).toHaveAttribute('aria-selected', 'true');

  const exported = await exportSelected(page);
  expect(exported.fileName).toBe('Lesson-3-copy.manim-palette.json');
  expect(JSON.parse(exported.text)).toMatchObject({
    format: 'manim-palette',
    version: 1,
    name: 'Lesson 3 copy',
    colors: { background: '#000000', formula: '#FFFFFF', rectangle: '#FFFF00' },
  });

  // That file is the palette it came from: importing it adds nothing and shows the entry.
  await entries(page).nth(1).click();
  await expect(page.getByTestId('palette-name')).toHaveValue('Lesson 3');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('palette-import').click();
  await (
    await chooser
  ).setFiles({
    name: exported.fileName,
    mimeType: 'application/json',
    buffer: Buffer.from(exported.text),
  });
  await expect(page.getByTestId('palette-name')).toHaveValue('Lesson 3 copy');
  await expect(entries(page)).toHaveCount(3);
  await expect(page.getByTestId('palette-library-error')).toHaveCount(0);

  // Nothing of this is the project's: no change, no undo step.
  expect(await getProject(page)).toEqual(before);
  expect(await canUndo(page)).toBe(false);

  // The library is the browser's: it is there after a reload.
  await page.getByTestId('palette-library-done').click();
  await page.reload();
  await openLibrary(page);
  await expect(entries(page)).toHaveText(['Manim defaults · Active', 'Lesson 3', 'Lesson 3 copy']);
});

test('the colors of a palette are edited in place: new objects follow the active one, the project does not', async ({
  page,
}) => {
  await startApp(page);
  await addFormulaViaUi(page, 'x+y');
  await closeEditor(page);
  const before = await getProject(page);
  expect(before.formulas[0]).toMatchObject({ color: '#FFFFFF' });

  await openLibrary(page);
  await page.getByTestId('palette-new').click();
  await expect(page.getByTestId('palette-name')).toHaveValue('New palette');
  await page.getByTestId('palette-activate').click();
  await expect(page.getByTestId('palette-activate')).toBeDisabled();
  await expect(page.getByTestId('palette-library')).toContainText('This palette is active');

  // A typed color, and one chosen in the native picker.
  const formula = page.getByTestId('palette-color-formula-hex');
  await formula.fill('f80');
  await formula.press('Enter');
  await expect(formula).toHaveValue('#FF8800');
  await page.getByTestId('palette-color-background').fill('#102030');
  await expect(page.getByTestId('palette-color-background-hex')).toHaveValue('#102030');
  // Tab from one field to the next keeps the keyboard in the list while the first is saved.
  const text = page.getByTestId('palette-color-text-hex');
  await text.fill('#00ffcc');
  await text.press('Tab');
  await expect(text).toHaveValue('#00FFCC');
  await expect(page.getByTestId('palette-color-muted')).toBeFocused();
  await expect(page.getByTestId('palette-library-error')).toHaveCount(0);
  // The sample is drawn in the colors as they now are.
  const sample = page.getByTestId('palette-sample');
  await expect(sample).toHaveCSS('background-color', 'rgb(16, 32, 48)');
  await expect(sample.locator('[data-role="formula"]').first()).toHaveCSS(
    'color',
    'rgb(255, 136, 0)',
  );
  await expect(sample.locator('[data-role="text"]')).toHaveCSS('color', 'rgb(0, 255, 204)');

  // What the project has keeps its colors.
  expect(await getProject(page)).toEqual(before);

  await page.getByTestId('palette-library-done').click();
  await addFormulaViaUi(page, 'a+b');
  await closeEditor(page);
  const after = await getProject(page);
  expect(after.formulas).toMatchObject([{ color: '#FFFFFF' }, { color: '#FF8800' }]);
  expect(after.meta.background).toBe(before.meta.background);

  // The colors are the browser's: they are there after a reload.
  await page.reload();
  await openLibrary(page);
  await expect(page.getByTestId('palette-color-formula-hex')).toHaveValue('#FF8800');
  await expect(page.getByTestId('palette-color-background-hex')).toHaveValue('#102030');
  await expect(page.getByTestId('palette-color-text-hex')).toHaveValue('#00FFCC');
  const exported = await exportSelected(page);
  expect(JSON.parse(exported.text)).toMatchObject({
    name: 'New palette',
    backgroundMode: 'manual',
    colors: { background: '#102030', formula: '#FF8800', text: '#00FFCC', muted: '#FFFFFF' },
  });
});

test('a role of the user’s is added in the palette editor, travels in the exported file and is offered by its name where a role is chosen', async ({
  page,
}) => {
  await startApp(page);
  await openLibrary(page);
  await page.getByTestId('palette-new').click();
  await expect(page.getByTestId('palette-name')).toHaveValue('New palette');

  // A name and a color, then Enter in the name: the role is the palette's, saved at once.
  await page.getByTestId('palette-custom-new-name').fill('highlight');
  await page.getByTestId('palette-custom-new-color-hex').fill('#ffd400');
  await page.getByTestId('palette-custom-new-color-hex').press('Enter');
  await page.getByTestId('palette-custom-new-name').press('Enter');
  await expect(page.getByTestId('palette-custom-name-0')).toHaveValue('highlight');
  await expect(page.getByTestId('palette-custom-color-0-hex')).toHaveValue('#FFD400');
  await expect(page.getByTestId('palette-custom-new-name')).toHaveValue('');
  // One of the eleven names is not a name for it, and says so.
  await page.getByTestId('palette-custom-new-name').fill('Formula');
  await expect(page.getByTestId('palette-custom-new-error')).toContainText(
    'one of the roles every palette has',
  );
  await expect(page.getByTestId('palette-custom-add')).toBeDisabled();
  await page.getByTestId('palette-custom-new-name').fill('accent 2');
  await page.getByTestId('palette-custom-add').click();
  await expect(page.getByTestId('palette-custom-name-1')).toHaveValue('accent 2');
  await page.getByTestId('palette-custom-delete-1').click();
  await expect(page.getByTestId('palette-custom-name-1')).toHaveCount(0);

  // The exported file has the eleven roles as ever, and the user's in a field of their own.
  const exported = await exportSelected(page);
  const file = JSON.parse(exported.text) as {
    colors: Record<string, string>;
    customRoles: unknown;
  };
  expect(Object.keys(file.colors)).toHaveLength(11);
  expect(file.customRoles).toEqual([{ name: 'highlight', color: '#FFD400' }]);
  // Deleted and imported from that file, the palette comes back with its role.
  await page.getByTestId('palette-delete').click();
  await expect(entries(page)).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('palette-import').click();
  await (
    await chooser
  ).setFiles({
    name: exported.fileName,
    mimeType: 'application/json',
    buffer: Buffer.from(exported.text),
  });
  await expect(page.getByTestId('palette-custom-name-0')).toHaveValue('highlight');
  await page.getByTestId('palette-activate').click();
  await page.getByTestId('palette-library-done').click();

  // The Roles button of a color field: every role with its name, the user's under their heading.
  const editor = await addFormulaViaUi(page, 'x');
  await editor.getByTestId('editor-color-roles').click();
  await expect(page.getByTestId('editor-color-role-formula')).toHaveText('formula');
  await expect(page.getByTestId('editor-color-role-arrow')).toHaveText('arrow');
  await expect(page.getByTestId('editor-color-custom-roles')).toHaveText('Your roles');
  const highlight = page.getByTestId('editor-color-custom-role-0');
  await expect(highlight).toHaveText('highlight');
  // The names are read whole: the pop-up does not cut its blocks.
  const menu = (await page.getByTestId('editor-color-role-menu').boundingBox())!;
  const block = (await page.getByTestId('editor-color-role-formula').boundingBox())!;
  expect(block.x + block.width).toBeLessThanOrEqual(menu.x + menu.width);
  await highlight.click();
  await expect(page.getByTestId('editor-color-role-menu')).toHaveCount(0);
  await expect(editor.getByTestId('editor-color-hex')).toHaveValue('#FFD400');
});
