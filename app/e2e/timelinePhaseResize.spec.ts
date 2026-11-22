import { expect, test, type Page } from './test';
import {
  box,
  canUndo,
  clipJson,
  clipOf,
  dragTo,
  openTimeline,
  setTime,
  uiState,
  undo,
  PX_PER_SECOND,
} from './timelineHelpers';
import type { MfeWindow } from './helpers';

/* The intro and the outro of a clip are made longer or shorter on the timeline (D119): each has
 * a grab zone on its inner edge, in the lower part of the clip, that drags as an edge of an
 * animation block does — it snaps (Shift suspends that), stops at a Transform of the whole
 * formula, shows a readout meanwhile, is one undo step and is cancelled by Escape. */

/** Clip `ca` over [1, 9) on track 1: a Write of 1 s, a FadeOut of 1 s. */
const scene = (fields: Parameters<typeof clipJson>[5] = {}) => [
  clipJson('ca', 'fa', 't1', 1, 9, fields),
];

/** The middle of the grab zone of the intro or the outro of clip `ca`. */
async function handle(page: Page, phase: 'intro' | 'outro') {
  const b = await box(page.getByTestId(`clip-ca-${phase}-handle`));
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const durations = async (page: Page) => {
  const clip = await clipOf(page, 'ca');
  return [clip.intro.duration, clip.outro.duration];
};

test('the intro and the outro stretch from their inner edge; Shift frees them from the snap', async ({
  page,
}) => {
  await openTimeline(page, scene());
  await setTime(page, 0);
  // The grab zone is astride the edge: the intro's at 2 s, the outro's at 8 s.
  const intro = await handle(page, 'intro');
  const ruler = await box(page.getByTestId('timeline-ruler'));
  expect(Math.abs(intro.x - (ruler.x + 2 * PX_PER_SECOND))).toBeLessThan(3);
  // 100 px to the right at 80 px/s is 1.25 s more: the snap takes the edge to the ruler's
  // nearest mark, at 3.5 s of the scene.
  await dragTo(page, intro, { x: intro.x + 100, y: intro.y });
  expect((await durations(page))[0]).toBeCloseTo(2.5, 6);
  expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['ca'] });
  // With Shift the edge is where the pointer is: 37 px back, 0.4625 s less.
  const moved = await handle(page, 'intro');
  await dragTo(page, moved, { x: moved.x - 37, y: moved.y }, { shift: true });
  expect((await durations(page))[0]).toBeCloseTo(2.5 - 37 / PX_PER_SECOND, 4);
  // The outro grows to the left, from its own edge.
  const outro = await handle(page, 'outro');
  await dragTo(page, outro, { x: outro.x - 80, y: outro.y });
  expect((await durations(page))[1]).toBeCloseTo(2, 6);
  // Each drag was one undo step.
  await undo(page);
  expect((await durations(page))[1]).toBe(1);
  await undo(page);
  expect((await durations(page))[0]).toBeCloseTo(2.5, 6);
  await undo(page);
  expect(await durations(page)).toEqual([1, 1]);
  expect(await canUndo(page)).toBe(false);
});

test('a readout says how long it lasts meanwhile, and Escape puts it back', async ({ page }) => {
  await openTimeline(page, scene());
  await setTime(page, 0);
  const intro = await handle(page, 'intro');
  await dragTo(page, intro, { x: intro.x + 80, y: intro.y }, { release: false });
  await expect(page.getByTestId('phase-drag-time')).toHaveText('Write · 1.00 → 3.00 s · 2.00 s');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('phase-drag-readout')).toHaveCount(0);
  await page.mouse.up();
  expect(await durations(page)).toEqual([1, 1]);
  expect(await canUndo(page)).toBe(false);
  // The outro's readout runs to the end of the clip.
  const outro = await handle(page, 'outro');
  await dragTo(page, outro, { x: outro.x - 40, y: outro.y }, { release: false });
  await expect(page.getByTestId('phase-drag-time')).toHaveText('FadeOut · 7.50 → 9.00 s · 1.50 s');
  await page.mouse.up();
  await expect(page.getByTestId('phase-drag-readout')).toHaveCount(0);
  expect(await durations(page)).toEqual([1, 1.5]);
});

test('the edge stops at a Transform of the whole formula, at the other animation and at the shortest one', async ({
  page,
}) => {
  // A tween over [4, 5) of the scene: 3 s into the clip.
  const tween = {
    id: 'tw',
    kind: 'tween' as const,
    start: 3,
    duration: 1,
    easing: 'smooth',
    to: { opacity: 0.5 },
  };
  await openTimeline(page, scene({ actions: [tween] }));
  await setTime(page, 0);
  const intro = await handle(page, 'intro');
  await dragTo(page, intro, { x: intro.x + 400, y: intro.y });
  expect((await durations(page))[0]).toBe(3); // up to where the tween starts
  expect((await clipOf(page, 'ca')).actions).toHaveLength(1);
  // The outro stops where the tween ends: 4 s before the end of the clip.
  const outro = await handle(page, 'outro');
  await dragTo(page, outro, { x: outro.x - 600, y: outro.y });
  expect((await durations(page))[1]).toBe(4);
  // And neither gets shorter than the shortest animation.
  const back = await handle(page, 'intro');
  await dragTo(page, back, { x: back.x - 600, y: back.y });
  expect((await durations(page))[0]).toBe(0.05);
});

test('a clip without an intro has no edge to drag, and a locked track keeps its own', async ({
  page,
}) => {
  const none = {
    kind: 'none',
    duration: 0,
    easing: 'smooth',
    lagRatio: null,
    shift: [0, 0] as [number, number],
    scale: 1,
  };
  await openTimeline(page, scene({ intro: none }));
  await expect(page.getByTestId('clip-ca-intro-handle')).toHaveCount(0);
  await expect(page.getByTestId('clip-ca-outro-handle')).toHaveCount(1);
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft: unknown) => {
      const { tracks } = draft as { tracks: { id: string; locked: boolean }[] };
      tracks.find((t) => t.id === 't1')!.locked = true;
    });
    (window as MfeWindow).__mfe!.history.clear();
  });
  const outro = await handle(page, 'outro');
  await dragTo(page, outro, { x: outro.x - 80, y: outro.y });
  expect(await durations(page)).toEqual([0, 1]);
  expect(await canUndo(page)).toBe(false);
});
