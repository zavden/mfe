import { expect, test } from './test';
import type { MfeWindow } from './helpers';
import { selectClips } from './uxHelpers';
import { clipJson, openTimeline, project, setTime, timeToX, uiState } from './timelineHelpers';

/* A short scene: one clip over [0, 1.2] s. */
const SHORT = clipJson('s', 'fa', 't1', 0, 1.2, {
  intro: { kind: 'none', duration: 0, easing: 'linear', lagRatio: null, shift: [0, 0], scale: 1 },
  outro: { kind: 'none', duration: 0, easing: 'linear', lagRatio: null, shift: [0, 0], scale: 1 },
});
const LONG = clipJson('l', 'fa', 't1', 0, 20);

test.describe('transport', () => {
  test('play advances the time, pause holds it, stop returns to 0', async ({ page }) => {
    await openTimeline(page, [LONG]);
    await expect(page.getByTestId('transport')).toBeVisible();
    await page.getByTestId('transport-play').click();
    await expect.poll(async () => (await uiState(page)).playing).toBe(true);
    await expect(page.getByTestId('transport-play')).toHaveAttribute('aria-label', 'Pause');
    await expect.poll(async () => (await uiState(page)).time).toBeGreaterThan(0.3);

    await page.getByTestId('transport-play').click();
    expect((await uiState(page)).playing).toBe(false);
    const held = (await uiState(page)).time;
    await page.waitForTimeout(250);
    expect((await uiState(page)).time).toBe(held);

    await page.getByTestId('transport-stop').click();
    expect(await uiState(page)).toMatchObject({ time: 0, playing: false });
  });

  test('the clock follows real time', async ({ page }) => {
    await openTimeline(page, [LONG]);
    await page.getByTestId('transport-play').click();
    await expect.poll(async () => (await uiState(page)).time).toBeGreaterThan(0);
    // The scene's time and the page's clock, read in one frame of the page: the playback has
    // published that frame by then, so neither the click nor a slow machine is in the measure.
    const frame = () =>
      page.evaluate(
        () =>
          new Promise<{ time: number; at: number }>((resolve) => {
            requestAnimationFrame((at) =>
              resolve({ time: (window as MfeWindow).__mfe!.useUiStore.getState().time, at }),
            );
          }),
      );
    const first = await frame();
    await page.waitForTimeout(1000); // a second of playback to measure
    const second = await frame();
    const played = second.time - first.time;
    expect(played).toBeGreaterThan(0.9);
    // Neither slower nor faster than the clock.
    expect(Math.abs(played - (second.at - first.at) / 1000)).toBeLessThan(0.05);
    expect((await uiState(page)).playing).toBe(true);
  });

  test('stops at the end of the scene; play again starts over', async ({ page }) => {
    await openTimeline(page, [SHORT]);
    await page.getByTestId('transport-play').click();
    await expect.poll(async () => (await uiState(page)).playing, { timeout: 4000 }).toBe(false);
    expect((await uiState(page)).time).toBeCloseTo(1.2, 9);
    await page.getByTestId('transport-play').click();
    await expect.poll(async () => (await uiState(page)).time).toBeLessThan(1.2);
    await expect.poll(async () => (await uiState(page)).playing, { timeout: 4000 }).toBe(false);
  });

  test('loops when the loop toggle is on', async ({ page }) => {
    await openTimeline(page, [SHORT]);
    await page.getByTestId('transport-loop').click();
    await expect(page.getByTestId('transport-loop')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('transport-play').click();
    await page.waitForTimeout(1800); // longer than the 1.2 s scene
    const state = await uiState(page);
    expect(state.playing).toBe(true);
    expect(state.time).toBeLessThan(1.2);
    await page.getByTestId('transport-loop').click();
    await expect.poll(async () => (await uiState(page)).playing, { timeout: 4000 }).toBe(false);
  });

  test('go to start / end, frame and second steps', async ({ page }) => {
    await openTimeline(page, [LONG]);
    await page.getByTestId('transport-end').click();
    expect((await uiState(page)).time).toBe(20);
    await page.getByTestId('transport-start').click();
    expect((await uiState(page)).time).toBe(0);
    await page.getByTestId('transport-step-forward').click();
    expect((await uiState(page)).time).toBeCloseTo(1 / 60, 9);
    await page.getByTestId('transport-step-forward').click();
    expect((await uiState(page)).time).toBeCloseTo(2 / 60, 9);
    await page.getByTestId('transport-step-back').click();
    expect((await uiState(page)).time).toBeCloseTo(1 / 60, 9);
    await page.getByTestId('transport-step-back').click();
    await page.getByTestId('transport-step-back').click(); // clamped at 0
    expect((await uiState(page)).time).toBe(0);
  });

  test('keyboard: Space, Home, End, arrows (Shift = 1 s)', async ({ page }) => {
    await openTimeline(page, [LONG]);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await uiState(page)).playing).toBe(true);
    await page.keyboard.press('Space');
    expect((await uiState(page)).playing).toBe(false);

    await page.keyboard.press('End');
    expect((await uiState(page)).time).toBe(20);
    await page.keyboard.press('Home');
    expect((await uiState(page)).time).toBe(0);
    await page.keyboard.press('ArrowRight');
    expect((await uiState(page)).time).toBeCloseTo(1 / 60, 9);
    await page.keyboard.press('Shift+ArrowRight');
    expect((await uiState(page)).time).toBeCloseTo(1 + 1 / 60, 9);
    await page.keyboard.press('ArrowLeft');
    expect((await uiState(page)).time).toBeCloseTo(1, 9);
    await page.keyboard.press('Shift+ArrowLeft');
    expect((await uiState(page)).time).toBeCloseTo(0, 9);
  });

  test('stepping while playing pauses; scrubbing the ruler pauses too', async ({ page }) => {
    await openTimeline(page, [LONG]);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await uiState(page)).playing).toBe(true);
    await page.keyboard.press('ArrowRight');
    expect((await uiState(page)).playing).toBe(false);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await uiState(page)).playing).toBe(true);
    const ruler = page.getByTestId('timeline-ruler');
    const b = (await ruler.boundingBox())!;
    await page.mouse.click(await timeToX(page, 5), b.y + 10);
    expect(await uiState(page)).toMatchObject({ playing: false });
    expect((await uiState(page)).time).toBeCloseTo(5, 1);
  });

  test('keys are ignored while typing in a field', async ({ page }) => {
    await openTimeline(page, [LONG]);
    await setTime(page, 3);
    await page.getByTestId('track-name-t1').dblclick();
    const input = page.getByTestId('track-name-input-t1');
    await input.fill('a b');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    expect(await uiState(page)).toMatchObject({ time: 3, playing: false });
    await expect(input).toHaveValue('a b '); // the space was typed, not a play toggle
    await page.keyboard.press('Enter');
    expect((await project(page)).tracks[0]!.name).toBe('a b');
  });

  test('shows the time as seconds, timecode and frame number', async ({ page }) => {
    await openTimeline(page, [LONG]);
    await setTime(page, 1.5);
    await expect(page.getByTestId('transport-seconds')).toHaveText('1.500 s');
    await expect(page.getByTestId('transport-timecode')).toHaveText('00:01:30');
    await expect(page.getByTestId('transport-frame')).toHaveText('f90 / 1200');
    await setTime(page, 61.25);
    await expect(page.getByTestId('transport-timecode')).toHaveText('01:01:15');
  });
});

test('Space operates a focused checkbox or a button reached by keyboard; after a click it plays', async ({
  page,
}) => {
  await openTimeline(page, [LONG]);
  await selectClips(page, ['l']);
  await page.getByTestId('animations-tab-timing').click();
  const flip = page.getByTestId('initial-flip-x');
  await flip.focus();
  await page.keyboard.press('Space');
  await expect(flip).toBeChecked();
  expect((await uiState(page)).playing).toBe(false);

  // A button reached with the keyboard: Space presses it.
  await page.keyboard.press('Shift'); // the last interaction is the keyboard: focus is visible
  const file = page.getByTestId('menu-file');
  await file.focus();
  await page.keyboard.press('Space');
  await expect(file).toHaveAttribute('aria-expanded', 'true');
  expect((await uiState(page)).playing).toBe(false);
  await page.keyboard.press('Escape');

  // A button that only kept the focus after a click: Space plays.
  const theme = page.getByTestId('theme-toggle');
  await theme.click();
  await expect(theme).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await uiState(page)).playing).toBe(true);
});
