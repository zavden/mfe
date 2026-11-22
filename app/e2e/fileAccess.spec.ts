import { expect, test, type Page } from './test';
import type { MfeWindow } from './helpers';

/* A browser without the File System Access API (Firefox, Safari) works on copies of the user's
 * files: the app says so once per session, when it opens, in a notice that stays until it is
 * closed; and the list of the user's templates says where they are kept there. */
const TITLE = 'This browser works on copies of your files';

/** A browser that has none of the pickers. Unlike `forceFallbackFilePaths`, the session is not
 * marked as told. */
async function withoutFileAccess(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
    delete w.showDirectoryPicker;
  });
}

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
}

test('a browser without access to files is told once per session what it works on', async ({
  page,
  context,
}) => {
  await withoutFileAccess(page);
  await start(page);
  const notice = page.getByTestId('notice').filter({ hasText: TITLE });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Open reads a copy of the file you choose');
  await expect(notice).toContainText('Save downloads a new file each time');
  await expect(notice).toContainText('Sync folder takes the folder as it is at that moment');
  await expect(notice).toContainText('Your templates are kept in this browser only');

  // The list of the user's templates says it too, for good.
  await page.getByTestId('creator-tab-templates').click();
  await page.getByTestId('templates-open-mine').click();
  await expect(page.getByTestId('template-storage')).toHaveText(
    'Kept in this browser only: it cannot keep them in a folder. Export takes them elsewhere.',
  );
  await page.getByTestId('templates-dialog-close').click();

  // It is closed by its button, and a reload of the same session does not bring it back.
  await expect(notice).toBeVisible();
  await notice.getByTestId('notice-dismiss').click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await expect(page.getByTestId('menu-file')).toBeVisible();
  await expect(notice).toHaveCount(0);

  // Another tab is another session.
  const other = await context.newPage();
  await withoutFileAccess(other);
  await start(other);
  await expect(other.getByTestId('notice').filter({ hasText: TITLE })).toBeVisible();
});

test('a browser that opens files and folders in place is told nothing', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('menu-file')).toBeVisible();
  await page.getByTestId('creator-tab-templates').click();
  await page.getByTestId('templates-open-mine').click();
  await expect(page.getByTestId('template-storage')).toContainText(
    'With a synced folder (File ▸ Sync folder…) they are also kept in its templates/templates.json.',
  );
  await expect(page.getByTestId('notice')).toHaveCount(0);
});
