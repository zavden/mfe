/* The steps of the tutorial tutorials/annotated-identity, done in the app on its starting project
 * (docs/web/examples/annotated-identity-start.mfe.json: the formula `identity`, a² − b² =
 * (a − b)(a + b) at 96 pt, written in over 1.8 s). The capture file of the tutorial uses them to
 * reach each picture, and tutorials/_annotated-identity.steps.mjs to derive the project the
 * tutorial ends with (`examples.mjs derive`), so that the page's steps and its result are the same
 * thing. Every helper takes (kit, page, …) and runs at once (nothing is recording).
 *
 * The glyphs of the identity are a(0) 2(1) −(2) b(3) 2(4) =(5) ((6) a(7) −(8) b(9) )(10) ((11)
 * a(12) +(13) b(14) )(15); the code finds the equals sign by its label, so the numbers are not
 * written here. */

/** The glyph numbers of the two sides of the equals sign: the first and the last of each. */
export async function sides(kit) {
  return kit.mfe((mfe) => {
    const formula = mfe.useProjectStore.getState().project.formulas.find((f) => f.name === 'identity');
    const labels = formula.snapshot.glyphs.map((g) => g.label);
    const eq = labels.indexOf('=');
    return { eq, left: [0, eq - 1], right: [eq + 1, labels.length - 1] };
  });
}

/** Pick a range of glyphs with Alt: Alt+click the first, Alt+Shift+click the last. */
export async function pickRange(kit, [first, last]) {
  await kit.click(await kit.glyphPoint('identity', first), { hold: ['Alt'] });
  await kit.click(await kit.glyphPoint('identity', last), { hold: ['Alt', 'Shift'] });
}

/** Where a click means the brace `name`: the place its clip holds. */
export async function objectPoint(kit, name) {
  const [x, y] = await kit.mfe((mfe, wanted) => {
    const { project } = mfe.useProjectStore.getState();
    const formula = project.formulas.find((f) => f.name === wanted);
    return project.clips.find((c) => c.formulaId === formula.id).initial.position;
  }, name);
  return kit.scenePoint([x, y]);
}

/** Pick one side and put a brace under it, from the bar's Brace ▾. */
export async function braceUnder(kit, page, side) {
  await pickRange(kit, (await sides(kit))[side]);
  await kit.click('glyph-pick-brace');
  kit.menu = page.locator('[role="menu"][aria-label="Add brace"]').first();
  await kit.choose('Below');
  await kit.settle({ renders: false });
}

/** Right-click the brace `name`, Colour ▸ the swatch of the Manim colour `colour` ('BLUE'). */
export async function colourBrace(kit, name, colour) {
  await kit.contextMenu(await objectPoint(kit, name));
  await kit.openSubmenu('Colour');
  await kit.click(`preview-menu-color-${colour}`);
  await kit.settle({ renders: false });
}

/** Right-click the brace `name`, Intro ▸ GrowFromCenter. */
export async function growBrace(kit, name) {
  await kit.contextMenu(await objectPoint(kit, name));
  await kit.choose('Intro ▸ GrowFromCenter');
  await kit.settle({ renders: false });
}

/** Right-click the brace `name`, Add label ▸ Formula, `latex` typed in the raw LaTeX box, Apply, and
 * the editor closed. `done: false` leaves the editor open, with the text applied. */
export async function labelBrace(kit, name, latex, { done = true } = {}) {
  await kit.contextMenu(await objectPoint(kit, name));
  await kit.choose('Add label ▸ Formula');
  await kit.waitFor('raw-latex');
  await kit.click('raw-latex');
  await kit.type(latex);
  await kit.click('editor-apply');
  await kit.settle();
  if (done) {
    await kit.click('editor-close');
    await kit.waitFor('formula-editor', { state: 'detached' });
  }
}

/** The arrow's first half: the left side picked, right-click the equals sign, Add line ▸ Arrow and
 * the top edge for the start. The compass for the end is not yet asked. */
export async function arrowFromLeft(kit) {
  const { eq, left } = await sides(kit);
  await pickRange(kit, left);
  await kit.contextMenu(await kit.glyphPoint('identity', eq));
  await kit.choose('Add line ▸ Arrow');
  // The right-click selected the clip, and the hint about the transform handles then lies over the
  // hint of the mode: nothing selected, the hint of the mode is whole.
  await kit.clearSelection();
  await kit.click('compass-UP');
}

/** The whole arrow: from the left side (above) to the right side — an Alt drag over its ten
 * glyphs — and the top edge for the end. */
export async function drawArrow(kit) {
  await arrowFromLeft(kit);
  const { right } = await sides(kit);
  await kit.drag(await kit.glyphPoint('identity', right[0]), await kit.glyphPoint('identity', right[1]), {
    hold: ['Alt'],
  });
  await kit.clearSelection();
  await kit.click('compass-UP');
  await kit.settle({ renders: false });
}

/** The arrow bent into an arc of `degrees`: Curve ▸ Arc in its menu, then the Arc field of the Line
 * section (the Timing tab). */
export async function bendArrow(kit, page, degrees) {
  await kit.contextMenu(await kit.formulaPoint('l1'));
  await kit.choose('Curve ▸ Arc');
  await page.getByRole('tab', { name: 'Timing' }).click();
  await page.getByTestId('line-arc').fill(String(degrees));
  await page.getByTestId('line-arc').press('Enter');
  await kit.settle({ renders: false });
}

/** The arrow's intro, in the Intro section of the Animations panel: `grow_arrow`, `seconds` long. */
export async function growArrow(kit, page, seconds) {
  await page.getByRole('tab', { name: 'Timing' }).click();
  await page.getByTestId('intro-kind').selectOption('grow_arrow');
  await page.getByTestId('intro-duration').fill(String(seconds));
  await page.getByTestId('intro-duration').press('Enter');
  await kit.settle({ renders: false });
}
