import { expect, test, type Page } from './test';
import { appearJson, blockLocator, disappearJson } from './blockHelpers';
import { someTextField, undo } from './helpers';
import { openRelationScene, plain } from './relationsHelpers';
import { box, clipOf, dragTo, PX_PER_SECOND, uiState } from './timelineHelpers';

/* Alt held: only the edges answer the pointer — those of the clips, and the inner edge of their
 * intro and of their outro. A block that ends where its clip does lies over the upper half of the
 * clip's edge, and a relation window that ends there over the lower half: a press on the edge is
 * theirs, and the clip cannot be trimmed from it; a window that crosses where an outro starts
 * lies over the edge that makes the outro longer or shorter. With Alt held nothing in the lanes
 * takes the pointer but those handles. */

// Clip `a` (0–10 s) ends with a FadeOut block (9–10 s) and with the window of the relation
// b → a (9–10 s); it has a Write in the middle too. Clip `b` is on the track under it.
const RELATION = {
  id: 'r1',
  fromClipId: 'b',
  toClipId: 'a',
  offset: 9,
  duration: 1,
  easing: 'smooth',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [0], to: [0], style: null }],
};
const A = plain('a', 'fa', 't1', 0, 10, {
  actions: [appearJson('w', 3, 1, 'write', [4]), disappearJson('out', 9, 1, 'fade_out', [4])],
});
const B = plain('b', 'fb', 't2', 4, 12);

const tracks = (page: Page) => page.getByTestId('timeline-tracks');

/** What the pointer would press at a point: the test id of the element there. */
const pressedAt = (page: Page, point: { x: number; y: number }) =>
  page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
    point,
  );

test('with Alt held, the edge of a clip trims it through the block and the window that cover it', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], { relations: [RELATION] });
  const clip = await box(page.getByTestId('clip-a'));
  const block = await box(blockLocator(page, 'out'));
  const band = await box(page.getByTestId('relation-window-r1'));
  // Two points on the clip's right edge: at the height of the block, and of the window.
  const upper = { x: clip.x + clip.width - 3, y: block.y + block.height / 2 };
  const lower = { x: clip.x + clip.width - 3, y: band.y + band.height / 2 };
  // Without Alt the edge is theirs: the clip's own handle is under them.
  expect(await pressedAt(page, upper)).toMatch(/^action-block-out/);
  expect(await pressedAt(page, lower)).toMatch(/^relation-window-r1/);
  await expect(tracks(page)).not.toHaveAttribute('data-trim-only');

  await page.keyboard.down('Alt');
  await expect(tracks(page)).toHaveAttribute('data-trim-only', '');
  expect(await pressedAt(page, upper)).toBe('clip-a-trim-end');
  expect(await pressedAt(page, lower)).toBe('clip-a-trim-end');
  // A drag from the edge trims the clip, from either half; the block is not what it took.
  await dragTo(page, upper, { x: upper.x - 0.5 * PX_PER_SECOND, y: upper.y });
  expect((await clipOf(page, 'a')).end).toBeCloseTo(9.5, 1);
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
  await undo(page);
  expect((await clipOf(page, 'a')).end).toBe(10);
  await dragTo(page, lower, { x: lower.x - PX_PER_SECOND, y: lower.y });
  expect((await clipOf(page, 'a')).end).toBeCloseTo(9, 1);
  await undo(page);
  expect((await clipOf(page, 'a')).end).toBe(10);
  // The start edge too.
  const start = { x: clip.x + 3, y: clip.y + clip.height / 2 };
  expect(await pressedAt(page, start)).toBe('clip-a-trim-start');

  // Nothing else in the lanes can be pressed meanwhile: not a block, not the clip itself (it
  // does not move), not the window.
  const before = (await uiState(page)).selection;
  const other = await box(page.getByTestId('clip-b'));
  await page.mouse.click(other.x + other.width / 2, other.y + other.height - 6);
  const write = await box(blockLocator(page, 'w'));
  const onWrite = { x: write.x + write.width / 2, y: write.y + write.height / 2 };
  await page.mouse.click(onWrite.x, onWrite.y);
  await page.mouse.click(lower.x - 30, lower.y);
  const body = { x: clip.x + clip.width / 2, y: clip.y + clip.height - 6 };
  await dragTo(page, body, { x: body.x + 2 * PX_PER_SECOND, y: body.y });
  expect((await uiState(page)).selection).toEqual(before);
  expect(await clipOf(page, 'a')).toMatchObject({ start: 0, end: 10 });
  // The track headers are not part of it: their keys still answer.
  const header = await box(page.getByTestId('track-lock-t1'));
  expect(
    await pressedAt(page, { x: header.x + header.width / 2, y: header.y + header.height / 2 }),
  ).toBe('track-lock-t1');

  // Alt released: the blocks and the window answer again.
  await page.keyboard.up('Alt');
  await expect(tracks(page)).not.toHaveAttribute('data-trim-only');
  expect(await pressedAt(page, upper)).toMatch(/^action-block-out/);
  await page.mouse.click(onWrite.x, onWrite.y);
  expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'w' });
});

test('with Alt held, the inner edge of an intro and of an outro answers too, through the window that covers it', async ({
  page,
}) => {
  // Clip `a` (0–10 s) is written for a second and fades out over its last one; the relation
  // a → b has its window over 8.5–9.5 s, across the edge where the outro starts (9 s).
  const phase = (kind: string) => ({
    kind,
    duration: 1,
    easing: 'smooth',
    lagRatio: null,
    shift: [0, 0] as [number, number],
    scale: 1,
  });
  const a = plain('a', 'fa', 't1', 0, 10, { intro: phase('write'), outro: phase('fade_out') });
  const b = plain('b', 'fb', 't2', 8.5, 14);
  const relation = { ...RELATION, fromClipId: 'a', toClipId: 'b', offset: 0 };
  await openRelationScene(page, [a, b], { relations: [relation] });
  const middle = async (testId: string) => {
    const zone = await box(page.getByTestId(testId));
    return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
  };
  const durations = async () => {
    const clip = await clipOf(page, 'a');
    return [clip.intro.duration, clip.outro.duration];
  };
  const outro = await middle('clip-a-outro-handle');
  const intro = await middle('clip-a-intro-handle');
  // Without Alt the window of the relation lies over the outro's edge: a press there is its own.
  expect(await pressedAt(page, outro)).toMatch(/^relation-source-window-r1/);

  await page.keyboard.down('Alt');
  await expect(tracks(page)).toHaveAttribute('data-trim-only', '');
  expect(await pressedAt(page, outro)).toBe('clip-a-outro-handle');
  expect(await pressedAt(page, intro)).toBe('clip-a-intro-handle');
  // They show where they are, as the edges of the clip do.
  const shown = (testId: string) =>
    page.getByTestId(testId).evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await shown('clip-a-outro-handle')).toBe(await shown('clip-a-trim-end'));
  expect(await shown('clip-a-intro-handle')).toBe(await shown('clip-a-trim-end'));
  // And they are the whole of their dashed line: the strip of the blocks, above, is theirs too.
  const clip = await box(page.getByTestId('clip-a'));
  const edge = await box(page.getByTestId('clip-a-trim-end'));
  expect((await box(page.getByTestId('clip-a-outro-handle'))).height).toBe(edge.height);
  expect(await pressedAt(page, { x: outro.x, y: clip.y + 4 })).toBe('clip-a-outro-handle');
  // A drag makes the outro a second longer, and the intro too: one undo step each.
  await dragTo(page, outro, { x: outro.x - PX_PER_SECOND, y: outro.y });
  expect(await durations()).toEqual([1, 2]);
  await dragTo(page, intro, { x: intro.x + PX_PER_SECOND, y: intro.y });
  expect(await durations()).toEqual([2, 2]);
  expect(await clipOf(page, 'a')).toMatchObject({ start: 0, end: 10 });
  await undo(page);
  await undo(page);
  expect(await durations()).toEqual([1, 1]);
  // The edges of the clip still trim it.
  expect(await pressedAt(page, await middle('clip-a-trim-end'))).toBe('clip-a-trim-end');

  // A locked track keeps its animations: the edge is not shown, and a drag changes nothing.
  await page.keyboard.up('Alt');
  await page.getByTestId('track-lock-t1').click();
  await page.keyboard.down('Alt');
  expect(await shown('clip-a-outro-handle')).toBe('rgba(0, 0, 0, 0)');
  await dragTo(page, outro, { x: outro.x - PX_PER_SECOND, y: outro.y });
  expect(await durations()).toEqual([1, 1]);

  // Alt released: the window is over the edge again.
  await page.keyboard.up('Alt');
  await expect(tracks(page)).not.toHaveAttribute('data-trim-only');
  expect(await pressedAt(page, outro)).toMatch(/^relation-source-window-r1/);
});

test('Alt in a text field or under a dialog does not change what the timeline answers to', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  // A text field keeps the key: Alt types characters on a Mac.
  const search = await someTextField(page);
  await search.focus();
  await page.keyboard.down('Alt');
  await expect(tracks(page)).not.toHaveAttribute('data-trim-only');
  await page.keyboard.up('Alt');
  // Held when the window loses the focus (Alt+Tab): it is not left on.
  await page.getByTestId('clip-a').click();
  await page.keyboard.down('Alt');
  await expect(tracks(page)).toHaveAttribute('data-trim-only', '');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(tracks(page)).not.toHaveAttribute('data-trim-only');
  await page.keyboard.up('Alt');
});
