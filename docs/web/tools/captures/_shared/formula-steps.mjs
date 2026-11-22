/* Shared by the capture files that perform a first animation in the real app (start/first-animation,
 * basics/first-transform, tutorials/linear-equation): the steps a reader does through the
 * interface only — the pointer, the keys, the menus — to write a formula, put its clip on a track,
 * give it an intro and relate two clips.
 *
 *   import { writeFormula, dropFormula, relateClips, suggestLinks } from '../_shared/formula-steps.mjs';
 *
 * Each step takes `(page, kit, …)` like a capture step. `currentProject(kit)` hands back the
 * project the app holds, which the scripts that make the pages' examples write to a file. */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- the Creator ------------------------------------------------------------------------

/** + New, and the formula editor ready for typing: its visual field loaded and focused. */
export async function openNewFormula(page, kit) {
  await kit.click('creator-new');
  await page.getByTestId('formula-editor').waitFor();
  await page.getByTestId('math-field').waitFor();
  await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD');
}

/** The Size row of the editor: the scale (1 = Manim's 48 pt). */
export async function setScale(page, kit, scale) {
  await kit.click('editor-scale');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(String(scale));
  await page.keyboard.press('Enter');
}

/** Apply, and wait until the editor has taken the draft (its button is off again). */
export async function applyFormula(page, kit) {
  await kit.click('editor-apply');
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-apply"]')?.disabled);
}

export async function closeEditor(page, kit) {
  await kit.click('editor-close');
  await page.getByTestId('formula-editor').waitFor({ state: 'detached' });
  await kit.waitForRenders();
}

/** A whole formula, as a reader writes it: + New, the LaTeX typed into the visual field, a size,
 * Apply, Close. */
export async function writeFormula(page, kit, latex, { scale = 2 } = {}) {
  await openNewFormula(page, kit);
  await kit.type(latex);
  if (scale !== 1) await setScale(page, kit, scale);
  await applyFormula(page, kit);
  await closeEditor(page, kit);
}

// ---- the timeline -----------------------------------------------------------------------

/** Drags the card of formula `name` from the Creator onto the lane of `track`, at `time` s. */
export async function dropFormula(kit, name, track, time, options = {}) {
  const card = kit.page.locator(`[data-testid="formula-item"][data-name="${name}"]`);
  // A long list scrolls: the card has to be in view for the pointer to take it.
  await card.scrollIntoViewIfNeeded();
  const to = { x: await kit.timeToX(time), y: (await kit.point({ track })).y };
  await kit.drag(card, to, options);
}

/** Selects the clip of formula `name` with a click, and opens the Timing tab of the Animations
 * panel, where the intro is. */
export async function openTiming(page, kit, name) {
  await kit.click({ clip: name });
  await kit.click('animations-tab-timing');
  await page.getByTestId('intro-section').waitFor();
}

/** The intro of the selected clip, from the Animation field of its Intro section. */
export async function chooseIntro(page, kit, kind) {
  await kit.hover('intro-kind');
  await page.getByTestId('intro-kind').selectOption(kind);
  await sleep(kit.recording ? 400 : 30);
}

/** Relates `from` to `to`: Shift shows the link ports, a click on the port of the source clip,
 * then a click on the target clip; the relation editor opens. */
export async function relateClips(page, kit, from, to) {
  const source = await kit.clipId(from);
  await kit.down('Shift');
  await kit.click(`clip-${source}-link`);
  await kit.up('Shift');
  await kit.click({ clip: to });
  await page.getByTestId('relation-editor').waitFor();
  await page.getByTestId('rel-from-glyph-0').waitFor();
}

/** Suggest links by label, then Accept all. */
export async function suggestLinks(page, kit) {
  await kit.click('rel-auto-link');
  await page.getByTestId('rel-suggestion').waitFor();
  await kit.pause(kit.recording ? 900 : 0);
  await kit.click('rel-suggestion-accept');
  await kit.pause(kit.recording ? 600 : 0);
}

/** The Animation tab of the relation editor: how the glyphs no pair takes leave and arrive. */
export async function setUnpaired(page, kit, { outro, intro }) {
  await kit.click('rel-side-tab-animation');
  await page.getByTestId('rel-unpaired-out').waitFor();
  await kit.hover('rel-outro-kind');
  await page.getByTestId('rel-outro-kind').selectOption(outro);
  await kit.hover('rel-intro-kind');
  await page.getByTestId('rel-intro-kind').selectOption(intro);
  await kit.pause(kit.recording ? 500 : 0);
}

export async function saveRelation(page, kit) {
  await kit.click('rel-save');
  await page.getByTestId('relation-editor').waitFor({ state: 'detached' });
}

/** The project as the app holds it now (a plain copy). */
export function currentProject(kit) {
  return kit.mfe((mfe) => JSON.parse(JSON.stringify(mfe.useProjectStore.getState().project)));
}
