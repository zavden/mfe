import { expect, test, type Page } from './test';
import {
  createClip,
  createEmptyProject,
  createTexFormula,
  defaultIntro,
  defaultOutro,
  serializeProject,
  type Project,
} from '../src/model';
import { pinMathJax, showGlyphList, startApp, waitForDrawables } from './creatorHelpers';
import { getProject, openWithProject, setTime, undo, type MfeWindow } from './helpers';
import { scenePoint } from './previewHelpers';

/* A LaTeX text is edited in the composition workspace (D88): its source, layout and object
 * fields beside the stage, its glyphs coloured in the draft. Free mode: MathJax renders it. */

const RED = '#FC6255';

/** A project with the LaTeX text "Hello world", on screen from 0 to 8 s, and a formula. */
async function openCaption(page: Page, clips = 1, meta: Partial<Project['meta']> = {}) {
  const project = createEmptyProject();
  Object.assign(project.meta, meta);
  const caption = createTexFormula({ name: 'caption', source: 'Hello world' });
  project.formulas = [caption];
  const plain = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  project.clips = Array.from({ length: clips }, (_, index) =>
    createClip(caption.id, project.tracks[index]!.id, 0, 8, plain),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, serializeProject(project));
  await pinMathJax(page);
  await setTime(page, 1);
  await waitForDrawables(page, 10);
  return { caption, clips: project.clips };
}

const workspace = (page: Page) => page.getByTestId('text-composition');
/** The project as the store holds it, whole. */
const projectOf = (page: Page) =>
  page.evaluate(
    () => (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as Project,
  );

test('the width of a text is read against the frame of the project, whatever its shape', async ({
  page,
}) => {
  // A square project: its frame is 8 units wide, not the 14.2 of a 16:9 one.
  await openCaption(page, 1, { width: 1080, height: 1080 });
  await page.getByTestId('formula-item').dblclick();
  const hint = workspace(page).getByTestId('tex-width-hint');
  await expect(hint).toHaveText('units (frame: 8)');
  await expect(hint).toHaveAttribute(
    'title',
    'The frame is 8 units wide. Empty: as wide as the text comes.',
  );
});

test('a LaTeX text opens in the workspace from its card, its clip, the clips menu and the preview', async ({
  page,
}) => {
  const { clips } = await openCaption(page, 2);
  const clip = page.getByTestId(`clip-${clips[0]!.id}`);
  const opened = async () => {
    await expect(workspace(page)).toContainText('LaTeX text composition · caption');
    await expect(page.getByTestId('formula-editor')).toHaveCount(0);
    await expect(workspace(page).getByTestId('tex-source')).toHaveValue('Hello world');
  };
  const cancel = async () => {
    await page.getByTestId('text-cancel').click();
    await expect(workspace(page)).toHaveCount(0);
  };

  // Its card: the object, with no occurrence to place.
  await page.getByTestId('formula-item').dblclick();
  await opened();
  await expect(page.getByTestId('text-placement-hint')).toContainText('Library object');
  await cancel();

  // Its clip on the timeline: that occurrence, placed on the stage.
  await clip.dblclick({ position: { x: 60, y: 10 } });
  await opened();
  await expect(page.getByTestId('text-placement-hint')).toContainText('clip initial state');
  await cancel();

  // The menu of its selected clips: the text they share.
  await clip.click({ position: { x: 60, y: 10 } });
  await page
    .getByTestId(`clip-${clips[1]!.id}`)
    .click({ position: { x: 60, y: 10 }, modifiers: ['ControlOrMeta'] });
  await clip.click({ button: 'right', position: { x: 60, y: 10 } });
  await expect(page.getByTestId('clips-menu-header')).toHaveText('2 clips · 1 formula');
  await page.getByTestId('clips-menu-edit').click();
  await opened();
  await expect(page.getByTestId('text-placement-hint')).toContainText('Library object');
  await cancel();

  // The text itself, in the preview.
  const at = await scenePoint(page, [0, 0]);
  await page.mouse.dblclick(at.x, at.y);
  await opened();
  await expect(page.getByTestId('text-placement-hint')).toContainText('clip initial state');
  await cancel();
  // Cancel wrote nothing.
  expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
});

test('text, layout, object fields, place and glyph colours are one draft: Apply is one undo step', async ({
  page,
}, testInfo) => {
  const { clips } = await openCaption(page);
  const before = await getProject(page);
  await page.getByTestId(`clip-${clips[0]!.id}`).dblclick({ position: { x: 60, y: 10 } });
  const editor = workspace(page);
  await expect(page.getByTestId('text-render-status')).toHaveText('10 glyphs · MathJax');
  await expect(page.getByTestId('text-stage-canvas')).toHaveAttribute('data-glyph-count', '10');

  await editor.getByTestId('tex-source').fill('Hello $x^2$ world');
  await expect(page.getByTestId('text-render-status')).toHaveText('12 glyphs · MathJax');
  await editor.getByTestId('text-scale').fill('3/2');
  await editor.getByTestId('text-scale').press('Enter');
  await expect(editor.getByTestId('text-font-size')).toHaveValue('72');
  await editor.getByTestId('tex-width').fill('6');
  await editor.getByTestId('tex-width').press('Enter');
  await editor.getByTestId('tex-align-left').click();
  await editor.getByTestId('text-name').fill('heading');
  await editor.getByTestId('text-name').press('Enter');
  await editor.getByTestId('text-intro').selectOption('write');
  await editor.getByTestId('text-position-x').fill('2');
  await editor.getByTestId('text-position-y').fill('-1');
  await expect(page.getByTestId('text-stage-canvas')).toHaveAttribute('data-position', '2,-1');

  // The glyphs of the draft, coloured and hidden before anything is applied. They are the glyphs
  // of its render: a selection made on an earlier one is let go when the next arrives, so the
  // draft is left to settle first.
  await expect(page.getByTestId('text-render-status')).toHaveText('12 glyphs · MathJax');
  await editor.getByTestId('text-view-glyphs').click();
  await expect(page.getByTestId('text-glyphs-behind')).toHaveCount(0);
  await showGlyphList(editor);
  await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(12);
  await editor.getByTestId('glyph-chip-0').click();
  await editor.getByTestId('glyph-chip-4').click({ modifiers: ['Shift'] });
  await editor.getByTestId('palette-RED').click();
  await editor.getByTestId('glyph-chip-6').click();
  await editor.getByTestId('glyph-hide').click();
  await expect(editor.getByTestId('glyph-chip-6')).toHaveAttribute('data-hidden', 'true');
  await page.screenshot({ path: testInfo.outputPath('latex-composition-glyphs.png') });
  // The colours are on the stage too.
  await editor.getByTestId('text-view-placement').click();
  await expect(page.getByTestId('text-stage-canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('latex-composition-stage.png') });

  // Still a draft: the project has none of it.
  expect(await getProject(page)).toEqual(before);
  await page.getByTestId('text-apply').click();
  await expect(editor).toHaveCount(0);
  const after = await getProject(page);
  expect(after.formulas[0]).toMatchObject({
    kind: 'tex',
    name: 'heading',
    source: 'Hello $x^2$ world',
    fontSize: 72,
    layout: { width: 6, align: 'left', lineSpacing: 1 },
    intro: { kind: 'write' },
    glyphColors: { '0': RED, '1': RED, '2': RED, '3': RED, '4': RED },
    hiddenGlyphs: [6],
  });
  const whole = await projectOf(page);
  expect(whole.clips[0]!.initial.position).toEqual([2, -1]);
  // The clip was still at the intro the text gave it: it follows.
  expect(whole.clips[0]!.intro.kind).toBe('write');
  // The render of the draft is the snapshot the project counts by: nothing is left to re-map.
  expect(whole.formulas[0]!.snapshot?.glyphs).toHaveLength(12);
  await expect(page.getByTestId('formula-warning')).toHaveCount(0);
  await expect(page.getByTestId('formula-item')).toHaveAttribute('data-name', 'heading');

  await undo(page);
  expect(await getProject(page)).toEqual(before);
});

test('the glyph view lists its glyphs only while its key, beside the switch, is pressed', async ({
  page,
}) => {
  await openCaption(page);
  await page.getByTestId('formula-item').dblclick();
  const editor = workspace(page);
  const key = editor.getByTestId('glyph-list-toggle');
  // The stage has no list: the key comes with the glyph view.
  await expect(editor.getByTestId('text-view-placement')).toBeVisible();
  await expect(key).toHaveCount(0);
  await editor.getByTestId('text-view-glyphs').click();
  await expect(editor.getByTestId('glyph-9')).toBeVisible();
  await expect(key).toHaveAttribute('aria-pressed', 'false');
  await expect(editor.getByTestId('glyph-chips')).toHaveCount(0);
  // The switch stays where it was: the key is after it.
  const before = (await editor.getByTestId('text-view-glyphs').boundingBox())!;
  await key.click();
  await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(10);
  expect((await editor.getByTestId('text-view-glyphs').boundingBox())!).toEqual(before);
  expect((await key.boundingBox())!.x).toBeGreaterThan(before.x + before.width);
  // Kept while the other side shows.
  await editor.getByTestId('text-view-placement').click();
  await expect(key).toHaveCount(0);
  await editor.getByTestId('text-view-glyphs').click();
  await expect(key).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(10);
});

test('glyph colours follow the text typed after them, and the references stay with their glyphs', async ({
  page,
}) => {
  await openCaption(page);
  await page.getByTestId('formula-item').dblclick();
  const editor = workspace(page);
  await editor.getByTestId('text-view-glyphs').click();
  // "world": glyphs 5 to 9.
  await showGlyphList(editor);
  await editor.getByTestId('glyph-chip-5').click();
  await editor.getByTestId('glyph-chip-9').click({ modifiers: ['Shift'] });
  await editor.getByTestId('palette-RED').click();
  await editor.getByTestId('tex-source').fill('Oh, Hello big world');
  // O h , H e l l o b i g w o r l d: "world" is now glyphs 11 to 15.
  await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(16);
  for (const index of [11, 12, 13, 14, 15])
    await expect(
      editor.getByTestId(`glyph-chip-${index}`).locator('.glyph-swatch'),
    ).toHaveAttribute('data-own', 'true');
  await expect(editor.getByTestId('glyph-chip-11')).toHaveAttribute('data-label', 'w');
  await expect(editor.getByTestId('glyph-chip-5').locator('.glyph-swatch')).toHaveAttribute(
    'data-own',
    'false',
  );
  await page.getByTestId('text-apply').click();
  await expect(editor).toHaveCount(0);
  const text = (await projectOf(page)).formulas[0]!;
  expect(text).toMatchObject({
    source: 'Oh, Hello big world',
    glyphColors: { '11': RED, '12': RED, '13': RED, '14': RED, '15': RED },
  });
  expect(text.snapshot?.glyphs).toHaveLength(16);
  // Opened again, the colours are where they were left.
  await page.getByTestId('formula-item').dblclick();
  await editor.getByTestId('text-view-glyphs').click();
  await expect(editor.getByTestId('glyph-chip-11').locator('.glyph-swatch')).toHaveAttribute(
    'data-own',
    'true',
  );
});

test('a text that does not render keeps its last appearance, says why, and waits with its colours', async ({
  page,
}) => {
  await openCaption(page);
  await page.getByTestId('formula-item').dblclick();
  const editor = workspace(page);
  await editor.getByTestId('text-view-glyphs').click();
  await showGlyphList(editor);
  await editor.getByTestId('glyph-chip-0').click();
  await editor.getByTestId('palette-RED').click();
  await editor.getByTestId('tex-source').fill('Hello $\\frac{1}{$ world');
  await expect(page.getByTestId('text-render-status')).toHaveText('Cannot render');
  await expect(page.getByTestId('text-render-error')).toBeVisible();
  await expect(page.getByTestId('text-paint-waits')).toBeVisible();
  await expect(page.getByTestId('text-apply')).toBeDisabled();
  await editor.getByTestId('tex-source').fill('Hello $\\frac{1}{2}$ world');
  await expect(page.getByTestId('text-render-status')).toContainText('glyphs · MathJax');
  await expect(page.getByTestId('text-paint-waits')).toHaveCount(0);
  await expect(page.getByTestId('text-apply')).toBeEnabled();
  await page.getByTestId('text-apply').click();
  await expect(editor).toHaveCount(0);
  expect((await projectOf(page)).formulas[0]!.glyphColors).toEqual({ '0': RED });
});

test('one occurrence gets its own copy of the text on Apply', async ({ page }) => {
  const { clips } = await openCaption(page, 2);
  await page.getByTestId(`clip-${clips[0]!.id}`).dblclick({ position: { x: 60, y: 10 } });
  await page.getByTestId('text-independent').click();
  await workspace(page).getByTestId('tex-source').fill('Only here');
  await page.getByTestId('text-apply').click();
  await expect(workspace(page)).toHaveCount(0);
  const project = await getProject(page);
  expect(project.formulas.map((formula) => [formula.name, formula.source])).toEqual([
    ['caption', 'Hello world'],
    ['caption2', 'Only here'],
  ]);
  expect(project.clips.map((clip) => clip.formulaId)).toEqual([
    project.formulas[1]!.id,
    project.formulas[0]!.id,
  ]);
});

test('typing never moves the stage: what the render is doing is the colour of a dot', async ({
  page,
}) => {
  await openCaption(page);
  await page.getByTestId('formula-item').dblclick();
  const status = page.getByTestId('text-render-status');
  const canvas = page.getByTestId('text-stage-canvas');
  const dialog = workspace(page);
  await expect(status).toHaveAttribute('data-state', 'ok');
  const stage = await canvas.boundingBox();
  const frame = await dialog.boundingBox();
  const same = async () => {
    expect(await canvas.boundingBox()).toEqual(stage);
    expect(await dialog.boundingBox()).toEqual(frame);
  };

  // Being rendered again: the words stay, the dot turns, nothing appears over the stage.
  await page.getByTestId('tex-source').pressSequentially(' and more', { delay: 5 });
  await expect(status).toHaveAttribute('data-state', 'busy');
  await expect(status.locator('.text-render-text')).toHaveText('10 glyphs · MathJax');
  await same();
  await expect(status).toHaveAttribute('data-state', 'ok');
  await expect(status).toHaveText('17 glyphs · MathJax');
  await same();

  // Refused: what LaTeX said is under the stage, in a strip that was already there.
  await page.getByTestId('tex-source').fill('Hello $\\frac{1}{$ world');
  await expect(status).toHaveAttribute('data-state', 'error');
  await expect(page.getByTestId('text-messages').getByTestId('text-render-error')).toBeVisible();
  await same();

  // A warning of the render (a width breaks the lines) is in the same strip.
  await page.getByTestId('tex-source').fill('Hello world, at some length');
  await page.getByTestId('tex-width').fill('2');
  await page.getByTestId('tex-width').press('Enter');
  await expect(page.getByTestId('text-messages').getByTestId('text-render-warnings')).toContainText(
    'approximate',
  );
  await expect(status).toHaveAttribute('data-state', 'ok');
  await same();

  // Nothing to draw: the dot goes out.
  await page.getByTestId('tex-source').fill('');
  await expect(status).toHaveAttribute('data-state', 'idle');
  await expect(status).toHaveText('Empty: nothing is drawn.');
  await same();
});

test('a maximized workspace gives its room to the stage and to the text field', async ({
  page,
}, testInfo) => {
  await openCaption(page);
  await page.getByTestId('formula-item').dblclick();
  const canvas = page.getByTestId('text-stage-canvas');
  const source = page.getByTestId('tex-source');
  await expect(page.getByTestId('text-render-status')).toHaveAttribute('data-state', 'ok');
  const small = (await canvas.boundingBox())!;
  const field = (await source.boundingBox())!;

  await page.getByTestId('text-composition-maximize').click();
  await expect
    .poll(async () => (await canvas.boundingBox())!.height)
    .toBeGreaterThan(small.height + 40);
  const big = (await canvas.boundingBox())!;
  // The whole frame, at its aspect, inside the dialog: over the position fields and the footer.
  expect(Math.abs(big.width / big.height - 16 / 9)).toBeLessThan(0.01);
  const fields = (await page.getByTestId('text-position-x').boundingBox())!;
  const footer = (await page.getByTestId('text-apply').boundingBox())!;
  expect(big.y + big.height).toBeLessThanOrEqual(fields.y);
  expect(fields.y + fields.height).toBeLessThan(footer.y);
  // Under its tools, from the same left edge.
  const tools = (await page.getByTestId('text-fit').boundingBox())!;
  expect(big.x).toBeCloseTo(tools.x, 0);
  // The form takes the height too: its text field grows.
  expect((await source.boundingBox())!.height).toBeGreaterThan(field.height + 40);
  // The picture has the size of the canvas (no stretched bitmap).
  const ratio = await canvas.evaluate(
    (node: HTMLCanvasElement) => node.width / node.getBoundingClientRect().width,
  );
  expect(ratio).toBeCloseTo(await page.evaluate(() => window.devicePixelRatio), 1);
  await page.screenshot({ path: testInfo.outputPath('latex-composition-maximized.png') });

  // The glyph view fills the same room, and scrolls inside it.
  await page.getByTestId('text-view-glyphs').click();
  const glyphs = (await page.getByTestId('text-glyphs').boundingBox())!;
  expect(glyphs.y + glyphs.height).toBeLessThan(footer.y);

  // Restored, the workspace is as it was.
  await page.getByTestId('text-view-placement').click();
  await page.getByTestId('text-composition-maximize').click();
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeCloseTo(small.height, 0);
});

test('keys that come with no task between them all reach the source, and nothing loops', async ({
  page,
}) => {
  // On a page still loading, the browser runs the keys before React's own tasks: each key is
  // rendered (its update is synchronous), and what its effects ask for later waits. Here every
  // key comes in the same task, after the microtasks of the one before: the worst of that case.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startApp(page);
  await page.getByTestId('creator-new-menu').click();
  await page.getByTestId('creator-new-tex').click();
  const source = workspace(page).getByTestId('tex-source');
  await expect(source).toBeFocused();
  const text = 'Pythagoras said $a^2 + b^2 = c^2$ about right triangles, and more besides';
  await source.evaluate(async (element, text) => {
    const area = element as HTMLTextAreaElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    for (const key of text) {
      // What a key does to a textarea: its value grows, then an input event.
      setValue.call(area, area.value + key);
      area.dispatchEvent(new InputEvent('input', { bubbles: true, data: key }));
      // React renders the key in a microtask; nothing else runs before the next key.
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    }
  }, text);
  await expect(source).toHaveValue(text);
  expect(errors).toEqual([]);
  // The draft renders, and Apply writes all of it.
  await expect(workspace(page).getByTestId('text-render-status')).toContainText('glyphs · MathJax');
  await workspace(page).getByTestId('text-apply').click();
  await expect(workspace(page)).toHaveCount(0);
  const sources = (await getProject(page)).formulas.map((f) => (f as { source?: string }).source);
  expect(sources).toEqual([text]);
});
