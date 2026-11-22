import { expect, test, type Locator, type Page } from './test';
import { addFormulaViaUi, showGlyphList, startApp } from './creatorHelpers';
import { getProject } from './helpers';
import { openTwoApart } from './previewHelpers';
import { glyph, openRelationScene, plain, selectClip } from './relationsHelpers';

/* Right-click menus of the glyph views: the formula editor (colour, hide, show the selection) and
 * the relation editor (style, delete the links of the selected glyphs). */

test('formula editor: a right-click colours, hides and shows the selected glyphs', async ({
  page,
}) => {
  await startApp(page);
  const editor = await addFormulaViaUi(page, 'a+b=c');
  const menu = page.getByTestId('glyph-menu');
  const formula = async () => (await getProject(page)).formulas[0]!;
  // Nothing selected: a right-click on the background opens nothing.
  const view = (await editor.locator('.glyph-svg').boundingBox())!;
  await page.mouse.click(view.x + 4, view.y + 4, { button: 'right' });
  await expect(menu).toHaveCount(0);

  await showGlyphList(editor);
  await editor.getByTestId('glyph-chip-0').click();
  await editor.getByTestId('glyph-chip-2').click({ modifiers: ['Shift'] });
  await editor.getByTestId('glyph-1').click({ button: 'right' });
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('glyph-menu-header')).toHaveText('3 glyphs: 0, 1, 2');
  await expect(page.getByTestId('glyph-menu-clear-color')).toBeDisabled();
  await expect(page.getByTestId('glyph-menu-show')).toBeDisabled();
  await page.getByTestId('glyph-menu-color-YELLOW').click();
  await expect(menu).toHaveCount(0);
  expect((await formula()).glyphColors).toEqual({ '0': '#FFFF00', '1': '#FFFF00', '2': '#FFFF00' });

  // On a glyph outside the selection, it becomes the selection.
  await editor.getByTestId('glyph-4').click({ button: 'right' });
  await expect(page.getByTestId('glyph-menu-header')).toHaveText('Glyph 4: c');
  await expect(editor.getByTestId('glyph-selection')).toHaveText('1 selected: 4');
  await page.getByTestId('glyph-menu-hide').click();
  expect((await formula()).hiddenGlyphs).toEqual([4]);
  await editor.getByTestId('glyph-chip-4').click({ button: 'right' });
  await expect(page.getByTestId('glyph-menu-hide')).toBeDisabled();
  await page.getByTestId('glyph-menu-show').click();
  expect((await formula()).hiddenGlyphs).toEqual([]);

  // Escape closes the menu, not the editor; so does a press outside it.
  await editor.getByTestId('glyph-0').click({ button: 'right' });
  await page.getByTestId('glyph-menu-clear-color').click();
  expect((await formula()).glyphColors).toEqual({ '1': '#FFFF00', '2': '#FFFF00' });
  await editor.getByTestId('glyph-1').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(editor).toBeVisible();
  await editor.getByTestId('glyph-1').click({ button: 'right' });
  await page.mouse.click(view.x + 4, view.y + 4);
  await expect(menu).toHaveCount(0);
});

const A = plain('a', 'fa', 't1', 0, 6); // a+b=c
const B = plain('b', 'fb', 't2', 2, 8); // a=3+1

async function openEditorWithTwoLinks(page: Page): Promise<void> {
  await openRelationScene(page, [A, B]);
  await selectClip(page, 'a');
  await page.getByTestId('create-relation-other').selectOption('b');
  await page.getByTestId('create-relation-button').click();
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'to', 'a').click();
  await glyph(page, 'from', '=').click();
  await glyph(page, 'to', '=').click();
  await expect(page.locator('[data-testid^="rel-junction-"]')).toHaveCount(2);
}

test('relation editor: a right-click styles and deletes the links of the selected glyphs', async ({
  page,
}) => {
  await openEditorWithTwoLinks(page);
  const menu = page.getByTestId('rel-style-menu');
  const badges = page.locator('[data-testid^="rel-junction-"]');
  // Select both source glyphs, then right-click one of them.
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'from', '=').click({ modifiers: ['ControlOrMeta'] });
  await glyph(page, 'from', '=').click({ button: 'right' });
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('rel-style-menu-header')).toHaveText(
    '2 links of the selected glyphs',
  );
  await expect(page.getByTestId('rel-style-menu-inherit')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('rel-style-menu-copy').click();
  await expect(menu).toHaveCount(0);
  await expect(badges.nth(0)).toHaveAttribute('data-style', 'C');
  await expect(badges.nth(1)).toHaveAttribute('data-style', 'C');

  // On its side, a glyph outside the selection becomes the selection: its single link. (On the
  // other side it would join the selection, for a link: linkAs.spec.ts.)
  await page.getByTestId('rel-clear-selection').click();
  await glyph(page, 'to', 'a').click();
  await glyph(page, 'to', '=').click({ button: 'right' });
  await expect(page.getByTestId('rel-style-menu-header')).toHaveText('= → =');
  await page.getByTestId('rel-style-menu-fade').click();
  await expect(page.locator('[data-testid="rel-junction-1"]')).toHaveAttribute('data-style', 'F');
  await expect(page.locator('[data-testid="rel-junction-0"]')).toHaveAttribute('data-style', 'C');

  // Unlinked glyphs: the menu says so and offers nothing.
  await page.getByTestId('rel-clear-selection').click();
  await glyph(page, 'from', 'b').click({ button: 'right' });
  await expect(page.getByTestId('rel-style-menu-header')).toHaveText(
    'The selected glyphs are not linked',
  );
  await expect(page.getByTestId('rel-style-menu-delete')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('relation-editor')).toBeVisible();

  // Delete both links: one confirmation, held for 0.7 s.
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'from', '=').click({ modifiers: ['ControlOrMeta'] });
  await glyph(page, 'from', 'a').click({ button: 'right' });
  await expect(page.getByTestId('rel-style-menu-delete')).toHaveText('Delete 2 links…');
  await page.getByTestId('rel-style-menu-delete').click();
  const dialog = page.getByTestId('dialog');
  await expect(dialog).toContainText('Delete these 2 links?');
  await expect(page.getByTestId('dialog-details')).toContainText('a → a');
  const confirm = page.getByTestId('dialog-confirm');
  await confirm.hover();
  await page.mouse.down();
  await page.waitForTimeout(850);
  await page.mouse.up();
  await expect(dialog).toBeHidden();
  await expect(badges).toHaveCount(0);
  await expect(page.getByTestId('relation-editor')).toBeVisible();
});

interface MenuEvent {
  trusted: boolean;
  x: number;
  y: number;
}

/** The browser dressed as a Mac: the app then answers the menu key itself
 * (`ui/contextMenuKey.ts`), as it does on a real one, where this changes nothing and no browser
 * would send the event. Returns a reader of the `contextmenu` events the page saw. */
async function dressedAsMac(page: Page): Promise<() => Promise<MenuEvent[]>> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
    const seen: { trusted: boolean; x: number; y: number }[] = [];
    (window as unknown as { menuEvents: typeof seen }).menuEvents = seen;
    document.addEventListener(
      'contextmenu',
      (event) => seen.push({ trusted: event.isTrusted, x: event.clientX, y: event.clientY }),
      true,
    );
  });
  return () => page.evaluate(() => (window as unknown as { menuEvents: MenuEvent[] }).menuEvents);
}

/** The middle of an element's box, on whole pixels: where the event of the menu key goes. */
async function middle(target: Locator): Promise<{ x: number; y: number }> {
  const box = (await target.boundingBox())!;
  return { x: Math.floor(box.x + box.width / 2), y: Math.floor(box.y + box.height / 2) };
}

test('where the browser has no menu key (a Mac), Shift+F10 still opens the menu of the focused card', async ({
  page,
}) => {
  const menuEvents = await dressedAsMac(page);
  await openTwoApart(page);
  const card = page.getByTestId('formula-item').first();
  await card.click();
  await expect(card).toBeFocused();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('formula-menu-duplicate')).toBeVisible();
  // One event, the app's, at the middle of the card: where a browser that has the key puts it.
  expect(await menuEvents()).toEqual([{ trusted: false, ...(await middle(card)) }]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('formula-menu-duplicate')).toHaveCount(0);
});

test('there, Shift+F10 opens the menu of the glyphs too: the view that has the focus is an SVG', async ({
  page,
}) => {
  const menuEvents = await dressedAsMac(page);
  await startApp(page);
  const editor = await addFormulaViaUi(page, 'a+b=c');
  await editor.getByTestId('glyph-1').click();
  const view = editor.locator('.glyph-svg');
  await expect(view).toBeFocused();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('glyph-menu-header')).toHaveText('Glyph 1: +');
  expect(await menuEvents()).toEqual([{ trusted: false, ...(await middle(view)) }]);
});
