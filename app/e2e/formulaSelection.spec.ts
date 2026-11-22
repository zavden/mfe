import { expect, test } from './test';
import { pinMathJax } from './creatorHelpers';
import { CONTROL_ITSELF, LIST_TOGGLE_KEYS, openWithProject } from './helpers';
import { relationProject } from './relationsHelpers';
import { uiState } from './timelineHelpers';

/* Several formulas selected in the Creator list: Ctrl/⌘+click toggles, Shift+click a range. */
const FORMULAS = ['a+b', 'c=d', 'x^2', 'y'].map((latex, i) => ({
  id: `f${i}`,
  name: `f${i}`,
  source: latex,
}));

test('Ctrl+click toggles formulas, Shift+click selects a range', async ({ page }) => {
  await openWithProject(page, relationProject([], FORMULAS));
  await pinMathJax(page);
  const items = page.getByTestId('formula-item');
  await expect(items).toHaveCount(4);
  const selected = async () =>
    items.evaluateAll((els) =>
      els.filter((e) => e.getAttribute('data-selected') === 'true').map((e) => e.dataset.name),
    );

  await items.nth(0).click();
  expect(await selected()).toEqual(['f0']);
  await items.nth(2).click({ modifiers: ['ControlOrMeta'] });
  expect(await selected()).toEqual(['f0', 'f2']);
  expect((await uiState(page)).selection).toEqual({ kind: 'formulas', ids: ['f0', 'f2'] });
  await expect(page.getByTestId('animations-formulas')).toContainText('2 formulas selected');
  // From the last clicked (f2) to f3; then with Ctrl as well, f0…f2 is added.
  await items.nth(3).click({ modifiers: ['Shift'] });
  expect(await selected()).toEqual(['f2', 'f3']);
  await items.nth(0).click({ modifiers: ['Shift', 'ControlOrMeta'] });
  expect(await selected()).toEqual(['f0', 'f1', 'f2', 'f3']);
  // Ctrl+click takes one out; a plain click leaves just one.
  await items.nth(1).click({ modifiers: ['ControlOrMeta'] });
  expect(await selected()).toEqual(['f0', 'f2', 'f3']);
  await items.nth(1).click();
  expect(await selected()).toEqual(['f1']);
  expect((await uiState(page)).selection).toEqual({ kind: 'formula', id: 'f1' });
});

test('the formula list works from the keyboard: arrows, Shift, Ctrl+Space', async ({ page }) => {
  await openWithProject(page, relationProject([]));
  await pinMathJax(page);
  const list = page.getByRole('listbox', { name: 'Formulas' });
  const options = list.getByRole('option');
  await expect(options).toHaveCount(2);
  const selection = async () => (await uiState(page)).selection;

  // One tab stop: the first formula when nothing is selected.
  await page.getByTestId('creator-search-open').focus(); // the magnifier of the search
  await page.keyboard.press('Tab'); // the key of the view (one, D179)
  await page.keyboard.press('Tab'); // the key of the kinds (its menu, D183)
  await page.keyboard.press('Tab'); // the size of the previews (one key, D183)
  await page.keyboard.press('Tab'); // + New
  await page.keyboard.press('Tab'); // its arrow (the kinds of object)
  await page.keyboard.press('Tab');
  await expect(options.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toBeFocused();
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  const [first, second] = await options.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-formula-id')!),
  );
  expect(await selection()).toEqual({ kind: 'formula', id: second });

  await page.keyboard.press('Shift+ArrowUp');
  expect(await selection()).toEqual({ kind: 'formulas', ids: [first, second] });
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

  // The focused (first) one leaves the selection: Ctrl+Space, or ⌘+Return on a Mac.
  await page.keyboard.press(LIST_TOGGLE_KEYS);
  expect(await selection()).toEqual({ kind: 'formula', id: second });
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');

  // The card's buttons are not tab stops: Tab leaves the list.
  await page.keyboard.press('Tab');
  await expect(list.locator(':focus')).toHaveCount(0);
});

// ⌘+Space opens Spotlight on a Mac and Ctrl+Space changes the keyboard's language: the system
// may keep both from the page. There ⌘+Return is the key, the click with ⌘ of the keyboard.
test('on a Mac ⌘+Return adds the focused formula to the selection or takes it out', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
  });
  await openWithProject(page, relationProject([]));
  await pinMathJax(page);
  const options = page.getByRole('listbox', { name: 'Formulas' }).getByRole('option');
  await expect(options).toHaveCount(2);
  const selection = async () => (await uiState(page)).selection;
  const [first, second] = await options.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-formula-id')!),
  );
  // The first formula selected, and the focus taken to the second without selecting it (⌘+↓).
  await options.nth(0).focus();
  await page.keyboard.press('Space');
  expect(await selection()).toEqual({ kind: 'formula', id: first });
  await page.keyboard.press('Meta+ArrowDown');
  await expect(options.nth(1)).toBeFocused();
  expect(await selection()).toEqual({ kind: 'formula', id: first });
  // ⌘+Return: the second joins the first; again, it leaves. The editor Return opens stays shut.
  await page.keyboard.press('Meta+Enter');
  expect(await selection()).toEqual({ kind: 'formulas', ids: [first, second] });
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Meta+Enter');
  expect(await selection()).toEqual({ kind: 'formula', id: first });
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);
  // Return alone is still the key that opens the formula.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('formula-editor')).toBeVisible();
});

test('elsewhere Ctrl+Enter is Enter: it opens the focused formula', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' });
  });
  await openWithProject(page, relationProject([]));
  await pinMathJax(page);
  const options = page.getByRole('listbox', { name: 'Formulas' }).getByRole('option');
  await options.nth(0).focus();
  await page.keyboard.press(`${CONTROL_ITSELF}+Enter`);
  await expect(page.getByTestId('formula-editor')).toBeVisible();
});

test('undoing a new formula leaves nothing selected', async ({ page }) => {
  await openWithProject(page, relationProject([], FORMULAS));
  await page.getByTestId('creator-new').click();
  await expect(page.getByTestId('formula-editor')).toBeVisible();
  await page.getByTestId('formula-editor-close').click();
  await expect(page.getByTestId('formula-item')).toHaveCount(5);
  expect((await uiState(page)).selection).toEqual({ kind: 'formula', id: expect.any(String) });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('formula-item')).toHaveCount(4);
  // The selection does not keep pointing at a formula that is gone.
  expect((await uiState(page)).selection).toEqual({ kind: 'none' });
  await expect(page.getByTestId('animations-empty')).toBeVisible();
});
