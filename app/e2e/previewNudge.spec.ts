import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import {
  canUndo,
  onSystem,
  openWithProject,
  projectFile,
  selectionOf,
  setTime,
  someTextField,
  type MfeWindow,
} from './helpers';
import { clickScene, openTwoApart } from './previewHelpers';
import { clipJson } from './timelineHelpers';

const frame = (page: Page) => page.getByTestId('preview-frame');

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

const timeOf = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().time);

/** openTwoApart (alpha at (−3, 0) on t1, beta at (3, 0) on t2; playhead 2 s) with `locked`
 * tracks locked in the file itself: no undo step to begin with. */
async function openTwoApartLocked(page: Page, locked: string[]): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 4);
  ca.initial.position = [-3, 0];
  const cb = clipJson('cb', 'fb', 't2', 0, 3);
  cb.initial.position = [3, 0];
  const formulas = [
    { id: 'fa', name: 'alpha', source: 'alpha', color: '#58C4DD' },
    { id: 'fb', name: 'beta', source: 'beta', color: '#83C167' },
  ];
  const tracks = ['t1', 't2', 't3'].map((id) => ({
    id,
    name: id,
    hidden: false,
    locked: locked.includes(id),
  }));
  await openWithProject(page, projectFile('e2e', formulas, [ca, cb], { tracks }));
  await setTime(page, 2);
  await waitForDrawables(page, 9);
}

test.describe('Preview: the arrow keys move the selected objects', () => {
  test('after a click on a formula: 0.01 a press, 0.1 with Shift; the playhead stays; one undo', async ({
    page,
  }) => {
    await openTwoApart(page);
    await clickScene(page, [-3, 0]);
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['ca'] });
    await expect(frame(page)).toBeFocused();
    await expect(page.getByTestId('preview-handles-hint')).toContainText(
      onSystem('the arrows move it 0.01 (Shift: 0.1)', 'the arrows move it 0.01 (⇧: 0.1)'),
    );
    await page.keyboard.press('ArrowRight');
    expect(await positionOf(page, 'ca')).toEqual([-2.99, 0]);
    await page.keyboard.press('ArrowUp');
    expect(await positionOf(page, 'ca')).toEqual([-2.99, 0.01]);
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await positionOf(page, 'ca')).toEqual([-3.09, 0.01]);
    await page.keyboard.press('ArrowDown');
    expect(await positionOf(page, 'ca')).toEqual([-3.09, 0]);
    expect(await positionOf(page, 'cb')).toEqual([3, 0]);
    expect(await timeOf(page)).toBe(2);

    // The run of presses is one undo step.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('a key held down repeats in the same step; another edit in between starts a new one', async ({
    page,
  }) => {
    await openTwoApart(page);
    await clickScene(page, [-3, 0]);
    // Held down: the browser repeats the key (each repeat is a keydown).
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.up('ArrowRight');
    expect(await positionOf(page, 'ca')).toEqual([-2.97, 0]);
    // Align it to the centre of the frame (Alt+Shift+H): a step of its own, between presses.
    await page.keyboard.press('Alt+Shift+h');
    const aligned = await positionOf(page, 'ca');
    expect(aligned[0]).not.toBe(-2.97);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await positionOf(page, 'ca')).toEqual([aligned[0], 0.02]);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual(aligned);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual([-2.97, 0]);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('two selected formulas move together by the same step, as one undo step', async ({
    page,
  }) => {
    await openTwoApart(page);
    await clickScene(page, [-3, 0]);
    await clickScene(page, [3, 0], 'ControlOrMeta');
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['ca', 'cb'] });
    await expect(frame(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await positionOf(page, 'ca')).toEqual([-3.09, 0.01]);
    expect(await positionOf(page, 'cb')).toEqual([2.91, 0.01]);
    expect(await timeOf(page)).toBe(2);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await positionOf(page, 'cb')).toEqual([3, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('a formula on a locked track stays and a notice says so; with another selected, that one moves', async ({
    page,
  }) => {
    await openTwoApartLocked(page, ['t2']);
    // beta alone: nothing moves, the playhead does not step, and the notice names it.
    await clickScene(page, [3, 0]);
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['cb'] });
    await page.keyboard.press('ArrowRight');
    expect(await positionOf(page, 'cb')).toEqual([3, 0]);
    expect(await timeOf(page)).toBe(2);
    expect(await canUndo(page)).toBe(false);
    await expect(page.getByTestId('notice')).toContainText('1 clip stayed');
    await expect(page.getByTestId('notice')).toContainText('beta');

    // alpha and beta: alpha moves, beta stays — as a drag of the pair would — and is named.
    await clickScene(page, [-3, 0], 'ControlOrMeta');
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['cb', 'ca'] });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    expect(await positionOf(page, 'ca')).toEqual([-2.99, 0.1]);
    expect(await positionOf(page, 'cb')).toEqual([3, 0]);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('with nothing selected, ←/→ step the playhead as before', async ({ page }) => {
    await openTwoApart(page);
    await clickScene(page, [0, 3]); // empty space: the selection goes
    expect(await selectionOf(page)).toEqual({ kind: 'none' });
    await expect(frame(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    expect(await timeOf(page)).toBeCloseTo(2 + 1 / 60, 9);
    await page.keyboard.press('Shift+ArrowRight');
    expect(await timeOf(page)).toBeCloseTo(3 + 1 / 60, 9);
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await canUndo(page)).toBe(false);
  });

  test('the keys stay where they were: a timeline clip, a field, a mode, Ctrl/⌘ and Alt', async ({
    page,
  }) => {
    await openTwoApart(page);
    await clickScene(page, [-3, 0]);
    // With Alt or Ctrl/⌘ an arrow is not the selection's.
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('ControlOrMeta+ArrowRight');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await timeOf(page)).toBe(2);

    // A mode of the preview keeps its arrows: align by symbol walks the glyphs with them.
    await page.keyboard.press('Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await page.keyboard.press('ArrowRight');
    await expect(frame(page)).not.toHaveAttribute('data-symbol-cursor', '');
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);

    // On a timeline clip the arrows walk the clips: ↓ goes to the track below.
    const clip = page.getByTestId('clip-ca');
    await clip.click({ position: { x: 30, y: 8 } });
    await clip.focus();
    const time = await timeOf(page);
    await page.keyboard.press('ArrowDown');
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['cb'] });
    await expect(page.getByTestId('clip-cb')).toBeFocused();
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await positionOf(page, 'cb')).toEqual([3, 0]);
    expect(await timeOf(page)).toBe(time);

    // In a text field they are the field's.
    await clickScene(page, [-3, 0]);
    const field = await someTextField(page);
    await field.fill('abc');
    await field.press('ArrowLeft');
    expect(await positionOf(page, 'ca')).toEqual([-3, 0]);
    expect(await canUndo(page)).toBe(false);
  });
});
