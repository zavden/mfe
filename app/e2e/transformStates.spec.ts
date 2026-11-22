/* The start and end icons of a selected tween block: the start icon shows where the tween starts,
 * the end icon where it ends and lets the preview edit that end state (with the start state drawn
 * faintly beneath). */
import { expect, test, type Page } from './test';
import {
  appearJson,
  blockLocator,
  blockOf,
  disappearJson,
  openBlockScene,
  partJson,
  tweenJson,
} from './blockHelpers';
import { clipOf, uiState } from './timelineHelpers';
import { distance, handlePoints, pagePoint, screenAngle, setTime } from './uxHelpers';

const ghostCount = async (page: Page) =>
  Number(await page.getByTestId('preview-frame').getAttribute('data-ghost-count'));

async function openTween(page: Page): Promise<void> {
  // Clip `a` is 0–10 s; the tween moves it from the centre to (2, 1.5) during [2, 3).
  await openBlockScene(page, [
    tweenJson('tw', 2, 1, { position: [2, 1.5] }),
    appearJson('w', 5, 1, 'write', [3]),
  ]);
  await blockLocator(page, 'tw').click();
}

test.describe('transform blocks: start and end states', () => {
  test('a selected tween shows its two icons on its top corners; other blocks do not', async ({
    page,
  }) => {
    await openTween(page);
    const block = (await blockLocator(page, 'tw').boundingBox())!;
    const start = (await page.getByTestId('block-start-state-tw').boundingBox())!;
    const end = (await page.getByTestId('block-end-state-tw').boundingBox())!;
    expect(Math.abs(start.x + start.width / 2 - block.x)).toBeLessThan(2);
    expect(Math.abs(end.x + end.width / 2 - (block.x + block.width))).toBeLessThan(2);
    expect(Math.abs(start.y + start.height / 2 - block.y)).toBeLessThan(3);

    await blockLocator(page, 'w').click();
    await expect(page.getByTestId('block-state-icons')).toHaveCount(0);
  });

  test('the start icon shows the start; the end icon edits the end state, then lets go', async ({
    page,
  }) => {
    await openTween(page);
    await page.getByTestId('block-start-state-tw').click();
    expect((await uiState(page)).time).toBeCloseTo(2, 6);
    expect(await ghostCount(page)).toBe(0);
    await expect(page.getByTestId('preview-hint')).toHaveCount(0);

    await page.getByTestId('block-end-state-tw').click();
    expect((await uiState(page)).time).toBeCloseTo(3, 6);
    await expect(page.getByTestId('block-end-state-tw')).toHaveAttribute('aria-pressed', 'true');
    // The start state is drawn faintly under the end state, and the handles show without Shift.
    await expect.poll(() => ghostCount(page)).toBeGreaterThan(0);
    await expect(page.getByTestId('preview-hint')).toContainText('End state of the tween');

    // Dragging the formula moves the tween's target; the initial state stays.
    const h = (await handlePoints(page))!;
    const from = await pagePoint(page, h.center);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y, { steps: 3 });
    await page.mouse.move(from.x + 60, from.y, { steps: 3 });
    await page.mouse.up();
    const tween = (await blockOf(page, 'a', 'tw')) as unknown as { to: { position: number[] } };
    expect(tween.to.position[0]).toBeGreaterThan(2.2);
    expect(tween.to.position[1]).toBeCloseTo(1.5, 6);
    expect((await clipOf(page, 'a')).initial.position).toEqual([0, 0]);
    // The block stays selected while its formula is dragged.
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'tw' });

    // Escape finishes the edit; so does moving the playhead.
    await page.keyboard.press('Escape');
    await expect.poll(() => ghostCount(page)).toBe(0);
    await page.getByTestId('block-end-state-tw').click();
    await expect.poll(() => ghostCount(page)).toBeGreaterThan(0);
    await setTime(page, 6);
    await expect.poll(() => ghostCount(page)).toBe(0);
    await expect(page.getByTestId('block-end-state-tw')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a clip is locked after its first transformation; unlocking it warns first', async ({
    page,
  }) => {
    await openTween(page);
    const lock = page.getByTestId('clip-a-transform-lock');
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    // The plain clip `b` has no transformation, so no padlock.
    await expect(page.getByTestId('clip-b-transform-lock')).toHaveCount(0);
    await page.getByTestId('clip-a').click({ position: { x: 20, y: 30 } });

    // After the tween a drag does nothing and says why; Shift shows no handles.
    await setTime(page, 4);
    const at = async (scene: [number, number]) => {
      const box = (await page.getByTestId('preview-canvas').boundingBox())!;
      // The scene centre is the canvas centre at the fit zoom; 1 unit is box.height / 8 px.
      const k = box.height / 8;
      return { x: box.x + box.width / 2 + scene[0] * k, y: box.y + box.height / 2 - scene[1] * k };
    };
    const end = await at([2, 1.5]);
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.mouse.move(end.x + 40, end.y, { steps: 4 });
    await page.mouse.up();
    expect(((await blockOf(page, 'a', 'tw')) as unknown as { to: unknown }).to).toEqual({
      position: [2, 1.5],
    });
    await expect(page.getByTestId('notice').last()).toContainText('locked after its first');
    await page.keyboard.down('Shift');
    expect(await handlePoints(page)).toBeNull();
    await page.keyboard.up('Shift');

    // Before the tween, the initial state is free to edit.
    await setTime(page, 1);
    const start = await at([0, 0]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y, { steps: 4 });
    await page.mouse.up();
    expect((await clipOf(page, 'a')).initial.position[0]).toBeGreaterThan(0.2);

    // Unlocking asks first; cancelled, it stays locked.
    await lock.click();
    await expect(page.getByTestId('dialog')).toContainText('Be careful');
    await page.getByTestId('dialog-cancel').click();
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    await lock.click();
    await page.getByTestId('dialog-confirm').click();
    await expect(lock).toHaveAttribute('aria-pressed', 'false');
    // Unlocked, a drag after the tween edits its target, as before.
    await setTime(page, 4);
    const moved = await at([2, 1.5]);
    await page.mouse.move(moved.x, moved.y);
    await page.mouse.down();
    await page.mouse.move(moved.x + 40, moved.y, { steps: 4 });
    await page.mouse.up();
    const tween = (await blockOf(page, 'a', 'tw')) as unknown as { to: { position: number[] } };
    expect(tween.to.position[0]).toBeGreaterThan(2.2);
    // Locking again needs no confirmation.
    await lock.click();
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dialog')).toHaveCount(0);
  });

  test('a part transform has the icons too; its end icon edits the part in the preview', async ({
    page,
  }) => {
    // Clip `a` (a+b=c) 0–10 s: glyphs 3 and 4 ("=c") move right and up during [2, 3).
    await openBlockScene(page, [partJson('pt', 2, 1, [3, 4], { shift: [1, 0.5] })]);
    await blockLocator(page, 'pt').click();
    await expect(page.getByTestId('block-start-state-pt')).toBeVisible();
    await page.getByTestId('block-end-state-pt').click();
    expect((await uiState(page)).time).toBeCloseTo(3, 6);
    await expect(page.getByTestId('block-end-state-pt')).toHaveAttribute('aria-pressed', 'true');
    // The part as it was is drawn faintly: only its two glyphs.
    await expect.poll(() => ghostCount(page)).toBe(2);
    await expect(page.getByTestId('preview-hint')).toContainText('End state of the part');

    // Dragging the formula moves the part (its shift); a corner scales it about its centre.
    const h = (await handlePoints(page))!;
    const from = await pagePoint(page, h.center);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y - 20, { steps: 3 });
    await page.mouse.move(from.x + 60, from.y - 40, { steps: 3 });
    await page.mouse.up();
    const moved = (await blockOf(page, 'a', 'pt')) as unknown as { shift: number[]; scale: number };
    expect(moved.shift[0]).toBeGreaterThan(1.2);
    expect(moved.shift[1]).toBeGreaterThan(0.6);
    expect(moved.scale).toBe(1);
    const corner = await pagePoint(page, (await handlePoints(page))!.se);
    const centre = await pagePoint(page, (await handlePoints(page))!.center);
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    const dx = corner.x - centre.x;
    const dy = corner.y - centre.y;
    await page.mouse.move(centre.x + dx * 1.5, centre.y + dy * 1.5, { steps: 4 });
    await page.mouse.up();
    const scaled = (await blockOf(page, 'a', 'pt')) as unknown as { scale: number };
    expect(scaled.scale).toBeGreaterThan(1.3);
    // The initial state and the other glyphs are untouched; the block stays selected.
    expect((await clipOf(page, 'a')).initial.position).toEqual([0, 0]);
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'pt' });
    await page.keyboard.press('Escape');
    await expect.poll(() => ghostCount(page)).toBe(0);
  });

  /** Open clip `a` with `blocks`, edit the end state of part `pt` and read the handles. */
  async function partHandles(page: Page, blocks: ReturnType<typeof partJson>[]) {
    await openBlockScene(page, blocks);
    await blockLocator(page, 'pt').click();
    await page.getByTestId('block-end-state-pt').click();
    await expect.poll(async () => (await handlePoints(page)) !== null).toBe(true);
    return (await handlePoints(page))!;
  }

  test('the handles of a turned part turn with its glyphs', async ({ page }) => {
    // Glyphs 3 and 4 ("=c") turn by 45° during [2, 3): the rotation handle points 45° from up.
    const h = await partHandles(page, [partJson('pt', 2, 1, [3, 4], { rotation: 45 })]);
    expect(screenAngle(h.center, h.rotate)).toBeCloseTo(90 + 45, 0);
    // The box is a rectangle turned like the glyphs: its top edge runs at 45°.
    expect(screenAngle(h.nw, h.ne)).toBeCloseTo(45, 0);
    // Its two diagonals are one length (the points are published to a tenth of a pixel).
    expect(Math.abs(distance(h.nw, h.se) - distance(h.ne, h.sw))).toBeLessThan(0.3);
  });

  test('the handles of a part whose glyphs turned differently stay upright', async ({ page }) => {
    // Glyph 3 turned 30° more before.
    const h = await partHandles(page, [
      partJson('p0', 0.5, 1, [3], { rotation: 30 }),
      partJson('pt', 2, 1, [3, 4], { rotation: 45 }),
    ]);
    expect(screenAngle(h.center, h.rotate)).toBeCloseTo(90, 0);
  });

  test('the preview outlines the glyphs of the selected block', async ({ page }) => {
    const outlined = async () =>
      Number(await page.getByTestId('preview-frame').getAttribute('data-block-outline-count'));
    // Clip `a` (a+b=c) 0–10 s: "+b" fade out during [4, 5); "=c" move during [6, 7).
    await openBlockScene(page, [
      tweenJson('tw', 1, 1, { position: [0, 1] }),
      disappearJson('out', 4, 1, 'fade_out', [1, 2]),
      partJson('pt', 6, 1, [3, 4], { shift: [1, 0] }),
    ]);
    await setTime(page, 3);
    await blockLocator(page, 'out').click();
    await expect.poll(outlined).toBe(2);
    // Once they have faded out there is nothing of them to outline.
    await setTime(page, 5.5);
    await expect.poll(outlined).toBe(0);
    await blockLocator(page, 'pt').click();
    await expect.poll(outlined).toBe(2);
    // A keyframe of the whole formula keeps the clip's selection box instead.
    await blockLocator(page, 'tw').click();
    await expect.poll(outlined).toBe(0);
  });
});
