import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { openWithProject, setTime, someTextField, type MfeWindow } from './helpers';
import { openTwoApart, pressAndMove } from './previewHelpers';
import { clipJson, projectJson } from './timelineHelpers';

/* The preview's grid: shown from the middle of the transport bar, made sparser or denser there,
 * holding the formula's centre or its edges; drawn under the formulas; a preference that
 * survives a reload. */

const frame = (page: Page) => page.getByTestId('preview-frame');
const stepLabel = (page: Page) => page.getByTestId('transport-grid-step');

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const positionOf = (page: Page, clipId: string) =>
  page.evaluate(
    (id) =>
      (
        (window as MfeWindow)
          .__mfe!.useProjectStore.getState()
          .project.clips.find((c) => c.id === id) as unknown as {
          initial: { position: [number, number] };
        }
      ).initial.position,
    clipId,
  );

/** The clip's formula box on the frame: its position plus the render's box. */
const boxOf = (page: Page, clipId: string): Promise<Box> =>
  page.evaluate((id) => {
    const mfe = (window as MfeWindow).__mfe!;
    const clip = mfe.useProjectStore.getState().project.clips.find((c) => c.id === id)!;
    const [x, y] = (clip as unknown as { initial: { position: [number, number] } }).initial
      .position;
    const { bbox } = (
      mfe.useRenderStore.getState().resolved.get(clip.formulaId) as { render: { bbox: Box } }
    ).render;
    return { minX: x + bbox.minX, minY: y + bbox.minY, maxX: x + bbox.maxX, maxY: y + bbox.maxY };
  }, clipId);

const onGrid = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6;

const showGrid = (page: Page, gridStep: number, gridAnchor: 'center' | 'edges') =>
  page.evaluate((patch) => (window as MfeWindow).__mfe!.usePreferences.getState().set(patch), {
    grid: true,
    gridStep,
    gridAnchor,
  });

/** The bitmap pixel on the x = 0 axis near the top of the frame: on the grid's axis line, away
 * from the formulas. */
async function axisPixel(page: Page): Promise<number[]> {
  return page.getByTestId('preview-canvas').evaluate((c) => {
    const canvas = c as HTMLCanvasElement;
    const x = Math.floor(canvas.width / 2);
    return [...canvas.getContext('2d')!.getImageData(x, 12, 1, 1).data];
  });
}

test.describe('Preview grid', () => {
  test('the transport button shows the grid, and the choice survives a reload', async ({
    page,
  }) => {
    await openTwoApart(page);
    const button = page.getByTestId('transport-grid');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(frame(page)).toHaveAttribute('data-grid', '');
    expect(await axisPixel(page)).toEqual([0, 0, 0, 255]); // the black scene background
    await expect(page.getByTestId('transport-grid-denser')).toBeDisabled();
    await expect(page.getByTestId('transport-grid-anchor')).toBeDisabled();

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(frame(page)).toHaveAttribute('data-grid', '1');
    await expect(stepLabel(page)).toHaveText('1');
    // The origin's axis is drawn, under the formulas, as a mid grey over the black background.
    await expect.poll(axisPixel.bind(null, page)).not.toEqual([0, 0, 0, 255]);
    const [r, g, b] = await axisPixel(page);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r!).toBeGreaterThan(60);

    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    await expect(page.getByTestId('transport-grid')).toHaveAttribute('aria-pressed', 'true');
    await expect(frame(page)).toHaveAttribute('data-grid', '1');
    await page.getByTestId('transport-grid').click();
    await expect(frame(page)).toHaveAttribute('data-grid', '');
  });

  test('− and + step through the spacings and stop at the ends; the anchor toggles', async ({
    page,
  }) => {
    await openTwoApart(page);
    await page.getByTestId('transport-grid').click();
    const denser = page.getByTestId('transport-grid-denser');
    const sparser = page.getByTestId('transport-grid-sparser');
    await denser.click();
    await expect(stepLabel(page)).toHaveText('0.5');
    await expect(frame(page)).toHaveAttribute('data-grid', '0.5');
    await denser.click();
    await denser.click();
    await expect(stepLabel(page)).toHaveText('0.1');
    await expect(denser).toBeDisabled();
    for (let i = 0; i < 4; i += 1) await sparser.click();
    await expect(stepLabel(page)).toHaveText('2');
    await expect(sparser).toBeDisabled();
    await expect(denser).toBeEnabled();

    // The anchor button is an icon: its state is in `data-anchor`, and its label names the
    // state and what a click changes it to.
    const anchor = page.getByTestId('transport-grid-anchor');
    await expect(anchor).toHaveAttribute('data-anchor', 'center');
    await expect(anchor).toHaveAttribute(
      'aria-label',
      /holds the formula's centre.*click for.*edges/,
    );
    await anchor.click();
    await expect(anchor).toHaveAttribute('data-anchor', 'edges');
    await expect(anchor).toHaveAttribute(
      'aria-label',
      /holds the formula's nearest edges.*click for.*centre/,
    );
    const prefs = await page.evaluate(() => {
      const p = (window as MfeWindow).__mfe!.usePreferences.getState();
      return { grid: p.grid, gridStep: p.gridStep, gridAnchor: p.gridAnchor };
    });
    expect(prefs).toEqual({ grid: true, gridStep: 2, gridAnchor: 'edges' });
    // Preferences, not edits: nothing to undo.
    expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
  });

  test('the Preferences menu offers the same choices', async ({ page }) => {
    await openTwoApart(page);
    await page.getByTestId('menu-preferences').click();
    await page.getByTestId('menu-item-preferences-show-grid').click();
    await expect(frame(page)).toHaveAttribute('data-grid', '1');
    await page.getByTestId('menu-preferences').click();
    await page.getByTestId('menu-item-preferences-grid-step').hover();
    await page.getByTestId('menu-item-preferences-grid-step-0.25').click();
    await expect(frame(page)).toHaveAttribute('data-grid', '0.25');
    await expect(stepLabel(page)).toHaveText('0.25');
    await page.getByTestId('menu-preferences').click();
    await page.getByTestId('menu-item-preferences-grid-anchor').hover();
    await page.getByTestId('menu-item-preferences-grid-anchor-edges').click();
    await expect(page.getByTestId('transport-grid-anchor')).toHaveAttribute('data-anchor', 'edges');
  });

  test('a dragged formula lands with its centre on a node; Ctrl held after the press frees it', async ({
    page,
  }) => {
    await openTwoApart(page);
    await showGrid(page, 1, 'center');
    await pressAndMove(page, [-3, 0], [-2.4, 0.6]);
    await page.mouse.up();
    expect(await positionOf(page, 'ca')).toEqual([-2, 1]);
    // Finer grid: half units.
    await showGrid(page, 0.5, 'center');
    await pressAndMove(page, [-2, 1], [-1.3, 0.7]);
    await page.mouse.up();
    expect(await positionOf(page, 'ca')).toEqual([-1.5, 0.5]);
    // Ctrl/⌘ after the press: free.
    await pressAndMove(page, [-1.5, 0.5], [-1.5, 0.5]);
    await page.keyboard.down('ControlOrMeta');
    const far = await page.getByTestId('preview-canvas').boundingBox();
    await page.mouse.move(far!.x + far!.width * 0.3, far!.y + far!.height * 0.4, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    const [x, y] = await positionOf(page, 'ca');
    expect(onGrid(x, 0.5) && onGrid(y, 0.5)).toBe(false);
  });

  test('with "edges", whichever edge is nearer to a line lands on it', async ({ page }) => {
    await openTwoApart(page);
    await showGrid(page, 1, 'edges');
    // Only the grid: beta's edges would otherwise take an axis.
    await page.getByTestId('preview-snap').click();
    await pressAndMove(page, [-3, 0], [-2.3, 0.4]);
    await page.mouse.up();
    const box = await boxOf(page, 'ca');
    expect(onGrid(box.minX, 1) || onGrid(box.maxX, 1)).toBe(true);
    expect(onGrid(box.minY, 1) || onGrid(box.maxY, 1)).toBe(true);
    // The centre is not what landed on the grid (the formula is not a whole unit wide or tall).
    const [x, y] = await positionOf(page, 'ca');
    expect(onGrid(x, 1) && onGrid(y, 1)).toBe(false);
  });

  test('an object guide wins over the grid on its axis', async ({ page }) => {
    // beta sits off the grid, at y = 0.3: dragging alpha near that height snaps to beta's centre
    // line, while x still lands on a node.
    const ca = clipJson('ca', 'fa', 't1', 0, 4);
    ca.initial.position = [-3, 0];
    const cb = clipJson('cb', 'fb', 't2', 0, 4);
    cb.initial.position = [3, 0.3];
    await openWithProject(page, projectJson([ca, cb]));
    await setTime(page, 2);
    await waitForDrawables(page, 9);
    await showGrid(page, 1, 'center');
    await pressAndMove(page, [-3, 0], [-2.4, 0.35]);
    await expect(frame(page)).toHaveAttribute('data-snap-guides', /y@/);
    // Whatever beta's line (its centre or an edge), it is not a node of the grid.
    const guide = Number(
      (await frame(page).getAttribute('data-snap-guides'))!.match(/y@(\S+)/)![1],
    );
    expect(onGrid(guide, 1)).toBe(false);
    await page.mouse.up();
    // x landed on the grid; y followed beta's line (an edge or the centre of alpha's box is on
    // it), not the grid.
    const [x, y] = await positionOf(page, 'ca');
    expect(x).toBe(-2);
    expect(onGrid(y, 1)).toBe(false);
    const box = await boxOf(page, 'ca');
    const lines = [box.minY, box.maxY, (box.minY + box.maxY) / 2];
    expect(lines.some((v) => Math.abs(v - guide) < 1e-3)).toBe(true);
  });

  test("Ctrl+' shows and hides the grid; Alt+↑/↓ change its density while it is shown", async ({
    page,
  }) => {
    await openTwoApart(page);
    // Off: Alt+↑ does nothing, like the disabled + button.
    await page.keyboard.press('Alt+ArrowUp');
    await expect(stepLabel(page)).toHaveText('1');
    await page.keyboard.press("ControlOrMeta+'");
    await expect(frame(page)).toHaveAttribute('data-grid', '1');
    await expect(page.getByTestId('transport-grid')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(frame(page)).toHaveAttribute('data-grid', '0.5');
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(frame(page)).toHaveAttribute('data-grid', '2');
    await page.keyboard.press("ControlOrMeta+'");
    await expect(frame(page)).toHaveAttribute('data-grid', '');
    // Not inside a text field.
    const field = await someTextField(page);
    await field.fill('abc');
    await field.press("ControlOrMeta+'");
    await expect(frame(page)).toHaveAttribute('data-grid', '');
  });
});
