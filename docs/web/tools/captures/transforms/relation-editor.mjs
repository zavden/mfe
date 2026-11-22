/* Captures of transforms/relation-editor: how the editor is opened (the link ports of the
 * timeline, the form of the Animations panel), a tour of its parts, the gestures that link
 * glyphs (a click, Shift and Link, a box), Suggest links by label, the glyph lists, the keys of
 * the drawing's view and the drawing side by side, the sources
 * a transform consumes (outlined in red dashes), what the editor refuses, the pair list with its
 * styles, its extra sources and its marks of edited paths,
 * the menu of a pair, the styles a right click offers while linking, what the editor says when it
 * finds a problem, the menu of two clips that are related already and the glyphs another relation
 * has taken.
 *
 * The projects are this page's own examples (docs/web/examples/relation-editor-chain and
 * relations-*) and the repository's custom-paths example. Only the gestures that need motion
 * are clips; the rest are stills or a tour. */

import { createEditor, expectLayout, newRelation, openEditor } from '../_shared/relation-editor.mjs';

const CHAIN = 'docs/web/examples/relation-editor-chain.mfe.json';
const DISTRIBUTE = 'docs/web/examples/relations-distribute.mfe.json';
const EXTRAS = 'docs/web/examples/relations-extras.mfe.json';
const TWICE = 'docs/web/examples/relations-twice.mfe.json';

/** The ruler and the three tracks of the chain example, the first 900 px. */
async function chainTracks(page, kit) {
  const panel = await kit.box('panel-timeline');
  const ruler = await kit.box('timeline-ruler');
  const last = await kit.box({ track: 'Track 1' });
  const top = ruler.y - 6;
  return { x: panel.x, y: top, width: 900, height: last.y + last.height + 8 - top };
}

export default {
  page: 'transforms/relation-editor',
  project: DISTRIBUTE,
  items: [
    {
      // Starting from the timeline: hold Shift, a link port shows in the lower half of every
      // clip; click the port of the source clip, then the target clip. The editor opens on the
      // relation between them (a new one here: nothing is saved until Save relation).
      kind: 'clip',
      name: 'shift-link',
      project: CHAIN,
      target: chainTracks,
      holdStart: 200,
      holdEnd: 400,
      cursorStart: async (page, kit) => {
        const lane = await kit.box({ track: 'Track 1' });
        return { x: lane.x - 120, y: lane.y + lane.height / 2 };
      },
      setup: async (page, kit) => {
        await kit.click('timeline-fit');
      },
      act: async (page, kit) => {
        await kit.down('Shift');
        await kit.pause(450);
        await kit.click('clip-c_second-link', { duration: 450, after: 120 });
        await kit.up('Shift');
        await kit.click({ clip: 'third' }, { position: { x: 160, y: 24 }, duration: 450, after: 120 });
        await page.getByTestId('relation-editor').waitFor();
        await kit.pause(900);
        await kit.press('Escape', { after: 200 });
      },
    },
    {
      // Starting from the Animations panel: the Relations tab of the source clip, the other clip
      // chosen in Relate with (1), the direction (2) and Create relation… (3).
      kind: 'shot',
      name: 'create-form',
      project: CHAIN,
      viewport: { width: 1440, height: 1000 },
      target: 'create-relation',
      padding: 8,
      setup: async (page, kit) => {
        await kit.click('timeline-fit');
        await kit.selectClip('second');
        await page.getByTestId('create-relation-other').selectOption('c_third');
        await kit.settle({ renders: false });
      },
      highlight: [
        { target: 'create-relation-other', label: 1, markerAt: 'top-right', pad: 2 },
        { target: 'create-relation-direction', label: 2, markerAt: 'top-right', pad: 2 },
        { target: 'create-relation-button', label: 3, markerAt: 'top-right', pad: 2 },
      ],
    },
    {
      // Between two clips that are related already, the button asks: the menu under it lists
      // their relations by number and offers to add another.
      kind: 'shot',
      name: 'choice-menu',
      project: TWICE,
      viewport: { width: 1440, height: 1000 },
      target: { union: ['create-relation', 'relation-choice'] },
      padding: 8,
      setup: async (page, kit) => {
        await kit.click('timeline-fit');
        await kit.selectClip('source');
        await page.getByTestId('create-relation-other').selectOption('c_target');
        // The form is the last thing of the tab: the whole button in view before the menu
        // opens under it.
        await kit.scrollTo('create-relation');
        await page.getByTestId('create-relation-button').scrollIntoViewIfNeeded();
        await kit.click('create-relation-button');
        await page.getByTestId('relation-choice').waitFor();
        await kit.settle({ renders: false });
      },
    },
    {
      // The editor, area by area.
      kind: 'tour',
      name: 'editor',
      target: 'relation-editor',
      scale: 1,
      setup: [openEditor('r_distribute'), expectLayout('rel', 'stacked')],
      steps: [
        {
          caption:
            'The heading names the two clips of the relation: the <b>Source</b>, whose glyphs ' +
            'move or leave, and the <b>Target</b>, whose glyphs arrive, each with the time it ' +
            'is on the timeline.',
          focus: ['rel-heading-from', 'rel-heading-to'],
        },
        {
          caption:
            'One line sums the relation up: how many pairs, how many glyphs leave and how many ' +
            'arrive. The switch <span class="ui">Link | Preview</span> chooses between the ' +
            'drawing below and the transformation playing.',
          focus: ['rel-summary', 'rel-view'],
        },
        {
          caption:
            'The drawing: the source on top, the target below. Click a glyph of each to link ' +
            'them. A link has a colour of its own and a badge with its number and its style; a ' +
            'source its pair consumes is outlined in red dashes.',
          focus: ['rel-canvas'],
        },
        {
          caption:
            'Over its corner, the keys of the view: the layout, stacked or side by side, the zoom ' +
            'and <span class="ui">Fit</span>.',
          focus: ['.rel-view-tools'],
        },
        {
          caption:
            'The tools: what is selected, <span class="ui">Link</span>, ' +
            '<span class="ui">Clear selection</span>, <span class="ui">Suggest links by ' +
            'label</span>, the key that lists the glyphs, the eye that hides the links, and ' +
            '<span class="ui">Preview raw</span>.',
          focus: ['.rel-toolbar'],
        },
        {
          caption:
            'The <span class="ui">Pairs</span> tab lists the pairs: the glyphs of each, its ' +
            'style, <span class="ui">Edit</span>, <span class="ui">Edit path…</span> and ×.',
          focus: ['rel-side-tab-pairs', 'rel-pairs'],
        },
        {
          caption:
            'The <span class="ui">Animation</span> tab sets the window of the transformation ' +
            'and its easing, the default style and the path arc, then what the glyphs that ' +
            'belong to no pair do.',
          act: async (page, kit) => {
            await kit.click('rel-side-tab-animation');
            await kit.settle({ renders: false });
          },
          focus: ['rel-settings'],
        },
        {
          caption:
            'Nothing is saved until <span class="ui">Save relation</span>, and the whole ' +
            'session is one undo step. <span class="ui">Delete relation</span> takes an ' +
            'existing relation away. <span class="ui">Close</span> leaves the editor; once you ' +
            'have changed something it reads <span class="ui">Cancel</span> and asks before ' +
            'it throws the changes away.',
          focus: ['.modal-footer'],
        },
      ],
    },
    {
      // One glyph to several: the a of the source, the two a of the target added with Shift, and
      // Link. The plus signs are linked already (a click on a glyph of each formula), so that the
      // clip ends with both kinds of pair.
      kind: 'clip',
      name: 'link-gestures',
      target: '.rel-main',
      holdStart: 100,
      holdEnd: 300,
      setup: [
        newRelation('c_before', 'c_after'),
        async (page, kit) => {
          await kit.click('rel-from-glyph-3');
          await kit.click('rel-to-glyph-2');
        },
      ],
      act: async (page, kit) => {
        await kit.click('rel-from-glyph-0', { duration: 300, after: 60 });
        await kit.click('rel-to-glyph-0', { hold: ['Shift'], duration: 280, after: 60 });
        await kit.click('rel-to-glyph-3', { hold: ['Shift'], duration: 250, after: 60 });
        await kit.click('rel-link', { duration: 300, after: 350 });
      },
    },
    {
      // Many-to-one with a box: a box over both x of the source selects them; one click on the x
      // of the target links them all at once.
      kind: 'clip',
      name: 'link-box',
      project: EXTRAS,
      target: '.rel-main',
      holdStart: 200,
      holdEnd: 500,
      setup: [newRelation('c_source_1', 'c_target_1'), expectLayout('rel', 'stacked')],
      act: async (page, kit) => {
        const first = await kit.box('rel-from-glyph-0');
        const second = await kit.box('rel-from-glyph-1');
        await kit.drag(
          { x: first.x - 24, y: first.y - 22 },
          { x: second.x + second.width + 24, y: second.y + second.height + 22 },
          { duration: 800 },
        );
        await kit.pause(400);
        await kit.click('rel-to-glyph-0', { duration: 450, after: 600 });
      },
    },
    {
      // The links Suggest links by label proposes, before they are accepted.
      kind: 'shot',
      name: 'suggestion',
      target: '.rel-main',
      scale: 1.5,
      setup: [
        newRelation('c_before', 'c_after'),
        async (page, kit) => {
          await kit.click('rel-auto-link');
          await kit.settle({ renders: false });
        },
      ],
      highlight: [{ target: 'rel-suggestion', label: 1, markerAt: 'top-right', pad: 2 }],
    },
    {
      // The glyph lists: a key for every glyph, to link from the keyboard; the key that shows
      // them (1) sits before the eye, and the lists (2) are under the toolbar.
      kind: 'shot',
      name: 'glyph-lists',
      target: { union: ['.rel-toolbar', 'rel-chips'] },
      padding: 8,
      setup: [
        openEditor('r_distribute'),
        async (page, kit) => {
          await kit.click('rel-toggle-list');
          await kit.settle({ renders: false });
        },
      ],
      highlight: [
        { target: 'rel-toggle-list', label: 1, markerAt: 'top-right', pad: 2 },
        { target: 'rel-chips', label: 2, markerAt: 'bottom-right', pad: 2 },
      ],
    },
    {
      // The keys of the drawing's view, over its upper right corner: the layout (1), the zoom keys
      // around how near the view is (2) and «Fit» (3). The corner of the drawing, with enough of
      // it around the keys to place them. The zoom keys and «Fit» are 3 px apart: their rings are
      // drawn closer to them, so that they do not lie on each other.
      kind: 'shot',
      name: 'view-keys',
      target: async (page, kit) => {
        const stage = await kit.box('rel-stage');
        const width = Math.min(stage.width, 360);
        return { x: stage.x + stage.width - width, y: stage.y, width, height: Math.min(stage.height, 150) };
      },
      padding: 8,
      setup: openEditor('r_distribute'),
      highlight: [
        { target: 'rel-toggle-layout', label: 1, markerAt: 'bottom-left', pad: 0 },
        { target: { union: ['rel-zoom-out', 'rel-zoom-in'] }, label: 2, markerAt: 'bottom', pad: -2 },
        { target: 'rel-view-fit', label: 3, markerAt: 'bottom-right', pad: -2 },
      ],
    },
    {
      // The same relation side by side, as its key lays it out: the source at the left, the
      // target at the right, each pair an arc over the two.
      kind: 'shot',
      name: 'side-by-side',
      target: 'rel-stage',
      padding: 8,
      setup: [
        openEditor('r_distribute'),
        async (page, kit) => {
          await kit.click('rel-toggle-layout');
          await kit.move({ x: 6, y: 6 });
          await kit.settle({ renders: false });
        },
      ],
    },
    {
      // The sources a transform consumes, outlined in red dashes, beside sources that are only
      // copied: the a and the c keep the relation's Transform; the b is given Fade copy and the
      // plus sign Copy (in the project, before the editor opens), so they stay and have no
      // outline. Their badges read FC and C.
      kind: 'shot',
      name: 'consumed',
      target: '.rel-main',
      scale: 1.5,
      setup: [
        async (page, kit) => {
          await kit.mfe((mfe) =>
            mfe.useProjectStore.getState().update((draft) => {
              const { pairs } = draft.relations.find((r) => r.id === 'r_distribute');
              pairs[1].style = 'fade_copy';
              pairs[2].style = 'copy';
            }),
          );
        },
        openEditor('r_distribute'),
      ],
    },
    {
      // A link the editor refuses, and why: the source a is consumed by pair 1 already, so it
      // cannot go to the + too.
      kind: 'shot',
      name: 'refused',
      target: '.rel-main',
      scale: 1.5,
      setup: [
        openEditor('r_distribute'),
        async (page, kit) => {
          await kit.click('rel-from-glyph-0');
          await kit.click('rel-to-glyph-2');
          await page.getByTestId('rel-message').waitFor();
          // Off the drawing: the circle of the selector is not what the figure is about.
          await kit.move({ x: 6, y: 6 });
          await kit.settle({ renders: false });
        },
      ],
      highlight: [{ target: 'rel-message', label: 1, markerAt: 'top-right', pad: 2 }],
    },
    {
      // The second relation between two clips: the glyphs the first one took are dimmed, on
      // both sides.
      kind: 'shot',
      name: 'taken',
      project: TWICE,
      target: '.rel-main',
      scale: 1.5,
      setup: openEditor('r_second'),
    },
    {
      // The menu of a pair: a right click on a glyph that has links. The styles, Edit path… and
      // deleting the link.
      kind: 'shot',
      name: 'pair-menu',
      target: { union: ['rel-canvas', '.ctx-menu'] },
      padding: 6,
      cursor: true,
      setup: [
        openEditor('r_distribute'),
        async (page, kit) => {
          await kit.contextMenu('rel-from-glyph-0');
        },
      ],
    },
    {
      // «Link as»: the style of a pair chosen while linking. The a of the source already turns
      // into the first a of the target (a click: the relation's Transform); selected again, a
      // right click on the second a offers the styles, and the two that would consume it once
      // more are greyed out over the reason. The entries of the pair it has follow.
      kind: 'shot',
      name: 'link-as',
      target: { union: ['rel-canvas', '.ctx-menu'] },
      padding: 6,
      cursor: true,
      setup: [
        newRelation('c_before', 'c_after'),
        async (page, kit) => {
          await kit.click('rel-from-glyph-0');
          await kit.click('rel-to-glyph-0');
          await kit.click('rel-from-glyph-0');
          await kit.contextMenu('rel-to-glyph-3');
        },
      ],
    },
    {
      // Two sources onto one target are one pair; its menu takes it apart, a pair per source
      // (Split into separate pairs), so that each can have its own style and path.
      kind: 'shot',
      name: 'split-menu',
      project: EXTRAS,
      target: { union: ['rel-canvas', '.ctx-menu'] },
      padding: 6,
      cursor: true,
      setup: [
        openEditor('r_separate'),
        async (page, kit) => {
          await kit.contextMenu('rel-from-glyph-0');
        },
      ],
    },
    {
      // A problem the editor finds: the second clip is still receiving its glyphs through the
      // first relation when this one starts, so Save relation is off until it is fixed.
      kind: 'shot',
      name: 'problems',
      project: CHAIN,
      target: { union: ['rel-problems', 'rel-save'] },
      padding: 10,
      setup: [
        createEditor('c_second', 'c_third'),
        async (page, kit) => {
          await kit.click('rel-from-glyph-0');
          await kit.click('rel-to-glyph-2');
          await page.getByTestId('rel-problems').waitFor();
          // The page says an Offset of 0.8 s in the Animation tab makes the problem go: do it,
          // look, and put the window back so that the figure shows the problem.
          await kit.click('rel-side-tab-animation');
          const offset = page.getByTestId('rel-offset');
          await offset.fill('0.8');
          await offset.press('Enter');
          await kit.settle({ renders: false });
          if ((await page.getByTestId('rel-problems').count()) > 0) {
            kit.warn('an Offset of 0.8 s does not clear the problem the page says it clears');
          }
          await offset.fill('0');
          await offset.press('Enter');
          await page.getByTestId('rel-problems').waitFor();
          await kit.settle({ renders: false });
        },
      ],
      highlight: [
        { target: 'rel-problems', label: 1, markerAt: 'top-right', pad: 2 },
        { target: 'rel-save', label: 2, markerAt: 'top-right', pad: 2 },
      ],
    },
    {
      // Several sources, one target: how the sources beyond the first arrive. Here the second
      // sends a copy and stays; the first is the principal.
      kind: 'shot',
      name: 'extras',
      project: EXTRAS,
      target: 'rel-pair-0',
      padding: 6,
      setup: openEditor('r_copies'),
      highlight: [
        { target: 'rel-pair-0-extras', label: 1, markerAt: 'top-right', pad: 2 },
        { target: 'rel-pair-0-principal', label: 2, markerAt: 'bottom-right', pad: 2 },
      ],
    },
    {
      // The pair list of a relation with paths of its own: the dot (1) marks a pair whose path
      // was shaped, a pair can have a style of its own (2), and Edit path… (3) goes to the
      // preview to shape one.
      kind: 'shot',
      name: 'pair-list',
      project: 'examples/custom-paths.mfe.json',
      target: { union: ['rel-pair-0', 'rel-pair-6'] },
      padding: 6,
      setup: openEditor('r_sum_swap'),
      highlight: [
        { target: 'rel-pair-0-path-dot', label: 1, markerAt: 'top-left', pad: 3 },
        { target: 'rel-pair-3-style', label: 2, markerAt: 'top-right', pad: 2 },
        { target: 'rel-pair-2-edit-path', label: 3, markerAt: 'top-right', pad: 2 },
      ],
    },
  ],
};
