/* The keys pressed in an open menu are the menu's (`inOpenMenu`, ui/focus.ts): inside a menu — a
 * context menu, a menu of the bar, the Creator's menu of the kinds —, on the bar while one of its
 * menus is open, or with the focus fallen out of an open menu onto the page, a key reaches none of
 * the app's own handlers — the shortcuts (`project/shortcuts.ts`), the playhead's keys
 * (`transport/Transport.tsx`), the timeline's (`timeline/useTimelineKeys.ts`) —, so nothing
 * moves, switches, starts, is deleted or undone under the menu, and what the browser would do
 * with a key the app takes (a bookmark for Ctrl/⌘+D) does not happen either. What the menu uses
 * itself keeps working: ↑ ↓ Home End, Escape, Tab, Enter, Space, → into a submenu and the
 * letters of the bar's menus (`menuKeyboard.spec.ts`, `contextSubmenus.spec.ts`). Audit B5-01.
 *
 * The arrow tests are the audit verifier's (V4): pressed on the first entry, «Appear ›», a
 * submenu entry that takes → itself, → would pass whatever the app did. */
import type { Page } from './test';
import { expect, test } from './test';
import { clipJson, openTimeline, project, setTime, uiState } from './timelineHelpers';

const A = clipJson('a', 'fa', 't1', 0, 8);
const body = { position: { x: 30, y: 8 } };

/** The menu of the clip `a` is open, `a` selected, the playhead at `t`, the focus on the menu's
 * first entry. */
async function openClipMenu(page: Page, t: number): Promise<void> {
  await openTimeline(page, [A]);
  await page.getByTestId('clip-a').click(body);
  await setTime(page, t);
  await page.getByTestId('clip-a').click({ ...body, button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  // The menu has put the focus on one of its entries: the first one, a submenu.
  await expect(page.locator('[role="menu"] [role^="menuitem"]:focus')).toHaveCount(1);
  await expect(page.getByTestId('add-animation-group-appear')).toBeFocused();
}

const clipIds = async (page: Page) => (await project(page)).clips.map((clip) => clip.id);

/** Records, for the next key presses, whether each was stopped (`defaultPrevented`) once every
 * listener of the app had heard it: what the browser would then do with it. */
async function recordPrevented(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: { key: string; prevented: boolean }[] = [];
    (window as unknown as { keyLog: typeof log }).keyLog = log;
    // A listener of the window in the bubble phase, added after the app's: it hears last.
    window.addEventListener('keydown', (event) => {
      // A modifier going down on its own is not a key of the app's.
      if (/^(Control|Meta|Shift|Alt)$/.test(event.key)) return;
      log.push({ key: event.key, prevented: event.defaultPrevented });
    });
  });
}
const keyLog = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { keyLog: { key: string; prevented: boolean }[] }).keyLog,
  );

test('← in an open context menu does not step the playhead', async ({ page }) => {
  await openClipMenu(page, 2);
  await page.keyboard.press('ArrowLeft');
  expect((await uiState(page)).time).toBe(2);
});

test('→ on a plain entry of an open context menu does not step the playhead', async ({ page }) => {
  await openClipMenu(page, 2);
  // «Split at playhead (S)» is a plain entry: no → of its own.
  await page.getByTestId('clip-menu-split').focus();
  await expect(page.getByTestId('clip-menu-split')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect((await uiState(page)).time).toBe(2);
});

test('control: → on the first entry, a submenu, opens it and the playhead stays', async ({
  page,
}) => {
  await openClipMenu(page, 2);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('add-animation-group-appear-submenu')).toBeVisible();
  expect((await uiState(page)).time).toBe(2);
});

test('S in an open context menu neither switches the circle selector nor splits', async ({
  page,
}) => {
  await openClipMenu(page, 4);
  const frame = page.getByTestId('preview-frame');
  await expect(frame).toHaveAttribute('data-selector', 'pointer');
  await page.keyboard.press('s');
  await expect(frame).toHaveAttribute('data-selector', 'pointer');
  // Nor does it split the selected clip, with the playhead inside it: the menu's entry does.
  expect(await clipIds(page)).toEqual(['a']);
  await expect(page.getByRole('menu')).toBeVisible();
});

test('Shift+C in an open context menu does not start colours in order', async ({ page }) => {
  await openClipMenu(page, 4);
  await page.keyboard.press('Shift+C');
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-colour-order', '');
});

test('Backspace in an open context menu deletes nothing; with the menu closed, it deletes', async ({
  page,
}) => {
  await openClipMenu(page, 4);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  expect(await clipIds(page)).toEqual(['a']);
  await expect(page.getByRole('menu')).toBeVisible();
  // Escape closes the menu, the focus going back to the clip: the same key deletes it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.keyboard.press('Backspace');
  await expect.poll(() => clipIds(page)).toEqual([]);
});

test('Ctrl/⌘+Z and Ctrl/⌘+D in an open context menu undo and duplicate nothing', async ({
  page,
}) => {
  await openTimeline(page, [A]);
  await page.getByTestId('clip-a').click(body);
  // One step to undo: the clip a frame later.
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await project(page)).clips[0]!.start).toBeGreaterThan(0);
  const moved = (await project(page)).clips[0]!.start;
  await page.getByTestId('clip-a').click({ ...body, button: 'right' });
  await expect(page.getByTestId('add-animation-group-appear')).toBeFocused();
  await recordPrevented(page);
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+d');
  const after = await project(page);
  expect(after.clips.map((clip) => [clip.id, clip.start])).toEqual([['a', moved]]);
  // The app took both keys (the browser would have bookmarked the page with the second).
  expect(await keyLog(page)).toEqual([
    { key: 'z', prevented: true },
    { key: 'd', prevented: true },
  ]);
  // With the menu closed they undo and duplicate.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await project(page)).clips[0]!.start).toBe(0);
  await page.keyboard.press('ControlOrMeta+d');
  await expect.poll(async () => (await clipIds(page)).length).toBe(2);
});

test('a key pressed after a click on the heading of an open menu is still the menu’s', async ({
  page,
}) => {
  await openClipMenu(page, 4);
  // A press on the heading, which takes no focus, lets the focus go to the page; the menu stays.
  await page.getByTestId('add-animation-header').click();
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('s');
  expect((await uiState(page)).time).toBe(4);
  expect(await clipIds(page)).toEqual(['a']);
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-selector', 'pointer');
});

test('a menu of the bar: a key it has no entry for does nothing under it', async ({ page }) => {
  await openTimeline(page, [A]);
  await page.getByTestId('clip-a').click(body);
  await setTime(page, 4);
  // Opened from the keyboard, the focus on its first entry.
  await page.getByTestId('menu-view').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: 'View', exact: true })).toBeVisible();
  // No entry starts with "?" (Help ▸ Keyboard shortcuts… is in another menu).
  await page.keyboard.press('Shift+?');
  await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0);
  await page.keyboard.press('Backspace');
  expect(await clipIds(page)).toEqual(['a']);
  await page.keyboard.press('ArrowLeft'); // the bar's: the menu before, Edit
  await expect(page.getByRole('menu', { name: 'Edit', exact: true })).toBeVisible();
  expect((await uiState(page)).time).toBe(4);
  // Opened with the pointer, the focus on its button: its keys are the menu's too.
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-view').click();
  await expect(page.getByRole('menu', { name: 'View', exact: true })).toBeVisible();
  await expect(page.getByTestId('menu-view')).toBeFocused();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('s');
  expect(await clipIds(page)).toEqual(['a']);
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-selector', 'pointer');
  // Closed, ? shows the keyboard shortcuts.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+?');
  await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
});

test('the Creator’s menu of the kinds: ←, S and Backspace do nothing under it', async ({
  page,
}) => {
  await openTimeline(page, [A]);
  await page.getByTestId('clip-a').click(body);
  await setTime(page, 4);
  // Pressed, the key opens its menu with the focus on the first row.
  await page.getByTestId('creator-kinds').click();
  await expect(page.getByTestId('creator-select-all-math')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('s');
  await page.keyboard.press('Backspace');
  expect((await uiState(page)).time).toBe(4);
  expect(await clipIds(page)).toEqual(['a']);
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-selector', 'pointer');
  await expect(page.getByTestId('creator-kinds-menu')).toBeVisible();
});

test('a menu open elsewhere leaves the keys of what has the focus alone', async ({ page }) => {
  await openTimeline(page, [A]);
  await page.getByTestId('clip-a').click(body);
  await setTime(page, 4);
  await expect(page.getByTestId('clip-a')).toBeFocused();
  // The menu of the kinds drops when the pointer rests on its key; the focus stays on the clip.
  await page.getByTestId('creator-kinds').hover();
  await expect(page.getByTestId('creator-kinds-menu')).toBeVisible();
  await expect(page.getByTestId('clip-a')).toBeFocused();
  // S splits the selected clip under the playhead, as it does with no menu open.
  await page.keyboard.press('s');
  await expect.poll(async () => (await clipIds(page)).length).toBe(2);
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-selector', 'pointer');
});
