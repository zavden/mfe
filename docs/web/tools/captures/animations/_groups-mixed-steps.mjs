/* The gestures that make the example `groups-mixed` from itself: the group of its three blocks is
 * undone by the menu of the group (Ungroup), and made again by the menu of one of the blocks
 * (Group with the 2 blocks that run with it), so that the group is the one the app makes. Not a
 * page: the tool does not run a file that starts with `_`.
 *
 * `derive` writes a new slug, so: derive it as `groups-mixed-tmp` (`--description tmp`), move
 * `groups-mixed-tmp.mfe.json` over `groups-mixed.mfe.json`, delete the other `groups-mixed-tmp.*`
 * files and `build groups-mixed`.
 *
 *   node docs/web/tools/examples.mjs derive groups-mixed groups-mixed-tmp \
 *     --steps docs/web/tools/captures/animations/_groups-mixed-steps.mjs \
 *     --title 'A group of different animations' --description tmp
 */
const block = (label) => (page) =>
  page
    .locator('[data-testid^="action-block-"][data-kind], [data-testid^="group-block-"][data-group]')
    .filter({ hasText: label })
    .first();

export default async (page, kit) => {
  await kit.contextMenu(block('Group'));
  await kit.choose('Ungroup');
  await kit.contextMenu(block('Indicate'));
  await kit.choose('Group with the 2 blocks that run with it');
};
