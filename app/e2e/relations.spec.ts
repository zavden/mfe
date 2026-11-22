import { expect, test, type Page } from './test';
import { openAnimationsTab, openWithProject, readExample } from './helpers';
import {
  box,
  canUndo,
  clipOf,
  dragTo,
  moveClip,
  project,
  PX_PER_SECOND,
  setTime,
  uiState,
  undo,
} from './timelineHelpers';
import {
  glyph,
  openRelationScene,
  plain,
  relations,
  relationTab,
  selectClip,
  selectRelation,
  type StoredRelation,
} from './relationsHelpers';

/* f1 = a+b=c on track 1 over [0, 6]; f2 = a=3+1 on track 2 over [2, 8]. */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);

async function openEditor(page: Page): Promise<void> {
  await selectClip(page, 'a');
  await page.getByTestId('create-relation-other').selectOption('b');
  await page.getByTestId('create-relation-button').click();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await expect(page.getByTestId('rel-from-glyph-0')).toBeVisible();
}

async function save(page: Page): Promise<StoredRelation> {
  await page.getByTestId('rel-save').click();
  await expect(page.getByTestId('relation-editor')).toBeHidden();
  const [relation] = await relations(page);
  return relation!;
}

test.describe('relation editor', () => {
  test('links glyphs by clicking, by Shift-selecting and stores ascending pairs', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    // Glyph labels in the project's order: a + b = c  /  a = 3 + 1.
    await expect(glyph(page, 'from', 'b')).toHaveAttribute('data-label', 'b');

    // 1 → 1: click a source glyph, then a target glyph.
    await glyph(page, 'from', 'a').click();
    await expect(page.getByTestId('rel-selection')).toContainText('Now select');
    await glyph(page, 'to', 'a').click();
    await expect(page.getByTestId('rel-pair-0')).toBeVisible();

    // n → 1: Shift-select two sources, then one click on a target links at once.
    await glyph(page, 'from', 'c').click();
    await glyph(page, 'from', 'b').click({ modifiers: ['Shift'] });
    await glyph(page, 'to', '3').click();
    await expect(page.getByTestId('rel-pair-1-text')).toHaveText('b c → 3');
    await expect(page.getByTestId('rel-pair-1')).toHaveAttribute('data-from', /^\d+,\d+$/);

    // n → m: Shift-select glyphs on both sides, then press Link.
    await glyph(page, 'from', '+').click();
    await glyph(page, 'from', '=').click({ modifiers: ['Shift'] });
    await glyph(page, 'to', '=').click({ modifiers: ['Shift'] });
    await glyph(page, 'to', '+').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('rel-link')).toBeEnabled();
    await page.getByTestId('rel-link').click();
    await expect(page.getByTestId('rel-pair-2-text')).toHaveText('+ = → = +');

    await page.getByTestId('rel-pair-2-style').selectOption('copy');
    // Several sources onto one target get a menu for how the others arrive; the rest do not.
    await expect(page.getByTestId('rel-pair-0-extras')).toHaveCount(0);
    await expect(page.getByTestId('rel-pair-2-extras')).toHaveCount(0);
    await expect(page.getByTestId('rel-pair-1-extras')).toHaveValue('separate');
    await page.getByTestId('rel-pair-1-extras').selectOption('copies');
    const saved = await save(page);
    expect(saved.pairs).toEqual([
      { from: [0], to: [0], style: null },
      { from: [2, 4], to: [2], style: null, extras: 'copies', principal: 2 },
      { from: [1, 3], to: [1, 3], style: 'copy' },
    ]);
    expect(saved).toMatchObject({ fromClipId: 'a', toClipId: 'b', offset: 0, duration: 1 });
    // One undo step for the whole session.
    await undo(page);
    expect(await relations(page)).toHaveLength(0);
    expect(await canUndo(page)).toBe(false);
  });

  test('joins the pair of a linked target, and refuses links that validateProject would reject', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    // The target glyph is taken: the new source joins its pair (two glyphs that become one).
    await glyph(page, 'from', 'b').click();
    await glyph(page, 'to', 'a').click();
    await expect(page.getByTestId('rel-message')).toContainText('joined pair 1');
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('a b → a');
    await expect(page.getByTestId('rel-pair-1')).toHaveCount(0);
    // A consumed source cannot be consumed again (unless that pair is a copy).
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', '3').click();
    await expect(page.getByTestId('rel-message')).toContainText('already consumed');
    await expect(page.getByTestId('rel-side-tab-pairs')).toHaveText('Pairs (1)');
    // The save button needs a pair and no error.
    await expect(page.getByTestId('rel-save')).toBeEnabled();
  });

  test('outlines in red dashes the source a transform consumes, until its pair copies it', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    const source = glyph(page, 'from', 'a');
    await expect(source).toHaveAttribute('data-consumed', 'false');

    // Linked by a pair that inherits Transform: the source is consumed, and says so.
    await source.click();
    await glyph(page, 'to', 'a').click();
    await expect(source).toHaveAttribute('data-consumed', 'true');
    await expect(source.locator('.rg-consumed')).toHaveCount(1);
    await expect(source.locator('title')).toHaveText(
      '0: a — pair 1 consumes it (Transform): another pair can only copy it',
    );
    // Its target, and the glyphs no pair takes, are not outlined.
    await expect(glyph(page, 'to', 'a')).toHaveAttribute('data-consumed', 'false');
    await expect(glyph(page, 'from', 'b')).toHaveAttribute('data-consumed', 'false');

    // A copy leaves the source where it is: the outline goes. A fade consumes it again.
    await page.getByTestId('rel-pair-0-style').selectOption('copy');
    await expect(source).toHaveAttribute('data-consumed', 'false');
    await expect(source.locator('.rg-consumed')).toHaveCount(0);
    await page.getByTestId('rel-pair-0-style').selectOption('fade');
    await expect(source).toHaveAttribute('data-consumed', 'true');
    await expect(source.locator('title')).toHaveText(/pair 1 consumes it \(Fade transform\)/);

    // A copy that cross-fades (D185) leaves the source too: «FC» on the pair, no outline, and
    // the relation is saved with that style.
    await page.getByTestId('rel-pair-0-style').selectOption('fade_copy');
    await expect(source).toHaveAttribute('data-consumed', 'false');
    await expect(page.getByTestId('rel-junction-0')).toContainText('FC');
    const saved = await save(page);
    expect(saved.pairs).toEqual([{ from: [0], to: [0], style: 'fade_copy' }]);
  });

  test('suggests links by label and applies them on request', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await page.getByTestId('rel-auto-link').click();
    await expect(page.getByTestId('rel-suggestion')).toContainText('a → a');
    await expect(page.getByTestId('rel-suggestion')).toContainText('= → =');
    await expect(page.getByTestId('rel-suggestion')).toContainText('+ → +');
    await expect(page.getByTestId('rel-side-tab-pairs')).toHaveText('Pairs (0)');
    await page.getByTestId('rel-suggestion-accept').click();
    await expect(page.getByTestId('rel-side-tab-pairs')).toHaveText('Pairs (3)');
    // In order of the target's glyphs.
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('a → a');
    await expect(page.getByTestId('rel-pair-1-text')).toHaveText('= → =');
    await expect(page.getByTestId('rel-pair-2-text')).toHaveText('+ → +');
  });

  test('pairs glyphs from the keyboard with the chips, which the key beside the eye lists', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    // The lists of glyphs are left out until their key is pressed: it is left of the eye.
    const key = page.getByTestId('rel-toggle-list');
    await expect(page.getByTestId('rel-from-glyph-0')).toBeVisible();
    await expect(key).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('rel-chips')).toHaveCount(0);
    const list = (await key.boundingBox())!;
    const eye = (await page.getByTestId('rel-toggle-links').boundingBox())!;
    expect(list.x + list.width).toBeLessThanOrEqual(eye.x);
    expect(eye.x - (list.x + list.width)).toBeLessThan(16);
    expect(Math.abs(list.y - eye.y)).toBeLessThan(1);
    await key.focus();
    await page.keyboard.press('Enter');
    await expect(key).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rel-chips').getByRole('button')).toHaveCount(10);
    // Under the drawing, over the toolbar.
    const chips = (await page.getByTestId('rel-chips').boundingBox())!;
    const drawing = (await page.getByTestId('rel-canvas').boundingBox())!;
    expect(chips.y).toBeGreaterThanOrEqual(drawing.y + drawing.height - 1);
    expect(chips.y + chips.height).toBeLessThanOrEqual((await key.boundingBox())!.y);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('mfe.preferences') ?? '{}').relationGlyphList,
      ),
    ).toBe(true);

    await page.getByTestId('rel-from-chip-0').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('rel-from-chip-0')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('rel-to-chip-0').focus();
    await page.keyboard.press('Enter'); // a target with a source selected: they are linked
    await expect(page.getByTestId('rel-side-tab-pairs')).toHaveText('Pairs (1)');
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('a → a');
  });

  test('the inline confirmation is named and takes the focus', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    await page.keyboard.press('Escape');
    const confirm = page.getByRole('alertdialog', {
      name: 'Discard the changes to this relation?',
    });
    await expect(confirm).toBeVisible();
    await expect(page.getByTestId('rel-confirm-keep')).toBeFocused();
    await page.keyboard.press('Enter'); // Keep editing
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId('relation-editor')).toBeVisible();
  });

  test('closing with unsaved changes asks first; nothing is lost silently', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    // The first Escape only clears a selection; here there is none, so it asks.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rel-confirm')).toBeVisible();
    await page.getByTestId('rel-confirm-keep').click();
    await expect(page.getByTestId('rel-pair-0')).toBeVisible();
    await page.getByTestId('rel-cancel').click();
    await page.getByTestId('rel-confirm-yes').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    expect(await relations(page)).toHaveLength(0);
  });

  test('timing: the window defaults to the start of the target and stays inside both clips', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await relationTab(page, 'animation');
    await expect(page.getByTestId('rel-window')).toContainText('Window 2.00 → 3.00 s');
    await page.getByTestId('rel-offset').fill('9');
    await page.getByTestId('rel-offset').press('Enter');
    // Clamped to what both clips allow: the source ends at 6 s, so the window ends there.
    await expect(page.getByTestId('rel-window')).toContainText('Window 5.00 → 6.00 s');
    await page.getByTestId('rel-duration').fill('5');
    await page.getByTestId('rel-duration').press('Enter');
    await expect(page.getByTestId('rel-window')).toContainText('→ 6.00 s');
    await page.getByTestId('rel-easing').selectOption('linear');
    await page.getByTestId('rel-path-arc').fill('60');
    await page.getByTestId('rel-path-arc').press('Enter');
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    const saved = await save(page);
    expect(saved).toMatchObject({ easing: 'linear', pathArc: 60, style: 'transform' });
    expect(saved.offset).toBeCloseTo(3, 6);
    expect(saved.duration).toBeCloseTo(1, 6);
  });

  test('unpaired glyphs: the source outro can run over the relation window', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    await relationTab(page, 'animation');
    await expect(page.getByTestId('rel-unpaired-out')).toContainText(
      '4 glyphs of f1 are not taken away by a relation or a block',
    );
    await page.getByTestId('rel-outro-kind').selectOption('fade_out');
    await page.getByTestId('rel-match-outro').check();
    await page.getByTestId('rel-intro-kind').selectOption('fade_in');
    await page.getByTestId('rel-match-intro').check();
    await save(page);
    // Window [2, 3]: the outro ends with the source clip (6 s) and starts with the window.
    expect((await clipOf(page, 'a')).outro).toMatchObject({ kind: 'fade_out', duration: 4 });
    // The target's intro runs from its start to the end of the window.
    expect((await clipOf(page, 'b')).intro).toMatchObject({ kind: 'fade_in', duration: 1 });
    expect(await canUndo(page)).toBe(true);
    await undo(page);
    expect((await clipOf(page, 'a')).outro.kind).toBe('none');
    expect((await clipOf(page, 'b')).intro.kind).toBe('none');
    expect(await relations(page)).toHaveLength(0);
  });

  test('clips that do not overlap in time cannot be related', async ({ page }) => {
    await openRelationScene(page, [A, plain('b', 'fb', 't2', 7, 9)]);
    await selectClip(page, 'a');
    await page.getByTestId('create-relation-other').selectOption('b');
    await expect(page.getByTestId('create-relation-blocker')).toContainText('overlap');
    const button = page.getByTestId('create-relation-button');
    await expect(button).toBeDisabled();
    // It looks disabled too, like every other disabled button.
    await expect(button).toHaveCSS('opacity', '0.5');
    await expect(button).toHaveCSS('cursor', 'default');
  });
});

test.describe('relations in the Animations panel and the timeline', () => {
  /** A relation a → b with one pair, as a file would carry it. */
  const RELATION = {
    id: 'r1',
    fromClipId: 'a',
    toClipId: 'b',
    offset: 0,
    duration: 1,
    easing: 'smooth',
    style: 'transform',
    pathArc: 0,
    pairs: [
      { from: [0], to: [0], style: null },
      { from: [2, 4], to: [2], style: null },
    ],
  };

  test('shows the diagram of the selected clip, from both sides', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [RELATION] });
    await selectClip(page, 'a');
    await expect(page.getByTestId('relation-diagram')).toBeVisible();
    await expect(page.getByTestId('rd-edge-r1-0')).toHaveAttribute('data-style', 'transform');
    await expect(page.getByTestId('rd-edge-r1-1')).toBeVisible();
    await expect(page.getByTestId('rd-chip-a:0')).toHaveAttribute('data-label', 'a');
    await expect(page.getByTestId('rd-chip-b:2')).toHaveAttribute('data-label', '3');
    await expect(page.getByTestId('relation-row-r1')).toContainText('f1 → f2');
    await selectClip(page, 'b');
    await expect(page.getByTestId('rd-edge-r1-1')).toBeVisible();
    // Clicking an arrow selects the relation: its settings replace the clip's.
    await page.getByTestId('rd-edge-r1-0').locator('.rd-edge-hit').first().click({ force: true });
    await expect(page.getByTestId('relation-properties')).toBeVisible();
    expect((await uiState(page)).selection).toMatchObject({ kind: 'relation', id: 'r1' });
  });

  test('edits the settings of a selected relation, each change one undo step', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [RELATION] });
    await selectClip(page, 'a');
    await page.getByTestId('relation-select-r1').click();
    await expect(page.getByTestId('relation-title')).toHaveText('f1 → f2');
    await page.getByTestId('relation-duration').fill('2');
    await page.getByTestId('relation-duration').press('Enter');
    await page.getByTestId('relation-easing').selectOption('rush_into');
    await page.getByTestId('relation-style').selectOption('copy');
    expect((await relations(page))[0]).toMatchObject({
      duration: 2,
      easing: 'rush_into',
      style: 'copy',
    });
    await undo(page);
    expect((await relations(page))[0]).toMatchObject({
      duration: 2,
      easing: 'rush_into',
      style: 'transform',
    });
    await undo(page);
    await undo(page);
    expect((await relations(page))[0]).toMatchObject({ duration: 1, easing: 'smooth' });
    // "Edit pairs…" opens the editor on the stored pairs.
    await page.getByTestId('relation-edit-pairs').click();
    await expect(page.getByTestId('rel-pair-1-text')).toHaveText('b c → 3');
    await page.getByTestId('rel-cancel').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
  });

  test('draws arrows and windows on the timeline; clicking selects the relation', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B], { relations: [RELATION] });
    await expect(page.getByTestId('relation-arrow-r1')).toBeAttached();
    await expect(page.getByTestId('relation-window-r1')).toBeVisible();
    const window = await page.getByTestId('relation-window-r1').boundingBox();
    const clip = await page.getByTestId('clip-b').boundingBox();
    // The window sits on the target clip, one second (80 px) wide, at its start, over the lower
    // half of the clip.
    expect(window!.width).toBeCloseTo(80, 0);
    expect(window!.x).toBeCloseTo(clip!.x, 0);
    expect(Math.abs(window!.height - clip!.height / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(window!.y + window!.height - (clip!.y + clip!.height))).toBeLessThanOrEqual(1);
    await page.getByTestId('relation-window-r1').click();
    expect((await uiState(page)).selection).toMatchObject({ kind: 'relation', id: 'r1' });
    // Delete removes the selected relation (one undo step).
    await page.keyboard.press('Delete');
    expect(await relations(page)).toHaveLength(0);
    await undo(page);
    expect(await relations(page)).toHaveLength(1);
  });

  test('moving clips keeps relation windows valid', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [{ ...RELATION, offset: 2, duration: 2 }] });
    // Window [4, 6] sits at the end of the source (0–6). Trim the source to end at 5 s: the window
    // is shortened to what is left.
    await selectClip(page, 'a');
    await openAnimationsTab(page, 'timing');
    await page.getByTestId('clip-end').fill('5');
    await page.getByTestId('clip-end').press('Enter');
    let [r] = await relations(page);
    expect(r!.offset + (await clipOf(page, 'b')).start).toBeCloseTo(3, 6);
    expect(r!.duration).toBeCloseTo(2, 6);
    expect((await project(page)).relations).toHaveLength(1);
    await setTime(page, 0);
    await undo(page);
    [r] = await relations(page);
    expect(r).toMatchObject({ offset: 2, duration: 2 });
  });
});

test('double-clicking a relation window on the timeline opens the relation', async ({ page }) => {
  await openRelationScene(page, [A, B], {
    relations: [
      {
        id: 'r1',
        fromClipId: 'a',
        toClipId: 'b',
        offset: 0,
        duration: 1,
        easing: 'smooth',
        style: 'transform',
        pathArc: 0,
        pairs: [{ from: [0], to: [0], style: null }],
      },
    ],
  });
  await page.getByTestId('relation-window-r1').dblclick();
  await expect(page.getByTestId('relation-editor')).toContainText('Relation: f1 → f2');
  await expect(page.getByTestId('rel-pair-0')).toBeVisible();
  await page.getByTestId('rel-cancel').click();
  await expect(page.getByTestId('relation-editor')).toBeHidden();
  // The band on the source clip too.
  await page.getByTestId('relation-source-window-r1').dblclick();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
});

test('a relation whose formula is gone (dangling-ref) can be deleted, not edited', async ({
  page,
}) => {
  // The file refers to the formula fa, which is not in it: it opens so that it can be repaired.
  await openRelationScene(
    page,
    [A, B],
    {
      relations: [
        {
          id: 'r1',
          fromClipId: 'a',
          toClipId: 'b',
          offset: 0,
          duration: 1,
          easing: 'smooth',
          style: 'transform',
          pathArc: 0,
          pairs: [{ from: [0], to: [0], style: null }],
        },
      ],
    },
    [{ id: 'fb', name: 'f2', source: 'a=3+1' }],
  );
  await selectRelation(page, 'r1');
  await expect(page.getByTestId('relation-title')).toHaveText('? → f2');
  await expect(page.getByTestId('relation-missing-formula')).toContainText('no longer exists');
  await expect(page.getByTestId('relation-edit-pairs')).toBeDisabled();
  // Opening it from the timeline says so instead of failing.
  await page.getByTestId('relation-window-r1').dblclick();
  await expect(page.getByTestId('rel-error')).toContainText('no longer exists');
  await page.getByTestId('rel-error-ok').click();
  await expect(page.getByTestId('relation-editor')).toBeHidden();
  await selectRelation(page, 'r1');
  await page.getByTestId('relation-delete').click();
  expect(await relations(page)).toHaveLength(0);
});

test('a press outside the relation editor closes it only while nothing has changed', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  const outside = async () => page.mouse.click(8, 8);
  // No changes (a glyph selection is not one): outside closes.
  await openEditor(page);
  await glyph(page, 'from', 'a').click();
  await outside();
  await expect(page.getByTestId('relation-editor')).toBeHidden();
  expect(await relations(page)).toHaveLength(0);

  // After linking a pair, outside does nothing; Close still asks first.
  await openEditor(page);
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'to', 'a').click();
  await outside();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await expect(page.getByTestId('rel-pair-0')).toBeVisible();
  // Taking the pair out again leaves no change: outside closes.
  await page.getByTestId('rel-pair-0-delete').click();
  await outside();
  await expect(page.getByTestId('relation-editor')).toBeHidden();
  expect(await relations(page)).toHaveLength(0);
});

test('Shift-selecting glyphs draws no focus ring around the editor', async ({ page }) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  await glyph(page, 'from', 'a').click();
  await page.keyboard.down('Shift');
  await glyph(page, 'from', 'b').click();
  await page.keyboard.up('Shift');
  const ring = await page.locator('.rel-body').evaluate((el) => ({
    focused: document.activeElement === el,
    outline: getComputedStyle(el).outlineStyle,
  }));
  expect(ring).toEqual({ focused: true, outline: 'none' });
});

test('hovering a glyph, or selecting it, highlights the pairs it takes part in', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'to', 'a').click();
  await glyph(page, 'from', '=').click();
  await glyph(page, 'to', '=').click();
  await expect(page.getByTestId('rel-pair-1')).toBeVisible();
  // Hovering the target "=" (pair 1) highlights pair 1 and dims pair 0.
  await glyph(page, 'to', '=').hover();
  await expect(page.getByTestId('rel-link-1')).toHaveClass(/is-focus/);
  await expect(page.getByTestId('rel-link-0')).toHaveClass(/is-dim/);
  await expect(page.getByTestId('rel-pair-1')).toHaveAttribute('data-focus', 'true');
  await expect(page.getByTestId('rel-pair-0')).toHaveAttribute('data-focus', 'false');
  // Leaving the glyph clears it; a glyph in no pair highlights nothing.
  await page.mouse.move(5, 5);
  await expect(page.getByTestId('rel-link-1')).not.toHaveClass(/is-focus/);
  await expect(page.getByTestId('rel-pair-1')).toHaveAttribute('data-focus', 'false');
  await glyph(page, 'from', 'b').hover();
  await expect(page.getByTestId('rel-link-0')).not.toHaveClass(/is-dim|is-focus/);
  await page.mouse.move(5, 5);

  // Selecting a glyph that takes part in a pair highlights that pair.
  await glyph(page, 'from', 'a').click();
  await expect(page.getByTestId('rel-link-0')).toHaveClass(/is-focus/);
  await expect(page.getByTestId('rel-link-1')).toHaveClass(/is-dim/);
  await expect(page.getByTestId('rel-pair-0')).toHaveAttribute('data-focus', 'true');
  // With Shift, the glyphs of both pairs: both highlighted.
  await page.keyboard.down('Shift');
  await glyph(page, 'from', '=').click();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('rel-pair-0')).toHaveAttribute('data-focus', 'true');
  await expect(page.getByTestId('rel-pair-1')).toHaveAttribute('data-focus', 'true');
  await page.getByTestId('rel-clear-selection').click();
  await expect(page.getByTestId('rel-pair-0')).toHaveAttribute('data-focus', 'false');
  await expect(page.getByTestId('rel-link-0')).not.toHaveClass(/is-dim|is-focus/);
});

test('the relation editor can be maximized and resized; the canvas follows', async ({ page }) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  const editor = page.getByTestId('relation-editor');
  const canvas0 = (await page.getByTestId('rel-canvas').boundingBox())!;
  await page.getByTestId('relation-editor-maximize').click();
  const max = (await editor.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(max.width).toBeCloseTo(viewport.width - 16, 0);
  expect(max.height).toBeCloseTo(viewport.height - 16, 0);
  expect((await page.getByTestId('rel-canvas').boundingBox())!.height).toBeGreaterThan(
    canvas0.height,
  );
  // Restore, then drag the corner inwards: smaller on both axes.
  await page.getByTestId('relation-editor-maximize').click();
  const before = (await editor.boundingBox())!;
  const grip = (await page.getByTestId('relation-editor-resize').boundingBox())!;
  await page.mouse.move(grip.x + 8, grip.y + 8);
  await page.mouse.down();
  await page.mouse.move(grip.x - 92, grip.y - 42, { steps: 5 });
  await page.mouse.up();
  const after = (await editor.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width - 200, -1);
  expect(after.height).toBeCloseTo(before.height - 100, -1);
  // Kept when the editor opens again.
  await page.getByTestId('rel-cancel').click();
  await openEditor(page);
  expect((await editor.boundingBox())!.width).toBeCloseTo(after.width, 0);
});

test('glyph indices show only for the hovered glyph, at its lower left', async ({ page }) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  await expect(page.getByTestId('rel-glyph-index')).toHaveCount(0);
  await glyph(page, 'to', '3').hover();
  const badge = page.getByTestId('rel-glyph-index');
  await expect(badge).toHaveAttribute('data-side', 'to');
  await expect(badge).toHaveText(/\d+/);
  const g = (await glyph(page, 'to', '3').boundingBox())!;
  const b = (await badge.boundingBox())!;
  expect(b.x).toBeLessThanOrEqual(g.x + 2); // left edge at the glyph's left
  expect(b.y).toBeGreaterThanOrEqual(g.y + g.height - 2); // just below it
  await page.mouse.move(5, 5);
  await expect(badge).toHaveCount(0);
});

test('each link shows its style at its junction: T / C / F, or I: + the inherited one', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'to', 'a').click();
  const badge = page.getByTestId('rel-junction-0');
  await expect(badge).toHaveAttribute('data-style', 'I:T');
  // The badge also numbers the pair, as its swatch in the list does.
  await expect(badge.locator('text')).toHaveText('1 I:T');
  await expect(page.getByTestId('rel-pair-0').locator('.rel-swatch')).toHaveText('1');
  // a+b=c → a=3+1: a pair of 5 glyphs each leaves 4 unpaired on both sides.
  await expect(page.getByTestId('rel-summary')).toHaveText(
    '1 linked pair · 4 glyphs leave · 4 glyphs arrive',
  );
  await relationTab(page, 'animation');
  await page.getByTestId('rel-style').selectOption('copy');
  await expect(badge).toHaveAttribute('data-style', 'I:C');
  await relationTab(page, 'pairs');
  await page.getByTestId('rel-pair-0-style').selectOption('fade');
  await expect(badge).toHaveAttribute('data-style', 'F');
});

test('with a glyph selected, clicking the badge of its pair changes the pair style', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'to', 'a').click();
  const badge = page.getByTestId('rel-junction-0');
  const menu = page.getByTestId('rel-style-menu');
  // Nothing selected: the badge does not react.
  await badge.click({ force: true });
  await expect(menu).toHaveCount(0);

  await glyph(page, 'from', 'a').click(); // select: its pair is emphasised
  await badge.click();
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('rel-style-menu-inherit')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('rel-style-menu-copy').click();
  await expect(menu).toHaveCount(0);
  await expect(badge).toHaveAttribute('data-style', 'C');
  await expect(page.getByTestId('rel-pair-0-style')).toHaveValue('copy');

  // Escape closes the menu, not the editor; back to inherit.
  await badge.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await badge.click();
  await page.getByTestId('rel-style-menu-inherit').click();
  await expect(badge).toHaveAttribute('data-style', 'I:T');
});

test('the badge menu deletes a link after a confirmation held down for 0.7 s', async ({ page }) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'to', 'a').click();
  await glyph(page, 'from', '=').click();
  await glyph(page, 'to', '=').click();
  const badges = page.locator('[data-testid^="rel-junction-"]');
  await expect(badges).toHaveCount(2);
  const openMenu = async () => {
    await page.getByTestId('rel-junction-1').click();
    await page.getByTestId('rel-style-menu-delete').click();
  };
  await glyph(page, 'from', '=').click(); // select: its pair's badge opens the menu
  await openMenu();
  await expect(page.getByTestId('rel-style-menu')).toHaveCount(0);
  const dialog = page.getByTestId('dialog');
  await expect(dialog).toContainText('Delete this link?');
  await expect(dialog).toContainText('= → =');
  await page.getByTestId('dialog-cancel').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await expect(badges).toHaveCount(2);

  await openMenu();
  const confirm = page.getByTestId('dialog-confirm');
  await confirm.click(); // a plain click does nothing
  await confirm.hover();
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up(); // released too early
  await expect(dialog).toBeVisible();
  await expect(badges).toHaveCount(2);
  await page.mouse.down();
  await page.waitForTimeout(850);
  await page.mouse.up();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await expect(badges).toHaveCount(1);
  expect((await save(page)).pairs).toEqual([{ from: [0], to: [0], style: null }]);
});

test('Escape in a number field takes the typing back without closing the editor', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  await relationTab(page, 'animation');
  const duration = page.getByTestId('rel-duration');
  const before = await duration.inputValue();
  await duration.fill('3.5');
  await duration.press('Escape');
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await expect(duration).toHaveValue(before);
});

test('the side column has two tabs, the pairs and the animation; a press on the drawing brings the pairs back', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  const pairsTab = page.getByTestId('rel-side-tab-pairs');
  const animationTab = page.getByTestId('rel-side-tab-animation');
  // It opens on the pairs, which the tab counts; the rest is in the other tab.
  await expect(page.getByRole('tablist', { name: 'Relation' }).getByRole('tab')).toHaveText([
    'Pairs (0)',
    'Animation',
  ]);
  await expect(pairsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('rel-pairs')).toBeVisible();
  await expect(page.getByTestId('rel-settings')).toBeHidden();
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'to', 'a').click();
  await expect(pairsTab).toHaveText('Pairs (1)');

  await animationTab.click();
  await expect(animationTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('rel-pairs')).toBeHidden();
  await expect(page.getByTestId('rel-offset')).toBeVisible();
  await expect(page.getByTestId('rel-style')).toBeVisible();
  await expect(page.getByTestId('rel-unpaired-out')).toBeVisible();
  await expect(page.getByTestId('rel-unpaired-in')).toBeVisible();
  // The tabs stay where they are, whatever the height of what they show.
  const before = (await pairsTab.boundingBox())!;

  // A press on a glyph is work on the pairs: their tab comes back, the glyph's pair in it.
  await glyph(page, 'from', 'a').click();
  await expect(pairsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('rel-settings')).toBeHidden();
  await expect(page.getByTestId('rel-pair-0')).toHaveAttribute('data-focus', 'true');
  expect((await pairsTab.boundingBox())!).toEqual(before);
  // A press on the background of the drawing does it too; one on the toolbar does not.
  await animationTab.click();
  await page.getByTestId('rel-clear-selection').click();
  await expect(animationTab).toHaveAttribute('aria-selected', 'true');
  const drawing = (await page.getByTestId('rel-canvas').boundingBox())!;
  await page.mouse.click(drawing.x + 6, drawing.y + 6);
  await expect(pairsTab).toHaveAttribute('aria-selected', 'true');

  // From the keyboard: one stop for the two tabs, the arrows move between them.
  await pairsTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(animationTab).toBeFocused();
  await expect(animationTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('rel-offset')).toBeVisible();
  // What was typed there is kept while the pairs show.
  await page.getByTestId('rel-duration').fill('2.5');
  await page.getByTestId('rel-duration').press('Enter');
  await pairsTab.click();
  await animationTab.click();
  await expect(page.getByTestId('rel-duration')).toHaveValue('2.5');
});

test('the pairs come back with the row of the pressed glyph in view, in a list that scrolls', async ({
  page,
}) => {
  const long = 'a+b+c+d+e+f+g+h';
  await openRelationScene(page, [A, B], {}, [
    { id: 'fa', name: 'f1', source: long },
    { id: 'fb', name: 'f2', source: long },
  ]);
  await openEditor(page);
  // A window low enough for the 15 pairs not to fit the list.
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.getByTestId('rel-auto-link').click();
  await page.getByTestId('rel-suggestion-accept').click();
  await expect(page.getByTestId('rel-side-tab-pairs')).toHaveText('Pairs (15)');
  const last = page.getByTestId('rel-pair-14');
  await expect(last).toHaveAttribute('data-from', '14');
  await expect(page.getByTestId('rel-pair-0')).toBeInViewport();
  await expect(last).not.toBeInViewport();
  // The list scrolls inside the column and all of it is on screen: the editor is no taller for
  // it, and a row it scrolls to can be seen without the dialog scrolling.
  const list = page.getByTestId('rel-pairs').locator('ol');
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(list).toBeInViewport({ ratio: 1 });

  await relationTab(page, 'animation');
  const drawing = page.getByTestId('rel-canvas');
  const before = (await drawing.boundingBox())!;
  await glyph(page, 'from', 'h').click();
  await expect(page.getByTestId('rel-side-tab-pairs')).toHaveAttribute('aria-selected', 'true');
  await expect(last).toBeInViewport();
  // The editor is as high with either tab: the drawing stayed under the pointer that pressed
  // it, so the press was a click on the glyph, which is selected and has its pair emphasised.
  expect((await drawing.boundingBox())!).toEqual(before);
  await expect(page.getByTestId('rel-from-glyph-14')).toHaveAttribute('data-selected', 'true');
  await expect(last).toHaveAttribute('data-focus', 'true');
});

test('the eye button hides and shows all the links', async ({ page }) => {
  await openRelationScene(page, [A, B]);
  await openEditor(page);
  await glyph(page, 'from', 'a').click();
  await glyph(page, 'to', 'a').click();
  const toggle = page.getByTestId('rel-toggle-links');
  await expect(page.getByTestId('rel-link-0')).toBeAttached();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAccessibleName('Show all links');
  await expect(page.getByTestId('rel-link-0')).toHaveCount(0);
  await expect(page.getByTestId('rel-junction-0')).toHaveCount(0);
  // The glyphs keep their pair colour; the pair is still there.
  await expect(glyph(page, 'from', 'a')).toHaveAttribute('data-linked', 'true');
  await expect(page.getByTestId('rel-pair-0')).toBeVisible();
  await toggle.click();
  await expect(page.getByTestId('rel-link-0')).toBeAttached();
  await expect(page.getByTestId('rel-junction-0')).toBeAttached();
});

test.describe('creating relations from the panel', () => {
  test('after the editor closes, Space plays instead of reopening it', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await page.getByTestId('rel-cancel').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    // The focus went back to "Create relation…"; Space must not press it.
    await expect(page.getByTestId('create-relation-button')).toBeFocused();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await uiState(page)).playing).toBe(true);
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await uiState(page)).playing).toBe(false);
  });

  test('two selected clips can be related, in either direction', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await page.getByTestId('clip-a').click({ position: { x: 30, y: 8 } });
    await page.getByTestId('clip-b').click({ position: { x: 30, y: 8 }, modifiers: ['Shift'] });
    await expect(page.getByTestId('animations-pair')).toBeVisible();
    // Direction: from the second clip to the first.
    await page.getByTestId('create-relation-direction-in').click();
    await expect(page.getByTestId('create-relation-direction')).toHaveAttribute('data-value', 'in');
    await page.getByTestId('create-relation-button').click();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    // B starts after A, but the source of this relation is B: its intro-free window is [2, 6].
    await expect(page.getByTestId('relation-editor')).toContainText('Relation: f2 → f1');
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    const saved = await save(page);
    expect(saved).toMatchObject({ fromClipId: 'b', toClipId: 'a' });
    // The window sits on the target (A, starting at 0) at the first moment both clips are there.
    expect(saved.offset).toBeCloseTo(2, 6);
  });

  test('two related clips: the button asks, and the relation they have can be edited', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B], {
      relations: [
        {
          id: 'r1',
          fromClipId: 'a',
          toClipId: 'b',
          offset: 0,
          duration: 1,
          easing: 'smooth',
          style: 'transform',
          pathArc: 0,
          pairs: [{ from: [0], to: [0], style: null }],
        },
      ],
    });
    await selectClip(page, 'a');
    await page.getByTestId('create-relation-other').selectOption('b');
    await expect(page.getByTestId('create-relation-button')).toHaveText('Edit or add a relation…');
    await page.getByTestId('create-relation-button').click();
    await page.getByTestId('relation-choice-edit-1').click();
    await expect(page.getByTestId('rel-pair-0')).toBeVisible();
    await expect(page.getByTestId('rel-delete')).toBeVisible();
    // Deleting asks first, then removes it in one undo step.
    await page.getByTestId('rel-delete').click();
    await expect(page.getByTestId('rel-confirm')).toContainText('Delete this relation');
    await page.getByTestId('rel-confirm-yes').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    expect(await relations(page)).toHaveLength(0);
    await undo(page);
    expect(await relations(page)).toHaveLength(1);
  });

  test('a formula selected in the Creator lists the relations of its clips', async ({ page }) => {
    await openRelationScene(page, [A, B], {
      relations: [
        {
          id: 'r1',
          fromClipId: 'a',
          toClipId: 'b',
          offset: 0,
          duration: 1,
          easing: 'smooth',
          style: 'copy',
          pathArc: 0,
          pairs: [{ from: [0], to: [0], style: null }],
        },
      ],
    });
    await page.getByTestId('formula-item').first().click();
    await expect(page.getByTestId('formula-relations')).toBeVisible();
    await expect(page.getByTestId('formula-title')).toHaveText('f1');
    await expect(page.getByTestId('relation-row-r1')).toContainText('f1 → f2');
    await expect(page.getByTestId('rd-edge-r1-0')).toHaveAttribute('data-style', 'copy');
    await page.getByTestId('relation-edit-r1').click();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    await page.getByTestId('rel-cancel').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
  });
});

test.describe('timeline edits and relation windows', () => {
  const RELATION = {
    id: 'r1',
    fromClipId: 'a',
    toClipId: 'b',
    offset: 1,
    duration: 1,
    easing: 'smooth',
    style: 'transform',
    pathArc: 0,
    pairs: [{ from: [0], to: [0], style: null }],
  };

  test('the window moves with its target clip', async ({ page }) => {
    // a: [0, 6]; b: [2, 8]; window [3, 4].
    await openRelationScene(page, [A, B], { relations: [RELATION] });
    await selectClip(page, 'b');
    await openAnimationsTab(page, 'timing');
    await page.getByTestId('clip-start').fill('3');
    await page.getByTestId('clip-start').press('Enter');
    await page.getByTestId('clip-end').fill('9');
    await page.getByTestId('clip-end').press('Enter');
    // Trimming the start edge keeps the window where it was in time: [3, 4].
    const [r] = await relations(page);
    expect((await clipOf(page, 'b')).start).toBe(3);
    expect(3 + r!.offset).toBeCloseTo(3, 6);
    expect(r!.duration).toBeCloseTo(1, 6);
  });

  test('moving the target by dragging carries the window; the source clamps it', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B], { relations: [RELATION] });
    // Drag b one second to the right: its window follows ([4, 5]).
    const b = await page.getByTestId('clip-b').boundingBox();
    await page.mouse.move(b!.x + 60, b!.y + b!.height / 2);
    await page.mouse.down();
    await page.mouse.move(b!.x + 60 + 80, b!.y + b!.height / 2, { steps: 6 });
    await page.mouse.up();
    const moved = await clipOf(page, 'b');
    const [r] = await relations(page);
    expect(moved.start).toBeCloseTo(3, 1);
    expect(r!.offset).toBe(1);
    // Drag it two more seconds: the source ends at 6 s, so the window is pulled back to fit.
    const b2 = await page.getByTestId('clip-b').boundingBox();
    await page.mouse.move(b2!.x + 60, b2!.y + b2!.height / 2);
    await page.mouse.down();
    await page.mouse.move(b2!.x + 60 + 160, b2!.y + b2!.height / 2, { steps: 8 });
    await page.mouse.up();
    const [r2] = await relations(page);
    const start = (await clipOf(page, 'b')).start;
    expect(start + r2!.offset + r2!.duration).toBeLessThanOrEqual(6 + 1e-6);
    expect(r2!.duration).toBeGreaterThan(0);
    // No validation error remains.
    const issues = await page.evaluate(
      () => document.querySelectorAll('[data-testid="clip-issues"] .is-error').length,
    );
    expect(issues).toBe(0);
  });
});

test('a locked track blocks creating, editing and deleting the relations of its clips', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], {
    relations: [
      {
        id: 'r1',
        fromClipId: 'a',
        toClipId: 'b',
        offset: 0,
        duration: 1,
        easing: 'smooth',
        style: 'transform',
        pathArc: 0,
        pairs: [{ from: [0], to: [0], style: null }],
      },
    ],
  });
  await page.getByTestId('track-lock-t2').click(); // the target's track
  await selectClip(page, 'a');
  await page.getByTestId('create-relation-other').selectOption('b');
  await expect(page.getByTestId('create-relation-blocker')).toContainText('is locked');
  await expect(page.getByTestId('create-relation-button')).toBeDisabled();
  await selectRelation(page, 'r1');
  await expect(page.getByTestId('relation-locked')).toContainText('is locked');
  await expect(page.getByTestId('relation-delete')).toBeDisabled();
  await expect(page.getByTestId('relation-edit-pairs')).toBeDisabled();
  await page.keyboard.press('Delete');
  expect(await relations(page)).toHaveLength(1);
  await page.getByTestId('relation-window-r1').dblclick();
  await expect(page.getByTestId('rel-error')).toContainText('is locked');
  await page.getByTestId('rel-error-ok').click();
  await page.getByTestId('track-lock-t2').click();
  await selectRelation(page, 'r1');
  await expect(page.getByTestId('relation-locked')).toHaveCount(0);
  await expect(page.getByTestId('relation-delete')).toBeEnabled();
});

/* A relation with a clip on a locked track plays where it does, inside both clips, whatever is
 * done to its other clip (A6-02): a trim or a drag of that clip stops where the window would no
 * longer fit in it, and deleting it is refused with a notice that names the track. */
test.describe('a relation with a clip on a locked track keeps its window', () => {
  // a: [0, 6] on Track 1; b: [2, 8] on Track 2; the window from a to b: [3, 4].
  const HELD = {
    id: 'r1',
    fromClipId: 'a',
    toClipId: 'b',
    offset: 1,
    duration: 1,
    easing: 'smooth',
    style: 'transform',
    pathArc: 0,
    pairs: [{ from: [0], to: [0], style: null }],
  };
  const LOCK =
    'Track “Track 2” is locked: unlock it on the timeline to create, edit or delete relations of its clips.';
  /** Where the relation plays, in scene time. */
  const played = async (page: Page) => {
    const [r] = await relations(page);
    const to = await clipOf(page, r!.toClipId);
    return [to.start + r!.offset, to.start + r!.offset + r!.duration];
  };
  const expectPlayed = async (page: Page, start: number, end: number) => {
    const [from, to] = await played(page);
    expect(from).toBeCloseTo(start, 6);
    expect(to).toBeCloseTo(end, 6);
  };

  test('a trim of the other clip stops where the window ends', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [HELD] });
    await page.getByTestId('track-lock-t2').click();
    // The end of a dragged from 6 s back to 2 s: it stops at 4 s, where the window ends.
    const edge = await box(page.getByTestId('clip-a-trim-end'));
    await dragTo(
      page,
      { x: edge.x + 3, y: edge.y + 10 },
      { x: edge.x + 3 - 4 * PX_PER_SECOND, y: edge.y + 10 },
    );
    expect((await clipOf(page, 'a')).end).toBe(4);
    expect((await relations(page))[0]).toMatchObject({ offset: 1, duration: 1 });
    // Unlocked, the same trim fits the window into what is left of the clip.
    await undo(page);
    await page.getByTestId('track-lock-t2').click();
    const again = await box(page.getByTestId('clip-a-trim-end'));
    await dragTo(
      page,
      { x: again.x + 3, y: again.y + 10 },
      { x: again.x + 3 - 3.5 * PX_PER_SECOND, y: again.y + 10 },
    );
    expect((await clipOf(page, 'a')).end).toBeCloseTo(2.5, 1);
    expect((await played(page))[1]).toBeLessThanOrEqual((await clipOf(page, 'a')).end + 1e-6);
  });

  test('a drag of the target stops where the window would leave it; the window keeps its time', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B], { relations: [HELD] });
    await page.getByTestId('track-lock-t1').click(); // the source's track: b is the clip edited
    // b dragged 3 s to the right: it stops at 3 s, where the window starts.
    await moveClip(page, 'b', 3);
    expect((await clipOf(page, 'b')).start).toBe(3);
    await expectPlayed(page, 3, 4);
    // And 3 s back to the left (pressed clear of the window's band, 3 s into it): the window
    // keeps its time, the offset counted from b's start.
    const clip = await box(page.getByTestId('clip-b'));
    const from = { x: clip.x + 3 * PX_PER_SECOND, y: clip.y + clip.height / 2 };
    await dragTo(page, from, { x: from.x - 3 * PX_PER_SECOND, y: from.y });
    expect((await clipOf(page, 'b')).start).toBeCloseTo(0, 1);
    await expectPlayed(page, 3, 4);
  });

  test('the other clip is not deleted, by the Delete key nor by the button of its panel', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B], { relations: [HELD] });
    await page.getByTestId('track-lock-t2').click();
    await selectClip(page, 'a');
    await page.keyboard.press('Delete');
    const notice = page.getByTestId('notice').filter({ hasText: '“f1” was not deleted' });
    await expect(notice).toContainText(
      `The relation from “f1” to “f2” (3.00–4.00 s) would go with it. ${LOCK}`,
    );
    expect((await project(page)).clips.map((c) => c.id)).toEqual(['a', 'b']);
    expect(await relations(page)).toHaveLength(1);
    await notice.getByTestId('notice-dismiss').click();
    await expect(notice).toHaveCount(0);
    await page.getByTestId('clip-delete').click();
    await expect(notice).toBeVisible();
    expect((await project(page)).clips.map((c) => c.id)).toEqual(['a', 'b']);
    expect(await relations(page)).toHaveLength(1);
    // Unlocked, the Delete key deletes it, with its relation.
    await page.getByTestId('track-lock-t2').click();
    await selectClip(page, 'a');
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await project(page)).clips.map((c) => c.id)).toEqual(['b']);
    expect(await relations(page)).toHaveLength(0);
  });

  test('neither the track nor the formula of the other clip is deleted: a notice, and no question', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B], { relations: [HELD] });
    await page.getByTestId('track-lock-t2').click();
    const why = `The relation from “f1” to “f2” (3.00–4.00 s) would go with it. ${LOCK}`;
    // Its track.
    await page.getByTestId('track-delete-t1').click();
    const track = page.getByTestId('notice').filter({ hasText: 'Track “Track 1” was not deleted' });
    await expect(track).toContainText(why);
    await expect(page.getByTestId('dialog-confirm')).toHaveCount(0);
    await track.getByTestId('notice-dismiss').click();
    // Its formula, in the Creator.
    const card = page.locator('[data-testid="formula-item"][data-name="f1"]');
    await card.hover();
    await card.getByTestId('formula-delete').click();
    const formula = page.getByTestId('notice').filter({ hasText: '“f1” was not deleted' });
    await expect(formula).toContainText(why);
    await expect(page.getByTestId('dialog-confirm')).toHaveCount(0);
    const kept = await project(page);
    expect(kept.tracks).toHaveLength(3);
    expect(kept.formulas.map((f) => f.id)).toEqual(['fa', 'fb']);
    expect(kept.clips.map((c) => c.id)).toEqual(['a', 'b']);
    expect(await relations(page)).toHaveLength(1);
  });
});

test.describe('relations are between formulas and texts', () => {
  test('a shape or a brace has no Relations tab, is not offered to relate with, and takes no link', async ({
    page,
  }) => {
    // sum (a formula) over [0, 9]; frame (a shape) over [2, 9]; under (a brace) over [7, 9].
    await page.setViewportSize({ width: 1500, height: 900 });
    await openWithProject(page, readExample('shapes.mfe.json'));
    const pick = (id: string, modifiers: ('ControlOrMeta' | 'Shift')[] = []) =>
      page.getByTestId(`clip-${id}`).click({ position: { x: 20, y: 6 }, modifiers });
    // The formula's Relations tab lists no brace and no shape to relate with.
    await pick('c_sum');
    await openAnimationsTab(page, 'relations');
    await expect(page.getByTestId('create-relation-other').locator('option')).toHaveText([
      'No other formulas or texts',
    ]);
    // The shape and the brace are one piece: no Relations tab, their Timing tab instead.
    for (const id of ['c_frame', 'c_under']) {
      await pick(id);
      await expect(page.getByTestId('clip-properties')).toBeVisible();
      await expect(page.getByTestId('animations-tab-relations')).toHaveCount(0);
      await expect(page.getByTestId('animations-tab-timing')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByTestId('clip-start')).toBeVisible();
      await expect(page.getByTestId('create-relation')).toHaveCount(0);
    }
    // A formula and a shape selected together: nothing to relate.
    await pick('c_sum');
    await pick('c_frame', ['ControlOrMeta']);
    await expect(page.getByTestId('animations-multi')).toBeVisible();
    await expect(page.getByTestId('animations-pair')).toHaveCount(0);
    // Shift held: the formula shows its link port, the shape and the brace none.
    await page.keyboard.down('Shift');
    await expect(page.getByTestId('clip-c_sum-link')).toBeVisible();
    await expect(page.getByTestId('clip-c_frame-link')).toHaveCount(0);
    await expect(page.getByTestId('clip-c_under-link')).toHaveCount(0);
    await page.keyboard.up('Shift');
    expect((await project(page)).relations).toEqual([]);
  });
});
