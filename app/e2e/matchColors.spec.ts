import { expect, test, type Page } from './test';
import { forceFallbackFilePaths, pinMathJax } from './creatorHelpers';
import { getProject, openSubmenu, openWithProject, undo, type MfeWindow } from './helpers';
import { scenePoint } from './previewHelpers';
import { plain, relationProject, selectClip } from './relationsHelpers';

/* Match colours applied from the right-click menus: the Creator list (the selected formulas)
 * and the preview (the formulas of the selected clips). The glyphs of every occurrence of a
 * pattern take its colour; the formula's per-glyph colours are replaced, as one undo step. */

const RED = '#FC6255';
const BLUE = '#58C4DD';

interface GlyphSnapshot {
  label: string;
}

/** The project with f1 "a x + b" (clip a at the left) and f2 "y = x^2" (clip b at the right),
 * and the list "Course": x red, + blue. */
async function openScene(page: Page): Promise<void> {
  await forceFallbackFilePaths(page);
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(
    page,
    relationProject(
      [plain('a', 'fa', 't1', 0, 6), plain('b', 'fb', 't2', 0, 6)],
      [
        { id: 'fa', name: 'f1', source: 'a x + b' },
        { id: 'fb', name: 'f2', source: 'y = x^2' },
      ],
    ),
  );
  await pinMathJax(page);
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      draft.colorMatches.push({
        id: 'm1',
        name: 'Course',
        entries: [
          { pattern: '$x$', color: '#FC6255' },
          { pattern: '+', color: '#58C4DD' },
        ],
      });
      draft.formulas[0]!.glyphColors = { '0': '#123456' };
      const clips = draft.clips as unknown as { initial: { position: [number, number] } }[];
      clips[0]!.initial.position = [-3, 0];
      clips[1]!.initial.position = [3, 0];
    });
    mfe.history.clear();
  });
  await expect
    .poll(async () =>
      (await getProject(page)).formulas.every((f) => (f as { snapshot?: unknown }).snapshot),
    )
    .toBeTruthy();
}

/** The per-glyph colours of formula `i`, keyed by glyph label instead of index. */
async function coloursByLabel(page: Page, i: number): Promise<Record<string, string>> {
  const formula = (await getProject(page)).formulas[i]! as unknown as {
    glyphColors: Record<string, string>;
    snapshot: { glyphs: GlyphSnapshot[] } | null;
  };
  const out: Record<string, string> = {};
  for (const [index, color] of Object.entries(formula.glyphColors)) {
    out[formula.snapshot!.glyphs[Number(index)]!.label] = color;
  }
  return out;
}

test('the Creator menu applies a list to the selected formulas, as one undo step', async ({
  page,
}) => {
  await openScene(page);
  const items = page.getByTestId('formula-item');
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ['ControlOrMeta'] });
  await items.nth(1).click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-header')).toHaveText('2 formulas');
  await openSubmenu(page, 'formula-menu-match');
  await page.getByTestId('formula-menu-match-m1').click();
  await expect(page.getByTestId('formula-menu')).toHaveCount(0);
  await expect.poll(() => coloursByLabel(page, 0)).toEqual({ x: RED, '+': BLUE });
  expect(await coloursByLabel(page, 1)).toEqual({ x: RED });
  const notice = page.getByTestId('notice').last();
  await expect(notice).toContainText('“Course” applied to 2 formulas');
  await expect(notice).toContainText('3 glyphs coloured.');
  // The colours f1 had are gone with the rest; one undo brings everything back.
  await undo(page);
  expect((await getProject(page)).formulas.map((f) => f.glyphColors)).toEqual([
    { '0': '#123456' },
    {},
  ]);
});

test('the preview menu applies a list to the formulas of the selected clips', async ({ page }) => {
  await openScene(page);
  await selectClip(page, 'b');
  const { x, y } = await scenePoint(page, [3, 0]);
  await page.mouse.click(x, y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
  await openSubmenu(page, 'preview-menu-match');
  await page.getByTestId('preview-menu-match-m1').click();
  await expect.poll(() => coloursByLabel(page, 1)).toEqual({ x: RED });
  expect((await getProject(page)).formulas[0]!.glyphColors).toEqual({ '0': '#123456' });
  await expect(page.getByTestId('notice').last()).toContainText('“Course” applied to 1 formula');
});

test('a font text selected with a formula keeps its colours, and the notice says why', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:7799/**', (route) => route.abort());
  await openScene(page);
  // A Text (font) made in the Creator — boxes, with no companion — and put on the timeline.
  await page.getByTestId('creator-new-menu').click();
  await page.getByTestId('creator-new-text').click();
  await page.getByTestId('text-source').fill('x+y');
  await expect(page.getByTestId('text-stage-canvas')).toHaveAttribute('data-glyph-count', '3');
  await page.getByTestId('text-apply').click();
  await expect(page.getByTestId('text-composition')).toHaveCount(0);
  await page.getByTestId('formula-item').nth(2).click({ button: 'right' });
  await page.getByTestId('formula-menu-add-to-timeline').click();
  const text = (await getProject(page)).formulas[2]!;
  expect(text).toMatchObject({ kind: 'text', source: 'x+y' });
  const textClip = (await getProject(page)).clips.find((c) => c.formulaId === text.id)!.id;
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      draft.formulas[2]!.glyphColors = { '0': '#123456', '1': '#ABCDEF' };
    });
    mfe.history.clear();
  });

  // Its clip and the clip of f2, from the timeline's menu: the list has an x and a +, and so
  // has the text, but its source is no LaTeX to find them in.
  await page.getByTestId('clip-b').click({ position: { x: 30, y: 8 } });
  await page
    .getByTestId(`clip-${textClip}`)
    .click({ position: { x: 30, y: 8 }, modifiers: ['ControlOrMeta'] });
  await page.getByTestId('clip-b').click({ button: 'right', position: { x: 30, y: 8 } });
  await expect(page.getByTestId('clips-menu-header')).toHaveText('2 clips · 2 formulas');
  await openSubmenu(page, 'clips-menu-match');
  await page.getByTestId('clips-menu-match-m1').click();
  await expect.poll(() => coloursByLabel(page, 1)).toEqual({ x: RED });
  expect((await getProject(page)).formulas[2]!.glyphColors).toEqual({
    '0': '#123456',
    '1': '#ABCDEF',
  });
  const notice = page.getByTestId('notice').last();
  await expect(notice).toContainText('“Course” applied to 1 formula');
  await expect(notice).toContainText(
    `${text.name}: a Text (font) has no LaTeX to find the patterns in.`,
  );
  // One step, the colours of f2: the text was never written.
  await undo(page);
  expect((await getProject(page)).formulas.map((f) => f.glyphColors)).toEqual([
    { '0': '#123456' },
    {},
    { '0': '#123456', '1': '#ABCDEF' },
  ]);
});

test('Edit → Match colors builds a list in the dialog and applies it to the selection', async ({
  page,
}) => {
  await openScene(page);
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      draft.colorMatches = [];
    });
  });
  const items = page.getByTestId('formula-item');
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ['ControlOrMeta'] });
  await page.getByTestId('menu-edit').click();
  await page.getByTestId('menu-item-edit-match-colors').click();
  await page.getByTestId('menu-item-edit-match-colors-create').click();
  const dialog = page.getByTestId('match-colors');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('match-colors-name')).toHaveValue('Match colors 1');
  await expect(dialog.getByTestId('match-colors-targets')).toHaveText('2 formulas selected.');
  await expect(dialog.getByTestId('match-colors-apply')).toBeDisabled();
  // Two patterns: x in RED from the palette, + in a colour typed as hex.
  await dialog.getByTestId('match-colors-add').click();
  await expect(dialog.getByTestId('match-colors-pattern-0')).toBeFocused();
  await page.keyboard.type('$x$');
  await dialog.getByTestId('match-colors-chip-0').click();
  await page.getByTestId('match-colors-palette-RED').click();
  await dialog.getByTestId('match-colors-add').click();
  await page.keyboard.type('+');
  const hex = dialog.getByTestId('match-colors-color-1-hex');
  await hex.fill('#58C4DD');
  await hex.press('Enter');
  await expect
    .poll(async () => (await getProject(page)).colorMatches[0]!.entries)
    .toEqual([
      { pattern: '$x$', color: RED },
      { pattern: '+', color: BLUE },
    ]);
  // The preview draws the first selected formula with the colours before anything is applied.
  await expect(dialog.getByTestId('match-colors-preview-formula')).toHaveValue('fa');
  await expect(dialog.getByTestId('match-colors-preview-note')).toHaveText(
    '2 glyphs of f1 take a colour.',
  );
  await expect(
    dialog.locator('[data-testid="match-colors-preview"] path[fill="#FC6255"]'),
  ).toHaveCount(1);
  expect((await getProject(page)).formulas[0]!.glyphColors).toEqual({ '0': '#123456' });
  await dialog.getByTestId('match-colors-preview-formula').selectOption('fb');
  await expect(dialog.getByTestId('match-colors-preview-note')).toHaveText(
    '1 glyph of f2 takes a colour.',
  );
  await dialog.getByTestId('match-colors-apply').click();
  await expect.poll(() => coloursByLabel(page, 0)).toEqual({ x: RED, '+': BLUE });
  expect(await coloursByLabel(page, 1)).toEqual({ x: RED });
  await expect(page.getByTestId('notice').last()).toContainText('“Match colors 1” applied');
  await dialog.getByTestId('match-colors-done').click();
  await expect(dialog).toHaveCount(0);
  // The list is now in the Edit menu and in the Creator's menu.
  await page.getByTestId('menu-edit').click();
  await page.getByTestId('menu-item-edit-match-colors').click();
  await expect(page.getByRole('menuitem', { name: 'Match colors 1…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await items.nth(0).click({ button: 'right' });
  await openSubmenu(page, 'formula-menu-match');
  await expect(page.getByRole('menuitem', { name: 'Match colors 1' })).toBeVisible();
});

test('without any list the menus say so', async ({ page }) => {
  await openScene(page);
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      draft.colorMatches = [];
    });
  });
  await page.getByTestId('formula-item').nth(0).click({ button: 'right' });
  await openSubmenu(page, 'formula-menu-match');
  await page.getByTestId('formula-menu-match-create').click();
  await expect(page.getByTestId('match-colors')).toBeVisible();
  await expect(page.getByTestId('match-colors-name')).toHaveValue('Match colors 1');
});

for (const theme of ['dark', 'light'] as const) {
  test(`a pending menu colour command cannot alter a replacement document (${theme})`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((theme) => localStorage.setItem('mfe.theme', theme), theme);
    await openScene(page);
    await page.evaluate(async () => {
      // Hold only the asynchronous renderer boundary; the menu command and labelled output
      // still use the production implementation.
      const modulePath = '/src/engine/index.ts';
      const { getEngine } = (await import(
        /* @vite-ignore */ modulePath
      )) as typeof import('../src/engine');
      const instance = getEngine();
      const original = instance.render.bind(instance);
      const w = window as Window & { heldColour?: boolean; releaseColour?: () => void };
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      w.releaseColour = () => {
        instance.render = original;
        release();
      };
      instance.render = async (request) => {
        if (request.kind === 'math' && request.latex.includes('\\color')) {
          w.heldColour = true;
          await gate;
        }
        return original(request);
      };
    });
    await page.getByTestId('formula-item').nth(0).click({ button: 'right' });
    await openSubmenu(page, 'formula-menu-match');
    await page.getByTestId('formula-menu-match-m1').click();
    await page.waitForFunction(() => (window as Window & { heldColour?: boolean }).heldColour);
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      const replacement = structuredClone(mfe.useProjectStore.getState().project);
      replacement.meta.name = 'Replacement document';
      replacement.formulas[0]!.glyphColors = { '0': '#00FF00' };
      mfe.loadProject(replacement);
      (window as Window & { releaseColour?: () => void }).releaseColour!();
    });
    await expect(page.getByTestId('notice').last()).toContainText('coloured nothing');
    expect((await getProject(page)).formulas[0]!.glyphColors).toEqual({ '0': '#00FF00' });
    expect(await page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo())).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`colour-command-cancelled-${theme}.png`) });
  });
}
