import { expect, test, type Page } from './test';
import { openSubmenu, setTime } from './helpers';
import { scenePoint } from './previewHelpers';
import { openRelationScene, plain } from './relationsHelpers';
import { box, clipOf, project, timeToX } from './timelineHelpers';

/* A formula's own entries in its clip's menu, on the timeline and in the preview (D120): «Intro ›»
 * and «Outro ›», «Remove animations» (its intro, its outro and its blocks, but the Morph ones)
 * and «Remove relations» (its transformations of glyphs). An intro or an outro that would run
 * into what the clip has is asked about first; a new intro is what «Appears with» says. */

/** `f1` on clip `a` over [0, 10) with a keyframe over [0.5, 1.5); `f2` on clip `b` over [4, 10),
 * its first glyph arriving from `a` over [4, 5). */
const A = plain('a', 'fa', 't1', 0, 10, {
  actions: [
    { id: 'tw', kind: 'tween', start: 0.5, duration: 1, easing: 'smooth', to: { opacity: 0.5 } },
  ],
});
const B = plain('b', 'fb', 't2', 4, 10);
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

const open = (page: Page) => openRelationScene(page, [A, B], { relations: [RELATION] });

/** Right-click clip `a` on the timeline, at 2.5 s of the scene. */
async function timelineMenu(page: Page): Promise<void> {
  const clip = await box(page.getByTestId('clip-a'));
  await page.mouse.click(await timeToX(page, 2.5), clip.y + clip.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
}

/** Right-click `f1` where it is in the preview. */
async function previewMenu(page: Page): Promise<void> {
  const at = await scenePoint(page, [0, 0]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
}

const introOfFormula = async (page: Page) =>
  ((await project(page)).formulas.find((f) => f.id === 'fa') as unknown as { intro: unknown })
    .intro;

test('a formula’s clip has Intro, Outro and the two removals in its menu on the timeline', async ({
  page,
}) => {
  await open(page);
  await timelineMenu(page);
  // Nothing of a brace or a shape.
  for (const id of ['color', 'direction', 'detach'])
    await expect(page.getByTestId(`clip-menu-${id}`)).toHaveCount(0);
  await openSubmenu(page, 'clip-menu-outro');
  await expect(page.getByTestId('clip-menu-outro-none')).toHaveAttribute('aria-checked', 'true');
  // Nothing is in the way of an outro: it goes in at its own length.
  await page.getByTestId('clip-menu-outro-fade_out').click();
  await expect(page.getByTestId('dialog')).toHaveCount(0);
  expect((await clipOf(page, 'a')).outro).toMatchObject({ kind: 'fade_out', duration: 1 });

  // Remove relations: the transformation to f2 goes, the animations stay.
  await timelineMenu(page);
  await page.getByTestId('clip-menu-remove-relations').click();
  expect((await project(page)).relations).toEqual([]);
  expect((await clipOf(page, 'a')).outro.kind).toBe('fade_out');
  expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  await timelineMenu(page);
  await expect(page.getByTestId('clip-menu-remove-relations')).toBeDisabled();
  // Remove animations: the outro and the keyframe go, as one undo step.
  await page.getByTestId('clip-menu-remove-animations').click();
  expect((await clipOf(page, 'a')).outro.kind).toBe('none');
  expect((await clipOf(page, 'a')).actions).toEqual([]);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await clipOf(page, 'a')).outro.kind).toBe('fade_out');
  expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await project(page)).relations).toHaveLength(1);
});

test('an intro that runs into what the clip has is asked about; «Appears with» follows it', async ({
  page,
}) => {
  await open(page);
  await setTime(page, 2);
  expect(await introOfFormula(page)).toBeNull();
  // Write is 1 s long: it would cut the keyframe that starts at 0.5 s.
  await previewMenu(page);
  await openSubmenu(page, 'preview-menu-intro');
  await page.getByTestId('preview-menu-intro-write').click();
  const dialog = page.getByTestId('dialog');
  await expect(dialog).toContainText('Write runs into what is already there');
  await expect(page.getByTestId('dialog-details')).toHaveText(
    'The Transform of the whole formula at 0.50 s would be cut from 1.00 s to 0.50 s.',
  );
  await expect(page.getByTestId('dialog-fit')).toHaveText('Shorten it to 0.50 s');
  // Dismissed: nothing changed.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await clipOf(page, 'a')).intro.kind).toBe('none');
  expect(await introOfFormula(page)).toBeNull();

  // Shortened: the intro ends where the keyframe starts, which stays whole.
  await previewMenu(page);
  await openSubmenu(page, 'preview-menu-intro');
  await page.getByTestId('preview-menu-intro-write').click();
  await page.getByTestId('dialog-fit').click();
  await expect(dialog).toHaveCount(0);
  expect((await clipOf(page, 'a')).intro).toMatchObject({ kind: 'write', duration: 0.5 });
  expect((await clipOf(page, 'a')).actions[0]).toMatchObject({ start: 0.5, duration: 1 });
  // «Appears with» of the formula says what its clip shows.
  expect(await introOfFormula(page)).toMatchObject({ kind: 'write', duration: 0.5 });

  // Another one, added as it is: the keyframe is cut.
  await previewMenu(page);
  await openSubmenu(page, 'preview-menu-intro');
  await expect(page.getByTestId('preview-menu-intro-write')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByTestId('preview-menu-intro-fade_in').click();
  await page.getByTestId('dialog-whole').click();
  expect((await clipOf(page, 'a')).intro).toMatchObject({ kind: 'fade_in', duration: 1 });
  expect((await clipOf(page, 'a')).actions[0]).toMatchObject({ start: 1, duration: 0.5 });
  expect(await introOfFormula(page)).toMatchObject({ kind: 'fade_in', duration: 1 });
  // One undo step each.
  await page.keyboard.press('ControlOrMeta+z');
  expect((await clipOf(page, 'a')).intro).toMatchObject({ kind: 'write', duration: 0.5 });
  expect(await introOfFormula(page)).toMatchObject({ kind: 'write', duration: 0.5 });
});

test('an outro of the clip a transformation brings glyphs to is asked about by its name', async ({
  page,
}) => {
  // f2 lasts 1.5 s here: an outro of 1 s would start while its glyph is still arriving.
  await openRelationScene(page, [A, plain('b', 'fb', 't2', 4, 5.5)], { relations: [RELATION] });
  // On the clip, past the window of the transformation (which has a menu of its own).
  const clip = await box(page.getByTestId('clip-b'));
  await page.mouse.click(await timeToX(page, 5.25), clip.y + clip.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  await openSubmenu(page, 'clip-menu-outro');
  await page.getByTestId('clip-menu-outro-fade_out').click();
  await expect(page.getByTestId('dialog-details')).toContainText(
    'The transformation f1 → f2 runs from 4.00 s to 5.00 s.',
  );
  await page.getByTestId('dialog-fit').click();
  expect((await clipOf(page, 'b')).outro).toMatchObject({ kind: 'fade_out', duration: 0.5 });
});
