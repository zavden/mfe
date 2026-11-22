/* Captures of reference/preferences: what the app remembers about its user, and the dialogs that
 * ask for it.
 *
 * `MFE_DATA['reference/preferences/defaults']` (read out of the app's own code, so the page's
 * defaults cannot drift from it):
 *   preferences    `defaultPreferences()` of `app/src/ui/preferences.ts`: every editor preference
 *                  with its default (`intro` and `outro` are animation specs; `standardScale` the
 *                  scale new formulas (`math`) and new LaTeX texts (`tex`) are born with)
 *   storageKey     where the browser keeps them (localStorage)
 *   guideColors    the colours the menu offers for the guides and for the glyphs picked with Alt
 *   guideWidths    the widths of the guide lines, in CSS pixels
 *   lockedOpacities, lockedOpacity   the choices of "Locked formulas" and its bounds
 *   symbolRadius   the reach of the circle selector and of align by symbol, CSS px: default, min, max
 *   scaleSteps, scaleStepRange       the presets of "Scale step" and the bounds of a custom one
 *   gridSteps      the grid spacings
 *   standardScaleRange               what a standard scale may be
 *   theme          the default theme and where the choice is kept
 *   glyphSource    the default of View ▸ Glyph source (kept for the session only)
 *   exportTarget   where the last Python target of the Export… button is kept
 *   project        the settings a new project starts with (`defaultMeta()`) and the ranges of
 *                  File ▸ Project settings…
 *   fontSize       Manim's default font size, which a scale of 1 means */
/** The three buttons of the Preview's toolbar that switch preferences, in the order they are numbered. */
const TOOLS = ['preview-circle-select', 'preview-handles', 'preview-snap'];

export default {
  page: 'reference/preferences',
  project: 'examples/completing-the-square.mfe.json',
  items: [
    {
      kind: 'data',
      name: 'defaults',
      extract: (page, kit) =>
        kit.evaluate(async () => {
          const prefs = await import('/src/ui/preferences.ts');
          const theme = await import('/src/ui/theme.ts');
          const scaleStep = await import('/src/ui/preview/scaleStep.ts');
          const grid = await import('/src/ui/preview/grid.ts');
          const standard = await import('/src/ui/creator/standardScale.ts');
          const store = await import('/src/store/index.ts');
          const model = await import('/src/model/index.ts');
          const settings = await import('/src/ui/project/settingsModel.ts');
          const exportStore = await import('/src/ui/export/exportStore.ts');
          return {
            source: 'app/src/ui/preferences.ts and the files it reads',
            preferences: prefs.defaultPreferences(),
            storageKey: prefs.PREFERENCES_STORAGE_KEY,
            guideColors: prefs.GUIDE_COLORS,
            guideWidths: prefs.GUIDE_WIDTHS,
            lockedOpacities: prefs.LOCKED_OPACITIES,
            lockedOpacity: prefs.LOCKED_OPACITY,
            symbolRadius: prefs.SYMBOL_RADIUS,
            scaleSteps: scaleStep.SCALE_STEPS,
            scaleStepRange: scaleStep.SCALE_STEP_RANGE,
            gridSteps: grid.GRID_STEPS,
            standardScaleRange: standard.STANDARD_SCALE_RANGE,
            theme: { default: theme.DEFAULT_THEME, storageKey: theme.THEME_STORAGE_KEY },
            glyphSource: store.useRenderStore.getState().prefer,
            exportTarget: { storageKey: exportStore.LAST_TARGET_KEY },
            project: {
              meta: model.defaultMeta(),
              resolutions: settings.RESOLUTION_PRESETS,
              fps: settings.FPS_PRESETS,
            },
            fontSize: model.DEFAULT_FONT_SIZE,
          };
        }),
    },
    {
      // The Preferences menu with the choices of "Scale step" open beside it.
      kind: 'shot',
      name: 'menu',
      setup: async (page, kit) => {
        await kit.openMenu('Preferences ▸ Scale step');
      },
      target: async (page) => {
        const boxes = await page.evaluate(() => {
          const rect = (element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          };
          const nodes = [
            document.querySelector('[data-testid="menu-preferences"]'),
            ...document.querySelectorAll('.menu-popup'),
          ];
          return nodes.filter(Boolean).map(rect);
        });
        const left = Math.min(...boxes.map((b) => b.x));
        const top = Math.min(...boxes.map((b) => b.y));
        const right = Math.max(...boxes.map((b) => b.x + b.width));
        const bottom = Math.max(...boxes.map((b) => b.y + b.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
      },
      padding: 10,
    },
    {
      // Preferences ▸ Scale step ▸ Custom…
      kind: 'shot',
      name: 'scale-step',
      setup: async (page, kit) => {
        await kit.choose('Preferences ▸ Scale step ▸ Custom…');
        await page.getByTestId('scale-step-dialog').waitFor({ state: 'visible' });
      },
      target: 'scale-step-dialog',
      padding: 8,
    },
    {
      // Preferences ▸ Standard scale…
      kind: 'shot',
      name: 'standard-scale',
      setup: async (page, kit) => {
        await kit.choose('Preferences ▸ Standard scale…');
        await page.getByTestId('standard-scale-dialog').waitFor({ state: 'visible' });
      },
      target: 'standard-scale-dialog',
      padding: 8,
    },
    {
      // Preferences ▸ Split suffix…
      kind: 'shot',
      name: 'split-suffix',
      setup: async (page, kit) => {
        await kit.choose('Preferences ▸ Split suffix'); // its label ends with the suffix in use
        await page.getByTestId('split-suffix-dialog').waitFor({ state: 'visible' });
      },
      target: 'split-suffix-dialog',
      padding: 8,
    },
    {
      // Edit ▸ Default intro & outro…
      kind: 'shot',
      name: 'default-animations',
      setup: async (page, kit) => {
        await kit.choose('Edit ▸ Default intro & outro…');
        await page.getByTestId('default-animations-dialog').waitFor({ state: 'visible' });
      },
      target: 'default-animations-dialog',
      padding: 8,
    },
    {
      // File ▸ Project settings…
      kind: 'shot',
      name: 'project-settings',
      setup: async (page, kit) => {
        await kit.choose('File ▸ Project settings…');
        await page.getByTestId('settings-dialog').waitFor({ state: 'visible' });
      },
      target: 'settings-dialog',
      padding: 8,
    },
    {
      // Preferences ▸ Editor palettes…
      kind: 'shot',
      name: 'editor-palettes',
      setup: async (page, kit) => {
        await kit.choose('Preferences ▸ Editor palettes…');
        await page.getByTestId('palette-library').waitFor({ state: 'visible' });
      },
      target: 'palette-library',
      padding: 8,
    },
    {
      // The buttons of the Preview's toolbar that switch preferences, with the grid controls of
      // the bar under the Preview.
      kind: 'shot',
      name: 'preview-tools',
      setup: async (page, kit) => {
        await kit.seek(13.1);
      },
      target: 'preview-tools',
      // Room under the buttons for their numbers: a marker is as big as a button, so on the ring it
      // would cover the icon it names.
      padding: { top: 8, right: 10, bottom: 38, left: 10 },
      highlight: [
        ...TOOLS.map((target) => ({ target })),
        ...TOOLS.map((tool, index) => ({
          target: async (page, kit) => {
            const button = await kit.box(tool);
            return { x: button.x + button.width / 2, y: button.y + button.height + 20, width: 0, height: 0 };
          },
          label: index + 1,
          markerAt: 'top',
        })),
      ],
    },
    {
      kind: 'shot',
      name: 'grid-controls',
      setup: async (page, kit) => {
        await kit.setPreference({ grid: true });
      },
      target: '.transport-grid',
      padding: 12,
    },
  ],
};
