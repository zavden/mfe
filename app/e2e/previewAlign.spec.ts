import { expect, test, type Locator, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import {
  canUndo,
  CONTROL_ITSELF,
  openSubmenu,
  openWithProject,
  selectionOf,
  setTime,
  undo,
  type MfeWindow,
} from './helpers';
import { clipJson, projectJson, type ActionJson, type ClipJson } from './timelineHelpers';
import { canvasBoxOf, type Point } from './uxHelpers';

const FRAME_HALF_WIDTH = (8 * 16) / 9 / 2;

/** Three clips apart in x and y, on screen from 0 to 6 s: alpha, beta, alpha. */
function threeClips(): ClipJson[] {
  const ca = clipJson('ca', 'fa', 't1', 0, 6);
  ca.initial.position = [-4, 2];
  const cb = clipJson('cb', 'fb', 't2', 0, 6);
  cb.initial.position = [0.5, 0];
  const cc = clipJson('cc', 'fa', 't3', 0, 6);
  cc.initial.position = [4, -2];
  return [ca, cb, cc];
}

async function open(page: Page, clips = threeClips(), extra = {}): Promise<void> {
  await openWithProject(page, projectJson(clips, extra));
  await setTime(page, 2);
  await waitForDrawables(page, 14);
}

interface Edges {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/** Each clip's box on the frame: its position plus the render's box, scaled. */
async function boxes(page: Page): Promise<Record<string, Edges>> {
  return page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const resolved = mfe.useRenderStore.getState().resolved as ReadonlyMap<
      string,
      { render: { bbox: { minX: number; minY: number; maxX: number; maxY: number } } }
    >;
    const out: Record<string, Edges> = {};
    for (const clip of mfe.useProjectStore.getState().project.clips as unknown as {
      id: string;
      formulaId: string;
      initial: { position: [number, number]; scale: number };
    }[]) {
      const bbox = resolved.get(clip.formulaId)!.render.bbox;
      const [x, y] = clip.initial.position;
      const s = clip.initial.scale;
      const left = x + bbox.minX * s;
      const right = x + bbox.maxX * s;
      const bottom = y + bbox.minY * s;
      const top = y + bbox.maxY * s;
      out[clip.id] = {
        left,
        right,
        top,
        bottom,
        centerX: (left + right) / 2,
        centerY: (bottom + top) / 2,
      };
    }
    return out;
  });
}

async function selectAll(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+a');
  expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['ca', 'cb', 'cc'] });
}

async function editMenu(page: Page, submenu: 'align' | 'distribute', item: string, shift = false) {
  await page.getByTestId('menu-edit').click();
  await page.getByTestId(`menu-item-edit-${submenu}`).hover();
  await page
    .getByTestId(`menu-item-edit-${submenu}-${item}`)
    .click({ modifiers: shift ? ['Shift'] : [] });
}

/** Page coordinates of a scene point, with the whole 16:9 frame shown (Fit). */
async function scenePoint(page: Page, [x, y]: Point): Promise<{ x: number; y: number }> {
  const box = await canvasBoxOf(page);
  return {
    x: box.x + box.width / 2 + (x * box.width) / (2 * FRAME_HALF_WIDTH),
    y: box.y + box.height / 2 - (y * box.height) / 8,
  };
}

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 4);

/** The icon ends before the text starts, on the same line. */
async function iconBeforeText(icon: Locator, text: Locator): Promise<void> {
  const a = (await icon.boundingBox())!;
  const b = (await text.boundingBox())!;
  expect(a.x + a.width).toBeLessThanOrEqual(b.x);
  expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(2);
}

test.describe('Align and distribute', () => {
  test('Edit → Align → Left lines up the left edges, in one undo step', async ({ page }) => {
    await open(page);
    const before = await boxes(page);
    await selectAll(page);
    await editMenu(page, 'align', 'left');
    const after = await boxes(page);
    for (const id of ['ca', 'cb', 'cc']) near(after[id]!.left, before.ca!.left);
    expect(after.cb!.top - after.cb!.bottom).toBeCloseTo(before.cb!.top - before.cb!.bottom, 5);
    expect(await canUndo(page)).toBe(true);
    await undo(page);
    expect(await boxes(page)).toEqual(before);
    expect(await canUndo(page)).toBe(false);
  });

  test('an action bar in the preview corner aligns and distributes the selected clips', async ({
    page,
  }) => {
    await open(page);
    const bar = page.getByTestId('preview-actions');
    await expect(bar).toHaveCount(0);
    await selectAll(page);
    await expect(bar).toBeVisible();
    await expect(bar.getByTestId('preview-actions-count')).toHaveText('3 clips');
    const before = await boxes(page);
    await bar.getByTestId('preview-actions-align-left').click();
    const after = await boxes(page);
    for (const id of ['ca', 'cb', 'cc']) near(after[id]!.left, before.ca!.left);
    await undo(page);
    // Distribute vertically: the outer two stay, the gaps become equal.
    await bar.getByTestId('preview-actions-distribute-v').click();
    const spread = await boxes(page);
    near(spread.ca!.top, before.ca!.top);
    near(spread.cc!.bottom, before.cc!.bottom);
    near(spread.ca!.bottom - spread.cb!.top, spread.cb!.bottom - spread.cc!.top);
    await undo(page);
    // Two selected: Distribute is off, Align stays on; Paste waits for copied properties and
    // Match colors offers to create a list.
    await page.evaluate(() =>
      (window as MfeWindow)
        .__mfe!.useUiStore.getState()
        .select({ kind: 'clips', ids: ['ca', 'cb'] }),
    );
    await expect(bar.getByTestId('preview-actions-count')).toHaveText('2 clips');
    await expect(bar.getByTestId('preview-actions-distribute-v')).toBeDisabled();
    await expect(bar.getByTestId('preview-actions-align-left')).toBeEnabled();
    await expect(bar.getByTestId('preview-actions-paste')).toBeDisabled();
    await bar.getByTestId('preview-actions-match').click();
    await expect(page.getByTestId('preview-actions-match-create')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('preview-actions-match-menu')).toHaveCount(0);
    // One clip: no bar.
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: ['ca'] }),
    );
    await expect(bar).toHaveCount(0);
  });

  // The bar's tooltips write the keys as the menu bar does, for the system the browser runs on.
  for (const [platform, alignLeft, distributeH, distributeV] of [
    ['Win32', 'Alt+A', 'Ctrl+Alt+H', 'Ctrl+Alt+V'],
    // With the Control key itself on a Mac too: ⌥⌘H is the system's there.
    ['MacIntel', '⌥A', '⌃⌥H', '⌃⌥V'],
  ] as const) {
    test(`the action bar's tooltips name the keys as the system writes them (${platform})`, async ({
      page,
    }) => {
      await page.addInitScript((name) => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => name });
      }, platform);
      await open(page);
      // A fixture: the keys of a Mac would not select on another system's keyboard.
      await page.evaluate(() =>
        (window as MfeWindow).__mfe!.useUiStore.getState().select({
          kind: 'clips',
          ids: ['ca', 'cb', 'cc'],
        }),
      );
      const bar = page.getByTestId('preview-actions');
      await expect(bar.getByTestId('preview-actions-align-left')).toHaveAttribute(
        'title',
        `Align left (${alignLeft})`,
      );
      await expect(bar.getByTestId('preview-actions-distribute-h')).toHaveAttribute(
        'title',
        `Distribute horizontally (${distributeH}): needs three selected clips`,
      );
      await expect(bar.getByTestId('preview-actions-distribute-v')).toHaveAttribute(
        'title',
        `Distribute vertically (${distributeV}): needs three selected clips`,
      );
    });
  }

  test('Align → Middle puts the middles on one line', async ({ page }) => {
    await open(page);
    await selectAll(page);
    const before = await boxes(page);
    await editMenu(page, 'align', 'middle');
    const after = await boxes(page);
    const target =
      (Math.max(...Object.values(before).map((b) => b.top)) +
        Math.min(...Object.values(before).map((b) => b.bottom))) /
      2;
    for (const id of ['ca', 'cb', 'cc']) near(after[id]!.centerY, target);
    // x did not change.
    for (const id of ['ca', 'cb', 'cc']) near(after[id]!.left, before[id]!.left);
  });

  test('measures a glyph where a part transform has moved it', async ({ page }) => {
    // A part transform shifts the five glyphs of "alpha" 1 unit right before 1 s: at 2 s the
    // formula's box is where the glyphs are, not where the render puts them.
    const clips = threeClips();
    clips[0]!.actions.push({
      id: 'pt',
      kind: 'transform',
      start: 0.5,
      duration: 0.5,
      easing: 'linear',
      glyphs: [0, 1, 2, 3, 4],
      shift: [1, 0],
      scale: 1,
      rotation: 0,
      color: null,
      opacity: null,
    } as unknown as ActionJson);
    await open(page, clips);
    const before = await boxes(page);
    await selectAll(page);
    await editMenu(page, 'align', 'right');
    const after = await boxes(page);
    // The rightmost clip stays; alpha's shifted edge, its nominal one plus 1, meets it.
    near(after.cc!.right, before.cc!.right);
    near(after.cb!.right, before.cc!.right);
    near(after.ca!.right + 1, before.cc!.right);
  });

  test('Distribute → Horizontally leaves equal gaps between three clips', async ({ page }) => {
    const clips = threeClips();
    clips[1]!.initial.position = [-3, 0]; // far from the middle of the other two
    await open(page, clips);
    await selectAll(page);
    await editMenu(page, 'distribute', 'h');
    const after = await boxes(page);
    const sorted = Object.values(after).sort((a, b) => a.left - b.left);
    near(sorted[1]!.left - sorted[0]!.right, sorted[2]!.left - sorted[1]!.right);
    expect(await canUndo(page)).toBe(true);
  });

  test('a lone clip aligns to the frame; Shift aligns several to the frame', async ({ page }) => {
    await open(page);
    // One clip: Align → Centre puts it at the frame's centre.
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: ['cb'] }),
    );
    await editMenu(page, 'align', 'center');
    near((await boxes(page)).cb!.centerX, 0);
    await undo(page);
    // Two clips: plain Left lines them up with each other, Shift+Left with the frame.
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({
        kind: 'clips',
        ids: ['ca', 'cc'],
      }),
    );
    await editMenu(page, 'align', 'left', true);
    const after = await boxes(page);
    near(after.ca!.left, -FRAME_HALF_WIDTH);
    near(after.cc!.left, -FRAME_HALF_WIDTH);
  });

  test('a clip on a locked track stays, and the notice names it', async ({ page }) => {
    const tracks = ['t1', 't2', 't3'].map((id, i) => ({
      id,
      name: `Track ${i + 1}`,
      hidden: false,
      locked: id === 't2',
    }));
    await open(page, threeClips(), { tracks });
    await selectAll(page);
    const before = await boxes(page);
    await editMenu(page, 'align', 'left');
    const after = await boxes(page);
    expect(after.cb).toEqual(before.cb);
    near(after.cc!.left, before.ca!.left);
    const notice = page.getByTestId('notice');
    await expect(notice).toContainText('1 clip stayed');
    await expect(notice).toContainText('“beta”');
  });

  test('the items are disabled with nothing selected, and Distribute needs three', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-align').hover();
    await expect(page.getByTestId('menu-item-edit-align-left')).toBeDisabled();
    await page.getByTestId('menu-item-edit-distribute').hover();
    await expect(page.getByTestId('menu-item-edit-distribute-h')).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({
        kind: 'clips',
        ids: ['ca', 'cb'],
      }),
    );
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-align').hover();
    await expect(page.getByTestId('menu-item-edit-align-left')).toBeEnabled();
    await page.getByTestId('menu-item-edit-distribute').hover();
    await expect(page.getByTestId('menu-item-edit-distribute-h')).toBeDisabled();
  });

  test('the items show their icons before the text, in both menus', async ({ page }) => {
    await open(page);
    await selectAll(page);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-align').hover();
    const left = page.getByTestId('menu-item-edit-align-left');
    await expect(left.locator('.menu-icon svg')).toBeVisible();
    await expect(left).toHaveAccessibleName('Left');
    await iconBeforeText(left.locator('.menu-icon'), left.locator('.menu-label'));
    await page.getByTestId('menu-item-edit-distribute').hover();
    await expect(page.getByTestId('menu-item-edit-distribute-h').locator('svg')).toBeVisible();
    await page.keyboard.press('Escape');

    const { ca } = await boxes(page);
    const at = await scenePoint(page, [ca!.centerX, ca!.centerY]);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await openSubmenu(page, 'preview-menu-distribute');
    await expect(page.getByTestId('preview-menu-distribute-v').locator('svg')).toBeVisible();
    await openSubmenu(page, 'preview-menu-align');
    const item = page.getByTestId('preview-menu-align-left');
    await expect(item.locator('.ctx-icon svg')).toBeVisible();
    await expect(item).toHaveAccessibleName('Align left');
    const icon = await item.locator('.ctx-icon').boundingBox();
    const box = await item.boundingBox();
    // On the left, centred on the line.
    expect(icon!.x - box!.x).toBeLessThan(16);
    expect(icon!.y + icon!.height / 2).toBeCloseTo(box!.y + box!.height / 2, 0);
  });

  test('right-click on a clip opens the menu on it, and aligns', async ({ page }) => {
    await open(page);
    // On empty space: not the menu of a clip but the scene's (Add line), and no browser menu
    // (the event is cancelled). Its keys are its own while it is open: Escape closes it.
    const empty = await scenePoint(page, [0, 3.5]);
    await page.mouse.click(empty.x, empty.y, { button: 'right' });
    await expect(page.getByTestId('preview-space-menu')).toBeVisible();
    await expect(page.getByTestId('preview-menu')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('preview-space-menu')).toHaveCount(0);

    // On a clip outside the selection: it becomes the selection.
    const before = await boxes(page);
    await selectAll(page);
    const at = await scenePoint(page, [before.ca!.centerX, before.ca!.centerY]);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(page.getByTestId('preview-menu')).toBeVisible();
    // The clip is among the selected ones: the selection stays.
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['ca', 'cb', 'cc'] });
    await openSubmenu(page, 'preview-menu-align');
    await page.getByTestId('preview-menu-align-right').click();
    await expect(page.getByTestId('preview-menu')).toHaveCount(0);
    const after = await boxes(page);
    for (const id of ['ca', 'cb', 'cc']) near(after[id]!.right, before.cc!.right);

    // A clip outside the selection replaces it; one clip: distribute is disabled.
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'none' }),
    );
    const onB = await scenePoint(page, [after.cb!.centerX, after.cb!.centerY]);
    await page.mouse.click(onB.x, onB.y, { button: 'right' });
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['cb'] });
    await openSubmenu(page, 'preview-menu-distribute');
    await expect(page.getByTestId('preview-menu-distribute-h')).toBeDisabled();
    await openSubmenu(page, 'preview-menu-align');
    await expect(page.getByTestId('preview-menu-align-left')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('preview-menu')).toHaveCount(0);
  });

  test('Alt+A aligns left, Alt+Shift+A to the frame, Ctrl+Alt+H distributes', async ({ page }) => {
    const clips = threeClips();
    clips[1]!.initial.position = [-3, 0];
    await open(page, clips);
    await selectAll(page);
    const before = await boxes(page);

    await page.keyboard.press('Alt+KeyA');
    const left = await boxes(page);
    for (const id of ['ca', 'cb', 'cc']) near(left[id]!.left, before.ca!.left);
    expect(await canUndo(page)).toBe(true);

    await page.keyboard.press('Alt+Shift+KeyA');
    const frame = await boxes(page);
    for (const id of ['ca', 'cb', 'cc']) near(frame[id]!.left, -FRAME_HALF_WIDTH);

    // Spread the clips out again, then distribute them horizontally.
    await page.keyboard.press('Alt+KeyD');
    const right = await boxes(page);
    for (const id of ['ca', 'cb', 'cc']) near(right[id]!.right, frame.ca!.right);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        const at: Record<string, [number, number]> = { ca: [-5, 2], cb: [-3, 0], cc: [4, -2] };
        for (const clip of draft.clips as unknown as {
          id: string;
          initial: { position: [number, number] };
        }[]) {
          clip.initial.position = at[clip.id]!;
        }
      }),
    );
    // The Control key on every system, a Mac too (⌃⌥H there).
    await page.keyboard.press(`${CONTROL_ITSELF}+Alt+KeyH`);
    const sorted = Object.values(await boxes(page)).sort((a, b) => a.left - b.left);
    near(sorted[1]!.left - sorted[0]!.right, sorted[2]!.left - sorted[1]!.right);
  });

  test('on a Mac ⌥⌘H and ⌥⌘V are left to the system; ⌃⌥H and ⌃⌥V distribute', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
    });
    const clips = threeClips();
    const at: [number, number][] = [
      [-5, 2],
      [-3, 0],
      [4, -2],
    ];
    clips.forEach((clip, index) => (clip.initial.position = at[index]!));
    await open(page, clips);
    // A fixture: the keys of a Mac would not select on another system's keyboard.
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({
        kind: 'clips',
        ids: ['ca', 'cb', 'cc'],
      }),
    );
    await page.getByTestId('preview-frame').focus();
    const before = await boxes(page);
    // ⌥⌘H hides the other apps on a Mac, and ⌥⌘V pastes a style: not the app's, which moves
    // nothing and writes no undo step.
    await page.keyboard.press('Meta+Alt+KeyH');
    await page.keyboard.press('Meta+Alt+KeyV');
    expect(await boxes(page)).toEqual(before);
    expect(await canUndo(page)).toBe(false);
    // The Control key itself: the gaps between the three are equal, sideways and then down.
    await page.keyboard.press(`${CONTROL_ITSELF}+Alt+KeyH`);
    const across = Object.values(await boxes(page)).sort((a, b) => a.left - b.left);
    near(across[1]!.left - across[0]!.right, across[2]!.left - across[1]!.right);
    await page.keyboard.press(`${CONTROL_ITSELF}+Alt+KeyV`);
    // The scene's y grows upwards: from the lowest one, the gap up to the next.
    const up = Object.values(await boxes(page)).sort((a, b) => a.bottom - b.bottom);
    near(up[1]!.bottom - up[0]!.top, up[2]!.bottom - up[1]!.top);
    expect(await canUndo(page)).toBe(true);
  });
});
