import { expect, test, type Page } from './test';
import { addFormulaViaUi, startApp } from './creatorHelpers';
import { glyph, openRelationScene, plain, selectClip } from './relationsHelpers';
import { getProject, onSystem } from './helpers';

/* Rectangle (marquee) selection in the formula editor's glyph view and the relation editor:
 * press, drag over glyphs, release. Ctrl (or Shift) adds to the selection. */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Drag from (x0, y0) to (x1, y1), optionally holding a key. */
async function drag(page: Page, x0: number, y0: number, x1: number, y1: number, key?: string) {
  if (key) await page.keyboard.down(key);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 6 });
  await page.mouse.up();
  if (key) await page.keyboard.up(key);
}

test('formula editor: a rectangle selects the glyphs it touches, Ctrl adds', async ({ page }) => {
  await startApp(page);
  const editor = await addFormulaViaUi(page, 'a+b=c');
  const box = async (i: number): Promise<Box> =>
    (await editor.getByTestId(`glyph-${i}`).locator('.gv-box').boundingBox())!;
  const label = editor.getByTestId('glyph-selection');
  const a = await box(0);
  const b = await box(2);
  // From above-left of "a" to below the middle of "b": a, +, b. The marquee shows while dragging.
  await page.mouse.move(a.x - 6, a.y - 6);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height + 6, { steps: 6 });
  await expect(editor.getByTestId('glyph-marquee')).toBeVisible();
  await expect(label).toHaveText('3 selected: 0, 1, 2'); // live
  await page.mouse.up();
  await expect(editor.getByTestId('glyph-marquee')).toHaveCount(0);
  // The click that ends the drag does not clear the selection.
  await expect(label).toHaveText('3 selected: 0, 1, 2');

  const c = await box(4);
  await drag(
    page,
    c.x + c.width + 6,
    c.y - 6,
    c.x + c.width / 2,
    c.y + c.height + 6,
    'ControlOrMeta',
  );
  await expect(label).toHaveText('4 selected: 0, 1, 2, 4');
  // The selection is the one the palette colours.
  await editor.getByTestId('palette-YELLOW').click();
  expect(Object.keys((await getProject(page)).formulas[0]!.glyphColors).sort()).toEqual([
    '0',
    '1',
    '2',
    '4',
  ]);

  // A plain rectangle over nothing clears; a click still selects one glyph.
  const view = (await editor.locator('.glyph-svg').boundingBox())!;
  await drag(page, view.x + 4, view.y + 4, view.x + 20, view.y + 14);
  await expect(label).toContainText('Click glyphs or drag a box');
  await editor.getByTestId('glyph-3').click();
  await expect(label).toHaveText('1 selected: 3');
});

const A = plain('a', 'fa', 't1', 0, 6); // a+b=c
const B = plain('b', 'fb', 't2', 2, 8); // a=3+1

test('relation editor: a rectangle selects on the side it touches; then Link', async ({ page }) => {
  await openRelationScene(page, [A, B]);
  await selectClip(page, 'a');
  await page.getByTestId('create-relation-other').selectOption('b');
  await page.getByTestId('create-relation-button').click();
  await expect(page.getByTestId('rel-from-glyph-0')).toBeVisible();
  // The hint names every key that makes a rectangle add (useMarquee: Shift, Ctrl or ⌘).
  await expect(page.getByTestId('relation-editor').locator('.rel-hint').first()).toContainText(
    onSystem(
      'Shift-click, or drag a box over glyphs (Shift or Ctrl/⌘: add), to select several',
      '⇧-click, or drag a box over glyphs (⇧ or ⌘: add), to select several',
    ),
  );
  const box = async (side: 'from' | 'to', label: string): Promise<Box> =>
    (await glyph(page, side, label).boundingBox())!;
  const selected = async (side: 'from' | 'to') =>
    page
      .locator(`[data-testid^="rel-${side}-glyph-"][data-selected="true"]`)
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-label')));

  // Source a + b.
  const a = await box('from', 'a');
  const b = await box('from', 'b');
  await drag(page, a.x - 4, a.y - 4, b.x + b.width / 2, b.y + b.height + 4);
  expect(await selected('from')).toEqual(['a', '+', 'b']);
  expect(await selected('to')).toEqual([]);
  // Target 3 + 1: the source selection stays.
  const three = await box('to', '3');
  const one = await box('to', '1');
  await drag(
    page,
    one.x + one.width + 4,
    one.y - 4,
    three.x + three.width / 2,
    three.y + three.height / 2,
  );
  expect(await selected('from')).toEqual(['a', '+', 'b']);
  expect(await selected('to')).toEqual(['3', '+', '1']);
  // Ctrl adds "=" on the source.
  const eq = await box('from', '=');
  await drag(page, eq.x - 4, eq.y - 4, eq.x + eq.width / 2, eq.y + eq.height / 2, 'ControlOrMeta');
  expect(await selected('from')).toEqual(['a', '+', 'b', '=']);
  // Shift adds "c" as well.
  const c = await box('from', 'c');
  await drag(page, c.x - 4, c.y - 4, c.x + c.width / 2, c.y + c.height / 2, 'Shift');
  expect(await selected('from')).toEqual(['a', '+', 'b', '=', 'c']);
  await expect(page.getByTestId('relation-editor')).toBeVisible();

  await page.getByTestId('rel-link').click();
  await expect(page.locator('[data-testid^="rel-junction-"]')).toHaveCount(1);
  await page.getByTestId('rel-save').click();
  await expect(page.getByTestId('relation-editor')).toBeHidden();
  const relations = (await getProject(page)).relations as unknown as {
    pairs: { from: number[]; to: number[] }[];
  }[];
  expect(relations[0]!.pairs).toEqual([{ from: [0, 1, 2, 3, 4], to: [2, 3, 4], style: null }]);
});

test('a press becomes a rectangle after 3 px, the same travel that starts any drag', async ({
  page,
}) => {
  await startApp(page);
  const editor = await addFormulaViaUi(page, 'a+b=c');
  const view = (await editor.locator('.glyph-svg').boundingBox())!;
  await page.mouse.move(view.x + 4, view.y + 4);
  await page.mouse.down();
  await page.mouse.move(view.x + 6, view.y + 5); // 2.2 px: still a press
  await expect(editor.getByTestId('glyph-marquee')).toHaveCount(0);
  await page.mouse.move(view.x + 7, view.y + 5); // 3.2 px: a rectangle
  await expect(editor.getByTestId('glyph-marquee')).toHaveCount(1);
  await page.mouse.up();
});
