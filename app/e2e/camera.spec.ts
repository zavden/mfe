/* The scene's camera (the multicamera, D190): turning it on and off, and the Camera row of the
 * timeline. */
import { expect, test, type Page } from './test';
import { cameraOf, cameraProject, moveOf } from './cameraHelpers';
import { blockOf, dragBlock, emphasisJson, openBlockScene } from './blockHelpers';
import { openSubmenu, setTime, type MfeWindow } from './helpers';
import { openRelationScene, plain, relations } from './relationsHelpers';
import {
  box,
  canUndo,
  clipJson,
  clipOf,
  dragTo,
  openTimeline,
  PX_PER_SECOND,
  timeToX,
  uiState,
  undo,
} from './timelineHelpers';

/** A camera with a target camera and a move of each kind: to the target camera over [1, 2), to a
 * frame of its own over [3, 4), and back to the start over [5, 5.25). */
const THREE_MOVES = cameraProject({
  targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
  moves: [
    { id: 'n1', start: 1, duration: 1, to: { kind: 'target', target: 'k1' } },
    {
      id: 'n2',
      start: 3,
      duration: 1,
      to: { kind: 'frame', frame: { center: [-2, 0], height: 4 } },
    },
    { id: 'n3', start: 5, duration: 0.25, to: { kind: 'start' } },
  ],
});

const move = (page: Page, id: string) => page.getByTestId(`camera-move-${id}`);

async function zen(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.usePreferences.getState().set({ zenMode: true }),
  );
  await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-orientation', 'vertical');
}

test.describe('the multicamera', () => {
  test('View ▸ Multicamera and Alt+M give the project a camera and take it away', async ({
    page,
  }) => {
    await openTimeline(page, []);
    expect(await cameraOf(page)).toBeNull();
    await page.getByTestId('menu-view').click();
    const item = page.getByTestId('menu-item-view-multicamera');
    await expect(item).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await expect(item.locator('.menu-shortcut')).toHaveText(/M$/);
    await item.click();
    // A camera in Manim's own frame.
    expect(await cameraOf(page)).toEqual({
      initial: { center: [0, 0], height: 8 },
      targets: [],
      moves: [],
    });
    await page.getByTestId('menu-view').click();
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    // The key, out of every field: off, and on again.
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('Alt+m');
    expect(await cameraOf(page)).toBeNull();
    await page.keyboard.press('Alt+m');
    expect(await cameraOf(page)).not.toBeNull();
    // Each is a step of the project.
    await undo(page);
    expect(await cameraOf(page)).toBeNull();
    await undo(page);
    expect(await cameraOf(page)).not.toBeNull();
  });

  test('it stays on while the camera has a move or a target camera: a notice says why', async ({
    page,
  }) => {
    await openTimeline(page, [], {
      camera: cameraProject({
        moves: [{ id: 'n1', start: 1, duration: 1, to: { kind: 'start' } }],
      }),
    });
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('Alt+m');
    await expect(page.getByTestId('notice').last()).toContainText('Multicamera stays on');
    await expect(page.getByTestId('notice').last()).toContainText(
      'Delete every target camera and camera move to turn Multicamera off (there is 1 camera move).',
    );
    expect(await cameraOf(page)).not.toBeNull();
    // From the menu too: the item stays checked.
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menu-item-view-multicamera').click();
    expect(await cameraOf(page)).not.toBeNull();
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menu-item-view-multicamera')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

test.describe('the Camera row of the timeline', () => {
  test('is there while the multicamera is on, under the ruler, and stays as the tracks scroll', async ({
    page,
  }) => {
    // Enough tracks to scroll.
    const tracks = Array.from({ length: 14 }, (_, i) => ({
      id: `t${i + 1}`,
      name: `Track ${i + 1}`,
      hidden: false,
      locked: false,
    }));
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 3)], { tracks });
    const row = page.getByTestId('camera-row');
    await expect(row).toHaveCount(0);
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('Alt+m');
    await expect(row).toBeVisible();
    await expect(page.getByTestId('camera-header')).toContainText('Camera');
    // Right under the ruler's row (the ruler and the line under it).
    const ruler = await box(page.locator('.tl-ruler-row'));
    const before = await box(row);
    expect(before.y).toBeCloseTo(ruler.y + ruler.height, 0);
    expect(before.height).toBe(30);
    // The first track starts under it.
    const first = await box(page.getByTestId('track-row-t1'));
    expect(first.y).toBeCloseTo(before.y + before.height, 0);
    // Scrolled, the tracks pass under the row, which stays where it was.
    await page.getByTestId('timeline-scroll').evaluate((element) => {
      element.scrollTop = 200;
    });
    await expect
      .poll(async () => (await box(page.getByTestId('track-row-t1'))).y)
      .toBeLessThan(first.y - 150);
    expect((await box(row)).y).toBeCloseTo(before.y, 0);
    // Off, the row goes.
    await page.keyboard.press('Alt+m');
    await expect(row).toHaveCount(0);
  });

  test('draws the moves as blocks, each with its icon and where it goes', async ({ page }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    await expect(move(page, 'n1')).toHaveText('→ Camera 1');
    await expect(move(page, 'n2')).toHaveText('→ 200 %');
    await expect(move(page, 'n3')).toHaveText('→ Start');
    await expect(move(page, 'n1').locator('svg')).toHaveAttribute('data-icon', 'camera-move');
    await expect(move(page, 'n2').locator('svg')).toHaveAttribute('data-icon', 'camera-move');
    await expect(move(page, 'n3').locator('svg')).toHaveAttribute('data-icon', 'camera-back');
    // Each where its time is, as long as it lasts.
    const lane = await box(page.getByTestId('camera-lane'));
    const first = await box(move(page, 'n1'));
    expect(first.x).toBeCloseTo(await timeToX(page, 1), 0);
    expect(first.width).toBeCloseTo(PX_PER_SECOND, 0);
    expect(first.y).toBeGreaterThan(lane.y);
    expect(first.y + first.height).toBeLessThan(lane.y + lane.height);
    // A quarter of a second has no room for a name: the icon alone, the name in the tooltip.
    await expect(move(page, 'n3')).toHaveClass(/is-icon-only/);
    await expect(move(page, 'n3').locator('.tl-block-label')).toBeHidden();
    await expect(move(page, 'n3')).toHaveAttribute('title', /Camera move to Start, 5 s to 5.25 s/);
    await expect(move(page, 'n1')).toHaveAttribute(
      'aria-label',
      'Camera move to Camera 1, 1 s to 2 s',
    );
    // A press selects one.
    await move(page, 'n2').click();
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n2' });
    await expect(move(page, 'n2')).toHaveClass(/is-selected/);
    await expect(move(page, 'n1')).not.toHaveClass(/is-selected/);
    // The playhead crosses the row.
    await setTime(page, 2.5);
    const line = await box(page.locator('.tl-playhead-in-lane'));
    expect(line.x).toBeCloseTo(await timeToX(page, 2.5), 0);
    expect(line.height).toBeCloseTo(lane.height, 0);
  });

  test('«Add camera move»: at the playhead, a second long, towards the frame the camera is in', async ({
    page,
  }) => {
    // A clip whose intro runs over [0, 1) and its outro over [3, 4).
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 4)], {
      camera: cameraProject({ initial: { center: [1, 0.5], height: 4 } }),
    });
    await setTime(page, 1.5);
    await page.getByTestId('camera-add-move').click();
    let camera = (await cameraOf(page))!;
    expect(camera.moves).toHaveLength(1);
    const [made] = camera.moves;
    expect(made).toMatchObject({
      start: 1.5,
      duration: 1,
      easing: 'smooth',
      to: { kind: 'frame', frame: { center: [1, 0.5], height: 4 } },
    });
    // Selected, and the playhead at its end: where the camera is put where the move should arrive.
    const ui = await uiState(page);
    expect(ui.selection).toEqual({ kind: 'cameraMove', id: made!.id });
    expect(ui.time).toBeCloseTo(2.5, 6);
    await expect(move(page, made!.id)).toHaveText('→ 200 %');
    await expect(page.getByTestId('notice')).toHaveCount(0);
    // Asked for where an animation runs, it starts where the scene is free: after the outro.
    await setTime(page, 3.5);
    await page.getByTestId('camera-add-move').click();
    camera = (await cameraOf(page))!;
    expect(camera.moves).toHaveLength(2);
    expect(camera.moves[1]).toMatchObject({ start: 4, duration: 1 });
    await expect(page.getByTestId('notice').last()).toContainText('Camera move added at 4 s');
    // With less room than a second, it is as long as the room: [2.5, 3) before the outro.
    await setTime(page, 2.5);
    await page.getByTestId('camera-add-move').click();
    camera = (await cameraOf(page))!;
    expect(camera.moves[2]).toMatchObject({ start: 2.5, duration: 0.5 });
    await expect(page.getByTestId('notice').last()).toContainText('Camera move added, 0.5 s long');
    // One step each.
    await undo(page);
    expect((await cameraOf(page))!.moves).toHaveLength(2);
  });

  test('locked, the row adds no move; the lock is a step of the project', async ({ page }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    const lock = page.getByTestId('camera-lock');
    await expect(lock).toHaveAttribute('aria-pressed', 'false');
    await lock.click();
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    expect((await cameraOf(page))!.locked).toBe(true);
    await expect(page.getByTestId('camera-add-move')).toBeDisabled();
    await expect(page.getByTestId('camera-row')).toHaveClass(/is-locked/);
    // A locked move is still selected by a press.
    await move(page, 'n1').click();
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    await lock.click();
    expect((await cameraOf(page))!.locked).toBeUndefined();
    await undo(page);
    expect((await cameraOf(page))!.locked).toBe(true);
  });

  // The lock is reached with the keys, which can come while the button is held on a move: what
  // the drag has moved so far is not what gets locked (B-11 of the final audit).
  test('the lock pressed with the keys while a move is dragged gives the drag up first', async ({
    page,
  }) => {
    const oneMove = cameraProject({
      moves: [
        {
          id: 'm1',
          start: 1,
          duration: 0.5,
          easing: 'linear',
          to: { kind: 'frame', frame: { center: [2, 0], height: 8 } },
        },
      ],
    });
    await openTimeline(page, [], { camera: oneMove });
    const lock = page.getByTestId('camera-lock');
    const before = (await cameraOf(page))!;
    expect(before.moves[0]!.start).toBe(1);
    const dragged = move(page, 'm1');
    const rect = await box(dragged);
    const from = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    // Half a second along, the button held (Shift: no snap).
    await dragTo(
      page,
      from,
      { x: from.x + rect.width, y: from.y },
      { release: false, shift: true },
    );
    await expect(page.getByTestId('camera-drag-readout')).toBeVisible();
    expect((await cameraOf(page))!.moves[0]!.start).toBeGreaterThan(1.4);
    await expect(dragged).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('camera-add-move')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(lock).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('camera-drag-readout')).toHaveCount(0);
    await page.mouse.up();
    // The lock alone, as a click on it makes it: one step, which undo and redo take and give.
    const locked = { ...before, locked: true };
    expect(await cameraOf(page)).toEqual(locked);
    await undo(page);
    expect(await cameraOf(page)).toEqual(before);
    expect(await canUndo(page)).toBe(false);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await cameraOf(page)).toEqual(locked);
  });

  test('in the vertical timeline it stands beside the ruler, its moves down the time', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 3)], { camera: THREE_MOVES });
    await page.setViewportSize({ width: 1366, height: 768 });
    await zen(page);
    const row = await box(page.getByTestId('camera-row'));
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const track = await box(page.getByTestId('track-row-t1'));
    // A column 30 px wide, between the tracks and the ruler's row.
    expect(row.width).toBeCloseTo(30, 0);
    expect(row.x).toBeGreaterThan(track.x + track.width - 1);
    expect(row.x + row.width).toBeCloseTo((await box(page.locator('.tl-ruler-row'))).x, 0);
    // A move of a second is 80 px tall, where its time is down the ruler.
    const first = await box(move(page, 'n1'));
    expect(first.height).toBeCloseTo(PX_PER_SECOND, 0);
    expect(first.y).toBeCloseTo(ruler.y + PX_PER_SECOND, 0);
    expect(first.x).toBeGreaterThan(row.x);
    expect(first.x + first.width).toBeLessThan(row.x + row.width);
    // Its buttons are on the screen, and work.
    await page.getByTestId('camera-lock').click();
    expect((await cameraOf(page))!.locked).toBe(true);
  });
});

/* The scene of the drags: clip `a` over [0, 4] — its intro runs over [0, 1) and its outro over
 * [3, 4) — and a camera move over [1.5, 2). 80 px/s; the ruler's grid is 0.5 s. */
const DRAG_CLIP = clipJson('a', 'fa', 't1', 0, 4);
const ONE_MOVE = cameraProject({
  moves: [{ id: 'n1', start: 1.5, duration: 0.5, to: { kind: 'start' } }],
});

async function openDragScene(page: Page, camera = ONE_MOVE): Promise<void> {
  await openTimeline(page, [DRAG_CLIP], { camera });
}

/** The middle of a move's block. */
async function middle(page: Page, id: string): Promise<{ x: number; y: number }> {
  const b = await box(move(page, id));
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** The middle of one of a move's edges. */
async function edge(page: Page, id: string, which: 'start' | 'end') {
  const b = await box(page.getByTestId(`camera-move-${id}-${which}`));
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const seconds = (s: number) => s * PX_PER_SECOND;

test.describe('a camera move under the pointer', () => {
  test('is dragged along the time, and stops against the animation after it', async ({ page }) => {
    await openDragScene(page);
    const from = await middle(page, 'n1');
    // Shift: no snapping. 24 px are 0.3 s.
    await dragTo(page, from, { x: from.x + seconds(0.3), y: from.y }, { shift: true });
    expect(await moveOf(page, 'n1')).toMatchObject({ start: 1.8, duration: 0.5 });
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    // Pushed on past the outro, which starts at 3 s: it stops there, and says why.
    const next = await middle(page, 'n1');
    await dragTo(page, next, { x: next.x + seconds(3), y: next.y }, { release: false });
    expect(await moveOf(page, 'n1')).toMatchObject({ start: 2.5, duration: 0.5 });
    await expect(move(page, 'n1')).toHaveClass(/is-stopped/);
    await expect(page.getByTestId('camera-drag-time')).toHaveText('2.50 → 3.00 s · 0.50 s');
    await expect(page.getByTestId('camera-drag-stop')).toHaveText(
      'Stops here: The outro of "alpha" starts here, and nothing else animates while the camera moves.',
    );
    await page.mouse.up();
    await expect(page.getByTestId('camera-drag-readout')).toHaveCount(0);
    await expect(move(page, 'n1')).not.toHaveClass(/is-stopped/);
    // Each drag is one step.
    await undo(page);
    expect((await moveOf(page, 'n1')).start).toBe(1.8);
    await undo(page);
    expect((await moveOf(page, 'n1')).start).toBe(1.5);
    expect(await canUndo(page)).toBe(false);
  });

  test('snaps to the grid and to the edges of the animations; Escape gives the drag up', async ({
    page,
  }) => {
    await openDragScene(page);
    const from = await middle(page, 'n1');
    // 0.2 s back: nearer to 1.5 than to 1 on the grid, but its start is then 0.3 s from the
    // intro's end, out of reach: the grid keeps it at 1.5.
    await dragTo(page, from, { x: from.x - seconds(0.2), y: from.y });
    expect((await moveOf(page, 'n1')).start).toBe(1.5);
    // 0.42 s back, its start is 0.08 s from the end of the intro (1 s): it goes onto it.
    await dragTo(page, from, { x: from.x - seconds(0.42), y: from.y });
    expect((await moveOf(page, 'n1')).start).toBe(1);
    // Escape while it is held: back where it was, and no step.
    const now = await middle(page, 'n1');
    await dragTo(page, now, { x: now.x + seconds(0.5), y: now.y }, { release: false });
    expect((await moveOf(page, 'n1')).start).toBe(1.5);
    await page.keyboard.press('Escape');
    expect((await moveOf(page, 'n1')).start).toBe(1);
    await page.mouse.up();
    await undo(page);
    expect((await moveOf(page, 'n1')).start).toBe(1.5);
    expect(await canUndo(page)).toBe(false);
  });

  test('is stretched by its edges, as far as the animations and no shorter than a move is', async ({
    page,
  }) => {
    await openDragScene(page);
    // The end, half a second on: onto the grid.
    let grip = await edge(page, 'n1', 'end');
    await dragTo(page, grip, { x: grip.x + seconds(0.5), y: grip.y });
    expect(await moveOf(page, 'n1')).toMatchObject({ start: 1.5, duration: 1 });
    // The start, far back: it stops where the intro ends.
    grip = await edge(page, 'n1', 'start');
    await dragTo(page, grip, { x: grip.x - seconds(1.2), y: grip.y }, { release: false });
    expect(await moveOf(page, 'n1')).toMatchObject({ start: 1, duration: 1.5 });
    await expect(page.getByTestId('camera-drag-stop')).toContainText(
      'The intro of "alpha" ends here',
    );
    await page.mouse.up();
    // The end, back past the start: the shortest a move is.
    grip = await edge(page, 'n1', 'end');
    await dragTo(page, grip, { x: grip.x - seconds(2), y: grip.y }, { release: false });
    expect(await moveOf(page, 'n1')).toMatchObject({ start: 1, duration: 0.05 });
    await expect(page.getByTestId('camera-drag-stop')).toHaveText(
      'Stops here: A camera move lasts at least 0.05 s.',
    );
    await page.mouse.up();
  });

  test('stops against another move, and its menu copies and deletes it', async ({ page }) => {
    await openDragScene(
      page,
      cameraProject({
        moves: [
          { id: 'n1', start: 1.5, duration: 0.5, to: { kind: 'start' } },
          { id: 'n2', start: 2.25, duration: 0.5, to: { kind: 'start' } },
        ],
      }),
    );
    const from = await middle(page, 'n1');
    await dragTo(page, from, { x: from.x + seconds(1), y: from.y }, { release: false });
    expect((await moveOf(page, 'n1')).start).toBe(1.75);
    await expect(page.getByTestId('camera-drag-stop')).toContainText(
      'Another camera move starts here',
    );
    await page.keyboard.press('Escape');
    await page.mouse.up();
    // Its menu: a copy in the first place it fits after it — past the outro, at 4 s.
    await move(page, 'n2').click({ button: 'right' });
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n2' });
    await page.getByTestId('camera-move-menu-duplicate').click();
    let camera = (await cameraOf(page))!;
    expect(camera.moves).toHaveLength(3);
    const copy = camera.moves[2]!;
    expect(copy).toMatchObject({ start: 4, duration: 0.5, to: { kind: 'start' } });
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: copy.id });
    // And deleting.
    await move(page, 'n1').click({ button: 'right' });
    await page.getByTestId('camera-move-menu-delete').click();
    camera = (await cameraOf(page))!;
    expect(camera.moves.map((m) => m.id)).toEqual(['n2', copy.id]);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    await undo(page);
    expect((await cameraOf(page))!.moves).toHaveLength(3);
  });

  test('a right-click on the row adds a move where it was clicked', async ({ page }) => {
    await openDragScene(page);
    const lane = await box(page.getByTestId('camera-lane'));
    await page.mouse.click(await timeToX(page, 6), lane.y + lane.height / 2, { button: 'right' });
    await expect(page.getByTestId('camera-lane-menu-add')).toHaveText('Add camera move here (6 s)');
    await page.getByTestId('camera-lane-menu-add').click();
    const camera = (await cameraOf(page))!;
    expect(camera.moves).toHaveLength(2);
    expect(camera.moves[1]).toMatchObject({ start: 6, duration: 1 });
    expect((await uiState(page)).time).toBe(7);
  });

  test('locked, the row lets its moves be selected and nothing else', async ({ page }) => {
    await openDragScene(page, { ...ONE_MOVE, locked: true });
    const from = await middle(page, 'n1');
    await dragTo(page, from, { x: from.x + seconds(0.5), y: from.y });
    expect((await moveOf(page, 'n1')).start).toBe(1.5);
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    await expect(page.getByTestId('camera-move-n1-end')).toHaveCount(0);
    await move(page, 'n1').click({ button: 'right' });
    await expect(page.getByTestId('camera-move-menu-duplicate')).toBeDisabled();
    await expect(page.getByTestId('camera-move-menu-delete')).toBeDisabled();
    await page.keyboard.press('Escape');
    const lane = await box(page.getByTestId('camera-lane'));
    await page.mouse.click(await timeToX(page, 6), lane.y + lane.height / 2, { button: 'right' });
    await expect(page.getByTestId('camera-lane-menu-add')).toBeDisabled();
    expect(await canUndo(page)).toBe(false);
  });

  test('in the vertical timeline it is dragged down the time', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openTimeline(page, [DRAG_CLIP], { camera: ONE_MOVE });
    await page.setViewportSize({ width: 1366, height: 768 });
    await zen(page);
    const from = await middle(page, 'n1');
    await dragTo(page, from, { x: from.x, y: from.y + seconds(0.3) }, { shift: true });
    expect(await moveOf(page, 'n1')).toMatchObject({ start: 1.8, duration: 0.5 });
    // Sideways, across the tracks, nothing moves along the time.
    const next = await middle(page, 'n1');
    await dragTo(page, next, { x: next.x - 60, y: next.y }, { shift: true });
    expect((await moveOf(page, 'n1')).start).toBe(1.8);
    // Pushed down to the outro, its readout stands beside the row, on the screen.
    await dragTo(page, next, { x: next.x, y: next.y + seconds(3) }, { release: false });
    expect((await moveOf(page, 'n1')).start).toBe(2.5);
    const readout = await box(page.getByTestId('camera-drag-readout'));
    const row = await box(page.getByTestId('camera-row'));
    expect(readout.x + readout.width).toBeLessThanOrEqual(row.x);
    expect(readout.x).toBeGreaterThanOrEqual(0);
    await page.mouse.up();
  });
});

/** A camera with one move over `[start, start + duration)`. */
const moveOver = (start: number, duration: number) =>
  cameraProject({ moves: [{ id: 'n1', start, duration, to: { kind: 'start' } }] });

const region = (page: Page, id = 'n1') => page.getByTestId(`camera-region-${id}`);

test.describe('the locked region: nothing else animates while the camera moves', () => {
  test('is a hatched band under the move across every track, which follows the move', async ({
    page,
  }) => {
    // Clip `a` over [0, 10) on track 1 and `b` over [2, 8) on track 2, without intro or outro.
    await openBlockScene(page, [], { extra: { camera: moveOver(4, 1) } });
    const band = await box(region(page));
    expect(band.x).toBeCloseTo(await timeToX(page, 4), 0);
    expect(band.width).toBeCloseTo(PX_PER_SECOND, 0);
    const first = await box(page.getByTestId('track-row-t1'));
    const last = await box(page.getByTestId('track-row-t3'));
    expect(band.y).toBeCloseTo(first.y, 0);
    expect(band.y + band.height).toBeGreaterThanOrEqual(last.y + last.height - 1);
    await expect(region(page)).not.toHaveClass(/is-clash/);
    // It lets a press through: the clip under it is selected.
    const clip = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 4.5), clip.y + clip.height - 6);
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
    // The move dragged a second back: the band is where the move is.
    const from = await middle(page, 'n1');
    await dragTo(page, from, { x: from.x - seconds(1), y: from.y });
    expect((await moveOf(page, 'n1')).start).toBe(3);
    expect((await box(region(page))).x).toBeCloseTo(await timeToX(page, 3), 0);
  });

  test('a block dragged to it stops at its edge and says why; it does not pass it', async ({
    page,
  }) => {
    await openBlockScene(page, [emphasisJson('e1', 1, 1)], { extra: { camera: moveOver(4, 1) } });
    await dragBlock(page, 'e1', 2.6, { release: false });
    expect(await blockOf(page, 'a', 'e1')).toMatchObject({ start: 3, duration: 1 });
    await expect(page.getByTestId('block-drag-stop')).toHaveText(
      'Stops here: The camera moves from 4.00 s to 5.00 s, and nothing else animates while it does.',
    );
    await page.mouse.up();
    // Asked for the other side of the move: no further than its edge.
    await dragBlock(page, 'e1', 4);
    expect((await blockOf(page, 'a', 'e1')).start).toBe(3);
    // Its end stretched into the move stops there too.
    await dragBlock(page, 'e1', -1.5);
    await dragBlock(page, 'e1', 3, { edge: 'end' });
    expect(await blockOf(page, 'a', 'e1')).toMatchObject({ start: 1.5, duration: 2.5 });
  });

  test('the window of a relation stops at it', async ({ page }) => {
    const relation = {
      id: 'r1',
      fromClipId: 'a',
      toClipId: 'b',
      offset: 2,
      duration: 1,
      easing: 'smooth',
      style: 'transform',
      pathArc: 0,
      pairs: [{ from: [0], to: [0], style: null }],
    };
    // Both clips over [0, 10): the window runs over [2, 3); the camera moves over [4, 5).
    await openRelationScene(page, [plain('a', 'fa', 't1', 0, 10), plain('b', 'fb', 't2', 0, 10)], {
      relations: [relation],
      camera: moveOver(4, 1),
    });
    const band = await box(page.getByTestId('relation-window-r1'));
    const from = { x: band.x + band.width / 2, y: band.y + band.height / 2 };
    await dragTo(page, from, { x: from.x + seconds(2.4), y: from.y });
    expect((await relations(page))[0]).toMatchObject({ offset: 3, duration: 1 });
  });

  test('an animation that runs during a move is an error: the band is in the danger colour', async ({
    page,
  }) => {
    // The Write of the clip runs over [0, 1): the camera moves over [0.5, 1).
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 4)], { camera: moveOver(0.5, 0.5) });
    await expect(region(page)).toHaveClass(/is-clash/);
    // A whole clip can still be dragged into it (the project is then in error, and says so); the
    // move dragged out of the animation's time clears it.
    const from = await middle(page, 'n1');
    await dragTo(page, from, { x: from.x + seconds(1), y: from.y });
    expect((await moveOf(page, 'n1')).start).toBe(1.5);
    await expect(region(page)).not.toHaveClass(/is-clash/);
  });

  test('the edge of an intro stops at it', async ({ page }) => {
    // Clip `ca` over [1, 9) with a Write of 1 s; the camera moves over [3, 4).
    await openTimeline(page, [clipJson('ca', 'fa', 't1', 1, 9)], { camera: moveOver(3, 1) });
    const handle = await box(page.getByTestId('clip-ca-intro-handle'));
    const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await dragTo(page, from, { x: from.x + seconds(3), y: from.y });
    expect((await clipOf(page, 'ca')).intro.duration).toBe(2);
  });

  test('an intro given from the menu that would run during a move is asked about first', async ({
    page,
  }) => {
    await openRelationScene(page, [plain('a', 'fa', 't1', 0, 10)], { camera: moveOver(0.5, 1) });
    const clip = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 2.5), clip.y + clip.height - 6, {
      button: 'right',
    });
    await openSubmenu(page, 'clip-menu-intro');
    await page.getByTestId('clip-menu-intro-write').click();
    await expect(page.getByTestId('dialog-details')).toHaveText(
      'The camera moves from 0.50 s to 1.50 s, and nothing else animates while it does.',
    );
    await expect(page.getByTestId('dialog-fit')).toHaveText('Shorten it to 0.50 s');
    await page.getByTestId('dialog-fit').click();
    expect((await clipOf(page, 'a')).intro).toMatchObject({ kind: 'write', duration: 0.5 });
    await expect(region(page)).not.toHaveClass(/is-clash/);
  });
});

test.describe('the Camera row from the keyboard', () => {
  const announcer = (page: Page) => page.getByTestId('announcer');
  const FRAME = 1 / 60;

  test('Tab reaches its moves after its buttons; the arrows go from move to move', async ({
    page,
  }) => {
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 3)], { camera: THREE_MOVES });
    await setTime(page, 2.5);
    await page.getByTestId('camera-add-move').focus();
    await page.keyboard.press('Tab');
    // The first move to run holds the row's Tab stop while none is selected.
    await expect(move(page, 'n1')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(move(page, 'n2')).toBeFocused();
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n2' });
    await page.keyboard.press('End');
    await expect(move(page, 'n3')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(move(page, 'n3')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(move(page, 'n1')).toBeFocused();
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    // The arrows are the row's there: the playhead stays.
    expect((await uiState(page)).time).toBe(2.5);
    // One Tab stop: the next Tab leaves the row for the tracks.
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('track-name-t1')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(move(page, 'n1')).toBeFocused();
  });

  test('Enter and the Menu key open the menu of the focused move', async ({ page }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    await move(page, 'n2').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('camera-move-menu')).toBeVisible();
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n2' });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('camera-move-menu')).toHaveCount(0);
    await expect(move(page, 'n2')).toBeFocused();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByTestId('camera-move-menu')).toBeVisible();
    // Opened from the keyboard, the menu has the focus on its first entry. Deleting from it: the
    // focus goes to the row's Tab stop.
    await expect(page.getByTestId('camera-move-menu-isolate')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('camera-move-menu-duplicate')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('camera-move-menu-delete')).toBeFocused();
    await page.keyboard.press('Enter');
    expect((await cameraOf(page))!.moves.map((m) => m.id)).toEqual(['n1', 'n3']);
    await expect(move(page, 'n1')).toBeFocused();
  });

  test('Alt+←/→ nudge the selected move a frame, and it says where it went or what stops it', async ({
    page,
  }) => {
    // Clip `a` over [0, 4]: its intro ends at 1 s. The move runs over [1.5, 2).
    await openDragScene(page);
    // Reached with Tab, not selected yet: the key acts on the move that has the focus.
    await move(page, 'n1').focus();
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    await page.keyboard.press('Alt+ArrowRight');
    expect((await moveOf(page, 'n1')).start).toBeCloseTo(1.5 + FRAME, 6);
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    await expect(announcer(page)).toContainText('Camera move moved to 1.52 s');
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    expect((await moveOf(page, 'n1')).start).toBeCloseTo(1.5 - 4 * FRAME, 6);
    // As far as the intro, and no further.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Alt+Shift+ArrowLeft');
    expect((await moveOf(page, 'n1')).start).toBe(1);
    await page.keyboard.press('Alt+ArrowLeft');
    expect((await moveOf(page, 'n1')).start).toBe(1);
    await expect(announcer(page)).toContainText(
      'The intro of "alpha" ends here, and nothing else animates while the camera moves.',
    );
    // The move keeps the focus, and each nudge is a step.
    await expect(move(page, 'n1')).toBeFocused();
    await undo(page);
    expect((await moveOf(page, 'n1')).start).toBeGreaterThan(1);
  });

  test('Ctrl/⌘+D copies the selected move and Delete removes it; the focus stays in the row', async ({
    page,
  }) => {
    await openDragScene(page);
    await move(page, 'n1').focus();
    await page.keyboard.press('ControlOrMeta+d');
    let camera = (await cameraOf(page))!;
    expect(camera.moves).toHaveLength(2);
    const copy = camera.moves[1]!;
    // [2, 2.5) is free, right after it.
    expect(copy).toMatchObject({ start: 2, duration: 0.5 });
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: copy.id });
    await expect(announcer(page)).toContainText('Camera move to Start, 2 s to 2.5 s added');
    // The copy is the selected one: Delete removes it, and says so.
    await page.keyboard.press('Delete');
    camera = (await cameraOf(page))!;
    expect(camera.moves.map((m) => m.id)).toEqual(['n1']);
    await expect(announcer(page)).toContainText('Camera move to Start, 2 s to 2.5 s deleted');
    // The last one deleted with the focus on it: the focus goes to «Add camera move».
    await move(page, 'n1').click();
    await page.keyboard.press('Delete');
    expect((await cameraOf(page))!.moves).toEqual([]);
    await expect(page.getByTestId('camera-add-move')).toBeFocused();
  });

  test('in the vertical timeline the arrows down and up go along the moves', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openTimeline(page, [], { camera: THREE_MOVES });
    await page.setViewportSize({ width: 1366, height: 768 });
    await zen(page);
    await move(page, 'n1').focus();
    await page.keyboard.press('ArrowDown');
    await expect(move(page, 'n2')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(move(page, 'n1')).toBeFocused();
    // Alt+↓ nudges it down the time.
    await page.keyboard.press('Alt+ArrowDown');
    expect((await moveOf(page, 'n1')).start).toBeCloseTo(1 + FRAME, 6);
  });
});

test.describe('the camera in the Animations panel', () => {
  /** Type a value into a field of the panel and commit it. */
  async function type(page: Page, testId: string, value: string): Promise<void> {
    const field = page.getByTestId(testId);
    await field.fill(value);
    await field.press('Enter');
  }

  test('a selected move shows when it runs, its easing and where it goes', async ({ page }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    await move(page, 'n2').click();
    const panel = page.getByTestId('camera-move-properties');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('camera-move-title')).toContainText('Camera move');
    await expect(page.getByTestId('camera-move-name')).toHaveText('→ 200 %');
    await expect(page.getByTestId('camera-move-timing-section')).toHaveAttribute(
      'data-tone',
      'timing',
    );
    await expect(page.getByTestId('camera-move-destination-section')).toHaveAttribute(
      'data-tone',
      'camera',
    );
    // When it runs: over [3, 4).
    await expect(page.getByTestId('camera-move-start')).toHaveValue('3');
    await expect(page.getByTestId('camera-move-duration')).toHaveValue('1');
    // Start and duration, typed: inside the free time around the move.
    await move(page, 'n3').click();
    await type(page, 'camera-move-start', '6');
    expect(await moveOf(page, 'n3')).toMatchObject({ start: 6, duration: 0.25 });
    await type(page, 'camera-move-duration', '1.5');
    expect(await moveOf(page, 'n3')).toMatchObject({ start: 6, duration: 1.5 });
    await page.getByTestId('camera-move-easing').selectOption('linear');
    expect((await moveOf(page, 'n3')).easing).toBe('linear');
    await expect(page.getByTestId('block-easing-curve')).toHaveAttribute('data-easing', 'linear');
    // Where it goes: to a target camera, to a frame of its own (the one it went to), to the start.
    const to = page.getByTestId('camera-move-to');
    await expect(to).toHaveValue('start');
    await to.selectOption({ label: 'Camera 1' });
    expect((await moveOf(page, 'n3')).to).toEqual({ kind: 'target', target: 'k1' });
    await expect(move(page, 'n3')).toHaveText('→ Camera 1');
    await expect(page.getByTestId('camera-move-target-hint')).toContainText('(3, 1), 200 %');
    await to.selectOption({ label: 'A frame of its own' });
    expect((await moveOf(page, 'n3')).to).toEqual({
      kind: 'frame',
      frame: { center: [3, 1], height: 4 },
    });
    await type(page, 'camera-move-x', '-1.5');
    await type(page, 'camera-move-zoom', '400');
    expect((await moveOf(page, 'n3')).to).toEqual({
      kind: 'frame',
      frame: { center: [-1.5, 1], height: 2 },
    });
    await expect(move(page, 'n3')).toHaveText('→ 400 %');
    // Each field is one step.
    await undo(page);
    expect((await moveOf(page, 'n3')).to).toMatchObject({ frame: { height: 4 } });
    // Deleted from its panel, the view is gone.
    await page.getByTestId('camera-move-delete').click();
    await expect(panel).toHaveCount(0);
    expect((await cameraOf(page))!.moves.map((m) => m.id)).toEqual(['n1', 'n2']);
  });

  // With the button held on a field, the wheel turns its number, written as it turns and no step
  // until the button is let go. The keys still reach the field beside it: what is committed there
  // is that field's coordinate, not the frame as the wheel had it (B-42 of the final audit).
  test('a field committed while the wheel turns another writes its own coordinate alone', async ({
    page,
  }) => {
    await openTimeline(page, [], { camera: cameraProject({}) });
    await page.getByTestId('camera-name').click();
    const x = page.getByTestId('camera-frame-x');
    const y = page.getByTestId('camera-frame-y');
    const before = (await cameraOf(page))!;
    await y.hover();
    await page.mouse.down();
    await expect(y).toBeFocused();
    await page.mouse.wheel(0, -100);
    await expect(y).toHaveClass(/is-scrubbing/);
    expect((await cameraOf(page))!.initial.center[1]).toBeGreaterThan(0);
    await page.keyboard.press('Shift+Tab');
    await expect(x).toBeFocused();
    await type(page, 'camera-frame-x', '2');
    await page.mouse.up();
    // As X typed with nothing else going on: one step, which undo and redo take and give.
    const committed = { ...before, initial: { center: [2, 0], height: 8 } };
    expect(await cameraOf(page)).toEqual(committed);
    await undo(page);
    expect(await cameraOf(page)).toEqual(before);
    expect(await canUndo(page)).toBe(false);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await cameraOf(page)).toEqual(committed);
  });

  test('the camera’s own view edits the frame it rests in at the playhead', async ({ page }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    await page.getByTestId('camera-name').click();
    expect((await uiState(page)).selection).toEqual({ kind: 'camera' });
    await expect(page.getByTestId('camera-properties')).toBeVisible();
    await expect(page.getByTestId('camera-name')).toHaveAttribute('aria-pressed', 'true');
    // At 0 s: the frame of 0 s.
    await expect(page.getByTestId('camera-frame-owner')).toContainText('The frame at 0 s');
    await type(page, 'camera-frame-x', '1.5');
    expect((await cameraOf(page))!.initial).toEqual({ center: [1.5, 0], height: 8 });
    // While a move runs there is no frame to set: the playhead can be taken to its end.
    await setTime(page, 1.5);
    await expect(page.getByTestId('camera-frame-moving')).toContainText(
      'The camera is on its way at 1.5 s',
    );
    await expect(page.getByTestId('camera-frame-x')).toHaveCount(0);
    await page.getByTestId('camera-frame-to-end').click();
    expect((await uiState(page)).time).toBe(2);
    // There it rests on its target camera: the fields are that camera's.
    await expect(page.getByTestId('camera-frame-owner')).toContainText(
      'Camera 1: a target camera, where 1 move goes.',
    );
    await type(page, 'camera-frame-zoom', '100');
    expect((await cameraOf(page))!.targets[0]).toMatchObject({ center: [3, 1], height: 8 });
    // After the second move: its own destination.
    await setTime(page, 4.5);
    await expect(page.getByTestId('camera-frame-owner')).toContainText(
      'The destination of the move that ends at 4 s',
    );
    await type(page, 'camera-frame-y', '2');
    expect((await moveOf(page, 'n2')).to).toEqual({
      kind: 'frame',
      frame: { center: [-2, 2], height: 4 },
    });
    // «Add move» adds one at the playhead.
    await page.getByTestId('camera-add-move-here').click();
    expect((await cameraOf(page))!.moves).toHaveLength(4);
  });

  test('target cameras are added, named, moved to and deleted from the panel', async ({ page }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    await page.getByTestId('camera-name').click();
    await expect(page.getByTestId('camera-target-k1')).toContainText('(3, 1), 200 % · 1 move');
    await setTime(page, 4.5);
    await page.getByTestId('camera-add-target').click();
    // The new one has the frame the camera is in, and its own view.
    let camera = (await cameraOf(page))!;
    const made = camera.targets[1]!;
    expect(made).toMatchObject({ name: 'Camera 2', center: [-2, 0], height: 4 });
    await expect(page.getByTestId('target-camera-title')).toHaveText('Camera 2');
    await type(page, 'target-camera-name', 'Close-up');
    await expect(page.getByTestId('target-camera-title')).toHaveText('Close-up');
    await type(page, 'target-camera-y', '-1');
    expect((await cameraOf(page))!.targets[1]).toMatchObject({
      name: 'Close-up',
      center: [-2, -1],
    });
    // «Move camera here»: a move to it at the playhead, [4.5, 5).
    await expect(page.getByTestId('target-camera-unused')).toBeVisible();
    await page.getByTestId('target-camera-move-here').click();
    camera = (await cameraOf(page))!;
    const added = camera.moves[3]!;
    expect(added).toMatchObject({
      start: 4.5,
      duration: 0.5,
      to: { kind: 'target', target: made.id },
    });
    await expect(move(page, added.id)).toHaveAttribute('aria-label', /Camera move to Close-up/);
    // Back in its view: deleting it asks, since a move goes to it, and the move keeps its frame.
    await page.getByTestId('camera-move-edit-target').click();
    await expect(page.getByTestId(`target-camera-move-${added.id}`)).toBeVisible();
    await page.getByTestId('target-camera-delete').click();
    await expect(page.getByTestId('dialog')).toContainText('Delete Close-up?');
    await expect(page.getByTestId('dialog')).toContainText('1 camera move goes to it');
    await page.getByTestId('dialog-confirm').click();
    camera = (await cameraOf(page))!;
    expect(camera.targets.map((t) => t.name)).toEqual(['Camera 1']);
    expect(camera.moves.find((m) => m.id === added.id)!.to).toEqual({
      kind: 'frame',
      frame: { center: [-2, -1], height: 4 },
    });
    // Its view gave way to the camera's.
    await expect(page.getByTestId('camera-properties')).toBeVisible();
  });

  test('a locked camera shows its fields disabled', async ({ page }) => {
    await openTimeline(page, [], { camera: { ...THREE_MOVES, locked: true } });
    await move(page, 'n2').click();
    await expect(page.getByTestId('camera-locked')).toContainText('The camera is locked');
    await expect(page.getByTestId('camera-move-start')).toBeDisabled();
    await expect(page.getByTestId('camera-move-to')).toBeDisabled();
    await expect(page.getByTestId('camera-move-delete')).toBeDisabled();
    await page.getByTestId('camera-move-camera').click();
    await expect(page.getByTestId('camera-frame-x')).toBeDisabled();
    await expect(page.getByTestId('camera-add-target')).toBeDisabled();
  });
});

/* The Preview with the multicamera on: the world view, and the camera's rectangles in it. */

interface CameraRects {
  /** left, top, width, height, in CSS px from the canvas corner. */
  camera: [number, number, number, number];
  owner: { kind: string; id?: string } | null;
  start: [number, number, number, number];
  origin: [number, number, number, number];
  targets: Record<string, [number, number, number, number]>;
  moves: Record<string, [number, number, number, number]>;
}

const frame = (page: Page) => page.getByTestId('preview-frame');

/** Where the Preview says the camera's rectangles are. */
async function cameraRects(page: Page): Promise<CameraRects> {
  const text = await frame(page).getAttribute('data-camera-scene');
  if (!text) throw new Error('the Preview draws no camera');
  return JSON.parse(text) as CameraRects;
}

/** A point of a rectangle on the page: `fx`, `fy` of the way across and down it. */
async function at(page: Page, rect: [number, number, number, number], fx: number, fy: number) {
  const origin = await box(frame(page));
  return { x: origin.x + rect[0] + rect[2] * fx, y: origin.y + rect[1] + rect[3] * fy };
}

/** Press, move and release with a key held during the move (Ctrl/⌘: no snapping; Shift: one
 * axis). */
async function dragHolding(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  key: 'ControlOrMeta' | 'Shift' | null,
  release = true,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (key) await page.keyboard.down(key);
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  if (release) await page.mouse.up();
  if (key) await page.keyboard.up(key);
}

/** Where the first symbol of clip `a` is from the centre of Manim's frame, as fractions of the
 * frame's width and height: a pointer there is on a symbol, not between two. */
async function firstSymbol(page: Page): Promise<{ fx: number; fy: number }> {
  const [x, y] = await page.evaluate(() => {
    const project = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
      formulas: { id: string; snapshot: { glyphs: { center: [number, number] }[] } | null }[];
      clips: { id: string; formulaId: string; initial: { position: [number, number] } }[];
    };
    const clip = project.clips.find((c) => c.id === 'a')!;
    const glyph = project.formulas.find((f) => f.id === clip.formulaId)!.snapshot!.glyphs[0]!;
    return [clip.initial.position[0] + glyph.center[0], clip.initial.position[1] + glyph.center[1]];
  });
  return { fx: 0.5 + x! / ((8 * 16) / 9), fy: 0.5 - y! / 8 };
}

test.describe('the Preview with the multicamera on', () => {
  test('shows the world: its canvas takes the whole stage, and its button turns it on and off', async ({
    page,
  }) => {
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 3)]);
    const before = await box(frame(page));
    expect(before.width / before.height).toBeCloseTo(16 / 9, 1);
    const button = page.getByTestId('preview-multicamera');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();
    await expect(frame(page)).toHaveAttribute('data-world', 'true');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await cameraOf(page)).not.toBeNull();
    // The canvas is the stage inside its padding, whatever the picture's shape.
    const stage = await box(page.locator('.preview-stage'));
    await expect.poll(async () => (await box(frame(page))).width).toBeGreaterThan(stage.width - 22);
    const world = await box(frame(page));
    expect(world.height).toBeGreaterThan(stage.height - 22);
    // The camera is in Manim's own frame, which fits the canvas whole.
    const rects = await cameraRects(page);
    expect(rects.camera).toEqual(rects.origin);
    expect(rects.owner).toEqual({ kind: 'initial' });
    expect(rects.camera[2] / rects.camera[3]).toBeCloseTo(16 / 9, 1);
    expect(rects.camera[3]).toBeLessThanOrEqual(world.height + 1);
    // Off again: the frame is the picture's.
    await button.click();
    await expect(frame(page)).not.toHaveAttribute('data-world', 'true');
    await expect
      .poll(async () => {
        const now = await box(frame(page));
        return now.width / now.height;
      })
      .toBeCloseTo(16 / 9, 1);
    expect(await cameraOf(page)).toBeNull();
  });

  test('its button says what holds the multicamera on', async ({ page }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    const button = page.getByTestId('preview-multicamera');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAttribute('title', /Delete every target camera and camera move/);
    // It says it is disabled, and a press on it gives the reason as a notice (Playwright does
    // not press what says so unless forced).
    await button.click({ force: true });
    await expect(page.getByTestId('notice').last()).toContainText('Multicamera stays on');
    expect(await cameraOf(page)).not.toBeNull();
  });

  test('the camera is taken by its edge and dragged: the frame it rests in moves', async ({
    page,
  }) => {
    await openTimeline(page, [], {
      camera: cameraProject({ initial: { center: [0, 0], height: 4 } }),
    });
    const rects = await cameraRects(page);
    // Pixels per unit of the scene: the frame is 4 units tall.
    const unit = rects.camera[3] / 4;
    const edge = await at(page, rects.camera, 0, 0.3);
    await page.mouse.move(edge.x, edge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:body');
    // Ctrl/⌘ held: no snapping. 60 px right and 30 px down.
    await dragHolding(page, edge, { x: edge.x + 60, y: edge.y + 30 }, 'ControlOrMeta');
    const camera = (await cameraOf(page))!;
    expect(camera.initial.center[0]).toBeCloseTo(60 / unit, 2);
    expect(camera.initial.center[1]).toBeCloseTo(-30 / unit, 2);
    expect(camera.initial.height).toBe(4);
    expect((await uiState(page)).selection).toEqual({ kind: 'camera' });
    // Selected, the Preview says how it is moved.
    await expect(page.getByTestId('preview-camera-hint')).toContainText(
      'Drag it by its edge, its name or its centre',
    );
    // One drag, one step.
    await undo(page);
    expect((await cameraOf(page))!.initial.center).toEqual([0, 0]);
    expect(await canUndo(page)).toBe(false);
    // Its inside is the scene's: a press there is no press on the camera.
    const inside = await at(page, rects.camera, 0.3, 0.3);
    await page.mouse.click(inside.x, inside.y);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
  });

  test('a rectangle let go off the canvas is not left as the one the pointer is over', async ({
    page,
  }) => {
    await openTimeline(page, [], {
      camera: cameraProject({ initial: { center: [3, 0], height: 4 } }),
    });
    const rects = await cameraRects(page);
    const stage = await box(frame(page));
    const edge = await at(page, rects.camera, 1, 0.4);
    await page.mouse.move(edge.x, edge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:body');
    // Dragged past the right side of the canvas and let go there.
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width + 30, edge.y, { steps: 6 });
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:body');
    await page.mouse.up();
    expect((await cameraOf(page))!.initial.center[0]).toBeGreaterThan(3);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', '');
    // Let go on the canvas, it is still under the pointer.
    const left = await at(page, (await cameraRects(page)).camera, 0, 0.4);
    await page.mouse.move(left.x, left.y);
    await page.mouse.down();
    await page.mouse.move(left.x - 30, left.y, { steps: 4 });
    await page.mouse.up();
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:body');
  });

  test('only the camera answers the pointer there: the objects are left alone', async ({
    page,
  }) => {
    const clip = clipJson('a', 'fa', 't1', 0, 8);
    clip.initial.position = [-3, 1];
    await openTimeline(page, [clip], { camera: cameraProject() });
    await setTime(page, 2);
    await expect(frame(page)).not.toHaveAttribute('data-drawable-count', '0');
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'camera');
    await expect(page.getByTestId('preview-world-hint')).toContainText('camera view (V)');
    // The circle selector, which takes the symbol nearest to the pointer: a pointer on a symbol
    // has one within its reach, whatever the symbol's shape.
    await page.getByTestId('preview-circle-select').click();
    const rects = await cameraRects(page);
    const symbol = await firstSymbol(page);
    const onClip = await at(page, rects.origin, symbol.fx, symbol.fy);
    const empty = await at(page, rects.origin, 0.8, 0.8);
    // No outline under the pointer, and no press on it: a click there only clears the selection,
    // as one on the empty scene does.
    await page.mouse.move(onClip.x, onClip.y);
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    const edge = await at(page, rects.camera, 0, 0.3);
    await page.mouse.click(edge.x, edge.y);
    expect((await uiState(page)).selection).toEqual({ kind: 'camera' });
    await page.mouse.click(onClip.x, onClip.y);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    // Nor is it dragged, picked with Alt or opened by a double-click, and no rectangle grows.
    await dragHolding(page, onClip, { x: onClip.x + 80, y: onClip.y + 40 }, 'ControlOrMeta');
    expect((await clipOf(page, 'a')).initial.position).toEqual([-3, 1]);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    await dragHolding(page, empty, { x: onClip.x, y: onClip.y }, null, false);
    await expect(frame(page)).toHaveAttribute('data-marquee', '');
    await page.mouse.up();
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    await page.keyboard.down('Alt');
    await page.mouse.click(onClip.x, onClip.y);
    await page.keyboard.up('Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await page.mouse.dblclick(onClip.x, onClip.y);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // A right-click on it opens the scene's menu, not the clip's.
    await page.mouse.click(onClip.x, onClip.y, { button: 'right' });
    await expect(page.getByTestId('preview-space-menu')).toBeVisible();
    await expect(page.getByTestId('preview-menu')).toHaveCount(0);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    await page.keyboard.press('Escape');
    // A clip selected elsewhere shows no handles here; in the camera view it does, and there the
    // objects answer the pointer as ever.
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      mfe.usePreferences.getState().set({ keepHandles: true });
      mfe.useUiStore.getState().select({ kind: 'clips', ids: ['a'] });
    });
    await expect(frame(page)).toHaveAttribute('data-transform-handles', '');
    await expect(page.getByTestId('preview-handles-hint')).toHaveCount(0);
    await page.keyboard.press('v');
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'objects');
    await expect(frame(page)).not.toHaveAttribute('data-transform-handles', '');
    await expect(page.getByTestId('preview-world-hint')).toHaveCount(0);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'none' }),
    );
    // The camera is in Manim's frame, which the canvas shows whole there.
    const canvas = await box(page.getByTestId('preview-canvas'));
    const seen = {
      x: canvas.x + canvas.width * symbol.fx,
      y: canvas.y + canvas.height * symbol.fy,
    };
    await page.mouse.move(seen.x, seen.y);
    await expect(frame(page)).toHaveAttribute('data-hover', 'a:0');
    await page.mouse.click(seen.x, seen.y);
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
  });

  test('F held gives the pointer to the objects there, until it is let go', async ({ page }) => {
    const clip = clipJson('a', 'fa', 't1', 0, 8);
    clip.initial.position = [-3, 1];
    await openTimeline(page, [clip], {
      camera: cameraProject({ initial: { center: [0, 0], height: 6 } }),
    });
    await setTime(page, 2);
    await expect(frame(page)).not.toHaveAttribute('data-drawable-count', '0');
    await expect(page.getByTestId('preview-world-hint')).toContainText('hold F for the objects');
    await page.getByTestId('preview-circle-select').click();
    const rects = await cameraRects(page);
    const unit = rects.origin[3] / 8;
    const symbol = await firstSymbol(page);
    const onClip = await at(page, rects.origin, symbol.fx, symbol.fy);
    const edge = await at(page, rects.camera, 0, 0.3);

    // F pressed anew: on a Mac the release of ⌘ ends the hold (a letter let go while ⌘ is down is
    // never heard there), so the key is pressed again after every drag made with Ctrl/⌘.
    const holdAgain = async () => {
      await page.keyboard.up('f');
      await page.keyboard.down('f');
      await expect(frame(page)).toHaveAttribute('data-objects-key', 'true');
    };
    // Held: the world view answers as the camera view does, and says so.
    await page.keyboard.down('f');
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'objects');
    await expect(frame(page)).toHaveAttribute('data-objects-key', 'true');
    await expect(page.getByTestId('preview-objects-key-hint')).toContainText('F held');
    await expect(page.getByTestId('preview-world-hint')).toHaveCount(0);
    await page.mouse.move(onClip.x, onClip.y);
    await expect(frame(page)).toHaveAttribute('data-hover', 'a:0');
    // The camera's rectangles are the ones left alone now.
    await page.mouse.move(edge.x, edge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', '');
    // A press takes the object and a drag moves it, Ctrl/⌘ held for no snapping — the key's
    // repeats then are Ctrl/⌘+F, which opens nothing.
    await dragHolding(page, onClip, { x: onClip.x + 80, y: onClip.y + 40 }, 'ControlOrMeta');
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
    const moved = (await clipOf(page, 'a')).initial.position;
    expect(moved[0]).toBeCloseTo(-3 + 80 / unit, 1);
    expect(moved[1]).toBeCloseTo(1 - 40 / unit, 1);
    await holdAgain();
    await page.keyboard.down('ControlOrMeta');
    await page.keyboard.down('f');
    await page.keyboard.up('ControlOrMeta');
    await expect(page.getByTestId('formula-search')).toHaveCount(0);
    await holdAgain();
    // Selected, it has its hint and — with Shift — its handles, as in the camera view.
    await expect(page.getByTestId('preview-handles-hint')).toBeVisible();
    await page.keyboard.down('Shift');
    await expect(frame(page)).not.toHaveAttribute('data-transform-handles', '');
    await page.keyboard.up('Shift');
    // Its own menu, on a right-click.
    const now = { x: onClip.x + 80, y: onClip.y + 40 };
    await page.mouse.click(now.x, now.y, { button: 'right' });
    await expect(page.getByTestId('preview-menu')).toBeVisible();
    await page.keyboard.press('Escape');

    // Let go: the camera's rectangles answer again, and the objects are left alone.
    await page.keyboard.up('f');
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'camera');
    await expect(frame(page)).not.toHaveAttribute('data-objects-key', 'true');
    await page.mouse.move(now.x, now.y);
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    await page.mouse.move(edge.x, edge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:body');

    // A drag begun with the key held goes on to its end once the key is let go.
    await page.keyboard.down('f');
    await page.mouse.move(now.x, now.y);
    await page.mouse.down();
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.move(now.x + 20, now.y, { steps: 3 });
    await page.keyboard.up('f');
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'camera');
    await page.mouse.move(now.x + 60, now.y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    expect((await clipOf(page, 'a')).initial.position[0]).toBeCloseTo(moved[0] + 60 / unit, 1);

    // While the scene plays nothing answers, the key held or not.
    await page.keyboard.down('f');
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setPlaying(true));
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'none');
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setPlaying(false));
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'objects');
    await page.keyboard.up('f');

    // In a field the key types its letter, and is not held.
    await page.getByTestId('creator-search-open').click();
    const field = page.getByTestId('formula-search').getByRole('searchbox');
    await field.press('f');
    await expect(field).toHaveValue('f');
    await expect(frame(page)).not.toHaveAttribute('data-objects-key', 'true');
  });

  test('a mode started in the world view reads the objects its own way', async ({ page }) => {
    const clip = clipJson('a', 'fa', 't1', 0, 8);
    clip.initial.position = [-3, 1];
    await openTimeline(page, [clip], { camera: cameraProject() });
    await setTime(page, 2);
    await expect(frame(page)).not.toHaveAttribute('data-drawable-count', '0');
    const rects = await cameraRects(page);
    const symbol = await firstSymbol(page);
    const onClip = await at(page, rects.origin, symbol.fx, symbol.fy);
    // Align by symbol: its halo takes the symbol nearest to the pointer, and the camera's
    // rectangles wait.
    await page.getByTestId('preview-align-symbol').click();
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'objects');
    await expect(page.getByTestId('preview-world-hint')).toHaveCount(0);
    await page.mouse.move(onClip.x, onClip.y);
    await expect(frame(page)).toHaveAttribute('data-hover', 'a:0');
    const edge = await at(page, rects.camera, 0, 0.3);
    await page.mouse.move(edge.x, edge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', '');
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'camera');
    await expect(frame(page)).toHaveAttribute('data-hover', '');
  });

  test('while the scene plays the camera’s rectangles do not answer either', async ({ page }) => {
    const clip = clipJson('a', 'fa', 't1', 0, 30);
    await openTimeline(page, [clip], { camera: cameraProject() });
    const rects = await cameraRects(page);
    const edge = await at(page, rects.camera, 0, 0.3);
    await page.mouse.move(edge.x, edge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:body');
    // The edge under a pointer that does not move lets go as the scene starts.
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setPlaying(true));
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'none');
    await expect(frame(page)).toHaveAttribute('data-camera-hover', '');
    await expect(page.getByTestId('preview-world-hint')).toHaveCount(0);
    await dragHolding(page, edge, { x: edge.x + 60, y: edge.y + 30 }, 'ControlOrMeta');
    expect((await cameraOf(page))!.initial.center).toEqual([0, 0]);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    // A right-click on it opens the scene's menu, not the camera's.
    await page.mouse.click(edge.x, edge.y, { button: 'right' });
    await expect(page.getByTestId('preview-space-menu')).toBeVisible();
    await expect(page.getByTestId('camera-menu')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Stopped, it is taken again.
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setPlaying(false));
    await expect(frame(page)).toHaveAttribute('data-pointer-reach', 'camera');
    await page.mouse.click(edge.x, edge.y);
    expect((await uiState(page)).selection).toEqual({ kind: 'camera' });
  });

  test('Shift keeps the drag to one axis; a corner of the selected camera scales it', async ({
    page,
  }) => {
    await openTimeline(page, [], {
      camera: cameraProject({ initial: { center: [0, 0], height: 4 } }),
    });
    let rects = await cameraRects(page);
    const unit = rects.camera[3] / 4;
    const edge = await at(page, rects.camera, 0.5, 1);
    await dragHolding(page, edge, { x: edge.x + 70, y: edge.y + 20 }, 'Shift', false);
    await expect(frame(page)).toHaveAttribute('data-camera-axis', 'x');
    await expect(page.getByTestId('preview-camera-hint')).toContainText('Moving horizontally only');
    await page.mouse.up();
    let camera = (await cameraOf(page))!;
    expect(camera.initial.center[1]).toBe(0);
    expect(camera.initial.center[0]).toBeGreaterThan(40 / unit);
    // Selected, its south-east corner pulled outwards makes it larger about its centre.
    rects = await cameraRects(page);
    const centre = camera.initial.center;
    const corner = await at(page, rects.camera, 1, 1);
    await page.mouse.move(corner.x, corner.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:se');
    await dragHolding(
      page,
      corner,
      { x: corner.x + rects.camera[2] / 4, y: corner.y + rects.camera[3] / 4 },
      'ControlOrMeta',
    );
    camera = (await cameraOf(page))!;
    // Half as far again from the centre: half as tall again.
    expect(camera.initial.height).toBeCloseTo(6, 1);
    expect(camera.initial.center[0]).toBeCloseTo(centre[0], 6);
    expect(camera.initial.center[1]).toBeCloseTo(centre[1], 6);
  });

  test('a target camera and a move’s own frame are dragged by theirs; the arrows nudge', async ({
    page,
  }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    const rects = await cameraRects(page);
    const unit = rects.origin[3] / 8;
    // «Camera 1», by its right edge.
    const target = await at(page, rects.targets.k1!, 1, 0.6);
    await dragHolding(page, target, { x: target.x - 40, y: target.y }, 'ControlOrMeta');
    expect((await uiState(page)).selection).toEqual({ kind: 'targetCamera', id: 'k1' });
    const camera = (await cameraOf(page))!;
    expect(camera.targets[0]!.center[0]).toBeCloseTo(3 - 40 / unit, 2);
    expect(camera.targets[0]!.center[1]).toBe(1);
    // The arrows move what is selected: 0.01 a press, 0.1 with Shift; a run is one step.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowRight');
    const nudged = (await cameraOf(page))!.targets[0]!.center;
    expect(nudged[1]).toBeCloseTo(1.02, 6);
    expect(nudged[0]).toBeCloseTo(camera.targets[0]!.center[0] + 0.1, 6);
    await undo(page);
    expect((await cameraOf(page))!.targets[0]!.center[1]).toBe(1);
    // The own frame of the second move, by its top edge: the move is selected.
    const own = await at(page, (await cameraRects(page)).moves.n2!, 0.4, 0);
    await dragHolding(page, own, { x: own.x, y: own.y + 24 }, 'ControlOrMeta');
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n2' });
    expect(await moveOf(page, 'n2')).toMatchObject({
      to: { kind: 'frame', frame: { center: [-2, expect.closeTo(-24 / unit, 2)], height: 4 } },
    });
  });

  test('a selected target camera the camera rests on has the camera’s corners', async ({
    page,
  }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    await setTime(page, 2.5);
    await page.evaluate(() =>
      (window as MfeWindow)
        .__mfe!.useUiStore.getState()
        .select({ kind: 'targetCamera', id: 'k1' } as never),
    );
    const rects = await cameraRects(page);
    expect(rects.owner).toEqual({ kind: 'target', id: 'k1' });
    // They are one rectangle: its corner scales the target camera.
    const corner = await at(page, rects.camera, 1, 1);
    await page.mouse.move(corner.x, corner.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:se');
    await expect(page.getByTestId('preview-camera-hint')).toContainText('a corner scales it');
    await dragHolding(
      page,
      corner,
      { x: corner.x + rects.camera[2] / 4, y: corner.y + rects.camera[3] / 4 },
      'ControlOrMeta',
    );
    expect((await cameraOf(page))!.targets[0]!.height).toBeCloseTo(6, 1);
  });

  test('while a move runs the camera is not dragged; a locked camera is only selected', async ({
    page,
  }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    await setTime(page, 1.5);
    let rects = await cameraRects(page);
    expect(rects.owner).toBeNull();
    const moving = await at(page, rects.camera, 0, 0.5);
    await dragHolding(page, moving, { x: moving.x + 50, y: moving.y }, 'ControlOrMeta');
    await expect(page.getByTestId('notice').last()).toContainText('The camera is on its way');
    await expect(page.getByTestId('preview-camera-hint')).toContainText(
      'go to the end of the move',
    );
    expect(await canUndo(page)).toBe(false);
    // Locked: a press selects, a drag moves nothing.
    await setTime(page, 0);
    await page.getByTestId('camera-lock').click();
    rects = await cameraRects(page);
    const edge = await at(page, rects.targets.k1!, 0, 0.5);
    await dragHolding(page, edge, { x: edge.x + 50, y: edge.y }, 'ControlOrMeta');
    expect((await uiState(page)).selection).toEqual({ kind: 'targetCamera', id: 'k1' });
    expect((await cameraOf(page))!.targets[0]!.center).toEqual([3, 1]);
    await expect(page.getByTestId('preview-camera-hint')).toContainText('The camera is locked');
  });

  test('Fit shows everything of the camera, at any instant', async ({ page }) => {
    // A target camera far to the right of Manim's frame, and a move's own frame far below it.
    await openTimeline(page, [], {
      camera: cameraProject({
        targets: [{ id: 'k1', name: 'Far', center: [12, 0], height: 4 }],
        moves: [
          {
            id: 'n1',
            start: 1,
            duration: 1,
            to: { kind: 'frame', frame: { center: [0, -9], height: 2 } },
          },
        ],
      }),
    });
    const fit = page.getByTestId('preview-fit');
    await expect(fit).toBeDisabled();
    await expect(fit).toHaveAttribute('title', /Show everything of the camera/);
    const whole = async () => {
      const canvas = await box(frame(page));
      const rects = await cameraRects(page);
      // Every rectangle inside the canvas, with room for its name above it.
      for (const r of [rects.origin, rects.start, rects.targets.k1!, rects.moves.n1!]) {
        expect(r[0]).toBeGreaterThanOrEqual(20);
        expect(r[1]).toBeGreaterThanOrEqual(20);
        expect(r[0] + r[2]).toBeLessThanOrEqual(canvas.width - 20);
        expect(r[1] + r[3]).toBeLessThanOrEqual(canvas.height - 20);
      }
    };
    await whole();
    const fitted = (await frame(page).getAttribute('data-zoom'))!;
    expect(Number(fitted)).toBeLessThan(0.8);
    // The same at any instant: the camera on its way is inside what is shown.
    await setTime(page, 1.5);
    await expect(fit).toBeDisabled();
    // Zoomed in, Fit brings it all back.
    await page.getByTestId('preview-zoom-in').click();
    await expect(fit).toBeEnabled();
    await fit.click();
    await expect(frame(page)).toHaveAttribute('data-zoom', fitted);
    await expect(fit).toBeDisabled();
    await whole();
  });

  test('a multicamera turned on shows its camera whole; off, the frame fits again', async ({
    page,
  }) => {
    await openTimeline(page, []);
    await page.getByTestId('preview-zoom-in').click();
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.250');
    await page.getByTestId('preview-multicamera').click();
    await expect(frame(page)).toHaveAttribute('data-world', 'true');
    await expect(page.getByTestId('preview-fit')).toBeDisabled();
    const canvas = await box(frame(page));
    const rects = await cameraRects(page);
    // Manim's frame, which the camera is in, with room around it.
    expect(rects.camera).toEqual(rects.origin);
    expect(rects.camera[1]).toBeGreaterThanOrEqual(20);
    expect(rects.camera[1] + rects.camera[3]).toBeLessThanOrEqual(canvas.height - 20);
    expect(rects.camera[0]).toBeGreaterThanOrEqual(20);
    // Off: the picture fits its canvas, whatever the view of the world was.
    await page.getByTestId('preview-zoom-out').click();
    await page.getByTestId('preview-multicamera').click();
    await expect(frame(page)).not.toHaveAttribute('data-world', 'true');
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.000');
    await expect(frame(page)).toHaveAttribute('data-center', '0.000,0.000');
    // Undo brings the camera back, and its world fitted.
    await undo(page);
    await expect(frame(page)).toHaveAttribute('data-world', 'true');
    await expect(page.getByTestId('preview-fit')).toBeDisabled();
  });

  test('Preferences hide the camera’s route and the veil over what it leaves out', async ({
    page,
  }) => {
    await openTimeline(page, [], {
      camera: cameraProject({
        initial: { center: [0, 0], height: 4 },
        targets: [{ id: 'k1', name: 'Camera 1', center: [5, 0], height: 4 }],
        moves: [{ id: 'n1', start: 1, duration: 1, to: { kind: 'target', target: 'k1' } }],
      }),
    });
    const rects = await cameraRects(page);
    /** The colour of the canvas at a point, CSS px from its corner. */
    const pixel = (x: number, y: number) =>
      page.evaluate(
        ([px, py]) => {
          const el = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
          const k = el.width / el.getBoundingClientRect().width;
          const at = el
            .getContext('2d')!
            .getImageData(Math.round(px * k), Math.round(py * k), 1, 1);
          return [...at.data].slice(0, 3);
        },
        [x, y] as const,
      );
    const centre = (r: number[]) => [r[0]! + r[2]! / 2, r[1]! + r[3]! / 2] as const;
    // Inside the camera, clear of everything; in Manim's frame but out of the camera; and half
    // way along the route, where its arrowhead is (inside the camera too).
    const inside = [rects.camera[0] + 30, rects.camera[1] + 30] as const;
    const out = [rects.origin[0] + 12, rects.origin[1] + 12] as const;
    const from = centre(rects.camera);
    const to = centre(rects.targets.k1!);
    const mid = [(from[0] + to[0]) / 2, from[1]] as const;
    const background = await pixel(...inside);
    expect(await pixel(...out)).not.toEqual(background);
    expect(await pixel(...mid)).not.toEqual(background);
    const prefer = async (id: string, checked: boolean) => {
      await page.getByTestId('menu-preferences').click();
      const entry = page.getByTestId(`menu-item-preferences-${id}`);
      await expect(entry).toHaveAttribute('aria-checked', String(!checked));
      await entry.click();
    };
    await prefer('camera-veil', false);
    await expect.poll(() => pixel(...out)).toEqual(background);
    expect(await pixel(...mid)).not.toEqual(background);
    await prefer('camera-route', false);
    await expect.poll(() => pixel(...mid)).toEqual(background);
    // And back.
    await prefer('camera-veil', true);
    await expect.poll(() => pixel(...out)).not.toEqual(background);
  });

  test('a right-click on the empty scene adds a target camera there, and a camera move', async ({
    page,
  }) => {
    await openTimeline(page, [], {
      camera: cameraProject({ initial: { center: [0, 0], height: 4 } }),
    });
    const rects = await cameraRects(page);
    const unit = rects.camera[3] / 4;
    // 60 px to the right of the camera, level with its centre.
    const edge = await at(page, rects.camera, 1, 0.5);
    await page.mouse.click(edge.x + 60, edge.y, { button: 'right' });
    await expect(page.getByTestId('preview-space-menu')).toBeVisible();
    await page.getByTestId('preview-space-camera-add-target').click();
    await expect(page.getByTestId('preview-space-menu')).toHaveCount(0);
    let camera = (await cameraOf(page))!;
    expect(camera.targets).toHaveLength(1);
    const target = camera.targets[0]!;
    // Centred where the click was, as large as the camera is.
    expect(target.name).toBe('Camera 1');
    expect(target.height).toBe(4);
    expect(target.center[0]).toBeCloseTo((4 * (16 / 9)) / 2 + 60 / unit, 1);
    expect(target.center[1]).toBeCloseTo(0, 1);
    expect((await uiState(page)).selection).toEqual({ kind: 'targetCamera', id: target.id });
    expect((await cameraRects(page)).targets[target.id]).toBeDefined();
    // One step.
    await undo(page);
    expect((await cameraOf(page))!.targets).toEqual([]);
    // «Add camera move», at the playhead.
    await setTime(page, 2);
    await page.mouse.click(edge.x + 60, edge.y, { button: 'right' });
    await page.getByTestId('preview-space-camera-add-move').click();
    camera = (await cameraOf(page))!;
    expect(camera.moves).toHaveLength(1);
    expect(camera.moves[0]).toMatchObject({ start: 2, duration: 1, to: { kind: 'frame' } });
    expect((await uiState(page)).selection).toEqual({
      kind: 'cameraMove',
      id: camera.moves[0]!.id,
    });
  });

  test('a target camera’s menu moves the camera to it, renames it and deletes it', async ({
    page,
  }) => {
    await openTimeline(page, [], { camera: THREE_MOVES });
    let rects = await cameraRects(page);
    const edge = await at(page, rects.targets.k1!, 1, 0.6);
    await page.mouse.click(edge.x, edge.y, { button: 'right' });
    await expect(page.getByTestId('camera-menu-header')).toHaveText('Camera 1');
    expect((await uiState(page)).selection).toEqual({ kind: 'targetCamera', id: 'k1' });
    // It is a target camera already: none is added on it.
    await expect(page.getByTestId('camera-menu-add-target')).toHaveCount(0);
    await page.getByTestId('camera-menu-move-here').click();
    let camera = (await cameraOf(page))!;
    expect(camera.moves).toHaveLength(4);
    expect(camera.moves[3]).toMatchObject({
      start: 0,
      duration: 1,
      to: { kind: 'target', target: 'k1' },
    });
    // Where the camera rests on it the two are one rectangle, whose menu names the target camera.
    await setTime(page, 2.5);
    rects = await cameraRects(page);
    expect(rects.owner).toEqual({ kind: 'target', id: 'k1' });
    const resting = await at(page, rects.camera, 0, 0.6);
    await page.mouse.click(resting.x, resting.y, { button: 'right' });
    await expect(page.getByTestId('camera-menu-header')).toHaveText('Camera · Camera 1');
    await expect(page.getByTestId('camera-menu-move-here')).toHaveCount(0);
    await expect(page.getByTestId('camera-menu-add-target')).toHaveCount(0);
    await expect(page.getByTestId('camera-menu-add-move')).toBeVisible();
    await expect(page.getByTestId('camera-menu-delete')).toHaveText('Delete Camera 1');
    await expect(page.getByTestId('camera-menu-rename')).toHaveText('Rename Camera 1…');
    await page.getByTestId('camera-menu-rename').click();
    const field = page.getByTestId('dialog-field');
    await expect(field).toHaveValue('Camera 1');
    await field.fill('   ');
    await expect(page.getByTestId('dialog-field-error')).toHaveText(
      'A target camera needs a name.',
    );
    await field.fill('Wide');
    await field.press('Enter');
    await expect.poll(async () => (await cameraOf(page))!.targets[0]!.name).toBe('Wide');
    // Its own menu deletes it, asking first: two moves go to it.
    await setTime(page, 4.5);
    rects = await cameraRects(page);
    const again = await at(page, rects.targets.k1!, 1, 0.6);
    await page.mouse.click(again.x, again.y, { button: 'right' });
    await expect(page.getByTestId('camera-menu-header')).toHaveText('Wide');
    await page.getByTestId('camera-menu-delete').click();
    await expect(page.getByRole('dialog')).toContainText('Delete Wide?');
    await expect(page.getByRole('dialog')).toContainText('2 camera moves go to it.');
    await page.getByTestId('dialog-cancel').click();
    expect((await cameraOf(page))!.targets).toHaveLength(1);
    // Selected, the Delete key does the same.
    await page.mouse.click(again.x, again.y);
    expect((await uiState(page)).selection).toEqual({ kind: 'targetCamera', id: 'k1' });
    await page.keyboard.press('Delete');
    await page.getByTestId('dialog-confirm').click();
    await expect.poll(async () => (await cameraOf(page))!.targets).toEqual([]);
    camera = (await cameraOf(page))!;
    expect(camera.moves.map((m) => m.to.kind)).toEqual(['frame', 'frame', 'start', 'frame']);
  });

  test('the camera’s menu adds a target camera in its frame; a locked camera’s is greyed out', async ({
    page,
  }) => {
    await openTimeline(page, [], {
      camera: cameraProject({ initial: { center: [1, 0.5], height: 4 } }),
    });
    const rects = await cameraRects(page);
    const edge = await at(page, rects.camera, 0, 0.3);
    await page.mouse.click(edge.x, edge.y, { button: 'right' });
    await expect(page.getByTestId('camera-menu-header')).toHaveText('Camera');
    expect((await uiState(page)).selection).toEqual({ kind: 'camera' });
    await page.getByTestId('camera-menu-add-target').click();
    const camera = (await cameraOf(page))!;
    expect(camera.targets).toEqual([
      { id: expect.any(String), name: 'Camera 1', center: [1, 0.5], height: 4 },
    ]);
    expect((await uiState(page)).selection).toEqual({
      kind: 'targetCamera',
      id: camera.targets[0]!.id,
    });
    // Locked: the entries say why they do nothing.
    await page.getByTestId('camera-lock').click();
    await page.mouse.click(edge.x, edge.y, { button: 'right' });
    for (const id of ['camera-menu-add-target', 'camera-menu-add-move']) {
      await expect(page.getByTestId(id)).toBeDisabled();
      await expect(page.getByTestId(id)).toHaveAttribute('title', 'The Camera row is locked.');
    }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('camera-menu')).toHaveCount(0);
    await page.mouse.click(edge.x - 40, edge.y, { button: 'right' });
    await expect(page.getByTestId('preview-space-camera-add-target')).toBeDisabled();
    await expect(page.getByTestId('preview-space-camera-add-move')).toBeDisabled();
  });
});

/* The camera view: the Preview through the scene's camera, as the video is. */

/** The camera goes to the same two places again and again, each move to a frame of its own:
 * n1 and n3 to a frame about (4, 0), n2 and n4 back about the origin, where the frame of 0 s is.
 * Rectangles one over another, of which only the one on top can be taken. */
const STACKED = cameraProject({
  initial: { center: [0, 0], height: 4 },
  moves: [0, 1, 2, 3].map((i) => ({
    id: `n${i + 1}`,
    start: 1 + 2 * i,
    duration: 1,
    to: { kind: 'frame', frame: { center: [i % 2 === 0 ? 4 : 0, 0], height: 4 } },
  })),
});

/** The centre of the frame a move goes to on its own. */
async function centreOf(page: Page, id: string): Promise<[number, number]> {
  const { to } = await moveOf(page, id);
  if (to.kind !== 'frame') throw new Error(`move ${id} has no frame of its own`);
  return to.frame.center;
}

async function isolate(page: Page, id: string): Promise<void> {
  await move(page, id).click({ button: 'right' });
  await page.getByTestId('camera-move-menu-isolate').click();
  await expect(frame(page)).toHaveAttribute('data-camera-isolated', id);
}

test.describe('a camera move isolated in the Preview', () => {
  test('its frame alone answers the pointer, though another lies over it', async ({ page }) => {
    await openTimeline(page, [], { camera: STACKED });
    // After the third move the camera rests in n3's frame, which lies over n1's.
    await setTime(page, 6.5);
    const rects = await cameraRects(page);
    expect(rects.owner).toEqual({ kind: 'move', id: 'n3' });
    const unit = rects.origin[3] / 8;
    const edge = await at(page, rects.camera, 0, 0.4);
    // None isolated: the press takes the one on top, the camera's.
    await dragHolding(page, edge, { x: edge.x + 40, y: edge.y }, 'ControlOrMeta');
    expect((await centreOf(page, 'n3'))[0]).toBeCloseTo(4 + 40 / unit, 2);
    expect(await centreOf(page, 'n1')).toEqual([4, 0]);
    await undo(page);

    // The first move, isolated from its menu on the timeline: selected, its block marked.
    await isolate(page, 'n1');
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    await expect(move(page, 'n1')).toHaveAttribute('data-isolated', 'true');
    await expect(move(page, 'n3')).not.toHaveAttribute('data-isolated', 'true');
    await expect(move(page, 'n1')).toHaveAccessibleName(/isolated in the Preview$/);
    await expect(page.getByTestId('preview-camera-hint')).toContainText(
      'Isolated: the other rectangles of the camera do not answer · Drag it by its edge or its name',
    );
    // The same press now takes n1's frame, and nothing of the camera's.
    await page.mouse.move(edge.x, edge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'move:body');
    await dragHolding(page, edge, { x: edge.x + 40, y: edge.y + 20 }, 'ControlOrMeta');
    const moved = await centreOf(page, 'n1');
    expect(moved[0]).toBeCloseTo(4 + 40 / unit, 2);
    expect(moved[1]).toBeCloseTo(-20 / unit, 2);
    expect(await centreOf(page, 'n3')).toEqual([4, 0]);
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    // The arrows are its, and a corner scales it.
    await page.keyboard.press('Shift+ArrowUp');
    expect((await centreOf(page, 'n1'))[1]).toBeCloseTo(moved[1] + 0.1, 6);
    const corner = await at(page, (await cameraRects(page)).moves.n1!, 0, 1);
    await page.mouse.move(corner.x, corner.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'move:sw');

    // The camera — its edge, its centre — and the other frames do not answer: a press on them
    // moves nothing.
    const others = await cameraRects(page);
    const cameraEdge = await at(page, others.camera, 0, 0.6);
    await page.mouse.move(cameraEdge.x, cameraEdge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', '');
    const before = await cameraOf(page);
    await dragHolding(page, cameraEdge, { x: cameraEdge.x - 30, y: cameraEdge.y }, null);
    const startEdge = await at(page, others.start, 0, 0.5);
    await dragHolding(page, startEdge, { x: startEdge.x - 30, y: startEdge.y }, null);
    expect(await cameraOf(page)).toEqual(before);
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', 'n1');

    // «Stop isolating», in the corner of the Preview: they all answer again.
    await page.getByTestId('preview-isolation-done').click();
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', '');
    await expect(page.getByTestId('preview-isolation-done')).toHaveCount(0);
    await expect(move(page, 'n1')).not.toHaveAttribute('data-isolated', 'true');
    await page.mouse.move(cameraEdge.x, cameraEdge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:body');
  });

  test('the frame the camera rests in is isolated as the camera’s own rectangle', async ({
    page,
  }) => {
    await openTimeline(page, [], { camera: STACKED });
    // After the first move the camera rests in n1's frame; n3's lies under it.
    await setTime(page, 2.5);
    await isolate(page, 'n3');
    const rects = await cameraRects(page);
    const unit = rects.origin[3] / 8;
    const edge = await at(page, rects.camera, 0, 0.4);
    await page.mouse.move(edge.x, edge.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'move:body');
    await dragHolding(page, edge, { x: edge.x + 30, y: edge.y }, 'ControlOrMeta');
    expect((await centreOf(page, 'n3'))[0]).toBeCloseTo(4 + 30 / unit, 2);
    expect(await centreOf(page, 'n1')).toEqual([4, 0]);
    // n1, where the camera rests: its rectangle is the camera's, by its centre too.
    await isolate(page, 'n1');
    const centre = await at(page, (await cameraRects(page)).camera, 0.5, 0.5);
    await page.mouse.move(centre.x, centre.y);
    await expect(frame(page)).toHaveAttribute('data-camera-hover', 'camera:body');
    await dragHolding(page, centre, { x: centre.x, y: centre.y + 30 }, 'ControlOrMeta');
    expect((await centreOf(page, 'n1'))[1]).toBeCloseTo(-30 / unit, 2);
    expect((await uiState(page)).selection).toEqual({ kind: 'cameraMove', id: 'n1' });
  });

  test('ends from the menus and with Escape, before the region goes, and with its move', async ({
    page,
  }) => {
    await openTimeline(page, [], { camera: STACKED });
    // From the camera view, it comes up in the world, where its rectangle is.
    await page.keyboard.press('v');
    await expect(frame(page)).toHaveAttribute('data-camera-view', 'true');
    await isolate(page, 'n2');
    await expect(frame(page)).toHaveAttribute('data-world', 'true');
    // Its own menu on the timeline ends it; another move's isolates that one instead.
    await move(page, 'n2').click({ button: 'right' });
    await expect(page.getByTestId('camera-move-menu-isolate')).toHaveCount(0);
    await page.getByTestId('camera-move-menu-stop-isolating').click();
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', '');
    await isolate(page, 'n2');
    await isolate(page, 'n1');
    await expect(move(page, 'n2')).not.toHaveAttribute('data-isolated', 'true');

    // Escape: the isolation first, the timeline's region at the next press.
    await setTime(page, 0.2);
    await page.keyboard.press('i');
    await setTime(page, 0.6);
    await page.keyboard.press('o');
    await expect(page.getByTestId('timeline-region')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', '');
    await expect(page.getByTestId('timeline-region')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('timeline-region')).toHaveCount(0);

    // A right-click on the isolated rectangle, and on the empty scene.
    await isolate(page, 'n1');
    const rects = await cameraRects(page);
    const edge = await at(page, rects.moves.n1!, 1, 0.5);
    await page.mouse.click(edge.x, edge.y, { button: 'right' });
    await expect(page.getByTestId('camera-menu-header')).toHaveText('Camera move 1');
    await page.getByTestId('camera-menu-stop-isolating').click();
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', '');
    await isolate(page, 'n1');
    const beside = await at(page, rects.moves.n1!, 0.5, 1);
    await page.mouse.click(beside.x, beside.y + 40, { button: 'right' });
    await page.getByTestId('preview-space-stop-isolating').click();
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', '');
    // With none isolated the menus have no such entry.
    await page.mouse.click(beside.x, beside.y + 40, { button: 'right' });
    await expect(page.getByTestId('preview-space-menu')).toBeVisible();
    await expect(page.getByTestId('preview-space-stop-isolating')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Deleted, its move takes the isolation with it; undone back, it is not isolated again.
    await isolate(page, 'n1');
    await page.keyboard.press('Delete');
    expect((await cameraOf(page))!.moves.map((m) => m.id)).toEqual(['n2', 'n3', 'n4']);
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', '');
    await expect(page.getByTestId('preview-isolation-done')).toHaveCount(0);
    await undo(page);
    await expect(move(page, 'n1')).toBeVisible();
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', '');
    // Another project opened starts with none isolated, though it has a move of the same id — a
    // copy of this one has them all.
    await isolate(page, 'n2');
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      mfe.loadProject(mfe.useProjectStore.getState().project);
    });
    await expect(frame(page)).toHaveAttribute('data-camera-isolated', '');
    await expect(move(page, 'n2')).not.toHaveAttribute('data-isolated', 'true');
  });
});

test.describe('the camera view', () => {
  test('V, its button and View ▸ Camera view show the picture; each view keeps its own zoom', async ({
    page,
  }) => {
    await openTimeline(page, [], {
      camera: cameraProject({ initial: { center: [2, 1], height: 4 } }),
    });
    const button = page.getByTestId('preview-camera-view');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(frame(page)).toHaveAttribute('data-world', 'true');
    const worldZoom = (await frame(page).getAttribute('data-zoom'))!;
    const worldCentre = (await frame(page).getAttribute('data-center'))!;
    await page.keyboard.press('v');
    await expect(frame(page)).toHaveAttribute('data-camera-view', 'true');
    await expect(frame(page)).not.toHaveAttribute('data-world', 'true');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // The multicamera is still on: it is its view that changed, not the project.
    await expect(page.getByTestId('preview-multicamera')).toHaveAttribute('aria-pressed', 'true');
    expect(await canUndo(page)).toBe(false);
    // The canvas is the picture, looking at the camera's centre; no rectangle is drawn.
    await expect
      .poll(async () => {
        const now = await box(frame(page));
        return now.width / now.height;
      })
      .toBeCloseTo(16 / 9, 1);
    await expect(frame(page)).toHaveAttribute('data-center', '2.000,1.000');
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.000');
    await expect(frame(page)).toHaveAttribute('data-camera-scene', '');
    // Its zoom is its own: the world's stays as it was.
    await page.getByTestId('preview-zoom-in').click();
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.250');
    await button.click();
    await expect(frame(page)).toHaveAttribute('data-world', 'true');
    await expect(frame(page)).toHaveAttribute('data-zoom', worldZoom);
    await expect(frame(page)).toHaveAttribute('data-center', worldCentre);
    await page.getByTestId('menu-view').click();
    const item = page.getByTestId('menu-item-view-camera-view');
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await expect(item.locator('.menu-shortcut')).toHaveText('V');
    await item.click();
    await expect(frame(page)).toHaveAttribute('data-camera-view', 'true');
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.250');
    await page.getByTestId('preview-fit').click();
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.000');
    await expect(frame(page)).toHaveAttribute('data-center', '2.000,1.000');
  });

  test('follows the camera along its moves, and a clip is dragged where the picture shows it', async ({
    page,
  }) => {
    const clip = clipJson('a', 'fa', 't1', 0, 8);
    clip.initial.position = [3, 1];
    await openTimeline(page, [clip], { camera: THREE_MOVES });
    await page.keyboard.press('v');
    await expect(frame(page)).toHaveAttribute('data-center', '0.000,0.000');
    // Half way of the move to «Camera 1», which is 4 tall about (3, 1).
    await setTime(page, 1.5);
    await expect(frame(page)).toHaveAttribute('data-center', '1.500,0.500');
    await setTime(page, 2.5);
    await expect(frame(page)).toHaveAttribute('data-center', '3.000,1.000');
    await expect(frame(page)).not.toHaveAttribute('data-drawable-count', '0');
    // The clip is in the middle of the picture there: 80 px are 80 of the 4 units the canvas is
    // tall.
    const canvas = await box(page.getByTestId('preview-canvas'));
    const centre = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
    await dragHolding(page, centre, { x: centre.x + 80, y: centre.y }, 'ControlOrMeta');
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
    const moved = await clipOf(page, 'a');
    expect(moved.initial.position[0]).toBeCloseTo(3 + (80 * 4) / canvas.height, 1);
    expect(moved.initial.position[1]).toBeCloseTo(1, 6);
    // The menu of the empty scene still adds to the camera.
    await page.mouse.click(canvas.x + 30, canvas.y + 30, { button: 'right' });
    await expect(page.getByTestId('preview-space-camera-add-target')).toBeVisible();
    await page.getByTestId('preview-space-camera-add-move').click();
    expect((await cameraOf(page))!.moves).toHaveLength(4);
  });

  test('is nobody’s without a camera, and a multicamera turned on comes up in the world', async ({
    page,
  }) => {
    await openTimeline(page, []);
    await page.keyboard.press('v');
    await expect(frame(page)).not.toHaveAttribute('data-camera-view', 'true');
    await expect(page.getByTestId('preview-camera-view')).toHaveCount(0);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menu-item-view-camera-view')).toBeDisabled();
    await page.keyboard.press('Escape');
    // (The menu bar keeps the letters typed on it: the scene takes the focus.)
    await frame(page).click({ position: { x: 10, y: 10 } });
    // On, in the camera view, off and on again: the world.
    await page.keyboard.press('Alt+m');
    await page.keyboard.press('v');
    await expect(frame(page)).toHaveAttribute('data-camera-view', 'true');
    await page.keyboard.press('Alt+m');
    await expect(frame(page)).not.toHaveAttribute('data-camera-view', 'true');
    await page.keyboard.press('Alt+m');
    await expect(frame(page)).toHaveAttribute('data-world', 'true');
  });
});

/* The frame of a scene with a camera is the camera's at the playhead: «Align to frame» and the
 * guides of a drag refer to it, and the grid is the world's. */

test.describe('the frame of a scene with a camera', () => {
  /** The left edge and the centre of a clip's box in the scene, from its position and the box of
   * its formula's render. */
  const edgesOf = (page: Page, clipId: string) =>
    page.evaluate((id) => {
      const mfe = (window as MfeWindow).__mfe!;
      const clip = (
        mfe.useProjectStore.getState().project.clips as unknown as {
          id: string;
          formulaId: string;
          initial: { position: [number, number]; scale: number };
        }[]
      ).find((c) => c.id === id)!;
      const resolved = mfe.useRenderStore.getState().resolved as ReadonlyMap<
        string,
        { render: { bbox: { minX: number; maxX: number } } }
      >;
      const { bbox } = resolved.get(clip.formulaId)!.render;
      const [x] = clip.initial.position;
      return { left: x + bbox.minX * clip.initial.scale, x, y: clip.initial.position[1] };
    }, clipId);

  test('Align to frame puts a clip on the edge of the camera at the playhead', async ({ page }) => {
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 8)], {
      camera: cameraProject({
        initial: { center: [2, 1], height: 4 },
        moves: [
          {
            id: 'n1',
            start: 3,
            duration: 1,
            to: { kind: 'frame', frame: { center: [5, 1], height: 4 } },
          },
        ],
      }),
    });
    // (Once the clip is written.)
    await setTime(page, 2);
    await expect(frame(page)).not.toHaveAttribute('data-drawable-count', '0');
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: ['a'] }),
    );
    // The camera is 4 tall about (2, 1): its left edge is 32/9 to the left of 2.
    await page.keyboard.press('Alt+Shift+KeyA');
    expect((await edgesOf(page, 'a')).left).toBeCloseTo(2 - 32 / 9, 4);
    // After the move it is about (5, 1).
    await setTime(page, 5);
    await page.keyboard.press('Alt+Shift+KeyA');
    expect((await edgesOf(page, 'a')).left).toBeCloseTo(5 - 32 / 9, 4);
  });

  test('a dragged clip sticks to the centre of the camera, in the camera view', async ({
    page,
  }) => {
    const clip = clipJson('a', 'fa', 't1', 0, 8);
    clip.initial.position = [2.6, 1];
    await openTimeline(page, [clip], {
      camera: cameraProject({ initial: { center: [2, 1], height: 4 } }),
    });
    await page.keyboard.press('v');
    await expect(frame(page)).toHaveAttribute('data-camera-view', 'true');
    // (Once the clip is written.)
    await setTime(page, 2);
    await expect(frame(page)).not.toHaveAttribute('data-drawable-count', '0');
    const canvas = await box(page.getByTestId('preview-canvas'));
    const unit = canvas.height / 4;
    const centre = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
    // From the clip, 0.6 to the right of the centre, to 4 px short of it: it snaps the rest.
    const from = { x: centre.x + 0.6 * unit, y: centre.y };
    await dragHolding(page, from, { x: from.x - 0.6 * unit + 4, y: from.y }, null, false);
    expect(await frame(page).getAttribute('data-snap-guides')).toContain('x@2.0000');
    await page.mouse.up();
    const moved = await edgesOf(page, 'a');
    expect(moved.x).toBeCloseTo(2, 6);
    expect(moved.y).toBeCloseTo(1, 6);
  });

  test('the grid is the world’s: it goes on past Manim’s frame', async ({ page }) => {
    await openTimeline(page, [], {
      camera: cameraProject({
        targets: [{ id: 'k1', name: 'Far', center: [12, 0], height: 4 }],
      }),
    });
    const rects = await cameraRects(page);
    const unit = rects.origin[3] / 8;
    const origin = [rects.origin[0] + rects.origin[2] / 2, rects.origin[1] + rects.origin[3] / 2];
    /** Whether a column of the canvas near the scene's x, at the height of y, is not all of one
     * colour with the columns beside it: a vertical line of the grid is there. */
    const lineAt = (x: number, y: number) =>
      page.evaluate(
        ([px, py]) => {
          const el = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
          const k = el.width / el.getBoundingClientRect().width;
          const row = el
            .getContext('2d')!
            .getImageData(Math.round(px * k) - 6, Math.round(py * k), 12, 1).data;
          const colours = new Set<string>();
          for (let i = 0; i < row.length; i += 4)
            colours.add(`${row[i]},${row[i + 1]},${row[i + 2]}`);
          return colours.size > 1;
        },
        [origin[0]! + x * unit, origin[1]! - y * unit] as const,
      );
    // x = 9 is outside Manim's frame (7.11 to each side) and left of the far camera's (8.44).
    expect(await lineAt(8, 0.5)).toBe(false);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.usePreferences.getState().set({ grid: true, gridStep: 1 }),
    );
    await expect.poll(() => lineAt(8, 0.5)).toBe(true);
    // Between two lines there is none.
    expect(await lineAt(7.5, 0.5)).toBe(false);
  });

  // The centre of a camera is any finite number, typed in its panel as any other. So far out the
  // multiples of the grid's step cannot be told apart, and the loop that listed the grid's lines
  // never ended: the tab hung (B-12 of the final audit). The Preview goes on painting.
  test('a camera as far out as a number goes leaves the Preview answering, the grid on', async ({
    page,
  }) => {
    await openTimeline(page, [], { camera: cameraProject({}) });
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.usePreferences.getState().set({ grid: true, gridStep: 0.1 }),
    );
    await page.getByTestId('camera-name').click();
    const x = page.getByTestId('camera-frame-x');
    await x.fill('1e16');
    await x.press('Enter');
    expect((await cameraOf(page))!.initial.center).toEqual([1e16, 0]);
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('v');
    await expect(frame(page)).toHaveAttribute('data-camera-view', 'true');
    // Two frames painted, which a tab that hangs never answers; and the next key is taken.
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    await page.keyboard.press('v');
    await expect(frame(page)).not.toHaveAttribute('data-camera-view', 'true');
  });
});
