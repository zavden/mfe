import { expect, test } from './test';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  defaultIntro,
  defaultOutro,
  serializeProject,
  type Project,
} from '../src/model';
import { closeEditor } from './creatorHelpers';
import { openAnimationsTab, openWithProject, type MfeWindow } from './helpers';

test('new brace labels use Standard scale for formulas and LaTeX text', async ({
  page,
}, testInfo) => {
  const project = createEmptyProject();
  const brace = createBraceFormula({ name: 'brace', width: 2 });
  const clip = createClip(brace.id, project.tracks[0]!.id, 0, 6, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  project.formulas.push(brace);
  project.clips.push(clip);
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, serializeProject(project));
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-standard-scale').click();
  await page.getByTestId('standard-scale-math').fill('1/2');
  await page.getByTestId('standard-scale-tex').fill('3/2');
  await page.getByTestId('standard-scale-save').click();

  for (const [kind, fontSize, scale] of [
    ['math', 24, 0.5],
    ['tex', 72, 1.5],
  ] as const) {
    await page.evaluate((id) => {
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: [id] });
    }, clip.id);
    await openAnimationsTab(page, 'timing');
    await page.getByTestId('attachment-add-label').click();
    await page.getByTestId(`attachment-label-${kind}`).click();
    // A formula is typed in the formula editor, a LaTeX text in the composition workspace.
    const fields = kind === 'math' ? 'editor' : 'text';
    await expect(page.getByTestId(`${fields}-font-size`)).toHaveValue(String(fontSize));
    await expect(page.getByTestId(`${fields}-scale`)).toHaveValue(String(scale));
    await page
      .getByTestId(kind === 'math' ? 'raw-latex' : 'tex-source')
      .fill(kind === 'math' ? 'n' : 'terms');
    await page.getByTestId(`${fields}-apply`).click();
    if (kind === 'math') await closeEditor(page);
    else await expect(page.getByTestId('text-composition')).toHaveCount(0);
    if (kind === 'math') {
      for (const theme of ['dark', 'light']) {
        if (theme === 'light') await page.getByTestId('theme-toggle').click();
        await page.getByTestId('formula-item').last().getByTestId('formula-edit').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.screenshot({ path: testInfo.outputPath(`brace-label-scale-${theme}.png`) });
        await closeEditor(page);
      }
    }
  }
  const fontSizes = () =>
    page.evaluate(() => {
      const p = (window as MfeWindow).__mfe!.useProjectStore.getState()
        .project as unknown as Project;
      return p.formulas.filter((f) => f.kind === 'math' || f.kind === 'tex').map((f) => f.fontSize);
    });
  expect(await fontSizes()).toEqual([24, 72]);
  await page.getByTestId('menu-preferences').click();
  await page.getByTestId('menu-item-preferences-standard-scale').click();
  await page.getByTestId('standard-scale-math').fill('2');
  await page.getByTestId('standard-scale-tex').fill('1/3');
  await page.getByTestId('standard-scale-save').click();
  expect(await fontSizes()).toEqual([24, 72]);
});
