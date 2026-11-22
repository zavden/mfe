import { expect, test, type Page } from './test';
import { canUndo, onSystem, openWithProject, undo, type MfeWindow } from './helpers';
import { relationProject } from './relationsHelpers';
import { clipJson, project, type ActionJson } from './timelineHelpers';

/* The pair editor of a Morph block on the owner's derivation
 *
 *     A &= x_1 \\ &= x_2 \\ &= x_3
 *
 * which MathJax draws as ten glyphs in three aligned rows, labelled by their character:
 * A = x 1 (0–3) | = x 2 (4–6) | = x 3 (7–9). Nothing is hidden (a Morph target skips the intro by
 * arriving); the clip runs over [0, 10] with Write and FadeOut, and its Morph block (copy) starts
 * at 2 s. The editor is opened through the store (the panel's button is tested with the panel). */
const LABELS = ['A', '=', 'x', '1', '=', 'x', '2', '=', 'x', '3'];
const LATEX = 'A &= x_1 \\\\ &= x_2 \\\\ &= x_3';

interface Pair {
  from: number[];
  to: number[];
  style: string | null;
}

function morphJson(id: string, start: number, pairs: Pair[] = []): ActionJson {
  return {
    id,
    kind: 'morph',
    start,
    duration: 1,
    easing: 'smooth',
    style: 'copy',
    pathArc: 0,
    pairs,
  } as unknown as ActionJson;
}

function appearJson(id: string, start: number, glyphs: number[]): ActionJson {
  return {
    id,
    kind: 'appear',
    start,
    duration: 1,
    easing: 'linear',
    anim: 'write',
    glyphs,
    lagRatio: null,
    shift: [0, 0],
    scale: 1,
  } as ActionJson;
}

async function openDerivation(page: Page, actions: ActionJson[]): Promise<void> {
  const file = relationProject(
    [clipJson('c', 'fm', 't1', 0, 10, { actions })],
    [{ id: 'fm', name: 'steps', source: LATEX, color: '#58C4DD' }],
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, file);
  await expect(page.getByTestId('timeline-view')).toBeVisible();
  // Wait for the render: the snapshot appears once the formula has one.
  await expect.poll(() => snapshotLabels(page)).toEqual(LABELS);
}

async function snapshotLabels(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    const f = (window as MfeWindow).__mfe!.useProjectStore.getState().project.formulas[0] as {
      snapshot?: { glyphs: { label: string }[] } | null;
    };
    return f.snapshot ? f.snapshot.glyphs.map((g) => g.label) : null;
  });
}

async function openEditor(page: Page, actionId: string): Promise<void> {
  await page.evaluate(
    (actionId) =>
      (window as MfeWindow).__mfe!.useMorphEditorStore.getState().open({ clipId: 'c', actionId }),
    actionId,
  );
  await expect(page.getByTestId('morph-editor')).toBeVisible();
  await expect(page.getByTestId('morph-from-glyph-0')).toBeVisible();
}

async function pairsOf(page: Page, actionId: string): Promise<Pair[]> {
  const clip = (await project(page)).clips.find((c) => c.id === 'c')!;
  const action = clip.actions.find((a) => a.id === actionId) as unknown as { pairs: Pair[] };
  return action.pairs;
}

const glyph = (page: Page, side: 'from' | 'to', index: number) =>
  page.getByTestId(`morph-${side}-glyph-${index}`);

test.describe('morph pair editor', () => {
  test('linking onto a target that has a pair adds the source to that pair', async ({ page }) => {
    await openDerivation(page, [morphJson('m1', 2)]);
    await openEditor(page, 'm1');
    await glyph(page, 'from', 1).click();
    await glyph(page, 'to', 4).click();
    await expect(page.getByTestId('morph-pair-0-text')).toHaveText('= → =');
    await glyph(page, 'from', 2).click();
    await glyph(page, 'to', 4).click();
    await expect(page.getByTestId('morph-pair-0-text')).toHaveText('= x → =');
    await expect(page.getByTestId('morph-message')).toContainText('joined pair 1');
    await expect(page.getByTestId('morph-pair-1')).toHaveCount(0);
    // The grown pair gets the menu for how its sources arrive.
    await expect(page.getByTestId('morph-pair-0-extras')).toHaveValue('separate');
    await page.getByTestId('morph-pair-0-extras').selectOption('merge');
    await page.getByTestId('morph-save').click();
    expect(await pairsOf(page, 'm1')).toEqual([
      { from: [1, 2], to: [4], style: null, extras: 'merge' },
    ]);
  });

  test('links = → = by clicking, adds x → x from Suggest and saves one undo step', async ({
    page,
  }) => {
    await openDerivation(page, [morphJson('m1', 2)]);
    await openEditor(page, 'm1');
    await expect(page.getByTestId('morph-editor')).toContainText('Morph pairs');
    for (const [i, label] of LABELS.entries()) {
      await expect(glyph(page, 'from', i)).toHaveAttribute('data-label', label);
    }
    // At 2 s the intro has brought every glyph: each can be a source, and a target that then
    // skips the intro to arrive through the block (a hint says so; nothing is dimmed).
    await expect(glyph(page, 'from', 4)).toHaveAttribute('data-eligible', 'true');
    await expect(glyph(page, 'to', 4)).toHaveAttribute('data-eligible', 'true');
    await expect(glyph(page, 'to', 4).locator('title')).toHaveText(
      '4: = — brought by the intro: linked, it arrives through the block instead',
    );
    await expect(page.getByTestId('morph-summary')).toHaveText(
      '0 pairs · 10 glyphs on screen to start from · 10 can arrive',
    );
    await expect(page.getByTestId('morph-save')).toBeDisabled();

    // = (row 1) → = (row 2): a source, then a target.
    await glyph(page, 'from', 1).click();
    await expect(page.getByTestId('morph-selection')).toHaveText(
      'Now select glyphs on the other side',
    );
    await glyph(page, 'to', 4).click();
    await expect(page.getByTestId('morph-pair-0-text')).toHaveText('= → =');
    await expect(page.getByTestId('morph-link-0')).toBeAttached();

    // Suggest adds what is left with a match: x → x, drawn dashed until accepted.
    await page.getByTestId('morph-suggest').click();
    await expect(page.getByTestId('morph-suggestion')).toContainText('1 suggested pair: x → x');
    await expect(page.getByTestId('morph-suggestion-link-0')).toBeAttached();
    await page.getByTestId('morph-suggest-accept').click();
    await expect(page.getByTestId('morph-suggestion')).toBeHidden();
    await expect(page.getByTestId('morph-pair-1-text')).toHaveText('x → x');
    await expect(page.getByTestId('morph-problems')).toHaveCount(0);

    // Nothing more to suggest now, and the hint says why.
    await page.getByTestId('morph-suggest').click();
    await expect(page.getByTestId('morph-message')).toContainText('Nothing more to suggest');

    expect(await pairsOf(page, 'm1')).toEqual([]); // still a draft
    await page.getByTestId('morph-save').click();
    await expect(page.getByTestId('morph-editor')).toBeHidden();
    expect(await pairsOf(page, 'm1')).toEqual([
      { from: [1], to: [4], style: null },
      { from: [2], to: [5], style: null },
    ]);
    // The whole session is one undo step.
    await undo(page);
    expect(await pairsOf(page, 'm1')).toEqual([]);
    expect(await canUndo(page)).toBe(false);
  });

  test('a box selects the sources it touches, and with Shift it adds, as the hint says', async ({
    page,
  }) => {
    await openDerivation(page, [morphJson('m1', 2)]);
    await openEditor(page, 'm1');
    await expect(page.getByTestId('morph-editor').locator('.rel-hint').first()).toContainText(
      onSystem(
        'Shift-click, or drag a box over glyphs (Shift or Ctrl/⌘: add), to select several',
        '⇧-click, or drag a box over glyphs (⇧ or ⌘: add), to select several',
      ),
    );
    const selected = () =>
      page
        .locator('[data-testid^="morph-from-glyph-"][data-selected="true"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    const boxOver = async (index: number, key?: string) => {
      const b = (await glyph(page, 'from', index).boundingBox())!;
      if (key) await page.keyboard.down(key);
      await page.mouse.move(b.x - 3, b.y - 3);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
      await page.mouse.up();
      if (key) await page.keyboard.up(key);
    };
    // The "=" of row 1, then, with Shift, the "=" of row 2.
    await boxOver(1);
    expect(await selected()).toEqual(['morph-from-glyph-1']);
    await boxOver(4, 'Shift');
    expect(await selected()).toEqual(['morph-from-glyph-1', 'morph-from-glyph-4']);
  });

  test('the lists of glyphs show when their key asks, and the toolbar stays in view', async ({
    page,
  }) => {
    await openDerivation(page, [morphJson('m1', 2)]);
    await openEditor(page, 'm1');
    // Left out until asked for: the key is left of the eye, as in the relation editor.
    const key = page.getByTestId('morph-toggle-list');
    await expect(key).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('morph-chips')).toHaveCount(0);
    const list = (await key.boundingBox())!;
    const eye = (await page.getByTestId('morph-toggle-links').boundingBox())!;
    expect(list.x + list.width).toBeLessThanOrEqual(eye.x);
    expect(Math.abs(list.y - eye.y)).toBeLessThan(1);
    await expect(page.getByTestId('morph-link')).toBeInViewport({ ratio: 1 });

    await key.focus();
    await page.keyboard.press('Enter');
    await expect(key).toHaveAttribute('aria-pressed', 'true');
    // The formula twice: a key per glyph and side, under the drawing and over the toolbar.
    await expect(page.getByTestId('morph-chips').getByRole('button')).toHaveCount(20);
    const chips = (await page.getByTestId('morph-chips').boundingBox())!;
    const drawing = (await page.getByTestId('morph-canvas').boundingBox())!;
    expect(chips.y).toBeGreaterThanOrEqual(drawing.y + drawing.height - 1);
    expect(chips.y + chips.height).toBeLessThanOrEqual((await key.boundingBox())!.y);
    // The choice is the relation editor's own: one preference for the two pair editors.
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('mfe.preferences') ?? '{}').relationGlyphList,
      ),
    ).toBe(true);

    // From the keyboard: = of row 1, then = of row 2, which links them.
    await page.getByTestId('morph-from-chip-1').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('morph-from-chip-1')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('morph-to-chip-4').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('morph-pair-0-text')).toHaveText('= → =');
    await key.click();
    await expect(page.getByTestId('morph-chips')).toHaveCount(0);
  });

  test('Suggest alone proposes = → = and x → x from row 1 to row 2', async ({ page }) => {
    await openDerivation(page, [morphJson('m1', 2)]);
    await openEditor(page, 'm1');
    await page.getByTestId('morph-suggest').click();
    await expect(page.getByTestId('morph-suggestion')).toContainText(
      '2 suggested pairs: = → = · x → x',
    );
    await expect(page.getByTestId('morph-suggestion-link-1')).toBeAttached();
    await page.getByTestId('morph-suggest-accept').click();
    for (const [i, from, to] of [
      [0, '1', '4'],
      [1, '2', '5'],
    ] as const) {
      await expect(page.getByTestId(`morph-pair-${i}`)).toHaveAttribute('data-from', from);
      await expect(page.getByTestId(`morph-pair-${i}`)).toHaveAttribute('data-to', to);
    }
    await page.getByTestId('morph-save').click();
    expect(await pairsOf(page, 'm1')).toEqual([
      { from: [1], to: [4], style: null },
      { from: [2], to: [5], style: null },
    ]);
  });

  test('asks before discarding a change; without one, a press outside closes it', async ({
    page,
  }) => {
    await openDerivation(page, [morphJson('m1', 2)]);
    await openEditor(page, 'm1');
    // No change: a press on the backdrop closes the editor.
    await page.mouse.click(5, 5);
    await expect(page.getByTestId('morph-editor')).toBeHidden();

    await openEditor(page, 'm1');
    await glyph(page, 'from', 2).click();
    await glyph(page, 'to', 5).click();
    await expect(page.getByTestId('morph-pair-0-text')).toHaveText('x → x');
    // With a change, the backdrop does nothing and Cancel asks.
    await page.mouse.click(5, 5);
    await expect(page.getByTestId('morph-editor')).toBeVisible();
    await page.getByTestId('morph-cancel').click();
    await expect(page.getByTestId('morph-confirm')).toContainText(
      'Discard the changes to these pairs?',
    );
    await expect(page.getByTestId('morph-confirm-keep')).toBeFocused();
    await page.getByTestId('morph-confirm-keep').click();
    await expect(page.getByTestId('morph-confirm')).toBeHidden();
    // Escape is Cancel too.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('morph-confirm')).toBeVisible();
    await page.getByTestId('morph-confirm-yes').click();
    await expect(page.getByTestId('morph-editor')).toBeHidden();
    expect(await pairsOf(page, 'm1')).toEqual([]);
    expect(await canUndo(page)).toBe(false);
  });

  test('on the second step, Suggest takes row 2 → row 3 and leaves what the first brings', async ({
    page,
  }) => {
    await openDerivation(page, [
      morphJson('m1', 2, [
        { from: [1], to: [4], style: null },
        { from: [2], to: [5], style: null },
      ]),
      appearJson('w2', 3, [6]),
      morphJson('m2', 4),
    ]);
    await openEditor(page, 'm2');
    await expect(glyph(page, 'to', 4).locator('title')).toHaveText(
      '4: = — brought in by another Morph block',
    );
    await expect(glyph(page, 'from', 5)).toHaveAttribute('data-eligible', 'true');
    // "=" of row 1 was the first block's source: it cannot arrive here.
    await expect(glyph(page, 'to', 1).locator('title')).toHaveText(
      '1: = — a source of an earlier transfer',
    );
    await page.getByTestId('morph-suggest').click();
    await expect(page.getByTestId('morph-suggestion')).toContainText(
      '2 suggested pairs: = → = · x → x',
    );
    await page.getByTestId('morph-suggest-accept').click();
    await expect(page.getByTestId('morph-pair-0')).toHaveAttribute('data-from', '4');
    await expect(page.getByTestId('morph-pair-0')).toHaveAttribute('data-to', '7');
    // A glyph is never on both sides of one block: the editor refuses and says why.
    await glyph(page, 'from', 7).click();
    await glyph(page, 'to', 9).click();
    await expect(page.getByTestId('morph-message')).toHaveText(
      'Glyph = (7) is a target of pair 1: it cannot also be a source of this block.',
    );
    await page.getByTestId('morph-save').click();
    await expect(page.getByTestId('morph-editor')).toBeHidden();
    expect(await pairsOf(page, 'm2')).toEqual([
      { from: [4], to: [7], style: null },
      { from: [5], to: [8], style: null },
    ]);
  });
});
