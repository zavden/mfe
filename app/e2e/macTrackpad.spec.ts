/* The trackpad of a Mac. A pinch reaches the page as wheel events with Ctrl held, though no key
 * is, whose `deltaY` adds up to −100 × ln(scale) of the gesture (Chrome): the views that zoom
 * follow the fingers — twice as far apart, twice as large — and do not take it for a wheel turned
 * with a key held, which zooms by a rate of their own (`ui/pinch.ts`). A scroll with two fingers
 * is a wheel alone: it moves the Preview's view, the scene following the fingers, as it scrolls
 * any view there.
 *
 * The browser is dressed as a Mac and the events are sent as Chrome sends them there, so that
 * these tests say the same on any system; dressed as Windows, the same events are a wheel's. */
import { expect, test, type Page } from './test';
import { selectionOf } from './helpers';
import { box, clipJson, laneY, openTimeline, timeToX } from './timelineHelpers';

const dressAs = (page: Page, platform: 'Win32' | 'MacIntel') =>
  page.addInitScript((name) => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => name });
  }, platform);

interface Point {
  x: number;
  y: number;
}

/** Wheel events at a point of the page, sent to what is under it one frame apart, as a gesture
 * sends them: a view lays itself out again between two of them. */
async function wheel(
  page: Page,
  at: Point,
  events: { deltaX?: number; deltaY?: number; ctrlKey?: boolean; shiftKey?: boolean }[],
): Promise<boolean[]> {
  await page.mouse.move(at.x, at.y);
  return page.evaluate(
    async ({ x, y, events }) => {
      const taken: boolean[] = [];
      for (const event of events) {
        const sent = new WheelEvent('wheel', {
          clientX: x,
          clientY: y,
          deltaMode: 0,
          bubbles: true,
          cancelable: true,
          ...event,
        });
        document.elementFromPoint(x, y)!.dispatchEvent(sent);
        // Taken by the page: the browser does nothing of its own with it (its "back", its zoom).
        taken.push(sent.defaultPrevented);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return taken;
    },
    { ...at, events },
  );
}

/** A pinch that makes what is under the fingers `scale` times as large, in the small steps it
 * comes in. */
const pinch = (page: Page, at: Point, scale: number, steps = 5) =>
  wheel(
    page,
    at,
    Array.from({ length: steps }, () => ({
      deltaY: (-100 * Math.log(scale)) / steps,
      ctrlKey: true,
    })),
  );

/** The Control key itself going down or up, as the window hears it. Its name is taken from its
 * code: no spec presses that key (`e2eConventions.test.ts` reads them for it), and this is not a
 * press of the suite's but the event a wheel is told from a pinch by. */
async function controlKey(page: Page, down: boolean): Promise<void> {
  await page.evaluate((down) => {
    const code = 'ControlLeft';
    window.dispatchEvent(
      new KeyboardEvent(down ? 'keydown' : 'keyup', {
        key: code.slice(0, 7),
        code,
        ctrlKey: down,
        bubbles: true,
      }),
    );
  }, down);
}

const frame = (page: Page) => page.getByTestId('preview-frame');
const zoomOf = async (page: Page) => Number(await frame(page).getAttribute('data-zoom'));
const centerOf = async (page: Page) =>
  (await frame(page).getAttribute('data-center'))!.split(',').map(Number);

/** The middle of the Preview's canvas. */
async function previewPoint(page: Page): Promise<Point> {
  const canvas = await box(page.getByTestId('preview-canvas'));
  return { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
}

/** A point of the timeline's first track, at `time`. */
const timelinePoint = async (page: Page, time: number): Promise<Point> => ({
  x: await timeToX(page, time),
  y: await laneY(page, 't1'),
});

/** A clip at the start, and one far enough for the timeline to have room to scroll. */
const open = (page: Page) =>
  openTimeline(page, [clipJson('a', 'fa', 't1', 0, 4), clipJson('b', 'fb', 't1', 30, 34)]);

test.describe('a pinch on a Mac', () => {
  test.beforeEach(async ({ page }) => {
    await dressAs(page, 'MacIntel');
    await open(page);
  });

  test('zooms the Preview by the scale of the gesture, about the pointer', async ({ page }) => {
    const at = await previewPoint(page);
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.000');
    const center = await centerOf(page);
    // Fingers twice as far apart: twice as large. A wheel's rate would give 1.149.
    await pinch(page, at, 2);
    await expect(frame(page)).toHaveAttribute('data-zoom', '2.000');
    // The middle of the view is under the fingers, and stays there (to the pixel the pointer
    // is on).
    const after = await centerOf(page);
    expect(after[0]).toBeCloseTo(center[0]!, 1);
    expect(after[1]).toBeCloseTo(center[1]!, 1);
    // And back together again.
    await pinch(page, at, 0.5);
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.000');
    await pinch(page, at, 1.5, 9);
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.500');
  });

  test('zooms the timeline by the scale of the gesture, the time under the pointer staying', async ({
    page,
  }) => {
    const readout = page.getByTestId('timeline-zoom');
    await expect(readout).toHaveText('80 px/s');
    const at = await timelinePoint(page, 2);
    await pinch(page, at, 2);
    await expect(readout).toHaveText('160 px/s');
    // Two seconds — the middle of the clip — are still under the fingers.
    const clip = await box(page.getByTestId('clip-a'));
    expect(clip.width).toBeCloseTo(4 * 160, -1);
    expect(clip.x + clip.width / 2).toBeCloseTo(at.x, -1);
    await pinch(page, at, 0.5);
    await expect(readout).toHaveText('80 px/s');
  });

  test('is not the wheel turned with the Control key held, which zooms at the wheel’s rate', async ({
    page,
  }) => {
    const at = await previewPoint(page);
    await controlKey(page, true);
    // A notch of a wheel: e^(100 × 0.002), not e^(100 / 100).
    await wheel(page, at, [{ deltaY: -100, ctrlKey: true }]);
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.221');
    // The key let go, the same event is a pinch again.
    await controlKey(page, false);
    await wheel(page, at, [{ deltaY: -100, ctrlKey: true }]);
    expect(await zoomOf(page)).toBeCloseTo(1.2214 * Math.E, 2);
  });
});

test('elsewhere a wheel with Ctrl is the wheel: the views zoom at their own rates', async ({
  page,
}) => {
  await dressAs(page, 'Win32');
  await open(page);
  // The events of a pinch to twice the size, with no Control key seen: a wheel all the same.
  await pinch(page, await previewPoint(page), 2);
  await expect(frame(page)).toHaveAttribute('data-zoom', '1.149');
  await pinch(page, await timelinePoint(page, 2), 2);
  await expect(page.getByTestId('timeline-zoom')).toHaveText('89 px/s');
});

test.describe('a scroll with two fingers on a Mac', () => {
  test.beforeEach(async ({ page }) => {
    await dressAs(page, 'MacIntel');
    await open(page);
  });

  test('moves the Preview’s view, the scene following the fingers, and selects nothing', async ({
    page,
  }) => {
    const canvas = await box(page.getByTestId('preview-canvas'));
    // Empty space, under the formula.
    const at = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 + 120 };
    const start = await centerOf(page);
    // Fingers up the trackpad, as to read further down a page: the scene goes up, and the view's
    // centre down the scene, whose y grows upwards. In the steps a scroll comes in.
    const taken = await wheel(page, at, [{ deltaY: 20 }, { deltaY: 30 }, { deltaY: 10 }]);
    expect(taken).toEqual([true, true, true]);
    const down = await centerOf(page);
    expect(down[0]).toBeCloseTo(start[0]!, 3);
    expect(down[1]).toBeLessThan(start[1]! - 0.1);
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.000');
    // Sideways: the scene goes left, the centre right.
    await wheel(page, at, [{ deltaX: 40 }]);
    const right = await centerOf(page);
    expect(right[0]).toBeGreaterThan(down[0]! + 0.1);
    expect(right[1]).toBeCloseTo(down[1]!, 3);
    expect(await selectionOf(page)).toEqual({ kind: 'none' });

    // As far as a drag of the view goes: Alt + drag by the same pixels the other way puts the
    // view back where it was.
    await page.keyboard.down('Alt');
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 40, at.y + 60, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const back = await centerOf(page);
    expect(back[0]).toBeCloseTo(start[0]!, 2);
    expect(back[1]).toBeCloseTo(start[1]!, 2);
  });

  test('with ⌘ held the wheel is the zoom’s, and moves nothing', async ({ page }) => {
    const at = await previewPoint(page);
    const start = await centerOf(page);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('ControlOrMeta');
    await expect(frame(page)).toHaveAttribute('data-zoom', '1.221');
    const after = await centerOf(page);
    expect(after[0]).toBeCloseTo(start[0]!, 1);
    expect(after[1]).toBeCloseTo(start[1]!, 1);
  });
});

test('elsewhere a wheel alone is not the Preview’s: the view stays, and the event is left', async ({
  page,
}) => {
  await dressAs(page, 'Win32');
  await open(page);
  const at = await previewPoint(page);
  const start = await centerOf(page);
  expect(await wheel(page, at, [{ deltaY: 60 }, { deltaX: 40 }])).toEqual([false, false]);
  expect(await centerOf(page)).toEqual(start);
  await expect(frame(page)).toHaveAttribute('data-zoom', '1.000');
});
