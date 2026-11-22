import { expect, test, type BrowserContext, type Page } from './test';

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

test.beforeEach(async ({ context }) => {
  await context.route(/https?:\/\/(localhost|127\.0\.0\.1):7799\//, (route) => route.abort());
});

test('native opener inheritance gives each live window an independent autosave and reload', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await rename(page, 'Parent work');
  const parentOwner = await owner(page);
  const popup = page.waitForEvent('popup');
  await page.evaluate(() => window.open(location.href, '_blank'));
  const child = await popup;
  await ready(child);
  expect(await owner(child)).not.toBe(parentOwner);
  await expect(child.getByTestId('project-rename')).toHaveText('Untitled');
  await rename(child, 'Child work');
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('project-rename')).toHaveText('Parent work');
  await child.reload();
  await ready(child);
  await expect(child.getByTestId('project-rename')).toHaveText('Child work');
  const liveParent = await owner(page);
  await child.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await child.close();
  expect(
    await page.evaluate((id) => localStorage.getItem(`mfe.alive.${id}`), liveParent),
  ).not.toBeNull();
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('project-rename')).toHaveText('Parent work');
});

test('a duplicated session without an opener cannot share a writer even after a dormant heartbeat', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await ready(page);
  await rename(page, 'Original work');
  const original = await owner(page);
  const inherited = await page.evaluate(() => Object.entries(sessionStorage));
  const duplicate = await context.newPage();
  await duplicate.addInitScript((entries) => {
    if (sessionStorage.length === 0)
      for (const [key, value] of entries) sessionStorage.setItem(key, value);
  }, inherited);
  await page.evaluate(
    (id) => localStorage.setItem(`mfe.alive.${id}`, String(Date.now() - 120_000)),
    original,
  );
  await duplicate.goto('/');
  await ready(duplicate);
  expect(await owner(duplicate)).not.toBe(original);
  await rename(duplicate, 'Duplicate work');
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await rename(page, 'Resumed original');
  await duplicate.reload();
  await ready(duplicate);
  await expect(duplicate.getByTestId('project-rename')).toHaveText('Duplicate work');
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('project-rename')).toHaveText('Resumed original');
});

test('a failed recovery copy survives a settled reload and retries when writes become available', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && sessionStorage.getItem('test.denyWrites') === 'yes') {
        throw new DOMException('Writes blocked', 'SecurityError');
      }
      nativeSetItem.call(this, key, value);
    };
  });
  await page.goto('/');
  await ready(page);
  await rename(page, 'Recovery project');
  const source = await owner(page);
  const raw = await page.evaluate((id) => localStorage.getItem(`mfe.autosave.${id}`), source);
  await page.evaluate(() => sessionStorage.setItem('test.denyWrites', 'yes'));
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('project-rename')).toHaveText('Recovery project');
  await expect(page.getByTestId('notice')).toContainText('No autosave in this browser');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    );
    await page.screenshot({ path: testInfo.outputPath(`blocked-recovery-${theme}.png`) });
  }
  expect(await page.evaluate((id) => localStorage.getItem(`mfe.autosave.${id}`), source)).toBe(raw);
  // No edit or render amendment is needed before another page load restores the retained source.
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('project-rename')).toHaveText('Recovery project');
  expect(await page.evaluate((id) => localStorage.getItem(`mfe.autosave.${id}`), source)).toBe(raw);
  await page.evaluate(() => {
    sessionStorage.removeItem('test.denyWrites');
    window.dispatchEvent(new Event('pageshow'));
  });
  const current = await owner(page);
  expect(current).not.toBe(source);
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const stored = localStorage.getItem(`mfe.autosave.${id}`);
        return stored ? (JSON.parse(stored) as { name: string }).name : null;
      }, current),
    )
    .toBe('Recovery project');
  expect(
    await page.evaluate((id) => localStorage.getItem(`mfe.autosave.${id}`), source),
  ).toBeNull();
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('project-rename')).toHaveText('Recovery project');
});

test('concurrent new pages preserve closed work while acquiring separate writers', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await ready(page);
  await rename(page, 'Closed work');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.close();
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);
  await Promise.all([ready(first), ready(second)]);
  expect(await owner(first)).not.toBe(await owner(second));
  const names = await Promise.all([
    first.getByTestId('project-rename').textContent(),
    second.getByTestId('project-rename').textContent(),
  ]);
  expect(names).toContain('Closed work');
  for (const [index, tab] of [first, second].entries()) {
    await tab.reload();
    await ready(tab);
    await expect(tab.getByTestId('project-rename')).toHaveText(names[index]!);
  }
});

/** An alive mark older than this is a dead page's (`STALE_AFTER_MS`, ui/project/autosave.ts), and
 * a mark that was fresh is read again this long after it would expire (`RECHECK_MARGIN_MS`). */
const STALE_AFTER_MS = 60_000;
const RECHECK_MARGIN_MS = 2_000;

/** What a browser that died leaves to the tab it restores: the tab's sessionStorage and the dead
 * page's record, with an alive mark that nothing removed, `markAge` old.
 *
 * The restored tab's clock is the test's (`page.clock`), stopped at the instant the tab is made:
 * the mark is `markAge` old for as long as the test looks at the tab, however long the machine
 * takes to load it, and `pastTheMark` is what makes it expire. */
async function restoredSession(page: Page, context: BrowserContext, markAge: number) {
  await page.goto('/');
  await ready(page);
  await rename(page, 'Session work');
  const dead = (await owner(page))!;
  const raw = (await page.evaluate((id) => localStorage.getItem(`mfe.autosave.${id}`), dead))!;
  await page.close();
  const restored = await context.newPage();
  // The instant the dead page's record was written at, near enough: «autosaved just now».
  const now = Date.now();
  await restored.clock.install({ time: now });
  await restored.clock.pauseAt(now);
  await restored.addInitScript(
    ({ dead, raw, markAge }) => {
      if (sessionStorage.length > 0) return; // the first load of this tab only
      sessionStorage.setItem('mfe.session', dead);
      localStorage.setItem(`mfe.autosave.${dead}`, raw);
      localStorage.setItem(`mfe.alive.${dead}`, String(Date.now() - markAge));
    },
    { dead, raw, markAge },
  );
  await restored.goto('/');
  await ready(restored);
  // The mark is fresh and this is no reload: that page could be open in another window.
  await expect(restored.getByTestId('project-rename')).toHaveText('Untitled');
  return restored;
}

/** Take the restored tab's clock past the end of a mark that was `markAge` old and past the
 * margin after it, where the mark is read again; from there on the clock runs by itself. */
async function pastTheMark(restored: Page, markAge: number) {
  await restored.clock.fastForward(STALE_AFTER_MS - markAge + RECHECK_MARGIN_MS + 1_000);
  await restored.clock.resume();
}

async function shots(page: Page, name: string, outputPath: (file: string) => string) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    );
    await page.screenshot({ path: outputPath(`${name}-${theme}.png`) });
  }
}

test('a restored browser session gets its work back by itself once the old alive mark expires', async ({
  page,
  context,
}, testInfo) => {
  const restored = await restoredSession(page, context, 56_000);
  // Nothing comes back while the mark could be a live page's, whatever the time the test takes.
  await expect(restored.getByTestId('notice')).toHaveCount(0);
  await pastTheMark(restored, 56_000);
  await expect(restored.getByTestId('project-rename')).toHaveText('Session work');
  await expect(restored.getByTestId('notice')).toContainText('Restored from the autosave');
  await expect(restored.getByTestId('doc-status')).toHaveText('Recovered, not saved');
  await shots(restored, 'session-restored', (file) => testInfo.outputPath(file));
});

test('a restored session that was already used is offered its previous work instead', async ({
  page,
  context,
}, testInfo) => {
  const restored = await restoredSession(page, context, 56_000);
  await restored.getByTestId('project-rename').click();
  await restored.keyboard.press('Escape');
  const notice = restored.getByTestId('notice');
  await expect(notice).toHaveCount(0);
  await pastTheMark(restored, 56_000);
  await expect(notice).toContainText("Work from this tab's last session is available");
  await expect(notice).toContainText('“Session work”, autosaved just now.');
  await expect(restored.getByTestId('project-rename')).toHaveText('Untitled');
  await shots(restored, 'session-offered', (file) => testInfo.outputPath(file));
  await restored.getByTestId('notice-action').click();
  await expect(restored.getByTestId('project-rename')).toHaveText('Session work');
  await expect(restored.getByTestId('doc-status')).toHaveText('Recovered, not saved');
});
