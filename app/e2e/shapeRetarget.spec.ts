import { expect, test } from './test';
import { serializeProject, type Project } from '../src/model';
import { forceFallbackFilePaths } from './creatorHelpers';
import { getProject, openSubmenu, setTime, type MfeWindow } from './helpers';
import { clickScene, pressAndMove, scenePoint } from './previewHelpers';
import { F1, F2, openScene, shapeOf, startFromClip } from './shapeRetargetHelpers';

/* «To another formula or glyphs…» (D123): a shape's Transform that carries it to surround
 * something else. The entry — on the shape's clip, in the panel's Add animation and in the
 * preview — starts a mode in which the target is chosen in the preview as anything is selected
 * there; Enter or «Transform here» makes the Transform at the playhead, Escape leaves the mode.
 * The block is a Transform like the others on the timeline; its panel names what it goes to and
 * picks again. */

test('the shape’s clip starts the choice; a click on a formula and Enter make the Transform to it', async ({
  page,
}) => {
  await openScene(page);
  await startFromClip(page);
  const hint = page.getByTestId('retarget-hint');
  await expect(hint).toContainText('Transform “s1”: click a formula');
  await expect(hint).toContainText('nothing chosen yet');
  await expect(page.getByTestId('retarget-confirm')).toHaveText('Transform here');
  // Enter with nothing chosen: refused, and the mode stays on.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('notice').last()).toContainText('Nothing is chosen yet');
  await expect(hint).toBeVisible();
  expect((await shapeOf(page)).tweens).toEqual([]);
  // The other formula, clicked in the preview: the hint names it.
  await clickScene(page, F2);
  await expect(hint).toContainText('to f2');
  await page.keyboard.press('Enter');
  await expect(hint).toHaveCount(0);
  const { tweens } = await shapeOf(page);
  expect(tweens).toHaveLength(1);
  // At the playhead (3 s; the box's clip starts at 1 s), a second long, to the whole of f2.
  expect(tweens[0]).toMatchObject({ kind: 'tween', start: 2, duration: 1 });
  expect(tweens[0]!.fit).toMatchObject({ clipId: 'b', glyphs: 'all' });
  // The block is a Transform like the others, and says where to.
  const block = page.getByTestId(`action-block-${tweens[0]!.id}`);
  await expect(block).toHaveClass(/is-transform/);
  await expect(block).toHaveText('Transform → f2');
  await expect(block).toHaveAttribute('title', /^Transform to f2\n3\.00 s → 4\.00 s/);
  // It is selected: its panel says what it goes to and offers no place to set.
  const id = `tween-${tweens[0]!.id}`;
  await expect(page.getByTestId('block-tween-hint')).toContainText(
    'the shape goes to surround other glyphs',
  );
  await expect(page.getByTestId(`${id}-fit-target`)).toHaveText('f2 · all its glyphs');
  await expect(page.getByTestId(`${id}-position-on`)).toHaveCount(0);
  await expect(page.getByTestId(`${id}-opacity-on`)).toBeVisible();
  // Fitted by the app to f2 where it is: centred on it.
  await expect.poll(async () => (await shapeOf(page)).tweens[0]!.fit!.fitted).not.toBeNull();
  const { fitted } = (await shapeOf(page)).tweens[0]!.fit!;
  expect(fitted!.center[0]).toBeCloseTo(3, 1);
  expect(fitted!.center[1]).toBeCloseTo(-1.5, 1);
  // The preview outlines what the selected Transform goes to.
  await expect(page.getByTestId('preview-canvas')).not.toHaveAttribute(
    'data-block-outline-count',
    '0',
  );
  // One undo step takes it back.
  await page.keyboard.press('ControlOrMeta+z');
  expect((await shapeOf(page)).tweens).toEqual([]);
});

test('the preview starts it too; symbols picked with Alt, of two formulas, and «Transform here»', async ({
  page,
}) => {
  await openScene(page);
  const { clip, object } = await shapeOf(page);
  // On the box's upper edge.
  const [x, y] = clip.initial.position;
  const at = await scenePoint(page, [x, y + object.height / 2]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.getByTestId('preview-menu-retarget').click();
  const hint = page.getByTestId('retarget-hint');
  await expect(hint).toBeVisible();
  // Alt + a rectangle from the middle of f1 over the whole of f2: symbols of both.
  await page.keyboard.down('Alt');
  await pressAndMove(page, F1, [4.5, -2.2]);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(hint).toContainText(/to f1 and f2|to f2 and f1/);
  await page.getByTestId('retarget-confirm').click();
  await expect(hint).toHaveCount(0);
  const [tween] = (await shapeOf(page)).tweens;
  const targets = [tween!.fit!, ...(tween!.fit!.also ?? [])];
  expect(targets.map((t) => t.clipId).sort()).toEqual(['a', 'b']);
  // Glyphs, not the whole of f1: the rectangle left its first symbols out.
  const ofA = targets.find((t) => t.clipId === 'a')!;
  expect(Array.isArray(ofA.glyphs) && ofA.glyphs.length).toBeGreaterThan(0);
  await expect(page.getByTestId(`action-block-${tween!.id}`)).toHaveText(
    /^Transform → f[12] and f[12]$/,
  );
});

test('a track locked while the target is chosen stops the Transform, and the choice stays on', async ({
  page,
}) => {
  await openScene(page);
  await startFromClip(page);
  const { clip } = await shapeOf(page);
  const { trackId } = (await getProject(page)).clips.find((c) => c.id === clip.id)!;
  const lock = page.getByTestId(`track-lock-${trackId}`);
  // The lock of the shape's track, pressed with the mode on.
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  const hint = page.getByTestId('retarget-hint');
  await clickScene(page, F2);
  await expect(hint).toContainText('to f2');
  await page.getByTestId('retarget-confirm').click();
  const notice = page.getByTestId('notice').last();
  await expect(notice).toContainText('No Transform made');
  await expect(notice).toContainText(
    'is locked: unlock it on the timeline to give its shapes a Transform.',
  );
  expect((await shapeOf(page)).tweens).toEqual([]);
  await expect(hint).toBeVisible();
  // Unlocked, the same choice makes it, as after any other refusal.
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('retarget-confirm').click();
  await expect(hint).toHaveCount(0);
  const { tweens } = await shapeOf(page);
  expect(tweens).toHaveLength(1);
  expect(tweens[0]!.fit).toMatchObject({ clipId: 'b', glyphs: 'all' });
});

test('opening a saved copy of the project ends the choice: its shape is another document’s', async ({
  page,
}) => {
  // File → Open through the file input: Chrome's own picker cannot be driven.
  await forceFallbackFilePaths(page);
  await openScene(page);
  await startFromClip(page);
  const { clip } = await shapeOf(page);
  // The same project as a file: every id in it is the same.
  const copy = (await getProject(page)) as unknown as Project;
  const file = serializeProject({ ...copy, meta: { ...copy.meta, name: 'Saved copy' } });
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  await page.getByTestId('projects-other').click();
  await (
    await chooser
  ).setFiles({
    name: 'saved-copy.mfe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  });
  // The scene was made by hand and never saved: Open asks before it replaces it.
  await page.getByTestId('dialog-discard').click();
  await expect(page.getByTestId('project-name')).toContainText('Saved copy');
  // The shape is there, under the id it had; the choice of its target is not.
  expect((await shapeOf(page)).clip.id).toBe(clip.id);
  await expect(page.getByTestId('retarget-hint')).toHaveCount(0);
  await expect(page.getByTestId('retarget-confirm')).toHaveCount(0);
});

test('another mode of the preview ends the choice: Enter then picks a symbol, and makes no Transform', async ({
  page,
}) => {
  await openScene(page);
  await startFromClip(page);
  await clickScene(page, F2);
  await expect(page.getByTestId('retarget-hint')).toContainText('f2');
  const frame = page.getByTestId('preview-frame');
  const before = (await shapeOf(page)).tweens;
  // Align by symbol goes on: the arrows walk the glyphs and Enter chooses the one under the
  // cursor — the choice of the target, were it still on, would make its Transform to f2 with it.
  await page.keyboard.press('Alt+g');
  await expect(frame).toHaveAttribute('data-symbol-align', 'target');
  await page.keyboard.press('ArrowRight');
  await expect(frame).not.toHaveAttribute('data-symbol-cursor', '');
  await page.keyboard.press('Enter');
  await expect(frame).toHaveAttribute('data-symbol-align', 'reference');
  expect((await shapeOf(page)).tweens).toEqual(before);
  await expect(frame).toHaveAttribute('data-retarget', '');
  // Leaving align by symbol does not bring the choice back.
  await page.keyboard.press('Escape');
  await expect(frame).toHaveAttribute('data-symbol-align', '');
  await expect(page.getByTestId('retarget-hint')).toHaveCount(0);
});

test('Escape leaves the choice; Pick again… gives a Transform another target', async ({ page }) => {
  await openScene(page);
  await startFromClip(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('retarget-hint')).toHaveCount(0);
  expect((await shapeOf(page)).tweens).toEqual([]);
  // Made to f2, then sent back to f1 from its panel.
  await startFromClip(page);
  await clickScene(page, F2);
  await page.keyboard.press('Enter');
  const [made] = (await shapeOf(page)).tweens;
  await page.getByTestId(`tween-${made!.id}-retarget`).click();
  const hint = page.getByTestId('retarget-hint');
  await expect(hint).toContainText('Another target for the Transform of “s1”');
  await clickScene(page, F1);
  await expect(hint).toContainText('to f1');
  await page.keyboard.press('Enter');
  const { tweens } = await shapeOf(page);
  expect(tweens).toHaveLength(1);
  expect(tweens[0]).toMatchObject({ id: made!.id, start: made!.start, duration: made!.duration });
  expect(tweens[0]!.fit).toMatchObject({ clipId: 'a', glyphs: 'all' });
  await expect(page.getByTestId(`action-block-${made!.id}`)).toHaveText('Transform → f1');
});

test('Pick again… in the dialog of the Transform closes it: the target is chosen in the preview', async ({
  page,
}) => {
  await openScene(page);
  await startFromClip(page);
  await clickScene(page, F2);
  await page.keyboard.press('Enter');
  const [made] = (await shapeOf(page)).tweens;
  await page.getByTestId(`action-block-${made!.id}`).dblclick();
  const dialog = page.getByTestId('block-dialog');
  await dialog.getByTestId(`tween-${made!.id}-retarget`).click();
  const hint = page.getByTestId('retarget-hint');
  await expect(hint).toContainText('Another target for the Transform of “s1”');
  await expect(dialog).toHaveCount(0);
  // Nothing covers the preview: the click on f1 chooses it.
  await clickScene(page, F1);
  await expect(hint).toContainText('to f1');
  await page.keyboard.press('Enter');
  expect((await shapeOf(page)).tweens[0]!.fit).toMatchObject({ clipId: 'a', glyphs: 'all' });
  await expect(dialog).toHaveCount(0);
});

test('once carried, the shape is where its target is and does not move by hand; the panel’s Add animation offers the entry', async ({
  page,
}) => {
  await openScene(page);
  await startFromClip(page);
  await clickScene(page, F2);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await shapeOf(page)).tweens[0]!.fit!.fitted).not.toBeNull();
  const { clip, tweens } = await shapeOf(page);
  const fitted = tweens[0]!.fit!.fitted!;
  // After the Transform (over [3, 4)), a drag of the box where it now is does nothing, and says
  // why.
  await setTime(page, 5);
  const edge = await scenePoint(page, [fitted.center[0], fitted.center[1] + fitted.height / 2]);
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 60, edge.y + 40, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('notice').last()).toContainText('Carried to f2 by its Transform');
  const after = await shapeOf(page);
  expect(after.tweens[0]!.fit!.fitted).toEqual(fitted);
  expect(after.tweens[0]!.to).toEqual({});
  // The panel of the shape's clip: Add animation has the same Transform entries.
  await page.evaluate((id) => {
    (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: [id] });
  }, clip.id);
  await page.getByTestId('animations-tab-timing').click();
  await page.getByTestId('add-animation').click();
  await openSubmenu(page, 'add-animation-group-transform');
  await expect(page.getByTestId('add-animation-retarget')).toBeVisible();
  await page.keyboard.press('Escape');
  // The file keeps the Transform with what it goes to.
  const saved = (await getProject(page)).clips.find((c) => c.id === clip.id)!;
  expect(JSON.stringify(saved.actions)).toContain('"fit"');
});
