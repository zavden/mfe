/* Captures of start/interface: a tour over the window's areas, closer looks at the toolbar of
 * each panel, resizing and folding panels, the keyboard on the menu bar, the narrow layout, the
 * theme menu and forced colours. Clips only where a movement teaches (a drag, a scroll, keys on
 * the menu bar); the rest are stills and the tour. */

/** 13.1 s into the example: the title, three lines of the derivation and the note (b/2a)² are
 * on screen, and no animation runs. */
const CALM = 13.1;

/** The project in the app is the one of a file of that name, saved: what File ▸ Open leaves. */
function savedAs(fileName) {
  return async (page, kit) => {
    await kit.mfe((mfe, name) => {
      const project = mfe.useProjectStore.getState().project;
      mfe.useDocumentStore.getState().beginDocument(project, { fileName: name, handle: null });
    }, fileName);
    await kit.settle({ renders: false });
  };
}

/** The state most items start from: calm, saved to a file, and the pointer at rest (in the
 * light pass the tool has just pressed the theme switch, which would show its hover). */
async function calm(page, kit) {
  await savedAs('completing-the-square.mfe.json')(page, kit);
  await kit.seek(CALM);
  await away(page, kit);
}

/** Rests the pointer where nothing answers it (no hover in the picture). */
const away = (page, kit) => kit.move({ x: 720, y: 884 }, { duration: 1 });

/** The same in a narrow window, where the Preview is what lies under the point: its hover
 * outlines nothing in the Timeline shots. */
const awayNarrow = (page, kit) => kit.move({ x: 460, y: 300 }, { duration: 1 });

/** The gap between the Creator and the Preview dragged 100 px to the right, as a reader would
 * widen the Creator: at its first width (20 % of the window) it cuts long names. */
async function widenCreator(page, kit) {
  const gap = await kit.point({ css: '.separator-vertical >> nth=0' });
  await kit.drag(gap, { x: gap.x + 100, y: gap.y }, { duration: 1 });
  await away(page, kit);
}

/** The Animations panel shows a clip. */
async function selectHalfB(page, kit) {
  await kit.selectClip('half_b_squared');
}

/** The window Zen mode was designed for. */
const SMALL = { width: 1366, height: 768 };

/** Zen mode on, with these halves of its drawer open over the Preview ('creator', 'animations')
 * and the other closed. The preference is set in the store alone, not kept in the browser, so
 * that the items after this one start in the usual layout. The pointer rests on the menu bar's
 * empty part. */
function zen(open) {
  return async (page, kit) => {
    await kit.mfe((mfe) => mfe.usePreferences.setState({ zenMode: true, zenStrip: 'top' }));
    await page.waitForSelector('[data-testid="zen-stage"]');
    for (const id of ['creator', 'animations']) {
      const shown =
        (await page.getByTestId(`zen-tab-${id}`).getAttribute('aria-expanded')) === 'true';
      if (shown !== open.includes(id)) await kit.click(`zen-tab-${id}`);
    }
    await kit.move({ x: 760, y: 22 }, { duration: 1 });
    await kit.settle({ renders: false });
  };
}

/** The part of the window a menu hangs from: from a little left of its menu-bar button, and from
 * the top of the bar, to the right and bottom edge of the open menus. */
function menuFrom(button) {
  return async (page, kit) => {
    const from = await kit.box(button);
    const popups = await page
      .locator('.menu-popup, [role="menu"], .ctx-menu')
      .evaluateAll((menus) =>
        menus.map((menu) => {
          const box = menu.getBoundingClientRect();
          return { right: box.right, bottom: box.bottom };
        }),
      );
    const left = Math.max(0, Math.floor(from.x - 14));
    const right = Math.max(...popups.map((popup) => popup.right));
    const bottom = Math.max(...popups.map((popup) => popup.bottom));
    return {
      x: left,
      y: 0,
      width: Math.ceil(right) + 14 - left,
      height: Math.ceil(bottom) + 12,
    };
  };
}

/** Where the gap between the Creator and the Preview is taken to be dragged: low on its height,
 * so that the pointer is in the picture of the clip. */
async function grabGap(page, kit) {
  const bar = await kit.box({ css: '.separator-vertical >> nth=0' });
  return { x: bar.x + bar.width / 2, y: 520 };
}

/** The edge of the Timeline, near the left of the window. */
async function grabEdge(page, kit) {
  const bar = await kit.box({ css: '.separator-horizontal' });
  return { x: bar.x + 300, y: bar.y + bar.height / 2 };
}

export default {
  page: 'start/interface',
  project: 'examples/completing-the-square.mfe.json',
  items: [
    {
      kind: 'tour',
      name: 'panels',
      setup: calm,
      steps: [
        {
          caption:
            'The <b>menu bar</b>: five menus, the <span class="ui">Export…</span> button, the ' +
            "project's name and where it is saved, the renderer in use, and the theme switch.",
          focus: ['menu-bar'],
        },
        {
          caption:
            'The <b>Creator</b> keeps what you can put in the scene: formulas and texts, the ' +
            'template library and your audio recordings. <span class="ui">+ New</span> writes a ' +
            'formula.',
          focus: ['panel-creator'],
        },
        {
          caption:
            'The <b>Preview</b> draws the scene at the playhead, as the video will show it. ' +
            'Click a formula to select its clip and drag it to move it; the bar under the scene ' +
            'plays it.',
          focus: ['panel-preview'],
        },
        {
          caption:
            'The <b>Animations</b> panel edits the selected clip: its relations to other ' +
            'formulas, its timing, its intro and outro, and its animation blocks.',
          act: selectHalfB,
          focus: ['panel-animations'],
        },
        {
          caption:
            'The <b>Timeline</b> lays the scene out in time: a ruler, tracks of clips, the ' +
            "playhead, and the blocks of each clip's animations.",
          focus: ['panel-timeline'],
        },
        {
          caption:
            'The gaps between the panels are <b>handles</b>: drag one to resize the panels ' +
            'beside it. A panel folds to its title bar with the arrow in its header.',
          focus: [
            { css: '.separator-vertical >> nth=0' },
            { css: '.separator-vertical >> nth=1' },
            { css: '.separator-horizontal' },
          ],
          focusPadding: 3,
        },
      ],
    },
    {
      // The left half of the bar: the five menus (1) and the Export… button (2).
      kind: 'shot',
      name: 'menu-bar-left',
      setup: calm,
      target: { x: 0, y: 0, width: 720, height: 68 },
      highlight: [
        {
          target: { union: ['menu-file', 'menu-help'] },
          label: 1,
          markerAt: 'bottom',
        },
        { target: { css: '.export-split' }, label: 2, markerAt: 'bottom' },
      ],
    },
    {
      // The right half: the project's name (1), the file (2) and its mark (3), the renderer (4)
      // and the theme switch (5).
      kind: 'shot',
      name: 'menu-bar-right',
      setup: calm,
      target: { x: 700, y: 0, width: 740, height: 68 },
      highlight: [
        { target: 'project-rename', label: 1, markerAt: 'bottom' },
        { target: 'doc-file', label: 2, markerAt: 'bottom' },
        { target: 'doc-status', label: 3, markerAt: 'bottom' },
        { target: 'engine-status', label: 4, markerAt: 'bottom' },
        { target: 'theme-toggle', label: 5, markerAt: 'bottom' },
      ],
    },
    {
      // The Creator: its tabs (1), the search and the key of the view (2), the key whose menu
      // selects every object of a kind (3), the key of the size of the previews (4), + New with its
      // arrow (5), and a formula's row (6). The toolbar is one line: the markers of its rings go
      // along its lower edge.
      kind: 'shot',
      name: 'creator',
      setup: [calm, widenCreator],
      target: 'panel-creator',
      highlight: [
        {
          target: { css: '[data-testid="panel-creator"] .tabs-list' },
          label: 1,
          markerAt: 'right',
        },
        {
          target: { union: ['creator-search-open', 'creator-view-toggle'] },
          label: 2,
          markerAt: 'bottom-left',
        },
        {
          target: 'creator-kinds',
          label: 3,
          markerAt: 'bottom',
        },
        {
          target: 'creator-preview-size',
          label: 4,
          markerAt: 'bottom',
        },
        {
          target: { css: '.creator-toolbar .split-button' },
          label: 5,
          markerAt: 'bottom-right',
        },
        {
          target: { css: '[data-testid="formula-list"] > li >> nth=1' },
          label: 6,
          markerAt: 'bottom-right',
        },
      ],
    },
    {
      // The arrow of + New: every kind of object the Creator makes. (The Creator a little wider,
      // its toolbar on one line: the keys left of + New stay out of the picture.)
      kind: 'shot',
      name: 'creator-new-menu',
      setup: [
        calm,
        widenCreator,
        async (page, kit) => {
          await kit.click('creator-new-menu');
          await page.getByTestId('creator-new-kinds').waitFor();
        },
      ],
      target: { union: ['creator-new', 'creator-new-kinds'] },
      padding: 12,
    },
    {
      // The Preview's own tools, on its title bar: align by symbol (1), the circle selector (2),
      // the transform handles (3), snapping (4), the multicamera (5), and the zoom (6).
      kind: 'shot',
      name: 'preview-tools',
      setup: [calm, selectHalfB],
      target: { x: 560, y: 52, width: 556, height: 66 },
      highlight: [
        { target: 'preview-align-symbol', label: 1, markerAt: 'bottom' },
        { target: 'preview-circle-select', label: 2, markerAt: 'bottom' },
        { target: 'preview-handles', label: 3, markerAt: 'bottom' },
        { target: 'preview-snap', label: 4, markerAt: 'bottom' },
        { target: 'preview-multicamera', label: 5, markerAt: 'bottom' },
        {
          target: { union: ['preview-zoom-out', 'preview-fit'] },
          label: 6,
          markerAt: 'bottom',
        },
      ],
    },
    {
      // The playback bar: the keys (1), stop and loop (2), the grid (3) and the readouts (4).
      kind: 'shot',
      name: 'transport',
      setup: calm,
      target: { x: 303, y: 560, width: 808, height: 74 },
      highlight: [
        {
          target: { union: ['transport-start', 'transport-end'] },
          label: 1,
          markerAt: 'top',
          pad: 6,
        },
        {
          target: { union: ['transport-stop', 'transport-loop'] },
          label: 2,
          markerAt: 'top',
          pad: 6,
        },
        {
          target: { css: '.transport-grid' },
          label: 3,
          markerAt: 'top',
          pad: 6,
        },
        {
          target: { union: ['transport-seconds', 'transport-frame'] },
          label: 4,
          markerAt: 'top',
          pad: 6,
        },
      ],
    },
    {
      // The Animations panel with a clip selected: the Relations tab.
      kind: 'shot',
      name: 'animations-relations',
      setup: [calm, selectHalfB],
      target: 'panel-animations',
      highlight: [
        {
          target: { css: '.an-props-header' },
          label: 1,
          markerAt: 'top-right',
        },
        {
          target: { css: '[data-testid="panel-animations"] .tabs-list' },
          label: 2,
          markerAt: 'right',
        },
      ],
    },
    {
      // The same panel on its Timing tab: where the clip is, its intro, its animations, its
      // outro.
      kind: 'shot',
      name: 'animations-timing',
      setup: [
        calm,
        selectHalfB,
        async (page, kit) => {
          await kit.click('animations-tab-timing');
          await away(page, kit);
        },
      ],
      target: 'panel-animations',
    },
    {
      // The Timeline's toolbar, in a window of 920 px so that it shows at nearly its own size:
      // + Track (1), Audio (2), Snap (3), zoom out and in (4), the slider that moves the view (5),
      // and the key that shows the whole timeline with the readouts of the zoom and the − and + of
      // dt (6).
      kind: 'shot',
      name: 'timeline-toolbar',
      viewport: { width: 920, height: 900 },
      setup: [calm, (page, kit) => kit.click('timeline-fit'), awayNarrow],
      target: { css: '.tl-toolbar' },
      padding: { top: 6, bottom: 22, left: 4, right: 4 },
      highlight: [
        { target: 'timeline-add-track', label: 1, markerAt: 'bottom' },
        { target: 'timeline-add-audio-track', label: 2, markerAt: 'bottom' },
        { target: 'timeline-snap', label: 3, markerAt: 'bottom' },
        {
          target: { union: ['timeline-zoom-out', 'timeline-zoom-in'] },
          label: 4,
          markerAt: 'bottom',
        },
        { target: 'timeline-slider', label: 5, markerAt: 'bottom' },
        {
          target: { union: ['timeline-fit', 'timeline-dt-more'] },
          label: 6,
          markerAt: 'bottom-right',
        },
      ],
    },
    {
      // The header of the first track, made taller with its own key (3) so that the numbers fit
      // beside the small keys: the keys of the corner that set the height of every track (1), the
      // track's name (2), the keys of its own height (3), the eye (4), the padlock (5), the arrows
      // that move it (6) and the cross that deletes it (7).
      kind: 'shot',
      name: 'timeline-tracks',
      viewport: { width: 920, height: 900 },
      setup: [
        calm,
        (page, kit) => kit.click('timeline-fit'),
        async (page, kit) => {
          for (let i = 0; i < 6; i += 1)
            await kit.click({ css: '[data-testid^="track-taller-"] >> nth=0' });
        },
        awayNarrow,
      ],
      target: async (page, kit) => {
        const corner = await kit.box({ css: '.tl-corner' });
        const first = await kit.box({ css: '.tl-header >> nth=0' });
        return {
          x: corner.x - 4,
          y: corner.y - 4,
          width: 470,
          height: first.y + first.height - corner.y + 8,
        };
      },
      highlight: [
        { target: { css: '.tl-corner .tl-row-zoom' }, label: 1, markerAt: 'right' },
        { target: { css: '.tl-header >> nth=0 >> .tl-name' }, label: 2, markerAt: 'top-right' },
        { target: { css: '.tl-header >> nth=0 >> .tl-header-keys' }, label: 3, markerAt: 'right' },
        { target: { css: '[data-testid^="track-hide-"] >> nth=0' }, label: 4, markerAt: 'bottom' },
        { target: { css: '[data-testid^="track-lock-"] >> nth=0' }, label: 5, markerAt: 'bottom' },
        {
          target: {
            union: [
              { css: '[data-testid^="track-up-"] >> nth=0' },
              { css: '[data-testid^="track-down-"] >> nth=0' },
            ],
          },
          label: 6,
          markerAt: 'bottom',
        },
        {
          target: { css: '[data-testid^="track-delete-"] >> nth=0' },
          label: 7,
          markerAt: 'bottom',
        },
      ],
    },
    {
      // View ▸ Theme: the system's, dark or light; the choice is ticked.
      kind: 'shot',
      name: 'theme-menu',
      setup: [calm, (page, kit) => kit.openMenu('View ▸ Theme')],
      target: menuFrom('menu-view'),
    },
    {
      // The Creator and the Timeline folded to their title bars, which gives the Preview their
      // room: the arrows left in the two bars (1, 2) bring them back.
      kind: 'shot',
      name: 'folded',
      setup: [
        calm,
        selectHalfB,
        async (page, kit) => {
          await kit.click('panel-fold-creator');
          await kit.click('panel-fold-timeline');
          await away(page, kit);
        },
      ],
      highlight: [
        { target: 'panel-fold-creator', label: 1, markerAt: 'bottom' },
        { target: 'panel-fold-timeline', label: 2, markerAt: 'top-left' },
      ],
    },
    {
      // Zen mode (Preferences ▸ Zen mode) in the small window it was designed for: the timeline
      // a column on the left, drawn vertical (1), the strip with the two panels' buttons and
      // the tools (2), and the Preview with all the rest (3).
      kind: 'shot',
      name: 'zen',
      viewport: SMALL,
      setup: [calm, selectHalfB, zen([])],
      highlight: [
        { target: 'timeline-view', label: 1, markerAt: 'bottom' },
        { target: 'zen-strip', label: 2, markerAt: 'bottom' },
        { target: 'preview-frame', label: 3, markerAt: 'top-left' },
      ],
    },
    {
      // Both buttons pressed (1): the Creator on the left and the Animations panel on the right,
      // the two halves of a drawer over the Preview. The tools of the strip (2), the grip that
      // makes the drawer taller or shorter (3) and the arrow that moves the strip (4).
      kind: 'shot',
      name: 'zen-drawer',
      viewport: SMALL,
      setup: [calm, selectHalfB, zen(['creator', 'animations'])],
      highlight: [
        { target: 'zen-tab-creator', label: 1, markerAt: 'bottom' },
        { target: 'zen-new', label: 2, markerAt: 'bottom' },
        { target: 'zen-drawer-edge-animations', label: 3, markerAt: 'top', pad: 4 },
        { target: 'zen-strip-move', label: 4, markerAt: 'left' },
      ],
    },
    {
      // Dragging the gap between the Creator and the Preview out and back, then the edge of the
      // Timeline up and back, on the part of the window they move. Both are grabbed inside the
      // picture: the gap low on its height, the edge near the left.
      kind: 'clip',
      name: 'resize-panels',
      setup: [calm, selectHalfB],
      target: { x: 0, y: 380, width: 640, height: 340 },
      cursorStart: grabGap,
      loop: false,
      holdEnd: 600,
      act: async (page, kit) => {
        const gap = await grabGap(page, kit);
        await kit.drag(gap, gap, { via: [{ x: gap.x + 150, y: gap.y }], duration: 600 });
        const edge = await grabEdge(page, kit);
        await kit.drag(edge, edge, { via: [{ x: edge.x, y: edge.y - 120 }], duration: 600 });
      },
    },
    {
      // The menu bar from the keyboard: Tab reaches File, ↓ opens it, → moves along the bar,
      // Esc closes the menu. The pointer waits outside the picture, and the key caps beside the
      // menus.
      kind: 'clip',
      name: 'menu-keys',
      setup: calm,
      target: { x: 0, y: 0, width: 760, height: 330 },
      cursorStart: { x: 1000, y: 600 },
      keysAt: { x: 540, y: 200 },
      loop: false,
      act: async (page, kit) => {
        await kit.press('Tab', { after: 600 });
        await kit.press('ArrowDown', { after: 700 });
        await kit.press('ArrowRight', { after: 700 });
        await kit.press('ArrowRight', { after: 700 });
        await kit.press('Escape', { after: 500 });
      },
    },
    {
      // Under about 760 px wide the four panels stack, each as tall as most of the window, and
      // the menu bar wraps. The stack scrolls under the bar: Creator, Preview, Animations and
      // Timeline, one under the other. The poster is the top of the window. The pointer rests on
      // the empty part of the menu bar, which the scroll goes under.
      kind: 'clip',
      name: 'narrow-scroll',
      viewport: { width: 420, height: 720 },
      setup: [calm, selectHalfB],
      cursorStart: { x: 340, y: 50 },
      loop: false,
      holdEnd: 500,
      act: async (page, kit) => {
        for (let i = 0; i < 3; i += 1) {
          await kit.evaluate(() => {
            const main = document.querySelector('.app-main');
            main.scrollTo({ top: main.scrollTop + main.clientHeight * 0.7, behavior: 'smooth' });
          });
          await kit.pause(700);
        }
        await kit.evaluate(() => {
          document.querySelector('.app-main').scrollTo({ top: 0, behavior: 'smooth' });
        });
        await kit.pause(900);
      },
    },
    {
      // Windows' high contrast (forced colours): every state keeps a border, a ring or an
      // underline, and the formulas keep their colours. The top-left of the window, at the
      // density that keeps its lines sharp.
      kind: 'shot',
      name: 'forced-colours',
      setup: [
        calm,
        selectHalfB,
        async (page, kit) => {
          await page.emulateMedia({ forcedColors: 'active' });
          await kit.settle({ renders: false });
        },
      ],
      target: { x: 0, y: 0, width: 880, height: 360 },
      scale: 1.5,
    },
  ],
};
