import { expect, test, type Page } from './test';
import { openBlockScene, partJson, PX_PER_SECOND } from './blockHelpers';
import type { MfeWindow } from './helpers';
import { relations } from './relationsHelpers';
import { box, canUndo, dragTo, uiState, undo } from './timelineHelpers';

/* Dragging a relation's window band on the timeline. Clip `a` (0–10 s, track 1) and clip `b`
 * (2–8 s, track 2); relation b → a brings glyph 0 of `a` over [2, 3]. A part transform of glyph 0
 * of `a` runs over [5, 6]: the window may end at 5, never later. */

const RELATION = {
  id: 'r1',
  fromClipId: 'b',
  toClipId: 'a',
  offset: 2,
  duration: 1,
  easing: 'smooth',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [0], to: [0], style: null }],
};

async function windowOf(page: Page): Promise<{ offset: number; duration: number }> {
  const [r] = await relations(page);
  return { offset: r!.offset, duration: r!.duration };
}

/** Drag the target clip's band by `seconds`: its body, or one of its edges. */
async function dragWindow(
  page: Page,
  seconds: number,
  edge: 'move' | 'start' | 'end' = 'move',
  shift = false,
): Promise<void> {
  const b = await box(page.getByTestId('relation-window-r1'));
  const y = b.y + b.height / 2;
  const x = edge === 'start' ? b.x + 2 : edge === 'end' ? b.x + b.width - 2 : b.x + b.width / 2;
  await dragTo(page, { x, y }, { x: x + seconds * PX_PER_SECOND, y }, { shift });
}

test.describe('relation window drag', () => {
  test('the band moves the window, its edges resize it, and a block of its glyphs stops it', async ({
    page,
  }) => {
    await openBlockScene(page, [partJson('p', 5, 1, [0])], { extra: { relations: [RELATION] } });
    await expect(page.getByTestId('relation-window-r1')).toBeVisible();
    // Dragged 3 s to the right, onto the part transform of glyph 0, the window stops where the
    // block starts (dragged past the block it would land after it, which is fine).
    await dragWindow(page, 3);
    expect(await windowOf(page)).toEqual({ offset: 4, duration: 1 });
    expect((await uiState(page)).selection).toMatchObject({ kind: 'relation', id: 'r1' });
    // One undo step per drag.
    await undo(page);
    expect(await windowOf(page)).toEqual({ offset: 2, duration: 1 });
    expect(await canUndo(page)).toBe(false);
    // The end edge, stretched past the block: it stops at the block too.
    await dragWindow(page, 4, 'end');
    expect(await windowOf(page)).toEqual({ offset: 2, duration: 3 });
    // The start edge, within the window.
    await dragWindow(page, 1, 'start', true);
    expect(await windowOf(page)).toEqual({ offset: 3, duration: 2 });
    // The source clip's band drags the same window.
    const source = await box(page.getByTestId('relation-source-window-r1'));
    const y = source.y + source.height / 2;
    const x = source.x + source.width / 2;
    await dragTo(page, { x, y }, { x: x - PX_PER_SECOND, y }, { shift: true });
    expect(await windowOf(page)).toEqual({ offset: 2, duration: 2 });
  });

  test('a readout over the band shows the window while it is dragged', async ({ page }) => {
    await openBlockScene(page, [], { extra: { relations: [RELATION] } });
    await expect(page.getByTestId('relation-window-readout')).toHaveCount(0);
    const b = await box(page.getByTestId('relation-window-r1'));
    const y = b.y + b.height / 2;
    const x = b.x + b.width - 2;
    await dragTo(page, { x, y }, { x: x + 2 * PX_PER_SECOND, y }, { shift: true, release: false });
    await expect(page.getByTestId('relation-window-readout')).toHaveText('2.00 → 5.00 s · 3.00 s');
    await page.mouse.up();
    await expect(page.getByTestId('relation-window-readout')).toHaveCount(0);
    expect(await windowOf(page)).toEqual({ offset: 2, duration: 3 });
  });

  test('a relation of a locked track selects but does not move', async ({ page }) => {
    await openBlockScene(page, [], { extra: { relations: [RELATION] } });
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.tracks.find((t) => t.id === 't1')!.locked = true;
      });
    });
    await dragWindow(page, 2);
    expect(await windowOf(page)).toEqual({ offset: 2, duration: 1 });
    expect((await uiState(page)).selection).toMatchObject({ kind: 'relation', id: 'r1' });
  });
});
