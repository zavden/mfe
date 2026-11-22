import { expect, test, type Page } from './test';
import {
  asTween,
  canUndo,
  clipJson,
  clipOf,
  dropFormula,
  openTimeline,
  project,
  setTime,
  uiState,
  undo,
} from './timelineHelpers';
import { holdToConfirm, openAnimationsTab } from './helpers';

/* A on track 1 [1, 4.3] (intro 1 s, outro 1 s), B on track 2 [6, 9]. */
const A = clipJson('a', 'fa', 't1', 1, 4.3);
const B = clipJson('b', 'fb', 't2', 6, 9);

/** Select a clip and show its Timing tab, where most of these tests edit. */
async function select(page: Page, id: string): Promise<void> {
  await page.getByTestId(`clip-${id}`).click({ position: { x: 40, y: 10 } });
  await expect(page.getByTestId('clip-properties')).toBeVisible();
  await openAnimationsTab(page, 'timing');
}

async function enter(page: Page, testId: string, value: string): Promise<void> {
  const field = page.getByTestId(testId);
  await field.fill(value);
  await field.press('Enter');
}

test.describe('clip properties', () => {
  test('asks for a selection, then shows the clip', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await expect(page.getByTestId('animations-empty')).toBeVisible();
    // A clip opens on the Relations tab.
    await page.getByTestId('clip-a').click({ position: { x: 40, y: 10 } });
    await expect(page.getByTestId('animations-tab-relations')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('relations-section')).toBeVisible();
    await select(page, 'a');
    await expect(page.getByTestId('clip-title')).toHaveText('alpha');
    await expect(page.getByTestId('clip-track')).toHaveValue('t1');
    await expect(page.getByTestId('clip-start')).toHaveValue('1');
    await expect(page.getByTestId('clip-end')).toHaveValue('4.3');
    await expect(page.getByTestId('clip-length')).toHaveText('3.300 s');
    await expect(page.getByTestId('intro-kind')).toHaveValue('write');
    await expect(page.getByTestId('outro-kind')).toHaveValue('fade_out');
    // The Relations tab (the default one) holds the relations.
    await openAnimationsTab(page, 'relations');
    await expect(page.getByTestId('relations-empty')).toBeVisible();
    await expect(page.getByTestId('relations-section')).toContainText('Relations');
    await expect(page.getByTestId('clip-start')).toBeHidden();
    // Deselecting returns to the placeholder.
    await page.getByTestId('track-lane-t3').click({ position: { x: 400, y: 10 } });
    await expect(page.getByTestId('animations-empty')).toBeVisible();
  });

  test('edits the intro: kind (with its defaults), duration, easing, lag ratio', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');

    await page.getByTestId('intro-kind').selectOption('fade_in');
    expect((await clipOf(page, 'a')).intro).toMatchObject({
      kind: 'fade_in',
      duration: 1,
      easing: 'smooth',
      lagRatio: null,
    });
    await expect(page.getByTestId('intro-shift-x')).toBeVisible(); // fade: shift and scale
    await undo(page); // one step per committed edit
    expect((await clipOf(page, 'a')).intro.kind).toBe('write');
    await expect(page.getByTestId('intro-shift-x')).toHaveCount(0);

    await enter(page, 'intro-duration', '0.5');
    expect((await clipOf(page, 'a')).intro.duration).toBe(0.5);
    await undo(page); // Enter is one committed edit, one undo step
    expect((await clipOf(page, 'a')).intro.duration).toBe(1);
    await enter(page, 'intro-duration', '0.5');
    // The segment on the timeline follows: 0.5 s at 80 px/s.
    const w = (await page.getByTestId('clip-a-intro').boundingBox())!.width;
    expect(w).toBeCloseTo(40, 0);
    // Longer than the clip allows (3.3 − 1 outro = 2.3): clamped.
    await enter(page, 'intro-duration', '10');
    expect((await clipOf(page, 'a')).intro.duration).toBeCloseTo(2.3, 6);

    await page.getByTestId('intro-easing').selectOption('rush_into');
    expect((await clipOf(page, 'a')).intro.easing).toBe('rush_into');

    // Lag ratio: Auto shows Manim's default; Custom takes a number.
    await expect(page.getByTestId('intro-lag-mode')).toHaveValue('auto');
    await expect(page.getByTestId('intro-lag')).toBeDisabled();
    await page.getByTestId('intro-lag-mode').selectOption('custom');
    await enter(page, 'intro-lag', '0.4');
    expect((await clipOf(page, 'a')).intro.lagRatio).toBe(0.4);
    await page.getByTestId('intro-lag-mode').selectOption('auto');
    expect((await clipOf(page, 'a')).intro.lagRatio).toBeNull();
  });

  test('edits the outro and can switch an animation off', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    await page.getByTestId('outro-kind').selectOption('unwrite');
    expect((await clipOf(page, 'a')).outro).toMatchObject({ kind: 'unwrite', easing: 'linear' });
    await page.getByTestId('outro-kind').selectOption('fade_out');
    await enter(page, 'outro-shift-y', '-1');
    await enter(page, 'outro-scale', '0.5');
    expect((await clipOf(page, 'a')).outro).toMatchObject({ shift: [0, -1], scale: 0.5 });
    await page.getByTestId('outro-kind').selectOption('none');
    expect((await clipOf(page, 'a')).outro).toMatchObject({ kind: 'none', duration: 0 });
    await expect(page.getByTestId('outro-duration')).toBeDisabled();
    await expect(page.getByTestId('clip-a-outro')).toHaveCount(0);
  });

  test('edits the initial state; sliders are one undo step per drag', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    await enter(page, 'initial-x', '2.5');
    await enter(page, 'initial-y', '-1');
    await enter(page, 'initial-scale', '1.5');
    await enter(page, 'initial-rotation', '30');
    await page.getByTestId('initial-flip-x').check();
    let initial = (await clipOf(page, 'a')).initial;
    expect(initial).toMatchObject({
      position: [2.5, -1],
      scale: 1.5,
      rotation: 30,
      flipX: true,
      flipY: false,
    });
    await page.getByTestId('initial-color-on').check();
    await page.getByTestId('initial-color').fill('#ff0000');
    expect((await clipOf(page, 'a')).initial.color).toBe('#FF0000');
    await page.getByTestId('initial-color-on').uncheck();
    expect((await clipOf(page, 'a')).initial.color).toBeNull();

    // Arrow keys nudge a number box.
    await page.getByTestId('initial-rotation').focus();
    await page.keyboard.press('ArrowUp');
    expect((await clipOf(page, 'a')).initial.rotation).toBe(35);
    await page.getByTestId('initial-rotation').blur();

    // Opacity slider: several updates during one drag are a single undo step.
    const slider = page.getByTestId('initial-opacity-slider');
    expect(await canUndo(page)).toBe(true);
    await slider.dispatchEvent('pointerdown');
    await slider.fill('0.8');
    await slider.fill('0.5');
    await slider.fill('0.3');
    expect((await clipOf(page, 'a')).initial.opacity).toBeCloseTo(0.3, 6);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup')));
    await undo(page);
    initial = (await clipOf(page, 'a')).initial;
    expect(initial.opacity).toBe(1);
    expect(initial.rotation).toBe(35);
  });

  test('the wheel nudges a number box while the mouse button is held on it: one undo step', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    const rotation = page.getByTestId('initial-rotation');
    const stored = async () => (await clipOf(page, 'a')).initial.rotation;
    await rotation.scrollIntoViewIfNeeded();
    const at = (await rotation.boundingBox())!;
    const x = at.x + at.width / 2;
    const y = at.y + at.height / 2;
    // Held on the number: each notch up is a step of the field (5°), written as it turns. The
    // panel does not scroll under it.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.wheel(0, -100);
    await page.mouse.wheel(0, -100);
    await expect(rotation).toHaveValue('10');
    await expect(rotation).toHaveClass(/is-scrubbing/);
    expect(await stored()).toBe(10);
    // Shift: ten steps; Alt: a tenth of one; down for less.
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Shift');
    await expect(rotation).toHaveValue('60');
    await page.keyboard.down('Alt');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Alt');
    await expect(rotation).toHaveValue('59.5');
    await page.mouse.wheel(0, 100);
    await expect(rotation).toHaveValue('54.5');
    await page.mouse.up();
    await expect(rotation).not.toHaveClass(/is-scrubbing/);
    expect(await stored()).toBe(54.5);
    // All the notches were one step.
    await undo(page);
    expect(await stored()).toBe(0);
    // Escape, with the button still held, takes the notches back.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.wheel(0, 100);
    await expect(rotation).toHaveValue('-5');
    await page.keyboard.press('Escape');
    await expect(rotation).toHaveValue('0');
    expect(await stored()).toBe(0);
    await page.mouse.up();
    expect((await rotation.boundingBox())!.y).toBeCloseTo(at.y, 0);
    // Let go, the wheel is the panel's again: the number stays, and the box takes typing as
    // always.
    await page.mouse.wheel(0, -100);
    await page.mouse.wheel(0, 100);
    expect(await stored()).toBe(0);
    await enter(page, 'initial-rotation', '15');
    expect(await stored()).toBe(15);
  });

  test('keyframes: add at the playhead, edit the target fields, delete', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    await setTime(page, 2.2); // after the intro (ends at 2), before the outro (starts at 3.3)
    await page.getByTestId('add-keyframe').click();
    let clip = await clipOf(page, 'a');
    expect(clip.actions).toHaveLength(1);
    const tween = asTween(clip.actions[0]);
    expect(1 + tween.start).toBeCloseTo(2.2, 6);
    expect(tween.duration).toBeCloseTo(1, 6);
    expect(tween.to).toMatchObject({ position: [0, 0], scale: 1, rotation: 0, opacity: 1 });
    await expect(page.getByTestId(`tween-${tween.id}`)).toBeVisible(); // in the list…
    await expect(page.getByTestId(`action-block-${tween.id}`)).toBeVisible();

    const id = tween.id;
    await enter(page, `tween-${id}-position-x`, '3');
    await enter(page, `tween-${id}-rotation`, '90');
    await page.getByTestId(`tween-${id}-flip-x-on`).check();
    await page.getByTestId(`tween-${id}-flip-x`).check();
    await page.getByTestId(`tween-${id}-easing`).selectOption('linear');
    clip = await clipOf(page, 'a');
    expect(clip.actions[0]).toMatchObject({
      easing: 'linear',
      to: { position: [3, 0], rotation: 90, flipX: true },
    });
    await page.getByTestId(`tween-${id}-scale-on`).uncheck();
    expect(asTween((await clipOf(page, 'a')).actions[0]).to).not.toHaveProperty('scale');

    // The tween cannot grow into the outro: the free time ends at 3.3.
    await enter(page, `tween-${id}-duration`, '5');
    expect((await clipOf(page, 'a')).actions[0]!.duration).toBeCloseTo(3.3 - 2.2, 6);
    await enter(page, `tween-${id}-start`, '0.5'); // earlier than the intro end: clamped to it
    expect(1 + (await clipOf(page, 'a')).actions[0]!.start).toBeCloseTo(2, 6);

    await page.getByTestId(`tween-${id}-delete`).click();
    await holdToConfirm(page); // deleting an animation asks for a held confirmation
    expect((await clipOf(page, 'a')).actions).toHaveLength(0);
    await undo(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  });

  test('"Add keyframe at playhead" refuses a playhead that is not in free time', async ({
    page,
  }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    await setTime(page, 1.5); // inside the intro
    await page.getByTestId('add-keyframe').click();
    await expect(page.getByTestId('clip-notice')).toContainText('free time');
    expect((await clipOf(page, 'a')).actions).toHaveLength(0);
    expect(await canUndo(page)).toBe(false);

    await setTime(page, 2.2);
    await page.getByTestId('add-keyframe').click();
    await expect(page.getByTestId('clip-notice')).toHaveCount(0);
    await setTime(page, 2.6); // inside the tween just created
    await page.getByTestId('add-keyframe').click();
    await expect(page.getByTestId('clip-notice')).toBeVisible();
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);

    await setTime(page, 0.5); // outside the clip
    await page.getByTestId('add-keyframe').click();
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  });

  test('timing: track, start and end', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    await enter(page, 'clip-start', '1.5');
    expect(await clipOf(page, 'a')).toMatchObject({ start: 1.5, end: 4.3 });
    await enter(page, 'clip-end', '2'); // shorter than intro + outro: clamped
    expect((await clipOf(page, 'a')).end).toBeCloseTo(3.5, 6);
    await enter(page, 'clip-end', '30');
    expect((await clipOf(page, 'a')).end).toBe(30);

    await page.getByTestId('clip-track').selectOption('t3');
    expect((await clipOf(page, 'a')).trackId).toBe('t3');
    // Track 2 is occupied by B [6, 9] while A runs to 30: refused.
    await page.getByTestId('clip-track').selectOption('t2');
    await expect(page.getByTestId('clip-notice')).toContainText('occupied');
    expect((await clipOf(page, 'a')).trackId).toBe('t3');
  });

  test('shows the problems of the selected clip', async ({ page }) => {
    // Intro 1 s + outro 1 s do not fit in a 1.5 s clip.
    await openTimeline(page, [clipJson('short', 'fa', 't1', 0, 1.5), B]);
    await select(page, 'short');
    await expect(page.getByTestId('clip-issues')).toContainText('Intro and outro do not fit');
    // An error: the section is Problems, in red (D177).
    await expect(page.getByTestId('issues-section')).toHaveAttribute('data-tone', 'problems');
    await expect(page.getByTestId('issues-section').locator('h3')).toHaveText('Problems');
    // Fixing it clears the list.
    await page.getByTestId('outro-kind').selectOption('none');
    await expect(page.getByTestId('clip-issues')).toHaveCount(0);
    // B has no problems.
    await select(page, 'b');
    await expect(page.getByTestId('clip-issues')).toHaveCount(0);
  });

  test('is read-only while the track is locked', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    await page.getByTestId('track-lock-t1').click();
    await expect(page.getByTestId('clip-locked')).toContainText('locked');
    await expect(page.getByTestId('intro-kind')).toBeDisabled();
    await expect(page.getByTestId('clip-start')).toBeDisabled();
    await expect(page.getByTestId('clip-delete')).toBeDisabled();
    await expect(page.getByTestId('add-keyframe')).toBeDisabled();
    await page.getByTestId('track-lock-t1').click();
    await expect(page.getByTestId('intro-kind')).toBeEnabled();
  });

  test('several clips: shows the count and deletes them', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    await page.getByTestId('clip-b').click({ modifiers: ['Shift'], position: { x: 40, y: 10 } });
    await expect(page.getByTestId('animations-multi')).toContainText('2 clips selected');
    await page.getByTestId('animations-delete-selected').click();
    expect((await project(page)).clips).toHaveLength(0);
    await expect(page.getByTestId('animations-empty')).toBeVisible();
    await undo(page);
    expect((await project(page)).clips).toHaveLength(2);
  });

  test('deleting the clip from the panel removes it and its relations', async ({ page }) => {
    await openTimeline(page, [A, B]);
    await select(page, 'a');
    await page.getByTestId('clip-delete').click();
    expect((await project(page)).clips.map((c) => c.id)).toEqual(['b']);
    expect((await uiState(page)).selection.kind).toBe('none');
  });
});

test.describe('Phase 3 acceptance: two formulas on two tracks', () => {
  test('a 1 s Write on one, a move + rotate tween on the other; play and scrub', async ({
    page,
  }) => {
    await openTimeline(page, []);
    // Drop the formulas as the Creator does.
    expect(await dropFormula(page, 'fa', 't1', 0)).toBe(true);
    expect(await dropFormula(page, 'fb', 't2', 0)).toBe(true);
    const clips = (await project(page)).clips;
    expect(clips).toHaveLength(2);
    const [first, second] = clips;
    // Clips start without intro (editor default): give the first one a 1 s Write.
    await page.getByTestId(`clip-${first!.id}`).click({ position: { x: 40, y: 10 } });
    await openAnimationsTab(page, 'timing');
    await page.getByTestId('intro-kind').selectOption('write');
    expect((await clipOf(page, first!.id)).intro).toMatchObject({ kind: 'write', duration: 1 });

    // Tween on the second clip: playhead at 1.5 s, add a keyframe, set move and rotate.
    await page.getByTestId(`clip-${second!.id}`).click({ position: { x: 40, y: 10 } });
    await setTime(page, 1.5);
    await page.getByTestId('add-keyframe').click();
    const tween = (await clipOf(page, second!.id)).actions[0]!;
    await enter(page, `tween-${tween.id}-position-x`, '3');
    await enter(page, `tween-${tween.id}-position-y`, '1.5');
    await enter(page, `tween-${tween.id}-rotation`, '90');
    expect(asTween((await clipOf(page, second!.id)).actions[0]).to).toMatchObject({
      position: [3, 1.5],
      rotation: 90,
    });

    // Playback reaches the same times scrubbing does: the playhead is a single number.
    await page.keyboard.press('Home');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await uiState(page)).time).toBeGreaterThan(0.3);
    await page.keyboard.press('Space');
    const paused = (await uiState(page)).time;
    await setTime(page, paused);
    await page.keyboard.press('End');
    expect((await uiState(page)).time).toBe(3);
  });
});
