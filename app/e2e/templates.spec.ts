import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import { getProject, openWithProject } from './helpers';
import { relationProject } from './relationsHelpers';

/* The Templates tab of the Creator: an entry for each list of templates — the ones that come
 * with the editor, the user's own, the favourites —, each opening a pop-up that is searched and
 * filtered, with MathJax thumbnails only for cards near the view; and "Use", which asks for the
 * values of a template's placeholders and makes the formula. */
const ids = (page: Page) =>
  page
    .getByTestId('template-item')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-template-id')));

/** The Templates tab, then the pop-up of one of its entries. */
async function openTemplates(page: Page, view: 'default' | 'mine' | 'favorites'): Promise<void> {
  await page.getByTestId('creator-tab-templates').click();
  await page.getByTestId(`templates-open-${view}`).click();
  await expect(page.getByTestId('template-browser')).toHaveAttribute('data-view', view);
}

const BEFORE = JSON.parse(
  readFileSync(
    new URL('../src/ui/creator/templates/__tests__/fixtures/template-latex.json', import.meta.url),
    'utf8',
  ),
) as Record<string, string>;

test('the Templates tab has an entry for each list; Default templates lists the library, thumbnails near the view only', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  await expect(page.getByTestId('creator-tab-formulas')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('template-entries')).toHaveCount(0); // not loaded until opened
  await page.getByTestId('creator-tab-templates').click();
  await expect(page.getByTestId('templates-open-default')).toContainText('Default templates');
  await expect(page.getByTestId('templates-open-default')).toContainText('257 formulas');
  await expect(page.getByTestId('templates-open-mine')).toContainText('None yet');
  await expect(page.getByTestId('templates-open-create')).toContainText('Create template');
  // In the order they are told: the editor's, the user's, the form, the favourites.
  await expect(page.getByTestId('template-entries').locator('.template-entry-title')).toHaveText([
    'Default templates',
    'My templates',
    'Create template',
    'Favorites',
  ]);
  await expect(page.getByTestId('templates-open-favorites')).toContainText('A star on a template');
  await expect(page.getByTestId('templates-dialog')).toHaveCount(0);

  await page.getByTestId('templates-open-default').click();
  const dialog = page.getByTestId('templates-dialog');
  await expect(dialog.getByRole('heading')).toHaveText('Default templates');
  await expect(page.getByTestId('template-search')).toBeFocused();
  const items = page.getByTestId('template-item');
  await expect(items).toHaveCount(257);
  await expect(page.getByTestId('template-count')).toHaveText('257');
  expect((await ids(page))[0]).toBe('algebra-square-of-a-sum');
  // The pop-up covers the window, not only the panel its entry is in.
  const [box, panel] = await Promise.all([
    dialog.boundingBox(),
    page.getByTestId('panel-creator').boundingBox(),
  ]);
  expect(box!.width).toBeGreaterThan(panel!.width * 2);

  // The first cards get their thumbnails; cards far below wait for the list to reach them.
  await expect(items.first().getByTestId('template-thumb')).toHaveAttribute('data-state', 'ready');
  const ready = page.locator('[data-testid="template-thumb"][data-state="ready"]');
  expect(await ready.count()).toBeLessThan(60);
  const last = items.last();
  await expect(last).toHaveAttribute('data-template-id', 'physics-lorentz-force');
  await expect(last.getByTestId('template-thumb')).toHaveAttribute('data-state', 'pending');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByTestId('template-thumb')).toHaveAttribute('data-state', 'ready');
  await expect(last.locator('svg path').first()).toBeAttached();

  // Escape closes the pop-up; the tab stays.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('creator-tab-templates')).toHaveAttribute('aria-selected', 'true');
});

test('searches the templates and filters them by category and level', async ({ page }) => {
  await openWithProject(page, relationProject([]));
  await openTemplates(page, 'default');
  const items = page.getByTestId('template-item');
  await expect(items).toHaveCount(257);

  // Every word must appear in the name, description, LaTeX or category.
  await page.getByTestId('template-search').fill('derivative');
  await expect(items).toHaveCount(36);
  await expect(page.getByTestId('template-count')).toHaveText('36 of 257');
  await page.getByTestId('template-category').selectOption('Derivatives');
  await expect(items).toHaveCount(20);
  await page.getByTestId('template-level').selectOption('university');
  expect(await ids(page)).toEqual([
    'derivatives-derivative-of-arcsine',
    'derivatives-derivative-of-arctangent',
    'derivatives-inverse-function-derivative',
    'derivatives-mean-value-theorem',
  ]);
  // The LaTeX searched is the formula a template shows, not its placeholders.
  await page.getByTestId('template-search').fill('#1');
  await expect(page.getByTestId('template-none')).toBeVisible();
  await page.getByTestId('template-search').fill('derivative zzz');
  await expect(page.getByTestId('template-none')).toBeVisible();
  // Escape clears the search (the next one closes the pop-up); the filters stay.
  await page.getByTestId('template-search').press('Escape');
  await expect(items).toHaveCount(4);

  // Closed and opened again, the pop-up keeps its search and filters; the Formulas tab is as
  // it was.
  await page.getByTestId('template-search').fill('arc');
  await expect(items).toHaveCount(2);
  await page.getByTestId('templates-dialog-close').click();
  await page.getByTestId('creator-tab-formulas').click();
  await expect(page.getByTestId('formula-item')).toHaveCount(2);
  await openTemplates(page, 'default');
  await expect(page.getByTestId('template-search')).toHaveValue('arc');
  await expect(page.getByTestId('template-level')).toHaveValue('university');
  await expect(items).toHaveCount(2);
});

test('Use asks for the values of the placeholders, draws the formula they make and adds it', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  await openTemplates(page, 'default');
  await page.getByTestId('template-search').fill('derivative chain');
  const item = page.locator('[data-template-id="derivatives-chain-rule"]');
  await item.getByTestId('template-use').click();

  // A field for each placeholder, with the template's own value, and the formula drawn.
  const dialog = page.getByTestId('use-template');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('Use template: Chain rule');
  await expect(page.getByTestId('use-template-value-1')).toBeFocused();
  await expect(page.getByTestId('use-template-value-1')).toHaveValue('x');
  await expect(page.getByTestId('use-template-value-2')).toHaveValue('f');
  await expect(page.getByTestId('use-template-value-3')).toHaveValue('g');
  await expect(dialog.getByLabel('#2 outer function')).toHaveValue('f');
  await expect(page.getByTestId('use-template-name')).toHaveValue('chain_rule');
  // With its own values, the formula the template was before it had placeholders.
  await expect(page.getByTestId('use-template-latex')).toHaveText(
    BEFORE['derivatives-chain-rule']!,
  );
  const preview = page.getByTestId('use-template-preview');
  await expect(preview).toHaveAttribute('data-state', 'ready');
  const glyphs = await preview.locator('svg path').count();

  // Other values: the formula follows, and is drawn again.
  await page.getByTestId('use-template-value-1').fill('t');
  await page.getByTestId('use-template-value-2').fill('\\sin');
  await page.getByTestId('use-template-value-3').fill('u_{0}');
  const latex = "\\frac{d}{dt}\\sin\\bigl(u_{0}(t)\\bigr)=\\sin'\\bigl(u_{0}(t)\\bigr)\\,u_{0}'(t)";
  await expect(page.getByTestId('use-template-latex')).toHaveText(latex);
  await expect(preview).toHaveAttribute('data-state', 'ready');
  await expect.poll(() => preview.locator('svg path').count()).toBeGreaterThan(glyphs);

  // A LaTeX that cannot be drawn makes nothing.
  await page.getByTestId('use-template-value-3').fill('\\frac{u');
  await expect(page.getByTestId('use-template-error')).toContainText('cannot be drawn');
  await expect(page.getByTestId('use-template-create')).toBeDisabled();
  await page.getByTestId('use-template-reset').click();
  await expect(page.getByTestId('use-template-value-3')).toHaveValue('g');
  await page.getByTestId('use-template-value-1').fill('t');

  // Enter in a field creates the formula: both dialogs go, and it is on Formulas, last, selected
  // and rendered, with the LaTeX already final.
  await page.getByTestId('use-template-name').fill('chain');
  await page.getByTestId('use-template-name').press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('templates-dialog')).toHaveCount(0);
  await expect(page.getByTestId('creator-tab-formulas')).toHaveAttribute('aria-selected', 'true');
  const formulas = page.getByTestId('formula-item');
  await expect(formulas).toHaveCount(3);
  const made = formulas.last();
  await expect(made).toHaveAttribute('data-name', 'chain');
  await expect(made).toHaveAttribute('data-selected', 'true');
  await expect(made.getByTestId('formula-thumb').locator('svg')).toBeVisible();
  expect((await getProject(page)).formulas.at(-1)).toMatchObject({
    name: 'chain',
    source: "\\frac{d}{dt}f\\bigl(g(t)\\bigr)=f'\\bigl(g(t)\\bigr)\\,g'(t)",
    packages: [],
  });

  // A double-click on a card opens its values too; Cancel and Escape go back to the list, which
  // is as it was, and make nothing.
  await openTemplates(page, 'default');
  await expect(page.getByTestId('template-search')).toHaveValue('derivative chain');
  await item.locator('.template-description').dblclick();
  await expect(page.getByTestId('use-template-name')).toHaveValue('chain_rule');
  await page.getByTestId('use-template-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(item).toBeVisible();
  await item.locator('.template-description').dblclick();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('templates-dialog')).toBeVisible();
  expect((await getProject(page)).formulas).toHaveLength(3);

  // The formula is one undo step.
  await page.keyboard.press('Escape');
  await page.getByTestId('creator-tab-formulas').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(formulas).toHaveCount(2);
});

test('a template without placeholders is added at once', async ({ page }) => {
  await openWithProject(page, relationProject([]));
  await openTemplates(page, 'default');
  await page.getByTestId('template-search').fill('euler identity');
  const item = page.locator('[data-template-id="complex-numbers-eulers-identity"]');
  await item.getByTestId('template-use').click();
  await expect(page.getByTestId('use-template')).toHaveCount(0);
  await expect(page.getByTestId('templates-dialog')).toHaveCount(0);
  const formulas = page.getByTestId('formula-item');
  await expect(formulas).toHaveCount(3);
  await expect(formulas.last()).toHaveAttribute('data-name', 'eulers_identity');
  expect((await getProject(page)).formulas.at(-1)).toMatchObject({
    source: 'e^{i\\pi}+1=0',
    packages: [],
  });
  // Again: the name is numbered. Each use is one undo step.
  await openTemplates(page, 'default');
  await item.locator('.template-description').dblclick();
  await expect(formulas).toHaveCount(4);
  await expect(formulas.last()).toHaveAttribute('data-name', 'eulers_identity_2');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(formulas).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(formulas).toHaveCount(2);
});

test('the two editors of a template are 30 % larger than the rest, and are resized and maximized', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  await openTemplates(page, 'default');
  await page.getByTestId('template-search').fill('product of powers');
  await page.getByTestId('template-use').click();
  const dialog = page.getByTestId('use-template');
  const preview = page.getByTestId('use-template-preview');
  await expect(preview).toHaveAttribute('data-state', 'ready');

  // Everything in it is scaled: its bar, its body and its foot. A field is 30 % taller on screen
  // than its own style says.
  const zoomOf = (selector: string) =>
    dialog.locator(selector).evaluate((el) => getComputedStyle(el).zoom);
  expect(await zoomOf('.modal-header')).toBe('1.3');
  expect(await zoomOf('.modal-body')).toBe('1.3');
  expect(await zoomOf('.modal-footer')).toBe('1.3');
  const input = page.getByTestId('use-template-value-1');
  const field = (await input.boundingBox())!;
  const styled = await input.evaluate((el) => parseFloat(getComputedStyle(el).height));
  expect(field.height / styled).toBeCloseTo(1.3, 1);
  const before = (await dialog.boundingBox())!;
  expect(before.width).toBeCloseTo(728, 0);
  const drawing = (await preview.boundingBox())!;

  // Dragged by its corner it grows on both sides (it stays centred), and the room gained goes to
  // the drawing of the formula.
  const grip = (await page.getByTestId('use-template-resize').boundingBox())!;
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 4 });
  await page.mouse.up();
  const after = (await dialog.boundingBox())!;
  expect(Math.abs(after.width - (before.width + 120))).toBeLessThan(3);
  expect(Math.abs(after.height - (before.height + 80))).toBeLessThan(3);
  expect((await preview.boundingBox())!.height).toBeGreaterThan(drawing.height + 60);
  expect((await page.getByTestId('use-template-value-1').boundingBox())!.height).toBeCloseTo(
    field.height,
    0,
  );

  // Maximized it takes the window; again, it is as it was.
  await page.getByTestId('use-template-maximize').click();
  const viewport = page.viewportSize()!;
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(viewport.width - 20);
  await expect(preview.locator('svg')).toBeVisible();
  await page.getByTestId('use-template-maximize').click();
  expect(Math.abs((await dialog.boundingBox())!.width - after.width)).toBeLessThan(3);
  // A double-click on the corner gives it its own size back.
  await page.getByTestId('use-template-resize').dblclick();
  expect(Math.abs((await dialog.boundingBox())!.width - before.width)).toBeLessThan(3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // The form that writes a template is the other editor: the same scale, the same buttons.
  await page.getByTestId('templates-open-create').click();
  const form = page.getByTestId('template-form');
  expect(await form.locator('.modal-body').evaluate((el) => getComputedStyle(el).zoom)).toBe('1.3');
  expect((await form.boundingBox())!.width).toBeCloseTo(832, 0);
  await expect(page.getByTestId('template-form-maximize')).toBeVisible();
  await expect(page.getByTestId('template-form-resize')).toBeAttached();
  // The lists are not editors: they keep the app's size.
  await page.getByTestId('template-form-cancel').click();
  await page.getByTestId('templates-open-default').click();
  expect(
    await page
      .getByTestId('templates-dialog')
      .locator('.modal-body')
      .evaluate((el) => getComputedStyle(el).zoom),
  ).toBe('1');
});
