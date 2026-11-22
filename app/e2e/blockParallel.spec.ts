import { expect, test } from './test';
import {
  appearJson,
  blockLocator,
  blockOf,
  disappearJson,
  dragBlock,
  emphasisJson,
  groupLocator,
  groupsOf,
  openBlockScene,
  partJson,
  pickAnimation,
  PX_PER_SECOND,
} from './blockHelpers';
import { type MfeWindow } from './helpers';
import { box, clipOf, setTime, timeToX, uiState } from './timelineHelpers';

/* Dragging a block over another one: the dragged block takes the top lane (and keeps it), a
 * readout under it gives its time and what it runs in parallel with, and when the planner holds
 * it back the readout says why and the block is marked. Formula `fa` (a + b = c): glyphs 0 a,
 * 1 +, 2 b, 3 =, 4 c. */

test.describe('dragging a block in parallel', () => {
  test('the dragged block takes the top lane during the drag and keeps it; the readout names what it runs with', async ({
    page,
  }) => {
    await openBlockScene(page, [
      appearJson('w', 1, 2, 'write', [3]),
      disappearJson('fo', 4, 2, 'fade_out', [0]),
    ]);
    await expect(blockLocator(page, 'w')).toHaveAttribute('data-lane', '0');
    await expect(blockLocator(page, 'fo')).toHaveAttribute('data-lane', '0');
    // Drag FadeOut left over the Write (other glyphs: allowed) and hold.
    await dragBlock(page, 'fo', -2.5, { shift: true, release: false });
    const readout = page.getByTestId('block-drag-readout');
    await expect(readout).toBeVisible();
    await expect(page.getByTestId('block-drag-time')).toHaveText('1.50 → 3.50 s · 2.00 s');
    await expect(page.getByTestId('block-drag-parallel')).toHaveText('in parallel with Write · 3');
    await expect(page.getByTestId('block-drag-stop')).toHaveCount(0);
    await expect(blockLocator(page, 'fo')).toHaveAttribute('data-lane', '0');
    await expect(blockLocator(page, 'w')).toHaveAttribute('data-lane', '1');
    // The readout sits just under the dragged block's lane, at its start.
    const block = await box(blockLocator(page, 'fo'));
    const tip = await box(readout);
    expect(Math.abs(tip.x - block.x)).toBeLessThan(2);
    expect(tip.y).toBeGreaterThan(block.y + block.height - 1);
    await page.mouse.up();
    await expect(readout).toHaveCount(0);
    expect((await blockOf(page, 'a', 'fo')).start).toBeCloseTo(1.5, 6);
    // Dropped, it stays on top; dragging the other one brings that one up instead.
    await expect(blockLocator(page, 'fo')).toHaveAttribute('data-lane', '0');
    await expect(blockLocator(page, 'w')).toHaveAttribute('data-lane', '1');
    await dragBlock(page, 'w', 0.3, { shift: true });
    await expect(blockLocator(page, 'w')).toHaveAttribute('data-lane', '0');
    await expect(blockLocator(page, 'fo')).toHaveAttribute('data-lane', '1');
  });

  test('held back by the planner, the readout says why and the block is marked; Shift does not skip it', async ({
    page,
  }) => {
    await openBlockScene(page, [
      appearJson('w', 2, 1, 'write', [3]),
      disappearJson('fo', 6, 1, 'fade_out', [3]),
    ]);
    const b = await box(blockLocator(page, 'w'));
    const y = b.y + b.height / 2;
    const x0 = b.x + b.width / 2;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    // Two seconds right: free. The Write ends at 5, before the FadeOut of the same glyph.
    await page.mouse.move(x0 + 2 * PX_PER_SECOND, y, { steps: 5 });
    await expect(page.getByTestId('block-drag-stop')).toHaveCount(0);
    await expect(blockLocator(page, 'w')).not.toHaveClass(/is-stopped/);
    // Five seconds right: the block would run with the FadeOut; it stops at 5 and says so.
    await page.mouse.move(x0 + 5 * PX_PER_SECOND, y, { steps: 5 });
    await expect(page.getByTestId('block-drag-stop')).toHaveText(
      'Stops here: The FadeOut block at 6.00 s animates glyph 3 “=” at the same time.',
    );
    await expect(page.getByTestId('block-drag-time')).toHaveText('5.00 → 6.00 s · 1.00 s');
    await expect(blockLocator(page, 'w')).toHaveClass(/is-stopped/);
    await expect(page.getByTestId('block-drag-readout')).toHaveClass(/is-stopped/);
    // Back where it fits: the reason goes.
    await page.mouse.move(x0 + 1 * PX_PER_SECOND, y, { steps: 5 });
    await expect(page.getByTestId('block-drag-stop')).toHaveCount(0);
    await expect(blockLocator(page, 'w')).not.toHaveClass(/is-stopped/);
    await page.keyboard.up('Shift');
    await page.mouse.up();
    expect((await blockOf(page, 'a', 'w')).start).toBeCloseTo(3, 6);
    await expect(page.getByTestId('block-drag-readout')).toHaveCount(0);
  });

  test('an edge drag has the readout too, and stops at the clip', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 8, 1, 'write', [3])]);
    await dragBlock(page, 'w', 3, { edge: 'end', shift: true, release: false });
    await expect(page.getByTestId('block-drag-time')).toHaveText('8.00 → 10.00 s · 2.00 s');
    await expect(page.getByTestId('block-drag-stop')).toHaveText(
      'Stops here: A block stays inside its clip.',
    );
    await page.mouse.up();
    expect((await blockOf(page, 'a', 'w')).duration).toBeCloseTo(2, 6);
  });
});

test.describe('new blocks alongside others', () => {
  test('an Appear added where another runs names the glyphs left for it, not every glyph', async ({
    page,
  }) => {
    // Glyphs 3 and 4 are hidden; a Write brings 3 over [2, 4). A Create added at 3 s runs with it
    // and brings 4 — stored as [4], so moving either block later changes nothing. The clip's menu
    // adds at the playhead (D171).
    await openBlockScene(page, [appearJson('w', 2, 2, 'write', [3])], { hidden: [3, 4] });
    await setTime(page, 3);
    const clip = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 3), clip.y + clip.height - 6, { button: 'right' });
    await pickAnimation(page, 'create');
    const blocks = (await clipOf(page, 'a')).actions;
    expect(blocks).toHaveLength(2);
    const added = blocks.find((b) => b.id !== 'w')!;
    expect(added).toMatchObject({ kind: 'appear', anim: 'create', glyphs: [4] });
    expect(added.start).toBeCloseTo(3, 6);
    await expect(blockLocator(page, added.id)).toHaveAttribute('data-lane', '1');
    await expect(page.getByTestId('notice')).toHaveCount(0);
  });

  test('says so when nothing is left for the new block alongside', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 2, 2, 'write', [3, 4])], { hidden: [3, 4] });
    await setTime(page, 3);
    const clip = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 3), clip.y + clip.height - 6, { button: 'right' });
    await pickAnimation(page, 'create');
    const added = (await clipOf(page, 'a')).actions.find((b) => b.id !== 'w')!;
    expect(added).toMatchObject({ kind: 'appear', glyphs: 'all' });
    await expect(page.getByTestId('notice')).toContainText('Nothing left to animate alongside');
    await expect(page.getByTestId('notice')).toContainText('the Write block at 2.00 s');
  });

  test('an Appear added alongside leaves out a glyph a relation consumed: no error from the start', async ({
    page,
  }) => {
    // A relation turns the "+" of f1 into the "+" of f2 over [3, 4); a Circumscribe of every
    // glyph of f1 runs over [5, 6). A Write added at 5.5 s has nothing left to bring there: the
    // "+" cannot come back (audit A8-02).
    const relation = {
      id: 'r',
      fromClipId: 'a',
      toClipId: 'b',
      offset: 1,
      duration: 1,
      easing: 'smooth',
      style: 'transform',
      pathArc: 0,
      pairs: [{ from: [1], to: [3], style: null }],
    };
    await openBlockScene(page, [emphasisJson('ring', 5, 1, 'circumscribe')], {
      extra: { relations: [relation] },
    });
    await setTime(page, 5.5);
    const clip = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 5.5), clip.y + clip.height - 6, {
      button: 'right',
    });
    await pickAnimation(page, 'write');
    const added = (await clipOf(page, 'a')).actions.find((b) => b.id !== 'ring')!;
    expect(added).toMatchObject({ kind: 'appear', anim: 'write', glyphs: 'all' });
    await expect(page.getByTestId('notice')).toContainText('Nothing left to animate alongside');
    const errors = await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      const text = JSON.stringify(mfe.useProjectStore.getState().project);
      const parsed = mfe.parseProject(text) as unknown as {
        issues: { severity: string; code: string }[];
      };
      return parsed.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code);
    });
    expect(errors).toEqual([]);
  });

  test('Duplicate for the other glyphs puts a copy alongside; disabled when nothing is left', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 2, 2, 'write', [3])], { hidden: [3, 4] });
    await blockLocator(page, 'w').click({ button: 'right' });
    await expect(page.getByTestId('block-menu-duplicate-others')).toBeEnabled();
    await page.getByTestId('block-menu-duplicate-others').click();
    const blocks = (await clipOf(page, 'a')).actions;
    expect(blocks).toHaveLength(2);
    const copy = blocks.find((b) => b.id !== 'w')!;
    expect(copy).toMatchObject({
      kind: 'appear',
      anim: 'write',
      glyphs: [4],
      start: 2,
      duration: 2,
    });
    expect((await uiState(page)).selection).toMatchObject({ actionId: copy.id });
    // Alongside, the copy is a piece of the block, as after a split: the two are one group, and
    // one block on the timeline until it is unfolded.
    const group = (await groupsOf(page, 'a')).w!;
    expect(group).toBeTruthy();
    expect((await groupsOf(page, 'a'))[copy.id]).toBe(group);
    await expect(groupLocator(page, group)).toHaveText('Write ×2');
    await page.getByTestId(`group-unfold-${group}`).click();
    await expect(blockLocator(page, copy.id)).toHaveAttribute('data-lane', '1');
    // Glyph 3 is brought by the original at the same time: nothing is left for a third block.
    await blockLocator(page, copy.id).click({ button: 'right' });
    await expect(page.getByTestId('block-menu-duplicate-others')).toBeDisabled();
    await page.keyboard.press('Escape');
    // The panel offers the same.
    await blockLocator(page, copy.id).click();
    await expect(page.getByTestId('block-duplicate-others')).toBeDisabled();
    await blockLocator(page, 'w').click();
    await expect(page.getByTestId('block-duplicate-others')).toBeDisabled();
  });

  test('a part Transform is duplicated for every other glyph; a busy glyph moves the copy', async ({
    page,
  }) => {
    await openBlockScene(page, [partJson('p', 2, 1, [1], { shift: [1, 0] })]);
    await blockLocator(page, 'p').click();
    await page.getByTestId('block-duplicate-others').click();
    const copy = (await clipOf(page, 'a')).actions.find((b) => b.id !== 'p')!;
    expect(copy).toMatchObject({ kind: 'transform', glyphs: [0, 2, 3, 4], start: 2 });
    expect((copy as unknown as { shift: number[] }).shift).toEqual([1, 0]);
  });
});
