import { expect, test, type Page } from './test';
import { closeEditor, pinMathJax, waitForDrawables } from './creatorHelpers';
import {
  canUndo,
  getProject,
  openSubmenu,
  openWithProject,
  projectFile,
  selectionOf,
  setTime,
  undo,
  type MfeWindow,
} from './helpers';
import { scenePoint } from './previewHelpers';
import { clipJson, type ActionJson } from './timelineHelpers';

/* Align by symbol: click the symbol to move, of one formula, then the reference symbol, of
 * another, then pick a side on the compass; the first formula moves so that its symbol lands
 * there. */

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const frame = (page: Page) => page.getByTestId('preview-frame');
const compass = (page: Page) => page.getByTestId('symbol-compass');

/** A: "a+b=c" at (0, 1.5), with `actionsA`; B: "x=y" at (-2, -1). */
async function openTwo(page: Page, lockB = false, actionsA: ActionJson[] = []): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 6, { actions: actionsA });
  ca.initial.position = [0, 1.5];
  const cb = clipJson('cb', 'fb', 't2', 0, 6);
  cb.initial.position = [-2, -1];
  const formulas = [
    { id: 'fa', name: 'A', source: 'a+b=c', color: '#58C4DD' },
    { id: 'fb', name: 'B', source: 'x=y', color: '#83C167' },
  ];
  const tracks = ['t1', 't2'].map((id) => ({
    id,
    name: id,
    hidden: false,
    locked: lockB && id === 't2',
  }));
  await openWithProject(page, projectFile('symbols', formulas, [ca, cb], { tracks }));
  await setTime(page, 3);
  await waitForDrawables(page, 8); // 5 + 3 glyphs, written by then
}

/** The box of the glyph labelled `label` of a clip's formula, on the frame (scene units). */
async function glyphBox(page: Page, clipId: string, label: string): Promise<Box> {
  return page.evaluate(
    ([id, wanted]) => {
      const mfe = (window as MfeWindow).__mfe!;
      const clip = mfe.useProjectStore.getState().project.clips.find((c) => c.id === id)!;
      const [x, y] = (clip as unknown as { initial: { position: [number, number] } }).initial
        .position;
      const entry = mfe.useRenderStore.getState().resolved.get(clip.formulaId) as unknown as {
        render: { glyphs: { label: string; bbox: Box }[] };
      };
      const glyph = entry.render.glyphs.find((g) => g.label === wanted)!;
      const b = glyph.bbox;
      return { minX: x + b.minX, minY: y + b.minY, maxX: x + b.maxX, maxY: y + b.maxY };
    },
    [clipId, label] as const,
  );
}

/** Lock a clip in the preview, as its menu on the timeline does. */
async function lockInPreview(page: Page, clipId: string): Promise<void> {
  await page.evaluate((id) => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      (draft.clips.find((c) => c.id === id) as { previewLocked?: boolean }).previewLocked = true;
    });
    (window as MfeWindow).__mfe!.history.clear();
  }, clipId);
}

async function clickGlyph(page: Page, clipId: string, label: string): Promise<void> {
  const b = await glyphBox(page, clipId, label);
  const { x, y } = await scenePoint(page, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]);
  await page.mouse.click(x, y);
}

const positionOf = (page: Page, clipId: string) =>
  page.evaluate(
    (id) =>
      (
        (window as MfeWindow)
          .__mfe!.useProjectStore.getState()
          .project.clips.find((c) => c.id === id) as unknown as {
          initial: { position: [number, number] };
        }
      ).initial.position,
    clipId,
  );

test.describe('Preview align by symbol', () => {
  test('two clicks and a side: the first formula moves so that its "=" lands on the second', async ({
    page,
  }) => {
    await openTwo(page);
    const button = page.getByTestId('preview-align-symbol');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await expect(page.getByTestId('preview-hint')).toContainText('click the symbol to move');
    // A click on nothing is ignored.
    const empty = await scenePoint(page, [3, -3]);
    await page.mouse.click(empty.x, empty.y);
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    // What moves comes first: the "=" of B…
    await clickGlyph(page, 'cb', '=');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await expect(page.getByTestId('preview-hint')).toContainText(
      'the reference symbol on another formula: “=” goes to it',
    );
    // …then where it goes. A symbol of the formula that moves is no reference for it.
    await clickGlyph(page, 'cb', 'x');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    const before = await glyphBox(page, 'cb', '=');
    const reference = await glyphBox(page, 'ca', '=');
    await clickGlyph(page, 'ca', '=');
    await expect(compass(page)).toBeVisible();
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'direction');
    await expect(page.getByTestId('compass-CENTER')).toBeFocused();
    await page.getByTestId('compass-LEFT').click();
    await expect(compass(page)).toHaveCount(0);
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    // B moved in x only, by the gap between the two left edges.
    const after = await glyphBox(page, 'cb', '=');
    expect(after.minX).toBeCloseTo(reference.minX, 5);
    expect(after.minY).toBeCloseTo(before.minY, 6);
    expect(await positionOf(page, 'ca')).toEqual([0, 1.5]);
    expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['cb'] });
    await undo(page);
    expect(await positionOf(page, 'cb')).toEqual([-2, -1]);
    expect(await canUndo(page)).toBe(false);
  });

  test('Shift+Alt+G takes the reference symbol from a formula locked in the preview', async ({
    page,
  }) => {
    await openTwo(page);
    // With no formula locked there is nothing to click: a notice says how one is locked.
    await page.keyboard.press('Shift+Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    await expect(page.getByTestId('notice')).toContainText('No formula is locked in the preview');
    await lockInPreview(page, 'ca');
    // Alt+G does not reach a locked formula: after the symbol to move, a click on the "=" of
    // the locked one is a click on nothing.
    await page.keyboard.press('Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await clickGlyph(page, 'ca', '=');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await clickGlyph(page, 'cb', '=');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await clickGlyph(page, 'ca', '=');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    // Shift+Alt+G starts over, with the reference on the locked ones. The symbol to move is
    // still of a formula that is not locked…
    await page.keyboard.press('Shift+Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await clickGlyph(page, 'ca', '=');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    const before = await glyphBox(page, 'cb', '=');
    const reference = await glyphBox(page, 'ca', '=');
    await clickGlyph(page, 'cb', '=');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await expect(page.getByTestId('preview-hint')).toContainText(
      'the reference symbol on a locked formula: “=” goes to it',
    );
    // …and the reference is of a locked one, and of those alone.
    await clickGlyph(page, 'cb', 'x');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await clickGlyph(page, 'ca', '=');
    await expect(compass(page)).toBeVisible();
    await page.getByTestId('compass-LEFT').click();
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    const after = await glyphBox(page, 'cb', '=');
    expect(after.minX).toBeCloseTo(reference.minX, 5);
    expect(after.minY).toBeCloseTo(before.minY, 6);
    expect(await positionOf(page, 'ca')).toEqual([0, 1.5]);
    await undo(page);
    expect(await positionOf(page, 'cb')).toEqual([-2, -1]);

    // From the keyboard too: the arrows walk the symbols of the formula that is not locked for
    // the one to move, then those of the locked formula for the reference.
    await page.keyboard.press('Shift+Alt+g');
    await page.keyboard.press('ArrowRight');
    await expect(frame(page)).toHaveAttribute('data-hover', 'cb:0');
    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await expect(page.getByTestId('preview-hint')).toContainText('“x” goes to it');
    await page.keyboard.press('ArrowRight');
    await expect(frame(page)).toHaveAttribute('data-hover', 'ca:0');
    await page.keyboard.press('Escape');
    // The same shortcut leaves the mode; the Edit menu has it too.
    await page.keyboard.press('Shift+Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await page.keyboard.press('Shift+Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
  });

  test('measures the reference where it is when the side is chosen, not where it was clicked', async ({
    page,
  }) => {
    // A moves 3 units right between 3.5 s and 4.5 s: click B's "=" and then A's at 3 s, scrub to
    // 5 s with the compass open, and choose Left: B lands on where A's "=" is now.
    await openTwo(page, false, [
      {
        id: 'tw',
        kind: 'tween',
        start: 3.5,
        duration: 1,
        easing: 'linear',
        to: { position: [3, 1.5] },
      },
    ]);
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await clickGlyph(page, 'ca', '=');
    const reference = await glyphBox(page, 'ca', '='); // at its initial place
    await expect(page.getByTestId('compass-CENTER')).toBeFocused();
    await setTime(page, 5);
    await waitForDrawables(page, 8);
    await page.getByTestId('compass-LEFT').click();
    await expect(compass(page)).toHaveCount(0);
    const after = await glyphBox(page, 'cb', '=');
    expect(after.minX).toBeCloseTo(reference.minX + 3, 5);
  });

  test('the centre cell lines up both centres; the keyboard drives the compass', async ({
    page,
  }) => {
    await openTwo(page);
    await page.keyboard.press('Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await clickGlyph(page, 'cb', '=');
    await clickGlyph(page, 'ca', '=');
    const reference = await glyphBox(page, 'ca', '=');
    await expect(page.getByTestId('compass-CENTER')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(compass(page)).toHaveCount(0);
    const after = await glyphBox(page, 'cb', '=');
    expect((after.minX + after.maxX) / 2).toBeCloseTo((reference.minX + reference.maxX) / 2, 5);
    expect((after.minY + after.maxY) / 2).toBeCloseTo((reference.minY + reference.maxY) / 2, 5);

    // Arrows move between the cells: ↑ then → is the upper right corner.
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', 'x');
    await clickGlyph(page, 'ca', 'c');
    await expect(page.getByTestId('compass-CENTER')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('compass-UR')).toBeFocused();
    await page.keyboard.press('Enter');
    const c = await glyphBox(page, 'ca', 'c');
    const x = await glyphBox(page, 'cb', 'x');
    expect(x.maxX).toBeCloseTo(c.maxX, 5);
    expect(x.maxY).toBeCloseTo(c.maxY, 5);
  });

  test('the keyboard picks the symbols: arrows walk the glyphs and the formulas, Enter chooses', async ({
    page,
  }) => {
    await openTwo(page);
    const cursor = () => frame(page).getAttribute('data-symbol-cursor');
    const indexOf = (clipId: string, label: string) =>
      page.evaluate(
        ([id, wanted]) => {
          const mfe = (window as MfeWindow).__mfe!;
          const clip = mfe.useProjectStore.getState().project.clips.find((c) => c.id === id)!;
          const entry = mfe.useRenderStore.getState().resolved.get(clip.formulaId) as unknown as {
            render: { glyphs: { label: string }[] };
          };
          return entry.render.glyphs.findIndex((g) => g.label === wanted);
        },
        [clipId, label] as const,
      );
    await page.keyboard.press('Alt+g');
    // The first arrow lands on the first glyph of the top formula (A); ↓ goes to B and ↑ back.
    await page.keyboard.press('ArrowRight');
    expect(await cursor()).toBe('ca:0');
    await expect(frame(page)).toHaveAttribute('data-hover', 'ca:0');
    await page.keyboard.press('ArrowDown');
    expect(await cursor()).toBe('cb:0');
    await page.keyboard.press('ArrowUp');
    expect(await cursor()).toBe('ca:0');
    // Along A to its "=", and Enter takes it as the symbol to move.
    const eqA = await indexOf('ca', '=');
    for (let i = 0; i < eqA; i += 1) await page.keyboard.press('ArrowRight');
    expect(await cursor()).toBe(`ca:${eqA}`);
    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await expect(page.getByTestId('preview-hint')).toContainText('“=” goes to it');
    expect(await cursor()).toBe('');
    // A's glyphs are out now: the first arrow lands on B; along it to its "=", the reference:
    // Enter opens the compass with the centre focused, and Enter again lines up the two "=".
    await page.keyboard.press('ArrowRight');
    expect(await cursor()).toBe('cb:0');
    const eqB = await indexOf('cb', '=');
    for (let i = 0; i < eqB; i += 1) await page.keyboard.press('ArrowRight');
    expect(await cursor()).toBe(`cb:${eqB}`);
    // The row ends at its last glyph ("y"), and ← comes back.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await cursor()).toBe('cb:2');
    await page.keyboard.press('ArrowLeft');
    expect(await cursor()).toBe(`cb:${eqB}`);
    const reference = await glyphBox(page, 'cb', '=');
    await page.keyboard.press('Enter');
    await expect(compass(page)).toBeVisible();
    await expect(page.getByTestId('compass-CENTER')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(compass(page)).toHaveCount(0);
    const after = await glyphBox(page, 'ca', '=');
    expect((after.minX + after.maxX) / 2).toBeCloseTo((reference.minX + reference.maxX) / 2, 5);
    expect((after.minY + after.maxY) / 2).toBeCloseTo((reference.minY + reference.maxY) / 2, 5);
    // The playhead did not move with the arrows.
    expect(await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().time)).toBe(
      3,
    );
  });

  test('the keys of the mode are its alone: what has the focus, a clip or the menu bar, does not hear them', async ({
    page,
  }) => {
    await openTwo(page);
    const clip = page.getByTestId('clip-ca');
    await clip.click({ position: { x: 30, y: 8 } });
    await clip.focus();
    const selected = await selectionOf(page);
    expect(selected).toMatchObject({ kind: 'clips', ids: ['ca'] });
    await page.keyboard.press('Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    // ↓ on a focused clip goes to the clip of the track below: with the mode on, it walks the
    // glyphs and nothing else.
    await page.keyboard.press('ArrowDown');
    await expect(frame(page)).toHaveAttribute('data-symbol-cursor', 'ca:0');
    await page.keyboard.press('ArrowDown');
    await expect(frame(page)).toHaveAttribute('data-symbol-cursor', 'cb:0');
    expect(await selectionOf(page)).toEqual(selected);
    await expect(clip).toBeFocused();
    // Enter on a focused clip opens its formula: with a glyph under the cursor, it chooses it.
    await page.keyboard.press('Enter');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await selectionOf(page)).toEqual(selected);
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');

    // Chosen in the Edit menu, the mode leaves the focus on «Edit»: → would go on to «View» and
    // ↓ would open the menu again.
    const edit = page.getByTestId('menu-edit');
    await edit.click();
    await page.getByTestId('menu-item-edit-align').hover();
    await page.getByTestId('menu-item-edit-align-symbol').click();
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await expect(edit).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(frame(page)).toHaveAttribute('data-symbol-cursor', 'ca:0');
    await page.keyboard.press('ArrowDown');
    await expect(frame(page)).toHaveAttribute('data-symbol-cursor', 'cb:0');
    await expect(edit).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('an open menu keeps its keys: its arrows do not walk the glyphs', async ({ page }) => {
    await openTwo(page);
    await page.getByTestId('preview-align-symbol').click();
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    const focused = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
    // A clip's menu, opened from the keyboard.
    await page.getByTestId('clip-ca').focus();
    await page.keyboard.press('Shift+F10');
    const menu = page.getByTestId('add-animation-menu');
    await expect(menu).toBeVisible();
    await expect.poll(focused).not.toBe('clip-ca');
    const first = await focused();
    await page.keyboard.press('ArrowDown');
    expect(await focused()).not.toBe(first);
    await expect(frame(page)).toHaveAttribute('data-symbol-cursor', '');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    // A menu of the bar, opened with the pointer: the focus is on its button, and ↓ goes into
    // the menu.
    await page.getByTestId('menu-view').click();
    await expect(page.getByRole('menu')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect.poll(focused).not.toBe('menu-view');
    const entry = await focused();
    await page.keyboard.press('ArrowDown');
    expect(await focused()).not.toBe(entry);
    await expect(frame(page)).toHaveAttribute('data-symbol-cursor', '');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
  });

  test('Escape leaves the mode at any step; Alt+G toggles it; the menus enter it', async ({
    page,
  }) => {
    await openTwo(page);
    await page.keyboard.press('Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await page.keyboard.press('Alt+g');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    // From the compass too, and nothing moved.
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await clickGlyph(page, 'ca', '=');
    await expect(compass(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(compass(page)).toHaveCount(0);
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    expect(await positionOf(page, 'cb')).toEqual([-2, -1]);
    expect(await canUndo(page)).toBe(false);

    // The right-click menu and Edit ▸ Align enter the mode.
    const b = await glyphBox(page, 'cb', '=');
    const at = await scenePoint(page, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await openSubmenu(page, 'preview-menu-align');
    await page.getByTestId('preview-menu-align-symbol').click();
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await page.keyboard.press('Escape');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-align').hover();
    await page.getByTestId('menu-item-edit-align-symbol').click();
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'target');
    await page.keyboard.press('Escape');
  });

  test('a formula on a locked track stays, and a notice says so', async ({ page }) => {
    await openTwo(page, true);
    await page.getByTestId('preview-align-symbol').click();
    await clickGlyph(page, 'cb', '=');
    await clickGlyph(page, 'ca', '=');
    await page.getByTestId('compass-LEFT').click();
    expect(await positionOf(page, 'cb')).toEqual([-2, -1]);
    await expect(page.getByTestId('notice')).toContainText('1 clip stayed');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
  });

  test('a formula stays while one of its transformations runs, and a notice says when it is at rest', async ({
    page,
  }) => {
    // A fades to half from 2.5 s to 3.5 s (it does not travel), and its clip is unlocked: at 3 s
    // the keyframe is the end of that transformation, of which half shows.
    await openTwo(page, false, [
      { id: 'tw', kind: 'tween', start: 2.5, duration: 1, easing: 'linear', to: { opacity: 0.5 } },
    ]);
    await page.getByTestId('clip-ca-transform-lock').click();
    await page.getByTestId('dialog-confirm').click();
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'ca', '=');
    await clickGlyph(page, 'cb', '=');
    await page.getByTestId('compass-LEFT').click();
    await expect(page.getByTestId('notice')).toContainText('“A” was not moved');
    await expect(page.getByTestId('notice')).toContainText(
      '“=” is moving at 3.00 s: a transformation of the formula runs from 2.50 s to 3.50 s',
    );
    expect(await positionOf(page, 'ca')).toEqual([0, 1.5]);
    expect(await canUndo(page)).toBe(false);
    // At rest, after it, the same clicks move it.
    await setTime(page, 4);
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'ca', '=');
    await clickGlyph(page, 'cb', '=');
    await page.getByTestId('compass-LEFT').click();
    expect(await canUndo(page)).toBe(true);
  });

  test('the halo picks the nearest symbol within reach, and Shift+wheel sets the reach', async ({
    page,
  }) => {
    await openTwo(page);
    await page.getByTestId('preview-align-symbol').click();
    const b = await glyphBox(page, 'ca', '=');
    const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
    const pxPerUnit = canvas.width / ((8 * 16) / 9);
    // 8 px above the "=": within the default reach of 14 px, so it is highlighted and picked.
    const above = await scenePoint(page, [(b.minX + b.maxX) / 2, b.maxY + 8 / pxPerUnit]);
    await page.mouse.move(above.x, above.y);
    await expect(frame(page)).toHaveAttribute('data-hover', /^ca:\d+$/);
    await page.mouse.click(above.x, above.y);
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await page.keyboard.press('Escape');

    // 24 px above: out of reach … until Shift+wheel grows it.
    await page.getByTestId('preview-align-symbol').click();
    const far = await scenePoint(page, [(b.minX + b.maxX) / 2, b.maxY + 24 / pxPerUnit]);
    await page.mouse.move(far.x, far.y);
    await expect(frame(page)).toHaveAttribute('data-hover', '');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 6; i += 1) await page.mouse.wheel(0, -120);
    await page.keyboard.up('Shift');
    const reach = await page.evaluate(
      () => (window as MfeWindow).__mfe!.usePreferences.getState().symbolRadius,
    );
    expect(reach).toBeGreaterThan(24);
    await page.mouse.move(far.x + 1, far.y);
    await expect(frame(page)).toHaveAttribute('data-hover', /^ca:\d+$/);
    await page.keyboard.press('Escape');
    // Outside the mode, Shift+wheel changes nothing.
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Shift');
    expect(
      await page.evaluate(
        () => (window as MfeWindow).__mfe!.usePreferences.getState().symbolRadius,
      ),
    ).toBe(reach);
  });
});

/* Between two instants: G keeps the symbol to move as it is at the playhead, and its reference
 * is picked at another time. */

/** A: "a+b=c" at (0, 1.5) from 0 s to 3 s; B: "x=y" at (-2, -1) from 3 s to 6 s, with
 * `actionsB`: never on screen together. The playhead at 5 s, where B is whole. */
async function openApart(page: Page, actionsB: ActionJson[] = []): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 3);
  ca.initial.position = [0, 1.5];
  const cb = clipJson('cb', 'fb', 't2', 3, 6, { actions: actionsB });
  cb.initial.position = [-2, -1];
  const formulas = [
    { id: 'fa', name: 'A', source: 'a+b=c', color: '#58C4DD' },
    { id: 'fb', name: 'B', source: 'x=y', color: '#83C167' },
  ];
  await openWithProject(page, projectFile('apart', formulas, [ca, cb]));
  await setTime(page, 5);
  await waitForDrawables(page, 3);
}

const hint = (page: Page) => page.getByTestId('preview-hint');
const notice = (page: Page, text: string) => page.getByTestId('notice').filter({ hasText: text });
const timeOf = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().time);

/** Go where A is alone on screen (1.5 s), as a scrub of the ruler would. */
async function goToA(page: Page): Promise<void> {
  await setTime(page, 1.5);
  await waitForDrawables(page, 5);
}

test.describe('Preview align by symbol between two instants', () => {
  test('G keeps the symbol to move: it lands on a symbol of a formula it is never on screen with', async ({
    page,
  }) => {
    await openApart(page);
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await expect(hint(page)).toContainText('G keeps “=” as it is now');
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '');
    await page.keyboard.press('g');
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '5');
    await expect(hint(page)).toContainText('“=” kept as at 5.00 s');
    // G again lets it go; once more keeps it.
    await page.keyboard.press('g');
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '');
    await page.keyboard.press('g');
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '5');
    // Where A is, B is not on screen: its "=" is still the one of 5 s.
    await goToA(page);
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    const before = await glyphBox(page, 'cb', '=');
    const reference = await glyphBox(page, 'ca', '=');
    await clickGlyph(page, 'ca', '=');
    await expect(compass(page)).toBeVisible();
    await page.getByTestId('compass-LEFT').click();
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '');
    const after = await glyphBox(page, 'cb', '=');
    expect(after.minX).toBeCloseTo(reference.minX, 5);
    expect(after.minY).toBeCloseTo(before.minY, 6);
    // Nothing shows at the playhead, which stays: a notice says what was done.
    await expect(notice(page, '“B” moved')).toContainText(
      'The left edge of its “=” as at 5.00 s is on that of “=” of “A” as at 1.50 s.',
    );
    expect(await timeOf(page)).toBe(1.5);
    expect(await positionOf(page, 'ca')).toEqual([0, 1.5]);
    expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: ['cb'] });
    await undo(page);
    expect(await positionOf(page, 'cb')).toEqual([-2, -1]);
    expect(await canUndo(page)).toBe(false);
  });

  test('without G, a reference where the formula to move is not on screen is not taken, and a notice reminds of G', async ({
    page,
  }) => {
    await openApart(page);
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await goToA(page);
    await expect(hint(page)).toContainText('“=” is not on screen at this time');
    await expect(hint(page)).toContainText('press G to keep it');
    await clickGlyph(page, 'ca', '=');
    await expect(compass(page)).toHaveCount(0);
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    await expect(notice(page, '“=” is not on screen at 1.50 s')).toContainText(
      'G remembers where the symbol is at that time',
    );
    // G here has nothing to keep either.
    await page.keyboard.press('g');
    await expect(notice(page, '“=” cannot be kept at 1.50 s')).toContainText(
      '“B” is not on screen at 1.50 s',
    );
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '');
    // Back at B, G keeps its symbol, and the reference is taken.
    await setTime(page, 5);
    await waitForDrawables(page, 3);
    await expect(hint(page)).toContainText('G keeps “=” as it is now');
    await page.keyboard.press('g');
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '5');
    await goToA(page);
    await clickGlyph(page, 'ca', '=');
    await expect(compass(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    expect(await canUndo(page)).toBe(false);
  });

  test('a symbol is not kept where an alignment would not hold: after a transformation of a locked clip, or while one runs', async ({
    page,
  }) => {
    // B fades to half from 3.5 s to 4.5 s (it does not travel: its symbols stay under the
    // clicks).
    await openApart(page, [
      { id: 'tw', kind: 'tween', start: 0.5, duration: 1, easing: 'linear', to: { opacity: 0.5 } },
    ]);
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await page.keyboard.press('g');
    await expect(notice(page, '“=” cannot be kept at 5.00 s')).toContainText(
      '“B” is locked after its transformations',
    );
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '');
    await page.keyboard.press('Escape');
    // Unlocked (the padlock of its clip), it is kept once the transformation is over, not while
    // it runs.
    await page.getByTestId('clip-cb-transform-lock').click();
    await page.getByTestId('dialog-confirm').click();
    await setTime(page, 4);
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await page.keyboard.press('g');
    await expect(notice(page, '“=” cannot be kept at 4.00 s')).toContainText(
      'a transformation of the formula runs from 3.50 s to 4.50 s',
    );
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '');
    await setTime(page, 5);
    await page.keyboard.press('g');
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '5');
    await page.keyboard.press('Escape');
    expect(await canUndo(page)).toBe(false);
  });

  test('the closing notice lists what moves beyond the alignment: a later transformation with a position of its own', async ({
    page,
  }) => {
    // B travels to (1, 1) from 5.5 s on: kept at 5 s, its initial state is what moves.
    await openApart(page, [
      {
        id: 'tw',
        kind: 'tween',
        start: 2.5,
        duration: 0.4,
        easing: 'linear',
        to: { position: [1, 1] },
      },
    ]);
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await page.keyboard.press('g');
    await goToA(page);
    const reference = await glyphBox(page, 'ca', '=');
    await clickGlyph(page, 'ca', '=');
    await page.getByTestId('compass-LEFT').click();
    expect((await glyphBox(page, 'cb', '=')).minX).toBeCloseTo(reference.minX, 5);
    await expect(notice(page, '“B” moved')).toContainText(
      'The transformation of “B” at 5.50 s takes it to a position of its own, which did not move.',
    );
  });

  test('a kept symbol shows: its formula faintly wherever the playhead is, and a mark in the ruler', async ({
    page,
  }) => {
    await openApart(page);
    const mark = page.getByTestId('timeline-symbol-hold');
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await expect(mark).toHaveCount(0);
    await page.keyboard.press('g');
    await expect(mark).toHaveAttribute('data-time', '5');
    await expect(mark).toHaveAccessibleName(
      '“=” of “B” kept as at 5.00 s (align by symbol): G lets it go',
    );
    // At the kept instant the formula itself is there: no ghost of it.
    await expect(frame(page)).toHaveAttribute('data-ghost-count', '0');
    // Elsewhere its three glyphs are drawn faintly, as they are at 5 s. They are not for the
    // pointer: a click where its "=" shows takes no reference.
    await goToA(page);
    await expect(frame(page)).toHaveAttribute('data-ghost-count', '3');
    await clickGlyph(page, 'cb', '=');
    await expect(compass(page)).toHaveCount(0);
    await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
    // A press on the mark is a press on the ruler there: the playhead goes back to the instant.
    const box = (await mark.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await timeOf(page)).toBe(5);
    await expect(frame(page)).toHaveAttribute('data-ghost-count', '0');
    await expect(frame(page)).toHaveAttribute('data-symbol-held', '5');
    // Let go, the mark and the ghost go; and with the mode, when it is left.
    await page.keyboard.press('g');
    await expect(mark).toHaveCount(0);
    await goToA(page);
    await expect(frame(page)).toHaveAttribute('data-ghost-count', '0');
    await setTime(page, 5);
    await page.keyboard.press('g');
    await goToA(page);
    await expect(mark).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(mark).toHaveCount(0);
    await expect(frame(page)).toHaveAttribute('data-ghost-count', '0');
  });

  test('the mode ends with the formula it was to move', async ({ page }) => {
    await openApart(page);
    await page.keyboard.press('Alt+g');
    await clickGlyph(page, 'cb', '=');
    await page.keyboard.press('g');
    await goToA(page);
    await expect(page.getByTestId('timeline-symbol-hold')).toHaveCount(1);
    // Its clip is deleted (as the timeline would).
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        draft.clips = draft.clips.filter((c) => c.id !== 'cb');
      });
    });
    await expect(frame(page)).toHaveAttribute('data-symbol-align', '');
    await expect(page.getByTestId('timeline-symbol-hold')).toHaveCount(0);
    await expect(frame(page)).toHaveAttribute('data-ghost-count', '0');
    await expect(hint(page)).toHaveCount(0);
  });

  test('Shift+Alt+G keeps a symbol too: the reference is on a locked formula at another time', async ({
    page,
  }) => {
    await openApart(page);
    await lockInPreview(page, 'ca');
    await page.keyboard.press('Shift+Alt+g');
    await clickGlyph(page, 'cb', '=');
    await page.keyboard.press('g');
    await expect(hint(page)).toContainText(
      'click (or arrow to) the reference symbol on a locked formula',
    );
    await goToA(page);
    const reference = await glyphBox(page, 'ca', '=');
    await clickGlyph(page, 'ca', '=');
    await page.getByTestId('compass-LEFT').click();
    expect((await glyphBox(page, 'cb', '=')).minX).toBeCloseTo(reference.minX, 5);
    expect(await positionOf(page, 'ca')).toEqual([0, 1.5]);
  });
});

test.describe('Preview align by symbol while a formula is edited', () => {
  for (const kept of [false, true]) {
    test(`the symbol to move${kept ? ', kept with G,' : ''} is still its glyph after its formula is edited`, async ({
      page,
    }) => {
      await openTwo(page);
      // The glyphs are MathJax's here, whatever runs on this machine.
      await pinMathJax(page);
      await page.getByTestId('preview-align-symbol').click();
      // The "=" of a+b=c: its fourth glyph.
      await clickGlyph(page, 'ca', '=');
      await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
      if (kept) {
        await page.keyboard.press('g');
        await expect(page.getByTestId('preview-hint')).toContainText('“=” kept as at');
      }
      // The formula is edited with the mode on: two glyphs come in before the "=", which is the
      // sixth now, and a "+" is the fourth.
      await page.getByTestId('formula-item').first().getByTestId('formula-edit').click();
      const editor = page.getByTestId('formula-editor');
      await editor.getByTestId('raw-latex').fill('z+a+b=c');
      await editor.getByTestId('editor-apply').click();
      await expect
        .poll(async () => {
          const formula = (await getProject(page)).formulas.find((f) => f.id === 'fa')!;
          return (formula.snapshot as { glyphs: { label: string }[] }).glyphs.map((g) => g.label);
        })
        .toEqual(['z', '+', 'a', '+', 'b', '=', 'c']);
      await closeEditor(page);
      // The mode goes on with the same symbol, and says nothing.
      await expect(frame(page)).toHaveAttribute('data-symbol-align', 'reference');
      await expect(page.getByTestId('notice')).toHaveCount(0);
      await clickGlyph(page, 'cb', '=');
      await expect(compass(page).locator('.symbol-compass-title')).toHaveText(
        'Put “=” on the … of “=”',
      );
      await page.getByTestId('compass-CENTER').click();
      await expect(compass(page)).toHaveCount(0);
      // Neither clip is animated: a glyph is where its render has it, moved by its clip's place.
      const moved = await glyphBox(page, 'ca', '=');
      const reference = await glyphBox(page, 'cb', '=');
      expect((moved.minX + moved.maxX) / 2).toBeCloseTo((reference.minX + reference.maxX) / 2, 5);
      expect((moved.minY + moved.maxY) / 2).toBeCloseTo((reference.minY + reference.maxY) / 2, 5);
    });
  }
});
