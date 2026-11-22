/* Captures of transforms/previewing: the Preview tab of the relation editor (the switch, the
 * picture, the bar with the window marked, the side column that stays), choosing the instant,
 * changing a style or the path arc while previewing, and Preview raw (the drawing that links
 * glyphs animating itself: the ghost of the target, the dashed outlines of what is not on screen,
 * End preview and Esc).
 *
 * The projects are this page's own examples (relations-distribute, relations-arcs,
 * previewing-raw). */

import { expectLayout, openEditor } from '../_shared/relation-editor.mjs';

/** Puts the Preview of the editor on the instant `time` (the loop stops there). */
const previewAt = (time) => async (page, kit) => {
  await kit.click('rel-view-preview');
  const play = page.getByTestId('rel-preview-play');
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click();
  await page.getByTestId('rel-preview-scrub').fill(String(time));
  await kit.settle({ renders: false });
};

/** The same for the raw preview of the Link view. */
const rawAt = (time) => async (page, kit) => {
  await kit.click('rel-raw-open');
  await page.getByTestId('rel-raw-canvas').waitFor();
  const play = page.getByTestId('rel-raw-play');
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click();
  await page.getByTestId('rel-raw-scrub').fill(String(time));
  await kit.settle({ renders: false });
};

/** A part of the raw preview's picture, as a fraction of its box. */
const part = (testId, fx, fy, fw, fh) => async (page, kit) => {
  const box = await kit.box(testId);
  return {
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
    width: box.width * fw,
    height: box.height * fh,
  };
};

const DISTRIBUTE = 'docs/web/examples/relations-distribute.mfe.json';
const ARCS = 'docs/web/examples/relations-arcs.mfe.json';
const RAW = 'docs/web/examples/previewing-raw.mfe.json';

export default {
  page: 'transforms/previewing',
  project: DISTRIBUTE,
  items: [
    {
      // The Preview of the editor: the switch, the picture, the bar, the side column.
      kind: 'tour',
      name: 'preview',
      target: '.rel-layout',
      scale: 1,
      setup: [openEditor('r_distribute'), previewAt(3)],
      steps: [
        {
          caption:
            'The switch over the drawing, <span class="ui">Link | Preview</span>. ' +
            '<span class="ui">Preview</span> puts the transformation in the drawing’s place: ' +
            'the two formulas as the relation would animate them, now.',
          focus: ['rel-view'],
        },
        {
          caption:
            'The picture: only the two formulas of the relation, in a loop from a little ' +
            'before the transformation to a little after it. Here it stands at 40%: ' +
            'the <i>a</i> is splitting in two and the parentheses are fading.',
          focus: ['rel-preview-canvas'],
        },
        {
          caption:
            'The bar: play and pause, a bar to choose the instant, with a band under it that ' +
            'marks where the transformation happens, the time, and how far through the ' +
            'transformation it is.',
          focus: ['rel-preview-play', '.rel-preview-track', 'rel-preview-time', 'rel-preview-progress'],
        },
        {
          caption:
            'The side column stays. A style, the window or what the unpaired glyphs do, ' +
            'changed there, shows in the picture at once. Nothing is saved for any of it.',
          focus: ['rel-side-tab-pairs', 'rel-side-tab-animation'],
        },
      ],
    },
    {
      // Choosing the instant: the loop runs by itself; pressing the bar stops it, and dragging
      // the thumb scrubs the transformation back and forth.
      kind: 'clip',
      name: 'scrub',
      target: '.rel-main',
      holdStart: 100,
      holdEnd: 300,
      setup: [
        openEditor('r_distribute'),
        async (page, kit) => {
          await kit.click('rel-view-preview');
          await kit.settle({ renders: false });
        },
      ],
      act: async (page, kit) => {
        await kit.pause(300);
        const scrub = await kit.box('rel-preview-scrub');
        const at = (fraction) => ({
          x: scrub.x + 12 + (scrub.width - 24) * fraction,
          y: scrub.y + scrub.height / 2,
        });
        await kit.move(at(0.25), { duration: 300 });
        await kit.mouseDown();
        await kit.move(at(0.7), { duration: 700 });
        await kit.move(at(0.4), { duration: 450 });
        await kit.mouseUp();
        await kit.pause(150);
      },
    },
    {
      // Changing something while previewing: the style of the first pair, then the path arc.
      kind: 'tour',
      name: 'live-edit',
      target: '.rel-layout',
      scale: 1,
      setup: [openEditor('r_distribute'), previewAt(3)],
      steps: [
        {
          caption:
            'The instant 3.00 s, 40% through the window: pair 1 (the <i>a</i> splitting ' +
            'in two) inherits the relation’s <span class="ui">Transform</span>, like the others.',
          focus: ['rel-preview-canvas', 'rel-pair-0'],
        },
        {
          caption:
            'The style of pair 1 is now <span class="ui">Fade transform</span>: the picture at ' +
            'the same instant shows it at once, with the <i>a</i> fading into the two new ones ' +
            'instead of moving.',
          act: async (page, kit) => {
            await page.getByTestId('rel-pair-0-style').selectOption('fade');
            await kit.settle({ renders: false });
          },
          focus: ['rel-preview-canvas', 'rel-pair-0-style'],
        },
        {
          caption:
            'On the <span class="ui">Animation</span> tab, a <span class="ui">Path arc</span> ' +
            'of −90° makes every glyph that moves follow an arc, and the picture follows too.',
          act: async (page, kit) => {
            await page.getByTestId('rel-pair-0-style').selectOption('inherit');
            await kit.click('rel-side-tab-animation');
            await page.getByTestId('rel-path-arc').fill('-90');
            await page.getByTestId('rel-path-arc').press('Enter');
            await kit.settle({ renders: false });
          },
          focus: ['rel-preview-canvas', 'rel-path-arc'],
        },
      ],
    },
    {
      // Preview raw: the last key of the Link view's toolbar, then the drawing animating itself.
      kind: 'tour',
      name: 'raw',
      project: RAW,
      target: '.rel-layout',
      scale: 1,
      setup: [openEditor('r_move'), expectLayout('rel', 'stacked')],
      steps: [
        {
          caption:
            'In the <span class="ui">Link</span> view, the last key of the toolbar is ' +
            '<span class="ui">Preview raw</span>. Press it.',
          focus: ['rel-raw-open'],
        },
        {
          caption:
            'The drawing itself plays: the source stays on top, the target below, where the ' +
            'drawing has them, and the glyphs go from one to the other as the pairs and their ' +
            'styles say, in straight lines.',
          act: rawAt(3.1),
          focus: ['rel-raw-canvas'],
        },
        {
          caption:
            'The target is there all along as a ghost, at half its opacity: where each glyph ' +
            'is going to land.',
          focus: [part('rel-raw-canvas', 0, 0.5, 1, 0.5)],
        },
        {
          caption:
            'A glyph that is not on screen while the transformation runs is outlined, dashed. ' +
            'Here the − and the <i>b</i> of the target, which a block writes later.',
          focus: [part('rel-raw-canvas', 0.58, 0.6, 0.42, 0.4)],
        },
        {
          caption:
            'The bar of the loop takes the toolbar’s place, with <span class="ui">End ' +
            'preview</span> at its end. <kbd data-keys="Escape">Esc</kbd> ends it too.',
          focus: ['rel-raw-bar'],
        },
      ],
    },
    {
      // Preview raw playing, and Esc ending it: the editor stays open.
      kind: 'clip',
      name: 'raw-play',
      project: RAW,
      target: '.rel-main',
      // The key cap of Esc floats over the blank middle of the drawing, not over the play button
      // at the bar's left.
      keysAt: { x: 16, y: 270 },
      setup: openEditor('r_move'),
      holdStart: 200,
      holdEnd: 400,
      act: async (page, kit) => {
        await kit.click('rel-raw-open', { duration: 400, after: 150 });
        await page.getByTestId('rel-raw-canvas').waitFor();
        await kit.pause(1800);
        await kit.press('Escape', { after: 300 });
        await kit.pause(300);
      },
    },
    {
      // The same instant of a relation with a path arc of 90°, in the Preview: the glyphs follow
      // the arc.
      kind: 'shot',
      name: 'preview-arc',
      project: ARCS,
      target: '.rel-main',
      setup: [openEditor('r_arc_90'), previewAt(8)],
    },
    {
      // ...and in Preview raw: they go straight, and meet in the middle.
      kind: 'shot',
      name: 'raw-straight',
      project: ARCS,
      target: '.rel-main',
      setup: [openEditor('r_arc_90'), rawAt(8)],
    },
  ],
};
