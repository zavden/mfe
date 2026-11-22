import { expect, test, type Page } from './test';
import { openWithProject, readExample, type MfeWindow } from './helpers';
import { closeEditor } from './creatorHelpers';
import { box } from './timelineHelpers';

/* Zen mode (D182, D188), for small windows: a preference. With it on, the timeline is a column
 * on the left, drawn vertical (`zenTimeline.spec.ts`), and the Preview takes the rest. A thin
 * strip along the Preview's top — or its bottom — has a button for the Creator and one for the
 * Animations panel: each opens and closes its panel as a half of a drawer over the Preview, the
 * Creator on the left and the Animations panel on the right, side by side when both are open.
 * The strip also has the tools one reaches for most. It only rearranges: the menus, the panels'
 * title bars and the transport are the same. Designed for a window of 1366×768. */

const SMALL = { width: 1366, height: 768 };

const layout = (page: Page) => page.locator('main.app-main');
const drawer = (page: Page, id: 'creator' | 'animations') => page.getByTestId(`zen-drawer-${id}`);
const tab = (page: Page, id: 'creator' | 'animations') => page.getByTestId(`zen-tab-${id}`);

async function setZen(page: Page, on: boolean): Promise<void> {
  await page.getByTestId('menu-preferences').click();
  const entry = page.getByTestId('menu-item-preferences-zen-mode');
  await expect(entry).toHaveAttribute('aria-checked', String(!on));
  await entry.click();
  await expect(layout(page)).toHaveAttribute('data-layout', on ? 'zen' : 'panels');
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(SMALL);
});

test('Preferences ▸ Zen mode: the timeline in a column, the Preview with the rest, two tabs over it', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await expect(layout(page)).toHaveAttribute('data-layout', 'panels');
  const before = await box(page.getByTestId('panel-preview'));
  await setZen(page, true);
  const timeline = await box(page.getByTestId('panel-timeline'));
  const preview = await box(page.getByTestId('panel-preview'));
  const strip = await box(page.getByTestId('zen-strip'));
  // The timeline: a column down the left side, from the menu bar to the bottom.
  expect(timeline.x).toBeLessThan(20);
  expect(timeline.width).toBeLessThan(340);
  expect(timeline.y + timeline.height).toBeGreaterThan(SMALL.height - 20);
  // The Preview: everything to its right, under the strip of the tabs — far larger than it was.
  expect(preview.x).toBeGreaterThanOrEqual(timeline.x + timeline.width);
  expect(preview.x + preview.width).toBeGreaterThan(SMALL.width - 20);
  expect(preview.y + preview.height).toBeGreaterThan(SMALL.height - 20);
  expect(preview.width * preview.height).toBeGreaterThan(before.width * before.height * 1.6);
  expect(strip.height).toBeLessThan(40);
  expect(strip.y + strip.height).toBeLessThanOrEqual(preview.y);
  expect(strip.x).toBeCloseTo(preview.x, 0);
  // No panel is open over it until its tab is pressed.
  await expect(drawer(page, 'creator')).toBeHidden();
  await expect(drawer(page, 'animations')).toBeHidden();
  await expect(page.getByTestId('panel-creator')).toBeHidden();
  await expect(page.getByTestId('panel-animations')).toBeHidden();
  // Nothing is pushed out of the window.
  expect(
    await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]),
  ).toEqual([SMALL.width, SMALL.height]);
  // It only rearranges: the menus, the title bars and the transport are there.
  for (const id of ['menu-file', 'menu-view', 'transport-play', 'panel-preview', 'panel-timeline'])
    await expect(page.getByTestId(id)).toBeVisible();
});

test('each button opens its panel as a half of a drawer over the Preview: Creator left, Animations right', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await setZen(page, true);
  const preview = await box(page.getByTestId('panel-preview'));
  // The Creator: the left half, from the strip down. The Preview is seen through the other.
  await tab(page, 'creator').click();
  await expect(tab(page, 'creator')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('panel-creator')).toBeVisible();
  await expect(page.getByTestId('panel-animations')).toBeHidden();
  const left = await box(drawer(page, 'creator'));
  expect(left.x).toBeCloseTo(preview.x, 0);
  expect(left.y).toBeCloseTo(preview.y, 0);
  expect(left.width).toBeCloseTo(preview.width * 0.45, -1);
  expect(left.height).toBeLessThan(preview.height);
  // It stays while one works elsewhere: a press on the timeline does not close it.
  await page.getByTestId('clip-c_a1').click({ position: { x: 20, y: 60 } });
  await expect(drawer(page, 'creator')).toBeVisible();
  // The Animations panel: the right half, beside it. Both are on screen at once.
  await tab(page, 'animations').click();
  await expect(page.getByTestId('panel-creator')).toBeVisible();
  await expect(page.getByTestId('panel-animations')).toBeVisible();
  await expect(page.getByTestId('clip-properties')).toBeVisible();
  const right = await box(drawer(page, 'animations'));
  expect(right.x).toBeCloseTo(left.x + left.width, 0);
  expect(right.x + right.width).toBeCloseTo(preview.x + preview.width, 0);
  expect(right.height).toBeCloseTo(left.height, 0);
  // A button again closes its own half, and leaves the other.
  await tab(page, 'creator').click();
  await expect(drawer(page, 'creator')).toBeHidden();
  await expect(drawer(page, 'animations')).toBeVisible();
  await expect(tab(page, 'creator')).toHaveAttribute('aria-expanded', 'false');
  await expect(tab(page, 'animations')).toHaveAttribute('aria-expanded', 'true');
});

test('a press on the Preview closes the drawer and does what it does there; Escape closes it too', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await setZen(page, true);
  await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(1.5));
  await tab(page, 'creator').click();
  await tab(page, 'animations').click();
  // A press on the scene, under the drawer, where the formula a1 is drawn: both halves close,
  // and the press selects the formula as it always does.
  const frame = await box(page.getByTestId('preview-frame'));
  const open = await box(drawer(page, 'animations'));
  expect(frame.y + frame.height / 2).toBeLessThan(open.y + open.height); // the middle is covered
  await tab(page, 'creator').click(); // the left half closed: the scene is reached through it
  await page.mouse.click(frame.x + frame.width * 0.3, open.y + open.height + 40);
  await expect(drawer(page, 'animations')).toBeHidden();
  await expect(drawer(page, 'creator')).toBeHidden();
  // A press on the formula itself: closed, and selected.
  await tab(page, 'animations').click();
  await page.getByTestId('zen-drawer-edge-animations').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp'); // short, clear of the middle
  await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await expect(drawer(page, 'animations')).toBeHidden();
  expect(
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().selection),
  ).toEqual({ kind: 'clips', ids: ['c_a1'] });
  // The transport is not the scene: a press on it leaves the drawer open.
  await tab(page, 'animations').click();
  await page.getByTestId('transport-start').click();
  await expect(drawer(page, 'animations')).toBeVisible();
  // Escape closes what is open, from a button of the strip or from inside a panel — but a field
  // being typed in keeps the key for itself.
  await tab(page, 'creator').click();
  await page.keyboard.press('Escape');
  await expect(drawer(page, 'creator')).toBeHidden();
  await expect(drawer(page, 'animations')).toBeHidden();
  await tab(page, 'creator').click();
  await page.getByTestId('creator-tab-audio').click();
  await page.getByTestId('creator-tab-audio').focus();
  await page.keyboard.press('Escape');
  await expect(drawer(page, 'creator')).toBeHidden();
  await expect(tab(page, 'creator')).toBeFocused();
  await page.getByTestId('clip-c_a1').click({ position: { x: 20, y: 60 } });
  await tab(page, 'animations').click();
  await page.getByTestId('animations-tab-timing').click();
  await page.getByTestId('clip-start').focus();
  await page.keyboard.press('Escape');
  await expect(drawer(page, 'animations')).toBeVisible();
});

test('the strip moves to the bottom of the Preview and back; the drawer opens from its side', async ({
  page,
}) => {
  await page.goto('/');
  await setZen(page, true);
  const move = page.getByTestId('zen-strip-move');
  await move.click();
  await expect(page.getByTestId('zen-stage')).toHaveAttribute('data-strip', 'bottom');
  const preview = await box(page.getByTestId('panel-preview'));
  const strip = await box(page.getByTestId('zen-strip'));
  expect(strip.y).toBeGreaterThanOrEqual(preview.y + preview.height);
  await tab(page, 'creator').click();
  const open = await box(drawer(page, 'creator'));
  // It rises from the strip: its bottom is the Preview's.
  expect(open.y + open.height).toBeCloseTo(preview.y + preview.height, 0);
  expect(open.y).toBeGreaterThan(preview.y);
  // A reload keeps the side, and the drawer as it was left.
  await page.reload();
  await expect(page.getByTestId('zen-stage')).toHaveAttribute('data-strip', 'bottom');
  await expect(page.getByTestId('panel-creator')).toBeVisible();
  await move.click();
  await expect(page.getByTestId('zen-stage')).toHaveAttribute('data-strip', 'top');
  const back = await box(page.getByTestId('zen-strip'));
  expect(back.y + back.height).toBeLessThanOrEqual(
    (await box(page.getByTestId('panel-preview'))).y,
  );
});

test('the free edge of the drawer and the line where its halves meet drag, and are kept', async ({
  page,
}) => {
  await page.goto('/');
  await setZen(page, true);
  await tab(page, 'creator').click();
  await tab(page, 'animations').click();
  const before = await box(drawer(page, 'animations'));
  const edge = await box(page.getByTestId('zen-drawer-edge-animations'));
  const from = { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 120, { steps: 5 });
  await page.mouse.up();
  // Both halves are one drawer: as tall as each other.
  expect((await box(drawer(page, 'animations'))).height).toBeCloseTo(before.height - 120, -1);
  expect((await box(drawer(page, 'creator'))).height).toBeCloseTo(before.height - 120, -1);
  // The arrows on the edge do it by steps; the drawer never leaves the Preview's place.
  await page.getByTestId('zen-drawer-edge-creator').focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
  const preview = await box(page.getByTestId('panel-preview'));
  const tallest = await box(drawer(page, 'creator'));
  expect(tallest.height).toBeCloseTo(preview.height, 0);
  await page.keyboard.press('ArrowUp');
  const kept = (await box(drawer(page, 'creator'))).height;
  expect(kept).toBeLessThan(tallest.height);
  // Where the halves meet: dragged to the right, the Creator is wider and the other narrower.
  const split = await box(page.getByTestId('zen-drawer-split'));
  const grab = { x: split.x + split.width / 2, y: split.y + split.height / 2 };
  const wide = (await box(drawer(page, 'creator'))).width;
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 100, grab.y, { steps: 5 });
  await page.mouse.up();
  const creator = await box(drawer(page, 'creator'));
  const animations = await box(drawer(page, 'animations'));
  expect(creator.width).toBeCloseTo(wide + 100, -1);
  expect(animations.x).toBeCloseTo(creator.x + creator.width, 0);
  expect(animations.x + animations.width).toBeCloseTo(preview.x + preview.width, 0);
  // A reload keeps the halves open, their height and where they meet.
  await page.reload();
  await expect(drawer(page, 'creator')).toBeVisible();
  await expect(drawer(page, 'animations')).toBeVisible();
  expect((await box(drawer(page, 'creator'))).height).toBeCloseTo(kept, 0);
  expect((await box(drawer(page, 'creator'))).width).toBeCloseTo(creator.width, 0);
});

test('Zen mode is kept across a reload, and turned off gives the usual layout back', async ({
  page,
}) => {
  await page.goto('/');
  await setZen(page, true);
  await page.reload();
  await expect(layout(page)).toHaveAttribute('data-layout', 'zen');
  await expect(page.getByTestId('zen-stage')).toBeVisible();
  await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-orientation', 'vertical');
  await setZen(page, false);
  await expect(page.getByTestId('zen-stage')).toHaveCount(0);
  await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-orientation', 'horizontal');
  await expect(page.getByTestId('panel-creator')).toBeVisible();
  await expect(page.getByTestId('panel-animations')).toBeVisible();
  const creator = await box(page.getByTestId('panel-creator'));
  const preview = await box(page.getByTestId('panel-preview'));
  const animations = await box(page.getByTestId('panel-animations'));
  const timeline = await box(page.getByTestId('panel-timeline'));
  expect(creator.x).toBeLessThan(preview.x);
  expect(preview.x).toBeLessThan(animations.x);
  expect(timeline.y).toBeGreaterThanOrEqual(preview.y + preview.height);
  // Neither panel came back folded, whatever the drawer was doing.
  await expect(page.getByTestId('panel-creator')).toHaveAttribute('data-folded', 'false');
  await expect(page.getByTestId('panel-animations')).toHaveAttribute('data-folded', 'false');
});

test('the panels are not mounted again by the switch: the Preview keeps its view', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await page.getByTestId('preview-zoom-in').click();
  const frame = page.getByTestId('preview-frame');
  const zoom = await frame.getAttribute('data-zoom');
  expect(zoom).not.toBe('1.000');
  await page.evaluate(() => {
    (document.querySelector('[data-testid="preview-frame"]') as HTMLElement).dataset.kept = 'yes';
  });
  await setZen(page, true);
  await expect(frame).toHaveAttribute('data-zoom', zoom!);
  await expect(frame).toHaveAttribute('data-kept', 'yes');
  await setZen(page, false);
  await expect(frame).toHaveAttribute('data-zoom', zoom!);
  await expect(frame).toHaveAttribute('data-kept', 'yes');
});

test('the fold button of a panel closes its half; View ▸ Panels opens and closes each half', async ({
  page,
}) => {
  await page.goto('/');
  await setZen(page, true);
  const item = (id: string) => page.getByTestId(`menu-item-view-panels-${id}`);
  const openPanels = async () => {
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menu-item-view-panels').hover();
  };
  // Neither is on screen: both unchecked. Each entry opens its own half.
  await openPanels();
  await expect(item('creator')).toHaveAttribute('aria-checked', 'false');
  await expect(item('animations')).toHaveAttribute('aria-checked', 'false');
  await item('animations').click();
  await expect(page.getByTestId('panel-animations')).toBeVisible();
  await expect(tab(page, 'animations')).toHaveAttribute('aria-expanded', 'true');
  await openPanels();
  await expect(item('animations')).toHaveAttribute('aria-checked', 'true');
  await item('creator').click();
  await expect(page.getByTestId('panel-creator')).toBeVisible();
  await expect(page.getByTestId('panel-animations')).toBeVisible();
  // The fold button in the title bar of a panel closes its half.
  await page.getByTestId('panel-fold-creator').click();
  await expect(drawer(page, 'creator')).toBeHidden();
  await expect(drawer(page, 'animations')).toBeVisible();
  await openPanels();
  await item('animations').click();
  await expect(drawer(page, 'animations')).toBeHidden();
  // The timeline folds to a strip on the left, and the Preview takes its room.
  const wide = (await box(page.getByTestId('panel-preview'))).width;
  await openPanels();
  await item('timeline').click();
  await expect(page.getByTestId('panel-timeline')).toHaveAttribute('data-folded', 'true');
  expect((await box(page.getByTestId('panel-timeline'))).width).toBeLessThan(40);
  expect((await box(page.getByTestId('panel-preview'))).width).toBeGreaterThan(wide + 150);
});

test("C opens and closes the Creator's half of the drawer and A the Animations panel's", async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await setZen(page, true);
  // Out of every field: the title of the Preview.
  await page.getByTestId('panel-preview').locator('.panel-title').click();
  await expect(drawer(page, 'creator')).toBeHidden();
  await page.keyboard.press('c');
  await expect(drawer(page, 'creator')).toBeVisible();
  await expect(tab(page, 'creator')).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer(page, 'animations')).toBeHidden();
  // Both at once, side by side.
  await page.keyboard.press('a');
  await expect(drawer(page, 'animations')).toBeVisible();
  await expect(drawer(page, 'creator')).toBeVisible();
  await page.keyboard.press('c');
  await expect(drawer(page, 'creator')).toBeHidden();
  await expect(drawer(page, 'animations')).toBeVisible();
  await page.keyboard.press('a');
  await expect(drawer(page, 'animations')).toBeHidden();
  // The buttons of the strip name their keys.
  await expect(tab(page, 'creator')).toHaveAttribute('title', /\(C\)$/);
  await expect(tab(page, 'animations')).toHaveAttribute('title', /\(A\)$/);
  // From the timeline too, with a clip selected.
  await page.getByTestId('clip-c_a1').click({ position: { x: 20, y: 60 } });
  await page.keyboard.press('a');
  await expect(drawer(page, 'animations')).toBeVisible();
  await page.keyboard.press('a');
  await expect(drawer(page, 'animations')).toBeHidden();
});

test('the colours in order open no panel over the Preview, where the glyphs are clicked', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await setZen(page, true);
  await page.getByTestId('clip-c_a1').click({ position: { x: 20, y: 60 } });
  await page.getByTestId('preview-frame').focus();
  await page.keyboard.press('Shift+C');
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-colour-order', 'copy');
  await expect(drawer(page, 'animations')).toBeHidden();
  await page.keyboard.press('Escape');
  // In the usual layout the mode still unfolds the Animations panel, where its colours are listed.
  await setZen(page, false);
  await page.getByTestId('panel-fold-animations').click();
  await expect(page.getByTestId('panel-animations')).toHaveAttribute('data-folded', 'true');
  await page.getByTestId('preview-frame').focus();
  await page.keyboard.press('Shift+C');
  await expect(page.getByTestId('panel-animations')).toHaveAttribute('data-folded', 'false');
});

test('the strip has the tools of the Creator and Undo and Redo, a click away with the drawer closed', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await setZen(page, true);
  const formulas = async () =>
    page.evaluate(
      () => (window as MfeWindow).__mfe!.useProjectStore.getState().project.formulas.length,
    );
  const count = await formulas();
  // Nothing to undo yet, nor to redo.
  await expect(page.getByTestId('zen-undo')).toBeDisabled();
  await expect(page.getByTestId('zen-redo')).toBeDisabled();
  // «+ New»: a formula, with its editor open.
  await page.getByTestId('zen-new').click();
  await expect(page.getByTestId('formula-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);
  const first = await formulas();
  expect(first).toBeGreaterThanOrEqual(count);
  // Its arrow: the menu of the kinds, under it.
  await page.getByTestId('zen-new-menu').click();
  const menu = page.getByTestId('zen-new-kinds');
  await expect(menu).toBeVisible();
  const arrow = await box(page.getByTestId('zen-new-menu'));
  expect((await box(menu)).y).toBeGreaterThanOrEqual(arrow.y + arrow.height);
  await page.getByTestId('zen-new-math').click();
  const editor = page.getByTestId('formula-editor');
  await editor.getByTestId('raw-latex').fill('a+b');
  await editor.getByTestId('editor-apply').click();
  await closeEditor(page);
  await expect(editor).toHaveCount(0);
  await expect.poll(formulas).toBe(first + 1);
  // Undo and Redo: the formula's LaTeX goes back to what it was, and comes again.
  const latest = async () =>
    page.evaluate(
      () => (window as MfeWindow).__mfe!.useProjectStore.getState().project.formulas.at(-1)!.source,
    );
  expect(await latest()).toBe('a+b');
  await expect(page.getByTestId('zen-undo')).toBeEnabled();
  await page.getByTestId('zen-undo').click();
  await expect.poll(latest).not.toBe('a+b');
  await expect(page.getByTestId('zen-redo')).toBeEnabled();
  await page.getByTestId('zen-redo').click();
  await expect.poll(latest).toBe('a+b');
  await expect(page.getByTestId('zen-redo')).toBeDisabled();
  // The templates of one's own and the favourites: their lists, as from the Creator.
  await page.getByTestId('zen-my-templates').click();
  await expect(page.getByTestId('template-browser')).toHaveAttribute('data-view', 'mine');
  await page.keyboard.press('Escape');
  await page.getByTestId('zen-favorites').click();
  await expect(page.getByTestId('template-browser')).toHaveAttribute('data-view', 'favorites');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('template-browser')).toHaveCount(0);
  // The search of formulas, and the magnifier again to take it away.
  await page.getByTestId('zen-search').click();
  await expect(page.getByTestId('formula-search')).toBeVisible();
  await expect(page.getByTestId('zen-search')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('zen-search').click();
  await expect(page.getByTestId('formula-search')).toHaveCount(0);
  // All of it fits the strip of the small window, clear of the arrow that moves it.
  const redo = await box(page.getByTestId('zen-redo'));
  const move = await box(page.getByTestId('zen-strip-move'));
  expect(redo.x + redo.width).toBeLessThan(move.x);
});

test('the search of formulas covers the Preview and the drawer, and gives them back', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await setZen(page, true);
  await tab(page, 'creator').click();
  await page.getByTestId('creator-search-open').click();
  const search = page.getByTestId('formula-search');
  await expect(search).toBeVisible();
  const covered = await box(search);
  const open = await box(drawer(page, 'creator'));
  expect(covered.y).toBeLessThanOrEqual(open.y);
  expect(covered.height).toBeGreaterThanOrEqual(open.height);
  // The search is on top: the point in the middle of the drawer is the search's.
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[data-testid="formula-search"]') !== null,
      { x: open.x + open.width / 2, y: open.y + open.height / 2 },
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(page.getByTestId('panel-creator')).toBeVisible();
});
