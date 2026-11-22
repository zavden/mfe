/* Captures of tutorials/quadratic-formula: the steps of the tutorial performed in the real app on
 * the tutorial's own project (docs/web/examples/quadratic-formula.mfe.json, made from
 * quadratic-formula-start by the steps of _quadratic-formula-steps.mjs): a new formula, the
 * Creator, the Edit together row, the Match colors list, the timeline of the finished project,
 * the relation editor on relations 1, 4 and 6, and the gestures that make the block pair of
 * relation 4 and a merge of relation 6.
 *
 * The clips of the project are `c_1` … `c_7` and its formulas `standard_form`, `divide_by_a`,
 * `move_constant`, `add_to_both_sides`, `complete_the_square`, `square_root` and `solution`; the
 * relation that leaves clip `c_n` is found by it (the ids of the relations are the app's own). The
 * steps that make pairs end by comparing what they made with the pairs of the project: a
 * difference is warned about, as a step of the page that no longer does what it says. */

import { readFileSync } from 'node:fs';
import { createEditor, openEditor } from '../_shared/relation-editor.mjs';

const PROJECT = 'docs/web/examples/quadratic-formula.mfe.json';

/** The pairs the project has for the relation that leaves each clip, as `from>to` strings. */
const WANTED = Object.fromEntries(
  JSON.parse(readFileSync(new URL('../../../examples/quadratic-formula.mfe.json', import.meta.url), 'utf8'))
    .relations.map((relation) => [
      relation.fromClipId,
      relation.pairs.map((p) => `${p.from.join(',')}>${p.to.join(',')}`),
    ]),
);

/** Opens the relation editor on the relation that leaves clip `c_<n>`. */
const openRelation = (n) => async (page, kit) => {
  const id = await kit.mfe(
    (mfe, from) =>
      mfe.useProjectStore.getState().project.relations.find((r) => r.fromClipId === from)?.id,
    `c_${n}`,
  );
  if (!id) throw new Error(`the project has no relation that leaves c_${n}`);
  await openEditor(id)(page, kit);
};

/** Takes the relation that leaves clip `c_<n>` out of the project and opens the editor on a new
 * relation between the same clips, as «Create relation…» does: an editor with no pair. */
const newRelation = (n) => async (page, kit) => {
  await kit.mfe((mfe, from) => {
    mfe.useProjectStore.getState().update((draft) => {
      draft.relations = draft.relations.filter((r) => r.fromClipId !== from);
    });
  }, `c_${n}`);
  await createEditor(`c_${n}`, `c_${n + 1}`)(page, kit);
};

/** The pairs of the open editor as `from>to` strings, in the order of its list. */
const editorPairs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="rel-pair-"][data-from]')].map(
      (row) => `${row.getAttribute('data-from')}>${row.getAttribute('data-to')}`,
    ),
  );

/** Warns when the pairs of the editor are not those the project has for clip `c_<n>` (order
 * aside), or, with `only`, when one of those is missing. */
const expectPairs = (n, only = null) => async (page, kit) => {
  const made = await editorPairs(page);
  const wanted = only ?? WANTED[`c_${n}`];
  const missing = wanted.filter((pair) => !made.includes(pair));
  const extra = only ? [] : made.filter((pair) => !wanted.includes(pair));
  if (missing.length > 0 || extra.length > 0) {
    kit.warn(`relation ${n}: the steps made ${made.join(' ')}; missing ${missing.join(' ')}, extra ${extra.join(' ')}`);
  }
};

/** Shows the glyph lists under the toolbar (the key before the eye). */
const showLists = async (page, kit) => {
  if ((await page.getByTestId('rel-chips').count()) === 0) await kit.click('rel-toggle-list');
};

/** A drag of a box over the glyphs `indices` of one side of the editor, from its lower right corner
 * to its upper left: the keys of the drawing's view are over its upper right corner, where the
 * source's last term is, and a press there would be theirs. */
const boxOver = (side, indices, { hold = [], duration = 550 } = {}) => async (page, kit) => {
  const boxes = [];
  for (const index of indices) boxes.push(await kit.box(`rel-${side}-glyph-${index}`));
  const pad = 5;
  const left = Math.min(...boxes.map((b) => b.x)) - pad;
  const top = Math.min(...boxes.map((b) => b.y)) - pad;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  await kit.drag({ x: right, y: bottom }, { x: left, y: top }, { hold, duration });
};

/** The ruler and the two tracks of the project, all of its 21 seconds. */
async function wholeTimeline(page, kit) {
  const panel = await kit.box('panel-timeline');
  const ruler = await kit.box('timeline-ruler');
  const last = await kit.box({ track: 'Track 1' });
  const top = ruler.y - 6;
  return { x: panel.x, y: top, width: panel.width, height: last.y + last.height + 8 - top };
}

export default {
  page: 'tutorials/quadratic-formula',
  project: PROJECT,
  items: [
    {
      // Step 1: «+ New» opens the formula editor on a new formula. Its name (1), its size (2),
      // its LaTeX in the Raw LaTeX field (3), and Apply (4).
      kind: 'shot',
      name: 'new-formula',
      project: null,
      target: { union: ['editor-name', 'editor-scale', 'raw-latex', 'editor-apply'] },
      padding: 14,
      scale: 1.5,
      setup: async (page, kit) => {
        await kit.click('creator-new');
        await page.getByTestId('formula-editor').waitFor();
        const name = page.getByTestId('editor-name');
        await name.fill('standard_form');
        await name.press('Enter');
        const scale = page.getByTestId('editor-scale');
        await scale.fill('1.5');
        await scale.press('Enter');
        await page.getByTestId('raw-latex').fill('ax^2+bx+c=0');
        await kit.waitForRenders();
        await kit.settle();
      },
      highlight: [
        { target: 'editor-name', label: 1, markerAt: 'top-right', pad: 2 },
        { target: 'editor-scale', label: 2, markerAt: 'top-right', pad: 2 },
        { target: 'raw-latex', label: 3, markerAt: 'top-right', pad: 2 },
        { target: 'editor-apply', label: 4, markerAt: 'top-right', pad: 2 },
      ],
    },
    {
      // The Creator with the seven formulas, before Match colors: all white.
      kind: 'shot',
      name: 'creator',
      viewport: { width: 1440, height: 1100 },
      target: 'panel-creator',
      setup: async (page, kit) => {
        await kit.mfe((mfe) =>
          mfe.useProjectStore.getState().update((draft) => {
            for (const formula of draft.formulas) formula.glyphColors = {};
          }),
        );
        await kit.waitForRenders();
        await kit.settle();
      },
    },
    {
      // Edit together on the seven formulas: the Scale field (1) sets them all, and Match colors
      // (2) holds the lists of colours. Formulas, in the menu of the key ∑, selects every formula
      // (D183; Escape closes that menu, which hangs over the first card), a right click on a card,
      // Edit together…
      kind: 'shot',
      name: 'edit-together',
      target: 'multi-formula-tools',
      padding: 10,
      scale: 1.5,
      setup: async (page, kit) => {
        await kit.click('creator-kinds');
        await kit.click('creator-select-all-math');
        await kit.press('Escape');
        await kit.contextMenu({ css: '[data-testid="formula-list"] [data-formula-id]' });
        await kit.choose('Edit together…');
        await page.getByTestId('multi-editor').waitFor();
        await kit.settle();
      },
      highlight: [
        { target: 'multi-scale', label: 1, markerAt: 'top-right', pad: 2 },
        { target: 'multi-match', label: 2, markerAt: 'top-right', pad: 2 },
      ],
    },
    {
      // The Match colors list of the tutorial, in its dialog: three patterns, a gold, b blue,
      // c red. Edit ▸ Match colors ▸ Terms…
      kind: 'shot',
      name: 'match-colors',
      target: 'match-colors',
      scale: 1,
      setup: async (page, kit) => {
        await kit.choose('Edit ▸ Match colors ▸ Terms…');
        await page.getByTestId('match-colors').waitFor();
        // The preview renders the formula with the list's colours by itself, a moment after the
        // dialog opens: until it has, its note says "Rendering…" and the formula is dimmed.
        await page
          .locator('[data-testid="match-colors-preview"] .cm-preview-thumb[data-status="done"]')
          .waitFor();
        await kit.settle();
      },
    },
    {
      // The whole timeline: seven clips on two tracks, each starting where the relation that
      // brings it begins, and an arrow from each to the next.
      kind: 'shot',
      name: 'timeline',
      target: wholeTimeline,
      setup: async (page, kit) => {
        await kit.click('timeline-fit');
      },
    },
    {
      // Relation 1, Divide by a: the a of ax² goes to both denominators (linked first), then
      // Suggest links by label does the rest.
      kind: 'shot',
      name: 'relation-1-pairs',
      target: '.rel-main',
      scale: 1,
      setup: openRelation(1),
    },
    {
      // Relation 4, Complete the square: the biggest. The term b²/4a² that stays on the right is
      // one pair of six glyphs. In the target the six (b², the 4a² of the denominator and its
      // bar) are picked from the glyph lists by their numbers, as the page says, and that is done
      // when the clip starts; in the source a box over the six glyphs, then Link.
      kind: 'clip',
      name: 'relation-4',
      target: '.rel-main',
      holdStart: 100,
      holdEnd: 300,
      setup: [
        newRelation(4),
        showLists,
        async (page, kit) => {
          await kit.click('rel-to-chip-10');
          for (const index of [11, 16, 17, 18, 19]) {
            await kit.click(`rel-to-chip-${index}`, { hold: ['Shift'] });
          }
        },
      ],
      act: async (page, kit) => {
        // The side the box does not touch keeps its selection: the target stays picked.
        await boxOver('from', [20, 21, 22, 23, 24, 25], { duration: 450 })(page, kit);
        await kit.pause(150);
        await kit.click('rel-link', { duration: 300, after: 400 });
        await expectPairs(4, ['20,21,22,23,24,25>10,11,16,17,18,19'])(page, kit);
      },
    },
    {
      // The pairs of relation 4: 13 pairs, the block of six glyphs among them.
      kind: 'shot',
      name: 'relation-4-pairs',
      target: '.rel-main',
      scale: 1,
      setup: openRelation(4),
    },
    {
      // Relation 6, Isolate x: the two denominators 2a become one, glyph by glyph: two glyphs are
      // selected (the second with Shift), one click on the target links them.
      kind: 'clip',
      name: 'relation-6',
      target: '.rel-main',
      holdStart: 100,
      holdEnd: 300,
      setup: newRelation(6),
      act: async (page, kit) => {
        await kit.click('rel-from-glyph-3', { duration: 300, after: 60 });
        await kit.click('rel-from-glyph-16', { hold: ['Shift'], duration: 300, after: 60 });
        await kit.click('rel-to-glyph-13', { duration: 300, after: 500 });
        await expectPairs(6, ['3,16>13'])(page, kit);
      },
    },
    {
      // The pairs of relation 6: sixteen pairs, three of them join two glyphs into one.
      kind: 'shot',
      name: 'relation-6-pairs',
      target: '.rel-main',
      scale: 1,
      setup: openRelation(6),
    },
  ],
};
