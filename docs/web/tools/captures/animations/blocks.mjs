/* Captures of animations/blocks: the "Add animation" menu, and the block it adds, in a tour, the
 * Animations panel of a block and of a clip, the block dialog and its Preview, a block dragged
 * until it stops (the one clip: a drag is motion), blocks in lanes and the menu of a block. They
 * nearly all use `blocks-parallel`: one
 * clip, 0–7 s, with a Write (1.6 s), an Indicate (1.6 s), a Wiggle (2.2–4.2 s) and, later, a
 * Transform of the same glyphs as the Wiggle (5–6 s). */

const PROJECT = 'docs/web/examples/blocks-parallel.mfe.json';
const TRANSFORM = 'docs/web/examples/blocks-transform.mfe.json';

/** The part of the window that holds the timeline and the menus that rise from it. */
const MENUS = { x: 188, y: 440, width: 800, height: 460 };

/** The block of the timeline labelled `label` ("Wiggle", "Write"…). */
const block = (label) => (page) =>
  page
    .locator('[data-testid^="action-block-"][data-kind]')
    .filter({ hasText: label })
    .first();

/** The playhead at 3 s: nothing animates there but the Wiggle. */
const CALM = 3;

/** Right-clicks the clip `eq` at `t` seconds, low in the clip where no block lies: the "Add
 * animation" menu. */
async function addMenuAt(page, kit, t) {
  const clip = await kit.box({ clip: 'eq' });
  await kit.contextMenu({ x: await kit.timeToX(t), y: clip.y + clip.height - 8 });
  return page.getByTestId('add-animation-menu');
}

/** The glyph `index` of the formula drawn in large in the block dialog (the Animations panel
 * behind the dialog has glyph keys of the same names). */
const dialogGlyph = (index) => ({
  css: `[data-testid="block-dialog-glyphs"] [data-testid="block-glyph-${index}"]`,
});

/** Drags the Wiggle where it stops and lets go with Esc: what the drag clip records, and what
 * its setup does once without recording, so that the lanes the drag leaves are the ones the clip
 * starts with and the clip loops without a jump. */
async function dragWiggle(page, kit) {
  // The pauses are for the viewer of the clip: the warm-up goes without them.
  const rest = (ms) => (kit.recording ? kit.pause(ms) : Promise.resolve());
  const grab = await kit.point(block('Wiggle'));
  const px = await kit.pxPerSecond();
  await kit.move(grab);
  await kit.mouseDown();
  // Left, over the Write and the Indicate: the readout says what the block runs with.
  await kit.move({ x: grab.x - 0.5 * px, y: grab.y }, { duration: 700 });
  await rest(700);
  // Right, as far as the Transform of its glyphs lets it go.
  await kit.move({ x: grab.x + 1.9 * px, y: grab.y }, { duration: 900 });
  await rest(800);
  await kit.press('Escape');
  await kit.mouseUp();
}

/** What every step of the add-menu tour shares: the main menu, to come back to between submenus. */
const state = { main: null };

export default {
  page: 'animations/blocks',
  project: PROJECT,
  items: [
    {
      // The playhead at 4.6 s and a right-click on the clip there: the menu, which adds at the
      // playhead, then each family of blocks in its submenu, then the rest of the menu.
      kind: 'tour',
      name: 'add-menu',
      scale: 1.5,
      target: MENUS,
      setup: async (page, kit) => {
        await kit.seek(4.6);
      },
      steps: [
        {
          caption:
            'Put the playhead where the animation should start and right-click the clip. The ' +
            'header of the menu says which clip, and that the block starts at the playhead.',
          act: async (page, kit) => {
            state.main = await addMenuAt(page, kit, 4.6);
          },
          focus: ['add-animation-header'],
        },
        {
          caption:
            '<b>Appear</b> brings glyphs on screen: <span class="ui">Write</span>, ' +
            '<span class="ui">Create</span>, <span class="ui">FadeIn</span>, ' +
            '<span class="ui">GrowFromCenter</span> and ' +
            '<span class="ui">DrawBorderThenFill</span>.',
          act: async (page, kit) => {
            kit.menu = state.main;
            await kit.openSubmenu('Appear');
          },
          focus: [(page, kit) => kit.menu],
        },
        {
          caption:
            '<b>Disappear</b> takes glyphs off screen: <span class="ui">FadeOut</span>, ' +
            '<span class="ui">Unwrite</span>, <span class="ui">Uncreate</span> and ' +
            '<span class="ui">ShrinkToCenter</span>.',
          act: async (page, kit) => {
            kit.menu = state.main;
            await kit.openSubmenu('Disappear');
          },
          focus: [(page, kit) => kit.menu],
        },
        {
          caption:
            '<b>Transform</b> moves the <span class="ui">Whole formula (keyframe)</span> or ' +
            'a <span class="ui">Part of the formula</span>. <span class="ui">Morph within the ' +
            'formula</span> is an entry of its own.',
          act: async (page, kit) => {
            kit.menu = state.main;
            await kit.openSubmenu('Transform');
          },
          focus: [(page, kit) => kit.menu, { text: 'Morph within the formula' }],
        },
        {
          caption:
            '<b>Emphasis</b> draws attention to glyphs for a moment and leaves them as they ' +
            'were: <span class="ui">Indicate</span>, <span class="ui">Wiggle</span>, ' +
            '<span class="ui">Circumscribe</span>, <span class="ui">Flash</span> and ' +
            '<span class="ui">FocusOn</span>.',
          act: async (page, kit) => {
            kit.menu = state.main;
            await kit.openSubmenu('Emphasis');
          },
          focus: [(page, kit) => kit.menu],
        },
        {
          caption:
            'Choose <span class="ui">Circumscribe</span>: a block of that name starts at 4.6 s, ' +
            'at the playhead, and lasts one second, the length it starts with.',
          act: async (page, kit) => {
            kit.menu = state.main;
            await kit.openSubmenu('Emphasis');
            await kit.choose('Circumscribe');
            await kit.settle();
          },
          focus: [block('Circumscribe')],
        },
      ],
    },
    {
      // A block selected: the Animations panel shows its animation, its timing and its glyphs.
      kind: 'shot',
      name: 'panel',
      viewport: { width: 1440, height: 1060 },
      setup: async (page, kit) => {
        await kit.seek(CALM);
      },
      steps: async (page, kit) => {
        await kit.click(block('Wiggle'));
      },
      target: 'panel-animations',
      highlight: [
        { target: 'block-animation-section', label: 1, markerAt: 'top-right' },
        { target: 'block-timing-section', label: 2, markerAt: 'top-right' },
        { target: 'block-glyphs-section', label: 3, markerAt: 'top-right' },
      ],
    },
    {
      // A clip selected: the Timing tab lists its blocks, under the button that adds one at the
      // playhead.
      kind: 'shot',
      name: 'clip-panel',
      viewport: { width: 1440, height: 1060 },
      setup: async (page, kit) => {
        await kit.seek(CALM);
      },
      steps: async (page, kit) => {
        await kit.selectClip('eq');
        await kit.click('animations-tab-timing');
        await kit.scrollTo('blocks-section');
      },
      target: 'panel-animations',
      highlight: [{ target: 'add-animation', label: 1, markerAt: 'top-left' }],
    },
    {
      // The blocks of one clip at the same time, each in a lane of its own: the Write and the
      // Indicate start together, the Wiggle starts in the middle of both.
      kind: 'shot',
      name: 'lanes',
      setup: async (page, kit) => {
        await kit.seek(CALM);
      },
      target: async (page, kit) => {
        const clip = await kit.box({ clip: 'eq' });
        const header = await kit.box('panel-timeline');
        return { x: header.x, y: clip.y - 34, width: 780, height: clip.height + 40 };
      },
      highlight: [
        { target: block('Write'), label: 1, markerAt: 'top-left' },
        { target: block('Indicate'), label: 2, markerAt: 'left' },
        { target: block('Wiggle'), label: 3, markerAt: 'bottom-left' },
      ],
    },
    {
      // The Wiggle dragged to the left over the Write and the Indicate, then to the right: held
      // back at 5 s by the Transform that animates the same glyphs. Esc puts it back.
      kind: 'clip',
      name: 'drag-block',
      target: { x: 0, y: 640, width: 960, height: 250 },
      keysAt: 'top-right',
      holdStart: 300,
      holdEnd: 300,
      cursorStart: { x: 640, y: 850 },
      setup: async (page, kit) => {
        await kit.seek(CALM);
        await dragWiggle(page, kit);
      },
      act: async (page, kit) => {
        await dragWiggle(page, kit);
      },
    },
    {
      // The menu of a block: another effect, a copy, a split, or delete it.
      kind: 'shot',
      name: 'block-menu',
      setup: async (page, kit) => {
        await kit.seek(CALM);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(block('Wiggle'));
      },
      target: { x: 420, y: 560, width: 380, height: 340 },
    },
    {
      // The dialog of a keyframe: no glyphs to pick, so the fields alone, and Preview.
      kind: 'shot',
      name: 'dialog-keyframe',
      project: TRANSFORM,
      setup: async (page, kit) => {
        await kit.seek(0.5);
      },
      steps: async (page, kit) => {
        await kit.doubleClick(
          page.locator('[data-testid^="action-block-"][data-kind="tween"]').first(),
        );
        await (await kit.locate('block-dialog')).waitFor();
        await kit.settle();
      },
      target: 'block-dialog',
      padding: 12,
    },
    {
      // A keyframe selected, and the icon at the end of its block pressed: the playhead goes to
      // the end of the block and the formula can be moved, scaled and turned in the Preview, with
      // the state it starts from drawn faintly.
      kind: 'shot',
      name: 'end-state',
      project: TRANSFORM,
      setup: async (page, kit) => {
        await kit.seek(0.5);
      },
      steps: async (page, kit) => {
        await kit.click(page.locator('[data-testid^="action-block-"][data-kind="tween"]').first());
        await kit.click({ css: '[data-testid^="block-end-state-"]' });
        await kit.settle();
      },
      target: { x: 0, y: 40, width: 1120, height: 860 },
      highlight: [
        { target: { css: '[data-testid^="block-end-state-"]' }, label: 1, markerAt: 'top' },
        { target: 'preview-canvas', label: 2, markerAt: 'top-left' },
      ],
    },
    {
      // Double-click a block: its dialog. Then the glyphs in large, and Preview.
      kind: 'tour',
      name: 'dialog',
      viewport: { width: 1280, height: 820 },
      setup: async (page, kit) => {
        await kit.seek(CALM);
      },
      steps: [
        {
          caption:
            'Double-click a block for its dialog. On the left, the fields of the Animations ' +
            'panel with more room: the animation, its timing and its glyphs.',
          act: async (page, kit) => {
            await kit.doubleClick(block('Wiggle'));
            await (await kit.locate('block-dialog')).waitFor();
            await kit.settle();
          },
          focus: ['.block-dialog-fields'],
        },
        {
          caption:
            'On the right, the formula in large to choose the glyphs: click one, ' +
            '<kbd data-keys="Shift">Shift</kbd>+click for a range, ' +
            '<kbd data-keys="Mod">Ctrl</kbd>+click to add or remove one, or drag a box. ' +
            'Glyphs that are not on screen when the block starts are drawn faint.',
          act: async (page, kit) => {
            // The x, then a range to the 6: the three glyphs of "x + 6". (The Indicate on the
            // first glyphs would hold the block back from them.)
            await kit.click(dialogGlyph(4));
            await kit.click(dialogGlyph(6), { hold: ['Shift'] });
          },
          focus: ['block-dialog-glyphs'],
        },
        {
          caption:
            '<span class="ui">Preview</span>, in the title bar, plays the block alone in a ' +
            'loop, with its easing curve and a point that follows it.',
          act: async (page, kit) => {
            await kit.click('block-preview-open');
            await kit.pause(1200);
            await kit.click('block-preview-play');
          },
          focus: ['block-preview-dialog'],
        },
      ],
    },
  ],
};
