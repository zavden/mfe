/* The steps of tutorials/annotated-identity, in the order of the page, done in the app on the
 * starting project (docs/web/examples/annotated-identity-start.mfe.json). They make the project the
 * tutorial ends with:
 *
 *   node docs/web/tools/examples.mjs derive annotated-identity-start annotated-identity --force \
 *     --steps docs/web/tools/captures/tutorials/_annotated-identity.steps.mjs \
 *     --title 'An identity with braces and arrows' --description '…'
 *
 * The helpers are the ones the capture file uses (../_shared/annotated-identity.mjs). A file whose
 * name starts with `_` is no page: the capture tool does not read it. */
import {
  bendArrow,
  braceUnder,
  colourBrace,
  drawArrow,
  growArrow,
  growBrace,
  labelBrace,
} from '../_shared/annotated-identity.mjs';

export default async (page, kit) => {
  // Steps 1 to 4: a brace under the left side from 2.6 s, blue, with its label, growing from its
  // centre. (With the intro on, the brace is not drawn at the first instant of its clip: the label
  // comes before it, while the brace can still be right-clicked there.)
  await kit.seek(2.6);
  await braceUnder(kit, page, 'left');
  await colourBrace(kit, 'b1', 'BLUE');
  await labelBrace(kit, 'b1', String.raw`\text{difference of squares}`);
  await growBrace(kit, 'b1');
  // Step 5: the same on the right, from 4.4 s, in green.
  await kit.seek(4.4);
  await braceUnder(kit, page, 'right');
  await colourBrace(kit, 'b2', 'GREEN');
  await labelBrace(kit, 'b2', String.raw`\text{a product}`);
  await growBrace(kit, 'b2');
  // Steps 6 to 8: an arrow from 6.4 s from the left side to the right one, bent, drawn in over 1.4 s.
  await kit.seek(6.4);
  await drawArrow(kit);
  await bendArrow(kit, page, -55);
  await growArrow(kit, page, 1.4);
};
