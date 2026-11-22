/* «Stop at pauses» in the transport (D200): the rehearsal of the Slides mode — the Preview stops
 * at each pause as the exported page does, and Play goes on to the next; from a pause that skips
 * its wait (D202), where the next animation starts. */
import { expect, test, type Page } from './test';
import { addAudioInterval, importMp3 } from './audioHelpers';
import type { MfeWindow } from './helpers';
import { clipJson, openTimeline, uiState } from './timelineHelpers';

/** `alpha` on [0, 2] with an intro of half a second and no outro: the scene rests from 0.5 s on. */
const clips = [
  clipJson('c1', 'fa', 't1', 0, 2, {
    intro: {
      kind: 'write',
      duration: 0.5,
      easing: 'linear',
      lagRatio: null,
      shift: [0, 0],
      scale: 1,
    },
    outro: { kind: 'none', duration: 0, easing: 'linear', lagRatio: null, shift: [0, 0], scale: 1 },
  }),
];
const marks = [
  { id: 'p1', time: 0.75, kind: 'pause' },
  { id: 'p2', time: 1.25, kind: 'pause' },
];

test('a project without the Slides mode has no rehearsal button', async ({ page }) => {
  await openTimeline(page, clips);
  await expect(page.getByTestId('transport-loop')).toBeVisible();
  await expect(page.getByTestId('transport-stop-at-pauses')).toHaveCount(0);
});

test('with «Stop at pauses» on, Play stops at each pause and goes on from it', async ({ page }) => {
  await openTimeline(page, clips, { slides: { marks } });
  const button = page.getByTestId('transport-stop-at-pauses');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');

  const stoppedAt = async () => {
    await expect.poll(async () => (await uiState(page)).playing, { timeout: 10_000 }).toBe(false);
    return (await uiState(page)).time;
  };
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt()).toBe(0.75);
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt()).toBe(1.25);
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt()).toBe(2);

  // Off again: it plays through.
  await button.click();
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt()).toBe(2);
});

/* A pause that skips its wait (D202): played on from it, the rehearsal goes on where the next
 * animation starts. `alpha` written over [0, 0.5] and `beta` over [2, 2.5], no outros: the scene
 * rests over [0.5, 2] and [2.5, 3]. */
const write = {
  kind: 'write',
  duration: 0.5,
  easing: 'linear',
  lagRatio: null,
  shift: [0, 0] as [number, number],
  scale: 1,
};
const none = { ...write, kind: 'none', duration: 0 };
const twoWrites = [
  clipJson('c1', 'fa', 't1', 0, 3, { intro: write, outro: none }),
  clipJson('c2', 'fb', 't2', 2, 3, { intro: write, outro: none }),
];

/** Record every time the playhead is given from now on (`times` reads them). */
async function record(page: Page): Promise<() => Promise<number[]>> {
  await page.evaluate(() => {
    const w = window as MfeWindow & { __times?: number[]; __stopRecording?: () => void };
    w.__stopRecording?.();
    w.__times = [];
    // Each time once: a listener called after a write made inside another listener is given the
    // latest state with the previous of the outer write.
    let last = w.__mfe!.useUiStore.getState().time;
    w.__stopRecording = w.__mfe!.useUiStore.subscribe((state) => {
      if (state.time !== last) w.__times!.push(state.time);
      last = state.time;
    });
  });
  return () => page.evaluate(() => (window as MfeWindow & { __times?: number[] }).__times!);
}

const stoppedAt = async (page: Page) => {
  await expect.poll(async () => (await uiState(page)).playing, { timeout: 10_000 }).toBe(false);
  return (await uiState(page)).time;
};
/** Whether any of `times` falls inside the stretch from `start` to `end`, its ends left out. */
const inside = (times: number[], start: number, end: number) =>
  times.some((t) => t > start + 1e-6 && t < end - 1e-6);

test('from a pause that skips its wait, Play goes on where the next animation starts', async ({
  page,
}) => {
  await openTimeline(page, twoWrites, {
    slides: { marks: [{ id: 'p1', time: 0.75, kind: 'pause', skipWait: true }] },
  });
  await page.getByTestId('transport-stop-at-pauses').click();
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt(page)).toBe(0.75);
  const times = await record(page);
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt(page)).toBe(3);
  // Over the wait at once: no time of it was shown, and the playhead went on from 2 s.
  expect(inside(await times(), 0.75, 2)).toBe(false);
  expect((await times())[0]).toBe(2);
  expect(inside(await times(), 2, 3)).toBe(true);

  // Without «Stop at pauses» the scene plays through its pauses, and keeps the rest.
  await page.getByTestId('transport-stop-at-pauses').click();
  await page.getByTestId('slide-mark-p1').click();
  expect((await uiState(page)).time).toBe(0.75);
  const through = await record(page);
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt(page)).toBe(3);
  expect(inside(await through(), 0.75, 2)).toBe(true);
});

test('a skipped wait that ends at the next pause stands there, playing nothing', async ({
  page,
}) => {
  await openTimeline(page, twoWrites, {
    slides: {
      marks: [
        { id: 'p1', time: 0.75, kind: 'pause', skipWait: true },
        { id: 'p2', time: 1.5, kind: 'pause' },
      ],
    },
  });
  await page.getByTestId('transport-stop-at-pauses').click();
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt(page)).toBe(0.75);
  const times = await record(page);
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt(page)).toBe(1.5);
  expect(await times()).toEqual([1.5]);
  // From there, the pause that keeps its wait plays its rest.
  await page.getByTestId('transport-play').click();
  expect(await stoppedAt(page)).toBe(3);
  expect(inside(await times(), 1.5, 2)).toBe(true);
});

test('with sound, the scene and its sound go on where the next animation starts', async ({
  page,
}) => {
  await openTimeline(page, twoWrites, {
    slides: { marks: [{ id: 'p1', time: 0.75, kind: 'pause', skipWait: true }] },
  });
  const asset = await importMp3(page);
  await addAudioInterval(page, asset.id, 0, 3.5);
  await page.getByTestId('transport-stop-at-pauses').click();
  await page.getByTestId('slide-mark-p1').click();
  expect((await uiState(page)).time).toBe(0.75);
  const times = await record(page);
  await page.getByTestId('transport-play').click();
  // The clock is the audio device's: it runs past 2 s without having shown the wait.
  await expect
    .poll(async () => (await uiState(page)).time, { timeout: 10_000 })
    .toBeGreaterThan(2.05);
  expect(inside(await times(), 0.75, 2)).toBe(false);
  expect((await uiState(page)).playing).toBe(true);
  await page.getByTestId('transport-play').click();
  await expect(page.getByTestId('transport-play')).toHaveAttribute('aria-label', 'Play');
});

test('with sound, a pause reached while playing holds the playhead, and Play skips its wait', async ({
  page,
}) => {
  await openTimeline(page, twoWrites, {
    slides: { marks: [{ id: 'p1', time: 0.75, kind: 'pause', skipWait: true }] },
  });
  const asset = await importMp3(page);
  await addAudioInterval(page, asset.id, 0, 3.5);
  await page.getByTestId('transport-stop-at-pauses').click();
  // Played into, not clicked: the frame that sees the pause reads a device already past it.
  await page.getByTestId('transport-play').click();
  await expect.poll(async () => (await uiState(page)).time, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await stoppedAt(page)).toBe(0.75);
  const times = await record(page);
  await page.getByTestId('transport-play').click();
  await expect
    .poll(async () => (await uiState(page)).time, { timeout: 10_000 })
    .toBeGreaterThan(2.05);
  expect((await times())[0]).toBe(2);
  expect(inside(await times(), 0.75, 2)).toBe(false);
  await page.getByTestId('transport-play').click();
  await expect(page.getByTestId('transport-play')).toHaveAttribute('aria-label', 'Play');
});
