/* Captures of tutorials/derivative: building a derivation with Morph blocks — the formula as it is
 * typed, the first block's pair editor with a box being dragged over a group of glyphs, the
 * editors of the first and the second block as saved, and the timeline with every block of the
 * finished project.
 *
 * Project: docs/web/examples/derivative.mfe.json. Its derivation has 75 glyphs, five rows:
 *   row 1  0–22 (f'(x) = lim h→0 ((x+h)² − x²) / h; the `=` is 5, lim h→0 is 6–11)
 *   row 2  23–43   row 3  44–58   row 4  59–71   row 5  72–74
 * Blocks (relative to the clip, which starts at 1 s): Morph a_row2 at 2.6, Write a_two at 3.9,
 * Morph a_row3 at 6.2, Morph a_row4 at 9.2, FadeIn a_brackets at 10.6, Morph a_row5 at 13,
 * Transform a_result at 15 and Indicate a_flash at 16.2. */

import { expectLayout, showWholeDrawing } from '../_shared/relation-editor.mjs';

const DERIVATIVE = 'docs/web/examples/derivative.mfe.json';
const SOURCE =
  "f'(x) &= \\lim_{h \\to 0} \\frac{(x+h)^2 - x^2}{h} \\\\\n" +
  '  &= \\lim_{h \\to 0} \\frac{x^2 + 2xh + h^2 - x^2}{h} \\\\\n' +
  '  &= \\lim_{h \\to 0} \\frac{2xh + h^2}{h} \\\\\n' +
  '  &= \\lim_{h \\to 0} (2x + h) \\\\\n' +
  '  &= 2x';

/** Takes out the blocks of the derivation clip but those named (`keep`), and the pairs of the
 * Morph blocks named in `empty`. */
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
      mfe.useUiStore.getState().select({ kind: 'action', clipId: 'c_derivation', actionId }),
    id,
  );

/** Opens the pair editor of a block from its panel. */
const openEditor = (id) => async (page, kit) => {
  await selectBlock(id)(page, kit);
  await kit.settle({ renders: false });
  await kit.click('block-morph-pairs');
  await page.getByTestId('morph-editor').waitFor();
  await page.getByTestId('morph-from-glyph-0').waitFor();
  await kit.settle({ renders: false });
  await kit.move({ x: 6, y: 6 });
};

/** The part of the pair editor that matters: from the top of the dialog to the bottom of the
 * drawing, across the whole dialog, so that the list of pairs on the right comes with it. */
async function editorAndDrawing(page, kit) {
  const dialog = await kit.box('morph-editor');
  const canvas = await kit.box('morph-canvas');
  return {
    x: dialog.x,
    y: dialog.y,
    width: dialog.width,
    height: canvas.y + canvas.height + 12 - dialog.y,
  };
}

export default {
  page: 'tutorials/derivative',
  viewport: { width: 1440, height: 900 },
  items: [
    {
      // The derivation typed in the Raw LaTeX field of a new formula, as the editor shows it: the
      // source on the left, the five rows drawn beside it.
      kind: 'shot',
      name: 'formula',
      setup: async (page, kit) => {
        await kit.click('creator-new');
        await page.getByTestId('formula-editor').waitFor();
        // The formula is called `derivation`, as the tutorial says.
        await page.getByTestId('editor-name').fill('derivation');
        await page.getByTestId('editor-name').press('Enter');
        await page.getByTestId('raw-latex').fill(SOURCE);
        // Apply is enabled once the draft has rendered; the dialog settles (the typeset preview
        // pushes the rest of the form down) before the click, and Apply is disabled again once
        // the formula is applied.
        await kit.until(() => document.querySelector('[data-testid="editor-apply"]')?.disabled === false, null, {
          timeout: 60000,
        });
        await kit.settle({ renders: false });
        await page.getByTestId('editor-apply').click();
        await kit.until(() => document.querySelector('[data-testid="editor-apply"]')?.disabled === true, null, {
          timeout: 60000,
        });
        await kit.waitForRenders();
        await kit.settle();
      },
      target: 'formula-editor',
      padding: 6,
    },
    {
      // The finished clip on the timeline: five Morph and Appear blocks, a part Transform and an
      // Indicate. Numbers on the blocks.
      kind: 'shot',
      name: 'blocks',
      project: DERIVATIVE,
      setup: async (page, kit) => {
        await kit.seek(19);
      },
      target: async (page, kit) => {
        const ruler = await kit.box('timeline-ruler');
        const row = await kit.box('track-row-t_derivation');
        const px = await kit.pxPerSecond();
        const header = ruler.x - row.x;
        return {
          x: row.x,
          y: ruler.y,
          width: Math.min(row.width, header + 21.4 * px + 20),
          height: row.y + row.height - ruler.y,
        };
      },
      padding: { top: 4, bottom: 6 },
    },
    {
      // The editor of the first block, as saved: seven pairs, most of them groups of glyphs. It
      // opens stacked, framed on the rows that take part: «Fit» shows the whole drawing.
      kind: 'shot',
      name: 'pairs-block-1',
      project: DERIVATIVE,
      viewport: { width: 1280, height: 900 },
      setup: [openEditor('a_row2'), expectLayout('morph', 'stacked'), showWholeDrawing('morph')],
      target: editorAndDrawing,
    },
    {
      // The editor of the second block: row 2 is on screen (its glyphs are sources), row 3 is
      // not (its glyphs are targets). It opens side by side, framed: «Fit» shows all of it.
      kind: 'shot',
      name: 'pairs-block-2',
      project: DERIVATIVE,
      viewport: { width: 1280, height: 900 },
      setup: [openEditor('a_row3'), expectLayout('morph', 'side'), showWholeDrawing('morph')],
      target: editorAndDrawing,
    },
    {
      // Linking by groups: a box dragged over `= lim h→0` in the sources (the press is held, so
      // that the box is on the picture). The block has no pair yet. Before the picture, what
      // Suggest pairs by label makes of this block is printed (the page says why it is not used).
      kind: 'shot',
      name: 'box-drag',
      project: DERIVATIVE,
      viewport: { width: 1280, height: 900 },
      cursor: true,
      setup: [
        prepare({ keep: ['a_row2'], empty: ['a_row2'] }),
        openEditor('a_row2'),
        async (page, kit) => {
          await kit.reveal('morph-suggest');
          await kit.click('morph-suggest');
          console.log(
            'SUGGEST on the first block:',
            (await page.getByTestId('morph-suggestion').innerText()).replace(/\s+/g, ' '),
          );
          // Back to the editor as it opens: close it (nothing to throw away) and open it again.
          await kit.click('morph-cancel');
          await page.getByTestId('morph-editor').waitFor({ state: 'detached' });
        },
        openEditor('a_row2'),
        // As the reader opens it at this step, the block alone and without pairs: side by side,
        // and whole, as the page says.
        expectLayout('morph', 'side'),
        async (page, kit) => {
          const from = await kit.point('morph-from-glyph-5');
          const to = await kit.point('morph-from-glyph-11');
          await kit.move(from);
          await kit.mouseDown();
          await kit.move(to);
          console.log('box on screen:', (await page.getByTestId('morph-marquee').count()) > 0);
        },
      ],
      // The first row of the sources, close up: the box and the glyphs it covers.
      target: { union: ['morph-from-glyph-0', 'morph-from-glyph-22'] },
      padding: { top: 28, right: 40, bottom: 44, left: 40 },
      scale: 3,
    },
  ],
};
