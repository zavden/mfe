import { expect, test, type Page } from './test';
import type { Project } from '../src/model';
import { appearJson, disappearJson, morphJson } from './blockHelpers';
import { canUndo, getProject, undo, type MfeWindow } from './helpers';
import { clickScene, openTwoApart, scenePoint, type Point } from './previewHelpers';
import { openRelationScene, plain } from './relationsHelpers';
import { clipJson } from './timelineHelpers';

const RELATION = {
  id: 'r1',
  fromClipId: 'a',
  toClipId: 'b',
  offset: 0,
  duration: 2,
  easing: 'linear',
  style: 'copy',
  pathArc: 60,
  pairs: [{ from: [0], to: [0], style: null }],
};
const a = plain('a', 'fa', 't1', 0, 8);
a.initial.position = [-2, 1];
const b = plain('b', 'fa', 't2', 2, 8);
b.initial.position = [2, -1];
const formulas = [{ id: 'fa', name: 'letters', source: 'abc' }];
const frame = (page: Page) => page.getByTestId('preview-frame');

for (const edited of ['first', 'second']) {
  test(`relation ${edited} rejects another owner's glyph through Save and Edit path`, async ({
    page,
  }, info) => {
    const clips = [
      plain('a', 'fa', 't1', 0, 8),
      plain('b', 'fa', 't2', 0, 8),
      plain('c', 'fa', 't3', 2, 8),
    ];
    const relations = [
      {
        ...RELATION,
        id: 'first',
        fromClipId: 'a',
        toClipId: 'c',
        pairs: [{ from: [0], to: [0], style: null }],
      },
      {
        ...RELATION,
        id: 'second',
        fromClipId: 'b',
        toClipId: 'c',
        pairs: [{ from: [1], to: [1], style: null }],
      },
    ];
    await openRelationScene(page, clips, { relations }, formulas);
    const before = await getProject(page);
    // Both incoming relations share a target band; their source bands remain separate.
    await page.getByTestId(`relation-source-window-${edited}`).dblclick();
    const glyph = edited === 'first' ? 1 : 0;
    await page.getByTestId(`rel-from-glyph-${glyph}`).click();
    await page.getByTestId(`rel-to-glyph-${glyph}`).click();
    await expect(page.getByTestId('rel-problems')).toContainText(
      'brought in by more than one pair',
    );
    await expect(page.getByTestId('rel-save')).toBeDisabled();
    await page.getByTestId(`rel-to-glyph-${glyph}`).click({ button: 'right' });
    await expect(page.getByTestId('rel-style-menu-edit-path')).toBeDisabled();
    await expect(page.getByTestId('rel-style-menu-path-blocked')).toContainText('Fix the problems');
    expect(await getProject(page)).toEqual(before);
    expect(await canUndo(page)).toBe(false);
    if (edited === 'first') {
      for (const theme of ['dark', 'light']) {
        await page.evaluate(
          (value) => document.documentElement.setAttribute('data-theme', value),
          theme,
        );
        await page.screenshot({ path: info.outputPath(`blocked-relation-${theme}.png`) });
      }
    }
    await page.keyboard.press('Escape');
    await page.getByTestId('rel-pair-1-delete').click();
    await page.getByTestId('rel-pair-0-style').selectOption('fade');
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toHaveCount(0);
    await undo(page);
    expect(await getProject(page)).toEqual(before);
    expect(await canUndo(page)).toBe(false);
  });
}

test('Morph Edit path shares validation, and a repaired draft saves in one step', async ({
  page,
}) => {
  const clip = clipJson('a', 'fa', 't1', 0, 6, {
    actions: [
      morphJson('m', 2, 1),
      disappearJson('d', 3.2, 0.5, 'fade_out', [1]),
      appearJson('ap', 4, 0.5, 'fade_in', [1]),
    ],
  });
  await openRelationScene(page, [clip], {}, [{ id: 'fa', name: 'steps', source: 'A=x_1=x_2' }]);
  const before = await getProject(page);
  await page.evaluate(() =>
    (window as MfeWindow)
      .__mfe!.useMorphEditorStore.getState()
      .open({ clipId: 'a', actionId: 'm' }),
  );
  await page.getByTestId('morph-from-glyph-1').click();
  await page.getByTestId('morph-to-glyph-4').click();
  await page.getByTestId('morph-pair-0-style').selectOption('transform');
  await expect(page.getByTestId('morph-save')).toBeDisabled();
  await page.getByTestId('morph-to-glyph-4').click({ button: 'right' });
  await expect(page.getByTestId('morph-style-menu-edit-path')).toBeDisabled();
  expect(await getProject(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await page.getByTestId('morph-pair-0-style').selectOption('copy');
  await page.getByTestId('morph-to-glyph-4').click({ button: 'right' });
  await page.getByTestId('morph-style-menu-edit-path').click();
  await expect(page.getByTestId('morph-editor')).toHaveCount(0);
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'morph:m:0');
  await undo(page);
  expect(await getProject(page)).toEqual(before);
  expect(await canUndo(page)).toBe(false);
});

interface PathNode {
  at: Point;
  in: Point | null;
  out: Point | null;
}
async function pathNodes(page: Page): Promise<PathNode[]> {
  return JSON.parse((await frame(page).getAttribute('data-path-nodes')) || '[]') as PathNode[];
}
async function clickNode(page: Page, point: Point): Promise<void> {
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + point[0], canvas.y + point[1]);
}

test('pointer insertion, endpoint selection, Undo, Delete and arrows retain a valid path session', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openRelationScene(page, [a, b], { relations: [RELATION] }, formulas);
  await page.getByTestId('relation-window-r1').click({ button: 'right' });
  await page.getByTestId('relation-menu-path-0').click();
  const [first, last] = await pathNodes(page);
  const midpoint: Point = [
    (first!.at[0] + 3 * first!.out![0] + 3 * last!.in![0] + last!.at[0]) / 8,
    (first!.at[1] + 3 * first!.out![1] + 3 * last!.in![1] + last!.at[1]) / 8,
  ];
  await clickNode(page, midpoint);
  await expect.poll(async () => (await pathNodes(page)).length).toBe(3);
  await clickNode(page, (await pathNodes(page))[2]!.in!);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '2:in');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await pathNodes(page)).length).toBe(2);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '');
  const before = await getProject(page);
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowUp');
  expect(await getProject(page)).toEqual(before);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => (await pathNodes(page)).length).toBe(3);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '');
  expect(errors).toEqual([]);
});

for (const track of ['t1', 't2']) {
  test(`locked ${track} refuses relation-menu deletion and path entry`, async ({ page }, info) => {
    await openRelationScene(page, [a, b], { relations: [RELATION] }, formulas);
    await page.getByTestId(`track-lock-${track}`).click();
    const before = await getProject(page);
    await page.getByTestId('relation-window-r1').click({ button: 'right' });
    await expect(page.getByTestId('relation-menu-delete')).toBeDisabled();
    await expect(page.getByTestId('relation-menu-path-0')).toBeDisabled();
    await expect(page.getByTestId('relation-menu-locked')).toContainText('is locked');
    if (track === 't1') {
      for (const theme of ['dark', 'light']) {
        await page.evaluate(
          (value) => document.documentElement.setAttribute('data-theme', value),
          theme,
        );
        await page.screenshot({ path: info.outputPath(`locked-relation-${theme}.png`) });
      }
    }
    await page.keyboard.press('Escape');
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.usePathEdit.getState().open({
        origin: { kind: 'relation', relationId: 'r1' },
        index: 0,
      }),
    );
    await expect(frame(page)).toHaveAttribute('data-path-edit', '');
    expect(await getProject(page)).toEqual(before);
    await page.getByTestId(`track-lock-${track}`).click();
    await page.getByTestId('relation-window-r1').click({ button: 'right' });
    await page.getByTestId('relation-menu-path-0').click();
    await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  });
}

async function glyphPoint(page: Page, clipId: string, index: number): Promise<Point> {
  return page.evaluate(
    ([clipId, index]) => {
      const project = (window as MfeWindow).__mfe!.useProjectStore.getState()
        .project as unknown as Project;
      const clip = project.clips.find((c) => c.id === clipId)!;
      const glyph = project.formulas.find((f) => f.id === clip.formulaId)!.snapshot!.glyphs[index]!;
      return [
        clip.initial.position[0] + glyph.center[0],
        clip.initial.position[1] + glyph.center[1],
      ] as Point;
    },
    [clipId, index] as const,
  );
}

test('a real preview pick follows equal-count canonical reordering before the Color command', async ({
  page,
}) => {
  await openTwoApart(page);
  await clickScene(page, await glyphPoint(page, 'ca', 1), 'Alt');
  await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:1');
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const store = mfe.useProjectStore.getState() as unknown as {
      project: Project;
      amend(recipe: (draft: Project) => void): void;
    };
    const formula = store.project.formulas.find((f) => f.id === 'fa')!;
    const map = [1, 0, 2, 3, 4];
    const render = mfe.useRenderStore.getState() as unknown as {
      setTransition(id: string, value: { from: string; to: string; map: number[] }): void;
    };
    render.setTransition(formula.id, { from: formula.snapshot!.key, to: 'browser-reordered', map });
    store.amend((draft) => {
      const current = draft.formulas.find((f) => f.id === 'fa')!;
      const snapshot = current.snapshot!;
      current.snapshot = {
        ...snapshot,
        key: 'browser-reordered',
        glyphs: map.map((i) => snapshot.glyphs[i]!),
      };
    });
  });
  await expect(frame(page)).toHaveAttribute('data-glyph-pick', 'ca:0');
  await page.getByTestId('glyph-pick-color').click();
  await page.getByTestId('glyph-pick-color-menu-color-RED').click();
  expect((await getProject(page)).formulas.find((f) => f.id === 'fa')!.glyphColors).toEqual({
    '0': '#FC6255',
  });
});

test('document replacement during an Alt press cannot create a pick in the new document', async ({
  page,
}) => {
  await openTwoApart(page);
  const point = await scenePoint(page, await glyphPoint(page, 'ca', 1));
  await page.keyboard.down('Alt');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.loadProject(structuredClone(mfe.useProjectStore.getState().project));
  });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(frame(page)).toHaveAttribute('data-glyph-pick', '');
  expect(await canUndo(page)).toBe(false);
});
