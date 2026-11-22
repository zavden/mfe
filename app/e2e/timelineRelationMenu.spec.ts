import { expect, test } from './test';
import { createRelation } from '../src/model';
import { openAnimationsTab, openWithProject, readExample } from './helpers';
import { openRelationScene, plain, relations, selectClip } from './relationsHelpers';
import { box, dragTo, uiState } from './timelineHelpers';

/* The right-click menu of a relation's window band on the timeline: its pair editor, the
 * Edit-path mode on each pair, and deleting it — which is all that is left to a relation with an
 * object of one piece on a side. */

const A = plain('a', 'fa', 't1', 0, 8);
A.initial.position = [-2, 1];
const B = plain('b', 'fb', 't2', 2, 8);
B.initial.position = [2, -1];
const RELATION = {
  id: 'r1',
  fromClipId: 'a',
  toClipId: 'b',
  offset: 0,
  duration: 2,
  easing: 'linear',
  style: 'transform',
  pathArc: 30,
  pairs: [
    { from: [0], to: [0], style: null },
    { from: [1], to: [1], style: null },
  ],
};

test('the band opens the menu: Edit path… per pair, Edit pairs…, Delete relation', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], { relations: [RELATION] });
  await page.getByTestId('relation-window-r1').click({ button: 'right' });
  const menu = page.getByTestId('relation-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('relation-menu-header')).toHaveText('f1 → f2 · 2 pairs');
  expect((await uiState(page)).selection).toEqual({ kind: 'relation', id: 'r1' });
  await expect(page.getByTestId('relation-menu-path-1')).toContainText('arc 30°');
  await page.getByTestId('relation-menu-path-1').click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId('preview-frame')).toHaveAttribute(
    'data-path-edit',
    'relation:r1:1',
  );
  expect((await uiState(page)).time).toBe(3);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-path-edit', '');
  // The source band opens it too; Edit pairs… opens the editor.
  await page.getByTestId('relation-source-window-r1').click({ button: 'right' });
  await page.getByTestId('relation-menu-edit-pairs').click();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
  await page.getByTestId('rel-cancel').click();
  await expect(page.getByTestId('relation-editor')).toBeHidden();
  // Delete relation.
  await page.getByTestId('relation-window-r1').click({ button: 'right' });
  await page.getByTestId('relation-menu-delete').click();
  expect(await relations(page)).toHaveLength(0);
  await expect(page.getByTestId('relation-window-r1')).toHaveCount(0);
});

test('from six pairs on, Choose a pair… opens the path picker dialog', async ({ page }) => {
  const many = {
    ...RELATION,
    pairs: [0, 1, 2, 3, 4, 5].map((g) => ({ from: [g], to: [g], style: null })),
  };
  await openRelationScene(page, [A, B], { relations: [many] }, [
    { id: 'fa', name: 'f1', source: 'a+b+c+d=e' },
    { id: 'fb', name: 'f2', source: 'a+b+c+d=f' },
  ]);
  await page.getByTestId('relation-window-r1').click({ button: 'right' });
  await expect(page.getByTestId('relation-menu-path-0')).toHaveCount(0);
  await page.getByTestId('relation-menu-choose-path').click();
  const picker = page.getByTestId('path-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId(/^path-picker-pair-\d+$/)).toHaveCount(6);
  await expect(picker.getByTestId('path-picker-pair-5-meta')).toHaveText('Transform · arc 30°');
  // Hovering a row lights its link in the diagram; a click opens the mode on that pair.
  await picker.getByTestId('path-picker-pair-5').hover();
  await expect(picker.getByTestId('rd-edge-r1-5')).toHaveClass(/is-picked/);
  await picker.getByTestId('path-picker-pair-5').click();
  await expect(picker).toBeHidden();
  await expect(page.getByTestId('preview-frame')).toHaveAttribute(
    'data-path-edit',
    'relation:r1:5',
  );
});

test('a relation a file holds with a brace on a side can only be deleted: what would edit it says why', async ({
  page,
}) => {
  // The brace under 1+2+3 (clip c_first) lends a copy of itself to the "+" of "6+15=21"
  // (c_total): a relation the editor no longer makes (`relation-kind`, audit A1-02).
  const project = JSON.parse(readExample('braces.mfe.json')) as { relations: unknown[] };
  project.relations.push({
    ...createRelation('c_first', 'c_total', {
      style: 'copy',
      pairs: [{ from: [0], to: [1], style: null }],
    }),
    id: 'piece',
  });
  await openWithProject(page, JSON.stringify(project));
  const reason =
    '"first" is a brace, one piece: a relation is between formulas and texts, so this one cannot be edited, only deleted.';
  const band = page.getByTestId('relation-window-piece');
  const stored = async () => (await relations(page)).find((r) => r.id === 'piece');
  const before = await stored();
  // The band's menu: Edit pairs… and Edit path greyed out, saying why; Delete relation is not.
  await band.click({ button: 'right' });
  for (const id of ['relation-menu-edit-pairs', 'relation-menu-path-0']) {
    await expect(page.getByTestId(id)).toBeDisabled();
    await expect(page.getByTestId(id)).toHaveAttribute('title', reason);
  }
  await expect(page.getByTestId('relation-menu-delete')).toBeEnabled();
  await page.keyboard.press('Escape');
  // Its panel (the right-click selected it): the same, and its settings too.
  const panel = page.getByTestId('relation-properties');
  for (const id of ['relation-edit-pairs', 'relation-pair-0-edit-path']) {
    await expect(panel.getByTestId(id)).toBeDisabled();
    await expect(panel.getByTestId(id)).toHaveAttribute('title', reason);
  }
  for (const id of ['relation-offset', 'relation-duration', 'relation-style']) {
    await expect(panel.getByTestId(id)).toBeDisabled();
  }
  await expect(panel.getByTestId('relation-delete')).toBeEnabled();
  // Its band is not dragged: the window stays.
  const b = await box(band);
  await dragTo(
    page,
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    {
      x: b.x + b.width / 2 + 60,
      y: b.y + b.height / 2,
    },
  );
  expect(await stored()).toEqual(before);
  // A double-click opens the editor, which says why it edits nothing.
  await band.dblclick();
  await expect(page.getByTestId('rel-error')).toHaveText(reason);
  await page.getByTestId('rel-error-ok').click();
  await expect(page.getByTestId('relation-editor')).toHaveCount(0);
  // The Relations tab of the formula's clip lists it with Edit… and Edit path… greyed out.
  await selectClip(page, 'c_total');
  await openAnimationsTab(page, 'relations');
  for (const id of ['relation-edit-piece', 'relation-edit-path-piece']) {
    await expect(page.getByTestId(id)).toBeDisabled();
    await expect(page.getByTestId(id)).toHaveAttribute('title', reason);
  }
  await expect(page.getByTestId('relation-delete-piece')).toBeEnabled();
  // What the warning says to do: Delete relation, in the menu of its band.
  await band.click({ button: 'right' });
  await page.getByTestId('relation-menu-delete').click();
  await expect(band).toHaveCount(0);
  expect(await stored()).toBeUndefined();
});
