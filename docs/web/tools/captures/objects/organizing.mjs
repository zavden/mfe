/* Captures of objects/organizing: the search of formulas, selecting by region, the menu of the
 * kinds, groups in the Creator, Edit together, the Standard scale and Unlink formula.
 *
 * The project is `docs/web/examples/organizing-set.mfe.json`: nine formulas and two LaTeX texts
 * (a title and a note), five clips on two tracks, and the formula `pythagoras` on the timeline
 * twice. Where an item needs a font text or groups, its setup adds them. */

import { widenCreator } from '../_shared/creator-panel.mjs';

const GROUPS = '/src/ui/creator/groups/groupActions.ts';
const MODEL = '/src/model/index.ts';

/** The formula named `name`, as a Playwright locator of its card in the Creator's list. */
const row = (name) => `[data-testid="formula-list"] [data-name="${name}"]`;
/** A result of the search, by the object's name. */
const result = (name) => `[data-testid="formula-search-result"][data-name="${name}"]`;

/** Adds a font text to the project, as the composition editor's Apply would. Nothing shapes it
 * here (no companion): it is a text drawn as boxes, which is enough to be of its kind. */
async function addFontText(page, kit) {
  await kit.app(
    MODEL,
    (module, spec) => {
      const mfe = window.__mfe;
      const formula = module.createFormulaOfKind('text', {
        name: spec.name,
        source: spec.source,
        fontSize: 40,
      });
      mfe.useProjectStore.getState().update((draft) => {
        draft.formulas.push(formula);
      });
    },
    { name: 'caption', source: 'Pythagoras and friends' },
  );
  await kit.clearSelection();
  await kit.settle({ renders: false });
}

/** Selects formulas by name, in the Creator (no pointer). */
async function selectFormulas(kit, names) {
  const ids = [];
  for (const name of names) ids.push((await kit.formula(name)).id);
  await kit.mfe((mfe, list) => {
    mfe.useUiStore.getState().select(
      list.length === 1 ? { kind: 'formula', id: list[0] } : { kind: 'formulas', ids: list },
    );
  }, ids);
}

/** Opens the search with Ctrl/⌘+F and, when asked, types a query. */
const openSearch = (query) => async (page, kit) => {
  await kit.press('ControlOrMeta+F');
  await page.waitForSelector('[data-testid="formula-search"]');
  if (query) {
    await kit.type(query, { delay: 0 });
    await page.waitForTimeout(300);
  }
  await kit.settle({ renders: false });
};

/** The boxes of the search's result cards, in order. */
const cardBoxes = (page) =>
  page.locator('[data-testid="formula-search-result"]').evaluateAll((cards) =>
    cards.map((card) => {
      const { x, y, width, height } = card.getBoundingClientRect();
      return { x, y, width, height, name: card.getAttribute('data-name') };
    }),
  );

export default {
  page: 'objects/organizing',
  project: 'docs/web/examples/organizing-set.mfe.json',
  items: [
    {
      // The Creator's toolbar, its parts numbered: the magnifier, the key of the view, the key of
      // the kinds (its menu, D183), the size of the previews («+/−») and + New. One line in this
      // window of 1440.
      kind: 'shot',
      name: 'toolbar',
      target: '.creator-toolbar',
      padding: 10,
      highlight: [
        { target: 'creator-search-open', label: 1, markerAt: 'top-left' },
        { target: 'creator-view-toggle', label: 2, markerAt: 'top' },
        { target: 'creator-kinds', label: 3, markerAt: 'bottom' },
        { target: 'creator-preview-size', label: 4, markerAt: 'top' },
        { target: '.split-button', label: 5, markerAt: 'top-right' },
      ],
    },
    {
      // Ctrl/⌘+F covers the Preview with the search; typing narrows the three tabs at once; Esc
      // gives the Preview back. (The Preview below it is as it was left.)
      kind: 'clip',
      name: 'search-open',
      target: 'panel-preview',
      keysAt: 'top-right',
      // The pointer waits on the panel's title: over the formula it would read as part of it.
      cursorStart: async (page, kit) => {
        const panel = await kit.box('panel-preview');
        return { x: panel.x + 150, y: panel.y + 20 };
      },
      holdStart: 250,
      holdEnd: 400,
      loop: false,
      setup: async (page, kit) => {
        await kit.seek(5.5);
      },
      act: async (page, kit) => {
        await kit.press('ControlOrMeta+F');
        await page.waitForSelector('[data-testid="formula-search"]');
        await kit.pause(500);
        await kit.type('pi', { delay: 220 });
        await kit.pause(1100);
        await kit.press('Escape');
        await kit.pause(500);
      },
    },
    {
      // The search with a query: the field, the three tabs with how many each finds, the
      // results as cards, and the button that closes it.
      kind: 'shot',
      name: 'search-panel',
      // The panel down to its last row of cards.
      target: async (page, kit) => {
        const panel = await kit.box('formula-search');
        const grid = await kit.box('.formula-search-grid');
        return { x: panel.x, y: panel.y, width: panel.width, height: grid.y + grid.height - panel.y + 14 };
      },
      padding: 6,
      setup: openSearch('pi'),
      highlight: [
        { target: 'formula-search-input', label: 1, markerAt: 'left' },
        { target: '.formula-search-tabs', label: 2, markerAt: 'left' },
        { target: '.formula-search-grid', label: 3, markerAt: 'right' },
        { target: 'formula-search-close', label: 4, markerAt: 'left' },
      ],
    },
    {
      // A card of the results: the rendering, the tag, the name, how many clips use it, a line
      // of the source and the group it is in.
      kind: 'shot',
      name: 'result-card',
      target: result('circle_area'),
      padding: { top: 8, right: 38, bottom: 8, left: 8 },
      setup: [
        async (page, kit) => {
          await selectFormulas(kit, ['circle_area', 'circle_length', 'slope']);
          await kit.app(
            GROUPS,
            (module) => module.renameGroup(module.groupSelectedFormulas(), 'Circles'),
          );
          await kit.clearSelection();
        },
        openSearch('circle'),
      ],
      highlight: [
        {
          target: `${result('circle_area')} .search-card-row`,
          label: 1,
          markerAt: 'right',
          pad: { top: 3, right: 14, bottom: 3, left: 3 },
        },
        {
          target: `${result('circle_area')} [data-testid="formula-search-source"]`,
          label: 2,
          markerAt: 'right',
          pad: { top: 3, right: 14, bottom: 3, left: 3 },
        },
        {
          target: `${result('circle_area')} [data-testid="formula-search-group"]`,
          label: 3,
          markerAt: 'right',
          pad: { top: 3, right: 14, bottom: 3, left: 3 },
        },
      ],
    },
    {
      // A rectangle dragged over the empty space between the cards selects the ones it touches;
      // Ctrl/⌘ takes out (Shift adds, as everywhere: the text says it). Only the results are
      // recorded.
      kind: 'clip',
      name: 'region-select',
      target: 'formula-search-results',
      padding: 4,
      keysAt: 'top-right',
      // The pointer starts on the panel's title, above the frame: no card is under it at first.
      cursorStart: async (page, kit) => {
        const panel = await kit.box('formula-search');
        return { x: panel.x + 120, y: panel.y + 20 };
      },
      holdStart: 250,
      holdEnd: 500,
      loop: false,
      setup: openSearch(),
      act: async (page, kit) => {
        const boxes = await cardBoxes(page);
        const around = (box, dx, dy) => ({ x: box.x + dx, y: box.y + dy });
        const last = (box) => around(box, box.width - 14, box.height - 14);
        // 1. From the gap above-left of the first card to the third one: they become the selection.
        await kit.drag(around(boxes[0], -6, -6), last(boxes[2]), { duration: 700 });
        await kit.pause(500);
        // 2. Ctrl/⌘: the second card of the first row goes out.
        await kit.drag(around(boxes[1], -6, -6), last(boxes[1]), {
          hold: ['ControlOrMeta'],
          duration: 600,
        });
        await kit.pause(600);
      },
    },
    {
      // A region in the Creator's own list (D172), in the block view: a rectangle from the free
      // space under the blocks selects the ones it touches; then, Alt held, one that starts on a
      // block — whose drag onto the timeline does not start.
      kind: 'clip',
      name: 'creator-region',
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        const list = await kit.box('formula-list');
        return { x: panel.x, y: list.y - 4, width: panel.width, height: 380 };
      },
      keysAt: 'bottom-right',
      // The pointer starts on the panel's title: a block under it would show its tooltip.
      cursorStart: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        return { x: panel.x + 120, y: panel.y + 20 };
      },
      holdStart: 250,
      holdEnd: 400,
      loop: false,
      setup: async (page, kit) => {
        await kit.setPreference({ creatorView: 'grid' });
        await widenCreator(page, kit, 260);
      },
      act: async (page, kit) => {
        const blocks = await page
          .locator('[data-testid="formula-list"] [data-testid="formula-block"]')
          .evaluateAll((items) =>
            items.map((item) => {
              const { x, y, width, height } = item.getBoundingClientRect();
              return { x, y, width, height };
            }),
          );
        const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
        const last = blocks[blocks.length - 1];
        // 1. From the free space under the last row, up over the blocks of the second row.
        await kit.drag(
          { x: last.x + last.width + 30, y: last.y + last.height + 24 },
          centre(blocks[3]),
          { duration: 800 },
        );
        await kit.pause(500);
        // 2. Alt held: from the middle of the first block to the second.
        await kit.drag(centre(blocks[0]), centre(blocks[1]), { hold: ['Alt'], duration: 600 });
        await kit.pause(600);
      },
    },
    {
      // The pointer on the key of the kinds drops its menu (D183); its rows add up: formulas, then
      // the LaTeX texts, then the font text, the menu staying open; the first row again takes the
      // formulas out and leaves the others. Off the key and the menu, it closes.
      kind: 'clip',
      name: 'kind-keys',
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        return { x: panel.x, y: panel.y, width: panel.width, height: 452 };
      },
      keysAt: 'bottom-right',
      // The pointer waits on the panel's title: a block under it would show its tooltip.
      cursorStart: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        return { x: panel.x + 120, y: panel.y + 20 };
      },
      holdStart: 250,
      holdEnd: 450,
      loop: false,
      setup: [
        addFontText,
        async (page, kit) => {
          await kit.setPreference({ creatorView: 'grid' });
          await widenCreator(page, kit, 260);
        },
      ],
      act: async (page, kit) => {
        await kit.hover('creator-kinds', { pause: 300 });
        await kit.waitFor('creator-kinds-menu');
        await kit.click('creator-select-all-math', { after: 450 });
        await kit.click('creator-select-all-tex', { after: 450 });
        await kit.click('creator-select-all-text', { after: 450 });
        await kit.click('creator-select-all-math', { after: 500 });
        const panel = await kit.box('panel-creator');
        await kit.move({ x: panel.x + 120, y: panel.y + 20 });
        await kit.waitFor('creator-kinds-menu', { state: 'detached' });
      },
    },
    {
      // A group, closed: one row with the drawings of its first formulas and how many it has.
      kind: 'shot',
      name: 'group-row',
      target: '[data-testid="formula-group"]',
      padding: 8,
      setup: async (page, kit) => {
        await widenCreator(page, kit, 260);
        await selectFormulas(kit, ['circle_area', 'circle_length', 'slope']);
        await kit.app(
          GROUPS,
          (module) => module.renameGroup(module.groupSelectedFormulas(), 'Circles'),
        );
        await kit.clearSelection();
        await page.evaluate(() => document.activeElement?.blur());
        await kit.settle({ renders: false });
      },
    },
    {
      // The menu of a group's row: its formulas' menu, with Rename group and Ungroup.
      kind: 'shot',
      name: 'group-menu',
      // The top of the Creator, down to the lower of the open group's last row and the menu.
      target: async (page, kit) => {
        const panel = await kit.box('panel-creator');
        const menu = await kit.box('formula-menu');
        const bottom = Math.max(menu.y + menu.height, panel.y + 440);
        const right = Math.max(panel.x + panel.width, menu.x + menu.width);
        return { x: panel.x, y: panel.y, width: right - panel.x, height: bottom - panel.y };
      },
      cursor: true,
      setup: [
        async (page, kit) => {
          await widenCreator(page, kit, 260);
          await selectFormulas(kit, ['circle_area', 'circle_length', 'slope']);
          await kit.app(
            GROUPS,
            (module) => module.renameGroup(module.groupSelectedFormulas(), 'Circles'),
          );
          await kit.settle({ renders: false });
          await kit.click('formula-group-toggle');
          await kit.rightClick({ css: '[data-testid="formula-group"]' });
          await page.waitForSelector('[data-testid="formula-menu"]');
          await kit.settle({ renders: false });
        },
      ],
    },
    {
      // Edit together: the glyphs of several formulas in one dialog, the exponents of two of them
      // picked with Ctrl/⌘+click and given one colour, and the two tools of the whole formulas,
      // Scale (mixed: one formula is smaller) and Match colors.
      kind: 'shot',
      name: 'edit-together',
      viewport: { width: 1000, height: 700 },
      target: 'multi-editor',
      padding: 6,
      setup: async (page, kit) => {
        // One formula smaller than the others, so the Scale field says "mixed".
        await kit.mfe((mfe) => {
          mfe.useProjectStore.getState().update((draft) => {
            const f = draft.formulas.find((x) => x.name === 'circle_length');
            if (f) f.fontSize = 48;
          });
        });
        await selectFormulas(kit, ['pythagoras', 'circle_area', 'circle_length']);
        await kit.rightClick({ css: row('pythagoras') });
        await kit.click('formula-menu-edit-together');
        await page.waitForSelector('[data-testid="multi-editor"]');
        await kit.settle();
        const glyph = async (name, index) => {
          const formula = await kit.formula(name);
          return { css: `[data-testid="multi-${formula.id}-${index}"]` };
        };
        await kit.click(await glyph('pythagoras', 1));
        await kit.click(await glyph('pythagoras', 4), { hold: ['ControlOrMeta'] });
        await kit.click(await glyph('pythagoras', 7), { hold: ['ControlOrMeta'] });
        await kit.click(await glyph('circle_area', 4), { hold: ['ControlOrMeta'] });
        await kit.click('multi-palette-BLUE');
        await kit.click('multi-clear-selection');
        await kit.settle();
      },
    },
    {
      // Preferences > Standard scale…: the size new formulas and texts are born with.
      kind: 'shot',
      name: 'standard-scale',
      target: 'standard-scale-dialog',
      padding: 8,
      setup: async (page, kit) => {
        // One formula at another scale, so that Apply to all formulas has something to do.
        await kit.mfe((mfe) => {
          mfe.useProjectStore.getState().update((draft) => {
            const f = draft.formulas.find((x) => x.name === 'circle_length');
            if (f) f.fontSize = 48;
          });
        });
        await kit.choose('Preferences ▸ Standard scale…');
        await page.waitForSelector('[data-testid="standard-scale-dialog"]');
        await kit.click('standard-scale-math');
        await kit.press('ControlOrMeta+A');
        await kit.type('3/2', { delay: 0 });
        await kit.settle({ renders: false });
      },
    },
    {
      // Unlink formula: the first clip of pythagoras gets a copy of its own, which the Creator
      // lists right after the original.
      kind: 'tour',
      name: 'unlink',
      target: { x: 0, y: 50, width: 560, height: 850 },
      scale: 1,
      setup: async (page, kit) => {
        await widenCreator(page, kit, 170);
        await kit.click('timeline-fit');
        await kit.seek(2.5);
      },
      steps: [
        {
          caption:
            'Right-click a clip whose formula other clips use. Its menu has ' +
            '<span class="ui">Unlink formula (make a copy)</span>.',
          act: async (page, kit) => {
            await kit.rightClick({ clip: 'pythagoras', index: 0 });
            await page.waitForSelector('[data-testid="add-animation-menu"]');
            await kit.settle({ renders: false });
          },
          focus: ['clip-menu-unlink'],
        },
        {
          caption:
            'The Creator lists a copy, <code>pythagoras2</code>, right after the original, and the ' +
            'clip shows it. The other clip of <code>pythagoras</code> keeps the original.',
          act: async (page, kit) => {
            await kit.click('clip-menu-unlink');
            await kit.settle({ renders: false });
          },
          focus: [{ css: '[data-testid="formula-list"] [data-name="pythagoras2"]' }, { clip: 'pythagoras2' }],
        },
      ],
    },
  ],
};
