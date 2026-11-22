/* Captures of objects/shapes: adding a shape from the Preview's menu, the list of shapes in the
 * glyph bar, the Shape section of the Animations panel, the menu of a shape, the Transform that
 * carries a shape to other glyphs and its paint fields, and one shape round two clips. Stills only:
 * the pages' players show what the shapes do.
 *
 * The scene is the sum 1+2+3+4+5+6 (formula `series`, 96 pt), centred at (0, 0.5)
 * (examples/braces-start.mfe.json, and shapes-start-box.mfe.json with a box round 1+2+3): its
 * glyphs are 1 + 2 + 3 + 4 + 5 + 6 in that order (0 to 10). */

const START = 'docs/web/examples/braces-start.mfe.json';
const BOX = 'docs/web/examples/shapes-start-box.mfe.json';
const CLIPS = 'docs/web/examples/braces-start-clips.mfe.json';

/** The Preview's panel, with room under it for a menu that opens over the timeline: 700 px tall,
 * or down to the bottom of the open menus when they reach lower. */
const PREVIEW_AND_MENU = async (page, kit) => {
  const panel = await kit.box('panel-preview');
  const bottoms = await page
    .locator('.ctx-menu')
    .evaluateAll((menus) => menus.map((menu) => menu.getBoundingClientRect().bottom));
  const height = Math.max(700, ...bottoms.map((bottom) => Math.ceil(bottom - panel.y + 8)));
  return { x: panel.x, y: panel.y, width: panel.width, height };
};

/** The page point of the middle of the left edge of the shape named `name`: where its stroke is. */
async function shapeEdge(kit, name) {
  const [x, y, width] = await kit.mfe((mfe, wanted) => {
    const { project } = mfe.useProjectStore.getState();
    const formula = project.formulas.find((f) => f.name === wanted);
    const clip = project.clips.find((c) => c.formulaId === formula.id);
    return [...clip.initial.position, formula.width];
  }, name);
  return kit.scenePoint([x - width / 2, y]);
}

/** The id of the first block of the first clip that has blocks (the tween a shot is about). */
const firstBlock = (kit) =>
  kit.mfe((mfe) => {
    const { project } = mfe.useProjectStore.getState();
    return project.clips.find((c) => c.actions.length > 0).actions[0].id;
  });

export default {
  page: 'objects/shapes',
  project: START,
  items: [
    {
      // Right-click the sum: Add shape ▸ lists the six shapes and the dialog.
      kind: 'shot',
      name: 'add-shape',
      target: PREVIEW_AND_MENU,
      setup: async (page, kit) => {
        await kit.seek(2);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await kit.formulaPoint('series'));
        await kit.openSubmenu('Add shape');
      },
      cursor: true,
    },
    {
      // The glyph bar's Shape ▾ lists the six shapes and the dialog.
      kind: 'shot',
      name: 'shape-menu',
      target: 'panel-preview',
      setup: async (page, kit) => {
        await kit.seek(2);
        await kit.drag(await kit.glyphPoint('series', 0), await kit.glyphPoint('series', 4), { hold: ['Alt'] });
        await kit.click('glyph-pick-shape');
        await kit.settle({ renders: false });
      },
      cursor: true,
    },
    {
      // The Shape section of the Animations panel (the Timing tab) for a selected box.
      kind: 'shot',
      name: 'shape-section',
      project: BOX,
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.selectClip('s1');
        await page.getByRole('tab', { name: 'Timing' }).click();
        await kit.scrollTo('attachment-section');
      },
      highlight: [
        { target: { union: ['attachment-shape', 'attachment-color', 'attachment-size'] }, label: 1, markerAt: 'right' },
        { target: { union: ['attachment-buff', 'attachment-corner', 'attachment-stroke-width', 'attachment-fill-opacity'] }, label: 2, markerAt: 'top-right' },
        { target: 'attachment-fill-color-row', label: 3, markerAt: 'top-right' },
        { target: 'attachment-detach', label: 4, markerAt: 'top-right' },
      ],
    },
    {
      // Transform to another formula or glyphs…: the mode, with 4+5+6 picked with Alt. Enter (or
      // Transform here) makes the block at the playhead.
      kind: 'shot',
      name: 'retarget',
      project: BOX,
      target: 'panel-preview',
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await shapeEdge(kit, 's1'));
        await kit.choose('Transform to another formula or glyphs…');
        await kit.drag(await kit.glyphPoint('series', 6), await kit.glyphPoint('series', 10), { hold: ['Alt'] });
        await kit.settle({ renders: false });
      },
      cursor: true,
    },
    {
      // One tween of a shape with its paint fields ticked: Stroke width, Stroke opacity, Fill
      // opacity and Fill colour go to what the block says.
      kind: 'shot',
      name: 'paint-fields',
      project: 'docs/web/examples/shapes-paint.mfe.json',
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.seek(3.5);
        await kit.selectClip('box');
        await page.getByRole('tab', { name: 'Timing' }).click();
        kit.block = await firstBlock(kit);
        // The paint fields are the last four rows of the block: scroll them to the foot of the panel.
        await kit.scrollTo(`tween-${kit.block}-fill-color-on`, { block: 'end' });
      },
      highlight: [
        {
          target: (page, kit) => ({
            union: [`tween-${kit.block}-stroke-width-on`, `tween-${kit.block}-fill-color-on`],
          }),
          label: 1,
          markerAt: 'top-right',
          pad: { top: 8, bottom: 8, left: 10, right: 240 },
        },
      ],
    },
    {
      // The block that carries a shape to other glyphs, in the Animations panel: where it goes, and
      // Pick again… for another target.
      kind: 'shot',
      name: 'retarget-panel',
      project: 'docs/web/examples/shapes-follow.mfe.json',
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.seek(4);
        await kit.selectClip('s1');
        await page.getByRole('tab', { name: 'Timing' }).click();
        kit.block = await firstBlock(kit);
        await kit.scrollTo(`tween-${kit.block}`);
      },
      highlight: [
        { target: (page, kit) => `tween-${kit.block}-fit-target`, label: 1, markerAt: 'top-right', pad: { right: 6 } },
        { target: (page, kit) => `tween-${kit.block}-retarget`, label: 2, markerAt: 'top-right' },
      ],
    },
    {
      // Two equations that are two clips: click one, Shift+click the other, right-click: Add shape
      // draws one shape round both.
      kind: 'shot',
      name: 'around-clips',
      project: CLIPS,
      target: PREVIEW_AND_MENU,
      setup: async (page, kit) => {
        await kit.seek(2);
      },
      steps: async (page, kit) => {
        const first = await kit.formulaPoint('first');
        await kit.click(first);
        await kit.click(await kit.formulaPoint('second'), { hold: ['Shift'] });
        await kit.contextMenu(first);
        await kit.openSubmenu('Add shape');
      },
      cursor: true,
    },
    {
      // The box's own menu with its Intro submenu open: Create is Manim's for a box.
      kind: 'shot',
      name: 'shape-own-menu',
      project: BOX,
      target: async (page, kit) =>
        kit.box({ union: ['[role="menu"][aria-label="Clip actions"]', '[role="menu"][aria-label="Intro"]'] }, { pad: 8 }),
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await shapeEdge(kit, 's1'));
        await kit.openSubmenu('Intro');
      },
      cursor: true,
    },
  ],
};
