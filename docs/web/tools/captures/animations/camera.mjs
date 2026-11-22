/* Captures of animations/camera: the world view of the Preview in a tour (the camera, the target
 * cameras, a move's own frame, the frame of 0 s, the Camera row), the Camera row of the timeline
 * with its locked regions, a move added and the camera put where it arrives (a clip), a move
 * isolated among frames that lie one over another, the menu of a target camera, and the camera
 * view played (a clip).
 *
 * Project: `camera-moves` — «theorem» up on the left and «root» far to the right and lower; the
 * moves `n_close` (to a frame of its own, 1.5–2.5 s), `n_result` (to the target camera «Result»,
 * 3.9–5.1 s), `n_wide` (to «Wide», 6.9–8.1 s) and `n_start` (back to the start, 8.7–9.9 s).
 *
 * The camera's rectangles are drawn on the canvas: the Preview says where they are
 * (`data-camera-scene` of `preview-frame`: left, top, width, height in CSS px from the canvas
 * corner), and `rect` turns one into a rectangle of the viewport. */

const PROJECT = 'docs/web/examples/camera-moves.mfe.json';

/** Before the first move, after the theorem is written: the camera is in Manim's frame. */
const AT_START = 1.2;
/** After the first move and the Indicate: the camera rests in the move's own frame. */
const CLOSE = 3.7;

/** The rectangles of the camera's scene, as the Preview says them. */
async function rects(page) {
  const text = await page.getByTestId('preview-frame').getAttribute('data-camera-scene');
  if (!text) throw new Error('the Preview draws no camera');
  return JSON.parse(text);
}

/** A rectangle of the camera's scene as a rectangle of the viewport: `pick` takes it out of what
 * `rects` gives; grown by `pad` px. */
const rect =
  (pick, pad = 4) =>
  async (page, kit) => {
    const frame = await kit.box('preview-frame');
    const [left, top, width, height] = pick(await rects(page));
    return {
      x: frame.x + left - pad,
      y: frame.y + top - pad,
      width: width + 2 * pad,
      height: height + 2 * pad,
    };
  };

/** A point of a rectangle of the camera's scene: `fx`, `fy` of the way across and down it. */
const pointOf = (pick, fx, fy) => async (page, kit) => {
  const frame = await kit.box('preview-frame');
  const [left, top, width, height] = pick(await rects(page));
  return { x: frame.x + left + width * fx, y: frame.y + top + height * fy };
};

/** The Preview and the timeline together. */
const STAGE = { union: ['panel-preview', 'panel-timeline'] };

export default {
  page: 'animations/camera',
  project: PROJECT,
  items: [
    {
      kind: 'tour',
      name: 'world',
      target: STAGE,
      setup: async (page, kit) => {
        await kit.seek(AT_START);
      },
      steps: [
        {
          caption:
            'With the multicamera on, the Preview shows the <b>world</b> around the picture. The ' +
            '<b>camera</b> is the sky-blue rectangle: at 1.2 s it is still in Manim’s own frame, ' +
            'and what it leaves out is dimmed.',
          focus: [rect((r) => r.camera)],
        },
        {
          caption:
            'A pink rectangle with a name is a <b>target camera</b>, a frame set aside for moves ' +
            'to go to: <span class="ui">Result</span> frames the formula on the right, and ' +
            '<span class="ui">Wide</span>, the largest rectangle, both.',
          focus: [rect((r) => r.targets.k_result)],
        },
        {
          caption:
            'The dashed rectangle <b>1</b> is the frame the first move goes to on its own: a ' +
            'close-up of c².',
          focus: [rect((r) => r.moves.n_close)],
        },
        {
          caption:
            'After that move the camera rests there, and <span class="ui">Start</span> marks the ' +
            'frame of 0 s. The line with arrowheads is the camera’s route, from frame to frame.',
          act: async (page, kit) => {
            await kit.seek(CLOSE);
          },
          focus: [rect((r) => r.camera), rect((r) => r.start)],
        },
        {
          caption:
            'The <b>Camera</b> row of the timeline holds the moves. In the toolbar, the camera ' +
            'button turns the multicamera on and off, and the viewfinder beside it is the camera ' +
            'view.',
          focus: ['camera-row', { union: ['preview-multicamera', 'preview-camera-view'] }],
        },
      ],
    },
    {
      // The Camera row under the ruler, its four moves, and the locked region under each.
      kind: 'shot',
      name: 'row',
      target: 'panel-timeline',
      setup: async (page, kit) => {
        await kit.seek(CLOSE);
      },
      highlight: [
        { target: 'camera-header', label: 1, markerAt: 'top-right' },
        { target: 'camera-move-n_result', label: 2, markerAt: 'top' },
        { target: 'camera-region-n_wide', label: 3, markerAt: 'right' },
      ],
    },
    {
      // «Add camera move» at 1.5 s, on a camera with no move yet; then the camera, which now
      // stands at the move's end, is dragged to the right and made smaller by a corner.
      kind: 'clip',
      name: 'add-move',
      target: STAGE,
      keysAt: 'top-left',
      loop: false,
      holdEnd: 800,
      maxSeconds: 8,
      setup: async (page, kit) => {
        await kit.mfe((mfe) =>
          mfe.useProjectStore.getState().update((draft) => {
            draft.camera = { initial: { center: [0, 0], height: 8 }, targets: [], moves: [] };
          }),
        );
        await kit.seek(1.5);
        await kit.settle();
      },
      act: async (page, kit) => {
        await kit.click('camera-add-move');
        await kit.pause(300);
        // By its right edge, a quarter of the frame to the right.
        const edge = await pointOf((r) => r.camera, 1, 0.6)(page, kit);
        const width = (await rects(page)).camera[2];
        await kit.drag(edge, { x: edge.x + width * 0.22, y: edge.y }, { duration: 1100 });
        await kit.pause(200);
        // Then its lower right corner, towards its centre: it zooms in.
        const corner = await pointOf((r) => r.camera, 1, 1)(page, kit);
        const size = (await rects(page)).camera;
        await kit.drag(
          corner,
          { x: corner.x - size[2] * 0.2, y: corner.y - size[3] * 0.2 },
          { duration: 1100 },
        );
      },
    },
    {
      // A move isolated: the camera goes twice to the close-up and twice to the result, each move
      // to a frame of its own, so the frames of the first and third moves lie one over another.
      // The first is isolated from its menu on the Camera row.
      kind: 'shot',
      name: 'isolated',
      target: STAGE,
      setup: async (page, kit) => {
        await kit.mfe((mfe) =>
          mfe.useProjectStore.getState().update((draft) => {
            const close = () => ({ kind: 'frame', frame: { center: [-0.85, 1], height: 3 } });
            const result = () => ({ kind: 'frame', frame: { center: [10, -2], height: 4.5 } });
            draft.camera.targets = [];
            for (const move of draft.camera.moves) {
              move.to = move.id === 'n_close' || move.id === 'n_wide' ? close() : result();
            }
          }),
        );
        await kit.seek(AT_START);
        await kit.settle();
      },
      steps: async (page, kit) => {
        await kit.rightClick('camera-move-n_close');
        await kit.click('camera-move-menu-isolate');
        await kit.waitFor('preview-isolation-done');
        await kit.settle();
      },
      highlight: [
        { target: rect((r) => r.moves.n_close, 6), label: 1, markerAt: 'right' },
        { target: rect((r) => r.camera, 2), label: 2, markerAt: 'bottom-left' },
        { target: 'preview-isolation-done', label: 3, markerAt: 'top-right', pad: 12 },
        { target: 'camera-move-n_close', label: 4, markerAt: 'bottom', pad: 5 },
      ],
    },
    {
      // The right-click menu of the target camera «Result».
      kind: 'shot',
      name: 'target-menu',
      target: 'panel-preview',
      cursor: true,
      setup: async (page, kit) => {
        await kit.seek(AT_START);
      },
      steps: async (page, kit) => {
        // By its lower edge, which no other rectangle is near.
        await kit.rightClick(pointOf((r) => r.targets.k_result, 0.5, 1));
        await kit.waitFor('camera-menu');
      },
    },
    {
      // The camera view: V, the scene played through the first two moves, V again.
      kind: 'clip',
      name: 'camera-view',
      target: 'panel-preview',
      keysAt: 'top-left',
      loop: false,
      // It must be long: it plays two moves of the camera.
      maxSeconds: 9,
      setup: async (page, kit) => {
        await kit.seek(1.4);
      },
      act: async (page, kit) => {
        await kit.press('v');
        await kit.pause(400);
        await kit.press('Space');
        await kit.pause(3800);
        await kit.press('Space');
        await kit.pause(300);
        await kit.press('v');
      },
    },
  ],
};
