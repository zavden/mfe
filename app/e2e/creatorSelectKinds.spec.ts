import { expect, test, type Page } from './test';
import { pinMathJax } from './creatorHelpers';
import { openWithProject, readExample, selectionOf, setTime } from './helpers';

/* Selecting every object of a kind from the Creator's toolbar (D155): one key left of «+ New»,
 * ∑ with a small arrow (D183, where there were three keys), drops a menu with a row per kind —
 * formulas, LaTeX texts, font texts — when the pointer rests on it, or when it is clicked, tapped
 * or pressed. A row adds every object of its kind in the whole project to the Creator's selection,
 * and takes that kind out again when it is all selected; braces, shapes and lines are of none of
 * the three. The menu stays open after a choice, and closes when the pointer has left the key and
 * the menu, on Escape and on a press elsewhere. */

/** The braces example — the formulas «sum», «six», «fifteen» and «total», and the braces
 * «first», «second» and «whole» —, with «six» and «fifteen» in the group «Numbers» (closed, as
 * a group starts), the LaTeX text «heading» and the font texts «title» and «note». */
function kindsProject(): string {
  const project = JSON.parse(readExample('braces.mfe.json'));
  const [heading] = JSON.parse(readExample('text-title.mfe.json')).formulas;
  const fonts = JSON.parse(readExample('text-pango.mfe.json')).formulas.filter(
    (f: { kind: string }) => f.kind === 'text',
  );
  project.formulas.push({ ...heading, id: 'f_heading', name: 'heading' }, ...fonts);
  project.formulaGroups = [{ id: 'g1', name: 'Numbers', formulaIds: ['f_six', 'f_fifteen'] }];
  return JSON.stringify(project);
}

const MATH = ['f_sum', 'f_six', 'f_fifteen', 'f_total'];
const kindsKey = (page: Page) => page.getByTestId('creator-kinds');
const kindsMenu = (page: Page) => page.getByTestId('creator-kinds-menu');
const row = (page: Page, kind: 'math' | 'tex' | 'text') =>
  page.getByTestId(`creator-select-all-${kind}`);
const card = (page: Page, name: string) =>
  page.locator(`[data-testid="formula-item"][data-name="${name}"]`);

async function open(page: Page, json = kindsProject()): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, json);
  await pinMathJax(page);
}

/** Rests the pointer on the key until its menu is open. */
async function hoverOpen(page: Page): Promise<void> {
  await kindsKey(page).hover();
  await expect(kindsMenu(page)).toBeVisible();
}

/** Chooses the row of `kind`, opening the menu by hovering its key when it is closed. */
async function choose(page: Page, kind: 'math' | 'tex' | 'text'): Promise<void> {
  if ((await kindsMenu(page).count()) === 0) await hoverOpen(page);
  await row(page, kind).click();
}

test('a row adds every object of its kind, folded groups included; two rows add up', async ({
  page,
}) => {
  await open(page);
  await expect(kindsKey(page)).toHaveAccessibleName('Select by kind');
  await expect(kindsKey(page)).toHaveAttribute('title', 'Select by kind');
  await expect(kindsKey(page)).toHaveText('∑');
  await expect(kindsKey(page)).not.toHaveClass(/is-on/);
  // Closed, the menu is not in the document: nothing takes it for an open menu.
  await expect(kindsMenu(page)).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
  // A formula selected first stays; its group is closed, and its formulas come too.
  await expect(page.getByTestId('formula-group-toggle')).toHaveAttribute('aria-expanded', 'false');
  await card(page, 'heading').click();
  await hoverOpen(page);
  await expect(page.getByRole('menu', { name: 'Select by kind' })).toBeVisible();
  for (const [kind, name] of [
    ['math', 'Formulas'],
    ['tex', 'LaTeX texts'],
    ['text', 'Font texts'],
  ] as const) {
    await expect(row(page, kind)).toBeEnabled();
    await expect(row(page, kind)).toHaveAccessibleName(name);
    await expect(row(page, kind)).toHaveAttribute('role', 'menuitemcheckbox');
  }
  // «heading» was the whole of its kind: its row is ticked, and the key lit.
  await expect(row(page, 'tex')).toHaveAttribute('aria-checked', 'true');
  await expect(kindsKey(page)).toHaveClass(/is-on/);
  await expect(row(page, 'math')).toHaveAttribute('aria-checked', 'false');
  await expect(row(page, 'math')).toHaveAttribute(
    'title',
    'Select all formulas (4), added to the selection',
  );
  await row(page, 'math').click();
  expect(await selectionOf(page)).toEqual({
    kind: 'formulas',
    ids: ['f_sum', 'f_six', 'f_fifteen', 'f_total', 'f_heading'],
  });
  await expect(row(page, 'math')).toHaveAttribute('aria-checked', 'true');
  await expect(row(page, 'math')).toHaveAttribute(
    'title',
    'All formulas are selected (4): choose to deselect them',
  );
  await expect(page.getByTestId('formula-group')).toHaveAttribute('data-selected', 'true');
  // The menu stays open for the next row. The braces are of no kind of the three: not selected.
  await expect(kindsMenu(page)).toBeVisible();
  await row(page, 'text').click();
  expect(await selectionOf(page)).toEqual({
    kind: 'formulas',
    ids: [...MATH, 'f_heading', 'f_title', 'f_note'],
  });
  await expect(kindsMenu(page)).toBeVisible();
  const selected = page.locator('[data-testid="formula-item"][data-selected="true"]');
  await expect(selected).toHaveCount(5); // the group's two are in its closed row
  await expect(page.getByTestId('animations-formulas')).toContainText('7 formulas selected');
});

test('chosen while its kind is all selected, a row takes it out; the menu from the keyboard', async ({
  page,
}) => {
  await open(page);
  await choose(page, 'tex');
  await choose(page, 'math');
  await choose(page, 'text');
  await choose(page, 'math');
  expect(await selectionOf(page)).toEqual({
    kind: 'formulas',
    ids: ['f_heading', 'f_title', 'f_note'],
  });
  await expect(row(page, 'math')).toHaveAttribute('aria-checked', 'false');
  await expect(row(page, 'tex')).toHaveAttribute('aria-checked', 'true');
  // With only part of its kind selected, a row brings the rest instead. (The click on a card is
  // a press elsewhere: it closes the menu.)
  await card(page, 'note').click({ modifiers: ['ControlOrMeta'] });
  await expect(kindsMenu(page)).toHaveCount(0);
  await choose(page, 'text');
  expect(await selectionOf(page)).toEqual({
    kind: 'formulas',
    ids: ['f_heading', 'f_title', 'f_note'],
  });
  await choose(page, 'text');
  await choose(page, 'tex');
  expect(await selectionOf(page)).toEqual({ kind: 'none' });
  await expect(kindsKey(page)).not.toHaveClass(/is-on/);

  // From the keyboard, the pointer out of the way: the key is reached with Tab after the view;
  // Enter opens the menu, the focus on its first row; ↓ and ↑ walk the rows (round), Space and
  // Enter choose, and the menu stays; Escape closes it and gives the focus back to the key.
  await page.mouse.move(700, 450);
  await expect(kindsMenu(page)).toHaveCount(0);
  await page.getByTestId('creator-view-toggle').focus();
  await page.keyboard.press('Tab');
  await expect(kindsKey(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page, 'math')).toBeFocused();
  await expect(kindsKey(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'tex')).toBeFocused();
  await page.keyboard.press('Space');
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_heading' });
  await expect(row(page, 'tex')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await selectionOf(page)).toEqual({
    kind: 'formulas',
    ids: ['f_heading', 'f_title', 'f_note'],
  });
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'math')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(row(page, 'text')).toBeFocused();
  await expect(kindsMenu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(kindsMenu(page)).toHaveCount(0);
  await expect(kindsKey(page)).toBeFocused();
  // Escape left the selection as it was.
  expect(await selectionOf(page)).toEqual({
    kind: 'formulas',
    ids: ['f_heading', 'f_title', 'f_note'],
  });
  // Space opens it too; Tab leaves it, the focus going on to the key after it; ↑ on the key
  // opens it on its last row, and Shift+Tab leaves it for the key before.
  await page.keyboard.press('Space');
  await expect(row(page, 'math')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(kindsMenu(page)).toHaveCount(0);
  await expect(page.getByTestId('creator-preview-size')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(kindsKey(page)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(row(page, 'text')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(kindsMenu(page)).toHaveCount(0);
  await expect(page.getByTestId('creator-view-toggle')).toBeFocused();
});

test('the pointer resting on the key drops the menu under it; it closes off both, on Escape and on a press elsewhere', async ({
  page,
}) => {
  await open(page);
  const key = (await kindsKey(page).boundingBox())!;
  await hoverOpen(page);
  await expect(kindsKey(page)).toHaveAttribute('aria-expanded', 'true');
  // Under the key, its left edge under the key's, inside the window; it hangs from the document,
  // not from the panel, which would clip it.
  const menu = (await kindsMenu(page).boundingBox())!;
  expect(menu.y).toBeGreaterThanOrEqual(key.y + key.height);
  expect(menu.y).toBeLessThanOrEqual(key.y + key.height + 6);
  expect(Math.abs(menu.x - key.x)).toBeLessThan(1);
  expect(menu.x + menu.width).toBeLessThanOrEqual(1440);
  expect(
    await kindsMenu(page).evaluate((el) => el.closest('[data-testid="panel-creator"]') === null),
  ).toBe(true);

  // Down from the key to the last row, slowly, and resting longer than it takes to close: open.
  const last = (await row(page, 'text').boundingBox())!;
  await page.mouse.move(key.x + key.width / 2, key.y + key.height - 2);
  await page.mouse.move(key.x + key.width / 2, last.y + last.height / 2, { steps: 12 });
  await page.waitForTimeout(700);
  await expect(kindsMenu(page)).toBeVisible();
  // Off both, into the empty part of the list: closed a moment later.
  await page.mouse.move(menu.x + menu.width / 2, menu.y + menu.height + 260);
  await expect(kindsMenu(page)).toHaveCount(0);
  await expect(kindsKey(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await selectionOf(page)).toEqual({ kind: 'none' });

  // A click on the key opens it at once, the focus on its first row; a second closes it, and the
  // pointer still on the key does not open it again by itself.
  await kindsKey(page).click();
  await expect(row(page, 'math')).toBeFocused();
  await kindsKey(page).click();
  await expect(kindsMenu(page)).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(kindsMenu(page)).toHaveCount(0);
  // Opened by a click, it closes too when the pointer has left both, the focus that was in it
  // going back to the key.
  await page.mouse.move(menu.x + menu.width / 2, menu.y + menu.height + 260);
  await kindsKey(page).click();
  await expect(row(page, 'math')).toBeFocused();
  await page.mouse.move(menu.x + menu.width / 2, menu.y + menu.height + 260);
  await expect(kindsMenu(page)).toHaveCount(0);
  await expect(kindsKey(page)).toBeFocused();

  // Escape is the menu's first: a region of the timeline stays, and goes at the next Escape.
  await page.mouse.move(700, 450);
  await setTime(page, 1);
  await page.keyboard.press('i');
  await expect(page.getByTestId('timeline-region')).toHaveCount(1);
  await hoverOpen(page);
  await page.keyboard.press('Escape');
  await expect(kindsMenu(page)).toHaveCount(0);
  await expect(page.getByTestId('timeline-region')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('timeline-region')).toHaveCount(0);

  // A press elsewhere closes it, and does there what it does: a card is selected.
  await page.mouse.move(700, 450);
  await hoverOpen(page);
  await card(page, 'heading').click();
  await expect(kindsMenu(page)).toHaveCount(0);
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_heading' });
});

test('the search shows or hides what it likes: a row selects every object of its kind', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByTestId('formula-search-input').fill('six');
  await expect(page.getByTestId('formula-search-result')).toHaveCount(1);
  await choose(page, 'math');
  expect(await selectionOf(page)).toEqual({ kind: 'formulas', ids: MATH });
  await expect(page.getByTestId('formula-search-result')).toHaveAttribute('data-selected', 'true');
  // The selection is the one of the cards: the menu of a result acts on all of it.
  await page.getByTestId('formula-search-result').click({ button: 'right' });
  await expect(kindsMenu(page)).toHaveCount(0);
  await expect(page.getByTestId('formula-menu-header')).toHaveText('4 formulas');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('formula-search')).toBeVisible();
});

test('Edit together… opens on what the rows selected, from the menu of a card', async ({
  page,
}) => {
  await open(page);
  await choose(page, 'tex');
  await choose(page, 'text');
  await card(page, 'note').click({ button: 'right' });
  // The card was selected: the menu is the selection's.
  expect(await selectionOf(page)).toEqual({
    kind: 'formulas',
    ids: ['f_heading', 'f_title', 'f_note'],
  });
  await expect(page.getByTestId('formula-menu-header')).toHaveText('3 formulas');
  await page.getByTestId('formula-menu-edit-together').click();
  const editor = page.getByTestId('multi-editor');
  await expect(editor).toBeVisible();
  for (const id of ['f_heading', 'f_title', 'f_note'])
    await expect(editor.getByTestId(`multi-card-${id}`)).toBeVisible();
  await expect(editor.locator('.multi-card')).toHaveCount(3);
});

test('a row is off while the project has none of its kind, and says why', async ({ page }) => {
  await open(page, readExample('braces.mfe.json'));
  await hoverOpen(page);
  for (const [kind, plural] of [
    ['tex', 'LaTeX texts'],
    ['text', 'font texts'],
  ] as const) {
    await expect(row(page, kind)).toBeDisabled();
    await expect(row(page, kind)).toHaveAttribute('title', `The project has no ${plural}`);
    await expect(row(page, kind)).toHaveAttribute('aria-checked', 'false');
  }
  await row(page, 'math').click();
  expect(await selectionOf(page)).toEqual({ kind: 'formulas', ids: MATH });
  // From the keyboard the rows that are off are passed over.
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'math')).toBeFocused();
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a tap opens the menu and it stays; a tap on a row chooses, a tap elsewhere closes it', async ({
    page,
  }) => {
    await open(page);
    await kindsKey(page).tap();
    await expect(kindsMenu(page)).toBeVisible();
    await expect(row(page, 'math')).toBeFocused();
    // A finger does not hover: lifted, it leaves the menu open.
    await page.waitForTimeout(700);
    await expect(kindsMenu(page)).toBeVisible();
    await row(page, 'math').tap();
    expect(await selectionOf(page)).toEqual({ kind: 'formulas', ids: MATH });
    await page.waitForTimeout(700);
    await expect(kindsMenu(page)).toBeVisible();
    await card(page, 'heading').tap();
    await expect(kindsMenu(page)).toHaveCount(0);
    expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_heading' });
  });
});

test('the keys sit left of «+ New»: on its line as the panel starts in a window of 1920 or 1440, on a line of their own in one of 1280', async ({
  page,
}) => {
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
  // The magnifier, the view (one key, D179), the key of the kinds and the key of the size of the
  // previews (D183) and «+ New».
  const ids = [
    'creator-search-open',
    'creator-view-toggle',
    'creator-kinds',
    'creator-preview-size',
    'creator-new',
  ];
  // One line, all of them in that order, none over another, and «+ New» ends with its arrow
  // inside the panel.
  const oneLine = async () => {
    const panel = await box('panel-creator');
    const boxes = await Promise.all([...ids, 'creator-new-menu'].map(box));
    expect(Math.max(...boxes.map(centre)) - Math.min(...boxes.map(centre))).toBeLessThan(2);
    for (let i = 1; i < ids.length; i++)
      expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width);
    const arrow = boxes[ids.length]!;
    expect(arrow.x + arrow.width).toBeLessThanOrEqual(panel.x + panel.width);
  };
  // The panel as it starts (no bar dragged): a fifth of the window, less the bars between the
  // panels. One line in a window of 1920 (D179), and of 1440 since the keys are one each (D183).
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openWithProject(page, kindsProject());
  expect((await box('panel-creator')).width).toBeLessThan(1920 / 5);
  await oneLine();
  await page.setViewportSize({ width: 1440, height: 900 });
  expect((await box('panel-creator')).width).toBeLessThan(1440 / 5);
  // At 1440 the keys fit their line by a pixel or two, which is the width of «+ New» in Inter,
  // the first font of the interface. Where the system has another — Segoe UI, San Francisco —
  // the text is as wide as that font makes it, and the keys may take the line of their own of a
  // window of 1280: what holds with any font is that none is over another nor outside the panel.
  const inter = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('2d')!;
    const width = (family: string) => {
      context.font = `40px ${family}`;
      return context.measureText('+ New mmmlllWWW').width;
    };
    return width('Inter, monospace') !== width('monospace');
  });
  if (inter) await oneLine();
  else {
    const panel = await box('panel-creator');
    const boxes = await Promise.all([...ids, 'creator-new-menu'].map(box));
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(panel.x);
      expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width);
    }
    const keys = boxes.slice(0, ids.length);
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const [a, b] = [keys[i]!, keys[j]!];
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
  }
  // As the panel starts in a window of 1280: the magnifier, the view and «+ New» keep their line
  // (D131), and the two keys come under the magnifier, inside the panel.
  await page.setViewportSize({ width: 1280, height: 800 });
  const panel = await box('panel-creator');
  const [magnifier, view, newButton] = [
    await box('creator-search-open'),
    await box('creator-view-toggle'),
    await box('creator-new'),
  ];
  expect(Math.abs(centre(magnifier) - centre(view))).toBeLessThan(2);
  expect(Math.abs(centre(magnifier) - centre(newButton))).toBeLessThan(2);
  const [kinds, size] = await Promise.all(ids.slice(2, -1).map(box));
  expect(Math.abs(centre(kinds!) - centre(size!))).toBeLessThan(2);
  expect(kinds!.y).toBeGreaterThanOrEqual(magnifier.y + magnifier.height);
  expect(kinds!.x).toBeLessThan(magnifier.x + magnifier.width);
  expect(size!.x).toBeGreaterThanOrEqual(kinds!.x + kinds!.width);
  expect(size!.x + size!.width).toBeLessThanOrEqual(panel.x + panel.width);
  // The window as wide again: one line again.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await oneLine();
});
