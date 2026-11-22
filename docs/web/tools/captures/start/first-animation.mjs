/* Captures of start/first-animation: the steps of a first animation, performed in the real app —
 * a formula typed into the editor, its clip dragged onto a track, an intro, a second formula, a
 * relation between the two clips, the scene played, the Python exported.
 *
 * The steps are in `_shared/formula-steps.mjs` (they drive the app through its interface only: the
 * pointer, the keys, the menus). `buildStages(page, kit, 4, after)` performs them all on the app's
 * empty project (through `withChrome` and `Kit`) and hands each stage's project to `after`, which
 * writes the example file (`first-animation-1-first-clip` … `first-animation-4-transformed`), so
 * that every example is exactly the project its step leaves behind; `examples.mjs build` then makes
 * the rest. A run gives the objects new ids. */

import {
  applyFormula,
  chooseIntro,
  currentProject,
  dropFormula,
  openNewFormula,
  openTiming,
  relateClips,
  saveRelation,
  setScale,
  setUnpaired,
  suggestLinks,
  writeFormula,
} from '../_shared/formula-steps.mjs';

export const EXAMPLES = {
  first: 'docs/web/examples/first-animation-1-first-clip.mfe.json',
  intro: 'docs/web/examples/first-animation-2-written-in.mfe.json',
  two: 'docs/web/examples/first-animation-3-two-clips.mfe.json',
  done: 'docs/web/examples/first-animation-4-transformed.mfe.json',
};

/** What typing `x + 3 = 5` leaves in the visual field's raw LaTeX (it ignores the spaces). */
export const FIRST_LATEX = 'x + 3 = 5';
export const SECOND_LATEX = 'x = 5 - 3';

// ---- the stages of the page, built from the empty app --------------------------------------

/** Performs the steps of the page up to `stage` (1 to 4) from the app's empty project, calling
 * `after(stage, project)` once each stage is done: `first-animation-1-first-clip` … `4`. */
export async function buildStages(page, kit, upTo, after = async () => {}) {
  await writeFormula(page, kit, FIRST_LATEX);
  await dropFormula(kit, 'f1', 'Track 2', 0.05);
  await after(1, await currentProject(kit));
  if (upTo < 2) return;
  await openTiming(page, kit, 'f1');
  await chooseIntro(page, kit, 'write');
  await after(2, await currentProject(kit));
  if (upTo < 3) return;
  await writeFormula(page, kit, SECOND_LATEX);
  await dropFormula(kit, 'f2', 'Track 1', 2.05);
  await after(3, await currentProject(kit));
  if (upTo < 4) return;
  await relateClips(page, kit, 'f1', 'f2');
  await suggestLinks(page, kit);
  await setUnpaired(page, kit, { outro: 'fade_out', intro: 'fade_in' });
  await saveRelation(page, kit);
  await after(4, await currentProject(kit));
}

// ---- the items ------------------------------------------------------------------------------

/** The left part of the timeline: the track headers and the first five seconds. */
const TIMELINE_LEFT = { x: 8, y: 643, width: 642, height: 245 };
/** The Creator's first card and the first track: what a drag from one to the other crosses (and
 * the left end of the Preview, where the formula is not: it is at its centre). */
const CREATOR_TO_TIMELINE = { x: 8, y: 240, width: 462, height: 650 };

/** The id of the one relation of the project: what its band on the timeline is named by. */
const relationId = (kit) =>
  kit.mfe((mfe) => mfe.useProjectStore.getState().project.relations[0].id);

/** The boxes of every open menu and submenu, grown by `pad`, with the clip they come from. */
const menusAndClip = (name) => async (page, kit) => {
  const boxes = [await kit.box({ clip: name })];
  for (const menu of await page.locator('[role="menu"]').all()) {
    const box = await menu.boundingBox();
    if (box) boxes.push({ ...box, radius: 0 });
  }
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left - 10, y: top - 10, width: right - left + 20, height: bottom - top + 20 };
};

export default {
  page: 'start/first-animation',
  items: [
    {
      // The empty project the app opens with: the three places a first animation touches, and
      // the empty Creator's Try an example (4), which the page's tip tells of.
      kind: 'shot',
      name: 'window-empty',
      highlight: [
        { target: 'creator-new', label: 1, markerAt: 'bottom' },
        { target: 'panel-preview', label: 2, markerAt: 'right', pad: -2 },
        { target: { union: [{ track: 'Track 2' }, { track: 'Track 1' }] }, label: 3, markerAt: 'top-right' },
        // Below the button's corner: the button is near the panel's edge, and a marker on its
        // left edge would cover its first letter.
        { target: 'creator-example', label: 4, markerAt: 'bottom-left' },
      ],
    },
    {
      // + New, the formula typed into the visual field, a size, Apply: the editor with its three
      // fields. Its window is centred (1040 × 694 in a 1440 × 900 window).
      kind: 'shot',
      name: 'formula-editor',
      setup: async (page, kit) => {
        await openNewFormula(page, kit);
        await kit.type(FIRST_LATEX);
        await setScale(page, kit, 2);
        await applyFormula(page, kit);
      },
      target: { x: 194, y: 97, width: 1052, height: 706 },
      highlight: [
        // On the right edge: at the top-right corner the marker would cover the Keyboard key.
        { target: 'math-field-host', label: 1, markerAt: 'right' },
        { target: { union: ['editor-scale', 'editor-font-size'] }, label: 2, markerAt: 'top' },
        { target: 'editor-apply', label: 3, markerAt: 'top-right' },
      ],
    },
    {
      // The card of the Creator dragged onto the first track, at 0 s; Undo puts the app back.
      kind: 'clip',
      name: 'drag-to-timeline',
      setup: async (page, kit) => {
        await writeFormula(page, kit, FIRST_LATEX);
        await kit.clearSelection();
      },
      target: CREATOR_TO_TIMELINE,
      cursorStart: '[data-testid="formula-item"][data-name="f1"]',
      loop: false,
      holdEnd: 200,
      act: async (page, kit) => {
        await kit.pause(200);
        await dropFormula(kit, 'f1', 'Track 2', 0.05, { duration: 1200 });
        await kit.pause(300);
        // A press on an empty stretch of a lane deselects the clip (the Preview's hint for a
        // selected clip would be cut by the picture's edge); the clip stays.
        await kit.click({ x: await kit.timeToX(3.2), y: (await kit.point({ track: 'Track 1' })).y });
        await kit.pause(700);
        await kit.press('ControlOrMeta+Z');
      },
    },
    {
      // The clip selected, the Timing tab of the Animations panel open on its Intro.
      kind: 'shot',
      name: 'intro-panel',
      project: EXAMPLES.intro,
      setup: async (page, kit) => {
        await kit.selectClip('f1');
        await kit.click('animations-tab-timing');
        await page.getByTestId('intro-section').waitFor();
      },
      target: 'panel-animations',
      highlight: [
        { target: 'animations-tab-timing', label: 1, markerAt: 'top' },
        { target: 'intro-kind', label: 2, markerAt: 'top-right' },
      ],
    },
    {
      // The same choice from the menu of the clip: Intro ▸ Write.
      kind: 'shot',
      name: 'intro-menu',
      project: EXAMPLES.first,
      setup: async (page, kit) => {
        await kit.contextMenu({ clip: 'f1' });
        await kit.openSubmenu('Intro');
      },
      target: menusAndClip('f1'),
    },
    {
      // The second clip on the track below, starting one second before the first ends.
      kind: 'shot',
      name: 'two-clips',
      project: EXAMPLES.two,
      setup: async (page, kit) => {
        await kit.clearSelection();
      },
      target: TIMELINE_LEFT,
      highlight: [
        { target: { clip: 'f1' }, label: 1, markerAt: 'top-right' },
        { target: { clip: 'f2' }, label: 2, markerAt: 'bottom-right' },
      ],
    },
    {
      // Shift shows the link ports; a click on the port of the first clip, then on the second.
      kind: 'clip',
      name: 'link-ports',
      project: EXAMPLES.two,
      setup: async (page, kit) => {
        await kit.clearSelection();
      },
      target: TIMELINE_LEFT,
      keysAt: 'top-right',
      holdEnd: 300,
      loop: false,
      act: async (page, kit) => {
        await kit.pause(300);
        // As relateClips does, without waiting for the relation editor: the clip ends as it opens.
        const source = await kit.clipId('f1');
        await kit.down('Shift');
        await kit.click(`clip-${source}-link`);
        await kit.up('Shift');
        await kit.click({ clip: 'f2' }, { after: 150 });
        await kit.pause(200);
      },
    },
    {
      // The relation editor with the suggested links accepted: the button, the line that counts
      // the pairs, and the switch to the preview. The left column is what the step is about.
      kind: 'shot',
      name: 'links-suggested',
      project: EXAMPLES.two,
      setup: async (page, kit) => {
        await relateClips(page, kit, 'f1', 'f2');
        await suggestLinks(page, kit);
      },
      target: { css: '.rel-main' },
      padding: 12,
      highlight: [
        { target: 'rel-auto-link', label: 1, markerAt: 'top-right' },
        { target: 'rel-summary', label: 2, markerAt: 'top-right' },
        { target: 'rel-view', label: 3, markerAt: 'top-right' },
      ],
    },
    {
      // The Animation tab: what the glyphs no pair takes do — the plus leaves, the minus arrives.
      kind: 'shot',
      name: 'unpaired',
      project: EXAMPLES.two,
      setup: async (page, kit) => {
        await relateClips(page, kit, 'f1', 'f2');
        await suggestLinks(page, kit);
        await setUnpaired(page, kit, { outro: 'fade_out', intro: 'fade_in' });
      },
      target: { union: [{ css: '.rel-side' }, 'rel-save'] },
      padding: 14,
      highlight: [
        { target: 'rel-unpaired-out', label: 1, markerAt: 'top-right' },
        { target: 'rel-unpaired-in', label: 2, markerAt: 'top-right' },
        { target: 'rel-save', label: 3, markerAt: 'top-right' },
      ],
    },
    {
      // The saved relation on the timeline: its arrow, its window, and the two new animations.
      kind: 'shot',
      name: 'relation-saved',
      project: EXAMPLES.done,
      setup: async (page, kit) => {
        await kit.clearSelection();
      },
      target: TIMELINE_LEFT,
      highlight: [
        {
          target: async (page, kit) => `relation-window-${await relationId(kit)}`,
          label: 1,
          markerAt: 'bottom-right',
        },
      ],
    },
    {
      // The scene played in the Preview: two instants, the playhead on the timeline.
      kind: 'tour',
      name: 'playing',
      project: EXAMPLES.done,
      setup: async (page, kit) => {
        await kit.clearSelection();
      },
      steps: [
        {
          caption:
            'At <b>0.6 s</b> the first clip is writing itself in: its intro, <b>Write</b>, runs ' +
            'from 0 to 1 s.',
          act: async (page, kit) => {
            await kit.seek(0.6);
          },
          focus: ['panel-preview'],
        },
        {
          caption:
            'At <b>2.4 s</b> the two clips overlap and the transformation runs: <b>x</b>, ' +
            '<b>=</b>, <b>3</b> and <b>5</b> move to their places, the <b>+</b> fades out and the ' +
            '<b>−</b> fades in. From <b>3 s</b> the second clip is alone and stays to the end, at 5 s.',
          act: async (page, kit) => {
            await kit.seek(2.4);
          },
          focus: [{ x: 8, y: 643, width: 642, height: 245 }, 'panel-preview'],
        },
      ],
    },
    {
      // The project's name, in the menu bar, of the app's empty project: clicked it becomes a field
      // with the name selected, ready to be typed over; Enter commits it, and the scene and the .py
      // file take the name.
      kind: 'shot',
      name: 'project-name',
      setup: async (page, kit) => {
        await kit.click('project-rename');
        await kit.waitFor('project-rename-input');
      },
      target: { x: 880, y: 0, width: 560, height: 44 },
      highlight: [{ target: 'project-rename-input', label: 1, markerAt: 'left' }],
    },
    {
      // Export ▸ Python — ManimCE…: the arrow of the Export… button, and its menu.
      kind: 'shot',
      name: 'export-menu',
      project: EXAMPLES.done,
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.openMenu('Export');
      },
      target: { x: 0, y: 0, width: 760, height: 228 },
      highlight: [{ target: 'export-button-export-ce', label: 1, markerAt: 'top-right' }],
    },
  ],
};
