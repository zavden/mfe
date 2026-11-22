import { expect, test, type Page } from './test';
import { blockLocator, openBlockScene, pickAnimation } from './blockHelpers';
import { canUndo, setTime } from './helpers';
import { box, clipOf, timeToX, uiState, undo } from './timelineHelpers';

/* Where a clip's menu on the timeline adds its animation (D171): at the playhead when the
 * playhead is inside the clip, else where the clip was clicked. The header of the menu says
 * which before anything is chosen, and a notice says so when the block could not start at the
 * playhead. Clip a (formula f1) is 0–10 s on track 1, clip b (f2) 2–8 s on track 2, neither with
 * an intro or an outro unless a test gives one (openBlockScene). */

const WRITE_INTRO = {
  kind: 'write',
  duration: 1,
  easing: 'linear',
  lagRatio: null,
  shift: [0, 0],
  scale: 1,
};

/** Right-click clip `clipId` at time `t`, on its lower half (not on a block). */
async function rightClickClip(page: Page, clipId: string, t: number): Promise<void> {
  const b = await box(page.getByTestId(`clip-${clipId}`));
  await page.mouse.click(await timeToX(page, t), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
}

const header = (page: Page) => page.getByTestId('add-animation-header');

test('with the playhead inside the clip, the block starts at the playhead, not where clicked', async ({
  page,
}) => {
  await openBlockScene(page, []);
  await setTime(page, 4);
  await rightClickClip(page, 'a', 7);
  await expect(header(page)).toHaveText('Add animation · f1 · playhead 4.00 s');
  await pickAnimation(page, 'fade_out');
  await expect(page.getByTestId('add-animation-menu')).toHaveCount(0);
  const actions = (await clipOf(page, 'a')).actions;
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ kind: 'disappear', anim: 'fade_out', start: 4, duration: 1 });
  await expect(blockLocator(page, actions[0]!.id)).toHaveClass(/is-selected/);
  // The playhead stays where it was, nothing is said, and the add is one undo step.
  expect((await uiState(page)).time).toBe(4);
  await expect(page.getByTestId('notice')).toHaveCount(0);
  await undo(page);
  expect((await clipOf(page, 'a')).actions).toEqual([]);
  expect(await canUndo(page)).toBe(false);
});

test('with the playhead outside the clip, the block starts where the clip was clicked', async ({
  page,
}) => {
  await openBlockScene(page, []);
  // The playhead is at 0 s, before clip b (2–8 s).
  expect((await uiState(page)).time).toBe(0);
  await rightClickClip(page, 'b', 5);
  const text = (await header(page).textContent()) ?? '';
  const said = /^Add animation · f2 · (\d+\.\d\d) s · the playhead is outside this clip$/.exec(
    text,
  );
  expect(said, text).not.toBeNull();
  const clicked = Number(said![1]);
  expect(clicked).toBeCloseTo(5, 1);
  await pickAnimation(page, 'indicate');
  const actions = (await clipOf(page, 'b')).actions;
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ kind: 'emphasis', effect: 'indicate' });
  // Where the header said: the clip starts at 2 s.
  expect(2 + actions[0]!.start).toBeCloseTo(clicked, 2);
  expect((await uiState(page)).time).toBe(0);
  await expect(page.getByTestId('notice')).toHaveCount(0);
  // Clip a, which the playhead is in, is left alone.
  expect((await clipOf(page, 'a')).actions).toEqual([]);
});

test('at the playhead where the block cannot start, it goes to the nearest free time and says so', async ({
  page,
}) => {
  // The intro writes every glyph of clip a over its first second: a FadeOut cannot start then.
  await openBlockScene(page, [], { clip: { intro: WRITE_INTRO as never } });
  await setTime(page, 0.4);
  await rightClickClip(page, 'a', 6);
  await expect(header(page)).toHaveText('Add animation · f1 · playhead 0.40 s');
  await pickAnimation(page, 'fade_out');
  const actions = (await clipOf(page, 'a')).actions;
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ kind: 'disappear', anim: 'fade_out', start: 1, duration: 1 });
  const notice = page.getByTestId('notice');
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText('No room at the playhead');
  await expect(notice).toContainText(
    'The FadeOut block starts at 1.00 s, not at the playhead (0.40 s): its glyphs are busy with the intro then.',
  );
  await undo(page);
  expect((await clipOf(page, 'a')).actions).toEqual([]);
  expect(await canUndo(page)).toBe(false);
});

test('the Animations panel’s Add animation says so too when the playhead has no room', async ({
  page,
}) => {
  await openBlockScene(page, [], { clip: { intro: WRITE_INTRO as never } });
  await page.getByTestId('clip-a').click({ position: { x: 20, y: 30 } });
  await page.getByTestId('animations-tab-timing').click();
  await setTime(page, 0.4);
  await page.getByTestId('add-animation').click();
  await expect(header(page)).toHaveText('Add animation · f1 · playhead 0.40 s');
  await pickAnimation(page, 'indicate');
  const actions = (await clipOf(page, 'a')).actions;
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ kind: 'emphasis', effect: 'indicate', start: 1 });
  await expect(page.getByTestId('notice')).toContainText(
    'The Indicate block starts at 1.00 s, not at the playhead (0.40 s): its glyphs are busy with the intro then.',
  );
});
