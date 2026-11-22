/* Captures of objects/braces: adding a brace from the Preview's menu, over glyphs picked with Alt
 * and over several clips, the label typed in the editor, the Brace section of the Animations
 * panel and the brace's own menu.
 *
 * The scene is the sum 1+2+3+4+5+6 (formula `series`, 96 pt), centred at (0, 0.5), in
 * examples/braces-start.mfe.json: its glyphs are 1 + 2 + 3 + 4 + 5 + 6 in that order (0 to 10).
 * The two equations of braces-start-clips are x + y = 10 at (−2.29, 1.0) and x − y = 2 at
 * (−2.54, −0.7), their equals signs on one line. */

const START = 'docs/web/examples/braces-start.mfe.json';
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

/** Right-click the sum and choose «Add brace ▸ <side>» (what the clips show, done at once). */
async function addBrace(kit, side = 'Below') {
  await kit.contextMenu(await kit.formulaPoint('series'));
  await kit.choose(`Add brace ▸ ${side}`);
  await kit.settle({ renders: false });
}

/** Where a click means the brace `name`: the place its clip holds (the brace is drawn there). */
async function bracePoint(kit, name = 'b1') {
  const [x, y] = await kit.mfe((mfe, wanted) => {
    const { project } = mfe.useProjectStore.getState();
    const formula = project.formulas.find((f) => f.name === wanted);
    return project.clips.find((c) => c.formulaId === formula.id).initial.position;
  }, name);
  return kit.scenePoint([x, y]);
}

export default {
  page: 'objects/braces',
  project: START,
  items: [
    {
      // Right-click the sum at 2 s: Add brace ▸ lists the four sides and the dialog.
      kind: 'shot',
      name: 'add-brace',
      target: PREVIEW_AND_MENU,
      setup: async (page, kit) => {
        await kit.seek(2);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await kit.formulaPoint('series'));
        await kit.openSubmenu('Add brace');
      },
      cursor: true,
    },
    {
      // Where the new brace is: a clip of its own on a track in front of the sum's, from the
      // playhead (2 s) to the end of the sum's clip, with no intro and no outro.
      kind: 'shot',
      name: 'brace-on-timeline',
      target: async (page, kit) => {
        const panel = await kit.box('panel-timeline');
        return { x: panel.x, y: panel.y, width: 1010, height: panel.height };
      },
      setup: async (page, kit) => {
        await kit.seek(2);
        await addBrace(kit);
      },
      highlight: [{ target: { clip: 'b1' }, label: 1, markerAt: 'top-right' }],
    },
    {
      // Alt+drag a rectangle over 1+2+3 picks those five glyphs; the bar of the Preview's corner
      // offers Brace ▾ on them.
      kind: 'clip',
      name: 'pick-glyphs',
      target: PREVIEW_AND_MENU,
      keysAt: 'top-right',
      loop: false,
      holdStart: 300,
      holdEnd: 500,
      setup: async (page, kit) => {
        await kit.seek(2);
      },
      act: async (page, kit) => {
        await kit.drag(await kit.glyphPoint('series', 0), await kit.glyphPoint('series', 4), {
          hold: ['Alt'],
          duration: 900,
        });
        await kit.pause(150);
        await kit.click('glyph-pick-brace');
        kit.menu = page.locator('[role="menu"][aria-label="Add brace"]').first();
        await kit.pause(100);
        await kit.choose('Below');
        await kit.pause(300);
      },
    },
    {
      // «On some glyphs…»: the glyphs of the clip, those to put the brace on chosen with a click
      // and Shift for a range, and the side.
      kind: 'shot',
      name: 'glyphs-dialog',
      target: 'brace-glyphs-dialog',
      padding: 10,
      setup: async (page, kit) => {
        await kit.seek(2);
        await kit.contextMenu(await kit.formulaPoint('series'));
        await kit.choose('Add brace ▸ On some glyphs…');
        await kit.settle();
      },
      steps: async (page, kit) => {
        await kit.click('brace-glyph-0');
        await kit.click('brace-glyph-4', { hold: ['Shift'] });
        await kit.settle({ renders: false });
      },
    },
    {
      // Two equations that are two clips: click one, Shift+click the other, right-click: the
      // entry reads «Add brace · on the 2 selected clips», and one brace goes over both.
      kind: 'shot',
      name: 'several-clips',
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
        await kit.openSubmenu('Add brace');
      },
      cursor: true,
    },
    {
      // Add label ▸ Formula on the brace: an empty formula hangs at its tip and opens in the
      // editor; 21 typed in the raw LaTeX box, the editor shows its glyphs.
      kind: 'shot',
      name: 'add-label',
      target: 'formula-editor',
      padding: 8,
      setup: async (page, kit) => {
        await kit.seek(2);
        await addBrace(kit);
        await kit.contextMenu(await bracePoint(kit));
        await kit.choose('Add label ▸ Formula');
        await kit.waitFor('raw-latex');
        await kit.click('raw-latex');
        await kit.type('21');
        await kit.click('editor-apply');
        await kit.settle();
      },
    },
    {
      // The Brace section of the Animations panel (the Timing tab) for the selected brace.
      kind: 'shot',
      name: 'brace-section',
      target: 'panel-animations',
      setup: async (page, kit) => {
        await kit.seek(2);
        await addBrace(kit);
        await page.getByRole('tab', { name: 'Timing' }).click();
        await kit.scrollTo('attachment-section');
      },
      highlight: [
        { target: { union: ['attachment-direction', 'attachment-side-right'] }, label: 1, markerAt: 'top-right' },
        { target: { union: ['attachment-sharpness', 'attachment-width'] }, label: 2, markerAt: 'top-right' },
        { target: { union: ['attachment-labels', 'attachment-add-label'] }, label: 3, markerAt: 'top-right' },
        { target: 'attachment-detach', label: 4, markerAt: 'top-right' },
      ],
    },
    {
      // The brace's own menu, with its Direction submenu open: the side it is on is ticked.
      kind: 'shot',
      name: 'brace-menu',
      target: async (page, kit) =>
        kit.box({ union: ['[role="menu"][aria-label="Clip actions"]', '[role="menu"][aria-label="Direction"]'] }, { pad: 4 }),
      setup: async (page, kit) => {
        await kit.seek(2);
        await addBrace(kit);
      },
      steps: async (page, kit) => {
        await kit.contextMenu(await bracePoint(kit));
        await kit.openSubmenu('Direction');
      },
      cursor: true,
    },
  ],
};
