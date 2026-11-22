import { expect, test } from './test';
import {
  appearJson,
  blockLocator,
  blockOf,
  groupLocator,
  groupsOf,
  openBlockScene,
  partJson,
} from './blockHelpers';
import type { MfeWindow } from './helpers';
import { box, clipOf, uiState, undo, type ActionJson, type BlockJson } from './timelineHelpers';

/* Splitting an animation block into blocks that run at the same time on different glyphs:
 * "Split into runs" (one block per run of consecutive glyphs) and "Split…" (the chosen glyphs go
 * to a new block), from the block's menu on the timeline and from the Glyphs section of the
 * Animations panel. The pieces are one group, which the timeline draws as one block. Formula
 * `fa` (a + b = c) has five glyphs; 0–1 and 3–4 make two runs. */

const blocksOf = async (page: Parameters<typeof clipOf>[0]) => (await clipOf(page, 'a')).actions;
/** The glyphs a stored block names (the specs know their blocks are not tweens). */
const glyphsOf = (action: ActionJson | undefined) => (action as BlockJson).glyphs;

test.describe('splitting a block', () => {
  test('Split into runs: one block per run at the same time, as one group; the new one is selected; one undo step', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 2, 1.5, 'write', [0, 1, 3, 4])]);
    await blockLocator(page, 'w').click({ button: 'right' });
    await expect(page.getByTestId('block-menu-split-runs')).toBeEnabled();
    await page.getByTestId('block-menu-split-runs').click();
    const blocks = await blocksOf(page);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ id: 'w', glyphs: [0, 1], start: 2, duration: 1.5 });
    const other = blocks[1]!;
    expect(other.id).not.toBe('w');
    expect(other).toMatchObject({
      kind: 'appear',
      anim: 'write',
      glyphs: [3, 4],
      start: 2,
      duration: 1.5,
      easing: 'smooth',
    });
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: other.id });
    // The pieces are one group: the timeline draws them as one block, the selected one.
    const group = (await groupsOf(page, 'a')).w!;
    expect(group).toBeTruthy();
    expect(await groupsOf(page, 'a')).toEqual({ w: group, [other.id]: group });
    await expect(groupLocator(page, group)).toHaveText('Write ×2');
    await expect(groupLocator(page, group)).toHaveClass(/is-selected/);
    await expect(groupLocator(page, group)).toHaveAttribute('data-lane', '0');
    await expect(blockLocator(page, 'w')).toHaveCount(0);
    // Unfolded, each piece is a block.
    await page.getByTestId(`group-unfold-${group}`).click();
    await expect(blockLocator(page, 'w')).toHaveText('Write · 2');
    await expect(blockLocator(page, other.id)).toHaveText('Write · 2');
    // The new block runs alongside, on the lane under the first.
    const first = await box(blockLocator(page, 'w'));
    const second = await box(blockLocator(page, other.id));
    expect(Math.abs(second.x - first.x)).toBeLessThan(1);
    expect(Math.abs(second.width - first.width)).toBeLessThan(1);
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);
    // No conflict: the pieces animate different glyphs.
    await expect(blockLocator(page, 'w')).not.toHaveClass(/has-error/);
    await expect(blockLocator(page, other.id)).not.toHaveClass(/has-error/);
    await undo(page);
    expect(await blocksOf(page)).toHaveLength(1);
    expect(glyphsOf(await blockOf(page, 'a', 'w'))).toEqual([0, 1, 3, 4]);
  });

  test('a block of every glyph splits the glyphs it animates where it is', async ({ page }) => {
    // Glyph 2 waits for the first Write and is on screen when the second starts: that one, of
    // every glyph, animates 0, 1, 3 and 4 — two runs.
    await openBlockScene(page, [
      appearJson('two', 0.5, 1, 'write', [2]),
      appearJson('w', 2, 1.5, 'write', 'all'),
    ]);
    await blockLocator(page, 'w').click({ button: 'right' });
    await page.getByTestId('block-menu-split-runs').click();
    const blocks = await blocksOf(page);
    expect(blocks).toHaveLength(3);
    expect(glyphsOf(blocks.find((b) => b.id === 'w'))).toEqual([0, 1]);
    expect(glyphsOf(blocks.find((b) => !['two', 'w'].includes(b.id)))).toEqual([3, 4]);
  });

  test('the items are disabled for a single run, a single glyph, and absent for a tween', async ({
    page,
  }) => {
    await openBlockScene(page, [
      appearJson('run', 1, 1, 'write', [2, 3, 4]),
      appearJson('one', 3, 1, 'create', [0]),
    ]);
    await blockLocator(page, 'run').click({ button: 'right' });
    await expect(page.getByTestId('block-menu-split-runs')).toBeDisabled();
    await expect(page.getByTestId('block-menu-split')).toBeEnabled();
    await page.keyboard.press('Escape');
    await blockLocator(page, 'one').click({ button: 'right' });
    await expect(page.getByTestId('block-menu-split-runs')).toBeDisabled();
    await expect(page.getByTestId('block-menu-split')).toBeDisabled();
    await page.keyboard.press('Escape');
    // The panel's buttons agree.
    await blockLocator(page, 'run').click();
    await expect(page.getByTestId('block-split-runs')).toBeDisabled();
    await expect(page.getByTestId('block-split')).toBeEnabled();
  });

  test('Split…: the chosen glyphs go to a new block; glyphs the block does not animate cannot be chosen', async ({
    page,
  }) => {
    await openBlockScene(page, [partJson('p', 2, 1, [0, 1, 3, 4], { rotation: 30 })]);
    await blockLocator(page, 'p').click();
    await page.getByTestId('block-split').click();
    const dialog = page.getByTestId('split-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Split Transform · 4');
    await expect(page.getByTestId('split-confirm')).toBeDisabled();
    await expect(page.getByTestId('split-summary')).toContainText('this one animates 4');
    // Glyph 2 is not the block's: faint, and a click on it changes nothing.
    await expect(page.getByTestId('split-glyph-2')).toHaveAttribute('data-dimmed', 'true');
    await page.getByTestId('split-glyph-2').click();
    await expect(page.getByTestId('split-confirm')).toBeDisabled();
    await page.getByTestId('split-glyph-3').click();
    await page.getByTestId('split-glyph-4').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('split-summary')).toHaveText(
      '2 of 4 glyphs go to the new block: 3, 4.',
    );
    // Choosing every glyph leaves nothing in the block.
    await page.getByTestId('split-glyph-chip-0').click();
    await page.getByTestId('split-glyph-chip-1').click();
    await expect(page.getByTestId('split-summary')).toHaveText(
      'Leave at least one glyph in this block.',
    );
    await expect(page.getByTestId('split-confirm')).toBeDisabled();
    await page.getByTestId('split-glyph-chip-0').click();
    await page.getByTestId('split-glyph-chip-1').click();
    await page.getByTestId('split-confirm').click();
    await expect(dialog).toBeHidden();
    const blocks = await blocksOf(page);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ id: 'p', kind: 'transform', glyphs: [0, 1], rotation: 30 });
    expect(blocks[1]).toMatchObject({ kind: 'transform', glyphs: [3, 4], start: 2, rotation: 30 });
    expect((await uiState(page)).selection).toMatchObject({ actionId: blocks[1]!.id });
    await undo(page);
    expect(await blocksOf(page)).toHaveLength(1);
  });

  test('Split… into several blocks at once: each choice set aside is a block of the group', async ({
    page,
  }) => {
    await openBlockScene(page, [partJson('p', 2, 1, [0, 1, 2, 3, 4], { rotation: 30 })]);
    await blockLocator(page, 'p').click({ button: 'right' });
    await page.getByTestId('block-menu-split').click();
    const add = page.getByTestId('split-add-part');
    const summary = page.getByTestId('split-summary');
    // Nothing chosen: nothing to set aside.
    await expect(add).toBeDisabled();
    await page.getByTestId('split-glyph-0').click();
    await expect(add).toBeEnabled();
    await add.click();
    // The glyph is tinted as the block it goes to, which is listed; the choice starts again.
    await expect(page.getByTestId('split-part-0')).toHaveText('New block 1: 0×');
    await expect(page.getByTestId('split-glyph-0')).toHaveAttribute('data-mark', '0');
    await expect(page.getByTestId('split-glyph-0')).toHaveAttribute('data-selected', 'false');
    await expect(add).toBeDisabled();
    await expect(summary).toHaveText('2 blocks: this one keeps 1, 2, 3 and 4; 0 go to new blocks.');
    await expect(page.getByTestId('split-confirm')).toBeEnabled();
    await page.getByTestId('split-glyph-3').click();
    await page.getByTestId('split-glyph-4').click({ modifiers: ['Shift'] });
    await add.click();
    await expect(page.getByTestId('split-part-1')).toHaveText('New block 2: 3, 4×');
    await expect(page.getByTestId('split-glyph-4')).toHaveAttribute('data-mark', '1');
    // What is chosen and not yet set aside counts as one more block.
    await page.getByTestId('split-glyph-2').click();
    await expect(summary).toHaveText('4 blocks: this one keeps 1; 0 · 3, 4 · 2 go to new blocks.');
    // A glyph chosen again leaves the block it was set aside for.
    await page.getByTestId('split-glyph-4').click({ modifiers: ['ControlOrMeta'] });
    await expect(summary).toHaveText('4 blocks: this one keeps 1; 0 · 3 · 2, 4 go to new blocks.');
    await page.getByTestId('split-glyph-4').click({ modifiers: ['ControlOrMeta'] });
    // A block set aside is given back with its cross.
    await page.getByTestId('split-part-0-remove').click();
    await expect(page.getByTestId('split-part-0')).toHaveText('New block 1: 3, 4×');
    await expect(page.getByTestId('split-part-1')).toHaveCount(0);
    await expect(page.getByTestId('split-glyph-0')).not.toHaveAttribute('data-mark');
    await expect(summary).toHaveText(
      '3 blocks: this one keeps 0 and 1; 3, 4 · 2 go to new blocks.',
    );
    await page.getByTestId('split-confirm').click();
    await expect(page.getByTestId('split-dialog')).toBeHidden();

    // Three blocks at the block's time, each with its glyphs and the block's settings…
    const blocks = await blocksOf(page);
    expect(blocks.map(glyphsOf)).toEqual([[0, 1], [3, 4], [2]]);
    expect(blocks[0]!.id).toBe('p');
    for (const block of blocks) {
      expect(block).toMatchObject({ kind: 'transform', start: 2, duration: 1, rotation: 30 });
    }
    // …in one group, which the timeline draws as one block; the first new one is selected.
    const groups = await groupsOf(page, 'a');
    const group = groups.p!;
    expect(group).toBeTruthy();
    expect(Object.values(groups)).toEqual([group, group, group]);
    await expect(groupLocator(page, group)).toHaveText('Transform ×3');
    expect((await uiState(page)).selection).toMatchObject({ actionId: blocks[1]!.id });
    // One step.
    await undo(page);
    expect(await blocksOf(page)).toHaveLength(1);
    expect(glyphsOf(await blockOf(page, 'a', 'p'))).toEqual([0, 1, 2, 3, 4]);
    expect(await groupsOf(page, 'a')).toEqual({ p: null });
  });

  test('Split…: when the blocks set aside take every glyph, the first of them stays in the block', async ({
    page,
  }) => {
    await openBlockScene(page, [partJson('p', 2, 1, [0, 1, 3])]);
    await blockLocator(page, 'p').click({ button: 'right' });
    await page.getByTestId('block-menu-split').click();
    await page.getByTestId('split-glyph-3').click();
    await page.getByTestId('split-add-part').click();
    await page.getByTestId('split-glyph-0').click();
    await page.getByTestId('split-glyph-1').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('split-summary')).toHaveText(
      '2 blocks: 3 stay in this one; 0, 1 go to new blocks.',
    );
    await page.getByTestId('split-add-part').click();
    // Every glyph is set aside: two blocks still, nothing else to choose.
    await expect(page.getByTestId('split-confirm')).toBeEnabled();
    await page.getByTestId('split-confirm').click();
    const blocks = await blocksOf(page);
    expect(blocks.map((b) => [b.id === 'p', glyphsOf(b)])).toEqual([
      [true, [3]],
      [false, [0, 1]],
    ]);
  });

  test('Split… from the menu; Escape keeps the block; the dialog closes when the block goes', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 2, 1.5, 'write', [0, 1, 3, 4])]);
    await blockLocator(page, 'w').click({ button: 'right' });
    await page.getByTestId('block-menu-split').click();
    await expect(page.getByTestId('split-dialog')).toBeVisible();
    await page.getByTestId('split-glyph-0').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('split-dialog')).toBeHidden();
    expect(await blocksOf(page)).toHaveLength(1);
    // The block is deleted under the open dialog: nothing is left to split.
    await blockLocator(page, 'w').click({ button: 'right' });
    await page.getByTestId('block-menu-split').click();
    await expect(page.getByTestId('split-dialog')).toBeVisible();
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.clips.find((c) => c.id === 'a')!.actions = [];
      });
    });
    await expect(page.getByTestId('split-dialog')).toBeHidden();
  });

  test('Split…: the dialog is resized from its corner and maximized; the glyph view takes the room', async ({
    page,
  }) => {
    // A window of 1500 × 950 (`openRelationScene`).
    await openBlockScene(page, [partJson('p', 2, 1, [0, 1, 3, 4])]);
    const openSplit = async () => {
      await blockLocator(page, 'p').click({ button: 'right' });
      await page.getByTestId('block-menu-split').click();
      await expect(page.getByTestId('split-dialog')).toBeVisible();
    };
    await openSplit();
    const dialog = page.getByTestId('split-dialog');
    const view = dialog.locator('svg.split-glyph-svg');
    const size = async (locator: typeof dialog) => {
      const at = (await locator.boundingBox())!;
      return { width: Math.round(at.width), height: Math.round(at.height) };
    };
    /** What is left of the body under the last line (the summary): the room nothing took. */
    const leftUnder = async () => {
      const body = (await dialog.locator('.modal-body').boundingBox())!;
      const summary = (await page.getByTestId('split-summary').boundingBox())!;
      return Math.round(body.y + body.height - (summary.y + summary.height));
    };
    const first = await size(dialog);
    const firstView = await size(view);
    const firstLeft = await leftUnder();
    expect(first.width).toBe(560);
    expect(firstView.height).toBe(200);

    // The corner: the dialog stays centred, so it grows by twice what the corner moves…
    const grip = (await page.getByTestId('split-dialog-resize').boundingBox())!;
    await page.mouse.move(grip.x + 8, grip.y + 8);
    await page.mouse.down();
    await page.mouse.move(grip.x + 68, grip.y + 158, { steps: 4 });
    await page.mouse.up();
    await expect(dialog).toHaveClass(/is-sized/);
    const resized = await size(dialog);
    expect(resized).toEqual({ width: first.width + 120, height: first.height + 300 });
    // …and the glyph view takes all of it: as much wider, at least as much taller (the words
    // above it take fewer lines on a wider dialog), and nothing is left empty under the summary.
    const resizedView = await size(view);
    expect(resizedView.width).toBe(firstView.width + 120);
    expect(resizedView.height).toBeGreaterThanOrEqual(firstView.height + 300);
    expect(await leftUnder()).toBe(firstLeft);
    // The glyphs are still picked in it.
    await page.getByTestId('split-glyph-3').click();
    await expect(page.getByTestId('split-summary')).toHaveText(
      '1 of 4 glyphs go to the new block: 3.',
    );

    // Maximized: the whole window but its margin, the glyph view as wide as the dialog lets it.
    await page.getByTestId('split-dialog-maximize').click();
    await expect(dialog).toHaveClass(/is-maximized/);
    const maximized = await size(dialog);
    expect(maximized).toEqual({ width: 1500 - 16, height: 950 - 16 });
    const maximizedView = await size(view);
    expect(maximizedView.width).toBe(firstView.width + maximized.width - first.width);
    expect(maximizedView.height).toBeGreaterThan(resizedView.height);
    expect(await leftUnder()).toBe(firstLeft);
    // Restored, it is as it was resized.
    await page.getByTestId('split-dialog-maximize').click();
    await expect(dialog).not.toHaveClass(/is-maximized/);
    expect(await size(dialog)).toEqual(resized);

    // Closed and opened again in the same tab, it keeps that size; a double click on the corner
    // gives it back the one it has when nothing was chosen.
    await page.getByTestId('split-cancel').click();
    await expect(dialog).toBeHidden();
    await openSplit();
    expect(await size(dialog)).toEqual(resized);
    expect(await size(view)).toEqual(resizedView);
    await page.getByTestId('split-dialog-resize').dblclick();
    await expect(dialog).not.toHaveClass(/is-sized/);
    expect(await size(dialog)).toEqual(first);
    expect(await size(view)).toEqual(firstView);
  });

  test('a locked track keeps its blocks whole', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 2, 1.5, 'write', [0, 1, 3, 4])]);
    await blockLocator(page, 'w').click();
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.tracks.find((t) => t.id === 't1')!.locked = true;
      });
    });
    await expect(page.getByTestId('block-split-runs')).toBeDisabled();
    await expect(page.getByTestId('block-split')).toBeDisabled();
  });
});
