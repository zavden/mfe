import { expect, test, type Page } from './test';
import { selectionOf, setTime, someTextField, type MfeWindow } from './helpers';
import { clickScene, openTwoApart, scenePoint } from './previewHelpers';

const ids = async (page: Page) => {
  const selection = await selectionOf(page);
  return selection.kind === 'clips' ? selection.ids : selection.kind;
};

test.describe('Preview selection', () => {
  test('Ctrl+click and Shift+click add a clip or take it out; a plain click narrows', async ({
    page,
  }) => {
    await openTwoApart(page);
    await clickScene(page, [-3, 0]);
    expect(await ids(page)).toEqual(['ca']);
    await clickScene(page, [3, 0], 'ControlOrMeta');
    expect(await ids(page)).toEqual(['ca', 'cb']);
    await clickScene(page, [-3, 0], 'Shift');
    expect(await ids(page)).toEqual(['cb']);
    await clickScene(page, [-3, 0], 'Shift');
    expect(await ids(page)).toEqual(['cb', 'ca']);

    // A modifier click on empty space keeps the selection; a plain one clears it.
    await clickScene(page, [0, 3], 'ControlOrMeta');
    expect(await ids(page)).toEqual(['cb', 'ca']);
    // A plain click on one clip of the pair selects that clip alone (on release, no drag).
    await clickScene(page, [3, 0]);
    expect(await ids(page)).toEqual(['cb']);
    await clickScene(page, [0, 3]);
    expect(await ids(page)).toBe('none');
    // Modifier clicks edit nothing: the project has no undo step.
    expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
  });

  test('Ctrl+A selects every clip on screen at the playhead', async ({ page }) => {
    await openTwoApart(page);
    await page.keyboard.press('ControlOrMeta+a');
    expect(await ids(page)).toEqual(['ca', 'cb']);
    await setTime(page, 3.5);
    await page.keyboard.press('ControlOrMeta+a');
    expect(await ids(page)).toEqual(['ca']);
    // Nothing on screen: the selection stays as it was.
    await setTime(page, 5);
    await page.keyboard.press('ControlOrMeta+a');
    expect(await ids(page)).toEqual(['ca']);
    // Not in a text field (the browser's select-all there).
    const field = await someTextField(page);
    await field.fill('abc');
    await field.press('ControlOrMeta+a');
    expect(await ids(page)).toEqual(['ca']);
  });

  test('dragging one clip of a multi-selection moves them all, as one undo step', async ({
    page,
  }) => {
    await openTwoApart(page);
    await clickScene(page, [-3, 0]);
    await clickScene(page, [3, 0], 'ControlOrMeta');
    expect(await ids(page)).toEqual(['ca', 'cb']);
    const from = await scenePoint(page, [3, 0]);
    const to = await scenePoint(page, [3.5, 1]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    const positions = async () =>
      page.evaluate(() =>
        (window as MfeWindow)
          .__mfe!.useProjectStore.getState()
          .project.clips.map(
            (c) => (c as unknown as { initial: { position: [number, number] } }).initial.position,
          ),
      );
    const moved = await positions();
    expect(moved[0]![0]).toBeCloseTo(-2.5, 1);
    expect(moved[0]![1]).toBeCloseTo(1, 1);
    expect(moved[1]![0]).toBeCloseTo(3.5, 1);
    expect(moved[1]![1]).toBeCloseTo(1, 1);
    expect(await ids(page)).toEqual(['ca', 'cb']); // the pair stays selected after a drag
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positions()).toEqual([
      [-3, 0],
      [3, 0],
    ]);
    expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
  });
});
