import { expect, test } from './test';
import { undo } from './helpers';
import { addAudioInterval, audioClip, importMp3, selectAudio, startAudioApp } from './audioHelpers';
import {
  box,
  clipJson,
  clipOf,
  dragTo,
  openTimeline,
  PX_PER_SECOND,
  uiState,
} from './timelineHelpers';

/* Trimming several selected clips together (D168): the same edge of every selected clip moves by
 * the same time, as far as all of them allow. a [1, 4] and c [5, 8] share track 1; b [2, 6] is on
 * track 2. Every clip has an intro and an outro of 1 s: it cannot be shorter than 2 s. */
const A = clipJson('a', 'fa', 't1', 1, 4);
const B = clipJson('b', 'fb', 't2', 2, 6);
const C = clipJson('c', 'fa', 't1', 5, 8);

const body = { position: { x: 30, y: 8 } };

test.describe('timeline: trimming several clips together', () => {
  test('the end of every selected clip moves by the same time, and one undo takes it back', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, C]);
    await page.getByTestId('timeline-snap').click(); // exact pixels
    await page.getByTestId('clip-a').click(body);
    await page.getByTestId('clip-b').click({ ...body, modifiers: ['ControlOrMeta'] });
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a', 'b'] });

    // The end of b, half a second to the right: a's end goes with it; c is not selected.
    const h = await box(page.getByTestId('clip-b-trim-end'));
    await dragTo(
      page,
      { x: h.x + 3, y: h.y + 10 },
      { x: h.x + 3 + PX_PER_SECOND / 2, y: h.y + 10 },
    );
    expect((await clipOf(page, 'a')).end).toBeCloseTo(4.5, 2);
    expect((await clipOf(page, 'b')).end).toBeCloseTo(6.5, 2);
    expect((await clipOf(page, 'c')).end).toBe(8);
    // The selection is kept: the next drag moves them both again.
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a', 'b'] });
    await undo(page);
    expect((await clipOf(page, 'a')).end).toBe(4);
    expect((await clipOf(page, 'b')).end).toBe(6);
  });

  test('when one of them meets something, they all stop', async ({ page }) => {
    await openTimeline(page, [A, B, C]);
    await page.getByTestId('timeline-snap').click();
    await page.getByTestId('clip-a').click(body);
    await page.getByTestId('clip-b').click({ ...body, modifiers: ['ControlOrMeta'] });
    // Far to the right: a stops at c (5), one second on, and b stops with it.
    const h = await box(page.getByTestId('clip-b-trim-end'));
    await dragTo(page, { x: h.x + 3, y: h.y + 10 }, { x: h.x + 500, y: h.y + 10 });
    expect((await clipOf(page, 'a')).end).toBeCloseTo(5, 6);
    expect((await clipOf(page, 'b')).end).toBeCloseTo(7, 6);
    // Far to the left: a cannot be shorter than its intro and outro (2 s): one second back.
    const h2 = await box(page.getByTestId('clip-b-trim-end'));
    await dragTo(page, { x: h2.x + 3, y: h2.y + 10 }, { x: h2.x - 700, y: h2.y + 10 });
    expect((await clipOf(page, 'a')).end).toBeCloseTo(3, 6);
    expect((await clipOf(page, 'b')).end).toBeCloseTo(5, 6);
  });

  test('the starts move together too, and an edge of an unselected clip trims it alone', async ({
    page,
  }) => {
    await openTimeline(page, [A, B, C]);
    await page.getByTestId('timeline-snap').click();
    await page.getByTestId('clip-a').click(body);
    await page.getByTestId('clip-b').click({ ...body, modifiers: ['ControlOrMeta'] });
    const h = await box(page.getByTestId('clip-a-trim-start'));
    await dragTo(
      page,
      { x: h.x + 3, y: h.y + 10 },
      { x: h.x + 3 - PX_PER_SECOND / 2, y: h.y + 10 },
    );
    expect((await clipOf(page, 'a')).start).toBeCloseTo(0.5, 2);
    expect((await clipOf(page, 'b')).start).toBeCloseTo(1.5, 2);
    expect((await clipOf(page, 'a')).end).toBe(4);

    // c is not selected: its edge selects it and trims it alone, as always.
    const hc = await box(page.getByTestId('clip-c-trim-end'));
    await dragTo(
      page,
      { x: hc.x + 3, y: hc.y + 10 },
      { x: hc.x + 3 + PX_PER_SECOND, y: hc.y + 10 },
    );
    expect((await clipOf(page, 'c')).end).toBeCloseTo(9, 2);
    expect((await clipOf(page, 'b')).end).toBe(6);
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['c'] });
  });

  test('sounds selected together are trimmed together', async ({ page }) => {
    await startAudioApp(page);
    const asset = await importMp3(page);
    // Two intervals of the four-second recording: [0, 2] and, later, [3, 5].
    const first = await addAudioInterval(page, asset.id, 0.5, 2.5, 0);
    const second = await addAudioInterval(page, asset.id, 1, 3, 3);
    await page.getByTestId('timeline-snap').click();
    await selectAudio(page, first.id);
    await page
      .getByTestId(`audio-clip-${second.id}`)
      .locator('.tl-audio-caption span')
      .click({ modifiers: ['ControlOrMeta'] });
    const px = (await box(page.getByTestId(`audio-clip-${first.id}`))).width / 2;

    // Half a second off the end of the second one: the first loses it too.
    const h = await box(page.getByTestId(`audio-trim-end-${second.id}`));
    const y = h.y + h.height / 2;
    await dragTo(page, { x: h.x + 2, y }, { x: h.x + 2 - px / 2, y });
    expect((await audioClip(page, first.id)).end).toBeCloseTo(1.5, 1);
    expect((await audioClip(page, second.id)).end).toBeCloseTo(4.5, 1);
    expect((await audioClip(page, first.id)).end - first.end).toBeCloseTo(
      (await audioClip(page, second.id)).end - second.end,
      3,
    );
    // Forward again, far: the first one runs out of recording after 1.5 s more than it had
    // (it plays up to 2.5 s of 4 s), and the second stops with it.
    const h2 = await box(page.getByTestId(`audio-trim-end-${second.id}`));
    await dragTo(page, { x: h2.x + 2, y }, { x: h2.x + 2 + px * 6, y });
    expect((await audioClip(page, second.id)).end).toBeCloseTo(6, 2);
    expect((await audioClip(page, first.id)).end).toBeCloseTo(3, 2);
    await undo(page);
    await undo(page);
    expect((await audioClip(page, first.id)).end).toBe(first.end);
    expect((await audioClip(page, second.id)).end).toBe(second.end);
  });
});
