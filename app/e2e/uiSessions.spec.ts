import { expect, test, type Page, type TestInfo } from './test';
import { readFileSync } from 'node:fs';
import { createEmptyProject, createTexFormula, serializeProject, type Project } from '../src/model';
import { blockLocator, emphasisJson, openBlockScene, partJson, tweenJson } from './blockHelpers';
import { forceFallbackFilePaths, pinMathJax } from './creatorHelpers';
import {
  getProject,
  holdToConfirm,
  openAnimationsTab,
  openSubmenu,
  openWithProject,
  undo,
  type MfeWindow,
} from './helpers';
import { plain, relationProject } from './relationsHelpers';
import { box, timeToX } from './timelineHelpers';

const project = async (page: Page) => (await getProject(page)) as unknown as Project;
const historyCount = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __mfe: { useProjectStore: { temporal: { getState(): { pastStates: unknown[] } } } };
        }
      ).__mfe.useProjectStore.temporal.getState().pastStates.length,
  );
const resetHistory = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.history.clear());

async function shots(page: Page, info: TestInfo, name: string) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    );
    await page.screenshot({ path: info.outputPath(`${name}-${theme}.png`) });
  }
}

test('native colour choices commit repeatedly, preview correctly and survive history and save/reopen', async ({
  page,
}, info) => {
  await forceFallbackFilePaths(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const a = plain('a', 'fa', 't1', 0, 8);
  a.initial.color = '#FFFFFF';
  const b = plain('b', 'fa', 't2', 2, 8);
  b.initial.color = '#0000FF';
  await openWithProject(page, relationProject([a, b]));
  await pinMathJax(page);
  await page.getByTestId('clip-a').click();
  await openAnimationsTab(page, 'timing');
  const input = page.getByTestId('initial-color');
  const color = async () => (await project(page)).clips[0]!.initial.color;
  await resetHistory(page);
  for (const next of ['#ff0000', '#00ff00', '#0000ff']) {
    // Chromium's native input/change pair; the control is reacquired after each value update.
    await input.fill(next);
    await expect.poll(color).toBe(next.toUpperCase());
  }
  expect(await historyCount(page)).toBe(3);
  await input.dispatchEvent('change');
  expect(await historyCount(page)).toBe(3);
  await undo(page);
  await expect(input).toHaveValue('#00ff00');
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.redo());
  await expect(input).toHaveValue('#0000ff');
  await input.fill('#00aaff');
  await expect.poll(color).toBe('#00AAFF');
  // Native `input` previews only the swatch; cancellation leaves the project and history intact.
  await input.evaluate((el) => {
    (el as HTMLInputElement).value = '#ff0000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await color()).toBe('#00AAFF');
  expect(await historyCount(page)).toBe(4);
  await input.evaluate((el) => {
    (el as HTMLInputElement).value = '#00aaff';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect
    .poll(async () =>
      page.getByTestId('preview-canvas').evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i] === 0 && data[i + 1] === 170 && data[i + 2] === 255) count++;
        return count;
      }),
    )
    .toBeGreaterThan(10);
  await shots(page, info, 'colour-1440');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await shots(page, info, 'colour-1920');
  await page.getByTestId('initial-color-on').uncheck();
  await expect(input).toBeDisabled();
  await page.getByTestId('initial-color-on').check();
  await input.fill('#ffaa00');
  await expect.poll(color).toBe('#FFAA00');
  await page.getByTestId('clip-b').click();
  await input.fill('#aa00aa');
  expect((await project(page)).clips[1]!.initial.color).toBe('#AA00AA');
  await page.getByTestId('clip-a').click();
  await input.fill('#00aaff');
  const download = page.waitForEvent('download');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Save', exact: true }).click();
  const saved = readFileSync(await (await download).path(), 'utf8');
  expect(
    JSON.parse(saved).clips.map((clip: { initial: { color: string } }) => clip.initial.color),
  ).toEqual(['#00AAFF', '#AA00AA']);
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'New', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  await page.getByTestId('projects-other').click();
  await (
    await chooser
  ).setFiles({
    name: 'colours.mfe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(saved),
  });
  await expect
    .poll(async () => (await project(page)).clips.map((clip) => clip.initial.color))
    .toEqual(['#00AAFF', '#AA00AA']);
});

for (const caller of ['tween', 'transform', 'emphasis'] as const) {
  test(`${caller} colour controls keep committing after value replacement`, async ({ page }) => {
    const action =
      caller === 'tween'
        ? tweenJson('edit', 1, 1, { color: '#FFFFFF' })
        : caller === 'transform'
          ? partJson('edit', 1, 1, [0], { color: '#FFFFFF' })
          : emphasisJson('edit', 1, 1);
    await openBlockScene(page, [action]);
    await pinMathJax(page);
    await blockLocator(page, 'edit').click();
    const input = page.getByTestId(
      caller === 'tween'
        ? 'tween-edit-color'
        : caller === 'transform'
          ? 'block-part-color'
          : 'block-emphasis-color',
    );
    await resetHistory(page);
    for (const color of ['#ff0000', '#00ff00', '#0000ff']) {
      await input.fill(color);
      const block = (await project(page)).clips[0]!.actions[0]!;
      expect(block.kind === 'tween' ? block.to.color : 'color' in block ? block.color : null).toBe(
        color.toUpperCase(),
      );
    }
    expect(await historyCount(page)).toBe(3);
    await undo(page);
    await input.fill('#aa00aa');
    const block = (await project(page)).clips[0]!.actions[0]!;
    expect(block.kind === 'tween' ? block.to.color : 'color' in block ? block.color : null).toBe(
      '#AA00AA',
    );
  });
}

for (const kind of ['shape', 'brace'] as const) {
  test(`attached ${kind} colour controls commit three successive choices`, async ({ page }) => {
    await openBlockScene(page, []);
    await pinMathJax(page);
    const clip = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 1), clip.y + clip.height - 6, { button: 'right' });
    await openSubmenu(page, `add-${kind}`);
    await page.getByTestId(kind === 'shape' ? 'add-shape-box' : 'add-brace-down').click();
    await openAnimationsTab(page, 'timing');
    await resetHistory(page);
    for (const color of ['#ff0000', '#00ff00', '#0000ff']) {
      await page.getByTestId('attachment-color').fill(color);
      expect((await project(page)).formulas.find((f) => f.kind === kind)!.color).toBe(
        color.toUpperCase(),
      );
    }
    expect(await historyCount(page)).toBe(3);
  });
}

test('formula draft, packages, focus and native undo survive wide/narrow transitions and normal Apply/Revert/Cancel', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(page, relationProject([]));
  await pinMathJax(page);
  await page.getByTestId('formula-item').first().dblclick();
  const raw = page.getByTestId('raw-latex');
  const original = await raw.inputValue();
  const field = await raw.elementHandle();
  await raw.fill('a+b+\\frac{c}{d}+\\sqrt{x^2+y^2}');
  await page.getByTestId('package-search').fill('amsmath');
  await page.getByTestId('package-add').click();
  const draft = await raw.inputValue();
  await raw.focus();
  await shots(page, info, 'draft-1440');
  await page.setViewportSize({ width: 740, height: 900 });
  await expect(page.locator('main')).toHaveAttribute('data-layout', 'stacked');
  expect(await field!.evaluate((el) => el.isConnected)).toBe(true);
  await expect(raw).toHaveValue(draft);
  await expect(raw).toBeFocused();
  await expect(page.getByTestId('package-chip-amsmath')).toBeVisible();
  await shots(page, info, 'draft-740');
  await raw.press('End');
  await raw.pressSequentially('z');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('main')).toHaveAttribute('data-layout', 'panels');
  await raw.press('ControlOrMeta+z');
  await expect(raw).toHaveValue(draft);
  expect((await project(page)).formulas[0]!.source).toBe(original);
  await page.getByTestId('editor-close').click();
  await expect(page.getByTestId('dialog')).toContainText('Discard the unapplied changes?');
  await page.setViewportSize({ width: 740, height: 900 });
  await page.getByTestId('dialog-cancel').click();
  await expect(raw).toHaveValue(draft);
  await resetHistory(page);
  await page.getByTestId('editor-apply').click();
  expect((await project(page)).formulas[0]!).toMatchObject({
    source: draft,
    packages: ['amsmath'],
  });
  expect(await historyCount(page)).toBe(1);
  await undo(page);
  await expect(raw).toHaveValue(original);
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.redo());
  await expect(raw).toHaveValue(draft);
  await raw.fill('discard this');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('editor-revert').click();
  await expect(raw).toHaveValue(draft);
  await raw.fill('discard this too');
  await page.getByTestId('editor-close').click();
  await holdToConfirm(page);
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);
  expect((await project(page)).formulas[0]!.source).toBe(draft);
});

test('text layout drafts survive narrow/wide/narrow and Apply remains one undo step', async ({
  page,
}) => {
  const p = createEmptyProject();
  p.formulas.push(createTexFormula({ name: 'caption', source: 'A caption' }));
  await page.setViewportSize({ width: 740, height: 900 });
  await openWithProject(page, serializeProject(p));
  await pinMathJax(page);
  await page.getByTestId('formula-item').dblclick();
  await page.getByTestId('tex-source').fill('An edited caption');
  await page.getByTestId('tex-width').fill('7');
  await page.getByTestId('tex-width').press('Enter');
  await page.getByTestId('tex-align-right').click();
  await page.getByTestId('tex-line-spacing').fill('1.5');
  await page.getByTestId('tex-line-spacing').press('Enter');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setViewportSize({ width: 740, height: 900 });
  await expect(page.getByTestId('tex-source')).toHaveValue('An edited caption');
  await expect(page.getByTestId('tex-width')).toHaveValue('7');
  await expect(page.getByTestId('tex-align-right')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('tex-line-spacing')).toHaveValue('1.5');
  await resetHistory(page);
  await page.getByTestId('text-apply').click();
  expect((await project(page)).formulas[0]!).toMatchObject({
    source: 'An edited caption',
    layout: { width: 7, align: 'right', lineSpacing: 1.5 },
  });
  expect(await historyCount(page)).toBe(1);
});

test('a relation pair draft survives both responsive layouts and saves once', async ({ page }) => {
  const relation = {
    id: 'r',
    fromClipId: 'a',
    toClipId: 'b',
    offset: 2,
    duration: 2,
    easing: 'linear',
    style: 'copy',
    pathArc: 60,
    pairs: [{ from: [0], to: [0], style: null }],
  };
  await openWithProject(
    page,
    relationProject([plain('a', 'fa', 't1', 0, 8), plain('b', 'fb', 't2', 2, 8)], undefined, {
      relations: [relation],
    }),
  );
  await pinMathJax(page);
  await page.getByTestId('relation-source-window-r').dblclick();
  await page.getByTestId('rel-pair-0-style').selectOption('fade');
  await page.setViewportSize({ width: 740, height: 900 });
  await expect(page.getByTestId('rel-pair-0-style')).toHaveValue('fade');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('rel-pair-0-style')).toHaveValue('fade');
  expect((await project(page)).relations[0]!.pairs[0]!.style).toBeNull();
  await resetHistory(page);
  await page.getByTestId('rel-save').click();
  expect((await project(page)).relations[0]!.pairs[0]!.style).toBe('fade');
  expect(await historyCount(page)).toBe(1);
});

test('Edit together selects individual glyphs by keyboard across views and responsive layouts', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithProject(
    page,
    relationProject(
      [],
      [
        { id: 'fa', name: 'first', source: 'abc' },
        { id: 'fb', name: 'second', source: 'def' },
      ],
    ),
  );
  await pinMathJax(page);
  const items = page.getByTestId('formula-item');
  await items.first().click();
  await items.last().click({ modifiers: ['ControlOrMeta'] });
  await items.last().click({ button: 'right' });
  await page.getByTestId('formula-menu-edit-together').click();
  const first = page.getByTestId('multi-fa-chip-1');
  const second = page.getByTestId('multi-fb-chip-1');
  await first.focus();
  await first.press('Enter');
  await second.focus();
  await second.press('ControlOrMeta+Space');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('multi-summary')).toHaveText('2 glyphs in 2 formulas');
  await resetHistory(page);
  await page.getByTestId('multi-palette-YELLOW').focus();
  await page.keyboard.press('Enter');
  expect((await project(page)).formulas.map((f) => f.glyphColors)).toEqual([
    { '1': '#FFFF00' },
    { '1': '#FFFF00' },
  ]);
  expect(await historyCount(page)).toBe(1);
  await second.focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect((await project(page)).formulas.map((f) => f.glyphColors)).toEqual([{}, {}]);
  await expect(second).toBeFocused();
  await shots(page, info, 'glyphs-grid-1440');
  await page.getByTestId('multi-view-cards').focus();
  await page.keyboard.press('Space');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 740, height: 900 });
  await expect(page.getByTestId('multi-summary')).toHaveText('2 glyphs in 2 formulas');
  await second.focus();
  await shots(page, info, 'glyphs-cards-740');
  await page.getByTestId('multi-hide').focus();
  await page.keyboard.press('Enter');
  expect((await project(page)).formulas.map((f) => f.hiddenGlyphs)).toEqual([[1], [1]]);
  expect(await historyCount(page)).toBe(1);
  await second.focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect((await project(page)).formulas.map((f) => f.hiddenGlyphs)).toEqual([[], []]);
  await expect(second).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('multi-view-grid').click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
});
