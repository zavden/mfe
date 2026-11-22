import { expect, test, type Page } from './test';
import { getProject, holdToConfirm, openWithProject, type MfeWindow } from './helpers';
import { plain, relationProject } from './relationsHelpers';

/* An object attached to glyphs of another clip (`clip.attach`, R4) goes when its target goes:
 * deleting the target asks first, with a held confirmation that counts and names what hangs on it,
 * and deleting a formula lists the attached clips among what it removes. Nothing in the UI makes
 * an attachment yet (braces and shapes will): the project sets one. */

/** f1 on clips a [0, 6) and c [2, 4); f2 on clip b [1, 5), attached to a. */
async function openAttached(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(
    page,
    relationProject([
      plain('a', 'fa', 't1', 0, 6),
      plain('b', 'fb', 't2', 1, 5),
      plain('c', 'fa', 't3', 2, 4),
    ]),
  );
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      draft.clips[1]!.attach = {
        clipId: 'a',
        glyphs: 'all',
        rule: 'next_to',
        side: 'down',
        buff: 0.25,
      };
    });
    mfe.history.clear();
  });
}

test('deleting the clip an object hangs on asks, names it and removes both', async ({ page }) => {
  await openAttached(page);
  await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('Delete');
  const dialog = page.getByTestId('dialog');
  await expect(dialog).toContainText('Delete clip?');
  await expect(dialog).toContainText('An object is attached to it and goes with it:');
  await expect(page.getByTestId('dialog-details')).toHaveText([
    'f2 (1 s–5 s) on Track 2, attached to f1',
  ]);
  await holdToConfirm(page);
  expect((await getProject(page)).clips.map((c) => c.id)).toEqual(['c']);
  // A clip nothing hangs on goes without a question, as before.
  await page.getByTestId('clip-c').click({ position: { x: 20, y: 10 } });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('dialog')).toHaveCount(0);
  expect((await getProject(page)).clips).toEqual([]);
});

test('deleting the formula lists the attached clip among what goes with it', async ({ page }) => {
  await openAttached(page);
  await page.getByTestId('formula-item').first().getByTestId('formula-delete').click();
  const details = page.getByTestId('dialog-details');
  await expect(details).toContainText('Clip f2 (1 s–5 s) on Track 2, attached to f1 (0 s–6 s)');
  await holdToConfirm(page);
  const project = await getProject(page);
  expect(project.formulas.map((f) => f.name)).toEqual(['f2']);
  expect(project.clips).toEqual([]);
});
