/* Captures of color/match-colors: the Match colors dialog (its lists, its patterns, its preview),
 * making a list, applying it from the Creator, from the Preview's bar and from Edit together, the
 * order of patterns that overlap, and the notice that says what was coloured.
 *
 * Project: the repository's `examples/match-colors.mfe.json` — three lines of a derivation
 * (y = x² + 2x + 1, dy/dx = 2x + 2, y = (x + 1)²) and two lists, "Course colours" (x blue, y
 * yellow, dy/dx green) and "Only x". A setup takes the glyph colours off the formulas, so that
 * applying a list is what colours them. */

const PROJECT = 'examples/match-colors.mfe.json';

/** Takes the glyph colours off every formula (an undo step of its own). */
const plain = (page, kit) =>
  kit.mfe((mfe) => {
    mfe.useProjectStore.getState().update((draft) => {
      for (const formula of draft.formulas) formula.glyphColors = {};
    });
  });

/** Selects the formulas called `names` in the Creator, as a click and a Shift+click would. */
const selectFormulas =
  (...names) =>
  async (page, kit) => {
    await kit.mfe((mfe, wanted) => {
      const { project } = mfe.useProjectStore.getState();
      const ids = project.formulas.filter((f) => wanted.includes(f.name)).map((f) => f.id);
      mfe.useUiStore.getState().select({ kind: 'formulas', ids });
    }, names);
    await kit.settle({ renders: false });
  };

/** The card of the formula called `name` in the Creator's list. */
const card = async (kit, name) => {
  const { id } = await kit.formula(name);
  return { css: `[data-testid="formula-list"] [data-formula-id="${id}"]` };
};

/** The id of the list called `name`. */
const listId = (kit, name) =>
  kit.mfe(
    (mfe, wanted) =>
      mfe.useProjectStore.getState().project.colorMatches.find((m) => m.name === wanted)?.id,
    name,
  );

/** Waits until the dialog's preview has coloured its formula. */
const previewDone = async (page, kit) => {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="match-colors-preview"] .cm-preview-thumb')
        ?.getAttribute('data-status') === 'done',
    null,
    { timeout: 20_000 },
  );
  await kit.settle({ renders: false });
};

/** Opens the Match colors dialog on the list called `name` (what Edit ▸ Match colors ▸ <list>
 * does) and waits for its preview to be drawn. */
const openList = (name) => async (page, kit) => {
  const id = await listId(kit, name);
  await kit.app(
    '/src/ui/colors/colorMatchDialogStore.ts',
    (m, shown) => m.useColorMatchDialog.getState().open(shown),
    id,
  );
  await page.getByTestId('match-colors').waitFor();
  await previewDone(page, kit);
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

/** The Creator's panel and the room beside it where the menus of its cards open. */
const creatorWithRoom = async (page, kit) => {
  const panel = await kit.box('panel-creator');
  // As tall as the panel: the menu of a card and its submenu reach down past the cards.
  return { x: panel.x, y: panel.y, width: panel.width + 520, height: panel.height };
};

export default {
  page: 'color/match-colors',
  project: PROJECT,
  items: [
    {
      // The dialog on "Course colours": the lists (1), the patterns with their colours (2), the
      // preview of a formula of the project with the colours the list would give it (3), and the
      // button that applies the list to the formulas selected (4).
      kind: 'shot',
      name: 'dialog',
      setup: [
        plain,
        selectFormulas('poly', 'deriv', 'square'),
        openList('Course colours'),
        async (page, kit) => {
          await page.getByTestId('match-colors-preview-formula').selectOption({ label: 'deriv' });
          await previewDone(page, kit);
        },
      ],
      steps: async (page, kit) => {
        await kit.move({ x: 4, y: 4 });
      },
      target: 'match-colors',
      highlight: [
        { target: '.cm-lists', label: 1, markerAt: 'top-right' },
        { target: 'match-colors-entries', label: 2, markerAt: 'top-right' },
        { target: 'match-colors-preview', label: 3, markerAt: 'top-right' },
        { target: 'match-colors-apply', label: 4, markerAt: 'top-left' },
      ],
    },
    {
      // Applying a list from the Creator: the three formulas are selected, a right-click, Apply
      // match colors, the list; the cards show the colours at once. Ctrl/⌘+Z takes them back.
      kind: 'clip',
      name: 'apply-list',
      setup: [plain, selectFormulas('poly', 'deriv', 'square')],
      target: creatorWithRoom,
      holdStart: 300,
      holdEnd: 300,
      act: async (page, kit) => {
        await kit.contextMenu(await card(kit, 'deriv'));
        await kit.openSubmenu('Apply match colors');
        await kit.click(`formula-menu-match-${await listId(kit, 'Course colours')}`, { after: 1000 });
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
    {
      // The menu of the selected formulas: Apply match colors, each list with its colours.
      kind: 'shot',
      name: 'apply-menu',
      setup: [plain, selectFormulas('poly', 'deriv', 'square')],
      steps: async (page, kit) => {
        await kit.contextMenu(await card(kit, 'deriv'));
        // The pointer stays on the entry: moving off it would close the submenu.
        await kit.openSubmenu('Apply match colors');
      },
      target: withMenus('panel-creator'),
      padding: 6,
    },
    {
      // With two or more clips selected the Preview's bar has Match colors ▾.
      kind: 'shot',
      name: 'bar-menu',
      setup: [plain, (page, kit) => kit.seek(1.6), (page, kit) => kit.selectClip(['poly', 'square'])],
      steps: async (page, kit) => {
        await kit.click('preview-actions-match');
        await kit.move({ x: 4, y: 4 });
      },
      target: withMenus('preview-actions'),
      padding: 12,
    },
    {
      // Edit together: the Match colors button of the dialog that colours several formulas.
      kind: 'shot',
      name: 'edit-together',
      setup: [plain, selectFormulas('poly', 'deriv', 'square')],
      steps: async (page, kit) => {
        await kit.contextMenu(await card(kit, 'deriv'));
        await kit.click('formula-menu-edit-together');
        await page.getByTestId('multi-editor').waitFor();
        await kit.settle();
        await kit.click('multi-match');
        await kit.move({ x: 4, y: 4 });
      },
      target: withMenus('multi-match'),
      padding: { top: 90, right: 160, bottom: 24, left: 160 },
      highlight: [{ target: 'multi-match', label: 1, markerAt: 'top-left' }],
    },
    {
      // The notice that says what a list coloured.
      kind: 'shot',
      name: 'notice',
      setup: [plain, selectFormulas('poly', 'deriv', 'square')],
      steps: async (page, kit) => {
        const id = await listId(kit, 'Course colours');
        const ids = await kit.mfe(
          (mfe) => mfe.useProjectStore.getState().project.formulas.map((f) => f.id),
        );
        await kit.app(
          '/src/ui/colors/applyColorMatch.ts',
          (m, { shown, all }) => m.applyColorMatch(all, shown),
          { shown: id, all: ids },
        );
        await kit.settle();
      },
      target: 'notice',
      padding: 8,
    },
    {
      // Patterns that overlap: the lower entry wins. With dy/dx last, the whole fraction is
      // green; moved up twice, it is green with its own y and x inside; Ctrl/⌘+Z twice puts it
      // back.
      kind: 'clip',
      name: 'overlap',
      setup: [
        plain,
        selectFormulas('deriv'),
        openList('Course colours'),
        async (page, kit) => {
          await page.getByTestId('match-colors-preview-formula').selectOption({ label: 'deriv' });
          await previewDone(page, kit);
        },
      ],
      target: 'match-colors-editor',
      padding: 8,
      holdStart: 300,
      holdEnd: 400,
      act: async (page, kit) => {
        await kit.move('match-colors-up-2', { duration: 380 });
        await kit.click('match-colors-up-2', { after: 450 });
        await kit.move('match-colors-up-1', { duration: 380 });
        await kit.click('match-colors-up-1', { after: 1000 });
        await kit.press('ControlOrMeta+Z', { after: 200 });
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
  ],
};
