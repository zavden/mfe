import { expect, test } from './test';
import { openRelationScene, plain } from './relationsHelpers';
import { uiState } from './timelineHelpers';

/* The Animations panel shows the pairs of the selected relation only; "All related…" opens every
 * relation connected to it as one chain. */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);
const C = plain('c', 'fa', 't3', 4, 10);
const relation = (id: string, fromClipId: string, toClipId: string) => ({
  id,
  fromClipId,
  toClipId,
  offset: 0,
  duration: 1,
  easing: 'smooth',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [0], to: [0], style: null }],
});
const RELATIONS = { relations: [relation('r1', 'a', 'b'), relation('r2', 'b', 'c')] };

test('a selected relation shows its two clips; "All related…" shows the whole chain', async ({
  page,
}) => {
  await openRelationScene(page, [A, B, C], RELATIONS);
  await page.getByTestId('relation-window-r2').click();
  const panel = page.getByTestId('relation-properties');
  const diagram = panel.getByTestId('relation-diagram');
  await expect(diagram).toHaveAttribute('data-blocks', '2');
  await expect(diagram.getByTestId('rd-block-b')).toBeVisible();
  await expect(diagram.getByTestId('rd-block-a')).toHaveCount(0); // r1 is not this relation
  await expect(diagram.getByTestId('rd-edge-r1-0')).toHaveCount(0);

  await panel.getByTestId('relation-show-related').click();
  const dialog = page.getByTestId('relation-chain');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('relation-chain-summary')).toContainText('3 clips · 2 relations');
  const chain = dialog.getByTestId('relation-chain-diagram');
  await expect(chain).toHaveAttribute('data-blocks', '3');
  // The clips of the selected relation are emphasised, and its arrow is selected.
  await expect(chain.getByTestId('rd-block-a')).toHaveAttribute('data-current', 'false');
  await expect(chain.getByTestId('rd-block-c')).toHaveAttribute('data-current', 'true');
  await expect(chain.getByTestId('rd-edge-r2-0')).toHaveClass(/is-selected/);

  // Clicking another arrow selects its relation; the dialog stays.
  await chain.getByTestId('rd-edge-r1-0').locator('.rd-edge-hit').first().click({ force: true });
  expect((await uiState(page)).selection).toEqual({ kind: 'relation', id: 'r1' });
  await expect(chain.getByTestId('rd-edge-r1-0')).toHaveClass(/is-selected/);
  await expect(chain.getByTestId('rd-block-a')).toHaveAttribute('data-current', 'true');
  await expect(chain.getByTestId('rd-block-c')).toHaveAttribute('data-current', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('relation-title')).toHaveText('f1 → f2');
});

test('the clip view keeps the relations of the clip and opens the chain too', async ({ page }) => {
  await openRelationScene(page, [A, B, C], RELATIONS);
  await page.getByTestId('clip-c').click({ position: { x: 30, y: 8 } });
  const section = page.getByTestId('clip-relations');
  await expect(section.getByTestId('relation-diagram')).toHaveAttribute('data-blocks', '2');
  await section.getByTestId('clip-show-related').click();
  const chain = page.getByTestId('relation-chain-diagram');
  await expect(chain).toHaveAttribute('data-blocks', '3');
  await expect(chain.getByTestId('rd-block-c')).toHaveAttribute('data-current', 'true');
  await expect(chain.getByTestId('rd-block-b')).toHaveAttribute('data-current', 'false');
  await page.getByTestId('relation-chain-done').click();
  await expect(page.getByTestId('relation-chain')).toBeHidden();
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['c'] });
});
