/* Captures of basics/preview: the parts of the Preview (a tour), its toolbar and grid controls, and
 * the gestures of placing things — selecting, dragging with the snapping guides, holding a drag to
 * one axis, nudging with the arrow keys, the grid, the transform handles of one clip and of a
 * group, zooming and panning, and locking a formula in the preview.
 *
 * Scenes: `preview-placing` (four formulas: pythagoras top left, euler top right, circle bottom
 * left, quadratic bottom right) and `preview-guides` (x + 1 and y + 2 in a row, z + 3 below).
 * Scene points are written in scene units (x right, y up, the frame 14.22 × 8) and turned into
 * page points by `kit.scenePoint`; glyph points come from the app's own geometry of the clips at
 * the playhead (`kit.glyphPoint`), so a press always lands on the glyph it names.
 *
 * A clip is one gesture, in about 5 s: it does not loop back (`loop: false`) and rests a little. */

const QUICK = { loop: false, holdStart: 300, holdEnd: 500 };

/** The frame of the Preview, a few pixels around, or a part of it: `x`, `y`, `w`, `h` are
 * fractions of its width and height. */
function frameArea({ x = 0, y = 0, w = 1, h = 1 } = {}) {
  return async (page, kit) => {
    const frame = await kit.box('preview-frame');
    return {
      x: frame.x - 3 + frame.width * x,
      y: frame.y - 3 + frame.height * y,
      width: (frame.width + 6) * w,
      height: (frame.height + 6) * h,
    };
  };
}

/** The top of the Preview's right half and of the Animations panel: a clip selected on the right
 * of the scene, and the fields that say where it is, how large and how turned. */
function previewRightAndAnimations(height) {
  return async (page, kit) => {
    const preview = await kit.box('panel-preview');
    const animations = await kit.box('panel-animations');
    const left = preview.x + 440;
    return { x: left, y: preview.y, width: animations.x + animations.width - left, height };
  };
}

/** The point `dx`, `dy` scene units from a page point (y up). */
async function shifted(kit, point, dx, dy) {
  const origin = await kit.scenePoint([0, 0]);
  const unit = await kit.scenePoint([1, 1]);
  return { x: point.x + dx * (unit.x - origin.x), y: point.y - dy * (origin.y - unit.y) };
}

/** The box of the whole formula `name` at the playhead, in scene units. */
async function sceneBox(kit, name) {
  const id = await kit.clipId(name);
  return kit.app('/src/ui/preview/geometry.ts', (m, clip) => m.geometryNow().get(clip).box, id);
}

/** Where the third formula of `preview-guides` goes to meet the other two: its centre on their
 * row, midway between them (the offsets from where it is now, scene units). */
async function rowTarget(kit) {
  const [one, two, three] = await Promise.all(['one', 'two', 'three'].map((name) => sceneBox(kit, name)));
  const middle = (box) => [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
  return {
    dx: (one.maxX + two.minX) / 2 - middle(three)[0],
    dy: middle(one)[1] - middle(three)[1],
  };
}

/** The clip of `name` selected, and the Animations panel on its Timing tab scrolled to the Initial
 * state — X, Y, Scale, Rotation — where a clip's place is written. */
async function showInitialState(page, kit, name = 'euler') {
  await kit.selectClip(name);
  await kit.click('animations-tab-timing');
  await kit.scrollTo('initial-section');
}

export default {
  page: 'basics/preview',
  project: 'docs/web/examples/preview-placing.mfe.json',
  items: [
    {
      // The parts of the Preview panel, one step each.
      kind: 'tour',
      name: 'parts',
      target: 'panel-preview',
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      steps: [
        {
          caption:
            'The <b>frame</b> is the scene at the playhead, as Manim will draw it. Click a ' +
            'formula to select it, drag it to move it.',
          focus: ['preview-frame'],
        },
        {
          caption:
            'The <b>view toolbar</b>, in the title bar: align by symbol, the circle selector, the ' +
            'transform handles, snapping, the multicamera, the zoom and ' +
            '<span class="ui">Fit</span>.',
          focus: ['preview-tools'],
        },
        {
          caption:
            'The <b>transport bar</b> plays the scene and shows the time of the playhead: the ' +
            'scene is drawn at that time, and what you edit here is the clip as it is then.',
          focus: ['transport'],
        },
        {
          caption:
            'In the middle of the transport bar, the <b>grid</b>: show it, make it sparser or ' +
            'denser, and choose what lands on it.',
          focus: [{ union: ['transport-grid', 'transport-grid-anchor'] }],
          focusPadding: 4,
        },
      ],
    },
    {
      // The view toolbar of the Preview's title bar, button by button.
      kind: 'shot',
      name: 'toolbar',
      target: 'preview-tools',
      padding: { top: 24, right: 10, bottom: 10, left: 10 },
      highlight: [
        { target: 'preview-align-symbol', label: 1, markerAt: 'top' },
        { target: 'preview-circle-select', label: 2, markerAt: 'top' },
        { target: 'preview-handles', label: 3, markerAt: 'top' },
        { target: 'preview-snap', label: 4, markerAt: 'top' },
        { target: 'preview-multicamera', label: 5, markerAt: 'top' },
        {
          target: { union: ['preview-zoom-out', 'preview-zoom-label', 'preview-zoom-in'] },
          label: 6,
          markerAt: 'top',
        },
        { target: 'preview-fit', label: 7, markerAt: 'top' },
      ],
    },
    {
      // The grid group of the transport bar, with the grid shown.
      kind: 'shot',
      name: 'grid-controls',
      target: { union: ['transport-grid', 'transport-grid-anchor'] },
      padding: { top: 24, right: 12, bottom: 10, left: 12 },
      setup: async (page, kit) => {
        await kit.setPreference({ grid: true });
        await kit.settle();
      },
      highlight: [
        { target: 'transport-grid', label: 1, markerAt: 'top' },
        {
          target: { union: ['transport-grid-sparser', 'transport-grid-step', 'transport-grid-denser'] },
          label: 2,
          markerAt: 'top',
        },
        { target: 'transport-grid-anchor', label: 3, markerAt: 'top' },
      ],
    },
    {
      // Selecting: a click selects a clip; Ctrl/⌘ + click adds one; a rectangle drawn from empty
      // space selects the clips it touches (and replaces the selection).
      kind: 'clip',
      name: 'select',
      ...QUICK,
      target: frameArea(),
      keysAt: 'top-right',
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      act: async (page, kit) => {
        const pythagoras = await kit.glyphPoint('pythagoras', 5);
        const euler = await kit.glyphPoint('euler', 5);
        await kit.click(pythagoras, { after: 400 });
        await kit.click(euler, { hold: ['ControlOrMeta'], after: 500 });
        await kit.drag(await kit.scenePoint([-6.8, -0.3]), await kit.scenePoint([6.4, -3.5]), {
          duration: 1000,
        });
        await kit.pause(150);
      },
    },
    {
      // Dragging with snapping: the third formula goes up to the row of the other two (yellow
      // guides: its box lined up with theirs), and between the two it stops where the gaps are
      // equal (the bars with a tick at each end). Ctrl/⌘+Z undoes the drag.
      kind: 'clip',
      name: 'drag-snap',
      ...QUICK,
      project: 'docs/web/examples/preview-guides.mfe.json',
      target: frameArea({ y: 0.18, h: 0.65 }),
      setup: async (page, kit) => {
        await kit.seek(3);
      },
      act: async (page, kit) => {
        const { dx, dy } = await rowTarget(kit);
        const grab = await kit.glyphPoint('three', 2);
        await kit.move(grab, { duration: 500 });
        await kit.mouseDown();
        await kit.move(await shifted(kit, grab, 0, dy), { duration: 800 });
        await kit.pause(500);
        await kit.move(await shifted(kit, grab, dx, dy), { duration: 900 });
        await kit.pause(900);
        await kit.mouseUp();
        await kit.pause(300);
        await kit.press('ControlOrMeta+Z', { after: 300 });
      },
    },
    {
      // Alt pressed during a drag holds it to one axis, still snapping along it; let go of Alt
      // and the drag is free again.
      kind: 'clip',
      name: 'axis-lock',
      ...QUICK,
      target: frameArea({ y: 0.08, w: 0.56, h: 0.8 }),
      keysAt: 'top-right',
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      act: async (page, kit) => {
        const grab = await kit.glyphPoint('circle', 1);
        await kit.move(grab, { duration: 400 });
        await kit.mouseDown();
        await kit.move(await shifted(kit, grab, 0.8, -0.7), { duration: 700 });
        await kit.down('Alt');
        await kit.pause(350);
        await kit.move(await shifted(kit, grab, 1.05, -0.7), { duration: 600 });
        await kit.pause(400);
        await kit.move(await shifted(kit, grab, 1.8, -0.7), { duration: 700 });
        await kit.pause(400);
        await kit.up('Alt');
        await kit.pause(450);
        await kit.mouseUp();
      },
    },
    {
      // The arrow keys: a click on the scene gives it the keys; → moves the clip 0.01, Shift+↑ 0.1.
      // X and Y of its Initial state, in the Animations panel, say where it is.
      kind: 'clip',
      name: 'nudge',
      ...QUICK,
      target: previewRightAndAnimations(250),
      highlight: [{ target: { union: ['initial-x', 'initial-y'] }, pad: 3 }],
      setup: async (page, kit) => {
        await kit.seek(4);
        await showInitialState(page, kit);
      },
      act: async (page, kit) => {
        await kit.click(await kit.glyphPoint('euler', 5), { after: 400 });
        for (let i = 0; i < 4; i += 1) await kit.press('ArrowRight', { after: 120 });
        await kit.pause(250);
        await kit.press('Shift+ArrowUp', { after: 250 });
        await kit.press('Shift+ArrowUp', { after: 250 });
        await kit.press('Shift+ArrowLeft', { after: 400 });
        await kit.press('ControlOrMeta+Z', { after: 300 });
      },
    },
    {
      // The grid, shown from the transport bar: a dragged formula lands on the nearest node by its
      // centre. The magnet is off for the drag (in the setup), so that only the grid holds it.
      kind: 'clip',
      name: 'grid-drag',
      ...QUICK,
      target: 'panel-preview',
      keysAt: 'top-right',
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.click('preview-snap');
      },
      act: async (page, kit) => {
        await kit.click('transport-grid', { after: 300 });
        const grab = await kit.glyphPoint('circle', 1);
        await kit.move(grab, { duration: 500 });
        await kit.mouseDown();
        await kit.move(await shifted(kit, grab, 0.9, 0.8), { duration: 700 });
        await kit.pause(350);
        await kit.move(await shifted(kit, grab, 2.1, 1.6), { duration: 700 });
        await kit.pause(600);
        await kit.mouseUp();
      },
    },
    {
      // The handles of one clip, shown while Shift is held: a corner scales in steps (the readout
      // says by how much), the circle above turns it in 15° steps. Scale and Rotation of its
      // Initial state, in the Animations panel, follow.
      kind: 'clip',
      name: 'handles',
      ...QUICK,
      target: previewRightAndAnimations(330),
      highlight: [{ target: { union: ['initial-scale', 'initial-rotation'] }, pad: 3 }],
      setup: async (page, kit) => {
        await kit.seek(4);
        await showInitialState(page, kit);
      },
      act: async (page, kit) => {
        const handles = async () => {
          const canvas = await kit.box('preview-canvas');
          const raw = await page.getByTestId('preview-frame').getAttribute('data-transform-handles');
          const h = JSON.parse(raw);
          const abs = ([x, y]) => ({ x: canvas.x + x, y: canvas.y + y });
          return { se: abs(h.se), rotate: abs(h.rotate), centre: abs(h.center) };
        };
        await kit.down('Shift');
        await kit.pause(150);
        const first = await handles();
        const out = {
          x: first.se.x + (first.se.x - first.centre.x) * 0.45,
          y: first.se.y + (first.se.y - first.centre.y) * 0.45,
        };
        await kit.drag(first.se, out, { duration: 700 });
        await kit.pause(200);
        const second = await handles();
        const radius = Math.hypot(second.rotate.x - second.centre.x, second.rotate.y - second.centre.y);
        const arc = (degrees) => {
          const a = (-90 - degrees) * (Math.PI / 180);
          return { x: second.centre.x + radius * Math.cos(a), y: second.centre.y + radius * Math.sin(a) };
        };
        await kit.drag(second.rotate, arc(30), { via: [arc(12)], duration: 600 });
        await kit.pause(150);
        await kit.up('Shift');
      },
    },
    {
      // The view: Ctrl/⌘ + wheel zooms about the pointer, Alt + drag on empty space pans, Fit
      // brings the whole frame back.
      kind: 'clip',
      name: 'view',
      ...QUICK,
      target: 'panel-preview',
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      act: async (page, kit) => {
        const about = await kit.scenePoint([-4.2, 2.2]);
        await kit.move(about, { duration: 400 });
        await kit.wheel(-100, { at: about, hold: ['ControlOrMeta'], times: 4 });
        await kit.pause(250);
        const grab = await kit.scenePoint([-4.2, 1.0]);
        await kit.drag(grab, { x: grab.x + 190, y: grab.y + 40 }, { hold: ['Alt'], duration: 700 });
        await kit.pause(200);
        await kit.click('preview-fit', { after: 300 });
      },
    },
    {
      // Equal gaps: dragged between the other two, the third formula is as far from one as from
      // the other, and the guides say so. Still taken while the button is down.
      kind: 'shot',
      name: 'guides',
      project: 'docs/web/examples/preview-guides.mfe.json',
      target: frameArea(),
      cursor: true,
      setup: async (page, kit) => {
        await kit.seek(3);
      },
      steps: async (page, kit) => {
        const { dx, dy } = await rowTarget(kit);
        const grab = await kit.glyphPoint('three', 2);
        await kit.move(grab);
        await kit.mouseDown();
        await kit.move(await shifted(kit, grab, 0, dy), { duration: 200 });
        await kit.move(await shifted(kit, grab, dx, dy), { duration: 200 });
      },
    },
    {
      // The handles of one clip, with the hint that names the steps.
      kind: 'shot',
      name: 'handles-shot',
      target: 'preview-frame',
      padding: 3,
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.click(await kit.glyphPoint('euler', 5));
        await kit.down('Shift');
        await kit.settle({ renders: false });
      },
    },
    {
      // Several clips selected, Shift held: the handles frame the whole group.
      kind: 'shot',
      name: 'group-handles',
      target: 'preview-frame',
      padding: 3,
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.move(await kit.scenePoint([0, 0.4]));
        await kit.press('ControlOrMeta+A');
        await kit.down('Shift');
        await kit.settle({ renders: false });
      },
    },
    {
      // A formula locked in the preview: drawn faded, out of the pointer's reach, still there for
      // the others to snap to.
      kind: 'shot',
      name: 'locked',
      target: 'panel-preview',
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.contextMenu({ clip: 'euler' });
        await kit.click({ role: 'menuitem', name: 'Lock in the preview' });
        await kit.settle({ renders: false });
      },
    },
    {
      // The entry of a clip's menu on the timeline that locks it.
      kind: 'shot',
      name: 'lock-menu',
      target: '.ctx-menu',
      padding: 6,
      cursor: true,
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      steps: async (page, kit) => {
        await kit.contextMenu({ clip: 'euler' });
        await kit.hover({ role: 'menuitem', name: 'Lock in the preview' }, { pause: 200 });
      },
    },
    {
      // A clip locked in the preview, on the timeline: the mark at its start.
      kind: 'shot',
      name: 'lock-mark',
      target: { union: [{ clip: 'euler' }, { clip: 'circle' }] },
      padding: { top: 6, right: -300, bottom: 6, left: 6 },
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.contextMenu({ clip: 'euler' });
        await kit.click({ role: 'menuitem', name: 'Lock in the preview' });
        await kit.settle({ renders: false });
      },
    },
    {
      // The right-click menu of a formula in the Preview.
      kind: 'shot',
      name: 'menu',
      target: '.ctx-menu',
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await kit.glyphPoint('pythagoras', 5));
      },
    },
  ],
};
