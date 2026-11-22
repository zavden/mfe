import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { canUndo, openWithProject, projectFile, setTime, type MfeWindow } from './helpers';
import { clickScene, openTwoApart, scenePoint, type Point } from './previewHelpers';
import { clipJson } from './timelineHelpers';

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const frame = (page: Page) => page.getByTestId('preview-frame');
const guidesOf = (page: Page) => frame(page).getAttribute('data-snap-guides');

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

/** The whole formula's box of a clip at its initial position (scale 1, no rotation). */
async function boxOf(page: Page, clipId: string): Promise<Box> {
  return page.evaluate((id) => {
    const mfe = (window as MfeWindow).__mfe!;
    const clip = mfe.useProjectStore.getState().project.clips.find((c) => c.id === id)!;
    const [x, y] = (clip as unknown as { initial: { position: [number, number] } }).initial
      .position;
    const { bbox } = (
      mfe.useRenderStore.getState().resolved.get(clip.formulaId) as { render: { bbox: Box } }
    ).render;
    return { minX: x + bbox.minX, minY: y + bbox.minY, maxX: x + bbox.maxX, maxY: y + bbox.maxY };
  }, clipId);
}

/** Press at `from` and move to `to` in steps, the button left down. */
async function pressAndMoveTo(page: Page, from: Point, to: Point): Promise<void> {
  const a = await scenePoint(page, from);
  const b = await scenePoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
}

/** Move on to `to`, the button still down. */
async function moveTo(page: Page, to: Point): Promise<void> {
  const b = await scenePoint(page, to);
  await page.mouse.move(b.x, b.y, { steps: 6 });
}

/** alpha and beta in a column on the left (x = −4.5, y = ±1.5), gamma on the right (3, 0). */
async function openColumnAndTarget(page: Page): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 4);
  ca.initial.position = [-4.5, 1.5];
  const cb = clipJson('cb', 'fb', 't2', 0, 4);
  cb.initial.position = [-4.5, -1.5];
  const cc = clipJson('cc', 'fc', 't3', 0, 4);
  cc.initial.position = [3, 0];
  const formulas = [
    { id: 'fa', name: 'alpha', source: 'alpha', color: '#58C4DD' },
    { id: 'fb', name: 'beta', source: 'beta', color: '#83C167' },
    { id: 'fc', name: 'gamma', source: 'gamma', color: '#FC6255' },
  ];
  await openWithProject(page, projectFile('axis', formulas, [ca, cb, cc]));
  await setTime(page, 2);
  await waitForDrawables(page, 14); // 5 + 4 + 5 glyphs
}

test.describe('Preview: Alt holds a drag to one axis', () => {
  test('pressed once the drag runs, Alt holds it at the key itself; let go, it is free again', async ({
    page,
  }) => {
    await openTwoApart(page);
    // Without the snapping, the drag goes where the pointer goes (its own test is below).
    await page.getByTestId('preview-snap').click();
    await expect(page.getByTestId('preview-snap')).toHaveAttribute('aria-pressed', 'false');
    await pressAndMoveTo(page, [-3, 0], [-1.8, 0.6]);
    let [x, y] = await positionOf(page, 'ca');
    expect(x).toBeCloseTo(-1.8, 1);
    expect(y).toBeCloseTo(0.6, 1);
    await expect(frame(page)).toHaveAttribute('data-axis-lock', '');

    // Alt, with no pointer move: along x, the axis the pointer has gone further along.
    await page.keyboard.down('Alt');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', 'x');
    [x, y] = await positionOf(page, 'ca');
    expect(y).toBe(0); // where it was when the drag began
    expect(x).toBeCloseTo(-1.8, 1);
    await expect(page.getByTestId('preview-axis-hint')).toContainText('Moving horizontally only');
    await expect(page.getByTestId('preview-glyph-hint')).toHaveCount(0);

    // The axis is chosen again as the pointer goes on: further up than across, it is y.
    await moveTo(page, [-2.6, 1.5]);
    await expect(frame(page)).toHaveAttribute('data-axis-lock', 'y');
    [x, y] = await positionOf(page, 'ca');
    expect(x).toBe(-3);
    expect(y).toBeCloseTo(1.5, 1);
    await expect(page.getByTestId('preview-axis-hint')).toContainText('Moving vertically only');

    // Let go, the formula follows the pointer again, at once.
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', '');
    [x, y] = await positionOf(page, 'ca');
    expect(x).toBeCloseTo(-2.6, 1);
    expect(y).toBeCloseTo(1.5, 1);
    await expect(page.getByTestId('preview-axis-hint')).toHaveCount(0);

    // Pressed again, held again; released over the canvas with Alt down, the move stays held.
    await page.keyboard.down('Alt');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', 'y');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    [x, y] = await positionOf(page, 'ca');
    expect(x).toBe(-3);
    expect(y).toBeCloseTo(1.5, 1);
    await expect(frame(page)).toHaveAttribute('data-axis-lock', '');

    // The whole drag is one undo step.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('Alt keeps the snapping along the held axis; Ctrl/⌘ frees it; the keys act in any order', async ({
    page,
  }) => {
    await openTwoApart(page);
    const a = await boxOf(page, 'ca');
    const b = await boxOf(page, 'cb');
    const half = (b.maxX - b.minX) / 2;
    // beta's left edge 0.06 right of alpha's right edge (within the snap distance), and 0.6 up:
    // the pointer has gone far further across than up.
    const aimed = a.maxX + 0.06 + half;
    const snapped = a.maxX + half;
    await pressAndMoveTo(page, [3, 0], [aimed, 0.6]);

    const expectAt = async (where: { x: 'snapped' | 'pointer'; y: 'start' | 'pointer' }) => {
      const [x, y] = await positionOf(page, 'cb');
      if (where.x === 'snapped') expect(x).toBeCloseTo(snapped, 6);
      else {
        expect(Math.abs(x - aimed)).toBeLessThan(0.03);
        expect(x).not.toBeCloseTo(snapped, 4);
      }
      if (where.y === 'start') expect(y).toBe(0);
      else expect(y).toBeCloseTo(0.6, 1);
    };

    // Alt: held to x, still sticking to alpha's edge, with its guide; no snap pulls it off y = 0.
    await page.keyboard.down('Alt');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', 'x');
    await expectAt({ x: 'snapped', y: 'start' });
    expect(await guidesOf(page)).toContain(`x@${a.maxX.toFixed(4)}`);
    expect(await guidesOf(page)).not.toContain('y');
    // Alt, then Ctrl/⌘: along x where the pointer is, no guides.
    await page.keyboard.down('ControlOrMeta');
    await expectAt({ x: 'pointer', y: 'start' });
    expect(await guidesOf(page)).toBe('');
    // Alt let go, Ctrl/⌘ still held: free on both axes, no snapping.
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', '');
    await expectAt({ x: 'pointer', y: 'pointer' });
    // Ctrl/⌘ let go too: the snapping is back.
    await page.keyboard.up('ControlOrMeta');
    expect(await guidesOf(page)).toContain(`x@${a.maxX.toFixed(4)}`);
    expect((await positionOf(page, 'cb'))[0]).toBeCloseTo(snapped, 6);
    // Ctrl/⌘ first, then Alt: held and free.
    await page.keyboard.down('ControlOrMeta');
    await page.keyboard.down('Alt');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', 'x');
    await expectAt({ x: 'pointer', y: 'start' });
    // Ctrl/⌘ let go, Alt still held: held, and snapping along x again.
    await page.keyboard.up('ControlOrMeta');
    await expectAt({ x: 'snapped', y: 'start' });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expectAt({ x: 'snapped', y: 'start' });
    expect(await guidesOf(page)).toBe('');

    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'cb')).toEqual([3, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('Ctrl/⌘+Alt from the start: along the axis, where the pointer is', async ({ page }) => {
    await openTwoApart(page);
    const a = await boxOf(page, 'ca');
    const b = await boxOf(page, 'cb');
    const half = (b.maxX - b.minX) / 2;
    const aimed = a.maxX + 0.06 + half;
    const from = await scenePoint(page, [3, 0]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.keyboard.down('ControlOrMeta');
    await page.keyboard.down('Alt');
    await moveTo(page, [aimed, 0.6]);
    expect(await guidesOf(page)).toBe('');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('ControlOrMeta');
    const [x, y] = await positionOf(page, 'cb');
    expect(Math.abs(x - aimed)).toBeLessThan(0.03);
    expect(x).not.toBeCloseTo(a.maxX + half, 4);
    expect(y).toBe(0);
  });

  test('several selected clips move by the same held travel, snapping or not', async ({ page }) => {
    await openColumnAndTarget(page);
    await clickScene(page, [-4.5, 1.5]);
    await clickScene(page, [-4.5, -1.5], 'ControlOrMeta');
    await expect
      .poll(() => page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().selection))
      .toEqual({ kind: 'clips', ids: ['ca', 'cb'] });
    const a = await boxOf(page, 'ca');
    const b = await boxOf(page, 'cb');
    const c = await boxOf(page, 'cc');
    // The pair's right edge 0.06 short of gamma's left edge, and 0.5 up: Alt snaps it there.
    const travel = c.minX - Math.max(a.maxX, b.maxX);
    await pressAndMoveTo(page, [-4.5, 1.5], [-4.5 + travel - 0.06, 2]);
    await page.keyboard.down('Alt');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', 'x');
    expect(await guidesOf(page)).toContain(`x@${c.minX.toFixed(4)}`);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const [ax, ay] = await positionOf(page, 'ca');
    const [bx, by] = await positionOf(page, 'cb');
    expect(ax).toBeCloseTo(-4.5 + travel, 6);
    expect(bx).toBe(ax); // the same travel for both
    expect(ay).toBe(1.5);
    expect(by).toBe(-1.5);
    // One undo step for the pair.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual([-4.5, 1.5]);
    expect(await positionOf(page, 'cb')).toEqual([-4.5, -1.5]);

    // The same drag with Ctrl/⌘ and Alt: along x where the pointer is, still together.
    await pressAndMoveTo(page, [-4.5, 1.5], [-4.5 + travel - 0.06, 2]);
    await page.keyboard.down('ControlOrMeta');
    await page.keyboard.down('Alt');
    expect(await guidesOf(page)).toBe('');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('ControlOrMeta');
    const [fx, fy] = await positionOf(page, 'ca');
    const [gx, gy] = await positionOf(page, 'cb');
    expect(Math.abs(fx - (-4.5 + travel - 0.06))).toBeLessThan(0.03);
    expect(fx).not.toBeCloseTo(-4.5 + travel, 4);
    expect(gx).toBe(fx);
    expect(fy).toBe(1.5);
    expect(gy).toBe(-1.5);
  });

  test('Escape cancels a held drag; leaving the window lets the axis go', async ({ page }) => {
    await openTwoApart(page);
    await page.getByTestId('preview-snap').click();
    await pressAndMoveTo(page, [-3, 0], [-1.8, 0.6]);
    await page.keyboard.down('Alt');
    expect((await positionOf(page, 'ca'))[1]).toBe(0);
    // The window loses the focus with Alt down (its release goes to another window): the lock
    // goes at once, and the formula follows the pointer again.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(frame(page)).toHaveAttribute('data-axis-lock', '');
    expect((await positionOf(page, 'ca'))[1]).toBeCloseTo(0.6, 1);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    expect((await positionOf(page, 'ca'))[1]).toBeCloseTo(0.6, 1);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);

    // Escape in the middle of a held drag puts everything back and leaves no undo step.
    await pressAndMoveTo(page, [-3, 0], [-1.8, 0.6]);
    await page.keyboard.down('Alt');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', 'x');
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', '');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    await moveTo(page, [-1, 0.2]);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('Alt already held at the press still picks glyphs: it does not move anything', async ({
    page,
  }) => {
    await openTwoApart(page);
    await page.keyboard.down('Alt');
    await pressAndMoveTo(page, [-3.4, 0.3], [-2.4, -0.3]);
    await expect(frame(page)).not.toHaveAttribute('data-marquee', '');
    await expect(frame(page)).toHaveAttribute('data-axis-lock', '');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    await expect(frame(page)).not.toHaveAttribute('data-glyph-pick', '');
  });
});
