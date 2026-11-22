import { expect, test, type Page } from './test';
import { addAudioInterval, audioClip, importMp3, startAudioApp } from './audioHelpers';
import { openSubmenu } from './helpers';
import {
  box,
  canUndo,
  clipJson,
  clipOf,
  openTimeline,
  project,
  timeToX,
  undo,
  type ClipJson,
} from './timelineHelpers';

/* «Timing ›» in the menus of the timeline's clips (D150): Copy timing takes when a clip starts and
 * ends and how long its intro and its outro are; a Paste gives one of them to the clip of the
 * menu, or to the selected ones — two clips start, or end, at the same instant, last the same, or
 * have an intro as long. A paste that does not fit leaves the clip and says why. */

/** `a` (alpha) over [1, 5) on track 1 with an intro and an outro of 1 s; `b` (beta) over [2, 4.5)
 * on track 2, its intro half a second; `c` (beta) over [6, 8) on track 1. */
function scene(): ClipJson[] {
  const a = clipJson('a', 'fa', 't1', 1, 5);
  const b = clipJson('b', 'fb', 't2', 2, 4.5);
  b.intro = { ...b.intro, duration: 0.5 };
  const c = clipJson('c', 'fb', 't1', 6, 8);
  return [a, b, c];
}

/** Right-click the clip `id` in its middle, under its blocks. */
async function openMenuOf(page: Page, id: string): Promise<void> {
  const clip = await clipOf(page, id);
  const at = await box(page.getByTestId(`clip-${id}`));
  await page.mouse.click(await timeToX(page, (clip.start + clip.end) / 2), at.y + at.height - 6, {
    button: 'right',
  });
}

const span = async (page: Page, id: string) => {
  const clip = await clipOf(page, id);
  return [clip.start, clip.end];
};

test('Copy timing of a clip, then Paste start, duration and intro time on another: each one undo step', async ({
  page,
}) => {
  await openTimeline(page, scene());
  // Nothing is copied yet: the pastes are off.
  await openMenuOf(page, 'b');
  await openSubmenu(page, 'clip-menu-timing');
  await expect(page.getByTestId('clip-menu-timing-from')).toHaveText('Nothing copied');
  for (const part of ['start', 'end', 'duration', 'intro', 'outro'])
    await expect(page.getByTestId(`clip-menu-timing-paste-${part}`)).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-animation-menu')).toHaveCount(0);
  // The timing of `a`: [1, 5), an intro of 1 s.
  await openMenuOf(page, 'a');
  await openSubmenu(page, 'clip-menu-timing');
  await expect(page.getByTestId('clip-menu-timing-copy')).toContainText('1 s–5 s');
  await page.getByTestId('clip-menu-timing-copy').click();
  expect(await canUndo(page)).toBe(false);
  // Onto `b`: it starts when `a` does, as long as it was.
  await openMenuOf(page, 'b');
  await openSubmenu(page, 'clip-menu-timing');
  await expect(page.getByTestId('clip-menu-timing-from')).toHaveText('From alpha');
  await expect(page.getByTestId('clip-menu-timing-paste-start')).toContainText('starts at 1 s');
  await expect(page.getByTestId('clip-menu-timing-paste-end')).toContainText('ends at 5 s');
  await expect(page.getByTestId('clip-menu-timing-paste-duration')).toContainText('4 s long');
  await page.getByTestId('clip-menu-timing-paste-start').click();
  expect(await span(page, 'b')).toEqual([1, 3.5]);
  // Then as long as `a`, from where it starts; and its intro as long as that of `a`.
  await openMenuOf(page, 'b');
  await openSubmenu(page, 'clip-menu-timing');
  await page.getByTestId('clip-menu-timing-paste-duration').click();
  expect(await span(page, 'b')).toEqual([1, 5]);
  await openMenuOf(page, 'b');
  await openSubmenu(page, 'clip-menu-timing');
  await page.getByTestId('clip-menu-timing-paste-intro').click();
  expect((await clipOf(page, 'b')).intro.duration).toBe(1);
  await expect(page.getByTestId('notice')).toHaveCount(0);
  // Three steps back.
  await undo(page);
  expect((await clipOf(page, 'b')).intro.duration).toBe(0.5);
  await undo(page);
  expect(await span(page, 'b')).toEqual([1, 3.5]);
  await undo(page);
  expect(await span(page, 'b')).toEqual([2, 4.5]);
  expect(await canUndo(page)).toBe(false);
});

test('a paste that does not fit leaves the clip as it is and says what is in its way', async ({
  page,
}) => {
  await openTimeline(page, scene());
  await openMenuOf(page, 'a');
  await openSubmenu(page, 'clip-menu-timing');
  await page.getByTestId('clip-menu-timing-copy').click();
  // `c` is on the track of `a`: it cannot start where `a` does.
  await openMenuOf(page, 'c');
  await openSubmenu(page, 'clip-menu-timing');
  await page.getByTestId('clip-menu-timing-paste-start').click();
  const notice = page.getByTestId('notice').last();
  await expect(notice).toContainText('“beta” keeps its start');
  await expect(notice).toContainText('“alpha” (1 s–5 s) is in its way on the same track');
  expect(await span(page, 'c')).toEqual([6, 8]);
  expect(await canUndo(page)).toBe(false);
});

test('a clip of a locked track opens its menu, by the mouse or the keyboard: its edits off, its timing copied', async ({
  page,
}) => {
  await openTimeline(page, scene());
  // Track 1, with `a` and `c`, locked by the padlock of its header.
  await page.getByTestId('track-lock-t1').click();
  await openMenuOf(page, 'a');
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  // What would change the clip is there and off, as in the preview's menu of the same clip.
  for (const id of [
    'add-animation-group-appear',
    'add-animation-group-disappear',
    'add-animation-group-transform',
    'add-animation-morph',
    'add-animation-group-emphasis',
    'clip-menu-intro',
    'clip-menu-outro',
    'clip-menu-preview-lock',
  ])
    await expect(page.getByTestId(id)).toBeDisabled();
  // Its timing is copied: a copy changes nothing; the pastes are off on it.
  await openSubmenu(page, 'clip-menu-timing');
  await expect(page.getByTestId('clip-menu-timing-paste-start')).toBeDisabled();
  const before = await project(page);
  await page.getByTestId('clip-menu-timing-copy').click();
  expect(await project(page)).toEqual(before);
  // And given to `b`, on an unlocked track.
  await openMenuOf(page, 'b');
  await openSubmenu(page, 'clip-menu-timing');
  await expect(page.getByTestId('clip-menu-timing-from')).toHaveText('From alpha');
  await page.getByTestId('clip-menu-timing-paste-start').click();
  expect(await span(page, 'b')).toEqual([1, 3.5]);
  expect(await span(page, 'a')).toEqual([1, 5]);
  // Shift+F10 on the focused clip opens the same menu.
  await page.getByTestId('clip-c').focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
  await expect(page.getByTestId('add-animation-header')).toContainText('beta');
  await expect(page.getByTestId('clip-menu-timing')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-animation-menu')).toHaveCount(0);
});

test('several selected clips take the copied end together: the ones it fits, in one undo step', async ({
  page,
}) => {
  await openTimeline(page, scene());
  await openMenuOf(page, 'a');
  await openSubmenu(page, 'clip-menu-timing');
  await page.getByTestId('clip-menu-timing-copy').click();
  // `b` and `c` selected: their menu has the pastes and no copy.
  await page.getByTestId('clip-b').click({ position: { x: 20, y: 6 } });
  await page
    .getByTestId('clip-c')
    .click({ position: { x: 20, y: 6 }, modifiers: ['ControlOrMeta'] });
  await openMenuOf(page, 'b');
  await expect(page.getByTestId('clips-menu')).toBeVisible();
  await openSubmenu(page, 'clips-menu-timing');
  await expect(page.getByTestId('clips-menu-timing-copy')).toHaveCount(0);
  await page.getByTestId('clips-menu-timing-paste-end').click();
  // `b` ends at 5 with `a`; `c` would lie over `a` on their track, and stays.
  expect(await span(page, 'b')).toEqual([2.5, 5]);
  expect(await span(page, 'c')).toEqual([6, 8]);
  const notice = page.getByTestId('notice').last();
  await expect(notice).toContainText('“beta” keeps its end');
  await undo(page);
  expect(await span(page, 'b')).toEqual([2, 4.5]);
  expect(await canUndo(page)).toBe(false);
});

test('a sound has «Timing ›» in its menu too: the duration of another is pasted onto it, and an end that does not fit is not', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  // Two sounds on one row: half a second from 0, a quarter of a second from 2.
  const first = await addAudioInterval(page, asset.id, 0.5, 1, 0);
  const second = await addAudioInterval(page, asset.id, 1, 1.25, 2);
  expect(second.trackId).toBe(first.trackId);
  const menuOf = async (id: string) => {
    await page.getByTestId(`audio-clip-${id}`).focus();
    await page.keyboard.press('Shift+F10');
    await openSubmenu(page, 'audio-menu-timing');
  };
  await menuOf(second.id);
  // A sound has no intro nor outro: its menu has neither paste.
  await expect(page.getByTestId('audio-menu-timing-paste-intro')).toHaveCount(0);
  await expect(page.getByTestId('audio-menu-timing-paste-outro')).toHaveCount(0);
  await page.getByTestId('audio-menu-timing-copy').click();
  // The first sound lasts what the second does, from where it starts in its source.
  await menuOf(first.id);
  await page.getByTestId('audio-menu-timing-paste-duration').click();
  const shorter = await audioClip(page, first.id);
  expect(shorter.start).toBe(first.start);
  expect(shorter.sourceStart).toBe(first.sourceStart);
  expect(shorter.end - shorter.start).toBeCloseTo(second.end - second.start, 3);
  // Ending when the second does, it would lie over it on their row: it stays, and says so.
  await menuOf(first.id);
  await page.getByTestId('audio-menu-timing-paste-end').click();
  await expect(page.getByTestId('notice').last()).toContainText('keeps its end');
  await expect(page.getByTestId('notice').last()).toContainText('is in its way on the same track');
  expect(await audioClip(page, first.id)).toEqual(shorter);
});
