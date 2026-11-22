/* The steps that make docs/web/examples/braces-labelled.mfe.json from braces-start.mfe.json (the sum
 * 1+2+3+4+5+6 written in over 1.2 s), done in the app:
 *
 *   node docs/web/tools/examples.mjs derive braces-start braces-labelled --force \
 *     --steps docs/web/tools/captures/objects/_braces-labelled.steps.mjs \
 *     --title 'Labelled braces'
 *
 * A blue brace under 1+2+3 from 2 s, a green one under 4+5+6 from 3.4 s and a yellow one over the whole
 * sum from 4.8 s, each with a label (6, 15 and 21) and each growing from its centre. A file whose name
 * starts with `_` is no page: the capture tool does not read it. */
import { colourBrace, growBrace, labelBrace } from '../_shared/annotated-identity.mjs';

/** Alt+click the glyph `first` of the sum and Alt+Shift+click the glyph `last`. */
async function pick(kit, first, last) {
  await kit.click(await kit.glyphPoint('series', first), { hold: ['Alt'] });
  await kit.click(await kit.glyphPoint('series', last), { hold: ['Alt', 'Shift'] });
}

/** The brace of the glyphs picked, from the bar's Brace ▾, on `side`. */
async function braceOfPick(kit, page, side) {
  await kit.click('glyph-pick-brace');
  kit.menu = page.locator('[role="menu"][aria-label="Add brace"]').first();
  await kit.choose(side);
  await kit.settle({ renders: false });
}

/** Colour, label and intro of the brace `name`: the order of the tutorial (the label while the brace
 * can still be right-clicked at the first instant of its clip). */
async function dress(kit, name, colour, label) {
  await colourBrace(kit, name, colour);
  await labelBrace(kit, name, label);
  await growBrace(kit, name);
}

export default async (page, kit) => {
  await kit.seek(2);
  await pick(kit, 0, 4);
  await braceOfPick(kit, page, 'Below');
  await dress(kit, 'b1', 'BLUE', '6');
  await kit.seek(3.4);
  await pick(kit, 6, 10);
  await braceOfPick(kit, page, 'Below');
  await dress(kit, 'b2', 'GREEN', '15');
  await kit.seek(4.8);
  await kit.contextMenu(await kit.formulaPoint('series'));
  await kit.choose('Add brace ▸ Above');
  await kit.settle({ renders: false });
  await dress(kit, 'b3', 'YELLOW', '21');
};
