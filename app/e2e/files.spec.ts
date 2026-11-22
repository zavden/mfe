import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import {
  addFormulaViaUi,
  closeEditor,
  showGlyphList,
  startApp,
  waitForDrawables,
} from './creatorHelpers';
import {
  canUndo,
  CONTROL_ITSELF,
  getProject,
  MAC,
  projectFile,
  readExample,
  SAVE_AS_KEYS,
  someTextField,
  SYNC_FOLDER_KEYS,
  type MfeWindow,
} from './helpers';

/** File → Save As… / Save through the download fallback; returns the saved text. */
async function saveViaDownload(
  page: Page,
  menuItem: 'Save' | 'Save As…' = 'Save',
): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: menuItem, exact: true }).click();
  const file = await download;
  const path = await file.path();
  return readFileSync(path, 'utf8');
}

/** File → Open… → "Other file…" through the file-input fallback. */
async function openViaChooser(
  page: Page,
  name: string,
  text: string,
  options: { discardUnsaved?: boolean } = {},
): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  await page.getByTestId('projects-other').click();
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
  if (options.discardUnsaved) await page.getByTestId('dialog-discard').click();
}

async function createThreeFormulas(page: Page) {
  const latex = ['a+b=c', '\\frac{x}{y}', 'E=mc^2'];
  for (const [i, source] of latex.entries()) {
    const editor = await addFormulaViaUi(page, source);
    await showGlyphList(editor);
    if (i === 0) {
      await editor.getByTestId('glyph-chip-1').click();
      await editor.getByTestId('palette-YELLOW').click();
    } else if (i === 1) {
      await editor.getByTestId('glyph-chip-0').click();
      await editor.getByTestId('glyph-chip-2').click({ modifiers: ['Shift'] });
      await editor.getByTestId('palette-TEAL').click();
    } else {
      await editor.getByTestId('glyph-chip-4').click();
      await editor.getByTestId('palette-RED').click();
    }
    await closeEditor(page);
  }
  return latex;
}

test.describe('Project files', () => {
  test('acceptance: three formulas, glyph colours, save, reload, reopen the file', async ({
    page,
  }) => {
    await startApp(page);
    const latex = await createThreeFormulas(page);

    // Rename the project so the file name is recognisable, then save.
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Project settings…' }).click();
    await page.getByTestId('settings-name').fill('Three formulas');
    await page.getByTestId('settings-apply').click();
    await expect(page.getByTestId('project-name')).toContainText('Three formulas');
    await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'true');
    await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
    await expect(page).toHaveTitle(/^• Three formulas/);
    // Unsaved work stands out: bold, in another colour than the saved state.
    const statusStyle = () =>
      page.getByTestId('doc-status').evaluate((el) => {
        const style = getComputedStyle(el);
        return { weight: style.fontWeight, color: style.color };
      });
    const unsaved = await statusStyle();
    expect(unsaved.weight).toBe('600');

    await expect(page.getByTestId('doc-file')).toHaveCount(0);
    const saved = await saveViaDownload(page);
    await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    await expect(page.getByTestId('doc-file')).toHaveText('three-formulas.mfe.json');
    const savedStyle = await statusStyle();
    expect(savedStyle.weight).not.toBe('600');
    expect(savedStyle.color).not.toBe(unsaved.color);
    await expect(page).toHaveTitle(/^Three formulas/);
    const project = await getProject(page);
    const colours = project.formulas.map((f) => f.glyphColors);
    expect(colours).toEqual([
      { '1': '#FFFF00' },
      { '0': '#5CD0B3', '1': '#5CD0B3', '2': '#5CD0B3' },
      { '4': '#FC6255' },
    ]);
    expect(JSON.parse(saved).formulas.map((f: { source: string }) => f.source)).toEqual(latex);
    // Snapshots are part of the file: they define the glyph indices the colours refer to.
    expect(
      JSON.parse(saved).formulas.every((f: { snapshot: unknown }) => f.snapshot !== null),
    ).toBe(true);

    // Reload the page: the autosave brings everything back, including the unsaved/saved state.
    await page.reload();
    await expect(page.getByTestId('formula-item')).toHaveCount(3);
    await expect(page.getByTestId('project-name')).toContainText('Three formulas');
    expect((await getProject(page)).formulas.map((f) => f.glyphColors)).toEqual(colours);
    await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByTestId('doc-file')).toHaveText('three-formulas.mfe.json');

    // File → New (nothing unsaved), then reopen the saved file.
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'New', exact: true }).click();
    await expect(page.getByTestId('formula-item')).toHaveCount(0);
    await expect(page.getByTestId('project-name')).toContainText('Untitled');
    await expect(page.getByTestId('doc-status')).toHaveText('Not saved yet');
    await expect(page.getByTestId('doc-file')).toHaveCount(0);

    await openViaChooser(page, 'three-formulas.mfe.json', saved);
    await expect(page.getByTestId('formula-item')).toHaveCount(3);
    await expect(page.getByTestId('doc-file')).toHaveText('three-formulas.mfe.json');
    await expect(page.getByTestId('project-name')).toContainText('Three formulas');
    const reopened = await getProject(page);
    expect(reopened.formulas.map((f) => f.source)).toEqual(latex);
    expect(reopened.formulas.map((f) => f.glyphColors)).toEqual(colours);
    expect(reopened.formulas.map((f) => f.name)).toEqual(['f1', 'f2', 'f3']);
    await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
    // The thumbnails show the colours again.
    const fills = await page
      .getByTestId('formula-item')
      .first()
      .getByTestId('formula-thumb')
      .locator('path')
      .evaluateAll((paths) => paths.map((p) => p.getAttribute('fill')));
    expect(fills).toEqual(['#FFFFFF', '#FFFF00', '#FFFFFF', '#FFFFFF', '#FFFFFF']);
  });

  test('opens examples/hello.mfe.json from a file and draws it', async ({ page }) => {
    await startApp(page);
    await openViaChooser(page, 'hello.mfe.json', readExample('hello.mfe.json'));
    await expect(page.getByTestId('project-name')).toContainText('Hello: one-to-one');
    await expect(page.getByTestId('formula-item')).toHaveCount(2);
    await page.evaluate(() => {
      (
        window as unknown as { __mfe: { useUiStore: { getState(): { setTime(t: number): void } } } }
      ).__mfe.useUiStore
        .getState()
        .setTime(1.5);
    });
    await waitForDrawables(page, 6);
    // The examples are files of the current format: nothing was upgraded, and nothing says so.
    await expect(
      page.getByTestId('notice').filter({ hasText: 'Upgraded from format' }),
    ).toHaveCount(0);
    await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
  });

  test('reports unreadable files without losing the project', async ({ page }) => {
    await startApp(page);
    await addFormulaViaUi(page, 'x');
    await closeEditor(page);
    // The glyphs of the formula reach the project a moment after Apply: read before that, the
    // project would differ below by a write the file that failed to open has nothing to do with.
    await page.waitForFunction(() => {
      const { formulas } = (window as MfeWindow).__mfe!.useProjectStore.getState().project;
      return formulas.length === 1 && formulas[0]!.snapshot !== null;
    });
    const before = await getProject(page);
    expect(before.formulas.map((f) => f.source)).toEqual(['x']);
    const expectProjectKept = async () => {
      expect(await getProject(page)).toEqual(before);
      await expect(page.getByTestId('formula-item')).toHaveCount(1);
      await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
    };
    await expectProjectKept();

    // A broken file is reported without asking about the unsaved work first.
    await openViaChooser(page, 'broken.mfe.json', 'this is not json');
    await expect(page.getByTestId('dialog')).toHaveCount(0);
    const notice = page.getByTestId('notice');
    await expect(notice).toHaveAttribute('data-kind', 'error');
    await expect(notice).toContainText('not valid JSON');
    await expectProjectKept();
    await notice.getByTestId('notice-dismiss').click();
    await expect(notice).toHaveCount(0);

    await openViaChooser(page, 'other.json', JSON.stringify({ format: 'something-else' }));
    await expect(page.getByTestId('notice')).toContainText('not a Manim Formula Editor project');
    await expectProjectKept();
  });

  test('shows semantic issues of an opened file as a warning, and still opens it', async ({
    page,
  }) => {
    await startApp(page);
    const project = JSON.parse(readExample('hello.mfe.json'));
    project.formulas[1].name = project.formulas[0].name; // duplicate names
    project.version = 17; // a file of the format before: the upgrade is told beside the issues
    await openViaChooser(page, 'dup.mfe.json', JSON.stringify(project));
    const notice = page.getByTestId('notice').filter({ hasText: 'Opened with 1 issue' });
    await expect(notice).toHaveAttribute('data-kind', 'warning');
    await expect(notice).toContainText('Opened with 1 issue');
    await expect(notice).toContainText('used more than once');
    await expect(
      page.getByTestId('notice').filter({ hasText: 'Upgraded from format 17' }),
    ).toHaveAttribute('data-kind', 'info');
    await expect(page.getByTestId('formula-item')).toHaveCount(2);
  });

  test('a file with errors opens with a red notice, one with warnings alone with an amber one', async ({
    page,
  }) => {
    await startApp(page);
    const project = JSON.parse(readExample('hello.mfe.json'));
    project.meta.duration = 1e300; // past the longest scene: an error
    await openViaChooser(page, 'long.mfe.json', JSON.stringify(project));
    const notice = page.getByTestId('notice').filter({ hasText: /Opened with \d+ issues?/ });
    await expect(notice).toHaveAttribute('data-kind', 'error');
    await expect(notice).toContainText('The project contains errors');
    await expect(page.getByTestId('formula-item')).toHaveCount(2);
  });

  test('guards unsaved changes on New and Open', async ({ page }) => {
    await startApp(page);
    await addFormulaViaUi(page, 'x');
    await closeEditor(page);
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'New', exact: true }).click();
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Unsaved changes');
    await dialog.getByTestId('dialog-cancel').click();
    await expect(page.getByTestId('formula-item')).toHaveCount(1);

    // Open: choose a file, then be asked; Cancel keeps the current project.
    await openViaChooser(page, 'hello.mfe.json', readExample('hello.mfe.json'));
    await expect(dialog).toContainText('Unsaved changes');
    await dialog.getByTestId('dialog-cancel').click();
    await expect(page.getByTestId('formula-item')).toHaveCount(1);
    await expect(page.getByTestId('project-name')).toContainText('Untitled');

    // "Save" saves (download) and then continues.
    const download = page.waitForEvent('download');
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'New', exact: true }).click();
    await page.getByTestId('dialog-save').click();
    await download;
    await expect(page.getByTestId('formula-item')).toHaveCount(0);
    await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
  });

  // Save As is ⇧⌘S in every app of a Mac, where the app had Sync folder: there the two change
  // places, in the menu and under the keys. The browser is dressed as each system.
  for (const [platform, saveAs, sync, saveAsKeys, syncKeys] of [
    ['Win32', 'Ctrl+Alt+S', 'Ctrl+Shift+S', 'Alt+KeyS', 'Shift+KeyS'],
    ['MacIntel', '⇧⌘S', '⌥⌘S', 'Shift+KeyS', 'Alt+KeyS'],
  ] as const) {
    test(`Save As and Sync folder have the keys of the system, as the File menu says (${platform})`, async ({
      page,
    }) => {
      await page.addInitScript((name) => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => name });
      }, platform);
      await startApp(page);
      await addFormulaViaUi(page, 'x');
      await closeEditor(page);
      await page.getByTestId('menu-file').click();
      const shortcut = (item: string) =>
        page.getByTestId(`menu-item-file-${item}`).locator('.menu-shortcut');
      await expect(shortcut('save-as')).toHaveText(saveAs);
      await expect(shortcut('sync-folder')).toHaveText(sync);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      // The command key of the system the browser is dressed as, whatever the suite runs on.
      const command = platform === 'MacIntel' ? 'Meta' : CONTROL_ITSELF;
      let downloads = 0;
      page.on('download', () => downloads++);
      // Sync folder's key saves nothing; Save As's saves the file.
      await page.keyboard.press(`${command}+${syncKeys}`);
      const saved = page.waitForEvent('download');
      await page.keyboard.press(`${command}+${saveAsKeys}`);
      expect((await saved).suggestedFilename()).toBe('untitled.mfe.json');
      expect(downloads).toBe(1);
    });
  }

  // The browser keeps Ctrl/⌘+N for a new window, so New is Ctrl/⌘+Alt+N, read by the place of
  // the key as Save As is (audit B5-08).
  test('Ctrl/⌘+Alt+N is File ▸ New, as its menu says; Ctrl/⌘+N is not', async ({ page }) => {
    await startApp(page);
    await addFormulaViaUi(page, 'x');
    await closeEditor(page);
    await page.getByTestId('menu-file').click();
    await expect(page.getByTestId('menu-item-file-new').locator('.menu-shortcut')).toHaveText(
      MAC ? '⌥⌘N' : 'Ctrl+Alt+N',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    // Ctrl/⌘+N: the page does nothing with it (a real browser opens a window instead).
    await page.keyboard.press('ControlOrMeta+n');
    await expect(page.getByTestId('dialog')).toHaveCount(0);
    // Ctrl/⌘+Alt+N: New, which asks first about the unsaved changes.
    await page.keyboard.press('ControlOrMeta+Alt+n');
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Unsaved changes');
    await dialog.getByRole('button', { name: "Don't save" }).click();
    await expect(page.getByTestId('formula-item')).toHaveCount(0);
    await expect(page.getByTestId('project-name')).toContainText('Untitled');
    await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
  });

  test('unsaved work brought back by the autosave reads "Recovered" until it is saved', async ({
    page,
  }) => {
    await startApp(page);
    await addFormulaViaUi(page, 'x');
    await closeEditor(page);
    const status = page.getByTestId('doc-status');
    await expect(status).toHaveText('Unsaved changes');
    await expect(status).toHaveAttribute('data-recovered', 'false');

    await page.reload();
    await expect(page.getByTestId('formula-item')).toHaveCount(1);
    await expect(status).toHaveText('Recovered, not saved');
    await expect(status).toHaveAttribute('data-recovered', 'true');
    await expect(page.getByTestId('project-name')).toHaveAttribute(
      'title',
      /Recovered from this browser's autosave: save it to keep it\.$/,
    );
    // In the warning colour of the theme.
    const [colour, warning] = await status.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--warning)';
      el.append(probe);
      const pair = [getComputedStyle(el).color, getComputedStyle(probe).color];
      probe.remove();
      return pair;
    });
    expect(colour).toBe(warning);

    await saveViaDownload(page);
    await expect(status).toHaveText('Saved');
    await expect(status).toHaveAttribute('data-recovered', 'false');
  });

  /** Reload and wait for the app (and its dev handle) to be back. */
  const reload = async (p: Page) => {
    await p.reload();
    await p.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  };
  /** Wait for this tab's autosave record (written 400 ms after a change). */
  /** The page's own autosave holds the formula whose source is `source`. A record alone is not
   * enough: the first change is the new formula, still empty, and on a machine slow enough the
   * autosave (400 ms after a change) is written before the source is applied. */
  const autosaved = (p: Page, source: string) =>
    p.waitForFunction((written) => {
      const record = localStorage.getItem(`mfe.autosave.${sessionStorage.getItem('mfe.session')}`);
      return record !== null && (JSON.parse(record) as { text: string }).text.includes(written);
    }, JSON.stringify(source));

  test('two tabs keep their own autosaves; a closed tab’s work comes back in a new one', async ({
    page,
    context,
  }) => {
    await startApp(page);
    await addFormulaViaUi(page, 'x');
    await closeEditor(page);
    await expect(page.getByTestId('formula-item')).toHaveCount(1);

    // A second tab starts empty: the first one is open, its work is its own.
    const second = await context.newPage();
    await startApp(second);
    await expect(second.getByTestId('formula-item')).toHaveCount(0);
    await addFormulaViaUi(second, 'y');
    await closeEditor(second);
    await expect(second.getByTestId('formula-item')).toHaveCount(1);
    // Nothing of another tab to recover while both are open.
    await second.getByTestId('menu-file').click();
    await second.getByRole('menuitem', { name: 'Recover autosave' }).hover();
    await expect(
      second.getByRole('menuitem', { name: 'No autosave of another tab' }),
    ).toBeVisible();
    await second.keyboard.press('Escape');

    // Each tab reloads into its own work.
    await autosaved(page, 'x');
    await autosaved(second, 'y');
    await reload(page);
    await expect(page.getByTestId('formula-item')).toHaveCount(1);
    expect((await getProject(page)).formulas.map((f) => f.source)).toEqual(['x']);
    await reload(second);
    await expect(second.getByTestId('formula-item')).toHaveCount(1);
    expect((await getProject(second)).formulas.map((f) => f.source)).toEqual(['y']);

    // The second tab goes; a new tab takes its work over (the first tab is still open).
    await second.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await second.close();
    const third = await context.newPage();
    await startApp(third);
    await expect(third.getByTestId('formula-item')).toHaveCount(1);
    expect((await getProject(third)).formulas.map((f) => f.source)).toEqual(['y']);
    await expect(third.getByTestId('doc-status')).toHaveText('Recovered, not saved');
    await reload(page);
    expect((await getProject(page)).formulas.map((f) => f.source)).toEqual(['x']);
    await third.close();
  });

  test('File → Recover autosave lists the work of tabs that are gone', async ({ page }) => {
    await startApp(page);
    await addFormulaViaUi(page, 'x');
    await closeEditor(page);
    await autosaved(page, 'x');
    // Two records of tabs that are gone, as a crash leaves them (no alive mark).
    await page.evaluate(() => {
      const own = JSON.parse(
        localStorage.getItem(`mfe.autosave.${sessionStorage.getItem('mfe.session')}`)!,
      ) as { text: string; savedAt: number };
      const text = own.text.replace('"x"', '"z"');
      localStorage.setItem(
        'mfe.autosave.gone1',
        JSON.stringify({
          v: 3,
          savedAt: own.savedAt - 60_000,
          name: 'Gone one',
          dirty: true,
          fileName: 'one.mfe.json',
          text,
        }),
      );
      localStorage.setItem(
        'mfe.autosave.gone2',
        JSON.stringify({
          v: 3,
          savedAt: own.savedAt - 3_600_000,
          name: 'Gone two',
          dirty: false,
          fileName: null,
          text: own.text,
        }),
      );
    });
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Recover autosave' }).hover();
    const items = page.getByRole('menuitem', { name: /ago$/ });
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText('one.mfe.json (unsaved changes) · 1 min ago');
    await expect(items.nth(1)).toHaveText('Gone two · 1 h ago');
    await items.nth(0).click();
    // The current work has unsaved changes: asked first.
    await page.getByTestId('dialog-discard').click();
    expect((await getProject(page)).formulas.map((f) => f.source)).toEqual(['z']);
    await expect(page.getByTestId('doc-file')).toHaveText('one.mfe.json');
    await expect(page.getByTestId('doc-status')).toHaveText('Recovered, not saved');
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Recover autosave' }).hover();
    await expect(page.getByRole('menuitem', { name: /ago$/ })).toHaveCount(1);
    await page.keyboard.press('Escape');
  });

  test('an autosave this version cannot read is reported and can be downloaded', async ({
    page,
  }) => {
    await startApp(page);
    const text = JSON.stringify({ format: 'manim-formula-editor', version: 99 });
    await page.evaluate(
      (record) => localStorage.setItem('mfe.autosave', record), // a record of older versions
      JSON.stringify({
        v: 1,
        savedAt: 0,
        fileName: 'newer.mfe.json',
        dirty: true,
        text,
      }),
    );
    await page.reload();
    const notice = page.getByTestId('notice');
    await expect(notice).toContainText('Could not restore the autosaved project');
    await expect(notice).toContainText('saved by a newer version of the app (format 99');
    const download = page.waitForEvent('download');
    await notice.getByTestId('notice-action').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('autosave.mfe.json');
    expect(readFileSync((await file.path())!, 'utf8')).toBe(text);
    await expect(notice).toBeVisible(); // errors stay until dismissed
  });

  test('says once when the browser keeps no autosave', async ({ page }) => {
    type Refusing = Window & { __refusedWrites?: { key: string; value: string }[] };
    await page.addInitScript(() => {
      // A storage that takes nothing, and keeps what it was asked to take.
      const refused: { key: string; value: string }[] = [];
      (window as Refusing).__refusedWrites = refused;
      Storage.prototype.setItem = (key: string, value: string) => {
        refused.push({ key, value });
        throw new DOMException('blocked', 'SecurityError');
      };
    });
    /** Whether an autosave that holds the formula `source` (a letter) was tried, and refused.
     * The record carries the project as text: its quotes are escaped there. */
    const autosaveTriedWith = (source: string) =>
      page.evaluate((letter) => {
        const formula = new RegExp(`source\\\\?":\\s*\\\\?"${letter}\\\\?"`);
        return (window as Refusing).__refusedWrites!.some(
          ({ key, value }) => key.startsWith('mfe.autosave.') && formula.test(value),
        );
      }, source);
    await startApp(page);
    // A browser that stores nothing keeps no mark of the session either, and this one has no file
    // pickers (`startApp`): it is told what it works on, in a notice that stays. Closed first: it
    // lies over the editor's Close button.
    const copies = page.getByTestId('notice').filter({ hasText: 'works on copies of your files' });
    await expect(copies).toHaveCount(1);
    await copies.getByTestId('notice-dismiss').click();
    await addFormulaViaUi(page, 'x');
    // Read while the editor is open. The notice lies over the editor's Close button, and a click
    // there waits until the notice has gone (12 s for a warning): closing first, the test met the
    // notice only when the editor closed within the 400 ms the first write takes to come.
    const notice = page.getByTestId('notice');
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText('No autosave in this browser');
    await expect(notice).toContainText('Save to a file to keep your work.');
    await notice.getByTestId('notice-dismiss').click();
    await closeEditor(page);
    await addFormulaViaUi(page, 'y');
    await closeEditor(page);
    // The write failed once more — the autosave with the second formula was tried —, and once the
    // page has drawn what that brought it is not said again.
    await expect.poll(() => autosaveTriedWith('y')).toBe(true);
    await page.evaluate(
      () => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))),
    );
    await expect(notice).toHaveCount(0);
  });

  test('keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+S and Ctrl+Alt+S', async ({
    page,
  }) => {
    await startApp(page);
    await page.getByTestId('creator-new').click();
    await closeEditor(page);
    await page.getByTestId('creator-new').click();
    await closeEditor(page);
    await expect(page.getByTestId('formula-item')).toHaveCount(2);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('formula-item')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+Shift+Z');
    await expect(page.getByTestId('formula-item')).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+z');
    // Ctrl+Y redoes on Windows and Linux. A Mac has ⌘⇧Z alone: ⌘Y is not the app's.
    await page.keyboard.press('ControlOrMeta+y');
    await expect(page.getByTestId('formula-item')).toHaveCount(MAC ? 1 : 2);
    if (MAC) await page.keyboard.press('ControlOrMeta+Shift+Z');
    await expect(page.getByTestId('formula-item')).toHaveCount(2);

    // Typing in a field keeps its own undo: the project is not touched.
    const field = await someTextField(page);
    await field.fill('abc');
    await field.press('ControlOrMeta+z');
    await expect(field).toHaveValue(''); // the field's own undo
    expect((await getProject(page)).formulas).toHaveLength(2);

    // Shortcuts are ignored while a field has the focus (Ctrl+S included).
    await field.evaluate((el) => (el as HTMLInputElement).blur());
    const download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+s');
    expect((await download).suggestedFilename()).toBe('untitled.mfe.json');
    await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');

    // Save As is Ctrl+Alt+S; Ctrl+Shift+S is Sync folder's and saves nothing (on a Mac the two
    // are ⇧⌘S and ⌥⌘S: the helpers give the keys of the system the suite runs on).
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.keyboard.press(SYNC_FOLDER_KEYS);
    const saveAs = page.waitForEvent('download');
    await page.keyboard.press(SAVE_AS_KEYS);
    expect((await saveAs).suggestedFilename()).toBe('untitled.mfe.json');
    expect(downloads).toBe(1);
  });

  test('project settings: one undo step, preview follows the resolution and background', async ({
    page,
  }) => {
    await startApp(page);
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Project settings…' }).click();
    await page.getByTestId('settings-resolution').selectOption('1280x720');
    await page.getByTestId('settings-target').selectOption('gl');
    await page.getByTestId('settings-fps').selectOption('30');
    await page.getByTestId('settings-background-hex').fill('#202040');
    await page.getByTestId('settings-background-hex').press('Enter');
    await page.getByTestId('settings-preamble').fill('\\newcommand{\\R}{\\mathbb{R}}');
    await page.getByTestId('settings-apply').click();
    const meta = (await getProject(page)).meta;
    expect(meta).toMatchObject({
      width: 1280,
      height: 720,
      fps: 30,
      target: 'gl',
      background: '#202040',
      preamble: '\\newcommand{\\R}{\\mathbb{R}}',
    });
    await expect(page.getByTestId('preview-frame')).toHaveCSS(
      'background-color',
      'rgb(32, 32, 64)',
    );
    await page.keyboard.press('ControlOrMeta+z');
    expect((await getProject(page)).meta).toMatchObject({ width: 1920, target: 'ce', fps: 60 });
  });
});

test('Save writes the same file again after a reload (the handle is kept)', async ({ page }) => {
  await page.addInitScript(() => {
    // Real handles from the origin-private file system stand in for the picker's: they can be
    // stored in IndexedDB and written to, and need no permission.
    const w = window as unknown as {
      showSaveFilePicker: (options: { suggestedName?: string }) => Promise<unknown>;
      showOpenFilePicker: () => Promise<unknown[]>;
      __pickerCalls: number;
    };
    w.__pickerCalls = 0;
    w.showSaveFilePicker = async (options) => {
      w.__pickerCalls += 1;
      const dir = await navigator.storage.getDirectory();
      return dir.getFileHandle(options.suggestedName ?? 'project.mfe.json', { create: true });
    };
    w.showOpenFilePicker = async () => [];
  });
  const pickerCalls = () =>
    page.evaluate(() => (window as unknown as { __pickerCalls: number }).__pickerCalls);
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await page.getByTestId('creator-new').click();
  await closeEditor(page);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');
  await expect(page.getByTestId('doc-file')).toHaveText('untitled.mfe.json');
  expect(await pickerCalls()).toBe(1);

  // Edit, reload (the autosave brings the project back) and save again: the same file, no picker.
  await page.getByTestId('creator-new').click();
  await closeEditor(page);
  await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
  await page.reload();
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await expect(page.getByTestId('doc-status')).toHaveText('Recovered, not saved');
  await page.waitForFunction(
    () => (window as MfeWindow).__mfe!.useDocumentStore.getState().handle !== null,
  );
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');
  expect(await pickerCalls()).toBe(0);
  const written = await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const file = await (await dir.getFileHandle('untitled.mfe.json')).getFile();
    return JSON.parse(await file.text()) as { formulas: unknown[] };
  });
  expect(written.formulas).toHaveLength(2);
});

// Open reads the chosen file before it asks about unsaved work, and "Save" in that question
// writes the file that is open. Chosen again, that file is read again after the save: what opens
// is what Save wrote, and the next Save loses nothing. The files are real ones of the
// origin-private file system, written through real streams; only the system's file picker is
// replaced. A file of the same name in another folder is another file: it opens as it is.
for (const [scenario, sameFile] of [
  ['the file that is open', true],
  ['another file of the same name', false],
] as const) {
  test(`Open after Save in the question opens what the file holds: ${scenario}`, async ({
    page,
  }) => {
    const fileName = 'lesson.mfe.json';
    const oneTrack = { tracks: [{ id: 't1', name: 'Track 1', hidden: false, locked: false }] };
    const texts = {
      first: projectFile('Lesson', [], [], oneTrack),
      other: projectFile('Another lesson', [], [], oneTrack),
    };
    /** What the file of `folder` holds now. */
    const stored = (folder: 'first' | 'other') =>
      page.evaluate(
        async ({ folder, fileName }) => {
          const root = await navigator.storage.getDirectory();
          const handle = await (await root.getDirectoryHandle(folder)).getFileHandle(fileName);
          const data = JSON.parse(await (await handle.getFile()).text()) as {
            meta: { name: string };
            tracks: unknown[];
            camera?: unknown;
          };
          return { name: data.meta.name, tracks: data.tracks.length, camera: !!data.camera };
        },
        { folder, fileName },
      );
    const shown = async () => {
      const project = await getProject(page);
      return {
        name: project.meta.name,
        tracks: project.tracks.length,
        camera: !!(project as { camera?: unknown }).camera,
      };
    };
    const openOtherFile = async () => {
      await page.getByTestId('menu-file').click();
      await page.getByRole('menuitem', { name: 'Open…', exact: true }).click();
      await page.getByTestId('projects-other').click();
    };

    await page.goto('/');
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    // The picker gives the file of `first/`, and then that file again or the one of `other/`:
    // a handle of its own each time, as Chrome does for a file it gave before.
    const sameEntry = await page.evaluate(
      async ({ texts, sameFile, fileName }) => {
        const root = await navigator.storage.getDirectory();
        for (const [folder, text] of Object.entries(texts)) {
          const directory = await root.getDirectoryHandle(folder, { create: true });
          const stream = await (
            await directory.getFileHandle(fileName, { create: true })
          ).createWritable();
          await stream.write(text);
          await stream.close();
        }
        const handleIn = async (folder: string) =>
          (await root.getDirectoryHandle(folder)).getFileHandle(fileName);
        let picks = 0;
        Object.defineProperty(window, 'showOpenFilePicker', {
          configurable: true,
          value: async () => [await handleIn(++picks === 1 || sameFile ? 'first' : 'other')],
        });
        return (await handleIn('first')).isSameEntry(await handleIn(sameFile ? 'first' : 'other'));
      },
      { texts, sameFile, fileName },
    );
    expect(sameEntry).toBe(sameFile);

    await openOtherFile();
    await expect(page.getByTestId('project-rename')).toHaveText('Lesson');
    await page.getByTestId('timeline-add-track').click();
    await page.getByTestId('preview-multicamera').click();
    await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
    const edited = { name: 'Lesson', tracks: 2, camera: true };
    expect(await shown()).toEqual(edited);

    await openOtherFile();
    await page.getByTestId('dialog-save').click();
    // The project that opens has no history: until then, the one that was saved is on screen.
    await expect.poll(() => canUndo(page)).toBe(false);
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    expect(await stored('first')).toEqual(edited);
    const opened = sameFile ? edited : { name: 'Another lesson', tracks: 1, camera: false };
    expect(await shown()).toEqual(opened);
    await expect(page.getByTestId('project-rename')).toHaveText(opened.name);
    await expect(page.getByTestId('preview-multicamera')).toHaveAttribute(
      'aria-pressed',
      String(opened.camera),
    );

    // A change of the name alone, and Save: the file keeps everything else it held.
    await page.getByTestId('project-rename').click();
    await page.getByTestId('project-rename-input').fill('Final title');
    await page.getByTestId('project-rename-input').press('Enter');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    expect(await stored(sameFile ? 'first' : 'other')).toEqual({ ...opened, name: 'Final title' });
    if (!sameFile) expect(await stored('first')).toEqual(edited);
  });
}
