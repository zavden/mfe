/* The production build, opened from disk as a user opens it: `dist/index.html` by file://, with
 * no server. The e2e suite cannot see this: it drives the development server through
 * `window.__mfe`, which a build does not have. Here everything goes through the interface.
 *
 *   npm run dist-check        (builds, then runs this file: playwright.dist.config.ts)
 */
import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const INDEX = pathToFileURL(`${DIST}index.html`).href;

/** What must not happen on a page opened from disk: a script that throws, or one of the build's
 * own files that does not load. (The app also asks for the companion on 127.0.0.1, which is not
 * running here: that request failing is the normal case.) */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith('file:'))
      problems.push(`not loaded: ${request.url()} (${request.failure()?.errorText})`);
  });
  return problems;
}

test.beforeAll(() => {
  expect(existsSync(`${DIST}index.html`), 'there is no build: run `npm run build`').toBe(true);
});

test('the app starts from disk and renders a formula', async ({ page }) => {
  const problems = watch(page);
  await page.goto(INDEX);
  await expect(page.getByTestId('menu-file')).toBeVisible();
  // A classic script and relative addresses: what makes file:// work.
  const index = readFileSync(`${DIST}index.html`, 'utf8');
  expect(index).toMatch(/<script defer src="\.\/assets\/index-[\w-]+\.js"><\/script>/);
  expect(index).not.toMatch(/type="module"|crossorigin|(src|href)="\//);

  // MathJax, bundled: the formula becomes glyphs without any server.
  await page.getByTestId('creator-new').click();
  const editor = page.getByTestId('formula-editor');
  await editor.getByTestId('raw-latex').fill('a+b=c');
  await editor.getByTestId('editor-apply').click();
  // The list of the glyphs is left out unless its key is pressed; the key waits for the glyphs.
  await editor.getByTestId('glyph-list-toggle').click();
  await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(5);
  await expect(editor.getByTestId('editor-source-badge')).toHaveText('MathJax');
  // MathLive's fonts, files beside the script: the math field can use them.
  const fonts = readdirSync(`${DIST}assets`).filter((name) => name.endsWith('.woff2'));
  expect(fonts.length).toBeGreaterThan(0);
  const loaded = await page.evaluate(async () => {
    const faces = await document.fonts.load('16px KaTeX_Main');
    return faces.map((face) => face.status);
  });
  expect(loaded).toContain('loaded');
  expect(problems).toEqual([]);
});

test('the formula keypad opens from disk, draws its keys and writes', async ({ page }) => {
  const problems = watch(page);
  await page.goto(INDEX);
  const editor = page.getByTestId('formula-editor');
  const raw = editor.getByTestId('raw-latex');

  // The editor's keypad, the one keyboard its key shows. Its faces are MathLive's static
  // elements: drawn as math, in fonts that are files beside the script.
  await page.getByTestId('creator-new').click();
  await expect(editor.getByTestId('math-field')).toBeFocused();
  await editor.getByTestId('toggle-keyboard').click();
  const pad = (id: string) => editor.getByTestId(`keypad-key-${id}`);
  await expect(pad('frac').locator('math-span .ML__latex')).toBeVisible();
  const drawn = await pad('x')
    .locator('math-span .ML__mathit')
    .evaluate((glyph) => getComputedStyle(glyph).fontFamily);
  expect(drawn).toContain('KaTeX_Math');
  expect(await page.evaluate(() => document.fonts.check('16px KaTeX_Math'))).toBe(true);
  await pad('x').click();
  await pad('square').click();
  await expect(raw).toHaveValue(/^x\^\{?2\}?$/);
  await pad('apply').click();
  await expect(editor.getByTestId('editor-apply')).toBeDisabled();
  await expect(editor.getByTestId('editor-status')).toHaveText(/2 glyphs/);

  // Left shown, the keypad is there when the editor opens again, and goes on writing.
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await page.getByTestId('creator-new').click();
  await expect(editor.getByTestId('math-field')).toBeFocused();
  await expect(pad('frac').locator('math-span .ML__latex')).toBeVisible();
  await pad('x').click();
  await pad('plus').click();
  await pad('d1').click();
  await expect(raw).toHaveValue('x+1');
  await pad('apply').click();
  await expect(editor.getByTestId('editor-apply')).toBeDisabled();
  // MathLive's own keyboard is not part of the page.
  await expect(page.locator('.ML__keyboard')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('an example opens from disk, and its frame is written as a PNG', async ({ page }) => {
  const problems = watch(page);
  // Chrome's file pickers cannot be driven: without them the picture is a download.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
  });
  await page.goto(INDEX);
  // The example is part of the script: nothing is fetched for it.
  const file = JSON.parse(
    readFileSync(new URL('../../examples/completing-the-square.mfe.json', import.meta.url), 'utf8'),
  ) as { meta: { name: string; width: number; height: number }; formulas: unknown[] };
  await page.getByTestId('creator-example').click();
  await expect(page.getByTestId('formula-item')).toHaveCount(file.formulas.length);
  await expect(page.getByTestId('project-name')).toContainText(file.meta.name);
  await expect(page.getByTestId('creator-empty')).toHaveCount(0);

  // Export ▸ Image… waits for the formulas to be drawn, then writes the playhead's frame.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-image').click();
  await expect(page.getByTestId('image-start')).toBeEnabled();
  const downloading = page.waitForEvent('download');
  await page.getByTestId('image-start').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`${file.meta.name} 0.00s.png`);
  const bytes = readFileSync(await download.path());
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.readUInt32BE(16)).toBe(file.meta.width);
  expect(bytes.readUInt32BE(20)).toBe(file.meta.height);
  await expect(page.getByTestId('image-done')).toContainText(`Saved ${file.meta.name} 0.00s.png`);
  expect(problems).toEqual([]);
});

test('Chroma Lab loads in its frame from disk', async ({ page }) => {
  const problems = watch(page);
  await page.goto(INDEX);
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-chroma-lab').click();
  const frame = page.frameLocator('[data-testid="chroma-lab-frame"]');
  await expect(frame.locator('#scene-preview svg')).toBeVisible();
  await frame.locator('#nav a[href="#themes"]').click();
  await expect(frame.locator('#nav a[href="#themes"]')).toHaveAttribute('aria-current', 'page');
  // Its notices are a file of the build, where the link says.
  const href = await page.getByTestId('chroma-lab-notices').getAttribute('href');
  expect(href).toBe('./chroma-lab/vendor/README.md');
  expect(existsSync(DIST + href!)).toBe(true);
  // Two pages opened from disk have no origin to name. The editor still presents itself to the
  // frame, Chroma Lab draws its button, and the theme it sends is in the editor's library.
  await expect(page.getByTestId('chroma-lab-host')).toHaveAttribute('data-bridge', 'ready');
  const send = frame.locator('[data-studio-action="send-host"]');
  await expect(send).toHaveText(/Send to Manim Formula Editor/);
  await send.click();
  await expect(page.getByTestId('palette-library')).toBeVisible();
  await expect(page.getByTestId('palette-role-preview')).toBeVisible();
  await expect(page.getByTestId('palette-library').getByRole('option')).toHaveCount(2);
  expect(problems).toEqual([]);
});

test('the licence links open the files that travel with the build', async ({ page }) => {
  const problems = watch(page);
  await page.goto(INDEX);
  await page.getByTestId('menu-help').click();
  await page.getByRole('menuitem', { name: 'Third-party licenses…' }).click();
  const listed = await page.getByTestId('licenses-list').locator('tbody th').allTextContents();
  expect(listed.length).toBeGreaterThan(15);

  const open = async (testId: string) => {
    const popup = page.waitForEvent('popup');
    await page.getByTestId(testId).click();
    const tab = await popup;
    await tab.waitForLoadState();
    const opened = { url: tab.url(), text: await tab.locator('body').innerText() };
    await tab.close();
    return opened;
  };
  const notices = await open('licenses-notices');
  expect(notices.url).toBe(pathToFileURL(`${DIST}licenses/THIRD-PARTY-NOTICES.txt`).href);
  expect(notices.text).toContain('MANIM FORMULA EDITOR: THIRD-PARTY NOTICES');
  // The dialog and the file are the same list: what the app names, the notices carry.
  for (const name of listed) expect(notices.text).toContain(name.split(' · ')[0]!);
  const license = await open('licenses-project');
  expect(license.url).toBe(pathToFileURL(`${DIST}licenses/LICENSE.txt`).href);
  // The text of the file `LICENSE`, whatever licence it is (`build/projectLicense.ts` names it).
  const text = readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8');
  expect(text.length).toBeGreaterThan(500);
  expect(license.text.trim()).toBe(text.trim());
  expect(problems).toEqual([]);
});
