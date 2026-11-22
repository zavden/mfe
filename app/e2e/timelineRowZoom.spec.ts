import { expect, test, type Page } from './test';
import { addAudioInterval, importMp3, startAudioApp } from './audioHelpers';
import { appearJson, blockLocator } from './blockHelpers';
import { canUndo } from './helpers';
import { openRelationScene, plain } from './relationsHelpers';
import { box, clipOf, dragTo, moveClip, uiState } from './timelineHelpers';

/* The height of the tracks: the keys in the corner over the track headers make every track
 * taller or lower (a vertical zoom), and the top and bottom edges of a track's header resize that
 * track alone. Everything a track draws follows: its clips, their blocks and the relation
 * windows. A view state: the project does not change. */

const RELATION = {
  id: 'r1',
  fromClipId: 'b',
  toClipId: 'a',
  offset: 2,
  duration: 1,
  easing: 'smooth',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [0], to: [0], style: null }],
};
const A = plain('a', 'fa', 't1', 0, 10, { actions: [appearJson('w', 5, 1, 'write', [4])] });
const B = plain('b', 'fb', 't2', 1, 6);

const ROW = 46;
const LANE = 19;
const INSET = 4;

const rowHeight = async (page: Page, track: string) =>
  (await box(page.getByTestId(`track-row-${track}`))).height;
const zoomIn = (page: Page) => page.getByTestId('timeline-row-zoom-in');
const zoomOut = (page: Page) => page.getByTestId('timeline-row-zoom-out');
const reset = (page: Page) => page.getByTestId('timeline-row-zoom-reset');

/** A point on the top or bottom edge of a track's header. */
async function headerEdge(page: Page, track: string, edge: 'top' | 'bottom') {
  const strip = await box(page.getByTestId(`track-size-${edge}-${track}`));
  return { x: strip.x + strip.width / 2, y: strip.y + strip.height / 2 };
}

test('the keys in the corner make every track taller, with all that is drawn in it', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], { relations: [RELATION] });
  const before = JSON.stringify(await clipOf(page, 'a'));
  // The standard height: nothing lower, nothing to go back to.
  await expect(reset(page)).toHaveText('100 %');
  await expect(reset(page)).toBeDisabled();
  await expect(zoomOut(page)).toBeDisabled();
  expect(await rowHeight(page, 't1')).toBe(ROW);
  // The keys are in the corner over the headers, left of the ruler.
  const corner = await box(page.getByRole('group', { name: 'Track height' }));
  const ruler = await box(page.getByTestId('timeline-ruler'));
  const header = await box(page.getByTestId('track-header-t1'));
  expect(corner.x + corner.width).toBeLessThanOrEqual(ruler.x);
  expect(corner.y + corner.height).toBeLessThanOrEqual(header.y + 1);

  // One step: 125 %. A lane is 24 px (19 × 1.25, on whole pixels), a track two lanes and the
  // space around its clips.
  await zoomIn(page).click();
  await expect(reset(page)).toHaveText('125 %');
  const lane = Math.round(LANE * 1.25);
  for (const track of ['t1', 't2', 't3']) {
    expect(await rowHeight(page, track)).toBe(2 * INSET + 2 * lane);
  }
  await expect(page.getByTestId('track-row-t1')).toHaveAttribute('data-scale', '1.25');
  // The clip fills its track; its block has a lane; the relation window the lower lane.
  const row = await box(page.getByTestId('track-row-t1'));
  const clip = await box(page.getByTestId('clip-a'));
  const block = await box(blockLocator(page, 'w'));
  const band = await box(page.getByTestId('relation-window-r1'));
  expect(clip.height).toBeCloseTo(row.height - 1 - 2 * INSET, 0); // the row's own line
  expect(block.height).toBe(lane - 3);
  expect(block.y - clip.y).toBeGreaterThanOrEqual(1);
  expect(block.y + block.height).toBeLessThanOrEqual(clip.y + lane + 1);
  expect(band.height).toBe(lane);
  expect(Math.abs(band.y + band.height - (clip.y + clip.height))).toBeLessThanOrEqual(1);
  // The header is as tall as its track (less the row's line), its keys still inside it.
  const tall = await box(page.getByTestId('track-header-t1'));
  expect(tall.height).toBe(row.height - 1);
  await expect(page.getByTestId('track-lock-t1')).toBeVisible();

  // Up to three times the standard height, by steps of a quarter; then no further.
  for (let i = 0; i < 7; i += 1) await zoomIn(page).click();
  await expect(reset(page)).toHaveText('300 %');
  await expect(zoomIn(page)).toBeDisabled();
  expect(await rowHeight(page, 't1')).toBe(2 * INSET + 2 * (LANE * 3));
  await zoomOut(page).click();
  await expect(reset(page)).toHaveText('275 %');
  // The percentage puts the standard height back.
  await reset(page).click();
  await expect(reset(page)).toHaveText('100 %');
  expect(await rowHeight(page, 't1')).toBe(ROW);
  // Nothing of this is the project's: no change, no undo step.
  expect(JSON.stringify(await clipOf(page, 'a'))).toBe(before);
  expect(await canUndo(page)).toBe(false);
});

test('at another height the gestures still land where the pointer is', async ({ page }) => {
  await openRelationScene(page, [A, B]);
  for (let i = 0; i < 4; i += 1) await zoomIn(page).click();
  await expect(reset(page)).toHaveText('200 %');
  // A clip dragged to the track under it lands on that track.
  await moveClip(page, 'b', 0, { toTrack: 't3' });
  expect((await clipOf(page, 'b')).trackId).toBe('t3');
  // A block is pressed where it is drawn: on the upper lane of its clip.
  await blockLocator(page, 'w').click();
  expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'w' });
  // A rectangle over the lane of the third track takes the clip there, and that one alone (the
  // tracks are taller than the panel now: the lane is brought into view first).
  await page.getByTestId('track-lane-t3').scrollIntoViewIfNeeded();
  const lane = await box(page.getByTestId('track-lane-t3'));
  const ruler = await box(page.getByTestId('timeline-ruler'));
  await dragTo(
    page,
    { x: ruler.x + 7 * 80, y: lane.y + lane.height - 6 },
    { x: ruler.x + 0.5 * 80, y: lane.y + 6 },
  );
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['b'] });
});

test('the edges of a track header resize that track alone', async ({ page }) => {
  await openRelationScene(page, [A, B]);
  // The bottom edge follows the pointer: 40 px lower, the track is 40 px taller.
  let edge = await headerEdge(page, 't1', 'bottom');
  await dragTo(page, edge, { x: edge.x, y: edge.y + 40 });
  expect(await rowHeight(page, 't1')).toBe(ROW + 40);
  expect(await rowHeight(page, 't2')).toBe(ROW);
  // Its block and its clip grew with it.
  expect((await box(blockLocator(page, 'w'))).height).toBe((ROW + 40 - 2 * INSET) / 2 - 3);
  // The top edge, pulled up, makes it taller too.
  edge = await headerEdge(page, 't1', 'top');
  await dragTo(page, edge, { x: edge.x, y: edge.y - 20 });
  expect(Math.abs((await rowHeight(page, 't1')) - (ROW + 60))).toBeLessThanOrEqual(1);
  // Pushed back past the standard height, it stops there: a header needs its two lines.
  edge = await headerEdge(page, 't1', 'bottom');
  await dragTo(page, edge, { x: edge.x, y: edge.y - 300 });
  expect(await rowHeight(page, 't1')).toBe(ROW);
  await expect(reset(page)).toBeDisabled();

  // Escape during the drag puts the height back.
  edge = await headerEdge(page, 't2', 'bottom');
  await dragTo(page, edge, { x: edge.x, y: edge.y + 50 }, { release: false });
  expect(await rowHeight(page, 't2')).toBe(ROW + 50);
  await page.keyboard.press('Escape');
  expect(await rowHeight(page, 't2')).toBe(ROW);
  await page.mouse.up();

  // A track with a height of its own keeps its proportion when all of them are zoomed, and
  // goes back to the height of the others with a double-click on an edge.
  edge = await headerEdge(page, 't2', 'bottom');
  await dragTo(page, edge, { x: edge.x, y: edge.y + 38 }); // twice the standard lanes
  expect(await rowHeight(page, 't2')).toBe(ROW + 38);
  await expect(reset(page)).toBeEnabled();
  await zoomIn(page).click();
  await expect(page.getByTestId('track-row-t2')).toHaveAttribute('data-scale', '2.5');
  await expect(page.getByTestId('track-row-t1')).toHaveAttribute('data-scale', '1.25');
  await page.getByTestId('track-size-top-t2').dblclick();
  await expect(page.getByTestId('track-row-t2')).toHaveAttribute('data-scale', '1.25');
  // The percentage puts every track back, the resized ones too.
  edge = await headerEdge(page, 't3', 'bottom');
  await dragTo(page, edge, { x: edge.x, y: edge.y + 30 });
  await reset(page).click();
  for (const track of ['t1', 't2', 't3']) expect(await rowHeight(page, track)).toBe(ROW);
});

test('the track an edge resizes is lit while the pointer is on that edge or drags it', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  const lane = (track: string) =>
    page.getByTestId(`track-row-${track}`).evaluate((el) => getComputedStyle(el).backgroundColor);
  const card = (track: string) =>
    page
      .getByTestId(`track-header-${track}`)
      .evaluate((el) => getComputedStyle(el, '::before').borderTopColor);
  const plainLane = await lane('t1');
  const plainCard = await card('t1');
  // The bottom edge of a track and the top edge of the next are a hair apart: the line under
  // the pointer does not say which of the two it resizes.
  const lower = await headerEdge(page, 't1', 'bottom');
  const upper = await headerEdge(page, 't2', 'top');
  expect(upper.y - lower.y).toBeLessThan(8);
  await page.mouse.move(lower.x, lower.y);
  await expect.poll(() => lane('t1')).not.toBe(plainLane);
  await expect.poll(() => card('t1')).not.toBe(plainCard);
  expect(await lane('t2')).toBe(plainLane);
  expect(await card('t2')).toBe(plainCard);
  await page.mouse.move(upper.x, upper.y);
  await expect.poll(() => lane('t2')).not.toBe(plainLane);
  await expect.poll(() => card('t2')).not.toBe(plainCard);
  await expect.poll(() => lane('t1')).toBe(plainLane);
  await expect.poll(() => card('t1')).toBe(plainCard);
  // It stays lit for the whole drag, wherever the pointer goes, and no longer than that.
  await dragTo(page, upper, { x: upper.x + 300, y: upper.y - 30 }, { release: false });
  expect(await rowHeight(page, 't2')).toBe(ROW + 30);
  expect(await lane('t2')).not.toBe(plainLane);
  expect(await lane('t1')).toBe(plainLane);
  await page.mouse.up();
  await expect.poll(() => lane('t2')).toBe(plainLane);
  await expect.poll(() => card('t2')).toBe(plainCard);
});

test('the two keys beside the name of a track make that track alone lower or taller', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  const lower = (track: string) => page.getByTestId(`track-lower-${track}`);
  const taller = (track: string) => page.getByTestId(`track-taller-${track}`);
  const scaleOf = (track: string) => page.getByTestId(`track-row-${track}`);
  // On the line of the name, at its end, inside the header.
  const header = await box(page.getByTestId('track-header-t1'));
  const name = await box(page.getByTestId('track-name-t1'));
  const [minus, plus] = [await box(lower('t1')), await box(taller('t1'))];
  expect(header.width).toBe(188);
  expect(minus.x).toBeGreaterThanOrEqual(name.x + name.width);
  expect(plus.x).toBeGreaterThan(minus.x);
  expect(plus.x + plus.width).toBeLessThanOrEqual(header.x + header.width);
  expect(Math.abs(minus.y + minus.height / 2 - (name.y + name.height / 2))).toBeLessThanOrEqual(2);
  await expect(lower('t1')).toHaveAccessibleName('Lower Track 1');
  await expect(taller('t1')).toHaveAccessibleName('Taller Track 1');

  // The standard height is the lowest. A step: that track at 125 %, the others as they were.
  await expect(lower('t1')).toBeDisabled();
  await taller('t1').click();
  await expect(scaleOf('t1')).toHaveAttribute('data-scale', '1.25');
  expect(await rowHeight(page, 't1')).toBe(2 * INSET + 2 * 24);
  expect(await rowHeight(page, 't2')).toBe(ROW);
  await expect(reset(page)).toHaveText('100 %');
  await expect(reset(page)).toBeEnabled();
  expect(await canUndo(page)).toBe(false); // a view state
  await lower('t1').click();
  expect(await rowHeight(page, 't1')).toBe(ROW);
  await expect(lower('t1')).toBeDisabled();

  // From the keyboard: Tab reaches them, Enter presses.
  await taller('t2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(scaleOf('t2')).toHaveAttribute('data-scale', '1.5');
  await expect(taller('t2')).toBeFocused();

  // With the zoom of all the tracks: the track keeps its own proportion, and can be lower than
  // the others, down to the standard height.
  await zoomIn(page).click();
  await expect(scaleOf('t1')).toHaveAttribute('data-scale', '1.25');
  await expect(scaleOf('t2')).toHaveAttribute('data-scale', '1.875');
  await lower('t1').click();
  await expect(scaleOf('t1')).toHaveAttribute('data-scale', '1');
  await expect(scaleOf('t3')).toHaveAttribute('data-scale', '1.25');
  // A height between two marks goes to the nearest mark on the side asked.
  await lower('t2').click();
  await expect(scaleOf('t2')).toHaveAttribute('data-scale', '1.75');

  // Up to four times the standard height, where the key stops.
  for (let i = 0; i < 12; i += 1) await taller('t1').click({ force: true });
  await expect(scaleOf('t1')).toHaveAttribute('data-scale', '4');
  await expect(taller('t1')).toBeDisabled();
  // The percentage of the corner puts every track back.
  await reset(page).click();
  for (const track of ['t1', 't2', 't3']) expect(await rowHeight(page, track)).toBe(ROW);

  // The name is still renamed with a double-click, the keys beside its field.
  await page.getByTestId('track-name-t1').dblclick();
  const input = page.getByTestId('track-name-input-t1');
  await expect(input).toBeFocused();
  const field = await box(input);
  expect(field.x + field.width).toBeLessThanOrEqual((await box(lower('t1'))).x);
  await page.keyboard.press('Escape');
});

test('an audio track is zoomed too, and the graph of its clip with it', async ({ page }) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id, 0.5, 3.5, 1);
  const row = page.locator('[data-testid^="track-row-"]').last();
  const graph = page.getByTestId(`audio-curve-${clip.id}`);
  const block = page.getByTestId(`audio-clip-${clip.id}`);
  expect((await box(row)).height).toBe(112);
  expect((await box(graph)).height).toBe(68);
  await zoomIn(page).click();
  await zoomIn(page).click();
  await expect(row).toHaveAttribute('data-scale', '1.5');
  expect((await box(row)).height).toBe(168);
  // The graph has what the taller clip leaves under its caption, and ends inside it.
  const tall = await box(graph);
  const frame = await box(block);
  expect(tall.height).toBe(168 - 44);
  expect(tall.y + tall.height).toBeLessThanOrEqual(frame.y + frame.height);
  // Its volume scale stretches over it: 100 % is still the middle of the graph.
  await page.getByTestId(`audio-line-${clip.id}`).click();
  const unity = await box(page.getByTestId(`audio-volume-line-${clip.id}`));
  expect(Math.abs(unity.y + unity.height / 2 - (tall.y + tall.height / 2))).toBeLessThanOrEqual(2);
});
