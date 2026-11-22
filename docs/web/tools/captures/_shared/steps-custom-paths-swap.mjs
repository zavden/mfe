/* The gestures that make the example custom-paths-swap from custom-paths-start: the letters a and
 * b trade places, and each gets a path of its own in the Edit-path mode. The a is lifted into an
 * arch over the line it ran along, the b is pulled into an arch below it.
 *
 *   node docs/web/tools/examples.mjs derive custom-paths-start custom-paths-swap --force \
 *     --steps docs/web/tools/captures/_shared/steps-custom-paths-swap.mjs
 *
 * The relation is r_swap; its pair 0 takes the a (glyph 0 of `ab`) to the right, its pair 1 the b
 * to the left. */
import { addAnchor, enterPathMode, enterPathModeFromRelation, smoothAnchor } from './path-editing.mjs';

export const viewport = { width: 1440, height: 900 };

export default async (page, kit) => {
  await kit.selectClip('ab');
  // The a hops over.
  await enterPathMode(page, kit, 'r_swap', 0);
  await addAnchor(page, kit, 120);
  await smoothAnchor(page, kit);
  await kit.press('Enter');
  // The b slides under. Leaving the mode left the relation selected: its panel lists the pairs.
  await enterPathModeFromRelation(page, kit, 1);
  await addAnchor(page, kit, -120);
  await smoothAnchor(page, kit);
  await kit.press('Enter');
};
