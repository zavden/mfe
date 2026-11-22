/* The gestures that make the example `groups-sides` from `groups-split`: the Write over both sides
 * of 2x + 4 = 10, split into runs, which is what the groups page shows. Not a page: the tool does not
 * run a file that starts with `_`.
 *
 *   node docs/web/tools/examples.mjs derive groups-split groups-sides --force \
 *     --steps docs/web/tools/captures/animations/_groups-sides-steps.mjs --title 'Both sides at once'
 */
const write = (page) =>
  page.locator('[data-testid^="action-block-"][data-kind]').filter({ hasText: 'Write' }).first();

export default async (page, kit) => {
  await kit.contextMenu(write);
  await kit.choose('Split into runs');
};
