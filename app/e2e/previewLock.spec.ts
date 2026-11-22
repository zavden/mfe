import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { openWithProject, selectionOf, setTime, type MfeWindow } from './helpers';
import { clickScene, pressAndMove, scenePoint, type Point } from './previewHelpers';
import { clipJson, clipOf, projectJson } from './timelineHelpers';
import { canvasBoxOf, handlePoints, selectClips } from './uxHelpers';

/* A clip locked in the preview (`previewLocked`): the preview draws it and leaves it alone. A
 * press goes through it to what is under it, a selection rectangle and Ctrl/⌘+A do not take it,
 * and nothing done in the preview moves it; the timeline still edits it. What locks and unlocks
 * it (the clip's menu) has its own spec, timelineClipLock.spec.ts. */

/** Two formulas that overlap on screen: `ca` ("alpha", in front: track 1) at x = 0 and `cb`
 * ("beta", behind it) at x = 1. They share the stretch around x = 0.5; x = −0.4 is on alpha
 * alone and x = 1.3 on beta alone. Playhead at 2 s. */
async function openOverlapping(page: Page, locked: string[] = []): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 4);
  ca.initial.position = [0, 0];
  const cb = clipJson('cb', 'fb', 't2', 0, 4);
  cb.initial.position = [1, 0];
  await openWithProject(page, projectJson([ca, cb]));
  await setTime(page, 2);
  await waitForDrawables(page, 9);
  for (const id of locked) await lock(page, id);
}

/** Lock a clip in the preview, or unlock it, as the clip's menu does (one undo step). */
async function lock(page: Page, id: string, on = true): Promise<void> {
  await page.evaluate(
    ([clipId, locked]) => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        const clip = draft.clips.find((c) => c.id === clipId) as { previewLocked?: boolean };
        if (locked) clip.previewLocked = true;
        else delete clip.previewLocked;
      });
    },
    [id, on] as const,
  );
}

/** The brightest channel of the preview's pixels in a rectangle of the scene (two corners): a
 * formula drawn at full opacity gives its colour's, a faded one that much less over black. */
async function brightest(page: Page, from: Point, to: Point): Promise<number> {
  const a = await scenePoint(page, from);
  const b = await scenePoint(page, to);
  const box = await canvasBoxOf(page);
  return page.evaluate(
    ([x0, y0, x1, y1, left, top, width]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const k = canvas.width / width; // bitmap pixels per CSS pixel
      const sx = Math.round((Math.min(x0, x1) - left) * k);
      const sy = Math.round((Math.min(y0, y1) - top) * k);
      const w = Math.max(1, Math.round(Math.abs(x1 - x0) * k));
      const h = Math.max(1, Math.round(Math.abs(y1 - y0) * k));
      const { data } = canvas.getContext('2d')!.getImageData(sx, sy, w, h);
      let max = 0;
      for (let i = 0; i < data.length; i += 4)
        max = Math.max(max, data[i]!, data[i + 1]!, data[i + 2]!);
      return max;
    },
    [a.x, a.y, b.x, b.y, box.x, box.y, box.width] as const,
  );
}

const ids = async (page: Page) => {
  const selection = await selectionOf(page);
  return selection.kind === 'clips' ? selection.ids : selection.kind;
};

const positionOf = async (page: Page, id: string) => (await clipOf(page, id)).initial.position;

test.describe('a clip locked in the preview', () => {
  test('a press goes through it to the clip under it, which is selected and dragged', async ({
    page,
  }) => {
    await openOverlapping(page);
    // Where the two overlap, the one in front takes the press.
    await clickScene(page, [0.5, 0]);
    expect(await ids(page)).toEqual(['ca']);
    await clickScene(page, [0, 3]);
    await lock(page, 'ca');
    // Locked, it is not there for the pointer: the same press takes the clip behind it…
    await clickScene(page, [0.5, 0]);
    expect(await ids(page)).toEqual(['cb']);
    // …a drag from there moves that one, and the locked clip stays where it is.
    await pressAndMove(page, [0.5, 0], [0.5, 2]);
    await page.mouse.up();
    expect((await positionOf(page, 'cb'))[1]).toBeCloseTo(2, 1);
    expect(await positionOf(page, 'ca')).toEqual([0, 0]);
    // Where only the locked clip is, a press is one on empty space: it clears the selection.
    await clickScene(page, [-0.4, 0]);
    expect(await ids(page)).toBe('none');
    // Unlocked, it is selected again.
    await lock(page, 'ca', false);
    await clickScene(page, [-0.4, 0]);
    expect(await ids(page)).toEqual(['ca']);
  });

  test('a selection rectangle, Ctrl+A and an Alt pick leave it out', async ({ page }) => {
    await openOverlapping(page, ['ca']);
    await pressAndMove(page, [-3, 1.5], [3, -1.5]);
    expect(await ids(page)).toEqual(['cb']);
    await page.mouse.up();
    await clickScene(page, [0, 3]);
    await page.keyboard.press('ControlOrMeta+a');
    expect(await ids(page)).toEqual(['cb']);
    // Alt+click on a glyph of the locked clip picks nothing (its leftmost glyph, alone there).
    await clickScene(page, [0, 3]);
    await clickScene(page, [-0.4, 0], 'Alt');
    await expect(page.getByTestId('glyph-pick')).toHaveCount(0);
    expect(await ids(page)).toBe('none');
    // With every clip on screen locked, Ctrl+A leaves the selection as it is.
    await lock(page, 'cb');
    await page.keyboard.press('ControlOrMeta+a');
    expect(await ids(page)).toBe('none');
  });

  test('selected from the timeline, it has no handles and the preview does not move it', async ({
    page,
  }) => {
    await openOverlapping(page, ['ca']);
    // The timeline selects it as any clip; the preview shows no handles for it with Shift.
    await page.getByTestId('clip-ca').click();
    expect(await ids(page)).toEqual(['ca']);
    await page.keyboard.down('Shift');
    expect(await handlePoints(page)).toBeNull();
    await page.keyboard.up('Shift');
    // Align to the frame's left edge: it stays, and the notice says why.
    await page.keyboard.press('Alt+Shift+a');
    expect(await positionOf(page, 'ca')).toEqual([0, 0]);
    await expect(page.getByTestId('notice')).toContainText('1 clip stayed');
    await expect(page.getByTestId('notice')).toContainText('locked in the preview');

    // With another clip selected too, what the preview does is done to that one alone: the
    // handles frame it, a drag moves it, Align moves it.
    await selectClips(page, ['ca', 'cb']);
    await page.keyboard.down('Shift');
    await expect.poll(() => handlePoints(page)).not.toBeNull();
    await page.keyboard.up('Shift');
    const from = await scenePoint(page, [1.3, 0]); // on cb alone
    const to = await scenePoint(page, [1.3, -2]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    expect((await positionOf(page, 'cb'))[1]).toBeCloseTo(-2, 1);
    expect(await positionOf(page, 'ca')).toEqual([0, 0]);
  });

  test('it is painted faded, as much as Preferences → Locked formulas says', async ({ page }) => {
    await openOverlapping(page);
    // The brightest pixel of the stretch where alpha is alone, and of beta's own stretch.
    const alpha = () => brightest(page, [-0.7, 0.35], [0.35, -0.35]);
    const beta = () => brightest(page, [1.1, 0.4], [1.6, -0.4]);
    const full = await alpha();
    const other = await beta();
    expect(full).toBeGreaterThan(180);
    // Locked: 40 % of its own opacity, over the black frame; the other formula as it was.
    await lock(page, 'ca');
    await expect.poll(alpha).toBeLessThan(full * 0.4 + 6);
    expect(await alpha()).toBeGreaterThan(full * 0.4 - 6);
    expect(await beta()).toBe(other);
    // Another opacity from the Preferences menu, kept for the next session.
    await page.getByTestId('menu-preferences').click();
    await page.getByTestId('menu-item-preferences-locked-opacity').hover();
    await expect(page.getByTestId('menu-item-preferences-locked-opacity-40')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByTestId('menu-item-preferences-locked-opacity-80').click();
    await expect.poll(alpha).toBeGreaterThan(full * 0.8 - 6);
    expect(await alpha()).toBeLessThan(full * 0.8 + 6);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('mfe.preferences')!).lockedOpacity),
    ).toBe(0.8);
    // Not faded at all, for who wants the lock without the look.
    await page.getByTestId('menu-preferences').click();
    await page.getByTestId('menu-item-preferences-locked-opacity').hover();
    await page.getByTestId('menu-item-preferences-locked-opacity-100').click();
    await expect.poll(alpha).toBe(full);
    // Unlocked, it is drawn as any other, whatever the preference.
    await page.getByTestId('menu-preferences').click();
    await page.getByTestId('menu-item-preferences-locked-opacity').hover();
    await page.getByTestId('menu-item-preferences-locked-opacity-20').click();
    await expect.poll(alpha).toBeLessThan(full * 0.2 + 6);
    await lock(page, 'ca', false);
    await expect.poll(alpha).toBe(full);
  });

  test('the timeline still edits it: it moves in time and to another track', async ({ page }) => {
    await openOverlapping(page, ['ca']);
    const clip = (await page.getByTestId('clip-ca').boundingBox())!;
    const from = { x: clip.x + 40, y: clip.y + clip.height - 6 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y, { steps: 6 });
    await page.mouse.up();
    const moved = await clipOf(page, 'ca');
    expect(moved.start).toBeCloseTo(1, 1);
    expect((moved as { previewLocked?: boolean }).previewLocked).toBe(true);
  });
});
