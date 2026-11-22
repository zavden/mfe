import { expect, test, type Page } from './test';
import { PX_PER_SECOND, box, clipJson, clipOf, dragTo, openTimeline } from './timelineHelpers';

/* What the autosave keeps of a gesture that is still held (a probe the final audit asked for,
 * P02-330). The autosave writes 400 ms after the project changes, and a drag changes it as it
 * goes: a drag that rests for longer than that has its clip written where it is held. That is
 * what the app does, and these cases say how far it reaches:
 *
 *  - the record follows the gesture's end too: cancelled, the record has the clip back where it
 *    was; let go, where it was put. No record keeps a state the user gave up;
 *  - a page that goes with the drag held comes back with the clip where it was held — what was
 *    on the screen at that instant, not the state before the drag. */

const A = clipJson('a', 'fa', 't1', 1, 4);

/** Where this tab's autosave record has the clip `a`, or null while the tab has no record. */
const autosavedStart = (page: Page): Promise<number | null> =>
  page.evaluate(() => {
    const raw = localStorage.getItem(`mfe.autosave.${sessionStorage.getItem('mfe.session')}`);
    if (!raw) return null;
    const project = JSON.parse((JSON.parse(raw) as { text: string }).text) as {
      clips: { id: string; start: number }[];
    };
    return project.clips.find((clip) => clip.id === 'a')?.start ?? null;
  });

/** Drag the clip `a` two seconds later and keep the button down. */
async function holdDrag(page: Page): Promise<void> {
  const a = await box(page.getByTestId('clip-a'));
  const from = { x: a.x + a.width / 2, y: a.y + a.height - 6 };
  await dragTo(
    page,
    from,
    { x: from.x + 2 * PX_PER_SECOND, y: from.y },
    {
      shift: true,
      release: false,
    },
  );
  expect((await clipOf(page, 'a')).start).toBeCloseTo(3, 1);
}

test('the autosave follows a drag that rests, and its end: cancelled, the record has the clip back', async ({
  page,
}) => {
  await openTimeline(page, [A]);
  await expect.poll(() => autosavedStart(page)).toBe(1);
  await holdDrag(page);
  // Held for longer than the autosave waits: the record has the clip where it is held.
  await expect.poll(() => autosavedStart(page)).toBeCloseTo(3, 1);
  await page.keyboard.press('Escape');
  expect((await clipOf(page, 'a')).start).toBe(1);
  await expect.poll(() => autosavedStart(page)).toBe(1);
  await page.mouse.up();

  // Dragged again and let go: the record has what the project has.
  await holdDrag(page);
  await page.mouse.up();
  const put = (await clipOf(page, 'a')).start;
  expect(put).toBeCloseTo(3, 1);
  await expect.poll(() => autosavedStart(page)).toBe(put);
});

test('a page reloaded with a drag held comes back with the clip where it was held', async ({
  page,
}) => {
  await openTimeline(page, [A]);
  await expect.poll(() => autosavedStart(page)).toBe(1);
  await holdDrag(page);
  const held = (await clipOf(page, 'a')).start;
  await page.reload();
  await page.mouse.up();
  await expect(page.getByTestId('timeline-view')).toBeVisible();
  await expect(page.getByTestId('clip-a')).toBeVisible();
  expect((await clipOf(page, 'a')).start).toBe(held);
  await expect(page.getByTestId('doc-status')).toHaveText('Recovered, not saved');
});
