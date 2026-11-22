/* Captures of layout/align: the bar that comes with two or more selected clips, the Edit menu and
 * the right-click menu, Align left and Distribute vertically on a column of lines, a selection
 * moved as one group, and the notice that names the clips that stay.
 *
 * Scene: `layout-align-start` — three lines of a solution on the left (line1, line2, line3), a
 * row of three formulas at the bottom (row1, row2, row3) and a title (title) on the right. Scene
 * points are scene units (x right, y up, the frame 14.22 × 8); `kit.scenePoint` turns them into
 * page points, and glyph points come from the app's own geometry of the clips at the playhead
 * (`kit.glyphPoint`).
 *
 * A clip is one gesture, in about 5 s: it does not loop back (`loop: false`) and rests a little. */

const QUICK = { loop: false, holdStart: 300, holdEnd: 600 };

async function frameArea(page, kit) {
  const frame = await kit.box('preview-frame');
  return { x: frame.x - 3, y: frame.y - 3, width: frame.width + 6, height: frame.height + 6 };
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

const COLUMN = ['line1', 'line2', 'line3'];
const ALL = [...COLUMN, 'row1', 'row2', 'row3', 'title'];

export default {
  page: 'layout/align',
  project: 'docs/web/examples/layout-align-start.mfe.json',
  items: [
    {
      // The bar in the corner of the Preview while two or more clips are selected.
      kind: 'shot',
      name: 'bar',
      target: 'preview-actions',
      padding: { top: 26, right: 10, bottom: 10, left: 10 },
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.press('ControlOrMeta+A');
        await kit.settle({ renders: false });
      },
      highlight: [
        { target: 'preview-actions-count', label: 1, markerAt: 'top' },
        {
          target: {
            union: [
              'preview-actions-align-left',
              'preview-actions-align-center',
              'preview-actions-align-right',
              'preview-actions-align-top',
              'preview-actions-align-middle',
              'preview-actions-align-bottom',
            ],
          },
          label: 2,
          markerAt: 'top',
        },
        {
          target: { union: ['preview-actions-distribute-h', 'preview-actions-distribute-v'] },
          label: 3,
          markerAt: 'top',
        },
        { target: 'preview-actions-match', label: 4, markerAt: 'top' },
      ],
    },
    {
      // Edit ▸ Align: the six edges with their keys, and the two ways in to Align by symbol.
      kind: 'shot',
      name: 'edit-menu',
      target: { union: ['.menu-popup[aria-label="Edit"]', '[role="menu"][aria-label="Align"]'] },
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.selectClip(COLUMN);
      },
      steps: async (page, kit) => {
        await kit.openMenu('Edit ▸ Align');
      },
    },
    {
      // The right-click menu of a formula of the selection: Align and Distribute.
      kind: 'shot',
      name: 'context-menu',
      target: { union: ['.ctx-menu >> nth=0', '.ctx-menu >> nth=1'] },
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.selectClip(COLUMN);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await kit.glyphPoint('line2', 2));
        await kit.openSubmenu('Align');
      },
    },
    {
      // A rectangle round the three lines, Align left from the bar, Distribute vertically by the
      // keys (Ctrl/⌘+Alt+V).
      kind: 'clip',
      name: 'column',
      ...QUICK,
      target: frameArea,
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      act: async (page, kit) => {
        await kit.drag(await kit.scenePoint([-6.95, 3.6]), await kit.scenePoint([-2.0, -0.95]), {
          duration: 900,
        });
        await kit.pause(400);
        await kit.click('preview-actions-align-left', { after: 900 });
        await kit.press('ControlOrMeta+Alt+V', { after: 700 });
      },
    },
    {
      // The selected lines are one group: dragged, they move together and the box round them
      // snaps — here its left edge to the left edge of the first formula of the row.
      kind: 'clip',
      name: 'together',
      ...QUICK,
      target: frameArea,
      keysAt: 'top-right',
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.selectClip(COLUMN);
      },
      act: async (page, kit) => {
        const grab = await kit.glyphPoint('line2', 2);
        // How far right the box round the three lines must go for its left edge to be the left
        // edge of row1.
        const lines = await Promise.all(COLUMN.map((name) => sceneBox(kit, name)));
        const left = Math.min(...lines.map((box) => box.minX));
        const dx = (await sceneBox(kit, 'row1')).minX - left;
        await kit.move(grab, { duration: 500 });
        await kit.mouseDown();
        await kit.move(await shifted(kit, grab, dx * 0.5, -0.1), { duration: 700 });
        await kit.pause(250);
        await kit.move(await shifted(kit, grab, dx, -0.2), { duration: 700 });
        await kit.pause(900);
        await kit.mouseUp();
      },
    },
    {
      // The notice of an alignment that left a clip where it was: one locked in the preview.
      kind: 'shot',
      name: 'stayed',
      target: 'notice-host',
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(4);
        // The title's clip is on the seventh track: the kit scrolls the timeline to it.
        await kit.contextMenu({ clip: 'title' });
        await kit.click({ role: 'menuitem', name: 'Lock in the preview' });
        await kit.selectClip(ALL);
      },
      steps: async (page, kit) => {
        await kit.press('Alt+A');
        await kit.waitFor('notice');
      },
    },
  ],
};
