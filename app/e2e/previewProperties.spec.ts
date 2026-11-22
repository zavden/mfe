import { expect, test, type Page } from './test';
import { canUndo, openSubmenu, selectionOf, undo, type MfeWindow } from './helpers';
import { clickScene, openTwoApart, pressAndMove, scenePoint } from './previewHelpers';

/* Copy properties / Paste properties: the state of one clip (its scale, rotation, flips, opacity
 * and colours; the position is pasted only on purpose), onto the clips selected by hand or with
 * the selection rectangle, through the preview's right-click menu and the Edit menu, all of it or
 * one group at a time. */

interface Look {
  scale: number;
  rotation: number;
  opacity: number;
}

const looks = (page: Page) =>
  page.evaluate(() =>
    (window as MfeWindow).__mfe!.useProjectStore.getState().project.clips.map((c) => {
      const { scale, rotation, opacity } = (c as unknown as { initial: Look }).initial;
      return { scale, rotation, opacity };
    }),
  );
const scales = async (page: Page) => (await looks(page)).map((look) => look.scale);
const positions = (page: Page) =>
  page.evaluate(() =>
    (window as MfeWindow)
      .__mfe!.useProjectStore.getState()
      .project.clips.map(
        (c) => (c as unknown as { initial: { position: [number, number] } }).initial.position,
      ),
  );

const PLAIN: Look = { scale: 1, rotation: 0, opacity: 1 };
const STYLED: Look = { scale: 1.6, rotation: 30, opacity: 0.5 };

/** Give alpha (`ca`) a look of its own straight in the store, then drop the undo step. */
async function styleAlpha(page: Page): Promise<void> {
  await page.evaluate((styled) => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      Object.assign((draft.clips[0] as unknown as { initial: Look }).initial, styled);
    });
    mfe.history.clear();
  }, STYLED);
  expect(await looks(page)).toEqual([STYLED, PLAIN]);
}

async function rightClickScene(page: Page, point: [number, number]): Promise<void> {
  const { x, y } = await scenePoint(page, point);
  await page.mouse.click(x, y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
}

test.describe('Preview copy and paste properties', () => {
  test('the right-click menu copies the look of a clip and pastes it onto the selection', async ({
    page,
  }) => {
    await openTwoApart(page);
    await styleAlpha(page);
    // Nothing copied yet: every Paste entry is disabled, Copy is not.
    await rightClickScene(page, [-3, 0]);
    await openSubmenu(page, 'preview-menu-paste');
    for (const group of ['all', 'transformation', 'appearance', 'glyph-colors', 'position']) {
      await expect(page.getByTestId(`preview-menu-paste-${group}`)).toBeDisabled();
    }
    await expect(page.getByTestId('preview-menu-paste-all')).toHaveText('All but position');
    await expect(page.getByTestId('preview-menu-copy-properties')).toBeEnabled();
    // Each item shows its icon before the text.
    await expect(page.getByTestId('preview-menu-copy-properties').locator('svg')).toBeVisible();
    await expect(page.getByTestId('preview-menu-paste-all').locator('svg')).toBeVisible();
    await page.getByTestId('preview-menu-copy-properties').click();
    await expect(page.getByTestId('preview-menu')).toHaveCount(0);
    expect(await canUndo(page)).toBe(false); // a copy edits nothing

    // Select both with the rectangle, then paste from the menu on beta.
    await pressAndMove(page, [-5, 1.5], [4.5, -1.5]);
    await page.mouse.up();
    expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['ca', 'cb'] });
    await rightClickScene(page, [3, 0]);
    await openSubmenu(page, 'preview-menu-paste');
    const all = page.getByTestId('preview-menu-paste-all');
    await expect(all).toBeEnabled();
    await expect(all).toHaveText('All but position (× 1.60 · 30° · 50 %)');
    await all.click();
    expect(await looks(page)).toEqual([STYLED, STYLED]);
    // The position is not part of it: beta stays where it was.
    expect(await positions(page)).toEqual([
      [-3, 0],
      [3, 0],
    ]);
    await undo(page);
    expect(await looks(page)).toEqual([STYLED, PLAIN]);
    expect(await canUndo(page)).toBe(false);
  });

  test('the Edit menu has the same items in a submenu; each shows what it would paste', async ({
    page,
  }) => {
    await openTwoApart(page);
    await styleAlpha(page);
    // Copy needs exactly one selected clip; Paste needs a copy.
    await page.getByTestId('menu-edit').click();
    await expect(page.getByTestId('menu-item-edit-copy-properties')).toBeDisabled();
    await expect(page.getByTestId('menu-item-edit-paste-properties')).toBeDisabled();
    await page.keyboard.press('Escape');
    await clickScene(page, [-3, 0]);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-copy-properties').click();
    await clickScene(page, [3, 0]);
    await page.getByTestId('menu-edit').click();
    const paste = page.getByTestId('menu-item-edit-paste-properties');
    await expect(paste.locator('svg')).toBeVisible();
    await paste.hover();
    const entry = (group: string) => page.getByTestId(`menu-item-edit-paste-properties-${group}`);
    await expect(entry('all')).toHaveText('All but position (× 1.60 · 30° · 50 %)');
    await expect(entry('transformation')).toHaveText('Transformation (× 1.60 · 30°)');
    await expect(entry('appearance')).toHaveText('Appearance (50 %)');
    await expect(entry('glyph-colors')).toHaveText('Glyph colours (none)');
    await expect(entry('position')).toHaveText('Position (-3.00, 0.00)');
    await entry('transformation').click();
    await expect(page.getByTestId('menu-item-edit-paste-properties')).toHaveCount(0);
    expect(await looks(page)).toEqual([STYLED, { scale: 1.6, rotation: 30, opacity: 1 }]);
  });

  test('one group at a time: the appearance, then the position, each its own undo step', async ({
    page,
  }) => {
    await openTwoApart(page);
    await styleAlpha(page);
    await rightClickScene(page, [-3, 0]);
    await page.getByTestId('preview-menu-copy-properties').click();
    await clickScene(page, [3, 0]);
    await rightClickScene(page, [3, 0]);
    await openSubmenu(page, 'preview-menu-paste');
    await page.getByTestId('preview-menu-paste-appearance').click();
    expect(await looks(page)).toEqual([STYLED, { scale: 1, rotation: 0, opacity: 0.5 }]);
    await rightClickScene(page, [3, 0]);
    await openSubmenu(page, 'preview-menu-paste');
    await expect(page.getByTestId('preview-menu-paste-position')).toHaveText(
      'Position (-3.00, 0.00)',
    );
    await page.getByTestId('preview-menu-paste-position').click();
    expect(await positions(page)).toEqual([
      [-3, 0],
      [-3, 0],
    ]);
    // Beta is another formula: alpha's glyph colours do not apply to it, and nothing is written.
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      mfe.useProjectStore.getState().update((draft) => {
        (
          draft.clips[0] as unknown as { initial: { glyphColors: Record<string, string> } }
        ).initial.glyphColors = { '0': '#FF0000' };
      });
    });
    await rightClickScene(page, [-3, 0]); // beta sits on alpha now; the menu acts on the selection
    await page.getByTestId('preview-menu-copy-properties').click();
    await rightClickScene(page, [-3, 0]);
    await openSubmenu(page, 'preview-menu-paste');
    await expect(page.getByTestId('preview-menu-paste-glyph-colors')).toHaveText(
      'Glyph colours (1 glyph)',
    );
    await page.getByTestId('preview-menu-paste-glyph-colors').click();
    expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(true);
    await undo(page); // the glyph colour edit above
    await undo(page); // the position
    expect(await positions(page)).toEqual([
      [-3, 0],
      [3, 0],
    ]);
    expect(await looks(page)).toEqual([STYLED, { scale: 1, rotation: 0, opacity: 0.5 }]);
    await undo(page); // the appearance
    expect(await looks(page)).toEqual([STYLED, PLAIN]);
    expect(await canUndo(page)).toBe(false);
  });

  test('a clip on a locked track keeps its look, and a notice names it', async ({ page }) => {
    await openTwoApart(page);
    await styleAlpha(page);
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        (draft as unknown as { tracks: { locked: boolean }[] }).tracks[1]!.locked = true;
      });
    });
    await rightClickScene(page, [-3, 0]);
    await page.getByTestId('preview-menu-copy-properties').click();
    await page.keyboard.press('ControlOrMeta+a');
    await rightClickScene(page, [-3, 0]);
    await openSubmenu(page, 'preview-menu-paste');
    await page.getByTestId('preview-menu-paste-all').click();
    expect(await scales(page)).toEqual([1.6, 1]);
    const notice = page.getByTestId('notice');
    await expect(notice).toContainText('1 clip stayed');
    await expect(notice).toContainText('beta');
  });
});
