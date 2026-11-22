/* The page of Export ▸ HTML, opened from disk: the scene is drawn live, its groups have the
 * clips' names, and it stops at each pause of the Slides mode until its reader goes on. */
import { expect, test } from './test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deckAddress, onDeck, openExportedDeck, watchPage } from './deckHelpers';
import { clipJson, openTimeline } from './timelineHelpers';

/** `alpha` on [0, 3] and `beta` on [2, 6], each written during its first second and fading out
 * during its last: the scene rests over [1, 2] and [4, 5]. A pause in each rest, a note on the
 * second, and a comment. */
const clips = [clipJson('c1', 'fa', 't1', 0, 3), clipJson('c2', 'fb', 't2', 2, 6)];
const marks = [
  { id: 'p1', time: 1.5, kind: 'pause' },
  { id: 'p2', time: 4.5, kind: 'pause', text: 'Questions' },
  { id: 'p3', time: 1.25, kind: 'comment', text: 'A flash over the alpha' },
];

test('the exported page opens from disk and draws the scene with its clips by name', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const said = watchPage(page);
  await openExportedDeck(page, testInfo);
  expect(page.url().startsWith('file://')).toBe(true);
  const state = await onDeck(page, (deck) => ({
    problems: deck.problems.length,
    duration: deck.duration,
    slides: deck.slides,
    pauses: deck.pauses,
    comments: deck.comments,
  }));
  expect(state).toEqual({
    problems: 0,
    duration: 6,
    slides: 3,
    pauses: [
      { time: 1.5, note: '', resume: 1.5 },
      { time: 4.5, note: 'Questions', resume: 4.5 },
    ],
    comments: [{ time: 1.25, text: 'A flash over the alpha' }],
  });
  await expect(page.locator('svg.mfe-stage .mfe-clip')).toHaveCount(2);
  await expect(page.locator('.mfe-clip[data-clip="alpha"]')).toHaveCount(1);
  await expect(page.locator('.mfe-clip[data-clip="beta"]')).toHaveCount(1);
  // Half way through its rest, the first formula is whole: a path per glyph, in its group.
  await onDeck(page, (deck) => deck.seek(1.5));
  await expect(page.locator('.mfe-clip[data-clip="alpha"] path.mfe-glyph')).not.toHaveCount(0);
  await expect(page.locator('.mfe-clip[data-clip="beta"] path')).toHaveCount(0);
  expect(await onDeck(page, (deck) => deck.box('alpha')!.width)).toBeGreaterThan(0);
  expect(await page.locator('[id]').count()).toBe(0);
  // The stage fills the page's width and has the scene's shape.
  const stage = (await page.locator('svg.mfe-stage').boundingBox())!;
  expect(stage.width / stage.height).toBeCloseTo(16 / 9, 2);
  expect(said).toEqual([]);
});

test('the exported page stops at each pause, exactly, and goes on when told', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openExportedDeck(page, testInfo);
  await onDeck(page, (deck) => deck.play());
  await expect.poll(() => onDeck(page, (deck) => deck.playing), { timeout: 10_000 }).toBe(false);
  expect(await onDeck(page, (deck) => deck.time)).toBe(1.5);
  await expect(page.locator('.mfe-deck')).toHaveAttribute('data-mfe-state', 'paused');
  await onDeck(page, (deck) => deck.next());
  await expect.poll(() => onDeck(page, (deck) => deck.playing), { timeout: 10_000 }).toBe(false);
  expect(await onDeck(page, (deck) => [deck.time, deck.slide])).toEqual([4.5, 1]);
  await onDeck(page, (deck) => deck.next());
  await expect(page.locator('.mfe-deck')).toHaveAttribute('data-mfe-state', 'ended', {
    timeout: 10_000,
  });
  expect(await onDeck(page, (deck) => [deck.time, deck.slide])).toEqual([6, 2]);
});

test('a pause that skips its wait: the page stops there and goes on from the end of the wait', async ({
  page,
}, testInfo) => {
  const skipping = marks.map((mark) => (mark.id === 'p1' ? { ...mark, skipWait: true } : mark));
  await openTimeline(page, clips, { slides: { marks: skipping } });
  const said = watchPage(page);
  const root = await openExportedDeck(page, testInfo);
  expect(await onDeck(page, (deck) => deck.pauses)).toEqual([
    { time: 1.5, note: '', resume: 2 },
    { time: 4.5, note: 'Questions', resume: 4.5 },
  ]);
  /** Every time the deck draws from now on, in `window.seen`. */
  const record = () =>
    onDeck(page, (deck) => {
      const seen: number[] = [];
      (window as unknown as { seen: number[] }).seen = seen;
      deck.on('time', () => seen.push(deck.time));
    });
  const seen = () => page.evaluate(() => (window as unknown as { seen: number[] }).seen);
  const inTheWait = (times: number[]) => times.filter((time) => time > 1.5 && time < 2);
  const standing = async () => {
    await expect.poll(() => onDeck(page, (deck) => deck.playing), { timeout: 10_000 }).toBe(false);
    return onDeck(page, (deck) => [deck.time, deck.atPause]);
  };

  // Played, it stops at the pause; going on (Space), it is at the end of the wait at once.
  await record();
  await page.keyboard.press('Space');
  expect(await standing()).toEqual([1.5, 0]);
  await page.keyboard.press('Space');
  await expect.poll(() => onDeck(page, (deck) => deck.time)).toBeGreaterThan(2.1);
  expect(await onDeck(page, (deck) => deck.slide)).toBe(1);
  const times = await seen();
  expect(times.filter((time) => time > 1.5)[0]).toBe(2);
  expect(inTheWait(times)).toEqual([]);
  // Back to it (←), and on with a click on the stage: the same.
  await page.keyboard.press('ArrowLeft');
  expect(await standing()).toEqual([1.5, 0]);
  await record();
  await page.locator('.mfe-screen').click();
  await expect.poll(() => onDeck(page, (deck) => deck.time)).toBeGreaterThan(2.1);
  expect(inTheWait(await seen())).toEqual([]);

  // Through the pauses (the bar's switch): the wait plays.
  await page.keyboard.press('ArrowLeft');
  expect(await standing()).toEqual([1.5, 0]);
  await page.locator('.mfe-through').click();
  await expect(page.locator('.mfe-through')).toHaveAttribute('aria-pressed', 'true');
  await record();
  await page.keyboard.press('ArrowRight'); // Space would press the switch, which has the focus
  await expect.poll(() => onDeck(page, (deck) => deck.time)).toBeGreaterThan(2.1);
  expect(inTheWait(await seen()).length).toBeGreaterThan(3);

  // The page's pauses off, opened at the pause: the wait plays.
  await page.goto(deckAddress(root, 'index.html', '?pauses=off&start=1.5'));
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(1);
  expect(await onDeck(page, (deck) => [deck.time, deck.through])).toEqual([1.5, true]);
  await record();
  await page.keyboard.press('Space');
  await expect.poll(() => onDeck(page, (deck) => deck.time)).toBeGreaterThan(2.1);
  expect(inTheWait(await seen()).length).toBeGreaterThan(3);
  // The scene's length is its own all along.
  expect(await onDeck(page, (deck) => deck.duration)).toBe(6);
  expect(said).toEqual([]);
});

test('the exported folder is extended by editing its files: the scene and custom.js', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const said = watchPage(page);
  const root = await openExportedDeck(page, testInfo);
  // By data: the first formula fades in instead of being written, and its pause moves.
  const scene = join(root, 'scene.js');
  const text = readFileSync(scene, 'utf8');
  expect(text).toContain('"kind": "write"');
  writeFileSync(
    scene,
    text.replace('"kind": "write"', '"kind": "fade_in"').replace('"time": 1.5', '"time": 1.75'),
  );
  // By code: a pulse of the first formula while the deck rests at that pause, and a label of the
  // page's own over the scene, placed by where the formula is.
  writeFileSync(
    join(root, 'custom.js'),
    `document.addEventListener('DOMContentLoaded', () => {
  const deck = MFE.mount('.mfe-deck');
  const alpha = deck.clip('alpha');
  deck.animate({
    from: 1,
    to: 2,
    ease: 'there_and_back',
    update(progress) {
      alpha.style.opacity = String(1 - 0.5 * progress);
    },
  });
  const box = deck.box('alpha', 1.5);
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('class', 'my-label');
  label.setAttribute('x', String(box.cx));
  label.setAttribute('y', String(box.y - 0.2));
  label.setAttribute('font-size', '0.4');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('fill', '#ffffff');
  label.textContent = 'mine';
  deck.layer('above').append(label);
});
`,
  );
  await page.goto(deckAddress(root));
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(1);
  expect(await onDeck(page, (deck) => deck.problems.length)).toBe(0);
  expect(await onDeck(page, (deck) => deck.pauses[0]!.time)).toBe(1.75);
  // The intro is a fade now: half way through it every glyph is there, half seen.
  await onDeck(page, (deck) => deck.seek(0.5));
  const glyphs = page.locator('.mfe-clip[data-clip="alpha"] path.mfe-glyph');
  await expect(glyphs).not.toHaveCount(0);
  const opacities = await glyphs.evaluateAll((paths) =>
    paths.map((path) => Number(path.getAttribute('fill-opacity') ?? '1')),
  );
  expect(opacities.every((opacity) => opacity > 0 && opacity < 1)).toBe(true);
  // The page's own animation is a function of the scene's time: right after a jump, and back.
  const pulse = () =>
    page
      .locator('.mfe-clip[data-clip="alpha"]')
      .evaluate((group) => (group as SVGElement).style.opacity);
  await onDeck(page, (deck) => deck.seek(1.5));
  expect(Number(await pulse())).toBeCloseTo(0.5, 2);
  await onDeck(page, (deck) => deck.seek(3));
  expect(Number(await pulse())).toBe(1);
  await onDeck(page, (deck) => deck.seek(0.25));
  expect(Number(await pulse())).toBe(1);
  // And its label is over the scene, upright, above the formula.
  await onDeck(page, (deck) => deck.seek(1.5));
  const label = (await page.locator('.mfe-above text.my-label').boundingBox())!;
  const formula = (await page.locator('.mfe-clip[data-clip="alpha"]').boundingBox())!;
  expect(label.y + label.height).toBeLessThanOrEqual(formula.y + 1);
  expect(Math.abs(label.x + label.width / 2 - (formula.x + formula.width / 2))).toBeLessThan(4);
  expect(said).toEqual([]);
});

test('a scene file with a mistake says where, in the page and in the console', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  const root = await openExportedDeck(page, testInfo);
  const scene = join(root, 'scene.js');
  writeFileSync(scene, readFileSync(scene, 'utf8').replace('"kind": "write"', '"kind": "explode"'));
  const said = watchPage(page);
  await page.goto(deckAddress(root));
  const problems = page.locator('.mfe-problems');
  await expect(problems).toBeVisible();
  await expect(problems.locator('code').first()).toHaveText('scene.js · clips[0].intro.kind');
  expect(said.some((line) => line.includes('scene.js · clips[0].intro.kind'))).toBe(true);
});
