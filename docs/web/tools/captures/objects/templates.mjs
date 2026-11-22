/* Captures of objects/templates: the Templates tab of the Creator, the library of default
 * templates, the Use dialog with its placeholders, the form that writes a template of your own,
 * My templates and the Favorites.
 *
 * No project: every item starts from the app's new, empty one, so the Creator lists nothing
 * but what the item itself makes. */

import { widenCreator } from '../_shared/creator-panel.mjs';

const TEMPLATES_UI = '/src/ui/creator/templates/templatesUi.ts';

/** Makes a pop-up shorter by its corner, so that a short list does not leave it empty. */
async function shorten(page, kit, testId, by) {
  const corner = await kit.box(`${testId}-resize`);
  const from = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
  await kit.drag(from, { x: from.x, y: from.y - by });
  await kit.settle({ renders: false });
}

/** The top `height` CSS px of the Creator: what a short list leaves empty is not captured. */
const creatorTop = (height) => async (page, kit) => {
  const panel = await kit.box('panel-creator');
  return { x: panel.x, y: panel.y, width: panel.width, height };
};

/** Opens the Templates tab of the Creator. */
async function openTab(page, kit) {
  await kit.click('creator-tab-templates');
  await page.waitForSelector('[data-testid="template-entries"]');
  await kit.settle({ renders: false });
}

/** Opens the pop-up of an entry of the tab ('default', 'mine', 'favorites'). */
const openList = (entry) => async (page, kit) => {
  await openTab(page, kit);
  await kit.click(`templates-open-${entry}`);
  await page.waitForSelector('[data-testid="template-browser"]');
  await page.waitForSelector('[data-testid="template-item"], [data-testid="template-empty"]');
  await kit.settle({ renders: false });
};

/** Types into the search of the open list, and waits for the list to follow. */
const search = (text) => async (page, kit) => {
  await kit.click('template-search');
  await kit.type(text, { delay: 0 });
  await page.waitForTimeout(400);
  await kit.settle({ renders: false });
};

/** Waits for the drawing of a Use dialog or a form to be there (not the "drawing…" state). */
async function drawn(page, testId) {
  await page.waitForFunction(
    (id) => {
      const art = document.querySelector(`[data-testid="${id}"]`);
      return art !== null && art.querySelector('svg, canvas, img') !== null;
    },
    testId,
    { timeout: 20_000 },
  );
}

/** Presses Use on the first card of the open list whose name is `name`. */
const useTemplate = (name) => async (page, kit) => {
  await search(name)(page, kit);
  await kit.click({ css: '[data-testid="template-item"] [data-testid="template-use"]' });
  await page.waitForSelector('[data-testid="use-template"]');
  await drawn(page, 'use-template-preview');
  await kit.settle({ renders: false });
};

/** Fills the form that writes a template: the LaTeX with its placeholders, then each default. */
async function fillForm(page, kit) {
  await kit.click('template-form-name');
  await kit.type('Commutative sum', { delay: 0 });
  await kit.click('template-form-category');
  await kit.type('Algebra', { delay: 0 });
  await kit.click('template-form-description');
  await kit.type('Adding in either order gives the same sum.', { delay: 0 });
  await kit.click('template-form-latex');
  await kit.type('{#1}+{#2}={#2}+{#1}', { delay: 0 });
  await page.waitForSelector('[data-testid="template-form-value-2"]');
  await kit.click('template-form-value-1');
  await kit.type('a', { delay: 0 });
  await kit.click('template-form-value-2');
  await kit.type('b', { delay: 0 });
  await kit.click('template-form-label-1');
  await kit.type('first term', { delay: 0 });
  await kit.click('template-form-label-2');
  await kit.type('second term', { delay: 0 });
  await drawn(page, 'template-form-preview');
  await kit.settle({ renders: false });
}

/** Writes the template of `fillForm` and saves it, as the form's Save template does. */
async function saveOwnTemplate(page, kit) {
  await openTab(page, kit);
  await kit.click('templates-open-create');
  await page.waitForSelector('[data-testid="template-form"]');
  await fillForm(page, kit);
  await kit.click('template-form-save');
  await page.waitForSelector('[data-testid="template-browser"][data-view="mine"]');
  await kit.settle({ renders: false });
}

export default {
  page: 'objects/templates',
  project: null,
  items: [
    {
      // The four entries of the tab, each with how many it holds.
      kind: 'shot',
      name: 'entries',
      target: creatorTop(430),
      setup: openTab,
    },
    {
      // The default templates, searched: cards with the formula, its level, a star, Use and
      // Save a copy; above them the search, the category and the level. The top of the pop-up.
      kind: 'shot',
      name: 'default-library',
      target: async (page, kit) => {
        const dialog = await kit.box('templates-dialog');
        return { x: dialog.x, y: dialog.y, width: dialog.width, height: 560 };
      },
      padding: 6,
      setup: [openList('default'), search('derivative')],
    },
    {
      // The Use dialog of a template with placeholders, its parts numbered.
      kind: 'shot',
      name: 'use-dialog',
      target: 'use-template',
      padding: 6,
      setup: [openList('default'), useTemplate('product of powers')],
      highlight: [
        { target: 'use-template-preview', label: 1, markerAt: 'top-left' },
        { target: 'use-template-latex', label: 2, markerAt: 'left' },
        {
          target: { union: ['use-template-value-1', 'use-template-value-3'] },
          label: 3,
          markerAt: 'left',
        },
        { target: 'use-template-name', label: 4, markerAt: 'left' },
        { target: 'use-template-create', label: 5, markerAt: 'top-left' },
      ],
    },
    {
      // Values typed into the placeholders: the drawing and the LaTeX under it follow. The top
      // of the dialog: the drawing, the LaTeX and the fields.
      kind: 'clip',
      name: 'use-values',
      // The pointer waits on the dialog's title: over the drawing it would hide part of it.
      cursorStart: async (page, kit) => {
        const dialog = await kit.box('use-template');
        return { x: dialog.x + 300, y: dialog.y + 22 };
      },
      target: async (page, kit) => {
        const dialog = await kit.box('use-template');
        const last = await kit.box('use-template-value-3');
        return { x: dialog.x, y: dialog.y, width: dialog.width, height: last.y + last.height - dialog.y + 14 };
      },
      padding: 6,
      keysAt: 'bottom-right',
      holdStart: 250,
      holdEnd: 600,
      loop: false,
      setup: [openList('default'), useTemplate('product of powers')],
      act: async (page, kit) => {
        await kit.click('use-template-value-1', { after: 150 });
        await kit.press('ControlOrMeta+A', { after: 120 });
        await kit.type('x', { delay: 100 });
        await kit.pause(500);
        await kit.click('use-template-value-2', { after: 150 });
        await kit.press('ControlOrMeta+A', { after: 120 });
        await kit.type('2k', { delay: 100 });
        await kit.pause(900);
      },
    },
    {
      // "Create formula" closes everything and leaves the new formula, selected, in the Formulas
      // tab, named after the template.
      kind: 'shot',
      name: 'after-create',
      target: creatorTop(290),
      setup: [
        openList('default'),
        useTemplate('product of powers'),
        async (page, kit) => {
          await kit.click('use-template-create');
          await page.waitForSelector('[data-testid="formula-item"]');
          await kit.waitForRenders();
          await widenCreator(page, kit, 250);
          await kit.settle();
        },
      ],
    },
    {
      // A template with no placeholders needs no dialog: Use adds the formula at once.
      kind: 'shot',
      name: 'no-placeholders',
      target: creatorTop(290),
      setup: [
        openList('default'),
        async (page, kit) => {
          await search("euler's identity")(page, kit);
          await kit.click({ css: '[data-testid="template-item"] [data-testid="template-use"]' });
          await page.waitForSelector('[data-testid="formula-item"]');
          await kit.waitForRenders();
          await widenCreator(page, kit, 250);
          await kit.settle();
        },
      ],
    },
    {
      // The finished form, with the placeholders, the drawing and the Save button.
      kind: 'shot',
      name: 'template-form',
      target: 'template-form',
      padding: 6,
      setup: async (page, kit) => {
        await openTab(page, kit);
        await kit.click('templates-open-create');
        await page.waitForSelector('[data-testid="template-form"]');
        await fillForm(page, kit);
      },
    },
    {
      // My templates, with the one just written: Use, Edit, Duplicate and Delete, the file
      // buttons, and under the list where the templates are kept.
      kind: 'shot',
      name: 'my-templates',
      target: 'templates-dialog',
      padding: 6,
      setup: [
        saveOwnTemplate,
        async (page, kit) => {
          await shorten(page, kit, 'templates-dialog', 190);
        },
      ],
    },
    {
      // A star keeps a template in Favorites, whichever library it is from.
      kind: 'shot',
      name: 'favorites',
      // The dialog down to its last card.
      target: async (page, kit) => {
        const dialog = await kit.box('templates-dialog');
        const last = await page.locator('[data-testid="template-item"]').last().boundingBox();
        return { x: dialog.x, y: dialog.y, width: dialog.width, height: last.y + last.height - dialog.y + 24 };
      },
      padding: 6,
      setup: [
        openList('default'),
        async (page, kit) => {
          await search('derivative of')(page, kit);
          const stars = page.locator('[data-testid="template-star"]');
          await stars.nth(0).click();
          await stars.nth(2).click();
          await kit.settle({ renders: false });
          await kit.app(TEMPLATES_UI, (module) => module.useTemplatesUi.getState().open('favorites'));
          await page.waitForSelector('[data-testid="template-browser"][data-view="favorites"]');
          await kit.settle({ renders: false });
        },
      ],
    },
    {
      // "Save a copy" on a default template puts it among yours, and says so.
      kind: 'shot',
      name: 'save-copy',
      setup: [
        openList('default'),
        async (page, kit) => {
          await search('product of powers')(page, kit);
          await kit.click({ css: '[data-testid="template-item"] [data-testid="template-copy"]' });
          await page.waitForSelector('[data-testid="notice"]');
          await kit.settle({ renders: false });
        },
      ],
      target: 'notice',
      padding: 8,
    },
  ],
};
