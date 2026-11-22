import { expect, test } from './test';
import { appearJson, blockLocator, openBlockScene } from './blockHelpers';
import type { MfeWindow } from './helpers';

/* The Animations panel starts its header with what is shown and where (D28). */
test('the Animations panel says what is selected and where', async ({ page }) => {
  const relation = {
    id: 'r1',
    fromClipId: 'a',
    toClipId: 'b',
    offset: 1,
    duration: 1,
    easing: 'smooth',
    style: 'transform',
    pathArc: 0,
    pairs: [{ from: [0], to: [0], style: null }],
  };
  // Clip a (f1) 0–10 s on track 1, clip b (f2) 2–8 s on track 2; a Write of hidden glyph 3.
  await openBlockScene(page, [appearJson('w', 5, 1, 'write', [3])], {
    hidden: [3],
    extra: { relations: [relation] },
  });
  const context = page.getByTestId('panel-animations').getByTestId('an-context');

  await page.getByTestId('clip-a').click({ position: { x: 20, y: 30 } });
  await expect(context).toHaveText(/^Clip · .+ · 0\.00–10\.00 s$/);
  await expect(context.locator('.an-context-kind')).toHaveCSS('text-transform', 'uppercase');

  await blockLocator(page, 'w').click();
  await expect(context).toHaveText('Animation block · Write · on f1 · 5.00–6.00 s');

  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'relation', id: 'r1' }),
  );
  await expect(context).toHaveText('Relation · f1 → f2 · 3.00–4.00 s');

  await page.getByTestId('formula-item').first().click();
  await expect(context).toHaveText('Formula · on 1 clip');
});
