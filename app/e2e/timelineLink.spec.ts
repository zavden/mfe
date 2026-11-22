import { expect, test, type Page } from './test';
import type { MfeWindow } from './helpers';
import { blockLocator, openBlockScene, tweenJson } from './blockHelpers';
import { openRelationScene, plain, selectClip } from './relationsHelpers';
import { project } from './timelineHelpers';

/* f1 on track 1 [0, 6], f2 on track 2 [2, 8], f1 again on track 3 [10, 12] (no overlap with the
 * others, so it cannot be related to them). */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);
const C = plain('c', 'fa', 't3', 10, 12);

const port = (page: Page, id: string) => page.getByTestId(`clip-${id}-link`);
const band = (page: Page) => page.getByTestId('timeline-link-band');

async function center(page: Page, testId: string): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId(testId).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The test id of the element a press at (x, y) would hit, or of its closest ancestor with one. */
function hitAt(page: Page, { x, y }: { x: number; y: number }): Promise<string | null> {
  return page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px!, py!)?.closest('[data-testid]')?.getAttribute('data-testid') ??
      null,
    [x, y],
  );
}

test.describe('relating clips from the timeline with Shift', () => {
  test('Shift shows a link port on every clip', async ({ page }) => {
    await openRelationScene(page, [A, B, C]);
    await expect(port(page, 'a')).toHaveCount(0);
    await page.keyboard.down('Shift');
    for (const id of ['a', 'b', 'c']) await expect(port(page, id)).toBeVisible();
    await page.keyboard.up('Shift');
    await expect(port(page, 'a')).toHaveCount(0);
  });

  test('a focused checkbox does not keep Shift from showing the ports; a text field does', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B, C]);
    await selectClip(page, 'a');
    await page.getByTestId('animations-tab-timing').click();
    await page.getByTestId('initial-flip-x').focus();
    await expect(page.getByTestId('initial-flip-x')).toBeFocused();
    await page.keyboard.down('Shift');
    await expect(port(page, 'a')).toBeVisible();
    await page.keyboard.up('Shift');
    await page.getByTestId('initial-x').focus();
    await expect(page.getByTestId('initial-x')).toBeFocused();
    await page.keyboard.down('Shift');
    await expect(port(page, 'a')).toHaveCount(0);
    await page.keyboard.up('Shift');
  });

  test('click the port, then click the target: the relation editor opens on a → b', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B, C]);
    await page.keyboard.down('Shift');
    await port(page, 'a').click();
    await page.keyboard.up('Shift');
    // Armed: the line follows the pointer; b can be a target, c cannot (no overlap).
    await expect(band(page)).toHaveAttribute('data-mode', 'armed');
    await expect(page.getByTestId('clip-a')).toHaveAttribute('data-link', 'source');
    await expect(page.getByTestId('clip-b')).toHaveAttribute('data-link', 'target');
    await expect(page.getByTestId('clip-c')).toHaveAttribute('data-link', 'invalid');

    // A click on an invalid target says why and keeps the link armed.
    await page.getByTestId('clip-c').click({ position: { x: 20, y: 8 } });
    await expect(page.getByTestId('notice')).toContainText('cannot be related');
    await expect(band(page)).toBeVisible();

    await page.getByTestId('clip-b').click({ position: { x: 40, y: 8 } });
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    await expect(page.getByTestId('relation-editor')).toContainText('Relation: f1 → f2');
    await expect(band(page)).toHaveCount(0);
    // Nothing is created until the editor saves; the click did not move or select b.
    const p = await project(page);
    expect(p.relations).toHaveLength(0);
    expect(p.clips.find((c) => c.id === 'b')!.start).toBe(2);
  });

  test('drag from the port and drop on the target', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await page.keyboard.down('Shift');
    const from = await center(page, 'clip-a-link');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.keyboard.up('Shift');
    const to = await center(page, 'clip-b');
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await expect(band(page)).toHaveAttribute('data-mode', 'drag');
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('relation-editor')).toContainText('Relation: f1 → f2');
  });

  for (const zen of [false, true]) {
    test(`a press on the port that travels a pixel is a click, and arms the link${zen ? ', in Zen mode too' : ''}`, async ({
      page,
    }) => {
      await openRelationScene(page, [A, B]);
      await page.evaluate(
        (zenMode) => (window as MfeWindow).__mfe!.usePreferences.getState().set({ zenMode }),
        zen,
      );
      await expect(page.getByTestId('timeline-view')).toHaveAttribute(
        'data-orientation',
        zen ? 'vertical' : 'horizontal',
      );
      await page.keyboard.down('Shift');
      const from = await center(page, 'clip-a-link');
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 1, from.y);
      await page.mouse.move(from.x + 1, from.y + 1);
      await expect(band(page)).toHaveAttribute('data-mode', 'press');
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await expect(band(page)).toHaveAttribute('data-mode', 'armed');
      const to = await center(page, 'clip-b');
      await page.mouse.click(to.x, to.y);
      await expect(page.getByTestId('relation-editor')).toContainText('Relation: f1 → f2');
      expect((await project(page)).clips.find((c) => c.id === 'b')!.start).toBe(2);
    });
  }

  test('dropping on empty space, Escape or a click elsewhere cancels', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await page.keyboard.down('Shift');
    // Drag onto empty lane: cancelled.
    const from = await center(page, 'clip-a-link');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 200, from.y + 70, { steps: 5 });
    await page.mouse.up();
    await expect(band(page)).toHaveCount(0);
    // Armed, then Escape.
    await port(page, 'a').click();
    await expect(band(page)).toBeVisible();
    await page.keyboard.up('Shift');
    await page.keyboard.press('Escape');
    await expect(band(page)).toHaveCount(0);
    // Armed, then a click on an empty part of a lane.
    await page.keyboard.down('Shift');
    await port(page, 'a').click();
    await page.keyboard.up('Shift');
    await page.getByTestId('track-lane-t3').click({ position: { x: 600, y: 10 } });
    await expect(band(page)).toHaveCount(0);
    await expect(page.getByTestId('relation-editor')).toBeHidden();
  });

  test('armed, the link waits under what has the key: a dialog, a menu and a field take their own Escape', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await selectClip(page, 'a');
    await page.getByTestId('animations-tab-timing').click();
    const field = page.getByTestId('initial-x');
    const before = await field.inputValue();
    await page.keyboard.down('Shift');
    await port(page, 'a').click();
    await page.keyboard.up('Shift');
    await expect(band(page)).toHaveAttribute('data-mode', 'armed');

    // A dialog opened over it: the first Escape closes the dialog.
    const help = page.getByTestId('shortcuts-dialog');
    await page.keyboard.press('?');
    await expect(help).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
    await expect(band(page)).toHaveAttribute('data-mode', 'armed');

    // The menu of a focused clip: Escape closes the menu.
    await page.getByTestId('clip-b').focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(band(page)).toHaveAttribute('data-mode', 'armed');

    // A field being typed in: Escape takes back what was typed.
    await field.focus();
    await page.keyboard.type('7');
    await expect(field).not.toHaveValue(before);
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue(before);
    await expect(field).not.toBeFocused();
    await expect(band(page)).toHaveAttribute('data-mode', 'armed');

    // Nothing has the key now: this Escape is the link's.
    await page.keyboard.press('Escape');
    await expect(band(page)).toHaveCount(0);
    expect((await project(page)).relations).toHaveLength(0);
  });

  test('with the button down on the port, Escape is the link’s first, whatever is open', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await page.keyboard.down('Shift');
    const from = await center(page, 'clip-a-link');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.keyboard.up('Shift');
    await page.mouse.move(from.x + 60, from.y + 30, { steps: 3 });
    await expect(band(page)).toHaveAttribute('data-mode', 'drag');
    const help = page.getByTestId('shortcuts-dialog');
    await page.keyboard.press('?');
    await expect(help).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(band(page)).toHaveCount(0);
    await expect(help).toBeVisible();
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
  });

  test('two related clips: the link asks, and their relation opens for editing', async ({
    page,
  }) => {
    const relation = {
      id: 'r1',
      fromClipId: 'a',
      toClipId: 'b',
      offset: 0,
      duration: 1,
      easing: 'smooth',
      style: 'transform',
      pathArc: 0,
      pairs: [{ from: [0], to: [0], style: null }],
    };
    await openRelationScene(page, [A, B], { relations: [relation] });
    await page.keyboard.down('Shift');
    await port(page, 'a').click();
    await page.keyboard.up('Shift');
    await page.getByTestId('clip-b').click({ position: { x: 40, y: 8 } });
    await page.getByTestId('relation-choice-edit-1').click();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    await expect(page.getByTestId('rel-delete')).toBeVisible(); // only for existing relations
    await expect(page.getByTestId('rel-pair-0')).toBeVisible();
  });

  test('the port sits in the lower half: a block at the clip end stays reachable, and the port stays over relation windows', async ({
    page,
  }) => {
    // A transform block up to the end of a; a relation a → b whose window ends with b, at its port.
    const relation = {
      id: 'r1',
      fromClipId: 'a',
      toClipId: 'b',
      offset: 5,
      duration: 1,
      easing: 'smooth',
      style: 'transform',
      pathArc: 0,
      pairs: [{ from: [0], to: [0], style: null }],
    };
    await openBlockScene(page, [tweenJson('t', 8, 2)], { extra: { relations: [relation] } });
    // Selected, b draws its relation window in full (the relation layer is over a selected clip).
    await page.getByTestId('clip-b').click({ position: { x: 20, y: 8 } });
    await expect(page.getByTestId('relation-window-r1')).toBeVisible();
    await page.keyboard.down('Shift');
    await expect(port(page, 'a')).toBeVisible();

    // The port is in the clip's lower half, below the block.
    const clipBox = (await page.getByTestId('clip-a').boundingBox())!;
    const block = (await blockLocator(page, 't').boundingBox())!;
    const portA = await center(page, 'clip-a-link');
    expect(portA.y).toBeGreaterThan(clipBox.y + clipBox.height / 2);
    expect(portA.y - 7).toBeGreaterThanOrEqual(block.y + block.height - 1);
    expect(portA.x).toBeGreaterThan(block.x);
    // Where the port used to be (top right of the clip), the block is what a press hits.
    const formerPort = { x: block.x + block.width - 18, y: block.y + block.height / 2 };
    expect(await hitAt(page, formerPort)).toMatch(/^action-block-t/);
    expect(await hitAt(page, portA)).toBe('clip-a-link');

    // b's port is over its relation window.
    const portB = await center(page, 'clip-b-link');
    const window = (await page.getByTestId('relation-window-r1').boundingBox())!;
    expect(portB.x).toBeGreaterThan(window.x);
    expect(portB.x).toBeLessThan(window.x + window.width);
    expect(portB.y).toBeGreaterThan(window.y);
    expect(portB.y).toBeLessThan(window.y + window.height);
    expect(await hitAt(page, portB)).toBe('clip-b-link');

    // And it still links: drag from b's port onto a.
    await page.mouse.move(portB.x, portB.y);
    await page.mouse.down();
    await page.keyboard.up('Shift');
    const to = await center(page, 'clip-a');
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('relation-editor')).toContainText('Relation: f2 → f1');
  });
});
