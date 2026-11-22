/* Captures of transforms/recipes: the relation editor of two recipes, as the reader sees it when
 * they open a recipe's project and press Edit… on its relation — the pairs of the recipe, linked,
 * with their styles and (for a pair of several sources) how the sources arrive.
 *
 * Projects (docs/web/examples/): recipes-combine-terms (3x + 2x + 4 → 5x + 4: two many-to-one
 * pairs that merge) and recipes-simplify-fraction (4x/6 → 2x/3: two pairs of Fade transform). The
 * first formula of a recipe is named `before`, the relation is r_1. */

import { expectLayout } from '../_shared/relation-editor.mjs';

/** Opens the relation editor of the recipe: its first clip selected, then Edit… on its row. */
const openEditor = async (page, kit) => {
  await kit.selectClip('before');
  await kit.click('relation-edit-r_1');
  await page.getByTestId('relation-editor').waitFor();
  await page.getByTestId('rel-from-glyph-0').waitFor();
  await kit.settle({ renders: false });
  await kit.move({ x: 6, y: 6 });
};

export default {
  page: 'transforms/recipes',
  viewport: { width: 1100, height: 780 },
  items: [
    {
      // Two sources onto one target: the 3 and the 2 onto the 5, the two x onto one x. Under such
      // a pair a select says how the sources arrive; here both merge, as Manim does.
      kind: 'shot',
      name: 'editor-combine',
      project: 'docs/web/examples/recipes-combine-terms.mfe.json',
      setup: openEditor,
      target: 'relation-editor',
    },
    {
      // The digits of the fraction fade into each other: the style of those two pairs is chosen in
      // the list, in the select of their row.
      kind: 'shot',
      name: 'editor-simplify',
      project: 'docs/web/examples/recipes-simplify-fraction.mfe.json',
      setup: [openEditor, expectLayout('rel', 'stacked')],
      target: 'relation-editor',
    },
  ],
};
