/* The guard of the Slides mode (D200): an edit that covers a pause or a comment is asked about
 * when it is made — delete the mark and keep the edit, or take the edit back. */
import { expect, test } from './test';
import { canUndo, undo } from './helpers';
import { clipJson, clipOf, moveClip, openTimeline, project } from './timelineHelpers';

/** A clip of `alpha` on [0, 3] with an intro and an outro of 1 s: the scene rests over [1, 2], and
 * a pause and a comment stand there. A second pause stands at 3 s, the instant the scene ends at. */
const marks = [
  { id: 'p1', time: 1.5, kind: 'pause' },
  { id: 'p2', time: 1.75, kind: 'comment', text: 'A flash over the alpha' },
  { id: 'p3', time: 3, kind: 'pause', text: 'Questions' },
];
const open = (page: Parameters<typeof openTimeline>[0], held: typeof marks = marks) =>
  openTimeline(page, [clipJson('c1', 'fa', 't1', 0, 3)], { slides: { marks: held } });

const markIds = async (page: Parameters<typeof project>[0]) => {
  const { slides } = (await project(page)) as unknown as { slides?: { marks: { id: string }[] } };
  return (slides?.marks ?? []).map((mark) => mark.id);
};

test('dragging a clip over a pause asks, and deleting the marks keeps the drag as one step', async ({
  page,
}) => {
  await open(page);
  // One second later: the intro runs over [1, 2], on the pause and on the comment. The outro then
  // starts at 3 s, where the second pause is: an edge, where a mark may stand.
  await moveClip(page, 'c1', 1);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('This change covers 2 marks of the Slides mode');
  await expect(page.getByTestId('dialog-details').locator('li')).toHaveText([
    'Pause at 1.50 s — the intro of "alpha" runs there now',
    'Comment at 1.75 s: “A flash over the alpha” — the intro of "alpha" runs there now',
  ]);
  await page.getByTestId('dialog-delete-marks').click();
  await expect(dialog).toBeHidden();
  expect((await clipOf(page, 'c1')).start).toBe(1);
  // Only what the drag covered went.
  expect(await markIds(page)).toEqual(['p3']);
  // One undo brings the clip back, and the marks with it; nothing is asked on the way.
  await undo(page);
  expect((await clipOf(page, 'c1')).start).toBe(0);
  expect(await markIds(page)).toEqual(['p1', 'p2', 'p3']);
  await expect(dialog).toBeHidden();
  expect(await canUndo(page)).toBe(false);
});

test('taking the change back puts the clip where it was, by the button and by Escape', async ({
  page,
}) => {
  await open(page);
  await moveClip(page, 'c1', 1);
  await page.getByTestId('dialog-take-back').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await clipOf(page, 'c1')).start).toBe(0);
  expect(await markIds(page)).toEqual(['p1', 'p2', 'p3']);
  expect(await canUndo(page)).toBe(false);

  await moveClip(page, 'c1', 1);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await clipOf(page, 'c1')).start).toBe(0);
  expect(await markIds(page)).toEqual(['p1', 'p2', 'p3']);
});

test('an edit that reaches no mark asks nothing', async ({ page }) => {
  await open(page, marks.slice(0, 2));
  // Half a second later: the intro ends at 1.5 s, on the first mark — an edge, where a mark may
  // stand —, and the outro starts at 2.5 s, after the second.
  await moveClip(page, 'c1', 0.5);
  expect((await clipOf(page, 'c1')).start).toBe(0.5);
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await markIds(page)).toEqual(['p1', 'p2']);
  expect(await canUndo(page)).toBe(true);
});
