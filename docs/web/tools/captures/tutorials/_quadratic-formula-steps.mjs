/* The steps that make examples/quadratic-formula.mfe.json out of examples/quadratic-formula-start:
 * the six relations of the tutorial, made in the relation editor with the gestures its steps
 * describe, and the Match colors list «Terms», applied to the seven formulas.
 *
 *   node docs/web/tools/examples.mjs derive quadratic-formula-start quadratic-formula \
 *     --steps docs/web/tools/captures/tutorials/_quadratic-formula-steps.mjs --force \
 *     --title 'Deriving the quadratic formula' \
 *     --description 'The quadratic formula derived by completing the square: ...'
 *
 * The page's steps and this file say the same thing: a glyph that Suggest links by label would
 * pair wrongly is linked by hand first, then Suggest links by label and Accept all do the rest.
 * After each relation the pairs the editor holds are compared with `EXPECTED` — the pairs the
 * page quotes by glyph number — and a difference stops the run, with both lists: the page then
 * says something the app does not do. (Set MFE_STEPS_ALLOW_DIFF=1 to write the project anyway and
 * look at what the app made.)
 *
 * A file starting with `_` is no page: the capture tool does not run it. */

export const viewport = { width: 1440, height: 1000 };

const EDITOR_STORE = '/src/ui/relations/relationEditorStore.ts';

/** The pairs each relation ends with, as `from>to` strings (the order is the editor's). */
const EXPECTED = {
  1: ['0>4,9', '1>0', '2>1', '3>2', '4>3', '5>6', '6>7', '7>8', '8>11', '9>12'],
  2: [
    '0>0', '1>1', '2>2', '3>3', '4>4', '5>5', '6>6', '11>7', '8>9', '9>10', '10>11', '7>8',
  ],
  3: [
    '10>17', '11>18', '0>0', '1>1', '2>2', '3>3', '4>4', '5>5', '6>6', '7>14', '8>15', '9>16',
  ],
  4: [
    '20,21,22,23,24,25>10,11,16,17,18,19', '1>8', '0>1', '2>2', '3>3', '9>4', '4>5', '5>6',
    '14>9', '15>12', '10>13', '11>14', '16>15',
  ],
  5: [
    '11>9', '13>11', '16>16', '1>0', '2>1', '3>2', '4>3', '5>4', '6>5', '9>6', '10>8', '12>10',
    '14>12', '15>13', '17>17', '19>18',
  ],
  6: [
    '3,16>13', '4,17>14', '5,18>15', '1>2', '0>0', '6>1', '2>3', '7>4', '8>5', '9>6', '10>7',
    '11>8', '12>9', '13>10', '14>11', '15>12',
  ],
};

const differences = [];

/** The pairs of the open editor as `from>to` strings, in the order of its list. */
const editorPairs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="rel-pair-"][data-from]')].map(
      (row) => `${row.getAttribute('data-from')}>${row.getAttribute('data-to')}`,
    ),
  );

/** Notes a difference between the pairs the editor holds and what the page says (order aside). */
async function compare(page, number) {
  const made = await editorPairs(page);
  const wanted = EXPECTED[number];
  const missing = wanted.filter((pair) => !made.includes(pair));
  const extra = made.filter((pair) => !wanted.includes(pair));
  const summary = await page.getByTestId('rel-summary').textContent();
  console.log(`relation ${number}: ${made.length} pairs: ${made.join(' ')}`);
  console.log(`  summary: ${summary}`);
  // The glyphs that no pair takes or brings, as the Animation tab lists them.
  await page.getByTestId('rel-side-tab-animation').click();
  for (const id of ['rel-unpaired-out', 'rel-unpaired-in']) {
    const text = await page.getByTestId(id).locator('.rel-hint').textContent();
    console.log(`  ${id}: ${text}`);
  }
  if (missing.length > 0 || extra.length > 0) {
    differences.push(
      `relation ${number}: the app made ${made.join(' ')}; the page says ${wanted.join(' ')}; ` +
        `missing ${missing.join(' ') || '-'}, extra ${extra.join(' ') || '-'}`,
    );
  }
}

/** Opens the relation editor on a new relation from clip `number` to the next one, as the
 * «Create relation…» button of the Relations tab does. */
const openNew = (number) => async (page, kit) => {
  await kit.app(
    EDITOR_STORE,
    (module, ids) =>
      module.openRelationEditor({ kind: 'create', fromClipId: ids.from, toClipId: ids.to }),
    { from: `c_${number}`, to: `c_${number + 1}` },
  );
  await page.getByTestId('relation-editor').waitFor();
  await kit.settle();
};

/** A drag of a box over the glyphs `indices` of one side of the editor, from its lower right corner
 * to its upper left: the keys of the drawing's view are over its upper right corner, where the
 * source's last term is, and a press there would be theirs. */
async function boxOver(kit, side, indices, { hold = [], pad = 5 } = {}) {
  const boxes = [];
  for (const index of indices) boxes.push(await kit.box(`rel-${side}-glyph-${index}`));
  const left = Math.min(...boxes.map((b) => b.x)) - pad;
  const top = Math.min(...boxes.map((b) => b.y)) - pad;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  await kit.drag({ x: right, y: bottom }, { x: left, y: top }, { hold });
}

/** What Suggest links by label proposes while the relation has no pair: logged, then dismissed
 * (the page says which glyphs it would pair wrongly, and so are linked by hand first). */
async function suggestAlone(page, kit, number) {
  await kit.click('rel-auto-link');
  const bar = page.getByTestId('rel-suggestion');
  const text =
    (await bar.count()) > 0
      ? await bar.locator('span').first().textContent()
      : '(nothing suggested)';
  console.log(`relation ${number}: Suggest alone: ${text}`);
  if ((await bar.count()) > 0) await kit.click('rel-suggestion-dismiss');
}

/** The glyphs selected on both sides of the open editor, as `from:3 to:9`. */
const selectedGlyphs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-selected="true"][data-testid^="rel-"]')]
      .map((glyph) => glyph.getAttribute('data-testid').replace(/^rel-(from|to)-glyph-/, '$1:'))
      .join(' '),
  );

/** Shows the glyph lists under the toolbar (the key before the eye), if they are not there. */
async function showLists(page, kit) {
  if ((await page.getByTestId('rel-chips').count()) === 0) await kit.click('rel-toggle-list');
}

/** A press on the key of a glyph in the lists: like a click on the glyph, but never on another
 * one, whatever lies around it in the drawing. */
const chip = (side, index) => `rel-${side}-chip-${index}`;

/** Source glyph(s) then target glyph(s): the first selected, the others added with Shift, then
 * Link (or, with one target glyph and several sources, the click on the target that links). */
async function link(kit, sources, targets) {
  await kit.click(`rel-from-glyph-${sources[0]}`);
  for (const index of sources.slice(1)) {
    await kit.click(`rel-from-glyph-${index}`, { hold: ['Shift'] });
  }
  if (targets.length === 1) {
    await kit.click(`rel-to-glyph-${targets[0]}`);
    return;
  }
  for (const index of targets) await kit.click(`rel-to-glyph-${index}`, { hold: ['Shift'] });
  await kit.click('rel-link');
}

/** Suggest links by label, then Accept all. */
async function suggest(kit) {
  await kit.click('rel-auto-link');
  await kit.click('rel-suggestion-accept');
  await kit.settle({ renders: false });
}

/** The style of the pair `from>to` in the pair list. */
async function setPairStyle(page, kit, pair, label) {
  const made = await editorPairs(page);
  const index = made.indexOf(pair);
  if (index < 0) throw new Error(`no pair ${pair} in the list: ${made.join(' ')}`);
  await page.getByTestId(`rel-pair-${index}-style`).selectOption({ label });
  await kit.settle({ renders: false });
}

/** Types a number into a field of the Animation tab and commits it. */
async function setNumber(page, kit, testId, value) {
  const field = page.getByTestId(testId);
  await field.fill(String(value));
  await field.press('Enter');
  await kit.settle({ renders: false });
}

/** The Animation tab: the window, the path arc, what the glyphs that no pair takes (outro) and
 * that no pair brings (intro) do, each run along the relation window. */
async function animation(page, kit, { duration, arc, outro, intro }) {
  await kit.click('rel-side-tab-animation');
  await kit.settle({ renders: false });
  if (outro) {
    await page.getByTestId('rel-outro-kind').selectOption({ label: outro });
    await page.getByTestId('rel-match-outro').check();
  }
  if (intro) {
    await page.getByTestId('rel-intro-kind').selectOption({ label: intro });
    await page.getByTestId('rel-match-intro').check();
  }
  if (arc !== undefined) await setNumber(page, kit, 'rel-path-arc', arc);
  await setNumber(page, kit, 'rel-duration', duration);
}

async function save(page, kit, number) {
  await compare(page, number);
  await kit.click('rel-save');
  await page.getByTestId('relation-editor').waitFor({ state: 'detached' });
  await kit.settle();
}

export default [
  // 1 → 2, Divide by a: the a of ax² to both denominators first, then Suggest.
  async (page, kit) => {
    await openNew(1)(page, kit);
    await suggestAlone(page, kit, 1);
    await link(kit, [0], [4, 9]);
    await suggest(kit);
    await animation(page, kit, { duration: 1.4, intro: 'Write' });
    await save(page, kit, 1);
  },
  // 2 → 3, Move the constant term: Suggest, then the plus (glyph 7) to the minus (glyph 8) as a
  // Fade transform; a path arc of -60 degrees; the 0 leaves with a FadeOut.
  async (page, kit) => {
    await openNew(2)(page, kit);
    await suggestAlone(page, kit, 2);
    await suggest(kit);
    await link(kit, [7], [8]);
    await setPairStyle(page, kit, '7>8', 'Fade transform');
    await animation(page, kit, { duration: 1.6, arc: -60, outro: 'FadeOut' });
    await save(page, kit, 2);
  },
  // 3 → 4, Add the same term to both sides: the c/a on the right stays (its a and its bar are
  // linked first), then Suggest; the new terms are written.
  async (page, kit) => {
    await openNew(3)(page, kit);
    await suggestAlone(page, kit, 3);
    await link(kit, [10], [17]);
    await link(kit, [11], [18]);
    await suggest(kit);
    await animation(page, kit, { duration: 1.2, intro: 'Write' });
    await save(page, kit, 3);
  },
  // 4 → 5, Factor the left side, simplify the right: a pair of six glyphs (a box over them in the
  // source, the six of the target picked from the glyph lists by the numbers the page gives),
  // the exponent by hand, then Suggest.
  async (page, kit) => {
    await openNew(4)(page, kit);
    await suggestAlone(page, kit, 4);
    await showLists(page, kit);
    // A probe for the page: what a box over 4a² of the denominator takes (on 2026-11-20 the three
    // and the bar over them, 16 17 18 19), and then nothing selected.
    await boxOver(kit, 'to', [16, 17, 18]);
    console.log(`relation 4: a box over the glyphs 16 17 18 of the target selects: ${await selectedGlyphs(page)}`);
    await kit.click('rel-clear-selection');
    await boxOver(kit, 'from', [20, 21, 22, 23, 24, 25]);
    for (const index of [10, 11, 16, 17, 18, 19]) {
      await kit.click(chip('to', index), { hold: ['Shift'] });
    }
    await kit.click('rel-link');
    await link(kit, [1], [8]);
    await suggest(kit);
    await animation(page, kit, { duration: 2, outro: 'FadeOut', intro: 'Write' });
    await save(page, kit, 4);
  },
  // 5 → 6, Take the square root: three glyphs linked first (the last a Fade transform), Suggest.
  // The exponent under the root (glyph 9) is taken by a click: the drawing takes the smallest of
  // the glyphs whose boxes hold the pointer, not the line of the root over it.
  async (page, kit) => {
    await openNew(5)(page, kit);
    await suggestAlone(page, kit, 5);
    // A probe for the page: a click at the centre of glyph 9 (the exponent under the root).
    await kit.click('rel-to-glyph-9');
    console.log(`relation 5: a click on glyph 9 of the target selects: ${await selectedGlyphs(page)}`);
    await kit.click('rel-clear-selection');
    await link(kit, [11], [9]);
    await link(kit, [13], [11]);
    await link(kit, [16], [16]);
    await setPairStyle(page, kit, '16>16', 'Fade transform');
    await suggest(kit);
    await animation(page, kit, { duration: 1.6, outro: 'FadeOut', intro: 'Write' });
    await save(page, kit, 5);
  },
  // 6 → 7, Isolate x: two glyphs onto one, three times; the plus to the minus as a Fade
  // transform; Suggest.
  async (page, kit) => {
    await openNew(6)(page, kit);
    await suggestAlone(page, kit, 6);
    await link(kit, [3, 16], [13]);
    await link(kit, [4, 17], [14]);
    await link(kit, [5, 18], [15]);
    await link(kit, [1], [2]);
    await setPairStyle(page, kit, '1>2', 'Fade transform');
    await suggest(kit);
    await animation(page, kit, { duration: 1.6 });
    await save(page, kit, 6);
  },
  // Colours: Edit ▸ Match colors ▸ Create match colors…, the list «Terms» with three patterns.
  async (page, kit) => {
    await kit.choose('Edit ▸ Match colors ▸ Create match colors…');
    await page.getByTestId('match-colors').waitFor();
    await kit.settle({ renders: false });
    const name = page.getByTestId('match-colors-name');
    console.log(
      `match colors: a new list is called «${await name.inputValue()}» and opens with ` +
        `${await page.locator('[data-testid^="match-colors-pattern-"]').count()} pattern field(s)`,
    );
    await name.fill('Terms');
    await name.press('Enter');
    const colours = ['#F4C867', '#58C4DD', '#FC6255'];
    const patterns = ['a', 'b', 'c'];
    for (let i = 0; i < patterns.length; i += 1) {
      const have = await page.locator('[data-testid^="match-colors-pattern-"]').count();
      if (have <= i) {
        await kit.click('match-colors-add');
        console.log(`match colors: + Add pattern pressed for pattern ${i + 1}`);
      }
      const pattern = page.getByTestId(`match-colors-pattern-${i}`);
      await pattern.fill(patterns[i]);
      await pattern.press('Enter');
      const colour = page.getByTestId(`match-colors-color-${i}`);
      await colour.fill(colours[i]);
      await colour.press('Enter');
    }
    await kit.settle({ renders: false });
    await kit.click('match-colors-done');
    await page.getByTestId('match-colors').waitFor({ state: 'detached' });
  },
  // Apply the list to the seven formulas: Formulas in the menu of the key ∑ (Escape closes that
  // menu, which hangs over the first card), right-click a card, Apply match colors ▸ Terms.
  async (page, kit) => {
    await kit.click('creator-kinds');
    await kit.click('creator-select-all-math');
    await kit.press('Escape');
    await kit.contextMenu({ css: '[data-testid="formula-list"] [data-formula-id]' });
    await kit.openSubmenu('Apply match colors');
    await page.locator('[data-testid^="formula-menu-match-"]').first().click();
    await kit.waitForRenders();
    await kit.settle();
  },
  // The run ends here: what differed from the page stops it, unless it was asked to go on.
  async () => {
    if (differences.length > 0) {
      const message = `the app does not do what the page says:\n${differences.join('\n')}`;
      if (process.env.MFE_STEPS_ALLOW_DIFF === '1') console.log(message);
      else throw new Error(message);
    }
  },
];
