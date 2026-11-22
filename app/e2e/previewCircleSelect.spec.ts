import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import {
  canUndo,
  openWithProject,
  projectFile,
  selectionOf,
  setTime,
  someTextField,
  undo,
  type MfeWindow,
} from './helpers';
import { clipJson } from './timelineHelpers';
import { canvasBoxOf } from './uxHelpers';

/* The circle selector of the preview: a switch of the view's toolbar. With it, a click takes the
 * symbol nearest to the pointer within a circle — its formula, or with Alt the symbol itself —
 * as align by symbol does, instead of only what is right under the pointer. */

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const frame = (page: Page) => page.getByTestId('preview-frame');
const toggle = (page: Page) => page.getByTestId('preview-circle-select');

/** One formula, "x=y", at the centre of the frame, whole at 2 s. */
async function open(page: Page): Promise<void> {
  const clip = clipJson('ca', 'fa', 't1', 0, 4);
  const formulas = [{ id: 'fa', name: 'A', source: 'x=y', color: '#58C4DD' }];
  await openWithProject(page, projectFile('circle', formulas, [clip]));
  await setTime(page, 2);
  await waitForDrawables(page, 3);
}

/** The box of the glyph labelled `label`, in page pixels (the formula sits at the origin). */
async function glyphPx(page: Page, label: string): Promise<Box> {
  const box = await page.evaluate((wanted) => {
    const mfe = (window as MfeWindow).__mfe!;
    const clip = mfe.useProjectStore.getState().project.clips[0]!;
    const entry = mfe.useRenderStore.getState().resolved.get(clip.formulaId) as unknown as {
      render: { glyphs: { label: string; bbox: Box }[] };
    };
    return entry.render.glyphs.find((g) => g.label === wanted)!.bbox;
  }, label);
  const canvas = await canvasBoxOf(page);
  const unit = canvas.width / ((8 * 16) / 9);
  const [cx, cy] = [canvas.x + canvas.width / 2, canvas.y + canvas.height / 2];
  // Scene y grows upwards: the top of the box is its maxY.
  return {
    minX: cx + box.minX * unit,
    maxX: cx + box.maxX * unit,
    minY: cy - box.maxY * unit,
    maxY: cy - box.minY * unit,
  };
}

const reachOf = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.usePreferences.getState().symbolRadius);
const positionOf = (page: Page) =>
  page.evaluate(
    () =>
      (
        (window as MfeWindow).__mfe!.useProjectStore.getState().project.clips[0] as unknown as {
          initial: { position: [number, number] };
        }
      ).initial.position,
  );
const ids = async (page: Page) => {
  const selection = await selectionOf(page);
  return selection.kind === 'clips' ? selection.ids : selection.kind;
};

test('the switch of the toolbar turns the circle selector on, and it is remembered', async ({
  page,
}) => {
  await open(page);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(page)).toHaveAccessibleName('Circle selector');
  await expect(frame(page)).toHaveAttribute('data-selector', 'pointer');
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(frame(page)).toHaveAttribute('data-selector', 'circle');
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await toggle(page).click();
  await expect(frame(page)).toHaveAttribute('data-selector', 'pointer');
});

test('S switches between the pointer and the circle, outside text fields', async ({ page }) => {
  await open(page);
  await page.keyboard.press('s');
  await expect(frame(page)).toHaveAttribute('data-selector', 'circle');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle(page)).toHaveAttribute('title', /^Circle selector \(S\)/);
  await page.keyboard.press('s');
  await expect(frame(page)).toHaveAttribute('data-selector', 'pointer');
  // In a text field the key is a letter.
  const search = await someTextField(page);
  await search.click();
  await page.keyboard.press('s');
  await expect(search).toHaveValue('s');
  await expect(frame(page)).toHaveAttribute('data-selector', 'pointer');
  // With a modifier it is another command.
  await search.fill('');
  await page.getByTestId('preview-frame').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Shift+s');
  await expect(frame(page)).toHaveAttribute('data-selector', 'pointer');
});

test('with the circle, a click takes the formula of the symbol nearest within it', async ({
  page,
}) => {
  await open(page);
  const y = await glyphPx(page, 'y');
  // 10 px to the right of the last symbol: outside the formula, within the circle (14 px).
  const near = { x: y.maxX + 10, y: (y.minY + y.maxY) / 2 };
  const far = { x: y.maxX + 40, y: near.y };
  // The pointer as it was: nothing is under it there.
  await page.mouse.move(near.x, near.y);
  await expect(frame(page)).toHaveAttribute('data-hover', '');
  await page.mouse.click(near.x, near.y);
  expect(await ids(page)).toBe('none');

  await toggle(page).click();
  // The circle outlines what a click would take, and the click takes its formula.
  await page.mouse.move(near.x, near.y);
  await expect(frame(page)).toHaveAttribute('data-hover', 'ca:2');
  await page.mouse.click(near.x, near.y);
  expect(await ids(page)).toEqual(['ca']);
  // Out of the circle, nothing; a click there clears the selection, as on empty space.
  await page.mouse.move(far.x, far.y);
  await expect(frame(page)).toHaveAttribute('data-hover', '');
  await page.mouse.click(far.x, far.y);
  expect(await ids(page)).toBe('none');

  // A press within the circle drags the formula: one undo step.
  await page.mouse.move(near.x, near.y);
  await page.mouse.down();
  await page.mouse.move(near.x + 30, near.y + 20, { steps: 5 });
  await page.mouse.up();
  const moved = await positionOf(page);
  expect(moved[0]).toBeGreaterThan(0);
  expect(moved[1]).toBeLessThan(0);
  await undo(page);
  expect(await positionOf(page)).toEqual([0, 0]);
  expect(await canUndo(page)).toBe(false);

  // The right click takes it too: the menu of its clip opens.
  await page.mouse.click(far.x, far.y);
  await page.mouse.click(near.x, near.y, { button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await ids(page)).toEqual(['ca']);
});

test('with the circle, Alt+click picks the nearest symbol, and Shift+wheel sets the reach', async ({
  page,
}) => {
  await open(page);
  const equals = await glyphPx(page, '=');
  // 10 px over the "=": inside the formula, further than the reach of a plain Alt+click (6 px).
  const over = { x: (equals.minX + equals.maxX) / 2, y: equals.minY - 10 };
  await page.keyboard.down('Alt');
  await page.mouse.click(over.x, over.y);
  await page.keyboard.up('Alt');
  await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');

  await toggle(page).click();
  await page.mouse.move(over.x, over.y);
  await expect(frame(page)).toHaveAttribute('data-hover', 'ca:1');
  await page.keyboard.down('Alt');
  await page.mouse.click(over.x, over.y);
  await page.keyboard.up('Alt');
  await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1');
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');

  // The reach is the one of align by symbol: Shift+wheel, here too.
  expect(await reachOf(page)).toBe(14);
  await page.keyboard.down('Shift');
  for (let i = 0; i < 6; i += 1) await page.mouse.wheel(0, 120);
  await page.keyboard.up('Shift');
  const small = await reachOf(page);
  expect(small).toBeLessThan(10);
  // 10 px away is out of that circle.
  await page.mouse.move(over.x + 1, over.y);
  await expect(frame(page)).toHaveAttribute('data-hover', '');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, -120);
  await page.keyboard.up('Shift');
  expect(await reachOf(page)).toBeGreaterThan(14);
  await page.mouse.move(over.x, over.y);
  await expect(frame(page)).toHaveAttribute('data-hover', 'ca:1');
});

test('a slow scroll with Shift sizes the circle too: its small events add up', async ({ page }) => {
  await open(page);
  await toggle(page).click();
  const equals = await glyphPx(page, '=');
  // 10 px over the "=": within the reach the app starts with, 14 px.
  const over = { x: (equals.minX + equals.maxX) / 2, y: equals.minY - 10 };
  await page.mouse.move(over.x, over.y);
  await expect(frame(page)).toHaveAttribute('data-hover', 'ca:1');
  expect(await reachOf(page)).toBe(14);

  /** A scroll as a trackpad sends it: many events of a few pixels, none of which is worth a
   * pixel of the reach by itself. */
  const scroll = async (events: number, deltaX: number, deltaY: number) => {
    for (let i = 0; i < events; i += 1) await page.mouse.wheel(deltaX, deltaY);
  };
  await page.keyboard.down('Shift');
  // 210 px towards the user in events of 3 px: 14 × e^-0.42, a reach of 9.
  await scroll(70, 0, 3);
  await expect.poll(() => reachOf(page)).toBe(9);
  // 10 px away is out of that circle.
  await page.mouse.move(over.x + 1, over.y);
  await expect(frame(page)).toHaveAttribute('data-hover', '');
  // The fingers back where they were: the reach it was, and the symbol within it again.
  await scroll(70, 0, -3);
  await expect.poll(() => reachOf(page)).toBe(14);
  await page.mouse.move(over.x, over.y);
  await expect(frame(page)).toHaveAttribute('data-hover', 'ca:1');
  // 150 px away from the user, as one turn of that length: 14 × e^0.3, a reach of 19.
  await scroll(50, 0, -3);
  await expect.poll(() => reachOf(page)).toBe(19);
  // Where the system hands the scroll turned sideways (a Mac with Shift held): the same.
  await scroll(50, 3, 0);
  await expect.poll(() => reachOf(page)).toBe(14);
  await page.keyboard.up('Shift');
  // The reach is the preference, which the browser remembers.
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('mfe.preferences') ?? '{}').symbolRadius,
    ),
  ).toBe(14);
  // A scroll of that kind without Shift is not the reach's.
  await scroll(20, 0, -3);
  expect(await reachOf(page)).toBe(14);
});

test('align by symbol keeps its own circle while the selector is on', async ({ page }) => {
  await open(page);
  await toggle(page).click();
  await page.keyboard.press('Alt+g');
  await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
  const y = await glyphPx(page, 'y');
  await page.mouse.click(y.maxX + 10, (y.minY + y.maxY) / 2);
  // The click was the mode's: a symbol to move, no selection.
  await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
  expect(await ids(page)).toBe('none');
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-selector', 'circle');
});
