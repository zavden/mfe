import { expect, test, type Page } from './test';
import {
  getProject,
  openAnimationsTab,
  selectionOf,
  setTime,
  type MfeWindow,
  type PairRefJson,
} from './helpers';
import { clickScene, pressAndMove, scenePoint } from './previewHelpers';
import { openRelationScene, plain } from './relationsHelpers';
import { F1, F2, openScene, shapeOf, startFromClip } from './shapeRetargetHelpers';

/* Whose a key is while a mode of the Preview is on (`preview/modeKeys.ts`): the mode's, before
 * what has the focus hears it, unless a menu is open — then the menu's. One case per mode and
 * per owner, and a key does one thing in each. A dialog, a field and the search of formulas
 * have their own specs; align by symbol with a clip focused is in `previewSymbolAlign.spec.ts`. */

const frame = (page: Page) => page.getByTestId('preview-frame');

/** f1 up on the left and f2 down on the right, both over [0, 8); the playhead at 3 s. */
async function openTwo(page: Page): Promise<void> {
  const a = plain('a', 'fa', 't1', 0, 8);
  a.initial.position = F1;
  const b = plain('b', 'fb', 't2', 0, 8);
  b.initial.position = F2;
  await openRelationScene(page, [a, b]);
  await setTime(page, 3);
}

const PAIR: PairRefJson = { origin: { kind: 'relation', relationId: 'r1' }, index: 0 };

/** Edit path on the pair of a relation, its first node selected: an arrow would move it. */
async function startPath(page: Page): Promise<void> {
  const a = plain('a', 'fa', 't1', 0, 8);
  a.initial.position = [-2, 1];
  const b = plain('b', 'fb', 't2', 2, 8);
  b.initial.position = [2, -1];
  const relation = {
    id: 'r1',
    fromClipId: 'a',
    toClipId: 'b',
    offset: 0,
    duration: 2,
    easing: 'linear',
    style: 'transform',
    pathArc: 0,
    pairs: [{ from: [0], to: [0], style: null }],
  };
  await openRelationScene(page, [a, b], { relations: [relation] });
  await page.evaluate((ref) => {
    const path = (window as MfeWindow).__mfe!.usePathEdit.getState();
    path.open(ref);
    path.select({ node: 0, part: 'at' });
  }, PAIR);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '0:at');
}

/** The choice of a shape's target, f2 chosen: Enter would make the Transform to it. */
async function startRetarget(page: Page): Promise<void> {
  await openScene(page);
  await startFromClip(page);
  await clickScene(page, F2);
  await expect(page.getByTestId('retarget-hint')).toContainText('f2');
}

/** «Add line ▸ Line» from the menu of the preview's empty space: two clicks would put its ends. */
async function startLine(page: Page): Promise<void> {
  await openTwo(page);
  const empty = await scenePoint(page, [0, 3]);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await page.getByTestId('preview-space-line-line').click();
  await expect(frame(page)).toHaveAttribute('data-line-draw', 'line');
}

/** A line drawn between two free points and bent into a spline from its Line section: «Edit
 * curve» on it. */
async function startCurve(page: Page): Promise<void> {
  await startLine(page);
  await clickScene(page, [-1, -3]);
  await clickScene(page, [2, -3]);
  await expect(frame(page)).toHaveAttribute('data-line-draw', '');
  await openAnimationsTab(page, 'timing');
  await page.getByTestId('line-bend-spline').click();
  await expect(frame(page)).not.toHaveAttribute('data-line-curve', '');
}

interface Mode {
  name: string;
  /** Open a scene and turn the mode on, with something for its keys to act on. */
  start(page: Page): Promise<void>;
  /** The attribute of the frame that carries the mode while it is on. */
  attribute: string;
}

const MODES: Mode[] = [
  { name: 'Edit path', start: startPath, attribute: 'data-path-edit' },
  { name: 'the choice of a shape’s target', start: startRetarget, attribute: 'data-retarget' },
  {
    name: 'colours in order',
    start: async (page) => {
      await openTwo(page);
      await page.keyboard.press('Shift+C');
    },
    attribute: 'data-colour-order',
  },
  {
    name: 'align by symbol',
    start: async (page) => {
      await openTwo(page);
      await page.keyboard.press('Alt+g');
    },
    attribute: 'data-symbol-align',
  },
  {
    name: 'the glyphs picked with Alt',
    start: async (page) => {
      await openTwo(page);
      await page.keyboard.down('Alt');
      await pressAndMove(page, F1, [-1.2, 0.6]);
      await page.mouse.up();
      await page.keyboard.up('Alt');
    },
    attribute: 'data-glyph-pick',
  },
  { name: 'Add line', start: startLine, attribute: 'data-line-draw' },
  { name: 'Edit curve', start: startCurve, attribute: 'data-line-curve' },
];

/** What a key of a mode would change: the clips with their blocks, the relations with their
 * paths. */
const written = async (page: Page): Promise<string> => {
  const project = await getProject(page);
  return JSON.stringify([project.clips, project.relations]);
};

/** The next frame: what a key changed is on the page. */
const painted = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

test.describe('The keys of an open menu are the menu’s while a mode of the Preview is on', () => {
  for (const mode of MODES) {
    test(`${mode.name}: the arrows, Enter and Escape of a menu of the bar and of a clip’s menu`, async ({
      page,
    }) => {
      await mode.start(page);
      const on = await frame(page).getAttribute(mode.attribute);
      expect(on).not.toBe('');
      const before = await written(page);
      /** The mode is as it was, and wrote nothing. */
      const untouched = async () => {
        await expect(frame(page)).toHaveAttribute(mode.attribute, on!);
        await expect(frame(page)).toHaveAttribute('data-symbol-cursor', '');
        expect(await written(page)).toBe(before);
      };

      // A menu of the bar, opened with the pointer: the focus stays on its button, ↓ goes into
      // the menu, the arrows walk it and Escape closes it.
      const view = page.getByTestId('menu-view');
      const toggle = page.getByTestId('menu-item-view-toggle-theme');
      await view.click();
      await expect(page.getByRole('menu')).toHaveCount(1);
      await page.keyboard.press('ArrowDown');
      await expect(toggle).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByTestId('menu-item-view-theme')).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(toggle).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await untouched();
      // Enter presses the entry.
      const shown = await theme(page);
      await view.click();
      await page.keyboard.press('ArrowDown');
      await expect(toggle).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toHaveCount(0);
      expect(await theme(page)).not.toBe(shown);
      await untouched();

      // The menu of a clip, opened from the keyboard.
      await page.getByTestId('clip-b').focus();
      await page.keyboard.press('Shift+F10');
      const menu = page.getByTestId('add-animation-menu');
      await expect(menu).toBeVisible();
      await expect(page.getByTestId('add-animation-group-appear')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByTestId('add-animation-group-disappear')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('add-animation-group-disappear-submenu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await untouched();
    });
  }
});

test.describe('The keys of a mode of the Preview are its alone, whatever has the focus', () => {
  test('Edit path: with a clip focused, an arrow moves the node and Enter leaves the mode', async ({
    page,
  }) => {
    await startPath(page);
    const selected = await selectionOf(page);
    const before = await written(page);
    const clip = page.getByTestId('clip-a');
    await clip.focus();
    // ↓ on a focused clip goes to the clip of the track below.
    await page.keyboard.press('ArrowDown');
    expect(await written(page)).not.toBe(before);
    expect(await selectionOf(page)).toEqual(selected);
    await expect(clip).toBeFocused();
    // Enter on a focused clip opens its formula.
    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-path-edit', '');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the choice of a shape’s target: with a clip focused, Enter makes the Transform', async ({
    page,
  }) => {
    await startRetarget(page);
    await page.getByTestId('clip-b').focus();
    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-retarget', '');
    const { tweens } = await shapeOf(page);
    expect(tweens.map((tween) => tween.fit?.clipId)).toEqual(['b']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('colours in order: a focused clip is not deleted by Backspace, and Escape leaves the mode from the bar', async ({
    page,
  }) => {
    await openTwo(page);
    const clip = page.getByTestId('clip-a');
    await clip.click({ position: { x: 30, y: 8 } });
    await clip.focus();
    await page.keyboard.press('Shift+C');
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'copy');
    await page.keyboard.press('Backspace');
    await expect(clip).toBeVisible();
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'copy');
    // Enter on a focused clip opens its formula: here it asks for a first click.
    await page.keyboard.press('Enter');
    await expect(
      page.getByTestId('notice').filter({ hasText: 'Nothing copied yet' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');

    // Chosen in the Edit menu, the mode leaves the focus on «Edit», on the bar: its menus are
    // closed, and Escape is the mode's.
    const edit = page.getByTestId('menu-edit');
    await edit.click();
    await page.getByTestId('menu-item-edit-colours-order').hover();
    await page.getByTestId('menu-item-edit-colours-order-copy').click();
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'copy');
    await expect(edit).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
  });

  test('align by symbol: a key held with Ctrl/⌘ or Alt is a shortcut’s, and Escape alone leaves', async ({
    page,
  }) => {
    await openTwo(page);
    await page.getByTestId('clip-a').focus();
    await page.keyboard.press('Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    // An arrow walks the symbols and Enter takes the one it is on: what moves is chosen.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    for (const key of ['ControlOrMeta+Enter', 'ControlOrMeta+Escape', 'Alt+Escape']) {
      await page.keyboard.press(key);
      await painted(page);
      // The symbol chosen is kept: the mode did not go back to its first step, nor leave.
      await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    }
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
  });

  test('the glyphs picked with Alt: Escape lets them go with Alt still held', async ({ page }) => {
    await openTwo(page);
    await page.keyboard.down('Alt');
    await pressAndMove(page, F1, [-1.2, 0.6]);
    await page.mouse.up();
    await expect(frame(page)).not.toHaveAttribute('data-glyph-pick', '');
    // The key that picks them is still down: this Escape is the pick's all the same.
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await page.keyboard.up('Alt');
  });

  test('Add line: a key held with Ctrl/⌘ or Alt is a shortcut’s, and Escape alone leaves', async ({
    page,
  }) => {
    await startLine(page);
    for (const key of ['ControlOrMeta+Escape', 'Alt+Escape']) {
      await page.keyboard.press(key);
      await expect(frame(page)).toHaveAttribute('data-line-draw', 'line');
    }
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-line-draw', '');
  });

  test('Edit curve: a key held with Ctrl/⌘ or Alt is a shortcut’s, and Enter alone leaves', async ({
    page,
  }) => {
    await startCurve(page);
    const on = await frame(page).getAttribute('data-line-curve');
    const before = await written(page);
    for (const key of ['ControlOrMeta+Enter', 'Alt+Escape', 'Alt+Enter']) {
      await page.keyboard.press(key);
      await expect(frame(page)).toHaveAttribute('data-line-curve', on!);
    }
    expect(await written(page)).toBe(before);
    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-line-curve', '');
  });
});
