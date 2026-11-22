import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import { onSystem, openWithProject, projectFile, type MfeWindow } from './helpers';
import { clipJson, projectJson } from './timelineHelpers';
import {
  canUndo,
  canvasBoxOf,
  distance,
  handlePoints,
  helloInitial,
  openHelloSelected,
  pagePoint,
  screenAngle,
  selectClips,
  selectionOf,
  setTime,
  undo,
  type HandlePoints,
  type Point,
} from './uxHelpers';

const frame = (page: Page) => page.getByTestId('preview-frame');
const readout = (page: Page) => page.getByTestId('preview-readout');

/** Press on a handle (Shift held), move through `to` in steps; leaves the button down. */
async function pressHandleAndMove(page: Page, from: Point, to: Point): Promise<void> {
  const start = await pagePoint(page, from);
  const end = await pagePoint(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
}

/** Keep dragging (the button is already down). */
async function moveOn(page: Page, to: Point, steps = 6): Promise<void> {
  const end = await pagePoint(page, to);
  await page.mouse.move(end.x, end.y, { steps });
}

async function shownHandles(page: Page): Promise<HandlePoints> {
  await expect(frame(page)).not.toHaveAttribute('data-transform-handles', '');
  return (await handlePoints(page))!;
}

test.describe('preview: transform handles (Shift)', () => {
  test('Shift shows handles on the single selected clip and releasing it hides them', async ({
    page,
  }) => {
    await openHelloSelected(page);
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await page.mouse.move(10, 10); // keep the pointer off the canvas
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    // A box with four corners and a rotation handle straight above its top edge.
    expect(h.nw[0]).toBeLessThan(h.ne[0]);
    expect(h.nw[1]).toBeLessThan(h.sw[1]);
    expect(h.rotate[0]).toBeCloseTo((h.nw[0] + h.ne[0]) / 2, 0);
    expect(h.rotate[1]).toBeLessThan(h.nw[1]);
    expect(h.center[0]).toBeCloseTo((h.nw[0] + h.se[0]) / 2, 0);
    // A hint says what the handles do, and goes with them.
    await expect(page.getByTestId('preview-hint')).toHaveText(
      onSystem(
        'Drag a corner to scale · the circle to rotate · steps of 0.05 and 15°, Ctrl/⌘ frees them',
        'Drag a corner to scale · the circle to rotate · steps of 0.05 and 15°, ⌘ frees them',
      ),
    );
    await page.keyboard.up('Shift');
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await expect(page.getByTestId('preview-hint')).toHaveCount(0);
  });

  test('the handles button keeps them on without Shift; a hint says so; the choice is kept', async ({
    page,
  }) => {
    await openHelloSelected(page);
    const hint = page.getByTestId('preview-handles-hint');
    // The clip was clicked in the preview, which has the keyboard: the hint gives the arrows too.
    await expect(hint).toHaveText(
      onSystem(
        'Hold Shift for the transform handles (scale, rotate) · the handles button keeps them on · the arrows move it 0.01 (Shift: 0.1)',
        'Hold ⇧ for the transform handles (scale, rotate) · the handles button keeps them on · the arrows move it 0.01 (⇧: 0.1)',
      ),
    );
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await page.getByTestId('preview-handles').click();
    await expect(page.getByTestId('preview-handles')).toHaveAttribute('aria-pressed', 'true');
    await shownHandles(page);
    await expect(hint).toHaveCount(0);
    await expect(page.getByTestId('preview-hint')).toContainText('Drag a corner to scale');

    // Kept in the browser: after a reload the handles are still on.
    await page.reload();
    await openHelloSelected(page);
    await shownHandles(page);
    await page.getByTestId('preview-handles').click();
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await expect(hint).toBeVisible();

    // Nothing selected: no hint.
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'none' }),
    );
    await expect(hint).toHaveCount(0);
  });

  test('handles hide on window blur, and need a visible, unlocked, single selected clip', async ({
    page,
  }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    await shownHandles(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await page.keyboard.up('Shift');

    // Not at a time when the clip is not on screen.
    await page.keyboard.down('Shift');
    await shownHandles(page);
    await setTime(page, 30);
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await setTime(page, 1.5);
    await shownHandles(page);

    // With two clips selected the handles frame the group instead (previewGroup.spec.ts).
    await selectClips(page, ['c_a1', 'c_f2']);
    await expect(page.getByTestId('preview-hint')).toHaveText(
      onSystem(
        'Drag a corner to scale the group · the circle to turn it · steps of 0.05 and 15°, Ctrl/⌘ frees them',
        'Drag a corner to scale the group · the circle to turn it · steps of 0.05 and 15°, ⌘ frees them',
      ),
    );
    await selectClips(page, ['c_a1']);
    await expect(page.getByTestId('preview-hint')).not.toContainText('the group');
    await shownHandles(page);

    // Not on a locked track.
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        (draft as unknown as { tracks: { locked: boolean }[] }).tracks[0]!.locked = true;
      });
    });
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await page.keyboard.up('Shift');
  });

  test('the box follows the clip rotation and handles keep their pixel size at any zoom', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    await openWithProject(
      page,
      projectJson([
        clipJson('c1', 'fa', 't1', 0, 6, {
          initial: {
            position: [0, 0],
            scale: 1,
            rotation: 30,
            flipX: false,
            flipY: false,
            opacity: 1,
            color: null,
            glyphColors: {},
          },
        }),
      ]),
    );
    await setTime(page, 3);
    await selectClips(page, ['c1']);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    // The rotation handle sits along the box's own "up", turned 30° counter-clockwise.
    expect(screenAngle(h.center, h.rotate)).toBeCloseTo(120, 0);
    expect(screenAngle(h.sw, h.se)).toBeCloseTo(30, 0);

    const gap = (p: HandlePoints) =>
      distance(p.rotate, [(p.nw[0] + p.ne[0]) / 2, (p.nw[1] + p.ne[1]) / 2]);
    const boxWidth = (p: HandlePoints) => distance(p.nw, p.ne);
    const before = { gap: gap(h), width: boxWidth(h) };
    await page.getByTestId('preview-zoom-in').click();
    await page.getByTestId('preview-zoom-in').click();
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.563');
    const zoomed = (await handlePoints(page))!;
    expect(gap(zoomed)).toBeCloseTo(before.gap, 0); // the same distance on screen
    expect(boxWidth(zoomed)).toBeGreaterThan(before.width * 1.4); // the box itself grew
    await page.keyboard.up('Shift');
  });

  test('hovering a handle changes the cursor: resize on corners, rotate on the circle', async ({
    page,
  }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const cursor = () =>
      page.getByTestId('preview-canvas').evaluate((c) => (c as HTMLCanvasElement).style.cursor);

    const se = await pagePoint(page, h.se);
    await page.mouse.move(se.x, se.y);
    await expect(frame(page)).toHaveAttribute('data-handle-hover', 'se');
    expect(await cursor()).toBe('nwse-resize');
    const ne = await pagePoint(page, h.ne);
    await page.mouse.move(ne.x, ne.y);
    expect(await cursor()).toBe('nesw-resize');
    const rotate = await pagePoint(page, h.rotate);
    await page.mouse.move(rotate.x, rotate.y);
    await expect(frame(page)).toHaveAttribute('data-handle-hover', 'rotate');
    expect(await cursor()).toMatch(/^url\(/);
    // Away from the handles it is the plain "move" cursor over the formula again.
    const centre = await pagePoint(page, h.center);
    await page.mouse.move(centre.x, centre.y);
    await expect(frame(page)).toHaveAttribute('data-handle-hover', '');
    expect(await cursor()).toBe('move');
    // Releasing Shift with the pointer over a handle drops its cursor too.
    await page.mouse.move(se.x, se.y);
    expect(await cursor()).toBe('nwse-resize');
    await page.keyboard.up('Shift');
    await expect(frame(page)).toHaveAttribute('data-handle-hover', '');
    expect(await cursor()).not.toBe('nwse-resize');
  });

  test('a corner drag scales the clip uniformly about its centre, as one undo step', async ({
    page,
  }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const target: Point = [h.se[0] + 90, h.se[1] + 35];
    // Ctrl held: the free ratio, not the nearest step (the next test).
    await page.keyboard.down('ControlOrMeta');
    await pressHandleAndMove(page, h.se, target);

    const expected = distance(target, h.center) / distance(h.se, h.center);
    await expect(readout(page)).toHaveText(`× ${expected.toFixed(2)}`);
    await expect(frame(page)).toHaveAttribute('data-transform-active', 'se');
    const live = await helloInitial(page);
    expect(live.scale).toBeCloseTo(expected, 1);

    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.up('Shift');
    const after = await helloInitial(page);
    expect(after.scale).toBeCloseTo(expected, 1);
    expect(after.position).toEqual([0, 0]); // scaled about the centre: position unchanged
    expect(after.rotation).toBe(0);
    await expect(readout(page)).toHaveCount(0);
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['c_a1'] });

    // The whole drag is a single step.
    await undo(page);
    expect(await helloInitial(page)).toMatchObject({ scale: 1, rotation: 0 });
    expect(await canUndo(page)).toBe(false);
  });

  test('a corner drag sticks to the width of another formula, before any step; Ctrl frees it', async ({
    page,
  }) => {
    // A wide formula at −3 and a tall one at 3: only the width can match.
    const ca = clipJson('ca', 'fa', 't1', 0, 4);
    ca.initial.position = [-3, 0];
    const cb = clipJson('cb', 'fb', 't2', 0, 4);
    cb.initial.position = [3, 0];
    const formulas = [
      { id: 'fa', name: 'wide', source: 'x+y+z', color: '#58C4DD' },
      { id: 'fb', name: 'tall', source: '\\frac{1}{2}', color: '#83C167' },
    ];
    await openWithProject(page, projectFile('sizes', formulas, [ca, cb]));
    await setTime(page, 2);
    await waitForDrawables(page, 8); // 5 + 3 glyphs
    const widthOf = (clipId: string) =>
      page.evaluate((id) => {
        const mfe = (window as MfeWindow).__mfe!;
        const clip = mfe.useProjectStore.getState().project.clips.find((c) => c.id === id)!;
        const { bbox } = (
          mfe.useRenderStore.getState().resolved.get(clip.formulaId) as {
            render: { bbox: { minX: number; maxX: number } };
          }
        ).render;
        return bbox.maxX - bbox.minX;
      }, clipId);
    const k = (await widthOf('cb')) / (await widthOf('ca')); // well below 1
    expect(k).toBeLessThan(0.6);
    await selectClips(page, ['ca']);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const at = (ratio: number): Point => [
      h.center[0] + (h.se[0] - h.center[0]) * ratio,
      h.center[1] + (h.se[1] - h.center[1]) * ratio,
    ];
    // A little wider than the tall formula: within the snap distance, so the width sticks to
    // it, the two widths show as guides, and the scale is the exact ratio rather than a step.
    await pressHandleAndMove(page, h.se, at(k + 0.01));
    await expect(frame(page)).toHaveAttribute('data-snap-guides', /^x=/);
    await expect(readout(page)).toHaveText(`× ${k.toFixed(2)}`);
    await page.mouse.up();
    await expect(frame(page)).toHaveAttribute('data-snap-guides', '');
    const scaleOf = () =>
      page.evaluate(
        () =>
          (
            (window as MfeWindow).__mfe!.useProjectStore.getState().project.clips[0] as unknown as {
              initial: { scale: number };
            }
          ).initial.scale,
      );
    expect(await scaleOf()).toBeCloseTo(k, 5);
    expect(Math.abs((await scaleOf()) * 20 - Math.round((await scaleOf()) * 20))).toBeGreaterThan(
      0.001,
    ); // not a step of 0.05

    // Ctrl held: no size guide, the free ratio.
    await undo(page);
    await page.keyboard.down('ControlOrMeta');
    await pressHandleAndMove(page, h.se, at(k + 0.01));
    await expect(frame(page)).toHaveAttribute('data-snap-guides', '');
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.up('Shift');
  });

  test('the scale sticks to the preferred steps (0.2 here); Ctrl frees it', async ({ page }) => {
    await openHelloSelected(page);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.usePreferences.getState().set({ scaleStep: '0.2' }),
    );
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    // Along the corner's diagonal, `ratio` times as far from the centre as the corner.
    const at = (ratio: number): Point => [
      h.center[0] + (h.se[0] - h.center[0]) * ratio,
      h.center[1] + (h.se[1] - h.center[1]) * ratio,
    ];
    // 1.22 rounds to the step 1.2, readout and keyframe alike.
    await pressHandleAndMove(page, h.se, at(1.22));
    await expect(readout(page)).toHaveText('× 1.20');
    expect((await helloInitial(page)).scale).toBe(1.2);
    // Hard steps, nothing in between: 1.32 is 1.4.
    await moveOn(page, at(1.32));
    await expect(readout(page)).toHaveText('× 1.40');
    await page.mouse.up();
    expect((await helloInitial(page)).scale).toBe(1.4);

    // With Ctrl held the same 1.22 drag is free.
    await undo(page);
    await page.keyboard.down('ControlOrMeta');
    await pressHandleAndMove(page, h.se, at(1.22));
    await expect(readout(page)).toHaveText('× 1.22');
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.up('Shift');
    expect((await helloInitial(page)).scale).toBeCloseTo(1.22, 2);
  });

  test('the scale steps follow the Preferences: thirds, here', async ({ page }) => {
    await openHelloSelected(page);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.usePreferences.getState().set({ scaleStep: '1/3' }),
    );
    await page.keyboard.down('Shift');
    await expect(page.getByTestId('preview-hint')).toContainText('steps of 1/3 and 15°');
    const h = await shownHandles(page);
    const at = (ratio: number): Point => [
      h.center[0] + (h.se[0] - h.center[0]) * ratio,
      h.center[1] + (h.se[1] - h.center[1]) * ratio,
    ];
    // 0.95 is nearest to three thirds; 0.55 to two.
    await pressHandleAndMove(page, h.se, at(0.95));
    await expect(readout(page)).toHaveText('× 1.00');
    await moveOn(page, at(0.55));
    await expect(readout(page)).toHaveText('× 0.67');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect((await helloInitial(page)).scale).toBeCloseTo(2 / 3, 5);
  });

  test('dragging a corner towards the centre shrinks the clip, but never below the minimum', async ({
    page,
  }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const at = (ratio: number): Point => [
      h.center[0] + (h.nw[0] - h.center[0]) * ratio,
      h.center[1] + (h.nw[1] - h.center[1]) * ratio,
    ];
    // In the default steps of 0.05: 0.47 of the way is 0.45; on the centre, the smallest step.
    await pressHandleAndMove(page, h.nw, at(0.47));
    expect((await helloInitial(page)).scale).toBe(0.45);
    await moveOn(page, h.center);
    expect((await helloInitial(page)).scale).toBe(0.05);
    // Free (Ctrl): the clamp itself on the centre, not zero; then back out past the start.
    await page.keyboard.down('ControlOrMeta');
    await moveOn(page, at(0.5));
    expect((await helloInitial(page)).scale).toBeCloseTo(0.5, 1);
    await moveOn(page, h.center);
    expect((await helloInitial(page)).scale).toBe(0.05);
    await moveOn(page, [h.nw[0] - 60, h.nw[1] - 30]);
    expect((await helloInitial(page)).scale).toBeGreaterThan(1.3);
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.up('Shift');
  });

  test('a rotation drag turns the clip counter-clockwise, as one undo step', async ({ page }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const radius = distance(h.rotate, h.center);
    // From straight above the centre to straight left of it: a quarter turn counter-clockwise.
    await pressHandleAndMove(page, h.rotate, [h.center[0] - radius, h.center[1]]);
    await expect(frame(page)).toHaveAttribute('data-transform-active', 'rotate');
    await expect(readout(page)).toHaveText(/^9\d(\.\d)?°$|^89\.\d°$/);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const rotated = await helloInitial(page);
    expect(rotated.rotation).toBeGreaterThan(88);
    expect(rotated.rotation).toBeLessThan(92);
    expect(rotated.scale).toBe(1);
    expect(rotated.position).toEqual([0, 0]);

    // The handles now follow the turned box: the rotation handle is left of the centre.
    await page.keyboard.down('Shift');
    const turned = await shownHandles(page);
    expect(Math.abs(screenAngle(turned.center, turned.rotate))).toBeGreaterThan(170);
    await page.keyboard.up('Shift');

    await undo(page);
    expect((await helloInitial(page)).rotation).toBe(0);
    expect(await canUndo(page)).toBe(false);
  });

  test('turning the other way is clockwise (negative), and a turn past 180° keeps counting', async ({
    page,
  }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const r = distance(h.rotate, h.center);
    const [cx, cy] = h.center;
    await pressHandleAndMove(page, h.rotate, [cx + r, cy]); // right: a quarter turn clockwise
    expect((await helloInitial(page)).rotation).toBeLessThan(-88);
    expect((await helloInitial(page)).rotation).toBeGreaterThan(-92);
    await moveOn(page, [cx, cy + r]); // below: half a turn
    expect((await helloInitial(page)).rotation).toBeLessThan(-178);
    await moveOn(page, [cx - r, cy]); // left: three quarters, i.e. -270°, not +90°
    const rotation = (await helloInitial(page)).rotation;
    expect(rotation).toBeLessThan(-268);
    expect(rotation).toBeGreaterThan(-272);
    await expect(readout(page)).toHaveText(/^-2[67]\d(\.\d)?°$/);
    await page.mouse.up();
    await page.keyboard.up('Shift');
  });

  test('the rotation snaps to 15° steps; Ctrl frees it', async ({ page }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const radius = distance(h.rotate, h.center);
    // 37° counter-clockwise from "up" (the handle starts at 90°; the pointer goes to 127°).
    const angle = (127 * Math.PI) / 180;
    const target: Point = [
      h.center[0] + radius * Math.cos(angle),
      h.center[1] - radius * Math.sin(angle),
    ];
    await pressHandleAndMove(page, h.rotate, target);
    await expect(readout(page)).toHaveText('30°'); // 37° rounds to the nearest multiple of 15°
    await page.mouse.up();
    expect((await helloInitial(page)).rotation).toBe(30);

    // With Ctrl held the same drag is free.
    await undo(page);
    await page.keyboard.down('ControlOrMeta');
    await pressHandleAndMove(page, h.rotate, target);
    await expect(readout(page)).toHaveText(/^3[5-8](\.\d)?°$/);
    const free = (await helloInitial(page)).rotation;
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.up('Shift');
    expect(free).toBeGreaterThan(35);
    expect(free).toBeLessThan(39);
  });

  test('Escape cancels a scale or rotation drag and leaves no history', async ({ page }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    await pressHandleAndMove(page, h.se, [h.se[0] + 80, h.se[1] + 40]);
    expect((await helloInitial(page)).scale).toBeGreaterThan(1.3);
    await page.keyboard.press('Escape');
    expect(await helloInitial(page)).toMatchObject({ scale: 1, rotation: 0 });
    await expect(readout(page)).toHaveCount(0);
    // Moving on after Escape changes nothing.
    await page.mouse.move((await pagePoint(page, h.se)).x + 150, (await pagePoint(page, h.se)).y, {
      steps: 4,
    });
    await page.mouse.up();
    expect((await helloInitial(page)).scale).toBe(1);
    expect(await canUndo(page)).toBe(false);

    // The same for the rotation handle.
    const radius = distance(h.rotate, h.center);
    await pressHandleAndMove(page, h.rotate, [h.center[0] + radius, h.center[1]]);
    expect((await helloInitial(page)).rotation).toBeLessThan(-80);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect((await helloInitial(page)).rotation).toBe(0);
    expect(await canUndo(page)).toBe(false);
  });

  test('releasing Shift during a drag does not abort it; the handles go when it ends', async ({
    page,
  }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    await pressHandleAndMove(page, h.se, [h.se[0] + 40, h.se[1] + 20]);
    const mid = (await helloInitial(page)).scale;
    expect(mid).toBeGreaterThan(1.1);
    await page.keyboard.up('Shift');
    await expect(frame(page)).not.toHaveAttribute('data-transform-handles', ''); // still shown
    const end = await pagePoint(page, [h.se[0] + 110, h.se[1] + 50]);
    await page.mouse.move(end.x, end.y, { steps: 5 });
    expect((await helloInitial(page)).scale).toBeGreaterThan(mid);
    await page.mouse.up();
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await undo(page);
    expect((await helloInitial(page)).scale).toBe(1);
    expect(await canUndo(page)).toBe(false);
  });

  test('handles take priority over picking a clip in front of them', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const initial = (scale: number) => ({
      position: [0, 0] as [number, number],
      scale,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      color: null,
      glyphColors: {},
    });
    // Track 1 is the front one: a big clip covering the small selected clip on track 2.
    await openWithProject(
      page,
      projectJson([
        clipJson('big', 'fa', 't1', 0, 6, { initial: initial(2.5) }),
        clipJson('small', 'fb', 't2', 0, 6, { initial: initial(0.5) }),
      ]),
    );
    await setTime(page, 3);
    await selectClips(page, ['small']);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    await pressHandleAndMove(page, h.ne, [h.ne[0] + 40, h.ne[1] - 20]);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['small'] });
    const clips = await page.evaluate(
      () =>
        (window as MfeWindow).__mfe!.useProjectStore.getState().project.clips as unknown as {
          id: string;
          initial: { scale: number; position: number[] };
        }[],
    );
    expect(clips.find((c) => c.id === 'small')!.initial.scale).toBeGreaterThan(0.6);
    expect(clips.find((c) => c.id === 'big')!.initial).toMatchObject({
      scale: 2.5,
      position: [0, 0],
    });
  });

  test('handles line up with the pointer at a device pixel ratio of 2', async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const target: Point = [h.se[0] + 60, h.se[1] + 30];
    await page.keyboard.down('ControlOrMeta'); // free: the exact ratio, not a step
    await pressHandleAndMove(page, h.se, target);
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await page.keyboard.up('Shift');
    const expected = distance(target, h.center) / distance(h.se, h.center);
    expect((await helloInitial(page)).scale).toBeCloseTo(expected, 1);
    // The box is where the formula is: the handle spans about the formula's width on screen.
    expect(distance(h.nw, h.ne)).toBeGreaterThan(100);
    expect(distance(h.nw, h.ne)).toBeLessThan(200);
    await context.close();
  });

  test('a click on a handle without moving edits nothing', async ({ page }) => {
    await openHelloSelected(page);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    const se = await pagePoint(page, h.se);
    await page.mouse.click(se.x, se.y);
    await page.keyboard.up('Shift');
    expect(await canUndo(page)).toBe(false);
    expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['c_a1'] });
  });

  test('without Shift a drag still moves the clip, handles or not', async ({ page }) => {
    await openHelloSelected(page);
    const box = await canvasBoxOf(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 5 });
    await page.mouse.up();
    const moved = await helloInitial(page);
    expect(moved.position[0]).toBeGreaterThan(0.5);
    expect(moved.scale).toBe(1);
  });

  test('unlocked, edits the keyframe in effect at the playhead (the target of the latest tween)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const tween = {
      id: 'tw',
      kind: 'tween' as const,
      start: 1,
      duration: 1,
      easing: 'linear',
      to: { position: [1, 0] },
    };
    await openWithProject(
      page,
      projectJson([clipJson('c1', 'fa', 't1', 0, 8, { actions: [tween] })]),
    );
    // Clips are locked after their first transformation; unlocked, the preview edits the
    // keyframe at the playhead (transformStates.spec.ts tests the lock).
    await page.getByTestId('clip-c1-transform-lock').click();
    await page.getByTestId('dialog-confirm').click();
    await setTime(page, 4); // after the tween: the keyframe is the tween's target
    await selectClips(page, ['c1']);
    await page.keyboard.down('Shift');
    const h = await shownHandles(page);
    await pressHandleAndMove(page, h.se, [h.se[0] + 60, h.se[1] + 30]);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const clip = await page.evaluate(
      () =>
        (window as MfeWindow).__mfe!.useProjectStore.getState().project.clips[0] as unknown as {
          initial: { scale: number };
          actions: { to: { scale?: number; position: number[] } }[];
        },
    );
    expect(clip.initial.scale).toBe(1);
    expect(clip.actions[0]!.to.scale).toBeGreaterThan(1.2);
    expect(clip.actions[0]!.to.position).toEqual([1, 0]);

    // Before the tween the same gesture edits the initial keyframe.
    await undo(page);
    await setTime(page, 0.5);
    await page.keyboard.down('Shift');
    const early = await shownHandles(page);
    await pressHandleAndMove(page, early.se, [early.se[0] + 60, early.se[1] + 30]);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const after = await page.evaluate(
      () =>
        (window as MfeWindow).__mfe!.useProjectStore.getState().project.clips[0] as unknown as {
          initial: { scale: number };
          actions: { to: { scale?: number } }[];
        },
    );
    expect(after.initial.scale).toBeGreaterThan(1.2);
    expect(after.actions[0]!.to.scale).toBeUndefined();
  });
});
