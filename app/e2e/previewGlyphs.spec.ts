import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import {
  canUndo,
  getProject,
  onSystem,
  openSubmenu,
  openWithProject,
  readExample,
  selectionOf,
  setTime,
  undo,
  type MfeWindow,
} from './helpers';
import { clickScene, openTwoApart, pressAndMove, scenePoint, type Point } from './previewHelpers';

/* A brace and a shape over glyphs picked in two formulas (D117) are at the end of the file: one
 * object attached to them all, which stays, detached, when one of the formulas is deleted.
 *
 * The glyph pick of the preview (D74): Alt+click picks a glyph of a formula (again takes it out,
 * Shift takes a range), Alt+drag from a formula draws a rectangle that picks the glyphs it
 * touches (Shift adds them), Esc clears it; Alt on empty space still pans. The glyphs can be of
 * several formulas (D117), whose clips are the selection meanwhile. The pick is read from the
 * frame's `data-glyph-pick` (`ca:1,2;cb:0`). Then what the pick
 * takes: a colour, hiding at the start, a brace or a shape — from the bar in the corner, the
 * right-click menu on a picked glyph and the clip's own menu, whose dialog starts from it — and
 * its colours copied as a sequence and pasted onto the same symbols of another object (D92). */

const frame = (page: Page) => page.getByTestId('preview-frame');

const ids = async (page: Page) => {
  const selection = await selectionOf(page);
  return selection.kind === 'clips' ? selection.ids : selection.kind;
};

/** Scene point of the centre of glyph `index` of clip `clipId` (the clip unscaled, unturned). */
async function glyphAt(page: Page, clipId: string, index: number): Promise<Point> {
  return page.evaluate(
    ([clip, glyph]) => {
      const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
        formulas: { id: string; snapshot: { glyphs: { center: [number, number] }[] } | null }[];
        clips: { id: string; formulaId: string; initial: { position: [number, number] } }[];
      };
      const c = p.clips.find((x) => x.id === clip)!;
      const g = p.formulas.find((f) => f.id === c.formulaId)!.snapshot!.glyphs[glyph]!;
      return [c.initial.position[0] + g.center[0], c.initial.position[1] + g.center[1]] as Point;
    },
    [clipId, index] as const,
  );
}

/** How many glyphs the snapshot of formula `id` has (0 while it has none). */
const glyphCount = (page: Page, id: string) =>
  page.evaluate((formulaId) => {
    const { project } = (window as MfeWindow).__mfe!.useProjectStore.getState();
    const formulas = project.formulas as unknown as {
      id: string;
      snapshot: { glyphs: unknown[] } | null;
    }[];
    return formulas.find((f) => f.id === formulaId)?.snapshot?.glyphs.length ?? 0;
  }, id);

/** How many pixels of the preview canvas are the colour `hex` ('#rrggbb'), or within `tolerance`
 * of it in every channel: the core of a line drawn in it, whatever its edges blend into. */
const pixelsNear = (page: Page, hex: string, tolerance = 24) =>
  page.evaluate(
    ([color, within]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (rgb.every((channel, k) => Math.abs(data[i + k]! - channel) <= within)) count += 1;
      }
      return count;
    },
    [hex, tolerance] as const,
  );

async function altShiftClick(page: Page, point: Point): Promise<void> {
  const { x, y } = await scenePoint(page, point);
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
}

test.describe('Preview glyph pick', () => {
  test('Alt+click picks a glyph, again takes it out, Shift takes a range; Esc clears; no undo step', async ({
    page,
  }) => {
    await openTwoApart(page);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    // Alt held shows what it does; released, the hint goes.
    await page.keyboard.down('Alt');
    await expect(page.getByTestId('preview-glyph-hint')).toContainText(
      onSystem('Alt+click a glyph', '⌥+click a glyph'),
    );
    await page.keyboard.up('Alt');
    await expect(page.getByTestId('preview-glyph-hint')).toHaveCount(0);

    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1');
    expect(await ids(page)).toEqual(['ca']);
    await expect(page.getByTestId('preview-glyph-hint')).toContainText('1 glyph of alpha: 1');
    await clickScene(page, await glyphAt(page, 'ca', 3), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,3');
    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:3');
    // The range from the last clicked glyph (1) to this one joins the pick.
    await altShiftClick(page, await glyphAt(page, 'ca', 0));
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:0,1,3');
    await expect(page.getByTestId('preview-glyph-hint')).toContainText(
      '3 glyphs of alpha: 0, 1, 3',
    );
    expect(await canUndo(page)).toBe(false);

    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    expect(await ids(page)).toEqual(['ca']);
  });

  test('Alt+drag from a formula picks the glyphs the rectangle touches, of every formula; Shift adds; Esc restores', async ({
    page,
  }) => {
    await openTwoApart(page);
    const c1 = await glyphAt(page, 'ca', 1);
    const c2 = await glyphAt(page, 'ca', 2);
    await pressAndMove(page, c1, c2, 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    await expect(frame(page)).not.toHaveAttribute('data-marquee', '');
    expect(await ids(page)).toEqual(['ca']);
    // Grown over beta: the rest of alpha's glyphs join, and beta's with them; the two formulas
    // are the selection.
    const far = await scenePoint(page, [5, -1]);
    await page.mouse.move(far.x, far.y, { steps: 4 });
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2,3,4;cb:0,1,2,3');
    expect(await ids(page)).toEqual(['ca', 'cb']);
    // Back over alpha alone: beta's glyphs leave, and its clip the selection.
    const near = await scenePoint(page, c2);
    await page.mouse.move(near.x, near.y, { steps: 4 });
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    expect(await ids(page)).toEqual(['ca']);
    await page.mouse.move(far.x, far.y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2,3,4;cb:0,1,2,3');

    // Alt+Shift+drag adds what it touches.
    const c0 = await scenePoint(page, await glyphAt(page, 'ca', 0));
    await page.keyboard.down('Alt');
    await page.keyboard.down('Shift');
    await page.mouse.move(c0.x, c0.y);
    await page.mouse.down();
    await page.mouse.move(c0.x + 8, c0.y + 6, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:0,1,2,3,4;cb:0,1,2,3');

    // Escape while the rectangle is drawn brings back the pick from before, and the selection
    // it was a part of.
    await pressAndMove(page, c1, c2, 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    expect(await ids(page)).toEqual(['ca']);
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:0,1,2,3,4;cb:0,1,2,3');
    expect(await ids(page)).toEqual(['ca', 'cb']);
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    await page.mouse.move(far.x, far.y, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:0,1,2,3,4;cb:0,1,2,3');
    expect(await canUndo(page)).toBe(false);
  });

  test('the picked glyphs, and the rectangle that picks them, wear the glyph selection colour of the Preferences', async ({
    page,
  }) => {
    await openTwoApart(page);
    const YELLOW = '#ffe74c';
    const MAGENTA = '#ff5c8d';
    expect(await pixelsNear(page, YELLOW)).toBe(0);
    // Yellow, the colour of the guides, until another is chosen.
    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await clickScene(page, await glyphAt(page, 'ca', 3), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,3');
    await expect.poll(() => pixelsNear(page, YELLOW)).toBeGreaterThan(20);
    expect(await pixelsNear(page, MAGENTA)).toBe(0);

    // The preference repaints the pick as it is.
    await page.getByTestId('menu-preferences').click();
    await page.getByTestId('menu-item-preferences-pick-color').hover();
    await page.getByTestId('menu-item-preferences-pick-color-magenta').click();
    await expect.poll(() => pixelsNear(page, MAGENTA)).toBeGreaterThan(20);
    expect(await pixelsNear(page, YELLOW)).toBe(0);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,3');

    // The rectangle of Alt+drag wears it too. Its faint fill over the black scene is a tenth of
    // the colour: a wash of that tint as large as the rectangle, and none of it before or after.
    const WASH = '#1a090e';
    const wash = () => pixelsNear(page, WASH, 3);
    await page.keyboard.press('Escape');
    await expect.poll(() => pixelsNear(page, MAGENTA)).toBe(0);
    expect(await wash()).toBe(0);
    const from = await glyphAt(page, 'ca', 1);
    await pressAndMove(page, from, [from[0] + 1.2, from[1] - 1.6], 'Alt');
    await expect(frame(page)).not.toHaveAttribute('data-marquee', '');
    await expect(frame(page)).not.toHaveAttribute('data-glyph-pick', '');
    await expect.poll(wash).toBeGreaterThan(2000);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    // (A few pixels of the edges of the picked glyphs fall in that tint: not a wash.)
    await expect.poll(wash).toBeLessThan(200);
    // What it picked stays, in the colour.
    await expect.poll(() => pixelsNear(page, MAGENTA)).toBeGreaterThan(20);

    // A rectangle that selects clips keeps the accent: nothing of the colour of the picks.
    await pressAndMove(page, [0, -3.5], [1.4, -2.3]);
    await expect(frame(page)).not.toHaveAttribute('data-marquee', '');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await expect.poll(() => pixelsNear(page, MAGENTA)).toBe(0);
    expect(await wash()).toBe(0);
    await page.mouse.up();
  });

  test('Alt+click on another formula adds its glyph to the pick, and the picked formulas are the selection', async ({
    page,
  }) => {
    await openTwoApart(page);
    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1');
    await clickScene(page, await glyphAt(page, 'cb', 0), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1;cb:0');
    expect(await ids(page)).toEqual(['ca', 'cb']);
    await expect(page.getByTestId('preview-glyph-hint')).toContainText('2 glyphs of 2 formulas');
    // The bar is the pick's: the one of the selected clips (align, distribute) gives way to it.
    await expect(page.getByTestId('glyph-pick-count')).toHaveText('2 glyphs of 2 formulas');
    await expect(page.getByTestId('preview-actions')).toHaveCount(0);
    // A range is of one formula: from the glyph last picked in beta, whatever alpha has.
    await altShiftClick(page, await glyphAt(page, 'cb', 2));
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1;cb:0,1,2');
    // Alpha's only glyph leaves: so does its clip. A glyph of it picked again joins last.
    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'cb:0,1,2');
    expect(await ids(page)).toEqual(['cb']);
    await clickScene(page, await glyphAt(page, 'ca', 3), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'cb:0,1,2;ca:3');
    expect(await ids(page)).toEqual(['cb', 'ca']);
    expect(await canUndo(page)).toBe(false);
    // Esc clears the pick; the formulas stay selected, with their own bar back.
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    expect(await ids(page)).toEqual(['cb', 'ca']);
    await expect(page.getByTestId('glyph-pick')).toHaveCount(0);
    await expect(page.getByTestId('preview-actions')).toBeVisible();
  });

  test('a pick goes with the selection it is a part of', async ({ page }) => {
    await openTwoApart(page);
    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await clickScene(page, await glyphAt(page, 'cb', 0), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1;cb:0');
    // A plain click on one of the formulas selects it alone: the pick was of the two.
    await clickScene(page, [-3, 0]);
    expect(await ids(page)).toEqual(['ca']);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await clickScene(page, await glyphAt(page, 'cb', 0), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'cb:0');
    expect(await ids(page)).toEqual(['cb']);
    // Shift+click adds a clip that has no picked glyph: the selection is not the pick's any more.
    await clickScene(page, [-3, 0], 'Shift');
    expect(await ids(page)).toEqual(['cb', 'ca']);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await clickScene(page, [0, 3]);
    expect(await ids(page)).toBe('none');
  });

  test('Alt+drag on empty space pans and keeps the pick', async ({ page }) => {
    await openTwoApart(page);
    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1');
    const before = await frame(page).getAttribute('data-center');
    await pressAndMove(page, [0, 3], [1, 2], 'Alt');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    expect(await frame(page).getAttribute('data-center')).not.toBe(before);
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1');
    expect(await ids(page)).toEqual(['ca']);
  });
});

test.describe('Preview glyph pick actions', () => {
  /** Right-click a point of the scene. */
  const rightClick = async (page: Page, point: Point) => {
    const { x, y } = await scenePoint(page, point);
    await page.mouse.click(x, y, { button: 'right' });
  };
  const formulaOf = async (page: Page, id: string) =>
    (await getProject(page)).formulas.find((f) => f.id === id)!;

  test('the bar colours the picked glyphs as one undo step, and hides them at the start', async ({
    page,
  }) => {
    await openTwoApart(page);
    await pressAndMove(page, await glyphAt(page, 'ca', 1), await glyphAt(page, 'ca', 2), 'Alt');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    await expect(page.getByTestId('glyph-pick-count')).toHaveText('2 glyphs of alpha: 1, 2');
    await page.getByTestId('glyph-pick-color').click();
    await page.getByTestId('glyph-pick-color-menu-color-RED').click();
    expect((await formulaOf(page, 'fa')).glyphColors).toEqual({ '1': '#FC6255', '2': '#FC6255' });
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    expect(await canUndo(page)).toBe(true);
    await undo(page);
    expect((await formulaOf(page, 'fa')).glyphColors).toEqual({});
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    // The right-click menu on a picked glyph: the same items, and hiding at the start.
    await rightClick(page, await glyphAt(page, 'ca', 1));
    await expect(page.getByTestId('glyph-pick-menu')).toBeVisible();
    await expect(page.getByTestId('glyph-pick-menu-header')).toHaveText('2 glyphs of alpha: 1, 2');
    await page.getByTestId('glyph-pick-menu-hide').click();
    expect((await formulaOf(page, 'fa')).hiddenGlyphs).toEqual([1, 2]);
    await page.getByTestId('glyph-pick-color').click();
    await expect(page.getByTestId('glyph-pick-color-menu-hide')).toBeDisabled();
    await page.getByTestId('glyph-pick-color-menu-show').click();
    expect((await formulaOf(page, 'fa')).hiddenGlyphs).toEqual([]);
  });

  test('glyphs picked in two formulas take a colour as one undo step, from the bar and from their menu, and nothing of one formula', async ({
    page,
  }) => {
    await openTwoApart(page);
    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await clickScene(page, await glyphAt(page, 'cb', 0), 'Alt');
    await clickScene(page, await glyphAt(page, 'cb', 2), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1;cb:0,2');
    const colours = async () => [
      (await formulaOf(page, 'fa')).glyphColors,
      (await formulaOf(page, 'fb')).glyphColors,
    ];
    // The bar's Colour menu: the palette and Clear colour, without what is of one formula.
    await page.getByTestId('glyph-pick-color').click();
    await expect(page.getByTestId('glyph-pick-color-menu-header')).toHaveText(
      '3 glyphs of 2 formulas',
    );
    await expect(page.getByTestId('glyph-pick-color-menu-clear-color')).toBeDisabled();
    for (const item of ['hide', 'show', 'copy-sequence', 'paste-sequence'])
      await expect(page.getByTestId(`glyph-pick-color-menu-${item}`)).toHaveCount(0);
    await page.getByTestId('glyph-pick-color-menu-color-RED').click();
    expect(await colours()).toEqual([{ '1': '#FC6255' }, { '0': '#FC6255', '2': '#FC6255' }]);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1;cb:0,2');
    await undo(page);
    expect(await colours()).toEqual([{}, {}]);
    expect(await canUndo(page)).toBe(false);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1;cb:0,2');
    // The right-click menu on a picked glyph is the pick's, of the two formulas.
    await rightClick(page, await glyphAt(page, 'cb', 2));
    await expect(page.getByTestId('glyph-pick-menu-header')).toHaveText('3 glyphs of 2 formulas');
    for (const item of ['hide', 'show', 'copy-sequence', 'paste-sequence'])
      await expect(page.getByTestId(`glyph-pick-menu-${item}`)).toHaveCount(0);
    await openSubmenu(page, 'glyph-pick-menu-color');
    await page.getByTestId('glyph-pick-menu-color-BLUE').click();
    expect(await colours()).toEqual([{ '1': '#58C4DD' }, { '0': '#58C4DD', '2': '#58C4DD' }]);
    await rightClick(page, await glyphAt(page, 'ca', 1));
    await openSubmenu(page, 'glyph-pick-menu-color');
    await page.getByTestId('glyph-pick-menu-clear-color').click();
    expect(await colours()).toEqual([{}, {}]);
    // Off the picked glyphs, the right-click menu is the clips': about them, not about the pick.
    await rightClick(page, await glyphAt(page, 'ca', 4));
    await expect(page.getByTestId('preview-menu')).toBeVisible();
    await expect(page.getByTestId('preview-menu')).not.toContainText('on the selected glyphs');
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1;cb:0,2');
  });

  test('a single picked glyph gives its colour to the clipboard, and a colour typed as hexadecimal goes on the pick', async ({
    page,
  }) => {
    // The system clipboard is not the test's to write: what the page would put there is kept.
    await page.addInitScript(() => {
      const kept = window as unknown as { copied: string[] };
      kept.copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            kept.copied.push(text);
            return Promise.resolve();
          },
        },
      });
    });
    const copied = () => page.evaluate(() => (window as unknown as { copied: string[] }).copied);
    await openTwoApart(page);
    await clickScene(page, await glyphAt(page, 'ca', 1), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1');
    // A glyph without a colour of its own is seen in its object's: that is what would be copied.
    await rightClick(page, await glyphAt(page, 'ca', 1));
    await expect(page.getByTestId('glyph-pick-menu-copy-colour-value')).toHaveText('#FFFFFF');
    // «Colour ›» takes a colour typed as hexadecimal — without the #, in lower case —: Enter.
    await openSubmenu(page, 'glyph-pick-menu-color');
    await expect(page.getByTestId('glyph-pick-menu-color-hex-apply')).toBeDisabled();
    await page.getByTestId('glyph-pick-menu-color-hex').fill('12ab9f');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('glyph-pick-menu')).toHaveCount(0);
    expect((await formulaOf(page, 'fa')).glyphColors).toEqual({ '1': '#12AB9F' });
    // Now the glyph has a colour of its own: «Copy colour to clipboard» copies that one.
    await rightClick(page, await glyphAt(page, 'ca', 1));
    await expect(page.getByTestId('glyph-pick-menu-copy-colour-value')).toHaveText('#12AB9F');
    await page.getByTestId('glyph-pick-menu-copy-colour').click();
    await expect(page.getByTestId('glyph-pick-menu')).toHaveCount(0);
    await expect.poll(copied).toEqual(['#12AB9F']);
    // The bar's Colour menu has both: the entry, and the field with its Apply.
    await page.getByTestId('glyph-pick-color').click();
    await page.getByTestId('glyph-pick-color-menu-copy-colour').click();
    await expect.poll(copied).toEqual(['#12AB9F', '#12AB9F']);
    await page.getByTestId('glyph-pick-color').click();
    await page.getByTestId('glyph-pick-color-menu-color-hex').fill('#f0a');
    await page.getByTestId('glyph-pick-color-menu-color-hex-apply').click();
    expect((await formulaOf(page, 'fa')).glyphColors).toEqual({ '1': '#FF00AA' });
    // Each colour is one undo step.
    await undo(page);
    expect((await formulaOf(page, 'fa')).glyphColors).toEqual({ '1': '#12AB9F' });
    await undo(page);
    expect((await formulaOf(page, 'fa')).glyphColors).toEqual({});
    expect(await canUndo(page)).toBe(false);
    // With two glyphs picked there is no colour to copy: the entry is not there, the field is.
    await altShiftClick(page, await glyphAt(page, 'ca', 2));
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    await rightClick(page, await glyphAt(page, 'ca', 1));
    await expect(page.getByTestId('glyph-pick-menu-copy-sequence')).toBeVisible();
    await expect(page.getByTestId('glyph-pick-menu-copy-colour')).toHaveCount(0);
    await openSubmenu(page, 'glyph-pick-menu-color');
    await page.getByTestId('glyph-pick-menu-color-hex').fill('#83C167');
    await page.keyboard.press('Enter');
    expect((await formulaOf(page, 'fa')).glyphColors).toEqual({ '1': '#83C167', '2': '#83C167' });
  });

  test('a brace from the bar and a shape from the glyph menu go on the picked glyphs; the new clip is selected and the pick goes', async ({
    page,
  }) => {
    await openTwoApart(page);
    await pressAndMove(page, await glyphAt(page, 'ca', 1), await glyphAt(page, 'ca', 2), 'Alt');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    await page.getByTestId('glyph-pick-brace').click();
    await page.getByTestId('glyph-pick-brace-down').click();
    const brace = (await getProject(page)).clips.at(-1)!;
    expect(brace.attach).toEqual({
      clipId: 'ca',
      glyphs: [1, 2],
      rule: 'brace',
      direction: 0,
      buff: 0.2,
    });
    expect(await ids(page)).toEqual([brace.id]);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await expect(page.getByTestId('glyph-pick')).toHaveCount(0);
    // On beta: "t" (glyph 2) and "a" picked, then the box from the menu on the "t".
    await clickScene(page, await glyphAt(page, 'cb', 2), 'Alt');
    await clickScene(page, await glyphAt(page, 'cb', 3), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'cb:2,3');
    await rightClick(page, await glyphAt(page, 'cb', 2));
    await openSubmenu(page, 'glyph-pick-menu-shape');
    await page.getByTestId('glyph-pick-menu-shape-box').click();
    const shape = (await getProject(page)).clips.at(-1)!;
    expect(shape.attach).toEqual({ clipId: 'cb', glyphs: [2, 3], rule: 'shape', buff: 0.1 });
    expect(await ids(page)).toEqual([shape.id]);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
  });

  test('the clip menu acts on the picked glyphs, and «On some glyphs…» opens the dialog on them', async ({
    page,
  }) => {
    await openTwoApart(page);
    await pressAndMove(page, await glyphAt(page, 'ca', 1), await glyphAt(page, 'ca', 2), 'Alt');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    // A right-click on the formula off its picked glyphs (the last "a"): the clip's menu, on the
    // pick.
    await rightClick(page, await glyphAt(page, 'ca', 4));
    const menu = page.getByTestId('preview-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Add brace · on the selected glyphs');
    await openSubmenu(page, 'preview-menu-shape');
    await page.getByTestId('preview-menu-shape-glyphs').click();
    await expect(page.getByTestId('shape-glyphs-dialog')).toBeVisible();
    await expect(page.getByTestId('shape-glyphs-summary')).toHaveText('2 glyphs: 1, 2');
    await page.getByTestId('shape-glyphs-cancel').click();
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1,2');
    await rightClick(page, await glyphAt(page, 'ca', 4));
    await openSubmenu(page, 'preview-menu-brace');
    await page.getByTestId('preview-menu-brace-up').click();
    const brace = (await getProject(page)).clips.at(-1)!;
    expect(brace.attach).toMatchObject({
      clipId: 'ca',
      glyphs: [1, 2],
      rule: 'brace',
      direction: 180,
    });
    // The brace's clip is the selection now, so the pick went: the menu's groups are the plain
    // ones again, on the whole object.
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await rightClick(page, await glyphAt(page, 'ca', 4));
    await expect(menu).toContainText('Add brace');
    await expect(menu).not.toContainText('on the selected glyphs');
    await page.keyboard.press('Escape');
  });

  test('a colour sequence goes from the picked glyphs of a formula onto the same formula inside a text, as one undo step', async ({
    page,
  }) => {
    // examples/text-title: the formula «x^2+bx+c», and a text that ends with «$x^2+bx+c$».
    await openWithProject(page, readExample('text-title.mfe.json'));
    await setTime(page, 4);
    await expect.poll(() => glyphCount(page, 'f_sum')).toBe(7);
    await expect.poll(() => glyphCount(page, 'f_title')).toBeGreaterThan(7);
    const total = await glyphCount(page, 'f_title');
    await waitForDrawables(page, total + 7);
    /** The glyphs of the formula inside the text: its last seven. */
    const inText = Array.from({ length: 7 }, (_, i) => total - 7 + i);
    // The formula is x ² + b x + c: the first x red, the ² blue, the second x green.
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((project) => {
        const formulas = project.formulas as unknown as {
          id: string;
          glyphColors: Record<string, string>;
        }[];
        formulas.find((f) => f.id === 'f_sum')!.glyphColors = {
          '0': '#FC6255',
          '1': '#58C4DD',
          '4': '#83C167',
        };
      });
    });
    const before = (await formulaOf(page, 'f_title')).glyphColors;
    await clickScene(page, await glyphAt(page, 'c_sum', 0), 'Alt');
    await altShiftClick(page, await glyphAt(page, 'c_sum', 6));
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'c_sum:0,1,2,3,4,5,6');
    // Nothing is copied yet: Paste is off and says so. Copy, from the bar's Colour menu.
    await page.getByTestId('glyph-pick-color').click();
    await expect(page.getByTestId('glyph-pick-color-menu-paste-sequence')).toBeDisabled();
    await expect(page.getByTestId('glyph-pick-color-menu-paste-sequence-note')).toHaveText(
      'Nothing copied yet.',
    );
    await page.getByTestId('glyph-pick-color-menu-copy-sequence').click();
    await expect(page.getByTestId('glyph-pick-color-menu')).toHaveCount(0);
    // The same formula inside the text, picked on its own (Esc lets the formula's glyphs go: an
    // Alt+click would add the text's to them); Paste, from the menu of its picked glyphs.
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await clickScene(page, await glyphAt(page, 'c_title', inText[0]!), 'Alt');
    await altShiftClick(page, await glyphAt(page, 'c_title', inText[6]!));
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', `c_title:${inText.join(',')}`);
    const paste = page.getByTestId('glyph-pick-menu-paste-sequence');
    const note = page.getByTestId('glyph-pick-menu-paste-sequence-note');
    await rightClick(page, await glyphAt(page, 'c_title', inText[0]!));
    await expect(note).toHaveText('7 glyphs of sum, 3 coloured.');
    await paste.click();
    await expect(page.getByTestId('glyph-pick-menu')).toHaveCount(0);
    expect((await formulaOf(page, 'f_title')).glyphColors).toEqual({
      ...before,
      [inText[0]!]: '#FC6255',
      [inText[1]!]: '#58C4DD',
      [inText[4]!]: '#83C167',
    });
    await undo(page);
    expect((await formulaOf(page, 'f_title')).glyphColors).toEqual(before);
    // One glyph more in the pick: the sequence does not go, and the menu says why.
    await clickScene(page, await glyphAt(page, 'c_title', 0), 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', `c_title:0,${inText.join(',')}`);
    await rightClick(page, await glyphAt(page, 'c_title', inText[0]!));
    await expect(paste).toBeDisabled();
    await expect(note).toHaveText('The copied sequence has 7 glyphs; this selection has 8.');
    await page.keyboard.press('Escape');
    // Seven glyphs again, one of them another symbol: the «C» of the text for the «c».
    await clickScene(page, await glyphAt(page, 'c_title', inText[6]!), 'Alt');
    await rightClick(page, await glyphAt(page, 'c_title', inText[0]!));
    await expect(paste).toBeDisabled();
    await expect(note).toHaveText(
      'The symbols differ: the copied sequence has c where this selection has C.',
    );
    await page.keyboard.press('Escape');
    expect((await formulaOf(page, 'f_title')).glyphColors).toEqual(before);
  });

  test('one brace, or one shape, goes over the glyphs picked in two formulas, attached to both; deleting one formula frees it', async ({
    page,
  }) => {
    await openTwoApart(page);
    const pickBoth = async () => {
      await clickScene(page, await glyphAt(page, 'ca', 3), 'Alt');
      await clickScene(page, await glyphAt(page, 'ca', 4), 'Alt');
      // Beta's «t»: its centre is on its stem, where a right-click finds the glyph.
      await clickScene(page, await glyphAt(page, 'cb', 2), 'Alt');
      await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:3,4;cb:2');
    };
    const objectOf = async (clip: { formulaId: string }) =>
      (await getProject(page)).formulas.find((f) => f.id === clip.formulaId) as unknown as {
        name: string;
        width: number;
      };
    await pickBoth();
    // The bar's Brace menu: the four sides, and no dialog of one object.
    await page.getByTestId('glyph-pick-brace').click();
    await expect(page.getByTestId('glyph-pick-brace-glyphs')).toHaveCount(0);
    await page.getByTestId('glyph-pick-brace-down').click();
    const brace = (await getProject(page)).clips.at(-1)!;
    expect(brace.attach).toEqual({
      clipId: 'ca',
      glyphs: [3, 4],
      rule: 'brace',
      direction: 0,
      buff: 0.2,
      also: [{ clipId: 'cb', glyphs: [2] }],
    });
    // On screen while both formulas are: beta ends at 3 s, alpha at 4 s; the playhead is at 2 s.
    expect([brace.start, brace.end]).toEqual([2, 3]);
    expect(await ids(page)).toEqual([brace.id]);
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    // Fitted to the group: alpha is at x = −3 and beta at 3, so the brace is some five units wide.
    await expect.poll(async () => (await objectOf(brace)).width).toBeGreaterThan(4.5);
    expect((await objectOf(brace)).width).toBeLessThan(7);
    await expect(page.getByTestId('attachment-target')).toContainText(
      'Attached to alpha · glyphs 3, 4 and beta · glyph 2.',
    );
    expect(await canUndo(page)).toBe(true);

    // A shape over the same glyphs, from the menu on one of them.
    await page.keyboard.press('Escape');
    await clickScene(page, [0, 3]);
    await pickBoth();
    await rightClick(page, await glyphAt(page, 'cb', 2));
    await openSubmenu(page, 'glyph-pick-menu-shape');
    await expect(page.getByTestId('glyph-pick-menu-shape-glyphs')).toHaveCount(0);
    await page.getByTestId('glyph-pick-menu-shape-box').click();
    const shape = (await getProject(page)).clips.at(-1)!;
    expect(shape.attach).toEqual({
      clipId: 'ca',
      glyphs: [3, 4],
      rule: 'shape',
      buff: 0.1,
      also: [{ clipId: 'cb', glyphs: [2] }],
    });
    await expect.poll(async () => (await objectOf(shape)).width).toBeGreaterThan(4.5);

    // Deleting beta takes neither along: both stay where they are, detached; one undo step.
    await page.getByTestId('clip-cb').click({ position: { x: 20, y: 10 } });
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('dialog')).toHaveCount(0);
    const after = await getProject(page);
    expect(after.clips.map((c) => c.id)).toEqual(['ca', brace.id, shape.id]);
    expect(after.clips.map((c) => c.attach)).toEqual([null, null, null]);
    await expect(page.getByTestId('notice')).toContainText('2 objects detached');
    expect((await objectOf(brace)).width).toBeGreaterThan(4.5);
    await undo(page);
    const back = await getProject(page);
    expect(back.clips.map((c) => c.id)).toEqual(['ca', 'cb', brace.id, shape.id]);
    expect(back.clips.at(-1)!.attach).toMatchObject({ also: [{ clipId: 'cb', glyphs: [2] }] });
  });

  test('the line under Paste says when glyphs without a known symbol are paired in glyph order', async ({
    page,
  }) => {
    await openWithProject(page, readExample('text-title.mfe.json'));
    await setTime(page, 4);
    await expect.poll(() => glyphCount(page, 'f_sum')).toBe(7);
    await expect.poll(() => glyphCount(page, 'f_title')).toBeGreaterThan(7);
    await waitForDrawables(page, (await glyphCount(page, 'f_title')) + 7);
    // The two «x» of «x^2+bx+c», as a render leaves the glyphs of a font it has no table for.
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((project) => {
        const formulas = project.formulas as unknown as {
          id: string;
          snapshot: { glyphs: { label: string }[] };
        }[];
        const { glyphs } = formulas.find((f) => f.id === 'f_sum')!.snapshot;
        glyphs[0]!.label = '?';
        glyphs[4]!.label = '?';
      });
    });
    await clickScene(page, await glyphAt(page, 'c_sum', 0), 'Alt');
    await altShiftClick(page, await glyphAt(page, 'c_sum', 6));
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'c_sum:0,1,2,3,4,5,6');
    await page.getByTestId('glyph-pick-color').click();
    await page.getByTestId('glyph-pick-color-menu-copy-sequence').click();
    await page.getByTestId('glyph-pick-color').click();
    await expect(page.getByTestId('glyph-pick-color-menu-paste-sequence')).toBeEnabled();
    await expect(page.getByTestId('glyph-pick-color-menu-paste-sequence-note')).toHaveText(
      '7 glyphs of sum, 0 coloured. 2 glyphs have no known symbol: they are paired in glyph order.',
    );
    await page.keyboard.press('Escape');
  });
});
