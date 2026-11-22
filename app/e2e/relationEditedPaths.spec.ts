import { expect, test, type Locator, type Page } from './test';
import { blockLocator, morphJson, openBlockScene, type PairJson } from './blockHelpers';
import { openRelationScene, plain, relations, selectClip } from './relationsHelpers';
import { uiState } from './timelineHelpers';

/* «Edit path…» in the Relations list of a clip, and the mark of an edited path (D48: a pair whose
 * path was shaped in the preview's Edit path): the row counts them, and a dot marks such a pair
 * wherever pairs are listed beside an «Edit path…» — the path picker, the menu of the relation's
 * band, the relation's panel, the pair menu of its editor, a Morph block's panel and dialog. */

const A = plain('a', 'fa', 't1', 0, 8);
A.initial.position = [-2, 1];
const B = plain('b', 'fb', 't2', 2, 8);
B.initial.position = [2, -1];
/** A path of a pair's own, in the chord's frame: it bulges to the left of the chord. */
const BUMP = {
  nodes: [
    { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
    { at: [1, 0], in: [0.7, 0.4], out: null, smooth: false },
  ],
};
const relation = (pairs: unknown[]) => ({
  id: 'r1',
  fromClipId: 'a',
  toClipId: 'b',
  offset: 0,
  duration: 2,
  easing: 'linear',
  style: 'transform',
  pathArc: 30,
  pairs,
});

const frame = (page: Page) => page.getByTestId('preview-frame');

/** The mark says what it is to assistive technology and as its tooltip: not a colour alone. */
async function expectMark(dot: Locator): Promise<void> {
  await expect(dot).toBeVisible();
  await expect(dot).toHaveAttribute('title', 'Edited path');
  await expect(dot).toHaveAccessibleName('Edited path');
}

test('one pair: «Edit path…» of the row shapes its path at once; the row counts it, the panel marks it', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], {
    relations: [relation([{ from: [0], to: [0], style: null }])],
  });
  await selectClip(page, 'a');
  const row = page.getByTestId('relation-row-r1');
  await expect(row).toBeVisible();
  // Nothing edited yet: nothing said.
  await expect(page.getByTestId('relation-paths-r1')).toHaveCount(0);
  const editPath = page.getByTestId('relation-edit-path-r1');
  await expect(editPath).toBeEnabled();
  await editPath.click();
  // Straight into the mode on the pair: no picker to choose from.
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  await expect(page.getByTestId('path-picker')).toHaveCount(0);
  expect((await uiState(page)).time).toBe(3);

  // A handle moved: the pair has a path of its own (it starts from the relation's arc).
  const nodes = JSON.parse((await frame(page).getAttribute('data-path-nodes'))!) as {
    out: [number, number] | null;
  }[];
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  const handle = { x: canvas.x + nodes[0]!.out![0], y: canvas.y + nodes[0]!.out![1] };
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Enter');
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  expect((await relations(page))[0]!.pairs[0]).toHaveProperty('path');

  // The relation's panel (the mode selected the relation) marks the pair…
  await expect(page.getByTestId('relation-pair-0-path')).toHaveText('custom path');
  await expectMark(page.getByTestId('relation-pair-0-path-dot'));
  // …and the clip's Relations list counts it, with the dot.
  await selectClip(page, 'a');
  await expect(page.getByTestId('relation-paths-r1')).toHaveText('1 path edited');
  await expect(page.getByTestId('relation-paths-r1-dot')).toBeVisible();
  // Undone, the path goes, and what said it with it.
  await page.keyboard.press('ControlOrMeta+z');
  expect((await relations(page))[0]!.pairs[0]).not.toHaveProperty('path');
  await expect(page.getByTestId('relation-paths-r1')).toHaveCount(0);
});

test('several pairs: «Edit path…» of the row opens the path picker; each edited path is marked wherever pairs are listed', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], {
    relations: [
      relation([
        { from: [0], to: [0], style: null },
        { from: [1], to: [1], style: null, path: BUMP },
        { from: [2], to: [2], style: null, path: BUMP },
      ]),
    ],
  });
  await selectClip(page, 'a');
  await expect(page.getByTestId('relation-paths-r1')).toHaveText('2 paths edited');

  // The row opens the picker: the edited pairs wear the dot, the other does not.
  await page.getByTestId('relation-edit-path-r1').click();
  const picker = page.getByTestId('path-picker');
  await expect(picker).toBeVisible();
  await expectMark(picker.getByTestId('path-picker-pair-1-path-dot'));
  await expectMark(picker.getByTestId('path-picker-pair-2-path-dot'));
  await expect(picker.getByTestId('path-picker-pair-0-path-dot')).toHaveCount(0);
  await expect(picker.getByTestId('path-picker-pair-1-meta')).toHaveText('Transform · custom path');
  // A pair chosen there takes the mode.
  await picker.getByTestId('path-picker-pair-2').click();
  await expect(picker).toBeHidden();
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:2');
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');

  // The menu of the relation's band.
  await page.getByTestId('relation-window-r1').click({ button: 'right' });
  await expect(page.getByTestId('relation-menu')).toBeVisible();
  await expectMark(page.getByTestId('relation-menu-path-1-dot'));
  await expectMark(page.getByTestId('relation-menu-path-2-dot'));
  await expect(page.getByTestId('relation-menu-path-0-dot')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('relation-menu')).toHaveCount(0);

  // The relation's panel.
  await expect(page.getByTestId('relation-properties')).toBeVisible();
  await expectMark(page.getByTestId('relation-pair-1-path-dot'));
  await expect(page.getByTestId('relation-pair-0-path-dot')).toHaveCount(0);

  // The pair menu of its editor: the pair of a glyph right-clicked there.
  await page.getByTestId('relation-edit-pairs').click();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await page.getByTestId('rel-to-glyph-1').click({ button: 'right' });
  await expect(page.getByTestId('rel-style-menu')).toBeVisible();
  await expect(page.getByTestId('rel-style-menu-edit-path')).toBeVisible();
  await expectMark(page.getByTestId('rel-style-menu-path-dot'));
  await page.keyboard.press('Escape');
  await page.getByTestId('rel-to-glyph-0').click({ button: 'right' });
  await expect(page.getByTestId('rel-style-menu-edit-path')).toBeVisible();
  await expect(page.getByTestId('rel-style-menu-path-dot')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rel-style-menu')).toHaveCount(0);
  // The right-click selected the glyph: let it go, then leave the editor as it was.
  await page.getByTestId('rel-clear-selection').click();
  await page.getByTestId('rel-cancel').click();
  await expect(page.getByTestId('relation-editor')).toBeHidden();

  // Under forced colours the dot keeps a colour of its own, unlike the canvas around it.
  await page.emulateMedia({ forcedColors: 'active' });
  const dot = page.getByTestId('relation-pair-1-path-dot');
  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const style = (property: string) =>
    dot.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
  expect(await style('forced-color-adjust')).toBe('none');
  expect(await style('background-color')).not.toBe(canvas);
  await page.emulateMedia({ forcedColors: 'none' });
  expect(await style('forced-color-adjust')).toBe('auto');
});

test("the editor's list of pairs: a mark on the edited paths, and an «Edit path…» that saves and opens the mode", async ({
  page,
}) => {
  await openRelationScene(page, [A, B], {
    relations: [
      relation([
        { from: [0], to: [0], style: null },
        { from: [1], to: [1], style: null, path: BUMP },
      ]),
    ],
  });
  await selectClip(page, 'a');
  await page.getByTestId('relation-edit-r1').click();
  const editor = page.getByTestId('relation-editor');
  await expect(editor).toBeVisible();

  // The pair whose path was shaped wears the mark; the other does not.
  await expectMark(editor.getByTestId('rel-pair-1-path-dot'));
  await expect(editor.getByTestId('rel-pair-0-path-dot')).toHaveCount(0);
  // Each row keeps one line: its Edit path… beside its Edit, the pair still read.
  const edit = (await editor.getByTestId('rel-pair-0-edit').boundingBox())!;
  const path = (await editor.getByTestId('rel-pair-0-edit-path').boundingBox())!;
  const row = (await editor.getByTestId('rel-pair-0').boundingBox())!;
  const text = (await editor.getByTestId('rel-pair-0-text').boundingBox())!;
  expect(path.y).toBe(edit.y);
  expect(path.x).toBeGreaterThan(edit.x + edit.width);
  expect(path.x + path.width).toBeLessThanOrEqual(row.x + row.width);
  expect(text.width).toBeGreaterThanOrEqual(40);
  // The pair that wears the mark is read whole too: the mark takes none of its words.
  expect(
    await editor.getByTestId('rel-pair-1-text').evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(0);

  // Edit path… of a pair saves the draft — a style changed here — and takes the mode on the pair.
  await editor.getByTestId('rel-pair-1-style').selectOption('copy');
  await editor.getByTestId('rel-pair-0-edit-path').click();
  await expect(editor).toBeHidden();
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  expect((await relations(page))[0]!.pairs[1]!.style).toBe('copy');
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
});

test('«Edit path…» of the row is disabled, saying why, as the other entries are', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], { relations: [relation([])] });
  await selectClip(page, 'a');
  const editPath = page.getByTestId('relation-edit-path-r1');
  await expect(editPath).toBeDisabled();
  await expect(editPath).toHaveAttribute(
    'title',
    'No pairs yet: open the pair editor to link glyphs.',
  );
  // A locked track keeps the relation's paths as they are, as it keeps the relation: the same
  // words as its Edit….
  const tracks = ['t1', 't2', 't3'].map((id, i) => ({
    id,
    name: `Track ${i + 1}`,
    hidden: false,
    locked: id === 't2',
  }));
  await openRelationScene(page, [A, B], {
    relations: [relation([{ from: [0], to: [0], style: null }])],
    tracks,
  });
  await selectClip(page, 'a');
  const locked =
    'Track “Track 2” is locked: unlock it on the timeline to create, edit or delete relations of its clips.';
  await expect(editPath).toBeDisabled();
  await expect(editPath).toHaveAttribute('title', locked);
  await expect(page.getByTestId('relation-edit-r1')).toHaveAttribute('title', locked);
});

test("a Morph block's pairs with an edited path are marked in its panel and in its dialog", async ({
  page,
}) => {
  // Formula `fa` is a+b=c: a → c along a path of its own, + → = along the block's.
  const pairs = [
    { from: [0], to: [4], style: null, path: BUMP } as PairJson,
    { from: [1], to: [3], style: null },
  ];
  await openBlockScene(page, [morphJson('m', 2, 1, pairs)]);
  await blockLocator(page, 'm').click();
  const panel = page.getByTestId('block-morph-pairs-list');
  await expect(panel).toBeVisible();
  await expectMark(panel.getByTestId('block-morph-pair-0-path-dot'));
  await expect(panel.getByTestId('block-morph-pair-1-path-dot')).toHaveCount(0);
  await expect(panel.getByTestId('block-morph-pair-0-path')).toHaveText('custom path');
  // The block's dialog shows the same fields, the mark with them.
  await blockLocator(page, 'm').dblclick();
  const dialog = page.getByTestId('block-dialog');
  await expect(dialog).toBeVisible();
  await expectMark(dialog.getByTestId('block-morph-pair-0-path-dot'));
  await expect(dialog.getByTestId('block-morph-pair-1-path-dot')).toHaveCount(0);
});
