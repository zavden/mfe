/* Captures of color/palettes: the menus that lead to the palettes, the Editor palettes dialog
 * (its list, its eleven roles, the roles of your own), making a palette, the role pop-up of a
 * colour field, Edit ▸ Apply palette…, a Match colors list made from the active palette, and
 * Chroma Lab inside the app with the theme it sends.
 *
 * Project: the repository's `examples/braces.mfe.json` — a sum, three braces under it and a last
 * line with glyph colours of its own, which Apply palette leaves alone (its dialog says so).
 * Every item that needs a palette makes "Chalkboard" through the palette store, as the dialog
 * does, so that each starts from the same library. */

const PROJECT = 'examples/braces.mfe.json';

const CHALKBOARD = {
  name: 'Chalkboard',
  colors: {
    background: '#0E1A2B',
    formula: '#F2F5F7',
    variable: '#67D9FF',
    constant: '#F9CF72',
    operator: '#C9D3E0',
    result: '#8BE6BA',
    text: '#E6EBF0',
    muted: '#8EA0B5',
    rectangle: '#A9B5FF',
    circle: '#FF9AC6',
    arrow: '#8BE6BA',
  },
  roles: [
    { name: 'Highlight', color: '#FF9AC6' },
    { name: 'Soft grid', color: '#3A4B63' },
  ],
};

/** Makes the palette "Chalkboard" in the library, and activates it. */
const makePalette =
  ({ activate = true, roles = true } = {}) =>
  (page, kit) =>
    kit.app(
      '/src/ui/colors/paletteStore.ts',
      async (m, spec) => {
        const store = () => m.usePaletteStore.getState();
        const id = await store().createPalette();
        await store().rename(id, spec.name);
        for (const [role, color] of Object.entries(spec.colors)) {
          await store().recolor(id, role, color);
        }
        for (const role of spec.roles) await store().changeCustomRole(id, { do: 'add', ...role });
        if (spec.activate) await store().activate(id);
      },
      { ...CHALKBOARD, roles: roles ? CHALKBOARD.roles : [], activate },
    );

/** Opens the Editor palettes dialog by its menu entry, as a click does. */
const openLibrary = async (page, kit) => {
  await kit.choose('Preferences ▸ Editor palettes…');
  await page.getByTestId('palette-library').waitFor();
  await kit.settle({ renders: false });
};

/** The box round `base` and every context menu open over it. */
const withMenus = (base) => async (page, kit) => {
  const first = await kit.box(base);
  const menus = await page.locator('.ctx-menu').evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  const boxes = [first, ...menus];
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** The Chroma Lab frame's own elements, by CSS selector. */
const studio = (page, selector) =>
  page.frameLocator('[data-testid="chroma-lab-frame"]').locator(selector);

export default {
  page: 'color/palettes',
  project: PROJECT,
  items: [
    {
      // Preferences: Chroma Lab… (1) and Editor palettes… (2) close the menu.
      kind: 'shot',
      name: 'preferences-menu',
      steps: async (page, kit) => {
        await kit.openMenu('Preferences');
        await kit.move({ x: 700, y: 400 });
      },
      target: { union: ['menu-item-preferences-show-grid', 'menu-item-preferences-editor-palettes'] },
      padding: 10,
      highlight: [
        { target: 'menu-item-preferences-chroma-lab', label: 1, markerAt: 'right' },
        { target: 'menu-item-preferences-editor-palettes', label: 2, markerAt: 'right' },
      ],
    },
    {
      // Edit: Apply palette… (1) once a palette is active, and the lists of Match colors (2).
      kind: 'shot',
      name: 'edit-menu',
      setup: makePalette(),
      steps: async (page, kit) => {
        await kit.openMenu('Edit');
        await kit.move({ x: 700, y: 400 });
      },
      target: { union: ['menu-item-edit-distribute', 'menu-item-edit-colours-order'] },
      padding: 10,
      highlight: [
        { target: 'menu-item-edit-apply-palette', label: 1, markerAt: 'right' },
        { target: 'menu-item-edit-match-colors', label: 2, markerAt: 'right' },
      ],
    },
    {
      // The dialog, in steps: the list (1), what each palette can do (2), the eleven roles with
      // what the editor does with each (3), the roles of your own (4), the buttons that bring
      // palettes in (5). One image, the boxes move.
      kind: 'tour',
      name: 'library',
      viewport: { width: 1440, height: 1120 },
      scale: 1.5,
      setup: [makePalette(), openLibrary],
      target: 'palette-library',
      steps: [
        {
          caption:
            'The <b>list</b> holds <b>Manim defaults</b>, the colours the editor has without a ' +
            'palette, and every palette you made or imported. The one in use is marked ' +
            '<b>Active</b>.',
          focus: ['.palette-library-list'],
          focusPadding: 4,
        },
        {
          caption:
            '<span class="ui">Activate</span> puts the selected palette to work for what you ' +
            'make from now on. <span class="ui">Duplicate</span> copies it, ' +
            '<span class="ui">Export JSON</span> writes it to a file and ' +
            '<span class="ui">Delete palette</span> removes it.',
          focus: [
            {
              union: [
                'palette-activate',
                'palette-duplicate',
                'palette-export',
                'palette-delete',
              ],
            },
          ],
          focusPadding: 6,
        },
        {
          caption:
            'The <b>eleven roles</b> every palette has, each with its colour: type a hex value ' +
            'or use the picker. The last column says what the editor does with the role.',
          focus: ['palette-role-preview'],
          focusPadding: 4,
        },
        {
          caption:
            '<b>Your roles</b> are colours of your own with a name. Nothing takes them by ' +
            'itself: they are offered wherever you choose a colour by role.',
          focus: ['palette-custom-roles'],
          focusPadding: 4,
        },
        {
          caption:
            '<span class="ui">Import palette…</span> reads a theme file, and ' +
            '<span class="ui">New palette</span> starts one from the editor’s own colours.',
          focus: [{ union: ['palette-import', 'palette-new'] }],
          focusPadding: 6,
        },
      ],
    },
    {
      // The Roles button of a colour field, with a palette active: every role as a block with its
      // name, the roles of your own under their heading.
      kind: 'shot',
      name: 'roles-popup',
      setup: [
        makePalette(),
        async (page, kit) => {
          const { id } = await kit.formula('sum');
          await kit.doubleClick({ css: `[data-testid="formula-list"] [data-formula-id="${id}"]` });
          await page.getByTestId('formula-editor').waitFor();
          await kit.settle();
          await page.evaluate(() => document.activeElement?.blur());
        },
      ],
      steps: async (page, kit) => {
        await kit.click('editor-color-roles');
        await kit.move({ x: 4, y: 4 });
      },
      target: withMenus('.editor-fields'),
      padding: 8,
      highlight: [{ target: 'editor-color-roles', label: 1, markerAt: 'top-left' }],
    },
    {
      // Edit ▸ Apply palette…: the palette (1), how many objects change, are skipped or already
      // match (2), the background (3), and the objects it leaves alone, with the reason (4).
      kind: 'shot',
      name: 'apply-palette',
      setup: [makePalette()],
      steps: async (page, kit) => {
        await kit.choose('Edit ▸ Apply palette…');
        await page.getByTestId('apply-palette-dialog').waitFor();
        await kit.click({ css: '[data-testid="apply-palette-skipped"] summary' });
        await kit.move({ x: 4, y: 4 });
      },
      target: 'apply-palette-dialog',
      highlight: [
        { target: 'apply-palette-name', label: 1, markerAt: 'top-right' },
        { target: 'apply-palette-counts', label: 2, markerAt: 'top-right' },
        { target: '.ap-body label.check', label: 3, markerAt: 'top-right' },
        { target: 'apply-palette-skipped', label: 4, markerAt: 'top-right' },
      ],
    },
    {
      // The scene before Apply palette: the black background and the colours the editor has
      // without a palette...
      kind: 'shot',
      name: 'scene-before',
      setup: [makePalette(), (page, kit) => kit.seek(6.2)],
      target: 'preview-frame',
      padding: 4,
    },
    {
      // ...and after it, with the background and the colours of "Chalkboard".
      kind: 'shot',
      name: 'scene-after',
      setup: [makePalette(), (page, kit) => kit.seek(6.2)],
      steps: async (page, kit) => {
        await kit.choose('Edit ▸ Apply palette…');
        await page.getByTestId('apply-palette-dialog').waitFor();
        await kit.click('apply-palette-confirm');
        await page.getByTestId('apply-palette-dialog').waitFor({ state: 'detached' });
        await kit.move({ x: 4, y: 4 });
        await kit.settle();
      },
      target: 'preview-frame',
      padding: 4,
    },
    {
      // Match colors ▸ New from active palette…: four rows, the colours of the palette's variable,
      // constant, operator and result roles, and patterns for you to fill.
      kind: 'shot',
      name: 'match-from-palette',
      setup: [makePalette()],
      steps: async (page, kit) => {
        await kit.choose('Edit ▸ Match colors ▸ New from active palette…');
        await page.getByTestId('match-colors').waitFor();
        await kit.settle();
        await kit.move({ x: 4, y: 4 });
      },
      target: 'match-colors',
      highlight: [{ target: 'match-colors-entries', label: 1, markerAt: 'top-right' }],
    },
    {
      // Chroma Lab inside the app: its title bar with Import palette… (1), Editor palettes… (2)
      // and the information button (3), and the button that sends a theme to the editor (4).
      kind: 'shot',
      name: 'chroma-lab',
      setup: [makePalette({ roles: false, activate: false })],
      steps: async (page, kit) => {
        await kit.choose('Preferences ▸ Chroma Lab…');
        await page.getByTestId('chroma-lab-host').waitFor();
        await studio(page, '#scene-preview svg').first().waitFor();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="chroma-lab-host"]')
              ?.getAttribute('data-bridge') === 'ready',
        );
        await studio(page, '[data-studio-action="send-host"]').scrollIntoViewIfNeeded();
        await kit.move({ x: 700, y: 480 });
        await kit.settle({ renders: false });
      },
      target: 'chroma-lab-dialog',
      scale: 1,
      highlight: [
        { target: 'chroma-lab-import', label: 1, markerAt: 'bottom' },
        { target: 'chroma-lab-library', label: 2, markerAt: 'bottom' },
        { target: 'chroma-lab-info', label: 3, markerAt: 'bottom' },
        { target: (page) => studio(page, '[data-studio-action="send-host"]'), label: 4, markerAt: 'top-left' },
      ],
    },
    {
      // What Send does: the editor opens Editor palettes on the theme, selected and ready to
      // activate (1); nothing in the project has changed.
      kind: 'shot',
      name: 'chroma-sent',
      viewport: { width: 1440, height: 1120 },
      scale: 1.5,
      setup: [makePalette({ roles: false, activate: false })],
      steps: async (page, kit) => {
        await kit.choose('Preferences ▸ Chroma Lab…');
        await page.getByTestId('chroma-lab-host').waitFor();
        await studio(page, '#scene-preview svg').first().waitFor();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="chroma-lab-host"]')
              ?.getAttribute('data-bridge') === 'ready',
        );
        await studio(page, '[data-studio-action="send-host"]').click();
        await page.getByTestId('palette-library').waitFor();
        await page.evaluate(() => document.activeElement?.blur());
        await kit.move({ x: 4, y: 4 });
        await kit.settle({ renders: false });
      },
      target: 'palette-library',
      highlight: [{ target: { union: ['palette-name', 'palette-activate'] }, label: 1, markerAt: 'top-right' }],
    },
  ],
};
