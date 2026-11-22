import { expect, test, type Locator, type Page } from './test';
import { canUndo, openWithProject, type MfeWindow } from './helpers';
import { blockLocator, blockOf, emphasisJson } from './blockHelpers';
import {
  FORMULA_MIME,
  box,
  clipJson,
  clipOf,
  dragTo,
  project,
  projectJson,
  timeToX,
  uiState,
  PX_PER_SECOND,
  type ClipJson,
} from './timelineHelpers';

/* The vertical timeline of Zen mode (D182): a column on the left where time runs down the screen
 * and the tracks stand side by side, the first one on the left. It is the timeline there always
 * was, turned: every gesture works as it did, along the other axis of the screen. The window is
 * the small one it was designed for, 1366×768. */

const SMALL = { width: 1366, height: 768 };
/** Track 1: `a` over [0, 3] with a block over [1, 1.5]. Track 2: `b` over [2, 5]. */
const A = clipJson('a', 'fa', 't1', 0, 3, { actions: [emphasisJson('e1', 1, 0.5)] });
const B = clipJson('b', 'fb', 't2', 2, 5);

async function openZen(page: Page, clips: ClipJson[] = [A, B]): Promise<void> {
  await page.setViewportSize(SMALL);
  await openWithProject(page, projectJson(clips));
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.usePreferences.getState().set({ zenMode: true }),
  );
  await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-orientation', 'vertical');
}

/** Where the time `t` is on the screen: down the ruler. */
async function timeToY(page: Page, t: number): Promise<number> {
  const ruler = await box(page.getByTestId('timeline-ruler'));
  return ruler.y + t * PX_PER_SECOND;
}

/** The middle of a track's column. */
async function laneX(page: Page, trackId: string): Promise<number> {
  const lane = await box(page.getByTestId(`track-lane-${trackId}`));
  return lane.x + lane.width / 2;
}

const clip = (page: Page, id: string) => page.getByTestId(`clip-${id}`);

test('the timeline is a column on the left: time runs down, the tracks side by side from the ruler', async ({
  page,
}) => {
  await openZen(page);
  const timeline = await box(page.getByTestId('panel-timeline'));
  const preview = await box(page.getByTestId('panel-preview'));
  expect(timeline.x).toBeLessThan(preview.x);
  expect(timeline.height).toBeGreaterThan(600);
  expect(timeline.width).toBeLessThan(340);
  // A clip of 3 s is 240 px tall, and as wide as its track.
  const a = await box(clip(page, 'a'));
  const b = await box(clip(page, 'b'));
  expect(a.height).toBeCloseTo(3 * PX_PER_SECOND, 0);
  expect(a.width).toBeLessThan(90);
  expect(a.y).toBeCloseTo(await timeToY(page, 0), 0);
  // The clip of the second track starts 2 s further down, in the column to the left: the
  // timeline is the one that lies, turned a quarter, and what is under the ruler there is beside
  // it here.
  expect(b.y).toBeCloseTo(await timeToY(page, 2), 0);
  expect(b.x + b.width).toBeLessThanOrEqual(a.x);
  // The headers are the top of the columns. The ruler is the right edge, beside the Preview,
  // with the first track against it and the last one furthest to the left; the scrollbar of time
  // is on the other side, the left edge.
  const header = await box(page.getByTestId('track-header-t1'));
  const ruler = await box(page.getByTestId('timeline-ruler'));
  const first = await box(page.getByTestId('track-lane-t1'));
  const last = await box(page.getByTestId('track-lane-t3'));
  const view = await box(page.getByTestId('timeline-scroll'));
  const bar = await box(page.getByTestId('timeline-bar-time'));
  expect(header.y + header.height).toBeLessThanOrEqual(a.y + 1);
  expect(Math.abs(header.x - a.x)).toBeLessThan(8);
  expect(ruler.width).toBeLessThan(40);
  // …but for the line between them.
  expect(Math.abs(ruler.x - (first.x + first.width))).toBeLessThan(2);
  expect(last.x + last.width).toBeLessThanOrEqual(first.x);
  expect(ruler.x + ruler.width).toBeCloseTo(view.x + view.width, 0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(last.x);
  expect(bar.x).toBeLessThan(view.x);
  expect(bar.height).toBeGreaterThan(300);
  // Nothing is pushed out of the window.
  expect(
    await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]),
  ).toEqual([SMALL.width, SMALL.height]);
});

/** The matrix an element is drawn with, all its ancestors counted, but for where it is:
 * `[1, 0, 0, 1]` drawn as it is written, `[0, 1, -1, 0]` turned a quarter clockwise. */
const drawnWith = (locator: Locator): Promise<number[]> =>
  locator.evaluate((el) => {
    let matrix = new DOMMatrix();
    for (let node: Element | null = el; node; node = node.parentElement) {
      const own = getComputedStyle(node).transform;
      if (own && own !== 'none') matrix = new DOMMatrix(own).multiply(matrix);
    }
    return [matrix.a, matrix.b, matrix.c, matrix.d].map((value) => Math.round(value) + 0);
  });

test('what is read stays upright: names and the ruler run across the screen', async ({ page }) => {
  await openZen(page);
  for (const locator of [
    page.getByTestId('track-name-t1'),
    clip(page, 'a').locator('.tl-clip-name'),
    page.getByTestId('timeline-ruler').locator('.tl-tick span').first(),
  ]) {
    // It is drawn as it is written, neither turned nor mirrored.
    expect(await drawnWith(locator)).toEqual([1, 0, 0, 1]);
  }
  // A name reads along the screen: wider than it is tall.
  const track = await box(page.getByTestId('track-name-t1'));
  expect(track.width).toBeGreaterThan(track.height);
  // The names are cut to their column, never drawn over the next one.
  const name = await box(clip(page, 'a').locator('.tl-clip-name'));
  const a = await box(clip(page, 'a'));
  expect(name.x).toBeGreaterThanOrEqual(a.x);
  expect(name.x + name.width).toBeLessThanOrEqual(a.x + a.width + 1);
});

test('the name of an animation runs down its block, under its icon, and reads downward', async ({
  page,
}) => {
  // A block of 1.5 s, long enough for its name; the clip's intro and outro last a second.
  await openZen(page, [
    clipJson('a', 'fa', 't1', 0, 4, { actions: [emphasisJson('e1', 1.5, 1.5)] }),
  ]);
  const block = blockLocator(page, 'e1');
  const icon = block.locator('svg.animation-icon');
  const name = block.locator('.tl-block-label');
  await expect(icon).toHaveAttribute('data-icon', 'indicate');
  await expect(name).toHaveText('Indicate');
  // The icon is drawn as it is; the name is turned a quarter clockwise, not mirrored: it reads
  // from the top of the block to its bottom.
  expect(await drawnWith(icon)).toEqual([1, 0, 0, 1]);
  expect(await drawnWith(name)).toEqual([0, 1, -1, 0]);
  const whole = await box(block);
  const drawn = await box(icon);
  const read = await box(name);
  expect(read.height).toBeGreaterThan(read.width);
  expect(drawn.y).toBeGreaterThanOrEqual(whole.y);
  expect(drawn.y + drawn.height).toBeLessThanOrEqual(read.y + 1);
  // Both are in the middle of the block's width, and the name ends inside the block.
  expect(drawn.x + drawn.width / 2).toBeCloseTo(whole.x + whole.width / 2, 0);
  expect(read.x + read.width / 2).toBeCloseTo(whole.x + whole.width / 2, 0);
  expect(read.y + read.height).toBeLessThanOrEqual(whole.y + whole.height);
  // The intro and the outro of the clip, in its right half: the same.
  for (const band of [
    clip(page, 'a').locator('.tl-seg-name:not(.is-outro)'),
    clip(page, 'a').locator('.tl-seg-name.is-outro'),
  ]) {
    expect(await drawnWith(band.locator('svg.animation-icon'))).toEqual([1, 0, 0, 1]);
    expect(await drawnWith(band.locator('.tl-seg-text'))).toEqual([0, 1, -1, 0]);
    const above = await box(band.locator('svg.animation-icon'));
    const below = await box(band.locator('.tl-seg-text'));
    expect(above.y + above.height).toBeLessThanOrEqual(below.y + 1);
    expect(below.height).toBeGreaterThan(below.width);
  }
  // A block too short for its name shows its icon alone.
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
      d.clips[0]!.actions[0]!.duration = 0.25;
    }),
  );
  await expect(block).toHaveClass(/is-icon-only/);
  await expect(name).toBeHidden();
  await expect(icon).toBeVisible();
});

test('a press on the ruler moves the playhead to the time under it, down the screen', async ({
  page,
}) => {
  await openZen(page);
  const ruler = await box(page.getByTestId('timeline-ruler'));
  await page.mouse.click(ruler.x + ruler.width / 2, await timeToY(page, 1.5));
  expect((await uiState(page)).time).toBeCloseTo(1.5, 1);
  // Dragged, it follows the pointer down.
  await dragTo(
    page,
    { x: ruler.x + ruler.width / 2, y: await timeToY(page, 1.5) },
    { x: ruler.x + ruler.width / 2, y: await timeToY(page, 3) },
  );
  expect((await uiState(page)).time).toBeCloseTo(3, 1);
  // The playhead's line lies across the tracks at that time.
  const line = await box(page.locator('.tl-playhead-line'));
  expect(line.width).toBeGreaterThan(line.height);
  expect(line.y).toBeCloseTo(await timeToY(page, 3), 0);
});

test('a clip dragged down moves later in time; dragged sideways, to the other track', async ({
  page,
}) => {
  await openZen(page, [A]);
  const a = await box(clip(page, 'a'));
  const from = { x: a.x + a.width / 2, y: a.y + 150 };
  await dragTo(page, from, { x: from.x, y: from.y + PX_PER_SECOND }, { shift: true });
  expect((await clipOf(page, 'a')).start).toBeCloseTo(1, 1);
  expect((await clipOf(page, 'a')).trackId).toBe('t1');
  const moved = await box(clip(page, 'a'));
  await dragTo(
    page,
    { x: moved.x + moved.width / 2, y: moved.y + 150 },
    { x: await laneX(page, 't2'), y: moved.y + 150 },
    { shift: true },
  );
  expect((await clipOf(page, 'a')).trackId).toBe('t2');
  expect((await clipOf(page, 'a')).start).toBeCloseTo(1, 1);
});

test('a press that travels less than the drag threshold is a click: the clip stays where it was', async ({
  page,
}) => {
  await openZen(page, [A]);
  const a = await box(clip(page, 'a'));
  const at = { x: Math.round(a.x + a.width / 2), y: Math.round(a.y + 150) };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  // Shift after the button: no snapping, so a pixel of travel would be 1/80 s of the clip's.
  await page.keyboard.down('Shift');
  await page.mouse.move(at.x, at.y + 1);
  await page.mouse.move(at.x + 1, at.y + 2);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await clipOf(page, 'a')).start).toBe(0);
  expect(await canUndo(page)).toBe(false);
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });

  // The same press, three pixels down the screen: a drag, of 3/80 s.
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(at.x, at.y + 3);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await clipOf(page, 'a')).start).toBeCloseTo(3 / PX_PER_SECOND, 4);
  expect(await canUndo(page)).toBe(true);
});

test('a press on empty lanes that travels a pixel draws no rectangle, and one on the ruler with Shift no region', async ({
  page,
}) => {
  await openZen(page, [A]);
  const x = await laneX(page, 't2');
  const y = await timeToY(page, 4);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 1);
  await page.mouse.move(x + 1, y + 2);
  await expect(page.getByTestId('timeline-marquee')).toHaveCount(0);
  await page.mouse.move(x + 2, y + 3);
  await expect(page.getByTestId('timeline-marquee')).toHaveCount(1);
  await page.mouse.up();

  const ruler = await box(page.getByTestId('timeline-ruler'));
  const rx = Math.round(ruler.x + ruler.width / 2);
  const ry = Math.round(await timeToY(page, 1));
  await page.keyboard.down('Shift');
  await page.mouse.move(rx, ry);
  await page.mouse.down();
  await page.mouse.move(rx, ry + 2);
  await expect(page.getByTestId('timeline-region')).toHaveCount(0);
  await page.mouse.move(rx, ry + PX_PER_SECOND);
  await expect(page.getByTestId('timeline-region')).toHaveCount(1);
  await page.mouse.up();
  await page.keyboard.up('Shift');
});

test('the ends of a clip are its top and its bottom: a trim drags them along time', async ({
  page,
}) => {
  await openZen(page, [A]);
  const end = await box(page.getByTestId('clip-a-trim-end'));
  // The grab zone of the end lies across the clip, at its bottom.
  expect(end.width).toBeGreaterThan(end.height);
  await dragTo(
    page,
    { x: end.x + end.width / 2, y: end.y + end.height / 2 },
    { x: end.x + end.width / 2, y: end.y + end.height / 2 + PX_PER_SECOND },
    { shift: true },
  );
  expect((await clipOf(page, 'a')).end).toBeCloseTo(4, 1);
  const start = await box(page.getByTestId('clip-a-trim-start'));
  await dragTo(
    page,
    { x: start.x + start.width / 2, y: start.y + start.height / 2 },
    { x: start.x + start.width / 2, y: start.y + start.height / 2 + PX_PER_SECOND / 2 },
    { shift: true },
  );
  expect((await clipOf(page, 'a')).start).toBeCloseTo(0.5, 1);
});

test('a block dragged down starts later in its clip', async ({ page }) => {
  await openZen(page, [A]);
  const block = await box(blockLocator(page, 'e1'));
  expect(block.height).toBeCloseTo(0.5 * PX_PER_SECOND, 0);
  const from = { x: block.x + block.width / 2, y: block.y + block.height / 2 };
  await dragTo(page, from, { x: from.x, y: from.y + PX_PER_SECOND / 2 }, { shift: true });
  expect((await blockOf(page, 'a', 'e1')).start).toBeCloseTo(1.5, 1);
});

test('Shift dragged down the ruler draws the region', async ({ page }) => {
  await openZen(page);
  const ruler = await box(page.getByTestId('timeline-ruler'));
  const x = ruler.x + ruler.width / 2;
  await page.keyboard.down('Shift');
  await page.mouse.move(x, await timeToY(page, 1));
  await page.mouse.down();
  await page.mouse.move(x, await timeToY(page, 2), { steps: 4 });
  await page.mouse.move(x, await timeToY(page, 3), { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const mark = page.getByTestId('timeline-region');
  await expect(mark).toHaveAttribute('data-start', '1');
  await expect(mark).toHaveAttribute('data-end', '3');
  // Its band lies over the tracks between those times.
  const band = await box(page.getByTestId('timeline-region-band'));
  expect(band.y).toBeCloseTo(await timeToY(page, 1), 0);
  expect(band.height).toBeCloseTo(2 * PX_PER_SECOND, 0);
});

test('the wheel goes along time; with Ctrl/⌘ it zooms about the time under the pointer', async ({
  page,
}) => {
  // A long clip, so that there is time to scroll to.
  await openZen(page, [clipJson('a', 'fa', 't1', 0, 30)]);
  const scroll = page.getByTestId('timeline-scroll');
  const view = await box(scroll);
  await page.mouse.move(view.x + view.width / 2, view.y + 300);
  const before = await scroll.evaluate((el) => [el.scrollLeft, el.scrollTop]);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBe(before[0]! + 240);
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(before[1]);
  // The clip went up the screen by that much.
  await page.mouse.wheel(0, -240);
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBe(before[0]);
  // Ctrl/⌘ + wheel: the time under the pointer stays under it.
  const at = await timeToY(page, 2);
  await page.mouse.move(view.x + view.width / 2, at);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('ControlOrMeta');
  const zoomOf = async () =>
    parseFloat((await page.getByTestId('timeline-zoom').textContent()) ?? '');
  await expect.poll(zoomOf).toBeGreaterThan(PX_PER_SECOND);
  const zoomed = await zoomOf();
  const ruler = await box(page.getByTestId('timeline-ruler'));
  expect(ruler.y + 2 * zoomed).toBeCloseTo(at, -1);
});

test('the scrollbar of time, down the left edge, drags the view; the tracks get one when they do not fit', async ({
  page,
}) => {
  await openZen(page, [clipJson('a', 'fa', 't1', 0, 30)]);
  const scroll = page.getByTestId('timeline-scroll');
  const thumb = page.getByTestId('timeline-bar-time-thumb');
  const at = await box(thumb);
  const bar = await box(page.getByTestId('timeline-bar-time'));
  // The thumb is as long as the part of the time in view, at the top while the view is.
  expect(at.y).toBeCloseTo(bar.y, 0);
  expect(at.height).toBeLessThan(bar.height / 2);
  // Dragged down, the view goes later; to the bottom, to the end.
  await dragTo(
    page,
    { x: at.x + at.width / 2, y: at.y + at.height / 2 },
    { x: at.x + at.width / 2, y: at.y + at.height / 2 + 100 },
  );
  const moved = await scroll.evaluate((el) => el.scrollLeft);
  expect(moved).toBeGreaterThan(100);
  expect((await box(thumb)).y).toBeCloseTo(at.y + 100, 0);
  const now = await box(thumb);
  await dragTo(
    page,
    { x: now.x + now.width / 2, y: now.y + now.height / 2 },
    { x: now.x + now.width / 2, y: bar.y + bar.height + 200 },
  );
  expect(await scroll.evaluate((el) => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)).toBe(
    true,
  );
  // A press on the bar over the thumb: a view's length back.
  const end = await scroll.evaluate((el) => el.scrollLeft);
  await page.mouse.click(bar.x + bar.width / 2, bar.y + 4);
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeLessThan(end);
  // The three tracks fit: no bar for them. With more than fit, one lies along the bottom.
  await expect(page.getByTestId('timeline-bar-tracks')).toBeHidden();
  for (let i = 0; i < 3; i++) await page.getByTestId('timeline-add-track').click();
  const tracks = page.getByTestId('timeline-bar-tracks-thumb');
  await expect(tracks).toBeVisible();
  const lying = await box(tracks);
  const well = await box(scroll);
  expect(lying.y).toBeGreaterThanOrEqual(well.y + well.height - 1);
  // The first track is on the right, beside the ruler: the thumb starts at that end of its bar,
  // and dragged to the left the view goes on to the tracks after.
  const lyingBar = await box(page.getByTestId('timeline-bar-tracks'));
  expect(lying.x + lying.width).toBeCloseTo(lyingBar.x + lyingBar.width, 0);
  await dragTo(
    page,
    { x: lying.x + lying.width / 2, y: lying.y + lying.height / 2 },
    { x: lying.x + lying.width / 2 - 60, y: lying.y + lying.height / 2 },
  );
  const across = await scroll.evaluate((el) => el.scrollTop);
  expect(across).toBeGreaterThan(30);
  expect((await box(tracks)).x).toBeCloseTo(lying.x - 60, 0);
  // A press on the bar at its right end, past the thumb: a view's length back.
  await page.mouse.click(lyingBar.x + lyingBar.width - 3, lyingBar.y + lyingBar.height / 2);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeLessThan(across);
});

test('the middle button drags the view: up the screen is later in time', async ({ page }) => {
  await openZen(page, [clipJson('a', 'fa', 't1', 0, 30)]);
  const scroll = page.getByTestId('timeline-scroll');
  const view = await box(scroll);
  const from = { x: view.x + view.width / 2, y: view.y + 400 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(from.x, from.y - 150, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBe(150);
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(0);
});

test('T held: the view follows the mouse along time, wherever the pointer is; released, it stays', async ({
  page,
}) => {
  await openZen(page, [clipJson('a', 'fa', 't1', 0, 30)]);
  const scroll = page.getByTestId('timeline-scroll');
  const view = page.getByTestId('timeline-view');
  const left = () => scroll.evaluate((el) => el.scrollLeft);
  // The pointer over the Preview, far from the timeline.
  const preview = await box(page.getByTestId('preview-frame'));
  const from = { x: preview.x + 300, y: preview.y + 100 };
  await page.mouse.move(from.x, from.y);
  await page.keyboard.down('t');
  await expect(view).toHaveAttribute('data-flying', 'view');
  await page.mouse.move(from.x, from.y + 5);
  await page.mouse.move(from.x, from.y + 105, { steps: 5 });
  // As a scrollbar as long as the view would: more of the time than the mouse moved.
  const moved = await left();
  expect(moved).toBeGreaterThan(100);
  // The timeline is vertical: sideways is not along time.
  await page.mouse.move(from.x + 200, from.y + 105, { steps: 3 });
  expect(await left()).toBe(moved);
  await page.mouse.move(from.x + 200, from.y + 55, { steps: 3 });
  expect(await left()).toBeLessThan(moved);
  const kept = await left();
  // Released, the view stays, and the mouse moves nothing.
  await page.keyboard.up('t');
  await expect(view).not.toHaveAttribute('data-flying');
  await page.mouse.move(from.x, from.y, { steps: 3 });
  expect(await left()).toBe(kept);
  // In a field T is a letter: a track's name takes it, and nothing flies.
  await page.getByTestId('track-name-t1').dblclick();
  const name = page.getByTestId('track-header-t1').locator('.tl-name-input');
  await name.fill('');
  await page.keyboard.down('t');
  await expect(name).toHaveValue('t');
  await expect(view).not.toHaveAttribute('data-flying');
  await page.keyboard.up('t');
  await page.keyboard.press('Escape');
});

test('T held in the usual layout: the mouse moved sideways moves the view', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await openWithProject(page, projectJson([clipJson('a', 'fa', 't1', 0, 60)]));
  const scroll = page.getByTestId('timeline-scroll');
  const left = () => scroll.evaluate((el) => el.scrollLeft);
  const preview = await box(page.getByTestId('preview-frame'));
  const from = { x: preview.x + 100, y: preview.y + 100 };
  await page.mouse.move(from.x, from.y);
  await page.keyboard.down('t');
  await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-flying', 'view');
  await page.mouse.move(from.x + 5, from.y);
  await page.mouse.move(from.x + 105, from.y, { steps: 5 });
  const moved = await left();
  expect(moved).toBeGreaterThan(100);
  // Up and down is not along time here.
  await page.mouse.move(from.x + 105, from.y + 150, { steps: 3 });
  expect(await left()).toBe(moved);
  await page.keyboard.up('t');
  await page.mouse.move(from.x, from.y, { steps: 3 });
  expect(await left()).toBe(moved);
});

test('Shift+T held: the playhead follows the pointer down the screen, wherever it is; released, it stays', async ({
  page,
}) => {
  await openZen(page, [clipJson('a', 'fa', 't1', 0, 8)]);
  const view = page.getByTestId('timeline-view');
  const time = async () => (await uiState(page)).time;
  // The pointer over the Preview, far from the timeline, level with 1.5 s on the ruler.
  const preview = await box(page.getByTestId('preview-frame'));
  const x = preview.x + 300;
  await page.mouse.move(x, await timeToY(page, 1.5));
  expect(await time()).toBe(0);
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyT');
  // The playhead goes there at once, before the pointer moves, and on with it.
  await expect(view).toHaveAttribute('data-flying', 'playhead');
  await expect.poll(time).toBeCloseTo(1.5, 1);
  await page.mouse.move(x, await timeToY(page, 3), { steps: 4 });
  await expect.poll(time).toBeCloseTo(3, 1);
  // The timeline is vertical: sideways is not along time.
  await page.mouse.move(x + 200, await timeToY(page, 3), { steps: 3 });
  await expect.poll(time).toBeCloseTo(3, 1);
  // Above the start of the time it stops at 0.
  await page.mouse.move(x, (await timeToY(page, 0)) - 40, { steps: 3 });
  await expect.poll(time).toBe(0);
  await page.mouse.move(x, await timeToY(page, 2), { steps: 3 });
  await expect.poll(time).toBeCloseTo(2, 1);
  // Shift let go with T still held: the mouse moves the view now, and the playhead stays.
  await page.keyboard.up('Shift');
  await expect(view).toHaveAttribute('data-flying', 'view');
  await page.mouse.move(x, (await timeToY(page, 2)) + 60, { steps: 3 });
  expect(await time()).toBeCloseTo(2, 1);
  // Released, the mouse moves nothing.
  await page.keyboard.up('KeyT');
  await expect(view).not.toHaveAttribute('data-flying');
  await page.keyboard.down('Shift');
  await page.mouse.move(x, await timeToY(page, 1), { steps: 3 });
  await page.keyboard.up('Shift');
  expect(await time()).toBeCloseTo(2, 1);
  // In a field Shift+T is a capital letter.
  await page.getByTestId('track-name-t1').dblclick();
  const name = page.getByTestId('track-header-t1').locator('.tl-name-input');
  await name.fill('');
  await page.keyboard.press('Shift+KeyT');
  await expect(name).toHaveValue('T');
  await expect(view).not.toHaveAttribute('data-flying');
  await page.keyboard.press('Escape');
});

test('Shift+T held in the usual layout: the playhead follows the pointer sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await openWithProject(page, projectJson([clipJson('a', 'fa', 't1', 0, 8)]));
  const time = async () => (await uiState(page)).time;
  // The pointer over the Preview, above 2 s on the ruler.
  const preview = await box(page.getByTestId('preview-frame'));
  const y = preview.y + 100;
  await page.mouse.move(await timeToX(page, 2), y);
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyT');
  await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-flying', 'playhead');
  await expect.poll(time).toBeCloseTo(2, 1);
  await page.mouse.move(await timeToX(page, 4.5), y, { steps: 4 });
  await expect.poll(time).toBeCloseTo(4.5, 1);
  // Up and down is not along time here.
  await page.mouse.move(await timeToX(page, 4.5), y + 150, { steps: 3 });
  await expect.poll(time).toBeCloseTo(4.5, 1);
  await page.keyboard.up('KeyT');
  await page.keyboard.up('Shift');
  await page.mouse.move(await timeToX(page, 1), y, { steps: 3 });
  expect(await time()).toBeCloseTo(4.5, 1);
});

test('the arrows follow the screen: down and up along time, left and right across the tracks', async ({
  page,
}) => {
  await openZen(page, [A, clipJson('c', 'fb', 't1', 4, 6), B]);
  await clip(page, 'a').click({ position: { x: 40, y: 100 } });
  await clip(page, 'a').focus();
  // Down: the next clip of the track, later in time.
  await page.keyboard.press('ArrowDown');
  await expect(clip(page, 'c')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(clip(page, 'a')).toBeFocused();
  // Left: the track to the left, the one after — the first track is on the right, by the ruler.
  await page.keyboard.press('ArrowLeft');
  await expect(clip(page, 'b')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(clip(page, 'a')).toBeFocused();
  // Alt + down nudges the clip a frame later; Alt + left takes it to the track on its left.
  const fps = (await project(page)).meta.fps as number;
  await page.keyboard.press('Alt+ArrowDown');
  expect((await clipOf(page, 'a')).start).toBeCloseTo(1 / fps, 4);
  await page.keyboard.press('Alt+ArrowLeft');
  expect((await clipOf(page, 'a')).trackId).toBe('t2');
  await page.keyboard.press('Alt+ArrowRight');
  expect((await clipOf(page, 'a')).trackId).toBe('t1');
});

test('the arrows of a track point where it goes: towards the front is to the right', async ({
  page,
}) => {
  await openZen(page);
  const up = page.getByTestId('track-up-t2');
  const down = page.getByTestId('track-down-t2');
  // The one that points left is on the left, and each is drawn pointing its way: «up», towards
  // the front and the ruler, a quarter clockwise of how it is written; «down» the other way.
  expect((await box(down)).x).toBeLessThan((await box(up)).x);
  expect(await drawnWith(up.locator('svg.icon'))).toEqual([0, 1, -1, 0]);
  expect(await drawnWith(down.locator('svg.icon'))).toEqual([0, 1, -1, 0]);
  const before = await laneX(page, 't2');
  expect(before).toBeLessThan(await laneX(page, 't1'));
  await up.click();
  // Track 2 is the first one now: the one beside the ruler.
  expect((await project(page)).tracks.map((t) => t.id).slice(0, 2)).toEqual(['t2', 't1']);
  await expect.poll(() => laneX(page, 't2')).toBeGreaterThan(before);
  expect(await laneX(page, 't2')).toBeGreaterThan(await laneX(page, 't1'));
  // A sideways turn of the wheel to the right shows the tracks on that side: towards the ruler.
  for (let i = 0; i < 3; i++) await page.getByTestId('timeline-add-track').click();
  const scroll = page.getByTestId('timeline-scroll');
  const lanes = await box(scroll);
  await page.mouse.move(lanes.x + lanes.width / 2, lanes.y + lanes.height / 2);
  await page.mouse.wheel(-120, 0);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(60);
  await page.mouse.wheel(120, 0);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0);
});

test('a formula dropped on a column makes a clip at the time under the pointer', async ({
  page,
}) => {
  await openZen(page, [A]);
  const x = await laneX(page, 't2');
  const y = await timeToY(page, 1.5);
  const accepted = await page.evaluate(
    ({ x, y, mime }) => {
      const lane = document.querySelector('[data-testid="track-lane-t2"]')!;
      const transfer = new DataTransfer();
      transfer.setData(mime, 'fb');
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer: transfer,
      };
      lane.dispatchEvent(new DragEvent('dragenter', init));
      lane.dispatchEvent(new DragEvent('dragover', init));
      return !lane.dispatchEvent(new DragEvent('drop', init));
    },
    { x, y, mime: FORMULA_MIME },
  );
  expect(accepted).toBe(true);
  const made = (await project(page)).clips.find((c) => c.formulaId === 'fb')!;
  expect(made.trackId).toBe('t2');
  expect(made.start).toBeCloseTo(1.5, 1);
});

test('a right-click on a clip opens its menu at the pointer; the marquee selects by time and track', async ({
  page,
}) => {
  await openZen(page);
  const a = await box(clip(page, 'a'));
  const at = { x: a.x + a.width / 2, y: a.y + 120 };
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const menu = await box(page.getByTestId('add-animation-menu'));
  // Beside the pointer, and moved up only as far as it must to fit in the window.
  expect(Math.abs(menu.x - at.x)).toBeLessThan(12);
  expect(menu.y).toBeLessThanOrEqual(at.y + 12);
  expect(menu.y + menu.height).toBeLessThanOrEqual(SMALL.height);
  await page.keyboard.press('Escape');
  // A marquee from the empty third column across both clips, between 2.2 s and 2.8 s.
  const from = { x: await laneX(page, 't3'), y: await timeToY(page, 2.2) };
  await dragTo(page, from, { x: a.x + a.width / 2, y: await timeToY(page, 2.8) });
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a', 'b'] });
});

test('the timeline keeps its own track sizes each way, wider when vertical', async ({ page }) => {
  await openZen(page, [A]);
  const column = (await box(page.getByTestId('track-row-t1'))).width;
  await expect(page.getByTestId('timeline-row-zoom-reset')).toHaveText(/175\s*%/);
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.usePreferences.getState().set({ zenMode: false }),
  );
  await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-orientation', 'horizontal');
  const row = (await box(page.getByTestId('track-row-t1'))).height;
  expect(column).toBeGreaterThan(row * 1.5);
  await expect(page.getByTestId('timeline-row-zoom-reset')).toHaveText(/100\s*%/);
});
