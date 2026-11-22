import { expect, test } from './test';
import {
  appearJson,
  blockLocator,
  blockOf,
  disappearJson,
  dragBlock,
  openBlockScene,
  pickAnimation,
  tweenJson,
} from './blockHelpers';
import type { MfeWindow } from './helpers';
import { holdToConfirm, openSubmenu } from './helpers';
import {
  asTween,
  box,
  canUndo,
  clipOf,
  moveClip,
  setTime,
  timeToX,
  uiState,
  undo,
  type ClipJson,
} from './timelineHelpers';

/* Animation blocks on the timeline: every clip action is a block in the upper strip of its
 * clip. Formula `fa` has five glyphs (a + b = c), on clip `a` [0, 10] of track 1. */

test.describe('animation blocks: drawing', () => {
  test('every action is a block, coloured by category and labelled with its Manim name', async ({
    page,
  }) => {
    await openBlockScene(
      page,
      [
        appearJson('w', 1, 1.5, 'write', [3, 4]),
        tweenJson('tw', 3, 1),
        disappearJson('fo', 5, 1, 'fade_out', 'all'),
      ],
      { hidden: [3, 4] },
    );
    await expect(blockLocator(page, 'w')).toHaveText('Write · 2');
    await expect(blockLocator(page, 'w')).toHaveClass(/is-appear/);
    await expect(blockLocator(page, 'tw')).toHaveText('Transform');
    await expect(blockLocator(page, 'tw')).toHaveClass(/is-transform/);
    await expect(blockLocator(page, 'fo')).toHaveText('FadeOut');
    await expect(blockLocator(page, 'fo')).toHaveClass(/is-disappear/);
    await expect(blockLocator(page, 'w')).toHaveAttribute('title', /1\.00 s → 2\.50 s/);
    // The block sits in the upper half of the clip, aligned with its time.
    const clip = await box(page.getByTestId('clip-a'));
    const w = await box(blockLocator(page, 'w'));
    expect(w.y).toBeLessThan(clip.y + clip.height / 2);
    expect(Math.abs(w.x - clip.x - 80)).toBeLessThan(2); // 1 s at 80 px/s, past the clip border
    expect(Math.abs(w.width - 120)).toBeLessThan(2);
  });

  test('a block, an intro and an outro show the icon of their animation before its name; too short for the name, the icon alone', async ({
    page,
  }) => {
    const phase = { easing: 'smooth', lagRatio: null, shift: [0, 0], scale: 1 };
    await openBlockScene(
      page,
      [
        appearJson('w', 2, 1.5, 'write', [3, 4]),
        tweenJson('tw', 4, 1),
        disappearJson('fo', 6, 0.25, 'fade_out', 'all'),
      ],
      {
        hidden: [3, 4],
        clip: {
          intro: { ...phase, kind: 'grow_from_center', duration: 1 } as ClipJson['intro'],
          outro: { ...phase, kind: 'fade_out', duration: 0.25 } as ClipJson['outro'],
        },
      },
    );
    const icon = (id: string) => blockLocator(page, id).locator('svg.animation-icon');
    await expect(icon('w')).toHaveAttribute('data-icon', 'write');
    await expect(icon('tw')).toHaveAttribute('data-icon', 'tween');
    await expect(icon('fo')).toHaveAttribute('data-icon', 'fade-out');
    // The icon is before the name, on the block's line.
    const name = blockLocator(page, 'w').locator('.tl-block-label');
    const drawn = await box(icon('w'));
    const named = await box(name);
    expect(drawn.x + drawn.width).toBeLessThanOrEqual(named.x);
    expect(Math.abs(drawn.y + drawn.height / 2 - (named.y + named.height / 2))).toBeLessThan(2);
    await expect(name).toBeVisible();
    // A block of 0.25 s is 20 px long: its icon alone, in its middle. Its name is still what the
    // block reads as, and what its tooltip says.
    const short = blockLocator(page, 'fo');
    await expect(short).toHaveClass(/is-icon-only/);
    await expect(short.locator('.tl-block-label')).toBeHidden();
    await expect(icon('fo')).toBeVisible();
    await expect(short).toHaveText('FadeOut');
    await expect(short).toHaveAttribute('title', /^FadeOut/);
    const block = await box(short);
    const alone = await box(icon('fo'));
    expect(alone.x + alone.width / 2).toBeCloseTo(block.x + block.width / 2, 0);
    // The intro and the outro of the clip: the same, on their bands in its lower half.
    const clip = page.getByTestId('clip-a');
    const intro = clip.locator('.tl-seg-name:not(.is-outro)');
    const outro = clip.locator('.tl-seg-name.is-outro');
    await expect(intro.locator('svg.animation-icon')).toHaveAttribute('data-icon', 'grow');
    await expect(intro.locator('.tl-seg-text')).toHaveText('Grow');
    await expect(intro.locator('.tl-seg-text')).toBeVisible();
    await expect(outro.locator('svg.animation-icon')).toHaveAttribute('data-icon', 'fade-out');
    await expect(outro).toHaveClass(/is-icon-only/);
    await expect(outro.locator('.tl-seg-text')).toBeHidden();
    // The outro's icon is inside the clip, at its end.
    const whole = await box(clip);
    const last = await box(outro.locator('svg.animation-icon'));
    expect(last.x).toBeGreaterThanOrEqual(whole.x + whole.width - 20 - 1);
    expect(last.x + last.width).toBeLessThanOrEqual(whole.x + whole.width);
  });

  test('blocks that overlap in time take sub-lanes and only their track grows', async ({
    page,
  }) => {
    await openBlockScene(page, [
      appearJson('w', 1, 2, 'write', [3]),
      disappearJson('fo', 2, 2, 'fade_out', [0]),
      appearJson('late', 6, 1, 'fade_in', [4]),
    ]);
    await expect(blockLocator(page, 'w')).toHaveAttribute('data-lane', '0');
    await expect(blockLocator(page, 'fo')).toHaveAttribute('data-lane', '1');
    await expect(blockLocator(page, 'late')).toHaveAttribute('data-lane', '0'); // free again
    const one = await box(page.getByTestId('track-row-t2'));
    const two = await box(page.getByTestId('track-row-t1'));
    expect(one.height).toBe(46);
    expect(two.height).toBe(46 + 19); // a lane of 19 px more
    // The second lane keeps the full lane height and is below the first.
    const first = await box(blockLocator(page, 'w'));
    const second = await box(blockLocator(page, 'fo'));
    expect(second.y - first.y).toBeCloseTo(19, 0);
    expect(second.height).toBeCloseTo(first.height, 0);
    // The clip fills the taller track; the track below starts under it.
    const clip = await box(page.getByTestId('clip-a'));
    const other = await box(page.getByTestId('clip-b'));
    expect(clip.height - other.height).toBeCloseTo(19, 0);
    expect(one.y).toBeCloseTo(two.y + two.height, 0);
  });

  test('a click selects the block, and the clip shows that one of its blocks is selected', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 1, 2, 'write', [3]), tweenJson('tw', 5, 1)]);
    await blockLocator(page, 'w').click();
    expect((await uiState(page)).selection).toEqual({
      kind: 'action',
      clipId: 'a',
      actionId: 'w',
    });
    await expect(blockLocator(page, 'w')).toHaveClass(/is-selected/);
    await expect(page.getByTestId('clip-a')).toHaveClass(/has-selected-block/);
    // The Creator highlights the formula of the block's clip, as for a selected clip.
    await expect(page.locator('[data-testid="formula-item"][data-name="f1"]')).toHaveAttribute(
      'data-linked',
      'true',
    );
    await blockLocator(page, 'tw').click();
    await expect(blockLocator(page, 'w')).not.toHaveClass(/is-selected/);
    expect((await uiState(page)).selection).toMatchObject({ actionId: 'tw' });
    // Clicking the clip itself selects the clip, not a block.
    await page.getByTestId('clip-a').click({ position: { x: 20, y: 30 } });
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
  });

  test('blocks scroll under the track headers, like their clips', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 0.5, 3, 'write', [3])]);
    // Zoom in until the timeline scrolls, then scroll so that the block passes under the sticky
    // header column.
    for (let i = 0; i < 5; i++) await page.getByTestId('timeline-zoom-in').click();
    await page.getByTestId('timeline-scroll').evaluate((el) => (el.scrollLeft = 300));
    await expect
      .poll(() => page.getByTestId('timeline-scroll').evaluate((el) => el.scrollLeft))
      .toBe(300);
    const header = (await page.getByTestId('track-header-t1').boundingBox())!;
    const block = (await blockLocator(page, 'w').boundingBox())!;
    expect(block.x).toBeLessThan(header.x + header.width - 20); // it does reach under the header
    const x = header.x + header.width - 10;
    const y = block.y + block.height / 2;
    const underHeader = await page.evaluate(
      ([px, py]) =>
        !!document.elementFromPoint(px!, py!)?.closest('[data-testid="track-header-t1"]'),
      [x, y],
    );
    expect(underHeader).toBe(true);
  });

  test('a double-click on a block opens its dialog, not the formula editor', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 1, 2, 'write', [3])]);
    await blockLocator(page, 'w').dblclick();
    await expect(page.getByTestId('formula-editor')).toHaveCount(0);
    await expect(page.getByTestId('block-dialog')).toBeVisible();
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'w' });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('block-dialog')).toHaveCount(0);
    // …while the clip still opens it.
    await page.getByTestId('clip-a').dblclick({ position: { x: 20, y: 30 } });
    await expect(page.getByTestId('formula-editor')).toBeVisible();
  });
});

/* Glyph 1 leaves at [1, 2] (d1), comes back at [4, 5] (a1) and leaves again at [7, 8] (d2): a1
 * can move between 2 and 7 and no further. Glyph 3 is untouched by all three. */
const SAME_GLYPH = [
  disappearJson('d1', 1, 1, 'fade_out', [1]),
  appearJson('a1', 4, 1, 'write', [1]),
  disappearJson('d2', 7, 1, 'fade_out', [1]),
];

test.describe('animation blocks: move and resize', () => {
  test('dragging moves the block; Shift suspends snapping; one drag is one undo step', async ({
    page,
  }) => {
    await openBlockScene(page, SAME_GLYPH);
    await dragBlock(page, 'a1', 0.9, { shift: true });
    const moved = await blockOf(page, 'a', 'a1');
    expect(moved.start).toBeCloseTo(4.9, 1);
    expect(Number.isInteger(moved.start * 100)).toBe(false); // not on the grid: no snapping
    expect(moved.duration).toBe(1);
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'a1' });
    await undo(page);
    expect((await blockOf(page, 'a', 'a1')).start).toBe(4);
    expect(await canUndo(page)).toBe(false); // the whole drag was one step
  });

  test('snaps to the playhead, the ruler grid and the edges of other blocks', async ({ page }) => {
    await openBlockScene(page, [...SAME_GLYPH, appearJson('x', 5.5, 1, 'fade_in', [3])]);
    // To the playhead: the end of a1 (5.9 s when dragged by 0.9 s) is within 8 px of 6.0.
    await setTime(page, 6);
    await dragBlock(page, 'a1', 0.93);
    expect((await blockOf(page, 'a', 'a1')).start).toBeCloseTo(5, 6);
    await undo(page);
    // To the edge of another block: x starts at 5.5; a1's end at 5.45 snaps to it.
    await setTime(page, 0);
    await dragBlock(page, 'a1', 0.45);
    expect((await blockOf(page, 'a', 'a1')).start).toBeCloseTo(4.5, 6);
    await undo(page);
    // To the grid: a1 dragged 0.52 s lands on a multiple of the minor tick (here 0.25 s).
    await dragBlock(page, 'a1', 0.52);
    const start = (await blockOf(page, 'a', 'a1')).start;
    expect(Math.abs(start / 0.25 - Math.round(start / 0.25))).toBeLessThan(1e-6);
  });

  test('stops at the animations of the same glyphs, not at those of other glyphs', async ({
    page,
  }) => {
    await openBlockScene(page, [...SAME_GLYPH, appearJson('x', 4, 1, 'fade_in', [3])]);
    // `x` overlaps a1 in time on another glyph: allowed, in a lane of its own.
    await expect(blockLocator(page, 'x')).toHaveAttribute('data-lane', '1');
    await dragBlock(page, 'a1', 6, { shift: true }); // far past d2 [7, 8]
    expect((await blockOf(page, 'a', 'a1')).start).toBeCloseTo(6, 6);
    await dragBlock(page, 'a1', -10, { shift: true });
    expect((await blockOf(page, 'a', 'a1')).start).toBeCloseTo(2, 6);
    await expect(blockLocator(page, 'x')).toHaveAttribute('data-lane', '0'); // alone again
  });

  test('Alt+←/→ nudge the selected block a frame (Shift: five), up to what is in the way', async ({
    page,
  }) => {
    // 60 fps. "=c" is written during [2, 3) and faded out from 3.5: the write can move at most
    // half a second to the right.
    await openBlockScene(
      page,
      [appearJson('w', 2, 1, 'write', [3, 4]), disappearJson('out', 3.5, 1, 'fade_out', [3, 4])],
      { hidden: [3, 4] },
    );
    await blockLocator(page, 'w').click();
    const url = page.url();
    const time = (await uiState(page)).time;
    const start = async () => (await blockOf(page, 'a', 'w')).start;
    await page.keyboard.press('Alt+ArrowRight');
    expect(await start()).toBeCloseTo(2 + 1 / 60, 5);
    await page.keyboard.press('Alt+Shift+ArrowRight');
    expect(await start()).toBeCloseTo(2 + 6 / 60, 5);
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await start()).toBeCloseTo(2 + 5 / 60, 5);
    // The playhead stays, and the browser does not go back.
    expect((await uiState(page)).time).toBe(time);
    expect(page.url()).toBe(url);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Alt+Shift+ArrowRight');
    expect(await start()).toBeCloseTo(2.5, 5);
    // Each nudge is one undo step.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await start()).toBeLessThan(2.5);
  });

  test('the edges resize: the start keeps the end, the end keeps the start', async ({ page }) => {
    await openBlockScene(page, SAME_GLYPH);
    await dragBlock(page, 'a1', 0.5, { edge: 'end', shift: true });
    let block = await blockOf(page, 'a', 'a1');
    expect(block.start).toBe(4);
    expect(block.duration).toBeCloseTo(1.5, 1);
    await dragBlock(page, 'a1', -1, { edge: 'start', shift: true });
    block = await blockOf(page, 'a', 'a1');
    expect(block.start).toBeCloseTo(3, 1);
    expect(block.start + block.duration).toBeCloseTo(5.5, 1);
    // Not past the neighbours: d2 starts at 7, d1 ends at 2.
    await dragBlock(page, 'a1', 5, { edge: 'end', shift: true });
    block = await blockOf(page, 'a', 'a1');
    expect(block.start + block.duration).toBeCloseTo(7, 6);
    await dragBlock(page, 'a1', -9, { edge: 'start', shift: true });
    expect((await blockOf(page, 'a', 'a1')).start).toBeCloseTo(2, 6);
  });

  test('Escape cancels a drag; a locked track cannot be edited; the block still selects', async ({
    page,
  }) => {
    await openBlockScene(page, SAME_GLYPH);
    await dragBlock(page, 'a1', 1, { shift: true, release: false });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect((await blockOf(page, 'a', 'a1')).start).toBe(4);
    expect(await canUndo(page)).toBe(false);

    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.tracks.find((t) => t.id === 't1')!.locked = true;
      });
    });
    await page.evaluate(() => (window as MfeWindow).__mfe!.history.clear());
    await dragBlock(page, 'a1', 1);
    expect((await blockOf(page, 'a', 'a1')).start).toBe(4);
    expect(await canUndo(page)).toBe(false);
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'a1' });
  });

  test('a tween stays between the intro and the outro', async ({ page }) => {
    await openBlockScene(page, [tweenJson('tw', 4, 1)], {
      clip: {
        intro: {
          kind: 'write',
          duration: 1,
          easing: 'linear',
          lagRatio: null,
          shift: [0, 0],
          scale: 1,
        },
        outro: {
          kind: 'fade_out',
          duration: 1,
          easing: 'smooth',
          lagRatio: null,
          shift: [0, 0],
          scale: 1,
        },
      },
    });
    await dragBlock(page, 'tw', -8, { shift: true });
    expect((await blockOf(page, 'a', 'tw')).start).toBeCloseTo(1, 6);
    await dragBlock(page, 'tw', 20, { shift: true });
    expect((await blockOf(page, 'a', 'tw')).start).toBeCloseTo(8, 6);
  });
});

test.describe('animation blocks: clips and tracks keep working', () => {
  test('a clip with stacked blocks still moves between tracks, and its relation arrows follow', async ({
    page,
  }) => {
    await openBlockScene(page, [
      appearJson('w', 1, 2, 'write', [3]),
      disappearJson('fo', 2, 2, 'fade_out', [0]),
    ]);
    const tall = await box(page.getByTestId('track-row-t1'));
    expect(tall.height).toBe(65);
    await moveClip(page, 'a', 0, { toTrack: 't3' });
    expect((await clipOf(page, 'a')).trackId).toBe('t3');
    // The tall clip is now on the last track, the others went back to their height.
    expect((await box(page.getByTestId('track-row-t3'))).height).toBe(65);
    expect((await box(page.getByTestId('track-row-t1'))).height).toBe(46);
    // The blocks went with it.
    expect((await blockOf(page, 'a', 'w')).start).toBe(1);
    await moveClip(page, 'a', 0, { toTrack: 't1' });
    expect((await clipOf(page, 'a')).trackId).toBe('t1');
  });

  test('relation windows are drawn over the lower half of a tall clip, and block the same glyphs', async ({
    page,
  }) => {
    // Relation b → a: glyph 0 of `a` arrives during [2, 3].
    const relation = {
      id: 'r1',
      fromClipId: 'b',
      toClipId: 'a',
      offset: 2,
      duration: 1,
      easing: 'smooth',
      style: 'transform',
      pathArc: 0,
      pairs: [{ from: [0], to: [0], style: null }],
    };
    await openBlockScene(
      page,
      [disappearJson('w1', 5, 1, 'fade_out', [0]), appearJson('w2', 5.5, 1, 'write', [3])],
      { extra: { relations: [relation] }, hidden: [3] },
    );
    await expect(page.getByTestId('track-row-t1')).toHaveCSS('height', '65px');
    const clip = await box(page.getByTestId('clip-a'));
    const band = await box(page.getByTestId('relation-window-r1'));
    // The band covers the lower lane of the clip; the blocks keep the lanes above it.
    expect(band.y).toBeGreaterThan(clip.y + 19 + 10);
    expect(Math.abs(band.y + band.height - (clip.y + clip.height))).toBeLessThan(6);
    const w2 = await box(blockLocator(page, 'w2'));
    expect(w2.y + w2.height).toBeLessThanOrEqual(band.y + 1);
    // `w1` takes glyph 0, which the relation brings until 3 s: it cannot go before that.
    await dragBlock(page, 'w1', -4, { shift: true });
    expect((await blockOf(page, 'a', 'w1')).start).toBeCloseTo(3, 6);
    // A click on the band still selects the relation.
    await page.getByTestId('relation-window-r1').click();
    expect((await uiState(page)).selection).toMatchObject({ kind: 'relation', id: 'r1' });
  });

  test('pressing a block does not move or trim the clip', async ({ page }) => {
    await openBlockScene(page, SAME_GLYPH);
    await dragBlock(page, 'a1', 1);
    const clip = await clipOf(page, 'a');
    expect([clip.start, clip.end, clip.trackId]).toEqual([0, 10, 't1']);
  });
});

/* A right-click on a clip adds an animation where it was clicked when the playhead is off the
 * clip, as here (at the playhead when it is on the clip: timelineMenuPlayhead.spec.ts); a block
 * has its own menu. */
async function rightClickClip(page: import('@playwright/test').Page, t: number): Promise<void> {
  // Clip a ends at 10 s.
  await setTime(page, 11);
  const b = await box(page.getByTestId('clip-a'));
  await page.mouse.click(await timeToX(page, t), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
}

test.describe('animation blocks: add', () => {
  test('a right-click on a clip offers every animation, a submenu per kind, and adds it where clicked', async ({
    page,
  }) => {
    await openBlockScene(page, []);
    await rightClickClip(page, 3);
    const menu = page.getByTestId('add-animation-menu');
    // A short menu: an entry per kind of animation, then the brace, the shape and the line. The
    // entries that open a submenu end in its arrow.
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Appear›',
      'Disappear›',
      'Transform›',
      'Morph within the formula',
      'Emphasis›',
      'Add brace›',
      'Add shape›',
      'Add line›',
      // The clip's own entries, after what is added to it (clipOwnMenu.spec.ts).
      'Intro›',
      'Outro›',
      // Its times, copied and pasted (clipTiming.spec.ts).
      'Timing›',
      'Remove animations',
      'Remove relations',
      // A copy of its formula for it alone, off for a formula's only clip (unlinkFormula.spec.ts).
      'Unlink formula (make a copy)',
      // The clip cut in two at the playhead, off while the playhead is outside it
      // (timelineSplit.spec.ts).
      'Split at playhead (S)',
      // And its lock in the preview (timelineClipLock.spec.ts).
      'Lock in the preview',
    ]);
    await expect(page.getByTestId('add-animation-write')).toHaveCount(0);
    // Each kind that has several animations opens them beside its entry.
    const groups = {
      appear: ['Write', 'Create', 'FadeIn', 'GrowFromCenter', 'DrawBorderThenFill'],
      disappear: ['FadeOut', 'Unwrite', 'Uncreate', 'ShrinkToCenter'],
      transform: ['Whole formula (keyframe)', 'Part of the formula'],
      emphasis: ['Indicate', 'Wiggle', 'Circumscribe', 'Flash', 'FocusOn'],
    };
    for (const [group, items] of Object.entries(groups)) {
      const entry = page.getByTestId(`add-animation-group-${group}`);
      await openSubmenu(page, `add-animation-group-${group}`);
      const submenu = page.getByTestId(`add-animation-group-${group}-submenu`);
      await expect(submenu.getByRole('menuitem')).toHaveText(items);
      const entryBox = (await entry.boundingBox())!;
      const submenuBox = (await submenu.boundingBox())!;
      expect(submenuBox.x).toBeGreaterThanOrEqual(entryBox.x + entryBox.width - 8);
    }
    // One submenu at a time: the one of the entry under the pointer.
    await expect(page.getByTestId('add-animation-group-appear-submenu')).toHaveCount(0);
    await pickAnimation(page, 'fade_out');
    await expect(menu).toHaveCount(0);
    const clip = await clipOf(page, 'a');
    expect(clip.actions).toHaveLength(1);
    expect(clip.actions[0]).toMatchObject({
      kind: 'disappear',
      anim: 'fade_out',
      glyphs: 'all',
      duration: 1,
      easing: 'smooth',
    });
    expect(clip.actions[0]!.start).toBeCloseTo(3, 1);
    // The new block is selected, drawn, and the whole add is one undo step.
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action' });
    await expect(blockLocator(page, clip.actions[0]!.id)).toHaveClass(/is-selected/);
    await undo(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(0);
    expect(await canUndo(page)).toBe(false);
  });

  test('a keyframe takes the clip state at that time; Escape closes the menu', async ({ page }) => {
    await openBlockScene(page, [], {
      clip: {
        initial: {
          position: [2, 1],
          scale: 1.5,
          rotation: 30,
          flipX: false,
          flipY: false,
          opacity: 0.5,
          color: null,
          glyphColors: {},
        },
      },
    });
    await rightClickClip(page, 4);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('add-animation-menu')).toHaveCount(0);
    await rightClickClip(page, 4);
    await pickAnimation(page, 'tween');
    const tween = asTween((await clipOf(page, 'a')).actions[0]);
    expect(tween.start).toBeCloseTo(4, 1);
    expect(tween.to).toMatchObject({ position: [2, 1], scale: 1.5, rotation: 30, opacity: 0.5 });
  });

  test('is moved to the nearest free time when the click is on busy time, and says so when full', async ({
    page,
  }) => {
    await openBlockScene(page, [tweenJson('wall', 2, 6)]);
    await rightClickClip(page, 5);
    await pickAnimation(page, 'tween');
    const tweens = (await clipOf(page, 'a')).actions;
    expect(tweens).toHaveLength(2);
    const added = tweens.find((x) => x.id !== 'wall')!;
    expect(added.start).toBeCloseTo(8, 1); // after the wall, the nearest room for a whole second
    expect(added.duration).toBe(1);
  });

  test('says why when there is no room at all, and changes nothing', async ({ page }) => {
    await openBlockScene(page, [tweenJson('wall', 0, 10)]);
    await rightClickClip(page, 5);
    await pickAnimation(page, 'tween');
    await expect(page.getByTestId('notice')).toContainText('No room for that animation');
    await expect(page.getByTestId('notice')).toContainText('keyframe');
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
    expect(await canUndo(page)).toBe(false);
  });

  test('an Appear has no room while its glyphs are busy all along the clip', async ({ page }) => {
    // Everything fades out for the whole clip, so a Write would bring it back mid-fade anywhere.
    await openBlockScene(page, [disappearJson('gone', 0, 10, 'fade_out', 'all')]);
    await rightClickClip(page, 5);
    await pickAnimation(page, 'write');
    await expect(page.getByTestId('notice')).toContainText('No room for that animation');
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  });

  test('on a locked track the menu adds no animation', async ({ page }) => {
    await openBlockScene(page, []);
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.tracks.find((t) => t.id === 't1')!.locked = true;
      });
    });
    const b = await box(page.getByTestId('clip-a'));
    await page.mouse.click(await timeToX(page, 3), b.y + b.height - 6, { button: 'right' });
    // The menu opens (its timing can be copied), its animations off and saying why.
    await expect(page.getByTestId('add-animation-menu')).toBeVisible();
    const appear = page.getByTestId('add-animation-group-appear');
    await expect(appear).toBeDisabled();
    await expect(appear).toHaveAttribute('title', 'The track of this clip is locked.');
    await expect(page.getByTestId('add-animation-group-transform')).toBeDisabled();
    await page.keyboard.press('Escape');
    expect((await clipOf(page, 'a')).actions).toHaveLength(0);
  });
});

test.describe('animation blocks: menu, duplicate, change, delete', () => {
  test('the block menu changes the animation, keeping what it should', async ({ page }) => {
    await openBlockScene(page, [
      disappearJson('fo', 3, 2, 'fade_out', [1, 2], { shift: [1, 0], scale: 2, easing: 'linear' }),
    ]);
    await blockLocator(page, 'fo').click({ button: 'right' });
    await expect(page.getByTestId('block-menu')).toBeVisible();
    await expect(page.getByTestId('block-menu-change-fade_out')).toHaveClass(/is-current/);
    // The choices are radio items: the current one is checked, the others are not.
    const current = page.getByTestId('block-menu-change-fade_out');
    await expect(current).toHaveRole('menuitemradio');
    await expect(current).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('block-menu-change-unwrite')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect((await uiState(page)).selection).toMatchObject({ actionId: 'fo' });
    // Within the family: easing back to the default of the new animation.
    await page.getByTestId('block-menu-change-unwrite').click();
    expect(await blockOf(page, 'a', 'fo')).toMatchObject({
      kind: 'disappear',
      anim: 'unwrite',
      start: 3,
      duration: 2,
      glyphs: [1, 2],
      easing: 'linear', // Unwrite's own default
      shift: [0, 0],
      scale: 1,
      lagRatio: null,
    });
    // Across families: keeps start, duration and glyphs.
    await blockLocator(page, 'fo').click({ button: 'right' });
    await page.getByTestId('block-menu-change-fade_in').click();
    expect(await blockOf(page, 'a', 'fo')).toMatchObject({
      id: 'fo',
      kind: 'appear',
      anim: 'fade_in',
      start: 3,
      duration: 2,
      glyphs: [1, 2],
      easing: 'smooth',
    });
    await expect(blockLocator(page, 'fo')).toHaveClass(/is-appear/);
    await expect(blockLocator(page, 'fo')).toHaveText('FadeIn · 2');
    await undo(page);
    expect((await blockOf(page, 'a', 'fo')).kind).toBe('disappear');
  });

  test('duplicate puts the copy in the next free time after the block and selects it', async ({
    page,
  }) => {
    await openBlockScene(page, [
      appearJson('w', 2, 1.5, 'write', [3]),
      appearJson('next', 3.5, 1, 'create', [3]),
    ]);
    await blockLocator(page, 'w').click({ button: 'right' });
    await page.getByTestId('block-menu-duplicate').click();
    const blocks = (await clipOf(page, 'a')).actions;
    expect(blocks).toHaveLength(3);
    const copy = blocks.find((x) => !['w', 'next'].includes(x.id))!;
    // Glyph 3 is already on screen after `w`, so the copy fits right after it, in the free 0.0 s…
    expect(copy).toMatchObject({ kind: 'appear', anim: 'write', glyphs: [3], duration: 1.5 });
    expect(copy.start).toBeGreaterThanOrEqual(3.5 - 1e-6);
    expect((await uiState(page)).selection).toMatchObject({ actionId: copy.id });
    await undo(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(2);
  });

  test('Delete asks for a held confirmation and can be undone', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 2, 1.5, 'write', [3])]);
    await blockLocator(page, 'w').click();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('dialog')).toBeVisible();
    await expect(page.getByTestId('dialog')).toContainText('Write · 1');
    // A plain click is not enough…
    await page.getByTestId('dialog-confirm').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
    // …cancelling keeps the block…
    await page.getByTestId('dialog-cancel').click();
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
    // …holding it deletes the block, and the selection returns to the clip.
    await page.keyboard.press('Backspace');
    await holdToConfirm(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(0);
    expect((await uiState(page)).selection).toEqual({ kind: 'clips', ids: ['a'] });
    await undo(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  });

  test('the menu deletes with the same confirmation; a locked track keeps its blocks', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 2, 1.5, 'write', [3])]);
    await blockLocator(page, 'w').click({ button: 'right' });
    await page.getByTestId('block-menu-delete').click();
    await holdToConfirm(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(0);
    await undo(page);

    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.tracks.find((t) => t.id === 't1')!.locked = true;
      });
    });
    await blockLocator(page, 'w').click();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('dialog')).toHaveCount(0);
    await blockLocator(page, 'w').click({ button: 'right' });
    await expect(page.getByTestId('block-menu')).toHaveCount(0);
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  });

  test('Ctrl+D duplicates the selected block', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 2, 1, 'write', [3])]);
    await blockLocator(page, 'w').click();
    await page.keyboard.press('ControlOrMeta+d');
    expect((await clipOf(page, 'a')).actions).toHaveLength(2);
  });
});

/* The Animations panel of a selected block. Formula `fa` a+b=c: glyphs 0 a, 1 +, 2 b, 3 =, 4 c. */
const panel = (page: import('@playwright/test').Page) => page.getByTestId('block-properties');
const glyph = (page: import('@playwright/test').Page, index: number) =>
  page.getByTestId(`block-glyph-${index}`);

async function selectBlock(page: import('@playwright/test').Page, id: string): Promise<void> {
  await blockLocator(page, id).click();
  await expect(panel(page)).toBeVisible();
}

test.describe('animation blocks: panel', () => {
  test('shows the formula, the block and its animation, and changes the animation', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 2, 1.5, 'write', [3, 4])], { hidden: [3, 4] });
    await selectBlock(page, 'w');
    await expect(page.getByTestId('block-title')).toContainText('f1');
    await expect(page.getByTestId('block-name')).toHaveText('Write · 2');
    await expect(page.getByTestId('block-anim')).toHaveValue('appear:write');
    // Grouped select: Appear and Disappear animations.
    await expect(page.getByTestId('block-anim').locator('optgroup')).toHaveCount(2);
    await page.getByTestId('block-anim').selectOption('appear:fade_in');
    expect(await blockOf(page, 'a', 'w')).toMatchObject({ anim: 'fade_in', easing: 'smooth' });
    await expect(page.getByTestId('block-name')).toHaveText('FadeIn · 2');
    // FadeIn has shift and scale fields.
    await page.getByTestId('block-shift-x').fill('1.5');
    await page.getByTestId('block-shift-x').press('Enter');
    expect(await blockOf(page, 'a', 'w')).toMatchObject({ shift: [1.5, 0] });
    await page.getByTestId('block-anim').selectOption('disappear:unwrite');
    expect(await blockOf(page, 'a', 'w')).toMatchObject({
      kind: 'disappear',
      anim: 'unwrite',
      glyphs: [3, 4],
    });
    await expect(page.getByTestId('block-shift-x')).toHaveCount(0);
    await page.getByTestId('block-select-clip').click();
    await expect(page.getByTestId('clip-properties')).toBeVisible();
  });

  test('timing fields clamp to the allowed range, like the timeline', async ({ page }) => {
    await openBlockScene(page, SAME_GLYPH);
    await selectBlock(page, 'a1'); // between d1 (ends 2) and d2 (starts 7)
    const start = page.getByTestId('block-start');
    await expect(start).toHaveValue('4');
    await start.fill('9');
    await start.press('Enter');
    expect((await blockOf(page, 'a', 'a1')).start).toBeCloseTo(6, 6); // 1 s long, ends at 7
    await start.fill('0');
    await start.press('Enter');
    expect((await blockOf(page, 'a', 'a1')).start).toBeCloseTo(2, 6);
    const duration = page.getByTestId('block-duration');
    await duration.fill('30');
    await duration.press('Enter');
    expect((await blockOf(page, 'a', 'a1')).duration).toBeCloseTo(5, 6); // up to d2
    await duration.fill('0.5');
    await duration.press('Enter');
    expect((await blockOf(page, 'a', 'a1')).duration).toBe(0.5);
    await page.getByTestId('block-easing').selectOption('linear');
    expect(await blockOf(page, 'a', 'a1')).toMatchObject({ easing: 'linear' });
    // Lag ratio: Manim's default, or a number.
    await expect(page.getByTestId('block-lag-mode')).toHaveValue('auto');
    await expect(page.getByTestId('block-lag')).toBeDisabled();
    await page.getByTestId('block-lag-mode').selectOption('custom');
    const lag = page.getByTestId('block-lag');
    await lag.fill('0.4');
    await lag.press('Enter');
    expect((await blockOf(page, 'a', 'a1')) as { lagRatio: number }).toMatchObject({
      lagRatio: 0.4,
    });
    await page.getByTestId('block-lag-mode').selectOption('auto');
    expect(await blockOf(page, 'a', 'a1')).toMatchObject({ lagRatio: null });
  });

  test('every edit of a block undoes and redoes', async ({ page }) => {
    await openBlockScene(page, SAME_GLYPH);
    await selectBlock(page, 'a1');
    const duration = page.getByTestId('block-duration');
    await duration.fill('2');
    await duration.press('Enter');
    await page.getByTestId('block-easing').selectOption('linear');
    expect(await blockOf(page, 'a', 'a1')).toMatchObject({ duration: 2, easing: 'linear' });
    await undo(page);
    expect(await blockOf(page, 'a', 'a1')).toMatchObject({ duration: 2, easing: 'smooth' });
    await undo(page);
    expect(await blockOf(page, 'a', 'a1')).toMatchObject({ duration: 1 });
    await page.evaluate(() => (window as MfeWindow).__mfe!.history.redo());
    expect(await blockOf(page, 'a', 'a1')).toMatchObject({ duration: 2 });
  });

  test('a tween keeps its editor, and a part transform just says it comes later', async ({
    page,
  }) => {
    await openBlockScene(page, [tweenJson('tw', 3, 1)]);
    await selectBlock(page, 'tw');
    await expect(page.getByTestId('tween-tw')).toBeVisible();
    await page.getByTestId('tween-tw-rotation').fill('45');
    await page.getByTestId('tween-tw-rotation').press('Enter');
    expect(asTween((await clipOf(page, 'a')).actions[0]).to).toMatchObject({ rotation: 45 });
    // Deleting from the panel asks for the held confirmation too.
    await page.getByTestId('block-delete').click();
    await holdToConfirm(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(0);

    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.clips
          .find((c) => c.id === 'a')!
          .actions.push({
            id: 'pt',
            kind: 'transform',
            start: 2,
            duration: 1,
            easing: 'smooth',
            glyphs: [1, 2],
            shift: [1, 0],
            scale: 1,
            rotation: 0,
            color: null,
            opacity: null,
          });
      });
    });
    await expect(blockLocator(page, 'pt')).toHaveText('Transform · 2');
    await expect(blockLocator(page, 'pt')).toHaveClass(/is-transform/);
    await selectBlock(page, 'pt');
    // Its panel: the relative fields, no lag ratio, and the glyphs it names.
    await expect(page.getByTestId('block-part-shift-x')).toHaveValue('1');
    await expect(page.getByTestId('block-lag-mode')).toHaveCount(0);
    await expect(page.getByTestId('block-glyphs-summary')).toHaveText('2 glyphs: 1, 2');
    await page.getByTestId('block-part-rotation').fill('45');
    await page.getByTestId('block-part-rotation').press('Enter');
    await page.getByTestId('block-part-color-on').click();
    expect((await clipOf(page, 'a')).actions[0]).toMatchObject({ rotation: 45, color: '#FFFFFF' });
    // It moves and deletes like any block.
    await dragBlock(page, 'pt', 1, { shift: true });
    expect((await clipOf(page, 'a')).actions[0]!.start).toBeCloseTo(3, 1);
    // A Transform block can be the whole formula (a keyframe) or a part, and back.
    await page.getByTestId('block-kind-tween').click();
    expect((await clipOf(page, 'a')).actions[0]).toMatchObject({ id: 'pt', kind: 'tween' });
    await expect(page.getByTestId('block-kind-tween')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('block-kind-transform').click();
    expect((await clipOf(page, 'a')).actions[0]).toMatchObject({ kind: 'transform', glyphs: [] });
    await expect(page.getByTestId('block-issues')).toContainText('animates no glyph');
    await page.getByTestId('block-glyphs-on-screen').click();
    expect(
      ((await clipOf(page, 'a')).actions[0] as unknown as { glyphs: number[] }).glyphs.length,
    ).toBeGreaterThan(0);
  });

  test('adds a transform of a part from the clip menu', async ({ page }) => {
    await openBlockScene(page, []);
    await rightClickClip(page, 3);
    await pickAnimation(page, 'transform');
    const action = (await clipOf(page, 'a')).actions[0] as unknown as {
      kind: string;
      glyphs: number[];
      start: number;
    };
    expect(action).toMatchObject({ kind: 'transform', glyphs: [] });
    expect(action.start).toBeCloseTo(3, 1);
    await expect(page.getByTestId('block-properties')).toBeVisible();
    await expect(page.getByTestId('block-kind-transform')).toHaveAttribute('aria-pressed', 'true');
  });

  test('lists the problems of the block: glyphs it leaves out', async ({ page }) => {
    // Glyph 0 is on screen when the Write starts (an earlier FadeIn brought it): it is left out,
    // with a warning.
    await openBlockScene(
      page,
      [appearJson('first', 1, 0.5, 'fade_in', [0]), appearJson('w', 2, 1, 'write', [0, 3])],
      { hidden: [3] },
    );
    await selectBlock(page, 'w');
    await expect(page.getByTestId('block-issues')).toContainText('leaves out glyph 0');
    // Only a warning: a notice under Warnings, not a problem (D177).
    const section = page.getByTestId('block-issues-section');
    await expect(section).toHaveAttribute('data-tone', 'warnings');
    await expect(section.locator('h3')).toHaveText('Warnings');
  });

  test('lists the problems of the block: an overlap is an error on the later block', async ({
    page,
  }) => {
    await openBlockScene(page, [
      disappearJson('d', 2, 2, 'fade_out', [1]),
      appearJson('w', 3, 1, 'write', [1]),
    ]);
    await selectBlock(page, 'w');
    await expect(page.getByTestId('block-issues')).toContainText('at the same time');
    await expect(page.getByTestId('block-issues').locator('.is-error')).toHaveCount(1);
    // An error: the section stays Problems, in red (D177).
    const section = page.getByTestId('block-issues-section');
    await expect(section).toHaveAttribute('data-tone', 'problems');
    await expect(section.locator('h3')).toHaveText('Problems');
  });

  test('a locked track shows the panel read-only', async ({ page }) => {
    await openBlockScene(page, SAME_GLYPH);
    await selectBlock(page, 'a1');
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.tracks.find((t) => t.id === 't1')!.locked = true;
      });
    });
    await expect(page.getByTestId('block-locked')).toBeVisible();
    await expect(page.getByTestId('block-duration')).toBeDisabled();
    await expect(page.getByTestId('block-glyphs-all')).toBeDisabled();
  });
});

test.describe('animation blocks: glyph picker', () => {
  test('"All" shows every glyph selected; clicks make an explicit ascending list', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 2, 1, 'write', 'all')], { hidden: [3, 4] });
    await selectBlock(page, 'w');
    await expect(page.getByTestId('block-glyphs-all')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('block-glyphs-summary')).toHaveText('All glyphs');
    for (let i = 0; i < 5; i++)
      await expect(glyph(page, i)).toHaveAttribute('data-selected', 'true');

    await glyph(page, 3).click();
    expect(((await blockOf(page, 'a', 'w')) as { glyphs: unknown }).glyphs).toEqual([3]);
    await expect(page.getByTestId('block-glyphs-all')).toHaveAttribute('aria-pressed', 'false');
    await glyph(page, 1).click({ modifiers: ['ControlOrMeta'] });
    expect(((await blockOf(page, 'a', 'w')) as { glyphs: unknown }).glyphs).toEqual([1, 3]);
    await glyph(page, 4).click({ modifiers: ['ControlOrMeta'] });
    await glyph(page, 1).click({ modifiers: ['ControlOrMeta'] }); // toggled off again
    expect(((await blockOf(page, 'a', 'w')) as { glyphs: unknown }).glyphs).toEqual([3, 4]);
    await expect(page.getByTestId('block-glyphs-summary')).toHaveText('2 glyphs: 3, 4');
    await expect(blockLocator(page, 'w')).toHaveText('Write · 2');
    // Shift: a range from the last clicked glyph.
    await glyph(page, 0).click();
    await glyph(page, 2).click({ modifiers: ['Shift'] });
    expect(((await blockOf(page, 'a', 'w')) as { glyphs: unknown }).glyphs).toEqual([0, 1, 2]);
    // The background does nothing; undo goes back one choice at a time.
    await undo(page);
    expect(((await blockOf(page, 'a', 'w')) as { glyphs: unknown }).glyphs).toEqual([0]);
    await undo(page);
    expect(((await blockOf(page, 'a', 'w')) as { glyphs: unknown }).glyphs).toEqual([3, 4]);
  });

  test('glyphs that are not on screen when the block starts are drawn faint', async ({ page }) => {
    // 3 and 4 are hidden at the start; the Write at 2 s brings them. Another block, later, sees
    // them on screen.
    await openBlockScene(
      page,
      [appearJson('w', 2, 1, 'write', [3, 4]), disappearJson('fo', 5, 1, 'fade_out', 'all')],
      { hidden: [3, 4] },
    );
    await selectBlock(page, 'w');
    for (const i of [0, 1, 2]) await expect(glyph(page, i)).toHaveAttribute('data-dimmed', 'false');
    for (const i of [3, 4]) await expect(glyph(page, i)).toHaveAttribute('data-dimmed', 'true');
    await selectBlock(page, 'fo');
    for (let i = 0; i < 5; i++)
      await expect(glyph(page, i)).toHaveAttribute('data-dimmed', 'false');
    // Moved after the FadeOut, the Write no longer brings glyphs 3 and 4 before it: the FadeOut
    // then leaves them out, and they are faint in its view.
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.clips.find((c) => c.id === 'a')!.actions.find((x) => x.id === 'w')!.start = 7;
      });
    });
    await selectBlock(page, 'fo');
    for (const i of [3, 4]) await expect(glyph(page, i)).toHaveAttribute('data-dimmed', 'true');
  });

  test('a block cannot be dragged past an animation of the glyphs it brings', async ({ page }) => {
    // The FadeOut at 5 s takes glyphs 3 and 4, which the Write brings: it stays before it.
    await openBlockScene(
      page,
      [appearJson('w', 2, 1, 'write', [3, 4]), disappearJson('fo', 5, 1, 'fade_out', 'all')],
      { hidden: [3, 4] },
    );
    await dragBlock(page, 'w', 5, { shift: true });
    const w = await blockOf(page, 'a', 'w');
    expect(w.start + w.duration).toBeLessThanOrEqual(5 + 1e-6);
    expect(w.start).toBeGreaterThan(3.9);
  });

  test('the quick buttons pick all, not on screen, on screen and hidden at the start', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 2, 1, 'write', [0])], { hidden: [3, 4] });
    await selectBlock(page, 'w');
    const glyphsOf = async () => ((await blockOf(page, 'a', 'w')) as { glyphs: unknown }).glyphs;
    // Glyph 0 waits for the block and 3 and 4 are hidden at the start: none is on screen.
    await page.getByTestId('block-glyphs-off-screen').click();
    expect(await glyphsOf()).toEqual([0, 3, 4]);
    await expect(page.getByTestId('block-glyphs-off-screen')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('block-glyphs-on-screen').click();
    expect(await glyphsOf()).toEqual([1, 2]);
    await page.getByTestId('block-glyphs-hidden').click();
    expect(await glyphsOf()).toEqual([3, 4]);
    await page.getByTestId('block-glyphs-all').click();
    expect(await glyphsOf()).toBe('all');
    await expect(page.getByTestId('block-glyphs-all')).toHaveAttribute('aria-pressed', 'true');
    await undo(page);
    expect(await glyphsOf()).toEqual([3, 4]);
  });

  test('a box dragged over the glyphs selects them, as one undo step', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 2, 1, 'write', [4])]);
    await selectBlock(page, 'w');
    const view = await box(page.locator('[data-testid="block-glyph-picker"] svg'));
    const g0 = await box(glyph(page, 0));
    const g1 = await box(glyph(page, 1));
    // From the empty top-left corner over glyphs 0 and 1 (a and +).
    const from = { x: view.x + 4, y: view.y + 4 };
    const to = { x: g1.x + g1.width - 2, y: g0.y + g0.height - 2 };
    await page.evaluate(() => (window as MfeWindow).__mfe!.history.clear());
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(page.getByTestId('block-glyph-marquee')).toBeVisible();
    await page.mouse.up();
    const glyphs = ((await blockOf(page, 'a', 'w')) as { glyphs: number[] }).glyphs;
    expect(glyphs).toEqual(expect.arrayContaining([0, 1]));
    expect(glyphs).not.toContain(4);
    await undo(page);
    expect(((await blockOf(page, 'a', 'w')) as { glyphs: unknown }).glyphs).toEqual([4]);
    expect(await canUndo(page)).toBe(false); // the drag was one step
  });

  test('the clip lists its blocks: a row selects the block, tweens keep their editor', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 2, 1, 'write', [3]), tweenJson('tw', 5, 1)]);
    await page.getByTestId('clip-a').click({ position: { x: 20, y: 30 } });
    await page.getByTestId('animations-tab-timing').click();
    await expect(page.getByTestId('block-row-w')).toContainText('Write · 1');
    await expect(page.getByTestId('block-row-w')).toContainText('2.00 s → 3.00 s');
    await expect(page.getByTestId('tween-tw')).toBeVisible();
    await page.getByTestId('block-row-w').click();
    await expect(panel(page)).toBeVisible();
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'w' });
  });

  test('the panel adds an animation at the playhead with the same menu', async ({ page }) => {
    await openBlockScene(page, []);
    await page.getByTestId('clip-a').click({ position: { x: 20, y: 30 } });
    await page.getByTestId('animations-tab-timing').click();
    await setTime(page, 6);
    await page.getByTestId('add-animation').click();
    await expect(page.getByTestId('add-animation-menu')).toBeVisible();
    await pickAnimation(page, 'unwrite');
    const added = (await clipOf(page, 'a')).actions[0]!;
    expect(added).toMatchObject({ kind: 'disappear', anim: 'unwrite', glyphs: 'all' });
    expect(added.start).toBeCloseTo(6, 2);
    await expect(panel(page)).toBeVisible(); // the new block is selected
    // No room: the notice is in the panel.
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        const clip = d.clips.find((c) => c.id === 'a')!;
        clip.actions.splice(0, 1, {
          id: 'wall',
          kind: 'tween',
          start: 0,
          duration: 10,
          easing: 'smooth',
          to: { rotation: 5 },
        });
      });
    });
    await page.getByTestId('clip-a').click({ position: { x: 20, y: 30 } });
    await page.getByTestId('add-animation').click();
    await pickAnimation(page, 'tween');
    await expect(page.getByTestId('clip-notice')).toContainText('no free time');
  });
});

test('timeline blocks are named buttons reached from their clip; link ports are pointer-only', async ({
  page,
}) => {
  await openBlockScene(page, [appearJson('w', 1, 2, 'write', [3])]);
  // A block is reached with ↑ from its clip (timelineKeyboard.spec.ts), never with Tab alone.
  await expect(blockLocator(page, 'w')).toHaveAttribute('role', 'button');
  await expect(blockLocator(page, 'w')).toHaveAttribute('aria-label', 'Write · 1, 1.00 to 3.00 s');
  await expect(blockLocator(page, 'w')).toHaveAttribute('tabindex', '-1');
  await expect(page.getByTestId('clip-a')).toHaveAttribute('tabindex', '0');
  await page.keyboard.down('Shift');
  const port = page.getByTestId('clip-a-link');
  await expect(port).toBeVisible();
  await expect(port).toHaveAttribute('aria-hidden', 'true');
  await expect(port).not.toHaveAttribute('role');
  await page.keyboard.up('Shift');
  // The panels are the accessible way: the block list and "Create relation…".
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'clips', ids: ['a'] }),
  );
  await page.getByTestId('animations-tab-timing').click();
  await expect(page.getByRole('button', { name: /Write/ }).first()).toBeVisible();
});

test.describe('animation blocks: an Appear keeps its glyphs off screen until it runs', () => {
  test('a Write block at the start brings every glyph in, without hiding them first', async ({
    page,
  }) => {
    await openBlockScene(page, [appearJson('w', 1, 2, 'write', 'all')]);
    const drawables = async () =>
      Number(await page.getByTestId('preview-frame').getAttribute('data-drawable-count'));
    // Clip `a` starts at 0 with an instant intro, but every glyph waits for the Write block at 1 s.
    await setTime(page, 0.5);
    await expect.poll(drawables).toBe(0);
    await setTime(page, 1.5); // being written (the lag keeps some glyphs for later)
    await expect.poll(drawables).toBeGreaterThan(0);
    await setTime(page, 3.5); // written; clip `b` is on screen too by then
    await expect.poll(drawables).toBeGreaterThanOrEqual(5);
    // The block animates every glyph: nothing to warn about.
    await blockLocator(page, 'w').click();
    await expect(page.getByTestId('block-issues').getByRole('listitem')).toHaveCount(0);
  });

  test('the clip warns that its intro has nothing left to animate', async ({ page }) => {
    const write = {
      kind: 'write',
      duration: 1,
      easing: 'linear',
      lagRatio: null,
      shift: [0, 0],
      scale: 1,
    };
    await openBlockScene(page, [appearJson('w', 0, 1.5, 'write', 'all')], {
      clip: { intro: write as never },
    });
    await page.getByTestId('clip-a').click();
    await expect(page.getByTestId('clip-issues')).toContainText(
      /The Write intro of ".*" animates no glyph: its glyphs wait for Appear blocks\./,
    );
    // Leave the intro some glyphs and the warning goes.
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        const action = d.clips.find((c) => c.id === 'a')!.actions[0]!;
        if (action.kind === 'appear') action.glyphs = [3, 4];
      });
    });
    await expect(page.getByTestId('clip-issues')).toHaveCount(0);
  });
});
