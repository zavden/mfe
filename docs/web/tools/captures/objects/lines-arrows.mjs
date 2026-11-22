/* Captures of objects/lines-arrows: a tour of drawing an arrow from a formula's menu (the compass
 * that asks where on a formula an end is, a click for the other end), a line from empty space, the
 * handles of the two ends (dragged free, onto a symbol with Alt, along the line with Ctrl/⌘), their
 * menu, the Line section of the Animations panel, an arc bent by its stem, a spline shaped in the
 * Edit curve mode, the tip fields, the Transform that carries the ends, and the menus of a line.
 * Clips only where a drag teaches; the pages' players show what a line does.
 *
 * The scenes (docs/web/examples/lines-start*.mfe.json): the letters A and B at (∓4.2, 1.4) in 144
 * pt — A's right edge is at x = −3.68 and B's left edge at 3.66 —, an arrow A → B from 0.8 s in
 * lines-start-arrow, and three letters A (−5, −1.8), B (5, −1.8), C (0, 2.2) with the arrow from A
 * to B in lines-start-three. */

const TWO = 'docs/web/examples/lines-start.mfe.json';
const ARROW = 'docs/web/examples/lines-start-arrow.mfe.json';
const THREE = 'docs/web/examples/lines-start-three.mfe.json';
const TIPS = 'docs/web/examples/lines-tips.mfe.json';

/** The Preview's panel down to a little above the hints on the bottom of its frame (the hint of a
 * mode and the one about the handles lie one over the other there): a menu that opens from a
 * formula near the top of the frame is whole in it. */
const PREVIEW_TOP = async (page, kit) => {
  const panel = await kit.box('panel-preview');
  return { x: panel.x, y: panel.y, width: panel.width, height: 476 };
};

/** The Preview's panel with room under it for a menu that opens over the timeline. */
const PREVIEW_AND_MENU = async (page, kit) => {
  const panel = await kit.box('panel-preview');
  return { x: panel.x, y: panel.y, width: panel.width, height: 700 };
};

/** The id of the first block of the first clip that has blocks (the tween a shot is about). */
const firstBlock = (kit) =>
  kit.mfe((mfe) => {
    const { project } = mfe.useProjectStore.getState();
    return project.clips.find((c) => c.actions.length > 0).actions[0].id;
  });

/** Right-click the line `l1` and choose «Curve ▸ <shape>»: the line is selected, bent. */
async function bend(kit, shape) {
  await kit.contextMenu(await kit.formulaPoint('l1'));
  await kit.choose(`Curve ▸ ${shape}`);
  await kit.settle({ renders: false });
}

export default {
  page: 'objects/lines-arrows',
  project: TWO,
  items: [
    {
      // Right-click A: Add line ▸ Arrow. The compass asks where on A the arrow starts (here the
      // middle of its right edge), a click on B and the compass for B (the middle of its left edge):
      // the arrow is made, selected, with its two handles.
      kind: 'tour',
      name: 'draw-arrow',
      target: PREVIEW_AND_MENU,
      scale: 1.5,
      setup: async (page, kit) => {
        await kit.seek(1);
      },
      steps: [
        {
          caption:
            'Right-click <b>A</b>, then <span class="ui">Add line ▸ Arrow</span>. The line starts on A.',
          act: async (page, kit) => {
            await kit.contextMenu(await kit.formulaPoint('a'));
            await kit.openSubmenu('Add line');
          },
          cursor: true,
          focus: ['[role="menu"][aria-label="Add line"]'],
        },
        {
          caption:
            'A compass asks <b>where on A</b> the arrow starts. Here, the middle of its right edge.',
          act: async (page, kit) => {
            await kit.choose('Arrow');
            // The right-click selected A, and the hint about the transform handles then lies over
            // the hint of the mode: nothing selected, the hint of the mode is whole.
            await kit.clearSelection();
            await kit.waitFor('line-compass');
          },
          focus: ['line-compass'],
        },
        {
          caption:
            'Click <b>B</b>: a second compass asks where on B the arrow ends. Here, the middle of its left edge.',
          act: async (page, kit) => {
            await kit.click('compass-RIGHT');
            await kit.click(await kit.formulaPoint('b'));
            await kit.waitFor('line-compass');
          },
          focus: ['line-compass'],
        },
        {
          caption: 'The arrow is made and selected, with a <b>handle at each end</b>.',
          act: async (page, kit) => {
            await kit.click('compass-LEFT');
            await kit.settle({ renders: false });
          },
          focus: ['line-end-start', 'line-end-end'],
        },
      ],
    },
    {
      // The compass: nine points of the box of A, and Auto.
      kind: 'shot',
      name: 'compass',
      target: async (page, kit) => {
        const compass = await kit.box('line-compass');
        const a = await kit.formulaPoint('a');
        return { x: a.x - 90, y: compass.y - 30, width: compass.width + 210, height: compass.height + 60 };
      },
      setup: async (page, kit) => {
        await kit.seek(1);
        await kit.contextMenu(await kit.formulaPoint('a'));
        await kit.choose('Add line ▸ Arrow');
        await kit.clearSelection();
        await kit.waitFor('line-compass');
      },
    },
    {
      // From the empty space: right-click, and the four kinds are listed (Line, Dashed line, Arrow,
      // Double arrow). A click for the start, then one on B, make the line.
      kind: 'shot',
      name: 'free-start',
      target: PREVIEW_AND_MENU,
      setup: async (page, kit) => {
        await kit.seek(1);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await kit.scenePoint([-3.4, -1.2]));
      },
      cursor: true,
    },
    {
      // Dragging a handle with no key leaves that end free where it is dropped.
      kind: 'clip',
      name: 'drag-free',
      project: ARROW,
      target: PREVIEW_TOP,
      keysAt: 'top-right',
      loop: false,
      holdStart: 300,
      holdEnd: 600,
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await kit.selectClip('l1');
      },
      act: async (page, kit) => {
        await kit.drag('line-end-end', await kit.scenePoint([3.2, -1.6]), { duration: 1100 });
        await kit.pause(500);
      },
    },
    {
      // With Alt held at the drop, the end goes on the symbol under the pointer (here C) and the
      // compass asks where on it.
      kind: 'clip',
      name: 'drag-alt',
      project: THREE,
      target: PREVIEW_TOP,
      keysAt: 'top-right',
      loop: false,
      holdStart: 300,
      holdEnd: 600,
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await kit.selectClip('l1');
      },
      act: async (page, kit) => {
        await kit.drag('line-end-end', await kit.formulaPoint('c'), {
          holdAfterPress: ['Alt'],
          duration: 1000,
          release: false,
        });
        await kit.pause(300);
        await kit.mouseUp();
        await kit.up('Alt');
        await kit.waitFor('line-compass');
        await kit.pause(300);
        await kit.click('compass-DL');
        await kit.pause(500);
      },
    },
    {
      // With Ctrl/⌘ held the end stays on the line's own direction: the pointer goes down and to
      // the left, the arrow only gets shorter.
      kind: 'clip',
      name: 'drag-ctrl',
      project: ARROW,
      target: PREVIEW_TOP,
      keysAt: 'top-right',
      loop: false,
      holdStart: 300,
      holdEnd: 600,
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await kit.selectClip('l1');
      },
      act: async (page, kit) => {
        await kit.drag('line-end-end', await kit.scenePoint([0.6, -0.6]), {
          holdAfterPress: ['ControlOrMeta'],
          duration: 1300,
        });
        await kit.pause(500);
      },
    },
    {
      // Right-click a handle: where the end is, Detach, and Change its point….
      kind: 'shot',
      name: 'handle-menu',
      project: ARROW,
      target: async (page, kit) => {
        const menu = await kit.box('line-end-menu');
        return { x: menu.x - 150, y: menu.y - 70, width: menu.width + 300, height: menu.height + 110 };
      },
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await kit.selectClip('l1');
      },
      steps: async (page, kit) => {
        await kit.click('line-end-start', { button: 'right' });
      },
      cursor: true,
    },
    {
      // The Line section of the Animations panel (the Timing tab).
      kind: 'shot',
      name: 'line-section',
      project: ARROW,
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await kit.selectClip('l1');
        await page.getByRole('tab', { name: 'Timing' }).click();
        await kit.scrollTo('line-section');
      },
      highlight: [
        { target: { union: ['line-kind-field', 'line-color', 'line-reverse'] }, label: 1, markerAt: 'top-right' },
        { target: { union: ['line-stroke', 'line-tip', 'line-gap'] }, label: 2, markerAt: 'top-right' },
        { target: 'line-tip-shape', label: 3, markerAt: 'top-right' },
        { target: 'line-curve-row', label: 4, markerAt: 'top-right' },
        { target: { union: ['line-start-anchor', 'line-start-free'] }, label: 5, markerAt: 'top-right' },
      ],
    },
    {
      // Curve ▸ Arc: thirty degrees to begin with. A stem along the arc leaves the start with a
      // handle at its tip: drag it to bend the line more, less or the other way (Shift: 15°).
      kind: 'clip',
      name: 'arc-stem',
      project: ARROW,
      target: PREVIEW_TOP,
      keysAt: 'top-right',
      loop: false,
      holdStart: 300,
      holdEnd: 600,
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await bend(kit, 'Arc');
      },
      act: async (page, kit) => {
        await kit.drag('line-arc-handle', { dx: -10, dy: -110 }, { holdAfterPress: ['Shift'], duration: 1300 });
        await kit.pause(600);
      },
    },
    {
      // Curve ▸ Spline: the mode Edit curve, on the arc of 30° the line was, with its two ends and a
      // handle each. A click on the curve adds a point there (smooth, with two handles of its own).
      // A drag moves the point; a drag of one of its handles bends the curve.
      kind: 'clip',
      name: 'spline-edit',
      project: ARROW,
      target: PREVIEW_TOP,
      keysAt: 'top-right',
      loop: false,
      holdStart: 300,
      holdEnd: 600,
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await bend(kit, 'Spline');
        // The middle of the curve (a cubic Bézier through the ends, led by their handles).
        const [p0, p1, p2, p3] = await Promise.all(
          ['line-curve-node-0', 'line-curve-handle-0-out', 'line-curve-handle-1-in', 'line-curve-node-1'].map(
            (id) => kit.point(id),
          ),
        );
        await kit.click({
          x: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8,
          y: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8,
        });
        await kit.waitFor('line-curve-node-2');
      },
      act: async (page, kit) => {
        await kit.drag('line-curve-node-1', { dx: 0, dy: -90 }, { duration: 1000 });
        await kit.pause(300);
        await kit.drag('line-curve-handle-1-out', { dx: 70, dy: 60 }, { duration: 1000 });
        await kit.pause(500);
      },
    },
    {
      // The tip fields of a double arrow: a shape for each end.
      kind: 'shot',
      name: 'tip-fields',
      project: TIPS,
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.seek(5);
        await kit.selectClip('l4');
        await page.getByRole('tab', { name: 'Timing' }).click();
        await kit.scrollTo('line-section');
      },
      highlight: [
        { target: 'line-tip', label: 1, markerAt: 'top-right' },
        { target: { union: ['line-tip-shape', 'line-start-tip-shape'] }, label: 2, markerAt: 'top-right' },
      ],
    },
    {
      // The Transform that carries the ends, in the Animations panel: where each end goes (the
      // glyphs, the point on them, Detach), the gap, and what the line arrives with.
      kind: 'shot',
      name: 'ends-panel',
      project: 'docs/web/examples/lines-ends-transform.mfe.json',
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.seek(4.6);
        await kit.selectClip('l1');
        await page.getByRole('tab', { name: 'Timing' }).click();
        kit.block = await firstBlock(kit);
        await kit.scrollTo(`tween-${kit.block}`);
      },
      highlight: [{ target: (page, kit) => `tween-${kit.block}-ends`, label: 1, markerAt: 'top-right' }],
    },
    {
      // The menu of a line, with Curve › open: Arc, Spline, and the path shape copied and pasted.
      kind: 'shot',
      name: 'line-menu',
      project: ARROW,
      target: async (page, kit) =>
        kit.box({ union: ['[role="menu"][aria-label="Clip actions"]', '[role="menu"][aria-label="Curve"]'] }, { pad: 8 }),
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await kit.selectClip('l1');
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await kit.formulaPoint('l1'));
        await kit.openSubmenu('Curve');
      },
      cursor: true,
    },
    {
      // The same menu with Detach › open: Detach start (mint), Detach end (coral), Detach all.
      kind: 'shot',
      name: 'line-menu-detach',
      project: ARROW,
      target: async (page, kit) =>
        kit.box({ union: ['[role="menu"][aria-label="Clip actions"]', '[role="menu"][aria-label="Detach"]'] }, { pad: 8 }),
      setup: async (page, kit) => {
        await kit.seek(1.5);
        await kit.selectClip('l1');
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await kit.formulaPoint('l1'));
        await kit.openSubmenu('Detach');
      },
      cursor: true,
    },
  ],
};
