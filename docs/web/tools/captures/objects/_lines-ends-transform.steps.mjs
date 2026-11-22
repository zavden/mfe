/* The steps that make docs/web/examples/lines-ends-transform.mfe.json from lines-start-three.mfe.json
 * (the letters A, B and C, and an arrow from A to B from 0.8 s), done in the app:
 *
 *   node docs/web/tools/examples.mjs derive lines-start-three lines-ends-transform --force \
 *     --steps docs/web/tools/captures/objects/_lines-ends-transform.steps.mjs \
 *     --title 'An arrow that changes its ends'
 *
 * A Transform at 4 s whose end is dropped on C with Alt+Shift (the lower left corner), and one at 7 s whose
 * start is dropped on B (the middle of its left edge). A file whose name
 * starts with `_` is no page: the capture tool does not read it. */

/** Add a Transform to the arrow at the playhead: the Add animation button, Transform. */
async function addTransform(page, kit) {
  await kit.selectClip('l1');
  await page.getByRole('tab', { name: 'Timing' }).click();
  await kit.reveal('add-animation');
  await kit.click('add-animation');
  kit.menu = page.locator('[role="menu"][aria-label="Add animation"]').first();
  await kit.choose('Transform');
  await kit.settle({ renders: false });
}

/** Drop a handle of the arrow on a letter with Alt+Shift (the whole formula: its panel row reads
 * «on c», short), and answer the compass. */
async function dropOn(kit, handle, letter, point) {
  await kit.drag(handle, await kit.formulaPoint(letter), { holdAfterPress: ['Alt', 'Shift'] });
  await kit.waitFor('line-compass');
  await kit.click(`compass-${point}`);
  await kit.settle({ renders: false });
}

export default async (page, kit) => {
  await kit.seek(4);
  await addTransform(page, kit);
  await kit.seek(4.5);
  await dropOn(kit, 'line-end-end', 'c', 'DL');
  await kit.seek(7);
  await addTransform(page, kit);
  await kit.seek(7.5);
  await dropOn(kit, 'line-end-start', 'b', 'LEFT');
};
