import { expect, test, type Locator, type Page } from './test';
import { pinMathJax, switchCreatorView } from './creatorHelpers';
import { type MfeWindow } from './helpers';
import { plain, relationProject } from './relationsHelpers';
import { uiState } from './timelineHelpers';

/* The size of the previews of the Creator's list (D173): one key «+/−» in its toolbar (D183) makes
 * the rendering of each row of the list view 1×, 1.5×, 2× or 3× as tall (52, 78, 104, 156 px), and
 * in the block view the tooltip beside a block as many times larger — a click a step larger, a
 * right-click or a Shift+click a step smaller, ↑ and ↓ from the keyboard. Each view keeps its own
 * size, an editor preference that a reload finds again; at an end the key does nothing and says
 * so; at 3× the tooltip stays in the window. */

/** `count` formulas f0, f1…; with eight, the list is f0 … f4, the closed group «grp1» (f5, f6),
 * f7. A clip of f0 on the timeline, so that there is something to play. */
function project(count = 8): string {
  const sources = ['a+b', 'c=d', 'x^2', 'y', 'z', 'u+v', 'w', 'k'];
  const formulas = Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    name: `f${i}`,
    source: sources[i % sources.length]!,
  }));
  const groups = count === 8 ? [{ id: 'g1', name: 'grp1', formulaIds: ['f5', 'f6'] }] : [];
  return relationProject([plain('c0', 'f0', 't1', 0, 4)], formulas, { formulaGroups: groups });
}

const sizeKey = (page: Page) => page.getByTestId('creator-preview-size');
/** A click on the key: a step larger. */
const larger = (page: Page) => sizeKey(page).click();
/** A right-click on the key: a step smaller. */
const smaller = (page: Page) => sizeKey(page).click({ button: 'right' });
/** What the key says, and the scale it carries. */
async function says(page: Page, scale: string, title: string): Promise<void> {
  await expect(sizeKey(page)).toHaveAttribute('data-scale', scale);
  await expect(sizeKey(page)).toHaveAttribute('title', title);
  await expect(sizeKey(page)).toHaveAccessibleName(title);
}
const MIDDLE = 'click for larger, right-click or Shift+click for smaller';
/** The row or block of a formula, or the block of a group, by its name. */
const card = (page: Page, name: string) =>
  page.locator(`[data-testid="formula-list"] > li[data-name="${name}"]`);
const rowThumb = (page: Page) => card(page, 'f0').getByTestId('formula-thumb');
const groupThumb = (page: Page) =>
  page.getByTestId('formula-group-thumbs').getByTestId('formula-thumb').first();
const tooltip = (page: Page) => page.getByTestId('formula-tooltip');

const height = async (locator: Locator) => Math.round((await locator.boundingBox())!.height);
const width = async (locator: Locator) => Math.round((await locator.boundingBox())!.width);

/** Loads the project into the app that is open (after a reload too). */
async function load(page: Page, count = 8): Promise<void> {
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await page.evaluate((text) => {
    const mfe = (window as MfeWindow).__mfe!;
    const parsed = mfe.parseProject(text);
    if (!parsed.ok) throw new Error(parsed.error);
    mfe.loadProject(parsed.project);
  }, project(count));
  await expect(card(page, 'f0')).toBeVisible();
}

async function open(page: Page, count = 8): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await load(page, count);
  await pinMathJax(page);
  await expect(rowThumb(page).locator('svg')).toBeVisible();
}

/** Points at a block, away from the toolbar, and waits for its tooltip. */
async function pointAt(page: Page, name: string): Promise<void> {
  await page.mouse.move(5, 450);
  await expect(tooltip(page)).toHaveCount(0);
  const box = (await card(page, name).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  await expect(tooltip(page)).toBeVisible();
  await expect(tooltip(page)).toContainText(name);
}

/** Drags the bar `selector` by (dx, dy). */
async function dragBar(page: Page, selector: string, dx: number, dy: number): Promise<void> {
  const bar = (await page.locator(selector).first().boundingBox())!;
  const x = bar.x + bar.width / 2;
  const y = bar.y + bar.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test('in the list view, a click makes the rows’ renderings 52, 78, 104 and 156 px tall, a right-click shorter', async ({
  page,
}) => {
  await open(page);
  const svg = rowThumb(page).locator('svg');
  expect(await height(rowThumb(page))).toBe(52);
  expect(await height(groupThumb(page))).toBe(36);
  const drawn = await height(svg);
  await expect(sizeKey(page)).toHaveText('+/−');
  await says(page, '1', 'Preview size 1×, the smallest: click for larger');
  // Never off: at the smallest a right-click is taken, and does nothing.
  await expect(sizeKey(page)).toBeEnabled();
  await smaller(page);
  await says(page, '1', 'Preview size 1×, the smallest: click for larger');
  expect(await height(rowThumb(page))).toBe(52);

  for (const [scale, px] of [
    ['1.5', 78],
    ['2', 104],
    ['3', 156],
  ] as const) {
    await larger(page);
    await expect.poll(() => height(rowThumb(page))).toBe(px);
    await expect(sizeKey(page)).toHaveAttribute('data-scale', scale);
  }
  await says(page, '3', 'Preview size 3×, the largest: right-click or Shift+click for smaller');
  // At the largest a click does nothing.
  await larger(page);
  await expect(sizeKey(page)).toHaveAttribute('data-scale', '3');
  expect(await height(rowThumb(page))).toBe(156);
  // A closed group's renderings grow in proportion; the formula is drawn as large as its box.
  expect(await height(groupThumb(page))).toBe(108);
  expect(await height(svg)).toBeGreaterThan(2.5 * drawn);
  // Every row of a formula, not the first alone.
  for (const name of ['f3', 'f7']) {
    expect(await height(card(page, name).getByTestId('formula-thumb'))).toBe(156);
  }

  for (const [scale, px] of [
    ['2', 104],
    ['1.5', 78],
    ['1', 52],
  ] as const) {
    await smaller(page);
    await expect.poll(() => height(rowThumb(page))).toBe(px);
    await expect(sizeKey(page)).toHaveAttribute('data-scale', scale);
  }
  await says(page, '1', 'Preview size 1×, the smallest: click for larger');
});

test('a right-click opens no menu of the browser; Shift+click, ↑, ↓, Enter and Space step too', async ({
  page,
}) => {
  await open(page);
  const scale = () => sizeKey(page).getAttribute('data-scale');
  // Every right-click on the key is the key's: its default, the browser's menu, is prevented
  // (read after the app's own listeners, by one on the window).
  await page.evaluate(() => {
    const seen: boolean[] = [];
    Object.assign(window, { contextMenus: seen });
    window.addEventListener('contextmenu', (event) => seen.push(event.defaultPrevented));
  });
  await larger(page);
  await smaller(page);
  await smaller(page); // at the smallest: taken all the same
  expect(
    await page.evaluate(() => (window as unknown as { contextMenus: boolean[] }).contextMenus),
  ).toEqual([true, true]);
  expect(await scale()).toBe('1');

  // Shift+click: a step smaller.
  await larger(page);
  await larger(page);
  await sizeKey(page).click({ modifiers: ['Shift'] });
  await expect.poll(scale).toBe('1.5');

  // Kept the focus after that click, the key leaves Space to playback, Shift held or not, as
  // every button of the app does.
  await page.keyboard.press('Shift+Space');
  await expect.poll(async () => (await uiState(page)).playing).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await uiState(page)).playing).toBe(false);
  expect(await scale()).toBe('1.5');

  // From the keyboard, the key reached with Shift+Tab from «+ New», the control after it: ↑ and
  // ↓; Enter and Space click it, larger, and with Shift smaller. Nothing else hears these keys:
  // the selection, the playhead and playback stay.
  await card(page, 'f2').click();
  const before = await uiState(page);
  await page.getByTestId('creator-new').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(sizeKey(page)).toBeFocused();
  for (const [key, expected] of [
    ['ArrowUp', '2'],
    ['ArrowUp', '3'],
    ['ArrowUp', '3'],
    ['ArrowDown', '2'],
    ['Shift+Enter', '1.5'],
    ['Enter', '2'],
    ['Shift+Space', '1.5'],
    ['Space', '2'],
    ['ArrowDown', '1.5'],
    ['ArrowDown', '1'],
    ['ArrowDown', '1'],
  ] as const) {
    await page.keyboard.press(key);
    await expect.poll(scale, { message: `after ${key}` }).toBe(expected);
  }
  await expect(sizeKey(page)).toBeFocused();
  const after = await uiState(page);
  expect([after.selection, after.time, after.playing]).toEqual([
    before.selection,
    before.time,
    false,
  ]);
  // Each press is announced: the size, and the end reached.
  await expect(page.getByTestId('announcer')).toHaveText('Preview size 1×, the smallest');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('announcer')).toHaveText('Preview size 1.5×');
});

test('in the block view, the key sizes the tooltip of a block: its rendering in proportion', async ({
  page,
}) => {
  await open(page);
  await switchCreatorView(page, 'grid');
  await pointAt(page, 'f1');
  const thumb = tooltip(page).getByTestId('formula-thumb');
  expect([await width(tooltip(page)), await width(thumb), await height(thumb)]).toEqual([
    288, 274, 62,
  ]);
  await says(page, '1', 'Preview tooltip size 1×, the smallest: click for larger');

  for (const [scale, size] of [
    ['1.5', [425, 411, 93]],
    ['2', [562, 548, 124]],
    ['3', [836, 822, 186]],
  ] as const) {
    await larger(page);
    await expect(sizeKey(page)).toHaveAttribute('data-scale', scale);
    await pointAt(page, 'f1');
    expect([await width(tooltip(page)), await width(thumb), await height(thumb)]).toEqual(size);
  }
  await says(
    page,
    '3',
    'Preview tooltip size 3×, the largest: right-click or Shift+click for smaller',
  );
  // A group's block has the same tooltip, as large.
  await pointAt(page, 'grp1');
  expect(await width(tooltip(page))).toBe(836);
  expect(await height(tooltip(page).getByTestId('formula-thumb').first())).toBe(186);
  // A right-click a step back.
  await smaller(page);
  await says(page, '2', `Preview tooltip size 2×: ${MIDDLE}`);
  await pointAt(page, 'f1');
  expect(await width(tooltip(page))).toBe(562);

  // The list view kept its own size.
  await switchCreatorView(page, 'list');
  expect(await height(rowThumb(page))).toBe(52);
  await says(page, '1', 'Preview size 1×, the smallest: click for larger');
});

test('each view’s size is remembered on its own, and comes back after a reload', async ({
  page,
}) => {
  await open(page);
  await larger(page);
  await larger(page);
  await switchCreatorView(page, 'grid');
  await larger(page);
  await switchCreatorView(page, 'list');
  expect(
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('mfe.preferences') ?? '{}');
      return [stored.creatorListPreview, stored.creatorBlockPreview];
    }),
  ).toEqual([2, 1.5]);

  await page.reload();
  await load(page);
  expect(await height(rowThumb(page))).toBe(104);
  await says(page, '2', `Preview size 2×: ${MIDDLE}`);
  await switchCreatorView(page, 'grid');
  await says(page, '1.5', `Preview tooltip size 1.5×: ${MIDDLE}`);
  await pointAt(page, 'f0');
  expect(await width(tooltip(page))).toBe(425);
});

test('at 3× the tooltip stays in the window beside a block near its foot or its right edge', async ({
  page,
}) => {
  await open(page, 20);
  await switchCreatorView(page, 'grid');
  for (let i = 0; i < 3; i++) await larger(page);
  await expect(sizeKey(page)).toHaveAttribute('data-scale', '3');
  const inWindow = async () => {
    const box = (await tooltip(page).boundingBox())!;
    return (
      box.x >= 6 && box.y >= 6 && box.x + box.width <= 1440 - 6 && box.y + box.height <= 900 - 6
    );
  };
  const blockBoxes = () =>
    page.locator('[data-testid="formula-list"] > li[role="option"]').evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        const name = item.getAttribute('data-name')!;
        return { name, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      }),
    );

  // The panels above the timeline taller, the list scrolled to its end: its last block is near
  // the foot of the window, too near for a tooltip hung from its top.
  await dragBar(page, '.separator-horizontal', 0, 240);
  await page.getByTestId('formula-list').evaluate((list) => {
    list.scrollTop = list.scrollHeight;
  });
  const low = (await blockBoxes()).at(-1)!;
  expect(low.y + 246 + 6).toBeGreaterThan(900);
  await pointAt(page, low.name);
  expect(await inWindow()).toBe(true);
  // Level with the foot of the block, beside it.
  const beside = (await tooltip(page).boundingBox())!;
  expect(Math.abs(beside.y + beside.height - low.bottom)).toBeLessThan(2);
  expect(beside.x).toBeGreaterThan(low.right);

  // The Creator wide: the last block of its first row, near the window's right edge, has its
  // tooltip on its left.
  await dragBar(page, '.separator-vertical', 760, 0);
  const boxes = await blockBoxes();
  const top = Math.min(...boxes.map((b) => b.y));
  const rightmost = boxes
    .filter((b) => Math.abs(b.y - top) < 2)
    .reduce((a, b) => (b.right > a.right ? b : a));
  expect(rightmost.right + 8 + 836).toBeGreaterThan(1440 - 6);
  await pointAt(page, rightmost.name);
  expect(await inWindow()).toBe(true);
  const left = (await tooltip(page).boundingBox())!;
  expect(left.x + left.width).toBeLessThanOrEqual(rightmost.x);
});
