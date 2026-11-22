/* Captures of basics/timeline, on the project of the page, docs/web/examples/timeline-basics:
 * three tracks (Title, Track 2, Track 1), four clips — title 0–10.5 s, step1 0–4.5 s and step3
 * 7–10.5 s on Track 2, step2 3.5–8 s on Track 1 —, a relation from each step to the next, an
 * Indicate block on step3, and a formula, `check`, that is on no clip yet (the first of the
 * Creator's list).
 *
 * The items use a window 1100 px wide, so that the whole toolbar and ten seconds of the ruler fit
 * in a panel the page shows at nearly its own size; the playhead, when an item needs it, is put
 * where the scene shows the step it talks about. */

const PROJECT = 'docs/web/examples/timeline-basics.mfe.json';
const WIDE = { width: 1100, height: 900 };

/** A part of the header of the track named `name` (`track-<part>-<id>`; no part: the header). */
const part = (name, what) => async (page, kit) =>
  `track-${what ?? 'header'}-${await kit.trackId(name)}`;

/** A point on the clip of `name`, where a press takes the clip itself: in its lower half, a
 * little way in from its left edge (its blocks are in the upper half, its edges at the ends). */
async function grab(kit, name, seconds = 0.4) {
  const clip = await kit.box({ clip: name });
  const px = await kit.pxPerSecond();
  return { x: clip.x + seconds * px, y: clip.y + clip.height - 9 };
}

/** The middle of the lane of the track named `trackName`, at `t` seconds. */
async function laneAt(kit, trackName, t) {
  const lane = await kit.box({ track: trackName });
  return { x: await kit.timeToX(t), y: lane.y + lane.height / 2 };
}

/** The ruler and the lanes from `from` to `to` seconds, not the toolbar: the clips of a page that
 * move along the tracks need no more than that, and a clip of a small area is a small file. */
const area = (from, to) => async (page, kit) => {
  const panel = await kit.box('panel-timeline');
  const ruler = await kit.box('timeline-ruler');
  const left = await kit.timeToX(from);
  const right = await kit.timeToX(to);
  return { x: left, y: ruler.y, width: right - left, height: panel.y + panel.height - ruler.y };
};

/** The Creator's list under its first card and the tracks, to the end of the ghost: where a card
 * is dragged from and to (the Preview between them is cropped on the right). */
async function dropArea(page, kit) {
  const card = await kit.box('formula-item');
  const creator = await kit.box('panel-creator');
  const timeline = await kit.box('panel-timeline');
  const top = card.y - 8;
  const right = (await kit.timeToX(4)) + 24;
  return {
    x: creator.x,
    y: top,
    width: right - creator.x,
    height: timeline.y + timeline.height - top,
  };
}

/** Where a press takes the first card of the Creator's list: its middle, a little under its top. */
async function cardPoint(page, kit) {
  const card = await kit.box('formula-item');
  return { x: card.x + card.width / 2, y: card.y + 24 };
}

/** The timeline from its ruler down and the room over it where the menu of a clip rises, to a
 * little after 10 s: what the tour of the region shows. */
async function regionArea(page, kit) {
  const panel = await kit.box('panel-timeline');
  const top = Math.max(0, panel.y - 270);
  const right = (await kit.timeToX(10.6)) + 8;
  return { x: panel.x, y: top, width: right - panel.x, height: panel.y + panel.height - top };
}

/** The zoom's part of the toolbar, from its − to the + of dt, and the ruler under it. */
async function zoomArea(page, kit) {
  const bar = await kit.box('.tl-toolbar');
  const ruler = await kit.box('timeline-ruler');
  const from = await kit.box('timeline-zoom-out');
  const to = await kit.box('timeline-dt-more');
  const left = from.x - 12;
  const top = bar.y - 12;
  return {
    x: left,
    y: top,
    width: to.x + to.width + 14 - left,
    height: ruler.y + ruler.height - top,
  };
}

/** On the end edge of step1, in its upper half: the window of the relation lies over the lower
 * half of the clip. */
async function trimEdge(page, kit) {
  const edge = await kit.box('clip-' + (await kit.clipId('step1')) + '-trim-end');
  return { x: edge.x + edge.width / 2, y: edge.y + 7 };
}

export default {
  page: 'basics/timeline',
  project: PROJECT,
  viewport: WIDE,
  items: [
    {
      // The whole timeline, step2 selected so that its two relations are drawn in full, and
      // the playhead at 5.5 s, taken part by part.
      kind: 'tour',
      name: 'parts',
      target: 'panel-timeline',
      setup: async (page, kit) => {
        await kit.seek(5.5);
        await kit.selectClip('step2');
      },
      steps: [
        {
          caption:
            'On the left of the toolbar, <span class="ui">+ Track</span> adds a track, ' +
            '<span class="ui">Audio</span> adds a track for recordings and ' +
            '<span class="ui">Snap</span> turns snapping on and off.',
          focus: ['.tl-tools'],
          focusPadding: 3,
        },
        {
          caption:
            'In the middle of the toolbar, the zoom: <b>−</b> and <b>+</b>, the <b>slider</b> that ' +
            "moves the view, the key that shows the <b>whole timeline</b>, the zoom's readout " +
            'and <b>dt</b>, between a <b>−</b> and a <b>+</b> of its own.',
          focus: ['.tl-slider-row'],
          focusPadding: 3,
        },
        {
          caption:
            'The <b>ruler</b> counts seconds. Press or drag on it to move the <b>playhead</b>, ' +
            'the yellow line: the Preview shows the scene at that time.',
          focus: ['timeline-ruler'],
          focusPadding: 2,
        },
        {
          caption:
            'A track has a <b>header</b> with its name, its height keys and its buttons. The ' +
            'track on top is drawn in front of the ones below.',
          focus: [part('Track 2')],
          focusPadding: 2,
        },
        {
          caption:
            'A <b>clip</b> is the time an object is on screen: its name, between its intro on ' +
            'the left and its outro on the right, both hatched and named.',
          focus: [{ clip: 'step1' }],
          focusPadding: 2,
        },
        {
          caption:
            'An <b>animation block</b> sits in the upper half of its clip, where the clip ' +
            'plays one more animation.',
          focus: ['.tl-block'],
          focusPadding: 3,
        },
        {
          caption:
            'An arrow joins two clips that <b>relate</b>. Its <b>window</b>, the band across the ' +
            'lower half of both clips, is when the first turns into the second.',
          focus: [
            {
              union: [
                '.tl-rel-window.is-source >> nth=0',
                '.tl-rel-window:not(.is-source) >> nth=0',
              ],
            },
          ],
          focusPadding: 3,
        },
      ],
    },
    {
      // A track's header, button by button.
      kind: 'tour',
      name: 'track-header',
      target: part('Track 2'),
      padding: 4,
      scale: 3,
      steps: [
        {
          caption:
            'The <b>name</b> of the track. Double-click it, or press <kbd>Enter</kbd> or ' +
            '<kbd>F2</kbd> on it, to rename the track.',
          focus: [part('Track 2', 'name')],
          focusPadding: 3,
        },
        {
          caption:
            'The <b>height keys</b> make this track lower or taller. Dragging the top or bottom ' +
            'edge of the header does the same.',
          focus: [{ union: [part('Track 2', 'lower'), part('Track 2', 'taller')] }],
          focusPadding: 3,
        },
        {
          caption: 'The <b>eye</b> hides the track in the Preview. Its clips are still exported.',
          focus: [part('Track 2', 'hide')],
          focusPadding: 3,
        },
        {
          caption: 'The <b>padlock</b> locks the track: its clips cannot be edited.',
          focus: [part('Track 2', 'lock')],
          focusPadding: 3,
        },
        {
          caption:
            'The <b>arrows</b> move the track up, towards the front, or down, towards the back.',
          focus: [{ union: [part('Track 2', 'up'), part('Track 2', 'down')] }],
          focusPadding: 3,
        },
        {
          caption: 'The <b>cross</b> deletes the track and its clips, after a confirmation.',
          focus: [part('Track 2', 'delete')],
          focusPadding: 3,
        },
      ],
    },
    {
      // + Track put a new track on top, and a double-click on its name renamed it: where it is.
      kind: 'shot',
      name: 'new-track',
      target: 'panel-timeline',
      steps: async (page, kit) => {
        await kit.click('timeline-add-track');
        const id = await kit.mfe((mfe) => mfe.useProjectStore.getState().project.tracks[0].id);
        await kit.doubleClick(`track-name-${id}`);
        await kit.press('ControlOrMeta+A');
        await kit.type('Notes');
        await kit.press('Enter');
        // A press on the empty lane of the new track takes the focus ring off its name.
        await kit.click({ track: 'Notes' });
        await kit.settle();
      },
    },
    {
      // A formula of the Creator dragged onto a lane: its ghost, 3 s long, shows where the clip
      // would go; dropped, it is a clip. Undone.
      kind: 'clip',
      name: 'drop-clip',
      target: dropArea,
      cursorStart: cardPoint,
      keysAt: 'top-right',
      holdStart: 200,
      holdEnd: 400,
      act: async (page, kit) => {
        const from = await cardPoint(page, kit);
        const to = await laneAt(kit, 'Track 1', 0.55);
        await kit.drag(from, to, {
          via: [{ x: from.x + 180, y: to.y - 90 }],
          duration: 900,
        });
        await kit.pause(600);
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
    {
      // step3 dragged left along its track, the playhead at 5.75 s: it moves in jumps of dt
      // (0.5 s) and its start sticks to the playhead; with Shift held it follows the pointer
      // freely. Undone.
      kind: 'clip',
      name: 'move-clip',
      target: area(3.3, 10.7),
      cursorStart: (page, kit) => grab(kit, 'step3', 2.0),
      keysAt: 'top-right',
      holdStart: 200,
      holdEnd: 400,
      setup: async (page, kit) => {
        await kit.seek(5.75);
      },
      act: async (page, kit) => {
        const from = await grab(kit, 'step3', 2.0);
        const px = await kit.pxPerSecond();
        const by = (seconds) => ({ x: from.x + seconds * px, y: from.y });
        await kit.mouseDown();
        await kit.move(by(-0.9), { duration: 800 });
        await kit.move(by(-1.25), { duration: 500 });
        await kit.pause(450);
        await kit.down('Shift');
        await kit.move(by(-1.45), { duration: 600 });
        await kit.pause(250);
        await kit.up('Shift');
        await kit.mouseUp();
        await kit.pause(250);
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
    {
      // The end edge of step1 dragged right: the clip grows until it meets the next clip of its
      // track, step3, and no further. Undone.
      kind: 'clip',
      name: 'trim-clip',
      target: area(2.6, 9.3),
      cursorStart: trimEdge,
      keysAt: 'top-right',
      holdStart: 300,
      holdEnd: 400,
      act: async (page, kit) => {
        const from = await trimEdge(page, kit);
        const px = await kit.pxPerSecond();
        await kit.mouseDown();
        await kit.move({ x: from.x + 3.4 * px, y: from.y }, { duration: 1500 });
        await kit.pause(500);
        await kit.mouseUp();
        await kit.pause(250);
        await kit.press('ControlOrMeta+Z', { after: 200 });
      },
    },
    {
      // step2 clicked with the playhead at 5.5 s, then S: the clip becomes two that touch at the
      // playhead, the first still of step2 with the intro, the second of a copy, step2_s, with
      // the outro and the relation to step3. Undone, in one step.
      kind: 'clip',
      name: 'split-clip',
      target: area(2.9, 10.7),
      cursorStart: (page, kit) => grab(kit, 'step2', 1.6),
      // Over the empty middle of the title's clip: top-right would cover its outro's name.
      keysAt: 'top-left',
      holdStart: 300,
      holdEnd: 500,
      setup: async (page, kit) => {
        await kit.seek(5.5);
      },
      act: async (page, kit) => {
        await kit.click(await grab(kit, 'step2', 1.6), { after: 500 });
        await kit.press('s', { after: 2200 });
        await kit.press('ControlOrMeta+Z', { after: 400 });
      },
    },
    {
      // Another project, intro-outro-wait: the clip of `waiting` (a + b = c, 0.4–6 s, a Write
      // intro to 1.4 s) has an Appear block on = c at 2–2.8 s. Split at 1.8 s, before the block:
      // the first half leaves those two glyphs out of its intro, and its Intro section says so
      // under Starts empty, with Bring them back (ringed).
      kind: 'shot',
      name: 'split-left-out',
      project: 'docs/web/examples/intro-outro-wait.mfe.json',
      viewport: { width: 1440, height: 900 },
      target: 'intro-section',
      padding: 6,
      steps: async (page, kit) => {
        await kit.seek(1.8);
        await kit.click({ clip: 'waiting' });
        await kit.press('s');
        await kit.until((mfe) => mfe.useProjectStore.getState().project.clips.length === 5);
        await kit.selectClip('waiting');
        await kit.click('animations-tab-timing');
        await kit.scrollTo('intro-section');
        await kit.waitFor('clip-start-hidden');
      },
      highlight: [{ target: 'clip-start-hidden', pad: 2 }],
    },
    {
      // The playhead at 5.5 s: its cap in the ruler and its line over the tracks (1), and the
      // scene the Preview shows at that instant (2).
      kind: 'shot',
      name: 'playhead',
      target: { union: ['panel-preview', 'panel-timeline'] },
      padding: 4,
      steps: async (page, kit) => {
        await kit.seek(5.5);
        await kit.highlight([
          { target: 'timeline-playhead', label: 1, markerAt: 'top-right' },
          { target: 'preview-canvas', label: 2, markerAt: 'top-left' },
        ]);
      },
    },
    {
      // The zoom's readout and dt at three zooms: dt is the time between two small ticks.
      kind: 'tour',
      name: 'zoom-dt',
      target: { union: ['.tl-toolbar', 'timeline-ruler'] },
      padding: 4,
      steps: [
        {
          caption:
            'At <b>80 px/s</b>, the zoom the timeline starts at, a small tick of the ruler is ' +
            '<b>dt 0.5 s</b> after the one before.',
          focus: [{ union: ['timeline-zoom', 'timeline-dt'] }],
          focusPadding: 4,
        },
        {
          caption:
            'Zoom in five times (<b>+</b> before the slider, or <kbd data-keys="Mod">Ctrl</kbd> ' +
            'and the wheel): ' +
            'the ticks are closer in time, <b>dt 0.1 s</b>.',
          act: async (page, kit) => {
            for (let i = 0; i < 5; i += 1) await kit.click('timeline-zoom-in');
          },
          focus: [{ union: ['timeline-zoom', 'timeline-dt'] }],
          focusPadding: 4,
        },
        {
          caption:
            'Closer still, there is room for a tick on every frame: <b>dt 1/60 s</b> in a ' +
            'project of 60 frames a second.',
          act: async (page, kit) => {
            for (let i = 0; i < 5; i += 1) await kit.click('timeline-zoom-in');
          },
          focus: [{ union: ['timeline-zoom', 'timeline-dt'] }],
          focusPadding: 4,
        },
      ],
    },
    {
      // Ctrl/⌘ and the wheel zoom about the pointer: the time under it stays where it is.
      // Zoomed back out at the end.
      kind: 'clip',
      name: 'zoom-wheel',
      target: 'panel-timeline',
      cursorStart: (page, kit) => grab(kit, 'step2', 1.2),
      holdStart: 200,
      holdEnd: 400,
      act: async (page, kit) => {
        const over = await grab(kit, 'step2', 1.2);
        await kit.pause(250);
        await kit.wheel(-240, { hold: ['ControlOrMeta'], times: 4, at: over });
        await kit.pause(700);
        await kit.wheel(240, { hold: ['ControlOrMeta'], times: 4, at: over });
        await kit.pause(250);
      },
    },
    {
      // The toolbar's zoom: the slider that moves the view (1), and dt between its − and + (2).
      kind: 'shot',
      name: 'toolbar-zoom',
      target: zoomArea,
      highlight: [
        { target: 'timeline-slider', label: 1, markerAt: 'top' },
        {
          target: { union: ['timeline-dt-less', 'timeline-dt-more'] },
          label: 2,
          markerAt: 'top-right',
          pad: { left: 2, right: 2, top: 1, bottom: 1 },
        },
      ],
    },
    {
      // − beside dt, twice: a dt of one's own, 0.4 s then 0.3 s, in the accent, and the ruler's
      // small ticks closer together at the same zoom. Ctrl/⌘ and the wheel over the ruler zoom
      // in, which puts the zoom's own back (0.2 s), and out again, to 80 px/s, where it began.
      kind: 'clip',
      name: 'dt-keys',
      target: zoomArea,
      cursorStart: 'timeline-dt-less',
      // Over the zoom's own keys, which the clip does not use: the ruler's ticks are its subject.
      keysAt: 'top-left',
      holdStart: 300,
      holdEnd: 400,
      act: async (page, kit) => {
        await kit.click('timeline-dt-less', { after: 600 });
        await kit.click('timeline-dt-less', { after: 1000 });
        const key = await kit.box('timeline-dt-less');
        const ruler = await kit.box('timeline-ruler');
        const at = { x: key.x + key.width / 2, y: ruler.y + ruler.height / 2 };
        await kit.wheel(-240, { hold: ['ControlOrMeta'], at });
        await kit.pause(1000);
        await kit.wheel(240, { hold: ['ControlOrMeta'], at });
        await kit.pause(250);
      },
    },
    {
      // The region (D180): Shift dragged on the ruler from 5 s to 6.5 s marks it; the menu of
      // step2 says the animation goes in it; the Indicate chosen there starts and ends with it.
      kind: 'tour',
      name: 'region',
      target: regionArea,
      steps: [
        {
          caption:
            'Hold <kbd data-keys="Shift">Shift</kbd> and drag on the ruler: that marks the ' +
            '<b>region</b>, from the green bracket to the red one. The playhead stays where it is.',
          act: async (page, kit) => {
            const ruler = await kit.box('timeline-ruler');
            const y = ruler.y + ruler.height / 2;
            await kit.drag(
              { x: await kit.timeToX(5), y },
              { x: await kit.timeToX(6.5), y },
              { hold: ['Shift'], duration: 700 },
            );
            await kit.settle();
          },
          focus: ['timeline-region'],
          focusPadding: 3,
        },
        {
          caption:
            'Right-click a clip: the header of its menu says that the animation goes in the ' +
            'region, not at the playhead.',
          act: async (page, kit) => {
            await kit.contextMenu(await grab(kit, 'step2', 2.1));
          },
          focus: ['add-animation-header'],
        },
        {
          caption:
            'Choose one, here <span class="ui">Emphasis ▸ Indicate</span>: the block starts where ' +
            'the region starts and ends where it ends. The region stays, for the next thing.',
          act: async (page, kit) => {
            await kit.openSubmenu('Emphasis');
            await kit.choose('Indicate');
            await kit.settle();
          },
          focus: [{ clip: 'step2' }],
        },
      ],
    },
    {
      // A rectangle dragged over empty space selects the clips it touches; a press on the
      // background lets them go.
      kind: 'clip',
      name: 'marquee',
      target: { union: [{ track: 'Track 2' }, { track: 'Track 1' }] },
      padding: 6,
      cursorStart: (page, kit) => laneAt(kit, 'Track 2', 5.7),
      holdStart: 200,
      holdEnd: 400,
      act: async (page, kit) => {
        const from = await laneAt(kit, 'Track 2', 5.7);
        const to = await laneAt(kit, 'Track 1', 2.9);
        await kit.drag(from, { x: to.x, y: to.y + 6 }, { duration: 1100 });
        await kit.pause(700);
        await kit.click(from, { after: 150 });
        await kit.pause(200);
      },
    },
    {
      // The menu of two selected clips.
      kind: 'shot',
      name: 'clips-menu',
      target: '.ctx-menu',
      padding: 6,
      steps: async (page, kit) => {
        await kit.seek(2);
        await kit.selectClip(['title', 'step1']);
        await kit.contextMenu({ clip: 'step1' }, { position: { x: 200, y: 30 } });
      },
    },
    {
      // The cross of a track's header: a dialog lists what goes with the track, and its red
      // button is held down to delete.
      kind: 'shot',
      name: 'track-delete',
      target: 'dialog',
      padding: 8,
      steps: async (page, kit) => {
        await kit.click(part('Track 2', 'delete'));
        await page.getByTestId('dialog').waitFor();
      },
    },
  ],
};
