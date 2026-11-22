import { expect, test, type Page } from './test';
import { pinMathJax } from './creatorHelpers';
import { openWithProject, readExample, selectionOf } from './helpers';

/* A region over the results of the search of formulas (D155): a rectangle dragged from their empty
 * space selects the cards it touches — with no key it replaces the selection, with Shift it adds,
 * with Ctrl/⌘ it takes out —, the cards keep their own click and drag, the rectangle stays on its
 * cards while the list scrolls under the drag, and Escape gives the selection back. */

/** The font texts «title» and «note» and the formula «equation» (the example), the LaTeX text
 * «heading», and twelve formulas n01…n12 more: enough results for the list to scroll. */
function regionProject(): string {
  const project = JSON.parse(readExample('text-pango.mfe.json'));
  const [tex] = JSON.parse(readExample('text-title.mfe.json')).formulas;
  const equation = project.formulas.find((f: { id: string }) => f.id === 'f_equation');
  project.formulas.push({ ...tex, id: 'f_heading', name: 'heading' });
  for (let i = 1; i <= 12; i++) {
    const n = String(i).padStart(2, '0');
    project.formulas.push({
      ...equation,
      id: `f_${n}`,
      name: `n${n}`,
      source: `a^{${i}}+b`,
      glyphColors: {},
      hiddenGlyphs: [],
      snapshot: null,
    });
  }
  return JSON.stringify(project);
}

const area = (page: Page) => page.getByTestId('formula-search-results');
const region = (page: Page) => page.getByTestId('formula-search-region');
const results = (page: Page) => page.getByTestId('formula-search-result');
const result = (page: Page, name: string) =>
  page.locator(`[data-testid="formula-search-result"][data-name="${name}"]`);
const selectedNames = (page: Page) =>
  page
    .locator('[data-testid="formula-search-result"][data-selected="true"]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-name')));

interface Card {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The cards shown, by name and box on the screen, in the order of the list. */
async function cards(page: Page): Promise<Card[]> {
  return results(page).evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const name = element.getAttribute('data-name')!;
      return { name, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
}

const centre = (card: Card) => ({ x: card.x + card.width / 2, y: card.y + card.height / 2 });

/** A drag from `from` to `to` with the mouse, `keys` held from before the press. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  keys: ('Shift' | 'ControlOrMeta')[] = [],
): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(region(page)).toBeVisible();
  await page.mouse.up();
  for (const key of keys) await page.keyboard.up(key);
  await expect(region(page)).toHaveCount(0);
}

async function openSearch(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, regionProject());
  await pinMathJax(page);
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.getByTestId('formula-search')).toBeVisible();
  await expect(results(page)).toHaveCount(13);
}

/** The cards of the first and the second row, read from the screen. */
async function rows(page: Page): Promise<[Card[], Card[]]> {
  const shown = await cards(page);
  const first = shown.filter((card) => Math.abs(card.y - shown[0]!.y) < 1);
  const second = shown.filter((card) => Math.abs(card.y - shown[first.length]!.y) < 1);
  expect(first.length).toBeGreaterThanOrEqual(2);
  return [first, second];
}

test('a region replaces the selection with what it touches; Shift adds; Ctrl/⌘ takes out', async ({
  page,
}) => {
  await openSearch(page);
  // A LaTeX text is selected, on a tab of its own: the Formulas tab does not show it.
  await page.getByTestId('formula-search-tab-tex').click();
  await result(page, 'heading').click();
  await page.getByTestId('formula-search-tab-math').click();
  const box = (await area(page).boundingBox())!;
  const [first, second] = await rows(page);

  // No key: from the corner of the results (their margin) to the middle of the second card. The
  // text the tab hides leaves the selection, as on a plain click on a card.
  await drag(page, { x: box.x + 3, y: box.y + 3 }, centre(first[1]!));
  expect(await selectedNames(page)).toEqual([first[0]!.name, first[1]!.name]);
  expect(await selectionOf(page)).toEqual({ kind: 'formulas', ids: ['f_equation', 'f_01'] });

  // Shift: from the margin left of the second row to the middle of its first card.
  await drag(page, { x: box.x + 3, y: second[0]!.y + 4 }, centre(second[0]!), ['Shift']);
  expect(await selectedNames(page)).toEqual([first[0]!.name, first[1]!.name, second[0]!.name]);

  // Ctrl/⌘: from the gap between the rows, up to the middle of the second card of the first.
  const gap = first[1]!.y + first[1]!.height + 4;
  await drag(page, { x: centre(first[1]!).x, y: gap }, centre(first[1]!), ['ControlOrMeta']);
  expect(await selectedNames(page)).toEqual([first[0]!.name, second[0]!.name]);
  await expect(result(page, first[1]!.name)).toHaveAttribute('aria-selected', 'false');

  // The menu of a card acts on what the regions selected.
  await result(page, first[0]!.name).click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-header')).toHaveText('2 formulas');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('formula-search')).toBeVisible();
});

test('with a search typed, only the cards shown are touched; Shift keeps the hidden ones', async ({
  page,
}) => {
  await openSearch(page);
  await result(page, 'n05').click();
  await page.getByTestId('formula-search-input').fill('n1');
  expect(
    await results(page).evaluateAll((all) => all.map((card) => card.getAttribute('data-name'))),
  ).toEqual(['n10', 'n11', 'n12']);
  const box = (await area(page).boundingBox())!;
  const shown = await cards(page);
  // Shift, over the first card shown: «n05», hidden by the text, stays selected.
  await drag(page, { x: box.x + 3, y: box.y + 3 }, centre(shown[0]!), ['Shift']);
  expect(await selectionOf(page)).toEqual({ kind: 'formulas', ids: ['f_05', 'f_10'] });
  // Ctrl/⌘ over all three: the hidden one is not touched.
  const right = Math.max(...shown.map((card) => card.x + card.width)) - 4;
  const lowest = Math.max(...shown.map((card) => card.y + card.height));
  await drag(page, { x: box.x + 3, y: box.y + 3 }, { x: right, y: lowest - 20 }, ['ControlOrMeta']);
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_05' });
  // No key, over the empty space under the cards (away from the panel's round corner): it
  // touches nothing, and «n05» leaves.
  const bottom = box.y + box.height - 8;
  expect(bottom - 30).toBeGreaterThan(lowest);
  const middle = box.x + box.width / 2;
  await drag(page, { x: middle, y: bottom }, { x: middle + 60, y: bottom - 30 });
  expect(await selectionOf(page)).toEqual({ kind: 'none' });
});

test('the rectangle stays on its cards while the list scrolls under the drag', async ({ page }) => {
  await openSearch(page);
  const box = (await area(page).boundingBox())!;
  const before = await cards(page);
  const scrollTop = () => area(page).evaluate((element) => element.scrollTop);
  expect(await scrollTop()).toBe(0);
  // Pressed in the corner, down into the first card; then the wheel scrolls the list.
  const pointer = { x: before[0]!.x + 20, y: before[0]!.y + 30 };
  await page.mouse.move(box.x + 3, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(pointer.x, pointer.y, { steps: 6 });
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_equation' });
  await page.mouse.wheel(0, 260);
  await expect.poll(scrollTop).toBeGreaterThan(100);
  // Once the scroll has come to rest.
  let scrolled = -1;
  await expect
    .poll(async () => {
      const now = await scrollTop();
      const still = now === scrolled;
      scrolled = now;
      return still;
    })
    .toBe(true);
  // The rectangle runs from where it was pressed, scrolled up with the cards, to the pointer.
  await expect
    .poll(async () => {
      const drawn = (await region(page).boundingBox())!;
      return [Math.round(drawn.y - (box.y + 3 - scrolled)), Math.round(drawn.y + drawn.height)];
    })
    .toEqual([0, Math.round(pointer.y)]);
  // Every card of the first column, from the first down to the pointer, in the content.
  const column = before.filter((card) => Math.abs(card.x - before[0]!.x) < 1);
  const reached = column.filter((card) => card.y <= pointer.y + scrolled).map((c) => c.name);
  expect(reached.length).toBeGreaterThanOrEqual(2);
  await expect.poll(() => selectedNames(page)).toEqual(reached);
  await page.mouse.up();
  await expect(region(page)).toHaveCount(0);
  expect(await selectedNames(page)).toEqual(reached);
});

test('Escape during the drag gives the selection back; the search stays open', async ({ page }) => {
  await openSearch(page);
  const box = (await area(page).boundingBox())!;
  const [first] = await rows(page);
  await result(page, 'n03').click();
  await page.mouse.move(box.x + 3, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(centre(first[1]!).x, centre(first[1]!).y, { steps: 8 });
  expect(await selectedNames(page)).toEqual([first[0]!.name, first[1]!.name]);
  await page.keyboard.press('Escape');
  await expect(region(page)).toHaveCount(0);
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_03' });
  await expect(page.getByTestId('formula-search')).toBeVisible();
  // The rest of the gesture does nothing.
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 4 });
  await page.mouse.up();
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_03' });
  // The next Escape is the search's again.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('formula-search')).toHaveCount(0);
});

test('a press that does not move changes nothing; a press on a card is the card’s', async ({
  page,
}) => {
  await openSearch(page);
  const box = (await area(page).boundingBox())!;
  await result(page, 'n02').click();
  await page.mouse.click(box.x + 3, box.y + 3);
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_02' });
  // A card pressed and moved starts its own drag (onto the timeline), not a region.
  const card = (await result(page, 'n04').boundingBox())!;
  await page.mouse.move(card.x + 20, card.y + 20);
  await page.mouse.down();
  await page.mouse.move(card.x + 60, card.y + 50, { steps: 6 });
  await expect(region(page)).toHaveCount(0);
  await page.mouse.up();
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_04' });
});
