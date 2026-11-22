/* The steps that make docs/web/examples/shapes-follow.mfe.json from shapes-start-box.mfe.json (the
 * sum 1+2+3+4+5+6 with a box round 1+2+3 from 1.6 s), done in the app:
 *
 *   node docs/web/tools/examples.mjs derive shapes-start-box shapes-follow --force \
 *     --steps docs/web/tools/captures/objects/_shapes-follow.steps.mjs \
 *     --title 'A box that moves to other glyphs'
 *
 * At 3.6 s the box is carried to 4+5+6 (Transform to another formula or glyphs…, an Alt drag over
 * them, Enter), and at 5.8 s round the whole sum (a click on it, Enter). A file whose name starts
 * with `_` is no page: the capture tool does not read it. */

/** Where the stroke of the box `s1` is at the playhead: the middle of its left edge. */
async function boxEdge(kit) {
  const id = await kit.clipId('s1');
  const box = await kit.app(
    '/src/ui/preview/geometry.ts',
    (m, clip) => m.geometryNow().get(clip).box,
    id,
  );
  return kit.scenePoint([box.minX, (box.minY + box.maxY) / 2]);
}

/** Start carrying the box: the menu of the box, Transform to another formula or glyphs…. */
async function carry(kit) {
  await kit.contextMenu(await boxEdge(kit));
  await kit.choose('Transform to another formula or glyphs…');
}

export default async (page, kit) => {
  await kit.seek(3.6);
  await carry(kit);
  await kit.drag(await kit.glyphPoint('series', 6), await kit.glyphPoint('series', 10), { hold: ['Alt'] });
  await kit.press('Enter');
  await kit.settle({ renders: false });
  await kit.seek(5.8);
  await carry(kit);
  await kit.click(await kit.formulaPoint('series'));
  await kit.press('Enter');
  await kit.settle({ renders: false });
};
