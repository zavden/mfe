import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import { expectAppShown, openWithProject, someTextField, undo, type MfeWindow } from './helpers';
import { PROJECT_LICENSE } from '../build/projectLicense';
import { FORMAT_VERSION } from '../src/model';
import { startApp } from './creatorHelpers';
import { relationProject } from './relationsHelpers';

const COMPANION_URL = 'http://127.0.0.1:7799/';

test('loads with no console errors and shows all areas', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    // The browser logs every refused health check of the optional companion; that is expected.
    if (message.location().url.startsWith(COMPANION_URL)) return;
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto('/');
  await expectAppShown(page);
  expect(problems).toEqual([]);
});

test('preview frame keeps 16:9 inside the panel', async ({ page }) => {
  await page.goto('/');
  const frame = await page.getByTestId('preview-frame').boundingBox();
  const panel = await page.getByTestId('panel-preview').boundingBox();
  expect(frame).not.toBeNull();
  expect(panel).not.toBeNull();
  if (!frame || !panel) return;
  expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1);
  expect(frame.width).toBeLessThanOrEqual(panel.width);
  expect(frame.height).toBeLessThanOrEqual(panel.height);
});

test('page does not scroll', async ({ page }) => {
  await page.goto('/');
  // An empty page does not scroll either: the layout is measured once the app is on screen.
  await expectAppShown(page);
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(0);
  expect(overflow.y).toBeLessThanOrEqual(0);
});

test('theme toggle changes data-theme and survives a reload', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('View → Theme → System follows the OS colour scheme and survives a reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark'); // dark until asked to follow the OS

  await page.getByTestId('menu-view').click();
  await page.getByTestId('menu-item-view-theme').hover();
  await expect(page.getByTestId('menu-item-view-theme-dark')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByTestId('menu-item-view-theme-system').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('menu-view').click();
  await page.getByTestId('menu-item-view-theme').hover();
  await expect(page.getByTestId('menu-item-view-theme-system')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');

  // The bar's button makes a choice of its own: the OS scheme is no longer followed.
  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => window.localStorage.getItem('mfe.theme'))).toBe('dark');
});

test('File menu opens on click and closes on Escape', async ({ page }) => {
  await page.goto('/');
  const file = page.getByTestId('menu-file');
  await expect(file).toHaveAttribute('aria-expanded', 'false');

  await file.click();
  await expect(file).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'New' })).toBeEnabled();

  await page.keyboard.press('Escape');
  await expect(file).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('panel layout is persisted after resizing', async ({ page }) => {
  await page.goto('/');
  const timeline = page.getByTestId('panel-timeline');
  const before = await timeline.boundingBox();
  const separator = page.getByRole('separator').last();
  const box = await separator.boundingBox();
  expect(before && box).toBeTruthy();
  if (!before || !box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 5 });
  await page.mouse.up();

  const resized = await timeline.boundingBox();
  expect(resized?.height).toBeGreaterThan(before.height + 50);

  await page.reload();
  const after = await page.getByTestId('panel-timeline').boundingBox();
  expect(Math.abs((after?.height ?? 0) - (resized?.height ?? 0))).toBeLessThan(3);
});

test('panels fold to their title bar: header button, View ▸ Panels, and a reload keeps it', async ({
  page,
}) => {
  await page.goto('/');
  const creator = page.getByTestId('panel-creator');
  const wide = (await creator.boundingBox())!.width;
  await page.getByTestId('panel-fold-creator').click();
  await expect(creator).toHaveAttribute('data-folded', 'true');
  expect((await creator.boundingBox())!.width).toBeLessThan(40);
  await expect(page.getByTestId('creator-new')).toBeHidden();
  // View ▸ Panels ▸ Creator brings it back to its size.
  await page.getByTestId('menu-view').click();
  await page.getByTestId('menu-item-view-panels').hover();
  await expect(page.getByTestId('menu-item-view-panels-creator')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  // Each panel folds on its own: three toggles, not one choice among three.
  for (const id of ['creator', 'animations', 'timeline']) {
    await expect(page.getByTestId(`menu-item-view-panels-${id}`)).toHaveAttribute(
      'role',
      'menuitemcheckbox',
    );
  }
  await page.getByTestId('menu-item-view-panels-creator').click();
  await expect(creator).toHaveAttribute('data-folded', 'false');
  expect((await creator.boundingBox())!.width).toBeGreaterThan(wide - 3);
  await expect(page.getByTestId('creator-new')).toBeVisible();
  // A double-click on the Timeline's title folds it; the fold survives a reload.
  const timeline = page.getByTestId('panel-timeline');
  await timeline.locator('.panel-title').dblclick();
  await expect(timeline).toHaveAttribute('data-folded', 'true');
  await page.reload();
  await expect(page.getByTestId('panel-timeline')).toHaveAttribute('data-folded', 'true');
  expect((await page.getByTestId('panel-timeline').boundingBox())!.height).toBeLessThan(40);
  await page.getByTestId('panel-fold-timeline').click();
  await expect(page.getByTestId('panel-timeline')).toHaveAttribute('data-folded', 'false');
});

test('C folds and unfolds the Creator and A the Animations panel; in a field they are letters', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  const creator = page.getByTestId('panel-creator');
  const animations = page.getByTestId('panel-animations');
  // Out of every field: the title of the Preview.
  await page.getByTestId('panel-preview').locator('.panel-title').click();
  await page.keyboard.press('c');
  await expect(creator).toHaveAttribute('data-folded', 'true');
  await expect(animations).toHaveAttribute('data-folded', 'false');
  await page.keyboard.press('a');
  await expect(animations).toHaveAttribute('data-folded', 'true');
  await page.keyboard.press('c');
  await expect(creator).toHaveAttribute('data-folded', 'false');
  await page.keyboard.press('a');
  await expect(animations).toHaveAttribute('data-folded', 'false');
  // Held, the key acts once: its repeats do not fold and unfold in turn.
  await page.keyboard.down('c');
  await page.keyboard.down('c');
  await page.keyboard.down('c');
  await page.keyboard.up('c');
  await expect(creator).toHaveAttribute('data-folded', 'true');
  await page.keyboard.press('c');
  await expect(creator).toHaveAttribute('data-folded', 'false');
  // With a modifier they are other commands: Ctrl/⌘+A selects, Shift+A is nothing.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Shift+A');
  await expect(animations).toHaveAttribute('data-folded', 'false');
  await expect(creator).toHaveAttribute('data-folded', 'false');
  // The fold buttons and View ▸ Panels name the keys.
  await expect(page.getByTestId('panel-fold-creator')).toHaveAttribute('title', /\(C; /);
  await expect(page.getByTestId('panel-fold-animations')).toHaveAttribute('title', /\(A; /);
  await page.getByTestId('menu-view').click();
  await page.getByTestId('menu-item-view-panels').hover();
  await expect(
    page.getByTestId('menu-item-view-panels-creator').locator('.menu-shortcut'),
  ).toHaveText('C');
  await expect(
    page.getByTestId('menu-item-view-panels-animations').locator('.menu-shortcut'),
  ).toHaveText('A');
  // In an open menu a letter is the menu's: nothing folds under it.
  await page.keyboard.press('c');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(creator).toHaveAttribute('data-folded', 'false');
  // In a field they are letters.
  const field = await someTextField(page);
  await field.fill('');
  await field.pressSequentially('ca');
  await expect(field).toHaveValue('ca');
  await expect(creator).toHaveAttribute('data-folded', 'false');
  await expect(animations).toHaveAttribute('data-folded', 'false');
});

/** The browser dressed as the system `platform` names, before the page loads: the sheet writes
 * the keys as that system does, and has the keys it has there. */
const dressAs = (page: Page, platform: 'Win32' | 'MacIntel') =>
  page.addInitScript((name) => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => name });
  }, platform);

test('Help → Keyboard shortcuts… and the ? key show the shortcut sheet', async ({ page }) => {
  // The keys as Windows and Linux have them, wherever the suite runs: a Mac's are below.
  await dressAs(page, 'Win32');
  await page.goto('/');
  await page.getByTestId('menu-help').click();
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('caption')).toHaveText([
    'Files and history',
    'Playback',
    'Editing',
    'Preview and timeline',
    'Dialogs and help',
  ]);
  // The keys are drawn as caps, one per key; screen readers get the keys as written.
  const duplicate = dialog.getByRole('rowheader', { name: 'Ctrl/⌘+D' });
  await expect(duplicate).toBeVisible();
  await expect(duplicate.locator('kbd')).toHaveText(['Ctrl/⌘', 'D']);
  await expect(dialog.locator('kbd', { hasText: /^Space$/ }).first()).toBeVisible();
  const redo = dialog.getByRole('rowheader', { name: 'Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y' });
  await expect(redo.locator('.help-keyline')).toHaveCount(2);
  await expect(redo.locator('kbd')).toHaveText([
    'Ctrl/⌘',
    'Z',
    'Ctrl/⌘',
    'Shift',
    'Z',
    'Ctrl',
    'Y',
  ]);
  // Where a key works, as the handler has it (shortcuts.ts): a text field with the focus and an
  // open dialog keep the file keys, Ctrl/⌘+A and the grid's (the Projects dialog takes Sync
  // folder itself), and Ctrl+Y redoes where the command key is Ctrl.
  const row = (keys: string) =>
    dialog.locator('tr', { has: page.getByRole('rowheader', { name: keys, exact: true }) });
  for (const keys of ['Ctrl/⌘+Alt+N, Ctrl/⌘+O', 'Ctrl/⌘+S, Ctrl/⌘+Alt+S', 'Ctrl/⌘+A', "Ctrl/⌘+'"]) {
    await expect(row(keys).locator('.help-where')).toHaveText('outside text fields and dialogs');
  }
  await expect(row('Ctrl/⌘+Shift+S').locator('.help-where')).toHaveText(
    'outside text fields and dialogs; anywhere in the Projects dialog',
  );
  // The modes of the preview that take keys of their own have a row each (audit B5-10).
  for (const [keys, mode] of [
    ['←/→, ↑/↓ (Shift: 10 px); Delete / Backspace; Enter, Esc', 'Edit path'],
    ['Delete / Backspace; Enter; Esc', 'Edit curve'],
    ['Alt + click; Esc', 'Add line'],
  ] as const) {
    await expect(row(keys).locator('.help-where')).toHaveText(`preview, ${mode}`);
  }
  await expect(row('Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y').locator('.help-what')).toHaveText(
    'Undo; redo (Ctrl+Y on Windows and Linux only; also in immediate-edit dialogs); cancel an active gesture first',
  );
  await expect(page.getByTestId('shortcuts-clicks')).toContainText('Shift+click selects a range');
  // Readable at 1280×800 without scrolling sideways.
  await page.setViewportSize({ width: 1280, height: 800 });
  const body = dialog.locator('.modal-body');
  expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // "?" opens it outside text fields; typed into a field it is just a character.
  await page.keyboard.press('Shift+?');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  const search = await someTextField(page);
  await search.click();
  await page.keyboard.type('?');
  await expect(search).toHaveValue('?');
  await expect(dialog).toHaveCount(0);
});

test('on a Mac the shortcut sheet writes the keys as its menus do, and has the keys of a Mac', async ({
  page,
}) => {
  await dressAs(page, 'MacIntel');
  await page.goto('/');
  await page.getByTestId('menu-help').click();
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  const header = (name: string) => dialog.getByRole('rowheader', { name, exact: true });
  const row = (name: string) =>
    dialog.locator('tr', { has: page.getByRole('rowheader', { name, exact: true }) });
  // A cap per key, the symbols of a Mac's keyboard, with nothing between the keys pressed
  // together; a screen reader gets the keys by their names.
  await expect(header('Command-D').locator('kbd')).toHaveText(['⌘', 'D']);
  await expect(header('Command-D').locator('.help-plus')).toHaveCount(0);
  // The modifiers in the order of a Mac's menus: Option before Command, Shift before Command.
  await expect(header('Option-Command-N, Command-O').locator('kbd')).toHaveText([
    '⌥',
    '⌘',
    'N',
    '⌘',
    'O',
  ]);
  await expect(header('Option-Shift-G').locator('kbd')).toHaveText(['⌥', '⇧', 'G']);
  // The keys that are others on a Mac. Save As is ⇧⌘S there, as in every app, and Sync folder
  // has the key it leaves; Distribute has the Control key itself, since ⌥⌘H is the system's.
  await expect(header('Command-S, Shift-Command-S').locator('kbd')).toHaveText([
    '⌘',
    'S',
    '⇧',
    '⌘',
    'S',
  ]);
  await expect(row('Command-S, Shift-Command-S').locator('.help-what')).toHaveText('Save, Save As');
  await expect(row('Option-Command-S').locator('.help-what')).toHaveText(
    'Sync folder (the project library)',
  );
  await expect(header('Control-Option-H / Control-Option-V').locator('kbd')).toHaveText([
    '⌃',
    '⌥',
    'H',
    '⌃',
    '⌥',
    'V',
  ]);
  // ⌘Y is not redo on a Mac: the row has neither the key nor the words about it.
  const redo = header('Command-Z; Shift-Command-Z');
  await expect(redo.locator('.help-keyline')).toHaveCount(2);
  await expect(redo.locator('kbd')).toHaveText(['⌘', 'Z', '⇧', '⌘', 'Z']);
  await expect(row('Command-Z; Shift-Command-Z').locator('.help-what')).toHaveText(
    'Undo; redo (also in immediate-edit dialogs); cancel an active gesture first',
  );
  // A key alone, the note in brackets, Return, and a gesture after its key, with its "+".
  await expect(header('Shift (held)').locator('kbd')).toHaveText(['⇧']);
  await expect(header('Option-A / Option-H / Option-D (Shift: to the frame)')).toContainText(
    '(⇧: to the frame)',
  );
  await expect(header('F2; Return').locator('kbd')).toHaveText(['F2', '↩']);
  // The trackpad's pinch is the first way to zoom there, and its scroll the first to pan.
  const pan = header(
    'pinch or Command + wheel; scroll, Option + drag on empty space, or the middle button',
  );
  await expect(pan.locator('kbd')).toHaveText(['⌘', '⌥']);
  await expect(pan.locator('.help-plus')).toHaveCount(2);
  await expect(pan.locator('.help-gesture')).toHaveText([
    'pinch',
    'wheel',
    'scroll',
    'drag on empty space',
    'or the middle button',
  ]);
  // A Mac's keyboard has no Menu key: the rows that open a menu name Shift+F10 alone.
  await expect(header('Return; Shift-F10').locator('kbd')).toHaveText(['↩', '⇧', 'F10']);
  await expect(dialog.locator('kbd', { hasText: /^Menu$/ })).toHaveCount(0);
  // The words name the keys the same way, and so do the clicks.
  await expect(row('Option-G').locator('.help-what')).toContainText(
    '(or ←/→, ↑/↓ and ↩); a compass picks the side; ⇧+wheel sets the reach',
  );
  await expect(page.getByTestId('shortcuts-clicks')).toContainText(
    '⇧+click selects a range, ⌘+click toggles',
  );
  await expect(page.getByTestId('shortcuts-clicks').locator('kbd').first()).toHaveText('⇧');
  // No key is left as the other systems name it.
  const text = await dialog.evaluate((el) => el.textContent ?? '');
  expect(text).not.toMatch(/Ctrl|\bAlt\b|Windows|Linux/);
  // Readable at 1280×800 without scrolling sideways.
  await page.setViewportSize({ width: 1280, height: 800 });
  const body = dialog.locator('.modal-body');
  expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});

test('the project name in the menu bar renames the project in place', async ({ page }) => {
  await startApp(page);
  await page.getByTestId('project-rename').click();
  const input = page.getByTestId('project-rename-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Untitled');
  await input.fill('My scene');
  await input.press('Enter');
  await expect(page.getByTestId('project-name')).toContainText('My scene');
  await expect(page).toHaveTitle(/^• My scene/);
  // Escape takes the edit back; undo takes the rename back.
  await page.getByTestId('project-rename').click();
  await input.fill('Other');
  await input.press('Escape');
  await expect(page.getByTestId('project-name')).toContainText('My scene');
  await expect(input).toHaveCount(0);
  await undo(page);
  await expect(page.getByTestId('project-name')).toContainText('Untitled');
  // The name is what Save suggests for the file.
  await page.getByTestId('project-rename').click();
  await input.fill('Second take');
  await input.press('Enter');
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  expect((await download).suggestedFilename()).toBe('second-take.mfe.json');
});

// As the renames of a track and of a formula do (audit B5-02): the field goes, and the focus goes
// back to the name it came from, not to the page.
for (const key of ['Enter', 'Escape']) {
  test(`${key} on the project name field gives the focus back to the name`, async ({ page }) => {
    await startApp(page);
    await page.getByTestId('project-rename').click();
    const input = page.getByTestId('project-rename-input');
    await expect(input).toBeFocused();
    await input.fill('Renamed');
    await input.press(key);
    await expect(input).toHaveCount(0);
    await expect(page.getByTestId('project-rename')).toBeFocused();
    await expect(page.getByTestId('project-name')).toContainText(
      key === 'Enter' ? 'Renamed' : 'Untitled',
    );
  });
}

test('Tab out of the project name field renames, and the focus goes on with Tab', async ({
  page,
}) => {
  await startApp(page);
  await page.getByTestId('project-rename').click();
  const input = page.getByTestId('project-rename-input');
  await input.fill('Tabbed');
  await input.press('Tab');
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId('project-name')).toContainText('Tabbed');
  // The control after the field took the focus, and keeps it.
  await expect(page.getByTestId('theme-toggle')).toBeFocused();
});

test('Help → About gives the versions and leads to the shortcut sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-help').click();
  await page.getByRole('menuitem', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'About' });
  await expect(about).toBeVisible();
  await expect(about).toContainText('Manim Formula Editor');
  // The app's own version: the one of `app/package.json`.
  const { version } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  await expect(page.getByTestId('about-version')).toHaveText(version);
  await expect(page.getByTestId('about-format')).toHaveText(String(FORMAT_VERSION));
  await expect(page.getByTestId('about-mathjax')).toHaveText(/^3\.\d+\.\d+$/);
  // No companion in the specs.
  await expect(page.getByTestId('about-companion')).toHaveText(/^Not running/);

  await page.getByTestId('about-shortcuts').click();
  await expect(about).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});

test('Help → Third-party licenses lists the components, and its links open the files', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('menu-help').click();
  await page.getByRole('menuitem', { name: 'Third-party licenses…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Third-party licenses' });
  await expect(dialog).toBeVisible();
  const rows = page.getByTestId('licenses-list').locator('tbody tr');
  await expect(rows.filter({ hasText: 'mediabunny' })).toContainText('MPL-2.0');
  await expect(rows.filter({ hasText: 'KaTeX fonts' })).toContainText('OFL-1.1');
  const listed = await rows.locator('th').allTextContents();
  expect(listed.length).toBeGreaterThan(15);

  // Each link opens its file where the link says: the notices name every component listed.
  const open = async (testId: string) => {
    const popup = page.waitForEvent('popup');
    await page.getByTestId(testId).click();
    const tab = await popup;
    await tab.waitForLoadState();
    const text = await tab.locator('body').innerText();
    await tab.close();
    return text;
  };
  const notices = await open('licenses-notices');
  expect(notices).toContain('MANIM FORMULA EDITOR: THIRD-PARTY NOTICES');
  for (const name of listed) expect(notices).toContain(name.split(' · ')[0]!);
  // The project's own licence: the link is its name, and opens the text of the file `LICENSE`.
  await expect(page.getByTestId('licenses-project')).toHaveText(PROJECT_LICENSE.title);
  const license = readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8');
  expect(license.length).toBeGreaterThan(500);
  expect((await open('licenses-project')).trim()).toBe(license.trim());

  // About names the licence and leads here too.
  await page.getByTestId('licenses-close').click();
  await page.getByTestId('menu-help').click();
  await page.getByRole('menuitem', { name: 'About' }).click();
  await expect(page.getByTestId('about-license')).toHaveText(PROJECT_LICENSE.name);
  await page.getByTestId('about-licenses').click();
  await expect(dialog).toBeVisible();
});

test('engine inspector renders \\frac{a}{b} with MathJax', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto('/');
  await page.getByTestId('menu-help').click();
  await page.getByRole('menuitem', { name: 'Engine inspector…' }).click();
  const dialog = page.getByTestId('engine-inspector');
  await expect(dialog).toBeVisible();

  await page.getByTestId('inspector-latex').fill('\\frac{a}{b}');
  // The companion is normally offline here (auto → MathJax); pin MathJax so a companion
  // running on the machine does not change the glyph order.
  await page.getByTestId('inspector-prefer').selectOption('mathjax');

  const labels = page.getByTestId('inspector-glyphs-labels').getByRole('listitem');
  await expect(labels).toHaveCount(3);
  await expect(labels.locator('.glyph-list-label')).toHaveText(['a', 'b', '—']);
  await expect(page.getByTestId('inspector-backend')).toHaveText('mathjax');
  await expect(page.getByTestId('inspector-glyphs').locator('path')).toHaveCount(3);

  await page.getByTestId('inspector-glyphs-glyph-2').hover();
  await expect(page.getByTestId('inspector-glyphs-label-2')).toHaveClass(/active/);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('the engine inspector is modal: Space, undo and Tab stay out of the app behind it', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
      d.meta.name = 'Edited';
    });
  });
  await page.getByTestId('menu-help').click();
  await page.getByRole('menuitem', { name: 'Engine inspector…' }).click();
  const dialog = page.getByTestId('engine-inspector');
  await expect(dialog).toBeVisible();

  // Outside a modal, Ctrl+Z undoes the project (and Space on a button that kept the focus after
  // a click plays the scene).
  const compare = page.getByTestId('inspector-compare');
  await compare.focus();
  await page.keyboard.press('Space');
  await expect(compare).toBeChecked();
  expect(
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().playing),
  ).toBe(false);
  await page.keyboard.press('ControlOrMeta+z');
  expect(
    await page.evaluate(
      () => (window as MfeWindow).__mfe!.useProjectStore.getState().project.meta.name,
    ),
  ).toBe('Edited');

  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('a long project name is cut short; its tooltip has it whole and its state stays', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  const name = 'A very long project name about the quadratic formula and its derivation, part 2';
  await page.evaluate((text) => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
      d.meta.name = text;
    });
  }, name);
  const label = page.getByTestId('project-name');
  await expect(label).toHaveAttribute('data-dirty', 'true');
  expect(await label.getAttribute('title')).toMatch(new RegExp(`^${name}\\n`));
  const text = label.locator('.project-name-text');
  const cut = await text.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(cut).toBe(true);
  // The document's state sits right after the visible part of the name, inside the label.
  const state = page.getByTestId('doc-status');
  await expect(state).toHaveText('Unsaved changes');
  const [stateBox, labelBox] = [(await state.boundingBox())!, (await label.boundingBox())!];
  expect(stateBox.width).toBeGreaterThan(0);
  expect(stateBox.x + stateBox.width).toBeLessThanOrEqual(labelBox.x + labelBox.width + 0.5);
});

test('the top bar names the renderer the formulas use, with the counts in its tooltip', async ({
  page,
}) => {
  await openWithProject(page, relationProject([]));
  const status = page.getByTestId('engine-status');
  // No companion in the specs: both formulas render with MathJax.
  await expect(status).toHaveAttribute('title', /^2 formulas with MathJax\n/);
  await expect(status).toHaveText('Renderer: MathJax');
  await expect(status).toHaveAttribute('title', /Glyph source: Auto .*\n\nNo companion at /);
});

test('the way to start the companion names the Python of the system the browser runs on', async ({
  page,
}) => {
  // Windows has no `python3`: the installer of python.org gives `python`. The browser is dressed
  // as one of Windows; on any other system the command says `python3`.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' });
  });
  await openWithProject(page, relationProject([]));
  await expect(page.getByTestId('engine-status')).toHaveAttribute(
    'title',
    /Start it for exact LaTeX rendering: python companion\/mfe_companion\.py serve/,
  );
});

test('an error the editor cannot recover from shows a way back instead of a blank page', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWithProject(page, relationProject([]));
  // Corrupt the project behind the store's back: rendering it throws.
  await page.evaluate(() => {
    const store = (window as MfeWindow).__mfe!.useProjectStore as unknown as {
      setState(partial: { project: unknown }): void;
      getState(): { project: Record<string, unknown> };
    };
    store.setState({ project: { ...store.getState().project, clips: null } });
  });
  const crash = page.getByTestId('crash');
  await expect(crash).toContainText('Something went wrong');
  await expect(crash).toContainText('reload the page to continue');
  const download = page.waitForEvent('download');
  await page.getByTestId('crash-download').click();
  expect((await download).suggestedFilename()).toMatch(/\.mfe\.json$/);
  await expect(page.getByTestId('crash-reload')).toBeVisible();
});

test('a dialog opened from a menu gives the focus back to that menu when it closes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Project settings…' }).click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
  await expect(page.getByTestId('menu-file')).toBeFocused();
});

test('the document and renderer states, and the notices, are announced as they change', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('doc-status')).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('engine-status')).toHaveAttribute('role', 'status');
  // The notices' live region is there before the first notice.
  await expect(page.getByTestId('notice-host')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('the menu bar buttons move with the arrows, Home and End', async ({ page }) => {
  await page.goto('/');
  const file = page.getByTestId('menu-file');
  await file.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('menu-edit')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByTestId('menu-help')).toBeFocused();
  await page.keyboard.press('ArrowRight'); // wraps around
  await expect(file).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('menu-help')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(file).toBeFocused();
});

test('Export is the button beside the menus: no Export menu in the bar, six entries in its arrow', async ({
  page,
}) => {
  await page.goto('/');
  const menubar = page.getByRole('menubar', { name: 'Main menu' });
  expect(await menubar.locator('.menu-button').allTextContents()).toEqual([
    'File',
    'Edit',
    'View',
    'Preferences',
    'Help',
  ]);
  await expect(page.getByTestId('menu-export')).toHaveCount(0);
  await expect(menubar.getByRole('menuitem', { name: 'Export', exact: true })).toHaveCount(0);
  // The button is the last item of the bar and its arrow has every export.
  await expect(menubar.getByTestId('export-button')).toHaveText('Export…');
  await page.getByTestId('export-button-menu').click();
  const exports = page.getByRole('menu', { name: 'Export', exact: true });
  await expect(exports).toBeVisible();
  expect(
    await exports.locator('[role="menuitem"]').evaluateAll((entries) =>
      entries.map((entry) => ({
        id: (entry as HTMLElement).dataset.testid,
        text: entry.textContent?.trim(),
      })),
    ),
  ).toEqual([
    { id: 'export-button-export-ce', text: 'Python — ManimCE…' },
    { id: 'export-button-export-gl', text: 'Python — ManimGL…' },
    { id: 'export-button-export-video', text: 'Video…' },
    { id: 'export-button-export-image', text: 'Image…' },
    { id: 'export-button-export-audio', text: 'Audio…' },
    { id: 'export-button-export-html', text: 'HTML…' },
  ]);
  await page.keyboard.press('Escape');
  await expect(exports).toHaveCount(0);
});

test('a submenu opens beside its entry on hover and with the keyboard, and closes alone', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('menu-edit').click();
  const entry = page.getByTestId('menu-item-edit-align');
  const submenu = page.getByRole('menu', { name: 'Align' });
  await expect(entry).toHaveAttribute('aria-haspopup', 'menu');
  await expect(entry).toHaveAttribute('aria-expanded', 'false');
  await expect(submenu).toHaveCount(0);

  // Hover opens it to the right of the entry; another entry of the menu closes it.
  await entry.hover();
  await expect(submenu).toBeVisible();
  await expect(entry).toHaveAttribute('aria-expanded', 'true');
  const [entryBox, subBox] = [await entry.boundingBox(), await submenu.boundingBox()];
  expect(subBox!.x).toBeGreaterThanOrEqual(entryBox!.x + entryBox!.width);
  await page.getByTestId('menu-item-edit-auto-intro').hover();
  await expect(submenu).toHaveCount(0);
  // A disabled entry (Undo has nothing to undo) closes it too: the pointer goes through to the menu.
  await entry.hover();
  await expect(submenu).toBeVisible();
  const undo = (await page.getByTestId('menu-item-edit-undo').boundingBox())!;
  await page.mouse.move(undo.x + undo.width / 2, undo.y + undo.height / 2);
  await expect(submenu).toHaveCount(0);

  // The keyboard: Right opens it and focuses its first enabled item (none are enabled here: the
  // focus stays on the entry), Left or Escape closes just the submenu, Escape again the menu.
  await entry.focus();
  await page.keyboard.press('ArrowRight');
  await expect(submenu).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(submenu).toHaveCount(0);
  await expect(page.getByRole('menu', { name: 'Edit' })).toBeVisible();
  await expect(entry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(submenu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(submenu).toHaveCount(0);
  await expect(page.getByRole('menu', { name: 'Edit' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Edit' })).toHaveCount(0);
});

test('a submenu that would leave the window opens on the other side of its entry', async ({
  page,
}) => {
  // Narrow enough that the Align submenu overflows less on the left of its entry than on the
  // right (the title text is gone at this width, so the Edit menu sits near the left edge).
  // That is so while the window is narrower than the entry's two edges added up, which the
  // system's font decides: about 357 px with Segoe UI on Windows, where 360 was too wide.
  await page.setViewportSize({ width: 340, height: 700 });
  await page.goto('/');
  await page.getByTestId('menu-edit').click();
  const entry = page.getByTestId('menu-item-edit-align');
  await entry.hover();
  const submenu = page.getByRole('menu', { name: 'Align' });
  await expect(submenu).toHaveClass(/is-flipped/);
  // It is level with its entry and to the left of the entry's right edge.
  const [box, entryBox] = [(await submenu.boundingBox())!, (await entry.boundingBox())!];
  expect(box.x + box.width).toBeLessThanOrEqual(entryBox.x + entryBox.width);
});
