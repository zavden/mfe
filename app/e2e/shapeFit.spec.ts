import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import {
  createClip,
  createEmptyProject,
  createShapeAttach,
  createShapeFormula,
  defaultIntro,
  defaultOutro,
  serializeProject,
  type Project,
  type ShapeKind,
  type Target,
} from '../src/model';
import { forceFallbackFilePaths } from './creatorHelpers';
import { openAnimationsTab, openWithProject, type MfeWindow } from './helpers';

function fittedProject(target: Target, shape: ShapeKind): Project {
  const project = createEmptyProject();
  project.meta.target = target;
  project.meta.name = 'Shape fit';
  const host = { ...createShapeFormula({ name: 'host', width: 4, height: 2 }), id: 'host' };
  const fitted = { ...createShapeFormula({ name: 'fitted', shape }), id: 'fitted' };
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const a = { ...createClip(host.id, project.tracks[0]!.id, 0, 6, none), id: 'a' };
  const b = {
    ...createClip(fitted.id, project.tracks[1]!.id, 0, 6, {
      ...none,
      attach: createShapeAttach(a.id, 'all'),
    }),
    id: 'b',
  };
  project.formulas.push(host, fitted);
  project.clips.push(a, b);
  return project;
}

async function state(page: Page) {
  return page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const project = mfe.useProjectStore.getState().project as unknown as Project;
    const shape = project.formulas.find((f) => f.id === 'fitted');
    if (shape?.kind !== 'shape') throw new Error('Missing fitted shape');
    return {
      width: shape.width,
      height: shape.height,
      gap: project.clips.find((clip) => clip.id === 'b')!.attach!.buff,
      parseable: mfe.parseProject(JSON.stringify(project)).ok,
    };
  });
}

async function selectShape(page: Page) {
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: ['b'] });
  });
  await openAnimationsTab(page, 'timing');
}

async function gap(page: Page, value: number) {
  await page.getByTestId('attachment-buff').fill(String(value));
  await page.getByTestId('attachment-buff').press('Enter');
}

for (const target of ['ce', 'gl'] as const) {
  for (const shape of ['box', 'circle'] as const) {
    test(`${target} ${shape}: Gap, keyboard undo/redo, Save and reopen preserve valid geometry`, async ({
      page,
    }, testInfo) => {
      await forceFallbackFilePaths(page);
      await page.setViewportSize({ width: 1500, height: 950 });
      await openWithProject(page, serializeProject(fittedProject(target, shape)));
      await selectShape(page);
      await expect.poll(async () => (await state(page)).width).toBeGreaterThan(4);
      await gap(page, -0.5);
      const valid = await state(page);
      expect(valid.parseable).toBe(true);
      expect(valid.width).toBeGreaterThan(0);

      await gap(page, -5);
      await expect.poll(() => state(page)).toEqual({ ...valid, gap: -5 });
      await expect(page.getByTestId('clip-issues')).toContainText('last valid geometry is kept');
      if (target === 'ce' && shape === 'box') {
        await page.getByTestId('clip-issues').scrollIntoViewIfNeeded();
        for (const theme of ['dark', 'light']) {
          if (theme === 'light') await page.getByTestId('theme-toggle').click();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await page.screenshot({ path: testInfo.outputPath(`unsupported-fit-${theme}.png`) });
        }
      }
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(() => state(page)).toEqual(valid);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect.poll(() => state(page)).toEqual({ ...valid, gap: -5 });

      const download = page.waitForEvent('download');
      await page.getByTestId('menu-file').click();
      await page.getByRole('menuitem', { name: 'Save', exact: true }).click();
      const saved = readFileSync(await (await download).path(), 'utf8');
      await page.reload();
      await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
      // The reload brings the work of this tab back by itself. A new document first: what is
      // read after Open can then only be the file's, and it is there when it is read.
      const opened = () => state(page).catch(() => null);
      await page.getByTestId('menu-file').click();
      await page.getByRole('menuitem', { name: 'New', exact: true }).click();
      await expect.poll(opened).toBeNull();
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('menu-file').click();
      await page.getByRole('menuitem', { name: 'Open…', exact: true }).click();
      await page.getByTestId('projects-other').click();
      await (
        await chooser
      ).setFiles({
        name: 'shape-fit.mfe.json',
        mimeType: 'application/json',
        buffer: Buffer.from(saved),
      });
      await expect.poll(opened).toEqual({ ...valid, gap: -5 });
      await selectShape(page);
      await expect(page.getByTestId('clip-issues')).toContainText('last valid geometry is kept');
      await gap(page, -0.5);
      await expect.poll(() => state(page)).toEqual(valid);
      await expect(page.getByTestId('clip-issues')).toHaveCount(0);
    });
  }
}
