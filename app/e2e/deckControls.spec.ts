/* The controls of the page of Export ▸ HTML, opened from disk: its bar plays to a pause and stops
 * there, goes on and back, and its timeline seeks by a press on a pause's notch and by a drag; its
 * keys (those of PowerPoint, reveal.js and a presenter's remote) do the same, S shows the notes, B
 * blacks the stage out and F takes it full screen, where the bar hides while the pointer rests.
 * The scene's own page fits the window and reads its address; a deck embedded in another page —
 * one with rules of its own for every button, svg and div, two decks in it, or the page in a
 * frame — looks as it should, hears its keys only with the focus, and takes the host's colours. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './test';
import { deckAddress, onDeck, openExportedDeck, watchPage, type PageDeck } from './deckHelpers';
import { clipJson, openTimeline } from './timelineHelpers';

/** `alpha` on [0, 3] and `beta` on [2, 6]: the scene rests over [1, 2] and [4, 5]. A pause in each
 * rest, a note on the second, and a comment before the first. */
const clips = [clipJson('c1', 'fa', 't1', 0, 3), clipJson('c2', 'fb', 't2', 2, 6)];
const marks = [
  { id: 'p1', time: 1.5, kind: 'pause' },
  { id: 'p2', time: 4.5, kind: 'pause', text: 'Questions' },
  { id: 'p3', time: 1.25, kind: 'comment', text: 'A flash over the alpha' },
];

/** The window of an exported page, with its runtime. */
type DeckWindow = Window & { MFE: { decks: PageDeck[] } };

const deckTime = (page: Page) => onDeck(page, (deck) => deck.time);
/** Waits until the deck stands still, and gives where. */
async function settled(page: Page): Promise<number> {
  await expect.poll(() => onDeck(page, (deck) => deck.playing), { timeout: 10_000 }).toBe(false);
  return deckTime(page);
}

test('the bar plays to a pause and stops there, and says where it is', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const said = watchPage(page);
  await openExportedDeck(page, testInfo);
  const bar = page.locator('.mfe-deck .mfe-bar');
  await expect(bar).toBeVisible();
  const play = bar.locator('.mfe-play');
  await expect(play).toHaveAccessibleName('Play');
  await expect(bar.locator('.mfe-slide-count')).toHaveText('Slide 1 / 3');
  await expect(bar.locator('.mfe-time')).toHaveText('0.00 / 6.00 s');
  await play.click();
  await expect(play).toHaveAccessibleName('Pause');
  expect(await settled(page)).toBe(1.5);
  await expect(page.locator('.mfe-deck')).toHaveAttribute('data-mfe-state', 'paused');
  await expect(play).toHaveAccessibleName('Play');
  await expect(bar.locator('.mfe-time')).toHaveText('1.50 / 6.00 s');
  await expect(bar.locator('.mfe-timeline')).toHaveAttribute('aria-valuenow', '1.50');
  // The played part reaches the first notch.
  const track = (await bar.locator('.mfe-timeline-track').boundingBox())!;
  const played = (await bar.locator('.mfe-timeline-played').boundingBox())!;
  expect(played.width / track.width).toBeCloseTo(1.5 / 6, 2);
  expect(await page.locator('[id]').count()).toBe(0);
  expect(said).toEqual([]);
});

test('the bar goes on to the next pause and back to the one before', async ({ page }, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openExportedDeck(page, testInfo);
  const bar = page.locator('.mfe-deck .mfe-bar');
  const previous = bar.locator('.mfe-previous');
  const next = bar.locator('.mfe-next');
  await expect(previous).toHaveAttribute('aria-disabled', 'true');
  await next.click();
  expect(await settled(page)).toBe(1.5);
  await next.click();
  expect(await settled(page)).toBe(4.5);
  await expect(bar.locator('.mfe-slide-count')).toHaveText('Slide 2 / 3');
  await previous.click();
  expect(await deckTime(page)).toBe(1.5);
  await previous.click();
  expect(await deckTime(page)).toBe(0);
  await expect(previous).toHaveAttribute('aria-disabled', 'true');
  // Through the pauses: one press plays to the end.
  const through = bar.locator('.mfe-through');
  await through.click();
  await expect(through).toHaveAttribute('aria-pressed', 'true');
  await next.click();
  await expect(page.locator('.mfe-deck')).toHaveAttribute('data-mfe-state', 'ended', {
    timeout: 15_000,
  });
  await expect(bar.locator('.mfe-play')).toHaveAccessibleName('Play again');
  await expect(next).toHaveAttribute('aria-disabled', 'true');
});

test('a press on a pause’s notch goes to it, and a drag on the timeline scrubs', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openExportedDeck(page, testInfo);
  const timeline = page.locator('.mfe-deck .mfe-timeline');
  const notches = timeline.locator('.mfe-pause-mark');
  await expect(notches).toHaveCount(2);
  await expect(notches.nth(1)).toHaveAttribute('title', 'Pause 2 · 4.50 s — Questions');
  await notches.nth(1).click();
  expect(await deckTime(page)).toBe(4.5);
  expect(await onDeck(page, (deck) => deck.playing)).toBe(false);
  await expect(timeline).toBeFocused();

  // A drag from a sixth of the way to two thirds: the time follows the pointer.
  const box = (await timeline.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 6, y);
  await page.mouse.down();
  expect(await deckTime(page)).toBeCloseTo(1, 1);
  await page.mouse.move(box.x + box.width * 0.4, y, { steps: 4 });
  expect(await deckTime(page)).toBeCloseTo(2.4, 1);
  await page.mouse.move(box.x + (box.width * 2) / 3, y, { steps: 4 });
  await page.mouse.up();
  const time = await deckTime(page);
  expect(time).toBeCloseTo(4, 1);
  await expect(timeline).toHaveAttribute('aria-valuenow', time.toFixed(2));
  expect(await onDeck(page, (deck) => deck.playing)).toBe(false);
});

// On a Mac a click with Ctrl is the secondary click: Chrome sends the press of the main button
// with Ctrl held, then the menu's event, and no click. The page is dressed as a Mac and the events
// are sent as Chrome sends them there (read from a real one, e2e/macSecondaryClick.spec.ts), so
// that the test says the same on any system.
test('on a Mac a click with Ctrl on the timeline is the menu’s: it seeks nothing', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
  });
  await openTimeline(page, clips, { slides: { marks } });
  await openExportedDeck(page, testInfo);
  const timeline = page.locator('.mfe-deck .mfe-timeline');
  const box = (await timeline.boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(await deckTime(page)).toBe(0);
  // The real pointer out of the way.
  await page.mouse.move(0, 0);
  const taken = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y)!;
    const keys = { clientX: x, clientY: y, ctrlKey: true, bubbles: true, cancelable: true };
    const pointer = { ...keys, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
    const down = new PointerEvent('pointerdown', { ...pointer, buttons: 1 });
    const menu = new MouseEvent('contextmenu', { ...keys, button: 0, buttons: 1 });
    target.dispatchEvent(down);
    target.dispatchEvent(new MouseEvent('mousedown', { ...keys, button: 0, buttons: 1 }));
    target.dispatchEvent(menu);
    target.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...keys, button: 0, buttons: 0 }));
    return { press: down.defaultPrevented, menu: menu.defaultPrevented };
  }, at);
  // Neither the press nor the menu is the page's: the time stays, no drag began, and the browser
  // shows its own menu.
  expect(taken).toEqual({ press: false, menu: false });
  expect(await deckTime(page)).toBe(0);
  await expect(timeline).not.toHaveAttribute('data-dragging');
  await expect(timeline).not.toBeFocused();
  // A click of the main button at the same place seeks there: half of the six seconds.
  await page.mouse.click(at.x, at.y);
  expect(await deckTime(page)).toBeCloseTo(3, 1);
});

test('a pause that skips its wait has a notch of its own and its wait dashed; Next jumps it', async ({
  page,
}, testInfo) => {
  const skipping = marks.map((mark) => (mark.id === 'p1' ? { ...mark, skipWait: true } : mark));
  await openTimeline(page, clips, { slides: { marks: skipping } });
  const said = watchPage(page);
  await openExportedDeck(page, testInfo);
  const timeline = page.locator('.mfe-deck .mfe-timeline');
  const notches = timeline.locator('.mfe-pause-mark');
  await expect(notches.nth(0)).toHaveAttribute('data-skip-wait', '');
  await expect(notches.nth(0)).toHaveAttribute(
    'title',
    'Pause 1 · 1.50 s · skips its wait to 2.00 s',
  );
  await expect(notches.nth(1)).not.toHaveAttribute('data-skip-wait');
  // Violet on the scene's own page (dark), apart from the other pause's amber.
  expect(
    await notches.evaluateAll((all) => all.map((notch) => getComputedStyle(notch).backgroundColor)),
  ).toEqual(['rgb(182, 156, 255)', 'rgb(244, 200, 103)']);
  // The wait on the track, from the pause to where the scene goes on: 1.5 s to 2 s of 6.
  const track = (await timeline.locator('.mfe-timeline-track').boundingBox())!;
  const wait = (await timeline.locator('.mfe-timeline-skip').boundingBox())!;
  expect((wait.x - track.x) / track.width).toBeCloseTo(1.5 / 6, 2);
  expect((wait.x + wait.width - track.x) / track.width).toBeCloseTo(2 / 6, 2);
  // Played to the pause, the bar's Next goes on from the end of its wait, never inside it.
  await page.locator('.mfe-deck .mfe-play').click();
  expect(await settled(page)).toBe(1.5);
  await onDeck(page, (deck) => {
    const seen: number[] = [];
    (window as unknown as { seen: number[] }).seen = seen;
    deck.on('time', () => seen.push(deck.time));
  });
  await page.locator('.mfe-deck .mfe-next').click();
  await expect.poll(() => deckTime(page)).toBeGreaterThan(2.2);
  const seen = await page.evaluate(() => (window as unknown as { seen: number[] }).seen);
  expect(seen[0]).toBe(2);
  expect(seen.filter((time) => time > 1.5 && time < 2)).toEqual([]);
  expect(said).toEqual([]);
});

test('the keys of the scene’s own page go on, back, to the start and to the end', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openExportedDeck(page, testInfo);
  // Nothing has the focus: the page's keys are the deck's.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.keyboard.press('ArrowRight');
  expect(await settled(page)).toBe(1.5);
  await page.keyboard.press('PageDown');
  expect(await settled(page)).toBe(4.5);
  await page.keyboard.press('Space');
  await expect(page.locator('.mfe-deck')).toHaveAttribute('data-mfe-state', 'ended', {
    timeout: 10_000,
  });
  await page.keyboard.press('ArrowLeft');
  expect(await deckTime(page)).toBe(4.5);
  await page.keyboard.press('PageUp');
  expect(await deckTime(page)).toBe(1.5);
  await page.keyboard.press('End');
  expect(await deckTime(page)).toBe(6);
  await page.keyboard.press('Home');
  expect(await deckTime(page)).toBe(0);
  // The page does not scroll under them.
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  // Not with a modifier: those are the browser's.
  await page.keyboard.press('ControlOrMeta+ArrowRight');
  expect(await onDeck(page, (deck) => [deck.time, deck.playing])).toEqual([0, false]);
});

test('S shows the notes: the comments of the slide and the note of its pause', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openExportedDeck(page, testInfo);
  const notes = page.locator('.mfe-deck .mfe-notes');
  await expect(notes).toBeHidden();
  await page.keyboard.press('ArrowRight');
  expect(await settled(page)).toBe(1.5);
  await page.keyboard.press('s');
  await expect(notes).toBeVisible();
  await expect(page.getByRole('region', { name: 'Notes' })).toBeVisible();
  await expect(page.locator('.mfe-notes-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(notes.locator('.mfe-notes-heading')).toHaveText('Slide 1 of 3');
  await expect(notes.locator('.mfe-note')).toHaveText(['Comment · 1.25 sA flash over the alpha']);
  await page.keyboard.press('PageDown');
  expect(await settled(page)).toBe(4.5);
  await expect(notes.locator('.mfe-notes-heading')).toHaveText('Slide 2 of 3');
  await expect(notes.locator('.mfe-note')).toHaveText(['Pause · 4.50 sQuestions']);
  // The notes sit under the bar: the stage and the bar do not move.
  const stage = (await page.locator('.mfe-stage').boundingBox())!;
  const bar = (await page.locator('.mfe-bar').boundingBox())!;
  const box = (await notes.boundingBox())!;
  expect(bar.y).toBeCloseTo(stage.y + stage.height, 0);
  expect(box.y).toBeCloseTo(bar.y + bar.height, 0);
  await page.locator('.mfe-notes-button').click();
  await expect(notes).toBeHidden();
});

test('B and the remote’s “.” black the stage out and back', async ({ page }, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openExportedDeck(page, testInfo);
  await onDeck(page, (deck) => deck.seek(1.5));
  const blackout = page.locator('.mfe-deck .mfe-blackout');
  await expect(blackout).toBeHidden();
  await page.keyboard.press('b');
  await expect(blackout).toBeVisible();
  // It covers the whole stage: what is at its centre is the blackout.
  const screen = (await page.locator('.mfe-screen').boundingBox())!;
  expect(await blackout.boundingBox()).toEqual(screen);
  const centre = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.className,
    [screen.x + screen.width / 2, screen.y + screen.height / 2],
  );
  expect(centre).toBe('mfe-blackout');
  const pixel = await page.screenshot({
    clip: {
      x: screen.x + screen.width / 2 - 40,
      y: screen.y + screen.height / 2 - 10,
      width: 80,
      height: 20,
    },
  });
  await page.keyboard.press('.');
  await expect(blackout).toBeHidden();
  const back = await page.screenshot({
    clip: {
      x: screen.x + screen.width / 2 - 40,
      y: screen.y + screen.height / 2 - 10,
      width: 80,
      height: 20,
    },
  });
  expect(back.equals(pixel)).toBe(false); // the formula shows again
  // Going on while it is black first brings the scene back, where it stood.
  await page.keyboard.press('b');
  await page.keyboard.press('ArrowRight');
  await expect(blackout).toBeHidden();
  expect(await onDeck(page, (deck) => [deck.time, deck.playing])).toEqual([1.5, false]);
});

test('F takes the deck full screen, where the bar hides while the pointer rests', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openExportedDeck(page, testInfo);
  await page.setViewportSize({ width: 1000, height: 700 });
  await onDeck(page, (deck) => deck.seek(1.5));
  const deck = page.locator('.mfe-deck');
  const bar = deck.locator('.mfe-bar');
  await page.keyboard.press('f');
  await expect(deck).toHaveAttribute('data-mfe-fullscreen', '');
  expect(await page.evaluate(() => document.fullscreenElement?.className)).toBe('mfe-deck');
  await expect(deck.locator('.mfe-fullscreen')).toHaveAttribute('aria-pressed', 'true');
  // The stage as large as it fits, in the scene's shape, centred; the bar over its foot.
  const stage = (await deck.locator('.mfe-stage').boundingBox())!;
  expect(stage.width).toBeCloseTo(1000, 0);
  expect(stage.height).toBeCloseTo(562.5, 0);
  expect(stage.y).toBeCloseTo((700 - 562.5) / 2, 0);
  const strip = (await bar.boundingBox())!;
  expect(strip.y + strip.height).toBeCloseTo(700, 0);
  expect(strip.width).toBeCloseTo(1000, 0);
  // The pointer rests: the bar goes.
  await expect(deck).toHaveAttribute('data-mfe-idle', '', { timeout: 5_000 });
  await expect(bar).toHaveCSS('opacity', '0');
  await page.mouse.move(500, 300);
  await page.mouse.move(520, 320);
  await expect(deck).not.toHaveAttribute('data-mfe-idle');
  await expect(bar).toHaveCSS('opacity', '1');
  await page.keyboard.press('f');
  await expect(deck).not.toHaveAttribute('data-mfe-fullscreen');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test('the scene’s own page shows the deck as large as the window allows, its bar in sight', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const said = watchPage(page);
  await openExportedDeck(page, testInfo);
  for (const [width, height] of [
    [1280, 720],
    [1000, 900],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    const stage = (await page.locator('.mfe-stage').boundingBox())!;
    const bar = (await page.locator('.mfe-bar').boundingBox())!;
    const fit = Math.min(width, ((height - 40) * 16) / 9);
    expect(stage.width, `${width}×${height}`).toBeCloseTo(fit, 0);
    expect(stage.height).toBeCloseTo((fit * 9) / 16, 0);
    expect(stage.x).toBeCloseTo((width - fit) / 2, 0);
    expect(bar.y).toBeCloseTo(stage.y + stage.height, 0);
    expect(bar.width).toBeCloseTo(stage.width, 0);
    expect(bar.height).toBe(40);
    // Centred, and nothing to scroll.
    expect(stage.y + (stage.y + stage.height + bar.height)).toBeCloseTo(height, 0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
  }
  // With the notes open the stage makes room for them.
  await page.keyboard.press('s');
  const stage = (await page.locator('.mfe-stage').boundingBox())!;
  const notes = (await page.locator('.mfe-notes').boundingBox())!;
  expect(stage.height).toBeCloseTo(1080 - 40 - 140, 0);
  expect(notes.y + notes.height).toBeCloseTo(1080, 0);
  // Dark, whatever the system says, unless the deck says otherwise.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.mfe-bar')).toHaveCSS('background-color', 'rgb(18, 22, 25)');
  await expect(page.locator('body')).toHaveCSS('margin', '0px');
  expect(said).toEqual([]);
});

test('the scene’s own page reads its address: ?controls=minimal&autoplay, ?controls=none', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const root = await openExportedDeck(page, testInfo);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(deckAddress(root, 'index.html', '?controls=minimal&autoplay'));
  const bar = page.locator('.mfe-deck .mfe-bar');
  await expect(bar.locator('> *')).toHaveCount(2);
  await expect(bar.locator('.mfe-play')).toBeVisible();
  await expect(bar.locator('.mfe-timeline')).toBeVisible();
  // It started by itself, and stops at the first pause.
  await expect.poll(() => deckTime(page), { timeout: 10_000 }).toBe(1.5);
  // Its keys are there all the same.
  await page.keyboard.press('ArrowRight');
  expect(await settled(page)).toBe(4.5);

  await page.goto(deckAddress(root, 'index.html', '?controls=none'));
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(1);
  await expect(page.locator('.mfe-bar')).toHaveCount(0);
  // The stage takes the whole window in the scene's shape; the page drives it, not its keys.
  const stage = (await page.locator('.mfe-stage').boundingBox())!;
  expect(stage.width).toBeCloseTo(1280, 0);
  expect(stage.height).toBeCloseTo(720, 0);
  await page.keyboard.press('ArrowRight');
  expect(await onDeck(page, (deck) => deck.playing)).toBe(false);
});

test('notes off: the author’s comments stay out of the page, whatever its controls', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const root = await openExportedDeck(page, testInfo, '?notes=off');
  const name = await onDeck(page, (deck) => (deck as unknown as { name: string }).name);
  // The scene's own page, told so in its address: a full bar with no notes button, and S at the
  // slide that has a comment shows nothing.
  await expect(page.locator('.mfe-bar .mfe-play')).toBeVisible();
  await expect(page.locator('.mfe-notes-button')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  expect(await settled(page)).toBe(1.5);
  await page.keyboard.press('s');
  await expect(page.locator('.mfe-notes')).toHaveCount(0);
  await expect(page.getByText('A flash over the alpha')).toHaveCount(0);

  // Embedded with a minimal bar, beside the same deck with its notes: S, with the focus in each.
  await page.goto(
    hostPage(
      root,
      'quiet.html',
      `<div class="mfe-deck" data-scene="${name}" data-controls="minimal"></div>` +
        `<div class="mfe-deck" data-scene="${name}" data-controls="minimal" data-notes="off"></div>`,
    ),
  );
  const decks = page.locator('.mfe-deck');
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(2);
  await decks.nth(0).locator('.mfe-timeline').focus();
  await page.keyboard.press('s');
  await expect(decks.nth(0).locator('.mfe-notes')).toBeVisible();
  await expect(decks.nth(0).locator('.mfe-notes')).toContainText('A flash over the alpha');
  await decks.nth(1).locator('.mfe-timeline').focus();
  await page.keyboard.press('s');
  await expect(decks.nth(1).locator('.mfe-notes')).toHaveCount(0);
  await expect(decks.nth(1)).not.toHaveAttribute('data-mfe-notes');
  await expect(decks.nth(1).getByText('A flash over the alpha')).toHaveCount(0);
  // Its other keys are there all the same.
  await page.keyboard.press('k');
  expect(await onDeck(page, (deck) => deck.playing, 1)).toBe(true);
});

/** A page of the host's own, beside the exported files: `body` between the stylesheet and the
 * scene's scripts, then rules of the host's own (written after the deck's stylesheet: they would
 * win by order alone). */
function hostPage(root: string, file: string, body: string, rules = ''): string {
  writeFileSync(
    join(root, file),
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<link rel="stylesheet" href="player.css">' +
      `<style>body { font: 16px Georgia, serif } ${rules}</style></head><body>` +
      body +
      '<script src="mfe-runtime.js"></script><script src="glyphs.js"></script>' +
      '<script src="scene.js"></script></body></html>\n',
  );
  return deckAddress(root, file);
}

/** Rules a page may well have, for every element of a kind. */
const HOSTILE = `
  * { box-sizing: content-box; margin: 4px }
  button { background: red; padding: 20px; font: 30px serif }
  svg { width: 50px; height: auto; max-width: 100% }
  div { line-height: 3 }
`;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  return box;
}

test('two decks in a page with rules of its own look right and hear their own keys', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const root = await openExportedDeck(page, testInfo);
  const name = await onDeck(page, (deck) => (deck as unknown as { name: string }).name);
  await page.setViewportSize({ width: 1100, height: 1000 });
  const said = watchPage(page);
  await page.goto(
    hostPage(
      root,
      'hostile.html',
      '<button class="mine">Mine</button>' +
        `<section style="width: 640px"><div class="mfe-deck" data-scene="${name}" data-theme="dark"></div></section>` +
        `<section style="width: 400px"><div class="mfe-deck" data-scene="${name}" data-theme="light"></div></section>`,
      HOSTILE,
    ),
  );
  const decks = page.locator('.mfe-deck');
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(2);
  for (const [index, width] of [
    [0, 640],
    [1, 400],
  ] as const) {
    const deck = decks.nth(index);
    const element = await boxOf(deck);
    const stage = await boxOf(deck.locator('.mfe-stage'));
    // The host's margin is on the deck (its element); inside it, nothing moved.
    expect(element.width).toBeCloseTo(width - 8, 0);
    expect(stage.x).toBeCloseTo(element.x, 0);
    expect(stage.y).toBeCloseTo(element.y, 0);
    expect(stage.width).toBeCloseTo(element.width, 0);
    expect(stage.height).toBeCloseTo((element.width * 9) / 16, 0);
    const bar = await boxOf(deck.locator('.mfe-bar'));
    expect(bar.y).toBeCloseTo(stage.y + stage.height, 0);
    expect(bar.height).toBe(40);
    const play = deck.locator('.mfe-play');
    expect(await boxOf(play)).toMatchObject({ width: 32, height: 32 });
    expect(await boxOf(play.locator('.mfe-icon'))).toMatchObject({ width: 20, height: 20 });
    await expect(play).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(play).toHaveCSS('padding', '0px');
    expect(await boxOf(deck.locator('.mfe-next .mfe-icon'))).toMatchObject({
      width: 18,
      height: 18,
    });
    const timeline = await boxOf(deck.locator('.mfe-timeline'));
    expect(timeline.height).toBe(32);
    expect(timeline.y).toBeCloseTo(bar.y + 4, 0);
  }
  // Each in its theme.
  await expect(decks.nth(0).locator('.mfe-bar')).toHaveCSS('background-color', 'rgb(18, 22, 25)');
  await expect(decks.nth(1).locator('.mfe-bar')).toHaveCSS(
    'background-color',
    'rgb(242, 245, 246)',
  );
  // The host's own button keeps the host's look.
  const mine = page.locator('button.mine');
  await expect(mine).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  await expect(mine).toHaveCSS('padding', '20px');
  await expect(mine).toHaveCSS('font-size', '30px');

  // The keys reach the deck that has the focus, and no other.
  const playing = () =>
    page.evaluate(() => (window as unknown as DeckWindow).MFE.decks.map((deck) => deck.playing));
  await decks.nth(1).locator('.mfe-screen').click(); // a click on the stage plays it
  expect(await playing()).toEqual([false, true]);
  await page.keyboard.press('k');
  expect(await playing()).toEqual([false, false]);
  await decks.nth(0).locator('.mfe-slide-count').click(); // its words: the focus, nothing else
  expect(await playing()).toEqual([false, false]);
  await page.keyboard.press('ArrowRight');
  expect(await playing()).toEqual([true, false]);
  await page.keyboard.press('k');
  // Outside both, on the host's button: Space is the button's, and neither deck hears it.
  await mine.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  expect(await playing()).toEqual([false, false]);
  expect(await page.locator('[id]').count()).toBe(0);
  expect(said).toEqual([]);
});

test('a deck takes the host’s accent, and shows the host’s page through a transparent stage', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const root = await openExportedDeck(page, testInfo);
  const name = await onDeck(page, (deck) => (deck as unknown as { name: string }).name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(
    hostPage(
      root,
      'accent.html',
      `<div style="width: 600px"><div class="mfe-deck" data-scene="${name}"></div></div>` +
        `<div class="my-page" style="width: 600px"><div class="mfe-deck" data-scene="${name}" data-background="transparent"></div></div>`,
      'body { background: rgb(200, 30, 30) } .my-page .mfe-deck { --mfe-accent: rgb(255, 102, 0) }',
    ),
  );
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(2);
  await page.evaluate(() =>
    (window as unknown as DeckWindow).MFE.decks.forEach((deck) => deck.seek(3)),
  );
  const played = page.locator('.mfe-timeline-played');
  await expect(played.nth(0)).toHaveCSS('background-color', 'rgb(67, 238, 202)');
  await expect(played.nth(1)).toHaveCSS('background-color', 'rgb(255, 102, 0)');
  await expect(page.locator('.mfe-timeline-thumb').nth(1)).toHaveCSS(
    'background-color',
    'rgb(255, 102, 0)',
  );
  // The first stage is the scene's own black; through the second, the page's red.
  const screens = page.locator('.mfe-screen');
  await expect(screens.nth(0)).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(screens.nth(1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const corner = await boxOf(screens.nth(1));
  const shot = await page.screenshot({
    clip: { x: corner.x + 4, y: corner.y + 4, width: 1, height: 1 },
  });
  const red = await page.screenshot({ clip: { x: 1, y: 1, width: 1, height: 1 } });
  expect(shot.equals(red)).toBe(true);
});

test('the guide’s controls that appear on hover show on hover and on focus, and move nothing', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const root = await openExportedDeck(page, testInfo);
  const name = await onDeck(page, (deck) => (deck as unknown as { name: string }).name);
  // The recipe as the export wrote it in the folder's guide.
  const guide = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  const recipe = guide.slice(guide.indexOf('**Controls that appear on hover**'));
  const css = /```css\n([\s\S]*?)\n```/.exec(recipe)![1]!;
  expect(css).toContain('.my-page .mfe-deck');
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(
    hostPage(
      root,
      'hover.html',
      '<main class="my-page" style="width: 640px; padding: 20px">' +
        '<p><button class="before">Before</button></p>' +
        `<div class="mfe-deck" data-scene="${name}" data-notes="off"></div>` +
        '<p class="after">After the scene.</p></main>',
      css,
    ),
  );
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(1);
  await page.mouse.move(5, 5);
  const deck = page.locator('.mfe-deck');
  const bar = deck.locator('.mfe-bar');
  const after = page.locator('p.after');
  const where = async () => ({ deck: await boxOf(deck), after: await boxOf(after) });
  const before = await where();
  // Hidden, and nothing to press where it lies.
  await expect(bar).toHaveCSS('opacity', '0');
  const stage = await boxOf(deck.locator('.mfe-stage'));
  // The deck is the stage alone: the bar is out of the flow.
  expect(before.deck.height).toBeCloseTo(stage.height, 0);
  const play = await boxOf(bar.locator('.mfe-play'));
  const hit = () =>
    page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest('.mfe-bar') !== null,
      [play.x + play.width / 2, play.y + play.height / 2],
    );
  expect(await hit()).toBe(false);

  // The pointer on the scene: the bar over the foot of the stage, and the page as it was.
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 3);
  await expect(bar).toHaveCSS('opacity', '1');
  const shown = await boxOf(bar);
  expect(shown.y + shown.height).toBeCloseTo(stage.y + stage.height, 0);
  expect(shown.x).toBeCloseTo(stage.x, 0);
  expect(shown.width).toBeCloseTo(stage.width, 0);
  expect(await hit()).toBe(true);
  expect(await where()).toEqual(before);
  await page.mouse.move(5, 5);
  await expect(bar).toHaveCSS('opacity', '0');

  // The keyboard: Tab from the host's button goes into the bar, which shows.
  await page.locator('button.before').focus();
  await page.keyboard.press('Tab');
  await expect(bar.locator('.mfe-previous')).toBeFocused();
  await expect(bar).toHaveCSS('opacity', '1');
  expect(await where()).toEqual(before);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('button.before')).toBeFocused();
  await expect(bar).toHaveCSS('opacity', '0');
});

test('at 320 px the bar fits, its least needed controls go first, and play is in reach', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const root = await openExportedDeck(page, testInfo);
  const name = await onDeck(page, (deck) => (deck as unknown as { name: string }).name);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(
    hostPage(
      root,
      'narrow.html',
      `<div style="width: 320px"><div class="mfe-deck" data-scene="${name}"></div></div>`,
      'body { margin: 20px }',
    ),
  );
  const bar = page.locator('.mfe-bar');
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const box = await boxOf(bar);
  for (const control of await bar.locator('.mfe-button:visible, .mfe-timeline').all()) {
    const inner = await boxOf(control);
    expect(inner.x).toBeGreaterThanOrEqual(box.x);
    expect(inner.x + inner.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  await expect(bar.locator('.mfe-time')).toBeHidden();
  await expect(bar.locator('.mfe-through')).toBeHidden();
  await expect(bar.locator('.mfe-notes-button')).toBeHidden();
  for (const kept of ['.mfe-previous', '.mfe-play', '.mfe-next', '.mfe-timeline']) {
    await expect(bar.locator(kept)).toBeVisible();
  }
  // Play is what is under the pointer at its centre: a press there plays.
  const play = await boxOf(bar.locator('.mfe-play'));
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('button')?.className,
    [play.x + play.width / 2, play.y + play.height / 2],
  );
  expect(hit).toBe('mfe-button mfe-play');
  await page.mouse.click(play.x + play.width / 2, play.y + play.height / 2);
  expect(await onDeck(page, (deck) => deck.playing)).toBe(true);
});

test('the scene’s own page in a frame fits it, and hears its keys only with the focus', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const root = await openExportedDeck(page, testInfo);
  await page.setViewportSize({ width: 900, height: 700 });
  writeFileSync(
    join(root, 'framed.html'),
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"></head><body>' +
      '<p><button class="mine">Mine</button></p>' +
      '<iframe src="index.html" title="The scene" style="width: 640px; height: 400px; border: 0"></iframe>' +
      '</body></html>\n',
  );
  await page.goto(deckAddress(root, 'framed.html'));
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(1);
  const outer = await boxOf(page.locator('iframe'));
  const bar = await boxOf(frame.locator('.mfe-bar'));
  const stage = await boxOf(frame.locator('.mfe-stage'));
  expect(stage.width).toBeCloseTo(640, 0);
  expect(bar.y + bar.height).toBeCloseTo(outer.y + 400, 0);
  const inner = page.frames().find((candidate) => candidate.url().endsWith('index.html'))!;
  const playing = () =>
    inner.evaluate(() => (window as unknown as DeckWindow).MFE.decks[0]!.playing);
  // The host's keys are the host's.
  await page.locator('button.mine').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('k');
  expect(await playing()).toBe(false);
  // In the frame, the deck's.
  await frame.locator('.mfe-time').click();
  await page.keyboard.press('k');
  expect(await playing()).toBe(true);
  await page.keyboard.press('k');
  expect(await playing()).toBe(false);
});
