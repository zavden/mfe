import { expect, test, type Page } from './test';
import type { MfeWindow } from './helpers';
import { openRelationScene, plain, relations, selectClip } from './relationsHelpers';

/* The transformation inside the relation editor (D156): the switch Link | Preview over the
 * drawing, the two formulas looping as the DRAFT would animate them, the bar that chooses the
 * instant. */

const A = plain('a', 'fa', 't1', 0, 8);
A.initial.position = [-2, 1];
const B = plain('b', 'fb', 't2', 2, 8);
B.initial.position = [2, -1];
/** A relation of the two with no pairs yet: its window runs from 2 s to 4 s. */
const RELATION = {
  id: 'r1',
  fromClipId: 'a',
  toClipId: 'b',
  offset: 0,
  duration: 2,
  easing: 'linear',
  style: 'transform',
  pathArc: 0,
  pairs: [],
};

/** How many pixels of the middle of the picture are not its background: something is drawn
 * between the two formulas, which sit in opposite corners. */
async function drawnInTheMiddle(page: Page): Promise<number> {
  return page.getByTestId('rel-preview-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const { width, height } = canvas;
    const x = Math.round(width * 0.38);
    const y = Math.round(height * 0.38);
    const { data } = canvas
      .getContext('2d')!
      .getImageData(x, y, Math.round(width * 0.24), Math.round(height * 0.24));
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! + data[i + 1]! + data[i + 2]! > 96) lit += 1;
    }
    return lit;
  });
}

const seconds = async (page: Page) =>
  Number((await page.getByTestId('rel-preview-time').textContent())!.replace(' s', ''));

test('the editor shows the transformation of its draft: a switch, a loop, a bar for the instant', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], { relations: [RELATION] });
  await selectClip(page, 'a');
  await page.getByTestId('relation-edit-r1').click();
  const editor = page.getByTestId('relation-editor');
  await expect(editor).toBeVisible();

  // It opens on the drawing to link glyphs; the switch puts the transformation in its place.
  await expect(editor.getByTestId('rel-view-link')).toHaveAttribute('aria-checked', 'true');
  await expect(editor.getByTestId('rel-link')).toBeVisible();
  await expect(editor.getByTestId('rel-preview')).toHaveCount(0);
  await editor.getByTestId('rel-view-preview').click();
  const preview = editor.getByTestId('rel-preview');
  await expect(preview).toBeVisible();
  await expect(editor.getByTestId('rel-link')).toHaveCount(0);
  await expect(editor.getByTestId('rel-from-glyph-0')).toHaveCount(0);
  // The side column stays.
  await expect(editor.getByTestId('rel-pairs')).toBeVisible();
  const picture = (await preview.getByTestId('rel-preview-canvas').boundingBox())!;
  expect(picture.width / picture.height).toBeCloseTo(16 / 9, 1);

  // It loops by itself, from a little before the window (2–4 s) to a little after it.
  const play = preview.getByTestId('rel-preview-play');
  const scrub = preview.getByTestId('rel-preview-scrub');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(scrub).toHaveAttribute('min', '1.5');
  await expect(scrub).toHaveAttribute('max', '4.5');
  const first = await seconds(page);
  await expect.poll(() => seconds(page)).not.toBe(first);

  // The bar chooses an instant and stops the loop: the middle of the transformation.
  await scrub.fill('3');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(preview.getByTestId('rel-preview-time')).toHaveText('3.00 s');
  await expect(preview.getByTestId('rel-preview-progress')).toHaveText('50%');
  await expect(preview).toHaveAttribute('data-progress', '0.500');
  // Both formulas are drawn, in their corners: with no pair nothing crosses the middle.
  expect(Number(await preview.getAttribute('data-drawn'))).toBeGreaterThan(0);
  expect(await drawnInTheMiddle(page)).toBe(0);

  // A pair linked in the draft — nothing saved — is in the picture at once: back on Preview,
  // which is still at the instant it was left on, a glyph is half way between the two.
  await editor.getByTestId('rel-view-link').click();
  await expect(preview).toHaveCount(0);
  await editor.getByTestId('rel-from-glyph-0').click();
  await editor.getByTestId('rel-to-glyph-0').click();
  await expect(editor.getByTestId('rel-pair-0')).toBeVisible();
  await editor.getByTestId('rel-view-preview').click();
  await expect(preview.getByTestId('rel-preview-time')).toHaveText('3.00 s');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => drawnInTheMiddle(page)).toBeGreaterThan(0);
  expect((await relations(page))[0]!.pairs).toHaveLength(0);

  // A change in the side column shows without leaving the preview: a longer window moves the
  // bar's end and the instant is another share of it.
  await editor.getByTestId('rel-side-tab-animation').click();
  await editor.getByTestId('rel-duration').fill('4');
  await editor.getByTestId('rel-duration').press('Enter');
  await expect(scrub).toHaveAttribute('max', '6.5');
  await expect(preview.getByTestId('rel-preview-progress')).toHaveText('25%');

  // Play goes on from there.
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => seconds(page)).not.toBe(3);

  // Maximized, the picture takes the room, whole and still 16:9, its bar in view.
  await page.getByTestId('relation-editor-maximize').click();
  const whole = (await preview.getByTestId('rel-preview-canvas').boundingBox())!;
  expect(whole.width).toBeGreaterThan(picture.width);
  expect(whole.width / whole.height).toBeCloseTo(16 / 9, 1);
  await expect(scrub).toBeInViewport({ ratio: 1 });
  await page.getByTestId('relation-editor-maximize').click();

  // Saved from the preview, the relation has the pair it showed.
  await editor.getByTestId('rel-save').click();
  await expect(editor).toBeHidden();
  const saved = (await relations(page))[0]!;
  expect(saved.pairs).toHaveLength(1);
  expect(saved.duration).toBe(4);
});

/** How many pixels of `canvas` are lit in a square of `half` CSS pixels around a point of the
 * page. */
async function litAround(
  page: Page,
  testId: string,
  point: { x: number; y: number },
  half = 7,
): Promise<number> {
  return page.getByTestId(testId).evaluate(
    (element, { point, half }) => {
      const canvas = element as HTMLCanvasElement;
      const box = canvas.getBoundingClientRect();
      const ratio = canvas.width / box.width;
      const x = Math.round((point.x - box.left - half) * ratio);
      const y = Math.round((point.y - box.top - half) * ratio);
      const size = Math.round(2 * half * ratio);
      const { data } = canvas.getContext('2d')!.getImageData(x, y, size, size);
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! + data[i + 1]! + data[i + 2]! > 96) lit += 1;
      }
      return lit;
    },
    { point, half },
  );
}

const centre = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

test('the raw preview animates the drawing itself: straight, a ghost of the target, the absent dashed', async ({
  page,
}) => {
  // One pair, a → a, with a path of its own under a relation with an arc: neither shows raw.
  await openRelationScene(page, [A, B], {
    relations: [
      {
        ...RELATION,
        pathArc: 60,
        pairs: [
          {
            from: [0],
            to: [0],
            style: null,
            path: {
              nodes: [
                { at: [0, 0], in: null, out: [0.3, 0.6], smooth: false },
                { at: [1, 0], in: [0.7, 0.6], out: null, smooth: false },
              ],
            },
          },
        ],
      },
    ],
  });
  // The last glyph of the target is hidden at the start, and nothing shows it.
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
      d.formulas.find((f) => f.id === 'fb')!.hiddenGlyphs = [4];
    });
  });
  await selectClip(page, 'a');
  await page.getByTestId('relation-edit-r1').click();
  const editor = page.getByTestId('relation-editor');
  await expect(editor).toBeVisible();

  // Where the drawing has the pair's two glyphs, and its own box.
  const drawing = (await editor.getByTestId('rel-canvas').boundingBox())!;
  const source = centre((await editor.getByTestId('rel-from-glyph-0').boundingBox())!);
  const target = centre((await editor.getByTestId('rel-to-glyph-0').boundingBox())!);
  const hidden = centre((await editor.getByTestId('rel-to-glyph-4').boundingBox())!);

  // Its key is the last of the toolbar; the canvas takes the box of the drawing, the bar of the
  // loop the place of the toolbar, and the key that ends it the focus.
  await editor.getByTestId('rel-raw-open').click();
  const canvas = editor.getByTestId('rel-raw-canvas');
  await expect(canvas).toBeVisible();
  await expect(editor.getByTestId('rel-canvas')).toHaveCount(0);
  await expect(editor.getByTestId('rel-link')).toHaveCount(0);
  await expect(editor.getByTestId('rel-raw-bar')).toBeVisible();
  await expect(editor.getByTestId('rel-raw-end')).toBeFocused();
  await expect(editor.getByTestId('rel-view-link')).toHaveAttribute('aria-checked', 'true');
  const box = (await canvas.boundingBox())!;
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(box[side] - drawing[side])).toBeLessThanOrEqual(1);
  }

  // It loops; the bar stops it. At the end the glyph is where the drawing has it in the target,
  // and has left the source.
  const play = editor.getByTestId('rel-raw-play');
  const scrub = editor.getByTestId('rel-raw-scrub');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await scrub.fill('4.5');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(editor.getByTestId('rel-raw-progress')).toHaveText('100%');
  await expect.poll(() => litAround(page, 'rel-raw-canvas', target)).toBeGreaterThan(0);
  expect(await litAround(page, 'rel-raw-canvas', source)).toBe(0);

  // Before the transformation the source is whole on top, and the target is a ghost below: the
  // glyph's place there is lit, but not as a glyph on screen is.
  await scrub.fill('1.5');
  await expect(editor.getByTestId('rel-raw-progress')).toHaveText('0%');
  await expect.poll(() => litAround(page, 'rel-raw-canvas', source)).toBeGreaterThan(0);
  expect(Number(await canvas.getAttribute('data-ghosts'))).toBeGreaterThan(0);
  const ghost = await canvas.evaluate((element, point) => {
    const c = element as HTMLCanvasElement;
    const rect = c.getBoundingClientRect();
    const ratio = c.width / rect.width;
    const x = Math.round((point.x - rect.left - 12) * ratio);
    const y = Math.round((point.y - rect.top - 12) * ratio);
    const size = Math.round(24 * ratio);
    const { data } = c.getContext('2d')!.getImageData(x, y, size, size);
    let brightest = 0;
    for (let i = 0; i < data.length; i += 4) {
      brightest = Math.max(brightest, data[i]! + data[i + 1]! + data[i + 2]!);
    }
    return brightest;
  }, target);
  expect(ghost).toBeGreaterThan(60);
  expect(ghost).toBeLessThan(3 * 255 * 0.75);

  // Half way through (the easing is linear) the glyph is half way along the straight line
  // between the two: the arc and the pair's own path would carry it far from there.
  await scrub.fill('3');
  await expect(editor.getByTestId('rel-raw-progress')).toHaveText('50%');
  const middle = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  await expect.poll(() => litAround(page, 'rel-raw-canvas', middle, 9)).toBeGreaterThan(0);

  // The glyph nothing shows is outlined, dashed, all along: a few of its pixels, not a fill.
  expect(await canvas.getAttribute('data-absent')).toBe('1');
  const outline = await litAround(page, 'rel-raw-canvas', hidden, 14);
  expect(outline).toBeGreaterThan(0);

  // Escape ends the preview and leaves the editor open, the focus back on the key.
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('rel-canvas')).toBeVisible();
  await expect(editor.getByTestId('rel-raw-open')).toBeFocused();
  // Its key ends it too; and the switch to Preview ends it: back on Link, the drawing is there.
  await editor.getByTestId('rel-raw-open').click();
  await editor.getByTestId('rel-raw-end').click();
  await expect(canvas).toHaveCount(0);
  await editor.getByTestId('rel-raw-open').click();
  await expect(canvas).toBeVisible();
  await editor.getByTestId('rel-view-preview').click();
  await expect(canvas).toHaveCount(0);
  await expect(editor.getByTestId('rel-preview')).toBeVisible();
  await editor.getByTestId('rel-view-link').click();
  await expect(editor.getByTestId('rel-canvas')).toBeVisible();
  // Nothing of it reached the project, and now Escape closes the editor.
  expect((await relations(page))[0]!.pathArc).toBe(60);
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
});
