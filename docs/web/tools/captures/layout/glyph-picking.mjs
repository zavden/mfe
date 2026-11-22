/* Captures of layout/glyph-picking: picking glyphs with Alt in the Preview — a click, a range, a
 * rectangle — in one formula and across two, the bar with Colour, Brace and Shape, the colour of
 * the selection in Preferences, a thin symbol taken with the circle selector, and the glyph view
 * of the formula editor, where a thin glyph has a frame of its own.
 *
 * Scene: `layout-glyph-picking-start` — `sum` = (a+b)² = a² + 2ab + b² on top and `diff` =
 * (a−b)² = a² − 2ab + b² under it, both on screen from 2 s, and `thin` = (a+b)/c − d = e, an
 * object of the Creator with no clip. Glyph points come from the app's own geometry of the clips
 * at the playhead (`kit.glyphPoint`).
 *
 * A clip is one gesture, in about 5 s: it does not loop back (`loop: false`) and rests a little. */

const QUICK = { loop: false, holdStart: 300, holdEnd: 600 };

/** The canonical indices of the glyphs of the formula `name`, by label. */
function labelsOf(kit, name) {
  return kit.mfe(
    (mfe, wanted) =>
      mfe.useProjectStore
        .getState()
        .project.formulas.find((f) => f.name === wanted)
        .snapshot.glyphs.map((g) => g.label),
    name,
  );
}

/** The index of the `nth` glyph of `name` with this label. */
async function indexOf(kit, name, label, nth = 0) {
  const labels = await labelsOf(kit, name);
  const at = labels.map((l, i) => (l === label ? i : -1)).filter((i) => i >= 0);
  if (at[nth] === undefined) throw new Error(`no glyph ${label} #${nth} in ${name}`);
  return at[nth];
}

/** The 2ab of a formula: its three glyphs' indices (the third 2, the third a, the second b). */
async function twoAB(kit, name) {
  return [
    await indexOf(kit, name, '2', 2),
    await indexOf(kit, name, 'a', 2),
    await indexOf(kit, name, 'b', 1),
  ];
}

/** The last glyph of an identity: the exponent of its b². */
const lastGlyph = (kit, name) => indexOf(kit, name, '2', 3);

/** The box of glyph `index` of the formula `name` at the playhead, in scene units. */
async function glyphBox(kit, name, index) {
  const id = await kit.clipId(name);
  return kit.app(
    '/src/ui/preview/geometry.ts',
    (m, { clip, glyph }) => m.geometryNow().get(clip).glyphs.get(glyph),
    { clip: id, glyph: index },
  );
}

async function frameArea(page, kit) {
  const frame = await kit.box('preview-frame');
  return { x: frame.x - 3, y: frame.y - 3, width: frame.width + 6, height: frame.height + 6 };
}

/** Alt+click, with Shift when asked: what picks a glyph, and a range. */
function altClick(kit, point, { shift = false, after } = {}) {
  return kit.click(point, { hold: shift ? ['Alt', 'Shift'] : ['Alt'], after });
}

/** The 2ab of both formulas picked, as a hand does it: a click and a range in each. */
async function pickBoth(kit) {
  for (const name of ['sum', 'diff']) {
    const [two, , b] = await twoAB(kit, name);
    await altClick(kit, await kit.glyphPoint(name, two));
    await altClick(kit, await kit.glyphPoint(name, b), { shift: true });
  }
}

export default {
  page: 'layout/glyph-picking',
  project: 'docs/web/examples/layout-glyph-picking-start.mfe.json',
  items: [
    {
      // In one formula: a click picks, Alt+Shift+click takes a range, and Alt + a rectangle from
      // the formula picks what it touches.
      kind: 'clip',
      name: 'pick',
      ...QUICK,
      target: frameArea,
      keysAt: 'top-right',
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      act: async (page, kit) => {
        const [two, , b] = await twoAB(kit, 'sum');
        await altClick(kit, await kit.glyphPoint('sum', two), { after: 300 });
        await altClick(kit, await kit.glyphPoint('sum', b), { shift: true, after: 400 });
        // A rectangle over a² (from the gap after the = to just past its 2).
        const equals = await glyphBox(kit, 'sum', await indexOf(kit, 'sum', '=', 0));
        const square = await glyphBox(kit, 'sum', await indexOf(kit, 'sum', '2', 1));
        const y = (equals.minY + equals.maxY) / 2;
        await kit.drag(
          await kit.scenePoint([equals.maxX + 0.07, y - 0.12]),
          await kit.scenePoint([square.maxX + 0.04, y + 0.2]),
          { hold: ['Alt'], duration: 700 },
        );
        await kit.pause(300);
      },
    },
    {
      // Across two formulas: the last glyph of each identity, and one brace to its right.
      kind: 'clip',
      name: 'across-brace',
      ...QUICK,
      target: frameArea,
      keysAt: 'top-right',
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      act: async (page, kit) => {
        await altClick(kit, await kit.glyphPoint('sum', await lastGlyph(kit, 'sum')), { after: 300 });
        await altClick(kit, await kit.glyphPoint('diff', await lastGlyph(kit, 'diff')), { after: 400 });
        await kit.click('glyph-pick-brace', { after: 400 });
        await kit.click('glyph-pick-brace-right', { after: 800 });
      },
    },
    {
      // The picked glyphs, and the bar that comes with them.
      kind: 'shot',
      name: 'bar',
      target: 'glyph-pick',
      padding: { top: 26, right: 10, bottom: 10, left: 10 },
      setup: async (page, kit) => {
        await kit.seek(4);
        await pickBoth(kit);
      },
      highlight: [
        { target: 'glyph-pick-count', label: 1, markerAt: 'top' },
        { target: 'glyph-pick-color', label: 2, markerAt: 'top' },
        { target: 'glyph-pick-brace', label: 3, markerAt: 'top' },
        { target: 'glyph-pick-shape', label: 4, markerAt: 'top' },
        { target: 'glyph-pick-clear', label: 5, markerAt: 'top' },
      ],
    },
    {
      // The Preview with the picked glyphs: yellow, the formulas they are of selected.
      kind: 'shot',
      name: 'picked',
      target: 'preview-frame',
      padding: 3,
      setup: async (page, kit) => {
        await kit.seek(4);
        await pickBoth(kit);
        await kit.move(await kit.scenePoint([6.5, 0]));
      },
    },
    {
      // Colour ▾ for glyphs of one formula: the palette, the roles, a field for a hex colour, and
      // what is of one formula alone.
      kind: 'shot',
      name: 'colour-menu',
      target: '.ctx-menu',
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(4);
        const [two, , b] = await twoAB(kit, 'sum');
        await altClick(kit, await kit.glyphPoint('sum', two));
        await altClick(kit, await kit.glyphPoint('sum', b), { shift: true });
        await kit.click('glyph-pick-color');
      },
    },
    {
      // Brace ▾ for glyphs of several formulas: a side, one brace over all — no dialog.
      kind: 'shot',
      name: 'brace-menu',
      target: '.ctx-menu',
      padding: 6,
      setup: async (page, kit) => {
        await kit.seek(4);
        await pickBoth(kit);
        await kit.click('glyph-pick-brace');
      },
    },
    {
      // Preferences ▸ Glyph selection colour.
      kind: 'shot',
      name: 'preference',
      target: {
        union: ['.menu-popup[aria-label="Preferences"]', '[role="menu"][aria-label="Glyph selection colour"]'],
      },
      padding: 6,
      steps: async (page, kit) => {
        await kit.openMenu('Preferences ▸ Glyph selection colour');
      },
    },
    {
      // A thin symbol: a click just above the minus picks nothing; the circle selector (S) makes
      // the pointer a circle, and the same click takes the symbol nearest to it.
      kind: 'clip',
      name: 'circle-selector',
      ...QUICK,
      target: frameArea,
      keysAt: 'top-right',
      setup: async (page, kit) => {
        await kit.seek(4);
      },
      act: async (page, kit) => {
        const minus = await kit.glyphPoint('diff', await indexOf(kit, 'diff', '−', 1));
        const near = { x: minus.x, y: minus.y - 13 };
        await altClick(kit, near, { after: 500 });
        await kit.press('s', { after: 400 });
        await altClick(kit, { x: near.x + 2, y: near.y }, { after: 800 });
      },
    },
    {
      // The glyph view of the formula editor: every glyph has a frame of at least 10 pixels, so
      // the bar of a fraction and a minus sign are picked and shown like a letter.
      kind: 'shot',
      name: 'glyph-view',
      target: 'glyph-view',
      padding: 8,
      setup: async (page, kit) => {
        const { id } = await kit.formula('thin');
        await kit.app('/src/ui/creator/formulaEditorStore.ts', (m, formulaId) => m.openFormulaEditor(formulaId), id);
        await kit.waitFor('glyph-view');
        const bar = await indexOf(kit, 'thin', '—', 0).catch(() => null);
        const minus = await indexOf(kit, 'thin', '−', 0);
        if (bar !== null) await kit.click(`glyph-${bar}-frame`);
        await kit.click(`glyph-${minus}-frame`, { hold: ['ControlOrMeta'] });
        await kit.settle({ renders: false });
      },
    },
  ],
};
