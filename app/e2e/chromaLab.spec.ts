import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canUndo,
  desktopDrag,
  fileTransfer,
  openWithProject,
  refusesStrayFile,
  type MfeWindow,
} from './helpers';
import { clipJson, projectJson } from './timelineHelpers';

async function openChroma(page: Page) {
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-chroma-lab').click();
  const frame = page.frameLocator('[data-testid="chroma-lab-frame"]');
  await expect(frame.locator('#scene-preview svg')).toBeVisible();
  return frame;
}

const projectState = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify((window as MfeWindow).__mfe!.useProjectStore.getState().project),
  );

test.beforeEach(async ({ page }) => {
  await openWithProject(page, projectJson([clipJson('ca', 'fa', 't1', 0, 4)]));
});

test('complete local Chroma exports a role theme for an explicit library import', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const before = await projectState(page);
  const frame = await openChroma(page);
  for (const route of [
    'scenes',
    'themes',
    'compare',
    'gradients',
    'extract',
    'optimize',
    'analysis',
    'library',
    'explore',
  ]) {
    await frame.locator(`#nav a[href="#${route}"]`).click();
    await expect(frame.locator(`#nav a[href="#${route}"]`)).toHaveAttribute('aria-current', 'page');
  }
  await frame.locator('#scene-theme-name').fill('From Chroma');
  await frame.locator('#scene-theme-name').press('Tab');
  const downloadPromise = page.waitForEvent('download');
  await frame.locator('[data-studio-action="json"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('theme-manim.json');
  const file = testInfo.outputPath('theme-manim.json');
  await download.saveAs(file);
  const exported = JSON.parse(readFileSync(file, 'utf8')) as {
    format: string;
    name: string;
    colors: Record<string, string>;
  };
  expect(exported.format).toBe('manim-palette');
  expect(Object.keys(exported.colors)).toHaveLength(11);
  // The button itself opens the file picker; the imported theme then shows in the library.
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('chroma-lab-import').click();
  await expect(page.getByTestId('palette-library')).toHaveCount(0);
  await (await chooser).setFiles(file);
  await expect(page.getByTestId('palette-library')).toBeVisible();
  await expect(page.getByTestId('palette-name')).toHaveValue('From Chroma');
  await expect(page.getByTestId('palette-role-preview')).toBeVisible();
  await expect(page.getByTestId('palette-activate')).toBeEnabled();
  expect(await projectState(page)).toBe(before);
  expect(await canUndo(page)).toBe(false);
  await page.getByTestId('palette-library-done').click();
  await expect(frame.locator('#scene-theme-name')).toHaveValue('From Chroma');
  await page.getByTestId('chroma-lab-dialog-maximize').click();
  await expect(frame.locator('#scene-theme-name')).toHaveValue('From Chroma');
  await page.getByTestId('chroma-lab-dialog-maximize').click();
  await frame.locator('#page-title').scrollIntoViewIfNeeded();
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
    await expect(frame.locator('#scene-theme-name')).toHaveValue('From Chroma');
    await page.screenshot({ path: testInfo.outputPath(`chroma-dark-${width}.png`) });
  }
  await page.getByTestId('chroma-lab-done').click();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await openChroma(page);
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
    await page.screenshot({ path: testInfo.outputPath(`chroma-light-${width}.png`) });
  }
  expect(errors).toEqual([]);
});

test('Send to Manim Formula Editor in the frame puts the theme in the library, with no file', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let downloads = 0;
  page.on('download', () => downloads++);
  const before = await projectState(page);
  const frame = await openChroma(page);
  // The editor presented itself, and Chroma Lab drew its button for it.
  await expect(page.getByTestId('chroma-lab-host')).toHaveAttribute('data-bridge', 'ready');
  const send = frame.locator('[data-studio-action="send-host"]');
  await expect(send).toHaveText(/Send to Manim Formula Editor/);
  await frame.locator('#scene-theme-name').fill('Sent from Chroma');
  await frame.locator('#scene-theme-name').press('Tab');
  await frame.locator('#role-hex-variable').fill('#12ABEF');
  await frame.locator('#role-hex-variable').press('Tab');
  await send.click();
  // The library opens on it, ready to activate and to edit, like a theme imported from a file.
  await expect(page.getByTestId('palette-library')).toBeVisible();
  await expect(page.getByTestId('palette-name')).toHaveValue('Sent from Chroma');
  await expect(page.getByTestId('palette-color-variable-hex')).toHaveValue('#12ABEF');
  await expect(page.getByTestId('palette-activate')).toBeEnabled();
  await expect(page.getByTestId('palette-library').getByRole('option')).toHaveCount(2);
  await expect(frame.locator('#toast')).toHaveText('The theme is in the editor’s palettes.');
  expect(downloads).toBe(0);
  expect(await projectState(page)).toBe(before);
  expect(await canUndo(page)).toBe(false);
  // The same theme again is the entry it was; a changed one is another.
  await page.getByTestId('palette-library-done').click();
  await send.click();
  await expect(page.getByTestId('palette-library').getByRole('option')).toHaveCount(2);
  await page.getByTestId('palette-library-done').click();
  await frame.locator('#role-hex-result').fill('#00FF7F');
  await frame.locator('#role-hex-result').press('Tab');
  await send.click();
  await expect(page.getByTestId('palette-library').getByRole('option')).toHaveCount(3);
  await expect(page.getByTestId('palette-name')).toHaveValue('Sent from Chroma (2)');
  await page.getByTestId('palette-library-done').click();
  // Seeds & themes has the button too, and the host is still known after moving there.
  await frame.locator('#nav a[href="#themes"]').click();
  await expect(frame.locator('[data-studio-action="send-host"]')).toBeVisible();
  expect(errors).toEqual([]);
});

const THEME_FILE = resolve('src/ui/colors/__tests__/fixtures/chromalab-dark.json');

test('a theme dragged onto the dialog is imported; what is not called JSON stays with the studio', async ({
  page,
}) => {
  const theme = {
    name: 'theme-manim.json',
    type: 'application/json',
    text: readFileSync(THEME_FILE, 'utf8'),
  };
  const picture = { name: 'photo.png', type: 'image/png', text: 'not really a picture' };
  const frame = await openChroma(page);
  const inside = (await (await page
    .getByTestId('chroma-lab-frame')
    .elementHandle())!.contentFrame())!;
  const body = inside.locator('body');
  const drop = page.getByTestId('chroma-lab-drop');
  const library = page.getByTestId('palette-library');

  // A picture dragged over the studio is the studio's: its extractor shows its own drop zone.
  // So is a file whose type the browser does not tell.
  await frame.locator('#nav a[href="#extract"]').click();
  await body.dispatchEvent('dragenter', { dataTransfer: await fileTransfer(inside, picture) });
  await inside.locator('#drop-zone').dispatchEvent('dragover', {
    dataTransfer: await fileTransfer(inside, picture),
  });
  await expect(frame.locator('#drop-zone')).toHaveClass(/dragging/);
  await body.dispatchEvent('dragenter', {
    dataTransfer: await fileTransfer(inside, { ...picture, name: 'unknown', type: '' }),
  });
  await expect(drop).toHaveCount(0);
  // Dropped anywhere else, in the studio or in the editor, it opens nothing.
  expect(await refusesStrayFile(inside, 'body')).toBe(true);
  expect(await refusesStrayFile(page, '[data-testid="chroma-lab-dialog"] .modal-header')).toBe(
    true,
  );

  // A theme that enters the dialog over the studio raises the editor's drop area over all of it.
  await body.dispatchEvent('dragenter', { dataTransfer: await fileTransfer(inside, theme) });
  await expect(drop).toBeVisible();
  const covered = await page.getByTestId('chroma-lab-frame').evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return top?.getAttribute('data-testid');
  });
  expect(covered).toBe('chroma-lab-drop');
  // The drag leaves again before the browser has looked under the pointer (it clipped an edge,
  // or was cancelled): what it leaves is the studio's element, and the area goes down with it.
  await body.dispatchEvent('dragleave', { dataTransfer: await fileTransfer(inside, theme) });
  await expect(drop).toHaveCount(0);
  // An area left up with no drag under way would swallow the dialog: a real press lowers it.
  await body.dispatchEvent('dragenter', { dataTransfer: await fileTransfer(inside, theme) });
  await expect(drop).toBeVisible();
  const box = (await drop.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(drop).toHaveCount(0);

  // Released at once, still on the studio's element: the theme is imported all the same.
  await body.dispatchEvent('dragenter', { dataTransfer: await fileTransfer(inside, theme) });
  await body.dispatchEvent('drop', { dataTransfer: await fileTransfer(inside, theme) });
  await expect(drop).toHaveCount(0);
  await expect(library).toBeVisible();
  await expect(page.getByTestId('palette-name')).toHaveValue('Midnight chalkboard');
  await page.getByTestId('palette-delete').click();
  await page.getByTestId('palette-library-done').click();
  await expect(library).toHaveCount(0);

  // The usual way, with a drag the browser delivers as it does one from the desktop: into the
  // dialog over the studio, onto the area once the browser has found it, and dropped there.
  const drag = await desktopDrag(page, [THEME_FILE]);
  await drag.enter(page.getByTestId('chroma-lab-frame'));
  await expect(drop).toBeVisible();
  await drag.move(drop);
  await drag.drop(drop);
  await expect(drop).toHaveCount(0);
  await expect(library).toBeVisible();
  await expect(page.getByTestId('palette-name')).toHaveValue('Midnight chalkboard');
  await expect(page.getByTestId('palette-activate')).toBeEnabled();
});

test('an import that ends with Editor palettes already open shows there, selected', async ({
  page,
}) => {
  await openChroma(page);
  // Something else holds the library's lock, so the import has to wait.
  await page.evaluate(() => {
    void navigator.locks.request(
      'mfe.palettes.v1.write',
      () =>
        new Promise<void>((resolve) => {
          (window as unknown as { releasePalettes(): void }).releasePalettes = resolve;
        }),
    );
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('chroma-lab-import').click();
  await (await chooser).setFiles(THEME_FILE);
  await page.getByTestId('chroma-lab-library').click();
  await expect(page.getByTestId('palette-activate-defaults')).toBeVisible();
  await expect(page.getByTestId('palette-library').getByRole('option')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as { releasePalettes(): void }).releasePalettes());
  await expect(page.getByTestId('palette-name')).toHaveValue('Midnight chalkboard');
  await expect(page.getByTestId('palette-activate')).toBeEnabled();
  await expect(page.getByTestId('palette-library')).toHaveCount(1);
});

test('the studio has the whole dialog under its title bar, where the editor’s controls are', async ({
  page,
}) => {
  const frame = await openChroma(page);
  const box = async (testId: string) => (await page.getByTestId(testId).boundingBox())!;
  const header = (await page
    .locator('[data-testid="chroma-lab-dialog"] .modal-header')
    .boundingBox())!;
  const studio = await box('chroma-lab-frame');
  // No band between the title bar and Chroma Lab.
  expect(Math.abs(studio.y - (header.y + header.height))).toBeLessThan(1);
  for (const id of ['chroma-lab-import', 'chroma-lab-library', 'chroma-lab-info']) {
    const control = await box(id);
    expect(control.y).toBeGreaterThanOrEqual(header.y);
    expect(control.y + control.height).toBeLessThanOrEqual(header.y + header.height);
  }
  // The information button sits left of the window buttons.
  const info = await box('chroma-lab-info');
  const maximize = await box('chroma-lab-dialog-maximize');
  const close = await box('chroma-lab-dialog-close');
  expect(info.x + info.width).toBeLessThanOrEqual(maximize.x);
  expect(maximize.x + maximize.width).toBeLessThanOrEqual(close.x);
  // Its panel tells how a theme reaches the editor, over the top of the studio, inside the dialog.
  const panel = page.getByTestId('chroma-lab-info-panel');
  await expect(panel).toBeHidden();
  await page.getByTestId('chroma-lab-info').click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Send to Manim Formula Editor');
  await expect(page.getByTestId('chroma-lab-notices')).toBeVisible();
  const shown = (await panel.boundingBox())!;
  const dialog = await box('chroma-lab-dialog');
  expect(shown.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(shown.x).toBeGreaterThanOrEqual(dialog.x);
  expect(shown.x + shown.width).toBeLessThanOrEqual(dialog.x + dialog.width);
  // Escape closes the panel, not the dialog; a press inside Chroma Lab closes it too.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('chroma-lab-info')).toBeFocused();
  await expect(page.getByTestId('chroma-lab-dialog')).toBeVisible();
  await page.getByTestId('chroma-lab-info').click();
  await expect(panel).toBeVisible();
  await frame.locator('#page-title').click();
  await expect(panel).toBeHidden();
});

test('frame keyboard, nested Escape and undo stay independent of the editor', async ({ page }) => {
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      draft.meta.name = 'Editor history sentinel';
    }),
  );
  const before = await projectState(page);
  const frame = await openChroma(page);
  // The title bar comes before the frame: its last button, then Chroma Lab's first link.
  await page.getByTestId('chroma-lab-dialog-close').focus();
  await page.keyboard.press('Tab');
  await expect(frame.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('chroma-lab-dialog-close')).toBeFocused();
  await frame.locator('.main-footer a').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('chroma-lab-done')).toBeFocused();
  await frame.locator('[data-edit]').first().click();
  await expect(frame.locator('#color-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(frame.locator('#color-dialog')).not.toBeVisible();
  await expect(page.getByTestId('chroma-lab-dialog')).toBeVisible();
  await frame.locator('[data-role-link="formula"]').click();
  await expect(frame.locator('[data-role-link="formula"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(frame.locator('[data-role-link="formula"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  const original = await frame.locator('[data-role-hex="formula"]').inputValue();
  await frame.locator('[data-role-hex="formula"]').fill('#123456');
  await frame.locator('[data-role-hex="formula"]').press('Tab');
  await frame.locator('.scene-player h2').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(frame.locator('[data-role-hex="formula"]')).toHaveValue(original);
  expect(await projectState(page)).toBe(before);
  expect(await canUndo(page)).toBe(true);
  await page.getByTestId('chroma-lab-done').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('chroma-lab-dialog')).toHaveCount(0);
  await expect(page.getByTestId('menu-preferences')).toBeFocused();
});

test('real worker extraction and cancellation leave no worker after closing the frame', async ({
  page,
}) => {
  const frame = await openChroma(page);
  await frame.locator('#nav a[href="#extract"]').click();
  await frame
    .locator('#image-file')
    .setInputFiles(resolve('src/data/chroma-lab/examples/previews/mathtex.png'));
  await expect(frame.locator('#extract-run')).toBeEnabled();
  const workerPromise = page.waitForEvent('worker');
  await frame.locator('#extract-run').click();
  await workerPromise;
  await expect(frame.locator('#extraction-results .harmony-card')).toHaveCount(4);
  await frame.locator('#nav a[href="#optimize"]').click();
  await frame.locator('#ga-population').fill('8');
  await frame.locator('#ga-generations').fill('1');
  await frame.locator('#ga-run').click();
  await expect(frame.locator('#optimization-result .score-graph')).toBeVisible();
  await frame.locator('#ga-population').fill('128');
  await frame.locator('#ga-generations').fill('300');
  await frame.locator('#ga-run').click();
  await frame.locator('[data-action="cancel-worker"]').click();
  await expect(frame.locator('#ga-status')).toHaveText('Operation canceled.');
  await frame.locator('#ga-run').click();
  await page.getByTestId('chroma-lab-done').click();
  await expect.poll(() => page.workers().length).toBe(0);
  await openChroma(page);
  await expect(page.getByTestId('chroma-lab-reminder')).toBeVisible();
});
