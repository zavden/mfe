/* Captures of start/projects: the File menu, the Projects dialog over a synced folder, the bar's
 * file name and its marks (saved, renamed, unsaved, recovered), the question before a project is
 * replaced, the autosaves of tabs that are gone, and Project settings.
 *
 * The browser's own pickers (the folder, the file to open, where to save) are windows of the
 * operating system, which no capture shows. `standIn` puts in their place a small stand-in with
 * the same API as the browser's: a folder of six projects held in memory, listed, opened and
 * written by the app's own code. Everything on screen is the app's.
 *
 * What the page says of the app is checked here as the pictures are made: an item fails, saying
 * what the app said instead, when a label, a mark or a file is not what the page quotes. */

/** The folder the reader synced: [file name, project (a path of the repository), last change]. */
const FOLDER = 'Manim projects';
const PROJECTS = [
  [
    'completing-the-square.mfe.json',
    'examples/completing-the-square.mfe.json',
    '2026-11-12T18:32:00Z',
  ],
  ['hello.mfe.json', 'examples/hello.mfe.json', '2026-11-11T09:05:00Z'],
  ['one-to-many.mfe.json', 'examples/one-to-many.mfe.json', '2026-11-09T21:48:00Z'],
  ['match-colors.mfe.json', 'examples/match-colors.mfe.json', '2026-11-07T16:20:00Z'],
  [
    'first-transform.mfe.json',
    'docs/web/examples/first-transform.mfe.json',
    '2026-11-04T11:10:00Z',
  ],
  ['quadratic-formula.mfe.json', 'examples/quadratic-formula.mfe.json', '2026-10-30T19:55:00Z'],
];

/** The pickers of Chrome and Edge, in memory: `showDirectoryPicker` answers with the folder,
 * `showSaveFilePicker` with a file of it (named by `window.__saveName` when set), and a file's
 * handle reads and writes like a real one. */
async function standIn(page, kit) {
  const files = PROJECTS.map(([name, path, modified]) => ({
    name,
    text: kit.readProject(path),
    modified: Date.parse(modified),
  }));
  await page.evaluate(
    ({ folder, files }) => {
      const disk = new Map(files.map((file) => [file.name, { ...file }]));
      const handleOf = (name) => ({
        kind: 'file',
        name,
        async getFile() {
          const { text, modified } = disk.get(name);
          return new File([text], name, {
            lastModified: modified,
            type: 'application/json',
          });
        },
        async createWritable() {
          let text = '';
          return {
            async write(data) {
              text += typeof data === 'string' ? data : await new Blob([data]).text();
            },
            async close() {
              disk.set(name, { name, text, modified: Date.now() });
            },
            async abort() {},
          };
        },
        async isSameEntry(other) {
          return other?.name === name;
        },
      });
      window.__disk = disk;
      window.__saveName = null;
      window.showDirectoryPicker = async () => ({
        kind: 'directory',
        name: folder,
        async *values() {
          for (const name of [...disk.keys()]) yield handleOf(name);
        },
      });
      window.showOpenFilePicker = async () => [handleOf([...disk.keys()][0])];
      window.showSaveFilePicker = async (options) => {
        const name = window.__saveName ?? options?.suggestedName ?? 'untitled.mfe.json';
        if (!disk.has(name)) disk.set(name, { name, text: '', modified: Date.now() });
        return handleOf(name);
      };
    },
    { folder: FOLDER, files },
  );
}

/** The project in the app is the one of a file of that name, saved: what File ▸ Open leaves. */
function savedAs(fileName) {
  return async (page, kit) => {
    await kit.mfe((mfe, name) => {
      const project = mfe.useProjectStore.getState().project;
      mfe.useDocumentStore.getState().beginDocument(project, { fileName: name, handle: null });
    }, fileName);
    await kit.settle({ renders: false });
  };
}

/** The item fails when the app says something other than the page quotes. */
function expectThat(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${what}: the app says ${JSON.stringify(actual)}, the page says ${JSON.stringify(expected)}`,
    );
  }
}

/** The item fails when a text the page quotes is not in what the app shows. */
function expectIn(text, parts, what) {
  const flat = text.replace(/\s+/g, ' ');
  for (const part of parts) {
    if (!flat.includes(part)) {
      throw new Error(`${what}: "${part}" is not there; the app shows ${JSON.stringify(flat)}`);
    }
  }
}

/** What the menu bar says of the document: its mark, and its file (null when there is none). */
async function documentMark(page) {
  const mark = await page.getByTestId('doc-status').textContent();
  const file = await page
    .getByTestId('doc-file')
    .textContent({ timeout: 500 })
    .catch(() => null);
  return { mark, file };
}

/** The project "First transform" of the stand-in's folder opened as File ▸ Open… opens it, by its
 * card: the project is in its file, with the handle that lets Save write it in place. What was
 * in the app is first made a clean document, so that Open asks nothing before it replaces it. */
async function openFromTheFolder(page, kit) {
  await savedAs('first-transform.mfe.json')(page, kit);
  await openProjectsDialog(page, kit);
  await kit.click({ css: '.projects-entry >> nth=4' });
  await kit.waitFor('doc-file');
  await kit.waitForRenders();
  await away(page, kit);
}

/** The project of the folder, then its name clicked, "Class notes" typed and Enter: the project
 * has changed since it was saved. The item fails if the bar or the tab's title say otherwise. */
async function renamed(page, kit) {
  await openFromTheFolder(page, kit);
  expectThat(
    await documentMark(page),
    { mark: 'Saved', file: 'first-transform.mfe.json' },
    'the bar of a project opened from its file',
  );
  await kit.click('project-rename');
  await kit.type('Class notes');
  await kit.press('Enter');
  await kit.settle({ renders: false });
  expectThat(
    await documentMark(page),
    { mark: 'Unsaved changes', file: 'first-transform.mfe.json' },
    'the bar of a renamed project',
  );
  expectThat(await page.title(), '• Class notes — Manim Formula Editor', 'the tab title');
  // Enter gives the focus back to the name, which then wears the focus ring: the pictures are of
  // the bar's words, so the focus is let go, as a click elsewhere would.
  expectThat(
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null),
    'project-rename',
    'the focus after Enter',
  );
  await page.evaluate(() => document.activeElement?.blur());
  await away(page, kit);
}

/** Rests the pointer where nothing answers it (no hover in the picture). */
const away = (page, kit) => kit.move({ x: 720, y: 884 }, { duration: 1 });

/** File ▸ Open…, then Sync folder… inside the dialog: the stand-in's folder is listed. */
async function openProjectsDialog(page, kit, { sync = true } = {}) {
  await kit.choose('File ▸ Open…');
  await page.getByTestId('projects-dialog').waitFor();
  if (sync) {
    await kit.click('projects-sync');
    await page.getByTestId('projects-entry').first().waitFor();
    // The thumbnails render one by one.
    await page.waitForFunction(
      () => document.querySelectorAll('.projects-thumbs .formula-thumb-empty').length === 0,
      null,
      { timeout: 20_000 },
    );
  }
  await away(page, kit);
  await kit.settle({ renders: false });
}

/** Two tabs that were closed with work in them: `[name, file name, minutes ago]`. Each is a page
 * of the same browser that loads a project, changes it and goes away; the app's autosave keeps
 * what it wrote. The age of the record is set afterwards, so that the menu says "26 min ago". */
function closedTabs(tabs) {
  return async (page, kit) => {
    // All the tabs are open together, so that none of them takes over the work of another that
    // was closed a moment before (a new tab restores the newest closed one).
    const pages = [];
    for (const [name, fileName] of tabs) {
      const other = await page.context().newPage();
      await other.goto(page.url());
      await other.waitForFunction(() => window.__mfe !== undefined);
      await other.evaluate(
        ({ text, name, fileName }) => {
          const mfe = window.__mfe;
          mfe.loadProject(mfe.parseProject(text).project);
          const project = mfe.useProjectStore.getState().project;
          if (fileName) {
            mfe.useDocumentStore.getState().beginDocument(project, { fileName, handle: null });
          }
          mfe.useProjectStore.getState().update((draft) => {
            draft.meta.name = name;
          });
        },
        {
          text: kit.readProject('docs/web/examples/first-transform.mfe.json'),
          name,
          fileName,
        },
      );
      pages.push(other);
    }
    // The autosave writes 0.4 s after the change.
    await page.waitForTimeout(1200);
    for (const other of pages) await other.close();
    await page.evaluate((tabs) => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith('mfe.autosave.')) continue;
        const record = JSON.parse(localStorage.getItem(key));
        const tab = tabs.find(([name]) => name === record.name);
        if (!tab) continue;
        record.savedAt = Date.now() - tab[2] * 60_000;
        localStorage.setItem(key, JSON.stringify(record));
      }
    }, tabs);
  };
}

/** The right half of the menu bar: the project's name, its file, its mark, the renderer, the
 * theme switch. */
const barRight = { x: 700, y: 0, width: 740, height: 44 };

/** The box from a little left of the File button, and from the top of the bar, to the right and
 * bottom edge of the open menus. */
async function menuCorner(page, kit) {
  const button = await kit.box('menu-file');
  const popups = await page.locator('.menu-popup, [role="menu"]').evaluateAll((menus) =>
    menus.map((menu) => {
      const box = menu.getBoundingClientRect();
      return { right: box.right, bottom: box.bottom };
    }),
  );
  const left = Math.max(0, Math.floor(button.x - 14));
  const right = Math.max(...popups.map((popup) => popup.right));
  const bottom = Math.max(...popups.map((popup) => popup.bottom));
  return {
    x: left,
    y: 0,
    width: Math.ceil(right) + 14 - left,
    height: Math.ceil(bottom) + 12,
  };
}

export default {
  page: 'start/projects',
  project: 'docs/web/examples/first-transform.mfe.json',
  items: [
    {
      // The File menu: New, Open…, Sync folder…, Recover autosave, Save, Save As…, Project
      // settings…, each with its key. The item fails if the entries are not the page's table.
      kind: 'shot',
      name: 'file-menu',
      setup: [
        savedAs('first-transform.mfe.json'),
        async (page, kit) => {
          await kit.openMenu('File');
          const entries = await kit.readMenu(kit.menu, { deep: false });
          expectThat(
            entries.filter((entry) => entry.type !== 'separator').map((entry) => entry.label),
            [
              'New',
              'Open…',
              'Sync folder…',
              'Recover autosave',
              'Save',
              'Save As…',
              'Project settings…',
            ],
            'the entries of the File menu',
          );
          expectThat(
            entries.filter((entry) => entry.shortcut).map((entry) => entry.shortcut),
            ['Ctrl+Alt+N', 'Ctrl+O', 'Ctrl+Shift+S', 'Ctrl+S', 'Ctrl+Alt+S'],
            'the keys of the File menu',
          );
        },
      ],
      target: menuCorner,
    },
    {
      // File ▸ Open… before any folder was synced: the line says so, and Sync folder… is
      // there, with Other file… for the browser's own picker.
      kind: 'shot',
      name: 'projects-empty',
      setup: [
        standIn,
        savedAs('first-transform.mfe.json'),
        async (page, kit) => {
          await openProjectsDialog(page, kit, { sync: false });
          expectThat(
            (await page.getByTestId('projects-folder').textContent()).trim(),
            'No folder synced. Sync a folder once: its projects are listed here and a click opens one.',
            'the line of the Projects dialog before a folder is synced',
          );
        },
      ],
      target: 'projects-dialog',
      padding: 14,
    },
    {
      // After Sync folder…: the projects of the folder as cards, newest first. Two stars give
      // the Favorites count something to say.
      kind: 'shot',
      name: 'projects-dialog',
      setup: [
        standIn,
        savedAs('first-transform.mfe.json'),
        async (page, kit) => {
          await openProjectsDialog(page, kit);
          await kit.click({ css: '.projects-star >> nth=1' });
          await kit.click({ css: '.projects-star >> nth=4' });
          expectThat(
            await page.getByTestId('projects-entry-name').allTextContents(),
            [
              'Completing the square',
              'Hello: one-to-one',
              'One-to-many',
              'Match colors',
              'First transform',
              'Quadratic formula',
            ],
            'the cards of the Projects dialog, newest first',
          );
          await away(page, kit);
        },
      ],
      target: 'projects-dialog',
      padding: 14,
      highlight: [
        { target: { css: '.projects-folder' }, label: 1, markerAt: 'top-left' },
        { target: { css: '.projects-search' }, label: 2, markerAt: 'top-left' },
        { target: 'projects-view', label: 3, markerAt: 'top-right' },
        {
          target: { css: '.projects-list > li >> nth=2' },
          label: 4,
          markerAt: 'bottom-left',
        },
        { target: 'projects-other', label: 5, markerAt: 'top-right' },
      ],
    },
    {
      // Searching and favourites, in about five seconds and only the top of the dialog: "sq"
      // keeps the project with those letters in its name, Esc brings the others back, a star
      // marks a project and Favorites lists it. The dialog is made taller first so that it does
      // not change size as the list changes.
      kind: 'clip',
      name: 'projects-search',
      holdEnd: 500,
      loop: false,
      setup: [
        standIn,
        savedAs('first-transform.mfe.json'),
        async (page, kit) => {
          await openProjectsDialog(page, kit);
          const grip = await kit.point('projects-dialog-resize');
          await kit.drag(grip, { x: grip.x, y: grip.y + 40 });
          await away(page, kit);
        },
      ],
      target: async (page, kit) => {
        const dialog = await kit.box('projects-dialog');
        return { x: dialog.x - 8, y: dialog.y - 8, width: dialog.width + 16, height: 330 };
      },
      act: async (page, kit) => {
        await kit.click('projects-search', { duration: 450 });
        await kit.type('sq', { delay: 130 });
        expectThat(
          await page.getByTestId('projects-entry-name').allTextContents(),
          ['Completing the square'],
          'the cards the search "sq" keeps',
        );
        await kit.pause(500);
        await kit.press('Escape', { after: 250 });
        await kit.click({ css: '.projects-star >> nth=0' }, { duration: 450 });
        await kit.click('projects-view-favorites', { duration: 450, after: 500 });
      },
    },
    {
      // A project changed and not saved, then File ▸ New: the question before it is replaced.
      kind: 'shot',
      name: 'unsaved-dialog',
      setup: [
        savedAs('first-transform.mfe.json'),
        async (page, kit) => {
          await kit.mfe((mfe) => {
            mfe.useProjectStore.getState().update((draft) => {
              draft.meta.name = 'Class notes';
            });
          });
          await kit.choose('File ▸ New');
          await kit.waitFor('dialog');
          expectIn(
            await page.getByTestId('dialog').innerText(),
            [
              'Unsaved changes',
              'The current project has changes that were not saved to a file.',
              'Cancel',
              "Don't save",
              'Save',
            ],
            'the question before a project is replaced',
          );
          await away(page, kit);
        },
      ],
      target: 'dialog',
      padding: 14,
    },
    {
      // The bar of a project that is not saved anywhere yet.
      kind: 'shot',
      name: 'status-not-saved',
      project: null,
      setup: async (page, kit) => {
        expectThat(await documentMark(page), { mark: 'Not saved yet', file: null }, 'the bar');
        await away(page, kit);
      },
      target: barRight,
    },
    {
      // Renamed and saved: Ctrl/⌘+S writes the file the project came from, and the mark goes.
      // The item fails unless the folder's file then holds the new name.
      kind: 'shot',
      name: 'status-saved',
      setup: [
        standIn,
        renamed,
        async (page, kit) => {
          await kit.press('ControlOrMeta+S');
          await kit.until(
            () => document.querySelector('[data-testid="doc-status"]')?.textContent === 'Saved',
          );
          expectThat(
            await page.evaluate(
              () => JSON.parse(window.__disk.get('first-transform.mfe.json').text).meta.name,
            ),
            'Class notes',
            'the name in the file after Save',
          );
          expectThat(
            await documentMark(page),
            { mark: 'Saved', file: 'first-transform.mfe.json' },
            'the bar after Save',
          );
          await away(page, kit);
        },
      ],
      target: barRight,
    },
    {
      // The name clicked and "Class notes" typed: the name is a field until Enter.
      kind: 'shot',
      name: 'status-renaming',
      setup: [
        standIn,
        openFromTheFolder,
        async (page, kit) => {
          await kit.click('project-rename');
          await kit.type('Class notes');
          await kit.waitFor('project-rename-input');
          await away(page, kit);
        },
      ],
      target: barRight,
    },
    {
      // Renamed: changed since it was saved, so amber, and a bullet in the tab's title. The item
      // also checks what the page says of undo: one step brings "Saved" back, and redo the
      // change.
      kind: 'shot',
      name: 'status-unsaved',
      setup: [
        standIn,
        renamed,
        async (page, kit) => {
          const marked = (mfe, text) =>
            document.querySelector('[data-testid="doc-status"]')?.textContent === text;
          await kit.press('ControlOrMeta+Z');
          await kit.until(marked, 'Saved');
          expectThat((await documentMark(page)).mark, 'Saved', 'the bar after undoing the rename');
          await kit.press('ControlOrMeta+Shift+Z');
          await kit.until(marked, 'Unsaved changes');
          expectThat(await page.title(), '• Class notes — Manim Formula Editor', 'the tab title');
        },
      ],
      target: barRight,
    },
    {
      // Unsaved work that came back from the autosave: File ▸ Recover autosave ▸ the entry.
      kind: 'shot',
      name: 'status-recovered',
      setup: [
        savedAs('first-transform.mfe.json'),
        closedTabs([['Class notes', 'first-transform.mfe.json', 26]]),
        async (page, kit) => {
          await kit.choose('File ▸ Recover autosave ▸ first-transform.mfe.json');
          await kit.waitForRenders();
          expectThat(
            await documentMark(page),
            { mark: 'Recovered, not saved', file: 'first-transform.mfe.json' },
            'the bar of a recovered project',
          );
          await away(page, kit);
        },
      ],
      target: barRight,
    },
    {
      // File ▸ Recover autosave ▸: the work of tabs that were closed, newest first.
      kind: 'shot',
      name: 'recover-menu',
      setup: [
        savedAs('first-transform.mfe.json'),
        closedTabs([
          ['Class notes', 'first-transform.mfe.json', 26],
          ['Lesson 3, the derivation', null, 29 * 60],
        ]),
        async (page, kit) => {
          await kit.openMenu('File ▸ Recover autosave');
          const entries = await kit.readMenu(kit.menu, { deep: false });
          expectThat(
            entries.map((entry) => entry.label),
            [
              'first-transform.mfe.json (unsaved changes) · 26 min ago',
              'Lesson 3, the derivation (unsaved changes) · yesterday',
            ],
            'the entries of Recover autosave',
          );
        },
      ],
      target: menuCorner,
    },
    {
      // File ▸ Project settings…: the name, the Manim target, the size and the speed of the
      // video, the background, how long the scene lasts and the LaTeX preamble.
      kind: 'shot',
      name: 'settings-dialog',
      setup: [
        savedAs('first-transform.mfe.json'),
        async (page, kit) => {
          await kit.choose('File ▸ Project settings…');
          await kit.waitFor('settings-dialog');
          expectThat(
            await page
              .getByTestId('settings-dialog')
              .locator('label, .form-label')
              .allTextContents(),
            [
              'Name',
              'Manim target',
              'Resolution',
              'Frame rate',
              'Background',
              'Duration',
              'Until the last clip ends',
              'Fixed',
              'LaTeX preamble',
            ],
            'the fields of Project settings',
          );
          await away(page, kit);
        },
      ],
      target: 'settings-dialog',
      padding: 14,
    },
  ],
};
