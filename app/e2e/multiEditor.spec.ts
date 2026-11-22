import { expect, test, type Page } from './test';
import { pinMathJax } from './creatorHelpers';
import { getProject, openWithProject, readExample, type MfeWindow } from './helpers';
import { plain, relationProject } from './relationsHelpers';

/* Editing several formulas together: select them in the Creator, right-click, "Edit together…";
 * colour, hide and show glyphs of all of them at once, with undo. */
const FORMULAS = ['a+b', 'c=d', 'x^2'].map((latex, i) => ({
  id: `f${i}`,
  name: `f${i}`,
  source: latex,
}));

async function openMultiEditor(page: Page): Promise<void> {
  await openWithProject(page, relationProject([], FORMULAS));
  await pinMathJax(page);
  const items = page.getByTestId('formula-item');
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ['ControlOrMeta'] });
  await items.nth(1).click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-header')).toHaveText('2 formulas');
  await page.getByTestId('formula-menu-edit-together').click();
  await expect(page.getByTestId('multi-editor')).toBeVisible();
  await expect(page.getByTestId('multi-f0-0')).toBeVisible();
  await expect(page.getByTestId('multi-f1-0')).toBeVisible();
}

const formula = async (page: Page, id: string) =>
  (await getProject(page)).formulas.find((f) => f.id === id)!;

test('colours and hides glyphs of several formulas at once; Ctrl+Z undoes one step', async ({
  page,
}) => {
  await openMultiEditor(page);
  const editor = page.getByTestId('multi-editor');
  await expect(editor.getByTestId('multi-card-f2')).toHaveCount(0); // only the selected two
  await expect(editor.getByTestId('multi-summary')).toContainText('Click glyphs');

  // One glyph in each formula.
  await page.getByTestId('multi-f0-0').click();
  await page.getByTestId('multi-f1-2').click({ modifiers: ['ControlOrMeta'] });
  await expect(editor.getByTestId('multi-summary')).toHaveText('2 glyphs in 2 formulas');
  await page.getByTestId('multi-palette-YELLOW').click();
  expect((await formula(page, 'f0')).glyphColors).toEqual({ '0': '#FFFF00' });
  expect((await formula(page, 'f1')).glyphColors).toEqual({ '2': '#FFFF00' });

  // The right-click menu acts on the same selection.
  await page.getByTestId('multi-f1-2').click({ button: 'right' });
  await expect(page.getByTestId('glyph-menu-header')).toHaveText('2 glyphs in 2 formulas');
  await page.getByTestId('glyph-menu-hide').click();
  expect((await formula(page, 'f0')).hiddenGlyphs).toEqual([0]);
  expect((await formula(page, 'f1')).hiddenGlyphs).toEqual([2]);
  await expect(page.getByTestId('multi-f1-2')).toHaveAttribute('data-hidden', 'true');

  // Ctrl+Z undoes the hide in both formulas, then the colour.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await formula(page, 'f1')).hiddenGlyphs).toEqual([]);
  expect((await formula(page, 'f0')).hiddenGlyphs).toEqual([]);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await formula(page, 'f0')).glyphColors).toEqual({});
  expect((await formula(page, 'f1')).glyphColors).toEqual({});

  // Select all, a plain click narrows to one glyph, a background click clears.
  await editor.getByTestId('multi-select-all').click();
  await expect(editor.getByTestId('multi-summary')).toHaveText('6 glyphs in 2 formulas');
  await page.getByTestId('multi-f0-1').click();
  await expect(editor.getByTestId('multi-summary')).toHaveText('1 glyph in 1 formula');
  await editor.getByTestId('multi-clear-selection').click();
  await expect(editor.getByTestId('multi-summary')).toContainText('Click glyphs');
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
});

test('a single formula offers Edit…; a right-click outside the selection selects it', async ({
  page,
}) => {
  await openWithProject(page, relationProject([], FORMULAS));
  await pinMathJax(page);
  const items = page.getByTestId('formula-item');
  await items.nth(0).click();
  await items.nth(2).click({ button: 'right' });
  await expect(items.nth(2)).toHaveAttribute('data-selected', 'true');
  await expect(items.nth(0)).toHaveAttribute('data-selected', 'false');
  await expect(page.getByTestId('formula-menu-edit-together')).toHaveCount(0);
  await page.getByTestId('formula-menu-edit').click();
  await expect(page.getByTestId('formula-editor')).toContainText('Formula · f2');
});

test('the cards view shows one formula per screen; the wheel moves to the next', async ({
  page,
}) => {
  await openMultiEditor(page);
  const editor = page.getByTestId('multi-editor');
  await expect(editor.getByTestId('multi-grid')).toBeVisible();
  await editor.getByTestId('multi-view-cards').click();
  const cards = editor.getByTestId('multi-cards');
  await expect(cards).toBeVisible();
  await expect(editor.getByTestId('multi-card-position')).toContainText('f0 · 1 / 2');
  // Each card fills the view.
  const view = (await cards.boundingBox())!;
  const first = (await editor.getByTestId('multi-card-f0').boundingBox())!;
  expect(first.height).toBeCloseTo(view.height, -1);
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  await page.mouse.wheel(0, 100); // one notch is enough
  await expect(editor.getByTestId('multi-card-position')).toContainText('f1 · 2 / 2');
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, -100);
  await expect(editor.getByTestId('multi-card-position')).toContainText('f0 · 1 / 2');
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 100);
  await expect(editor.getByTestId('multi-card-position')).toContainText('f1 · 2 / 2');

  // The selection is shared by both views, and the actions work from here.
  await page.getByTestId('multi-f1-0').click();
  await page.getByTestId('multi-palette-YELLOW').click();
  expect((await formula(page, 'f1')).glyphColors).toEqual({ '0': '#FFFF00' });
  await editor.getByTestId('multi-view-grid').click();
  await expect(page.getByTestId('multi-f1-0')).toHaveAttribute('data-selected', 'true');
  // The view is kept when the editor opens again.
  await editor.getByTestId('multi-view-cards').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('formula-item').nth(1).click({ button: 'right' });
  await page.getByTestId('formula-menu-edit-together').click();
  await expect(page.getByTestId('multi-cards')).toBeVisible();
});

test('a rectangle over the grid selects glyphs of every formula it touches; Ctrl adds', async ({
  page,
}) => {
  await openMultiEditor(page);
  const editor = page.getByTestId('multi-editor');
  await editor.getByTestId('multi-view-grid').click();
  const box = async (id: string) => (await page.getByTestId(id).locator('.gv-box').boundingBox())!;
  const selected = (id: string) => page.getByTestId(id);
  // From above-left of f0's first glyph to the middle of f1's first glyph, across both cards.
  const a = await box('multi-f0-0');
  const c = await box('multi-f1-0');
  await page.mouse.move(a.x - 4, a.y - 4);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 8 });
  await expect(editor.getByTestId('multi-marquee')).toBeVisible();
  await page.mouse.up();
  await expect(editor.getByTestId('multi-marquee')).toHaveCount(0);
  await expect(selected('multi-f0-0')).toHaveAttribute('data-selected', 'true');
  await expect(selected('multi-f0-2')).toHaveAttribute('data-selected', 'true');
  await expect(selected('multi-f1-0')).toHaveAttribute('data-selected', 'true');
  await expect(selected('multi-f1-2')).toHaveAttribute('data-selected', 'false');
  await expect(editor.getByTestId('multi-summary')).toContainText('in 2 formulas');

  // Ctrl adds f1's last glyph; a colour then reaches both formulas in one step.
  const d = await box('multi-f1-2');
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.move(d.x + d.width + 4, d.y - 4);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('ControlOrMeta');
  await expect(selected('multi-f1-2')).toHaveAttribute('data-selected', 'true');
  await expect(selected('multi-f0-0')).toHaveAttribute('data-selected', 'true');
  await page.getByTestId('multi-palette-RED').click();
  expect(Object.keys((await formula(page, 'f1')).glyphColors).sort()).toEqual(['0', '2']);
  expect((await formula(page, 'f0')).glyphColors['0']).toBe('#FC6255');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await formula(page, 'f1')).glyphColors).toEqual({});
  expect((await formula(page, 'f0')).glyphColors).toEqual({});
});

/** Whether a press at the centre of `testId` reaches it (it is on screen and nothing covers it),
 * and where that centre is. Playwright's own clicks scroll first, so the specs press there with
 * the mouse instead. */
async function reachable(page: Page, testId: string) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hit = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
    point,
  );
  return { point, hit };
}

test('the selection and the tools stay at the top while many formulas scroll by', async ({
  page,
}) => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`,
    name: `m${i}`,
    source: `x_{${i}}+1`,
  }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await openWithProject(page, relationProject([], many));
  await pinMathJax(page);
  const items = page.getByTestId('formula-item');
  await items.nth(0).click();
  await items.nth(11).click({ modifiers: ['Shift'] });
  await items.nth(0).click({ button: 'right' });
  await page.getByTestId('formula-menu-edit-together').click();
  await expect(page.getByTestId('multi-m11-0')).toBeAttached();

  // Grid: scroll the dialog to the last formula, select a glyph there, colour it from the bar.
  const body = page.getByTestId('multi-editor').locator('.modal-body');
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const scrolled = await body.evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(300);
  const glyph = await reachable(page, 'multi-m11-0');
  expect(glyph.hit).toBe('multi-m11-0');
  await page.mouse.click(glyph.point.x, glyph.point.y);
  await expect(page.getByTestId('multi-summary')).toHaveText('1 glyph in 1 formula');
  const swatch = await reachable(page, 'multi-palette-YELLOW');
  expect(swatch.hit).toBe('multi-palette-YELLOW');
  await page.mouse.click(swatch.point.x, swatch.point.y);
  expect((await formula(page, 'm11')).glyphColors).toEqual({ '0': '#FFFF00' });
  expect(await body.evaluate((el) => el.scrollTop)).toBe(scrolled);

  // Cards: on the last card, the tools are still at hand.
  const view = await reachable(page, 'multi-view-cards');
  expect(view.hit).toBe('multi-view-cards');
  await page.mouse.click(view.point.x, view.point.y);
  const cards = page.getByTestId('multi-cards');
  await expect(cards).toBeVisible();
  await cards.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByTestId('multi-card-position')).toContainText('m11 · 12 / 12');
  const hide = await reachable(page, 'multi-hide');
  expect(hide.hit).toBe('multi-hide');
  await page.mouse.click(hide.point.x, hide.point.y);
  expect((await formula(page, 'm11')).hiddenGlyphs).toEqual([0]);
});

/* The tools of the whole formulas (D155): one Scale for all, and Match colors. */
const RED = '#FC6255';
const BLUE = '#58C4DD';

/** f0 (a+b) at scale 1 and f1 (c=d) at scale 2, each with a clip on the timeline; f2 (x^2) at
 * scale 1; the list of match colours «Course»: a red, = blue. */
function toolsProject(): string {
  const file = JSON.parse(
    relationProject([plain('c0', 'f0', 't1', 0, 6), plain('c1', 'f1', 't2', 0, 6)], FORMULAS, {
      colorMatches: [
        {
          id: 'm1',
          name: 'Course',
          entries: [
            { pattern: '$a$', color: RED },
            { pattern: '=', color: BLUE },
          ],
        },
      ],
    }),
  ) as { formulas: { fontSize: number }[] };
  file.formulas[1]!.fontSize = 96;
  return JSON.stringify(file);
}

/** f0 and f1 selected in the Creator, and «Edit together» opened on them. */
async function openTools(page: Page): Promise<void> {
  await openWithProject(page, toolsProject());
  await pinMathJax(page);
  const items = page.getByTestId('formula-item');
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ['ControlOrMeta'] });
  await items.nth(1).click({ button: 'right' });
  await page.getByTestId('formula-menu-edit-together').click();
  await expect(page.getByTestId('multi-f1-0')).toBeVisible();
}

const fontSizes = async (page: Page) =>
  (await getProject(page)).formulas.map((f) => (f as unknown as { fontSize: number }).fontSize);

/** The height of a formula as the Preview draws it at scale 1: its render's box, in scene units. */
const drawnHeight = (page: Page, id: string) =>
  page.evaluate((formulaId) => {
    const resolved = (window as MfeWindow).__mfe!.useRenderStore.getState().resolved as ReadonlyMap<
      string,
      { render: { bbox: { minY: number; maxY: number } } }
    >;
    const bbox = resolved.get(formulaId)?.render.bbox;
    return bbox ? bbox.maxY - bbox.minY : null;
  }, id);

test('one Scale for the formulas open: «mixed» while they differ; a value sets it on all, one undo step', async ({
  page,
}) => {
  await openTools(page);
  await expect.poll(() => drawnHeight(page, 'f1')).not.toBeNull();
  const before = { f0: (await drawnHeight(page, 'f0'))!, f1: (await drawnHeight(page, 'f1'))! };
  const field = page.getByTestId('multi-scale');
  await expect(field).toHaveAccessibleName('Scale');
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('placeholder', 'mixed');
  await expect(page.getByTestId('multi-scale-note')).toHaveCount(0);

  // What the formula editor refuses, this field refuses.
  await field.fill('20');
  await expect(page.getByTestId('multi-scale-error')).toHaveText(
    'A number or a fraction from 0.1 to 10.',
  );
  await field.press('Enter');
  expect(await fontSizes(page)).toEqual([48, 96, 48]);
  await expect(field).toHaveValue('');

  await field.fill('3/2');
  await field.press('Enter');
  await expect.poll(() => fontSizes(page)).toEqual([72, 72, 48]);
  await expect(field).toHaveValue('1.5');
  // The Preview draws both at that scale: f0 half as large again, f1 three quarters of it.
  await expect.poll(async () => (await drawnHeight(page, 'f0'))! / before.f0).toBeCloseTo(1.5, 3);
  await expect.poll(async () => (await drawnHeight(page, 'f1'))! / before.f1).toBeCloseTo(0.75, 3);

  // One undo step gives each its own back (from outside the field, which keeps its own undo).
  await page.getByTestId('multi-match').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => fontSizes(page)).toEqual([48, 96, 48]);
  await expect(field).toHaveValue('');
  await expect.poll(async () => (await drawnHeight(page, 'f1'))! / before.f1).toBeCloseTo(1, 3);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => fontSizes(page)).toEqual([72, 72, 48]);
  await expect(field).toHaveValue('1.5');
});

test('Match colors applies a list to every formula open, as the menu of the selection does', async ({
  page,
}) => {
  await openTools(page);
  const button = page.getByTestId('multi-match');
  await expect(button).toHaveAttribute('aria-haspopup', 'menu');
  await button.click();
  const menu = page.getByTestId('multi-match-menu');
  await expect(menu).toBeVisible();
  // Each list by its name and the colours it gives.
  const entry = page.getByTestId('multi-match-m1');
  await expect(entry).toContainText('Course');
  await expect(
    entry
      .locator('.match-swatch')
      .evaluateAll((swatches) => swatches.map((swatch) => swatch.getAttribute('data-color'))),
  ).resolves.toEqual([RED, BLUE]);
  await entry.click();
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => (await formula(page, 'f0')).glyphColors).toEqual({ '0': RED });
  expect((await formula(page, 'f1')).glyphColors).toEqual({ '1': BLUE });
  expect((await formula(page, 'f2')).glyphColors).toEqual({});
  // The dialog shows it at once: its glyphs are the project's.
  await expect(page.getByTestId('multi-f0-0')).toHaveAttribute('data-color', RED);
  await expect(page.getByTestId('multi-f1-1')).toHaveAttribute('data-color', BLUE);
  await expect(page.getByTestId('notice-host')).toContainText('“Course” applied to 2 formulas');
  // One undo step takes the colours of both back.
  await expect(button).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await formula(page, 'f0')).glyphColors).toEqual({});
  expect((await formula(page, 'f1')).glyphColors).toEqual({});
  await expect(page.getByTestId('multi-f0-0')).not.toHaveAttribute('data-color', RED);

  // Without lists, its entry makes one: the dialog of the lists, once this one has closed.
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      draft.colorMatches = [];
    }),
  );
  await button.click();
  await expect(page.getByTestId('multi-match-create')).toHaveText('Create match colors…');
  await page.getByTestId('multi-match-create').click();
  await expect(page.getByTestId('multi-editor')).toHaveCount(0);
  await expect(page.getByTestId('match-colors')).toBeVisible();
});

test('opened from the timeline on a formula and a brace: the brace has no scale and takes no list', async ({
  page,
}) => {
  await openWithProject(page, readExample('braces.mfe.json'));
  await pinMathJax(page);
  await page.getByTestId('clip-c_sum').click({ position: { x: 30, y: 8 } });
  await page
    .getByTestId('clip-c_first')
    .click({ position: { x: 30, y: 8 }, modifiers: ['ControlOrMeta'] });
  await page.getByTestId('clip-c_first').click({ button: 'right', position: { x: 30, y: 8 } });
  await page.getByTestId('clips-menu-edit-together').click();
  await expect(page.getByTestId('multi-editor')).toBeVisible();
  const field = page.getByTestId('multi-scale');
  // «sum» is at 60: scale 1.25; the brace is fitted to what it marks.
  await expect(field).toHaveValue('1.25');
  await expect(page.getByTestId('multi-scale-note')).toHaveText(
    'Not for 1 of them: braces, shapes and lines take the size of what they mark.',
  );
  await field.fill('2');
  await field.press('Enter');
  const sizes = async () =>
    Object.fromEntries(
      (await getProject(page)).formulas.map((f) => [
        f.id,
        (f as unknown as { fontSize: number }).fontSize,
      ]),
    );
  await expect.poll(async () => (await sizes()).f_sum).toBe(96);
  expect((await sizes()).f_first).toBe(48);
  // A list finds its patterns in LaTeX: a brace has none, and the button says so.
  await expect(page.getByTestId('multi-match')).toBeDisabled();
  await expect(page.getByTestId('multi-match')).toHaveAttribute(
    'title',
    'first is a Brace: its glyphs take no colours of their own',
  );
});
