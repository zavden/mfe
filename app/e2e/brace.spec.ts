import { expect, test, type Page } from './test';
import {
  getProject,
  holdToConfirm,
  openAnimationsTab,
  openSubmenu,
  openWithProject,
  setTime,
  type MfeWindow,
} from './helpers';
import { scenePoint } from './previewHelpers';
import { plain, relationProject } from './relationsHelpers';
import { box, timeToX } from './timelineHelpers';

/* Braces (D66): «Add brace ▸» on a clip's menu — on the timeline or in the preview — makes a
 * brace object hanging on the clip's glyphs, from the playhead to the clip's end, on the nearest
 * free track, with no intro; the Animations panel points it, spaces it and detaches it; so does
 * its own menu, in the preview and on the timeline, which also colours it and gives it an intro
 * or an outro (D118); it does not drag in the preview while attached; it goes with the clip it
 * hangs on. */

interface BraceState {
  clip: {
    id: string;
    trackId: string;
    start: number;
    end: number;
    attach: Record<string, unknown> | null;
    initial: { position: [number, number]; rotation: number };
  };
  width: number;
}

/** The brace's clip and its object's width, from the store. */
async function braceOf(page: Page): Promise<BraceState> {
  return page.evaluate(() => {
    const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
      formulas: { id: string; kind: string; width?: number }[];
      clips: BraceState['clip'][] & { formulaId: string }[];
    };
    const brace = p.formulas.find((f) => f.kind === 'brace')!;
    const clip = (p.clips as (BraceState['clip'] & { formulaId: string })[]).find(
      (c) => c.formulaId === brace.id,
    )!;
    return { clip, width: brace.width! };
  });
}

/** f1 (a+b=c) on clip a [0, 6) of track 1 at x = −1, written in 1 s; playhead at 2 s. */
async function openScene(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 950 });
  const a = plain('a', 'fa', 't1', 0, 6, {
    intro: {
      kind: 'write',
      duration: 1,
      easing: 'linear',
      lagRatio: null,
      shift: [0, 0],
      scale: 1,
    },
  });
  a.initial.position = [-1, 0.5];
  await openWithProject(page, relationProject([a]));
  await setTime(page, 2);
}

async function rightClickClip(page: Page, t: number): Promise<void> {
  const b = await box(page.getByTestId('clip-a'));
  await page.mouse.click(await timeToX(page, t), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
}

test('Add brace ▸ Below on the clip menu: a brace on a track in front of the formula, fitted under it', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-brace');
  await page.getByTestId('add-brace-down').click();
  const { clip, width } = await braceOf(page);
  expect([clip.start, clip.end]).toEqual([2, 6]);
  // The formula is on the first track, and a brace never goes behind what it hangs on: a new
  // track right above it, though the tracks below are empty.
  const rows = (await getProject(page)).tracks.map((t) => t.id);
  expect(rows).toHaveLength(4);
  expect(rows.indexOf(clip.trackId)).toBe(rows.indexOf('t1') - 1);
  expect(clip.attach).toEqual({
    clipId: 'a',
    glyphs: 'all',
    rule: 'brace',
    direction: 0,
    buff: 0.2,
  });
  expect(width).toBeGreaterThan(1); // the formula's width
  // Fitted under the formula: centred on it, below it.
  expect(clip.initial.position[0]).toBeCloseTo(-1, 3);
  expect(clip.initial.position[1]).toBeLessThan(0.5 - 0.2);
  expect(clip.initial.rotation).toBe(0);
  const project = await getProject(page);
  expect(project.formulas.map((f) => f.name)).toEqual(['f1', 'f2', 'b1']);
  expect(project.clips.find((c) => c.id === clip.id)!.intro.kind).toBe('none');
  // The brace's clip is selected: its panel names the target, and Above turns it over.
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('attachment-target')).toContainText(
    'Attached to f1 · all its glyphs',
  );
  await expect(page.getByTestId('attachment-width')).toHaveText(width.toFixed(3));
  await page.getByTestId('attachment-side-up').click();
  await expect(page.getByTestId('attachment-direction')).toHaveValue('180');
  const above = await braceOf(page);
  expect(above.clip.initial.rotation).toBe(180);
  expect(above.clip.initial.position[1]).toBeGreaterThan(0.5 + 0.2);
  // The Creator does not list it.
  await expect(page.getByTestId('formula-item')).toHaveCount(2);
});

test('the preview menu adds a brace too, on some glyphs through the dialog', async ({ page }) => {
  await openScene(page);
  const at = await scenePoint(page, [-1, 0.5]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
  await openSubmenu(page, 'preview-menu-brace');
  await page.getByTestId('preview-menu-brace-glyphs').click();
  const dialog = page.getByTestId('brace-glyphs-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('brace-glyphs-summary')).toHaveText('All glyphs');
  await page.getByTestId('brace-glyph-1').click(); // just "+"
  await page.getByTestId('brace-glyph-2').click({ modifiers: ['Shift'] }); // "+b"
  await expect(page.getByTestId('brace-glyphs-summary')).toHaveText('2 glyphs: 1, 2');
  await page.getByTestId('brace-glyphs-side-right').click();
  await page.getByTestId('brace-glyphs-add').click();
  await expect(dialog).toHaveCount(0);
  await openAnimationsTab(page, 'timing');
  const { clip } = await braceOf(page);
  expect(clip.attach).toMatchObject({ clipId: 'a', glyphs: [1, 2], direction: 90 });
  expect(clip.initial.rotation).toBe(90);
  await expect(page.getByTestId('attachment-target')).toContainText('glyphs 1, 2');
});

test('a brace’s own menu, in the preview and on the timeline: its side, colour, intro and outro, Remove animations, Detach', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-brace');
  await page.getByTestId('add-brace-down').click();
  const made = await braceOf(page);
  const clip = async () => (await getProject(page)).clips.find((c) => c.id === made.clip.id)!;
  const colour = async () =>
    ((await getProject(page)).formulas.find((f) => f.name === 'b1') as unknown as { color: string })
      .color;
  /** Right-click the brace where it is in the preview. */
  const menuOnBrace = async () => {
    const at = await scenePoint(page, (await braceOf(page)).clip.initial.position);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(page.getByTestId('preview-menu')).toBeVisible();
  };
  // It came without an intro: «None» is ticked and there is nothing to remove.
  await menuOnBrace();
  await expect(page.getByTestId('preview-menu-remove-animations')).toBeDisabled();
  await openSubmenu(page, 'preview-menu-intro');
  await expect(page.getByTestId('preview-menu-intro-none')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preview-menu')).toHaveCount(0);
  // Its side: Below is ticked; Above turns it over.
  await menuOnBrace();
  await openSubmenu(page, 'preview-menu-direction');
  await expect(page.getByTestId('preview-menu-direction-down')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByTestId('preview-menu-direction-up').click();
  await expect.poll(async () => (await braceOf(page)).clip.initial.rotation).toBe(180);
  expect((await clip()).attach).toMatchObject({ direction: 180 });
  // Its colour.
  await menuOnBrace();
  await openSubmenu(page, 'preview-menu-color');
  await page.getByTestId('preview-menu-color-RED').click();
  expect(await colour()).toBe('#FC6255');
  // An animation at the end of its clip.
  await menuOnBrace();
  await openSubmenu(page, 'preview-menu-outro');
  await page.getByTestId('preview-menu-outro-shrink_to_center').click();
  expect((await clip()).intro.kind).toBe('none');
  expect((await clip()).outro).toMatchObject({ kind: 'shrink_to_center', duration: 1 });

  // The same entries on the timeline, on the brace's clip: one at its start.
  const onTimeline = async () => {
    const b = await box(page.getByTestId(`clip-${made.clip.id}`));
    await page.mouse.click(await timeToX(page, 4), b.y + b.height - 6, { button: 'right' });
    await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  };
  await onTimeline();
  await openSubmenu(page, 'clip-menu-intro');
  await page.getByTestId('clip-menu-intro-grow_from_center').click();
  expect((await clip()).intro).toMatchObject({ kind: 'grow_from_center', duration: 1 });
  // Remove animations takes the two off, as one undo step.
  await onTimeline();
  await page.getByTestId('clip-menu-remove-animations').click();
  expect((await clip()).intro.kind).toBe('none');
  expect((await clip()).outro.kind).toBe('none');
  await page.keyboard.press('ControlOrMeta+z');
  expect((await clip()).intro.kind).toBe('grow_from_center');
  expect((await clip()).outro.kind).toBe('shrink_to_center');
  // Detach frees it where it is: no side to choose any more, nothing to detach.
  const before = (await braceOf(page)).clip.initial.position;
  await onTimeline();
  await page.getByTestId('clip-menu-detach').click();
  expect((await clip()).attach).toBeNull();
  expect((await braceOf(page)).clip.initial.position).toEqual(before);
  await onTimeline();
  await expect(page.getByTestId('clip-menu-direction')).toHaveCount(0);
  await expect(page.getByTestId('clip-menu-detach')).toHaveCount(0);
  await expect(page.getByTestId('clip-menu-color')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('an attached brace does not drag in the preview, and says why; detached, it moves', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-brace');
  await page.getByTestId('add-brace-down').click();
  await setTime(page, 4); // the brace has grown by then
  const { clip } = await braceOf(page);
  const from = await scenePoint(page, clip.initial.position);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('notice')).toContainText('Attached to f1 · Detach to move');
  expect((await braceOf(page)).clip.initial.position).toEqual(clip.initial.position);
  // Detach: it stays put, keeps its width, and the next drag moves it.
  await openAnimationsTab(page, 'timing');
  await page.getByTestId('attachment-detach').click();
  await expect(page.getByTestId('attachment-target')).toContainText('Detached');
  const freed = await braceOf(page);
  expect(freed.clip.attach).toBeNull();
  expect(freed.clip.initial.position).toEqual(clip.initial.position);
  expect(freed.width).toBeGreaterThan(1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 60, { steps: 6 });
  await page.mouse.up();
  const moved = (await braceOf(page)).clip.initial.position;
  expect(moved[0]).toBeGreaterThan(clip.initial.position[0] + 0.5);
});

test('deleting the clip a brace hangs on takes the brace and its object along', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-brace');
  await page.getByTestId('add-brace-down').click();
  await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('dialog-details')).toHaveText([
    'b1 (2 s–6 s) on Track 4, attached to f1',
  ]);
  await holdToConfirm(page);
  const project = await getProject(page);
  expect(project.clips).toEqual([]);
  expect(project.formulas.map((f) => f.name)).toEqual(['f1', 'f2']);
});
