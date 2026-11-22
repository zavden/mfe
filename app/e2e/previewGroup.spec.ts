import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { canUndo, openWithProject, selectionOf, setTime, undo, type MfeWindow } from './helpers';
import { clipJson, projectJson } from './timelineHelpers';
import { handlePoints, pagePoint, type HandlePoints, type Point } from './uxHelpers';

/* Group transform handles: with several clips selected, Shift frames them all in one upright box
 * and a corner scales them, the circle turns them, as a group about the box's centre. */

const frame = (page: Page) => page.getByTestId('preview-frame');
const readout = (page: Page) => page.getByTestId('preview-readout');

/** Two clips of the same formula (alpha), so that their boxes match and the group's centre is
 * exactly the frame's centre: `ca` at x = −3 and `cb` at x = 3, both shown at 2 s. */
async function openTwoApart(page: Page): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 4);
  ca.initial.position = [-3, 0];
  const cb = clipJson('cb', 'fa', 't2', 0, 4);
  cb.initial.position = [3, 0];
  await openWithProject(page, projectJson([ca, cb]));
  await setTime(page, 2);
  await waitForDrawables(page, 10); // alpha twice (5 glyphs each), written by then
}

interface Placement {
  position: [number, number];
  scale: number;
  rotation: number;
}

/** The initial keyframes of the two clips, as [alpha, beta]. */
async function placements(page: Page): Promise<Placement[]> {
  return page.evaluate(() =>
    (window as MfeWindow)
      .__mfe!.useProjectStore.getState()
      .project.clips.map((c) =>
        JSON.parse(JSON.stringify((c as unknown as { initial: Placement }).initial)),
      ),
  );
}

async function shownHandles(page: Page): Promise<HandlePoints> {
  await expect(frame(page)).not.toHaveAttribute('data-transform-handles', '');
  return (await handlePoints(page))!;
}

/** Press on a handle (Shift held) and move to `to` in steps; leaves the button down. */
async function pressHandleAndMove(page: Page, from: Point, to: Point): Promise<void> {
  const start = await pagePoint(page, from);
  const end = await pagePoint(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
}

/** Both clips selected, Shift held, the pointer off the canvas: the group's handles. */
async function groupHandles(page: Page): Promise<HandlePoints> {
  await page.keyboard.press('ControlOrMeta+a');
  expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['ca', 'cb'] });
  await page.mouse.move(10, 10);
  await page.keyboard.down('Shift');
  return shownHandles(page);
}

test.describe('Preview group handles', () => {
  test('Shift frames the selected clips in one box; a corner scales them about its centre', async ({
    page,
  }) => {
    await openTwoApart(page);
    const h = await groupHandles(page);
    // The box spans both formulas (alpha at x = −3, beta at x = 3) and is centred on the frame.
    const left = await pagePoint(page, h.nw);
    const right = await pagePoint(page, h.ne);
    const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
    expect(left.x).toBeLessThan(canvas.x + canvas.width * 0.3);
    expect(right.x).toBeGreaterThan(canvas.x + canvas.width * 0.7);
    expect(h.center[0]).toBeCloseTo(canvas.width / 2, 0);
    expect(h.center[1]).toBeCloseTo(canvas.height / 2, 0);
    await expect(page.getByTestId('preview-hint')).toContainText('scale the group');

    // 1.6 times as far from the centre: ×1.6 (a step) for both, spread from the centre.
    const target: Point = [
      h.center[0] + (h.se[0] - h.center[0]) * 1.6,
      h.center[1] + (h.se[1] - h.center[1]) * 1.6,
    ];
    await pressHandleAndMove(page, h.se, target);
    await expect(readout(page)).toHaveText('× 1.60');
    await expect(frame(page)).toHaveAttribute('data-transform-active', 'se');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const [alpha, beta] = await placements(page);
    expect(alpha!.scale).toBe(1.6);
    expect(beta!.scale).toBe(1.6);
    expect(alpha!.position[0]).toBeCloseTo(-4.8, 6);
    expect(beta!.position[0]).toBeCloseTo(4.8, 6);
    expect(Math.abs(alpha!.position[1])).toBeLessThan(0.1);
    expect(Math.abs(beta!.position[1])).toBeLessThan(0.1);
    expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['ca', 'cb'] });

    // One undo step for the whole group.
    await undo(page);
    expect(await placements(page)).toMatchObject([
      { position: [-3, 0], scale: 1 },
      { position: [3, 0], scale: 1 },
    ]);
    expect(await canUndo(page)).toBe(false);
  });

  test("the group's factor sticks to the scale steps (0.2 here); Ctrl frees it", async ({
    page,
  }) => {
    await openTwoApart(page);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.usePreferences.getState().set({ scaleStep: '0.2' }),
    );
    const h = await groupHandles(page);
    const at = (factor: number): Point => [
      h.center[0] + (h.se[0] - h.center[0]) * factor,
      h.center[1] + (h.se[1] - h.center[1]) * factor,
    ];
    // ×1.18 rounds to the step ×1.2, for both members.
    await pressHandleAndMove(page, h.se, at(1.18));
    await expect(readout(page)).toHaveText('× 1.20');
    await page.mouse.up();
    expect(await placements(page)).toMatchObject([
      { position: [-3.6, 0], scale: 1.2 },
      { position: [3.6, 0], scale: 1.2 },
    ]);

    // With Ctrl held the same drag is free.
    await undo(page);
    await page.keyboard.down('ControlOrMeta');
    await pressHandleAndMove(page, h.se, at(1.18));
    await expect(readout(page)).toHaveText('× 1.18');
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.up('Shift');
    const [alpha, beta] = await placements(page);
    expect(alpha!.scale).toBeCloseTo(1.18, 2);
    expect(beta!.scale).toBeCloseTo(1.18, 2);
  });

  test('the circle turns the group about its centre in 15° steps; Ctrl frees the turn', async ({
    page,
  }) => {
    await openTwoApart(page);
    const h = await groupHandles(page);
    const radius = Math.hypot(h.rotate[0] - h.center[0], h.rotate[1] - h.center[1]);
    // From above the centre to its left: a quarter turn counter-clockwise (the steps make it
    // exact).
    await pressHandleAndMove(page, h.rotate, [h.center[0] - radius, h.center[1]]);
    await expect(readout(page)).toHaveText('90°');
    await page.mouse.up();
    const [alpha, beta] = await placements(page);
    // alpha (−3, 0) goes to (0, −3) and beta (3, 0) to (0, 3); both turn by 90°.
    expect(alpha).toMatchObject({ position: [0, -3], rotation: 90, scale: 1 });
    expect(beta).toMatchObject({ position: [0, 3], rotation: 90, scale: 1 });
    await undo(page);
    expect(await placements(page)).toMatchObject([
      { position: [-3, 0], rotation: 0 },
      { position: [3, 0], rotation: 0 },
    ]);

    // With Ctrl held a turn of 37° (the pointer from 90° to 127°) stays 37°, off the steps.
    const angle = (127 * Math.PI) / 180;
    await page.keyboard.down('ControlOrMeta');
    await pressHandleAndMove(page, h.rotate, [
      h.center[0] + radius * Math.cos(angle),
      h.center[1] - radius * Math.sin(angle),
    ]);
    await expect(readout(page)).toHaveText(/^3[5-8](\.\d)?°$/);
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.up('Shift');
    const turned = (await placements(page))[0]!.rotation;
    expect(turned).toBeGreaterThan(35);
    expect(turned).toBeLessThan(39);
    expect(turned % 15).not.toBe(0);
  });

  test('a member on a locked track stays where it is, and a notice names it', async ({ page }) => {
    await openTwoApart(page);
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        (draft as unknown as { tracks: { locked: boolean }[] }).tracks[1]!.locked = true;
      });
    });
    const h = await groupHandles(page);
    const target: Point = [
      h.center[0] + (h.se[0] - h.center[0]) * 2,
      h.center[1] + (h.se[1] - h.center[1]) * 2,
    ];
    await pressHandleAndMove(page, h.se, target);
    await expect(readout(page)).toHaveText('× 2.00');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const [alpha, beta] = await placements(page);
    expect(alpha!.scale).toBeCloseTo(2, 2);
    expect(alpha!.position[0]).toBeCloseTo(-6, 1);
    expect(beta).toMatchObject({ position: [3, 0], scale: 1 });
    const notice = page.getByTestId('notice');
    await expect(notice).toContainText('1 clip stayed');
    await expect(notice).toContainText('alpha'); // the stayed clip's formula
  });

  test('Escape cancels a group scale and leaves no history', async ({ page }) => {
    await openTwoApart(page);
    const h = await groupHandles(page);
    await pressHandleAndMove(page, h.se, [h.se[0] + 80, h.se[1] + 40]);
    expect((await placements(page))[0]!.scale).toBeGreaterThan(1.1);
    await page.keyboard.press('Escape');
    expect(await placements(page)).toMatchObject([
      { position: [-3, 0], scale: 1 },
      { position: [3, 0], scale: 1 },
    ]);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect(await canUndo(page)).toBe(false);
  });
});
