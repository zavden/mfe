import type { Page } from '@playwright/test';
import { expect, test } from './test';
import type { MfeWindow } from './helpers';
import { appearJson } from './blockHelpers';
import {
  box,
  clipJson,
  clipOf,
  moveClip,
  openTimeline,
  project,
  setTime,
  uiState,
  undo,
} from './timelineHelpers';

/* Split at playhead (D169): S, or «Split at playhead (S)» in a clip's menu, cuts the clips under
 * the playhead in two; the second half is a clip of a copy of the formula. a [0, 8] of "alpha" is
 * on track 1 and b [2, 6] of "beta" on track 2, each with one second of intro and of outro. */
const A = clipJson('a', 'fa', 't1', 0, 8);
const B = clipJson('b', 'fb', 't2', 2, 6);

const body = { position: { x: 30, y: 8 } };
const frame = (page: Page) => page.getByTestId('preview-frame');
const drawn = (page: Page) => frame(page).evaluate((el) => Number(el.dataset.drawableCount));

/** Every formula has its render: the split compares what the scene draws before and after. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const { entries } = mfe.useRenderStore.getState();
    return mfe.useProjectStore
      .getState()
      .project.formulas.every((f) => entries[f.id]?.status === 'ok');
  });
}

async function open(page: Page): Promise<void> {
  await openTimeline(page, [A, B]);
  await settled(page);
}

const names = async (page: Page) =>
  page.evaluate(() =>
    (window as MfeWindow).__mfe!.useProjectStore.getState().project.formulas.map((f) => f.name),
  );

test.describe('timeline: split at playhead', () => {
  test('S cuts the selected clip in two at the playhead; one undo takes it back', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('clip-a').click(body);
    await setTime(page, 4);
    const before = await drawn(page);
    const whole = await box(page.getByTestId('clip-a'));
    await page.keyboard.press('s');

    const clips = (await project(page)).clips;
    expect(clips.map((c) => [c.trackId, c.start, c.end])).toEqual([
      ['t1', 0, 4],
      ['t1', 4, 8],
      ['t2', 2, 6],
    ]);
    const [left, right] = clips;
    expect(left!.id).toBe('a');
    // The intro stays with the first half and the outro goes with the second.
    expect([left!.intro.kind, left!.outro.kind]).toEqual(['write', 'none']);
    expect([right!.intro.kind, right!.outro.kind]).toEqual(['none', 'fade_out']);
    // The second half is a clip of a copy of the formula, listed after it.
    expect(await names(page)).toEqual(['alpha', 'alpha_s', 'beta']);
    await expect(page.getByTestId('formula-list')).toContainText('alpha_s');
    // The halves are selected, and the scene draws what it drew.
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a', right!.id] });
    expect(await drawn(page)).toBe(before);
    const half = await box(page.getByTestId('clip-a'));
    expect(half.width).toBeCloseTo(whole.width / 2, 0);
    await expect(page.getByTestId('notice')).toHaveCount(0);

    await undo(page);
    expect((await project(page)).clips).toHaveLength(2);
    expect(await names(page)).toEqual(['alpha', 'beta']);
  });

  test('the menu of a clip splits it, and says why it cannot', async ({ page }) => {
    await open(page);
    await setTime(page, 7);
    // The playhead is outside b: nothing to split there.
    await page.getByTestId('clip-b').click({ ...body, button: 'right' });
    const entry = page.getByTestId('clip-menu-split');
    await expect(entry).toHaveText('Split at playhead (S)');
    await expect(entry).toBeDisabled();
    await expect(entry).toHaveAttribute(
      'title',
      'Place the playhead inside the clip to split it there.',
    );
    await page.keyboard.press('Escape');

    await setTime(page, 4);
    await page.getByTestId('clip-b').click({ ...body, button: 'right' });
    await expect(entry).toBeEnabled();
    await expect(entry).toHaveAttribute('title', /a copy of “beta”, “beta_s”/);
    await entry.click();
    expect((await project(page)).clips.map((c) => [c.start, c.end])).toEqual([
      [0, 8],
      [2, 4],
      [4, 6],
    ]);
    expect(await names(page)).toEqual(['alpha', 'beta', 'beta_s']);
  });

  test('the menu of the selected clips splits those under the playhead', async ({ page }) => {
    await open(page);
    await page.getByTestId('clip-a').click(body);
    await page.getByTestId('clip-b').click({ ...body, modifiers: ['ControlOrMeta'] });
    await setTime(page, 4);
    await page.getByTestId('clip-b').click({ ...body, button: 'right' });
    const entry = page.getByTestId('clips-menu-split');
    await expect(entry).toHaveAttribute('title', /^Cuts the 2 clips under the playhead in two/);
    await entry.click();
    expect((await project(page)).clips).toHaveLength(4);
    expect(await names(page)).toEqual(['alpha', 'alpha_s', 'beta', 'beta_s']);
    await undo(page);
    expect((await project(page)).clips).toHaveLength(2);
  });

  test('what crosses the playhead keeps the clip whole, and a notice says what', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('clip-a').click(body);
    await setTime(page, 0.5);
    await page.keyboard.press('s');
    await expect(page.getByTestId('notice')).toContainText('“alpha” was not split');
    await expect(page.getByTestId('notice')).toContainText('intro (Write) is still running');
    expect((await project(page)).clips).toHaveLength(2);
  });

  test('glyphs that only come after the playhead stay out of the first half, until the Intro section brings them back', async ({
    page,
  }) => {
    // Glyphs 3 and 4 of a wait for a block at 5 s: the playhead, at 4 s, is before it.
    const late = appearJson('late', 5, 1, 'fade_in', [3, 4]);
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 8, { actions: [late] }), B]);
    await settled(page);
    await page.getByTestId('clip-a').click(body);
    await setTime(page, 4);
    const before = await drawn(page);
    await page.keyboard.press('s');
    await expect(page.getByTestId('notice')).toHaveCount(0);

    const [left, right] = (await project(page)).clips;
    expect([left!.start, left!.end, right!.start, right!.end]).toEqual([0, 4, 4, 8]);
    // The first half leaves them out itself; the second is a clip of a copy that hides them,
    // with the block that brings them.
    expect(left!.startHidden).toEqual([3, 4]);
    expect(right!.startHidden).toBeUndefined();
    expect(right!.actions[0]).toMatchObject({ id: 'late', kind: 'appear', start: 1 });
    expect(await drawn(page)).toBe(before);

    // The Intro section of the first half says so, and brings them back.
    await page.getByTestId('clip-a').click(body);
    await page.getByTestId('animations-tab-timing').click();
    const line = page.getByTestId('clip-start-hidden');
    await expect(line).toContainText('2 glyphs stay out of the intro');
    await setTime(page, 1.5);
    await expect.poll(() => drawn(page)).toBe(3);
    await page.getByTestId('clip-start-hidden-clear').click();
    await expect(line).toHaveCount(0);
    expect((await clipOf(page, 'a')).startHidden).toBeUndefined();
    await expect.poll(() => drawn(page)).toBe(5);

    await undo(page);
    await expect(line).toContainText('2 glyphs stay out of the intro');
    await expect.poll(() => drawn(page)).toBe(3);
  });

  test('with the keyboard in the Preview, S stays the circle selector', async ({ page }) => {
    await open(page);
    await setTime(page, 4);
    // A click on the formula in the scene selects its clip and gives the frame the keys.
    const scene = await box(frame(page));
    await page.mouse.click(scene.x + scene.width / 2, scene.y + scene.height / 2);
    expect((await uiState(page)).selection.kind).toBe('clips');
    await page.keyboard.press('s');
    await expect(frame(page)).toHaveAttribute('data-selector', 'circle');
    expect((await project(page)).clips).toHaveLength(2);
    await page.keyboard.press('s');
    await expect(frame(page)).toHaveAttribute('data-selector', 'pointer');

    // On the timeline the same key splits.
    await page.getByTestId('clip-a').click(body);
    await page.keyboard.press('s');
    expect((await project(page)).clips).toHaveLength(3);
    await expect(frame(page)).toHaveAttribute('data-selector', 'pointer');
  });

  // A command pressed during a drag gives the drag up and does what it does with no drag held
  // (11b, Owned gestures): S decides with the project as it was before the drag (audit A6-03).
  test('S during a move of the selected clip gives the move up and splits the clip where it was', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('clip-b').click(body);
    await setTime(page, 4);
    // b dragged 3 s to the right (2–6 s → 5–9 s), held: the playhead (4 s) is no longer inside it.
    await moveClip(page, 'b', 3, { release: false });
    await expect.poll(async () => (await clipOf(page, 'b')).start).toBeGreaterThan(4);
    await page.keyboard.press('s');
    await page.mouse.up();

    // The move was given up, and b was cut at 4 s where it was.
    const clips = (await project(page)).clips.filter((c) => c.trackId === 't2');
    expect(clips.map((c) => [c.start, c.end])).toEqual([
      [2, 4],
      [4, 6],
    ]);
    await expect(frame(page)).toHaveAttribute('data-selector', 'pointer');
    // One undo takes the split back, and b is where it was before the drag.
    await undo(page);
    expect((await project(page)).clips.map((c) => [c.id, c.start, c.end])).toEqual([
      ['a', 0, 8],
      ['b', 2, 6],
    ]);
  });

  test('S during a move of a clip onto the playhead switches the circle selector, as with no drag', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('clip-b').click(body);
    // The playhead after b: with no drag, S is the circle selector's.
    await setTime(page, 7);
    // b dragged 2 s to the right (2–6 s → 4–8 s), held: the playhead is inside it now.
    await moveClip(page, 'b', 2, { release: false });
    await expect.poll(async () => (await clipOf(page, 'b')).end).toBeGreaterThan(7);
    await page.keyboard.press('s');
    await expect(frame(page)).toHaveAttribute('data-selector', 'circle');
    await page.mouse.up();
    // Nothing was split, and the drag went on to its end.
    expect((await project(page)).clips.map((c) => [c.id, c.start, c.end])).toEqual([
      ['a', 0, 8],
      ['b', 4, 8],
    ]);
  });
});
