import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import { appearJson, blockLocator, emphasisJson, morphJson, openBlockScene } from './blockHelpers';
import { validateProject, type Project } from '../src/model';
import { forceFallbackFilePaths, switchCreatorView } from './creatorHelpers';
import { canUndo, getProject, setTime, type MfeWindow } from './helpers';
import { openTwoApart, pressAndMove, scenePoint } from './previewHelpers';
import { openRelationScene, plain } from './relationsHelpers';
import { box, clipJson, openTimeline, timeToX } from './timelineHelpers';
import { handlePoints, pagePoint, type Point } from './uxHelpers';

for (const kind of ['block', 'window']) {
  test(`${kind} drag cancellation retains the model after further moves and release`, async ({
    page,
  }) => {
    await openBlockScene(page, kind === 'block' ? [appearJson('w', 1, 3)] : [], {
      extra:
        kind === 'window'
          ? {
              relations: [
                {
                  id: 'r1',
                  fromClipId: 'a',
                  toClipId: 'b',
                  offset: 1,
                  duration: 2,
                  style: 'copy',
                  easing: 'smooth',
                  pathArc: 0,
                  pairs: [],
                },
              ],
            }
          : {},
    });
    const before = await getProject(page);
    const target =
      kind === 'block' ? blockLocator(page, 'w') : page.getByTestId('relation-window-r1');
    const box = (await target.boundingBox())!;
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 80, start.y, { steps: 5 });
    const field = kind === 'block' ? 'clips' : 'relations';
    expect((await getProject(page))[field]).not.toEqual(before[field]);
    await page.keyboard.press('ControlOrMeta+z');
    await page.mouse.move(start.x + 120, start.y);
    await page.mouse.up();
    expect((await getProject(page))[field]).toEqual(before[field]);
    expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
    expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canRedo())).toBe(false);
  });
}

test('native range dragging stops writing after keyboard cancellation', async ({ page }) => {
  await openBlockScene(page, [emphasisJson('e', 1, 2, 'focus_on')]);
  await blockLocator(page, 'e').dblclick();
  const slider = page.getByTestId('block-dialog').getByTestId('block-emphasis-opacity-slider');
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  expect((await getProject(page)).clips[0]!.actions[0]!.opacity).not.toBe(0.2);
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.up();
  expect((await getProject(page)).clips[0]!.actions[0]!.opacity).toBe(0.2);
  expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
});

for (const edge of ['move', 'trim']) {
  for (const [name, command] of [
    ['Ctrl+Z', 'ControlOrMeta+z'],
    ['Ctrl+Shift+Z', 'ControlOrMeta+Shift+z'],
  ] as const) {
    test(`timeline ${edge}: ${name} cancels before release and keeps committed history`, async ({
      page,
    }, testInfo) => {
      await openTimeline(page, [clipJson('ca', 'fa', 't1', 0, 4)]);
      await page.evaluate(() => {
        const api = (window as MfeWindow).__mfe!;
        api.history.clear();
        api.useProjectStore.getState().update((p) => {
          p.meta.name = 'Committed rename';
        });
      });
      const clip = page.getByTestId('clip-ca');
      const box = (await clip.boundingBox())!;
      const start =
        edge === 'move'
          ? { x: box.x + box.width / 2, y: box.y + 10 }
          : { x: box.x + box.width - 2, y: box.y + 10 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 80, start.y, { steps: 5 });
      const field = edge === 'move' ? 'start' : 'end';
      expect((await getProject(page)).clips[0]![field]).not.toBe(edge === 'move' ? 0 : 4);
      await page.keyboard.press(command);
      await page.mouse.move(start.x + 160, start.y);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      const state = await getProject(page);
      expect(state.meta.name).toBe('Committed rename');
      expect(state.clips[0]).toMatchObject({ start: 0, end: 4 });
      await page.keyboard.press('ControlOrMeta+z');
      expect((await getProject(page)).meta.name).toBe('e2e');
      await page.keyboard.press('ControlOrMeta+Shift+z');
      expect((await getProject(page)).clips[0]).toMatchObject({ start: 0, end: 4 });
      if (edge === 'move' && command === 'ControlOrMeta+z') {
        for (const theme of ['dark', 'light']) {
          await page.evaluate((theme) => {
            document.documentElement.dataset.theme = theme;
          }, theme);
          await page.screenshot({ path: testInfo.outputPath(`gesture-history-${theme}.png`) });
        }
      }
    });
  }
}

test('preview handle Redo cancels scaling and later pointer movement cannot write', async ({
  page,
}) => {
  await openTwoApart(page);
  await page.keyboard.press('ControlOrMeta+a');
  await page.mouse.move(10, 10);
  await page.keyboard.down('Shift');
  const handles = (await handlePoints(page))!;
  const start = await pagePoint(page, handles.se);
  const target: Point = [
    handles.center[0] + (handles.se[0] - handles.center[0]) * 1.4,
    handles.center[1] + (handles.se[1] - handles.center[1]) * 1.4,
  ];
  const end = await pagePoint(page, target);
  const before = (await getProject(page)).clips;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  expect((await getProject(page)).clips).not.toEqual(before);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.mouse.move(end.x + 25, end.y + 25);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await getProject(page)).clips).toEqual(before);
  expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
  expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canRedo())).toBe(false);
});

test('preview drag Undo cancels the pointer owner and leaves the preceding edit undoable', async ({
  page,
}) => {
  await openTwoApart(page);
  await page.evaluate(() => {
    const api = (window as MfeWindow).__mfe!;
    api.history.clear();
    api.useProjectStore.getState().update((p) => {
      p.meta.name = 'Committed rename';
    });
  });
  const before = await getProject(page);
  await pressAndMove(page, [-3, 0], [-2, 1]);
  expect((await getProject(page)).clips).not.toEqual(before.clips);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await getProject(page)).meta.name).toBe('Committed rename');
  expect((await getProject(page)).clips).toEqual(before.clips);
  const more = await scenePoint(page, [-1, 2]);
  await page.mouse.move(more.x, more.y);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await getProject(page)).clips).toEqual(before.clips);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await getProject(page)).meta.name).not.toBe('Committed rename');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await getProject(page)).meta.name).toBe('Committed rename');
  expect((await getProject(page)).clips).toEqual(before.clips);
});

test('Block dialog keyboard history reflects the committed timeline state in both themes', async ({
  page,
}, testInfo) => {
  await openBlockScene(page, [appearJson('w', 1, 3)]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await blockLocator(page, 'w').dblclick();
  const dialog = page.getByTestId('block-dialog');
  await dialog.getByTestId('block-duration').fill('2');
  await dialog.getByTestId('block-duration').press('Enter');
  await dialog.getByTestId('block-preview-open').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(blockLocator(page, 'w')).toHaveAttribute('data-duration', '3');
  await expect(dialog.getByTestId('block-duration')).toHaveValue('3');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(blockLocator(page, 'w')).toHaveAttribute('data-duration', '2');
  // Native undo belongs to an actively edited number field; it must not consume project history.
  const duration = dialog.getByTestId('block-duration');
  await duration.focus();
  await duration.press('ControlOrMeta+a');
  await duration.pressSequentially('7');
  await duration.press('ControlOrMeta+z');
  await expect(duration).toHaveValue('2');
  await expect(blockLocator(page, 'w')).toHaveAttribute('data-duration', '2');
  await duration.press('Escape');
  await dialog.getByTestId('block-easing').selectOption('rush_into');
  await dialog.getByTestId('block-preview-open').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(dialog.getByTestId('block-easing')).toHaveValue('smooth');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(dialog.getByTestId('block-easing')).toHaveValue('rush_into');
  await dialog.getByTestId('block-glyph-chip-0').click();
  const afterGlyph = (await getProject(page)).clips[0]!.actions[0]!.glyphs;
  expect(afterGlyph).not.toBe('all');
  await page.keyboard.press('ControlOrMeta+z');
  expect((await getProject(page)).clips[0]!.actions[0]!.glyphs).toBe('all');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await getProject(page)).clips[0]!.actions[0]!.glyphs).toEqual(afterGlyph);
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    await page.screenshot({ path: testInfo.outputPath(`block-history-${theme}.png`) });
  }
});

test('Block glyph marquee cancellation owns its later moves and Escape keeps the dialog open', async ({
  page,
}) => {
  await openBlockScene(page, [appearJson('w', 1, 3)]);
  await blockLocator(page, 'w').dblclick();
  const dialog = page.getByTestId('block-dialog');
  const first = (await dialog.getByTestId('block-glyph-0').boundingBox())!;
  const svg = dialog.locator('.glyph-svg.is-large');
  const area = (await svg.boundingBox())!;
  const start = { x: first.x - 3, y: Math.max(area.y + 1, first.y - 3) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width + 2, first.y + first.height + 2, { steps: 5 });
  expect((await getProject(page)).clips[0]!.actions[0]!.glyphs).not.toBe('all');
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.move(area.x + area.width - 3, area.y + area.height - 3);
  await page.mouse.up();
  expect((await getProject(page)).clips[0]!.actions[0]!.glyphs).toBe('all');
  expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width + 2, first.y + first.height + 2, { steps: 5 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.mouse.up();
  expect((await getProject(page)).clips[0]!.actions[0]!.glyphs).toBe('all');
});

test('nested Morph draft keeps project history quiet and Escape closes only the top dialog', async ({
  page,
}) => {
  await openBlockScene(page, [morphJson('m', 2, 1)]);
  await blockLocator(page, 'm').dblclick();
  const dialog = page.getByTestId('block-dialog');
  const duration = dialog.getByTestId('block-duration');
  await duration.fill('2');
  await duration.press('Enter');
  await dialog.getByTestId('block-morph-pairs').click();
  await page.getByTestId('morph-editor-close').focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect((await getProject(page)).clips[0]!.actions[0]!.duration).toBe(2);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('morph-editor')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('block-preview-open').focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect((await getProject(page)).clips[0]!.actions[0]!.duration).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

for (const view of ['list', 'grid']) {
  test(`Duplicate is reached from the keyboard through the menu in Creator ${view} view`, async ({
    page,
  }, testInfo) => {
    await openTwoApart(page);
    // The list view is the one the Creator starts with; its key switches to the blocks.
    if (view === 'grid') await switchCreatorView(page, 'grid');
    await expect(page.getByTestId('formula-list')).toHaveAttribute('data-view', view);
    const cards = page.getByTestId(view === 'list' ? 'formula-item' : 'formula-block');
    await cards.first().click();
    const before = await getProject(page);
    const undoable = await canUndo(page);
    // Ctrl+D is the timeline's key (clips and blocks): on a formula card it duplicates nothing.
    await page.keyboard.press('ControlOrMeta+d');
    await page.keyboard.press('ArrowDown');
    await expect(cards.nth(1)).toBeFocused();
    expect((await getProject(page)).formulas).toEqual(before.formulas);
    expect(await canUndo(page)).toBe(undoable);
    await cards.first().click();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByTestId('formula-menu-duplicate')).toBeVisible();
    if (view === 'list') {
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await page.screenshot({ path: testInfo.outputPath(`duplicate-menu-${theme}.png`) });
      }
    }
    await page.getByTestId('formula-menu-duplicate').focus();
    await page.keyboard.press('Enter');
    await expect(cards).toHaveCount(before.formulas.length + 1);
    await expect(cards.nth(1)).toBeFocused();
    const after = await getProject(page);
    expect(after.formulas[1]!.source).toBe(before.formulas[0]!.source);
    await page.keyboard.press('ControlOrMeta+z');
    expect((await getProject(page)).formulas).toEqual(before.formulas);
  });
}

/* A command fired from the keyboard while the button is still held on a clip gives the drag up
 * and then plans: with the clip as the drag found it, not as the drag showed it. */

const isGesturing = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.history.isGesturing());

async function errorsOf(page: Page): Promise<string[]> {
  return validateProject((await getProject(page)) as unknown as Project)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code);
}

test('an animation added during a trim is planned for the clip the trim leaves', async ({
  page,
}) => {
  // The long second clip makes 8 s a time the playhead can be at before the trim.
  await openRelationScene(page, [plain('a', 'fa', 't1', 0, 3), plain('b', 'fb', 't2', 0, 12)]);
  await setTime(page, 8);
  const clip = page.getByTestId('clip-a');
  await clip.focus();
  const before = await box(clip);
  await page.mouse.move(before.x + before.width - 2, before.y + 10);
  await page.mouse.down();
  await page.mouse.move((await timeToX(page, 10)) - 2, before.y + 10, { steps: 5 });
  await expect
    .poll(async () => (await getProject(page)).clips.find((c) => c.id === 'a')!.end)
    .toBe(10);
  expect(await isGesturing(page)).toBe(true);

  // The menu of the focused clip opens from the keyboard with the button still held, and its
  // commands are keys too: no second pointer is needed.
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  await page.getByTestId('add-animation-group-transform').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('add-animation-tween')).toBeVisible();
  await page.getByTestId('add-animation-tween').focus();
  await page.keyboard.press('Enter');
  expect(await isGesturing(page)).toBe(false);
  await page.mouse.up();

  const after = (await getProject(page)).clips.find((c) => c.id === 'a')!;
  expect(after.end).toBe(3);
  expect(after.actions).toHaveLength(1);
  const action = after.actions[0]! as { start: number; duration: number };
  expect(action.start + action.duration).toBeLessThanOrEqual(after.end - after.start);
  expect(await errorsOf(page)).toEqual([]);
  // One step, the block: taken back, the clip is as it was before the trim.
  await page.keyboard.press('ControlOrMeta+z');
  const undone = (await getProject(page)).clips.find((c) => c.id === 'a')!;
  expect(undone).toMatchObject({ start: 0, end: 3, actions: [] });
  expect(await canUndo(page)).toBe(false);
});

test('Ctrl/⌘+D during a move copies the clip the move leaves, next to it', async ({ page }) => {
  await openRelationScene(page, [plain('a', 'fa', 't1', 5, 8), plain('b', 'fb', 't2', 0, 12)]);
  const clip = page.getByTestId('clip-a');
  const before = await box(clip);
  const grabX = before.x + before.width / 2;
  const y = before.y + 10;
  await page.mouse.move(grabX, y);
  await page.mouse.down();
  const delta = (await timeToX(page, 0)) - (await timeToX(page, 5));
  await page.mouse.move(grabX + delta, y, { steps: 6 });
  await expect
    .poll(async () => (await getProject(page)).clips.find((c) => c.id === 'a')!.start)
    .toBe(0);
  expect(await isGesturing(page)).toBe(true);

  await page.keyboard.press('ControlOrMeta+d');
  expect(await isGesturing(page)).toBe(false);
  await page.mouse.move(grabX + delta - 40, y);
  await page.mouse.up();

  // The move was given up and the copy is of the clip where it was: after it, not over it.
  const onTrack = (await getProject(page)).clips
    .filter((c) => c.trackId === 't1')
    .map((c) => [c.start, c.end])
    .sort((p, q) => p[0]! - q[0]!);
  expect(onTrack).toEqual([
    [5, 8],
    [8, 11],
  ]);
  expect(await errorsOf(page)).toEqual([]);
  // One step, the copy.
  await page.keyboard.press('ControlOrMeta+z');
  expect((await getProject(page)).clips.filter((c) => c.trackId === 't1')).toHaveLength(1);
  expect(await canUndo(page)).toBe(false);
});

test('Ctrl/⌘+S during a move saves the clip where it was, and gives the move up', async ({
  page,
}) => {
  await forceFallbackFilePaths(page); // Save is a download, which the spec can read
  await openRelationScene(page, [plain('a', 'fa', 't1', 5, 8), plain('b', 'fb', 't2', 0, 12)]);
  const clip = page.getByTestId('clip-a');
  const before = await box(clip);
  const grabX = before.x + before.width / 2;
  const y = before.y + 10;
  await page.mouse.move(grabX, y);
  await page.mouse.down();
  const delta = (await timeToX(page, 0)) - (await timeToX(page, 5));
  await page.mouse.move(grabX + delta, y, { steps: 6 });
  await expect
    .poll(async () => (await getProject(page)).clips.find((c) => c.id === 'a')!.start)
    .toBe(0);
  expect(await isGesturing(page)).toBe(true);

  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const saved = JSON.parse(readFileSync(await (await download).path(), 'utf8')) as Project;
  // The file holds no move that Escape could still take back.
  expect(saved.clips.find((c) => c.id === 'a')).toMatchObject({ start: 5, end: 8 });
  expect(await isGesturing(page)).toBe(false);
  await page.mouse.move(grabX + delta - 40, y);
  await page.mouse.up();

  // What is on screen is what was saved: nothing moved, nothing unsaved, no step.
  expect((await getProject(page)).clips.find((c) => c.id === 'a')).toMatchObject({
    start: 5,
    end: 8,
  });
  await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
  expect(await canUndo(page)).toBe(false);
});
