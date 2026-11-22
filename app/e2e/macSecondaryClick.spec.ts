/* On a Mac a Ctrl+click is the secondary click: the browser sends the press of the main button
 * with Ctrl held, then the menu's event, and no click. The app takes ⌘ where it takes Ctrl
 * elsewhere, so such a press is no press at all (`isMainClick`, ui/pointer.ts): what is under it
 * gets its menu, as from the secondary button, and nothing is selected, moved or written by the
 * press before it.
 *
 * A spec does not press Control (a Mac's ⌘ is ControlOrMeta there): the browser is dressed as a
 * Mac and the events of a Ctrl+click are sent as Chrome sends them on one — read there from a real
 * one —, so that these tests say the same on any system. Each place is then compared with the
 * click of the secondary button at the same point. */
import { expect, test, type Page } from './test';
import { cameraProject } from './cameraHelpers';
import { type MfeWindow, type PairRefJson } from './helpers';
import { openTwoApart, scenePoint } from './previewHelpers';
import { openRelationScene, plain } from './relationsHelpers';
import { marksOf, type SlideMarkJson } from './slidesHelpers';
import { box, clipJson, openTimeline, project, uiState } from './timelineHelpers';

async function asMac(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
  });
}

/** A Ctrl+click at a point of the page, as Chrome on a Mac sends it. */
async function ctrlClick(page: Page, at: { x: number; y: number }): Promise<void> {
  // The real pointer out of the way: it would hover the menu that opens.
  await page.mouse.move(0, 0);
  await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y)!;
    const keys = { clientX: x, clientY: y, ctrlKey: true, bubbles: true, cancelable: true };
    const pointer = { ...keys, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
    target.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
    target.dispatchEvent(new MouseEvent('mousedown', { ...keys, button: 0, buttons: 1 }));
    target.dispatchEvent(new MouseEvent('contextmenu', { ...keys, button: 0, buttons: 1 }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...keys, button: 0, buttons: 0 }));
  }, at);
}

const rightClick = (page: Page, at: { x: number; y: number }) =>
  page.mouse.click(at.x, at.y, { button: 'right' });

/** The menus that are open, by test id. */
const menus = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="menu"]')].map((menu) => menu.getAttribute('data-testid')),
  );

/** What a press may have changed: the selection, the playhead, the project, and the open menu. */
async function state(page: Page) {
  const ui = await uiState(page);
  return {
    selection: ui.selection,
    time: ui.time,
    project: await project(page),
    menus: await menus(page),
  };
}

const select = (page: Page, ids: string[]) =>
  page.evaluate((ids) => {
    (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids });
  }, ids);

/** The state after `prepare` and a click of the secondary button at `at()`, then after `prepare`
 * and a Ctrl+click there: the two a Mac must not tell apart. */
async function bothClicks(
  page: Page,
  prepare: () => Promise<void>,
  at: () => Promise<{ x: number; y: number }>,
) {
  await prepare();
  await rightClick(page, await at());
  const right = await state(page);
  await page.keyboard.press('Escape');
  await prepare();
  await ctrlClick(page, await at());
  const ctrl = await state(page);
  await page.keyboard.press('Escape');
  return { right, ctrl };
}

const centre = async (page: Page, testId: string) => {
  const b = await box(page.getByTestId(testId));
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test.describe('on a Mac a Ctrl+click is the secondary click', () => {
  test.beforeEach(({ page }) => asMac(page));

  test('on a clip: the menu of the selection, which the press leaves as it was', async ({
    page,
  }) => {
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 2), clipJson('b', 'fb', 't1', 3, 5)]);
    // One of two selected clips: the menu of both.
    let { right, ctrl } = await bothClicks(
      page,
      () => select(page, ['a', 'b']),
      () => centre(page, 'clip-b'),
    );
    expect(right.selection).toEqual({ kind: 'clips', ids: ['a', 'b'] });
    expect(right.menus).toEqual(['clips-menu']);
    expect(ctrl).toEqual(right);
    // A clip beside the selection, and the only selected clip.
    for (const ids of [['a'], ['b']]) {
      ({ right, ctrl } = await bothClicks(
        page,
        () => select(page, ids),
        () => centre(page, 'clip-b'),
      ));
      expect(right.menus).toEqual(['add-animation-menu']);
      expect(ctrl, `with ${ids.join()} selected`).toEqual(right);
    }
    // An empty lane: no rectangle is begun, and the selection stays.
    ({ right, ctrl } = await bothClicks(
      page,
      () => select(page, ['a', 'b']),
      async () => {
        const lane = await box(page.getByTestId('track-lane-t3'));
        return { x: lane.x + 600, y: lane.y + lane.height / 2 };
      },
    ));
    expect(ctrl).toEqual(right);
    expect(ctrl.selection).toEqual({ kind: 'clips', ids: ['a', 'b'] });
  });

  test('on the ruler: the playhead stays; in the Slides mode the ruler’s menu opens', async ({
    page,
  }) => {
    const marks: SlideMarkJson[] = [{ id: 'p1', time: 1.5, kind: 'pause' }];
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 6)]);
    const foot = async () => {
      const ruler = await box(page.getByTestId('timeline-ruler'));
      return { x: ruler.x + 337, y: ruler.y + ruler.height - 5 };
    };
    const rewind = () =>
      page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(0));
    // The mode off: the ruler has no menu, and the playhead is where it was.
    let { right, ctrl } = await bothClicks(page, rewind, foot);
    expect(right.time).toBe(0);
    expect(right.menus).toEqual([]);
    expect(ctrl).toEqual(right);
    // The pointer that moves afterwards scrubs nothing: no press is held.
    await page.mouse.move((await foot()).x + 150, (await foot()).y);
    expect((await uiState(page)).time).toBe(0);

    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 6)], { slides: { marks } });
    expect(await marksOf(page)).toEqual(marks);
    ({ right, ctrl } = await bothClicks(page, rewind, foot));
    expect(right.time).toBe(0);
    expect(right.menus).toEqual(['slide-ruler-menu']);
    expect(ctrl).toEqual(right);
    // On a mark, the mark's own menu: the press under it is not the ruler's either.
    ({ right, ctrl } = await bothClicks(page, rewind, () => centre(page, 'slide-mark-p1')));
    expect(right.time).toBe(0);
    expect(right.menus).toEqual(['slide-mark-menu']);
    expect(ctrl).toEqual(right);
  });

  test('on an object of the Preview: its menu, the selection as the secondary button leaves it', async ({
    page,
  }) => {
    await openTwoApart(page);
    const beta = () => scenePoint(page, [3, 0]);
    // One of two selected objects: both stay selected.
    let { right, ctrl } = await bothClicks(page, () => select(page, ['ca', 'cb']), beta);
    expect(right.selection).toEqual({ kind: 'clips', ids: ['ca', 'cb'] });
    expect(right.menus).toEqual(['preview-menu']);
    expect(ctrl).toEqual(right);
    // An object beside the selection: it alone, not added to it.
    ({ right, ctrl } = await bothClicks(page, () => select(page, ['ca']), beta));
    expect(right.selection).toEqual({ kind: 'clips', ids: ['cb'] });
    expect(ctrl).toEqual(right);
    // The empty scene: its menu, and no rectangle begun.
    ({ right, ctrl } = await bothClicks(
      page,
      () => select(page, ['ca', 'cb']),
      () => scenePoint(page, [0, 3]),
    ));
    expect(right.menus).toEqual(['preview-space-menu']);
    expect(ctrl).toEqual(right);
  });

  test('on a rectangle of the camera: the camera’s menu, not the scene’s', async ({ page }) => {
    const camera = cameraProject({
      targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
    });
    await openTimeline(page, [], { camera });
    const frame = page.getByTestId('preview-frame');
    const edge = async () => {
      const rects = JSON.parse((await frame.getAttribute('data-camera-scene'))!) as {
        targets: Record<string, [number, number, number, number]>;
      };
      const origin = await box(frame);
      const [left, top, width, height] = rects.targets.k1!;
      return { x: origin.x + left + width, y: origin.y + top + height * 0.6 };
    };
    const { right, ctrl } = await bothClicks(
      page,
      () =>
        page.evaluate(() => {
          (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'none' });
        }),
      edge,
    );
    expect(right.menus).toEqual(['camera-menu']);
    expect(right.selection).toEqual({ kind: 'targetCamera', id: 'k1' });
    expect(ctrl).toEqual(right);
  });

  test('in Edit path: no anchor is put on the curve', async ({ page }) => {
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
    const ref: PairRefJson = { origin: { kind: 'relation', relationId: 'r1' }, index: 0 };
    await openRelationScene(page, [a, b], { relations: [relation] });
    const frame = page.getByTestId('preview-frame');
    const open = async () => {
      await page.evaluate(
        (ref) => (window as MfeWindow).__mfe!.usePathEdit.getState().open(ref),
        ref,
      );
      await expect(frame).toHaveAttribute('data-path-edit', 'relation:r1:0');
    };
    const nodes = async () =>
      JSON.parse((await frame.getAttribute('data-path-nodes')) ?? '[]') as {
        at: [number, number];
      }[];
    await open();
    expect(await nodes()).toHaveLength(2);
    // The middle of the chord: a click of the main button there puts an anchor.
    const middle = async () => {
      const [first, last] = await nodes();
      const canvas = await box(page.getByTestId('preview-canvas'));
      return {
        x: canvas.x + (first!.at[0] + last!.at[0]) / 2,
        y: canvas.y + (first!.at[1] + last!.at[1]) / 2,
      };
    };
    const at = await middle();
    await ctrlClick(page, at);
    expect(await nodes()).toHaveLength(2);
    await page.keyboard.press('Escape');
    // The same point with the main button, to see that the curve was under it.
    await open();
    await page.mouse.click(at.x, at.y);
    expect(await nodes()).toHaveLength(3);
  });
});
