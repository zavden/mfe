import { expect, test, type Page } from './test';
import { openWithProject, readExample, type MfeWindow } from './helpers';
import { selectClips } from './uxHelpers';

/* The drawing of the pair editors with a tall formula (D207): the derivation of
 * `examples/completing-the-square.mfe.json`, five lines and 80 glyphs, in the pair editor of one
 * of its Morph blocks. The pointer takes glyphs with the Preview's circle selector; the mark of a
 * glyph is its box, and the badges are the screen's: they keep their size and stay apart. The
 * drawing has a view, zoomed and moved with the Preview's gestures, which opens framed on what
 * takes part, and two layouts: this formula, taller than wide, opens side by side. */

const STEPS = 80;

/** The example with the derivation alone under two blocks: one that writes every line but the
 * first (glyphs 10 to 79), then a Morph block without pairs. The Morph block can start from the
 * four lines on screen and bring the first, which nothing shows: what takes part is the lower
 * four fifths of the sources and the upper fifth of the targets. */
function firstLineArrives(): string {
  const project = JSON.parse(readExample('completing-the-square.mfe.json')) as {
    formulas: { id: string; hiddenGlyphs: number[] }[];
    clips: {
      id: string;
      actions: { id: string; start: number; glyphs?: number[]; pairs?: unknown[] }[];
    }[];
    relations: unknown[];
  };
  const all = Array.from({ length: STEPS }, (_, i) => i);
  project.formulas.find((f) => f.id === 'f_steps')!.hiddenGlyphs = all;
  const clip = project.clips.find((c) => c.id === 'c_steps')!;
  const block = (id: string) => clip.actions.find((a) => a.id === id)!;
  clip.actions = [
    { ...block('a_bars'), id: 'a_rest', start: 0, glyphs: all.slice(10) },
    { ...block('a_m_left'), pairs: [] },
  ];
  project.clips = [clip];
  project.relations = [];
  return JSON.stringify(project);
}

/** Show the whole drawing, where its view is on a part of it. */
async function showAll(page: Page): Promise<void> {
  const fit = page.getByTestId('morph-view-fit');
  if (await fit.isEnabled()) await fit.click();
  await expect(fit).toBeDisabled();
}

/** Open the example (or `json`) and the pair editor of its Morph block `actionId`, as it opens:
 * in the layout and with the view the drawing chooses. */
async function openSteps(
  page: Page,
  actionId = 'a_m_left',
  json = readExample('completing-the-square.mfe.json'),
): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, json);
  await page.waitForFunction((count) => {
    const mfe = (window as MfeWindow).__mfe!;
    const formula = mfe.useProjectStore
      .getState()
      .project.formulas.find((f: { id: string }) => f.id === 'f_steps') as
      { snapshot?: { glyphs: unknown[] } | null } | undefined;
    return formula?.snapshot?.glyphs.length === count;
  }, STEPS);
  await page.evaluate(
    (actionId) =>
      (window as MfeWindow).__mfe!.useMorphEditorStore.getState().open({
        clipId: 'c_steps',
        actionId,
      }),
    actionId,
  );
  await expect(page.getByTestId('morph-editor')).toBeVisible();
  await expect(page.getByTestId('morph-from-glyph-0')).toBeAttached();
}

interface Spot {
  id: string;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the ink of every glyph of the drawing is on screen: its box and its centre. */
const glyphSpots = (page: Page): Promise<Spot[]> =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<SVGGElement>(
        '[data-testid^="morph-from-glyph-"] > path, [data-testid^="morph-to-glyph-"] > path',
      ),
    ].map((path) => {
      const box = path.getBoundingClientRect();
      return {
        id: path.parentElement!.getAttribute('data-testid')!,
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      };
    }),
  );

/** The glyph the pointer aims at, as the badge with its index says: the one a click would take. */
const aimed = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const badge = document.querySelector('[data-testid="morph-glyph-index"]');
    return badge
      ? `morph-${badge.getAttribute('data-side')}-glyph-${badge.getAttribute('data-index')}`
      : null;
  });

const radius = (page: Page): Promise<number> =>
  page.evaluate(() => (window as MfeWindow).__mfe!.usePreferences.getState().symbolRadius);

/** The glyphs whose centre does not take them, with what it takes instead: the pointer goes to
 * the centre of the ink of each glyph of the drawing, 160 of them, and the drawing says which it
 * aims at. */
async function missedCentres(page: Page): Promise<string[]> {
  const spots = await glyphSpots(page);
  expect(spots).toHaveLength(2 * STEPS);
  const missed: string[] = [];
  for (const spot of spots) {
    await page.mouse.move(spot.x, spot.y);
    const got = await aimed(page);
    if (got !== spot.id) missed.push(`${spot.id} → ${got}`);
  }
  return missed;
}

// 160 moves of the pointer, each answered by the page: more than the usual time of a test when
// every worker of the suite is busy.
const EVERY_GLYPH_MS = 120_000;

test('the centre of each of the 80 glyphs of a derivation takes that glyph, on either side', async ({
  page,
}) => {
  test.setTimeout(EVERY_GLYPH_MS);
  await openSteps(page);
  // Side by side, as this formula opens.
  await expect(page.getByTestId('morph-canvas')).toHaveAttribute('data-layout', 'side');
  await showAll(page);
  expect(await missedCentres(page)).toEqual([]);

  // What is aimed at is what a click takes: a source, then a target, are a pair.
  const source = (await glyphSpots(page)).find((spot) => spot.id === 'morph-from-glyph-10')!;
  await page.mouse.click(source.x, source.y);
  await expect(page.getByTestId('morph-from-glyph-10')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-testid^="morph-"][data-selected="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid^="morph-"][data-selected="true"]')).toHaveCount(0);
});

test('stacked too, the centre of each of the 80 glyphs takes that glyph', async ({ page }) => {
  test.setTimeout(EVERY_GLYPH_MS);
  await openSteps(page);
  await page.getByTestId('morph-toggle-layout').click();
  await expect(page.getByTestId('morph-canvas')).toHaveAttribute('data-layout', 'stacked');
  await showAll(page);
  expect(await missedCentres(page)).toEqual([]);
});

test('the circle follows the pointer and takes the nearest glyph within it; Shift + wheel sizes it', async ({
  page,
}) => {
  await openSteps(page);
  await showAll(page);
  const drawing = (await page.getByTestId('morph-canvas').boundingBox())!;
  // The leftmost glyph of the sources: nothing is drawn at its left.
  const spots = (await glyphSpots(page)).filter((spot) => spot.id.startsWith('morph-from-'));
  const first = spots.reduce((a, b) => (b.left < a.left ? b : a));
  const beside = { x: first.left - 9, y: first.y };
  expect(await radius(page)).toBe(14);

  // No circle until the pointer is on the drawing.
  await expect(page.getByTestId('morph-reach')).toHaveCount(0);
  await page.mouse.move(beside.x, beside.y);
  const ring = page.getByTestId('morph-reach').locator('.rg-reach-ring');
  await expect(ring).toBeVisible();
  // The circle is the preference's, in screen pixels, about the pointer.
  const circle = (await ring.boundingBox())!;
  expect(circle.width / 2).toBeGreaterThan(13.5);
  expect(circle.width / 2).toBeLessThan(15.5);
  expect(circle.x + circle.width / 2).toBeCloseTo(beside.x, 0);
  expect(circle.y + circle.height / 2).toBeCloseTo(beside.y, 0);
  // Beside the glyph, on no ink, within the circle: it is the one aimed at, and the index says so.
  expect(await aimed(page)).toBe(first.id);
  await expect(page.getByTestId(first.id)).toHaveClass(/is-hover/);
  await expect(page.getByTestId('morph-canvas')).toHaveClass(/is-aiming/);

  // Shift + wheel shrinks the circle: at its smallest the glyph is out of reach.
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 600);
  await expect.poll(() => radius(page)).toBe(6);
  await page.keyboard.up('Shift');
  expect(await aimed(page)).toBeNull();
  await expect(page.getByTestId('morph-canvas')).not.toHaveClass(/is-aiming/);
  expect((await ring.boundingBox())!.width / 2).toBeLessThan(7.5);
  // A click there is a click on the background.
  await page.mouse.click(beside.x, beside.y);
  await expect(page.locator('[data-testid^="morph-"][data-selected="true"]')).toHaveCount(0);

  // And grows it back, without moving the pointer: the glyph is taken again, and a click has it.
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -200);
  await expect.poll(() => radius(page)).toBeGreaterThan(8);
  await page.keyboard.up('Shift');
  expect(await aimed(page)).toBe(first.id);
  // (A click says where it is in whole pixels, the pointer finer: the click is where the pointer
  // was, so what was aimed at is what is taken, to the edge of the circle.)
  await page.mouse.click(beside.x, beside.y);
  await expect(page.getByTestId(first.id)).toHaveAttribute('data-selected', 'true');
  // The size is the Preview's own preference, which the browser remembers.
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('mfe.preferences') ?? '{}').symbolRadius,
    ),
  ).toBe(await radius(page));

  // A right-click beside the glyph is on the glyph too: its menu, not the background's.
  await page.keyboard.press('Escape');
  await page.mouse.click(beside.x, beside.y, { button: 'right' });
  await expect(page.getByTestId(first.id)).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Escape');

  // The pointer gone, the circle is gone, and nothing is aimed at.
  await page.mouse.move(drawing.x - 20, drawing.y + 20);
  await expect(page.getByTestId('morph-reach')).toHaveCount(0);
  expect(await aimed(page)).toBeNull();
});

test('a slow scroll with Shift sizes the circle of the drawing: its small events add up', async ({
  page,
}) => {
  await openSteps(page);
  await showAll(page);
  // Beside the leftmost glyph of the sources, 9 px from its ink: within the reach of 14 px.
  const spots = (await glyphSpots(page)).filter((spot) => spot.id.startsWith('morph-from-'));
  const first = spots.reduce((a, b) => (b.left < a.left ? b : a));
  const beside = { x: first.left - 9, y: first.y };
  await page.mouse.move(beside.x, beside.y);
  const ring = page.getByTestId('morph-reach').locator('.rg-reach-ring');
  await expect(ring).toBeVisible();
  expect(await radius(page)).toBe(14);
  expect(await aimed(page)).toBe(first.id);
  // The circle as it is drawn: its box is the reach and the line that draws it.
  const onScreen = async () => (await ring.boundingBox())!.width / 2;

  /** A scroll as a trackpad sends it: many events of a few pixels, none of which is worth a
   * pixel of the reach by itself. */
  const scroll = async (events: number, deltaX: number, deltaY: number) => {
    for (let i = 0; i < events; i += 1) await page.mouse.wheel(deltaX, deltaY);
  };
  await page.keyboard.down('Shift');
  // 120 px towards the user in events of 3 px: 14 × e^-0.24, a reach of 11. The glyph is still
  // within the circle, which is drawn that size.
  await scroll(40, 0, 3);
  await expect.poll(() => radius(page)).toBe(11);
  expect(await onScreen()).toBeGreaterThan(10.5);
  expect(await onScreen()).toBeLessThan(12.5);
  expect(await aimed(page)).toBe(first.id);
  // Twice as far again: 14 × e^-0.72, a reach of 7, and the glyph is out of it.
  await scroll(80, 0, 3);
  await expect.poll(() => radius(page)).toBe(7);
  expect(await onScreen()).toBeGreaterThan(6.5);
  expect(await onScreen()).toBeLessThan(8.5);
  expect(await aimed(page)).toBeNull();
  // All the way back, handed sideways as a Mac hands a scroll with Shift held: the reach it was,
  // without the pointer moving, and the glyph is aimed at again.
  await scroll(120, -3, 0);
  await expect.poll(() => radius(page)).toBe(14);
  await page.keyboard.up('Shift');
  expect(await onScreen()).toBeGreaterThan(13.5);
  expect(await onScreen()).toBeLessThan(15.5);
  expect(await aimed(page)).toBe(first.id);
  // The size is the Preview's own preference, which the browser remembers.
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('mfe.preferences') ?? '{}').symbolRadius,
    ),
  ).toBe(14);
});

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The boxes on screen of the elements `selector` finds in the drawing. */
const rects = (page: Page, selector: string): Promise<Rect[]> =>
  page.evaluate(
    (selector) =>
      [...document.querySelectorAll(`[data-testid="morph-canvas"] ${selector}`)].map((el) => {
        const { left, top, right, bottom } = el.getBoundingClientRect();
        return { left, top, right, bottom };
      }),
    selector,
  );

const meet = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test('the mark of a glyph is its box: no mark lies on the centre of another glyph', async ({
  page,
}) => {
  await openSteps(page);
  await showAll(page);
  const spots = await glyphSpots(page);
  const marks = await rects(page, '.rg-glyph > .rg-hit');
  expect(marks).toHaveLength(spots.length);
  spots.forEach((spot, i) => {
    const mark = marks[i]!;
    // The glyph's box and two pixels around it; ten pixels at least, for a dot and a bar.
    expect(mark.right - mark.left).toBeLessThanOrEqual(Math.max(spot.width + 5, 10.5));
    expect(mark.bottom - mark.top).toBeLessThanOrEqual(Math.max(spot.height + 5, 10.5));
    expect(mark.right - mark.left).toBeGreaterThanOrEqual(9.5);
    expect(mark.bottom - mark.top).toBeGreaterThanOrEqual(9.5);
  });
  const covered = spots.filter((spot, i) =>
    marks.some(
      (mark, j) =>
        j !== i &&
        spot.x > mark.left &&
        spot.x < mark.right &&
        spot.y > mark.top &&
        spot.y < mark.bottom,
    ),
  );
  expect(covered.map((spot) => spot.id)).toEqual([]);
});

test('the badges of the pairs and the index keep their size on screen, and no badge is under another', async ({
  page,
}) => {
  await openSteps(page);
  const badges = () => rects(page, '.rg-badge > rect');
  const sized = async () => {
    const boxes = await badges();
    expect(boxes).toHaveLength(8);
    for (const box of boxes) expect(box.bottom - box.top).toBeCloseTo(15.4, 0);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) expect(meet(a, b)).toBe(false);
    }
    // The index of the hovered glyph: a text of 12 px in its box.
    const spot = (await glyphSpots(page)).find((g) => g.id === 'morph-to-glyph-20')!;
    await page.mouse.move(spot.x, spot.y);
    const [index] = await rects(page, '.rg-index > rect');
    expect(index!.bottom - index!.top).toBeCloseTo(16.2, 0);
    return (await page.getByTestId('morph-canvas').boundingBox())!;
  };
  // Side by side, as it opens, the badges are on the arcs; stacked, in the gap.
  await expect(page.getByTestId('morph-canvas')).toHaveAttribute('data-layout', 'side');
  await showAll(page);
  await sized();
  await page.getByTestId('morph-toggle-layout').click();
  await expect(page.getByTestId('morph-canvas')).toHaveAttribute('data-layout', 'stacked');
  await showAll(page);
  const normal = await sized();
  // A larger drawing draws the formulas larger; what is the screen's stays as it was.
  await page.getByTestId('morph-editor-maximize').click();
  await expect
    .poll(async () => (await page.getByTestId('morph-canvas').boundingBox())!.width)
    .toBeGreaterThan(normal.width + 100);
  await sized();
  await page.getByTestId('morph-toggle-layout').click();
  await showAll(page);
  await sized();
});

/** How near the view is, as its label says: 100 is the whole drawing. */
const zoomOf = async (page: Page): Promise<number> =>
  Number((await page.getByTestId('morph-zoom-label').textContent())!.replace('%', ''));

/** The glyphs whose ink is all inside the drawing's element. */
async function inView(page: Page): Promise<Spot[]> {
  const drawing = (await page.getByTestId('morph-canvas').boundingBox())!;
  return (await glyphSpots(page)).filter(
    (spot) =>
      spot.left >= drawing.x &&
      spot.left + spot.width <= drawing.x + drawing.width &&
      spot.top >= drawing.y &&
      spot.top + spot.height <= drawing.y + drawing.height,
  );
}

test('Ctrl/⌘ + wheel zooms about the pointer, the keys of the corner step, and «Fit» shows all', async ({
  page,
}) => {
  await openSteps(page);
  const drawing = page.getByTestId('morph-canvas');
  // The whole drawing first: 100, which «Fit» does not offer again.
  await showAll(page);
  const box = (await drawing.boundingBox())!;
  expect(await zoomOf(page)).toBe(100);
  expect(await inView(page)).toHaveLength(2 * STEPS);

  const at = async (id: string) => (await glyphSpots(page)).find((spot) => spot.id === id)!;
  const before = await at('morph-from-glyph-21');
  await page.mouse.move(before.x, before.y);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.wheel(0, -300);
  await expect.poll(() => zoomOf(page)).toBe(182);
  await page.keyboard.up('ControlOrMeta');
  // The glyph under the pointer is still under it, and 1.82 times as large.
  // (Within the pixel the wheel says it is on: the pointer may be between two.)
  const after = await at('morph-from-glyph-21');
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  expect(after.width / before.width).toBeCloseTo(1.82, 1);
  expect(await aimed(page)).toBe('morph-from-glyph-21');
  // The element is as it was: the view changed, not the drawing's box.
  expect((await drawing.boundingBox())!).toEqual(box);
  expect((await inView(page)).length).toBeLessThan(2 * STEPS);
  // What is the screen's kept its size: the circle of the selector, a badge.
  const ring = (await page.getByTestId('morph-reach').locator('.rg-reach-ring').boundingBox())!;
  expect(ring.width / 2).toBeGreaterThan(13.5);
  expect(ring.width / 2).toBeLessThan(15.5);
  const [badge] = await rects(page, '.rg-badge > rect');
  expect(badge!.bottom - badge!.top).toBeCloseTo(15.4, 0);

  // The keys step by a quarter about the middle of the drawing.
  await page.getByTestId('morph-zoom-in').click();
  expect(await zoomOf(page)).toBe(228);
  await page.getByTestId('morph-zoom-out').click();
  await page.getByTestId('morph-zoom-out').click();
  expect(await zoomOf(page)).toBe(146);
  // A plain wheel is the dialog's: it zooms nothing.
  await page.mouse.move(before.x, before.y);
  await page.mouse.wheel(0, -300);
  expect(await zoomOf(page)).toBe(146);

  await expect(page.getByTestId('morph-view-fit')).toBeEnabled();
  await page.getByTestId('morph-view-fit').click();
  expect(await zoomOf(page)).toBe(100);
  await expect(page.getByTestId('morph-view-fit')).toBeDisabled();
  expect(await inView(page)).toHaveLength(2 * STEPS);
  const back = await at('morph-from-glyph-21');
  expect(Math.abs(back.x - before.x)).toBeLessThan(0.5);
  expect(back.width).toBeCloseTo(before.width, 1);
});

test('the middle button, or Alt + drag, moves the view; the drag is not a click, and Escape takes it back', async ({
  page,
}) => {
  await openSteps(page);
  await showAll(page);
  await page.getByTestId('morph-zoom-in').click();
  await page.getByTestId('morph-zoom-in').click();
  const at = async (id: string) => (await glyphSpots(page)).find((spot) => spot.id === id)!;
  // A glyph in the middle of what the view shows: the nearest to the centre of the drawing.
  const frame = (await page.getByTestId('morph-canvas').boundingBox())!;
  const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const far = (spot: Spot) => Math.hypot(spot.x - centre.x, spot.y - centre.y);
  const GLYPH = (await inView(page)).reduce((a, b) => (far(b) < far(a) ? b : a)).id;
  const start = await at(GLYPH);

  // The middle button: the drawing follows the pointer.
  await page.mouse.move(start.x + 30, start.y + 30);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(start.x + 60, start.y + 50, { steps: 4 });
  await expect(page.getByTestId('morph-canvas')).toHaveClass(/is-panning/);
  // While it moves the view the pointer aims at nothing.
  await expect(page.getByTestId('morph-reach')).toHaveCount(0);
  await page.mouse.up({ button: 'middle' });
  await expect(page.getByTestId('morph-canvas')).not.toHaveClass(/is-panning/);
  const moved = await at(GLYPH);
  expect(moved.x - start.x).toBeCloseTo(30, 0);
  expect(moved.y - start.y).toBeCloseTo(20, 0);

  // Alt and the main button, pressed on a glyph: the view moves and the glyph is not taken.
  await page.keyboard.down('Alt');
  await page.mouse.move(moved.x, moved.y);
  await page.mouse.down();
  await page.mouse.move(moved.x - 40, moved.y - 10, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const again = await at(GLYPH);
  expect(again.x - moved.x).toBeCloseTo(-40, 0);
  expect(again.y - moved.y).toBeCloseTo(-10, 0);
  await expect(page.locator('[data-testid^="morph-"][data-selected="true"]')).toHaveCount(0);
  // Without a drag, Alt + click is a click.
  await page.keyboard.down('Alt');
  await page.mouse.click(again.x, again.y);
  await page.keyboard.up('Alt');
  await expect(page.getByTestId(GLYPH)).toHaveAttribute('data-selected', 'true');
  await page.getByTestId('morph-clear-selection').click();

  // Escape while the view is held puts it back, and the editor stays.
  await page.mouse.move(again.x + 30, again.y + 30);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(again.x + 130, again.y + 90, { steps: 4 });
  expect((await at(GLYPH)).x - again.x).toBeCloseTo(100, 0);
  await page.keyboard.press('Escape');
  expect((await at(GLYPH)).x).toBeCloseTo(again.x, 0);
  await page.mouse.up({ button: 'middle' });
  await expect(page.getByTestId('morph-editor')).toBeVisible();
  // The drawing cannot be moved out of sight: its centre stays in the element.
  await page.mouse.move(again.x + 30, again.y + 30);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(again.x + 5000, again.y + 30, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  expect((await inView(page)).length).toBeGreaterThan(0);
});

test('the drawing opens framed on what takes part, and «Fit» shows the rest', async ({ page }) => {
  await openSteps(page, 'a_m_left', firstLineArrives());
  await expect(page.getByTestId('morph-summary')).toContainText('10 can arrive');
  // What takes part is nearer stacked — the last lines of the sources over the first of the
  // targets — than side by side, where it is as tall as the formula: the drawing opens stacked.
  await expect(page.getByTestId('morph-canvas')).toHaveAttribute('data-layout', 'stacked');
  // Nearer than the whole drawing, which «Fit» offers.
  expect(await zoomOf(page)).toBeGreaterThan(130);
  await expect(page.getByTestId('morph-view-fit')).toBeEnabled();
  // Every glyph that can take part is in sight: the sources of the four lines on screen, the
  // targets of the line that arrives.
  const eligible = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="morph-canvas"] [data-eligible="true"]')].map(
      (el) => el.getAttribute('data-testid')!,
    ),
  );
  expect(eligible).toHaveLength(STEPS);
  const seen = new Set((await inView(page)).map((spot) => spot.id));
  expect(eligible.filter((id) => !seen.has(id))).toEqual([]);
  // And not all of the drawing: what cannot take part at its far ends is left out.
  expect(seen.size).toBeLessThan(2 * STEPS);
  expect(seen.has('morph-from-glyph-0')).toBe(false);

  await page.getByTestId('morph-view-fit').click();
  expect(await zoomOf(page)).toBe(100);
  expect(await inView(page)).toHaveLength(2 * STEPS);
});

test('the relation editor keeps the view of its drawing while a preview takes its place', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, readExample('hello.mfe.json'));
  await selectClips(page, ['c_a1']);
  await page.getByTestId('relation-edit-r_a1_f2').click();
  const editor = page.getByTestId('relation-editor');
  await expect(editor.getByTestId('rel-from-glyph-0')).toBeVisible();
  // Every glyph of the two formulas can take part: the drawing opens whole.
  const label = editor.getByTestId('rel-zoom-label');
  await expect(label).toHaveText('100%');
  await expect(editor.getByTestId('rel-view-fit')).toBeDisabled();
  const whole = (await editor.getByTestId('rel-canvas').boundingBox())!;
  const glyph = async () => (await editor.getByTestId('rel-from-glyph-0').boundingBox())!;
  /** The glyph is where and as large as `box` says, to a hundredth of a pixel. */
  const glyphIs = async (box: { x: number; y: number; width: number; height: number }) => {
    const now = await glyph();
    for (const side of ['x', 'y', 'width', 'height'] as const) {
      expect(now[side]).toBeCloseTo(box[side], 1);
    }
  };
  const fitted = await glyph();

  // Nearer and moved.
  await editor.getByTestId('rel-zoom-in').click();
  await editor.getByTestId('rel-zoom-in').click();
  await page.mouse.move(whole.x + 40, whole.y + 60);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(whole.x + 90, whole.y + 100, { steps: 3 });
  await page.mouse.up({ button: 'middle' });
  await expect(label).toHaveText('156%');
  const left = await glyph();
  expect(left.width).toBeGreaterThan(fitted.width * 1.5);

  // The transformation takes the drawing's place, and the drawing comes back as it was left.
  await editor.getByTestId('rel-view-preview').click();
  await expect(editor.getByTestId('rel-canvas')).toHaveCount(0);
  await editor.getByTestId('rel-view-link').click();
  await expect(label).toHaveText('156%');
  await glyphIs(left);
  // The raw preview shows the two formulas whole, in the box of the drawing, whatever its view.
  await editor.getByTestId('rel-raw-open').click();
  const raw = (await editor.getByTestId('rel-raw-canvas').boundingBox())!;
  expect(raw.width).toBeCloseTo(whole.width, 0);
  expect(raw.height).toBeCloseTo(whole.height, 0);
  await editor.getByTestId('rel-raw-end').click();
  await expect(label).toHaveText('156%');
  await glyphIs(left);
  await editor.getByTestId('rel-view-fit').click();
  await expect(label).toHaveText('100%');
  await glyphIs(fitted);
});

/** `examples/hello.mfe.json` with other formulas as its source and its target, and nothing
 * linked. */
function helloWith(source: string, target: string): string {
  const project = JSON.parse(readExample('hello.mfe.json')) as {
    formulas: {
      id: string;
      source: string;
      snapshot: unknown;
      glyphColors: Record<string, string>;
      hiddenGlyphs: number[];
    }[];
    clips: { actions: unknown[] }[];
    relations: { pairs: unknown[] }[];
  };
  const sources: Record<string, string> = { f_a1: source, f_f2: target };
  for (const formula of project.formulas) {
    formula.source = sources[formula.id]!;
    formula.snapshot = null;
    formula.glyphColors = {};
    formula.hiddenGlyphs = [];
  }
  for (const clip of project.clips) clip.actions = [];
  for (const relation of project.relations) relation.pairs = [];
  return JSON.stringify(project);
}

/** Open the relation editor on the relation of `helloWith`. */
async function openHelloWith(page: Page, source: string, target: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, helloWith(source, target));
  await selectClips(page, ['c_a1']);
  await page.getByTestId('relation-edit-r_a1_f2').click();
  const editor = page.getByTestId('relation-editor');
  await expect(editor.getByTestId('rel-from-glyph-0')).toBeVisible();
  return editor;
}

test('stacked, the keys of the view are over no glyph of a source as wide as the drawing', async ({
  page,
}) => {
  // A source of one long line, wider than its target: stacked, the drawing is as wide as the
  // source, whose last terms are under the corner that the keys of the view are over.
  const editor = await openHelloWith(
    page,
    'a_1x_1+a_2x_2+a_3x_3+a_4x_4+a_5x_5+a_6x_6=b',
    'a_1x_1+a_2x_2+a_3x_3=b',
  );
  // A long line opens stacked and whole.
  await expect(editor.getByTestId('rel-canvas')).toHaveAttribute('data-layout', 'stacked');
  await expect(editor.getByTestId('rel-zoom-label')).toHaveText('100%');
  const { keys, sources } = await page.evaluate(() => {
    const rect = (el: Element) => {
      const { left, top, right, bottom } = el.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    return {
      keys: rect(document.querySelector('[data-testid="rel-stage"] .rel-view-tools')!),
      sources: [...document.querySelectorAll('[data-testid^="rel-from-glyph-"] > path')].map(
        (path) => ({ id: path.parentElement!.getAttribute('data-testid')!, ...rect(path) }),
      ),
    };
  });
  expect(sources).toHaveLength(31);
  // The line ends under the keys: they are over the corner of the drawing, not beside it.
  const last = sources.reduce((a, b) => (b.right > a.right ? b : a));
  expect(last.right).toBeGreaterThan(keys.left + 100);
  // And over no glyph of it: the drawing leaves the height of the keys over its source.
  expect(sources.filter((glyph) => meet(glyph, keys)).map((glyph) => glyph.id)).toEqual([]);
  expect(Math.min(...sources.map((glyph) => glyph.top))).toBeGreaterThan(keys.bottom);
  // A press on the last glyph is the glyph's, not a key's.
  await page.mouse.click((last.left + last.right) / 2, (last.top + last.bottom) / 2);
  await expect(editor.getByTestId(last.id)).toHaveAttribute('data-selected', 'true');
  await expect(editor.getByTestId('rel-zoom-label')).toHaveText('100%');
});

test('a short formula opens stacked: either layout draws it large', async ({ page }) => {
  // Two glyphs over one. Side by side they would be larger still, and no better for it.
  const editor = await openHelloWith(page, 'xx', 'x^2');
  const drawing = editor.getByTestId('rel-canvas');
  await expect(drawing).toHaveAttribute('data-layout', 'stacked');
  await expect(editor.getByTestId('rel-zoom-label')).toHaveText('100%');
  const ink = editor.locator('[data-testid="rel-from-glyph-0"] > path');
  expect((await ink.boundingBox())!.height).toBeGreaterThan(32);
  // The key lays it side by side all the same.
  await editor.getByTestId('rel-toggle-layout').click();
  await expect(drawing).toHaveAttribute('data-layout', 'side');
});

test('a formula taller than wide opens side by side: each line beside its own, the links as arcs over them', async ({
  page,
}) => {
  await openSteps(page);
  const drawing = page.getByTestId('morph-canvas');
  const key = page.getByTestId('morph-toggle-layout');
  await expect(drawing).toHaveAttribute('data-layout', 'side');
  await expect(key).toHaveAttribute('aria-pressed', 'true');
  await expect(drawing).toHaveAccessibleName(
    'The formula twice: the sources at the left, the targets at the right',
  );
  await expect(page.getByTestId('morph-editor').locator('.rel-hint').first()).toContainText(
    'the sources at the left',
  );
  await showAll(page);
  const side = await glyphSpots(page);
  const of = (spots: Spot[], id: string) => spots.find((spot) => spot.id === id)!;
  // The two copies are beside each other: a glyph of the targets is at the height of the same
  // glyph of the sources, and to its right.
  for (const index of [0, 30, 79]) {
    const source = of(side, `morph-from-glyph-${index}`);
    const target = of(side, `morph-to-glyph-${index}`);
    expect(target.y).toBeCloseTo(source.y, 0);
    expect(target.x).toBeGreaterThan(source.x + 100);
  }
  // Its glyphs are larger than stacked, in the same dialog.
  const sideWidth = of(side, 'morph-from-glyph-10').width;
  // A link is an arc over its glyphs: its badge is above the source and the target it joins
  // (pair 1 is glyph 10 → glyph 23).
  const [badge] = await rects(page, '[data-testid="morph-junction-0"] > rect');
  expect(badge!.bottom).toBeLessThan(of(side, 'morph-from-glyph-10').top);
  expect(badge!.bottom).toBeLessThan(of(side, 'morph-to-glyph-23').top);
  expect(badge!.left).toBeGreaterThan(of(side, 'morph-from-glyph-10').left);
  expect(badge!.right).toBeLessThan(of(side, 'morph-to-glyph-23').left + 60);

  // The key stacks the two: the sources over the targets, the links through the gap.
  await key.click();
  await expect(drawing).toHaveAttribute('data-layout', 'stacked');
  await expect(key).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('morph-editor').locator('.rel-hint').first()).toContainText(
    'the sources on top',
  );
  await showAll(page);
  const stacked = await glyphSpots(page);
  for (const index of [0, 30, 79]) {
    const source = of(stacked, `morph-from-glyph-${index}`);
    const target = of(stacked, `morph-to-glyph-${index}`);
    expect(target.x).toBeCloseTo(source.x, 0);
    expect(target.y).toBeGreaterThan(source.y + 100);
  }
  expect(sideWidth).toBeGreaterThan(of(stacked, 'morph-from-glyph-10').width * 1.3);
  const [between] = await rects(page, '[data-testid="morph-junction-0"] > rect');
  expect(between!.top).toBeGreaterThan(of(stacked, 'morph-from-glyph-10').top);
  expect(between!.bottom).toBeLessThan(of(stacked, 'morph-to-glyph-23').top);
  // The choice is the editor's while it is open: a link made, the layout is the same.
  await page.mouse.click(
    of(stacked, 'morph-from-glyph-30').x,
    of(stacked, 'morph-from-glyph-30').y,
  );
  await expect(page.getByTestId('morph-from-glyph-30')).toHaveAttribute('data-selected', 'true');
  await expect(drawing).toHaveAttribute('data-layout', 'stacked');
  await key.click();
  await expect(drawing).toHaveAttribute('data-layout', 'side');
  // What was selected is still selected: the layout is only how the drawing shows it.
  await expect(page.getByTestId('morph-from-glyph-30')).toHaveAttribute('data-selected', 'true');
});

test('wide formulas open stacked; side by side on its key, the raw preview follows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, readExample('hello.mfe.json'));
  await selectClips(page, ['c_a1']);
  await page.getByTestId('relation-edit-r_a1_f2').click();
  const editor = page.getByTestId('relation-editor');
  const drawing = editor.getByTestId('rel-canvas');
  await expect(editor.getByTestId('rel-from-glyph-0')).toBeVisible();
  await expect(drawing).toHaveAttribute('data-layout', 'stacked');
  await expect(editor.getByTestId('rel-toggle-layout')).toHaveAttribute('aria-pressed', 'false');
  await expect(editor.locator('.rel-hint').first()).toContainText('The source is on top');
  const stacked = (await drawing.boundingBox())!;

  await editor.getByTestId('rel-toggle-layout').click();
  await expect(drawing).toHaveAttribute('data-layout', 'side');
  await expect(editor.locator('.rel-hint').first()).toContainText('The source is at the left');
  await expect(drawing).toHaveAccessibleName(
    'Glyphs of the two formulas: the source at the left, the target at the right',
  );
  // Two formulas in a row make a lower drawing than one over the other.
  const side = (await drawing.boundingBox())!;
  expect(side.height).toBeLessThan(stacked.height - 50);
  const source = (await editor.getByTestId('rel-from-glyph-0').boundingBox())!;
  const target = (await editor.getByTestId('rel-to-glyph-0').boundingBox())!;
  expect(target.x).toBeGreaterThan(source.x + 100);
  expect(Math.abs(target.y - source.y)).toBeLessThan(source.height);

  // The raw preview takes the box of the drawing as it is laid out, and says so.
  await editor.getByTestId('rel-raw-open').click();
  const raw = editor.getByTestId('rel-raw-canvas');
  await expect(raw).toHaveAccessibleName(
    'The glyphs going from the source, at the left, to the target, at the right',
  );
  const rawBox = (await raw.boundingBox())!;
  expect(rawBox.width).toBeCloseTo(side.width, 0);
  expect(rawBox.height).toBeCloseTo(side.height, 0);
  await editor.getByTestId('rel-raw-end').click();
  await expect(drawing).toHaveAttribute('data-layout', 'side');
  await editor.getByTestId('rel-toggle-layout').click();
  await expect(drawing).toHaveAttribute('data-layout', 'stacked');
  expect((await drawing.boundingBox())!.height).toBeCloseTo(stacked.height, 0);
});
