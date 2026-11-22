/* «Add line» (`preview/lineDraw.ts`, audit B6-04): an end put on symbols — picked with Alt — holds
 * glyph indices of the render its formula had then, with that index space (`PickRevision`). When the
 * formula is rendered again before the line is made — edited with the mode on —, the end follows
 * its glyphs through the transition, as align by symbol does (`previewSymbolAlign.spec.ts`); when
 * they are gone, the mode ends and a notice says so. */
import { expect, test, type Page } from './test';
import { closeEditor, pinMathJax, waitForDrawables } from './creatorHelpers';
import { getProject, openWithProject, projectFile, setTime, type MfeWindow } from './helpers';
import { clickScene, scenePoint } from './previewHelpers';
import { clipJson } from './timelineHelpers';

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A: "a+b=c" at (0, 1.5); B: "x=y" at (-2, -1). */
async function openTwo(page: Page): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 6);
  ca.initial.position = [0, 1.5];
  const cb = clipJson('cb', 'fb', 't2', 0, 6);
  cb.initial.position = [-2, -1];
  const formulas = [
    { id: 'fa', name: 'A', source: 'a+b=c', color: '#58C4DD' },
    { id: 'fb', name: 'B', source: 'x=y', color: '#83C167' },
  ];
  await openWithProject(page, projectFile('symbols', formulas, [ca, cb]));
  await setTime(page, 3);
  await waitForDrawables(page, 8); // 5 + 3 glyphs, written by then
}

/** The box of the glyph labelled `label` of a clip's formula, on the frame (scene units). */
async function glyphBox(page: Page, clipId: string, label: string): Promise<Box> {
  return page.evaluate(
    ([id, wanted]) => {
      const mfe = (window as MfeWindow).__mfe!;
      const clip = mfe.useProjectStore.getState().project.clips.find((c) => c.id === id)!;
      const [x, y] = (clip as unknown as { initial: { position: [number, number] } }).initial
        .position;
      const entry = mfe.useRenderStore.getState().resolved.get(clip.formulaId) as unknown as {
        render: { glyphs: { label: string; bbox: Box }[] };
      };
      const glyph = entry.render.glyphs.find((g) => g.label === wanted)!;
      const b = glyph.bbox;
      return { minX: x + b.minX, minY: y + b.minY, maxX: x + b.maxX, maxY: y + b.maxY };
    },
    [clipId, label] as const,
  );
}

/** The labels of the glyphs of formula `fa`, as its snapshot counts them. */
async function labels(page: Page): Promise<string[]> {
  const formula = (await getProject(page)).formulas.find((f) => f.id === 'fa')!;
  return (formula.snapshot as { glyphs: { label: string }[] }).glyphs.map((g) => g.label);
}

/** The start of the attachment of the first line there is: the clip and the glyphs it is on. */
async function lineStart(page: Page): Promise<{ clipId: string; glyphs: number[] | 'all' }> {
  return page.evaluate(() => {
    const project = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
      formulas: { id: string; kind: string }[];
      clips: {
        formulaId: string;
        attach: { start: { clipId: string; glyphs: number[] | 'all' } } | null;
      }[];
    };
    const line = project.formulas.find((f) => f.kind === 'line')!;
    return project.clips.find((c) => c.formulaId === line.id)!.attach!.start;
  });
}

/** «Add line ▸ Line» from the empty space of the preview, its start put on the "=" of a+b=c
 * with Alt and the compass: the mode then waits for the end. */
async function startOnEquals(page: Page): Promise<void> {
  await openTwo(page);
  // The glyphs are MathJax's here, whatever runs on this machine.
  await pinMathJax(page);
  // «Add line ▸ Line» from the menu of the empty space of the preview: two clicks put its ends.
  const empty = await scenePoint(page, [0, 3.5]);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await page.getByTestId('preview-space-line-line').click();
  await expect(page.getByTestId('line-draw-surface')).toBeVisible();
  // Alt+click on the "=" of a+b=c (its fourth glyph): the start is that symbol, at the point
  // chosen on the compass.
  const equals = await glyphBox(page, 'ca', '=');
  const at = await scenePoint(page, [
    (equals.minX + equals.maxX) / 2,
    (equals.minY + equals.maxY) / 2,
  ]);
  await page.keyboard.down('Alt');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('line-compass')).toBeVisible();
  await page.getByTestId('line-compass').getByTestId('compass-CENTER').click();
  await expect(page.getByTestId('line-draw-hint')).toContainText('from symbols of A');
}

/** Edit A in its formula editor, with the mode on, to `latex`, whose glyphs are `glyphs`; the
 * editor stays open. */
async function editA(page: Page, latex: string, glyphs: string[]): Promise<void> {
  await page.getByTestId('formula-item').first().getByTestId('formula-edit').click();
  const editor = page.getByTestId('formula-editor');
  await editor.getByTestId('raw-latex').fill(latex);
  await editor.getByTestId('editor-apply').click();
  await expect.poll(() => labels(page)).toEqual(glyphs);
}

/** The end: a click on empty space makes the line; the glyphs it starts on. */
async function endOnEmptySpace(page: Page): Promise<number[] | 'all'> {
  await clickScene(page, [3, -3]);
  await expect(page.getByTestId('line-draw-surface')).toHaveCount(0);
  const start = await lineStart(page);
  expect(start.clipId).toBe('ca');
  return start.glyphs;
}

test('Add line: a start put on a symbol follows it when the formula is edited before the end is clicked', async ({
  page,
}) => {
  await startOnEquals(page);
  // Two glyphs come in before the "=", which is the sixth now; a "+" is the fourth.
  await editA(page, 'z+a+b=c', ['z', '+', 'a', '+', 'b', '=', 'c']);
  await closeEditor(page);
  await expect(page.getByTestId('line-draw-surface')).toBeVisible();
  // Its start is on the "=" of the formula as it is now: its sixth glyph.
  expect(await endOnEmptySpace(page)).toEqual([5]);
});

test('Add line: a start put on the "=" of a+b=c is its fourth glyph (reference: no edit)', async ({
  page,
}) => {
  await startOnEquals(page);
  expect(await endOnEmptySpace(page)).toEqual([3]);
});

test('Add line: when the symbol its start is on is edited away, the drawing ends and says why', async ({
  page,
}) => {
  await startOnEquals(page);
  // The "=" is gone: there is nothing left for the start to be on. The drawing ends at once,
  // and says why.
  await editA(page, 'a+b', ['a', '+', 'b']);
  const notice = page.getByTestId('notice').filter({ hasText: 'No line made' });
  await expect(notice).toContainText(
    'The symbols of “A” its start was on are no longer there. Start the line again.',
  );
  await expect(page.getByTestId('line-draw-surface')).toHaveCount(0);
  await notice.getByTestId('notice-dismiss').click();
  await closeEditor(page);
  // A click on empty space makes nothing now.
  await clickScene(page, [3, -3]);
  const lines = await page.evaluate(
    () =>
      (window as MfeWindow)
        .__mfe!.useProjectStore.getState()
        .project.formulas.filter((f) => (f as unknown as { kind: string }).kind === 'line').length,
  );
  expect(lines).toBe(0);
});
