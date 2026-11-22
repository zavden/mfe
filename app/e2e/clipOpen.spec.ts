import { expect, test } from './test';
import { openRelationScene, plain } from './relationsHelpers';
import { project, uiState } from './timelineHelpers';

/* A double-click on a clip opens its formula in the formula editor; the other double-clicks of
 * the timeline keep their meaning. */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);
const RELATION = {
  id: 'r1',
  fromClipId: 'a',
  toClipId: 'b',
  offset: 0,
  duration: 1,
  easing: 'smooth',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [0], to: [0], style: null }],
};

test('a double-click on a clip opens its formula; the clip stays put and selected', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  const before = (await project(page)).clips;
  await page.getByTestId('clip-b').dblclick({ position: { x: 80, y: 8 } });
  const editor = page.getByTestId('formula-editor');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('Formula · f2');
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['b'] });
  expect((await project(page)).clips).toEqual(before);
  // Escape closes it; the Creator list opens the same editor.
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await page.getByTestId('formula-item').first().dblclick();
  await expect(editor).toContainText('Formula · f1');
});

test('no editor from a Shift or Ctrl double-click, or from one on a trim handle', async ({
  page,
}) => {
  await openRelationScene(page, [A, B]);
  const before = (await project(page)).clips;
  const clip = page.getByTestId('clip-a');
  await clip.dblclick({ position: { x: 80, y: 8 }, modifiers: ['Shift'] });
  await clip.dblclick({ position: { x: 80, y: 8 }, modifiers: ['ControlOrMeta'] });
  await page.getByTestId('clip-a-trim-end').dblclick();
  await page.getByTestId('clip-a-trim-start').dblclick();
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);
  expect((await project(page)).clips).toEqual(before);
});

test('a double-click on a relation band inside a clip still opens the relation', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], { relations: [RELATION] });
  await page.getByTestId('relation-window-r1').dblclick();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByTestId('relation-source-window-r1').dblclick();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await expect(page.getByTestId('formula-editor')).toHaveCount(0);
});
