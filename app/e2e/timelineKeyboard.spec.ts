import { expect, test, type Page } from './test';
import { appearJson, tweenJson } from './blockHelpers';
import { canUndo, type MfeWindow } from './helpers';
import { openRelationScene, plain } from './relationsHelpers';
import { clipOf, project, uiState, undo } from './timelineHelpers';

/* The timeline from the keyboard (useTimelineKeyboard): one Tab stop among the clips and
 * blocks, the arrows between them (and the selection with the focus), Enter and the menu key,
 * Alt + arrows to move a clip, the focus kept after a deletion, and what is announced. Track 1
 * holds a (0–10, three blocks on two lanes) and c (12–14), track 2 holds b (2–8). */
const A = plain('a', 'fa', 't1', 0, 10, {
  actions: [
    appearJson('w', 1, 1.5, 'write', [3, 4]),
    tweenJson('x', 2, 1), // overlaps w: a second lane
    tweenJson('z', 4, 1),
  ],
});
const B = plain('b', 'fb', 't2', 2, 8);
const C = plain('c', 'fa', 't1', 12, 14);

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.dataset.actionId ?? el?.dataset.clipId ?? el?.tagName ?? null;
  });
const selection = async (page: Page) => (await uiState(page)).selection;
const announcer = (page: Page) => page.getByTestId('announcer');

test('Tab reaches one clip; the arrows walk the clips, the tracks and the block lanes', async ({
  page,
}) => {
  await openRelationScene(page, [A, B, C]);
  // The clips are a grid: Tab from the last control of track 1's header lands on a, and leaves
  // from there (b and c are not Tab stops).
  await expect(page.getByTestId('timeline-grid')).toHaveAttribute('role', 'grid');
  await page.getByRole('button', { name: 'Delete Track 1' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('clip-a')).toBeFocused();
  await expect(page.getByTestId('clip-a')).toHaveAttribute(
    'aria-label',
    'f1, 0.00 to 10.00 s, Track 1, 3 blocks',
  );
  expect((await selection(page)).kind).toBe('none'); // reaching it selects nothing
  await page.keyboard.press('Tab');
  expect(await focused(page)).not.toBe('a');
  await expect(page.getByTestId('clip-b')).not.toBeFocused();

  // Along the track, then to the track below and back; the focus selects.
  await page.getByTestId('clip-a').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('clip-c')).toBeFocused();
  expect(await selection(page)).toEqual({ kind: 'clips', ids: ['c'] });
  await page.keyboard.press('ArrowRight'); // the last one stays
  await expect(page.getByTestId('clip-c')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('clip-a')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByTestId('clip-c')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // track 2: b (2–8) is its only clip
  await expect(page.getByTestId('clip-b')).toBeFocused();
  await expect(page.getByTestId('clip-b')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown'); // track 3 is empty: stays
  await expect(page.getByTestId('clip-b')).toBeFocused();
  await page.keyboard.press('ArrowUp'); // b starts at 2: a (0–10) covers it
  await expect(page.getByTestId('clip-a')).toBeFocused();
  // Shift+→ extends the selection along the track.
  await page.keyboard.press('Shift+ArrowRight');
  expect(await selection(page)).toEqual({ kind: 'clips', ids: ['a', 'c'] });
  await page.keyboard.press('Shift+ArrowLeft');
  expect(await selection(page)).toEqual({ kind: 'clips', ids: ['a', 'c'] });
  await expect(page.getByTestId('clip-a')).toBeFocused();

  // Up from a clip enters its blocks by the lowest lane: x (lane 2); then w, the nearest of
  // lane 1; right along the lane to z; down to the lane below, then to the clip.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('action-block-x')).toBeFocused();
  expect(await selection(page)).toEqual({ kind: 'action', clipId: 'a', actionId: 'x' });
  await expect(page.getByTestId('action-block-x')).toHaveAttribute(
    'aria-label',
    'Transform, 2.00 to 3.00 s, lane 2 of 2',
  );
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('action-block-w')).toBeFocused();
  await page.keyboard.press('ArrowUp'); // top lane, no track above: stays
  await expect(page.getByTestId('action-block-w')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('action-block-z')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('action-block-x')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('clip-a')).toBeFocused();
  expect(await selection(page)).toEqual({ kind: 'clips', ids: ['a'] });
  // Space on a focused item plays and pauses, as anywhere else.
  await page.keyboard.press('Space');
  expect((await uiState(page)).playing).toBe(true);
  await page.keyboard.press('Space');
  expect((await uiState(page)).playing).toBe(false);
  expect(await canUndo(page)).toBe(false); // moving around edits nothing
});

test('Enter opens a clip’s formula or a block’s menu; Shift+F10 the add-animation menu', async ({
  page,
}) => {
  await openRelationScene(page, [A, B, C]);
  await page.getByTestId('clip-b').focus();
  await page.keyboard.press('Enter');
  const editor = page.getByTestId('formula-editor');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('Formula · f2');
  expect(await selection(page)).toEqual({ kind: 'clips', ids: ['b'] });
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();

  await page.getByTestId('clip-a').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('action-block-x')).toBeFocused();
  await page.keyboard.press('Enter');
  const blockMenu = page.getByTestId('block-menu');
  await expect(blockMenu).toBeVisible();
  // It opens under the block.
  const [blockBox, menuBox] = [
    (await page.getByTestId('action-block-x').boundingBox())!,
    (await blockMenu.boundingBox())!,
  ];
  expect(menuBox.y).toBeGreaterThanOrEqual(blockBox.y + blockBox.height - 1);
  await page.keyboard.press('Escape');
  await expect(blockMenu).toHaveCount(0);

  // The menu key on a clip: the add-animation menu at the playhead when it is inside the clip,
  // else at the clip's start.
  await page.getByTestId('clip-a').focus();
  await page.keyboard.press('Shift+F10');
  const addMenu = page.getByTestId('add-animation-menu');
  await expect(addMenu).toBeVisible();
  await expect(page.getByTestId('add-animation-header')).toContainText('f1 · playhead 0.00 s');
  await page.keyboard.press('Escape');
  await expect(addMenu).toHaveCount(0);
  await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(6));
  await page.getByTestId('clip-a').focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('add-animation-header')).toContainText('f1 · playhead 6.00 s');
  await page.keyboard.press('Escape');
  // Off the clip (it ends at 10 s), the playhead gives way to the clip's start, and the header
  // says why.
  await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(11));
  await page.getByTestId('clip-a').focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('add-animation-header')).toContainText(
    'f1 · 0.00 s · the playhead is outside this clip',
  );
  await page.keyboard.press('Escape');
  // A block's menu with the menu key too.
  await page.getByTestId('action-block-z').focus();
  await page.keyboard.press('Shift+F10');
  await expect(blockMenu).toBeVisible();
  await page.keyboard.press('Escape');
});

test('Tab in a clip’s menu closes it and moves on from the clip, Shift+Tab back from it', async ({
  page,
}) => {
  await openRelationScene(page, [A, B, C]);
  const clip = page.getByTestId('clip-a');
  const menu = page.getByTestId('add-animation-menu');
  const focused = () =>
    page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
  // Where Tab and Shift+Tab take the focus from the clip, with no menu in the way.
  await clip.focus();
  await page.keyboard.press('Tab');
  const after = await focused();
  await clip.focus();
  await page.keyboard.press('Shift+Tab');
  const before = await focused();
  expect(after).not.toBe('clip-a');
  expect(before).not.toBe('clip-a');
  expect(after).not.toBe(before);

  // The same key inside the clip's menu closes the menu and lands on the same control: one
  // press, as the menu pattern asks, not one to close and another to move.
  await clip.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  expect(await focused()).toBe(after);

  await clip.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+Tab');
  await expect(menu).toHaveCount(0);
  expect(await focused()).toBe(before);
  // Escape still gives the focus back to the clip itself.
  await clip.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(clip).toBeFocused();
});

test('Alt + arrows move the focused clip a frame or a track, one undo step each, announced', async ({
  page,
}) => {
  await openRelationScene(page, [A, B, C]);
  const fps = (await project(page)).meta.fps;
  await page.getByTestId('clip-b').focus();
  await page.keyboard.press('Alt+ArrowRight');
  expect((await clipOf(page, 'b')).start).toBeCloseTo(2 + 1 / fps, 5);
  await expect(announcer(page)).toContainText(`f2 moved to ${(2 + 1 / fps).toFixed(2)} s`);
  await page.keyboard.press('Shift+Alt+ArrowLeft');
  expect((await clipOf(page, 'b')).start).toBeCloseTo(2 - 4 / fps, 5);
  await expect(page.getByTestId('clip-b')).toBeFocused();
  // Down to track 3 (empty), up again, then up to track 1, where b (six seconds) only fits
  // after c; the focus follows the clip.
  await page.keyboard.press('Alt+ArrowDown');
  expect((await clipOf(page, 'b')).trackId).toBe('t3');
  await expect(page.getByTestId('clip-b')).toBeFocused();
  await expect(announcer(page)).toContainText('f2 moved to Track 3');
  await page.keyboard.press('Alt+ArrowUp');
  expect((await clipOf(page, 'b')).trackId).toBe('t2');
  await page.keyboard.press('Alt+ArrowUp');
  const moved = await clipOf(page, 'b');
  expect(moved.trackId).toBe('t1');
  expect(moved.start).toBe(14);
  expect(moved.end).toBe(20);
  await expect(page.getByTestId('clip-b')).toBeFocused();
  // Each move is one undo step.
  for (let i = 0; i < 5; i += 1) await undo(page);
  expect(await clipOf(page, 'b')).toMatchObject({ trackId: 't2', start: 2, end: 8 });
  expect(await canUndo(page)).toBe(false);
  // No track below the last one; a locked track refuses, and says so.
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
      (d as unknown as { tracks: { locked: boolean }[] }).tracks[2]!.locked = true;
    });
    (window as MfeWindow).__mfe!.history.clear();
  });
  await page.getByTestId('clip-b').focus();
  await page.keyboard.press('Alt+ArrowDown');
  expect((await clipOf(page, 'b')).trackId).toBe('t2');
  await expect(page.getByTestId('notice')).toContainText('Track 3 is locked');
  expect(await canUndo(page)).toBe(false);
  // Alt+←/→ on a block nudges the block, as before.
  await page.getByTestId('clip-a').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Alt+ArrowRight');
  const x = (await clipOf(page, 'a')).actions.find((action) => action.id === 'x')!;
  expect(x.start).toBeCloseTo(2 + 1 / fps, 5);
});

test('deleting the focused clip keeps the focus in the timeline, and says what happened', async ({
  page,
}) => {
  await openRelationScene(page, [A, B, C]);
  await page.getByTestId('clip-a').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('clip-c')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('clip-c')).toHaveCount(0);
  await expect(announcer(page)).toContainText('Clip deleted');
  // Nothing is selected any more: the Tab stop is the first clip, and it has the focus.
  await expect(page.getByTestId('clip-a')).toBeFocused();
  expect((await selection(page)).kind).toBe('none');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('clip-b')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(announcer(page)).toContainText('Clip duplicated');
  expect((await project(page)).clips).toHaveLength(3);
});

test('the focus leaving the timeline (a click on the preview) does not bring the scroll back', async ({
  page,
}) => {
  // A clip far to the right, the timeline zoomed in and scrolled to it; the focus went from a
  // clip to the preview's canvas (not focusable: it lands on the body). Shift re-renders the
  // timeline (link ports), a preview edit changes the project: neither may move the scroll.
  await openRelationScene(page, [A, B, plain('d', 'fb', 't2', 60, 64)]);
  await page.getByTestId('clip-a').click({ position: { x: 30, y: 8 } });
  await expect(page.getByTestId('clip-a')).toBeFocused();
  await page.getByTestId('preview-canvas').click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId('clip-a')).not.toBeFocused();
  for (let i = 0; i < 3; i += 1) await page.getByTestId('timeline-zoom-in').click();
  const scroll = page.getByTestId('timeline-scroll');
  await scroll.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const far = await scroll.evaluate((el) => el.scrollLeft);
  expect(far).toBeGreaterThan(1000);
  await page.keyboard.down('Shift');
  await page.waitForTimeout(200);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(far);
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
      (d.clips[0] as unknown as { initial: { position: [number, number] } }).initial.position = [
        1, 0,
      ];
    }),
  );
  await page.waitForTimeout(200);
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(far);
  // Deleting the focused clip still keeps the focus in the timeline, on its Tab stop.
  await page.getByTestId('clip-a').focus();
  await page.keyboard.press('ArrowDown'); // b: focused and selected
  await expect(page.getByTestId('clip-b')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('clip-b')).toHaveCount(0);
  await expect(page.getByTestId('clip-a')).toBeFocused();
});
