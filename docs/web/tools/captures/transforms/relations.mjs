/* Captures of transforms/relations: how a relation looks on the timeline and in the Animations
 * panel, how the relation editor draws the pairs of the examples of the page (one-to-one,
 * one-to-many, many-to-one, three styles, the sources a transform consumes outlined in red dashes),
 * the settings of the unpaired glyphs, the window of a relation dragged on the timeline, and the
 * two menus that edit or remove a relation.
 *
 * Every project is one of this page's own examples (docs/web/examples/relations-*.mfe.json); the
 * relation ids are the ones the examples give. */

import { expectLayout, openEditor } from '../_shared/relation-editor.mjs';

/** Selects the relation of the timing example and shows the whole timeline. */
const selectWindow = async (page, kit) => {
  await kit.click('timeline-fit');
  await kit.mfe((mfe) => mfe.useUiStore.getState().select({ kind: 'relation', id: 'r_window' }));
  await kit.settle({ renders: false });
};

/** The ruler and the two tracks of the timeline, the first 10 seconds: what a relation is drawn
 * over. */
async function timelineTracks(page, kit) {
  const panel = await kit.box('panel-timeline');
  const ruler = await kit.box('timeline-ruler');
  const last = await kit.box({ track: 'Track 1' });
  const top = ruler.y - 6;
  return { x: panel.x, y: top, width: 900, height: last.y + last.height + 8 - top };
}

/** The start of the arrow of a relation: the arrow leaves the middle of the source clip. */
async function arrowStart(page, kit) {
  const arrow = await kit.box('relation-arrow-r_window');
  return { x: arrow.x - 11, y: arrow.y - 11, width: 22, height: 22 };
}

export default {
  page: 'transforms/relations',
  project: 'docs/web/examples/relations-timing.mfe.json',
  items: [
    {
      // A relation on the timeline: its window drawn on the source clip (1) and on the target
      // clip (3), and an arrow (2) from one clip to the other. Selected, it is drawn in full.
      kind: 'shot',
      name: 'timeline-relation',
      target: timelineTracks,
      setup: selectWindow,
      highlight: [
        { target: 'relation-source-window-r_window', label: 1, markerAt: 'top-right', pad: 2 },
        { target: arrowStart, label: 2, markerAt: 'bottom-left' },
        { target: 'relation-window-r_window', label: 3, markerAt: 'bottom-right', pad: 2 },
      ],
    },
    {
      // The Animations panel for a selected relation: its pairs with their styles and what their
      // glyphs follow, its window, easing, default style and path arc.
      kind: 'shot',
      name: 'relation-panel',
      viewport: { width: 1440, height: 1000 },
      target: 'panel-animations',
      setup: selectWindow,
    },
    {
      // The Relations tab of a clip: the relations it is in, and the form that makes a new one.
      kind: 'shot',
      name: 'clip-relations',
      viewport: { width: 1440, height: 1000 },
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.click('timeline-fit');
        await kit.selectClip('source');
      },
    },
    {
      // One-to-one: the swap, three pairs whose links cross. Each pair has a colour and a badge
      // (its number and its style: I:T is "inherited: Transform").
      kind: 'shot',
      name: 'link-one-to-one',
      project: 'docs/web/examples/relations-swap.mfe.json',
      target: 'rel-canvas',
      setup: openEditor('r_swap'),
    },
    {
      // One-to-many: the glyph a has two links, one to each a of the target; the parentheses
      // have none.
      kind: 'shot',
      name: 'link-one-to-many',
      project: 'docs/web/examples/relations-distribute.mfe.json',
      target: 'rel-canvas',
      setup: openEditor('r_distribute'),
    },
    {
      // Many-to-one: two links come together on the x of the target.
      kind: 'shot',
      name: 'link-many-to-one',
      project: 'docs/web/examples/relations-extras.mfe.json',
      target: 'rel-canvas',
      setup: [openEditor('r_separate'), expectLayout('rel', 'stacked')],
    },
    {
      // The styles of the pairs: the badges say 1 I:T (inherited: Transform), 2 C (Copy) and
      // 3 F (Fade transform). The a and the b, which their pairs consume, are outlined in red
      // dashes; the plus sign, copied, is not.
      kind: 'shot',
      name: 'link-styles',
      project: 'docs/web/examples/relations-styles.mfe.json',
      target: 'rel-canvas',
      setup: openEditor('r_mixed'),
    },
    {
      // The settings of a relation, as the editor's Animation tab has them: the window, the
      // easing, the default style and the path arc; then what the unpaired glyphs do: the outro
      // of the source clip (1), run during the window (2), whether the target starts empty (3) and
      // the intro of the target clip (4).
      // The rings go round the whole row of a list and its duration.
      kind: 'shot',
      name: 'unpaired-settings',
      project: 'docs/web/examples/relations-unpaired.mfe.json',
      target: 'rel-settings',
      padding: { top: 6, right: 21, bottom: 6, left: 6 },
      setup: [
        openEditor('r_on_time'),
        async (page, kit) => {
          await kit.click('rel-side-tab-animation');
          await kit.settle({ renders: false });
        },
      ],
      highlight: [
        { target: { css: '[data-testid="rel-unpaired-out"] .an-row' }, label: 1, markerAt: 'right', pad: 2 },
        {
          target: { css: 'label.an-check:has([data-testid="rel-match-outro"])' },
          label: 2,
          markerAt: 'right',
          pad: 3,
        },
        {
          target: { css: 'label.an-check:has([data-testid="rel-starts-empty"])' },
          label: 3,
          markerAt: 'right',
          pad: 3,
        },
        { target: { css: '[data-testid="rel-unpaired-in"] .an-row' }, label: 4, markerAt: 'right', pad: 2 },
      ],
    },
    {
      // The menu of a relation's band (right click on it): its pair editor, the Edit path
      // of each pair, and deleting it.
      kind: 'shot',
      name: 'band-menu',
      target: '.ctx-menu',
      padding: 8,
      setup: async (page, kit) => {
        await kit.click('timeline-fit');
        await kit.contextMenu('relation-window-r_window');
      },
      cursor: true,
    },
    {
      // The menu of a clip (right click on it): Remove relations takes off every relation of the
      // clip with other clips, and its Morph blocks.
      kind: 'shot',
      name: 'clip-menu',
      target: '.ctx-menu',
      padding: 8,
      setup: async (page, kit) => {
        await kit.click('timeline-fit');
        await kit.contextMenu({ clip: 'source' }, { position: { x: 400, y: 10 } });
      },
      highlight: [
        { target: { css: '[data-testid="clip-menu-remove-relations"]' }, label: 1, markerAt: 'right', pad: 1 },
      ],
    },
    {
      // The window of a relation dragged on the timeline: the whole band moves, then its right
      // edge shortens it; a readout above it gives its start, its end and its duration. Both
      // drags are undone, so that the clip loops.
      kind: 'clip',
      name: 'window-drag',
      target: timelineTracks,
      holdStart: 200,
      holdEnd: 400,
      cursorStart: async (page, kit) => {
        const header = await kit.box({ track: 'Track 1' });
        return { x: header.x - 120, y: header.y + header.height / 2 };
      },
      setup: selectWindow,
      act: async (page, kit) => {
        const px = await kit.pxPerSecond();
        const band = await kit.point('relation-window-r_window');
        await kit.move(band, { duration: 350 });
        await kit.mouseDown();
        await kit.move({ x: band.x + 1 * px, y: band.y }, { duration: 700 });
        await kit.pause(250);
        await kit.mouseUp();
        await kit.pause(200);
        const edge = await kit.point('relation-window-r_window-end');
        await kit.move(edge, { duration: 350 });
        await kit.mouseDown();
        await kit.move({ x: edge.x - 0.7 * px, y: edge.y }, { duration: 600 });
        await kit.pause(250);
        await kit.mouseUp();
        await kit.pause(200);
        await kit.press('ControlOrMeta+Z', { after: 80 });
        await kit.press('ControlOrMeta+Z', { after: 80 });
      },
    },
  ],
};
