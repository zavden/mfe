import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMAT_VERSION } from '../src/model';
import {
  addFormulaViaUi,
  closeEditor,
  forceFallbackFilePaths,
  pinMathJax,
  startApp,
} from './creatorHelpers';
import { canUndo, desktopDrag, getProject, openWithProject, undo, type MfeWindow } from './helpers';
import { plain, relationProject } from './relationsHelpers';

const THEME_PATH = fileURLToPath(
  new URL('../src/ui/colors/__tests__/fixtures/chromalab-dark.json', import.meta.url),
);
const themeText = readFileSync(THEME_PATH, 'utf8');
const theme = JSON.parse(themeText) as { name: string; colors: Record<string, string> };

async function openLibrary(page: Page) {
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-editor-palettes').click();
  await expect(page.getByTestId('palette-library')).toBeVisible();
}

/** Import through the button and the file picker it opens, as a user does. */
async function importPalette(page: Page, text = themeText) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('palette-import').click();
  await (
    await chooser
  ).setFiles({ name: 'theme.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByTestId('palette-role-preview')).toBeVisible();
}

test('library activation is independent; new projects and objects consume copied defaults', async ({
  page,
}, testInfo) => {
  await startApp(page);
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((project) => {
      project.meta.name = 'Original project';
    });
    mfe.history.clear();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some(
          (key) =>
            key.startsWith('mfe.autosave.') &&
            localStorage.getItem(key)?.includes('Original project'),
        ),
      ),
    )
    .toBeTruthy();
  const before = await getProject(page);
  const dirty = await page.getByTestId('project-name').getAttribute('data-dirty');
  await openLibrary(page);
  await importPalette(page);
  await page.getByTestId('palette-name').fill('Teaching palette');
  await page.getByTestId('palette-rename').click();
  await expect(page.getByTestId('palette-name')).toHaveValue('Teaching palette');
  await page.getByTestId('palette-activate').click();
  await expect(page.getByTestId('palette-activate')).toBeDisabled();
  // The same file dragged onto the dialog from the desktop is the same palette: the drop area
  // takes it (the drop lands on the area's overlay), the library keeps its one entry and shows
  // it, whatever was selected.
  await page.getByTestId('palette-defaults').click();
  await expect(page.getByTestId('palette-name')).toHaveCount(0);
  const drag = await desktopDrag(page, [THEME_PATH]);
  await drag.enter(page.getByTestId('palette-activate-defaults'));
  await expect(page.getByTestId('palette-drop')).toBeVisible();
  await drag.move(page.getByTestId('palette-drop'));
  await drag.drop(page.getByTestId('palette-drop'));
  await expect(page.getByTestId('palette-drop')).toHaveCount(0);
  await expect(page.getByTestId('palette-name')).toHaveValue('Teaching palette');
  await expect(page.getByTestId('palette-library').getByRole('option')).toHaveCount(2);
  await expect(page.getByTestId('palette-library-error')).toHaveCount(0);
  expect(await getProject(page)).toEqual(before);
  expect(await canUndo(page)).toBe(false);
  await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', dirty!);
  const exported = page.waitForEvent('download');
  await page.getByTestId('palette-export').click();
  expect(JSON.parse(readFileSync(await (await exported).path(), 'utf8'))).toEqual(
    JSON.parse(themeText),
  );
  for (const [mode, width, height] of [
    ['dark', 1280, 800],
    ['light', 1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      mode,
    );
    // In the test's own output folder (test-results/, ignored by git), like the Chroma shots.
    await page.screenshot({ path: testInfo.outputPath(`library-${mode}-${width}.png`) });
  }
  await page.getByTestId('palette-library-done').click();
  await page.reload();
  await page.waitForFunction(() => Boolean((window as MfeWindow).__mfe));
  await openLibrary(page);
  await expect(page.getByTestId('palette-name')).toHaveValue('Teaching palette');
  await expect(page.getByTestId('palette-activate')).toBeDisabled();
  await page.getByTestId('palette-library-done').click();
  // Restored documents retain their saved background despite the active palette.
  expect((await getProject(page)).meta.background).toBe(before.meta.background);
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'New', exact: true }).click();
  await page.getByTestId('dialog-discard').click();
  await expect
    .poll(async () => (await getProject(page)).meta.background)
    .toBe(theme.colors.background);
  expect(await canUndo(page)).toBe(false);
  await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
  await addFormulaViaUi(page, 'x+y');
  await closeEditor(page);
  expect((await getProject(page)).formulas[0]).toMatchObject({ color: theme.colors.formula });
  await page.getByTestId('menu-edit').click();
  await page.getByTestId('menu-item-edit-match-colors').hover();
  await page.getByRole('menuitem', { name: 'New from active palette…', exact: true }).click();
  await expect(page.getByTestId('match-colors-pattern-0')).toBeFocused();
  await expect(page.getByTestId('match-colors-apply')).toBeDisabled();
  expect((await getProject(page)).colorMatches[0]?.entries).toEqual(
    ['variable', 'constant', 'operator', 'result'].map((role) => ({
      pattern: '',
      color: theme.colors[role],
    })),
  );
});

test('the library says what the arrow role colours, and where Chroma Lab exports a theme', async ({
  page,
}) => {
  await startApp(page);
  await openLibrary(page);
  const library = page.getByTestId('palette-library');
  // Chroma Lab's navigation names the page "Seeds & themes".
  await expect(library.locator('.palette-help', { hasText: 'New palette starts' })).toHaveText(
    'New palette starts from the editor’s own colours. In Chroma Lab, export a theme as JSON from Seeds & themes, then import that file here: with the button, or by dragging it onto this dialog. The general palette export has no named roles and cannot be imported.',
  );
  // A file that is not a theme: the error says where to export one.
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('palette-import').click();
  await (
    await chooser
  ).setFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.getByTestId('palette-library-error')).toContainText(
    'Export the Chroma Lab Manim theme JSON from "Use in your animation" or "Seeds & themes".',
  );
  await importPalette(page);
  // A new line or arrow, cross and cross line all take `arrow` (paletteRoleForKind).
  const arrow = page
    .getByTestId('palette-role-preview')
    .locator('.palette-role-row', { has: page.getByTestId('palette-color-arrow') });
  await expect(arrow.locator('.palette-role-use')).toHaveText(
    'New lines, arrows, crosses and cross lines',
  );
});

test('Apply protects shared locked objects and glyph colors, and save/reopen needs no library', async ({
  page,
}) => {
  await forceFallbackFilePaths(page);
  await openWithProject(
    page,
    relationProject(
      [
        plain('a', 'fa', 't1', 0, 4),
        plain('locked', 'fa', 't2', 0, 4),
        plain('b', 'fb', 't3', 0, 4),
        plain('c', 'fc', 't1', 4, 8),
      ],
      [
        { id: 'fa', name: 'locked_shared', source: 'x' },
        { id: 'fb', name: 'eligible', source: 'y' },
        { id: 'fc', name: 'colored_glyph', source: 'z' },
      ],
    ),
  );
  await pinMathJax(page);
  await expect
    .poll(async () =>
      (await getProject(page)).formulas.every((f) => (f as { snapshot?: unknown }).snapshot),
    )
    .toBeTruthy();
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((project) => {
      project.tracks.find((track) => track.id === 't2')!.locked = true;
      project.formulas.find((formula) => formula.id === 'fc')!.glyphColors = { '0': '#123456' };
    });
    mfe.history.clear();
  });
  const before = await getProject(page);
  await openLibrary(page);
  await importPalette(page);
  await page.getByTestId('palette-activate').click();
  await page.getByTestId('palette-library-done').click();
  await page.getByTestId('menu-edit').click();
  await page.getByTestId('menu-item-edit-apply-palette').click();
  await expect(page.getByTestId('apply-palette-counts')).toContainText(
    '1 object will change. 2 objects skipped.',
  );
  await page.getByTestId('apply-palette-confirm').click();
  const applied = await getProject(page);
  expect(applied.formulas[0]).toEqual(before.formulas[0]);
  expect(applied.formulas[2]).toEqual(before.formulas[2]);
  expect(applied.formulas[1]).toMatchObject({ color: theme.colors.formula });
  expect(applied.meta.background).toBe(theme.colors.background);
  await undo(page);
  expect(await getProject(page)).toEqual(before);
  expect(await canUndo(page)).toBe(false);
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.redo());
  expect(await getProject(page)).toEqual(applied);
  const download = page.waitForEvent('download');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Save As…', exact: true }).click();
  const text = readFileSync(await (await download).path(), 'utf8');
  const saved = JSON.parse(text);
  expect(saved.version).toBe(FORMAT_VERSION);
  expect(text).not.toContain('manim-palette');
  await openLibrary(page);
  await page.getByTestId('palette-delete').click();
  await expect(page.getByTestId('palette-activate-defaults')).toBeDisabled();
  await page.getByTestId('palette-library-done').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…', exact: true }).click();
  await page.getByTestId('projects-other').click();
  await (
    await chooser
  ).setFiles({
    name: 'portable.mfe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect
    .poll(async () => (await getProject(page)).meta.background)
    .toBe(theme.colors.background);
  expect(
    (await getProject(page)).formulas.map((f) => ({
      id: f.id,
      color: (f as unknown as { color: string }).color,
    })),
  ).toEqual(
    applied.formulas.map((f) => ({ id: f.id, color: (f as unknown as { color: string }).color })),
  );
});

test('cooperating tabs retain both imports and blocked storage offers session use and retry', async ({
  page,
  context,
}) => {
  await startApp(page);
  const other = await context.newPage();
  await other.goto('/');
  await other.waitForFunction(() => Boolean((window as MfeWindow).__mfe));
  await Promise.all([openLibrary(page), openLibrary(other)]);
  await Promise.all([
    importPalette(page),
    importPalette(other, JSON.stringify({ ...JSON.parse(themeText), name: 'Second palette' })),
  ]);
  await expect(page.getByTestId('palette-library').getByRole('option')).toHaveCount(3);
  await expect(other.getByTestId('palette-library').getByRole('option')).toHaveCount(3);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restorePaletteStorage(): void }).restorePaletteStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mfe.palettes.v1') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByTestId('palette-activate').click();
  await expect(page.getByTestId('palette-storage-status')).toContainText('Not saved');
  await expect(page.getByTestId('palette-export')).toBeEnabled();
  await page.evaluate(() =>
    (window as unknown as { restorePaletteStorage(): void }).restorePaletteStorage(),
  );
  await page.getByTestId('palette-retry-save').click();
  await expect(page.getByTestId('palette-storage-status')).toHaveCount(0);

  // A change that waits for a save and can no longer apply is dropped with a notice, and the
  // library goes on saving: here the other tab deletes the palette this one was activating.
  const blockStorage = () => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restorePaletteStorage(): void }).restorePaletteStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mfe.palettes.v1') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  };
  await page.bringToFront();
  await page.getByRole('option', { name: /Second palette/ }).click();
  await page.evaluate(blockStorage);
  await page.getByTestId('palette-activate').click();
  await expect(page.getByTestId('palette-storage-status')).toContainText('Not saved');
  await other.getByRole('option', { name: /Second palette/ }).click();
  await other.getByTestId('palette-delete').click();
  await expect(other.getByTestId('palette-library').getByRole('option')).toHaveCount(2);
  await page.evaluate(() =>
    (window as unknown as { restorePaletteStorage(): void }).restorePaletteStorage(),
  );
  await page.getByTestId('palette-retry-save').click();
  const status = page.getByTestId('palette-storage-status');
  await expect(status).toContainText(
    'Activating a palette could not be kept: This palette was removed in another tab.',
  );
  await expect(status).not.toContainText('Not saved');
  await expect(page.getByTestId('palette-retry-save')).toHaveCount(0);
  await expect(page.getByTestId('palette-library').getByRole('option')).toHaveCount(2);
  // Nothing is held back any more: the next change is saved, and the notice goes with it.
  await page.getByTestId('palette-defaults').click();
  await page.getByTestId('palette-activate-defaults').click();
  await expect(page.getByTestId('palette-activate-defaults')).toBeDisabled();
  await expect(status).toHaveCount(0);
  await expect(page.getByTestId('palette-library-error')).toHaveCount(0);
});

test('a stored library that cannot be read is reset from the dialog and saves again', async ({
  page,
}) => {
  // Damaged once, before the app first reads it (not again on the reload below).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('palettes-damaged')) return;
    sessionStorage.setItem('palettes-damaged', 'yes');
    localStorage.setItem('mfe.palettes.v1', '{"version":1,"palettes":[');
  });
  await startApp(page);
  await openLibrary(page);
  const status = page.getByTestId('palette-storage-status');
  await expect(status).toContainText('cannot be read: its data is damaged');
  await expect(status).toContainText('Not saved');
  // The library works in the tab meanwhile, and Retry saving never writes over the damaged data.
  await importPalette(page);
  await page.getByTestId('palette-retry-save').click();
  await expect(page.getByTestId('palette-activate')).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('mfe.palettes.v1'))).toBe(
    '{"version":1,"palettes":[',
  );
  await page.getByTestId('palette-reset-library').click();
  await expect(status).toHaveCount(0);
  await page.getByTestId('palette-library-done').click();
  await page.reload();
  await page.waitForFunction(() => Boolean((window as MfeWindow).__mfe));
  await openLibrary(page);
  await expect(page.getByTestId('palette-name')).toHaveValue(theme.name);
  await expect(status).toHaveCount(0);
});
