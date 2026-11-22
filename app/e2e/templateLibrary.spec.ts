import { expect, test, type Locator, type Page } from './test';
import { readFileSync } from 'node:fs';
import {
  getProject,
  holdToConfirm,
  openWithProject,
  SYNC_FOLDER_KEYS,
  type MfeWindow,
} from './helpers';
import { relationProject } from './relationsHelpers';

/* The user's own templates and the favourites (D121): stars, copies of the editor's templates,
 * the file they are exported to and imported from, and the copy kept in the synced folder. */
const STORAGE_KEY = 'mfe.templates.v1';

interface StoredLibrary {
  format: string;
  version: number;
  templates: { id: string; name: string; latex: string; packages: string[]; modified: number }[];
  favorites: string[];
}

async function openTemplates(page: Page, view: 'default' | 'mine' | 'favorites'): Promise<void> {
  await page.getByTestId('creator-tab-templates').click();
  await page.getByTestId(`templates-open-${view}`).click();
  await expect(page.getByTestId('template-browser')).toHaveAttribute('data-view', view);
}

const closeTemplates = (page: Page) => page.getByTestId('templates-dialog-close').click();

const card = (page: Page, id: string) => page.locator(`[data-template-id="${id}"]`);
const names = (page: Page) => page.locator('.template-name');

/** What the browser keeps of the library. */
const stored = (page: Page): Promise<StoredLibrary | null> =>
  page.evaluate((key) => {
    const text = window.localStorage.getItem(key);
    return text === null ? null : (JSON.parse(text) as StoredLibrary);
  }, STORAGE_KEY);

/** A copy of a default template among the user's, through its "Save a copy". */
async function saveCopy(page: Page, id: string): Promise<void> {
  await card(page, id).scrollIntoViewIfNeeded();
  await card(page, id).getByTestId('template-copy').click();
}

test('a star keeps a template among the favorites, over a reload too', async ({ page }) => {
  await openWithProject(page, relationProject([]));
  await openTemplates(page, 'default');
  const power = card(page, 'algebra-product-of-powers');
  await power.scrollIntoViewIfNeeded();
  const star = power.getByTestId('template-star');
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await card(page, 'algebra-square-of-a-sum').getByTestId('template-star').click();
  await expect
    .poll(async () => (await stored(page))?.favorites)
    .toEqual(['algebra-product-of-powers', 'algebra-square-of-a-sum']);
  await closeTemplates(page);
  await expect(page.getByTestId('templates-open-favorites')).toContainText(
    '2 templates with a star',
  );

  // Favorites lists them as the library does, each ready to use; its star takes one out.
  await page.getByTestId('templates-open-favorites').click();
  await expect(page.getByTestId('templates-dialog').getByRole('heading')).toHaveText('Favorites');
  await expect(names(page)).toHaveText(['Square of a sum', 'Product of powers']);
  await expect(page.getByTestId('template-copy')).toHaveCount(0);
  await card(page, 'algebra-square-of-a-sum').getByTestId('template-star').click();
  await expect(names(page)).toHaveText(['Product of powers']);
  await card(page, 'algebra-product-of-powers').getByTestId('template-use').click();
  await expect(page.getByTestId('use-template-value-1')).toHaveValue('a');
  await page.keyboard.press('Escape');
  await closeTemplates(page);

  // The browser keeps them: a reload changes nothing.
  await page.reload();
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await page.getByTestId('creator-tab-templates').click();
  await expect(page.getByTestId('templates-open-favorites')).toContainText(
    '1 template with a star',
  );
  await page.getByTestId('templates-open-favorites').click();
  await expect(names(page)).toHaveText(['Product of powers']);
  await card(page, 'algebra-product-of-powers').getByTestId('template-star').click();
  await expect(page.getByTestId('template-empty')).toContainText('No favorites yet');
});

test('Save a copy puts a default template among My templates, where it is duplicated, starred, used and deleted', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  await openTemplates(page, 'mine');
  await expect(page.getByTestId('template-empty')).toContainText(
    'You have no templates of your own yet',
  );
  await expect(page.getByTestId('templates-export')).toBeDisabled();
  await expect(page.getByTestId('template-storage')).toContainText('Kept in this browser');
  await closeTemplates(page);

  await page.getByTestId('templates-open-default').click();
  await saveCopy(page, 'algebra-product-of-powers');
  const notice = page.getByTestId('notice').filter({ hasText: 'Product of powers' });
  await expect(notice).toContainText('is now among your templates');
  // The default templates stay as they were, and on screen; the notice goes to the copy.
  await expect(page.getByTestId('template-item')).toHaveCount(257);
  await notice.getByTestId('notice-action').click();
  await expect(page.getByTestId('template-browser')).toHaveAttribute('data-view', 'mine');
  const mine = page.getByTestId('template-item');
  await expect(mine).toHaveCount(1);
  await expect(mine).toHaveAttribute('data-origin', 'user');
  await expect(names(page)).toHaveText(['Product of powers']);
  await expect(mine.getByTestId('template-thumb')).toHaveAttribute('data-state', 'ready');
  const saved = (await stored(page))!;
  expect(saved).toMatchObject({ format: 'mfe-templates', version: 1 });
  expect(saved.templates[0]).toMatchObject({
    name: 'Product of powers',
    latex: '#1^{#2}\\cdot #1^{#3}=#1^{#2+#3}',
  });
  expect(saved.templates[0]!.id).toMatch(/^tpl_[0-9a-f]{24}$/);

  // A duplicate, named after it; a star on it; the copy is used like any template.
  await mine.getByTestId('template-duplicate').click();
  await expect(mine).toHaveCount(2);
  await expect(names(page)).toHaveText(['Product of powers', 'Product of powers copy']);
  await mine.last().getByTestId('template-star').click();
  await expect(mine.last().getByTestId('template-star')).toHaveAttribute('aria-pressed', 'true');
  await mine.last().getByTestId('template-use').click();
  await page.getByTestId('use-template-value-1').fill('x');
  await page.getByTestId('use-template-create').click();
  await expect(page.getByTestId('templates-dialog')).toHaveCount(0);
  await expect(page.getByTestId('formula-item').last()).toHaveAttribute(
    'data-name',
    'product_of_powers_copy',
  );

  // Deleted for good, after its button was held; its star goes with it.
  await openTemplates(page, 'mine');
  await mine.last().getByTestId('template-delete').click();
  await expect(page.getByTestId('dialog')).toContainText(
    'Delete the template “Product of powers copy”?',
  );
  await holdToConfirm(page);
  await expect(mine).toHaveCount(1);
  await expect.poll(async () => (await stored(page))?.favorites).toEqual([]);
  await closeTemplates(page);
  await expect(page.getByTestId('templates-open-mine')).toContainText('1 template of your own');
});

test('Create template writes a template with placeholders; Edit changes it; both are used like any other', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  await page.getByTestId('creator-tab-templates').click();
  await page.getByTestId('templates-open-create').click();
  const form = page.getByTestId('template-form');
  await expect(form.getByRole('heading')).toHaveText('Create template');
  await expect(page.getByTestId('template-form-name')).toBeFocused();
  await expect(page.getByTestId('template-form-save')).toBeDisabled();
  await expect(page.getByTestId('template-form-problem')).toHaveText('Give the template a name.');

  await page.getByTestId('template-form-name').fill('Commutative sum');
  await page.getByTestId('template-form-category').fill('My course');
  await page.getByTestId('template-form-description').fill('The order does not matter.');
  // A row for each number, as the LaTeX is written.
  await page.getByTestId('template-form-latex').fill('{#1}+{#2}={#2}+{#1}');
  await expect(page.getByTestId('template-form-problem')).toHaveText('Give #1 a default value.');
  await page.getByTestId('template-form-value-1').fill('a');
  await page.getByTestId('template-form-label-1').fill('first term');
  await page.getByTestId('template-form-value-2').fill('b');
  await expect(page.getByTestId('template-form-problem')).toHaveText('');
  const preview = page.getByTestId('template-form-preview');
  await expect(preview).toHaveAttribute('data-state', 'ready');
  await expect(preview.locator('svg')).toHaveAttribute('aria-label', '{a}+{b}={b}+{a}');

  // Saved from the tab, it is shown where it now is: among the user's templates.
  await page.getByTestId('template-form-save').click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('template-browser')).toHaveAttribute('data-view', 'mine');
  const mine = page.getByTestId('template-item');
  await expect(mine).toHaveCount(1);
  await expect(names(page)).toHaveText(['Commutative sum']);
  await expect(page.locator('.template-heading')).toHaveText('My course');
  await expect(mine.getByTestId('template-thumb')).toHaveAttribute('data-state', 'ready');
  expect((await stored(page))!.templates[0]).toMatchObject({
    name: 'Commutative sum',
    latex: '{#1}+{#2}={#2}+{#1}',
  });

  // Used: its placeholders are asked for, with the label it was given.
  await mine.getByTestId('template-use').click();
  await expect(page.getByTestId('use-template').getByLabel('#1 first term')).toHaveValue('a');
  await page.getByTestId('use-template-value-1').fill('x');
  await page.getByTestId('use-template-value-2').fill('y');
  await page.getByTestId('use-template-create').click();
  await expect(page.getByTestId('formula-item').last()).toHaveAttribute(
    'data-name',
    'commutative_sum',
  );
  expect((await getProject(page)).formulas.at(-1)).toMatchObject({ source: '{x}+{y}={y}+{x}' });

  // Edit opens the form over the list, with what the template has; a third term.
  await openTemplates(page, 'mine');
  await mine.getByTestId('template-edit').click();
  await expect(form.getByRole('heading')).toHaveText('Edit template: Commutative sum');
  await expect(page.getByTestId('template-form-latex')).toHaveValue('{#1}+{#2}={#2}+{#1}');
  await expect(page.getByTestId('template-form-label-1')).toHaveValue('first term');
  await page.getByTestId('template-form-latex').fill('{#1}+{#2}+{#3}');
  await page.getByTestId('template-form-value-3').fill('c');
  await page.getByTestId('template-form-name').fill('Sum of three');
  await page.getByTestId('template-form-name').press('Enter');
  await expect(form).toHaveCount(0);
  await expect(names(page)).toHaveText(['Sum of three']);
  await expect(mine).toHaveAttribute('title', '{a}+{b}+{c}');
  expect((await stored(page))!.templates).toHaveLength(1);

  // New template, from the list: what was written is not thrown away without asking.
  await page.getByTestId('templates-new').click();
  await page.getByTestId('template-form-latex').fill('x^2');
  await page.keyboard.press('Escape');
  const question = page.getByTestId('dialog');
  await expect(question).toContainText('Discard this template?');
  await page.getByTestId('dialog-keep').click();
  await expect(page.getByTestId('template-form-latex')).toHaveValue('x^2');
  await page.getByTestId('template-form-cancel').click();
  await page.getByTestId('dialog-discard').click();
  await expect(form).toHaveCount(0);
  await expect(mine).toHaveCount(1);
  await expect(page.getByTestId('templates-dialog')).toBeVisible();
});

test('Export downloads the templates as a file; Import reads one and asks about the ones that changed', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  await openTemplates(page, 'default');
  await saveCopy(page, 'algebra-product-of-powers');
  await saveCopy(page, 'algebra-square-of-a-sum');
  await expect.poll(async () => (await stored(page))?.templates.length).toBe(2);
  await closeTemplates(page);
  await page.getByTestId('templates-open-mine').click();
  const mine = page.getByTestId('template-item');
  await expect(mine).toHaveCount(2);

  // One ticked: the export is of that one.
  await mine.first().getByTestId('template-select').check();
  await expect(page.getByTestId('templates-export')).toHaveText('Export 1 selected');
  let download = page.waitForEvent('download');
  await page.getByTestId('templates-export').click();
  const one = await download;
  expect(one.suggestedFilename()).toBe('mfe-templates.json');
  const oneFile = JSON.parse(readFileSync(await one.path(), 'utf8')) as StoredLibrary;
  expect(oneFile.templates.map((t) => t.name)).toEqual(['Product of powers']);

  // None ticked: all of them.
  await mine.first().getByTestId('template-select').uncheck();
  await expect(page.getByTestId('templates-export')).toHaveText('Export all');
  download = page.waitForEvent('download');
  await page.getByTestId('templates-export').click();
  const all = await download;
  const file = JSON.parse(readFileSync(await all.path(), 'utf8')) as StoredLibrary;
  expect(file).toMatchObject({ format: 'mfe-templates', version: 1 });
  expect(file.templates.map((t) => t.name)).toEqual(['Product of powers', 'Square of a sum']);

  // The file read back in a library that lost one template and changed the other.
  await mine.last().getByTestId('template-delete').click();
  await holdToConfirm(page);
  await expect(mine).toHaveCount(1);
  const changed: StoredLibrary = {
    ...file,
    templates: [
      { ...file.templates[0]!, name: 'Powers, from the file' },
      file.templates[1]!,
      { ...file.templates[1]!, id: 'another', name: 'A third one' },
    ],
    favorites: ['another'],
  };
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('templates-import').click();
  await (
    await chooser
  ).setFiles({
    name: 'course.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  const question = page.getByTestId('dialog');
  await expect(question).toContainText('Some templates are already in your library');
  await expect(question.getByTestId('dialog-details')).toHaveText('Powers, from the file');
  await page.getByTestId('dialog-copy').click();
  await expect(mine).toHaveCount(4);
  await expect(names(page)).toHaveText([
    'Product of powers',
    'Square of a sum',
    'A third one',
    'Powers, from the file copy',
  ]);
  await expect(
    page.getByTestId('notice').filter({ hasText: 'Imported course.json' }),
  ).toContainText('3 templates added, 1 favorite added.');
  await expect(card(page, 'another').getByTestId('template-star')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // A file that is not a templates file is refused, and nothing changes.
  const again = page.waitForEvent('filechooser');
  await page.getByTestId('templates-import').click();
  await (
    await again
  ).setFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(relationProject([])),
  });
  await expect(
    page.getByTestId('notice').filter({ hasText: 'Could not import project.json' }),
  ).toContainText('The file is not a templates file.');
  await expect(mine).toHaveCount(4);
});

test('with a synced folder the templates are also its templates/templates.json, read back when the folder is listed', async ({
  page,
}) => {
  // Handles of the origin-private file system stand in for the folder picker's: they are kept
  // over a reload and need no permission.
  await page.addInitScript(() => {
    const w = window as unknown as { showDirectoryPicker: () => Promise<unknown> };
    w.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle('Course', { create: true });
    };
  });
  const readFolderFile = () =>
    page.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const course = await root.getDirectoryHandle('Course');
        const folder = await course.getDirectoryHandle('templates');
        const file = await (await folder.getFileHandle('templates.json')).getFile();
        return JSON.parse(await file.text()) as StoredLibrary;
      } catch {
        return null;
      }
    });

  await openWithProject(page, relationProject([]));
  await page.keyboard.press('ControlOrMeta+o');
  await page.keyboard.press(SYNC_FOLDER_KEYS);
  await expect(page.getByTestId('projects-folder')).toHaveText('Folder Course');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('projects-dialog')).toHaveCount(0);
  expect(await readFolderFile()).toBeNull(); // nothing to keep yet: no file is made
  await openTemplates(page, 'mine');
  await expect(page.getByTestId('template-storage')).toHaveText(
    'They will be kept in this browser and in templates/templates.json of the folder “Course”.',
  );
  await closeTemplates(page);

  await page.getByTestId('templates-open-default').click();
  await saveCopy(page, 'algebra-product-of-powers');
  await expect.poll(async () => (await readFolderFile())?.templates.length).toBe(1);
  await closeTemplates(page);
  await page.getByTestId('templates-open-mine').click();
  const note = page.getByTestId('template-storage');
  await expect(note).toHaveAttribute('data-status', 'synced');
  await expect(note).toContainText(
    'Kept in this browser and in templates/templates.json of the folder “Course”.',
  );
  // Every change reaches the file: a star.
  await page.getByTestId('template-star').click();
  await expect.poll(async () => (await readFolderFile())?.favorites.length).toBe(1);

  // The folder's file gains a template elsewhere (another machine on the same folder); the
  // library takes it in when the folder is listed again — here, at the next start.
  const folder = (await readFolderFile())!;
  const added = {
    ...folder,
    templates: [
      { ...folder.templates[0]!, name: 'Powers, edited elsewhere', modified: Date.now() + 60_000 },
      { ...folder.templates[0]!, id: 'elsewhere', name: 'Made elsewhere' },
    ],
  };
  await page.evaluate(async (text) => {
    const root = await navigator.storage.getDirectory();
    const course = await root.getDirectoryHandle('Course');
    const dir = await course.getDirectoryHandle('templates');
    const writable = await (await dir.getFileHandle('templates.json')).createWritable();
    await writable.write(text);
    await writable.close();
  }, JSON.stringify(added));
  await page.reload();
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await page.getByTestId('creator-tab-templates').click();
  await expect(page.getByTestId('templates-open-mine')).toContainText('2 templates of your own');
  await page.getByTestId('templates-open-mine').click();
  await expect(names(page)).toHaveText(['Powers, edited elsewhere', 'Made elsewhere']);
  await expect(page.getByTestId('template-storage')).toHaveAttribute('data-status', 'synced');
});

/** The paths a thumbnail, or the form's preview, draws. */
const drawn = (scope: Locator) =>
  scope.locator('svg path').evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));

test('the card of a template is drawn again when only its packages change', async ({ page }) => {
  await openWithProject(page, relationProject([]));
  await page.getByTestId('creator-tab-templates').click();
  await page.getByTestId('templates-open-create').click();
  const form = page.getByTestId('template-form');
  await form.getByTestId('template-form-name').fill('Bra and ket');
  // Both packages draw it, each its own way: physics takes two arguments, braket one.
  await form.getByTestId('template-form-latex').fill('\\braket{x}{y}');
  await form.getByTestId('template-form-packages').click();
  await form.getByTestId('package-quick-physics').click();
  const preview = form.getByTestId('template-form-preview');
  await expect(preview).toHaveAttribute('data-state', 'ready');
  await form.getByTestId('template-form-save').click();
  await expect(form).toHaveCount(0);
  const mine = page.getByTestId('template-item');
  await expect(mine).toHaveCount(1);
  const thumb = mine.getByTestId('template-thumb');
  await expect(thumb).toHaveAttribute('data-state', 'ready');
  const before = await drawn(thumb);

  // Edit: the same LaTeX, with braket in the place of physics.
  await mine.getByTestId('template-edit').click();
  await form.getByTestId('template-form-packages').click();
  await form.getByTestId('package-remove-physics').click();
  await form.getByTestId('package-search').fill('braket');
  await form.getByTestId('package-add').click();
  await expect.poll(() => drawn(preview)).not.toEqual(before);
  await expect(preview).toHaveAttribute('data-state', 'ready');
  const expected = await drawn(preview);
  await form.getByTestId('template-form-save').click();
  await expect(form).toHaveCount(0);
  expect((await stored(page))!.templates[0]!.packages).toEqual(['braket']);

  // The card that was there shows what the template is now, not what it was.
  await expect(thumb).toHaveAttribute('data-state', 'ready');
  await expect.poll(() => drawn(thumb)).toEqual(expected);
});
