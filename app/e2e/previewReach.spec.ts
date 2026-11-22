/* What of the scene answers the pointer in the Preview (`pointerReach.ts`, D192): nothing while
 * the scene plays, nor while the fly key (T, Shift+T) gives the mouse to the timeline. (The world
 * view, where the camera's rectangles answer alone, is in `camera.spec.ts`.) */
import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { openWithProject, selectionOf, setTime, type MfeWindow } from './helpers';
import { pressAndMove, scenePoint } from './previewHelpers';
import { clipJson, clipOf, projectJson, uiState } from './timelineHelpers';

const frame = (page: Page) => page.getByTestId('preview-frame');

const ids = async (page: Page) => {
  const selection = await selectionOf(page);
  return selection.kind === 'clips' ? selection.ids : selection.kind;
};

/** Two clips apart on screen for half a minute, long enough to be played while a test looks:
 * alpha at x = −3 and beta at x = 3; playhead 2 s. The circle selector is on: a pointer on a
 * formula has a symbol within its reach, whatever the symbols' shapes. */
async function open(page: Page): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 30);
  ca.initial.position = [-3, 0];
  const cb = clipJson('cb', 'fb', 't2', 0, 30);
  cb.initial.position = [3, 0];
  await openWithProject(page, projectJson([ca, cb]));
  await setTime(page, 2);
  await waitForDrawables(page, 9); // alpha (5 glyphs) and beta (4), both written by then
  await page.getByTestId('preview-circle-select').click();
}

/** Start or stop the playback without a key or a move of the pointer. */
const play = (page: Page, playing: boolean) =>
  page.evaluate((on) => (window as MfeWindow).__mfe!.useUiStore.getState().setPlaying(on), playing);

test.describe('the Preview while the scene plays', () => {
  test('nothing of the scene answers the pointer; stopped, it does again', async ({ page }) => {
    await open(page);
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'objects');
    const alpha = await scenePoint(page, [-3, 0]);
    await page.mouse.move(alpha.x, alpha.y);
    await expect(frame(page)).toHaveAttribute('data-hover', /^ca:\d+$/);

    // The outline under a pointer that does not move goes as the scene starts.
    await play(page, true);
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'none');
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    await expect.poll(async () => (await uiState(page)).time).toBeGreaterThan(2);
    // Nor does one come under a pointer that moves.
    const beta = await scenePoint(page, [3, 0]);
    await page.mouse.move(beta.x, beta.y);
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    // A click selects nothing, a drag moves nothing and draws no rectangle.
    await page.mouse.click(beta.x, beta.y);
    expect(await ids(page)).toBe('none');
    await pressAndMove(page, [3, 0], [1, 1], 'ControlOrMeta');
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    expect((await clipOf(page, 'cb')).initial.position).toEqual([3, 0]);
    expect(await ids(page)).toBe('none');
    // A right-click opens the scene's own menu, not an object's, and selects nothing.
    await page.mouse.click(beta.x, beta.y, { button: 'right' });
    await expect(page.getByTestId('preview-space-menu')).toBeVisible();
    await expect(page.getByTestId('preview-menu')).toHaveCount(0);
    expect(await ids(page)).toBe('none');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('preview-space-menu')).toHaveCount(0);
    expect((await uiState(page)).playing).toBe(true);

    // Stopped, the pointer is the objects' again.
    await play(page, false);
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'objects');
    await page.mouse.move(alpha.x, alpha.y);
    await expect(frame(page)).toHaveAttribute('data-hover', /^ca:\d+$/);
    await page.mouse.click(alpha.x, alpha.y);
    expect(await ids(page)).toEqual(['ca']);
  });

  test('what is selected stays selected, without handles, and the view is still panned', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      mfe.usePreferences.getState().set({ keepHandles: true });
      mfe.useUiStore.getState().select({ kind: 'clips', ids: ['ca'] });
    });
    await expect(frame(page)).not.toHaveAttribute('data-transform-handles', '');
    await play(page, true);
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await expect(page.getByTestId('preview-handles-hint')).toHaveCount(0);
    // A click on the empty scene does not clear the selection: no click is heard.
    const empty = await scenePoint(page, [0, 3]);
    await page.mouse.click(empty.x, empty.y);
    expect(await ids(page)).toEqual(['ca']);
    // Alt and a drag pan the view, on a formula too: no glyph is picked.
    await expect(frame(page)).toHaveAttribute('data-center', '0.000,0.000');
    await pressAndMove(page, [-3, 0], [-2, 0.5], 'Alt');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(frame(page)).not.toHaveAttribute('data-center', '0.000,0.000');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    expect((await clipOf(page, 'ca')).initial.position).toEqual([-3, 0]);
    await play(page, false);
    await expect(frame(page)).not.toHaveAttribute('data-transform-handles', '');
  });
});

test.describe('the Preview while the fly key is held', () => {
  test('T and Shift+T: the mouse is the timeline’s, and outlines and takes nothing', async ({
    page,
  }) => {
    await open(page);
    const alpha = await scenePoint(page, [-3, 0]);
    const beta = await scenePoint(page, [3, 0]);
    await page.mouse.move(alpha.x, alpha.y);
    await expect(frame(page)).toHaveAttribute('data-hover', /^ca:\d+$/);
    // T: the outline under the pointer goes at once, and none comes as the pointer goes on.
    await page.keyboard.down('KeyT');
    await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-flying', 'view');
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'none');
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    await page.mouse.move(beta.x, beta.y, { steps: 5 });
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    await page.mouse.click(beta.x, beta.y);
    expect(await ids(page)).toBe('none');
    // Shift too: the playhead follows the pointer, and the scene still leaves it alone.
    await page.keyboard.down('Shift');
    await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-flying', 'playhead');
    await page.mouse.move(alpha.x, alpha.y, { steps: 5 });
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'none');
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    await page.keyboard.up('Shift');
    await page.keyboard.up('KeyT');
    // Released, the pointer is the objects' again.
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'objects');
    await setTime(page, 2);
    await page.mouse.move(beta.x, beta.y, { steps: 3 });
    await expect(frame(page)).toHaveAttribute('data-hover', /^cb:\d+$/);
    await page.mouse.click(beta.x, beta.y);
    expect(await ids(page)).toEqual(['cb']);
  });

  test('in the vertical timeline too, where the pointer goes down the Preview', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.usePreferences.getState().set({ zenMode: true }),
    );
    await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-orientation', 'vertical');
    const alpha = await scenePoint(page, [-3, 0]);
    await page.mouse.move(alpha.x, alpha.y);
    await expect(frame(page)).toHaveAttribute('data-hover', /^ca:\d+$/);
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyT');
    await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-flying', 'playhead');
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    await page.mouse.move(alpha.x + 30, alpha.y + 40, { steps: 5 });
    await page.mouse.move(alpha.x, alpha.y, { steps: 5 });
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    expect(await ids(page)).toBe('none');
    await page.keyboard.up('KeyT');
    await page.keyboard.up('Shift');
    await setTime(page, 2);
    await page.mouse.move(alpha.x + 1, alpha.y, { steps: 2 });
    await expect(frame(page)).toHaveAttribute('data-hover', /^ca:\d+$/);
  });
});
