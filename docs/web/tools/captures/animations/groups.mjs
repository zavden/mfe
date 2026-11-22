/* Captures of animations/groups: a block split into a group and a group folded and unfolded, each
 * in a tour of two images (they are steps, not motion), the Animations panel of a group, the menus
 * of a group and of a block that could join one, and a group dragged on the timeline, the one
 * clip, since a drag is motion. The projects are `groups-split` (one Write over both sides of
 * 2x + 4 = 10), `groups-sides` (the same Write already split into a group of two) and
 * `groups-mixed` (an Indicate, a Wiggle and a Write that start together and last the same). */

const SPLIT = 'docs/web/examples/groups-split.mfe.json';
const SIDES = 'docs/web/examples/groups-sides.mfe.json';
const MIXED = 'docs/web/examples/groups-mixed.mfe.json';

/** The timeline zoomed in, so that a block is wide enough to read its label. */
const ZOOM = 160;

const zoom = (page, kit) =>
  kit.app('/src/ui/timeline/timelineStore.ts', (m, z) => m.useTimelineStore.getState().setZoom(z), ZOOM);

/** The block of the timeline labelled `label`, or the folded group with that label. */
const block = (label) => (page) =>
  page
    .locator('[data-testid^="action-block-"][data-kind], [data-testid^="group-block-"][data-group]')
    .filter({ hasText: label })
    .first();

/** The playhead at 3 s: nothing animates there. */
const CALM = 3;

/** The row of the track: the ruler, the clip and its lanes, with room for a second lane. */
const ROW = { x: 16, y: 716, width: 760, height: 124 };

export default {
  page: 'animations/groups',
  items: [
    {
      // The one Write over both sides, split into runs: the glyphs 0–3 and 5–6 are two runs, and
      // the timeline draws the two blocks as one, "Write ×2".
      kind: 'tour',
      name: 'split-runs',
      project: SPLIT,
      target: { x: 188, y: 440, width: 520, height: 460 },
      scale: 1.5,
      setup: async (page, kit) => {
        await kit.seek(CALM);
        await zoom(page, kit);
      },
      steps: [
        {
          caption:
            'Right-click a block that names glyphs: here a <span class="ui">Write</span> over ' +
            'six glyphs, both sides of the equation without the equal sign. Choose ' +
            '<span class="ui">Split into runs</span>.',
          act: async (page, kit) => {
            await kit.contextMenu(block('Write'));
          },
          focus: [async (page, kit) => (await kit.menuEntry('Split into runs')).box],
        },
        {
          caption:
            'The block becomes one block for each run of consecutive glyphs, both at its time, ' +
            'and the timeline draws the two as one: <span class="ui">Write ×2</span>. ' +
            '<kbd data-keys="Mod+Z">Ctrl+Z</kbd> brings the single block back.',
          act: async (page, kit) => {
            await kit.choose('Split into runs');
          },
          focus: [block('Write')],
        },
      ],
    },
    {
      // The arrow of the group unfolds it into a lane for each block; the arrow of the first
      // block folds it again.
      kind: 'tour',
      name: 'fold',
      project: SIDES,
      target: ROW,
      setup: async (page, kit) => {
        await kit.seek(CALM);
        await zoom(page, kit);
      },
      steps: [
        {
          caption:
            'A folded group is one block, with an arrow at its left. Press the arrow, or ' +
            'double-click the group, to unfold it.',
          focus: [{ css: '[data-testid^="group-unfold-"]' }],
          focusPadding: 4,
        },
        {
          caption:
            'The members take a lane each, with dashed borders to show that they are grouped. ' +
            'The arrow on the first of them folds the group again.',
          act: async (page, kit) => {
            await kit.click({ css: '[data-testid^="group-unfold-"]' });
            await kit.settle();
          },
          cursor: true,
          focus: [{ css: '[data-testid^="group-fold-"]' }],
          focusPadding: 4,
        },
      ],
    },
    {
      // A group selected: its blocks as keys at the top of the Animations panel, and the timing
      // below them, which is the group's.
      kind: 'shot',
      name: 'panel',
      project: SIDES,
      viewport: { width: 1440, height: 1060 },
      setup: async (page, kit) => {
        await kit.seek(CALM);
        await zoom(page, kit);
      },
      steps: async (page, kit) => {
        await kit.click(block('Write'));
      },
      target: 'panel-animations',
      highlight: [
        { target: '.an-group-members', label: 1, markerAt: 'top-right' },
        { target: { union: ['block-group-leave', 'block-group-ungroup'] }, label: 2, markerAt: 'top' },
        { target: 'block-timing-section', label: 3, markerAt: 'top-right' },
      ],
    },
    {
      // The menu of a folded group.
      kind: 'shot',
      name: 'group-menu',
      project: SIDES,
      setup: async (page, kit) => {
        await kit.seek(CALM);
        await zoom(page, kit);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(block('Write'));
      },
      target: { x: 300, y: 540, width: 360, height: 360 },
    },
    {
      // Three blocks that start together and last the same, not in a group yet: each one's menu
      // offers to group them.
      kind: 'shot',
      name: 'group-with',
      project: MIXED,
      setup: async (page, kit) => {
        await kit.seek(CALM);
        await zoom(page, kit);
        // Ungroup, as the menu of the group does.
        await kit.contextMenu(block('Group'));
        await kit.choose('Ungroup');
      },
      steps: async (page, kit) => {
        await kit.contextMenu(block('Indicate'));
      },
      target: { x: 300, y: 440, width: 460, height: 460 },
    },
    {
      // The folded group of three different animations: one block, in the colour of mixed
      // families, with the label "Group ×3".
      kind: 'shot',
      name: 'mixed',
      project: MIXED,
      setup: async (page, kit) => {
        await kit.seek(CALM);
        await zoom(page, kit);
      },
      target: ROW,
      highlight: [{ target: block('Group'), label: 1, markerAt: 'top-right' }],
    },
    {
      // The folded group dragged: its two blocks move as one. Esc puts it back.
      kind: 'clip',
      name: 'drag-group',
      project: SIDES,
      target: ROW,
      keysAt: 'top-right',
      cursorStart: { x: 560, y: 826 },
      holdStart: 300,
      holdEnd: 500,
      setup: async (page, kit) => {
        await kit.seek(CALM);
        await zoom(page, kit);
      },
      act: async (page, kit) => {
        const grab = await kit.point(block('Write'));
        const px = await kit.pxPerSecond();
        await kit.move(grab);
        await kit.mouseDown();
        await kit.move({ x: grab.x + 1.2 * px, y: grab.y }, { duration: 1300 });
        await kit.pause(1000);
        await kit.press('Escape');
        await kit.mouseUp();
      },
    },
  ],
};
