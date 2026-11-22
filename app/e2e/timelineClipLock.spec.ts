import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { openWithProject, selectionOf, setTime, undo, type MfeWindow } from './helpers';
import { clickScene } from './previewHelpers';
import { clipJson, clipOf, projectJson } from './timelineHelpers';
import { selectClips } from './uxHelpers';

/* Locking a formula or a text in the preview from its clip on the timeline: the last entry of the
 * clip's menu (and of the menu of several selected clips) locks it or unlocks it, the clip shows
 * a mark that unlocks it too, and each is one undo step. What the lock does in the preview has
 * its own spec, previewLock.spec.ts. */

/** `ca` ("alpha", in front) at x = 0 and `cb` ("beta") at x = 1, overlapping around x = 0.5;
 * x = −0.4 is on alpha alone. Playhead at 2 s. */
async function openOverlapping(page: Page): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 4);
  ca.initial.position = [0, 0];
  const cb = clipJson('cb', 'fb', 't2', 0, 4);
  cb.initial.position = [1, 0];
  await openWithProject(page, projectJson([ca, cb]));
  await setTime(page, 2);
  await waitForDrawables(page, 9);
}

const lockedOf = async (page: Page, id: string) =>
  ((await clipOf(page, id)) as { previewLocked?: boolean }).previewLocked === true;
const ids = async (page: Page) => {
  const selection = await selectionOf(page);
  return selection.kind === 'clips' ? selection.ids : selection.kind;
};
const redo = (page: Page) => page.evaluate(() => (window as MfeWindow).__mfe!.history.redo());
/** A right-click on a clip of the timeline, on its lower part (no block there). */
async function clipMenu(page: Page, id: string): Promise<void> {
  const clip = (await page.getByTestId(`clip-${id}`).boundingBox())!;
  await page.mouse.click(clip.x + 60, clip.y + clip.height - 6, { button: 'right' });
}
const entry = (page: Page) => page.getByTestId('clip-menu-preview-lock');
const mark = (page: Page, id: string) => page.getByTestId(`clip-${id}-preview-lock`);

test("a clip's menu locks it in the preview, and its mark or the menu unlocks it", async ({
  page,
}) => {
  await openOverlapping(page);
  await expect(mark(page, 'ca')).toHaveCount(0);
  // The clip's menu (the one that adds an animation) ends with the entry.
  await clipMenu(page, 'ca');
  const menu = page.getByTestId('add-animation-menu');
  await expect(menu.getByRole('menuitem').last()).toHaveText('Lock in the preview');
  await entry(page).click();
  await expect(menu).toHaveCount(0);
  expect(await lockedOf(page, 'ca')).toBe(true);
  expect(await lockedOf(page, 'cb')).toBe(false);
  // The clip shows it, and the preview leaves it alone: a press where both formulas are takes
  // the other, and where it is alone, nothing.
  await expect(mark(page, 'ca')).toBeVisible();
  await expect(mark(page, 'ca')).toHaveAccessibleName('Unlock alpha in the preview');
  await clickScene(page, [0.5, 0]);
  expect(await ids(page)).toEqual(['cb']);
  await clickScene(page, [-0.4, 0]);
  expect(await ids(page)).toBe('none');

  // One undo step, and back.
  await undo(page);
  expect(await lockedOf(page, 'ca')).toBe(false);
  await expect(mark(page, 'ca')).toHaveCount(0);
  await redo(page);
  expect(await lockedOf(page, 'ca')).toBe(true);
  // The menu says what it does now, and undoes the lock.
  await clipMenu(page, 'ca');
  await expect(entry(page)).toHaveText('Unlock in the preview');
  await entry(page).click();
  expect(await lockedOf(page, 'ca')).toBe(false);
  await clickScene(page, [-0.4, 0]);
  expect(await ids(page)).toEqual(['ca']);

  // The mark on the clip unlocks it with a press (the clip is not dragged, nor its formula
  // opened).
  await clipMenu(page, 'ca');
  await entry(page).click();
  const before = await clipOf(page, 'ca');
  await mark(page, 'ca').click();
  expect(await lockedOf(page, 'ca')).toBe(false);
  expect(await clipOf(page, 'ca')).toMatchObject({ start: before.start, end: before.end });
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);
});

test('the menu of several selected clips locks them all, or unlocks them when all are locked', async ({
  page,
}) => {
  await openOverlapping(page);
  await selectClips(page, ['ca', 'cb']);
  await clipMenu(page, 'ca');
  const item = page.getByTestId('clips-menu-preview-lock');
  await expect(item).toHaveText('Lock in the preview');
  await item.click();
  expect([await lockedOf(page, 'ca'), await lockedOf(page, 'cb')]).toEqual([true, true]);
  // One step for both.
  await undo(page);
  expect([await lockedOf(page, 'ca'), await lockedOf(page, 'cb')]).toEqual([false, false]);
  await redo(page);
  // All locked: the entry unlocks them.
  await clipMenu(page, 'ca');
  await expect(item).toHaveText('Unlock in the preview');
  await item.click();
  expect([await lockedOf(page, 'ca'), await lockedOf(page, 'cb')]).toEqual([false, false]);
  // One locked and one not: it locks the one that is not.
  await mark(page, 'ca').waitFor({ state: 'detached' });
  await selectClips(page, ['ca']);
  await clipMenu(page, 'ca');
  await entry(page).click();
  await selectClips(page, ['ca', 'cb']);
  await clipMenu(page, 'cb');
  await expect(item).toHaveText('Lock in the preview');
  await item.click();
  expect([await lockedOf(page, 'ca'), await lockedOf(page, 'cb')]).toEqual([true, true]);
});

test('the entry is reached from the keyboard, and a glyph pick on the clip goes when it is locked', async ({
  page,
}) => {
  await openOverlapping(page);
  // Two glyphs of alpha picked in the preview (Alt+click): its pick bar shows.
  await clickScene(page, [-0.4, 0], 'Alt');
  await expect(page.getByTestId('glyph-pick')).toBeVisible();
  // The clip's menu from the keyboard: Shift+F10 on the focused clip, End for its last entry.
  await page.getByTestId('clip-ca').focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  await page.keyboard.press('End');
  await expect(entry(page)).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await lockedOf(page, 'ca')).toBe(true);
  // Its glyphs cannot be reached any more: the pick is gone.
  await expect(page.getByTestId('glyph-pick')).toHaveCount(0);
});

test('on a locked track the lock of a clip cannot be changed', async ({ page }) => {
  await openOverlapping(page);
  await clipMenu(page, 'ca');
  await entry(page).click();
  await page.getByTestId('track-lock-t1').click();
  await expect(mark(page, 'ca')).toBeDisabled();
  // A locked track's clip has its menu, with the entry off.
  await clipMenu(page, 'ca');
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  await expect(entry(page)).toBeDisabled();
  await expect(entry(page)).toHaveText('Unlock in the preview');
  await page.keyboard.press('Escape');
  expect(await lockedOf(page, 'ca')).toBe(true);
});
