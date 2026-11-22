/* Captures of basics/intro-outro, on docs/web/examples/timeline-basics (see captures/basics/
 * timeline.mjs for its clips): step1 0–4.5 s on Track 2 has a Write intro and a FadeOut outro,
 * and the window of the relation to step2 lies over its outro; title 0–10.5 s on Title has a
 * Write intro and a FadeOut outro with nothing over them; step3 has a FadeIn intro and no outro.
 *
 * The timeline items use a window 1100 px wide (the panel then shows the whole toolbar), and a
 * zoom of 150 px/s where an intro or an outro is the thing looked at. */

const PROJECT = 'docs/web/examples/timeline-basics.mfe.json';
const WIDE = { width: 1100, height: 900 };

/** Zoom the timeline to `pxPerSecond` (what + does, in one step), the view at its start. */
const zoomTo = (pxPerSecond) => (page, kit) =>
  kit.app('/src/ui/timeline/timelineStore.ts', (m, z) => m.useTimelineStore.getState().setZoom(z), pxPerSecond);

/** A part of the clip of formula `name`: `intro`, `outro`, `intro-handle`, `outro-handle`. */
const part = (name, what) => async (page, kit) => `clip-${await kit.clipId(name)}-${what}`;

/** The centre of a box. */
const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** The name drawn on the clip of formula `name`. */
const name = (formulaName) => async (page, kit) =>
  `[data-testid="clip-${await kit.clipId(formulaName)}"] .tl-clip-name`;

/** The grab zone on the inner edge of the intro or the outro of the clip of formula `name`. */
const handle = (name, phase) => part(name, `${phase}-handle`);

/** The middle of that grab zone: where the pointer rests before a drag of the edge. */
const handlePoint = (name, phase) => async (page, kit) =>
  centre(await kit.box(await handle(name, phase)(page, kit)));

/** The ruler and the lanes from `from` to `to` seconds, not the toolbar: the clips of a page that
 * drag an edge along a track need no more than that, and a clip of a small area is a small file. */
const area = (from, to) => async (page, kit) => {
  const panel = await kit.box('panel-timeline');
  const ruler = await kit.box('timeline-ruler');
  const left = await kit.timeToX(from);
  const right = await kit.timeToX(to);
  return { x: left, y: ruler.y, width: right - left, height: panel.y + panel.height - ruler.y };
};

/** The area of a context menu and of its submenu `submenu`, one box (both are open). */
const menus = (submenu) => async (page, kit) => {
  const menu = await kit.box('.ctx-menu >> nth=0');
  const sub = await kit.box(`[role="menu"][aria-label="${submenu}"]`);
  const left = Math.min(menu.x, sub.x);
  const top = Math.min(menu.y, sub.y);
  return {
    x: left,
    y: top,
    width: Math.max(menu.x + menu.width, sub.x + sub.width) - left,
    height: Math.max(menu.y + menu.height, sub.y + sub.height) - top,
  };
};

export default {
  page: 'basics/intro-outro',
  project: PROJECT,
  viewport: WIDE,
  items: [
    {
      // One clip, closely: its intro and its outro are the hatched ends, each with its name; the
      // inner edge of the intro (4) is what a drag lengthens or shortens.
      kind: 'shot',
      name: 'clip-ends',
      setup: zoomTo(150),
      target: { clip: 'step1' },
      padding: { left: 10, right: 10, top: 24, bottom: 26 },
      highlight: [
        { target: part('step1', 'intro'), label: 1, markerAt: 'top-left' },
        { target: name('step1'), label: 2, markerAt: 'top' },
        { target: part('step1', 'outro'), label: 3, markerAt: 'top-right' },
        { target: part('step1', 'intro-handle'), label: 4, markerAt: 'bottom', pad: 2 },
      ],
    },
    {
      // Right-click a clip: Intro › lists what its kind takes, the current one ticked.
      kind: 'shot',
      name: 'intro-menu',
      target: menus('Intro'),
      padding: 6,
      steps: async (page, kit) => {
        await kit.contextMenu({ clip: 'step1' }, { position: { x: 160, y: 30 } });
        await kit.openSubmenu('Intro');
      },
    },
    {
      // Add animation ▸ Appear: the animations a block can bring glyphs in with.
      kind: 'shot',
      name: 'appear-menu',
      target: menus('Appear'),
      padding: 6,
      steps: async (page, kit) => {
        await kit.contextMenu({ clip: 'step1' }, { position: { x: 160, y: 30 } });
        await kit.openSubmenu('Appear');
      },
    },
    {
      // The inner edge of the intro of step1 dragged right, then left: a readout says how long
      // the intro lasts; a drag is one undo step, undone.
      kind: 'clip',
      name: 'drag-intro',
      setup: zoomTo(150),
      target: area(0, 4.2),
      cursorStart: handlePoint('step1', 'intro'),
      keysAt: 'top-right',
      holdStart: 200,
      holdEnd: 400,
      act: async (page, kit) => {
        const from = await handlePoint('step1', 'intro')(page, kit);
        const px = await kit.pxPerSecond();
        await kit.mouseDown();
        await kit.move({ x: from.x + 1.0 * px, y: from.y }, { duration: 800 });
        await kit.pause(300);
        await kit.move({ x: from.x - 0.5 * px, y: from.y }, { duration: 900 });
        await kit.pause(300);
        await kit.mouseUp();
        await kit.pause(250);
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
    {
      // The outro of the title: its edge dragged left, and Shift held while the edge goes right,
      // so that it follows the pointer between the snap points. Undone.
      kind: 'clip',
      name: 'drag-outro',
      target: area(5.9, 10.7),
      cursorStart: handlePoint('title', 'outro'),
      keysAt: 'top-right',
      holdStart: 200,
      holdEnd: 400,
      act: async (page, kit) => {
        const from = await handlePoint('title', 'outro')(page, kit);
        const px = await kit.pxPerSecond();
        await kit.mouseDown();
        await kit.move({ x: from.x - 1.5 * px, y: from.y }, { duration: 900 });
        await kit.pause(300);
        await kit.down('Shift');
        await kit.move({ x: from.x - 0.35 * px, y: from.y }, { duration: 700 });
        await kit.pause(300);
        await kit.up('Shift');
        await kit.mouseUp();
        await kit.pause(250);
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
    {
      // The outro of step1 has the window of its relation over its edge: pressed there, the
      // window answers; with Alt held only the edges do, and the outro is longer.
      kind: 'clip',
      name: 'alt-edge',
      setup: zoomTo(150),
      target: area(2.0, 5.6),
      cursorStart: handlePoint('step1', 'outro'),
      keysAt: 'top-right',
      holdStart: 200,
      holdEnd: 400,
      act: async (page, kit) => {
        const from = await handlePoint('step1', 'outro')(page, kit);
        const px = await kit.pxPerSecond();
        await kit.mouseDown();
        await kit.move({ x: from.x + 0.25 * px, y: from.y }, { duration: 500 });
        await kit.pause(250);
        await kit.press('Escape', { after: 100 });
        await kit.mouseUp();
        await kit.move({ x: from.x, y: from.y - 4 }, { duration: 300 });
        await kit.down('Alt');
        await kit.pause(350);
        await kit.mouseDown();
        await kit.move({ x: from.x - 1.0 * px, y: from.y }, { duration: 700 });
        await kit.pause(300);
        await kit.mouseUp();
        await kit.up('Alt');
        await kit.pause(250);
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
    {
      // The Timing tab of the Animations panel: the intro of step2, in numbers.
      kind: 'shot',
      name: 'intro-panel',
      viewport: { width: 1440, height: 900 },
      target: 'intro-section',
      padding: 6,
      steps: async (page, kit) => {
        await kit.selectClip('step2');
        await kit.click('animations-tab-timing');
        await kit.scrollTo('intro-section');
      },
    },
    {
      // An intro that runs into what the clip has: a keyframe at 1.2 s, then DrawBorderThenFill
      // (2 s) as the intro, which would cut it.
      kind: 'shot',
      name: 'conflict',
      target: 'dialog',
      padding: 8,
      steps: async (page, kit) => {
        const px = await kit.pxPerSecond();
        await kit.contextMenu({ clip: 'step1' }, { position: { x: 1.2 * px, y: 30 } });
        await kit.openSubmenu('Transform');
        await kit.choose('Whole formula');
        await kit.contextMenu({ clip: 'step1' }, { position: { x: 2.9 * px, y: 30 } });
        await kit.openSubmenu('Intro');
        await kit.choose('DrawBorderThenFill');
        await page.getByTestId('dialog').waitFor();
      },
    },
    {
      // Edit ▸ Always add intro, Always add outro and Default intro & outro….
      kind: 'shot',
      name: 'edit-menu',
      target: async (page, kit) => {
        const menu = await kit.box('.menu-popup');
        return menu;
      },
      padding: 6,
      steps: async (page, kit) => {
        await kit.openMenu('Edit');
        const first = await kit.menuEntry('Always add intro');
        const last = await kit.menuEntry('Default intro & outro');
        const left = Math.min(first.box.x, last.box.x);
        await kit.highlight([
          {
            target: {
              x: left - 4,
              y: first.box.y - 2,
              width: Math.max(first.box.width, last.box.width) + 8,
              height: last.box.y + last.box.height - first.box.y + 4,
            },
            radius: 8,
          },
        ]);
      },
    },
    {
      // Edit ▸ Default intro & outro…
      kind: 'shot',
      name: 'default-dialog',
      target: 'default-animations-dialog',
      padding: 8,
      steps: async (page, kit) => {
        await kit.choose('Edit ▸ Default intro & outro…');
        await page.getByTestId('default-animations-dialog').waitFor();
      },
    },
    {
      // A box put on step3 comes with no animation; the menu of its clip gives it one: the
      // Intro submenu, with what a box takes.
      kind: 'shot',
      name: 'shape-intro',
      target: menus('Intro'),
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(8.3);
      },
      steps: async (page, kit) => {
        await kit.contextMenu({ clip: 'step3' }, { position: { x: 180, y: 30 } });
        await kit.openSubmenu('Add shape');
        await kit.choose('Box');
        await kit.settle();
        const shape = await kit.mfe((mfe) => {
          const { clips, formulas } = mfe.useProjectStore.getState().project;
          return clips.find((c) => formulas.find((f) => f.id === c.formulaId)?.kind === 'shape')?.id;
        });
        await kit.contextMenu(`clip-${shape}`, { position: { x: 40, y: 30 } });
        await kit.openSubmenu('Intro');
      },
    },
  ],
};
