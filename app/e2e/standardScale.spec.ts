import { expect, test, type Page } from './test';
import { addFormulaViaUi, closeEditor, startApp } from './creatorHelpers';
import { getProject, openWithProject, projectFile, type MfeWindow } from './helpers';
import { clipJson } from './timelineHelpers';

/* The standard scale (R4, D75): Preferences → Standard scale… takes a scale for new formulas and
 * one for new texts (1 = font size 48). A new object is born at 48 × it; the objects that exist
 * keep their size. The formula editor shows the size as that scale beside the font size, the
 * two being one value. */

const scales = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.usePreferences.getState().standardScale);
const fontSizes = async (page: Page) =>
  (await getProject(page)).formulas.map((f) => (f as unknown as { fontSize: number }).fontSize);

test('Preferences → Standard scale… takes a scale for formulas and texts, remembered as typed', async ({
  page,
}) => {
  await startApp(page);
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-standard-scale').click();
  const dialog = page.getByTestId('standard-scale-dialog');
  await expect(dialog).toBeVisible();
  const math = page.getByTestId('standard-scale-math');
  await expect(math).toHaveValue('1');
  await expect(math).toBeFocused();
  await math.fill('abc');
  await expect(page.getByTestId('standard-scale-math-error')).toBeVisible();
  await expect(page.getByTestId('standard-scale-save')).toBeDisabled();
  await math.fill('1.5');
  await expect(page.getByTestId('standard-scale-math-size')).toHaveText('font_size 72');
  await page.getByTestId('standard-scale-tex').fill('1/2');
  await expect(page.getByTestId('standard-scale-tex-value')).toHaveText('= 0.5');
  await expect(page.getByTestId('standard-scale-tex-size')).toHaveText('font_size 24');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(await scales(page)).toEqual({ math: '1.5', tex: '1/2' });

  // Remembered, and shown in the menu.
  await page.reload();
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  expect(await scales(page)).toEqual({ math: '1.5', tex: '1/2' });
  await page.getByTestId('menu-preferences').click();
  await expect(page.getByTestId('menu-item-preferences-standard-scale')).toHaveText(
    'Standard scale (formulas 1.5, texts 1/2 = 0.5)…',
  );
  await page.keyboard.press('Escape');
});

test('new formulas and texts are born at 48 × their scale; the existing ones keep theirs; the editor shows the scale', async ({
  page,
}) => {
  await startApp(page);
  await addFormulaViaUi(page, 'x');
  await expect(page.getByTestId('editor-scale')).toHaveValue('1');
  await expect(page.getByTestId('editor-font-size')).toHaveValue('48');
  await closeEditor(page);
  await page.evaluate(() =>
    (window as MfeWindow)
      .__mfe!.usePreferences.getState()
      .set({ standardScale: { math: '1.5', tex: '1/2' } }),
  );
  // The existing formula keeps its 48; the new one is born at 72.
  await addFormulaViaUi(page, 'y');
  await expect(page.getByTestId('editor-scale')).toHaveValue('1.5');
  await expect(page.getByTestId('editor-font-size')).toHaveValue('72');
  await closeEditor(page);
  // A new text at 24.
  await page.getByTestId('creator-new-menu').click();
  await page.getByTestId('creator-new-tex').click();
  // A text is composed in its workspace, with the same two fields for its size.
  await expect(page.getByTestId('text-font-size')).toHaveValue('24');
  await expect(page.getByTestId('text-scale')).toHaveValue('0.5');
  await page.getByTestId('tex-source').fill('hello');
  await page.getByTestId('text-apply').click();
  await expect(page.getByTestId('text-composition')).toHaveCount(0);
  expect(await fontSizes(page)).toEqual([48, 72, 24]);

  // The Scale field edits the font size and the font size the scale: one value.
  await page.getByTestId('formula-item').nth(1).getByTestId('formula-edit').click();
  const scale = page.getByTestId('editor-scale');
  await scale.fill('2');
  await scale.press('Enter');
  await expect(page.getByTestId('editor-font-size')).toHaveValue('96');
  const size = page.getByTestId('editor-font-size');
  await size.fill('24');
  await size.press('Enter');
  await expect(scale).toHaveValue('0.5');
  // What is not a scale is said while typing, and Enter takes it back.
  await scale.fill('big');
  await expect(page.getByTestId('editor-scale-error')).toContainText('A number or a fraction from');
  await scale.press('Enter');
  await expect(scale).toHaveValue('0.5');
  await expect(page.getByTestId('editor-scale-error')).toHaveCount(0);
  await scale.fill('3/2');
  await scale.press('Enter');
  await expect(size).toHaveValue('72');
  await closeEditor(page);
  expect(await fontSizes(page)).toEqual([48, 72, 24]);

  // The Python carries it (an object is exported once it is on the timeline).
  for (const i of [1, 2]) {
    await page.getByTestId('formula-item').nth(i).click({ button: 'right' });
    await page.getByTestId('formula-menu-add-to-timeline').click();
  }
  await page.waitForFunction(
    () => (window as MfeWindow).__mfe!.useRenderStore.getState().resolved.size === 3,
  );
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText('font_size=72');
  await expect(page.getByTestId('export-python-code')).toContainText('font_size=24');
});

/** Formulas f1 (scale 1, its clip scaled ×2 by hand and by a Transform), f2 (scale 2, on the
 * timeline too) and f3 (1.5), and a LaTeX text t1 (1). */
function scalesProject(): string {
  const a = clipJson('a', 'fa', 't1', 0, 6, {
    actions: [
      { id: 'grow', kind: 'tween', start: 2, duration: 1, easing: 'smooth', to: { scale: 3 } },
    ],
  });
  a.initial.scale = 2;
  a.initial.position = [-3, 0];
  const b = clipJson('b', 'fb', 't2', 0, 6);
  b.initial.position = [3, 0];
  const file = JSON.parse(
    projectFile(
      'scales',
      [
        { id: 'fa', name: 'f1', source: 'a+b', color: '#83C167' },
        { id: 'fb', name: 'f2', source: 'x^2', color: '#58C4DD' },
        { id: 'fc', name: 'f3', source: 'y', color: '#FFFF00' },
      ],
      [a, b],
    ),
  ) as { formulas: Record<string, unknown>[] };
  file.formulas[1]!.fontSize = 96;
  file.formulas[2]!.fontSize = 72;
  file.formulas.push({
    id: 'ft',
    kind: 'tex',
    name: 't1',
    source: 'Hello',
    layout: { width: null, align: 'center', lineSpacing: 1 },
    tag: { color: '#FC6255', icon: null },
    fontSize: 48,
    color: '#FFFFFF',
    glyphColors: {},
    hiddenGlyphs: [],
    intro: null,
    snapshot: null,
  });
  return JSON.stringify(file);
}

/** The height of a formula as the Preview draws it at scale 1: its render's box, in scene units. */
const drawnHeight = (page: Page, id: string) =>
  page.evaluate((formulaId) => {
    const resolved = (window as MfeWindow).__mfe!.useRenderStore.getState().resolved as ReadonlyMap<
      string,
      { render: { bbox: { minY: number; maxY: number } } }
    >;
    const bbox = resolved.get(formulaId)?.render.bbox;
    return bbox ? bbox.maxY - bbox.minY : null;
  }, id);

test('«Apply to all formulas» gives every formula the scale typed, after saying how many change; one undo step', async ({
  page,
}) => {
  await openWithProject(page, scalesProject());
  await expect.poll(() => drawnHeight(page, 'fa')).not.toBeNull();
  const heightBefore = (await drawnHeight(page, 'fa'))!;
  const clipsBefore = (await getProject(page)).clips;
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-standard-scale').click();
  const dialog = page.getByTestId('standard-scale-dialog');
  const applyMath = page.getByTestId('standard-scale-math-apply');
  const applyTex = page.getByTestId('standard-scale-tex-apply');
  await expect(applyMath).toHaveText('Apply to all formulas');
  await expect(applyTex).toHaveText('Apply to all texts');
  // The text has the scale its field says already: nothing to apply, and the button says so.
  await expect(applyTex).toBeDisabled();
  await expect(applyTex).toHaveAttribute(
    'title',
    "The project's one LaTeX text has scale 1 already.",
  );
  // What is not a scale cannot be applied.
  const math = page.getByTestId('standard-scale-math');
  await math.fill('big');
  await expect(applyMath).toBeDisabled();
  await expect(applyMath).toHaveAttribute('title', /^Type a scale first/);
  await math.fill('3/2');
  await expect(applyMath).toBeEnabled();

  // It asks first, saying how many change; Cancel changes nothing.
  await applyMath.click();
  const question = page.getByTestId('dialog');
  await expect(question).toContainText('Apply scale 1.5 to every formula?');
  await expect(question).toContainText(
    '2 formulas change to scale 1.5 (font_size 72), the size a new one is born with; 1 has it already.',
  );
  await expect(page.getByTestId('dialog-details').getByRole('listitem')).toHaveText([
    'f1: 1 → 1.5',
    'f2: 2 → 1.5',
  ]);
  await page.getByTestId('dialog-cancel').click();
  await expect(question).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(await fontSizes(page)).toEqual([48, 96, 72, 48]);

  // Confirmed: every formula has that scale, whatever its own; the text keeps its own, and so do
  // the clips — the scale given by hand and the Transform's.
  await applyMath.click();
  await expect(page.getByTestId('dialog-confirm')).toHaveText('Apply to 2 formulas');
  await page.getByTestId('dialog-confirm').click();
  await expect(question).toHaveCount(0);
  expect(await fontSizes(page)).toEqual([72, 72, 72, 48]);
  expect((await getProject(page)).clips).toEqual(clipsBefore);
  await expect(page.getByTestId('standard-scale-applied')).toHaveText(
    '2 formulas now have scale 1.5.',
  );
  await expect(applyMath).toBeDisabled();
  await expect(applyMath).toHaveAttribute(
    'title',
    'Every formula of the project has scale 1.5 already.',
  );
  // The Preview draws f1 as large as a formula born at that scale: 72 / 48 times what it was.
  await expect
    .poll(async () => (await drawnHeight(page, 'fa'))! / heightBefore)
    .toBeCloseTo(1.5, 3);

  // Applying is not saving: cancelled, the dialog leaves the standard scale as it was.
  await page.getByTestId('standard-scale-cancel').click();
  await expect(dialog).toHaveCount(0);
  expect(await scales(page)).toEqual({ math: '1', tex: '1' });

  // One undo step gives every formula its scale back; redo applies it again.
  await page.keyboard.press('ControlOrMeta+z');
  expect(await fontSizes(page)).toEqual([48, 96, 72, 48]);
  await expect.poll(async () => (await drawnHeight(page, 'fa'))! / heightBefore).toBeCloseTo(1, 3);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await fontSizes(page)).toEqual([72, 72, 72, 48]);

  // «Apply to all texts» does the same for the LaTeX texts alone.
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-standard-scale').click();
  await page.getByTestId('standard-scale-tex').fill('0.5');
  await applyTex.click();
  await expect(question).toContainText('1 LaTeX text changes to scale 0.5 (font_size 24)');
  await page.getByTestId('dialog-confirm').click();
  expect(await fontSizes(page)).toEqual([72, 72, 72, 24]);
});
