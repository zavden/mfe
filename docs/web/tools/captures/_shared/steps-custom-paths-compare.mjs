/* The gestures that make the example custom-paths-compare from custom-paths-compare-start (three
 * rows, one x crossing the frame on each: a straight path, an arc set in the relation's Path arc
 * field, and a third row still straight): the third row's pair gets a path of its own in the
 * Edit-path mode, an S that rises first and dips after.
 *
 *   node docs/web/tools/examples.mjs derive custom-paths-compare-start custom-paths-compare --force \
 *     --steps docs/web/tools/captures/_shared/steps-custom-paths-compare.mjs
 *
 * The start example is only a way in: it is deleted once the new one is built. */
import {
  addAnchor,
  dragInHandle,
  dragOutHandle,
  enterPathMode,
  smoothAnchor,
} from './path-editing.mjs';

export const viewport = { width: 1440, height: 900 };

export default async (page, kit) => {
  await kit.selectClip('edited');
  await enterPathMode(page, kit, 'r_edited', 0);
  await addAnchor(page, kit, 0);
  await smoothAnchor(page, kit);
  // The outgoing handle down: the incoming one turns up with it, and the curve becomes an S. The
  // incoming handle is drawn out farther, so that the S is as deep as the arc of the row above.
  await dragOutHandle(page, kit, 0, 80);
  await dragInHandle(page, kit, -40, -80);
  await kit.press('Enter');
};
