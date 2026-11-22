import { expect, test, type Locator, type Page } from './test';
import { pinMathJax, switchCreatorView } from './creatorHelpers';
import { getProject, openWithProject, selectionOf } from './helpers';
import { relationProject } from './relationsHelpers';

/* Selecting formulas by region in the Creator's own list (D172), in the list view and in the
 * block view: a rectangle dragged from the empty space of the list selects the rows or blocks it
 * touches — with no key it replaces the selection, with Shift it adds, with Ctrl/⌘ it takes out;
 * with Alt held it may start on a row or a block too, whose own drag then does not start. A
 * group's row is no formula, and a closed group's formulas are not drawn: neither is touched.
 * Escape gives the selection back, and the rectangle stays on its rows while the list scrolls. */

const FORMULAS = ['a+b', 'c=d', 'x^2', 'y', 'z', 'u+v', 'w', 'k'].map((latex, i) => ({
  id: `f${i}`,
  name: `f${i}`,
  source: latex,
}));

/** The list, top to bottom: f0 … f4, the closed group «grp1» (f5, f6), f7. */
const GROUP = { id: 'g1', name: 'grp1', formulaIds: ['f5', 'f6'] };

const list = (page: Page) => page.getByTestId('formula-list');
const region = (page: Page) => page.getByTestId('creator-region');
const card = (page: Page, name: string) =>
  page.locator(`[data-testid="formula-list"] [data-formula-id][data-name="${name}"]`);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const boxOf = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
const cardBox = (page: Page, name: string) => boxOf(card(page, name));
const centre = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** The formulas selected, in the order of the selection. */
async function selected(page: Page): Promise<string[]> {
  const selection = (await selectionOf(page)) as { kind: string; id?: string; ids?: string[] };
  if (selection.kind === 'formula') return [selection.id!];
  return selection.kind === 'formulas' ? selection.ids! : [];
}

type Key = 'Shift' | 'ControlOrMeta' | 'Alt';

/** A drag from `from` to `to` with the mouse, `keys` held from before the press; the rectangle is
 * drawn while it is held and gone once it is let go. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  keys: Key[] = [],
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

async function openList(page: Page, view: 'list' | 'grid' = 'list'): Promise<void> {
  // Tall enough for the blocks to leave free space under the last of them; the rows scroll.
  await page.setViewportSize({ width: 1500, height: view === 'grid' ? 1300 : 950 });
  await openWithProject(page, relationProject([], FORMULAS, { formulaGroups: [GROUP] }));
  await pinMathJax(page);
  if (view === 'grid') await switchCreatorView(page, 'grid');
  await expect(list(page)).toHaveAttribute('data-view', view);
  await expect(card(page, 'f0')).toBeVisible();
}

test('in the list view, a region from the empty space selects the rows it touches; Shift adds; Ctrl/⌘ takes out', async ({
  page,
}) => {
  await openList(page);
  const area = await boxOf(list(page));
  const f0 = await cardBox(page, 'f0');
  const f1 = await cardBox(page, 'f1');
  const f3 = await cardBox(page, 'f3');
  // The list's left margin is empty space: a row starts 8 px in.
  expect(f0.x - area.x).toBeGreaterThanOrEqual(6);
  const margin = area.x + 3;

  // No key: from the margin beside the first row to the middle of the second.
  await drag(page, { x: margin, y: f0.y + 6 }, centre(f1));
  expect(await selected(page)).toEqual(['f0', 'f1']);
  await expect(card(page, 'f1')).toHaveAttribute('aria-selected', 'true');

  // Shift: from the margin beside the fourth row into it.
  await drag(page, { x: margin, y: f3.y + 6 }, centre(f3), ['Shift']);
  expect(await selected(page)).toEqual(['f0', 'f1', 'f3']);

  // Ctrl/⌘: from the gap under the first row, up into it.
  await drag(page, { x: centre(f0).x, y: f0.y + f0.height + 4 }, centre(f0), ['ControlOrMeta']);
  expect(await selected(page)).toEqual(['f1', 'f3']);
  await expect(card(page, 'f0')).toHaveAttribute('aria-selected', 'false');

  // The menu of a row acts on what the regions selected.
  await card(page, 'f3').click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-header')).toHaveText('2 formulas');
  await page.keyboard.press('Escape');
});

test('in the block view, a region from the gaps selects the blocks; not a group, nor its hidden formulas', async ({
  page,
}) => {
  await openList(page, 'grid');
  const area = await boxOf(list(page));
  const f0 = await cardBox(page, 'f0');
  const f1 = await cardBox(page, 'f1');
  expect(f1.x - (f0.x + f0.width)).toBeGreaterThanOrEqual(6);

  // From the gap between the first two blocks into the first: that one alone.
  await drag(page, { x: f0.x + f0.width + 4, y: f0.y + 6 }, centre(f0));
  expect(await selected(page)).toEqual(['f0']);

  // Shift: from the free space under the last row of blocks, over every block, to the top
  // left: every formula drawn is added — not the group, whose formulas are not drawn.
  const last = await boxOf(card(page, 'f7'));
  const room = area.y + area.height - (last.y + last.height);
  expect(room).toBeGreaterThan(30);
  const below = last.y + last.height + room / 2;
  await drag(page, { x: area.x + area.width - 12, y: below }, { x: area.x + 3, y: area.y + 1 }, [
    'Shift',
  ]);
  expect(await selected(page)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f7']);
  await expect(page.getByTestId('formula-group')).toHaveAttribute('aria-selected', 'false');

  // Opened, the group's formulas are blocks like any other.
  await page.getByTestId('formula-group').getByTestId('formula-group-toggle').click();
  await expect(card(page, 'f5')).toBeVisible();
  const f5 = await boxOf(card(page, 'f5'));
  await drag(page, { x: f5.x + f5.width + 4, y: f5.y + 6 }, centre(f5));
  expect(await selected(page)).toEqual(['f5']);
});

test('with Alt a region starts on a row, whose drag does not start; a plain drag still drags it', async ({
  page,
}) => {
  await openList(page);
  // Every drag of an element the page starts, and whether it was refused.
  await page.evaluate(() => {
    const w = window as unknown as { __drags: { prevented: () => boolean }[] };
    w.__drags = [];
    window.addEventListener(
      'dragstart',
      (event) => w.__drags.push({ prevented: () => event.defaultPrevented }),
      true,
    );
  });
  const refused = () =>
    page.evaluate(() =>
      (window as unknown as { __drags: { prevented: () => boolean }[] }).__drags.map((d) =>
        d.prevented(),
      ),
    );
  // The first rows, in view (the list scrolls further down).
  const f0 = await cardBox(page, 'f0');
  const f1 = await cardBox(page, 'f1');
  const f2 = await cardBox(page, 'f2');
  const nudge = (box: Box, dx: number, dy: number) => ({
    x: centre(box).x + dx,
    y: centre(box).y + dy,
  });

  // Pressed on the middle of a row with Alt, dragged to the next: both, and no clip.
  await drag(page, centre(f1), centre(f2), ['Alt']);
  expect(await selected(page)).toEqual(['f1', 'f2']);
  expect((await refused()).every((prevented) => prevented)).toBe(true);
  expect((await getProject(page)).clips).toHaveLength(0);
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);

  // Alt+Shift adds, from a row too; Alt+Ctrl/⌘ takes out.
  await drag(page, centre(f0), nudge(f0, 20, 4), ['Alt', 'Shift']);
  expect(await selected(page)).toEqual(['f0', 'f1', 'f2']);
  await drag(page, centre(f2), nudge(f2, -20, -4), ['Alt', 'ControlOrMeta']);
  expect(await selected(page)).toEqual(['f0', 'f1']);
  expect((await getProject(page)).clips).toHaveLength(0);

  // Alt and a click that does not travel: the click it always was.
  await page.keyboard.down('Alt');
  await card(page, 'f3').click();
  await page.keyboard.up('Alt');
  expect(await selected(page)).toEqual(['f3']);
  await expect(card(page, 'f3')).toBeFocused();

  // Without Alt, a row pressed and moved is dragged onto the timeline, as ever.
  await card(page, 'f2').dragTo(page.getByTestId('track-lane-t1'), {
    targetPosition: { x: 300, y: 12 },
  });
  await expect.poll(async () => (await getProject(page)).clips.length).toBe(1);
  expect((await getProject(page)).clips[0]).toMatchObject({ formulaId: 'f2', trackId: 't1' });
  await expect(region(page)).toHaveCount(0);
});

test('Escape during the drag gives the selection back, and the release clicks nothing', async ({
  page,
}) => {
  await openList(page);
  await card(page, 'f3').click();
  const f0 = await cardBox(page, 'f0');
  const f1 = await cardBox(page, 'f1');
  // Started on a row with Alt: let go on that row after Escape, its click would select it.
  await page.keyboard.down('Alt');
  await page.mouse.move(centre(f0).x, centre(f0).y);
  await page.mouse.down();
  await page.mouse.move(centre(f1).x, centre(f1).y, { steps: 8 });
  await expect(region(page)).toBeVisible();
  expect(await selected(page)).toEqual(['f0', 'f1']);
  await page.keyboard.press('Escape');
  await expect(region(page)).toHaveCount(0);
  expect(await selected(page)).toEqual(['f3']);
  await page.mouse.move(centre(f0).x, centre(f0).y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(await selected(page)).toEqual(['f3']);
  expect((await getProject(page)).clips).toHaveLength(0);
  // The next click is a click.
  await card(page, 'f1').click();
  expect(await selected(page)).toEqual(['f1']);
});

test('the rectangle stays on its rows while the list scrolls under the drag', async ({ page }) => {
  await openList(page);
  const area = await boxOf(list(page));
  const scrollTop = () => list(page).evaluate((element) => element.scrollTop);
  const f0 = await cardBox(page, 'f0');
  const f1 = await cardBox(page, 'f1');
  // Pressed in the margin beside the first row, down into the second; then the wheel scrolls.
  const pointer = centre(f1);
  await page.mouse.move(area.x + 3, f0.y + 6);
  await page.mouse.down();
  await page.mouse.move(pointer.x, pointer.y, { steps: 6 });
  expect(await selected(page)).toEqual(['f0', 'f1']);
  await page.mouse.wheel(0, 200);
  await expect.poll(scrollTop).toBeGreaterThan(80);
  let scrolled = -1;
  await expect
    .poll(async () => {
      const now = await scrollTop();
      const still = now === scrolled;
      scrolled = now;
      return still;
    })
    .toBe(true);
  // The rectangle runs from where it was pressed, scrolled up with the rows, to the pointer.
  await expect
    .poll(async () => {
      const drawn = (await region(page).boundingBox())!;
      return Math.round(drawn.y + drawn.height);
    })
    .toBe(Math.round(pointer.y));
  // Every row of a formula from the first down to the pointer, in the content: more than the two
  // it had reached before the list scrolled.
  const rows = await page
    .locator('[data-testid="formula-list"] [data-testid="formula-item"]')
    .evaluateAll(
      (items, top) =>
        items
          .filter((item) => item.getBoundingClientRect().top <= top)
          .map((item) => item.getAttribute('data-formula-id')),
      pointer.y,
    );
  expect(rows.length).toBeGreaterThanOrEqual(3);
  await expect.poll(() => selected(page)).toEqual(rows);
  await page.mouse.up();
  await expect(region(page)).toHaveCount(0);
});
