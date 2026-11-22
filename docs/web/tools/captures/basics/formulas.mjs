/* Captures of basics/formulas: the formula editor, its LaTeX field, its errors, its packages, its
 * size, colour, name and tag, and the Creator list that holds the formulas.
 *
 * The project is `docs/web/examples/formulas-ladder.mfe.json`: six formulas written one after another
 * (plain, fractions, quadratic, series, integral, rows), so the Creator has something to list. */

import { widenCreator } from '../_shared/creator-panel.mjs';

const EDITOR_STORE = '/src/ui/creator/formulaEditorStore.ts';
const ACTIONS = '/src/ui/creator/formulaActions.ts';

/** Waits until the editor's status line has rendered the draft: "16 glyphs · MathJax". */
async function rendered(page) {
  await page.waitForFunction(
    () =>
      /glyphs/.test(
        document.querySelector('[data-testid="editor-status"]')?.textContent ?? '',
      ),
    null,
    { timeout: 15_000 },
  );
}

/** Opens the editor of the formula named `name`, as a double-click on its card does. */
const openEditor = (name) => async (page, kit) => {
  const formula = await kit.formula(name);
  await kit.app(EDITOR_STORE, (module, id) => module.openFormulaEditor(id), formula.id);
  await page.waitForSelector('[data-testid="formula-editor"]');
  await rendered(page);
  await page.evaluate(() => document.activeElement?.blur());
  await kit.settle();
};

/** Opens the editor of a brand-new, empty formula, as + New does. */
async function openNewEditor(page, kit) {
  const id = await kit.app(ACTIONS, (module) => module.createNewFormula('math'));
  await kit.app(EDITOR_STORE, (module, formulaId) => module.openFormulaEditor(formulaId, true), id);
  await page.waitForSelector('[data-testid="formula-editor"]');
  await kit.settle();
}

/** Waits until the visual field of the editor has the focus. */
async function focusedField(page) {
  await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', null, {
    timeout: 15_000,
  });
}

/** Adds a formula to the project, as the Creator would after Apply. */
const addFormula = (name, source) => async (page, kit) => {
  await kit.app(
    ACTIONS,
    (module, spec) => {
      const id = module.createNewFormula('math');
      module.renameFormula(id, spec.name);
      module.applyFormulaSource(id, { source: spec.source, packages: [] });
      return id;
    },
    { name, source },
  );
  await kit.waitForRenders();
  await kit.clearSelection();
};

/** Types `source` into the raw LaTeX field of the new formula's editor and waits for the editor
 * to answer it: an error under the Apply row, or the glyph count. */
const typeSource = (source, { fails }) => async (page, kit) => {
  await kit.click('raw-latex');
  await kit.type(source, { delay: 0 });
  if (fails) await page.waitForSelector('[data-testid="editor-error"]');
  else await rendered(page);
};

/** The formula card named `name`, in the list or in the block view. */
const card = (name) => `[data-testid="formula-list"] [data-name="${name}"]`;

/** The part of the editor that explains an error: the packages, the Apply row and its error. */
const errorArea = { union: ['package-picker', '.apply-row', 'editor-error'] };

export default {
  page: 'basics/formulas',
  project: 'docs/web/examples/formulas-ladder.mfe.json',
  items: [
    {
      // The Creator of an empty project: the toolbar, what to press first, and under it the ways
      // to a project that exists (Try an example and Sync folder…).
      kind: 'shot',
      name: 'creator-empty',
      project: null,
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        const example = await kit.box('creator-example');
        return { x: panel.x, y: panel.y, width: panel.width, height: example.y + example.height + 14 - panel.y };
      },
    },
    {
      // The arrow of + New lists every kind of object. (The Creator a little wider, the keys left
      // of + New out of the picture.)
      kind: 'shot',
      name: 'new-menu',
      project: null,
      target: { union: ['creator-new', 'creator-new-kinds'] },
      padding: 10,
      setup: async (page, kit) => {
        await widenCreator(page, kit, 60);
      },
      steps: async (page, kit) => {
        await kit.click('creator-new-menu');
      },
    },
    {
      // The formula editor, step by step: the header, the two LaTeX fields, the packages, the
      // Apply row with its status line, and the glyph column.
      kind: 'tour',
      name: 'editor',
      target: 'formula-editor',
      padding: 10,
      setup: openEditor('quadratic'),
      steps: [
        {
          caption:
            'The header holds what every formula has: its <b>Name</b>, its <b>Tag</b>, its ' +
            '<b>Size</b> and <b>Colour</b>, and <b>Appears with</b>. Each change counts at once.',
          focus: ['.editor-fields'],
        },
        {
          caption:
            'The <b>LaTeX</b> field is a visual math editor; <b>Raw LaTeX</b> under it is the ' +
            'same formula as text. Type in either, and the other follows. ' +
            '<span class="ui">⌨ Keyboard</span>, beside the title, shows keys that write in the ' +
            'visual field.',
          focus: [{ union: ['toggle-keyboard', 'math-field-host', 'raw-latex'] }],
        },
        {
          caption:
            '<b>Packages</b> adds the LaTeX packages a formula needs: a common one, one found in ' +
            'the catalogue, or any name you type.',
          focus: ['package-picker'],
        },
        {
          caption:
            '<span class="ui">Apply</span> (<kbd data-keys="Mod+Enter">Ctrl+Enter</kbd>) puts ' +
            'the LaTeX and the packages into the project as one undo step. The line beside it ' +
            'says what the renderer made of the draft.',
          focus: ['.apply-row'],
        },
        {
          caption:
            'The <b>Glyphs</b> column draws the formula the project holds, glyph by glyph: ' +
            'colour them or hide them from here.',
          focus: ['section[aria-label="Glyph colours"]'],
        },
      ],
    },
    {
      // A new formula typed in the raw field, with the visual field following, the status line
      // counting the glyphs, and Apply drawing them.
      kind: 'clip',
      name: 'type-formula',
      target: 'formula-editor',
      padding: 6,
      // The pointer waits on the dialog's title, away from the fields.
      cursorStart: async (page, kit) => {
        const dialog = await kit.box('formula-editor');
        return { x: dialog.x + 260, y: dialog.y + 24 };
      },
      holdStart: 250,
      holdEnd: 450,
      loop: false,
      setup: openNewEditor,
      act: async (page, kit) => {
        await kit.click('raw-latex');
        await kit.type('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', { delay: 28 });
        await kit.pause(600);
        await kit.click('editor-apply');
        await kit.pause(600);
      },
    },
    {
      // The ⌨ Keyboard key beside the LaTeX title, pressed: the editor's keypad under the visual
      // field, its Algebra tab, and what four of its keys wrote — a fraction, 1, → and 2 — in the
      // field and in the raw LaTeX. (Every item has a browser of its own: the keypad left shown
      // here, a preference of the browser, opens with no other item's editor.)
      kind: 'shot',
      name: 'keyboard',
      // The LaTeX section, from its title down to the raw LaTeX: with the keypad in it, the dialog
      // is as tall as the window and scrolls the packages under its footer, which is not what the
      // picture is about.
      target: { union: ['.latex-head', 'raw-latex'] },
      // Above: not the line under Appears with. Right: not the scroll bar of the column.
      padding: { top: 4, right: 4, bottom: 10, left: 12 },
      highlight: [
        { target: 'toggle-keyboard', label: 1, markerAt: 'left' },
        { target: '.formula-keypad [role="tablist"]', label: 2, markerAt: 'left', pad: 2 },
        {
          target: { union: ['keypad-key-left', 'keypad-key-apply'] },
          label: 3,
          markerAt: 'left',
          pad: 2,
        },
      ],
      setup: [
        openNewEditor,
        async (page, kit) => {
          // MathLive takes the focus of the visual field a moment after it is asked to: a press
          // of the key made before would keep it.
          await focusedField(page);
          await kit.click('toggle-keyboard');
          await kit.waitFor('keypad-key-apply');
          await focusedField(page);
          for (const key of ['frac', 'd1', 'right', 'd2']) await kit.click(`keypad-key-${key}`);
          // The draft rendered: the 1, the bar and the 2.
          await page.waitForFunction(
            () =>
              /^3 glyphs/.test(
                document.querySelector('[data-testid="editor-status"]')?.textContent ?? '',
              ),
            null,
            { timeout: 15_000 },
          );
          // The field without its focus ring, which would read as one of the picture's rings.
          await page.evaluate(() => document.activeElement?.blur());
          await kit.move({ x: 4, y: 4 });
          await kit.settle();
        },
      ],
    },
    {
      // What the editor says of a brace left open.
      kind: 'shot',
      name: 'error-brace',
      target: { union: ['.apply-row', 'editor-error'] },
      padding: { top: 2, right: 10, bottom: 10, left: 10 },
      setup: [
        openNewEditor,
        typeSource('\\frac{a}{b', { fails: true }),
        async (page, kit) => {
          await page.evaluate(() => document.activeElement?.blur());
          await kit.settle();
        },
      ],
    },
    {
      // A command from a package that is not loaded: the error names the package, and the
      // Common row offers it.
      kind: 'shot',
      name: 'error-package',
      target: errorArea,
      padding: { top: 28, right: 10, bottom: 10, left: 10 },
      setup: [
        openNewEditor,
        typeSource('\\frac{\\cancel{x}\\,y}{\\cancel{x}\\,z}', { fails: true }),
        async (page, kit) => {
          await page.evaluate(() => document.activeElement?.blur());
          await kit.settle();
        },
      ],
      highlight: [{ target: 'package-quick-cancel', label: 1, markerAt: 'top' }],
    },
    {
      // The same formula after one click on cancel in the Common row: the chip, and the formula
      // renders.
      kind: 'shot',
      name: 'error-fixed',
      // No error panel any more: the packages and the Apply row with its status line.
      target: { union: ['package-picker', '.apply-row'] },
      padding: { top: 28, right: 10, bottom: 10, left: 10 },
      setup: [
        openNewEditor,
        typeSource('\\frac{\\cancel{x}\\,y}{\\cancel{x}\\,z}', { fails: true }),
        async (page, kit) => {
          await kit.click('package-quick-cancel');
          await page.waitForFunction(
            () => !document.querySelector('[data-testid="editor-error"]'),
            null,
            { timeout: 15_000 },
          );
          await rendered(page);
          await page.evaluate(() => document.activeElement?.blur());
          await kit.settle();
        },
      ],
      highlight: [{ target: 'package-chip-cancel', label: 1, markerAt: 'right' }],
    },
    {
      // The package picker: a chip per package, the search with its results, the Common row,
      // and the note of a package MathJax cannot load.
      kind: 'shot',
      name: 'packages-picker',
      project: 'docs/web/examples/formulas-packages.mfe.json',
      // Taller than the default window: the results and the notes make the editor grow.
      viewport: { width: 1440, height: 1200 },
      target: 'package-picker',
      padding: { top: 28, right: 8, bottom: 8, left: 8 },
      setup: [
        openEditor('derivative'),
        async (page, kit) => {
          await kit.click('package-quick-tikz-cd');
          await kit.click('package-search');
          await kit.type('mat', { delay: 0 });
          await page.waitForSelector('[data-testid="package-results"]');
          await kit.settle();
        },
      ],
    },
    {
      // The header of the editor with its five fields numbered: the text of the sections about
      // the size, the colour, the name and the tag refers to them.
      kind: 'shot',
      name: 'header-fields',
      target: '.editor-fields',
      padding: { top: 10, right: 8, bottom: 8, left: 14 },
      setup: openEditor('quadratic'),
      highlight: [
        { target: 'editor-name', label: 1, markerAt: 'left', pad: { left: 16, top: 3, right: 3, bottom: 3 } },
        {
          target: { union: ['tag-color-58C4DD', 'editor-tag-icon'] },
          label: 2,
          markerAt: 'left',
          pad: { left: 16, top: 3, right: 3, bottom: 3 },
        },
        {
          target: { union: ['editor-scale', 'editor-font-size'] },
          label: 3,
          markerAt: 'left',
          pad: { left: 16, top: 3, right: 3, bottom: 3 },
        },
        {
          target: { union: ['editor-color', 'editor-color-hex'] },
          label: 4,
          markerAt: 'left',
          pad: { left: 16, top: 3, right: 3, bottom: 3 },
        },
        { target: 'editor-intro', label: 5, markerAt: 'right', pad: { left: 3, top: 3, right: 14, bottom: 3 } },
      ],
    },
    {
      // A name becomes a Python variable: a space is refused, with the reason under the field.
      kind: 'shot',
      name: 'name-rule',
      target: { union: ['editor-name', 'editor-name-error'] },
      // Left: room for the "Name" label that stands before the field.
      padding: { top: 12, right: 12, bottom: 3, left: 110 },
      setup: [
        openEditor('quadratic'),
        async (page, kit) => {
          await kit.click('editor-name');
          await kit.press('ControlOrMeta+A');
          await kit.type('my formula', { delay: 0 });
          await page.waitForSelector('[data-testid="editor-name-error"]');
          await kit.settle();
        },
      ],
    },
    {
      // The Creator, widened by dragging the bar beside it, in its list view: the first cards.
      kind: 'shot',
      name: 'list-view',
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        return { x: panel.x, y: panel.y, width: panel.width, height: 460 };
      },
      setup: async (page, kit) => {
        await widenCreator(page, kit);
      },
    },
    {
      // One card of the list, its parts numbered.
      kind: 'shot',
      name: 'card-parts',
      target: card('quadratic'),
      padding: { top: 26, right: 8, bottom: 6, left: 26 },
      setup: async (page, kit) => {
        await widenCreator(page, kit, 300);
      },
      highlight: [
        { target: `${card('quadratic')} [data-testid="formula-tag"]`, label: 1, markerAt: 'left' },
        { target: `${card('quadratic')} [data-testid="formula-name"]`, label: 2, markerAt: 'top' },
        { target: `${card('quadratic')} [data-testid="formula-kind"]`, label: 3, markerAt: 'top' },
        { target: `${card('quadratic')} [data-testid="formula-status"]`, label: 4, markerAt: 'top' },
        { target: `${card('quadratic')} .badge-clips`, label: 5, markerAt: 'top' },
        { target: `${card('quadratic')} .formula-actions`, label: 6, markerAt: 'top-right' },
      ],
    },
    {
      // The block view: a square per formula, and the tooltip with the rendering beside the
      // block the pointer is on. The Creator keeps the width it starts with: two columns of
      // blocks wide enough for their ordinary face (the compact one is `block-compact`, below).
      kind: 'shot',
      name: 'block-view',
      // The top of the Creator, down below the third row of blocks, and the tooltip beside them.
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        const tip = await kit.box('formula-tooltip');
        const last = await kit.box({ css: `[data-testid="formula-list"] [data-name="rows"]` });
        return {
          x: panel.x,
          y: panel.y,
          width: Math.max(panel.width, tip.x + tip.width - panel.x),
          height: last.y + last.height + 12 - panel.y,
        };
      },
      cursor: true,
      setup: async (page, kit) => {
        await kit.setPreference({ creatorView: 'grid' });
        await kit.hover({ css: `[data-testid="formula-list"] [data-name="fractions"]` }, { pause: 900 });
        await page.waitForSelector('[data-testid="formula-tooltip"]');
        await kit.settle();
      },
    },
    {
      // The compact face of a block: a Creator wide enough for six columns, whose blocks are
      // narrower than 112 px — each glass tinted with its tag's colour, with its name —, and the
      // pointer on the last one, which shows its corners.
      kind: 'shot',
      name: 'block-compact',
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        const tip = await kit.box('formula-tooltip');
        return {
          x: panel.x,
          y: panel.y,
          width: Math.max(panel.width, tip.x + tip.width - panel.x),
          height: 300,
        };
      },
      cursor: true,
      setup: async (page, kit) => {
        await kit.setPreference({ creatorView: 'grid' });
        await widenCreator(page, kit, 330);
        await kit.hover({ css: `[data-testid="formula-list"] [data-name="rows"]` }, { pause: 900 });
        await page.waitForSelector('[data-testid="formula-tooltip"]');
        await kit.settle();
      },
      highlight: [
        { target: `[data-name="plain"] [data-testid="formula-name"]`, label: 1, markerAt: 'bottom', pad: 3 },
        { target: `[data-name="rows"] .formula-block-actions`, label: 2, markerAt: 'top', pad: 1 },
        { target: `[data-name="rows"] .formula-block-foot`, label: 3, markerAt: 'bottom-left', pad: 1 },
        { target: `[data-name="rows"] .formula-block-head`, label: 4, markerAt: 'bottom-right', pad: 1 },
      ],
    },
    {
      // The size of the previews (D173): the list view at 2×, its key «+/−» ringed (D183).
      kind: 'shot',
      name: 'preview-size',
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        return { x: panel.x, y: panel.y, width: panel.width, height: 460 };
      },
      setup: async (page, kit) => {
        await widenCreator(page, kit);
        await kit.setPreference({ creatorListPreview: 2 });
        await kit.settle();
      },
      highlight: [{ target: 'creator-preview-size', pad: 3 }],
    },
    {
      // Deleting a formula asks first, and lists what goes with it.
      kind: 'shot',
      name: 'delete-confirm',
      target: 'dialog',
      padding: 8,
      setup: async (page, kit) => {
        await kit.click({ css: `${card('plain')} [data-testid="formula-delete"]` });
        await page.waitForSelector('[data-testid="dialog"]');
        await kit.settle();
      },
    },
    {
      // Duplicate: a copy right after the original, named with the next number.
      kind: 'clip',
      name: 'duplicate',
      target: async (page, kit) => {
        const first = await kit.box(card('plain'));
        const list = await kit.box('formula-list');
        return { x: list.x, y: first.y - 6, width: list.width, height: 372 };
      },
      holdStart: 250,
      holdEnd: 500,
      loop: false,
      setup: async (page, kit) => {
        await widenCreator(page, kit, 250);
      },
      act: async (page, kit) => {
        await kit.hover({ css: `${card('fractions')}` }, { pause: 300 });
        await kit.click({ css: `${card('fractions')} [data-testid="formula-duplicate"]` });
        await kit.pause(800);
      },
    },
    {
      // The glyphs of \frac{a}{b} as MathJax numbers them: the numerator, the denominator, then
      // the bar.
      kind: 'shot',
      name: 'order-fraction',
      // The top of the glyph column: its drawing and the keys with the glyphs' numbers.
      target: async (page, kit) => {
        const column = await kit.box('section[aria-label="Glyph colours"]');
        return { x: column.x, y: column.y, width: column.width, height: 286 };
      },
      padding: { top: 8, right: 8, bottom: 6, left: 8 },
      setup: [
        addFormula('fraction', '\\frac{a}{b}'),
        async (page, kit) => {
          await kit.setPreference({ glyphList: true });
          await openEditor('fraction')(page, kit);
        },
      ],
    },
  ],
};
