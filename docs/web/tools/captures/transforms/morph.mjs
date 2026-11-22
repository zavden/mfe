/* Captures of transforms/morph: a derivation written in one formula and grown with Morph blocks —
 * the blocks on the timeline, adding one from the clip's menu, the pair editor (a still, a
 * recording of linking, and the state where some glyphs are dimmed), the block's panel and menu,
 * the Appear block that writes what no pair brings, and the Edit menu's preference.
 *
 * Project: docs/web/examples/morph-rows.mfe.json (`x + 3 &= 5 \\ x &= 5 - 3 \\ x &= 2`): glyphs
 * 0–4 are row 1 (x + 3 = 5), 5–9 row 2 (x = 5 − 3), 10–12 row 3 (x = 2). Block a_row2 turns row 1
 * into row 2 at 2 s, a_row3 row 2 into row 3 at 4.4 s, a_two writes the 2 at 5.6 s. */

import { expectLayout, showWholeDrawing } from '../_shared/relation-editor.mjs';

const ROWS = 'docs/web/examples/morph-rows.mfe.json';
const CLIP = 'c_rows';

/** Takes out the blocks of the clip but those named (`keep`), and the pairs of those named in
 * `empty`: the derivation as it is before the step the capture shows. */
const prepare =
  ({ keep = [], empty = [] } = {}) =>
  async (page, kit) => {
    await kit.mfe(
      (mfe, { keep, empty }) => {
        mfe.useProjectStore.getState().update((draft) => {
          for (const clip of draft.clips) {
            clip.actions = clip.actions.filter((a) => keep.includes(a.id));
            for (const action of clip.actions) {
              if (action.kind === 'morph' && empty.includes(action.id)) action.pairs = [];
            }
          }
        });
      },
      { keep, empty },
    );
    await kit.settle({ renders: false });
  };

const selectBlock = (id) => (page, kit) =>
  kit.mfe(
    (mfe, actionId) =>
      mfe.useUiStore.getState().select({ kind: 'action', clipId: 'c_rows', actionId }),
    id,
  );

/** Opens the pair editor of a block from its panel, the way the page says. */
const openEditor = (id) => async (page, kit) => {
  await selectBlock(id)(page, kit);
  await kit.settle({ renders: false });
  await kit.click('block-morph-pairs');
  await page.getByTestId('morph-editor').waitFor();
  await page.getByTestId('morph-from-glyph-0').waitFor();
  await kit.settle({ renders: false });
  await kit.move({ x: 6, y: 6 });
};

/** The band of the pair editor where linking happens: from the top of the drawing to the bottom of
 * the toolbar (Link, Suggest…), across the dialog, so that the list of pairs and the suggestion
 * box in the right column come with it. */
async function editorBand(page, kit) {
  const dialog = await kit.box('morph-editor');
  const canvas = await kit.box('morph-canvas');
  const toolbar = await kit.box('morph-link');
  const top = canvas.y - 10;
  return {
    x: dialog.x,
    y: top,
    width: dialog.width,
    height: toolbar.y + toolbar.height + 10 - top,
  };
}

export default {
  page: 'transforms/morph',
  viewport: { width: 1440, height: 900 },
  items: [
    {
      // The clip with its three blocks, as the timeline draws them: two Morph blocks (the number
      // is how many pairs each has) and the Write of the 2.
      kind: 'shot',
      name: 'blocks',
      project: ROWS,
      setup: async (page, kit) => {
        await kit.seek(7.2);
      },
      target: async (page, kit) => {
        const ruler = await kit.box('timeline-ruler');
        const row = await kit.box('track-row-t_main');
        const px = await kit.pxPerSecond();
        const header = ruler.x - row.x;
        return {
          x: row.x,
          y: ruler.y,
          width: Math.min(row.width, header + 9 * px + 30),
          height: row.y + row.height - ruler.y,
        };
      },
      padding: { top: 4, bottom: 6 },
    },
    {
      // A Morph block is added from the clip's menu: the playhead at the time the block is to
      // start (here 2 s), a right-click on the clip there, and the menu of Add animation, which
      // adds at the playhead, has «Morph within the formula».
      kind: 'shot',
      name: 'add-morph',
      project: ROWS,
      cursor: true,
      setup: [
        prepare(),
        async (page, kit) => {
          await kit.seek(2);
          const clip = await kit.box({ clip: 'rows' });
          await kit.contextMenu({ x: await kit.timeToX(2), y: clip.y + clip.height - 6 });
          await kit.hover('add-animation-morph', { pause: 300 });
        },
      ],
      target: { union: ['add-animation-menu', { clip: 'rows' }] },
      padding: 12,
    },
    {
      // The pair editor of the first block, as saved, in six steps: its title and hint, the
      // sources above, the targets below (the drawing of these three rows opens stacked, and
      // whole), the tools, the pairs and the settings of the block, and the footer.
      kind: 'tour',
      name: 'pair-editor',
      project: ROWS,
      viewport: { width: 1100, height: 780 },
      setup: [openEditor('a_row2'), expectLayout('morph', 'stacked'), showWholeDrawing('morph')],
      target: 'morph-editor',
      steps: [
        {
          caption:
            'The title says which block this is, and the time it runs. The hint under it says how to ' +
            'link: click a source, then a target.',
          focus: ['morph-heading'],
        },
        {
          caption:
            'The formula is drawn twice. The <b>top</b> copy holds the <b>sources</b>: the glyphs on ' +
            'screen when the block starts.',
          focus: ['morph-formula-from'],
        },
        {
          caption:
            'The <b>bottom</b> copy holds the <b>targets</b>: the glyphs the block can bring in. A ' +
            'coloured link joins each pair, and its badge gives the pair\'s number and the initial of its style: ' +
            '<b>I:C</b> is a style inherited from the block, Copy.',
          focus: ['morph-formula-to'],
        },
        {
          caption:
            '<span class="ui">Link</span> makes one pair of the selected glyphs, ' +
            '<span class="ui">Suggest pairs by label</span> proposes the glyphs that keep their label, ' +
            'the key before the eye lists the glyphs for the keyboard, and the eye hides the links.',
          focus: [
            {
              union: [
                'morph-link',
                'morph-clear-selection',
                'morph-suggest',
                'morph-toggle-list',
                'morph-toggle-links',
              ],
            },
          ],
        },
        {
          caption:
            'The <b>pairs</b>, with the style of each, and the block\'s own settings. The timing, ' +
            'the default style and the path arc are set in the Animations panel.',
          focus: ['morph-pairs', 'morph-block'],
        },
        {
          caption:
            '<span class="ui">Save pairs</span> writes them, all in one undo step. ' +
            '<span class="ui">Cancel</span> asks before it throws changes away.',
          focus: [{ union: ['morph-cancel', 'morph-save'] }],
        },
      ],
    },
    {
      // The editor of the second block: row 2 has arrived by then, so those glyphs are sources
      // and no longer targets (dimmed below), and the 2 of row 3 waits for its Write block
      // (dimmed above).
      kind: 'shot',
      name: 'pair-editor-dimmed',
      project: ROWS,
      viewport: { width: 1100, height: 780 },
      setup: [
        openEditor('a_row3'),
        expectLayout('morph', 'stacked'),
        showWholeDrawing('morph'),
        // Which glyphs are dimmed, on each side (printed, to check the caption).
        async (page) => {
          for (const side of ['from', 'to']) {
            const dimmed = await page.evaluate(
              (side) =>
                [...document.querySelectorAll(`[data-testid^="morph-${side}-glyph-"][data-eligible="false"]`)]
                  .map((e) => e.getAttribute('data-testid').split('-').pop())
                  .join(','),
              side,
            );
            console.log(`DIMMED on the ${side} copy of block 2:`, dimmed || 'none');
          }
        },
      ],
      target: 'morph-editor',
    },
    {
      // Linking in the editor: Suggest pairs by label proposes the dashed links, Accept all takes
      // them, and the plus is linked to the minus by hand (a click on each).
      kind: 'clip',
      name: 'link-pairs',
      project: ROWS,
      viewport: { width: 1100, height: 780 },
      target: editorBand,
      keysAt: 'bottom-right',
      // The pointer starts on Suggest; the clip ends on the second link, before Save pairs.
      cursorStart: 'morph-suggest',
      loop: false,
      holdStart: 200,
      holdEnd: 400,
      setup: async (page, kit) => {
        await prepare({ keep: ['a_row2'], empty: ['a_row2'] })(page, kit);
        await openEditor('a_row2')(page, kit);
        await kit.move('morph-suggest');
      },
      act: async (page, kit) => {
        await kit.click('morph-suggest');
        await kit.pause(600);
        console.log(
          'SUGGEST on morph-rows block 1:',
          (await page.getByTestId('morph-suggestion').innerText()).replace(/\s+/g, ' '),
        );
        await kit.move('morph-suggest-accept', { duration: 350 });
        await kit.click('morph-suggest-accept');
        await kit.pause(300);
        await kit.move('morph-from-glyph-1', { duration: 400 });
        await kit.click('morph-from-glyph-1');
        await kit.move('morph-to-glyph-8', { duration: 450 });
        await kit.click('morph-to-glyph-8');
        await kit.pause(400);
      },
    },
    {
      // The panel of a selected Morph block: the hint, the default style of its pairs, the Path
      // arc, the pairs (each with what it follows and Edit path…) and its timing.
      kind: 'shot',
      name: 'block-panel',
      project: ROWS,
      viewport: { width: 1440, height: 1000 },
      setup: selectBlock('a_row2'),
      target: 'block-properties',
      padding: 8,
    },
    {
      // The Write block that brings the 2: it names the glyph the Morph blocks do not.
      kind: 'shot',
      name: 'appear-panel',
      project: ROWS,
      viewport: { width: 1440, height: 1300 },
      setup: selectBlock('a_two'),
      target: 'block-properties',
      padding: 8,
    },
    {
      // The block's own menu: Edit pairs… and, for a Morph block, Duplicate without pairs.
      kind: 'shot',
      name: 'block-menu',
      project: ROWS,
      setup: async (page, kit) => {
        await kit.contextMenu('action-block-a_row2');
        await kit.settle({ renders: false });
      },
      target: { union: ['block-menu', 'action-block-a_row2'] },
      padding: 14,
    },
    {
      // The Edit menu's «Suggest morph pairs»: off by default; on, a new Morph block starts with
      // the pairs Suggest finds.
      kind: 'shot',
      name: 'suggest-preference',
      project: ROWS,
      setup: async (page, kit) => {
        await kit.openMenu('Edit');
        await kit.hover('menu-item-edit-auto-suggest-morph-pairs', { pause: 300 });
      },
      target: '.menu-popup',
      padding: 6,
      highlight: [{ target: 'menu-item-edit-auto-suggest-morph-pairs', pad: 2 }],
    },
  ],
};
