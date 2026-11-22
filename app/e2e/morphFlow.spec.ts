import { expect, test, type Page } from './test';
import { blockLocator, pickAnimation } from './blockHelpers';
import { canUndo, openWithProject, setTime, undo, type MfeWindow } from './helpers';
import { canvasHash, relationProject } from './relationsHelpers';
import { box, clipJson, clipOf, timeToX, uiState, type ActionJson } from './timelineHelpers';

/* Morph blocks from the author's side, on the owner's derivation
 *
 *     A &= x_1 \\ &= x_2 \\ &= x_3
 *
 * which MathJax draws as ten glyphs in three aligned rows: A = x 1 (0–3) | = x 2 (4–6) |
 * = x 3 (7–9). Clip `c` runs over [0, 10] on track 1 with Write and FadeOut; nothing is hidden
 * (a Morph target skips the intro by arriving). */
const LABELS = ['A', '=', 'x', '1', '=', 'x', '2', '=', 'x', '3'];
const LATEX = 'A &= x_1 \\\\ &= x_2 \\\\ &= x_3';

interface Pair {
  from: number[];
  to: number[];
  style: string | null;
}

const pair = (from: number, to: number): Pair => ({ from: [from], to: [to], style: null });

async function openDerivation(page: Page, actions: ActionJson[] = []): Promise<void> {
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

/** Put the playhead at time `t`, right-click clip `c` there (below its blocks) and choose `item`
 * of "Add animation": the clip's menu adds at the playhead (D171). */
async function addAnimation(page: Page, t: number, item: string): Promise<string> {
  await setTime(page, t);
  const b = await box(page.getByTestId('clip-c'));
  await page.mouse.click(await timeToX(page, t), b.y + b.height - 6, { button: 'right' });
  const menu = page.getByTestId('add-animation-menu');
  await expect(menu).toBeVisible();
  await pickAnimation(page, item);
  await expect(menu).toHaveCount(0);
  // The new block is selected.
  return selectedBlock(page);
}

/** The id of the selected block. */
async function selectedBlock(page: Page): Promise<string> {
  const selection = (await uiState(page)).selection as { kind: string; actionId?: string };
  expect(selection.kind).toBe('action');
  return selection.actionId!;
}

async function pairsOf(page: Page, actionId: string): Promise<Pair[]> {
  const action = (await clipOf(page, 'c')).actions.find((a) => a.id === actionId) as unknown as {
    pairs: Pair[];
  };
  return action.pairs;
}

const suggestOn = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.usePreferences.getState().autoSuggestMorphPairs);

/** Turn the preference on or off with Edit → Suggest morph pairs. */
async function setSuggest(page: Page, on: boolean): Promise<void> {
  await page.getByTestId('menu-edit').click();
  const item = page.getByTestId('menu-item-edit-auto-suggest-morph-pairs');
  await expect(item).toHaveAttribute('aria-checked', String(!on));
  await item.click();
  expect(await suggestOn(page)).toBe(on);
}

test.describe('the "Suggest morph pairs" preference', () => {
  test('off by default: a new Morph block has no pairs', async ({ page }) => {
    await openDerivation(page);
    expect(await suggestOn(page)).toBe(false);
    const id = await addAnimation(page, 2, 'morph');
    expect(await pairsOf(page, id)).toEqual([]);
    await expect(blockLocator(page, id)).toHaveText('Morph · 0');
  });

  test('on: the clip menu at 2 s adds = → = and x → x of row 1 → row 2, as one undo step', async ({
    page,
  }) => {
    await openDerivation(page);
    await setSuggest(page, true);
    const id = await addAnimation(page, 2, 'morph');
    expect(await pairsOf(page, id)).toEqual([pair(1, 4), pair(2, 5)]);
    await expect(blockLocator(page, id)).toHaveText('Morph · 2');
    // The panel lists them; nothing to report.
    await expect(page.getByTestId('block-morph-pair-0')).toContainText('= → =');
    await expect(page.getByTestId('block-morph-pair-1')).toContainText('x → x');
    await expect(page.getByTestId('block-issues')).toHaveCount(0);
    // Adding the block and its pairs is one step (the preference is no step at all).
    await undo(page);
    expect((await clipOf(page, 'c')).actions).toEqual([]);
    expect(await canUndo(page)).toBe(false);

    // Off again: the next one has none.
    await setSuggest(page, false);
    const plain = await addAnimation(page, 2, 'morph');
    expect(await pairsOf(page, plain)).toEqual([]);
  });

  test('on, the second step pairs row 2 → row 3; a duplicate never gets pairs', async ({
    page,
  }) => {
    await openDerivation(page);
    await setSuggest(page, true);
    const first = await addAnimation(page, 2, 'morph');
    expect(await pairsOf(page, first)).toEqual([pair(1, 4), pair(2, 5)]);
    const second = await addAnimation(page, 4, 'morph');
    expect(await pairsOf(page, second)).toEqual([pair(4, 7), pair(5, 8)]);

    await blockLocator(page, second).click({ button: 'right' });
    await page.getByTestId('block-menu-duplicate').click();
    const copy = await selectedBlock(page);
    expect(copy).not.toBe(second);
    expect(await pairsOf(page, copy)).toEqual([]);
  });
});

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

const editor = (page: Page) => page.getByTestId('morph-editor');

/** Select a block on the timeline and press the panel's "Edit pairs…". */
async function editPairsFromPanel(page: Page, actionId: string): Promise<void> {
  await blockLocator(page, actionId).click();
  await expect(page.getByTestId('block-properties')).toBeVisible();
  await page.getByTestId('block-morph-pairs').click();
  await expect(editor(page)).toBeVisible();
  await expect(page.getByTestId('morph-from-glyph-0')).toBeVisible();
}

test.describe('from the panel to the pair editor', () => {
  test('Edit pairs… opens the editor of that block; a saved pair shows in the panel and on the timeline', async ({
    page,
  }) => {
    await openDerivation(page, [morphJson('m1', 2), morphJson('m2', 5)]);
    // The editor is about the block it was opened from.
    await editPairsFromPanel(page, 'm2');
    await expect(page.getByTestId('morph-heading')).toContainText('5.00–6.00 s');
    await page.getByTestId('morph-cancel').click(); // nothing changed: it just closes
    await expect(editor(page)).toBeHidden();

    await editPairsFromPanel(page, 'm1');
    await expect(page.getByTestId('morph-heading')).toContainText('2.00–3.00 s');
    await expect(page.getByTestId('morph-summary')).toContainText('0 pairs');
    // = (row 1) → = (row 2): a source on top, then a target below.
    await page.getByTestId('morph-from-glyph-1').click();
    await page.getByTestId('morph-to-glyph-4').click();
    await expect(page.getByTestId('morph-pair-0-text')).toHaveText('= → =');
    await page.getByTestId('morph-save').click();
    await expect(editor(page)).toBeHidden();
    expect(await pairsOf(page, 'm1')).toEqual([pair(1, 4)]);
    expect(await pairsOf(page, 'm2')).toEqual([]);

    // The panel of the block (still selected) lists the pair; the timeline counts it.
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'm1' });
    await expect(page.getByTestId('block-morph-pair-0')).toContainText('= → =');
    await expect(page.getByTestId('block-morph-pairs-empty')).toHaveCount(0);
    await expect(blockLocator(page, 'm1')).toHaveText('Morph · 1');
    await expect(blockLocator(page, 'm1')).toHaveAttribute(
      'title',
      /^Morph within the formula \(1 pair\)/,
    );

    // The block's own menu opens the same editor, on the saved pair.
    await blockLocator(page, 'm1').click({ button: 'right' });
    await page.getByTestId('block-menu-pairs').click();
    await expect(editor(page)).toBeVisible();
    await expect(page.getByTestId('morph-heading')).toContainText('2.00–3.00 s');
    await expect(page.getByTestId('morph-pair-0-text')).toHaveText('= → =');
    await page.getByTestId('morph-cancel').click();
    await expect(editor(page)).toBeHidden();

    // Saving was one undo step.
    await undo(page);
    expect(await pairsOf(page, 'm1')).toEqual([]);
    await expect(blockLocator(page, 'm1')).toHaveText('Morph · 0');
    expect(await canUndo(page)).toBe(false);
  });
});

/** Click the ruler at `t` (the playhead goes there) and return the canvas. */
async function scrubTo(page: Page, t: number): Promise<string> {
  const ruler = await box(page.getByTestId('timeline-ruler'));
  await page.mouse.click(await timeToX(page, t), ruler.y + ruler.height / 2);
  expect((await uiState(page)).time).toBeCloseTo(t, 1);
  return canvasHash(page);
}

/** Press Suggest in the open editor, accept what it proposes and save. */
async function suggestAndSave(page: Page, proposed: string): Promise<void> {
  await page.getByTestId('morph-suggest').click();
  await expect(page.getByTestId('morph-suggestion')).toContainText(proposed);
  await page.getByTestId('morph-suggest-accept').click();
  await expect(page.getByTestId('morph-problems')).toHaveCount(0);
  await page.getByTestId('morph-save').click();
  await expect(editor(page)).toBeHidden();
}

test("the owner's derivation, written row by row through the UI, plays and exports", async ({
  page,
}) => {
  await openDerivation(page);

  // Row 1 → row 2 at 2 s: Add animation → Morph within the formula, then Edit pairs… → Suggest.
  const m1 = await addAnimation(page, 2, 'morph');
  await page.getByTestId('block-morph-pairs').click();
  await expect(editor(page)).toBeVisible();
  await suggestAndSave(page, '2 suggested pairs: = → = · x → x');
  expect(await pairsOf(page, m1)).toEqual([pair(1, 4), pair(2, 5)]);

  // The subscript 2 is written after it: Add animation → Write, then its glyph in the panel.
  const w2 = await addAnimation(page, 3, 'write');
  await page.getByTestId('block-glyph-6').click();
  await expect(blockLocator(page, w2)).toHaveText('Write · 1');

  // Row 2 → row 3 at 4 s, Suggest again; then the subscript 3.
  const m2 = await addAnimation(page, 4, 'morph');
  await page.getByTestId('block-morph-pairs').click();
  await expect(editor(page)).toBeVisible();
  await suggestAndSave(page, '2 suggested pairs: = → = · x → x');
  expect(await pairsOf(page, m2)).toEqual([pair(4, 7), pair(5, 8)]);
  const w3 = await addAnimation(page, 5, 'write');
  await page.getByTestId('block-glyph-9').click();
  await expect(blockLocator(page, w3)).toHaveText('Write · 1');

  // Four blocks where they were asked for, and nothing to report on any of them.
  const blocks = (await clipOf(page, 'c')).actions.map((a) => [a.id, a.kind, a.start]);
  expect(blocks).toEqual([
    [m1, 'morph', 2],
    [w2, 'appear', 3],
    [m2, 'morph', 4],
    [w3, 'appear', 5],
  ]);
  for (const id of [m1, w2, m2, w3]) {
    await blockLocator(page, id).click();
    await expect(blockLocator(page, id)).toHaveClass(/is-selected/);
    await expect(page.getByTestId('block-properties')).toBeVisible();
    await expect(page.getByTestId('block-issues')).toHaveCount(0);
  }

  // Deselect (an empty lane), so that no outline is drawn, and scrub through each morph: the
  // frame before, during and after differ.
  const lane = await box(page.getByTestId('track-lane-t2'));
  // The lane runs past the view: the last stretch of it that is in view, after the clip.
  const view = await box(page.getByTestId('timeline-scroll'));
  const right = Math.min(lane.x + lane.width, view.x + view.width);
  await page.mouse.click(right - 40, lane.y + lane.height / 2);
  expect((await uiState(page)).selection).toEqual({ kind: 'none' });
  for (const [before, during, after] of [
    [1.5, 2.5, 3],
    [4, 4.5, 5],
  ] as const) {
    const frames = [
      await scrubTo(page, before),
      await scrubTo(page, during),
      await scrubTo(page, after),
    ];
    expect(new Set(frames).size).toBe(3);
  }

  // Export: each Morph block is one play of its pairs (the timing comment names it); they are
  // copies, so ManimCE replaces a copy of each source and ManimGL transforms from a copy.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  const code = page.getByTestId('export-python-code');
  await expect(code).toContainText('from manim import *');
  for (const line of [
    ': steps morph',
    'ReplacementTransform(steps_g[1].copy(), steps_g[4])',
    'ReplacementTransform(steps_g[2].copy(), steps_g[5])',
    'self.play(Write(steps_g[6]), run_time=1)',
    'ReplacementTransform(steps_g[4].copy(), steps_g[7])',
    'ReplacementTransform(steps_g[5].copy(), steps_g[8])',
    'self.play(Write(steps_g[9]), run_time=1)',
  ]) {
    await expect(code).toContainText(line);
  }
  await expect(code).not.toContainText('TransformFromCopy');
  await page.getByTestId('export-python-close').click();
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-gl').click();
  await expect(code).toContainText('from manimlib import *');
  await expect(code).toContainText(': steps morph');
  await expect(code).toContainText('TransformFromCopy(steps_g[1], steps_g[4])');
  await expect(code).toContainText('TransformFromCopy(steps_g[5], steps_g[8])');
  await expect(code).not.toContainText('.copy()');
  await page.getByTestId('export-python-close').click();
});
