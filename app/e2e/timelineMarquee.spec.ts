import { expect, test, type Page } from './test';
import { canUndo } from './helpers';
import { openRelationScene, plain } from './relationsHelpers';
import { uiState } from './timelineHelpers';

/* A drag on empty lane space draws a rectangle over the lanes; the clips it touches (in time and
 * in rows) get selected. Shift/Ctrl add them to the selection; Escape cancels. */

const A = plain('a', 'fa', 't1', 0, 4);
const B = plain('b', 'fb', 't2', 2, 6);
const C = plain('c', 'fa', 't3', 5, 9);

const view = (page: Page) => page.getByTestId('timeline-view');
const selectedIds = async (page: Page) => {
  const { selection } = await uiState(page);
  return selection.kind === 'clips' ? selection.ids : [];
};

/** Page point at `t` seconds on the lane of `track`, in the lane's vertical middle. */
async function laneAt(page: Page, track: string, t: number): Promise<{ x: number; y: number }> {
  const lane = (await page.getByTestId(`track-lane-${track}`).boundingBox())!;
  const a = (await page.getByTestId('clip-a').boundingBox())!;
  const px = a.width / 4; // clip a spans 0 … 4 s
  return { x: lane.x + t * px, y: lane.y + lane.height / 2 };
}

async function dragLane(
  page: Page,
  from: { track: string; t: number },
  to: { track: string; t: number },
  modifier?: 'Shift' | 'ControlOrMeta',
): Promise<void> {
  const p = await laneAt(page, from.track, from.t);
  const q = await laneAt(page, to.track, to.t);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
  await page.mouse.move(q.x, q.y, { steps: 4 });
}

test.describe('timeline marquee', () => {
  test('a rectangle selects the clips it touches as it grows; no undo step', async ({ page }) => {
    await openRelationScene(page, [A, B, C]);
    await expect(view(page)).toHaveAttribute('data-marquee', '');
    // From empty space after a on the top lane down to 3 s on the second: a and b, not c.
    await dragLane(page, { track: 't1', t: 7 }, { track: 't2', t: 3 });
    await expect(view(page)).not.toHaveAttribute('data-marquee', '');
    await expect(page.getByTestId('timeline-marquee')).toBeVisible();
    expect(await selectedIds(page)).toEqual(['a', 'b']);
    await page.mouse.up();
    await expect(view(page)).toHaveAttribute('data-marquee', '');
    expect(await selectedIds(page)).toEqual(['a', 'b']);
    expect(await canUndo(page)).toBe(false);
  });

  test('Shift or Ctrl held adds the touched clips to the selection', async ({ page }) => {
    await openRelationScene(page, [A, B, C]);
    await dragLane(page, { track: 't1', t: 7 }, { track: 't2', t: 3 });
    await page.mouse.up();
    expect(await selectedIds(page)).toEqual(['a', 'b']);
    // Shift held: the selection stays and c joins it.
    await dragLane(page, { track: 't3', t: 1 }, { track: 't3', t: 6 }, 'Shift');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect(await selectedIds(page)).toEqual(['a', 'b', 'c']);
    // Without a modifier the rectangle selects afresh.
    await dragLane(page, { track: 't3', t: 1 }, { track: 't3', t: 6 });
    await page.mouse.up();
    expect(await selectedIds(page)).toEqual(['c']);
    await dragLane(page, { track: 't2', t: 7 }, { track: 't2', t: 1 }, 'ControlOrMeta');
    await page.mouse.up();
    await page.keyboard.up('ControlOrMeta');
    expect(await selectedIds(page)).toEqual(['c', 'b']);
  });

  test('Escape cancels the rectangle and brings the previous selection back', async ({ page }) => {
    await openRelationScene(page, [A, B, C]);
    await page.getByTestId('clip-c').click({ position: { x: 30, y: 8 } });
    expect(await selectedIds(page)).toEqual(['c']);
    await dragLane(page, { track: 't1', t: 7 }, { track: 't2', t: 3 }, 'Shift');
    expect(await selectedIds(page)).toEqual(['c', 'a', 'b']);
    await page.keyboard.press('Escape');
    await expect(view(page)).toHaveAttribute('data-marquee', '');
    expect(await selectedIds(page)).toEqual(['c']);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect(await selectedIds(page)).toEqual(['c']);
    // A press without a drag on an empty lane still deselects.
    const p = await laneAt(page, 't1', 7);
    await page.mouse.click(p.x, p.y);
    expect((await uiState(page)).selection.kind).toBe('none');
  });
});
