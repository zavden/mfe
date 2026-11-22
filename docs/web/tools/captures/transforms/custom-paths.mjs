/* Captures of transforms/custom-paths: where a relation's Path arc and its pairs' paths are in the
 * app, the Edit-path mode of the Preview (a clip of it, and a still with its parts numbered), the
 * path picker, the menus that open it and the marks of edited paths.
 *
 * Projects (docs/web/examples/): custom-paths-start (a and b swap along straight paths),
 * custom-paths-swap (the same, with a path of their own), custom-paths-seven (seven pairs, four
 * of them edited). The ids the steps use are the examples' own: the relation r_swap, or
 * r_sum_swap in the seven. */

import {
  addAnchor,
  chordMiddle,
  dragOutHandle,
  enterPathMode,
  pathNodes,
  smoothAnchor,
} from '../_shared/path-editing.mjs';

const START = 'docs/web/examples/custom-paths-start.mfe.json';
const SWAP = 'docs/web/examples/custom-paths-swap.mfe.json';
const SEVEN = 'docs/web/examples/custom-paths-seven.mfe.json';
const EXTRAS = 'docs/web/examples/relations-extras.mfe.json';

/** The box of a point of the Preview, `size` px around it, for a ring. */
const around = (p, size = 26) => ({ x: p.x - size / 2, y: p.y - size / 2, width: size, height: size });

/** The mode of the clip of the formula `name`, entered the way the page says. */
async function enter(page, kit, name, relationId, index) {
  await kit.selectClip(name);
  await enterPathMode(page, kit, relationId, index);
}

/** Shapes the first pair's path as the page shows: a press on the curve adds an anchor and drags it
 * up, a double-click makes it smooth, a handle drawn out and the other mirroring it. */
async function shape(page, kit) {
  await addAnchor(page, kit, 110);
  await smoothAnchor(page, kit);
  await dragOutHandle(page, kit, 46, -36);
  const frame = page.getByTestId('preview-frame');
  console.log(
    'PATH after shaping: nodes',
    await frame.getAttribute('data-path-nodes'),
    'selected',
    await frame.getAttribute('data-path-selected'),
  );
}

export default {
  page: 'transforms/custom-paths',
  viewport: { width: 1440, height: 900 },
  items: [
    {
      // The row of a relation in the Relations list of a clip: its pairs and the paths that were
      // edited are counted, and «Edit path…» sits between «Edit…» and the delete key.
      kind: 'shot',
      name: 'relation-row',
      project: SEVEN,
      viewport: { width: 1440, height: 1000 },
      setup: async (page, kit) => {
        await kit.selectClip('sum');
      },
      target: 'relation-list',
      padding: 8,
    },
    {
      // A selected relation: its pairs with what each follows (a custom path, the arc, or
      // straight), the mark of an edited path and «Edit path…» on every row.
      kind: 'shot',
      name: 'pair-list',
      project: SEVEN,
      viewport: { width: 1440, height: 1100 },
      setup: async (page, kit) => {
        await kit.mfe((mfe) => mfe.useUiStore.getState().select({ kind: 'relation', id: 'r_sum_swap' }));
        await kit.settle({ renders: false });
      },
      target: 'relation-pairs',
      padding: 8,
    },
    {
      // The Path arc field of the same relation, among its timing and its style.
      kind: 'shot',
      name: 'path-arc-field',
      project: SEVEN,
      viewport: { width: 1440, height: 1100 },
      setup: async (page, kit) => {
        await kit.mfe((mfe) => mfe.useUiStore.getState().select({ kind: 'relation', id: 'r_sum_swap' }));
        await kit.settle({ renders: false });
        await kit.scrollTo('relation-settings');
        await kit.settle({ renders: false });
      },
      target: 'relation-settings',
      padding: 8,
      highlight: [{ target: 'relation-path-arc', label: 1, markerAt: 'top-right', pad: 3 }],
    },
    {
      // «Edit path…» of a relation with several pairs opens the picker: the relation's diagram
      // and a row for each pair, with a small picture of the curve it follows.
      kind: 'shot',
      name: 'picker',
      project: SEVEN,
      setup: async (page, kit) => {
        await kit.selectClip('sum');
        await kit.click('relation-edit-path-r_sum_swap');
        await page.getByTestId('path-picker').waitFor();
        await kit.hover('path-picker-pair-2', { pause: 250 });
        await kit.settle({ renders: false });
      },
      target: 'path-picker',
      padding: 6,
    },
    {
      // The right-click menu of a relation's band on the timeline: up to five pairs are listed
      // in it, each with what it follows and, when its path was edited, the dot.
      kind: 'shot',
      name: 'band-menu',
      project: SWAP,
      setup: async (page, kit) => {
        await kit.contextMenu('relation-window-r_swap');
        await kit.settle({ renders: false });
      },
      target: { union: ['relation-menu', 'relation-window-r_swap'] },
      padding: 14,
    },
    {
      // With six pairs or more the menu offers «Choose a pair…», which opens the picker.
      kind: 'shot',
      name: 'band-menu-many',
      project: SEVEN,
      setup: async (page, kit) => {
        await kit.contextMenu('relation-window-r_sum_swap');
        await kit.settle({ renders: false });
      },
      target: { union: ['relation-menu', 'relation-window-r_sum_swap'] },
      padding: 14,
    },
    {
      // The menu of a pair in the relation editor (a right-click on one of its glyphs): the style of
      // the pair, then «Edit path…» and «Straight path» (the pair has a path of its own, so the
      // dot is on its header).
      kind: 'shot',
      name: 'pair-menu',
      project: SWAP,
      setup: async (page, kit) => {
        await kit.selectClip('ab');
        await kit.click('relation-edit-r_swap');
        await page.getByTestId('relation-editor').waitFor();
        await kit.settle({ renders: false });
        await kit.contextMenu('rel-from-glyph-0');
        await page.getByTestId('rel-style-menu').waitFor();
        // Off the drawing (the figure draws no pointer): no circle of the selector left in it.
        await kit.move({ x: 6, y: 6 });
        await kit.settle({ renders: false });
      },
      target: { union: ['rel-canvas', 'rel-style-menu'] },
      padding: 12,
    },
    {
      // The mode, still: the Preview at the middle of the pair's window, the glyph drawn where
      // the curve puts it and the two ghosts at the start and the end, the curve with its
      // anchors and handles, the hint line and Done.
      kind: 'shot',
      name: 'mode',
      project: START,
      setup: async (page, kit) => {
        await enter(page, kit, 'ab', 'r_swap', 0);
        await shape(page, kit);
        // Out of the way: the pointer rests at a corner of the frame.
        const frame = await kit.box('preview-frame');
        await kit.move({ x: frame.x + 14, y: frame.y + 14 });
        await kit.settle({ renders: false });
      },
      target: 'panel-preview',
      highlight: [
        {
          target: async (page) => around((await pathNodes(page))[1].at, 30),
          label: 1,
          markerAt: 'top-left',
        },
        {
          target: async (page) => around((await pathNodes(page))[1].out, 30),
          label: 2,
          markerAt: 'top-right',
        },
        { target: 'preview-hint', label: 3, markerAt: 'top-left', pad: 4 },
        { target: 'path-edit-done', label: 4, markerAt: 'top-left', pad: 3 },
      ],
    },
    {
      // A pair of two sources onto one target as the mode opens on it, «Path per glyph» off (1):
      // one curve, the path of all the glyphs (2), drawn along the first route. Bent to the left,
      // so that the second glyph, halfway along its own way, is seen to take the same shape.
      kind: 'shot',
      name: 'per-glyph-off',
      project: EXTRAS,
      setup: async (page, kit) => {
        await enter(page, kit, 'source', 'r_separate', 0);
        const middle = await chordMiddle(page);
        await kit.drag(middle, { x: middle.x - 120, y: middle.y });
        await kit.pause(200);
        await smoothAnchor(page, kit);
        const frame = await kit.box('preview-frame');
        await kit.move({ x: frame.x + frame.width - 14, y: frame.y + 14 });
        await kit.settle({ renders: false });
      },
      target: 'panel-preview',
      highlight: [
        { target: 'path-edit-per-glyph', label: 1, markerAt: 'bottom-left', pad: 3 },
        { target: 'path-edit-route', label: 2, markerAt: 'bottom-right', pad: 3 },
      ],
    },
    {
      // The same pair with «Path per glyph» on: every route is drawn, and one of them is chosen
      // (the arrows of the bar, or a click on its curve) and given a path of its own. The padlock
      // locks the other routes (1); the bar says which route is edited (2) and takes its own path
      // away (3); the other route keeps to the common path, dashed.
      kind: 'shot',
      name: 'routes',
      project: EXTRAS,
      setup: async (page, kit) => {
        await enter(page, kit, 'source', 'r_separate', 0);
        await kit.click('path-edit-per-glyph');
        await kit.click('path-edit-next');
        // The chord runs down: the anchor is drawn out to the left of it.
        const middle = await chordMiddle(page);
        await kit.drag(middle, { x: middle.x - 120, y: middle.y });
        await kit.pause(200);
        await smoothAnchor(page, kit);
        const frame = await kit.box('preview-frame');
        await kit.move({ x: frame.x + frame.width - 14, y: frame.y + 14 });
        await kit.settle({ renders: false });
      },
      target: 'panel-preview',
      highlight: [
        { target: 'path-edit-lock-others', label: 1, markerAt: 'bottom', pad: 3 },
        { target: 'path-edit-route', label: 2, markerAt: 'bottom-left', pad: 3 },
        { target: 'path-edit-remove-own', label: 3, markerAt: 'bottom-right', pad: 3 },
      ],
    },
    {
      // The gesture that shapes a path, with the mode already open on the first pair: a press on
      // the curve that adds an anchor and lifts it, the double-click that makes it smooth, a handle
      // drawn out (the other mirrors it) and Enter.
      kind: 'clip',
      name: 'edit-path',
      project: START,
      target: 'panel-preview',
      keysAt: 'top-right',
      // The pointer starts on the curve, where the first press lands; the clip ends on Enter.
      cursorStart: (page) => chordMiddle(page),
      loop: false,
      holdStart: 300,
      holdEnd: 400,
      setup: async (page, kit) => {
        await enter(page, kit, 'ab', 'r_swap', 0);
      },
      act: async (page, kit) => {
        const middle = await chordMiddle(page);
        await kit.drag(middle, { x: middle.x, y: middle.y - 110 }, { duration: 600 });
        await kit.pause(200);
        await kit.doubleClick((await pathNodes(page))[1].at);
        await kit.pause(300);
        const out = (await pathNodes(page))[1].out;
        await kit.drag(out, { x: out.x + 46, y: out.y - 36 }, { duration: 600 });
        await kit.pause(300);
        await kit.press('Enter', { after: 300 });
      },
    },
  ],
};
