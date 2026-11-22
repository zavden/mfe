import { expect, test, type Page } from './test';
import { openBlockScene, pickAnimation } from './blockHelpers';
import { getProject, setTime, someTextField, type MfeWindow } from './helpers';
import { clickScene, type Point } from './previewHelpers';
import { openRelationScene, plain, relations, relationTab, selectClip } from './relationsHelpers';
import {
  box,
  clipOf,
  dragTo,
  dropFormula,
  FORMULA_MIME,
  laneY,
  PX_PER_SECOND,
  timeToX,
  uiState,
} from './timelineHelpers';

/* The region of the timeline (D180): a stretch of time marked on the ruler — Shift dragged on
 * it, or the I and O keys at the playhead —, its start in green and its end in red. What is
 * created next takes it: an animation block, a relation's window, the clip of a formula brought
 * to the timeline; what does not fit there is not made, and a notice says why. The region stays
 * until Escape removes it.
 *
 * The block scene: clip a (formula f1) over 0–10 s on track 1, clip b (f2) over 2–8 s on track 2,
 * neither with an intro or an outro; track 3 is empty. 60 fps, 80 px/s: the ruler's grid is 0.5 s. */

const FRAME = 1 / 60;

/** The region as the ruler shows it, or null when none is marked. */
async function region(page: Page): Promise<{ start: number; end: number } | null> {
  const mark = page.getByTestId('timeline-region');
  if ((await mark.count()) === 0) return null;
  return {
    start: Number(await mark.getAttribute('data-start')),
    end: Number(await mark.getAttribute('data-end')),
  };
}

/** The region is `expected` (a drag's last move may still be on its way to the screen). */
async function expectRegion(
  page: Page,
  expected: { start: number; end: number } | null,
): Promise<void> {
  await expect.poll(() => region(page)).toEqual(expected);
}

/** The vertical middle of the ruler. */
async function rulerY(page: Page): Promise<number> {
  const ruler = await box(page.getByTestId('timeline-ruler'));
  return ruler.y + ruler.height / 2;
}

/** Drag on the ruler from time `from` to time `to` with Shift held: draw the region. */
async function drawRegion(
  page: Page,
  from: number,
  to: number,
  options: { release?: boolean } = {},
): Promise<void> {
  const y = await rulerY(page);
  await page.keyboard.down('Shift');
  await page.mouse.move(await timeToX(page, from), y);
  await page.mouse.down();
  await page.mouse.move(await timeToX(page, (from + to) / 2), y, { steps: 4 });
  await page.mouse.move(await timeToX(page, to), y, { steps: 4 });
  if (options.release !== false) await page.mouse.up();
  await page.keyboard.up('Shift');
}

/** Drag the mark of one end of the region to time `to`, with `key` held during the move. */
async function dragMark(
  page: Page,
  edge: 'start' | 'end',
  to: number,
  options: { key?: 'Shift' | 'ControlOrMeta'; release?: boolean } = {},
): Promise<void> {
  const mark = await box(page.getByTestId(`timeline-region-${edge}`));
  // Grabbed by the side that is at the end's time: nothing to offset.
  const grab = edge === 'start' ? mark.x : mark.x + mark.width;
  const inward = edge === 'start' ? 2 : -2;
  const y = mark.y + mark.height / 2;
  await page.mouse.move(grab + inward, y);
  await page.mouse.down();
  if (options.key) await page.keyboard.down(options.key);
  const target = (await timeToX(page, to)) + inward;
  await page.mouse.move((grab + target) / 2, y, { steps: 4 });
  await page.mouse.move(target, y, { steps: 4 });
  if (options.release !== false) await page.mouse.up();
  if (options.key) await page.keyboard.up(options.key);
}

/** Right-click clip `clipId` at time `t`, on its lower half (not on a block). */
async function rightClickClip(page: Page, clipId: string, t: number): Promise<void> {
  const b = await box(page.getByTestId(`clip-${clipId}`));
  await page.mouse.click(await timeToX(page, t), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
}

/** Dispatch the events of a formula dragged from the Creator over a track at time `t`, without
 * dropping it. */
async function dragOver(page: Page, formulaId: string, trackId: string, t: number): Promise<void> {
  const x = await timeToX(page, t);
  const y = await laneY(page, trackId);
  await page.evaluate(
    ({ formulaId, trackId, x, y, mime }) => {
      const lane = document.querySelector(`[data-testid="track-lane-${trackId}"]`)!;
      const transfer = new DataTransfer();
      transfer.setData(mime, formulaId);
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer: transfer,
      };
      lane.dispatchEvent(new DragEvent('dragenter', init));
      lane.dispatchEvent(new DragEvent('dragover', init));
    },
    { formulaId, trackId, x, y, mime: FORMULA_MIME },
  );
}

const header = (page: Page) => page.getByTestId('add-animation-header');
const notice = (page: Page) => page.getByTestId('notice');

test.describe('marking the region', () => {
  test('Shift dragged on the ruler draws it, and leaves the playhead where it is', async ({
    page,
  }) => {
    await openBlockScene(page, []);
    await setTime(page, 0.5);
    await expectRegion(page, null);
    // Snap is on: the two ends land on the ruler's grid, 0.5 s apart.
    await drawRegion(page, 1.04, 2.95);
    await expectRegion(page, { start: 1, end: 3 });
    expect((await uiState(page)).time).toBe(0.5);
    // On the ruler between its two marks, and over the tracks under them.
    const mark = await box(page.getByTestId('timeline-region'));
    expect(mark.x).toBeCloseTo(await timeToX(page, 1), 0);
    expect(mark.width).toBeCloseTo(160, 0);
    const band = await box(page.getByTestId('timeline-region-band'));
    expect(band.x).toBeCloseTo(mark.x, 0);
    expect(band.width).toBeCloseTo(mark.width, 0);
    // Right under the ruler (and its edge).
    expect(band.y).toBeGreaterThanOrEqual(mark.y + mark.height - 0.5);
    expect(band.y).toBeLessThan(mark.y + mark.height + 2);
    await expect(page.getByTestId('timeline-region')).toHaveAccessibleName(
      /^Region 1\.00–3\.00 s: what is created next takes it/,
    );

    // Drawn from its end to its start, it is the same region.
    await drawRegion(page, 6, 4);
    await expectRegion(page, { start: 4, end: 6 });

    // A plain press inside it is a press on the ruler: the playhead goes there.
    await page.mouse.click(await timeToX(page, 5), await rulerY(page));
    expect((await uiState(page)).time).toBeCloseTo(5, 1);
    await expectRegion(page, { start: 4, end: 6 });

    // Shift pressed and let go without a drag marks nothing, and moves nothing.
    await page.keyboard.down('Shift');
    await page.mouse.click(await timeToX(page, 8), await rulerY(page));
    await page.keyboard.up('Shift');
    await expectRegion(page, { start: 4, end: 6 });
    expect((await uiState(page)).time).toBeCloseTo(5, 1);

    // Escape while it is drawn brings back the one there was.
    await drawRegion(page, 1, 2.5, { release: false });
    await expectRegion(page, { start: 1, end: 2.5 });
    await page.keyboard.press('Escape');
    await expectRegion(page, { start: 4, end: 6 });
    await page.mouse.up();
    await expectRegion(page, { start: 4, end: 6 });
  });

  test('its two marks are dragged: an end snaps, goes free with Shift and tick by tick with Ctrl/⌘', async ({
    page,
  }) => {
    await openBlockScene(page, []);
    await drawRegion(page, 1, 3);
    // Snap is on: the end lands on the grid; the playhead does not move.
    await dragMark(page, 'end', 5.04);
    await expectRegion(page, { start: 1, end: 5 });
    expect((await uiState(page)).time).toBe(0);
    // Shift suspends snapping: on the frame under the pointer.
    await dragMark(page, 'start', 1.3, { key: 'Shift' });
    await expect.poll(async () => (await region(page))?.start).toBeCloseTo(1.3, 1);
    const free = await region(page);
    expect(free!.start).not.toBe(1.5);
    expect(Math.abs(free!.start / FRAME - Math.round(free!.start / FRAME))).toBeLessThan(1e-3);
    // Ctrl/⌘: on the small ticks of the ruler alone, dt apart (0.5 s at this zoom).
    await page.getByTestId('timeline-snap').click();
    await dragMark(page, 'start', 2.3, { key: 'ControlOrMeta' });
    await expectRegion(page, { start: 2.5, end: 5 });
    await page.getByTestId('timeline-snap').click();

    // An end stops a frame from the other, which stays.
    await dragMark(page, 'end', 0.5);
    await expect
      .poll(async () => {
        const short = await region(page);
        return short && short.start === 2.5 ? short.end - short.start : null;
      })
      .toBeCloseTo(FRAME, 5);

    // A mark pressed and let go without a drag is a press on the ruler: the playhead goes there,
    // and the region stays.
    await dragMark(page, 'end', 6);
    await expectRegion(page, { start: 2.5, end: 6 });
    const mark = await box(page.getByTestId('timeline-region-end'));
    await page.mouse.click(mark.x + mark.width - 2, mark.y + mark.height / 2);
    await expect.poll(async () => (await uiState(page)).time).toBeCloseTo(6, 1);
    await expectRegion(page, { start: 2.5, end: 6 });
    // The foot of the ruler under a mark is the playhead's: dragged from there, with the
    // playhead on the mark, it is the playhead that moves.
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const foot = ruler.y + ruler.height - 4;
    await page.mouse.move(mark.x + mark.width - 2, foot);
    await page.mouse.down();
    await page.mouse.move(await timeToX(page, 4), foot, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await uiState(page)).time).toBeCloseTo(4, 1);
    await expectRegion(page, { start: 2.5, end: 6 });

    // Escape during a drag: as it was.
    await expectRegion(page, { start: 2.5, end: 6 });
    await dragMark(page, 'start', 4, { release: false });
    await expectRegion(page, { start: 4, end: 6 });
    await page.keyboard.press('Escape');
    await expectRegion(page, { start: 2.5, end: 6 });
    await page.mouse.up();
  });

  test('I and O put its start and its end at the playhead; Escape removes it', async ({ page }) => {
    await openBlockScene(page, []);
    // I alone: from the playhead to the end of the scene (10 s).
    await setTime(page, 2);
    await page.keyboard.press('i');
    await expectRegion(page, { start: 2, end: 10 });
    await setTime(page, 4.5);
    await page.keyboard.press('o');
    await expectRegion(page, { start: 2, end: 4.5 });
    // I past the end starts another region there; O before the start, one from the scene's start.
    await setTime(page, 7);
    await page.keyboard.press('i');
    await expectRegion(page, { start: 7, end: 10 });
    await setTime(page, 3);
    await page.keyboard.press('o');
    await expectRegion(page, { start: 0, end: 3 });
    expect((await uiState(page)).time).toBe(3);

    // With Ctrl/⌘ the letters are other commands' (Open is Ctrl/⌘+O): not the region's.
    await page.keyboard.press('ControlOrMeta+i');
    await expectRegion(page, { start: 0, end: 3 });

    // A letter typed in a field is the field's; so is its Escape.
    const field = await someTextField(page);
    await field.click();
    await page.keyboard.type('io');
    await expect(field).toHaveValue('io');
    await expectRegion(page, { start: 0, end: 3 });
    await page.keyboard.press('Escape');
    await expectRegion(page, { start: 0, end: 3 });
    await page.getByTestId('creator-tab-formulas').click();

    // Escape closes an open menu first, and removes the region when it has nothing else to do.
    await rightClickClip(page, 'a', 6);
    // (A letter typed in the open menu is the menu's too.)
    await page.keyboard.press('i');
    await expectRegion(page, { start: 0, end: 3 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('add-animation-menu')).toHaveCount(0);
    await expectRegion(page, { start: 0, end: 3 });
    await page.keyboard.press('Escape');
    await expectRegion(page, null);
    await expect(page.getByTestId('timeline-region-band')).toHaveCount(0);
  });

  test('Escape lets the glyphs picked with Alt go first, and removes the region after', async ({
    page,
  }) => {
    await openBlockScene(page, []);
    // At 1 s only clip a is on screen.
    await setTime(page, 1);
    await drawRegion(page, 3, 5);
    const glyph = await page.evaluate(() => {
      const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
        formulas: { id: string; snapshot: { glyphs: { center: [number, number] }[] } | null }[];
      };
      return p.formulas.find((f) => f.id === 'fa')!.snapshot!.glyphs[0]!.center;
    });
    await clickScene(page, glyph as Point, 'Alt');
    const frame = page.getByTestId('preview-frame');
    await expect(frame).toHaveAttribute('data-glyph-pick', 'a:0');
    await page.keyboard.press('Escape');
    await expect(frame).toHaveAttribute('data-glyph-pick', '');
    await expectRegion(page, { start: 3, end: 5 });
    await page.keyboard.press('Escape');
    await expectRegion(page, null);
  });

  test('with the Timeline panel folded, I and O mark nothing out of sight', async ({ page }) => {
    await openBlockScene(page, []);
    await setTime(page, 2);
    await page.getByTestId('panel-fold-timeline').click();
    await expect(page.getByTestId('timeline-ruler')).toBeHidden();
    await page.keyboard.press('i');
    await page.keyboard.press('o');
    await page.getByTestId('panel-fold-timeline').click();
    await expect(page.getByTestId('timeline-ruler')).toBeVisible();
    await expectRegion(page, null);
    await page.keyboard.press('i');
    await expectRegion(page, { start: 2, end: 10 });
  });
});

/* The region remembers what was marked (A6-01): a scene that gets shorter shows it cut where the
 * timeline then ends — or not at all —, and when the timeline grows again it comes back whole, by
 * itself: the edit given up with Escape, undone, or any other. The block scene lays out 16 s: its
 * 10 s and 6 s of room. */
test.describe('a scene that gets shorter', () => {
  /** The end of clip a dragged from 10 s back to 4 s: the scene ends at 8 s (clip b's end), and
   * the timeline lays out 14 s. Let go unless `release` is false. */
  async function trimA(page: Page, release = true): Promise<void> {
    const edge = await box(page.getByTestId('clip-a-trim-end'));
    await dragTo(
      page,
      { x: edge.x + 3, y: edge.y + 10 },
      { x: edge.x + 3 - 6 * PX_PER_SECOND, y: edge.y + 10 },
      { release },
    );
    await expect.poll(async () => (await clipOf(page, 'a')).end).toBeLessThan(5);
  }

  test('a trim given up with Escape leaves the region as it was marked', async ({ page }) => {
    await openBlockScene(page, []);
    // After the end of the scene, where a formula brought to the timeline would go.
    await drawRegion(page, 13, 15);
    await expectRegion(page, { start: 13, end: 15 });
    await trimA(page, false);
    // While the scene is shorter, the region is shown cut where the timeline ends.
    await expectRegion(page, { start: 13, end: 14 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect((await clipOf(page, 'a')).end).toBe(10);
    await expectRegion(page, { start: 13, end: 15 });
  });

  test('a trim undone brings the region back whole, even one it left nothing of', async ({
    page,
  }) => {
    await openBlockScene(page, []);
    await drawRegion(page, 14.5, 15);
    await expectRegion(page, { start: 14.5, end: 15 });
    await trimA(page);
    // The timeline lays out 14 s: nothing of the region is left to show.
    await expectRegion(page, null);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await clipOf(page, 'a')).end).toBe(10);
    await expectRegion(page, { start: 14.5, end: 15 });
    // Removed, it does not come back with a longer scene.
    await page.keyboard.press('Escape');
    await expectRegion(page, null);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(async () => (await clipOf(page, 'a')).end).toBeLessThan(5);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await clipOf(page, 'a')).end).toBe(10);
    await expectRegion(page, null);
  });
});

test.describe('what is created next takes the region', () => {
  test('an animation block takes it whole, whatever the playhead and the click say', async ({
    page,
  }) => {
    await openBlockScene(page, []);
    await setTime(page, 8);
    await drawRegion(page, 3, 5);
    await rightClickClip(page, 'a', 7);
    await expect(header(page)).toHaveText('Add animation · f1 · region 3.00–5.00 s');
    await pickAnimation(page, 'indicate');
    const actions = (await clipOf(page, 'a')).actions;
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: 'emphasis',
      effect: 'indicate',
      start: 3,
      duration: 2,
    });
    await expect(notice(page)).toHaveCount(0);
    // The region stays for what comes next, and the playhead where it was.
    await expectRegion(page, { start: 3, end: 5 });
    expect((await uiState(page)).time).toBe(8);

    // What is in the region already animates the glyphs: nothing is added, and a notice says why.
    // From the Animations panel's button this time: it adds in the region too, and says so.
    await page.getByTestId('clip-a').click({ position: { x: 20, y: 30 } });
    await page.getByTestId('animations-tab-timing').click();
    const add = page.getByTestId('add-animation');
    await expect(add).toHaveAttribute('title', 'Add an animation in the region (3.00–5.00 s)');
    await add.click();
    await expect(header(page)).toHaveText('Add animation · f1 · region 3.00–5.00 s');
    await pickAnimation(page, 'wiggle');
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
    await expect(page.getByTestId('clip-notice')).toContainText(
      'It does not fit in the region (3.00–5.00 s): nothing was added. The Indicate block at 3.00 s animates',
    );

    // The same from the clip's menu on the timeline, as a notice.
    await rightClickClip(page, 'a', 7);
    await pickAnimation(page, 'wiggle');
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
    await expect(notice(page)).toHaveCount(1);
    await expect(notice(page)).toContainText('No room for that animation');
    await expect(notice(page)).toContainText(
      'It does not fit in the region (3.00–5.00 s): nothing was added. The Indicate block at 3.00 s animates',
    );
    await page.getByTestId('notice-dismiss').click();

    // A clip that does not hold the region takes no block: the menu says so before the choice.
    await drawRegion(page, 1, 3);
    await rightClickClip(page, 'b', 6);
    await expect(header(page)).toHaveText(
      'Add animation · f2 · region 1.00–3.00 s · not inside this clip',
    );
    await pickAnimation(page, 'fade_out');
    expect((await clipOf(page, 'b')).actions).toEqual([]);
    await expect(notice(page)).toContainText(
      'The region (1.00–3.00 s) is not inside this clip (2.00–8.00 s): nothing was added.',
    );
    await page.getByTestId('notice-dismiss').click();

    // The clip's menu opened from the keyboard says the region too.
    await page.getByTestId('clip-a').focus();
    await page.keyboard.press('Shift+F10');
    await expect(header(page)).toHaveText('Add animation · f1 · region 1.00–3.00 s');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('add-animation-menu')).toHaveCount(0);

    // Without the region the menu adds at the playhead again.
    await page.keyboard.press('Escape');
    await expectRegion(page, null);
    await rightClickClip(page, 'b', 6);
    await expect(header(page)).toHaveText('Add animation · f2 · playhead 8.00 s');
    await page.keyboard.press('Escape');
  });

  test('a new relation takes it as its window, or is not made', async ({ page }) => {
    // f1 over 0–6 s, f2 over 2–8 s: a window between the two may lie within 2–6 s.
    await openRelationScene(page, [plain('a', 'fa', 't1', 0, 6), plain('b', 'fb', 't2', 2, 8)]);
    await setTime(page, 2.5);
    await drawRegion(page, 3, 5.5);
    await selectClip(page, 'a');
    await page.getByTestId('create-relation-other').selectOption('b');
    await page.getByTestId('create-relation-button').click();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    await relationTab(page, 'animation');
    await expect(page.getByTestId('rel-window')).toContainText('Window 3.00 → 5.50 s');
    await expect(page.getByTestId('rel-window-note')).toHaveCount(0);
    await page.getByTestId('rel-cancel').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    await expectRegion(page, { start: 3, end: 5.5 });

    // A region the two clips do not allow a window all along: no relation, and why.
    await drawRegion(page, 5, 7);
    await page.getByTestId('create-relation-button').click();
    await expect(page.getByTestId('rel-error')).toHaveText(
      'No window fits in the region (5.00–7.00 s): the two clips allow one within 2.00–6.00 s. Nothing was created: move the region, or remove it (Esc) to start the relation at the playhead.',
    );
    await page.getByTestId('rel-error-ok').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    expect(await relations(page)).toEqual([]);
    await expectRegion(page, { start: 5, end: 7 });
  });

  test('a formula brought to the timeline takes it: dropped on a track, or added from its menu', async ({
    page,
  }) => {
    await openBlockScene(page, []);
    await drawRegion(page, 3, 5);
    // Dragged over the empty track 3 at 8 s, the ghost of the clip is the region; over track 1,
    // which has clip a all along it, there is none.
    const ghost = page.locator('.tl-ghost');
    await dragOver(page, 'fb', 't3', 8);
    await expect(ghost).toHaveCount(1);
    const shown = await box(ghost);
    expect(shown.x).toBeCloseTo(await timeToX(page, 3), 0);
    expect(shown.width).toBeCloseTo(160, 0);
    await dragOver(page, 'fb', 't1', 8);
    await expect(ghost).toHaveCount(0);
    // Dropped at 8 s on the empty track 3: the clip takes the region, not the drop's time.
    await dropFormula(page, 'fb', 't3', 8);
    const dropped = (await getProject(page)).clips.filter((c) => c.trackId === 't3');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ formulaId: 'fb', start: 3, end: 5 });
    await expect(notice(page)).toHaveCount(0);

    // Track 1 has clip a all along the region: nothing is added there, and a notice says why.
    await dropFormula(page, 'fb', 't1', 8);
    expect((await getProject(page)).clips).toHaveLength(3);
    await expect(notice(page)).toContainText('No room in the region');
    await expect(notice(page)).toContainText(
      'Track “Track 1” has a clip in the region (3.00–5.00 s): nothing was added.',
    );
    await page.getByTestId('notice-dismiss').click();

    // «Add to the timeline» names no track: no track has the region free now, so the clip gets a
    // new one on top.
    const before = (await getProject(page)).tracks.map((t) => t.id);
    await page.locator('[data-testid="formula-item"][data-name="f2"]').click({ button: 'right' });
    await page.getByTestId('formula-menu-add-to-timeline').click();
    const after = await getProject(page);
    expect(after.tracks.map((t) => t.id).slice(1)).toEqual(before);
    const added = after.clips.filter((c) => c.trackId === after.tracks[0]!.id);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ formulaId: 'fb', start: 3, end: 5 });
    await expectRegion(page, { start: 3, end: 5 });

    // Another region: the next clip goes on the first track from the top that has it free.
    await drawRegion(page, 8.5, 9.5);
    await page.locator('[data-testid="formula-item"][data-name="f2"]').click({ button: 'right' });
    await page.getByTestId('formula-menu-add-to-timeline').click();
    const last = await getProject(page);
    expect(last.tracks).toHaveLength(after.tracks.length);
    // That is the track on top, made a moment ago.
    expect(last.clips.at(-1)).toMatchObject({
      formulaId: 'fb',
      trackId: after.tracks[0]!.id,
      start: 8.5,
      end: 9.5,
    });
  });
});
