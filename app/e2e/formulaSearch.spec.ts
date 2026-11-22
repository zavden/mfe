import { expect, test, type Page } from './test';
import { closeEditor, pinMathJax } from './creatorHelpers';
import { getProject, openWithProject, readExample, selectionOf, type MfeWindow } from './helpers';

/* The search of formulas (D131): a panel that comes up in the Preview's place, with a field, a tab
 * per kind of object and the results as cards — selected, edited, right-clicked and dragged onto
 * the timeline like the cards of the Creator — until its button or Escape closes it. */

/** Font texts «title» and «note» and the formula «equation», each with a clip (the example);
 * the LaTeX text «heading» (Completing the square: start from $x^2+bx+c$); the formulas
 * «fraction» and «root» in the group «Algebra», and «sum». */
function searchProject(): string {
  const project = JSON.parse(readExample('text-pango.mfe.json'));
  const [tex] = JSON.parse(readExample('text-title.mfe.json')).formulas;
  const equation = project.formulas.find((f: { id: string }) => f.id === 'f_equation');
  const math = (id: string, name: string, source: string) => ({
    ...equation,
    id,
    name,
    source,
    glyphColors: {},
    hiddenGlyphs: [],
    snapshot: null,
  });
  project.formulas.push(
    { ...tex, id: 'f_heading', name: 'heading' },
    math('f_frac', 'fraction', '\\frac{a}{b}'),
    math('f_root', 'root', '\\sqrt{x^2+1}'),
    math('f_sum', 'sum', 'a+b'),
  );
  project.formulaGroups = [{ id: 'g1', name: 'Algebra', formulaIds: ['f_frac', 'f_root'] }];
  return JSON.stringify(project);
}

const search = (page: Page) => page.getByTestId('formula-search');
const field = (page: Page) => page.getByTestId('formula-search-input');
const tab = (page: Page, id: 'math' | 'tex' | 'text') =>
  page.getByTestId(`formula-search-tab-${id}`);
const results = (page: Page) => page.getByTestId('formula-search-result');
const result = (page: Page, name: string) =>
  page.locator(`[data-testid="formula-search-result"][data-name="${name}"]`);
const names = (page: Page) =>
  results(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('data-name')));
/** What each tab says it finds: formulas, LaTeX texts, font texts. */
const counts = (page: Page) =>
  Promise.all((['math', 'tex', 'text'] as const).map((id) => tab(page, id).textContent()));
const preview = (page: Page) => page.getByTestId('panel-preview');

async function openSearch(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, searchProject());
  await pinMathJax(page);
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search(page)).toBeVisible();
}

test('Ctrl/⌘+F opens the search in the place of the Preview, on its field', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, searchProject());
  await pinMathJax(page);
  await expect(search(page)).toHaveCount(0);
  const place = (await preview(page).boundingBox())!;
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search(page)).toBeVisible();
  // Exactly over the Preview panel, which stays there underneath, out of reach.
  const box = (await search(page).boundingBox())!;
  for (const side of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(box[side] - place[side])).toBeLessThan(1);
  await expect(preview(page)).toHaveAttribute('inert', '');
  expect(
    await page.evaluate(() => {
      const panel = document
        .querySelector('[data-testid="formula-search"]')!
        .getBoundingClientRect();
      const top = document.elementFromPoint(panel.x + panel.width / 2, panel.y + panel.height / 2);
      return top?.closest('[data-testid="formula-search"]') !== null;
    }),
  ).toBe(true);
  await expect(field(page)).toBeFocused();
  // Nothing typed: every object of the tab, in the order of the Creator list, and what each tab has.
  await expect(tab(page, 'math')).toHaveAttribute('aria-selected', 'true');
  expect(await names(page)).toEqual(['equation', 'fraction', 'root', 'sum']);
  expect(await counts(page)).toEqual(['Formulas4', 'Texts (LaTeX)1', 'Fonts2']);
  // The Creator and the timeline stay in use beside it.
  await expect(page.getByTestId('panel-creator')).not.toHaveAttribute('inert', '');
  await page.getByTestId('clip-c_equation').click();
  expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['c_equation'] });
  await expect(result(page, 'equation')).toHaveAttribute('data-linked', 'true');
  await expect(search(page)).toBeVisible();
});

test('what is typed is looked for in names and sources, in the three tabs at once', async ({
  page,
}) => {
  await openSearch(page);
  await page.keyboard.type('x^2');
  expect(await names(page)).toEqual(['equation', 'root']);
  expect(await counts(page)).toEqual(['Formulas2', 'Texts (LaTeX)1', 'Fonts0']);
  await tab(page, 'tex').click();
  expect(await names(page)).toEqual(['heading']);
  await expect(result(page, 'heading').getByTestId('formula-search-source')).toContainText(
    'Completing the square',
  );
  await tab(page, 'text').click();
  await expect(results(page)).toHaveCount(0);
  await expect(page.getByTestId('formula-search-empty')).toHaveText('No font text matches “x^2”.');
  // A name; then the name of a group, which finds its formulas, each saying its group.
  await field(page).fill('NOTE');
  expect(await names(page)).toEqual(['note']);
  await field(page).fill('algebra');
  await tab(page, 'math').click();
  expect(await names(page)).toEqual(['fraction', 'root']);
  await expect(result(page, 'root').getByTestId('formula-search-group')).toHaveText('Algebra');
  await field(page).fill('');
  await expect(result(page, 'sum').getByTestId('formula-search-group')).toHaveCount(0);
  // A result shows its rendering and how many clips use it.
  await expect(result(page, 'equation').locator('.formula-thumb svg path').first()).toBeAttached();
  await expect(result(page, 'equation').getByTestId('formula-search-clips')).toHaveText('▭ 1');
  await expect(result(page, 'sum').getByTestId('formula-search-clips')).toHaveCount(0);
});

test('its button and Escape close it; the tab and the text are there the next time', async ({
  page,
}) => {
  await openSearch(page);
  await field(page).fill('title');
  await tab(page, 'text').click();
  expect(await names(page)).toEqual(['title']);
  await page.getByTestId('formula-search-close').click();
  await expect(search(page)).toHaveCount(0);
  await expect(preview(page)).not.toHaveAttribute('inert', '');
  await expect(preview(page).locator('canvas').first()).toBeVisible();

  await page.keyboard.press('ControlOrMeta+f');
  await expect(tab(page, 'text')).toHaveAttribute('aria-selected', 'true');
  await expect(field(page)).toHaveValue('title');
  await expect(field(page)).toBeFocused();
  // The text is selected: typing replaces it.
  await page.keyboard.type('no');
  await expect(field(page)).toHaveValue('no');
  expect(await names(page)).toEqual(['note']);
  // Escape in the field closes the search, and does not empty the field first.
  await page.keyboard.press('Escape');
  await expect(search(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+f');
  await expect(field(page)).toHaveValue('no');
  // Asked for again while it is open, from another field too: back to its own.
  await page.getByTestId('creator-tab-audio').click();
  await page.getByTestId('audio-search').click();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  // Escape from anywhere else closes it too.
  await page.getByTestId('creator-tab-formulas').click();
  await page.keyboard.press('Escape');
  await expect(search(page)).toHaveCount(0);
});

test('a result is selected with a click and the search stays; a double-click edits it', async ({
  page,
}) => {
  await openSearch(page);
  await result(page, 'fraction').click();
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_frac' });
  await expect(result(page, 'fraction')).toHaveAttribute('data-selected', 'true');
  await expect(search(page)).toBeVisible();
  await result(page, 'sum').click({ modifiers: ['ControlOrMeta'] });
  expect(await selectionOf(page)).toEqual({ kind: 'formulas', ids: ['f_frac', 'f_sum'] });
  await result(page, 'equation').click();
  await result(page, 'root').click({ modifiers: ['Shift'] });
  expect(await selectionOf(page)).toEqual({
    kind: 'formulas',
    ids: ['f_equation', 'f_frac', 'f_root'],
  });

  // A double-click opens the editor of the result; the search is there when it closes.
  await result(page, 'sum').dblclick();
  await expect(page.getByTestId('formula-editor')).toBeVisible();
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_sum' });
  // Escape is the dialog's while it is open.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);
  await expect(search(page)).toBeVisible();
  // A text opens its own editor, the composition workspace.
  await tab(page, 'tex').click();
  await result(page, 'heading').dblclick();
  await expect(page.getByTestId('text-composition')).toBeVisible();
});

test('a right-click on a result opens the menu of its card in the Creator', async ({ page }) => {
  await openSearch(page);
  await result(page, 'fraction').click();
  await result(page, 'sum').click({ button: 'right' });
  // A result outside the selection becomes the selection first.
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_sum' });
  const menu = page.getByTestId('formula-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('formula-menu-header')).toHaveText('sum');
  // Escape closes the menu, not the search.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(search(page)).toBeVisible();

  await result(page, 'sum').click({ button: 'right' });
  await page.getByTestId('formula-menu-add-to-timeline').click();
  await expect
    .poll(async () => (await getProject(page)).clips.filter((c) => c.formulaId === 'f_sum').length)
    .toBe(1);
  await expect(search(page)).toBeVisible();
  // Several selected: the menu is theirs.
  await result(page, 'fraction').click();
  await result(page, 'root').click({ modifiers: ['ControlOrMeta'] });
  await result(page, 'root').click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-header')).toHaveText('2 formulas');
});

test('a result is dragged onto the timeline, and the search stays open for the next', async ({
  page,
}) => {
  await openSearch(page);
  await expect(result(page, 'sum')).toHaveAttribute('draggable', 'true');
  const lane = page.getByTestId('track-lane-t_equation');
  const clipsOf = async (id: string) =>
    (await getProject(page)).clips.filter((clip) => clip.formulaId === id);
  // A real drag, from the card to a free place of a track.
  await result(page, 'sum').dragTo(lane, { targetPosition: { x: 700, y: 12 } });
  await expect.poll(async () => (await clipsOf('f_sum')).length).toBe(1);
  expect((await clipsOf('f_sum'))[0]).toMatchObject({ trackId: 't_equation' });
  await expect(search(page)).toBeVisible();
  // And another, without opening anything again.
  await result(page, 'fraction').dragTo(page.getByTestId('track-lane-t_note'), {
    targetPosition: { x: 700, y: 12 },
  });
  await expect.poll(async () => (await clipsOf('f_frac')).length).toBe(1);
  await expect(search(page)).toBeVisible();
  await expect(result(page, 'sum').getByTestId('formula-search-clips')).toHaveText('▭ 1');
});

test('the keyboard walks the results; what the Preview does with keys waits under the search', async ({
  page,
}) => {
  await openSearch(page);
  // Colours in order is on under the search: started before it opened. (The focus was left on
  // the menu bar by what pinned the renderer, and Escape there is the menu bar's.)
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('Shift+C');
  const frame = page.getByTestId('preview-frame');
  await expect(frame).toHaveAttribute('data-colour-order', 'copy');
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search(page)).toBeVisible();

  // Tab: the field, the tabs, the results (one stop each).
  await page.keyboard.press('Tab');
  await expect(tab(page, 'math')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(result(page, 'equation')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(result(page, 'fraction')).toBeFocused();
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_frac' });
  await page.keyboard.press('End');
  await expect(result(page, 'sum')).toBeFocused();

  // The keys of the scene do nothing while it is covered: S, Ctrl/⌘+A, the grid.
  const circle = page.getByTestId('preview-circle-select');
  const grid = () =>
    page.evaluate(() => (window as MfeWindow).__mfe!.usePreferences.getState().grid);
  await expect(circle).toHaveAttribute('aria-pressed', 'false');
  const before = await grid();
  await page.keyboard.press('s');
  await page.keyboard.press("ControlOrMeta+'");
  await page.keyboard.press('ControlOrMeta+a');
  await expect(circle).toHaveAttribute('aria-pressed', 'false');
  expect(await grid()).toBe(before);
  expect(await selectionOf(page)).toEqual({ kind: 'formula', id: 'f_sum' });

  // Enter edits the focused result, and is not the mode's under the search.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('formula-editor')).toBeVisible();
  await closeEditor(page);
  await expect(frame).toHaveAttribute('data-colour-order', 'copy');
  // Escape closes the search and leaves the mode as it was; the next one is the mode's.
  await result(page, 'sum').focus();
  await page.keyboard.press('Escape');
  await expect(search(page)).toHaveCount(0);
  await expect(frame).toHaveAttribute('data-colour-order', 'copy');
  await page.keyboard.press('Escape');
  await expect(frame).toHaveAttribute('data-colour-order', '');
});

test('the magnifier of the Creator shows the search and takes it away, beside the view and «+ New»', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, searchProject());
  await pinMathJax(page);
  const magnifier = page.getByTestId('creator-search-open');
  await expect(magnifier).toHaveAttribute('aria-pressed', 'false');
  await expect(magnifier).toHaveAttribute(
    'title',
    /^Search formulas, by name or LaTeX \((Ctrl\+F|⌘F)\)$/,
  );
  // One line for the three: the magnifier, the view and «+ New», in the panel as it starts —
  // at this width and at 1280.
  const oneLine = async () => {
    const boxes = await Promise.all(
      ['creator-search-open', 'creator-view-toggle', 'creator-new'].map(
        async (id) => (await page.getByTestId(id).boundingBox())!,
      ),
    );
    const centres = boxes.map((box) => box.y + box.height / 2);
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(2);
    // In that order, none over another.
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width);
  };
  await oneLine();
  await page.setViewportSize({ width: 1280, height: 800 });
  await oneLine();
  // No field of its own in the Creator any more.
  await expect(
    page.getByTestId('panel-creator').locator('input[type="search"]:visible'),
  ).toHaveCount(0);

  await magnifier.click();
  await expect(search(page)).toBeVisible();
  await expect(magnifier).toHaveAttribute('aria-pressed', 'true');
  await expect(field(page)).toBeFocused();
  // Escape gives the focus back to the magnifier, which Enter presses again.
  await page.keyboard.press('Escape');
  await expect(search(page)).toHaveCount(0);
  await expect(magnifier).toBeFocused();
  await expect(magnifier).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(search(page)).toBeVisible();
  // Pressed while the search is up, it takes it away; so does the search's own button.
  await magnifier.click();
  await expect(search(page)).toHaveCount(0);
  await magnifier.click();
  await page.getByTestId('formula-search-close').click();
  await expect(search(page)).toHaveCount(0);
  await expect(magnifier).toBeFocused();
  // The search works from the other tabs of the Creator, where the magnifier is not.
  await page.getByTestId('creator-tab-templates').click();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search(page)).toBeVisible();
  expect(await names(page)).toEqual(['equation', 'fraction', 'root', 'sum']);
});

test('in a narrow window, where the panels stack, the search covers the Preview too', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await openWithProject(page, searchProject());
  await pinMathJax(page);
  await expect(page.locator('main')).toHaveAttribute('data-layout', 'stacked');
  const place = (await preview(page).boundingBox())!;
  await page.keyboard.press('ControlOrMeta+f');
  await expect(search(page)).toBeVisible();
  const box = (await search(page).boundingBox())!;
  for (const side of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(box[side] - place[side])).toBeLessThan(1);
  await expect(results(page).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search(page)).toHaveCount(0);
});
