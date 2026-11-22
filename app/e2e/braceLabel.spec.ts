import { expect, test, type Page } from './test';
import { closeEditor } from './creatorHelpers';
import {
  getProject,
  holdToConfirm,
  openAnimationsTab,
  openSubmenu,
  openWithProject,
  setTime,
  type MfeWindow,
} from './helpers';
import { scenePoint } from './previewHelpers';
import { plain, relationProject } from './relationsHelpers';
import { box, timeToX } from './timelineHelpers';

/* Labels at the tip of a brace (D69): «Add label ▸» on a brace's clip menu — on the timeline or in
 * the preview — or the brace panel's Add label makes an empty formula or LaTeX text hanging at the
 * tip, opened in the editor to be typed; it goes where Manim's `put_at_tip` puts it and follows the
 * brace; its panel sets its gap, its own or Manim's; it goes with the brace. */

interface ClipState {
  id: string;
  formulaId: string;
  start: number;
  end: number;
  attach: Record<string, unknown> | null;
  initial: { position: [number, number] };
}

/** The clips of the brace and of the label at its tip, from the store. */
async function clipsOf(page: Page): Promise<{ brace: ClipState; label: ClipState | null }> {
  return page.evaluate(() => {
    const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
      formulas: { id: string; kind: string }[];
      clips: ClipState[];
    };
    const braceId = p.formulas.find((f) => f.kind === 'brace')!.id;
    return {
      brace: p.clips.find((c) => c.formulaId === braceId)!,
      label: p.clips.find((c) => (c.attach as { rule?: string } | null)?.rule === 'tip') ?? null,
    };
  });
}

/** f1 (a+b=c) on clip a [0, 6) of track 1 at (−1, 0.5), written in 1 s; playhead at 2 s; a brace
 * below the whole of it, from the clip's menu. */
async function openWithBrace(page: Page, side: 'down' | 'up' = 'down'): Promise<ClipState> {
  await page.setViewportSize({ width: 1500, height: 950 });
  const a = plain('a', 'fa', 't1', 0, 6, {
    intro: {
      kind: 'write',
      duration: 1,
      easing: 'linear',
      lagRatio: null,
      shift: [0, 0],
      scale: 1,
    },
  });
  a.initial.position = [-1, 0.5];
  await openWithProject(page, relationProject([a]));
  await setTime(page, 2);
  await rightClickClip(page, 'clip-a', 3);
  await openSubmenu(page, 'add-brace');
  await page.getByTestId(`add-brace-${side}`).click();
  return (await clipsOf(page)).brace;
}

async function rightClickClip(page: Page, testId: string, t: number): Promise<void> {
  const b = await box(page.getByTestId(testId));
  await page.mouse.click(await timeToX(page, t), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
}

/** Type `latex` into the open editor of the label — its source field has the focus, as for a new
 * object — apply it and close the editor: the formula editor, or the composition workspace of a
 * LaTeX text, which Apply closes. */
async function typeLabel(page: Page, field: 'raw-latex' | 'tex-source', latex: string) {
  if (field === 'tex-source') {
    const workspace = page.getByTestId('text-composition');
    await expect(workspace.getByTestId(field)).toBeFocused();
    await workspace.getByTestId(field).fill(latex);
    await workspace.getByTestId('text-apply').click();
    await expect(workspace).toHaveCount(0);
    return;
  }
  const editor = page.getByTestId('formula-editor');
  await expect(editor.getByTestId(field === 'raw-latex' ? 'math-field' : field)).toBeFocused();
  await editor.getByTestId(field).fill(latex);
  await editor.getByTestId('editor-apply').click();
  await closeEditor(page);
}

test('a brace label is written with the on-screen keyboard, as any formula is', async ({
  page,
}) => {
  const brace = await openWithBrace(page);
  await rightClickClip(page, `clip-${brace.id}`, 3);
  await openSubmenu(page, 'add-label');
  await page.getByTestId('add-label-math').click();
  const editor = page.getByTestId('formula-editor');
  await expect(editor.getByTestId('math-field')).toBeFocused();
  await editor.getByTestId('toggle-keyboard').click();
  /** A key of the keypad's shown tab. */
  const key = (id: string) => editor.getByTestId(`keypad-key-${id}`);
  await expect(key('apply')).toBeVisible();
  await expect(editor.getByTestId('math-field')).toBeFocused();
  await key('x').click();
  await key('plus').click();
  await key('d1').click();
  await expect(editor.getByTestId('raw-latex')).toHaveValue('x+1');
  await key('apply').click();
  const { label } = await clipsOf(page);
  await expect
    .poll(async () => {
      const formulas = (await getProject(page)).formulas;
      return formulas.find((f) => f.id === label!.formulaId)!.source;
    })
    .toBe('x+1');
});

test('Add label ▸ Formula on a brace: typed in the editor, it hangs at the tip and follows the brace', async ({
  page,
}) => {
  const brace = await openWithBrace(page);
  // A brace's clip takes a label, not another brace.
  await rightClickClip(page, `clip-${brace.id}`, 3);
  await expect(page.getByTestId('add-brace')).toHaveCount(0);
  await openSubmenu(page, 'add-label');
  await page.getByTestId('add-label-math').click();
  await typeLabel(page, 'raw-latex', 'n');
  const { label } = await clipsOf(page);
  expect(label).toMatchObject({
    start: 2,
    end: 6,
    attach: { clipId: brace.id, glyphs: 'all', rule: 'tip', buff: null },
  });
  expect((await getProject(page)).formulas.map((f) => f.name)).toEqual(['f1', 'f2', 'b1', 'f3']);
  // Placed below the tip, centred on it, once its glyphs are there.
  const below = async () => (await clipsOf(page)).label!.initial.position;
  await expect.poll(async () => (await below())[1]).toBeLessThan(brace.initial.position[1] - 0.2);
  expect((await below())[0]).toBeCloseTo(brace.initial.position[0], 1);

  // Its panel: at the tip of b1, Manim's gap (0.25 in ManimCE); a gap of its own moves it.
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('attachment-section')).toContainText('Label');
  await expect(page.getByTestId('attachment-target')).toContainText('At the tip of b1');
  await expect(page.getByTestId('attachment-buff')).toHaveValue('0.25');
  await expect(page.getByTestId('attachment-buff-default')).toHaveAttribute('aria-pressed', 'true');
  const y0 = (await below())[1];
  await page.getByTestId('attachment-buff').fill('0.5');
  await page.getByTestId('attachment-buff').press('Enter');
  await expect.poll(async () => (await below())[1]).toBeCloseTo(y0 - 0.25, 4);
  await expect(page.getByTestId('attachment-buff-default')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByTestId('attachment-buff-default').click();
  await expect.poll(async () => (await clipsOf(page)).label!.attach!.buff).toBeNull();
  await expect.poll(async () => (await below())[1]).toBeCloseTo(y0, 4);

  // The brace turned above the formula: the label follows, above it.
  await page.getByTestId(`clip-${brace.id}`).click({ position: { x: 40, y: 10 } });
  await page.getByTestId('attachment-side-up').click();
  await expect.poll(async () => (await below())[1]).toBeGreaterThan(0.5 + 0.4);
});

test('the preview menu on a brace adds a text label; the brace lists it, and takes it when deleted', async ({
  page,
}) => {
  const brace = await openWithBrace(page, 'up');
  await setTime(page, 4); // the brace has grown by then
  const at = await scenePoint(page, brace.initial.position);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
  await expect(page.getByTestId('preview-menu-brace')).toHaveCount(0);
  await openSubmenu(page, 'preview-menu-label');
  await page.getByTestId('preview-menu-label-tex').click();
  await expect(page.getByTestId('text-composition')).toContainText('LaTeX text composition · t1');
  // The label hangs from its brace: the workspace says its place is not edited there.
  await expect(page.getByTestId('text-placement-hint')).toContainText('Attached object');
  await typeLabel(page, 'tex-source', 'the sum');
  const project = await getProject(page);
  const text = project.formulas.find((f) => f.name === 't1')!;
  expect((text as unknown as { kind: string }).kind).toBe('tex');
  const { label } = await clipsOf(page);
  // From the playhead, past the brace's intro, to the brace's end.
  expect(label).toMatchObject({ formulaId: text.id, start: 4, end: 6 });
  await expect
    .poll(async () => (await clipsOf(page)).label!.initial.position[1])
    .toBeGreaterThan(brace.initial.position[1] + 0.2);

  // The brace's panel names its label; Add label offers the two kinds.
  await page.getByTestId(`clip-${brace.id}`).click({ position: { x: 40, y: 10 } });
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('attachment-labels')).toHaveText('t1');
  await page.getByTestId('attachment-add-label').click();
  await expect(page.getByTestId('add-label-menu')).toBeVisible();
  await expect(page.getByTestId('attachment-label-math')).toHaveText('Formula');
  await expect(page.getByTestId('attachment-label-tex')).toHaveText('Text (LaTeX)');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-label-menu')).toHaveCount(0);

  // Deleting the brace takes the label along, after a held confirmation that lists it.
  await page.getByTestId(`clip-${brace.id}`).click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('dialog-details')).toHaveCount(1);
  await expect(page.getByTestId('dialog-details')).toContainText('t1 (4 s–6 s) on');
  await expect(page.getByTestId('dialog-details')).toContainText('attached to b1');
  await holdToConfirm(page);
  expect((await getProject(page)).clips.map((c) => c.id)).toEqual(['a']);
});
