import { expect, test, type Page } from './test';
import { box, canUndo, clipJson, openTimeline, uiState } from './timelineHelpers';

/* The timeline's slider (TimelineSlider.tsx): a bar in the middle of the toolbar whose thumb is
 * as long, against the bar, as the stretch in view is against the whole timeline. It fills the
 * bar while everything is in view, gets shorter as the zoom gets closer, and moving it scrolls
 * the timeline sideways. */

/* A on track 1 [1, 4.3], B on track 2 [6, 9]: at the default zoom all of it is in view. With FAR
 * on track 3 [20, 30] the timeline is about twice the view. */
const A = clipJson('a', 'fa', 't1', 1, 4.3);
const B = clipJson('b', 'fb', 't2', 6, 9);
const FAR = clipJson('far', 'fb', 't3', 20, 30);

/** The column of track headers, which stays in place while the lanes scroll (layout.ts). */
const HEADER = 188;
const SHORTEST_THUMB = 24;

const slider = (page: Page) => page.getByTestId('timeline-slider');
const thumb = (page: Page) => page.getByTestId('timeline-slider-thumb');

/** The timeline's sideways scroll: where it is, what is in view and how far it can go. */
const view = (page: Page) =>
  page.getByTestId('timeline-scroll').evaluate((el) => ({
    left: el.scrollLeft,
    client: el.clientWidth,
    range: el.scrollWidth - el.clientWidth,
    whole: el.scrollWidth,
  }));

/** The bar and its thumb on screen, and the thumb's place from the bar's left end. */
async function parts(page: Page) {
  const bar = await box(slider(page));
  const knob = await box(thumb(page));
  return { bar, knob, left: knob.x - bar.x, travel: bar.width - knob.width };
}

/** How long the thumb must be: the bar's share that the lanes in view are of all of them. */
async function expectedThumb(page: Page): Promise<number> {
  const { client, whole } = await view(page);
  const { bar } = await parts(page);
  return Math.max(SHORTEST_THUMB, (bar.width * (client - HEADER)) / (whole - HEADER));
}

const zoomIn = async (page: Page, times: number) => {
  for (let i = 0; i < times; i += 1) await page.getByTestId('timeline-zoom-in').click();
};

test.describe('timeline: the slider', () => {
  test('its thumb fills the bar while the whole timeline is in view, and is shorter the closer the zoom', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    // Everything in view: the thumb is the bar, and there is nothing to move or to reach.
    expect((await view(page)).range).toBe(0);
    await expect(slider(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(slider(page)).toHaveAttribute('tabindex', '-1');
    await expect(slider(page)).toHaveAttribute('title', 'The whole timeline is in view');
    await expect(slider(page)).toHaveClass(/is-idle/);
    const idle = await parts(page);
    expect(idle.knob.width).toBeCloseTo(idle.bar.width, 0);
    expect(idle.left).toBeCloseTo(0, 0);
    // A press on it moves nothing.
    await page.mouse.click(idle.bar.x + 40, idle.bar.y + idle.bar.height / 2);
    expect((await view(page)).left).toBe(0);

    // Zoomed in, part of the timeline is out of view: the thumb is that much shorter.
    await zoomIn(page, 2);
    await expect(slider(page)).toHaveAttribute('aria-disabled', 'false');
    await expect(slider(page)).toHaveAttribute('tabindex', '0');
    await expect(slider(page)).toHaveAttribute('title', 'Drag to move along the timeline');
    await expect(slider(page)).not.toHaveClass(/is-idle/);
    expect((await view(page)).range).toBeGreaterThan(300);
    const near = await parts(page);
    expect(near.knob.width).toBeCloseTo(await expectedThumb(page), 0);
    expect(near.knob.width).toBeLessThan(near.bar.width - 100);
    // The bar itself did not change with the zoom.
    expect(near.bar).toEqual(idle.bar);

    await zoomIn(page, 2);
    const nearer = await parts(page);
    expect(nearer.knob.width).toBeCloseTo(await expectedThumb(page), 0);
    expect(nearer.knob.width).toBeLessThan(near.knob.width - 30);

    // At the closest zoom it is still something to hold.
    await zoomIn(page, 12);
    await expect(page.getByTestId('timeline-zoom')).toHaveText('2400 px/s');
    await expect.poll(async () => (await parts(page)).knob.width).toBeCloseTo(SHORTEST_THUMB, 0);

    // And zoomed back out until everything is in view, it fills the bar again.
    for (let i = 0; i < 16; i += 1) await page.getByTestId('timeline-zoom-out').click();
    await expect(slider(page)).toHaveAttribute('aria-disabled', 'true');
    const again = await parts(page);
    expect(again.knob.width).toBeCloseTo(again.bar.width, 0);
  });

  test('dragging the thumb moves the view along the timeline, and the thumb follows the view', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, FAR]);
    // Something selected and focused, to see that the slider takes neither.
    await page.getByTestId('clip-a').click({ position: { x: 30, y: 8 } });
    await expect(page.getByTestId('clip-a')).toBeFocused();
    const { range } = await view(page);
    expect(range).toBeGreaterThan(1000);
    const start = await parts(page);
    expect(start.left).toBeCloseTo(0, 0);
    expect(start.knob.width).toBeCloseTo(await expectedThumb(page), 0);
    /** Pixels of timeline per pixel of the thumb's travel. */
    const gear = range / start.travel;

    // The thumb goes with the pointer, and the view with the thumb.
    const y = start.knob.y + start.knob.height / 2;
    const grip = start.knob.x + 30;
    await page.mouse.move(grip, y);
    await page.mouse.down();
    await expect(slider(page)).toHaveClass(/is-dragging/);
    await page.mouse.move(grip + 100, y, { steps: 5 });
    await expect.poll(async () => (await parts(page)).left).toBeCloseTo(100, 0);
    expect(Math.abs((await view(page)).left - 100 * gear)).toBeLessThan(gear);
    // Past the bar's end the view is at its own end, and the thumb at the bar's.
    await page.mouse.move(start.bar.x + start.bar.width + 300, y + 200, { steps: 4 });
    await expect.poll(async () => (await view(page)).left).toBe(range);
    const end = await parts(page);
    expect(end.left + end.knob.width).toBeCloseTo(end.bar.width, 0);
    // Back before its start: the start of the timeline.
    await page.mouse.move(start.bar.x - 200, y, { steps: 4 });
    await expect.poll(async () => (await view(page)).left).toBe(0);
    await page.mouse.move(grip + 60, y, { steps: 4 });
    await page.mouse.up();
    await expect(slider(page)).not.toHaveClass(/is-dragging/);
    const dropped = (await view(page)).left;
    expect(Math.abs(dropped - 60 * gear)).toBeLessThan(gear);
    await page.mouse.move(grip + 200, y, { steps: 3 }); // released: the view stays
    expect((await view(page)).left).toBe(dropped);

    // It is a view of the timeline: a press on it selects nothing, changes nothing that can be
    // undone and leaves the focus where it was (Space and the arrows still drive the playback).
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
    await expect(page.getByTestId('clip-a')).toBeFocused();
    expect(await canUndo(page)).toBe(false);

    // The view moved some other way (the wheel over the lanes) takes the thumb along.
    const lane = await box(page.getByTestId('track-lane-t2'));
    await page.mouse.move(lane.x + 500, lane.y + 10);
    await page.mouse.wheel(240, 0);
    await expect.poll(async () => (await view(page)).left).toBeCloseTo(dropped + 240, 0);
    await expect
      .poll(async () => Math.abs((await parts(page)).left - (dropped + 240) / gear))
      .toBeLessThan(1);
  });

  test('a press beside the thumb brings it under the pointer, and Escape puts the view back', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, FAR]);
    const start = await parts(page);
    const y = start.bar.y + start.bar.height / 2;
    const centre = async () => {
      const { knob } = await parts(page);
      return knob.x + knob.width / 2;
    };
    // Pressed on the bar, well to the right of the thumb: the thumb's middle comes there…
    const pressed = start.bar.x + start.bar.width * 0.7;
    expect(pressed).toBeGreaterThan(start.knob.x + start.knob.width + 20);
    await page.mouse.move(pressed, y);
    await page.mouse.down();
    await expect.poll(centre).toBeCloseTo(pressed, 0);
    const jumped = (await view(page)).left;
    expect(jumped).toBeGreaterThan(300);
    // …and the same press drags it on from there.
    await page.mouse.move(pressed - 50, y, { steps: 4 });
    await expect.poll(centre).toBeCloseTo(pressed - 50, 0);
    expect((await view(page)).left).toBeLessThan(jumped - 100);
    // Escape gives the drag up: the view is where the press found it.
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await view(page)).left).toBe(0);
    await expect(slider(page)).not.toHaveClass(/is-dragging/);
    await page.mouse.move(pressed - 150, y, { steps: 3 });
    await page.mouse.up();
    expect((await view(page)).left).toBe(0);
    expect((await parts(page)).left).toBeCloseTo(0, 0);
  });

  test('reached with Tab, the arrows, Page Up, Page Down, Home and End move the view and not the playhead', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, FAR]);
    const { client, range } = await view(page);
    const lanes = client - HEADER;
    /** How far the view is from `wanted`: a scroll is kept on whole pixels, each step of a key
     * can leave half of one. */
    const off = (wanted: number) => async () => Math.abs((await view(page)).left - wanted);
    const left = async () => (await view(page)).left;
    // The Tab stop between the keys of the zoom: out and in before it, the whole timeline after.
    // Before them, the last of the tools: the Slides mode's toggle.
    await page.getByTestId('timeline-slides').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('timeline-zoom-out')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('timeline-zoom-in')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(slider(page)).toBeFocused();
    await expect(slider(page)).toHaveAttribute('role', 'scrollbar');
    await expect(slider(page)).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(slider(page)).toHaveAttribute('aria-valuenow', '0');
    const controlled = await slider(page).getAttribute('aria-controls');
    expect(await page.getByTestId('timeline-scroll').getAttribute('id')).toBe(controlled);

    await page.keyboard.press('ArrowRight');
    await expect.poll(off(lanes / 10)).toBeLessThan(1.5);
    await page.keyboard.press('ArrowRight');
    await expect.poll(off(lanes / 5)).toBeLessThan(1.5);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(off(lanes / 10)).toBeLessThan(1.5);
    await page.keyboard.press('Home');
    await expect.poll(left).toBe(0);
    await page.keyboard.press('PageDown');
    await expect.poll(off(lanes)).toBeLessThan(1.5);
    await page.keyboard.press('PageUp');
    await expect.poll(left).toBe(0);
    await page.keyboard.press('End');
    await expect.poll(left).toBe(range);
    await expect(slider(page)).toHaveAttribute('aria-valuenow', '100');
    // What is in view, in the timeline's own terms: seconds.
    await expect(slider(page)).toHaveAttribute('aria-valuetext', /^\d+\.\d s to 36\.0 s$/);
    // The keys were the slider's: the playhead, which the arrows, Home and End move from
    // anywhere else, stayed where it was.
    expect((await uiState(page)).time).toBe(0);
    await expect(slider(page)).toBeFocused();
  });

  test('is in the middle of the toolbar, at most 540px wide, and gives way in a narrow one', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, FAR]);
    const toolbar = page.locator('.tl-toolbar');
    // The last of the tools: the Slides mode's toggle.
    const lastTool = page.getByTestId('timeline-slides');
    /** The bar, the middle of the toolbar's content and the right end of the tools. */
    const layout = async () => {
      const bar = await box(slider(page));
      const [contentLeft, contentRight] = await toolbar.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return [
          rect.left + parseFloat(style.paddingLeft),
          rect.right - parseFloat(style.paddingRight),
        ];
      });
      const last = await box(lastTool);
      return {
        bar,
        centre: bar.x + bar.width / 2,
        middle: (contentLeft! + contentRight!) / 2,
        tools: last.x + last.width,
        end: contentRight!,
      };
    };
    /** What follows the bar — the key of the whole timeline, the zoom's readout and dt between its
     * − and + — comes one after another, each key at its own width, and all of it inside the
     * toolbar. */
    const expectAfterInside = async () => {
      const { end } = await layout();
      const whole = await box(page.getByTestId('timeline-fit'));
      const zoom = await box(page.getByTestId('timeline-zoom'));
      const less = await box(page.getByTestId('timeline-dt-less'));
      const dt = await box(page.getByTestId('timeline-dt'));
      const more = await box(page.getByTestId('timeline-dt-more'));
      expect(whole.width).toBeCloseTo(32, 0);
      expect([less.width, more.width]).toEqual([24, 24]);
      expect(zoom.x).toBeGreaterThanOrEqual(whole.x + whole.width);
      expect(less.x).toBeGreaterThanOrEqual(zoom.x + zoom.width);
      expect(dt.x).toBeGreaterThanOrEqual(less.x + less.width);
      expect(more.x).toBeGreaterThanOrEqual(dt.x + dt.width);
      expect(more.x + more.width).toBeLessThanOrEqual(end + 0.5);
    };

    // A wide window: all of its width, in the middle.
    await page.setViewportSize({ width: 1920, height: 1000 });
    await expect.poll(async () => (await layout()).bar.width).toBeCloseTo(540, 0);
    let now = await layout();
    expect(now.centre).toBeCloseTo(now.middle, 0);
    await expectAfterInside();

    // The zoom is around it: its two keys right before it, and right after it the key of the
    // whole timeline and the readout.
    const out = await box(page.getByTestId('timeline-zoom-out'));
    const zoomInKey = await box(page.getByTestId('timeline-zoom-in'));
    const whole = await box(page.getByTestId('timeline-fit'));
    const readout = await box(page.getByTestId('timeline-zoom'));
    expect(out.x).toBeGreaterThanOrEqual(now.tools + 8);
    expect(zoomInKey.x).toBeGreaterThan(out.x);
    expect(now.bar.x - (zoomInKey.x + zoomInKey.width)).toBeLessThanOrEqual(8);
    expect(whole.x - (now.bar.x + now.bar.width)).toBeLessThanOrEqual(8);
    expect(whole.x).toBeGreaterThanOrEqual(now.bar.x + now.bar.width);
    expect(readout.x).toBeGreaterThanOrEqual(whole.x + whole.width);

    // Less room: still in the middle, as long as the room beside the tools lets it be.
    await page.setViewportSize({ width: 1300, height: 900 });
    await expect.poll(async () => (await layout()).bar.width).toBeLessThan(539);
    now = await layout();
    expect(now.bar.width).toBeGreaterThan(321);
    expect(now.centre).toBeCloseTo(now.middle, 0);
    expect(now.bar.x).toBeGreaterThanOrEqual(now.tools + 8);
    await expectAfterInside();

    // Narrower, it keeps 320px and leaves the middle rather than the tools their room.
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect.poll(async () => (await layout()).bar.width).toBeCloseTo(320, 0);
    now = await layout();
    expect(now.centre).toBeGreaterThan(now.middle + 5);
    expect(now.bar.x).toBeGreaterThanOrEqual(now.tools + 8);
    expect(now.bar.x + now.bar.width).toBeLessThanOrEqual(now.end + 0.5);
    await expectAfterInside();
    // Its thumb is still the same share of it.
    expect((await parts(page)).knob.width).toBeCloseTo(await expectedThumb(page), 0);

    // With no room left beside the tools it takes what there is, inside the toolbar, and so does
    // what follows it.
    await page.setViewportSize({ width: 800, height: 900 });
    await expect.poll(async () => (await layout()).bar.width).toBeLessThan(319);
    now = await layout();
    expect(now.bar.x).toBeGreaterThanOrEqual(now.tools + 8);
    expect(now.bar.x + now.bar.width).toBeLessThanOrEqual(now.end + 0.5);
    await expectAfterInside();

    // In the narrow layout (the panels one under another) the tools wrap and the slider has a
    // line of its own under them, inside the window; what follows it, a line under it.
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(page.locator('main.app-main')).toHaveAttribute('data-layout', 'stacked');
    await slider(page).scrollIntoViewIfNeeded();
    await expect(slider(page)).toBeInViewport();
    now = await layout();
    const last = await box(lastTool);
    expect(now.bar.y).toBeGreaterThanOrEqual(last.y + last.height);
    expect(now.bar.x).toBeGreaterThanOrEqual(0);
    expect(now.bar.x + now.bar.width).toBeLessThanOrEqual(600);
    expect(now.bar.width).toBeGreaterThan(300);
    await expectAfterInside();
    expect((await box(page.getByTestId('timeline-fit'))).y).toBeGreaterThanOrEqual(
      now.bar.y + now.bar.height,
    );
  });

  test('the key after it puts the whole timeline in view: the thumb fills the bar', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, FAR]);
    const whole = page.getByTestId('timeline-fit');
    const readout = page.getByTestId('timeline-zoom');
    await expect(whole).toHaveAccessibleName('Show the whole timeline');
    // About twice the view: the thumb is short, and the view somewhere along it.
    await page.getByTestId('timeline-scroll').evaluate((el) => {
      el.scrollLeft = 300;
    });
    expect((await view(page)).range).toBeGreaterThan(300);
    await expect(whole).toBeEnabled();
    await whole.click();
    // Nothing left to scroll, from the start, and the whole width used: the 36 s of this
    // timeline (its last clip ends at 30 s) are as wide as the lanes in view.
    await expect.poll(async () => (await view(page)).range).toBe(0);
    const now = await view(page);
    expect(now.left).toBe(0);
    const zoom = Number.parseFloat((await readout.textContent())!);
    expect(Math.abs(zoom * 36 - (now.client - HEADER))).toBeLessThan(36);
    const filled = await parts(page);
    expect(filled.knob.width).toBeCloseTo(filled.bar.width, 0);
    await expect(slider(page)).toHaveAttribute('aria-disabled', 'true');
    // There: the key has nothing to do until the zoom changes.
    await expect(whole).toBeDisabled();
    await expect(whole).toHaveAttribute('title', 'The whole timeline is in view');
    expect(await canUndo(page)).toBe(false);
    await zoomIn(page, 1);
    await expect(whole).toBeEnabled();
    await whole.click();
    await expect.poll(async () => (await view(page)).range).toBe(0);
    // Zoomed out past it, the timeline is narrower than the view: the key brings it back to
    // filling it.
    await page.getByTestId('timeline-zoom-out').click();
    await expect(whole).toBeEnabled();
    const narrow = Number.parseFloat((await readout.textContent())!);
    await whole.click();
    await expect(whole).toBeDisabled();
    expect(Number.parseFloat((await readout.textContent())!)).toBeGreaterThan(narrow);
  });

  test('a timeline of a few minutes fits whole too, under the lowest zoom of a short scene', async ({
    page,
  }) => {
    // The last clip ends at 200 s: 206 s of timeline, which need less than 8 px a second here.
    await openTimeline(page, [A, clipJson('long', 'fb', 't2', 190, 200)]);
    await page.getByTestId('timeline-fit').click();
    await expect.poll(async () => (await view(page)).range).toBe(0);
    // The lanes are as wide as the view, not narrower: the zoom is the view's width over those
    // 206 s, under 8 px a second.
    const { client } = await view(page);
    const content = await box(page.locator('.tl-content'));
    expect(Math.abs(content.width - client)).toBeLessThanOrEqual(1);
    expect((client - HEADER) / 206).toBeLessThan(8);
    const filled = await parts(page);
    expect(filled.knob.width).toBeCloseTo(filled.bar.width, 0);
    await expect(page.getByTestId('timeline-fit')).toBeDisabled();
    // The − key stops there as well: there is nothing more to bring into view.
    await page.getByTestId('timeline-zoom-out').click();
    await expect(page.getByTestId('timeline-fit')).toBeDisabled();
  });
});
