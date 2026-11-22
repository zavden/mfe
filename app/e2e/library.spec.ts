import { expect, test, type Page } from './test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { textArtifactRender, toSnapshot } from '../src/engine';
import { hashBlob } from '../src/media/hash';
import {
  createEmptyProject,
  createTextFormula,
  serializeProject,
  validateTextGeometryArtifact,
} from '../src/model';
import { textGeometry } from '../src/test/textGeometry';
import { closeEditor, forceFallbackFilePaths } from './creatorHelpers';
import { getProject, readExample, SYNC_FOLDER_KEYS, type MfeWindow } from './helpers';

const hello = readExample('hello.mfe.json');
const oneToMany = readExample('one-to-many.mfe.json');
const nameOf = (text: string) => (JSON.parse(text) as { meta: { name: string } }).meta.name;
const formulasOf = (text: string) => (JSON.parse(text) as { formulas: unknown[] }).formulas.length;

/** Real handles from the origin-private file system stand in for the folder picker's: they can
 * be stored in IndexedDB, listed and written to, and need no permission. The file pickers must
 * not open. */
async function stubDirectoryPicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      showDirectoryPicker: () => Promise<unknown>;
      showOpenFilePicker: () => Promise<unknown[]>;
      showSaveFilePicker: () => Promise<unknown>;
      __dirPicks: number;
    };
    w.__dirPicks = 0;
    w.showDirectoryPicker = async () => {
      w.__dirPicks += 1;
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle('Projects', { create: true });
    };
    w.showOpenFilePicker = async () => [];
    w.showSaveFilePicker = async () => {
      throw new Error('the save picker must not open');
    };
  });
}

/** Write `text` at `path` (folders created) in the origin-private file system. */
async function writeOpfs(page: Page, path: string[], text: string): Promise<void> {
  await page.evaluate(
    async ([segments, content]) => {
      let dir = await navigator.storage.getDirectory();
      for (const name of segments.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(name, { create: true });
      }
      const file = await dir.getFileHandle(segments[segments.length - 1]!, { create: true });
      const writable = await file.createWritable();
      await writable.write(content);
      await writable.close();
    },
    [path, text] as const,
  );
}

async function readOpfs(page: Page, path: string[]): Promise<string> {
  return page.evaluate(async (segments) => {
    let dir = await navigator.storage.getDirectory();
    for (const name of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(name);
    const file = await (await dir.getFileHandle(segments[segments.length - 1]!)).getFile();
    return file.text();
  }, path);
}

async function startPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
}

/** File → Open… is the Projects dialog. */
async function openProjects(page: Page): Promise<void> {
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  await expect(page.getByTestId('projects-dialog')).toBeVisible();
}

test.describe('Projects dialog', () => {
  test('the dialog is wide, is resized from its corner and maximized, and opens again as it was left', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubDirectoryPicker(page);
    await startPage(page);
    await writeOpfs(page, ['Projects', 'hello.mfe.json'], hello);
    await openProjects(page);
    await page.getByTestId('projects-sync').click();
    await expect(page.getByTestId('projects-entry')).toHaveCount(1);
    const dialog = page.getByTestId('projects-dialog');
    const size = async () => {
      const at = (await dialog.boundingBox())!;
      return { width: Math.round(at.width), height: Math.round(at.height) };
    };
    const first = await size();
    expect(first.width).toBe(1040);

    // The corner: the dialog stays centred, so it grows by twice what the corner moves.
    const grip = (await page.getByTestId('projects-dialog-resize').boundingBox())!;
    await page.mouse.move(grip.x + 8, grip.y + 8);
    await page.mouse.down();
    await page.mouse.move(grip.x + 68, grip.y + 158, { steps: 4 });
    await page.mouse.up();
    const resized = await size();
    expect(resized.width).toBe(1160);
    expect(resized.height).toBe(Math.max(300, first.height + 300));

    // Closed and opened again in the same tab, it is as it was left.
    await page.getByTestId('projects-close').click();
    await expect(dialog).toBeHidden();
    await openProjects(page);
    expect(await size()).toEqual(resized);

    await page.getByTestId('projects-dialog-maximize').click();
    await expect(dialog).toHaveClass(/is-maximized/);
    expect((await size()).width).toBe(1440 - 16);
    await page.getByTestId('projects-dialog-maximize').click();
    expect(await size()).toEqual(resized);
    // A double click on the corner: the size it has when nothing was chosen.
    await page.getByTestId('projects-dialog-resize').dblclick();
    expect(await size()).toEqual(first);
  });

  test('the projects are cards in as many columns as the dialog has room for', async ({ page }) => {
    await page.setViewportSize({ width: 1700, height: 900 });
    await stubDirectoryPicker(page);
    await startPage(page);
    for (const name of ['a', 'b', 'c', 'd']) {
      await writeOpfs(page, ['Projects', `${name}.mfe.json`], hello);
    }
    await openProjects(page);
    await page.getByTestId('projects-sync').click();
    const entries = page.getByTestId('projects-entry');
    await expect(entries).toHaveCount(4);
    /** How many cards the first row of the list holds. */
    const columns = async () => {
      const boxes = await entries.evaluateAll((cards) =>
        cards.map((card) => Math.round(card.getBoundingClientRect().top)),
      );
      return boxes.filter((top) => top === boxes[0]).length;
    };
    const fileUnderName = async () => {
      const name = (await page.getByTestId('projects-entry-name').first().boundingBox())!;
      const file = (await page.getByTestId('projects-entry-file').first().boundingBox())!;
      return file.y >= name.y + name.height - 1;
    };
    // As it opens, 1040 px wide: two columns, the file's name under the project's.
    expect(await columns()).toBe(2);
    expect(await fileUnderName()).toBe(true);
    // Maximized in a window 1700 px wide: three.
    await page.getByTestId('projects-dialog-maximize').click();
    expect(await columns()).toBe(3);
    await page.getByTestId('projects-dialog-maximize').click();
    // Narrowed by its corner: one column, a row as it was, the file's name beside the project's.
    const grip = (await page.getByTestId('projects-dialog-resize').boundingBox())!;
    await page.mouse.move(grip.x + 8, grip.y + 8);
    await page.mouse.down();
    await page.mouse.move(grip.x - 112, grip.y + 8, { steps: 4 });
    await page.mouse.up();
    expect(Math.round((await page.getByTestId('projects-dialog').boundingBox())!.width)).toBe(800);
    expect(await columns()).toBe(1);
    expect(await fileUnderName()).toBe(false);
    // A card is as wide as its column, and the cards of a row as tall as each other.
    const list = (await page.getByTestId('projects-list').boundingBox())!;
    expect(Math.round((await entries.first().boundingBox())!.width)).toBe(Math.round(list.width));
  });

  test('the search keeps the projects whose name or file name has what is typed; Escape empties it, then closes the dialog', async ({
    page,
  }) => {
    await stubDirectoryPicker(page);
    await startPage(page);
    await writeOpfs(page, ['Projects', 'hello.mfe.json'], hello);
    await writeOpfs(page, ['Projects', 'one-to-many.mfe.json'], oneToMany);
    await writeOpfs(page, ['Projects', 'draft-7.mfe.json'], hello);
    await openProjects(page);
    // No folder, nothing to search.
    const search = page.getByTestId('projects-search');
    await expect(search).toHaveCount(0);
    await page.getByTestId('projects-sync').click();
    const entries = page.getByTestId('projects-entry');
    const files = page.getByTestId('projects-entry-file');
    await expect(entries).toHaveCount(3);

    // By the project's name, whatever the case.
    await search.fill('MANY');
    await expect(files).toHaveText(['one-to-many.json']);
    // By the file's name.
    await search.fill('draft');
    await expect(files).toHaveText(['draft-7.json']);
    // Every word, each in the name or in the file's name: two projects are named "Hello…".
    await search.fill('hello');
    await expect(entries).toHaveCount(2);
    await search.fill('hello 7');
    await expect(files).toHaveText(['draft-7.json']);
    // Nothing found: it says so, and the folder's line and its buttons stay.
    await search.fill('zzz');
    await expect(entries).toHaveCount(0);
    await expect(page.getByTestId('projects-none')).toHaveText('No project matches “zzz”.');
    await expect(page.getByTestId('projects-sync')).toBeVisible();

    // Escape empties the search; the next one closes the dialog.
    await search.press('Escape');
    await expect(page.getByTestId('projects-dialog')).toBeVisible();
    await expect(search).toHaveValue('');
    await expect(entries).toHaveCount(3);
    await search.press('Escape');
    await expect(page.getByTestId('projects-dialog')).toBeHidden();

    // Opened again over the listed folder: the search is empty and has the focus, so that what is
    // typed is looked for at once.
    await openProjects(page);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await page.keyboard.type('many');
    await expect(entries).toHaveCount(1);
    await entries.first().click();
    await expect(page.getByTestId('projects-dialog')).toBeHidden();
    expect((await getProject(page)).meta.name).toBe(nameOf(oneToMany));
  });

  test('the star of a card keeps the project among the favorites, which Favorites lists alone; a reload keeps them', async ({
    page,
  }) => {
    await stubDirectoryPicker(page);
    await startPage(page);
    await writeOpfs(page, ['Projects', 'hello.mfe.json'], hello);
    await writeOpfs(page, ['Projects', 'one-to-many.mfe.json'], oneToMany);
    await writeOpfs(page, ['Projects', 'draft-7.mfe.json'], hello);
    await openProjects(page);
    await page.getByTestId('projects-sync').click();
    const dialog = page.getByTestId('projects-dialog');
    const entries = page.getByTestId('projects-entry');
    const files = page.getByTestId('projects-entry-file');
    const search = page.getByTestId('projects-search');
    const all = page.getByTestId('projects-view-all');
    const favorites = page.getByTestId('projects-view-favorites');
    const starOf = (file: string) =>
      page
        .getByTestId('projects-list')
        .locator('li', { hasText: file })
        .getByTestId('projects-star');
    await expect(entries).toHaveCount(3);
    await expect(all).toHaveAttribute('aria-checked', 'true');
    await expect(all).toHaveText('All 3');
    await expect(favorites).toHaveText('Favorites 0');

    // No star yet: Favorites says how a project gets there.
    await favorites.click();
    await expect(entries).toHaveCount(0);
    await expect(page.getByTestId('projects-none')).toHaveText(
      'No favorites yet. The star on a project keeps it here.',
    );
    await all.click();

    // A star is given on the card; it does not open the project.
    await starOf('one-to-many.json').click();
    await expect(starOf('one-to-many.json')).toHaveAttribute('aria-pressed', 'true');
    await expect(starOf('hello.json')).toHaveAttribute('aria-pressed', 'false');
    await starOf('draft-7.json').click();
    await expect(dialog).toBeVisible();
    await expect(favorites).toHaveText('Favorites 2');
    await expect(entries).toHaveCount(3);

    // Favorites lists the starred ones alone, and the search looks among them.
    await favorites.click();
    expect((await files.allTextContents()).sort()).toEqual(['draft-7.json', 'one-to-many.json']);
    await search.fill('hello');
    await expect(files).toHaveText(['draft-7.json']);
    await search.fill('zzz');
    await expect(page.getByTestId('projects-none')).toHaveText('No favorite matches “zzz”.');
    await search.fill('');
    // A star taken away there takes the project off the list.
    await starOf('draft-7.json').click();
    await expect(files).toHaveText(['one-to-many.json']);
    await expect(favorites).toHaveText('Favorites 1');

    // The browser keeps the stars: after a reload the folder is listed with them.
    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    await openProjects(page);
    await expect(entries).toHaveCount(3);
    await expect(all).toHaveAttribute('aria-checked', 'true');
    await expect(starOf('one-to-many.json')).toHaveAttribute('aria-pressed', 'true');
    await expect(starOf('draft-7.json')).toHaveAttribute('aria-pressed', 'false');
    await favorites.click();
    await entries.first().click();
    await expect(dialog).toBeHidden();
    expect((await getProject(page)).meta.name).toBe(nameOf(oneToMany));
  });

  test('a project of the folder that does not open is named with why, apart from what is no project', async ({
    page,
  }) => {
    await stubDirectoryPicker(page);
    await startPage(page);
    const edited = (change: (raw: Record<string, unknown>) => void) => {
      const raw = JSON.parse(hello) as Record<string, unknown>;
      change(raw);
      return JSON.stringify(raw);
    };
    await writeOpfs(page, ['Projects', 'hello.mfe.json'], hello);
    // Saved by a newer app; with a field out of place; a package that is not one.
    await writeOpfs(
      page,
      ['Projects', 'newer.mfe.json'],
      edited((raw) => {
        raw.version = 99;
      }),
    );
    await writeOpfs(
      page,
      ['Projects', 'malformed.mfe.json'],
      edited((raw) => {
        (raw.meta as { fps: unknown }).fps = 'fast';
      }),
    );
    await writeOpfs(page, ['Projects', 'lecture.mfe'], 'not a package at all, but long enough');
    await writeOpfs(page, ['Projects', 'notes.json'], '{"not":"a project"}');

    await openProjects(page);
    await page.getByTestId('projects-sync').click();
    await expect(page.getByTestId('projects-entry')).toHaveCount(1);
    const unopened = page.getByTestId('projects-unopened');
    await expect(unopened).toContainText('3 projects of the folder do not open:');
    const rows = page.getByTestId('projects-unopened-file');
    await expect(rows).toHaveCount(3);
    expect(await rows.allInnerTexts()).toEqual([
      expect.stringMatching(
        /^lecture\.mfe\s+The \.mfe project is damaged or unsupported: its signature is not recognized\.$/,
      ),
      expect.stringMatching(/^malformed\.mfe\.json\s+The project file is malformed\.$/),
      expect.stringMatching(
        /^newer\.mfe\.json\s+The project was saved by a newer version of the app \(format 99; this app reads up to \d+\)\.$/,
      ),
    ]);
    // What is no project is counted as before, and only that.
    await expect(page.getByTestId('projects-skipped')).toHaveText(
      'One other .json file in the folder is not a project.',
    );
    // Nothing of it is cut: the block is inside the dialog, and each reason is whole.
    const inside = await unopened.evaluate((block) => {
      const dialog = block.closest('[data-testid="projects-dialog"]')!.getBoundingClientRect();
      const box = block.getBoundingClientRect();
      const cut = [...block.querySelectorAll('span')].some(
        (span) => span.scrollWidth > span.clientWidth + 1,
      );
      return box.left >= dialog.left && box.right <= dialog.right && !cut;
    });
    expect(inside).toBe(true);

    // A reload keeps the folder, and what it says of it.
    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    await openProjects(page);
    await expect(page.getByTestId('projects-unopened-file')).toHaveCount(3);

    // A folder with nothing that opens says so, and still names the files.
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      await (await root.getDirectoryHandle('Projects')).removeEntry('hello.mfe.json');
    });
    await page.getByTestId('projects-sync').click();
    await expect(page.getByTestId('projects-empty')).toHaveText(
      'No project of Projects opens here.',
    );
    await expect(page.getByTestId('projects-unopened-file')).toHaveCount(3);
  });

  test('Chrome: Sync folder lists the folder, a click opens a project, Save writes it in place, a reload keeps the folder', async ({
    page,
  }) => {
    await stubDirectoryPicker(page);
    await startPage(page);
    await writeOpfs(page, ['Projects', 'hello.mfe.json'], hello);
    await writeOpfs(page, ['Projects', 'one-to-many.mfe.json'], oneToMany);
    await writeOpfs(page, ['Projects', 'notes.json'], '{"not":"a project"}');
    await writeOpfs(page, ['Projects', 'sub', 'nested.mfe.json'], hello); // one level deep only

    await page.keyboard.press('ControlOrMeta+o');
    await expect(page.getByTestId('projects-dialog')).toBeVisible();
    await expect(page.getByTestId('projects-folder')).toContainText('No folder synced');
    await expect(page.getByTestId('projects-entry')).toHaveCount(0);
    // Sync folder works inside the dialog too (its button, or the shortcut).
    await page.keyboard.press(SYNC_FOLDER_KEYS);
    await expect(page.getByTestId('projects-folder')).toHaveText('Folder Projects');
    const entries = page.getByTestId('projects-entry');
    await expect(entries).toHaveCount(2);
    const names = await page.getByTestId('projects-entry-name').allTextContents();
    expect(names.sort()).toEqual([nameOf(hello), nameOf(oneToMany)].sort());
    // The file's name beside the project's, without the `.mfe`.
    const files = await page.getByTestId('projects-entry-file').allTextContents();
    expect(files.sort()).toEqual(['hello.json', 'one-to-many.json']);
    await expect(page.getByTestId('projects-skipped')).toHaveText(
      'One other .json file in the folder is not a project.',
    );
    const helloEntry = entries.filter({ hasText: nameOf(hello) });
    await expect(helloEntry).toContainText(`${formulasOf(hello)} formulas`);
    // Thumbnails: MathJax renders of the first formulas.
    await expect(helloEntry.locator('.formula-thumb svg').first()).toBeVisible();

    await helloEntry.click();
    await expect(page.getByTestId('projects-dialog')).toBeHidden();
    expect((await getProject(page)).meta.name).toBe(nameOf(hello));
    await expect(page.getByTestId('doc-file')).toHaveText('hello.mfe.json');
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');

    // The file came with its handle: Save writes it in place, no picker.
    await page.getByTestId('creator-new').click();
    await closeEditor(page);
    await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    const written = JSON.parse(await readOpfs(page, ['Projects', 'hello.mfe.json'])) as {
      formulas: unknown[];
    };
    expect(written.formulas).toHaveLength(formulasOf(hello) + 1);

    // After a reload the folder is still synced (its handle is kept) and the open file marked.
    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    await openProjects(page);
    await expect(entries).toHaveCount(2);
    await expect(entries.filter({ hasText: nameOf(hello) })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(entries.filter({ hasText: nameOf(hello) })).toContainText(
      `${formulasOf(hello) + 1} formulas`,
    );
    expect(
      await page.evaluate(() => (window as unknown as { __dirPicks: number }).__dirPicks),
    ).toBe(0);
    await page.getByTestId('projects-close').click();
    await expect(page.getByTestId('projects-dialog')).toBeHidden();
  });

  test('a project with font text is listed with the text drawn, and opens drawn, from its file alone', async ({
    page,
  }) => {
    // A text shaped on some other machine, saved as the app saves it: the file carries its
    // geometry. This browser has never seen it, and no companion runs.
    const artifact = validateTextGeometryArtifact(textGeometry('Title'));
    const payload = new Blob([JSON.stringify(artifact)]);
    const geometry = {
      contentHash: await hashBlob(payload),
      byteLength: payload.size,
      key: artifact.key,
      basisKey: artifact.basisKey,
    };
    const project = createEmptyProject('Titles');
    project.formulas.push(
      createTextFormula({
        name: 'title',
        source: 'Title',
        geometry,
        snapshot: toSnapshot(textArtifactRender(artifact)),
      }),
    );
    const file = serializeProject(project, { [geometry.contentHash]: artifact });

    await stubDirectoryPicker(page);
    await startPage(page);
    await writeOpfs(page, ['Projects', 'titles.mfe.json'], file);
    await page.keyboard.press('ControlOrMeta+o');
    await page.keyboard.press(SYNC_FOLDER_KEYS);
    const entry = page.getByTestId('projects-entry');
    await expect(entry).toHaveCount(1);
    // One path per glyph of "Title", from the geometry inside the file.
    await expect(entry.locator('.formula-thumb svg path')).toHaveCount(5);

    await entry.click();
    await expect(page.getByTestId('projects-dialog')).toBeHidden();
    await expect(page.getByTestId('notice')).toHaveCount(0);
    const drawn = () =>
      page.evaluate(() => {
        const mfe = (window as MfeWindow).__mfe!;
        const [formula] = mfe.useProjectStore.getState().project.formulas;
        const entry = mfe.useRenderStore.getState().entries[formula!.id] as
          | { status: string; resolved?: { render: { backend: string; glyphs: unknown[] } } }
          | undefined;
        const render = entry?.resolved?.render;
        return `${entry?.status}: ${render?.backend} ${render?.glyphs.length}`;
      });
    await expect.poll(drawn).toBe('ok: pango 5');
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    // Saved again, the file still carries the geometry, in the same bytes.
    await page.getByTestId('project-rename').click();
    await page.getByTestId('project-rename-input').fill('Titles again');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    const written = await readOpfs(page, ['Projects', 'titles.mfe.json']);
    expect(written).toContain(`"${geometry.contentHash}": ${JSON.stringify(artifact)}\n`);
    expect(JSON.parse(written).meta.name).toBe('Titles again');
  });

  test('other browsers: Sync folder takes a snapshot through a directory input; Save downloads', async ({
    page,
  }) => {
    await forceFallbackFilePaths(page);
    const dir = test.info().outputPath('Projects');
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'hello.mfe.json'), hello);
    writeFileSync(join(dir, 'notes.json'), '{}');
    writeFileSync(join(dir, 'sub', 'nested.mfe.json'), oneToMany);
    await startPage(page);

    // An empty project offers Sync folder in the Creator; once synced, the Projects dialog.
    await expect(page.getByTestId('creator-projects')).toHaveCount(0);
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('creator-sync-folder').click();
    await (await chooser).setFiles(dir);
    await expect(page.getByTestId('creator-sync-folder')).toHaveCount(0);
    await page.getByTestId('creator-projects').click();
    await expect(page.getByTestId('projects-dialog')).toBeVisible();
    const entries = page.getByTestId('projects-entry');
    await expect(entries).toHaveCount(1);
    await expect(page.getByTestId('projects-folder')).toContainText('Projects, as of');
    await expect(page.getByTestId('projects-skipped')).toHaveText(
      'One other .json file in the folder is not a project.',
    );

    await entries.first().click();
    expect((await getProject(page)).meta.name).toBe(nameOf(hello));
    await expect(page.getByTestId('doc-file')).toHaveText('hello.mfe.json');

    // The snapshot is kept across a reload, and the open file is marked.
    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    await openProjects(page);
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toHaveAttribute('aria-current', 'true');
    await page.getByTestId('projects-close').click();

    // Without handles, Save is a download (named after the project, as the browser decides).
    const download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+s');
    expect((await download).suggestedFilename()).toMatch(/\.mfe\.json$/);
  });

  test('"Other file…" is the browser’s own picker; Escape closes the dialog; Ctrl+Shift+S syncs', async ({
    page,
  }) => {
    await forceFallbackFilePaths(page);
    await startPage(page);
    await openProjects(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('projects-dialog')).toBeHidden();

    // Outside any dialog, Ctrl+Shift+S is the folder chooser (a directory input here).
    const folderChooser = page.waitForEvent('filechooser');
    await page.keyboard.press(SYNC_FOLDER_KEYS);
    expect(await (await folderChooser).element().getAttribute('webkitdirectory')).not.toBeNull();

    await openProjects(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('projects-other').click();
    await expect(page.getByTestId('projects-dialog')).toBeHidden();
    await (
      await chooser
    ).setFiles({
      name: 'picked.mfe.json',
      mimeType: 'application/json',
      buffer: Buffer.from(oneToMany),
    });
    await expect(page.getByTestId('doc-file')).toHaveText('picked.mfe.json');
    expect((await getProject(page)).meta.name).toBe(nameOf(oneToMany));
  });
});
