/* Captures of start/install: what the reader sees when the app runs for the first time, the
 * About dialog (the version of the project format, whether a companion answers), the first
 * formula written (the check of the page), the Preferences menu where Chroma Lab is, Chroma Lab
 * itself, and the notice a browser without access to files gets. No project: the app starts on
 * its own new, empty one. */

/** Rests the pointer where nothing answers it (no hover in the picture: in the light pass the
 * tool has just pressed the theme switch). */
const away = (page, kit) => kit.move({ x: 720, y: 884 }, { duration: 1 });

export default {
  page: 'start/install',
  items: [
    {
      // The app as it opens: an empty project, two empty tracks, and the Creator's two ways to a
      // project, Try an example and Sync folder…. The pointer rests away from the theme switch,
      // which the light pass pressed.
      kind: 'shot',
      name: 'first-start',
      setup: away,
    },
    {
      // Help ▸ About: the app's version, the project format, MathJax, and the companion (not
      // running, here).
      kind: 'shot',
      name: 'about-dialog',
      setup: async (page, kit) => {
        await kit.choose('Help ▸ About');
        await page.getByTestId('about-dialog').waitFor();
        await away(page, kit);
      },
      target: 'about-dialog',
      padding: 14,
    },
    {
      // The check of the page: + New opens the formula editor, x + 3 = 5 goes into the Raw LaTeX
      // field (1), Apply (2) draws it, and the line beside the button counts its glyphs and says
      // what drew them (3). The capture fails if the line says something else.
      kind: 'shot',
      name: 'formula-editor',
      setup: async (page, kit) => {
        await kit.click('creator-new');
        await kit.waitFor('formula-editor');
        await kit.click('raw-latex');
        await kit.type('x + 3 = 5');
        await kit.click('editor-apply');
        await kit.until(() =>
          /^\d+ glyphs/.test(
            document.querySelector('[data-testid="editor-status"]')?.textContent ?? '',
          ),
        );
        const line = await page.getByTestId('editor-status').textContent();
        if (line !== '5 glyphs · MathJax') {
          throw new Error(`the line beside Apply says "${line}", not "5 glyphs · MathJax"`);
        }
        await away(page, kit);
      },
      target: async (page, kit) => {
        const editor = await kit.box('formula-editor');
        const line = await kit.box('editor-status');
        return {
          x: editor.x,
          y: editor.y,
          width: editor.width,
          height: line.y + line.height + 14 - editor.y,
        };
      },
      padding: 8,
      highlight: [
        { target: 'raw-latex', label: 1, markerAt: 'top' },
        { target: 'editor-apply', label: 2, markerAt: 'top-left' },
        { target: 'editor-status', label: 3, markerAt: 'bottom' },
      ],
    },
    {
      // Preferences ▸ Chroma Lab… and Editor palettes…: the colour studio that comes inside
      // the app, and the palettes it feeds. From the menu's own button to its bottom corner.
      kind: 'shot',
      name: 'preferences-menu',
      setup: (page, kit) => kit.openMenu('Preferences'),
      target: async (page, kit) => {
        const button = await kit.box('menu-preferences');
        const menu = await kit.box('.menu-popup[aria-label="Preferences"]');
        const left = Math.max(0, Math.floor(button.x - 14));
        return {
          x: left,
          y: 0,
          width: Math.ceil(menu.x + menu.width) + 14 - left,
          height: Math.ceil(menu.y + menu.height) + 12,
        };
      },
      highlight: [
        {
          target: async (page, kit) => (await kit.menuEntry('Chroma Lab')).box,
          label: 1,
          markerAt: 'right',
          pad: -3,
        },
        {
          target: async (page, kit) => (await kit.menuEntry('Editor palettes')).box,
          label: 2,
          markerAt: 'right',
          pad: -3,
        },
      ],
    },
    {
      // Chroma Lab, open over the editor: its pages are in the left column, and "Send to
      // Manim Formula Editor" puts a theme in the editor's palettes.
      kind: 'shot',
      name: 'chroma-lab',
      setup: async (page, kit) => {
        await kit.choose('Preferences ▸ Chroma Lab…');
        const frame = page.frameLocator('[data-testid="chroma-lab-frame"]');
        await frame.locator('#scene-preview svg').waitFor({ timeout: 30_000 });
        // Its scene animates inside the frame, which `settle` cannot see: a moment for it to rest.
        await page.waitForTimeout(1500);
        await away(page, kit);
      },
      target: 'chroma-lab-dialog',
      padding: 14,
    },
    {
      // A browser without the File System Access API (Firefox, Safari) is told, once per
      // session, what it works on. The pickers are removed and the app's own check runs: the
      // notice is what such a browser shows.
      kind: 'shot',
      name: 'file-access-notice',
      setup: async (page, kit) => {
        await page.evaluate(async () => {
          delete window.showOpenFilePicker;
          delete window.showSaveFilePicker;
          delete window.showDirectoryPicker;
          const { startFileAccessNotice } = await import('/src/ui/project/fileAccess.ts');
          startFileAccessNotice();
        });
        await page.getByTestId('notice').waitFor();
        await away(page, kit);
      },
      target: 'notice',
      padding: 6,
    },
  ],
};
