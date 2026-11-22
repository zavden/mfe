import { expect, test, type Page } from './test';

/* No route is installed on the context here: Playwright stops answering intercepted requests of a
 * page that crashed, and its reload would never load. */

async function ready(page: Page) {
  await expect(page.getByTestId('project-rename')).toBeVisible();
}

async function rename(page: Page, name: string) {
  await page.getByTestId('project-rename').click();
  await page.getByTestId('project-rename-input').fill(name);
  await page.getByTestId('project-rename-input').press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const session = sessionStorage.getItem('mfe.session');
        const raw = localStorage.getItem(`mfe.autosave.${session}`);
        return raw ? (JSON.parse(raw) as { name: string }).name : null;
      }),
    )
    .toBe(name);
}

const owner = (page: Page) => page.evaluate(() => sessionStorage.getItem('mfe.session'));

test.use({ viewport: { width: 1440, height: 900 } });

test('a tab reloaded right after its page crashed gets its work back at once', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await ready(page);
  await rename(page, 'Crashed work');
  const dead = await owner(page);
  // Playwright gives up on a page that crashed, so the browser's storage is read from another
  // document of the same origin, one that does not run the app.
  const probe = await context.newPage();
  await probe.route('**/storage-probe.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }),
  );
  await probe.goto('/storage-probe.html');
  const records = () =>
    probe.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => /^mfe\.(autosave|alive)\./.test(key))
        .sort()
        .map((key) => {
          const value = localStorage.getItem(key)!;
          return key.startsWith('mfe.alive.')
            ? key
            : `${key} = ${(JSON.parse(value) as { name: string }).name}`;
        }),
    );

  const cdp = await context.newCDPSession(page);
  const crashed = page.waitForEvent('crash');
  // The renderer dies before it can answer, and no pagehide runs: the alive mark stays, fresh.
  void cdp.send('Page.crash').catch(() => undefined);
  await crashed;
  expect(await records()).toEqual([`mfe.alive.${dead}`, `mfe.autosave.${dead} = Crashed work`]);

  // "Reload" on the crashed tab. The new page takes the record at once, under its own writer,
  // and nothing of the dead page stays behind.
  await cdp.send('Page.reload');
  await expect
    .poll(async () => (await records()).filter((entry) => !entry.includes(dead!)))
    .toEqual([expect.stringMatching(/^mfe\.alive\./), expect.stringMatching(/ = Crashed work$/)]);
  expect((await records()).filter((entry) => entry.includes(dead!))).toEqual([]);
});
