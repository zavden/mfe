import { expect, test, type Page } from './test';
import type { Project } from '../src/model';
import { normalizePalette } from '../src/ui/colors/palette';
import { closeEditor, forceFallbackFilePaths, pinMathJax, showGlyphList } from './creatorHelpers';
import { getProject, openAnimationsTab, openWithProject, undo, type MfeWindow } from './helpers';
import { plain, relationProject, selectClip } from './relationsHelpers';

const source = normalizePalette({
  format: 'manim-palette',
  version: 1,
  name: 'Course palette',
  colors: {
    background: '#101820',
    formula: '#E6E6E6',
    variable: '#AABBCC',
    constant: '#CCDD99',
    operator: '#FFAA55',
    result: '#99DDCC',
    text: '#E6E6E6',
    muted: '#778899',
    rectangle: '#5566AA',
    circle: '#AA77BB',
    arrow: '#DD6677',
  },
}).palette;
const project = async (page: Page) => (await getProject(page)) as unknown as Project;
const clearHistory = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.history.clear());
const historyCount = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __mfe: { useProjectStore: { temporal: { getState(): { pastStates: unknown[] } } } };
        }
      ).__mfe.useProjectStore.temporal.getState().pastStates.length,
  );

async function expectMenuWithinViewport(page: Page, testId: string): Promise<void> {
  const bounds = await page.getByTestId(testId).boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(8);
  expect(bounds!.y).toBeGreaterThanOrEqual(8);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 8);
}

async function openPaletteScene(page: Page, theme: 'dark' | 'light', width: number): Promise<void> {
  await forceFallbackFilePaths(page);
  await page.addInitScript((palette) => {
    localStorage.setItem(
      'mfe.palettes.v1',
      JSON.stringify({
        version: 1,
        activePaletteId: 'course',
        palettes: [{ id: 'course', displayName: 'Course palette', source: palette }],
      }),
    );
  }, source);
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
  await openWithProject(
    page,
    relationProject(
      [plain('a', 'fa', 't1', 0, 6), plain('b', 'fb', 't2', 0, 6)],
      [
        { id: 'fa', name: 'alpha', source: 'a+b' },
        { id: 'fb', name: 'beta', source: 'c=d' },
      ],
    ),
  );
  await pinMathJax(page);
  await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
  await expect
    .poll(async () => (await project(page)).formulas.every((formula) => formula.snapshot !== null))
    .toBe(true);
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      draft.colorMatches.push({
        id: 'course-list',
        name: 'Course',
        entries: [{ pattern: 'x', color: '#FFFFFF' }],
      });
    });
    mfe.history.clear();
  });
}

for (const [theme, width] of [
  ['dark', 1280],
  ['light', 1920],
] as const) {
  test(`role colours reach Creator, glyph menus and Edit together (${theme})`, async ({
    page,
  }, info) => {
    await openPaletteScene(page, theme, width);
    await page.getByTestId('formula-item').first().dblclick();
    await expect(page.getByTestId('formula-editor')).toBeVisible();
    await expect(page.getByTestId('palette-role-variable')).toBeDisabled();

    await page.getByTestId('editor-tag-color-roles').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('editor-tag-color-role-background')).toBeFocused();
    // Tab closes the menu and moves on to the control after its button: one step back is the
    // button again. A dialog's focus trap sees the key like any other Tab.
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('editor-tag-color-role-menu')).toHaveCount(0);
    await expect(page.getByTestId('editor-tag-color-roles')).not.toBeFocused();
    await expect(page.getByTestId('formula-editor').locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('editor-tag-color-roles')).toBeFocused();
    const formulaRoles = page.getByTestId('editor-color-roles');
    for (let step = 0; step < 12; step++) {
      if (await formulaRoles.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(formulaRoles).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid$="-role-menu"]')).toHaveCount(1);
    await expect(page.getByTestId('editor-color-role-formula')).toHaveAccessibleName(
      'Colour formula #E6E6E6',
    );
    await expect(page.getByTestId('editor-color-role-text')).toHaveAccessibleName(
      'Colour text #E6E6E6',
    );
    await expect(page.getByTestId('editor-color-role-background')).toBeFocused();
    await expectMenuWithinViewport(page, 'editor-color-role-menu');
    await page.screenshot({ path: info.outputPath(`creator-roles-${theme}-${width}.png`) });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await project(page)).formulas[0]!.color)
      .toBe(source.colors.formula);
    expect(await historyCount(page)).toBe(1);
    await expect(page.getByTestId('editor-color-roles')).toBeFocused();
    await undo(page);
    expect((await project(page)).formulas[0]!.color).toBe('#FFFFFF');

    await page.getByTestId('editor-tag-color-roles').click();
    await page.getByTestId('editor-tag-color-role-muted').click();
    expect((await project(page)).formulas[0]!.tag.color).toBe(source.colors.muted);
    await showGlyphList(page);
    await page.getByTestId('glyph-chip-0').click({ button: 'right' });
    await page.getByTestId('glyph-menu-color-role-variable').click();
    await expect(page.getByTestId('glyph-menu')).toHaveCount(0);
    expect((await project(page)).formulas[0]!.glyphColors).toEqual({ 0: source.colors.variable });
    await undo(page);
    expect((await project(page)).formulas[0]!.glyphColors).toEqual({});
    await closeEditor(page);

    const rows = page.getByTestId('formula-item');
    await rows.nth(0).click();
    await rows.nth(1).click({ modifiers: ['ControlOrMeta'] });
    await rows.nth(1).click({ button: 'right' });
    await page.getByTestId('formula-menu-edit-together').click();
    await expect(page.getByTestId('multi-palette-role-result')).toBeDisabled();
    await page.getByTestId('multi-fa-0').click();
    await page.getByTestId('multi-fb-2').click({ modifiers: ['ControlOrMeta'] });
    await clearHistory(page);
    await page.screenshot({ path: info.outputPath(`multi-roles-${theme}-${width}.png`) });
    await page.getByTestId('multi-palette-role-result').click();
    expect((await project(page)).formulas.map((formula) => formula.glyphColors)).toEqual([
      { 0: source.colors.result },
      { 2: source.colors.result },
    ]);
    expect(await historyCount(page)).toBe(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(async () => (await project(page)).formulas.map((formula) => formula.glyphColors))
      .toEqual([{}, {}]);
  });

  test(`role colours reach Settings, animation overrides and Match colors (${theme})`, async ({
    page,
  }, info) => {
    await openPaletteScene(page, theme, width);
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Project settings…' }).click();
    if (theme === 'dark') {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.getByTestId('settings-background-roles').click();
      await expectMenuWithinViewport(page, 'settings-background-role-menu');
      await page.screenshot({ path: info.outputPath('settings-roles-dark-320.png') });
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width, height: 800 });
    }
    await page.getByTestId('settings-background-roles').click();
    await page.getByTestId('settings-background-role-background').click();
    await expect(page.getByTestId('settings-background-hex')).toHaveValue(source.colors.background);
    expect((await project(page)).meta.background).toBe('#000000');
    await page.getByTestId('settings-apply').click();
    expect((await project(page)).meta.background).toBe(source.colors.background);
    expect(await historyCount(page)).toBe(1);
    await undo(page);

    await selectClip(page, 'a');
    await openAnimationsTab(page, 'timing');
    await expect(page.getByTestId('initial-color-roles')).toBeDisabled();
    expect((await project(page)).clips[0]!.initial.color).toBeNull();
    await page.getByTestId('initial-color-on').check();
    await clearHistory(page);
    await page.getByTestId('initial-color-roles').click();
    await expectMenuWithinViewport(page, 'initial-color-role-menu');
    await page.screenshot({ path: info.outputPath(`animation-roles-${theme}-${width}.png`) });
    await page.getByTestId('initial-color-role-result').click();
    expect((await project(page)).clips[0]!.initial.color).toBe(source.colors.result);
    expect(await historyCount(page)).toBe(1);
    await page.getByTestId('initial-color').fill('#224466');
    expect((await project(page)).clips[0]!.initial.color).toBe('#224466');
    expect(await historyCount(page)).toBe(2);
    await page.getByTestId('initial-color').dispatchEvent('change');
    expect(await historyCount(page)).toBe(2);
    await undo(page);
    expect((await project(page)).clips[0]!.initial.color).toBe(source.colors.result);
    await page.getByTestId('initial-color-on').uncheck();
    await expect(page.getByTestId('initial-color-roles')).toBeDisabled();
    expect((await project(page)).clips[0]!.initial.color).toBeNull();

    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-match-colors').click();
    await page.getByRole('menuitem', { name: 'Course…', exact: true }).click();
    await clearHistory(page);
    await page.getByTestId('match-colors-chip-0').click();
    await expect(page.getByTestId('match-colors-palette-role-formula')).toHaveAccessibleName(
      'Colour formula #E6E6E6',
    );
    await expect(page.getByTestId('match-colors-palette-role-text')).toHaveAccessibleName(
      'Colour text #E6E6E6',
    );
    await page.screenshot({ path: info.outputPath(`match-roles-${theme}-${width}.png`) });
    await page.getByTestId('match-colors-palette-role-operator').click();
    expect((await project(page)).colorMatches[0]!.entries).toEqual([
      { pattern: 'x', color: source.colors.operator },
    ]);
    expect(await historyCount(page)).toBe(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(async () => (await project(page)).colorMatches[0]!.entries[0]!.color)
      .toBe('#FFFFFF');

    // The chip's combined Manim/role menu and the separate Roles button share one Tab policy.
    // Leaving the first by keyboard must remove its global arrow handler before opening another.
    await page.getByTestId('match-colors-chip-0').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('match-colors-palette-WHITE')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('match-colors-palette')).toHaveCount(0);
    await expect(page.getByTestId('match-colors-chip-0')).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('match-colors-chip-0')).toBeFocused();
    const matchRoles = page.getByTestId('match-colors-color-0-roles');
    for (let step = 0; step < 6; step++) {
      if (await matchRoles.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(matchRoles).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(1);
    await expect(page.getByTestId('match-colors-color-0-role-background')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('match-colors-color-0-role-formula')).toBeFocused();
    await page.keyboard.press('Enter');
    expect((await project(page)).colorMatches[0]!.entries[0]!.color).toBe(source.colors.formula);
    expect(await historyCount(page)).toBe(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(async () => (await project(page)).colorMatches[0]!.entries[0]!.color)
      .toBe('#FFFFFF');

    await page.getByTestId('match-colors-done').click();
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        draft.tracks[0]!.locked = true;
      }),
    );
    const beforeApply = await project(page);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-apply-palette').click();
    await expect(page.getByTestId('apply-palette-counts')).toContainText(
      '1 object will change. 1 object skipped.',
    );
    await page.getByTestId('apply-palette-skipped').locator('summary').click();
    await expect(page.getByTestId('apply-palette-skipped')).toContainText(
      'alpha: used on a locked track.',
    );
    await page.screenshot({ path: info.outputPath(`apply-roles-${theme}-${width}.png`) });
    await page.getByTestId('apply-palette-cancel').click();
    expect(await project(page)).toEqual(beforeApply);
  });
}
