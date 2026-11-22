/* Shared by the capture files: the Creator panel's own width.
 *
 *   import { widenCreator } from '../_shared/creator-panel.mjs';
 *   setup: async (page, kit) => { await widenCreator(page, kit, 250); },
 *
 * The Creator starts narrow (a card cuts its name and its badge). The bar between it and the
 * Preview moves with a drag, as a reader would do it: the cards get room. */

/** Drags the bar between the Creator and the Preview `by` CSS px to the right. */
export async function widenCreator(page, kit, by = 250) {
  const bar = await kit.box('.separator-vertical');
  const y = bar.y + bar.height / 2;
  await kit.drag({ x: bar.x + bar.width / 2, y }, { x: bar.x + bar.width / 2 + by, y });
  await kit.settle({ renders: false });
}
