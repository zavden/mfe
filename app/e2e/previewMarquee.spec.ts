import { expect, test, type Page } from './test';
import { canUndo, selectionOf } from './helpers';
import { clickScene, openTwoApart, pressAndMove, scenePoint } from './previewHelpers';

/* The selection rectangle (marquee) of the preview: a drag on empty space selects the clips whose
 * box it touches, live; Ctrl/⌘ or Shift adds them to the selection; Esc cancels. */

const frame = (page: Page) => page.getByTestId('preview-frame');

const ids = async (page: Page) => {
  const selection = await selectionOf(page);
  return selection.kind === 'clips' ? selection.ids : selection.kind;
};

test.describe('Preview marquee', () => {
  test('a rectangle selects the clips it touches as it grows; no undo step', async ({ page }) => {
    await openTwoApart(page);
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    // Around alpha (centred at x = −3) only.
    await pressAndMove(page, [-5, 1.5], [-1.5, -1.5]);
    await expect(frame(page)).not.toHaveAttribute('data-marquee', '');
    expect(await ids(page)).toEqual(['ca']);
    // Grown over beta too: both, in screen order.
    const far = await scenePoint(page, [4.5, -1.5]);
    await page.mouse.move(far.x, far.y, { steps: 4 });
    expect(await ids(page)).toEqual(['ca', 'cb']);
    // Shrunk back over empty space: nothing.
    const empty = await scenePoint(page, [-4.5, 1]);
    await page.mouse.move(empty.x, empty.y, { steps: 4 });
    expect(await ids(page)).toBe('none');
    await page.mouse.move(far.x, far.y, { steps: 4 });
    await page.mouse.up();
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    expect(await ids(page)).toEqual(['ca', 'cb']);
    expect(await canUndo(page)).toBe(false);
  });

  test('Shift or Ctrl held adds the touched clips to the selection', async ({ page }) => {
    await openTwoApart(page);
    await clickScene(page, [3, 0]);
    expect(await ids(page)).toEqual(['cb']);
    await pressAndMove(page, [-5, 1.5], [-1.5, -1.5], 'Shift');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect(await ids(page)).toEqual(['cb', 'ca']);
    // A rectangle over nothing, with Ctrl, keeps the selection; without, it clears it (drawn
    // low in the frame: the action bar of a multiple selection sits in the top-left corner).
    await pressAndMove(page, [0, -3.5], [1, -2.5], 'ControlOrMeta');
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    expect(await ids(page)).toEqual(['cb', 'ca']);
    await pressAndMove(page, [0, -3.5], [1, -2.5]);
    await page.mouse.up();
    expect(await ids(page)).toBe('none');
  });

  test('Escape cancels the rectangle and brings the previous selection back', async ({ page }) => {
    await openTwoApart(page);
    await clickScene(page, [3, 0]);
    await pressAndMove(page, [-5, 1.5], [-1.5, -1.5]);
    expect(await ids(page)).toEqual(['ca']);
    await page.keyboard.press('Escape');
    expect(await ids(page)).toEqual(['cb']);
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    // Moving on selects nothing more; releasing leaves the restored selection.
    const far = await scenePoint(page, [4.5, -1.5]);
    await page.mouse.move(far.x, far.y, { steps: 3 });
    await page.mouse.up();
    expect(await ids(page)).toEqual(['cb']);
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
  });

  test('Alt + drag on empty space pans instead of selecting', async ({ page }) => {
    await openTwoApart(page);
    const before = await frame(page).getAttribute('data-center');
    await pressAndMove(page, [0, 3], [1, 2], 'Alt');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    expect(await frame(page).getAttribute('data-center')).not.toBe(before);
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    expect(await ids(page)).toBe('none');
  });
});
