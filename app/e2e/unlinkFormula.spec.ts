import { expect, test, type Page } from './test';
import { validateProject, type Project } from '../src/model';
import { closeEditor, pinMathJax } from './creatorHelpers';
import { getProject, openSubmenu, setTime, type MfeWindow } from './helpers';
import { clickScene, scenePoint } from './previewHelpers';
import { canvasHash, openRelationScene, plain } from './relationsHelpers';
import { box, uiState } from './timelineHelpers';

/* Unlink formula (make a copy): the menu of a clip whose formula has other clips gives the clip a
 * copy of the formula of its own — Duplicate's copy, after the original in the Creator —, and
 * the menu of several selected clips one copy per formula, which its selected clips share; from
 * then on editing one formula leaves the clips of the other alone. One undo step. A formula's
 * only clip, or all of its clips, have the entry off, and the tooltip says why. */

const clip = (page: Page, id: string) => page.getByTestId(`clip-${id}`);

/** The formula clip `id` shows. */
async function formulaOf(page: Page, id: string): Promise<{ id: string; name: string }> {
  const project = await getProject(page);
  const formulaId = project.clips.find((c) => c.id === id)!.formulaId;
  return project.formulas.find((f) => f.id === formulaId)!;
}

/** The names of the Creator's list, top to bottom. */
const creatorNames = (page: Page) =>
  page
    .getByTestId('formula-item')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-name')));

/** How many glyphs the preview draws at the playhead. */
const drawn = (page: Page) =>
  page.getByTestId('preview-frame').evaluate((frame) => Number(frame.dataset.drawableCount));

/** Every formula has its render (so what hangs on one is placed by it). */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const { entries } = mfe.useRenderStore.getState();
    return mfe.useProjectStore
      .getState()
      .project.formulas.every((f) => entries[f.id]?.status === 'ok');
  });
}

/** The clip's own menu on the timeline (a right-click on it, with no other clip selected). */
async function clipMenu(page: Page, id: string): Promise<void> {
  await clip(page, id).click({ button: 'right', position: { x: 30, y: 8 } });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
}

/** f1 "a+b" on clips a [0, 4) and b [5, 9) of track 1 (and c [0, 4) of track 2 with `third`). */
async function openTwins(page: Page, third = false): Promise<void> {
  const clips = [plain('a', 'fa', 't1', 0, 4), plain('b', 'fa', 't1', 5, 9)];
  if (third) clips.push(plain('c', 'fa', 't2', 0, 4));
  await openRelationScene(page, clips, {}, [{ id: 'fa', name: 'f1', source: 'a+b' }]);
  await pinMathJax(page);
}

/** Write `latex` as the source of the formula of clip `id`, through its editor. */
async function editSource(page: Page, id: string, latex: string): Promise<void> {
  await clip(page, id).dblclick({ position: { x: 30, y: 8 } });
  const editor = page.getByTestId('formula-editor');
  await editor.getByTestId('raw-latex').fill(latex);
  await editor.getByTestId('editor-apply').click();
  await closeEditor(page);
}

test('a clip of a formula with another clip gets a copy of its own; one undo step', async ({
  page,
}) => {
  await openTwins(page);
  await clip(page, 'b').click({ position: { x: 30, y: 8 } });
  const before = await box(clip(page, 'b'));
  await clipMenu(page, 'b');
  const entry = page.getByTestId('clip-menu-unlink');
  await expect(entry).toBeEnabled();
  await expect(entry).toHaveText('Unlink formula (make a copy)');
  await expect(entry).toHaveAttribute(
    'title',
    'This clip gets a copy of “f1” of its own, a new formula in the Creator. Editing a formula or its copy no longer changes the clips of the other.',
  );
  await entry.click();
  await expect(page.getByTestId('add-animation-menu')).toHaveCount(0);

  // The clip shows the copy, named as Duplicate names it; the other clip keeps the original.
  const copy = await formulaOf(page, 'b');
  expect(copy).toMatchObject({ name: 'f2', source: 'a+b' });
  expect((await formulaOf(page, 'a')).id).toBe('fa');
  // On the timeline only its label changed.
  await expect(clip(page, 'b').locator('.tl-clip-name')).toHaveText('f2');
  await expect(clip(page, 'a').locator('.tl-clip-name')).toHaveText('f1');
  expect(await box(clip(page, 'b'))).toEqual(before);
  // In the Creator the copy comes after its original, as the formula of the selected clip.
  expect(await creatorNames(page)).toEqual(['f1', 'f2']);
  const copyItem = page.locator(`[data-testid="formula-item"][data-formula-id="${copy.id}"]`);
  await expect(copyItem).toHaveAttribute('data-linked', 'true');
  await expect(page.locator('[data-formula-id="fa"]')).toHaveAttribute('data-linked', 'false');
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['b'] });

  // One step back: the clip shows the original again and the copy is gone; and forward again.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(clip(page, 'b').locator('.tl-clip-name')).toHaveText('f1');
  expect(await creatorNames(page)).toEqual(['f1']);
  expect((await formulaOf(page, 'b')).id).toBe('fa');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(clip(page, 'b').locator('.tl-clip-name')).toHaveText('f2');
  expect((await formulaOf(page, 'b')).id).toBe(copy.id);

  // Editing the copy changes its clip alone, and editing the original the other one alone.
  await setTime(page, 6); // b alone on screen
  await expect.poll(() => drawn(page)).toBe(3);
  await editSource(page, 'b', 'a+b+c');
  await expect.poll(() => drawn(page)).toBe(5);
  await setTime(page, 2); // a alone on screen
  await expect.poll(() => drawn(page)).toBe(3);
  await editSource(page, 'a', 'a');
  await expect.poll(() => drawn(page)).toBe(1);
  await setTime(page, 6);
  await expect.poll(() => drawn(page)).toBe(5);
  expect((await getProject(page)).formulas.map((f) => [f.name, f.source])).toEqual([
    ['f1', 'a'],
    ['f2', 'a+b+c'],
  ]);
});

test('two of three clips selected share one copy, from the menu of the selected clips', async ({
  page,
}) => {
  await openTwins(page, true);
  await clip(page, 'b').click({ position: { x: 30, y: 8 } });
  await clip(page, 'c').click({ position: { x: 30, y: 8 }, modifiers: ['ControlOrMeta'] });
  await clip(page, 'c').click({ button: 'right', position: { x: 30, y: 8 } });
  const entry = page.getByTestId('clips-menu-unlink');
  await expect(entry).toHaveText('Unlink formula (make a copy)');
  await expect(entry).toHaveAttribute(
    'title',
    /^The 2 selected clips of “f1” share one copy of it, a new formula in the Creator\./,
  );
  await entry.click();
  await expect(page.getByTestId('clips-menu')).toHaveCount(0);
  const copy = await formulaOf(page, 'b');
  expect(copy.name).toBe('f2');
  expect((await formulaOf(page, 'c')).id).toBe(copy.id);
  expect((await formulaOf(page, 'a')).id).toBe('fa');
  expect(await creatorNames(page)).toEqual(['f1', 'f2']);
  // Their clip counts in the Creator: one clip left to the original, two to the copy.
  await expect(page.locator('[data-formula-id="fa"] .badge-clips')).toHaveText('▭ 1');
  await expect(page.locator(`[data-formula-id="${copy.id}"] .badge-clips`)).toHaveText('▭ 2');
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['b', 'c'] });
  await page.keyboard.press('ControlOrMeta+z');
  expect((await getProject(page)).clips.map((c) => c.formulaId)).toEqual(['fa', 'fa', 'fa']);
});

test('the entry is off for a formula’s only clip, and says why', async ({ page }) => {
  await openRelationScene(page, [plain('a', 'fa', 't1', 0, 4), plain('b', 'fb', 't2', 0, 4)]);
  await clipMenu(page, 'a');
  const entry = page.getByTestId('clip-menu-unlink');
  await expect(entry).toBeDisabled();
  await expect(entry).toHaveAttribute(
    'title',
    '“f1” has no other clip: there is nothing to unlink this clip from.',
  );
  // So in the preview's menu on it.
  await page.keyboard.press('Escape');
  await setTime(page, 2);
  const at = await scenePoint(page, [0, 0]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu-unlink')).toBeDisabled();
  expect((await getProject(page)).formulas).toHaveLength(2);
});

test('the entry is off for all the clips of a formula selected together', async ({ page }) => {
  await openTwins(page);
  await clip(page, 'a').click({ position: { x: 30, y: 8 } });
  await clip(page, 'b').click({ position: { x: 30, y: 8 }, modifiers: ['ControlOrMeta'] });
  await clip(page, 'b').click({ button: 'right', position: { x: 30, y: 8 } });
  await expect(page.getByTestId('clips-menu-unlink')).toBeDisabled();
  await expect(page.getByTestId('clips-menu-unlink')).toHaveAttribute(
    'title',
    'These are all the clips of “f1”: there is nothing to unlink them from.',
  );
  expect((await getProject(page)).formulas).toHaveLength(1);
});

test('the preview’s menu on the object unlinks its clip, and what is picked on it stays', async ({
  page,
}) => {
  await openTwins(page);
  await setTime(page, 2); // a alone on screen
  // Glyphs of a picked with Alt: the preview's menu on them.
  await clickScene(page, [0, 0], 'Alt');
  await expect(page.getByTestId('glyph-pick')).toBeVisible();
  const at = await scenePoint(page, [0, 0]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
  await page.getByTestId('preview-menu-unlink').click();
  await expect(page.getByTestId('preview-menu')).toHaveCount(0);
  expect((await formulaOf(page, 'a')).name).toBe('f2');
  expect((await formulaOf(page, 'b')).id).toBe('fa');
  // The pick is the same glyphs, of the copy now.
  await expect(page.getByTestId('glyph-pick')).toBeVisible();
});

test('a clip with a relation and a brace keeps both: the project validates, the frames are the same', async ({
  page,
}) => {
  // f1 on a [0, 6) and b [7, 10); f2 on d [2, 8), its first glyph arriving from a over [3, 4).
  const a = plain('a', 'fa', 't1', 0, 6);
  a.initial.position = [-2, 1];
  const d = plain('d', 'fb', 't2', 2, 8);
  d.initial.position = [2, -1.5];
  const relation = {
    id: 'r1',
    fromClipId: 'a',
    toClipId: 'd',
    offset: 1,
    duration: 1,
    easing: 'linear',
    style: 'transform',
    pathArc: 0,
    pairs: [{ from: [0], to: [0], style: null }],
  };
  await openRelationScene(page, [a, plain('b', 'fa', 't1', 7, 10), d], {
    relations: [relation],
  });
  await pinMathJax(page);
  // A brace under a, from 1.5 s, through its menu.
  await setTime(page, 1.5);
  await clipMenu(page, 'a');
  await openSubmenu(page, 'add-brace');
  await page.getByTestId('add-brace-down').click();
  await expect.poll(async () => (await getProject(page)).clips.length).toBe(4);
  await settled(page);
  const braceId = (await getProject(page)).clips.at(-1)!.id;
  // The frames before, during and after the transformation, as they are drawn now.
  const frames = async () => {
    const out: string[] = [];
    for (const t of [2.5, 3.5, 4.5]) {
      await setTime(page, t);
      out.push(await canvasHash(page));
    }
    return out;
  };
  const before = await frames();
  expect(new Set(before).size).toBe(3);
  const issues = (project: unknown) =>
    validateProject(project as Project).map((issue) => `${issue.severity} ${issue.code}`);
  const issuesBefore = issues(await getProject(page));

  await clipMenu(page, 'a');
  await page.getByTestId('clip-menu-unlink').click();
  await settled(page);
  const project = await getProject(page);
  const copy = await formulaOf(page, 'a');
  expect(copy.name).toBe('f3');
  // What hangs on the clip, and what it sends, still name it.
  expect(project.clips.find((c) => c.id === braceId)!.attach).toMatchObject({
    rule: 'brace',
    clipId: 'a',
    glyphs: 'all',
  });
  expect(project.relations).toEqual([relation]);
  expect(issues(project)).toEqual(issuesBefore);
  expect(issuesBefore.filter((issue) => issue.startsWith('error'))).toEqual([]);
  // The scene is drawn as it was: the glyph still travels, and the brace is still there.
  expect(await frames()).toEqual(before);
});
