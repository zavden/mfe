import { expect, test, type Page } from './test';
import { holdToConfirm, readExample, type MfeWindow } from './helpers';
import { clickScene } from './previewHelpers';
import {
  box,
  canUndo,
  clipJson,
  clipOf,
  dragTo,
  dropFormula,
  laneY,
  moveClip,
  openTimeline,
  project,
  PX_PER_SECOND,
  setTime,
  timeToX,
  uiState,
  undo,
} from './timelineHelpers';

/* A on track 1 [1, 4.3], B on track 2 [6, 9], C on track 1 [6, 8]. */
const A = clipJson('a', 'fa', 't1', 1, 4.3);
const B = clipJson('b', 'fb', 't2', 6, 9);
const C = clipJson('c', 'fb', 't1', 6, 8);

test.describe('timeline: layout and playhead', () => {
  test('shows tracks, clips with their segments, the ruler and the playhead', async ({ page }) => {
    const tween = {
      id: 'tw',
      kind: 'tween' as const,
      start: 1.5,
      duration: 1,
      easing: 'smooth',
      to: { rotation: 90 },
    };
    await openTimeline(page, [{ ...A, actions: [tween] }, B]);
    await expect(page.getByTestId('track-name-t1')).toHaveText('Track 1');
    await expect(page.getByTestId('clip-a')).toBeVisible();
    await expect(page.getByTestId('clip-a')).toContainText('alpha');
    await expect(page.getByTestId('clip-a-intro')).toBeVisible();
    await expect(page.getByTestId('clip-a-outro')).toBeVisible();
    await expect(page.getByTestId('action-block-tw')).toBeVisible();
    // The block spans [1, 4.3] s at 80 px/s.
    const clip = await box(page.getByTestId('clip-a'));
    expect(clip.width).toBeCloseTo(3.3 * PX_PER_SECOND, 0);
    expect(clip.x).toBeCloseTo(await timeToX(page, 1), 0);
    // Intro is 1 s wide.
    expect((await box(page.getByTestId('clip-a-intro'))).width).toBeCloseTo(PX_PER_SECOND, 0);
    await expect(page.getByTestId('timeline-ruler')).toContainText('2s');
    expect((await uiState(page)).time).toBe(0);
  });

  test('labels only the stretch of the ruler in view: an hour at the closest zoom', async ({
    page,
  }) => {
    await openTimeline(page, [A]);
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.meta.duration = 3600;
      });
    });
    for (let i = 0; i < 40; i++) await page.getByTestId('timeline-zoom-in').click();
    await expect(page.getByTestId('timeline-zoom')).toHaveText('2400 px/s');
    await expect(page.getByTestId('timeline-dt')).toHaveText('dt 0.01 s');
    const ticks = page.locator('.tl-tick');
    const scroll = page.getByTestId('timeline-scroll');
    // Labels every 0.05 s over an hour would be 72 000 nodes; only a few viewports' worth exist,
    // those around the view (the zoom kept the centre of the view in place).
    expect(await ticks.count()).toBeLessThan(200);
    await scroll.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await expect(page.getByTestId('timeline-ruler')).toContainText('0.05s');
    // Scrolled far into the project, the labels there are the ones that exist.
    await scroll.evaluate((el) => {
      el.scrollLeft = 1_000_000;
    });
    await expect(page.getByTestId('timeline-ruler')).toContainText('6:56.');
    expect(await ticks.count()).toBeLessThan(200);
    const shown = await scroll.evaluate((el) => {
      const left = el.scrollLeft;
      const right = left + el.clientWidth;
      return [...el.querySelectorAll('.tl-tick')].filter((tick) => {
        const x = parseFloat((tick as HTMLElement).style.left) + 188; // past the header column
        return x >= left && x <= right;
      }).length;
    });
    expect(shown).toBeGreaterThan(5);
  });

  test('a ruler label past the end of the timeline adds no sideways scroll', async ({ page }) => {
    // 15 s of timeline at 80 px/s; the ruler labels every 2 s, so its last label is the one of
    // 16 s, past the end. In a view that is wider than the timeline and ends on that label, the
    // label is cut by the view's edge: it is not something to scroll to.
    await openTimeline(page, [A, B]);
    const scroll = page.getByTestId('timeline-scroll');
    const widths = () => scroll.evaluate((el) => [el.clientWidth, el.scrollWidth]);
    const [seen] = await widths();
    const label = 188 + 16 * PX_PER_SECOND + 5; // the header column, the tick, the label's inset
    await page.setViewportSize({ width: 1500 - seen! + label + 10, height: 900 });
    await expect.poll(async () => (await widths())[0]).toBe(label + 10);
    await expect(page.getByTestId('timeline-ruler')).toContainText('16s');
    expect((await widths())[1]).toBe(label + 10);
    const lane = await box(page.getByTestId('track-lane-t2'));
    await page.mouse.move(lane.x + 300, lane.y + 10);
    await page.mouse.wheel(200, 0);
    await page.waitForTimeout(200);
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(0);

    // A timeline longer than the view is as wide as its tracks: the header column and 36 s
    // (the last label, the one of 36 s, starts where they end).
    await openTimeline(page, [A, B, clipJson('far', 'fb', 't3', 20, 30)]);
    await expect(page.getByTestId('track-lane-t3')).toBeVisible();
    expect((await widths())[1]).toBe(188 + 36 * PX_PER_SECOND);
  });

  test('clicking and dragging the ruler scrubs the playhead on the frame grid', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const y = ruler.y + ruler.height / 2;
    await page.mouse.click(await timeToX(page, 2), y);
    expect((await uiState(page)).time).toBeCloseTo(2, 6);
    await dragTo(page, { x: await timeToX(page, 2), y }, { x: await timeToX(page, 3.7), y });
    const t = (await uiState(page)).time;
    expect(t).toBeCloseTo(3.7, 1);
    expect(Math.abs(t * 60 - Math.round(t * 60))).toBeLessThan(1e-6); // on the 60 fps grid
    await expect(page.getByTestId('timeline-playhead')).toHaveAttribute('data-time', String(t));
  });

  test('with Ctrl/⌘ held, the playhead dragged on the ruler goes tick by tick, dt apart', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    await expect(page.getByTestId('timeline-dt')).toHaveText('dt 0.5 s');
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const y = ruler.y + ruler.height / 2;
    const time = async () => (await uiState(page)).time;

    // The press itself lands on a tick, and so does every move.
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.move(await timeToX(page, 1.3), y);
    await page.mouse.down();
    expect(await time()).toBe(1.5);
    await page.mouse.move(await timeToX(page, 2.2), y, { steps: 4 });
    expect(await time()).toBe(2);
    await page.mouse.move(await timeToX(page, 3.3), y, { steps: 4 });
    expect(await time()).toBe(3.5);
    // Let go of the key under a still pointer: the playhead is where the pointer is, on a frame.
    await page.keyboard.up('ControlOrMeta');
    expect(await time()).toBeCloseTo(3.3, 6);
    await page.mouse.move(await timeToX(page, 3.7), y, { steps: 4 });
    expect(await time()).toBeCloseTo(3.7, 6);
    // Pressed again in the middle of the drag, it is back on the ticks.
    await page.keyboard.down('ControlOrMeta');
    expect(await time()).toBe(3.5);
    await page.mouse.move(await timeToX(page, 3.8), y, { steps: 2 });
    expect(await time()).toBe(4);
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    expect(await time()).toBe(4);

    // At another zoom the step is that zoom's dt.
    await page.getByTestId('timeline-zoom-in').click();
    const dt = await page.getByTestId('timeline-dt').textContent();
    expect(dt).toMatch(/^dt 0\.\d+ s$/);
    const step = Number(dt!.slice(3, -2));
    expect(step).toBeLessThan(0.5);
    // A press a little after the playhead: on a frame without the key, on the nearest tick with it.
    const cap = await box(page.getByTestId('timeline-playhead'));
    const x = cap.x + cap.width / 2 + 37;
    await page.mouse.click(x, y);
    const free = await time();
    expect(free).toBeGreaterThan(4);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.click(x, y);
    await page.keyboard.up('ControlOrMeta');
    const ticks = (await time()) / step;
    expect(Math.abs(ticks - Math.round(ticks))).toBeLessThan(1e-6);
    expect(await time()).not.toBe(free);
    expect(Math.abs((await time()) - free)).toBeLessThanOrEqual(step / 2 + 1 / 60);
  });

  test('zoom buttons and Ctrl+wheel change the scale, keeping the point under the pointer', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    const readout = page.getByTestId('timeline-zoom');
    await expect(readout).toHaveText('80 px/s');
    // Beside it, the time between two small ticks of the ruler at this zoom: two seconds between
    // labels, cut in four.
    const dt = page.getByTestId('timeline-dt');
    await expect(dt).toHaveText('dt 0.5 s');
    const before = (await readout.boundingBox())!;
    await page.getByTestId('timeline-zoom-in').click();
    await expect(readout).not.toHaveText('80 px/s');
    await expect(dt).not.toHaveText('dt 0.5 s');
    // Neither readout moves the toolbar as its text changes.
    expect((await readout.boundingBox())!.x).toBe(before.x);
    await page.getByTestId('timeline-zoom-out').click();
    await expect(readout).toHaveText('80 px/s');

    const ruler = await box(page.getByTestId('timeline-ruler'));
    await page.mouse.move(await timeToX(page, 4), ruler.y + 40);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('ControlOrMeta');
    await expect(readout).not.toHaveText('80 px/s');
    // The clip block grew with the zoom.
    const px = Number((await readout.textContent())!.split(' ')[0]);
    expect(px).toBeGreaterThan(80);
    expect((await box(page.getByTestId('clip-a'))).width).toBeCloseTo(3.3 * px, -1);
  });
});

/* D181: − and + beside the dt readout set a dt of one's own, a tenth of a second at a time,
 * without zooming; the next change of the zoom puts the zoom's own back. */
test.describe('timeline: a dt of one’s own', () => {
  /** The period of the ruler's small ticks, px, as the browser draws them; null for none. */
  const tickPeriod = (page: Page) =>
    page.getByTestId('timeline-ruler').evaluate((el) => {
      const image = getComputedStyle(el).backgroundImage;
      return image === 'none' ? null : Number(/([\d.]+)px\)$/.exec(image)![1]);
    });

  test('− and + set it a tenth of a second at a time, at the same zoom, until the zoom changes', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    const zoom = page.getByTestId('timeline-zoom');
    const dt = page.getByTestId('timeline-dt');
    const less = page.getByTestId('timeline-dt-less');
    const more = page.getByTestId('timeline-dt-more');
    await expect(dt).toHaveText('dt 0.5 s');
    await expect(dt).not.toHaveAttribute('data-own');
    await expect(less).toHaveAttribute('title', 'Shorter dt: 0.4 s, at the same zoom');

    // With the focus on a clip, as the keys of the timeline have it.
    await page.getByTestId('clip-a').focus();
    await more.click();
    await expect(dt).toHaveText('dt 0.6 s');
    await expect(dt).toHaveAttribute('data-own', 'true');
    await expect(dt).toHaveClass(/\bis-own\b/);
    await expect(dt).toHaveAttribute('title', /zooming puts it back to automatic/);
    await expect(zoom).toHaveText('80 px/s');
    await expect(page.getByTestId('clip-a')).toBeFocused();
    // Down to a tenth of a second, and no further.
    for (let i = 0; i < 5; i += 1) await less.click();
    await expect(dt).toHaveText('dt 0.1 s');
    await expect(less).toBeDisabled();
    await expect(less).toHaveAttribute('title', 'No shorter dt: these keys stop at 0.1 s');
    await less.click({ force: true });
    await expect(dt).toHaveText('dt 0.1 s');
    await more.click();
    await more.click();
    await expect(dt).toHaveText('dt 0.3 s');
    await expect(zoom).toHaveText('80 px/s');
    // Seen through forced colours, where its accent would be lost, it is underlined.
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await dt.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('underline');
    await page.emulateMedia({ forcedColors: 'none' });

    // A zoom key puts the zoom's own back…
    await page.getByTestId('timeline-zoom-in').click();
    await expect(zoom).not.toHaveText('80 px/s');
    await expect(dt).not.toHaveAttribute('data-own');
    await expect(dt).toHaveText(/^dt 0\.\d+ s$/);
    // …and so do Ctrl/⌘ + wheel and the key of the whole timeline.
    await more.click();
    await expect(dt).toHaveAttribute('data-own', 'true');
    const ruler = await box(page.getByTestId('timeline-ruler'));
    await page.mouse.move(ruler.x + 300, ruler.y + 40);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('ControlOrMeta');
    await expect(dt).not.toHaveAttribute('data-own');
    await more.click();
    await expect(dt).toHaveAttribute('data-own', 'true');
    await page.getByTestId('timeline-fit').click();
    await expect(dt).not.toHaveAttribute('data-own');

    // A zoom that changes nothing keeps it: at the lowest zoom, − of the zoom stays there.
    for (let i = 0; i < 9; i += 1) await page.getByTestId('timeline-zoom-out').click();
    await expect(zoom).toHaveText('8 px/s');
    await expect(dt).toHaveText('dt 5 s');
    await more.click();
    await expect(dt).toHaveText('dt 5.1 s');
    await page.getByTestId('timeline-zoom-out').click();
    await expect(zoom).toHaveText('8 px/s');
    await expect(dt).toHaveText('dt 5.1 s');
    await expect(dt).toHaveAttribute('data-own', 'true');
  });

  test('a wider window that raises the lowest zoom keeps it: only a zoom of yours gives it back (S7-N2)', async ({
    page,
  }) => {
    // A scene of ten minutes: at the lowest zoom the whole timeline is in view, and a wider
    // window raises that zoom, which the timeline follows.
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 600)]);
    await page.setViewportSize({ width: 1100, height: 900 });
    const zoom = page.getByTestId('timeline-zoom');
    const dt = page.getByTestId('timeline-dt');
    await page.getByTestId('timeline-fit').click();
    await expect(zoom).toHaveText('1 px/s');
    await page.getByTestId('timeline-dt-more').click();
    await expect(dt).toHaveAttribute('data-own', 'true');
    const own = (await dt.textContent())!;
    await page.setViewportSize({ width: 1900, height: 900 });
    await expect(zoom).toHaveText('3 px/s');
    await expect(dt).toHaveAttribute('data-own', 'true');
    await expect(dt).toHaveText(own);
    // A zoom key does give the zoom's own back.
    await page.getByTestId('timeline-zoom-in').click();
    await expect(dt).not.toHaveAttribute('data-own');
  });

  test('its keys stay where they are whatever the readout says', async ({ page }) => {
    await openTimeline(page, [A, B]);
    const dt = page.getByTestId('timeline-dt');
    const more = page.getByTestId('timeline-dt-more');
    const places = async () => [
      (await box(page.getByTestId('timeline-dt-less'))).x,
      (await box(more)).x,
    ];
    const at = await places();
    await more.click();
    await expect(dt).toHaveText('dt 0.6 s'); // one's own, in bold
    expect(await places()).toEqual(at);
    for (let i = 0; i < 7; i += 1) await page.getByTestId('timeline-zoom-in').click();
    await expect(dt).toHaveText('dt 1/60 s');
    expect(await places()).toEqual(at);
    for (let i = 0; i < 4; i += 1) await more.click();
    await expect(dt).toHaveText('dt 0.4 s');
    expect(await places()).toEqual(at);
  });

  test('clips snap to it, the playhead dragged with Ctrl/⌘ goes by it and the ruler draws it', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    const dt = page.getByTestId('timeline-dt');
    expect(await tickPeriod(page)).toBe(40); // 0.5 s at 80 px/s
    await page.getByTestId('timeline-dt-less').click();
    await page.getByTestId('timeline-dt-less').click();
    await expect(dt).toHaveText('dt 0.3 s');
    // The small ticks of the ruler, 0.3 s apart; its labels are still the zoom's, every 2 s.
    expect(await tickPeriod(page)).toBe(24);
    await expect(page.getByTestId('timeline-ruler')).toContainText('2s');

    // A clip dragged by 1.03 s from 1 s: its start goes onto the grid of 0.3 s, 2.1 s, where the
    // zoom's grid of 0.5 s would have put it at 2 s.
    await moveClip(page, 'a', 1.03);
    expect(await clipOf(page, 'a')).toMatchObject({ start: 2.1, end: 5.4 });
    await undo(page);
    expect(await clipOf(page, 'a')).toMatchObject({ start: 1, end: 4.3 });

    // The playhead dragged on the ruler with Ctrl/⌘ held: 0.3 s at a time.
    const y = (await box(page.getByTestId('timeline-ruler'))).y + 10;
    const time = async () => (await uiState(page)).time;
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.move(await timeToX(page, 1.3), y);
    await page.mouse.down();
    expect(await time()).toBe(1.2);
    await page.mouse.move(await timeToX(page, 2.2), y, { steps: 4 });
    expect(await time()).toBe(2.1);
    await page.mouse.move(await timeToX(page, 3.5), y, { steps: 4 });
    expect(await time()).toBe(3.6);
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    await expect(dt).toHaveText('dt 0.3 s');

    // Ticks closer together than 4 px are not drawn: 0.1 s at 32.5 px/s.
    for (let i = 0; i < 3; i += 1) await page.getByTestId('timeline-zoom-out').click();
    await expect(page.getByTestId('timeline-zoom')).toHaveText('33 px/s');
    await expect(dt).toHaveText('dt 1 s');
    for (let i = 0; i < 9; i += 1) await page.getByTestId('timeline-dt-less').click();
    await expect(dt).toHaveText('dt 0.1 s');
    expect(await tickPeriod(page)).toBeNull();
    await page.getByTestId('timeline-dt-more').click();
    await expect(dt).toHaveText('dt 0.2 s');
    expect(await tickPeriod(page)).toBeCloseTo(6.5, 1);
  });
});

/* Fourteen tracks and a clip far to the right: more than the panel shows, both ways. */
const TALL = {
  tracks: Array.from({ length: 14 }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Track ${i + 1}`,
    hidden: false,
    locked: false,
  })),
};
const FAR = clipJson('far', 'fb', 't12', 20, 30);

test.describe('timeline: moving the view', () => {
  test('the middle button drags the view both ways at once; Escape puts it back', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, FAR], TALL);
    const scroll = page.getByTestId('timeline-scroll');
    const view = () => scroll.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    const [roomX, roomY] = await scroll.evaluate((el) => [
      el.scrollWidth - el.clientWidth,
      el.scrollHeight - el.clientHeight,
    ]);
    expect(roomX).toBeGreaterThan(400);
    expect(roomY).toBeGreaterThan(150);
    expect(await view()).toEqual([0, 0]);

    // Pressed on a clip: the view follows the pointer, like a sheet under a hand, and the clip
    // is neither selected nor moved.
    const clip = await box(page.getByTestId('clip-a'));
    const from = { x: clip.x + clip.width / 2, y: clip.y + clip.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'middle' });
    await expect(scroll).toHaveAttribute('data-panning', '');
    expect(await page.getByTestId('clip-a').evaluate((el) => getComputedStyle(el).cursor)).toBe(
      'grabbing',
    );
    await page.mouse.move(from.x - 250, from.y - 90, { steps: 5 });
    expect(await view()).toEqual([250, 90]);
    await page.mouse.move(from.x - 100, from.y - 120, { steps: 3 });
    expect(await view()).toEqual([100, 120]);
    // The drag goes on outside the timeline, and the view stops where there is no more of it.
    await page.mouse.move(from.x + 300, 60, { steps: 3 });
    expect(await view()).toEqual([0, roomY]);
    await page.mouse.move(from.x - 180, from.y - 50, { steps: 3 });
    await page.mouse.up({ button: 'middle' });
    expect(await view()).toEqual([180, 50]);
    await expect(scroll).not.toHaveAttribute('data-panning');
    await page.mouse.move(from.x, from.y, { steps: 3 }); // released: the view stays
    expect(await view()).toEqual([180, 50]);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    expect((await clipOf(page, 'a')).start).toBe(1);
    expect(await canUndo(page)).toBe(false);

    // On empty lane space it draws no selection rectangle, and Escape brings the view back.
    const lane = await box(page.getByTestId('track-lane-t4'));
    const empty = { x: lane.x + 700, y: lane.y + lane.height / 2 };
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(empty.x - 150, empty.y + 40, { steps: 4 });
    expect(await view()).toEqual([330, 10]);
    await expect(page.getByTestId('timeline-marquee')).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await view()).toEqual([180, 50]);
    await expect(scroll).not.toHaveAttribute('data-panning');
    await page.mouse.move(empty.x - 300, empty.y, { steps: 2 });
    await page.mouse.up({ button: 'middle' });
    expect(await view()).toEqual([180, 50]);
  });

  test('a wheel that turns both ways at once (a trackpad, a touch mouse) moves the view both ways', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, FAR], TALL);
    const scroll = page.getByTestId('timeline-scroll');
    const view = () => scroll.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    const lane = await box(page.getByTestId('track-lane-t2'));
    await page.mouse.move(lane.x + 500, lane.y + 10);
    // One event with both parts, as a finger moving diagonally sends it.
    await page.mouse.wheel(240, 90);
    await expect.poll(view).toEqual([240, 90]);
    await page.mouse.wheel(-100, 30);
    await expect.poll(view).toEqual([140, 120]);
    // The same over a track header and over the ruler, which stay in place while the rest moves.
    const header = await box(page.getByTestId('track-name-t3'));
    await page.mouse.move(header.x + 5, header.y + 5);
    await page.mouse.wheel(60, -70);
    await expect.poll(view).toEqual([200, 50]);
    const ruler = await box(page.getByTestId('timeline-ruler'));
    await page.mouse.move(lane.x + 500, ruler.y + 10);
    await page.mouse.wheel(-200, -50);
    await expect.poll(view).toEqual([0, 0]);
    // At an end of the timeline the gesture goes nowhere else: on a trackpad a sideways swipe
    // that the page took would be the browser's "back".
    expect(
      await scroll.evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.overscrollBehaviorX, style.overscrollBehaviorY];
      }),
    ).toEqual(['contain', 'contain']);
  });
});

test.describe('timeline: moving clips', () => {
  test('moves a clip, snapping to the time grid, as one undo step', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await moveClip(page, 'a', 1.03);
    const moved = await clipOf(page, 'a');
    // 1 + 1.03 = 2.03 → grid of 0.5 s.
    expect(moved.start).toBeCloseTo(2, 6);
    expect(moved.end).toBeCloseTo(5.3, 6);
    expect((await uiState(page)).selection).toMatchObject({ kind: 'clips', ids: ['a'] });
    await undo(page);
    expect(await clipOf(page, 'a')).toMatchObject({ start: 1, end: 4.3 });
    expect(await canUndo(page)).toBe(false);
  });

  test('Shift suspends snapping', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await moveClip(page, 'a', 1.03, { shift: true });
    const moved = await clipOf(page, 'a');
    expect(moved.start - 1).toBeCloseTo(Math.round(1.03 * PX_PER_SECOND) / PX_PER_SECOND, 2);
    expect(Math.abs(moved.start * 2 - Math.round(moved.start * 2))).toBeGreaterThan(0.01);
  });

  test('snaps to the playhead and to the edges of other clips', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await setTime(page, 2.2);
    await moveClip(page, 'a', 1.2); // start would be 2.2
    expect((await clipOf(page, 'a')).start).toBeCloseTo(2.2, 6);
    await undo(page);

    // B's start towards A's end (4.3), which is not on the grid.
    await moveClip(page, 'b', -1.66);
    expect((await clipOf(page, 'b')).start).toBeCloseTo(4.3, 6);
  });

  test('the snap toggle turns snapping off', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await page.getByTestId('timeline-snap').click();
    await expect(page.getByTestId('timeline-snap')).toHaveAttribute('aria-pressed', 'false');
    await moveClip(page, 'a', 1.2);
    const start = (await clipOf(page, 'a')).start;
    expect(start).toBeCloseTo(2.2, 1);
    expect(Math.abs(start * 2 - Math.round(start * 2))).toBeGreaterThan(0.01);
  });

  test('moves a clip to another track', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await moveClip(page, 'a', 0, { toTrack: 't3' });
    expect(await clipOf(page, 'a')).toMatchObject({ trackId: 't3', start: 1, end: 4.3 });
    await undo(page);
    expect((await clipOf(page, 'a')).trackId).toBe('t1');
  });

  test('never overlaps another clip on the track', async ({ page }) => {
    await openTimeline(page, [A, C, B]);
    // C towards A: it stops at A's end.
    await moveClip(page, 'c', -3);
    expect((await clipOf(page, 'c')).start).toBeCloseTo(4.3, 6);
    await undo(page);
    // A over C: the nearest free place is before C (end ≤ 6 → start ≤ 2.7).
    await moveClip(page, 'a', 4, { shift: true });
    const a = await clipOf(page, 'a');
    expect(a.end).toBeLessThanOrEqual(6 + 1e-6);
    expect(a.start).toBeCloseTo(2.7, 6);
    // And onto an occupied track at the same time: stays where it can.
    await moveClip(page, 'b', -2.5, { toTrack: 't1', shift: true });
    const p = await project(page);
    const onTrack1 = p.clips.filter((c) => c.trackId === 't1').sort((x, y) => x.start - y.start);
    for (let i = 1; i < onTrack1.length; i++) {
      expect(onTrack1[i]!.start).toBeGreaterThanOrEqual(onTrack1[i - 1]!.end - 1e-6);
    }
  });

  test('Escape cancels a drag without leaving an undo step', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await moveClip(page, 'a', 2, { release: false });
    expect((await clipOf(page, 'a')).start).toBeGreaterThan(2.5); // moved live
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await clipOf(page, 'a')).toMatchObject({ start: 1, end: 4.3 });
    expect(await canUndo(page)).toBe(false);
  });

  test('locked tracks cannot be edited', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await page.getByTestId('track-lock-t1').click();
    await expect(page.getByTestId('track-lock-t1')).toHaveAttribute('aria-pressed', 'true');
    await moveClip(page, 'a', 2);
    expect(await clipOf(page, 'a')).toMatchObject({ start: 1, end: 4.3 });
    // The edge handle does nothing either; the clip can still be selected.
    const b = await box(page.getByTestId('clip-a-trim-end'));
    await dragTo(page, { x: b.x + 3, y: b.y + 10 }, { x: b.x + 83, y: b.y + 10 });
    expect((await clipOf(page, 'a')).end).toBe(4.3);
    expect((await uiState(page)).selection).toMatchObject({ kind: 'clips', ids: ['a'] });
    // Nothing can be moved onto it, and Delete is ignored for its clips.
    await moveClip(page, 'b', 0, { toTrack: 't1' });
    expect((await clipOf(page, 'b')).trackId).toBe('t2');
    await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
    await page.keyboard.press('Delete');
    expect((await project(page)).clips).toHaveLength(2);
  });
});

test.describe('timeline: trimming', () => {
  test('drags the end edge; the outro fits inside', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await page.getByTestId('timeline-snap').click(); // exact pixels
    const h = await box(page.getByTestId('clip-a-trim-end'));
    await dragTo(page, { x: h.x + 3, y: h.y + 10 }, { x: h.x + 3 + PX_PER_SECOND, y: h.y + 10 });
    expect((await clipOf(page, 'a')).end).toBeCloseTo(5.3, 2);
    await undo(page);
    expect((await clipOf(page, 'a')).end).toBe(4.3);
  });

  test('cannot be trimmed shorter than intro + outro nor into a neighbour', async ({ page }) => {
    await openTimeline(page, [A, C]);
    const h = await box(page.getByTestId('clip-a-trim-end'));
    // Far to the left: length ≥ intro (1) + outro (1) = 2 s.
    await dragTo(page, { x: h.x + 3, y: h.y + 10 }, { x: h.x - 400, y: h.y + 10 });
    expect((await clipOf(page, 'a')).end).toBeCloseTo(3, 6);
    // Far to the right: it stops at C's start (6).
    const h2 = await box(page.getByTestId('clip-a-trim-end'));
    await dragTo(page, { x: h2.x + 3, y: h2.y + 10 }, { x: h2.x + 600, y: h2.y + 10 });
    expect((await clipOf(page, 'a')).end).toBeCloseTo(6, 6);
  });

  test('trimming the start keeps tween times and clamps those that no longer fit', async ({
    page,
  }) => {
    const tween = {
      id: 'tw',
      kind: 'tween' as const,
      start: 1.0, // absolute [2.0, 2.8]
      duration: 0.8,
      easing: 'smooth',
      to: { rotation: 90 },
    };
    const late = { ...tween, id: 'late', start: 1.9, duration: 0.3 }; // absolute [2.9, 3.2]
    await openTimeline(page, [{ ...A, actions: [tween, late] }]);
    await page.getByTestId('timeline-snap').click();
    const h = await box(page.getByTestId('clip-a-trim-start'));
    // +0.6 s: start 1.6, the intro now ends at 2.6.
    await dragTo(
      page,
      { x: h.x + 3, y: h.y + 10 },
      { x: h.x + 3 + 0.6 * PX_PER_SECOND, y: h.y + 10 },
    );
    const clip = await clipOf(page, 'a');
    expect(clip.start).toBeCloseTo(1.6, 2);
    const byId = new Map(clip.actions.map((a) => [a.id, a]));
    // The first tween was clamped to start at the new intro end (2.6) and keeps its end (2.8).
    expect(clip.start + byId.get('tw')!.start).toBeCloseTo(2.6, 2);
    expect(clip.start + byId.get('tw')!.start + byId.get('tw')!.duration).toBeCloseTo(2.8, 2);
    // The late one did not move in absolute time.
    expect(clip.start + byId.get('late')!.start).toBeCloseTo(2.9, 2);
    // Dragging further (intro ends at 3.0) drops the first tween and clamps the second.
    const h2 = await box(page.getByTestId('clip-a-trim-start'));
    await dragTo(
      page,
      { x: h2.x + 3, y: h2.y + 10 },
      { x: h2.x + 3 + 0.4 * PX_PER_SECOND, y: h2.y + 10 },
    );
    const later = await clipOf(page, 'a');
    expect(later.start).toBeCloseTo(2.0, 2);
    expect(later.actions.map((a) => a.id)).toEqual(['late']);
    expect(later.start + later.actions[0]!.start).toBeCloseTo(3.0, 2);
    expect(later.start + later.actions[0]!.start + later.actions[0]!.duration).toBeCloseTo(3.2, 2);
  });
});

test.describe('timeline: selection, delete, duplicate', () => {
  test('selects with click, extends with Shift or Ctrl/⌘, clears on empty space', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, C]);
    await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
    expect((await uiState(page)).selection).toMatchObject({ ids: ['a'] });
    await page.getByTestId('clip-b').click({ modifiers: ['Shift'], position: { x: 40, y: 10 } });
    expect((await uiState(page)).selection).toMatchObject({ ids: ['a', 'b'] });
    await page
      .getByTestId('clip-c')
      .click({ modifiers: ['ControlOrMeta'], position: { x: 40, y: 10 } });
    expect((await uiState(page)).selection).toMatchObject({ ids: ['a', 'b', 'c'] });
    await page.getByTestId('clip-b').click({ modifiers: ['Shift'], position: { x: 40, y: 10 } });
    expect((await uiState(page)).selection).toMatchObject({ ids: ['a', 'c'] });
    // A plain click inside a multi-selection narrows it on release.
    await page.getByTestId('clip-c').click({ position: { x: 40, y: 10 } });
    expect((await uiState(page)).selection).toMatchObject({ ids: ['c'] });
    await page.getByTestId('track-lane-t3').click({ position: { x: 300, y: 10 } });
    expect((await uiState(page)).selection.kind).toBe('none');
  });

  test('moves a multi-selection together', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
    await page.getByTestId('clip-b').click({ modifiers: ['Shift'], position: { x: 40, y: 10 } });
    await moveClip(page, 'b', 1, { shift: true });
    // Shift is held for the drag too; that is a snap bypass, selection stays.
    expect((await clipOf(page, 'a')).start).toBeCloseTo(1 + 1, 1);
    expect((await clipOf(page, 'b')).start).toBeCloseTo(6 + 1, 1);
    expect((await clipOf(page, 'a')).start - 1 - ((await clipOf(page, 'b')).start - 6)).toBeCloseTo(
      0,
      6,
    );
  });

  test('Delete removes the selected clips and their relations; undo brings them back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const { openWithProject } = await import('./helpers');
    await openWithProject(page, readExample('hello.mfe.json'));
    const before = await project(page);
    expect(before.clips).toHaveLength(2);
    expect(before.relations).toHaveLength(1);
    const firstId = before.clips[0]!.id;
    await page.getByTestId(`clip-${firstId}`).click({ position: { x: 30, y: 10 } });
    await page.keyboard.press('Delete');
    const after = await project(page);
    expect(after.clips.map((c) => c.id)).not.toContain(firstId);
    expect(after.relations).toHaveLength(0);
    expect((await uiState(page)).selection.kind).toBe('none');
    await undo(page);
    const restored = await project(page);
    expect(restored.clips).toHaveLength(2);
    expect(restored.relations).toHaveLength(1);
    // Backspace works too, and for several clips at once.
    await page.getByTestId(`clip-${restored.clips[0]!.id}`).click({ position: { x: 30, y: 10 } });
    await page
      .getByTestId(`clip-${restored.clips[1]!.id}`)
      .click({ modifiers: ['Shift'], position: { x: 30, y: 10 } });
    await page.keyboard.press('Backspace');
    expect((await project(page)).clips).toHaveLength(0);
  });

  test('Ctrl/⌘+D duplicates into free space and selects the copies', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
    await page.keyboard.press('ControlOrMeta+d');
    const p = await project(page);
    expect(p.clips).toHaveLength(3);
    const copy = p.clips.find((c) => !['a', 'b'].includes(c.id))!;
    expect(copy.trackId).toBe('t1');
    expect(copy.start).toBeCloseTo(4.3, 6);
    expect(copy.end - copy.start).toBeCloseTo(3.3, 6);
    expect((await uiState(page)).selection).toMatchObject({ ids: [copy.id] });
    await undo(page);
    expect((await project(page)).clips).toHaveLength(2);
  });

  test('keyboard shortcuts ignore text fields', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
    await page.getByTestId('track-name-t3').dblclick();
    const input = page.getByTestId('track-name-input-t3');
    await expect(input).toBeFocused();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    await page.keyboard.press('ControlOrMeta+d');
    expect((await project(page)).clips).toHaveLength(2);
    await page.keyboard.press('Escape');
  });
});

test.describe('timeline: drop from the Creator', () => {
  test('a dropped formula becomes a 3 s clip without intro or outro by default', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    expect(await dropFormula(page, 'fa', 't3', 6)).toBe(true);
    const clip = (await project(page)).clips.find((c) => !['a', 'b'].includes(c.id))!;
    expect(clip.intro).toMatchObject({ kind: 'none', duration: 0 });
    expect(clip.outro).toMatchObject({ kind: 'none', duration: 0 });
  });

  test('with "always add intro/outro" on, a dropped formula gets Write and FadeOut', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.usePreferences.getState().set({
        autoIntro: true,
        autoOutro: true,
      }),
    );
    const accepted = await dropFormula(page, 'fb', 't3', 2.04);
    expect(accepted).toBe(true);
    const p = await project(page);
    expect(p.clips).toHaveLength(3);
    const clip = p.clips.find((c) => !['a', 'b'].includes(c.id))!;
    expect(clip).toMatchObject({ formulaId: 'fb', trackId: 't3' });
    expect(clip.start).toBeCloseTo(2, 6); // snapped to the 0.5 s grid
    expect(clip.end - clip.start).toBeCloseTo(3, 6);
    expect(clip.intro).toMatchObject({ kind: 'write', duration: 1 });
    expect(clip.outro).toMatchObject({ kind: 'fade_out', duration: 1 });
    expect((await uiState(page)).selection).toMatchObject({ ids: [clip.id] });
    await expect(page.getByTestId(`clip-${clip.id}`)).toBeVisible();
    await undo(page);
    expect((await project(page)).clips).toHaveLength(2);
  });

  test('is shifted into free space when the spot is taken', async ({ page }) => {
    await openTimeline(page, [A, B]);
    // Track 1 is free only in [0, 1] and after 4.3: a 3 s clip goes after A.
    await dropFormula(page, 'fa', 't1', 2);
    const clip = (await project(page)).clips.find((c) => !['a', 'b'].includes(c.id))!;
    expect(clip.trackId).toBe('t1');
    expect(clip.start).toBeCloseTo(4.3, 6);
    const clips = (await project(page)).clips.filter((c) => c.trackId === 't1');
    expect(clips).toHaveLength(2);
  });

  test('a new clip starts where its object keeps its new clips, dropped or added from the menu', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    // «beta» keeps a start position, as a text placed in its editor does (D124).
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        const beta = draft.formulas.find((f) => f.id === 'fb')!;
        (beta as { startPosition?: [number, number] }).startPosition = [-3, 2];
      });
    });
    expect(await dropFormula(page, 'fb', 't3', 2)).toBe(true);
    expect(await dropFormula(page, 'fa', 't3', 6)).toBe(true);
    const made = async () => (await project(page)).clips.filter((c) => !['a', 'b'].includes(c.id));
    const [dropped, plain] = await made();
    expect(dropped).toMatchObject({ formulaId: 'fb', start: 2, end: 5 });
    expect(dropped!.initial.position).toEqual([-3, 2]);
    // An object that keeps none starts at the centre of the frame, as before.
    expect(plain!.initial.position).toEqual([0, 0]);
    // It is drawn there: a click on that place of the preview takes it.
    await setTime(page, 3);
    await clickScene(page, [-3, 2]);
    expect((await uiState(page)).selection).toMatchObject({ kind: 'clips', ids: [dropped!.id] });
    // «Add to the timeline» of the object's menu starts its clip there too.
    await setTime(page, 10);
    await page.getByTestId('formula-item').nth(1).click({ button: 'right' });
    await page.getByTestId('formula-menu-add-to-timeline').click();
    const added = (await made()).at(-1)!;
    expect(added).toMatchObject({ formulaId: 'fb', start: 10 });
    expect(added.initial.position).toEqual([-3, 2]);
    // The object itself keeps its position, and the clips made before theirs.
    expect((await made()).map((c) => c.initial.position)).toEqual([
      [-3, 2],
      [0, 0],
      [-3, 2],
    ]);
  });

  test('ignores locked tracks and unknown formulas', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await page.getByTestId('track-lock-t3').click();
    expect(await dropFormula(page, 'fb', 't3', 2)).toBe(false);
    expect(await dropFormula(page, 'nope', 't2', 2)).toBe(true); // accepted by the lane, then ignored
    expect((await project(page)).clips).toHaveLength(2);
  });

  test('Shift held during the drag drops the formula where the pointer is, unsnapped', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    const y = await laneY(page, 't3');
    // A real drag of the card (HTML5 drag and drop) to 2.2 s on the empty Track 3, where the
    // nearest small tick is 2 s (dt 0.5 s) and no edge is near.
    const dragCard = async (formulaId: string, shift: boolean) => {
      const card = await box(
        page.locator(`[data-testid="formula-item"][data-formula-id="${formulaId}"]`),
      );
      const x = await timeToX(page, 2.2);
      await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
      await page.mouse.down();
      await page.mouse.move(x - 40, y, { steps: 6 });
      if (shift) await page.keyboard.down('Shift');
      await page.mouse.move(x, y, { steps: 4 });
      const ghost = await box(page.getByTestId('timeline-drop-ghost'));
      await page.mouse.up();
      if (shift) await page.keyboard.up('Shift');
      const made = (await project(page)).clips.find(
        (c) => c.formulaId === formulaId && c.trackId === 't3',
      )!;
      return { ghost: ghost.x, start: made.start };
    };
    // Without Shift it snaps to the tick, ghost and clip alike.
    const snapped = await dragCard('fa', false);
    expect(snapped.start).toBe(2);
    expect(snapped.ghost).toBeCloseTo(await timeToX(page, 2), 0);
    await undo(page);
    expect((await project(page)).clips).toHaveLength(2);
    // With Shift it goes where the pointer is, as a dragged clip does.
    const free = await dragCard('fb', true);
    expect(free.start).toBeCloseTo(2.2, 1);
    expect(free.start).not.toBe(2);
    expect(free.ghost).toBeCloseTo(await timeToX(page, free.start), 0);
    // Let go of Shift and snapping is back.
    await undo(page);
    expect((await dragCard('fb', false)).start).toBe(2);
  });

  test('shows a ghost while a formula is dragged over a track', async ({ page }) => {
    await openTimeline(page, [A, B]);
    const x = await timeToX(page, 2);
    const y = await laneY(page, 't3');
    await page.evaluate(
      ({ x, y }) => {
        const lane = document.querySelector('[data-testid="track-lane-t3"]')!;
        const transfer = new DataTransfer();
        transfer.setData('application/x-mfe-formula', 'fa');
        lane.dispatchEvent(
          new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            dataTransfer: transfer,
          }),
        );
      },
      { x, y },
    );
    await expect(page.getByTestId('timeline-drop-ghost')).toBeVisible();
  });
});

test.describe('timeline: tracks', () => {
  test('the Audio button names each new audio track with a number no track has', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    const audioNames = async () =>
      (await project(page)).tracks
        .filter((t) => (t as { kind?: string }).kind === 'audio')
        .map((t) => t.name);
    await page.getByTestId('timeline-add-audio-track').click();
    await page.getByTestId('timeline-add-audio-track').click();
    expect(await audioNames()).toEqual(['Audio 1', 'Audio 2']);
    // «Audio 1» deleted, the button gives its name back.
    const first = (await project(page)).tracks.find((t) => t.name === 'Audio 1')!;
    await page.getByTestId(`track-delete-${first.id}`).click();
    await expect(page.getByTestId('dialog')).toContainText('It has no clips.');
    await holdToConfirm(page);
    expect(await audioNames()).toEqual(['Audio 2']);
    await page.getByTestId('timeline-add-audio-track').click();
    expect(await audioNames()).toEqual(['Audio 2', 'Audio 1']);
  });

  test('rename, hide, lock, reorder, add and delete tracks', async ({ page }) => {
    await openTimeline(page, [A, B]);
    // Rename.
    await page.getByTestId('track-name-t2').dblclick();
    await page.getByTestId('track-name-input-t2').fill('Equations');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('track-name-t2')).toHaveText('Equations');
    // Escape cancels.
    await page.getByTestId('track-name-t2').dblclick();
    await page.getByTestId('track-name-input-t2').fill('Nope');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('track-name-t2')).toHaveText('Equations');

    // Hide and lock are bound to the model.
    await page.getByTestId('track-hide-t1').click();
    await page.getByTestId('track-lock-t2').click();
    let p = await project(page);
    expect(p.tracks.find((t) => t.id === 't1')!.hidden).toBe(true);
    expect(p.tracks.find((t) => t.id === 't2')!.locked).toBe(true);
    await page.getByTestId('track-hide-t1').click();
    expect((await project(page)).tracks.find((t) => t.id === 't1')!.hidden).toBe(false);

    // Reorder: move track 2 up.
    await page.getByTestId('track-up-t2').click();
    p = await project(page);
    expect(p.tracks.map((t) => t.id)).toEqual(['t2', 't1', 't3']);
    await page.getByTestId('track-down-t2').click();
    expect((await project(page)).tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3']);

    // Add a track: it goes on top, in front of the others.
    await page.getByTestId('timeline-add-track').click();
    p = await project(page);
    expect(p.tracks).toHaveLength(4);
    expect(p.tracks[0]!.name).toBe('Track 4');
    expect(p.tracks.slice(1).map((t) => t.id)).toEqual(['t1', 't2', 't3']);

    // Delete a track with a clip: a dialog asks first, and its button must be held for 0.7 s.
    await page.getByTestId('track-delete-t1').click();
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Delete track?');
    await expect(dialog).toContainText('1 clip');
    await page.getByTestId('dialog-cancel').click();
    await expect(dialog).toBeHidden();
    expect((await project(page)).tracks.map((t) => t.id)).toContain('t1');

    await page.getByTestId('track-delete-t1').click();
    const confirm = page.getByTestId('dialog-confirm');
    await confirm.click(); // a plain click does nothing
    await confirm.hover();
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up(); // released too early
    expect((await project(page)).tracks.map((t) => t.id)).toContain('t1');
    await expect(dialog).toBeVisible();
    await page.mouse.down();
    await page.waitForTimeout(850);
    await page.mouse.up();
    await expect(dialog).toBeHidden();
    p = await project(page);
    expect(p.tracks.map((t) => t.id)).not.toContain('t1');
    expect(p.clips.map((c) => c.id)).toEqual(['b']);
    await undo(page);
    p = await project(page);
    expect(p.tracks.map((t) => t.id)).toContain('t1');
    expect(p.clips).toHaveLength(2);
  });
});

test('a track can be renamed from the keyboard, and its buttons name it', async ({ page }) => {
  await openTimeline(page, [A]);
  const name = page.getByTestId('track-name-t1');
  const trackName = (await name.textContent())!;
  await expect(page.getByRole('button', { name: `Hide ${trackName}` })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('button', { name: `Move ${trackName} down` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Delete ${trackName}` })).toBeVisible();

  await name.focus();
  await page.keyboard.press('F2');
  const input = page.getByRole('textbox', { name: 'Track name' });
  await expect(input).toBeFocused();
  await input.fill('Background');
  await page.keyboard.press('Enter');
  expect((await project(page)).tracks.find((t) => t.id === 't1')!.name).toBe('Background');
  await expect(name).toBeFocused(); // back on the name, ready for the next key

  // The hide button keeps its name; its state is in aria-pressed.
  const hide = page.getByRole('button', { name: 'Hide Background' });
  await hide.click();
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
});

test('resting the pointer on a clip shows its formula in a tooltip; moving hides it', async ({
  page,
}) => {
  await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 4)]);
  const clip = await box(page.getByTestId('clip-a'));
  const inside = { x: clip.x + clip.width / 2, y: clip.y + clip.height * 0.75 };
  await page.mouse.move(inside.x, inside.y);
  const tip = page.getByTestId('clip-tooltip');
  await expect(tip).toBeVisible();
  expect(await tip.locator('path').count()).toBeGreaterThan(0);
  await expect(tip).toContainText('alpha');
  await expect(tip).toContainText('0.00–4.00 s');
  // A move hides it; resting again brings it back; leaving the clip hides it for good.
  await page.mouse.move(inside.x + 15, inside.y);
  await expect(tip).toBeHidden();
  await expect(tip).toBeVisible();
  await page.mouse.move(clip.x + clip.width + 60, inside.y);
  await expect(tip).toBeHidden();
  await page.waitForTimeout(800); // longer than the 600 ms hover intent
  await expect(tip).toBeHidden();
});
