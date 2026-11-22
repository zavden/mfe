/* Captures of color/coloring: a formula's colour and the glyph view in the Creator, picking and
 * colouring glyphs in the Preview, copying a colour to the clipboard and typing a colour, colours
 * in order (Shift+C) and a colour sequence copied from one pick to another.
 *
 * Projects: `color-coloring-order` (y = mx + b, then y = 2x + 1: m and b coloured) and
 * `color-coloring-sequence` (ax² + bx + c = 0 and a sentence with the same letters). A setup
 * takes the glyph colours off, so that each capture colours from nothing. */

const ORDER = 'docs/web/examples/color-coloring-order.mfe.json';
const SEQUENCE = 'docs/web/examples/color-coloring-sequence.mfe.json';

/** Takes the glyph colours off the formulas called `names` (an undo step of its own). */
const plain =
  (...names) =>
  (page, kit) =>
    kit.mfe((mfe, wanted) => {
      mfe.useProjectStore.getState().update((draft) => {
        for (const formula of draft.formulas) {
          if (wanted.includes(formula.name)) formula.glyphColors = {};
        }
      });
    }, names);

/** Both formulas of `color-coloring-order` on screen together, the second under the first, and
 * the playhead among them. */
const stacked = async (page, kit) => {
  await kit.mfe((mfe) => {
    mfe.useProjectStore.getState().update((draft) => {
      const [first, second] = draft.clips;
      for (const [clip, y] of [
        [first, 1.7],
        [second, -1.5],
      ]) {
        clip.start = 0;
        clip.end = 8;
        clip.initial.position = [0, y];
        clip.intro = { ...clip.intro, kind: 'none', duration: 0 };
      }
      draft.relations = [];
    });
  });
  await kit.seek(2);
};

/** Opens the editor of the formula called `name`, as a double click on its card does. */
const openEditor = (name) => async (page, kit) => {
  const { id } = await kit.formula(name);
  await kit.doubleClick({ css: `[data-testid="formula-list"] [data-formula-id="${id}"]` });
  await page.getByTestId('formula-editor').waitFor();
  await kit.settle();
};

/** Alt+click on a glyph of the Preview (Alt+Shift+click to take a range). In a clip the pointer
 * arrives in `ms` ms, quicker than its default glide. */
const pick = async (kit, name, index, hold = ['Alt'], ms = 320) => {
  const point = await kit.glyphPoint(name, index);
  await kit.move(point, { duration: ms });
  await kit.click(point, { hold, after: 220 });
};

/** Clicks a target, the pointer arriving in `ms` ms. */
const tap = async (kit, target, { ms = 320, ...options } = {}) => {
  await kit.move(target, { duration: ms });
  await kit.click(target, { after: 220, ...options });
};

/** The Preview's frame and every context menu open over it, with room round them. */
const frameAndMenus = async (page, kit) => {
  const frame = await kit.box('preview-frame');
  const menus = await page.locator('.ctx-menu').evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  const boxes = [frame, ...menus];
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** The box round an entry of the open menu bar menu and the submenu that opened from it. */
const entryAndSubmenu = (entry) => async (page, kit) => {
  const first = await kit.box(entry);
  const menus = await page.locator('[role="menu"]').evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  const last = menus[menus.length - 1];
  const left = Math.min(first.x, last.x);
  const top = Math.min(first.y, last.y);
  const right = Math.max(first.x + first.width, last.x + last.width);
  const bottom = Math.max(first.y + first.height, last.y + last.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export default {
  page: 'color/coloring',
  project: ORDER,
  items: [
    {
      // The Creator's editor of a formula, at its Colour row: the picker and the hex field.
      kind: 'shot',
      name: 'formula-colour',
      setup: [
        openEditor('step1'),
        (page) => page.evaluate(() => document.activeElement?.blur()),
      ],
      target: '.editor-fields',
      // Below: not the top of the Keyboard key, beside the LaTeX title under the fields.
      padding: { top: 10, right: 10, bottom: 4, left: 10 },
      highlight: [
        { target: { union: ['editor-color', 'editor-color-hex'] }, label: 1, markerAt: 'right' },
      ],
    },
    {
      // The glyph view of that editor with two glyphs selected: the drawing and its frames (1),
      // the swatches that colour the selection (2), the hex field for any other colour (3).
      kind: 'shot',
      name: 'glyph-view',
      setup: [plain('step1'), openEditor('step1')],
      steps: async (page, kit) => {
        await kit.click('glyph-2-frame');
        await kit.click('glyph-3-frame', { hold: ['Shift'] });
        await kit.move({ x: 4, y: 4 });
      },
      target: { union: ['.editor-glyphs-head', 'glyph-view'] },
      padding: 8,
      highlight: [
        { target: '.glyph-svg', label: 1, markerAt: 'top-left' },
        {
          target: { union: ['palette-WHITE', 'palette-PURPLE'] },
          label: 2,
          markerAt: 'bottom-left',
          pad: 2,
        },
        {
          target: { union: ['glyph-custom-color', 'glyph-custom-color-hex'] },
          label: 3,
          markerAt: 'bottom-right',
          pad: 3,
        },
      ],
    },
    {
      // Colouring in the glyph view: a click on m, Shift+click on x (the range), a swatch; Clear
      // colours puts everything back for the loop.
      kind: 'clip',
      name: 'creator-colour',
      setup: [plain('step1'), openEditor('step1')],
      target: { union: ['.editor-glyphs-head', 'glyph-view'] },
      padding: 8,
      keysAt: 'top-right',
      holdStart: 300,
      holdEnd: 400,
      act: async (page, kit) => {
        await tap(kit, 'glyph-2-frame');
        await tap(kit, 'glyph-3-frame', { hold: ['Shift'] });
        await tap(kit, 'palette-BLUE');
        await kit.pause(450);
        await tap(kit, 'glyph-clear-all');
      },
    },
    {
      // Picking glyphs in the Preview: Alt+click m, Alt+Shift+click x (the range), the bar's
      // Colour menu, a swatch; Esc lets the glyphs go and Ctrl/⌘+Z takes the colour back.
      kind: 'clip',
      name: 'alt-pick',
      setup: [plain('step1'), (page, kit) => kit.seek(1.6)],
      target: 'preview-frame',
      padding: 4,
      keysAt: 'top-right',
      holdStart: 200,
      holdEnd: 250,
      act: async (page, kit) => {
        await pick(kit, 'step1', 2);
        await pick(kit, 'step1', 3, ['Alt', 'Shift']);
        await tap(kit, 'glyph-pick-color');
        await tap(kit, 'glyph-pick-color-menu-color-BLUE');
        await kit.pause(250);
        await kit.press('Escape', { after: 100 });
        await kit.press('ControlOrMeta+Z', { after: 100 });
      },
    },
    {
      // The bar of the picked glyphs.
      kind: 'shot',
      name: 'pick-bar',
      setup: [plain('step1'), (page, kit) => kit.seek(1.6)],
      steps: async (page, kit) => {
        await pick(kit, 'step1', 2);
        await pick(kit, 'step1', 3, ['Alt', 'Shift']);
        await kit.move({ x: 4, y: 4 });
      },
      target: 'preview-frame',
      padding: 4,
      highlight: [{ target: 'glyph-pick', label: 1, markerAt: 'bottom' }],
    },
    {
      // The bar's Colour menu with one glyph picked: the swatches, the Hex field with a colour
      // typed in it (1), and Copy colour to clipboard, with the colour it would copy (2).
      kind: 'shot',
      name: 'colour-menu',
      setup: [(page, kit) => kit.seek(1.6)],
      steps: async (page, kit) => {
        await pick(kit, 'step1', 2);
        await kit.click('glyph-pick-color');
        await kit.click('glyph-pick-color-menu-color-hex');
        await kit.type('12ab9f');
        await kit.pause(200);
      },
      target: frameAndMenus,
      padding: 6,
      highlight: [
        {
          target: {
            union: ['glyph-pick-color-menu-color-hex-sample', 'glyph-pick-color-menu-color-hex-apply'],
          },
          label: 1,
          markerAt: 'right',
        },
        { target: 'glyph-pick-color-menu-copy-colour', label: 2, markerAt: 'right' },
      ],
    },
    {
      // Colours in order: Shift+C, a click on m and one on b copy their colours (in that order);
      // Enter, a click on the 2 and one on the 1 paste them; Ctrl/⌘+Z takes the paste back.
      kind: 'clip',
      name: 'colours-in-order',
      setup: [plain('step2'), stacked],
      target: 'preview-frame',
      padding: 4,
      keysAt: 'top-right',
      holdStart: 200,
      holdEnd: 250,
      act: async (page, kit) => {
        await kit.press('Shift+C', { after: 200 });
        await tap(kit, await kit.glyphPoint('step1', 2));
        await tap(kit, await kit.glyphPoint('step1', 5), { after: 300 });
        await kit.press('Enter', { after: 200 });
        await tap(kit, await kit.glyphPoint('step2', 2));
        await tap(kit, await kit.glyphPoint('step2', 5), { after: 450 });
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
    {
      // The strip of the Animations panel while the colours are copied (two chips, in the order
      // of the clicks)...
      kind: 'shot',
      name: 'order-strip-copy',
      setup: [plain('step2'), stacked],
      steps: async (page, kit) => {
        await kit.press('Shift+C');
        await kit.click(await kit.glyphPoint('step1', 2));
        await kit.click(await kit.glyphPoint('step1', 5));
        await kit.move({ x: 4, y: 4 });
      },
      target: 'colour-order-strip',
      padding: 8,
    },
    {
      // ...and while they are pasted: the first is marked as the next to give out.
      kind: 'shot',
      name: 'order-strip-paste',
      setup: [plain('step2'), stacked],
      steps: async (page, kit) => {
        await kit.press('Shift+C');
        await kit.click(await kit.glyphPoint('step1', 2));
        await kit.click(await kit.glyphPoint('step1', 5));
        await kit.press('Enter');
        await kit.move({ x: 4, y: 4 });
      },
      target: 'colour-order-strip',
      padding: 8,
    },
    {
      // Copy colour sequence: the a, b and c of the equation picked, and the bar's Colour menu
      // with Copy colour sequence (1).
      kind: 'shot',
      name: 'sequence-copy',
      project: SEQUENCE,
      setup: [plain('sentence'), (page, kit) => kit.seek(3.2)],
      steps: async (page, kit) => {
        await pick(kit, 'equation', 0);
        await pick(kit, 'equation', 4);
        await pick(kit, 'equation', 7);
        await kit.click('glyph-pick-color');
        await kit.move({ x: 4, y: 4 });
      },
      target: frameAndMenus,
      padding: 6,
      highlight: [
        { target: 'glyph-pick-color-menu-copy-sequence', label: 1, markerAt: 'right' },
      ],
    },
    {
      // Preferences ▸ Glyph selection colour: the colour of the picked glyphs.
      kind: 'shot',
      name: 'pick-colour',
      steps: async (page, kit) => {
        await kit.openMenu('Preferences ▸ Glyph selection colour');
      },
      target: entryAndSubmenu('menu-item-preferences-pick-color'),
      padding: { top: 34, right: 10, bottom: 34, left: 10 },
    },
    {
      // Edit ▸ Colours in order: Copy… and Paste, with their keys.
      kind: 'shot',
      name: 'order-menu',
      steps: async (page, kit) => {
        await kit.openMenu('Edit ▸ Colours in order');
      },
      target: entryAndSubmenu('menu-item-edit-colours-order'),
      padding: { top: 34, right: 10, bottom: 34, left: 10 },
    },
    {
      // The Colour menu with the sentence's three letters picked: Paste colour sequence, and the
      // line under it that says what would be pasted.
      kind: 'shot',
      name: 'sequence-menu',
      project: SEQUENCE,
      setup: [plain('sentence'), (page, kit) => kit.seek(3.2)],
      steps: async (page, kit) => {
        await pick(kit, 'equation', 0);
        await pick(kit, 'equation', 4);
        await pick(kit, 'equation', 7);
        await kit.click('glyph-pick-color');
        await kit.click('glyph-pick-color-menu-copy-sequence');
        await kit.press('Escape');
        await pick(kit, 'sentence', 4);
        await pick(kit, 'sentence', 6);
        await pick(kit, 'sentence', 10);
        await kit.click('glyph-pick-color');
        await kit.move({ x: 4, y: 4 });
      },
      target: frameAndMenus,
      padding: 6,
      highlight: [
        { target: 'glyph-pick-color-menu-paste-sequence-note', label: 1, markerAt: 'right' },
      ],
    },
  ],
};
