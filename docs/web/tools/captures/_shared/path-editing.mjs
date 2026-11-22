/* Helpers for the Edit-path mode of the Preview, shared by the capture file of
 * transforms/custom-paths and by the steps files that make the examples custom-paths-swap and
 * custom-paths-compare (`examples.mjs derive`): they open the mode on a pair of a relation, read
 * where the curve's anchors and handles are on screen, and shape the curve with the gestures the
 * page teaches.
 *
 * The mode is on when the Preview's frame carries `data-path-edit`; `data-path-nodes` then holds the
 * curve's nodes (`{ at, in, out, smooth }`, each point `[x, y]` in the canvas's CSS pixels). */

/** The curve's nodes as page coordinates: the anchors and handles on screen. */
export async function pathNodes(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-testid="preview-frame"]');
    const canvas = document.querySelector('[data-testid="preview-canvas"]').getBoundingClientRect();
    const nodes = JSON.parse(frame.getAttribute('data-path-nodes') || '[]');
    const at = (p) => (p ? { x: canvas.x + p[0], y: canvas.y + p[1] } : null);
    return nodes.map((n) => ({ at: at(n.at), in: at(n.in), out: at(n.out), smooth: n.smooth }));
  });
}

/** Waits for the Edit-path mode to be on, and for its curve to be drawn. */
export async function modeOn(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="preview-frame"]')?.getAttribute('data-path-edit') &&
      document.querySelector('[data-testid="preview-frame"]')?.getAttribute('data-path-nodes'),
  );
}

/** Enters the mode on pair `index` of the relation `relationId`, as the page says: the
 * Relations list's «Edit path…» of the clip selected, then the pair in the picker when the
 * relation has several. */
export async function enterPathMode(page, kit, relationId, index = 0) {
  await kit.click(`relation-edit-path-${relationId}`);
  if ((await page.getByTestId('path-picker').count()) > 0) {
    await kit.click(`path-picker-pair-${index}`);
  }
  await modeOn(page);
  await kit.settle({ renders: false });
}

/** Enters the mode on pair `index` from the panel of the relation, which is what the Animations
 * panel shows once a mode has been left (its list of Pairs has an «Edit path…» on every row). */
export async function enterPathModeFromRelation(page, kit, index) {
  await kit.click(`relation-pair-${index}-edit-path`);
  await modeOn(page);
  await kit.settle({ renders: false });
}

/** The point of the straight curve half way between its two ends, in page coordinates. */
export async function chordMiddle(page) {
  const [first, last] = await pathNodes(page);
  return { x: (first.at.x + last.at.x) / 2, y: (first.at.y + last.at.y) / 2 };
}

/** A press on the curve half way adds an anchor there; the drag takes it `lift` px up (down when
 * negative). Returns where the anchor is. */
export async function addAnchor(page, kit, lift) {
  const middle = await chordMiddle(page);
  if (lift === 0) await kit.click(middle);
  else await kit.drag(middle, { x: middle.x, y: middle.y - lift });
  await kit.pause(200);
  return (await pathNodes(page))[1].at;
}

/** A double-click on the middle anchor makes it smooth: it has two handles now. */
export async function smoothAnchor(page, kit) {
  await kit.doubleClick((await pathNodes(page))[1].at);
  await kit.pause(300);
}

/** The anchor's outgoing handle dragged by (`dx`, `dy`) px; the other handle turns with it. */
export async function dragOutHandle(page, kit, dx, dy) {
  const out = (await pathNodes(page))[1].out;
  await kit.drag(out, { x: out.x + dx, y: out.y + dy });
  await kit.pause(300);
}

/** The anchor's incoming handle dragged by (`dx`, `dy`) px; the other handle turns with it. */
export async function dragInHandle(page, kit, dx, dy) {
  const into = (await pathNodes(page))[1].in;
  await kit.drag(into, { x: into.x + dx, y: into.y + dy });
  await kit.pause(300);
}
