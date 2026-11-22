import { expect, test, type Page } from './test';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createEndsAttach,
  createEndsTween,
  createFormula,
  createLineFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  serializeProject,
  type LineFormula,
  type Project,
  type Target,
} from '../src/model';
import {
  onSystem,
  openAnimationsTab,
  openSubmenu,
  openWithProject,
  selectionOf,
  setTime,
  undo,
  type MfeWindow,
} from './helpers';
import { buildLine } from '../src/geom';
import { clickScene, pixelAt, scenePoint } from './previewHelpers';
import { openRelationScene, plain } from './relationsHelpers';
import { box, timeToX } from './timelineHelpers';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** "a+b=c" up on the left (clip `a`) and "x^2" down on the right (clip `b`), both over [0, 8); a
 * white line from (−4, −2) to (−1, −2) over the same time (`free`), and a yellow arrow from the
 * first formula to the second from 1 s (`arrow`), each on a track of its own in front. */
function linesProject(target: Target): Project {
  const project = createEmptyProject();
  project.meta.target = target;
  project.meta.name = 'Lines';
  const f1 = { ...createFormula({ name: 'f1', source: 'a+b=c' }), id: 'f1' };
  const f2 = { ...createFormula({ name: 'f2', source: 'x^2' }), id: 'f2' };
  const l1 = { ...createLineFormula({ name: 'l1', vector: [3, 0] }), id: 'l1' };
  const l2 = { ...createLineFormula({ name: 'l2', line: 'arrow', color: '#FFFF00' }), id: 'l2' };
  const [t1, t2] = project.tracks;
  const t3 = createTrack('Track 3');
  const t4 = createTrack('Track 4');
  project.tracks.unshift(t4, t3);
  const a = { ...createClip(f1.id, t1!.id, 0, 8, none), id: 'a' };
  a.initial.position = [-3, 1.5];
  const b = { ...createClip(f2.id, t2!.id, 0, 8, none), id: 'b' };
  b.initial.position = [3, -1];
  const free = { ...createClip(l1.id, t3.id, 0, 8, none), id: 'free' };
  free.initial.position = [-2.5, -2];
  const arrow = {
    ...createClip(l2.id, t4.id, 1, 8, {
      ...none,
      attach: createEndsAttach(
        { clipId: 'a', glyphs: 'all' },
        { clipId: 'b', glyphs: 'all' },
        0.25,
      ),
    }),
    id: 'arrow',
  };
  project.formulas.push(f1, f2, l1, l2);
  project.clips.push(a, b, free, arrow);
  return project;
}

/** The line objects and their clips, from the store. */
async function lines(page: Page) {
  return page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const project = mfe.useProjectStore.getState().project as unknown as Project;
    const object = (id: string) => project.formulas.find((f) => f.id === id) as LineFormula;
    const clip = (id: string) => project.clips.find((c) => c.id === id)!;
    return {
      l1: object('l1'),
      l2: object('l2'),
      free: clip('free'),
      arrow: clip('arrow'),
      issues: mfe.parseProject(JSON.stringify(project)).ok,
    };
  });
}

const bright = (rgb: number[]) => rgb[0]! + rgb[1]! + rgb[2]!;

for (const target of ['ce', 'gl'] as const) {
  test(`a project with lines opens: a free line between its ends, an arrow fitted to two formulas (${target})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await openWithProject(page, serializeProject(linesProject(target)));
    await setTime(page, 2);
    // The arrow's vector is derived from where the two formulas are: down and to the right, a
    // little shorter than between their centres; its clip is placed by them.
    await expect.poll(async () => (await lines(page)).l2.vector[0]).toBeGreaterThan(3);
    const found = await lines(page);
    expect(found.issues).toBe(true);
    expect(found.l2.vector[1]).toBeLessThan(-1);
    expect(Math.hypot(...found.l2.vector)).toBeLessThan(Math.hypot(6, 2.5));
    expect(found.arrow.initial.position[0]).toBeGreaterThan(-1);
    expect(found.arrow.initial.position[0]).toBeLessThan(1);
    // The free line is where its clip puts it, as long as its object says.
    expect(found.l1.vector).toEqual([3, 0]);
    expect(found.free.initial.position).toEqual([-2.5, -2]);
    // Both are drawn: white along the free line, nothing beside it; yellow at the arrow's middle.
    expect(bright(await pixelAt(page, [-2.5, -2]))).toBeGreaterThan(400);
    expect(bright(await pixelAt(page, [-2.5, -1.6]))).toBeLessThan(60);
    const middle = found.arrow.initial.position;
    const [r, g, bl] = await pixelAt(page, [middle[0], middle[1]]);
    expect(r! + g!).toBeGreaterThan(380);
    expect(bl!).toBeLessThan(120);
    // Before the arrow's clip starts there is none.
    await setTime(page, 0.5);
    expect(bright(await pixelAt(page, [middle[0], middle[1]]))).toBeLessThan(60);
  });
}

/* --- Drawn through the UI ------------------------------------------------------------------ */

const F1: [number, number] = [-3, 1.5];
const F2: [number, number] = [3, -1.5];

/** f1 (a+b=c) up on the left and f2 (a=3+1) down on the right, both over [0, 8), with no
 * animation; the playhead at 2 s. */
async function openTwo(page: Page): Promise<void> {
  const a = plain('a', 'fa', 't1', 0, 8);
  a.initial.position = F1;
  const b = plain('b', 'fb', 't2', 0, 8);
  b.initial.position = F2;
  await openRelationScene(page, [a, b]);
  await setTime(page, 2);
}

/** «Add line ▸ `line`» from the menu of clip `a` on the timeline: the line starts on that clip,
 * and the compass asks where on it. */
async function addLineFrom(page: Page, line: string): Promise<void> {
  const clip = await box(page.getByTestId('clip-a'));
  await page.mouse.click(await timeToX(page, 3), clip.y + clip.height - 6, { button: 'right' });
  await openSubmenu(page, 'add-line');
  await page.getByTestId(`add-line-${line}`).click();
  await expect(page.getByTestId('line-draw-surface')).toBeVisible();
  await expect(page.getByTestId('line-compass')).toBeVisible();
}

/** «Add line ▸ `line`» from the menu of the preview's empty space: two clicks put its ends. */
async function addLineFree(page: Page, line: string): Promise<void> {
  const empty = await scenePoint(page, [0, 3.5]);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await page.getByTestId(`preview-space-line-${line}`).click();
  await expect(page.getByTestId('line-draw-surface')).toBeVisible();
  await expect(page.getByTestId('line-compass')).toHaveCount(0);
}

/** Answer the compass: `auto`, or one of its nine directions. */
async function anchor(page: Page, choice: string): Promise<void> {
  await page.getByTestId('line-compass').getByTestId(`compass-${choice}`).click();
  await expect(page.getByTestId('line-compass')).toHaveCount(0);
}

/** The line object and its clip, from the store (the first of each). */
async function drawn(page: Page) {
  return page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const project = mfe.useProjectStore.getState().project as unknown as Project;
    const object = project.formulas.find((f) => f.kind === 'line') as LineFormula | undefined;
    const clip = project.clips.find((c) => c.formulaId === object?.id);
    return {
      object,
      clip,
      tracks: project.tracks.map((t) => t.id),
      lines: project.formulas.filter((f) => f.kind === 'line').length,
      selection: mfe.useUiStore.getState().selection,
    };
  });
}

/** Where a handle of the selected line is, in scene units. */
async function handleAt(page: Page, side: 'start' | 'end'): Promise<[number, number]> {
  const handle = page.getByTestId(`line-end-${side}`);
  return [Number(await handle.getAttribute('data-x')), Number(await handle.getAttribute('data-y'))];
}

/** Drag the `side` handle of the selected line to a scene point, with `keys` held from the middle
 * of the drag to the drop. */
async function dragEnd(
  page: Page,
  side: 'start' | 'end',
  to: [number, number],
  keys: ('Alt' | 'Shift' | 'ControlOrMeta')[] = [],
) {
  const from = await box(page.getByTestId(`line-end-${side}`));
  const target = await scenePoint(page, to);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x - 3, target.y, { steps: 6 });
  await expect(page.getByTestId('line-rubber')).toBeVisible();
  for (const key of keys) await page.keyboard.down(key);
  await page.mouse.move(target.x, target.y, { steps: 2 });
  await page.mouse.up();
  for (const key of keys) await page.keyboard.up(key);
}

/** How many of the preview's pixels around a scene point are of the colour of the picks (the
 * yellow of the default preference): a formula marked as what an end would go on has many. */
async function marked(page: Page, [x, y]: [number, number]): Promise<number> {
  const a = await scenePoint(page, [x - 1.2, y + 0.5]);
  const b = await scenePoint(page, [x + 1.2, y - 0.5]);
  return page.evaluate(
    ([x0, y0, x1, y1]) => {
      const el = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const rect = el.getBoundingClientRect();
      const k = el.width / rect.width;
      const left = Math.round((x0 - rect.left) * k);
      const top = Math.round((y0 - rect.top) * k);
      const width = Math.round((x1 - x0) * k);
      const height = Math.round((y1 - y0) * k);
      const { data } = el.getContext('2d')!.getImageData(left, top, width, height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! > 200 && data[i + 1]! > 180 && data[i + 2]! < 140) count++;
      }
      return count;
    },
    [a.x, a.y, b.x, b.y] as const,
  );
}

type Ends = { start: Record<string, unknown>; end: Record<string, unknown>; buff: number };

test('Add line ▸ Arrow on a formula starts there: its point is asked, one click puts the end, on a track in front', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFrom(page, 'arrow');
  // The start is the formula of the menu: the compass asks where on it, and it is marked.
  const hint = page.getByTestId('line-draw-hint');
  await expect(hint).toContainText('Arrow: choose where on f1 it starts');
  await expect(page.getByTestId('line-compass')).toContainText('Start: which point of “f1”');
  await expect.poll(() => marked(page, F1)).toBeGreaterThan(40);
  await anchor(page, 'DR');
  await expect(hint).toContainText('Arrow from f1: where it ends');
  // The formula under the pointer is marked as what the end would go on; empty space is not.
  expect(await marked(page, F2)).toBeLessThan(5);
  const over = await scenePoint(page, F2);
  await page.mouse.move(over.x, over.y);
  await expect.poll(() => marked(page, F2)).toBeGreaterThan(40);
  await page.mouse.move(over.x, over.y - 150);
  await expect.poll(() => marked(page, F2)).toBeLessThan(5);
  // One click on the other formula, and its point: the line is made.
  await clickScene(page, F2);
  await expect(page.getByTestId('line-compass')).toContainText('End: which point of “f2”');
  expect((await drawn(page)).lines).toBe(0);
  await anchor(page, 'auto');
  // The mode is over, and the arrow is there, selected: from the playhead to where both end.
  await expect(page.getByTestId('line-draw-surface')).toHaveCount(0);
  const { object, clip, tracks, selection } = await drawn(page);
  expect(object).toMatchObject({ name: 'l1', line: 'arrow', strokeWidth: 6, color: '#FFFFFF' });
  expect(clip).toMatchObject({
    start: 2,
    end: 8,
    intro: { kind: 'none' },
    attach: {
      rule: 'ends',
      start: { clipId: 'a', glyphs: 'all', anchor: 'dr' },
      end: { clipId: 'b', glyphs: 'all', anchor: 'auto' },
      buff: 0.25,
    },
  });
  expect(selection).toEqual({ kind: 'clips', ids: [clip!.id] });
  // In front of both: a new track above the first one.
  expect(tracks).toHaveLength(4);
  expect(tracks.indexOf(clip!.trackId)).toBe(tracks.indexOf('t1') - 1);
  // Fitted to them: down and to the right, and drawn.
  await expect.poll(async () => (await drawn(page)).object!.vector[0]).toBeGreaterThan(2);
  const fitted = await drawn(page);
  expect(fitted.object!.vector[1]).toBeLessThan(-1);
  const middle = fitted.clip!.initial.position;
  expect(bright(await pixelAt(page, [middle[0], middle[1]]))).toBeGreaterThan(400);
  // Its two handles are at its ends, each saying what it is on, in a colour of its own. The start
  // leaves the lower right corner of the first formula: right of its centre and below it.
  const start = await handleAt(page, 'start');
  const end = await handleAt(page, 'end');
  expect(end[0] - start[0]).toBeCloseTo(fitted.object!.vector[0], 3);
  expect(end[1] - start[1]).toBeCloseTo(fitted.object!.vector[1], 3);
  expect(start[0]).toBeGreaterThan(F1[0] + 0.3);
  expect(start[1]).toBeLessThan(F1[1]);
  const startHandle = page.getByTestId('line-end-start');
  await expect(startHandle).toHaveAttribute('data-on', 'a');
  await expect(startHandle).toHaveAttribute('data-anchor', 'dr');
  await expect(page.getByTestId('line-end-end')).toHaveAttribute('data-anchor', 'auto');
  const colour = (side: string) =>
    page
      .getByTestId(`line-end-${side}`)
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await colour('start')).not.toBe(await colour('end'));
  // One undo step takes it back, with its track; redo brings it again.
  await undo(page);
  expect((await drawn(page)).lines).toBe(0);
  expect((await drawn(page)).tracks).toHaveLength(3);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await drawn(page)).lines).toBe(1);
});

test('Escape on the compass gives that end up, then the mode; a press elsewhere asks for another place', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFrom(page, 'line');
  await page.keyboard.press('Escape');
  // The start is not put: the mode waits for it, and a click on empty space is a free start.
  await expect(page.getByTestId('line-compass')).toHaveCount(0);
  await expect(page.getByTestId('line-draw-hint')).toContainText('Line: where it starts');
  await clickScene(page, F1);
  await expect(page.getByTestId('line-compass')).toContainText('Start: which point of “f1”');
  // A click on the other formula instead: the compass asks about that one.
  await clickScene(page, F2);
  await expect(page.getByTestId('line-compass')).toContainText('Start: which point of “f2”');
  // The keyboard answers: «Auto» has the focus, and Enter takes it.
  await expect(page.getByTestId('compass-auto')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('line-compass').getByTestId('compass-DOWN')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('line-draw-hint')).toContainText('Line from f2: where it ends');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('line-draw-surface')).toHaveCount(0);
  expect((await drawn(page)).lines).toBe(0);
});

test('a selected line shows no handles at its ends while the scene plays', async ({ page }) => {
  await openTwo(page);
  await addLineFree(page, 'dashed');
  await clickScene(page, [-5, -2]);
  await clickScene(page, [-2, -3]);
  await expect(page.getByTestId('line-end-start')).toBeVisible();
  await expect(page.getByTestId('line-end-end')).toBeVisible();
  // Nothing of the scene answers the pointer then (`pointerReach.ts`): its ends are not dragged.
  await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setPlaying(true));
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-pointer-reach', 'none');
  await expect(page.getByTestId('line-end-start')).toHaveCount(0);
  await expect(page.getByTestId('line-end-end')).toHaveCount(0);
  await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setPlaying(false));
  await expect(page.getByTestId('line-end-start')).toBeVisible();
});

test('the menu of the empty space draws with two clicks: a free end at each, Escape leaves the mode', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFree(page, 'dashed');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('line-draw-surface')).toHaveCount(0);
  expect((await drawn(page)).lines).toBe(0);
  // Two free points: a dashed line with no attachment, exactly between them.
  await addLineFree(page, 'dashed');
  await expect(page.getByTestId('line-draw-hint')).toContainText('Dashed line: where it starts');
  await clickScene(page, [-5, -2]);
  await expect(page.getByTestId('line-draw-start')).toBeVisible();
  await expect(page.getByTestId('line-draw-hint')).toContainText('from a point');
  // A second click on the same spot makes nothing, and the mode stays on.
  await clickScene(page, [-5, -2]);
  await expect(page.getByTestId('notice').filter({ hasText: 'No line made' })).toHaveCount(1);
  await expect(page.getByTestId('line-draw-surface')).toBeVisible();
  await clickScene(page, [-2, -3]);
  const { object, clip } = await drawn(page);
  expect(object).toMatchObject({ line: 'dashed', strokeWidth: 4 });
  expect(clip!.attach).toBeNull();
  expect(object!.vector[0]).toBeCloseTo(3, 1);
  expect(object!.vector[1]).toBeCloseTo(-1, 1);
  const start = await handleAt(page, 'start');
  expect(start[0]).toBeCloseTo(-5, 1);
  expect(start[1]).toBeCloseTo(-2, 1);
  await expect(page.getByTestId('line-end-start')).toHaveAttribute('data-on', '');
});

test('both ends on one formula at Auto are refused, drawn or dragged: Manim finds no line between them', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFrom(page, 'arrow');
  await anchor(page, 'auto');
  // The end on the same formula, at Auto too: no line, a notice says why, and the mode waits
  // for another place.
  await clickScene(page, F1);
  await anchor(page, 'auto');
  await expect(page.getByTestId('notice').filter({ hasText: 'No line made' })).toContainText(
    'The two ends are at one place: click somewhere else for the end.',
  );
  await expect(page.getByTestId('line-draw-surface')).toBeVisible();
  expect((await drawn(page)).lines).toBe(0);
  await clickScene(page, F2);
  await anchor(page, 'auto');
  await expect(page.getByTestId('line-draw-surface')).toHaveCount(0);
  const made = (await drawn(page)).clip!.attach;
  expect(made).toMatchObject({
    start: { clipId: 'a', glyphs: 'all', anchor: 'auto' },
    end: { clipId: 'b', glyphs: 'all', anchor: 'auto' },
  });
  // Its end dragged onto the formula of its start, at Auto: the end stays, a notice says why.
  await dragEnd(page, 'end', F1, ['Alt', 'Shift']);
  await expect(page.getByTestId('line-compass')).toContainText('End: which point of “f1”');
  await anchor(page, 'auto');
  await expect(page.getByTestId('notice').filter({ hasText: 'The end stays' })).toContainText(
    'The two ends would be at one place.',
  );
  expect((await drawn(page)).clip!.attach).toEqual(made);
});

test('from a point to a formula: the arrow ends at its gap from the formula and starts where it was put', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFree(page, 'arrow');
  await clickScene(page, [-5, -2.5]);
  await clickScene(page, F2);
  await anchor(page, 'auto');
  await expect.poll(async () => (await drawn(page)).object!.vector[0]).toBeGreaterThan(3);
  const { clip } = await drawn(page);
  expect(clip!.attach).toMatchObject({
    rule: 'ends',
    end: { clipId: 'b', glyphs: 'all', anchor: 'auto' },
  });
  // Manim leaves the gap at the free end too: the point it is given is further out, so that
  // the arrow drawn starts where the click was.
  const start = await handleAt(page, 'start');
  expect(start[0]).toBeCloseTo(-5, 1);
  expect(start[1]).toBeCloseTo(-2.5, 1);
  const given = (clip!.attach as { start: { point: [number, number] } }).start.point;
  expect(Math.hypot(given[0] - start[0], given[1] - start[1])).toBeCloseTo(0.25, 2);
});

test('a dragged end is left free where it is dropped; with Alt it goes on a symbol, with Alt+Shift on a formula', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFree(page, 'line');
  // Alt+click on the middle of f1: the start is the symbol there, at the point chosen.
  const glyphA = await scenePoint(page, F1);
  await page.keyboard.down('Alt');
  await page.mouse.click(glyphA.x, glyphA.y);
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('line-compass')).toContainText('which point of “symbols of f1”');
  await anchor(page, 'CENTER');
  await expect(page.getByTestId('line-draw-hint')).toContainText('from symbols of f1');
  await clickScene(page, [0, -3]);
  const attach = async () => (await drawn(page)).clip!.attach as Ends | null;
  expect(await attach()).toMatchObject({ start: { clipId: 'a', anchor: 'center' }, buff: 0 });
  expect((await attach())!.start.glyphs).toHaveLength(1);
  expect('point' in (await attach())!.end).toBe(true);
  // Dropped on the second formula with no key: free, right there — it goes on nothing by itself.
  await dragEnd(page, 'end', F2);
  await expect(page.getByTestId('line-compass')).toHaveCount(0);
  let dropped = (await attach())!.end.point as [number, number];
  expect(dropped[0]).toBeCloseTo(F2[0], 1);
  expect(dropped[1]).toBeCloseTo(F2[1], 1);
  await expect(page.getByTestId('line-end-end')).toHaveAttribute('data-on', '');
  // With Alt and Shift held at the drop: onto the whole formula, once its point is chosen. The
  // formula is marked meanwhile; Escape leaves the end as it was.
  await dragEnd(page, 'end', F2, ['Alt', 'Shift']);
  await expect(page.getByTestId('line-compass')).toContainText('End: which point of “f2”');
  await expect.poll(() => marked(page, F2)).toBeGreaterThan(40);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('line-compass')).toHaveCount(0);
  expect('point' in (await attach())!.end).toBe(true);
  await dragEnd(page, 'end', F2, ['Alt', 'Shift']);
  await anchor(page, 'LEFT');
  expect(await attach()).toMatchObject({ end: { clipId: 'b', glyphs: 'all', anchor: 'left' } });
  await expect(page.getByTestId('line-end-end')).toHaveAttribute('data-on', 'b');
  // The end is drawn at the left edge of the formula: left of its centre, at its height.
  const left = await handleAt(page, 'end');
  expect(left[0]).toBeLessThan(F2[0] - 0.4);
  expect(left[1]).toBeCloseTo(F2[1], 1);
  // With Alt alone: onto the symbol under the pointer.
  await dragEnd(page, 'end', [F2[0] + 0.05, F2[1]], ['Alt']);
  await expect(page.getByTestId('line-compass')).toContainText('symbols of f2');
  await anchor(page, 'auto');
  expect((await attach())!.end.glyphs).toHaveLength(1);
  // With no key again: free where it was dropped, even over a formula's symbols.
  await dragEnd(page, 'end', [1, 2.5]);
  dropped = (await attach())!.end.point as [number, number];
  expect(dropped[0]).toBeCloseTo(1, 1);
  expect(dropped[1]).toBeCloseTo(2.5, 1);
  // And the start too: with both ends free the line hangs on nothing.
  await dragEnd(page, 'start', [-1, 3]);
  const free = await drawn(page);
  expect(free.clip!.attach).toBeNull();
  expect(free.object!.vector[0]).toBeCloseTo(2, 1);
  expect(free.object!.vector[1]).toBeCloseTo(-0.5, 1);
  // Each move was one undo step.
  await undo(page);
  expect(await attach()).toMatchObject({ end: { point: dropped } });
});

test('an end is freed from its own menu and from the clip’s; its point is changed from the menu and the panel', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFrom(page, 'arrow');
  await anchor(page, 'auto');
  await clickScene(page, F2);
  await anchor(page, 'UL');
  await expect.poll(async () => (await drawn(page)).object!.vector[0]).toBeGreaterThan(3);
  const attach = async () => (await drawn(page)).clip!.attach as Ends | null;
  // The menu of the end's handle: what it is on, «Detach» and its point again.
  await page.getByTestId('line-end-end').click({ button: 'right' });
  await expect(page.getByTestId('line-end-menu-header')).toHaveText(
    'End · on f2, upper left corner',
  );
  await page.getByTestId('line-end-menu-anchor').click();
  const compass = page.getByTestId('line-compass');
  await expect(compass.getByTestId('compass-UL')).toHaveAttribute('aria-pressed', 'true');
  await expect(compass.getByTestId('compass-UL')).toBeFocused();
  await anchor(page, 'DOWN');
  expect(await attach()).toMatchObject({ end: { clipId: 'b', anchor: 'down' } });
  // The panel's field does the same.
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('line-end-anchor')).toHaveValue('down');
  // Each point of the list has its name and, after it, the arrow the compass shows for it.
  const points = await page.getByTestId('line-end-anchor').locator('option').allTextContents();
  expect(points).toHaveLength(10);
  expect(points[0]).toBe('Auto');
  expect(points[1]).toMatch(/^Upper left corner\s↖$/);
  expect(points[8]).toMatch(/^Bottom edge\s↓$/);
  await page.getByTestId('line-start-anchor').selectOption('ur');
  expect(await attach()).toMatchObject({ start: { clipId: 'a', anchor: 'ur' } });
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText(
    'l1 = Arrow(f1.get_corner(UR), f2.get_bottom())',
  );
  await page.getByTestId('export-python-close').click();
  // «Detach» there: the end is free where it was drawn, and its menu says so.
  const before = await handleAt(page, 'end');
  await page.getByTestId('line-end-end').click({ button: 'right' });
  await page.getByTestId('line-end-menu-detach').click();
  expect('point' in (await attach())!.end).toBe(true);
  const after = await handleAt(page, 'end');
  expect(after[0]).toBeCloseTo(before[0], 2);
  expect(after[1]).toBeCloseTo(before[1], 2);
  await page.getByTestId('line-end-end').click({ button: 'right' });
  await expect(page.getByTestId('line-end-menu-header')).toHaveText('End · free');
  await expect(page.getByTestId('line-end-menu-detach')).toBeDisabled();
  await expect(page.getByTestId('line-end-menu-anchor')).toBeDisabled();
  await page.keyboard.press('Escape');
  // The clip's menu on the timeline: «Detach ›», with an entry for each end, marked with its
  // colour — the free one has nothing to detach —, and one for both.
  const lineClip = (await drawn(page)).clip!;
  const row = await box(page.getByTestId(`clip-${lineClip.id}`));
  const openClipMenu = () =>
    page.mouse.click(row.x + row.width / 2, row.y + row.height - 6, { button: 'right' });
  await openClipMenu();
  await expect(page.getByTestId('clip-menu-detach-ends')).toHaveText('Detach›');
  await expect(page.getByTestId('clip-menu-detach-start')).toHaveCount(0);
  await openSubmenu(page, 'clip-menu-detach-ends');
  const detachStart = page.getByTestId('clip-menu-detach-start');
  await expect(detachStart).toHaveText('Detach start');
  await expect(page.getByTestId('clip-menu-detach-end')).toBeDisabled();
  await expect(page.getByTestId('clip-menu-detach-all')).toHaveText('Detach all');
  const dot = (side: string) =>
    page
      .getByTestId(`clip-menu-detach-${side}`)
      .locator('.line-end-dot')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await dot('start')).not.toBe(await dot('end'));
  expect(await dot('start')).toBe(
    await page
      .getByTestId('line-end-start')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  );
  await detachStart.click();
  expect(await attach()).toBeNull();
  // A line with both ends free has nothing to detach: the entry is off.
  await openClipMenu();
  await expect(page.getByTestId('clip-menu-detach-ends')).toBeDisabled();
  await page.keyboard.press('Escape');
  await undo(page);
  expect(await attach()).toMatchObject({ start: { clipId: 'a', anchor: 'ur' } });
  // «Detach all», with both ends on formulas: one step frees them where they are drawn.
  await undo(page);
  expect(await attach()).toMatchObject({ start: { clipId: 'a' }, end: { clipId: 'b' } });
  const ends = [await handleAt(page, 'start'), await handleAt(page, 'end')];
  await openClipMenu();
  await openSubmenu(page, 'clip-menu-detach-ends');
  await expect(page.getByTestId('clip-menu-detach-end')).toBeEnabled();
  await page.getByTestId('clip-menu-detach-all').click();
  expect(await attach()).toBeNull();
  const freed = [await handleAt(page, 'start'), await handleAt(page, 'end')];
  for (const i of [0, 1]) {
    expect(freed[i]![0]).toBeCloseTo(ends[i]![0], 2);
    expect(freed[i]![1]).toBeCloseTo(ends[i]![1], 2);
  }
  await undo(page);
  expect(await attach()).toMatchObject({ start: { clipId: 'a' }, end: { clipId: 'b' } });
});

test('a line’s menu offers what a line takes: a plain Transform, no part, no morph, nothing that scales it', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFree(page, 'arrow');
  await clickScene(page, [-5, -3]);
  await clickScene(page, [-2, -3]);
  const lineClip = (await drawn(page)).clip!;
  const row = await box(page.getByTestId(`clip-${lineClip.id}`));
  await page.mouse.click(row.x + row.width / 2, row.y + row.height - 6, { button: 'right' });
  // Transform is one entry that says what it does: nothing of a formula's.
  const transform = page.getByTestId('add-animation-tween');
  await expect(transform).toHaveText('Transformends · stroke · colour');
  await expect(page.getByTestId('add-animation-group-transform')).toHaveCount(0);
  await expect(page.getByTestId('add-animation-morph')).toHaveCount(0);
  await expect(page.getByTestId('add-animation-menu')).not.toContainText('formula');
  // What draws it or fades it — and, as it is an arrow, what grows it from its start —, and no
  // more.
  await openSubmenu(page, 'add-animation-group-appear');
  const appear = page.getByTestId('add-animation-group-appear-submenu');
  await expect(appear.getByRole('menuitem')).toHaveCount(4);
  await expect(page.getByTestId('add-animation-grow_arrow')).toHaveText('GrowArrow');
  await expect(appear).not.toContainText('GrowFromCenter');
  await openSubmenu(page, 'add-animation-group-disappear');
  const disappear = page.getByTestId('add-animation-group-disappear-submenu');
  await expect(disappear.getByRole('menuitem')).toHaveCount(3);
  await expect(disappear).not.toContainText('Shrink');
  await openSubmenu(page, 'add-animation-group-emphasis');
  const emphasis = page.getByTestId('add-animation-group-emphasis-submenu');
  await expect(emphasis).not.toContainText('Indicate');
  await expect(emphasis).not.toContainText('Wiggle');
  // The Transform it adds is the line's: a place, an opacity, a colour.
  await transform.click();
  const actions = (await drawn(page)).clip!.actions;
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ kind: 'tween' });
});

test('the Line section edits the line; a line between two clips is freed when one goes; it exports as an Arrow', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFrom(page, 'line');
  await anchor(page, 'auto');
  await clickScene(page, F2);
  await anchor(page, 'auto');
  await expect.poll(async () => (await drawn(page)).object!.vector[0]).toBeGreaterThan(3);
  // The panel says what each end is on, and makes the line an arrow: Manim's stroke and gap for
  // an arrow come with it.
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('line-start-on')).toHaveText('on f1');
  await expect(page.getByTestId('line-end-on')).toHaveText('on f2');
  await expect(page.getByTestId('line-start-anchor')).toHaveValue('auto');
  await expect(page.getByTestId('line-gap')).toHaveValue('0');
  await page.getByTestId('line-kind-field').selectOption('arrow');
  let state = await drawn(page);
  expect(state.object).toMatchObject({ line: 'arrow', strokeWidth: 6 });
  expect(state.clip!.attach).toMatchObject({ buff: 0.25 });
  await expect(page.getByTestId('line-tip')).toHaveValue('0.35');
  // It has no scale, turn or flip to set.
  await expect(page.getByTestId('initial-x')).toBeDisabled();
  await expect(page.getByTestId('initial-scale')).toHaveCount(0);
  await expect(page.getByTestId('initial-rotation')).toHaveCount(0);
  // Only the animations a line takes are offered.
  const intros = await page.getByTestId('intro-kind').locator('option').allTextContents();
  expect(intros.some((label) => label.includes('GrowFromCenter'))).toBe(false);
  expect(intros.some((label) => label.includes('Create'))).toBe(true);
  // The Python builds it on the two formulas.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText('l1 = Arrow(f1, f2)');
  await page.getByTestId('export-python-close').click();
  // «Detach» on an end leaves it free where it is; the other one stays on its formula.
  const before = await handleAt(page, 'end');
  await page.getByTestId('line-end-free').click();
  await expect(page.getByTestId('line-end-on')).toHaveText('free');
  await expect(page.getByTestId('line-end-anchor')).toHaveCount(0);
  state = await drawn(page);
  expect(state.clip!.attach).toMatchObject({ start: { clipId: 'a' } });
  const after = await handleAt(page, 'end');
  expect(after[0]).toBeCloseTo(before[0], 2);
  expect(after[1]).toBeCloseTo(before[1], 2);
  await undo(page);
  // Deleting one of its two clips frees the line where it is: it is not deleted with it.
  await page.getByTestId('clip-b').click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('Delete');
  state = await drawn(page);
  expect(state.lines).toBe(1);
  expect(state.clip!.attach).toBeNull();
  await undo(page);
  expect((await drawn(page)).clip!.attach).toMatchObject({ end: { clipId: 'b' } });
  // On a locked track its ends stay: the handle says why, and a drag moves nothing.
  const lineClip = (await drawn(page)).clip!;
  await page.evaluate((trackId) => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      const track = (draft as unknown as Project).tracks.find((t) => t.id === trackId);
      if (track) track.locked = true;
    });
    mfe.history.clear();
  }, lineClip.trackId);
  await page.evaluate((id) => {
    (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: [id] });
  }, lineClip.id);
  await expect(page.getByTestId('line-end-end')).toHaveAttribute('data-locked', 'true');
  await dragEnd(page, 'end', [0, 3]);
  await expect(page.getByTestId('notice').filter({ hasText: 'The end stays' })).toHaveCount(1);
  expect((await drawn(page)).clip!.attach).toMatchObject({ end: { clipId: 'b' } });
});

test('a free line is dragged by its body; one with an end on glyphs stays, and says why', async ({
  page,
}) => {
  await openTwo(page);
  await addLineFree(page, 'line');
  await clickScene(page, [-5, -3]);
  await clickScene(page, [-2, -3]);
  const before = (await drawn(page)).clip!.initial.position;
  // Press on the middle of the line and drag it up by one unit.
  const from = await scenePoint(page, [-3.5, -3]);
  const to = await scenePoint(page, [-3.5, -2]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const moved = (await drawn(page)).clip!.initial.position;
  expect(moved[1] - before[1]).toBeCloseTo(1, 1);
  expect((await handleAt(page, 'start'))[1]).toBeCloseTo(-2, 1);
  // With its end on a formula it is its ends that move it: the body stays.
  await dragEnd(page, 'end', F2, ['Alt', 'Shift']);
  await anchor(page, 'auto');
  await expect.poll(async () => (await drawn(page)).clip!.attach).not.toBeNull();
  const held = (await drawn(page)).clip!.initial.position;
  const middle = await scenePoint(page, [held[0], held[1]]);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y - 80, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('notice').filter({ hasText: 'Detach to move' })).toHaveCount(1);
  expect((await drawn(page)).clip!.initial.position[1]).toBeCloseTo(held[1], 3);
});

test('with Ctrl held a dragged end stays on the line’s own axis: the line only grows or shrinks', async ({
  page,
}) => {
  await openTwo(page);
  // An arrow from the lower right corner of f1 to a free point, down and to the right.
  await addLineFrom(page, 'arrow');
  await anchor(page, 'DR');
  await clickScene(page, [1, -1]);
  await expect.poll(async () => (await drawn(page)).object!.vector[0]).toBeGreaterThan(1);
  const before = (await drawn(page)).object!.vector;
  const start = await handleAt(page, 'start');
  const slope = before[1] / before[0];
  // Dragged far off to the side with Ctrl held: the end lands on the same line, further out,
  // and the rubber band says the drag is kept on it.
  await dragEnd(page, 'end', [4, 2], ['ControlOrMeta']);
  let after = (await drawn(page)).object!.vector;
  expect(after[1] / after[0]).toBeCloseTo(slope, 2);
  expect(Math.hypot(...after)).toBeGreaterThan(Math.hypot(...before) + 0.5);
  const end = await handleAt(page, 'end');
  expect((end[1] - start[1]) / (end[0] - start[0])).toBeCloseTo(slope, 2);
  // The start has not moved, and is still on its corner; the end is free.
  expect((await handleAt(page, 'start'))[0]).toBeCloseTo(start[0], 2);
  expect((await handleAt(page, 'start'))[1]).toBeCloseTo(start[1], 2);
  const attach = (await drawn(page)).clip!.attach as Ends | null;
  expect(attach).toMatchObject({ start: { clipId: 'a', anchor: 'dr' } });
  expect('point' in attach!.end).toBe(true);
  // Back towards the start: shorter, the same way; and never through the other end.
  await dragEnd(page, 'end', [start[0] + 0.5, start[1] + 1], ['ControlOrMeta']);
  after = (await drawn(page)).object!.vector;
  expect(after[1] / after[0]).toBeCloseTo(slope, 1);
  expect(after[0]).toBeGreaterThan(0);
  expect(Math.hypot(...after)).toBeLessThan(Math.hypot(...before));
  // Without the key the same drag goes where the pointer is.
  await dragEnd(page, 'end', [4, 2]);
  after = (await drawn(page)).object!.vector;
  expect(after[1]).toBeGreaterThan(0);
});

/* --- Curves and tips (D145, D146) ---------------------------------------------------------- */

/** The project of `linesProject`, its playhead at 2 s, with `clipId` selected by its menu on the
 * timeline open. */
async function openMenuOf(page: Page, clipId: string): Promise<void> {
  const clip = await box(page.getByTestId(`clip-${clipId}`));
  await page.mouse.click(await timeToX(page, 3), clip.y + clip.height - 6, { button: 'right' });
}

test('a line is bent into an arc from its menu; its degrees are a field and a handle in the preview; an arrow takes another tip', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(linesProject('ce')));
  await setTime(page, 2);
  // «Curve ▸ Arc» on the free line: thirty degrees, its two ends where they were.
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-curve');
  await page.getByTestId('clip-menu-curve-arc').click();
  await expect
    .poll(async () => (await lines(page)).l1.curve)
    .toEqual({ shape: 'arc', degrees: 30, trim: 0 });
  await page.getByTestId('clip-free').click({ position: { x: 60, y: 10 } });
  expect(await handleAt(page, 'start')).toEqual([-4, -2]);
  expect(await handleAt(page, 'end')).toEqual([-1, -2]);
  // The arc bulges under the line between its ends: there is the stroke, the middle is empty.
  expect(bright(await pixelAt(page, [-2.5, -2]))).toBeLessThan(60);
  // The Line section says what it is, and its field sets the degrees.
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('line-curve')).toHaveText('arc');
  await expect(page.getByTestId('line-bend-arc')).toHaveCount(0);
  const field = page.getByTestId('line-arc');
  await expect(field).toHaveValue('30');
  await field.fill('60');
  await field.press('Enter');
  await expect.poll(async () => (await lines(page)).l1.curve).toMatchObject({ degrees: 60 });
  expect(await handleAt(page, 'end')).toEqual([-1, -2]);
  // The handle of the arc: dragged up and to the right of the start, with Shift held, the line
  // leaves its start at 45° over the line between its ends — an arc of −90°. One undo step.
  const handle = page.getByTestId('line-arc-handle');
  await expect(handle).toHaveAttribute('data-degrees', '60');
  await expect(page.getByTestId('line-arc-reading')).toHaveText('60°');
  const from = await box(handle);
  const mid = await scenePoint(page, [-3.5, -1.8]);
  const to = await scenePoint(page, [-3, -1]);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(mid.x, mid.y, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await lines(page)).l1.curve).toMatchObject({ degrees: -90 });
  await expect(page.getByTestId('line-arc-reading')).toHaveText('-90°');
  expect(await handleAt(page, 'start')).toEqual([-4, -2]);
  await undo(page);
  expect((await lines(page)).l1.curve).toMatchObject({ degrees: 60 });
  // The arrow between the two formulas: bent, the gap it leaves is along the arc; a stealth tip.
  await page.getByTestId('clip-arrow').click({ position: { x: 60, y: 10 } });
  await expect(page.getByTestId('line-tip-shape')).toHaveValue('triangle');
  await expect(page.getByTestId('line-start-tip-shape')).toHaveCount(0);
  await page.getByTestId('line-tip-shape').selectOption('stealth');
  await page.getByTestId('line-bend-arc').click();
  await expect
    .poll(async () => (await lines(page)).l2)
    .toMatchObject({ tip: 'stealth', curve: { shape: 'arc', degrees: 30 } });
  await expect.poll(async () => (await lines(page)).l2.curve).toMatchObject({ shape: 'arc' });
  const bent = (await lines(page)).l2.curve as { trim: number };
  expect(bent.trim).toBeGreaterThan(0.01);
  expect(bent.trim).toBeLessThan(0.2);
  // The Python names both.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  const code = page.getByTestId('export-python-code');
  await expect(code).toContainText('path_arc=60 * DEGREES');
  await expect(code).toContainText(
    'l2 = Arrow(f1, f2, path_arc=30 * DEGREES, color="#FFFF00", tip_shape=StealthTip)',
  );
  await page.getByTestId('export-python-close').click();
  // An arrow can come in with GrowArrow, from its start: a line without a tip is not offered it.
  const intros = () => page.getByTestId('intro-kind').locator('option').allTextContents();
  expect(await intros()).toContain('GrowArrow');
  await page.getByTestId('intro-kind').selectOption('grow_arrow');
  expect((await lines(page)).arrow.intro).toMatchObject({ kind: 'grow_arrow', duration: 1 });
  await page.getByTestId('clip-free').click({ position: { x: 60, y: 10 } });
  expect(await intros()).not.toContain('GrowArrow');
  await page.getByTestId('clip-arrow').click({ position: { x: 60, y: 10 } });
  // A double arrow says the shape of each tip.
  await page.getByTestId('line-kind-field').selectOption('double_arrow');
  await page.getByTestId('line-start-tip-shape').selectOption('dot');
  expect((await lines(page)).l2).toMatchObject({ tip: 'stealth', startTip: 'dot' });
});

test('a Transform of a line carries its ends: the handles move them with the playhead on it, the panel says where they go', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(linesProject('ce')));
  await setTime(page, 3);
  /** The tween of the free line, from the store. */
  const tween = async () => {
    const action = (await lines(page)).free.actions[0];
    if (action?.kind !== 'tween') throw new Error('no tween');
    return action;
  };
  // «Transform» from the line's menu, at 3 s: it starts with the ends the line has, so nothing
  // moves yet, and says no position — its ends place the line.
  await openMenuOf(page, 'free');
  await page.getByTestId('add-animation-tween').click();
  await expect.poll(async () => (await lines(page)).free.actions.length).toBe(1);
  expect(await tween()).toMatchObject({
    start: 3,
    ends: { start: { point: [-4, -2] }, end: { point: [-1, -2] }, degrees: null },
  });
  expect((await tween()).to.position).toBeUndefined();
  await expect
    .poll(async () => (await tween()).ends?.drawn)
    .toMatchObject({ start: [-4, -2], end: [-1, -2], center: [-2.5, -2] });
  // With the playhead on the Transform, the handle of an end moves that end of it: the line's
  // clip starts as it did.
  await setTime(page, 3.5);
  await page.getByTestId('clip-free').click({ position: { x: 60, y: 10 } });
  await dragEnd(page, 'end', [-1, -3.5]);
  const moved = (await tween()).ends!.end as { point: [number, number] };
  expect(moved.point[0]).toBeCloseTo(-1, 1);
  expect(moved.point[1]).toBeCloseTo(-3.5, 1);
  expect((await lines(page)).l1.vector).toEqual([3, 0]);
  expect((await lines(page)).free.initial.position).toEqual([-2.5, -2]);
  // After it the line runs between its new ends, and its handles are there; before it, where
  // it started.
  await setTime(page, 5);
  expect(await handleAt(page, 'start')).toEqual([-4, -2]);
  expect((await handleAt(page, 'end'))[1]).toBeCloseTo(-3.5, 1);
  const [ex, ey] = moved.point;
  expect(bright(await pixelAt(page, [(-4 + ex) / 2, (-2 + ey) / 2]))).toBeGreaterThan(400);
  expect(bright(await pixelAt(page, [-1.5, -2]))).toBeLessThan(60);
  await setTime(page, 2);
  expect(await handleAt(page, 'end')).toEqual([-1, -2]);
  expect(bright(await pixelAt(page, [-1.5, -2]))).toBeGreaterThan(400);
  // The panel of the Transform: where each end goes, and no position; its fields move them.
  await setTime(page, 5);
  await openAnimationsTab(page, 'timing');
  const id = (await tween()).id;
  await expect(page.getByTestId(`tween-${id}-ends`)).toBeVisible();
  await expect(page.getByTestId(`tween-${id}-position-on`)).toHaveCount(0);
  const y = page.getByTestId(`tween-${id}-ends-start-y`);
  await expect(y).toHaveValue('-2');
  await y.fill('-3');
  await y.press('Enter');
  await expect.poll(async () => (await tween()).ends?.start).toEqual({ point: [-4, -3] });
  await expect.poll(async () => handleAt(page, 'start')).toEqual([-4, -3]);
  // Its stroke width is the Transform's to change.
  await page.getByTestId(`tween-${id}-stroke-width-on`).check();
  expect((await tween()).to.strokeWidth).toBe(4);
  // An end goes on a formula with Alt+Shift, as an end of the clip's own does.
  await dragEnd(page, 'end', [3, -1], ['Alt', 'Shift']);
  await expect(page.getByTestId('line-compass')).toContainText('End: which point of “f2”');
  await anchor(page, 'LEFT');
  expect((await tween()).ends).toMatchObject({
    end: { clipId: 'b', glyphs: 'all', anchor: 'left' },
  });
  await expect(page.getByTestId(`tween-${id}-ends-end-on`)).toHaveText('on f2');
  await expect(page.getByTestId('line-end-end')).toHaveAttribute('data-on', 'b');
  expect((await lines(page)).issues).toBe(true);
  // It exports as Manim's put_start_and_end_on, the two points read off a line on the glyphs.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText(
    'l1.animate.put_start_and_end_on(l1_at.get_start(), l1_at.get_end())',
  );
});

test('the blocks of an arrow are changed only into what an arrow takes, from their menu and their panel', async ({
  page,
}) => {
  // `linesProject`'s arrow with an Appear, an Emphasis and a Disappear block it takes.
  const project = linesProject('ce');
  const arrow = project.clips.find((clip) => clip.id === 'arrow')!;
  arrow.actions.push(
    { ...createAppear(0.5, 'create', 'all'), id: 'ap' },
    { ...createEmphasis(2.5, 'circumscribe', 'all'), id: 'em' },
    { ...createDisappear(5, 'fade_out', 'all'), id: 'di' },
  );
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(project));
  const testIds = (prefix: string) =>
    page
      .locator(`[data-testid^="${prefix}"]`)
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-testid')));
  const optionValues = (testId: string) =>
    page
      .getByTestId(testId)
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  const block = async (id: string) =>
    (await lines(page)).arrow.actions.find((action) => action.id === id)!;
  // «Change animation»: what draws, fades or grows an arrow from its start, nothing that grows or
  // shrinks it about its centre.
  await page.getByTestId('action-block-ap').click({ button: 'right' });
  await expect(page.getByTestId('block-menu')).toBeVisible();
  expect(await testIds('block-menu-change-')).toEqual([
    'block-menu-change-write',
    'block-menu-change-create',
    'block-menu-change-fade_in',
    'block-menu-change-grow_arrow',
    'block-menu-change-fade_out',
    'block-menu-change-unwrite',
    'block-menu-change-uncreate',
  ]);
  await page.getByTestId('block-menu-change-grow_arrow').click();
  expect(await block('ap')).toMatchObject({ kind: 'appear', anim: 'grow_arrow' });
  // «Change effect»: only what draws something of its own, never Indicate nor Wiggle.
  await page.getByTestId('action-block-em').click({ button: 'right' });
  expect(await testIds('block-menu-effect-')).toEqual([
    'block-menu-effect-circumscribe',
    'block-menu-effect-flash',
    'block-menu-effect-focus_on',
  ]);
  await page.keyboard.press('Escape');
  // The panel's selects offer the same.
  await page.getByTestId('action-block-di').click();
  expect(await optionValues('block-anim')).toEqual([
    'appear:write',
    'appear:create',
    'appear:fade_in',
    'appear:grow_arrow',
    'disappear:fade_out',
    'disappear:unwrite',
    'disappear:uncreate',
  ]);
  await page.getByTestId('action-block-em').click();
  expect(await optionValues('block-effect')).toEqual(['circumscribe', 'flash', 'focus_on']);
  await page.getByTestId('block-effect').selectOption('flash');
  expect(await block('em')).toMatchObject({ effect: 'flash' });
  // Whatever it runs, it takes the whole arrow: its menu has no split (audit A5-07).
  await page.getByTestId('action-block-em').click({ button: 'right' });
  await expect(page.getByTestId('block-menu-duplicate')).toBeVisible();
  expect(await testIds('block-menu-split')).toEqual([]);
  expect(await testIds('block-menu-duplicate-others')).toEqual([]);
  await page.keyboard.press('Escape');
  const errors = await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const text = JSON.stringify(mfe.useProjectStore.getState().project);
    const parsed = mfe.parseProject(text) as unknown as {
      issues: { severity: string; code: string }[];
    };
    return parsed.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code);
  });
  expect(errors).toEqual([]);
});

test('a block of an arrow takes all of it: no glyph picker nor split, and one on a part is an error its panel mends', async ({
  page,
}) => {
  // The Python names an arrow's shaft by the arrow, whose family holds its tip (audit A5-07): the
  // arrow of `linesProject` with a Create of all of it, and a FadeOut of its shaft alone, as a
  // file may have it.
  const project = linesProject('ce');
  const arrow = project.clips.find((clip) => clip.id === 'arrow')!;
  arrow.actions.push(
    { ...createAppear(0.5, 'create', 'all'), id: 'ap' },
    { ...createDisappear(5, 'fade_out', [0]), id: 'di' },
  );
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(project));
  const block = async (id: string) =>
    (await lines(page)).arrow.actions.find((action) => action.id === id) as { glyphs: unknown };
  const errors = () =>
    page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      const text = JSON.stringify(mfe.useProjectStore.getState().project);
      const parsed = mfe.parseProject(text) as unknown as {
        issues: { severity: string; code: string; path: (string | number)[] }[];
      };
      return parsed.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => `${issue.code} ${issue.path.join('.')}`);
    });
  expect(await errors()).toEqual(['arrow-part clips.3.actions.1.glyphs']);
  const hint =
    'An arrow is animated whole, its shaft and its tips together, as Manim does: a block takes all of it, and is not split.';
  // The panel of a block of it says so where the glyph picker and the splits are for a formula.
  const panel = page.getByTestId('block-properties');
  await page.getByTestId('action-block-ap').click();
  await expect(panel.getByTestId('block-glyphs-whole')).toHaveText(hint);
  for (const id of [
    'block-glyph-picker',
    'block-split-runs',
    'block-split',
    'block-duplicate-others',
  ]) {
    await expect(panel.getByTestId(id)).toHaveCount(0);
  }
  // Its menu on the timeline has no split, nor a copy for other glyphs.
  await page.getByTestId('action-block-ap').click({ button: 'right' });
  const menu = page.getByTestId('block-menu');
  await expect(menu.getByTestId('block-menu-duplicate')).toBeVisible();
  for (const id of ['block-menu-split', 'block-menu-split-runs', 'block-menu-duplicate-others']) {
    await expect(menu.getByTestId(id)).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  // Its dialog has its fields alone, which say so, without the arrow to pick glyphs on.
  await page.getByTestId('action-block-ap').dblclick();
  const dialog = page.getByTestId('block-dialog');
  await expect(dialog.getByTestId('block-glyphs-whole')).toHaveText(hint);
  await expect(dialog.getByTestId('block-dialog-whole')).toHaveCount(0);
  await expect(dialog.getByTestId('block-dialog-glyphs')).toHaveCount(0);
  await expect(dialog.getByTestId('block-glyph-picker')).toHaveCount(0);
  await expect(dialog.getByTestId('block-glyphs-aside')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // The FadeOut of the shaft alone: its error says how to mend it, and its panel does.
  await page.getByTestId('action-block-di').click();
  await expect(panel.getByTestId('block-issues')).toContainText(
    '"l2" is an arrow: a block animates it whole, its shaft and its tips together, as Manim does, and this one names a part of it. Set its glyphs to all with All glyphs in its panel.',
  );
  await panel.getByTestId('block-glyphs-all-whole').click();
  expect((await block('di')).glyphs).toBe('all');
  expect(await errors()).toEqual([]);
  await expect(panel.getByTestId('block-issues')).toHaveCount(0);
  await expect(panel.getByTestId('block-glyphs-all-whole')).toHaveCount(0);
  // One step: Undo brings the file's part back.
  await undo(page);
  expect((await block('di')).glyphs).toEqual([0]);
});

test('«Appears with» of an arrow offers GrowArrow, and its «Default» is an intro an arrow takes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(linesProject('ce')));
  // The editor's preference (Edit → Default intro & outro…): GrowFromCenter, always added.
  await page.evaluate((intro) => {
    const preferences = (window as MfeWindow).__mfe!.usePreferences.getState() as unknown as {
      set(patch: { autoIntro: boolean; intro: unknown }): void;
    };
    preferences.set({ autoIntro: true, intro });
  }, defaultIntro('grow_from_center'));
  const state = () =>
    page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      const project = mfe.useProjectStore.getState().project as unknown as Project;
      const parsed = mfe.parseProject(JSON.stringify(project)) as unknown as
        { ok: true; issues: { severity: string; code: string }[] } | { ok: false };
      return {
        objectIntro: project.formulas.find((f) => f.id === 'l2')!.intro,
        clipIntro: project.clips.find((c) => c.id === 'arrow')!.intro.kind,
        errors: parsed.ok
          ? parsed.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code)
          : ['refused'],
      };
    });
  // The arrow's editor: its choices are an arrow's — GrowArrow among them, nothing that grows
  // it from its centre —, and «Default» names what it gives an arrow.
  await page.getByTestId('clip-arrow').dblclick();
  const select = page.getByTestId('editor-intro');
  await expect(select).toBeVisible();
  const values = await select
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(values).toEqual(['', 'none', 'write', 'fade_in', 'create', 'grow_arrow']);
  await expect(select.locator('option').first()).toHaveText('Default (none)');
  // GrowArrow: the object and its clip take it, and the select shows it.
  await select.selectOption('grow_arrow');
  await expect.poll(async () => (await state()).objectIntro?.kind).toBe('grow_arrow');
  await expect(select).toHaveValue('grow_arrow');
  expect((await state()).clipIntro).toBe('grow_arrow');
  // «Default»: the preference's GrowFromCenter is no arrow's, so none, and the project is valid.
  await select.selectOption('');
  await expect.poll(async () => (await state()).objectIntro).toBeNull();
  expect(await state()).toMatchObject({ clipIntro: 'none', errors: [] });
});

test('deleting the clip a Transform put an end of an arrow on leaves that end where the arrow was drawn', async ({
  page,
}) => {
  // `linesProject`'s arrow hangs on nothing, and a Transform at 2 s carries its ends onto the
  // two formulas, at a gap.
  const project = linesProject('ce');
  const arrow = project.clips.find((clip) => clip.id === 'arrow')!;
  arrow.attach = null;
  arrow.initial.position = [0, 3];
  arrow.actions.push({
    ...createEndsTween(1, 1, {
      start: { clipId: 'a', glyphs: 'all', anchor: 'auto' },
      end: { clipId: 'b', glyphs: 'all', anchor: 'auto' },
      buff: 0.25,
    }),
    id: 'carry',
  });
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(project));
  await setTime(page, 4);
  const ends = async () => {
    const action = (await lines(page)).arrow.actions[0];
    if (action?.kind !== 'tween' || !action.ends) throw new Error('no ends');
    return action.ends;
  };
  await expect.poll(async () => (await ends()).drawn).not.toBeNull();
  const before = (await ends()).drawn!;
  await page.getByTestId('clip-b').click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('Delete');
  await expect.poll(async () => 'point' in (await ends()).end).toBe(true);
  // The end on the second formula is free, the other still on the first, and the arrow is
  // drawn where it was: Manim is given the point its gap further out.
  const after = await ends();
  expect(after.start).toMatchObject({ clipId: 'a', glyphs: 'all', anchor: 'auto' });
  for (const side of ['start', 'end'] as const) {
    expect(after.drawn![side][0]).toBeCloseTo(before[side][0], 5);
    expect(after.drawn![side][1]).toBeCloseTo(before[side][1], 5);
  }
  const given = (after.end as { point: [number, number] }).point;
  expect(Math.hypot(given[0] - before.end[0], given[1] - before.end[1])).toBeCloseTo(0.25, 3);
});

test('the start of a Transform’s ends moved to another formula, or detached, leaves its free end where it is drawn', async ({
  page,
}) => {
  // `linesProject`'s arrow hangs on nothing, and a Transform at 2 s carries its start onto the
  // first formula and its end to a point, at a gap.
  const project = linesProject('ce');
  const arrow = project.clips.find((clip) => clip.id === 'arrow')!;
  arrow.attach = null;
  arrow.initial.position = [0, 3];
  arrow.actions.push({
    ...createEndsTween(1, 1, {
      start: { clipId: 'a', glyphs: 'all', anchor: 'auto' },
      end: { point: [3, 2] },
      buff: 0.25,
    }),
    id: 'carry',
  });
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(project));
  await setTime(page, 4);
  const ends = async () => {
    const action = (await lines(page)).arrow.actions[0];
    if (action?.kind !== 'tween' || !action.ends) throw new Error('no ends');
    return action.ends;
  };
  await expect.poll(async () => (await ends()).drawn).not.toBeNull();
  await page.getByTestId('clip-arrow').click({ position: { x: 60, y: 10 } });
  const free = await handleAt(page, 'end');
  const stays = async () => {
    const end = await handleAt(page, 'end');
    return Math.hypot(end[0] - free[0], end[1] - free[1]);
  };
  // The start onto the second formula, with the playhead after the Transform: its start moves.
  await dragEnd(page, 'start', [3, -1], ['Alt', 'Shift']);
  await expect(page.getByTestId('line-compass')).toContainText('Start: which point of “f2”');
  await anchor(page, 'auto');
  await expect.poll(async () => (await ends()).start).toMatchObject({ clipId: 'b' });
  expect(await stays()).toBeLessThan(0.002);
  // «Detach» of the start from its handle's menu: both free now, the end still where it was.
  await page.getByTestId('line-end-start').click({ button: 'right' });
  await page.getByTestId('line-end-menu-detach').click();
  await expect.poll(async () => 'point' in (await ends()).start).toBe(true);
  expect(await stays()).toBeLessThan(0.002);
});

test('«Reverse points» swaps the start and the end of a line where they are: an arrow points the other way', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  const project = linesProject('ce');
  (project.formulas.find((f) => f.id === 'l1') as LineFormula).line = 'arrow';
  await openWithProject(page, serializeProject(project));
  await setTime(page, 2);
  // The free arrow runs from (−4, −2) to (−1, −2): its tip is at its right end (a point inside
  // the tip, off the shaft, is painted there and not at the other end).
  await page.getByTestId('clip-free').click({ position: { x: 60, y: 10 } });
  expect(await handleAt(page, 'start')).toEqual([-4, -2]);
  expect(bright(await pixelAt(page, [-1.25, -1.95]))).toBeGreaterThan(400);
  expect(bright(await pixelAt(page, [-3.75, -1.95]))).toBeLessThan(60);
  await openMenuOf(page, 'free');
  await expect(page.getByTestId('clip-menu-reverse')).toContainText('Reverse points');
  await page.getByTestId('clip-menu-reverse').click();
  await expect.poll(async () => (await lines(page)).l1.vector).toEqual([-3, 0]);
  // The same line, from its other end: the handles changed places, the tip is at the left.
  await page.getByTestId('clip-free').click({ position: { x: 60, y: 10 } });
  expect(await handleAt(page, 'start')).toEqual([-1, -2]);
  expect(await handleAt(page, 'end')).toEqual([-4, -2]);
  expect(bright(await pixelAt(page, [-3.75, -1.95]))).toBeGreaterThan(400);
  expect(bright(await pixelAt(page, [-1.25, -1.95]))).toBeLessThan(60);
  // The fitted arrow swaps what its ends are on; the button of the Line section does the same.
  await page.getByTestId('clip-arrow').click({ position: { x: 60, y: 10 } });
  await openAnimationsTab(page, 'timing');
  await page.getByTestId('line-reverse').click();
  await expect
    .poll(async () => (await lines(page)).arrow.attach)
    .toMatchObject({ start: { clipId: 'b' }, end: { clipId: 'a' } });
  expect((await lines(page)).issues).toBe(true);
  // One step back each.
  await undo(page);
  expect((await lines(page)).arrow.attach).toMatchObject({ start: { clipId: 'a' } });
  await undo(page);
  expect((await lines(page)).l1.vector).toEqual([3, 0]);
});

test('the shape of a path is copied from a line and pasted onto an arrow: its curve, not its kind, its tip nor its ends', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(linesProject('ce')));
  await setTime(page, 2);
  const menu = page.getByTestId('add-animation-menu');
  const paste = page.getByTestId('clip-menu-curve-paste');
  // Nothing is copied yet: the arrow's menu says so.
  await openMenuOf(page, 'arrow');
  await openSubmenu(page, 'clip-menu-curve');
  await expect(paste).toBeDisabled();
  await expect(paste).toContainText('nothing copied');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // The free line, bent into an arc, is copied: its own menu then has nothing to paste.
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-curve');
  await page.getByTestId('clip-menu-curve-arc').click();
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-curve');
  await expect(page.getByTestId('clip-menu-curve-copy')).toContainText('an arc of 30°');
  await page.getByTestId('clip-menu-curve-copy').click();
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-curve');
  await expect(paste).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // The arrow between the two formulas takes it: an arc — the part its gap takes is its own —,
  // and still a yellow arrow on the same glyphs.
  await openMenuOf(page, 'arrow');
  await openSubmenu(page, 'clip-menu-curve');
  await expect(paste).toContainText('an arc of 30°, of l1');
  await paste.click();
  await expect
    .poll(async () => (await lines(page)).l2.curve)
    .toMatchObject({ shape: 'arc', degrees: 30 });
  await expect
    .poll(async () => {
      const { curve } = (await lines(page)).l2;
      return curve?.shape === 'arc' ? curve.trim : 0;
    })
    .toBeGreaterThan(0);
  const after = await lines(page);
  expect(after.l2).toMatchObject({ line: 'arrow', color: '#FFFF00', tip: 'triangle' });
  expect(after.arrow.attach).toMatchObject({ start: { clipId: 'a' }, end: { clipId: 'b' } });
  expect(after.issues).toBe(true);
  await undo(page);
  expect((await lines(page)).l2.curve).toBeNull();
  // Several clips selected, the two lines among them: their menu pastes it onto the one that
  // has another path.
  await page.getByTestId('clip-a').click({ position: { x: 60, y: 10 } });
  for (const id of ['free', 'arrow']) {
    await page
      .getByTestId(`clip-${id}`)
      .click({ position: { x: 60, y: 10 }, modifiers: ['ControlOrMeta'] });
  }
  await openMenuOf(page, 'arrow');
  await expect(page.getByTestId('clips-menu-paste-shape')).toContainText('an arc of 30°, of l1');
  await page.getByTestId('clips-menu-paste-shape').click();
  await expect
    .poll(async () => (await lines(page)).l2.curve)
    .toMatchObject({ shape: 'arc', degrees: 30 });
  expect((await lines(page)).l1.curve).toEqual({ shape: 'arc', degrees: 30, trim: 0 });
});

test('«Become ›» in a line’s menu makes it another kind of line: the one it is is ticked, and Undo is the way back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(linesProject('ce')));
  await setTime(page, 2);
  // The free line becomes an arrow, with an arrow's stroke; its ends stay where they were.
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-become');
  await expect(page.getByTestId('clip-menu-become-line')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('clip-menu-become-arrow')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('clip-menu-become-dashed')).toHaveText('Dashed line');
  await page.getByTestId('clip-menu-become-arrow').click();
  await expect
    .poll(async () => (await lines(page)).l1)
    .toMatchObject({ line: 'arrow', strokeWidth: 6, vector: [3, 0] });
  expect((await lines(page)).free.initial.position).toEqual([-2.5, -2]);
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-become');
  await expect(page.getByTestId('clip-menu-become-arrow')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // An arrow that grows with GrowArrow is drawn in with Create once it has no tip to grow.
  await page.getByTestId('clip-arrow').click({ position: { x: 60, y: 10 } });
  await openAnimationsTab(page, 'timing');
  await page.getByTestId('intro-kind').selectOption('grow_arrow');
  await openMenuOf(page, 'arrow');
  await openSubmenu(page, 'clip-menu-become');
  await page.getByTestId('clip-menu-become-line').click();
  await expect.poll(async () => (await lines(page)).l2.line).toBe('line');
  expect((await lines(page)).arrow.intro).toMatchObject({ kind: 'create', duration: 1 });
  expect((await lines(page)).issues).toBe(true);
  // One step back: the arrow, and its GrowArrow.
  await undo(page);
  await expect.poll(async () => (await lines(page)).l2.line).toBe('arrow');
  expect((await lines(page)).arrow.intro.kind).toBe('grow_arrow');
});

test('GrowArrow draws a bent arrow along its own way, its tip on the end of what is drawn', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  // The free line as an arrow bent into a quarter of a circle, which grows over two seconds at a
  // steady rate: its clip is placed by the centre Manim reads of it.
  const project = linesProject('ce');
  const l1 = project.formulas.find((f) => f.id === 'l1') as LineFormula;
  Object.assign(l1, { line: 'arrow', strokeWidth: 6 });
  l1.curve = { shape: 'arc', degrees: 90, trim: 0 };
  const free = project.clips.find((c) => c.id === 'free')!;
  free.initial.position = buildLine('ce', 'arrow', [-4, -2], [-1, -2], l1).centre;
  free.intro = { ...defaultIntro('grow_arrow'), duration: 2, easing: 'linear' };
  // Where to look comes from the arc itself, not from the app (audit B4-04). Manim points the tip,
  // `tipLength` long, along the arc where it ends — the quarter circle from (−4, −2) to (−1, −2)
  // turns counter-clockwise about (−2.5, −0.5), and ends going up and to the right — and lays the
  // shaft, a quarter circle too, from the start to the tip's base: about the point |SB| / 2 to the
  // left of the middle of SB, at |SB| / √2. Create cuts it by the count of its curves, which
  // ManimCE lays evenly along the arc: a part of them is that part of the quarter turn.
  const S: [number, number] = [-4, -2];
  const B: [number, number] = [-1 - l1.tipLength / Math.SQRT2, -2 - l1.tipLength / Math.SQRT2];
  const chord = [B[0] - S[0], B[1] - S[1]] as const;
  const centre = [(S[0] + B[0] - chord[1]) / 2, (S[1] + B[1] + chord[0]) / 2] as const;
  const radius = Math.hypot(chord[0], chord[1]) / Math.SQRT2;
  const from = Math.atan2(S[1] - centre[1], S[0] - centre[0]);
  const angle = (part: number) => from + (part * Math.PI) / 2;
  const way = (part: number): [number, number] => [
    centre[0] + radius * Math.cos(angle(part)),
    centre[1] + radius * Math.sin(angle(part)),
  ];
  await openWithProject(page, serializeProject(project));
  // Half way: the first half of the shaft is drawn, the rest is not.
  await setTime(page, 1);
  expect(bright(await pixelAt(page, way(0.25)))).toBeGreaterThan(400);
  expect(bright(await pixelAt(page, way(0.8)))).toBeLessThan(60);
  // The tip is there, its base on the end of what is drawn and along the way there: wide just
  // ahead of that end, and nothing just behind it beside the shaft.
  const beside = (along: number, across: number): [number, number] => {
    const [x, y] = way(0.5);
    const [c, s] = [Math.cos(angle(0.5)), Math.sin(angle(0.5))];
    return [x - along * s + across * c, y + along * c + across * s];
  };
  expect(bright(await pixelAt(page, beside(0.12, 0)))).toBeGreaterThan(400);
  for (const across of [-0.08, 0.08]) {
    expect(bright(await pixelAt(page, beside(0.1, across)))).toBeGreaterThan(400);
    expect(bright(await pixelAt(page, beside(-0.1, across)))).toBeLessThan(60);
  }
  // Grown, it is the whole arrow.
  await setTime(page, 3);
  expect(bright(await pixelAt(page, way(0.8)))).toBeGreaterThan(400);
  // The Python has the animation as a helper: Manim has none like it.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText('_TraceArrow(l1');
  await expect(page.getByTestId('export-python-code')).toContainText(
    'class _TraceArrow(Animation):',
  );
});

test('Edit curve: a line bent into a spline takes points on its curve, which are dragged and removed; Enter keeps it, Esc puts it back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(linesProject('ce')));
  await setTime(page, 2);
  const nodes = async () => {
    const curve = (await lines(page)).l1.curve;
    return curve?.shape === 'spline' ? curve.nodes : [];
  };
  // «Curve ▸ Spline» bends the line and opens the mode on it: its two ends, with a handle each.
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-curve');
  await page.getByTestId('clip-menu-curve-spline').click();
  await expect(page.getByTestId('line-curve-hint')).toContainText('Edit curve');
  await expect.poll(async () => (await nodes()).length).toBe(2);
  const original = await nodes();
  await expect(page.getByTestId('line-curve-node-0')).toHaveAttribute('data-end', 'true');
  await expect(page.getByTestId('line-curve-handle-0-out')).toBeVisible();
  await expect(page.getByTestId('line-curve-handle-1-in')).toBeVisible();
  // The handles of the ends of the line step aside while the curve is shaped.
  await expect(page.getByTestId('line-end-start')).toHaveCount(0);
  // A click on the curve adds a point there, selected: the arc of thirty degrees it started as
  // hangs a fifth of a unit under the middle of the line between its ends.
  const apex = await scenePoint(page, [-2.5, -2.2]);
  await page.mouse.click(apex.x, apex.y);
  await expect.poll(async () => (await nodes()).length).toBe(3);
  const added = page.getByTestId('line-curve-node-1');
  await expect(added).toHaveAttribute('data-selected', 'true');
  // Dragged, it goes where the pointer does: one undo step.
  const before = (await nodes())[1]!.at;
  const grip = await box(added);
  const up = await scenePoint(page, [-2.5, -0.5]);
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(up.x, up.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await nodes())[1]!.at[1]).toBeGreaterThan(before[1] + 0.3);
  // In the frame of the two ends, (−2.5, −0.5) is half way along and half a length across.
  const moved = (await nodes())[1]!.at;
  expect(moved[0]).toBeCloseTo(0.5, 1);
  expect(moved[1]).toBeCloseTo(0.5, 1);
  await undo(page);
  expect((await nodes())[1]!.at[1]).toBeCloseTo(before[1], 5);
  // A double click makes it a corner or smooth again; Delete removes it.
  const smooth = await added.getAttribute('data-smooth');
  await added.dblclick();
  await expect(added).not.toHaveAttribute('data-smooth', smooth!);
  await added.click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await nodes()).length).toBe(2);
  // A handle dragged bends the curve; Esc puts back the curve the mode started with.
  const start = (await nodes())[0]!.out;
  const lever = await box(page.getByTestId('line-curve-handle-0-out'));
  const away = await scenePoint(page, [-3.5, 0]);
  await page.mouse.move(lever.x + lever.width / 2, lever.y + lever.height / 2);
  await page.mouse.down();
  await page.mouse.move(away.x, away.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await nodes())[0]!.out).not.toEqual(start);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('line-curve-hint')).toHaveCount(0);
  expect(await nodes()).toEqual(original);
  await expect(page.getByTestId('line-end-start')).toBeVisible();
  // The Line section opens the mode again; «Done» (or Enter) keeps what was done.
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('line-curve')).toHaveText('spline · 2 points');
  await page.getByTestId('line-bend-spline').click();
  await expect(page.getByTestId('line-curve-hint')).toBeVisible();
  await page.mouse.click(apex.x, apex.y);
  await expect.poll(async () => (await nodes()).length).toBe(3);
  await page.getByTestId('line-curve-done').click();
  await expect(page.getByTestId('line-curve-hint')).toHaveCount(0);
  expect((await nodes()).length).toBe(3);
  await expect(page.getByTestId('line-curve')).toHaveText('spline · 3 points');
  // It exports bent by the helper.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText('l1 = _spline(Line(');
});

test('Edit curve: a smooth point’s handles mirror each other; Shift keeps the other’s length, Ctrl/⌘ moves one alone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(linesProject('ce')));
  await setTime(page, 2);
  const middle = async () => {
    const curve = (await lines(page)).l1.curve;
    return (curve?.shape === 'spline' ? curve.nodes : [])[1]!;
  };
  const length = (node: { at: number[] }, handle: number[]) =>
    Math.hypot(handle[0]! - node.at[0]!, handle[1]! - node.at[1]!);
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-curve');
  await page.getByTestId('clip-menu-curve-spline').click();
  await expect(page.getByTestId('line-curve-hint')).toContainText(
    onSystem(
      'Shift: keep the other handle’s length · Ctrl/⌘: move a handle alone',
      '⇧: keep the other handle’s length · ⌘: move a handle alone',
    ),
  );
  // A point added on the curve is smooth, with two handles of its own.
  const apex = await scenePoint(page, [-2.5, -2.2]);
  await page.mouse.click(apex.x, apex.y);
  await expect(page.getByTestId('line-curve-node-1')).toHaveAttribute('data-smooth', 'true');
  const out = page.getByTestId('line-curve-handle-1-out');
  /** Drags the point's `out` handle by (dx, dy) px, with `key` held all along. */
  const drag = async (dx: number, dy: number, key?: 'Shift' | 'ControlOrMeta') => {
    const grip = await box(out);
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    if (key) await page.keyboard.down(key);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
    if (key) await page.keyboard.up(key);
  };

  // A plain drag: the other handle is the dragged one through the point, as long as it.
  await drag(60, -40);
  let node = await middle();
  expect(node.smooth).toBe(true);
  expect(node.in![0]).toBeCloseTo(2 * node.at[0]! - node.out![0]!, 4);
  expect(node.in![1]).toBeCloseTo(2 * node.at[1]! - node.out![1]!, 4);

  // With Shift the other handle turns to stay opposite and keeps the length it had.
  const kept = length(node, node.in!);
  await drag(-30, 70, 'Shift');
  node = await middle();
  expect(node.smooth).toBe(true);
  expect(length(node, node.in!)).toBeCloseTo(kept, 4);
  expect(length(node, node.out!)).not.toBeCloseTo(kept, 2);
  // Opposite: the two handles and the point are on one line.
  const cross =
    (node.in![0]! - node.at[0]!) * (node.out![1]! - node.at[1]!) -
    (node.in![1]! - node.at[1]!) * (node.out![0]! - node.at[0]!);
  expect(cross).toBeCloseTo(0, 4);

  // With Ctrl/⌘ the handle moves alone, and the point becomes a corner.
  const still = node.in!;
  await drag(40, 40, 'ControlOrMeta');
  node = await middle();
  expect(node.smooth).toBe(false);
  expect(node.in).toEqual(still);
});

/* --- The mode «Edit curve» wherever the playhead is ------------------------------------------ */

const previewFrame = (page: Page) => page.getByTestId('preview-frame');

/** The nodes of the spline of the line object `l1` (none while it is no spline). */
async function splineNodes(page: Page) {
  const curve = (await lines(page)).l1.curve;
  return curve?.shape === 'spline' ? curve.nodes : [];
}

/** The lines of `linesProject`, the free line's clip over [0, 4) and the formulas' over
 * [0, `scene`): past 4 s the free line is not on screen. The playhead at 2 s. */
async function openShortLine(page: Page, scene = 8): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 950 });
  const project = linesProject('ce');
  project.clips.find((c) => c.id === 'free')!.end = 4;
  for (const id of ['a', 'b', 'arrow']) project.clips.find((c) => c.id === id)!.end = scene;
  await openWithProject(page, serializeProject(project));
  await setTime(page, 2);
}

/** «Curve ▸ Spline» (or «Edit curve») of the free line's menu: the mode on it. */
async function editFreeCurve(page: Page): Promise<void> {
  await openMenuOf(page, 'free');
  await openSubmenu(page, 'clip-menu-curve');
  await page.getByTestId('clip-menu-curve-spline').click();
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', 'free');
}

/** A click on the curve of the free line, which adds a point there: the arc of thirty degrees
 * the spline started as hangs a fifth of a unit under the middle of the line between its ends. */
async function addCurvePoint(page: Page): Promise<void> {
  const count = (await splineNodes(page)).length;
  const apex = await scenePoint(page, [-2.5, -2.2]);
  await page.mouse.click(apex.x, apex.y);
  await expect.poll(async () => (await splineNodes(page)).length).toBe(count + 1);
}

test('Edit curve: with the playhead off the line’s clip the mode says so, and Esc, Enter or Done leave it as on screen', async ({
  page,
}) => {
  await openShortLine(page);
  const hint = page.getByTestId('line-curve-hint');
  const done = page.getByTestId('line-curve-done');
  await editFreeCurve(page);
  await expect.poll(async () => (await splineNodes(page)).length).toBe(2);
  const original = await splineNodes(page);
  await addCurvePoint(page);
  // The clip ends at 4 s: at 6 s the line is not on screen, its points neither, and the mode is
  // still on, with its Done.
  await setTime(page, 6);
  await expect(hint).toHaveText(
    onSystem(
      'Edit curve: the line is not on screen at the playhead · Enter: done · Esc: as it was',
      'Edit curve: the line is not on screen at the playhead · ↩: done · Esc: as it was',
    ),
  );
  await expect(page.getByTestId('line-curve-node-0')).toHaveCount(0);
  await expect(done).toBeVisible();
  // Esc puts back the curve the mode started with, as it does on screen.
  await page.keyboard.press('Escape');
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
  await expect(hint).toHaveCount(0);
  expect(await splineNodes(page)).toEqual(original);

  // Opened again with the playhead off the clip, the mode brings it to the clip's start.
  await editFreeCurve(page);
  await expect
    .poll(() => page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().time))
    .toBe(0);
  await addCurvePoint(page);
  const shaped = await splineNodes(page);
  // Enter keeps the curve, off screen too.
  await setTime(page, 6);
  await expect(done).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
  expect(await splineNodes(page)).toEqual(shaped);

  // So does Done.
  await editFreeCurve(page);
  await setTime(page, 6);
  await expect(hint).toContainText('not on screen');
  await done.click();
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
  await expect(hint).toHaveCount(0);
  expect(await splineNodes(page)).toEqual(shaped);
});

test('Edit curve opened while the scene plays pauses it, the playhead on the line’s clip', async ({
  page,
}) => {
  // A long scene: the playback would run on well past the line's clip.
  await openShortLine(page, 30);
  const ui = () =>
    page.evaluate(() => {
      const { time, playing } = (window as MfeWindow).__mfe!.useUiStore.getState();
      return { time, playing };
    });
  await page.getByTestId('clip-free').click({ position: { x: 60, y: 10 } });
  await openAnimationsTab(page, 'timing');
  await setTime(page, 5);
  await page.getByTestId('transport-play').click();
  await expect.poll(async () => (await ui()).time).toBeGreaterThan(5.2);
  // «Spline» of the Line section bends the line and opens the mode on it.
  await page.getByTestId('line-bend-spline').click();
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', 'free');
  expect(await ui()).toEqual({ time: 0, playing: false });
  // It stays there: the points are on screen to be shaped.
  await page.waitForTimeout(300);
  expect(await ui()).toEqual({ time: 0, playing: false });
  await expect(page.getByTestId('line-curve-hint')).toContainText('Edit curve: drag points');
  await expect(page.getByTestId('line-curve-node-0')).toBeVisible();
});

test('Edit curve: Delete and Backspace are the mode’s with no point selected too, and delete nothing then', async ({
  page,
}) => {
  await openShortLine(page);
  await editFreeCurve(page);
  await expect.poll(async () => (await splineNodes(page)).length).toBe(2);
  const original = await splineNodes(page);
  const clipIds = () =>
    page.evaluate(() =>
      (window as MfeWindow).__mfe!.useProjectStore.getState().project.clips.map((c) => c.id),
    );
  // The mode selected the line's clip; with the clip focused, the timeline's Delete would remove
  // it. No point is selected: the mode has just started.
  const clip = page.getByTestId('clip-free');
  await clip.focus();
  expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['free'] });
  for (const key of ['Delete', 'Backspace']) {
    await page.keyboard.press(key);
    await expect(previewFrame(page)).toHaveAttribute('data-line-curve', 'free');
    expect(await clipIds()).toContain('free');
    expect(await splineNodes(page)).toEqual(original);
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A point selected: Delete removes it, and nothing else.
  await addCurvePoint(page);
  await expect(page.getByTestId('line-curve-node-1')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await splineNodes(page)).length).toBe(2);
  expect(await clipIds()).toContain('free');
  // Out of the mode the same key, on the same clip, deletes it: the timeline's.
  await page.keyboard.press('Enter');
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
  await clip.focus();
  await page.keyboard.press('Delete');
  await expect.poll(clipIds).not.toContain('free');
});

test('Edit curve ends, saying so, when its line’s track is locked: the curve takes no more points', async ({
  page,
}) => {
  await openShortLine(page);
  await editFreeCurve(page);
  await openAnimationsTab(page, 'timing');
  await expect.poll(async () => (await splineNodes(page)).length).toBe(2);
  const track = (await lines(page)).free.trackId;
  await page.getByTestId(`track-lock-${track}`).click();
  await expect(page.getByTestId('notice').filter({ hasText: 'Edit curve ended' })).toContainText(
    'Track “Track 3” is locked: unlock it on the timeline to edit the curve.',
  );
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
  await expect(page.getByTestId('line-curve-node-0')).toHaveCount(0);
  // A click where the curve is adds no point.
  const apex = await scenePoint(page, [-2.5, -2.2]);
  await page.mouse.click(apex.x, apex.y);
  expect((await splineNodes(page)).length).toBe(2);
  // Nor does the mode open again: the Line section has it off, as everything of a clip on a
  // locked track.
  await expect(page.getByTestId('line-bend-spline')).toBeDisabled();
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
});

test('Edit curve does not open on a line locked in the preview, and ends when its line is locked there', async ({
  page,
}) => {
  await openShortLine(page);
  await openMenuOf(page, 'free');
  await page.getByTestId('clip-menu-preview-lock').click();
  await expect(page.getByTestId('clip-free-preview-lock')).toBeVisible();
  // The Line section bends it, as the panels edit a clip locked in the preview; the mode does not
  // open on it, and says why.
  await page.getByTestId('clip-free').click({ position: { x: 60, y: 10 } });
  await openAnimationsTab(page, 'timing');
  await page.getByTestId('line-bend-spline').click();
  await expect(page.getByTestId('notice').filter({ hasText: 'The curve stays' })).toContainText(
    '“l1” is locked in the preview: unlock it on the timeline to edit the curve.',
  );
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
  await expect(page.getByTestId('line-curve-node-0')).toHaveCount(0);
  expect((await lines(page)).l1.curve?.shape).toBe('spline');
  // Unlocked, it opens; locked in the preview while it is on, it ends and says so.
  await page.getByTestId('clip-free-preview-lock').click();
  await expect(page.getByTestId('clip-free-preview-lock')).toHaveCount(0);
  await page.getByTestId('line-bend-spline').click();
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', 'free');
  await expect(page.getByTestId('line-curve-node-0')).toBeVisible();
  await openMenuOf(page, 'free');
  await page.getByTestId('clip-menu-preview-lock').click();
  await expect(page.getByTestId('notice').filter({ hasText: 'Edit curve ended' })).toContainText(
    '“l1” is locked in the preview: unlock it on the timeline to edit the curve.',
  );
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
  await expect(page.getByTestId('line-curve-node-0')).toHaveCount(0);
});

test('«Reverse points» ends Edit curve on its line first, keeping its curve: Esc then writes nothing', async ({
  page,
}) => {
  await openShortLine(page);
  await editFreeCurve(page);
  await addCurvePoint(page);
  const shaped = await splineNodes(page);
  // «Reverse points» from the menu of the line's clip on the timeline.
  await openMenuOf(page, 'free');
  await page.getByTestId('clip-menu-reverse').click();
  await expect.poll(async () => (await lines(page)).l1.vector).toEqual([-3, 0]);
  await expect(previewFrame(page)).toHaveAttribute('data-line-curve', '');
  await expect(page.getByTestId('line-curve-hint')).toHaveCount(0);
  // The same curve, run the other way: its middle point, along the line from the other end and
  // on the other side of it.
  const reversed = await splineNodes(page);
  expect(reversed).toHaveLength(3);
  expect(reversed[1]!.at[0]).toBeCloseTo(1 - shaped[1]!.at[0], 5);
  expect(reversed[1]!.at[1]).toBeCloseTo(-shaped[1]!.at[1], 5);
  // Esc is the mode's no longer: the nodes of before the reversal are not written back.
  await page.keyboard.press('Escape');
  expect(await splineNodes(page)).toEqual(reversed);
  // One step back: the curve as it was shaped, the line the way it ran.
  await undo(page);
  expect(await splineNodes(page)).toEqual(shaped);
  expect((await lines(page)).l1.vector).toEqual([3, 0]);
});

/* --- The wheel, the middle button and the right-click while a line is drawn or shaped ------- */

interface LineMode {
  name: string;
  /** Turn the mode on in the scene of `openShortLine`. */
  start(page: Page): Promise<void>;
  /** Whether it is on. */
  on(page: Page): Promise<boolean>;
  /** What a click of the mode would write: an end of the line put, a point added. */
  written(page: Page): Promise<string>;
  /** A point of the scene where a click of the mode would write. */
  target: [number, number];
  /** The menu a right-click there opens: of the empty space, or of the line under it. */
  menu: string;
}

const LINE_MODES: LineMode[] = [
  {
    name: 'Add line',
    start: async (page) => {
      const empty = await scenePoint(page, [0, 3.5]);
      await page.mouse.click(empty.x, empty.y, { button: 'right' });
      await page.getByTestId('preview-space-line-line').click();
      await expect(page.getByTestId('line-draw-surface')).toBeVisible();
    },
    on: async (page) => (await page.getByTestId('line-draw-surface').count()) > 0,
    written: async (page) =>
      JSON.stringify([
        await page.getByTestId('line-draw-start').count(),
        (await drawn(page)).lines,
      ]),
    target: [1.5, 3],
    menu: 'preview-space-menu',
  },
  {
    name: 'Edit curve',
    start: editFreeCurve,
    on: async (page) => (await previewFrame(page).getAttribute('data-line-curve')) === 'free',
    written: async (page) => JSON.stringify(await splineNodes(page)),
    target: [-2.5, -2.2],
    menu: 'preview-menu',
  },
];

for (const mode of LINE_MODES) {
  test(`${mode.name}: Ctrl/⌘ + wheel zooms the view and the middle button pans it, as with no mode on`, async ({
    page,
  }) => {
    await openShortLine(page);
    await mode.start(page);
    const before = await mode.written(page);
    const frame = previewFrame(page);
    await expect(frame).toHaveAttribute('data-zoom', '1.000');
    const at = await scenePoint(page, mode.target);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down('ControlOrMeta');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('ControlOrMeta');
    await expect(frame).not.toHaveAttribute('data-zoom', '1.000');
    const centre = await frame.getAttribute('data-center');
    // The middle button drags the view.
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(at.x + 80, at.y + 40, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    await expect(frame).not.toHaveAttribute('data-center', centre!);
    // The mode is on, and wrote nothing.
    expect(await mode.on(page)).toBe(true);
    expect(await mode.written(page)).toBe(before);
  });

  test(`${mode.name}: a right-click opens the preview’s menu; Escape leaves the mode on, an entry chosen there ends it`, async ({
    page,
  }) => {
    await openShortLine(page);
    await mode.start(page);
    const before = await mode.written(page);
    // On empty space, the menu of the scene.
    const empty = await scenePoint(page, [5.5, 3.2]);
    await page.mouse.click(empty.x, empty.y, { button: 'right' });
    await expect(page.getByTestId('preview-space-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('preview-space-menu')).toHaveCount(0);
    expect(await mode.on(page)).toBe(true);
    expect(await mode.written(page)).toBe(before);
    // On a formula, its menu: an entry chosen there ends the mode before it acts, and the mode
    // leaves what it had (the curve shaped; no line, while one is drawn).
    const formula = await scenePoint(page, [3, -1]);
    await page.mouse.click(formula.x, formula.y, { button: 'right' });
    await expect(page.getByTestId('preview-menu')).toBeVisible();
    expect(await mode.on(page)).toBe(true);
    // The formula is selected, as by any right-click on it; the hint is still the mode's alone.
    expect(await selectionOf(page)).toEqual({ kind: 'clips', ids: ['b'] });
    await expect(previewFrame(page).locator('.preview-hint')).toHaveCount(1);
    await page.getByTestId('preview-menu-copy-properties').click();
    await expect(page.getByTestId('preview-menu')).toHaveCount(0);
    await expect.poll(() => mode.on(page)).toBe(false);
    expect(await mode.written(page)).toBe(before);
  });

  test(`${mode.name}: on a Mac a Ctrl+click is the secondary click: it opens the menu and puts nothing`, async ({
    page,
  }) => {
    // The browser dressed as a Mac. A spec does not press Control (a Mac's ⌘ is ControlOrMeta
    // there): the events of a Ctrl+click are sent as a Mac sends them — the press of the main
    // button with Ctrl held, the menu's event, the release.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
    });
    await openShortLine(page);
    await mode.start(page);
    const before = await mode.written(page);
    const at = await scenePoint(page, mode.target);
    // The real pointer out of the way: it would hover the menu that opens.
    await page.mouse.move(0, 0);
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y)!;
      const keys = { clientX: x, clientY: y, ctrlKey: true, bubbles: true, cancelable: true };
      const pointer = { ...keys, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
      target.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
      target.dispatchEvent(new MouseEvent('contextmenu', { ...keys, button: 0, buttons: 1 }));
      target.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
    }, at);
    await expect(page.getByTestId(mode.menu)).toBeVisible();
    expect(await mode.written(page)).toBe(before);
    expect(await mode.on(page)).toBe(true);
  });
}
