import { expect, test, type Locator } from './test';
import { tweenJson } from './blockHelpers';
import { openRelationScene, plain, selectClip } from './relationsHelpers';

/* Forced colours (Windows high contrast and the like): the browser repaints everything in the
 * system palette and drops shadows and backgrounds, so the states that were only a background
 * get a ring, an underline or a system colour of their own (the `forced-colors` blocks of the
 * stylesheets), and the formula previews keep their colours. */

const style = (locator: Locator, property: string) =>
  locator.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);

test('selected items, toggles, the playhead and the previews stay visible under forced colours', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openRelationScene(page, [
    plain('a', 'fa', 't1', 0, 6, { actions: [tweenJson('x', 1, 1)] }),
    plain('b', 'fb', 't2', 2, 8),
  ]);
  // A selected clip: a solid ring; a selected block too (its ring was a shadow), and the clip
  // it belongs to a dashed one.
  await selectClip(page, 'a');
  const clip = page.getByTestId('clip-a');
  expect(await style(clip, 'outline-style')).toBe('solid');
  await clip.focus();
  await page.keyboard.press('ArrowUp');
  const block = page.getByTestId('action-block-x');
  await expect(block).toBeFocused();
  expect(await style(block, 'outline-style')).toBe('solid');
  expect(await style(block, 'outline-width')).toBe('2px');
  expect(await style(clip, 'outline-style')).toBe('dashed');
  // A toggle that is on (Snap): a ring inside it, and an underline.
  const snap = page.getByTestId('timeline-snap');
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  expect(await style(snap, 'outline-width')).toBe('2px');
  expect(await style(snap, 'text-decoration-line')).toContain('underline');
  // The active tab is underlined.
  const tab = page.getByRole('tab', { name: 'Formulas' });
  expect(await style(tab, 'text-decoration-line')).toContain('underline');
  // The playhead's cap keeps a colour of its own, unlike the canvas around it.
  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await style(page.getByTestId('timeline-playhead'), 'background-color')).not.toBe(canvas);
  // Formula previews are not repainted.
  const thumb = page.getByTestId('formula-thumb').first();
  expect(await style(thumb, 'forced-color-adjust')).toBe('none');
  // The slider of the timeline: its thumb was a tint of the accent. It is an empty frame while
  // there is nothing to move, and a solid bar, unlike the canvas, once there is.
  const slider = page.getByTestId('timeline-slider');
  const knob = page.getByTestId('timeline-slider-thumb');
  await expect(slider).toHaveAttribute('aria-disabled', 'true');
  expect(await style(knob, 'background-color')).toBe(canvas);
  expect(await style(knob, 'border-top-style')).toBe('solid');
  await page.getByTestId('timeline-zoom-in').click();
  await page.getByTestId('timeline-zoom-in').click();
  await expect(slider).toHaveAttribute('aria-disabled', 'false');
  await expect.poll(() => style(knob, 'background-color')).not.toBe(canvas);
  expect(await style(knob, 'forced-color-adjust')).toBe('none');
  // Without forced colours none of this applies: the themes have their own rings and shadows.
  await block.blur();
  await page.emulateMedia({ forcedColors: 'none' });
  expect(await style(block, 'outline-style')).toBe('none');
  expect(await style(snap, 'text-decoration-line')).toBe('none');
  expect(await style(thumb, 'forced-color-adjust')).toBe('auto');
});
