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
import { closeEditor } from './creatorHelpers';
import { pixelAt, scenePoint } from './previewHelpers';
import { plain, relationProject } from './relationsHelpers';
import { box, timeToX } from './timelineHelpers';

/* Shapes (D71): «Add shape ▸» on a clip's menu — on the timeline or in the preview — makes a shape
 * object fitted to the clip's glyphs, from the playhead to the clip's end, on the nearest free
 * track (behind the glyphs for a highlight); the Animations panel changes its shape, gap and style
 * and detaches it; it does not drag in the preview while attached; it goes with the clip it hangs
 * on. */

interface ShapeState {
  clip: {
    id: string;
    trackId: string;
    start: number;
    end: number;
    attach: Record<string, unknown> | null;
    initial: { position: [number, number]; rotation: number };
    intro: { kind: string };
  };
  object: {
    name: string;
    shape: string;
    color: string;
    style: { fillOpacity: number; strokeWidth: number; strokeOpacity: number };
    fillColor?: string;
    diagonal?: string;
    width: number;
    height: number;
  };
}

/** The last shape's clip and object, from the store. */
async function shapeOf(page: Page): Promise<ShapeState> {
  return page.evaluate(() => {
    const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
      formulas: ({ id: string; kind: string } & ShapeState['object'])[];
      clips: (ShapeState['clip'] & { formulaId: string })[];
    };
    const object = p.formulas.filter((f) => f.kind === 'shape').at(-1)!;
    const clip = p.clips.find((c) => c.formulaId === object.id)!;
    return { clip, object };
  });
}

/** The box of f1's glyphs on clip a, scene units: the snapshot's glyph boxes (the same box the
 * evaluator measures: every point) moved to the clip's position (scale 1, unturned). */
async function targetBox(
  page: Page,
): Promise<{ minX: number; minY: number; maxX: number; maxY: number }> {
  const project = await getProject(page);
  const glyphs = (
    project.formulas.find((f) => f.id === 'fa') as unknown as {
      snapshot: { glyphs: { center: [number, number]; size: [number, number] }[] };
    }
  ).snapshot.glyphs;
  const [x, y] = (
    project.clips.find((c) => c.id === 'a') as unknown as {
      initial: { position: [number, number] };
    }
  ).initial.position;
  return {
    minX: x + Math.min(...glyphs.map((g) => g.center[0] - g.size[0] / 2)),
    maxX: x + Math.max(...glyphs.map((g) => g.center[0] + g.size[0] / 2)),
    minY: y + Math.min(...glyphs.map((g) => g.center[1] - g.size[1] / 2)),
    maxY: y + Math.max(...glyphs.map((g) => g.center[1] + g.size[1] / 2)),
  };
}

/** f1 (a+b=c) on clip a [0, 6) of track 1 at (−1, 0.5), written in 1 s; playhead at 2 s. */
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

test('Add shape ▸ Box on the clip menu: a box fitted around the formula, on a track in front of it', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-box').click();
  const { clip, object } = await shapeOf(page);
  expect([clip.start, clip.end, clip.intro.kind]).toEqual([2, 6, 'none']);
  // The formula is on the first track, and a box never goes behind what it surrounds: a new
  // track right above it, though the tracks below are empty.
  const rows = (await getProject(page)).tracks.map((t) => t.id);
  expect(rows).toHaveLength(4);
  expect(rows.indexOf(clip.trackId)).toBe(rows.indexOf('t1') - 1);
  expect(clip.attach).toEqual({ clipId: 'a', glyphs: 'all', rule: 'shape', buff: 0.1 });
  expect(object).toMatchObject({
    name: 's1',
    shape: 'box',
    color: '#FFFF00',
    style: { fillOpacity: 0, strokeWidth: 4, strokeOpacity: 1 },
  });
  // Fitted: the glyphs' box plus the gap all round, centred on it.
  const target = await targetBox(page);
  expect(object.width).toBeCloseTo(target.maxX - target.minX + 0.2, 3);
  expect(object.height).toBeCloseTo(target.maxY - target.minY + 0.2, 3);
  expect(clip.initial.position[0]).toBeCloseTo((target.minX + target.maxX) / 2, 3);
  expect(clip.initial.position[1]).toBeCloseTo((target.minY + target.maxY) / 2, 3);
  expect(clip.initial.rotation).toBe(0);
  const project = await getProject(page);
  expect(project.formulas.map((f) => f.name)).toEqual(['f1', 'f2', 's1']);
  // The shape's clip is selected: its panel names the target; a wider gap grows the box.
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('attachment-section')).toContainText('Shape');
  await expect(page.getByTestId('attachment-target')).toContainText(
    'Attached to f1 · all its glyphs',
  );
  await expect(page.getByTestId('attachment-size')).toHaveText(
    `${object.width.toFixed(3)} × ${object.height.toFixed(3)}`,
  );
  await page.getByTestId('attachment-buff').fill('0.3');
  await page.getByTestId('attachment-buff').press('Enter');
  const wider = await shapeOf(page);
  expect(wider.object.width).toBeCloseTo(object.width + 0.4, 3);
  // A circle instead: as wide as the diagonal of the glyphs' box plus the gap.
  await page.getByTestId('attachment-shape').selectOption('circle');
  const circle = await shapeOf(page);
  expect(circle.object.shape).toBe('circle');
  expect(circle.object.width).toBeCloseTo(
    Math.hypot(target.maxX - target.minX, target.maxY - target.minY) + 0.6,
    3,
  );
  await expect(page.getByTestId('attachment-corner')).toHaveCount(0);
  // The Creator does not list it.
  await expect(page.getByTestId('formula-item')).toHaveCount(2);
});

test('a highlight goes on the track below, filled with no stroke; an underline hangs below the glyphs', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-highlight').click();
  const { clip, object } = await shapeOf(page);
  // Behind the formula: the track right below its own, which has room.
  const project = await getProject(page);
  expect(project.tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  expect(clip.trackId).toBe('t2');
  expect(clip.intro.kind).toBe('none');
  expect(clip.attach).toMatchObject({ rule: 'shape', buff: 0 });
  expect(object).toMatchObject({
    shape: 'box',
    style: { fillOpacity: 0.3, strokeWidth: 0, strokeOpacity: 0 },
  });
  const target = await targetBox(page);
  expect(object.width).toBeCloseTo(target.maxX - target.minX, 3);
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('attachment-fill-opacity')).toHaveValue('0.3');
  // An underline from the preview menu, on some glyphs through the dialog. The highlight is
  // on screen from the start of its clip, and a press between two glyphs would be on its fill:
  // go back to before it starts, when the formula is alone there.
  await setTime(page, 1.5);
  const at = await scenePoint(page, [-1, 0.5]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
  await openSubmenu(page, 'preview-menu-shape');
  await page.getByTestId('preview-menu-shape-glyphs').click();
  const dialog = page.getByTestId('shape-glyphs-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('shape-glyphs-summary')).toHaveText('All glyphs');
  await page.getByTestId('shape-glyph-1').click(); // just "+"
  await page.getByTestId('shape-glyph-2').click({ modifiers: ['Shift'] }); // "+b"
  await expect(page.getByTestId('shape-glyphs-summary')).toHaveText('2 glyphs: 1, 2');
  await page.getByTestId('shape-glyphs-shape-underline').click();
  await page.getByTestId('shape-glyphs-add').click();
  await expect(dialog).toHaveCount(0);
  const line = await shapeOf(page);
  expect(line.object).toMatchObject({ name: 's2', shape: 'underline', color: '#FFFFFF' });
  expect(line.clip.attach).toMatchObject({ clipId: 'a', glyphs: [1, 2], buff: 0.1 });
  expect(line.object.height).toBe(0);
  expect(line.clip.initial.position[1]).toBeLessThan(target.minY);
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('attachment-target')).toContainText('glyphs 1, 2');
  await expect(page.getByTestId('attachment-fill-opacity')).toHaveCount(0);
});

test('a shape’s own menu in the preview: its colour, an intro, Remove animations and Detach; no side to choose', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-box').click();
  await setTime(page, 4);
  /** Right-click the box on its upper edge (its centre is the formula's). */
  const menuOnShape = async () => {
    const { clip, object } = await shapeOf(page);
    const [x, y] = clip.initial.position;
    const at = await scenePoint(page, [x, y + object.height / 2]);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(page.getByTestId('preview-menu-color')).toBeVisible();
  };
  await menuOnShape();
  await expect(page.getByTestId('preview-menu-direction')).toHaveCount(0);
  await expect(page.getByTestId('preview-menu-label')).toHaveCount(0);
  // It came without an intro; Create gives it Manim's.
  await expect(page.getByTestId('preview-menu-remove-animations')).toBeDisabled();
  await openSubmenu(page, 'preview-menu-intro');
  await expect(page.getByTestId('preview-menu-intro-none')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('preview-menu-intro-create').click();
  expect((await shapeOf(page)).clip.intro.kind).toBe('create');
  await menuOnShape();
  await openSubmenu(page, 'preview-menu-color');
  await page.getByTestId('preview-menu-color-BLUE').click();
  expect((await shapeOf(page)).object.color).toBe('#58C4DD');
  // Its Create goes: the box is there when its clip starts.
  await menuOnShape();
  await page.getByTestId('preview-menu-remove-animations').click();
  expect((await shapeOf(page)).clip.intro.kind).toBe('none');
  await menuOnShape();
  await expect(page.getByTestId('preview-menu-remove-animations')).toBeDisabled();
  await page.getByTestId('preview-menu-detach').click();
  expect((await shapeOf(page)).clip.attach).toBeNull();
});

test('a shape and a brace have one Transform, of the whole object, and no Morph (D123)', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-box').click();
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-brace');
  await page.getByTestId('add-brace-down').click();
  const ids = await page.evaluate(() => {
    const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
      formulas: { id: string; kind: string }[];
      clips: { id: string; formulaId: string }[];
    };
    const clipOf = (kind: string) =>
      p.clips.find((c) => p.formulas.find((f) => f.id === c.formulaId)!.kind === kind)!.id;
    return { shape: clipOf('shape'), brace: clipOf('brace') };
  });
  // The playhead on the two clips (2–6 s), where their Transform is to start: a clip's menu adds
  // there (D171).
  await setTime(page, 4);
  const menu = page.getByTestId('add-animation-menu');
  for (const [noun, clipId] of Object.entries(ids)) {
    const clip = page.getByTestId(`clip-${clipId}`);
    const b = await box(clip);
    await page.mouse.click(await timeToX(page, 4), b.y + b.height - 6, { button: 'right' });
    await expect(menu).toBeVisible();
    // The families of a formula, without its two Transforms and its Morph: a shape and a brace
    // are one piece each. A brace's Transform is one entry; a shape's opens its own two.
    await expect(menu.getByRole('menuitem').first()).toHaveText('Appear›');
    await expect(menu.getByTestId('add-animation-transform')).toHaveCount(0);
    await expect(menu.getByTestId('add-animation-morph')).toHaveCount(0);
    if (noun === 'shape') {
      await openSubmenu(page, 'add-animation-group-transform');
      await expect(page.getByTestId('add-animation-retarget')).toHaveText(
        'To another formula or glyphs…',
      );
    } else {
      await expect(menu.getByTestId('add-animation-group-transform')).toHaveCount(0);
    }
    await expect(page.getByTestId('add-animation-tween')).toHaveText('Transform');
    await page.getByTestId('add-animation-tween').click();
    // The block, its tooltip and its panel say Transform and name the object, not a formula.
    const block = clip.locator('.tl-block.is-transform');
    await expect(block).toHaveAttribute('data-kind', 'tween');
    await expect(block).toHaveAttribute('title', /^Transform\n4\.00 s → 5\.00 s/);
    const panel = page.getByTestId('block-properties');
    await expect(panel.getByTestId('block-tween-hint')).toHaveText(
      `Transform: the ${noun} moves to a new state (a keyframe).`,
    );
    await expect(panel.getByTestId('block-kind-tween')).toHaveCount(0);
    await expect(panel.getByTestId('block-kind-transform')).toHaveCount(0);
    await expect(panel).not.toContainText(/formula/i);
    await expect(page.locator('.tl-state-icon.is-end')).toHaveAttribute(
      'title',
      `Edit the end state: move, scale or rotate the ${noun} in the preview`,
    );
    // Its dialog too.
    await block.dblclick();
    await expect(page.getByTestId('block-dialog-whole')).toHaveText(
      `A keyframe: this block moves the ${noun}.`,
    );
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('block-dialog')).toHaveCount(0);
  }
  // The formula's clip keeps its two Transforms and its Morph.
  await rightClickClip(page, 3);
  await expect(menu.getByTestId('add-animation-group-transform')).toBeVisible();
  await expect(menu.getByTestId('add-animation-morph')).toBeVisible();
});

/** The braces of the project in the order they were made: each clip's attachment and start, and
 * its object's width. */
async function bracesOf(page: Page) {
  return page.evaluate(() => {
    const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
      formulas: { id: string; kind: string; width: number }[];
      clips: { id: string; formulaId: string; start: number; attach: Record<string, unknown> }[];
    };
    return p.formulas
      .filter((f) => f.kind === 'brace')
      .map((f) => ({ ...p.clips.find((c) => c.formulaId === f.id)!, width: f.width }));
  });
}

test('Add brace on a shape, in the preview and on its clip: on the whole of it, no shape on a shape (D123)', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-box').click();
  await setTime(page, 4);
  const shape = await shapeOf(page);
  // In the preview, on the box's upper edge: a brace, with no glyphs to choose, and no shape.
  const [x, y] = shape.clip.initial.position;
  const at = await scenePoint(page, [x, y + shape.object.height / 2]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
  await expect(page.getByTestId('preview-menu-shape')).toHaveCount(0);
  await expect(page.getByTestId('preview-menu-brace')).toHaveText('Add brace›');
  await openSubmenu(page, 'preview-menu-brace');
  await expect(page.getByTestId('preview-menu-brace-glyphs')).toHaveCount(0);
  await page.getByTestId('preview-menu-brace-down').click();
  expect((await bracesOf(page))[0]).toMatchObject({
    start: 4,
    attach: { rule: 'brace', clipId: shape.clip.id, glyphs: 'all', direction: 0 },
  });
  // Fitted to the box: as wide as it is.
  await expect.poll(async () => (await bracesOf(page))[0]!.width).toBeCloseTo(shape.object.width);
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('attachment-target')).toContainText('Attached to s1');
  // On its clip: the same entry, and still no shape on a shape.
  const b = await box(page.getByTestId(`clip-${shape.clip.id}`));
  await page.mouse.click(await timeToX(page, 4.5), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  await expect(page.getByTestId('add-shape')).toHaveCount(0);
  await openSubmenu(page, 'add-brace');
  await expect(page.getByTestId('add-brace-glyphs')).toHaveCount(0);
  await page.getByTestId('add-brace-up').click();
  // From the playhead, as any brace: not from where the menu was opened.
  expect((await bracesOf(page))[1]).toMatchObject({
    start: 4,
    attach: { rule: 'brace', clipId: shape.clip.id, glyphs: 'all', direction: 180 },
  });
  // A brace takes a label, never a brace: neither menu offers one on it.
  const brace = (await bracesOf(page))[1]!;
  const bb = await box(page.getByTestId(`clip-${brace.id}`));
  await page.mouse.click(await timeToX(page, 5), bb.y + bb.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  await expect(page.getByTestId('add-brace')).toHaveCount(0);
  await expect(page.getByTestId('add-label')).toBeVisible();
});

test('several selected clips take one brace over them all, from the timeline and from the preview (D123)', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-circle').click();
  await setTime(page, 4);
  const shape = await shapeOf(page);
  const select = (ids: string[]) =>
    page.evaluate((clipIds) => {
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: clipIds });
    }, ids);
  // The formula and its circle, selected: the clips' menu on the timeline.
  await select(['a', shape.clip.id]);
  const b = await box(page.getByTestId('clip-a'));
  await page.mouse.click(await timeToX(page, 4), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('clips-menu')).toBeVisible();
  await openSubmenu(page, 'clips-menu-brace');
  await expect(page.getByTestId('clips-menu-brace-glyphs')).toHaveCount(0);
  await page.getByTestId('clips-menu-brace-right').click();
  expect((await bracesOf(page))[0]).toMatchObject({
    start: 4,
    attach: {
      rule: 'brace',
      clipId: 'a',
      glyphs: 'all',
      direction: 90,
      also: [{ clipId: shape.clip.id, glyphs: 'all' }],
    },
  });
  // As tall as the circle, the taller of the two (a brace on the right measures heights).
  await expect.poll(async () => (await bracesOf(page))[0]!.width).toBeCloseTo(shape.object.width);
  // In the preview: the clip under the pointer first, and the entry says what it spans.
  await select(['a', shape.clip.id]);
  const [x, y] = shape.clip.initial.position;
  const at = await scenePoint(page, [x, y + shape.object.height / 2]);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu-brace')).toHaveText(
    'Add brace · on the 2 selected clips›',
  );
  await openSubmenu(page, 'preview-menu-brace');
  await expect(page.getByTestId('preview-menu-brace-glyphs')).toHaveCount(0);
  await page.getByTestId('preview-menu-brace-down').click();
  expect((await bracesOf(page))[1]!.attach).toMatchObject({
    clipId: shape.clip.id,
    glyphs: 'all',
    direction: 0,
    also: [{ clipId: 'a', glyphs: 'all' }],
  });
  // With a brace among the selected clips there is none to add.
  const brace = (await bracesOf(page))[1]!;
  await select(['a', shape.clip.id, brace.id]);
  await page.mouse.click(await timeToX(page, 4.5), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('clips-menu')).toBeVisible();
  await expect(page.getByTestId('clips-menu-brace')).toHaveCount(0);
});

test('several selected clips take one shape around them all, from the preview and from the timeline (D126)', async ({
  page,
}) => {
  // f1 at (−1, 0.5) over [0, 6) and f2 at (2, −1) over [1, 8); f2 again, later, over [9, 12).
  await page.setViewportSize({ width: 1500, height: 950 });
  const a = plain('a', 'fa', 't1', 0, 6);
  a.initial.position = [-1, 0.5];
  const b = plain('b', 'fb', 't2', 1, 8);
  b.initial.position = [2, -1];
  const late = plain('late', 'fb', 't2', 9, 12);
  await openWithProject(page, relationProject([a, b, late]));
  await setTime(page, 2);
  const select = (ids: string[]) =>
    page.evaluate((clipIds) => {
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: clipIds });
    }, ids);
  const menuOnTimeline = async (clipId: string, t: number) => {
    const lane = await box(page.getByTestId(`clip-${clipId}`));
    await page.mouse.click(await timeToX(page, t), lane.y + lane.height - 6, { button: 'right' });
    await expect(page.getByTestId('clips-menu')).toBeVisible();
  };

  // In the preview, on one of the two selected: the entry says what the shape goes around, and
  // has no glyph dialog (the glyphs would be of one object).
  await select(['a', 'b']);
  const onB = await scenePoint(page, [2, -1]);
  await page.mouse.click(onB.x, onB.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu-shape')).toHaveText(
    'Add shape · on the 2 selected clips›',
  );
  await openSubmenu(page, 'preview-menu-shape');
  await expect(page.getByTestId('preview-menu-shape-glyphs')).toHaveCount(0);
  await page.getByTestId('preview-menu-shape-box').click();
  // One box, on the clip under the pointer first, from the playhead to the first of their ends.
  let shape = await shapeOf(page);
  expect(shape.clip).toMatchObject({
    start: 2,
    end: 6,
    attach: {
      rule: 'shape',
      clipId: 'b',
      glyphs: 'all',
      also: [{ clipId: 'a', glyphs: 'all' }],
    },
  });
  expect(shape.object.shape).toBe('box');
  // Fitted around both: centred between them, wider and taller than the distance between them.
  await expect.poll(async () => (await shapeOf(page)).object.width).toBeGreaterThan(3);
  shape = await shapeOf(page);
  expect(shape.object.height).toBeGreaterThan(1.5);
  expect(shape.clip.initial.position[0]).toBeGreaterThan(-1);
  expect(shape.clip.initial.position[0]).toBeLessThan(2);
  // It is selected, alone: one undo step takes it back.
  expect((await getProject(page)).clips).toHaveLength(4);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await getProject(page)).clips).toHaveLength(3);

  // On the timeline, the menu of the selected clips has it too.
  await select(['a', 'b']);
  await menuOnTimeline('a', 3);
  await expect(page.getByTestId('clips-menu-shape')).toHaveText('Add shape›');
  await openSubmenu(page, 'clips-menu-shape');
  await expect(page.getByTestId('clips-menu-shape-glyphs')).toHaveCount(0);
  await page.getByTestId('clips-menu-shape-circle').click();
  shape = await shapeOf(page);
  expect(shape.object.shape).toBe('circle');
  expect(shape.clip.attach).toMatchObject({
    clipId: 'a',
    also: [{ clipId: 'b', glyphs: 'all' }],
  });

  // Clips that are never on screen together: the entry is there, greyed out, and says why.
  await select(['a', 'late']);
  await menuOnTimeline('a', 3);
  const never = page.getByTestId('clips-menu-shape');
  await expect(never).toBeDisabled();
  await expect(never).toHaveAttribute('title', 'The selected clips are never on screen together.');
  await page.keyboard.press('Escape');

  // With a shape among the selected clips there is none to add around them: the preview offers
  // the shape of the clip under the pointer alone.
  await select(['a', 'b', shape.clip.id]);
  await menuOnTimeline('a', 3);
  await expect(page.getByTestId('clips-menu-brace')).toBeVisible();
  await expect(page.getByTestId('clips-menu-shape')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.click(onB.x, onB.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu-shape')).toHaveText('Add shape›');
});

test('Add shape ▸ Cross line: one line of a cross over the formula, along the diagonal chosen for it (D128)', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-cross_line').click();
  const { clip, object } = await shapeOf(page);
  expect(clip.attach).toEqual({ clipId: 'a', glyphs: 'all', rule: 'shape', buff: 0 });
  // A cross in everything but the count of its lines: Manim's red, 6 wide; the rising diagonal,
  // which the object does not name.
  expect(object).toMatchObject({
    name: 's1',
    shape: 'cross_line',
    color: '#FC6255',
    style: { fillOpacity: 0, strokeWidth: 6, strokeOpacity: 1 },
  });
  expect(object).not.toHaveProperty('diagonal');
  // Fitted as a cross is: the glyphs' box, with no gap.
  const target = await targetBox(page);
  expect(object.width).toBeCloseTo(target.maxX - target.minX, 3);
  expect(object.height).toBeCloseTo(target.maxY - target.minY, 3);

  // What is drawn: a point near the start of each diagonal of that box is on the line, or not.
  await setTime(page, 4);
  const near = (from: [number, number], to: [number, number]): [number, number] => [
    from[0] + 0.12 * (to[0] - from[0]),
    from[1] + 0.12 * (to[1] - from[1]),
  ];
  const onRising = near([target.minX, target.minY], [target.maxX, target.maxY]);
  const onFalling = near([target.minX, target.maxY], [target.maxX, target.minY]);
  const red = async (point: [number, number]) => {
    const [r, g, b] = await pixelAt(page, point);
    return r! > 180 && g! < 160 && b! < 160;
  };
  await expect.poll(() => red(onRising)).toBe(true);
  expect(await red(onFalling)).toBe(false);

  // Its panel has the diagonal, and no gap (a cross has none); the other diagonal is the other
  // line, one undo step.
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('attachment-buff')).toHaveCount(0);
  const diagonal = page.getByTestId('attachment-diagonal');
  await expect(diagonal).toHaveValue('dl_ur');
  await expect(diagonal.locator('option')).toHaveText(['DL-UR', 'UL-DR']);
  await diagonal.selectOption('ul_dr');
  expect((await shapeOf(page)).object.diagonal).toBe('ul_dr');
  await expect.poll(() => red(onFalling)).toBe(true);
  expect(await red(onRising)).toBe(false);
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.undo());
  expect((await shapeOf(page)).object).not.toHaveProperty('diagonal');
  await expect.poll(() => red(onRising)).toBe(true);

  // Its editor has the same choice, applied with the rest.
  const lane = await box(page.getByTestId(`clip-${clip.id}`));
  await page.getByTestId(`clip-${clip.id}`).dblclick({ position: { x: 12, y: lane.height - 6 } });
  const editor = page.getByTestId('formula-editor');
  await expect(editor.getByRole('radio', { name: 'DL-UR' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await editor.getByRole('radio', { name: 'UL-DR' }).click();
  await editor.getByTestId('editor-apply').click();
  await closeEditor(page);
  expect((await shapeOf(page)).object.diagonal).toBe('ul_dr');

  // Another shape has no diagonal: the field goes with the choice.
  await page.getByTestId('attachment-shape').selectOption('cross');
  expect((await shapeOf(page)).object).toMatchObject({ shape: 'cross' });
  expect((await shapeOf(page)).object).not.toHaveProperty('diagonal');
  await expect(page.getByTestId('attachment-diagonal')).toHaveCount(0);
});

test('a shape has a fill colour of its own, and a Transform repaints it (D123)', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-box').click();
  await setTime(page, 4);
  await openAnimationsTab(page, 'timing');
  // A wide gap and an opaque fill: a point of the gap, off the glyphs, shows the fill alone.
  await page.getByTestId('attachment-buff').fill('0.4');
  await page.getByTestId('attachment-buff').press('Enter');
  await page.getByTestId('attachment-fill-opacity').fill('1');
  await page.getByTestId('attachment-fill-opacity').press('Enter');
  const target = await targetBox(page);
  const inGap: [number, number] = [target.minX - 0.2, target.maxY + 0.2];
  // The fill is the stroke's colour — the box's yellow — until it has one of its own.
  const own = page.getByTestId('attachment-fill-color-on');
  await expect(own).not.toBeChecked();
  await expect(page.getByTestId('attachment-fill-color')).toHaveCount(0);
  expect((await shapeOf(page)).object.fillColor).toBeUndefined();
  await expect.poll(() => pixelAt(page, inGap)).toEqual([255, 255, 0]);
  // Given one, it starts from the box's colour and is edited apart from it.
  await own.check();
  expect((await shapeOf(page)).object.fillColor).toBe('#FFFF00');
  await page.getByTestId('attachment-fill-color').fill('#0000ff');
  await page.getByTestId('attachment-fill-color').dispatchEvent('change');
  expect((await shapeOf(page)).object).toMatchObject({ color: '#FFFF00', fillColor: '#0000FF' });
  await expect.poll(() => pixelAt(page, inGap)).toEqual([0, 0, 255]);

  // A Transform of the box, at the playhead: it names what it repaints, field by field.
  const shape = (await shapeOf(page)).clip;
  const b = await box(page.getByTestId(`clip-${shape.id}`));
  await page.mouse.click(await timeToX(page, 4), b.y + b.height - 6, { button: 'right' });
  await openSubmenu(page, 'add-animation-group-transform');
  await page.getByTestId('add-animation-tween').click();
  const tween = page.locator('[data-testid^="tween-"]').first();
  const id = (await tween.getAttribute('data-testid'))!;
  const to = async () =>
    (await getProject(page)).clips.find((c) => c.id === shape.id)!.actions[0] as unknown as {
      to: Record<string, unknown>;
    };
  await page.getByTestId(`${id}-fill-color-on`).check();
  await page.getByTestId(`${id}-stroke-width-on`).check();
  // Each starts from what the box has there.
  expect((await to()).to).toMatchObject({ fillColor: '#0000FF', strokeWidth: 4 });
  await page.getByTestId(`${id}-fill-color`).fill('#ff0000');
  await page.getByTestId(`${id}-fill-color`).dispatchEvent('change');
  await page.getByTestId(`${id}-stroke-width`).fill('10');
  await page.getByTestId(`${id}-stroke-width`).press('Enter');
  await page.getByTestId(`${id}-easing`).selectOption('linear');
  expect((await to()).to).toMatchObject({ fillColor: '#FF0000', strokeWidth: 10 });
  // The preview goes from the one colour to the other, through their mix half-way.
  await setTime(page, 4.5);
  const mid = await pixelAt(page, inGap);
  expect(mid[1]).toBe(0);
  expect(Math.abs(mid[0]! - 128)).toBeLessThanOrEqual(2);
  expect(Math.abs(mid[2]! - 128)).toBeLessThanOrEqual(2);
  await setTime(page, 5.5);
  await expect.poll(() => pixelAt(page, inGap)).toEqual([255, 0, 0]);
  await setTime(page, 3.5);
  await expect.poll(() => pixelAt(page, inGap)).toEqual([0, 0, 255]);

  // The shape's editor has the same field; unticked and applied, the fill is the stroke's again.
  await page.getByTestId(`clip-${shape.id}`).dblclick({ position: { x: 12, y: b.height - 6 } });
  const editor = page.getByTestId('formula-editor');
  await expect(editor.getByTestId('shape-fill-color-on')).toBeChecked();
  await editor.getByTestId('shape-fill-color-on').uncheck();
  await editor.getByTestId('editor-apply').click();
  await closeEditor(page);
  expect('fillColor' in (await shapeOf(page)).object).toBe(false);
  await expect.poll(() => pixelAt(page, inGap)).toEqual([255, 255, 0]);
});

test('an attached shape does not drag in the preview, and says why; detached, it moves', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-box').click();
  await setTime(page, 4); // the box has been created by then
  const { clip } = await shapeOf(page);
  // Press on the box's stroke: its right edge, at the clip's height.
  const edge = await scenePoint(page, [
    clip.initial.position[0] + (await shapeOf(page)).object.width / 2,
    clip.initial.position[1],
  ]);
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 120, edge.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('notice')).toContainText('Attached to f1 · Detach to move');
  expect((await shapeOf(page)).clip.initial.position).toEqual(clip.initial.position);
  // Detach: it stays put, keeps its size, and the next drag moves it.
  await openAnimationsTab(page, 'timing');
  await page.getByTestId('attachment-detach').click();
  await expect(page.getByTestId('attachment-target')).toContainText('Detached');
  const freed = await shapeOf(page);
  expect(freed.clip.attach).toBeNull();
  expect(freed.clip.initial.position).toEqual(clip.initial.position);
  expect(freed.object.width).toBeGreaterThan(1);
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 120, edge.y + 60, { steps: 6 });
  await page.mouse.up();
  const moved = (await shapeOf(page)).clip.initial.position;
  expect(moved[0]).toBeGreaterThan(clip.initial.position[0] + 0.5);
});

test('Align moves a formula selected with its box, never the box by itself', async ({ page }) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-box').click();
  const shape = (await shapeOf(page)).clip.id;
  const canUndo = () => page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo());
  const select = (ids: string[]) =>
    page.evaluate(
      (clips) =>
        (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: clips }),
      ids,
    );
  /** How far the box's centre is from the centre of the glyphs it surrounds. */
  const offCentre = async () => {
    const target = await targetBox(page);
    const [x, y] = (await shapeOf(page)).clip.initial.position;
    return Math.hypot(x - (target.minX + target.maxX) / 2, y - (target.minY + target.maxY) / 2);
  };
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.clear());

  // The formula and its box, Align left: the box is no edge to align the formula to (it would
  // creep left by the gap at every press) — the formula is alone, and goes to the frame's edge.
  const before = await targetBox(page);
  await select(['a', shape]);
  await page.keyboard.press('Alt+KeyA');
  const frameLeft = -((8 * 16) / 9) / 2;
  await expect.poll(async () => (await targetBox(page)).minX).toBeCloseTo(frameLeft, 4);
  await expect.poll(offCentre).toBeLessThan(1e-4);
  await expect(page.getByTestId('notice')).toHaveCount(0);
  // One step, the formula's: taken back, both are where they were.
  await page.keyboard.press('ControlOrMeta+z');
  expect((await targetBox(page)).minX).toBeCloseTo(before.minX, 6);
  expect(await offCentre()).toBeLessThan(1e-4);
  expect(await canUndo()).toBe(false);

  // The box alone: it is placed by the formula, so it stays, with no step, and the notice says so.
  await select([shape]);
  await page.keyboard.press('Alt+KeyA');
  const notice = page.getByTestId('notice').last();
  await expect(notice).toContainText('1 clip stayed');
  await expect(notice).toContainText('attached to another');
  expect(await canUndo()).toBe(false);
  expect(await offCentre()).toBeLessThan(1e-4);
});

test('deleting the clip a shape hangs on takes the shape and its object along', async ({
  page,
}) => {
  await openScene(page);
  await rightClickClip(page, 3);
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-cross').click();
  await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('dialog-details')).toHaveText([
    's1 (2 s–6 s) on Track 4, attached to f1',
  ]);
  await holdToConfirm(page);
  const project = await getProject(page);
  expect(project.clips).toEqual([]);
  expect(project.formulas.map((f) => f.name)).toEqual(['f1', 'f2']);
});
