import { expect, test, type Page } from './test';
import { glyph, openRelationScene, plain, selectClip } from './relationsHelpers';
import { uiState } from './timelineHelpers';

/* Pressing empty space clears the selection (clips, a relation or a formula). */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);

const selection = async (page: Page) => (await uiState(page)).selection.kind;

async function emptyToolbar(page: Page): Promise<void> {
  const box = (await page.locator('.tl-toolbar').boundingBox())!;
  await page.mouse.click(box.x + box.width - 20, box.y + box.height / 2);
}

test.describe('clicking empty space deselects', () => {
  test('clips: an empty lane, the timeline toolbar, the corner; not a button or a header', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await selectClip(page, 'a');
    // Controls and items keep the selection.
    await page.getByTestId('timeline-zoom-in').click();
    await page.getByTestId('track-header-t2').click({ position: { x: 60, y: 6 } });
    expect(await selection(page)).toBe('clips');
    await page.getByTestId('track-lane-t3').click({ position: { x: 900, y: 10 } });
    expect(await selection(page)).toBe('none');

    await selectClip(page, 'a');
    await emptyToolbar(page);
    expect(await selection(page)).toBe('none');

    // The corner: its keys (the height of the tracks) are controls, the room beside them is not.
    await selectClip(page, 'b');
    await page.getByTestId('timeline-row-zoom-in').click();
    await page.getByTestId('timeline-row-zoom-reset').click();
    expect(await selection(page)).toBe('clips');
    await page.locator('.tl-corner').click({ position: { x: 150, y: 13 } });
    expect(await selection(page)).toBe('none');
  });

  test('a formula selected in the Creator: empty list space or the timeline', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    const item = page.getByTestId('formula-item').first();
    await item.click();
    expect(await selection(page)).toBe('formula');
    const list = (await page.getByTestId('formula-list').boundingBox())!;
    const panel = (await page.getByTestId('panel-creator').boundingBox())!;
    // Below the last item.
    await page.mouse.click(
      list.x + 40,
      Math.min(panel.y + panel.height - 10, list.y + list.height + 30),
    );
    expect(await selection(page)).toBe('none');

    await item.click();
    await page.getByTestId('track-lane-t3').click({ position: { x: 900, y: 10 } });
    expect(await selection(page)).toBe('none');
  });

  test('after saving a relation, a click on empty space deselects and Space plays', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await selectClip(page, 'a');
    await page.getByTestId('create-relation-other').selectOption('b');
    await page.getByTestId('create-relation-button').click();
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    expect(await selection(page)).toBe('clips');

    await page.getByTestId('track-lane-t3').click({ position: { x: 900, y: 10 } });
    expect(await selection(page)).toBe('none');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await uiState(page)).playing).toBe(true);
    await expect(page.getByTestId('relation-editor')).toBeHidden();
  });

  test('a selected relation: an empty lane', async ({ page }) => {
    await openRelationScene(page, [A, B], {
      relations: [
        {
          id: 'r1',
          fromClipId: 'a',
          toClipId: 'b',
          offset: 0,
          duration: 1,
          easing: 'smooth',
          style: 'transform',
          pathArc: 0,
          pairs: [{ from: [0], to: [0], style: null }],
        },
      ],
    });
    await page.getByTestId('relation-window-r1').click();
    expect(await selection(page)).toBe('relation');
    await page.getByTestId('track-lane-t3').click({ position: { x: 900, y: 10 } });
    expect(await selection(page)).toBe('none');
  });
});
