import { expect, test, type Locator } from './test';
import { addFormulaViaUi, showGlyphList, startApp } from './creatorHelpers';
import { openWithProject, type MfeWindow } from './helpers';
import { plain, relationProject } from './relationsHelpers';

/* Keyboard focus and selection look different (D27): focus is a blue halo outside the element,
 * selection the accent on its edge. */
test('keyboard focus is an outer halo of its own colour, unlike the selection', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  const items = page.getByTestId('formula-item');
  await items.nth(1).click(); // selected with the mouse: no focus halo
  await page.getByTestId('creator-search-open').focus(); // the magnifier of the search
  await page.keyboard.press('Tab'); // the key of the view (one, D179)
  await page.keyboard.press('Tab'); // the key of the kinds (its menu, D183)
  await page.keyboard.press('Tab'); // the size of the previews (one key, D183)
  await page.keyboard.press('Tab'); // + New
  await page.keyboard.press('Tab'); // its arrow (the kinds of object)
  await page.keyboard.press('Tab'); // the list's tab stop: the selected formula
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+ArrowUp'); // the focus moves, the selection stays
  await expect(items.nth(0)).toBeFocused();

  const look = (index: number) =>
    items.nth(index).evaluate((el) => {
      const style = getComputedStyle(el);
      const root = getComputedStyle(document.documentElement);
      return {
        outline: style.outlineStyle,
        offset: style.outlineOffset,
        color: style.outlineColor,
        border: style.borderColor,
        focusRing: root.getPropertyValue('--focus-ring').trim(),
        accent: root.getPropertyValue('--accent').trim(),
      };
    });
  const toRgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

  const focused = await look(0);
  expect(focused.outline).toBe('solid');
  expect(focused.offset).toBe('2px');
  expect(focused.color).toBe(toRgb(focused.focusRing));
  expect(focused.focusRing).not.toBe(focused.accent);

  const selected = await look(1);
  expect(selected.outline).toBe('none');
  expect(selected.border).toBe(toRgb(selected.accent));
});

test('a focused context-menu item and a focused Animations field show the focus outline', async ({
  page,
}) => {
  await openWithProject(page, relationProject([plain('a', 'fa', 't1', 0, 6)]));
  const outline = (locator: Locator) =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
  await page.getByTestId('formula-item').first().click({ button: 'right' });
  // The first item takes the focus as the menu opens (once it is placed: hidden until then).
  const items = page.getByTestId('formula-menu').getByRole('menuitem');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown'); // moved with the keyboard: the focus shows
  await expect(items.nth(1)).toBeFocused();
  const focused = page.locator('[role="menuitem"]:focus');
  await expect(focused).toHaveCount(1);
  expect(await outline(focused)).toEqual({ style: 'solid', width: '2px' });
  // Home and End reach the first and the last item.
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Escape');

  // The clip panel's fields keep the outline every field has.
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: ['a'] }),
  );
  await page.getByTestId('animations-tab-timing').click();
  const kind = page.getByTestId('intro-kind');
  await kind.focus();
  await expect(kind).toBeFocused();
  expect(await outline(kind)).toEqual({ style: 'solid', width: '2px' });
});

test('when the Animations panel changes view under the focus, the focus goes to its title', async ({
  page,
}) => {
  await openWithProject(page, relationProject([plain('a', 'fa', 't1', 0, 6)]));
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const id = mfe.useProjectStore.getState().project.formulas[0]!.id;
    mfe.useUiStore.getState().select({ kind: 'formula', id });
  });
  const selectClip = page.getByRole('button', { name: 'Select clip' });
  await selectClip.focus();
  await page.keyboard.press('Enter');
  const title = page.getByTestId('clip-title');
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
});

test('renaming a formula with F2 gives the focus back to its card', async ({ page }) => {
  await openWithProject(page, relationProject([]));
  const card = page.getByTestId('formula-item').first();
  await card.focus();
  await page.keyboard.press('F2');
  const input = card.getByRole('textbox');
  await expect(input).toBeFocused();
  await input.fill('alpha');
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('data-name', 'alpha');
  await expect(card).toBeFocused();
  await page.keyboard.press('F2');
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
});

test('a palette swatch reached with the keyboard shows the focus outline', async ({ page }) => {
  await startApp(page);
  const editor = await addFormulaViaUi(page, 'a+b');
  await showGlyphList(editor);
  await editor.getByTestId('glyph-chip-0').click();
  await editor.getByTestId('palette-YELLOW').click(); // with the mouse: no outline
  await page.keyboard.press('Tab'); // the next swatch, with the keyboard
  const gold = editor.getByTestId('palette-GOLD');
  await expect(gold).toBeFocused();
  const outline = await gold.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline).toEqual({ style: 'solid', width: '2px' });
});
