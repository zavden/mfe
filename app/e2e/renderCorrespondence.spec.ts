import { expect, test, type Page } from './test';
import type { Project } from '../src/model';
import { addFormulaViaUi, closeEditor, showGlyphList, startApp } from './creatorHelpers';
import { getProject, type MfeWindow } from './helpers';

const current = async (page: Page) => (await getProject(page)) as unknown as Project;

for (const theme of ['dark', 'light'] as const) {
  test.describe(`render identity in ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await startApp(page);
      if (theme === 'light') await page.getByTestId('theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    });

    test('Apply and a discarded preview keep source-local macro definitions isolated', async ({
      page,
    }) => {
      await page.getByTestId('menu-file').click();
      await page.getByRole('menuitem', { name: 'Project settings…' }).click();
      await page.getByTestId('settings-preamble').fill('\\newcommand{\\webSourceScope}{a}');
      await page.getByTestId('settings-apply').click();
      const editor = await addFormulaViaUi(
        page,
        '\\renewcommand{\\webSourceScope}{b}\\webSourceScope',
      );
      await showGlyphList(editor);
      const labels = editor.getByTestId('glyph-chips').locator('.glyph-chip-label');
      await expect(labels).toHaveText(['b']);
      await editor.getByTestId('raw-latex').fill('\\webSourceScope');
      await editor.getByTestId('editor-apply').click();
      await expect(labels).toHaveText(['a']);
      await editor
        .getByTestId('raw-latex')
        .fill('\\renewcommand{\\webSourceScope}{c}\\webSourceScope');
      await expect(editor.getByTestId('editor-status')).toHaveText('1 glyphs · MathJax');
      await editor.getByTestId('editor-revert').click();
      await closeEditor(page);
      const another = await addFormulaViaUi(page, '\\webSourceScope+d');
      await expect(another.getByTestId('glyph-chips').locator('.glyph-chip-label')).toHaveText([
        'a',
        '+',
        'd',
      ]);
    });

    test('text width Apply keeps distinct repeated letters colored and hidden through keyboard history', async ({
      page,
    }, testInfo) => {
      // A LaTeX text is composed in its workspace: its glyphs are painted in the draft, and
      // Apply creates it painted.
      await page.getByTestId('creator-new-menu').click();
      await page.getByTestId('creator-new-tex').click();
      const editor = page.getByTestId('text-composition');
      await editor.getByTestId('tex-source').fill('alpha beta gamma delta');
      await editor.getByTestId('text-view-glyphs').click();
      await showGlyphList(editor);
      await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(19);
      await expect(editor.getByTestId('glyph-chip-10')).toHaveAttribute('data-label', 'a');
      await expect(editor.getByTestId('glyph-chip-13')).toHaveAttribute('data-label', 'a');
      await editor.getByTestId('glyph-chip-10').click();
      await editor.getByTestId('palette-RED').click();
      await editor.getByTestId('glyph-hide').click();
      await editor.getByTestId('glyph-chip-13').click();
      await editor.getByTestId('palette-BLUE').click();
      await editor.getByTestId('text-apply').click();
      await expect(editor).toHaveCount(0);
      const colors = (await current(page)).formulas[0]!.glyphColors;
      expect(Object.keys(colors)).toEqual(['10', '13']);
      expect(colors['10']).not.toBe(colors['13']);
      // A width alone, with the colours untouched: in the draft they follow the lines as they
      // break, and on Apply the render sync carries them the same way.
      await page.getByTestId('formula-item').dblclick();
      await editor.getByTestId('tex-width').fill('2');
      await editor.getByTestId('tex-width').press('Enter');
      await expect(editor.getByTestId('text-render-warnings')).toContainText('approximate');
      await editor.getByTestId('text-view-glyphs').click();
      await expect(editor.getByTestId('glyph-chip-10')).toHaveAttribute('data-hidden', 'true');
      await expect(editor.getByTestId('glyph-chip-13')).toHaveAttribute('data-hidden', 'false');
      await expect(editor.getByTestId('glyph-chip-10').locator('.glyph-swatch')).toHaveAttribute(
        'data-own',
        'true',
      );
      await page.screenshot({ path: testInfo.outputPath(`reflow-${theme}.png`), fullPage: true });
      await editor.getByTestId('text-apply').click();
      await expect(editor).toHaveCount(0);
      await expect.poll(async () => (await current(page)).formulas[0]!.glyphColors).toEqual(colors);
      await expect(page.getByTestId('formula-warning')).toHaveCount(0);
      await page.getByTestId('formula-item').click();
      await page.keyboard.press('ControlOrMeta+z');
      await expect
        .poll(async () => {
          const item = (await current(page)).formulas[0]!;
          return item.kind === 'tex' ? item.layout.width : 'wrong kind';
        })
        .toBeNull();
      expect((await current(page)).formulas[0]!.glyphColors).toEqual(colors);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect
        .poll(async () => {
          const item = (await current(page)).formulas[0]!;
          return item.kind === 'tex' ? item.layout.width : 'wrong kind';
        })
        .toBe(2);
      expect((await current(page)).formulas[0]!.glyphColors).toEqual(colors);
      expect((await current(page)).formulas[0]!.hiddenGlyphs).toEqual([10]);
    });

    test('File Open restores glyph tools from a same-ID pre-render save', async ({
      page,
    }, testInfo) => {
      await page.getByTestId('creator-new').click();
      const pendingText = await page.evaluate(() => {
        const store = (window as MfeWindow).__mfe!.useProjectStore;
        store.getState().update((draft) => {
          draft.formulas[0]!.source = 'a+b';
        });
        // This synchronous capture is the valid project state a Save started before the first
        // render settles would serialize. The unit regression uses serializeProject itself.
        const value = store.getState().project as unknown as Project;
        if (value.formulas[0]!.snapshot !== null)
          throw new Error('The initial render already settled');
        return JSON.stringify(value);
      });
      await showGlyphList(page);
      await expect(page.getByTestId('glyph-chips').locator('.glyph-chip-label')).toHaveText([
        'a',
        '+',
        'b',
      ]);
      const id = (await current(page)).formulas[0]!.id;
      await closeEditor(page);
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('menu-file').click();
      await page.getByRole('menuitem', { name: 'Open…' }).click();
      await page.getByTestId('projects-other').click();
      await (
        await chooser
      ).setFiles({
        name: 'pending-render.mfe.json',
        mimeType: 'application/json',
        buffer: Buffer.from(pendingText),
      });
      await page.getByTestId('dialog-discard').click();
      await expect(page.getByTestId('doc-file')).toHaveText('pending-render.mfe.json');
      expect((await current(page)).formulas[0]!.id).toBe(id);
      await page.getByTestId('formula-item').dblclick();
      await expect(page.getByTestId('glyph-view')).toBeVisible();
      await expect(page.getByTestId('glyph-view-empty')).toHaveCount(0);
      await expect(page.getByTestId('glyph-chips').locator('.glyph-chip-label')).toHaveText([
        'a',
        '+',
        'b',
      ]);
      expect(
        (await current(page)).formulas[0]!.snapshot!.glyphs.map((glyph) => glyph.label),
      ).toEqual(['a', '+', 'b']);
      await page.screenshot({ path: testInfo.outputPath(`reopened-${theme}.png`), fullPage: true });
    });
  });
}
