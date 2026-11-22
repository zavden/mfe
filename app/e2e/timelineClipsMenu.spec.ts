import { expect, test, type Page } from './test';
import { forceFallbackFilePaths, pinMathJax } from './creatorHelpers';
import { getProject, openSubmenu, openWithProject, undo, type MfeWindow } from './helpers';
import { plain, relationProject } from './relationsHelpers';
import { uiState } from './timelineHelpers';

/* Several clips selected on the timeline: the right-click (or Shift+F10) menu offers what the
 * Creator offers their formulas — Edit together…, Apply match colors — and Duplicate / Delete of
 * the clips. A single clip keeps the Add animation menu. */

const RED = '#FC6255';
const BLUE = '#58C4DD';

/** f1 "a x + b" (clip a) and f2 "y = x^2" (clip b), and the list "Course": x red, + blue. */
async function openScene(page: Page): Promise<void> {
  await forceFallbackFilePaths(page);
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(
    page,
    relationProject(
      [plain('a', 'fa', 't1', 0, 6), plain('b', 'fb', 't2', 0, 6)],
      [
        { id: 'fa', name: 'f1', source: 'a x + b' },
        { id: 'fb', name: 'f2', source: 'y = x^2' },
      ],
    ),
  );
  await pinMathJax(page);
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      draft.colorMatches.push({
        id: 'm1',
        name: 'Course',
        entries: [
          { pattern: '$x$', color: '#FC6255' },
          { pattern: '+', color: '#58C4DD' },
        ],
      });
    });
    mfe.history.clear();
  });
  await expect
    .poll(async () =>
      (await getProject(page)).formulas.every((f) => (f as { snapshot?: unknown }).snapshot),
    )
    .toBeTruthy();
}

/** The per-glyph colours of formula `i`, keyed by glyph label. */
async function coloursByLabel(page: Page, i: number): Promise<Record<string, string>> {
  const formula = (await getProject(page)).formulas[i]! as unknown as {
    glyphColors: Record<string, string>;
    snapshot: { glyphs: { label: string }[] } | null;
  };
  const out: Record<string, string> = {};
  for (const [index, color] of Object.entries(formula.glyphColors)) {
    out[formula.snapshot!.glyphs[Number(index)]!.label] = color;
  }
  return out;
}

const clip = (page: Page, id: string) => page.getByTestId(`clip-${id}`);
const menu = (page: Page) => page.getByTestId('clips-menu');

async function selectBoth(page: Page): Promise<void> {
  await clip(page, 'a').click({ position: { x: 30, y: 8 } });
  await clip(page, 'b').click({ position: { x: 30, y: 8 }, modifiers: ['ControlOrMeta'] });
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a', 'b'] });
}

test.describe('timeline: the menu of several selected clips', () => {
  test('right-click on one of them opens it; Edit together… opens the multi editor', async ({
    page,
  }) => {
    await openScene(page);
    await selectBoth(page);
    await clip(page, 'b').click({ button: 'right', position: { x: 30, y: 8 } });
    await expect(menu(page)).toBeVisible();
    await expect(page.getByTestId('clips-menu-header')).toHaveText('2 clips · 2 formulas');
    await expect(page.getByTestId('add-animation-menu')).toHaveCount(0);
    await page.getByTestId('clips-menu-edit-together').click();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByTestId('multi-editor')).toBeVisible();
  });

  test('applies a match colour list to the formulas of the clips, as one undo step', async ({
    page,
  }) => {
    await openScene(page);
    await selectBoth(page);
    await clip(page, 'a').click({ button: 'right', position: { x: 30, y: 8 } });
    await openSubmenu(page, 'clips-menu-match');
    await page.getByTestId('clips-menu-match-m1').click();
    await expect(menu(page)).toHaveCount(0);
    await expect.poll(() => coloursByLabel(page, 0)).toEqual({ x: RED, '+': BLUE });
    expect(await coloursByLabel(page, 1)).toEqual({ x: RED });
    await undo(page);
    expect((await getProject(page)).formulas.map((f) => f.glyphColors)).toEqual([{}, {}]);
  });

  test('duplicates and deletes the clips; Shift+F10 opens it too; one clip keeps Add animation', async ({
    page,
  }) => {
    await openScene(page);
    await selectBoth(page);
    await clip(page, 'a').click({ button: 'right', position: { x: 30, y: 8 } });
    await page.getByTestId('clips-menu-duplicate').click();
    expect((await getProject(page)).clips).toHaveLength(4);
    const copies = (await uiState(page)).selection;
    expect(copies.kind).toBe('clips');
    expect(copies.ids ?? []).toHaveLength(2);
    await expect(page.getByTestId('announcer')).toHaveText('2 clips duplicated');

    // The copies are selected: the keyboard opens their menu from a focused clip.
    const first = copies.ids?.[0] ?? '';
    await clip(page, first).focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu(page)).toBeVisible();
    await expect(page.getByTestId('clips-menu-delete')).toHaveText('Delete 2 clips');
    await page.getByTestId('clips-menu-delete').click();
    expect((await getProject(page)).clips.map((c) => c.id)).toEqual(['a', 'b']);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    await undo(page);
    expect((await getProject(page)).clips).toHaveLength(4);

    // A single selected clip: the Add animation menu, as before.
    await clip(page, 'a').click({ position: { x: 30, y: 8 } });
    await clip(page, 'a').click({ button: 'right', position: { x: 30, y: 8 } });
    await expect(page.getByTestId('add-animation-menu')).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
  });
  test('Apply match colors › opens beside its entry, to the left near the window edge', async ({
    page,
  }) => {
    await openScene(page);
    await selectBoth(page);
    // A narrower window, so that the clip reaches near its right edge: a submenu opened there
    // would leave it.
    await page.setViewportSize({ width: 820, height: 950 });
    const box = (await clip(page, 'b').boundingBox())!;
    const width = await page.evaluate(() => innerWidth);
    expect(box.x + box.width).toBeGreaterThan(width - 250);
    await clip(page, 'b').click({ button: 'right', position: { x: box.width - 30, y: 8 } });
    await expect(menu(page)).toBeVisible();
    await openSubmenu(page, 'clips-menu-match');
    const entry = (await page.getByTestId('clips-menu-match').boundingBox())!;
    const panel = page.getByTestId('clips-menu-match-submenu');
    await expect(panel).toHaveClass(/is-flipped/);
    const pbox = (await panel.boundingBox())!;
    expect(pbox.x + pbox.width).toBeLessThanOrEqual(entry.x + 1);
    expect(pbox.x).toBeGreaterThanOrEqual(8);
    await expect(page.getByTestId('clips-menu-match-m1')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
  });
});
