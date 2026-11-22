import { expect, test, type Locator } from './test';
import { appearJson, blockLocator, morphJson, openBlockScene } from './blockHelpers';
import { canUndo, holdToConfirm, undo } from './helpers';
import { openRelationScene, plain } from './relationsHelpers';

/* The block dialog (R2, D75): a double-click on a block of the timeline selects it and opens a
 * resizable dialog with the panel's editor of the block; the Animations panel keeps showing it,
 * and both edit it through the same actions, one undo step each. The block's preview is not in
 * the dialog: its Preview button opens it in a dialog over it. */

/** Set a range input as a hand would, so that React sees the change. */
async function setRange(range: Locator, value: string): Promise<void> {
  await range.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('a double-click on a block opens its dialog; the panel and the dialog edit the same block', async ({
  page,
}) => {
  await openBlockScene(page, [appearJson('w', 1, 3, 'write', 'all')]);
  await blockLocator(page, 'w').dblclick();
  const dialog = page.getByTestId('block-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Write');
  await expect(page.getByTestId('block-dialog-maximize')).toBeVisible();
  await expect(page.getByTestId('block-dialog-resize')).toBeVisible();
  // The panel shows the block too (the selection), with the same fields.
  const panel = page.getByTestId('panel-animations');
  await expect(panel.getByTestId('block-properties')).toBeVisible();
  await expect(dialog.getByTestId('block-properties')).toBeVisible();

  // An edit in the dialog: one undo step, seen in the panel.
  const duration = dialog.getByTestId('block-duration');
  await expect(duration).toHaveValue('3');
  await duration.fill('2');
  await duration.press('Enter');
  await expect(panel.getByTestId('block-duration')).toHaveValue('2');
  await expect(blockLocator(page, 'w')).toHaveAttribute('data-duration', '2');
  expect(await canUndo(page)).toBe(true);
  await undo(page);
  await expect(duration).toHaveValue('3');
  await expect(panel.getByTestId('block-duration')).toHaveValue('3');

  // The formula in large, beside the fields: a click picks a glyph for the block (Shift a
  // range), the panel's own Glyphs section agrees; the fields' Glyphs section leaves the picking
  // to it.
  await expect(dialog.getByTestId('block-glyphs-aside')).toBeVisible();
  const large = dialog.getByTestId('block-dialog-glyphs');
  await expect(large.locator('.glyph-svg.is-large')).toBeVisible();
  await large.getByTestId('block-glyph-0').click();
  await expect(panel.getByTestId('block-glyphs-summary')).toHaveText('1 glyph: 0');
  await large.getByTestId('block-glyph-2').click({ modifiers: ['Shift'] });
  await expect(panel.getByTestId('block-glyphs-summary')).toHaveText('3 glyphs: 0, 1, 2');
  await expect(blockLocator(page, 'w')).toContainText('Write · 3');
  await undo(page);
  await expect(panel.getByTestId('block-glyphs-summary')).toHaveText('1 glyph: 0');

  // The block's own preview is not in the dialog: Preview, in its title bar, opens it in a dialog
  // over this one. It loops over the block padded by 0.3 s (it spans 1–4 s of a clip at 0): its
  // time moves while it plays, stays when paused, and the playhead scrubs it.
  const preview = page.getByTestId('block-preview-dialog');
  await expect(page.getByTestId('block-preview')).toHaveCount(0);
  await expect(page.getByTestId('block-easing-curve')).toHaveCount(0);
  const open = dialog.getByTestId('block-preview-open');
  await expect(open).toHaveText('Preview');
  await open.click();
  await expect(preview).toBeVisible();
  // (One glyph is picked by now.)
  await expect(preview.getByRole('heading')).toHaveText('Preview · Write · 1 · f1');
  await expect(preview.getByTestId('block-preview-canvas')).toBeVisible();
  // It is the dialog on top: the whole picture is inside it, and nothing of it scrolls.
  const picture = (await preview.getByTestId('block-preview-canvas').boundingBox())!;
  const frame = (await preview.boundingBox())!;
  expect(picture.width / picture.height).toBeCloseTo(16 / 9, 1);
  expect(picture.x).toBeGreaterThan(frame.x);
  expect(picture.x + picture.width).toBeLessThan(frame.x + frame.width);
  expect(
    await preview.locator('.modal-body').evaluate((body) => body.scrollHeight - body.clientHeight),
  ).toBeLessThanOrEqual(1);
  const play = preview.getByTestId('block-preview-play');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  const seconds = async () =>
    Number((await preview.getByTestId('block-preview-time').textContent())!.replace(' s', ''));
  const first = await seconds();
  await expect.poll(seconds).not.toBe(first);
  for (let i = 0; i < 3; i += 1) {
    const t = await seconds();
    expect(t).toBeGreaterThanOrEqual(0.7);
    expect(t).toBeLessThanOrEqual(4.3);
  }
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  const paused = await seconds();
  await page.waitForTimeout(300);
  expect(await seconds()).toBe(paused);
  await setRange(preview.getByTestId('block-preview-scrub'), '2.5');
  await expect(preview.getByTestId('block-preview-time')).toHaveText('2.50 s');
  await expect(preview.getByTestId('block-preview')).toHaveAttribute('data-progress', '0.500');
  // The easing curve follows the preview: halfway through a smooth Write, half the progress.
  const curve = preview.getByTestId('block-easing-curve');
  await expect(curve).toHaveAttribute('data-easing', 'smooth');
  await expect(preview.getByTestId('block-easing-point')).toHaveAttribute('data-value', '0.500');
  await expect(preview.getByTestId('block-easing-readout')).toHaveText('t 50 % → 50 %');
  // Maximized, the picture takes the room, whole: still 16:9, the bar and the curve under it in
  // view, nothing to scroll.
  await page.getByTestId('block-preview-dialog-maximize').click();
  await expect(preview).toHaveClass(/is-maximized/);
  const whole = (await preview.getByTestId('block-preview-canvas').boundingBox())!;
  expect(whole.width).toBeGreaterThan(picture.width);
  expect(whole.width / whole.height).toBeCloseTo(16 / 9, 1);
  await expect(preview.getByTestId('block-easing-readout')).toBeInViewport({ ratio: 1 });
  expect(
    await preview.locator('.modal-body').evaluate((body) => body.scrollHeight - body.clientHeight),
  ).toBeLessThanOrEqual(1);
  await page.getByTestId('block-preview-dialog-maximize').click();
  await expect(preview).not.toHaveClass(/is-maximized/);

  // Escape closes the preview alone, and the focus is back on its button: the block's dialog is
  // there to go on with.
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(open).toBeFocused();
  // A change of easing in the fields is the curve the preview draws when it is opened again; one
  // undo step.
  await dialog.getByTestId('block-easing').selectOption('rush_into');
  await open.click();
  await expect(curve).toHaveAttribute('data-easing', 'rush_into');
  await preview.getByTestId('block-preview-play').click();
  await setRange(preview.getByTestId('block-preview-scrub'), '2.5');
  const rushed = Number(await preview.getByTestId('block-easing-point').getAttribute('data-value'));
  expect(rushed).toBeLessThan(0.5);
  await page.getByTestId('block-preview-dialog-close').click();
  await expect(preview).toHaveCount(0);
  await undo(page);
  await expect(dialog.getByTestId('block-easing')).toHaveValue('smooth');

  // Escape closes the dialog alone: the block stays selected in the panel.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByTestId('block-properties')).toBeVisible();
});

test('by default the dialog is wide and the formula to pick glyphs on has most of it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBlockScene(page, [appearJson('w', 1, 3, 'write', 'all')]);
  await blockLocator(page, 'w').dblclick();
  const dialog = page.getByTestId('block-dialog');
  await expect(dialog.locator('.block-dialog')).toHaveAttribute('data-shape', 'glyphs');
  const view = dialog.locator('.glyph-svg.is-large');
  const sizes = async () => ({
    dialog: (await dialog.boundingBox())!,
    fields: (await dialog.locator('.block-dialog-fields').boundingBox())!,
    view: (await view.boundingBox())!,
  });
  const wide = await sizes();
  // As wide as the window lets it be up to 1400 px; the fields keep a panel's width and the
  // formula has the rest, more than twice as much.
  expect(wide.dialog.width).toBe(1400);
  expect(wide.fields.width).toBeLessThanOrEqual(380);
  expect(wide.fields.width).toBeGreaterThanOrEqual(300);
  expect(wide.view.width).toBeGreaterThan(940);
  // Tall too, for a formula of several lines, and all of the picker in view: nothing to scroll.
  expect(wide.view.height).toBeGreaterThanOrEqual(400);
  await expect(dialog.getByTestId('block-glyphs-summary')).toBeInViewport({ ratio: 1 });
  expect(
    await dialog.locator('.modal-body').evaluate((body) => body.scrollHeight - body.clientHeight),
  ).toBeLessThanOrEqual(1);
  // A glyph is picked where it is drawn, at that size.
  await dialog.getByTestId('block-glyph-4').click();
  await expect(dialog.getByTestId('block-glyphs-summary')).toHaveText('1 glyph: 4');

  // In a smaller window the dialog keeps inside it, and the formula still has most of it.
  await page.setViewportSize({ width: 1100, height: 700 });
  const small = await sizes();
  expect(small.dialog.x).toBeGreaterThanOrEqual(0);
  expect(small.dialog.width).toBeLessThanOrEqual(1100 - 32);
  expect(small.dialog.y + small.dialog.height).toBeLessThanOrEqual(700);
  expect(small.view.width).toBeGreaterThan(small.fields.width * 1.5);
});

test('a formula of several lines is whole in view in the dialog: the view does not grow with it', async ({
  page,
}) => {
  // Six lines, far taller than wide: at the width of the view its own shape would make it
  // several times as tall as the window.
  const tall = String.raw`\begin{matrix}a\\b\\c\\d\\e\\f\end{matrix}`;
  await openRelationScene(
    page,
    [plain('a', 'fa', 't1', 0, 10, { actions: [appearJson('w', 1, 3, 'write', 'all')] })],
    {},
    [{ id: 'fa', name: 'f1', source: tall }],
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await blockLocator(page, 'w').dblclick();
  const dialog = page.getByTestId('block-dialog');
  const view = (await dialog.locator('.glyph-svg.is-large').boundingBox())!;
  const whole = (await dialog.boundingBox())!;
  expect(view.width).toBeGreaterThan(940);
  expect(view.height).toBeGreaterThanOrEqual(400);
  expect(view.height).toBeLessThanOrEqual(560);
  expect(whole.y + whole.height).toBeLessThanOrEqual(900);
  // Every glyph is drawn inside the view, and the rest of the picker is under it, in view.
  for (const index of [0, 5]) {
    const glyph = (await dialog.getByTestId(`block-glyph-${index}`).boundingBox())!;
    expect(glyph.y).toBeGreaterThanOrEqual(view.y);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(view.y + view.height);
  }
  await expect(dialog.getByTestId('block-glyphs-summary')).toBeInViewport({ ratio: 1 });
  expect(
    await dialog.locator('.modal-body').evaluate((body) => body.scrollHeight - body.clientHeight),
  ).toBeLessThanOrEqual(1);
  // Maximized, the view follows the dialog: taller, and still nothing to scroll.
  await page.getByTestId('block-dialog-maximize').click();
  const large = (await dialog.locator('.glyph-svg.is-large').boundingBox())!;
  expect(large.height).toBeGreaterThan(view.height);
  await expect(dialog.getByTestId('block-glyphs-summary')).toBeInViewport({ ratio: 1 });
});

test('Edit path… in the dialog of a Morph block closes it: the path is shaped in the preview', async ({
  page,
}) => {
  await openBlockScene(page, [morphJson('m', 3, 1.5, [{ from: [0], to: [4], style: null }])]);
  await blockLocator(page, 'm').dblclick();
  const dialog = page.getByTestId('block-dialog');
  await dialog.getByTestId('block-morph-pair-0-edit-path').click();
  const frame = page.getByTestId('preview-frame');
  await expect(frame).toHaveAttribute('data-path-edit', 'morph:m:0');
  // The mode takes the clicks of the preview, which the dialog covered: it is gone, and the
  // panel shows the block.
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('preview-hint')).toContainText('Edit path');
  await expect(page.getByTestId('block-properties')).toBeVisible();
  // Leaving the mode does not bring it back.
  await page.keyboard.press('Escape');
  await expect(frame).toHaveAttribute('data-path-edit', '');
  await expect(dialog).toHaveCount(0);
});

test('the dialog of a Morph block leads to its pair editor, and goes with its block', async ({
  page,
}) => {
  await openBlockScene(page, [morphJson('m', 2, 1)]);
  await blockLocator(page, 'm').dblclick();
  const dialog = page.getByTestId('block-dialog');
  await expect(dialog).toBeVisible();
  // No glyphs to pick on a morph: its pairs have an editor of their own, and the dialog is the
  // fields alone, a narrow one.
  await expect(dialog.getByTestId('block-dialog-whole')).toContainText('pair editor');
  await expect(dialog.getByTestId('block-dialog-glyphs')).toHaveCount(0);
  await expect(dialog.locator('.block-dialog')).toHaveAttribute('data-shape', 'fields');
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(520);
  const fields = (await dialog.locator('.block-dialog-fields').boundingBox())!;
  expect(fields.width).toBeGreaterThan(440);
  // Its preview opens from the title bar too, and closes alone.
  await dialog.getByTestId('block-preview-open').click();
  const preview = page.getByTestId('block-preview-dialog');
  await expect(preview.getByTestId('block-preview-canvas')).toBeVisible();
  await expect(preview.getByRole('heading')).toContainText('Preview · Morph');
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('block-morph-pairs').click();
  await expect(page.getByTestId('morph-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('morph-editor')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  // Deleting the block from the dialog takes the dialog with it.
  await dialog.getByTestId('block-delete').click();
  await holdToConfirm(page);
  await expect(dialog).toHaveCount(0);
});

test('with a scene camera, the preview of a block draws a clip that is outside Manim’s own frame', async ({
  page,
}) => {
  /** How many pixels of the block's preview are not the background: something is drawn. */
  const ink = async (camera: boolean): Promise<number> => {
    // The clip is 12 units to the right of the origin: the frame ends at 7.1.
    await openBlockScene(page, [appearJson('w', 1, 3, 'fade_in', 'all')], {
      clip: {
        initial: {
          position: [12, 0],
          scale: 1,
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 1,
          color: null,
          glyphColors: {},
        },
      },
      extra: camera
        ? { camera: { initial: { center: [0, 0], height: 8 }, targets: [], moves: [] } }
        : {},
    });
    await blockLocator(page, 'w').dblclick();
    await page.getByTestId('block-dialog').getByTestId('block-preview-open').click();
    const preview = page.getByTestId('block-preview-dialog');
    await expect(preview).toBeVisible();
    // Paused at the end of the block: its glyphs are on screen whole.
    await preview.getByTestId('block-preview-play').click();
    await setRange(preview.getByTestId('block-preview-scrub'), '4');
    await expect(preview.getByTestId('block-preview-time')).toHaveText('4.00 s');
    return preview.getByTestId('block-preview-canvas').evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i]! - data[0]!) + Math.abs(data[i + 1]! - data[1]!) > 60) count++;
      }
      return count;
    });
  };
  // Without a camera the scene ends at its frame, in the dialog as in the video: nothing there.
  expect(await ink(false)).toBe(0);
  // With the multicamera on the clip may be seen by a camera that goes there: it is drawn.
  expect(await ink(true)).toBeGreaterThan(200);
});
