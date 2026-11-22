import { expect, test } from './test';
import {
  blockLocator,
  blockOf,
  emphasisJson,
  openBlockScene,
  pickAnimation,
  tweenJson,
} from './blockHelpers';
import { setTime, undo } from './helpers';
import { colorCentroid } from './relationsHelpers';
import { clipOf, timeToX, box } from './timelineHelpers';

/* Emphasis blocks (D73): «Add animation ▸ Emphasis» puts an Indicate, Wiggle, Circumscribe,
 * Flash or FocusOn on the glyphs of a clip at the playhead; the panel shows the effect's own
 * settings and runs another effect; a Circumscribe may overlap a tween but not start while the
 * glyphs are still being written; the preview draws its frame while the block runs. Formula `fa`
 * (a + b = c, five glyphs) on clip `a` [0, 10] of track 1. */

test.describe('emphasis blocks', () => {
  test('Add animation ▸ Emphasis ▸ Indicate adds a block at the playhead with its own settings', async ({
    page,
  }) => {
    await openBlockScene(page, []);
    await setTime(page, 3);
    const clip = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 3), clip.y + clip.height * 0.75, {
      button: 'right',
    });
    await expect(page.getByTestId('add-animation-menu')).toBeVisible();
    await pickAnimation(page, 'indicate');
    const action = (await clipOf(page, 'a')).actions.at(-1)!;
    expect(action).toMatchObject({
      kind: 'emphasis',
      effect: 'indicate',
      glyphs: 'all',
      start: 3,
      duration: 1,
      easing: 'there_and_back',
      color: '#FFFF00',
      scale: 1.2,
    });
    const block = blockLocator(page, action.id);
    await expect(block).toHaveText('Indicate');
    await expect(block).toHaveClass(/is-emphasis/);
    // The new block is selected: its panel shows the effect, the colour and the scale, and the
    // two easings that come back.
    await expect(page.getByTestId('block-effect')).toHaveValue('indicate');
    await expect(page.getByTestId('block-emphasis-color')).toBeVisible();
    await expect(page.getByTestId('block-emphasis-scale')).toHaveValue('1.2');
    await expect(page.getByTestId('block-easing').locator('option')).toHaveText([
      'there_and_back',
      'there_and_back_with_pause',
    ]);
    await undo(page);
    await expect(block).toHaveCount(0);
  });

  test('the panel runs another effect, keeping the time and the glyphs and taking its defaults', async ({
    page,
  }) => {
    await openBlockScene(page, [emphasisJson('e', 3, 1, 'indicate', [1, 2])]);
    await blockLocator(page, 'e').click();
    await page.getByTestId('block-effect').selectOption('focus_on');
    expect(await blockOf(page, 'a', 'e')).toMatchObject({
      effect: 'focus_on',
      start: 3,
      duration: 1,
      glyphs: [1, 2],
      easing: 'smooth',
      color: '#888888',
      opacity: 0.2,
    });
    await expect(page.getByTestId('block-emphasis-opacity')).toHaveValue('0.2');
    await expect(blockLocator(page, 'e')).toHaveText('FocusOn · 2');
    // A Flash has no easing to choose: it runs at each library's own tempo.
    await page.getByTestId('block-effect').selectOption('flash');
    await expect(page.getByTestId('block-easing')).toHaveCount(0);
    await expect(page.getByTestId('block-emphasis-color')).toBeVisible();
    // The block's menu changes the effect too.
    await blockLocator(page, 'e').click({ button: 'right' });
    await page.getByTestId('block-menu-effect-wiggle').click();
    expect(await blockOf(page, 'a', 'e')).toMatchObject({ effect: 'wiggle', scale: 1.1 });
    await expect(page.getByTestId('block-emphasis-wiggles')).toHaveValue('6');
  });

  test('a Circumscribe runs over a tween, but its start stops where the glyphs are still being written', async ({
    page,
  }) => {
    await openBlockScene(
      page,
      [tweenJson('tw', 3, 1), emphasisJson('c', 3.2, 1, 'circumscribe', 'all')],
      {
        clip: {
          intro: {
            kind: 'write',
            duration: 1,
            easing: 'linear',
            lagRatio: null,
            shift: [0, 0],
            scale: 1,
          },
        },
      },
    );
    await blockLocator(page, 'c').click();
    await expect(page.getByTestId('block-issues')).toHaveCount(0);
    // Asked to start at 0.5 s, inside the Write intro, it lands where the intro ends.
    const start = page.getByTestId('block-start');
    await start.fill('0.5');
    await start.press('Enter');
    const moved = await blockOf(page, 'a', 'c');
    expect(moved.start).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(moved.start).toBeLessThan(1.01);
  });

  test('the preview draws the frame while the block runs', async ({ page }) => {
    await openBlockScene(page, [emphasisJson('c', 3, 1, 'circumscribe', 'all')]);
    await setTime(page, 2.5);
    expect((await colorCentroid(page, 'yellow')).count).toBe(0);
    await setTime(page, 3.5);
    expect((await colorCentroid(page, 'yellow')).count).toBeGreaterThan(0);
  });
});
