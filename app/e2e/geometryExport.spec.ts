import { expect, test } from './test';
import { readFileSync } from 'node:fs';
import { geometryCases } from '../src/scene/__tests__/geometryProjects';
import { serializeProject } from '../src/model';
import { COMPANION_URL } from './companionHelpers';
import { openWithProject, setTime, type MfeWindow } from './helpers';

for (const [theme, width] of [
  ['dark', 1440],
  ['light', 1280],
] as const) {
  test(`geometry preview and downloaded Python stay coherent (${theme})`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem('mfe.theme', theme), theme);
    // The geometry here is MathJax's, whatever runs on this machine: no companion answers.
    let refused = 0;
    await page.route(`${COMPANION_URL}/**`, (route) => {
      refused += 1;
      return route.abort();
    });
    for (const fixture of geometryCases()) {
      await openWithProject(page, serializeProject(fixture.project));
      await page.waitForFunction(() => {
        const mfe = (window as MfeWindow).__mfe!;
        const project = mfe.useProjectStore.getState().project;
        return project.formulas.every((f) => mfe.useRenderStore.getState().resolved.has(f.id));
      });
      await setTime(page, fixture.name.includes('curved') ? 2.5 : 3.75);
      await expect(page.getByTestId('preview-canvas')).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${fixture.name}-${theme}.png`) });
      for (const target of ['ce', 'gl'] as const) {
        await page.getByTestId('export-button-menu').click();
        await page.getByTestId(`export-button-export-${target}`).click();
        await expect(page.getByTestId('export-python-waiting')).toHaveCount(0);
        const code = await page.getByTestId('export-python-code').innerText();
        expect(code).toContain(target === 'ce' ? 'from manim import *' : 'from manimlib import *');
        if (fixture.name.includes('shared')) {
          expect(code).not.toContain('shared0 = Brace(other0,');
          expect(code).not.toContain('shared0_2 = Brace(host0,');
          expect(code).toContain('shared0 = Brace(Line(');
          expect(code).toContain('shared0_2 = Brace(Line(');
          expect(code).toContain('.scale(1.2');
          expect(code).toContain('.scale(0.8');
        }
        if (fixture.name.includes('early')) {
          expect(code.indexOf('brace = Brace(')).toBeLessThan(
            code.indexOf('earlynext.next_to(brace,'),
          );
          expect(code).toMatch(/label\.scale\(1\.3\)\.move_to\(/);
          expect(code.indexOf('label.scale(1.3).move_to(')).toBeLessThan(
            code.indexOf('earlybox = SurroundingRectangle(label,'),
          );
        }
        if (fixture.name.includes('hidden')) {
          expect(code).not.toContain('hidden0.apply_matrix(');
          expect(code).not.toContain('hidden1.apply_matrix(');
          expect(code).toContain('hidden5.apply_matrix(');
        }
        const download = page.waitForEvent('download');
        await page.getByTestId('export-python-download').click();
        const file = await download;
        expect(readFileSync((await file.path())!, 'utf8').trim()).toBe(code.trim());
        await page.getByTestId('export-python-close').click();
      }
    }
    // The app looked for its companion, and at the address this spec closes.
    expect(refused).toBeGreaterThan(0);
  });
}
