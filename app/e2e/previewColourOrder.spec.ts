import { expect, test, type Page } from './test';
import { waitForDrawables } from './creatorHelpers';
import {
  canUndo,
  getProject,
  openWithProject,
  projectFile,
  selectionOf,
  setTime,
  undo,
  type MfeWindow,
} from './helpers';
import { clickScene, scenePoint, type Point } from './previewHelpers';
import { clipJson } from './timelineHelpers';
import { selectClips } from './uxHelpers';

/* Colours in order (D129): Shift+C, then a click on each glyph whose colour to copy, in order;
 * Enter, then a click on each glyph that takes the next colour — whatever symbol it is. The case
 * it was asked for: the b, the 2 and the a of «b over 2a» onto the b, the 4 and the a of «b² over
 * 4a²», which a colour sequence cannot do (a 2 is not a 4). The step is read from the frame's
 * `data-colour-order`, the glyphs it frames from `data-colour-order-marked`; the list, from the
 * strip at the top of the Animations panel, a chip per colour. */

const TEAL = '#58C4DD';
const YELLOW = '#FFFF00';
const RED = '#FC6255';
const GREEN = '#83C167';

const frame = (page: Page) => page.getByTestId('preview-frame');
const hint = (page: Page) => page.getByTestId('colour-order-hint');
const strip = (page: Page) => page.getByTestId('colour-order-strip');

/** The chips of the strip, left to right: the number, the symbol and the colour of each, and
 * which one is marked as the next to paste. */
async function chips(page: Page) {
  return strip(page)
    .locator('.an-order-chip')
    .evaluateAll((items) =>
      items.map((item) => ({
        number: item.querySelector('.an-order-number')!.textContent,
        label: item.querySelector('.an-order-glyph')!.textContent!.normalize('NFKC'),
        color: item.getAttribute('data-color'),
        next: item.classList.contains('is-next'),
      })),
    );
}

interface FormulaNow {
  id: string;
  glyphColors: Record<string, string>;
  snapshot: { glyphs: { label: string; center: [number, number] }[] } | null;
}

const formulaOf = async (page: Page, id: string): Promise<FormulaNow> =>
  ((await getProject(page)).formulas as unknown as FormulaNow[]).find((f) => f.id === id)!;

/** The index of the glyph of formula `id` that is the symbol `label` (its first one). */
async function glyphOf(page: Page, id: string, label: string): Promise<number> {
  const labels = (await formulaOf(page, id)).snapshot!.glyphs.map((g) => g.label.normalize('NFKC'));
  const index = labels.indexOf(label);
  if (index < 0) throw new Error(`no glyph ${label} in ${id}: ${labels.join(' ')}`);
  return index;
}

/** Scene point of the centre of glyph `index` of clip `clipId` (the clip unscaled, unturned). */
async function glyphAt(page: Page, clipId: string, index: number): Promise<Point> {
  return page.evaluate(
    ([clip, glyph]) => {
      const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
        formulas: { id: string; snapshot: { glyphs: { center: [number, number] }[] } | null }[];
        clips: { id: string; formulaId: string; initial: { position: [number, number] } }[];
      };
      const c = p.clips.find((x) => x.id === clip)!;
      const g = p.formulas.find((f) => f.id === c.formulaId)!.snapshot!.glyphs[glyph]!;
      return [c.initial.position[0] + g.center[0], c.initial.position[1] + g.center[1]] as Point;
    },
    [clipId, index] as const,
  );
}

/** Click the glyph of clip `clipId` that is the symbol `label`. */
async function clickGlyph(page: Page, clipId: string, formulaId: string, label: string) {
  await clickScene(page, await glyphAt(page, clipId, await glyphOf(page, formulaId, label)));
}

/** «b over 2a» on the left, its four glyphs each in a colour of its own, and «b² over 4a²» on
 * the right, in the object's white; playhead at 2 s, both written by then. Nothing to undo. */
async function openFractions(page: Page): Promise<Record<'b' | '2' | 'a', string>> {
  const ca = clipJson('ca', 'fa', 't1', 0, 6);
  ca.initial.position = [-3, 0];
  const cb = clipJson('cb', 'fb', 't2', 0, 6);
  cb.initial.position = [3, 0];
  const file = JSON.parse(
    projectFile(
      'colours in order',
      [
        { id: 'fa', name: 'half', source: '\\frac{b}{2a}', color: TEAL },
        { id: 'fb', name: 'square', source: '\\frac{b^2}{4a^2}', color: GREEN },
      ],
      [ca, cb],
    ),
  ) as { formulas: { glyphColors: Record<string, string> }[] };
  const own = [TEAL, YELLOW, RED, GREEN];
  file.formulas[0]!.glyphColors = Object.fromEntries(own.map((color, i) => [String(i), color]));
  await openWithProject(page, JSON.stringify(file));
  await setTime(page, 2);
  await waitForDrawables(page, 10); // b ─ 2 a, and b 2 ─ 4 a 2
  expect(await canUndo(page)).toBe(false);
  // Which of its colours each symbol of the first fraction has: the glyph order is the render's.
  return {
    b: own[await glyphOf(page, 'fa', 'b')]!,
    '2': own[await glyphOf(page, 'fa', '2')]!,
    a: own[await glyphOf(page, 'fa', 'a')]!,
  };
}

/** The own colours of «b² over 4a²», by symbol. */
async function squareColours(page: Page): Promise<Record<string, string | undefined>> {
  const { glyphColors } = await formulaOf(page, 'fb');
  const at = async (label: string) => glyphColors[String(await glyphOf(page, 'fb', label))];
  return { b: await at('b'), '4': await at('4'), a: await at('a') };
}

test.describe('Preview: colours in order', () => {
  test('copies b, 2, a click by click and pastes them onto b, 4, a, as one undo step', async ({
    page,
  }) => {
    const colour = await openFractions(page);
    await page.keyboard.press('Shift+C');
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'copy');
    await expect(hint(page)).toContainText('click the glyphs to copy, one by one, in order');
    for (const [count, label] of [
      [1, 'b'],
      [2, '2'],
      [3, 'a'],
    ] as const) {
      await clickGlyph(page, 'ca', 'fa', label);
      await expect(frame(page)).toHaveAttribute('data-colour-order-marked', String(count));
    }
    await expect(hint(page)).toContainText('3 colours copied');
    // The strip of the Animations panel lists them left to right, in the order of the clicks.
    await expect(page.getByTestId('colour-order-step')).toHaveText('Copying · 3');
    expect(await chips(page)).toEqual([
      { number: '1', label: 'b', color: colour.b, next: false },
      { number: '2', label: '2', color: colour['2'], next: false },
      { number: '3', label: 'a', color: colour.a, next: false },
    ]);
    // The clicks copy: nothing is selected by them, and nothing is written.
    expect((await selectionOf(page)).kind).toBe('none');
    expect(await canUndo(page)).toBe(false);

    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'paste');
    await expect(frame(page)).toHaveAttribute('data-colour-order-marked', '0');
    await expect(hint(page)).toContainText('takes colour 1 of 3, the one of “b”');
    expect((await chips(page)).map((chip) => [chip.number, chip.next])).toEqual([
      ['1', true],
      ['2', false],
      ['3', false],
    ]);
    await clickGlyph(page, 'cb', 'fb', 'b');
    await expect(hint(page)).toContainText('takes colour 2 of 3, the one of “2”');
    await expect(frame(page)).toHaveAttribute('data-colour-order-marked', '1');
    // The pasted colour has left the strip, and the next one is marked.
    await expect(page.getByTestId('colour-order-step')).toHaveText('Pasting · 1 of 3');
    expect(await chips(page)).toEqual([
      { number: '2', label: '2', color: colour['2'], next: true },
      { number: '3', label: 'a', color: colour.a, next: false },
    ]);
    expect(await squareColours(page)).toEqual({ b: colour.b, '4': undefined, a: undefined });
    // The 2 of the first fraction goes to the 4 of the second: the symbols need not agree.
    await clickGlyph(page, 'cb', 'fb', '4');
    await clickGlyph(page, 'cb', 'fb', 'a');
    // The last colour ends the mode.
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    await expect(hint(page)).toHaveCount(0);
    await expect(strip(page)).toHaveCount(0);
    expect(await squareColours(page)).toEqual({ b: colour.b, '4': colour['2'], a: colour.a });

    // One undo takes the whole paste back, and leaves nothing else to undo.
    await undo(page);
    expect((await formulaOf(page, 'fb')).glyphColors).toEqual({});
    expect(await canUndo(page)).toBe(false);
    await page.evaluate(() => (window as MfeWindow).__mfe!.history.redo());
    expect(await squareColours(page)).toEqual({ b: colour.b, '4': colour['2'], a: colour.a });
  });

  test('Backspace takes the last click back in both steps, and deletes nothing', async ({
    page,
  }) => {
    const colour = await openFractions(page);
    // A clip is selected: outside the mode, Backspace would delete it.
    await selectClips(page, ['cb']);
    await page.keyboard.press('Shift+C');
    await clickGlyph(page, 'ca', 'fa', 'a');
    await clickGlyph(page, 'ca', 'fa', 'b');
    await expect(frame(page)).toHaveAttribute('data-colour-order-marked', '2');
    await page.keyboard.press('Backspace');
    await expect(frame(page)).toHaveAttribute('data-colour-order-marked', '1');
    expect((await getProject(page)).clips.map((c) => c.id)).toEqual(['ca', 'cb']);
    await clickGlyph(page, 'ca', 'fa', '2');
    await page.keyboard.press('Enter');

    // a, then 2: the a's colour on the b of the other fraction, taken back and put on its 4.
    await clickGlyph(page, 'cb', 'fb', 'b');
    expect(await squareColours(page)).toEqual({ b: colour.a, '4': undefined, a: undefined });
    await page.keyboard.press('Backspace');
    await expect(hint(page)).toContainText('takes colour 1 of 2, the one of “a”');
    // The only pasted colour taken back: the paste left no step at all.
    expect((await formulaOf(page, 'fb')).glyphColors).toEqual({});
    expect(await canUndo(page)).toBe(false);
    await clickGlyph(page, 'cb', 'fb', '4');
    await clickGlyph(page, 'cb', 'fb', 'a');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    expect(await squareColours(page)).toEqual({ b: undefined, '4': colour.a, a: colour['2'] });
    expect((await getProject(page)).clips.map((c) => c.id)).toEqual(['ca', 'cb']);
  });

  test('Escape keeps what was pasted, and Shift+V pastes the kept list again from its first colour', async ({
    page,
  }) => {
    const colour = await openFractions(page);
    // Nothing copied yet: Shift+V says how a list is copied.
    await page.keyboard.press('Shift+V');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    await expect(page.getByText('No colours copied in order yet')).toBeVisible();

    await page.keyboard.press('Shift+C');
    await clickGlyph(page, 'ca', 'fa', '2');
    await clickGlyph(page, 'ca', 'fa', 'a');
    await page.keyboard.press('Enter');
    await clickGlyph(page, 'cb', 'fb', 'b');
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    expect(await squareColours(page)).toEqual({ b: colour['2'], '4': undefined, a: undefined });

    await page.keyboard.press('Shift+V');
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'paste');
    await expect(hint(page)).toContainText('takes colour 1 of 2, the one of “2”');
    await clickGlyph(page, 'cb', 'fb', '4');
    await clickGlyph(page, 'cb', 'fb', 'a');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    expect(await squareColours(page)).toEqual({ b: colour['2'], '4': colour['2'], a: colour.a });
    // Escape in the copy step leaves with nothing: the kept list is still the one of before.
    await page.keyboard.press('Shift+C');
    await clickGlyph(page, 'ca', 'fa', 'b');
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    await page.keyboard.press('Shift+V');
    await expect(hint(page)).toContainText('takes colour 1 of 2, the one of “2”');
  });

  test('only clicks answer: no Alt pick, no drag, and another mode of the preview ends it', async ({
    page,
  }) => {
    await openFractions(page);
    await page.keyboard.press('Shift+C');
    const b = await glyphAt(page, 'ca', await glyphOf(page, 'fa', 'b'));
    // Alt+click picks no glyph, and copies none.
    await clickScene(page, b, 'Alt');
    await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
    await expect(frame(page)).toHaveAttribute('data-colour-order-marked', '0');
    // A press and a drag copy the glyph pressed on, and move nothing.
    const from = await scenePoint(page, b);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y + 40, { steps: 5 });
    await page.mouse.up();
    await expect(frame(page)).toHaveAttribute('data-colour-order-marked', '1');
    const [ca] = (await getProject(page)).clips as unknown as {
      initial: { position: [number, number] };
    }[];
    expect(ca!.initial.position).toEqual([-3, 0]);
    expect(await canUndo(page)).toBe(false);
    // A click on nothing is ignored.
    await clickScene(page, [0, 3]);
    await expect(frame(page)).toHaveAttribute('data-colour-order-marked', '1');
    // Shift+C again leaves the mode; align by symbol ends it too.
    await page.keyboard.press('Shift+C');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    await page.keyboard.press('Shift+C');
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'copy');
    await page.keyboard.press('Alt+G');
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
  });

  test('the menus start it, the strip has its buttons, and a folded Animations panel opens', async ({
    page,
  }) => {
    const colour = await openFractions(page);
    // Nothing copied yet: Paste is off in Edit ▸ Colours in order.
    const editEntry = async (id: 'copy' | 'paste') => {
      await page.getByTestId('menu-edit').click();
      await page.getByTestId('menu-item-edit-colours-order').hover();
      return page.getByTestId(`menu-item-edit-colours-order-${id}`);
    };
    await expect(await editEntry('paste')).toBeDisabled();
    // The panel is folded: «Copy colours in order…» opens it, the strip is there.
    await page.keyboard.press('Escape');
    await page.getByTestId('panel-fold-animations').click();
    await expect(page.getByTestId('panel-animations')).toHaveAttribute('data-folded', 'true');
    await (await editEntry('copy')).click();
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'copy');
    await expect(strip(page)).toBeVisible();
    await expect(page.getByTestId('colour-order-empty')).toBeVisible();
    // Nothing to paste yet: the strip's Paste is off.
    await expect(page.getByTestId('colour-order-paste')).toBeDisabled();
    await clickGlyph(page, 'ca', 'fa', 'a');
    await clickGlyph(page, 'ca', 'fa', 'b');
    // Its Paste… does what Enter does — also pressed with Enter, from the keyboard.
    await page.getByTestId('colour-order-paste').focus();
    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'paste');
    await expect(page.getByTestId('colour-order-step')).toHaveText('Pasting · 0 of 2');
    await clickGlyph(page, 'cb', 'fb', '4');
    // Done ends the paste and keeps what it pasted.
    await page.getByTestId('colour-order-done').click();
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    expect(await squareColours(page)).toEqual({ b: undefined, '4': colour.a, a: undefined });

    // The list is kept: the menu of a clip in the preview pastes it again, and says how many.
    const b = await scenePoint(page, await glyphAt(page, 'cb', await glyphOf(page, 'fb', 'b')));
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await expect(page.getByTestId('preview-menu-paste-colours-order')).toHaveText(
      'Paste colours in order (2)',
    );
    await page.getByTestId('preview-menu-paste-colours-order').click();
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'paste');
    await clickGlyph(page, 'cb', 'fb', 'b');
    // Cancel in a copy leaves the kept list as it was.
    await page.keyboard.press('Escape');
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await page.getByTestId('preview-menu-copy-colours-order').click();
    await expect(frame(page)).toHaveAttribute('data-colour-order', 'copy');
    await page.getByTestId('colour-order-cancel').click();
    await expect(frame(page)).toHaveAttribute('data-colour-order', '');
    await expect(await editEntry('paste')).toContainText('Paste (2)');
    expect(await squareColours(page)).toEqual({ b: colour.a, '4': colour.a, a: undefined });
  });
});
