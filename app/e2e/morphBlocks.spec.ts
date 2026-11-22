import { expect, test, type Page } from './test';
import {
  appearJson,
  blockLocator,
  blockOf,
  disappearJson,
  dragBlock,
  morphJson,
  openBlockScene,
  partJson,
  tweenJson,
} from './blockHelpers';
import { holdToConfirm, type MfeWindow } from './helpers';
import { box, canUndo, clipOf, setTime, timeToX, uiState, undo } from './timelineHelpers';

/* Morph blocks within the formula on the timeline. Formula `fa` is a+b=c (glyphs 0 a, 1 +, 2 b,
 * 3 =, 4 c) on clip `a` [0, 10] of track 1, without intro or outro. */

/** a → c and + → =: copies, so the sources stay; the targets arrive through the block. */
const PAIRS = [
  { from: [0], to: [4], style: null },
  { from: [1], to: [3], style: null },
];

/** Right-click clip a at time `t`, the playhead off the clip: the menu adds there (D171). */
async function rightClickClip(page: Page, t: number): Promise<void> {
  await setTime(page, 11);
  const b = await box(page.getByTestId('clip-a'));
  await page.mouse.click(await timeToX(page, t), b.y + b.height - 6, { button: 'right' });
  await expect(page.getByTestId('add-animation-menu')).toBeVisible();
}

async function morphRequest(page: Page) {
  return page.evaluate(() => (window as MfeWindow).__mfe!.useMorphEditorStore.getState().request);
}

test.describe('morph blocks: add and draw', () => {
  test('the clip menu adds a Morph block within the formula where clicked, with no pairs', async ({
    page,
  }) => {
    await openBlockScene(page, [disappearJson('gone', 1, 8, 'fade_out', 'all')]);
    await rightClickClip(page, 4);
    const menu = page.getByTestId('add-animation-menu');
    await expect(menu).toContainText('Morph');
    // Morph has one animation: it is an entry of the menu itself, not a submenu.
    await expect(menu.getByTestId('add-animation-morph')).toHaveText('Morph within the formula');
    await menu.getByTestId('add-animation-morph').click();
    await expect(menu).toHaveCount(0);
    const added = (await clipOf(page, 'a')).actions.find((x) => x.id !== 'gone')!;
    // With no pairs it animates nothing yet, so the FadeOut of every glyph is not in its way.
    expect(added).toMatchObject({
      kind: 'morph',
      duration: 1,
      easing: 'smooth',
      style: 'copy',
      pathArc: 0,
      pairs: [],
    });
    expect(added.start).toBeCloseTo(4, 1);
    const block = blockLocator(page, added.id);
    await expect(block).toHaveClass(/is-morph/);
    await expect(block).toHaveClass(/is-selected/);
    await expect(block).toHaveText('Morph · 0');
    await expect(block).toHaveAttribute('title', /^Morph within the formula \(0 pairs\)/);
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: added.id });
    await undo(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
    expect(await canUndo(page)).toBe(false);
  });

  test('a morph block has a colour of its own, readable in both themes', async ({ page }) => {
    await openBlockScene(
      page,
      [
        appearJson('w', 1, 1, 'write', [2]),
        tweenJson('tw', 2.5, 1),
        morphJson('m', 4, 1.5, PAIRS),
        disappearJson('fo', 7, 1, 'fade_out', 'all'),
      ],
      { hidden: [2] },
    );
    await expect(blockLocator(page, 'm')).toHaveText('Morph · 2');
    await expect(blockLocator(page, 'm')).toHaveAttribute(
      'title',
      /^Morph within the formula \(2 pairs\)\n4\.00 s → 5\.50 s · 1\.50 s$/,
    );
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByTestId('theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const colours = await page.evaluate(() => {
        const rgb = (text: string) =>
          text
            .match(/\d+(\.\d+)?/g)!
            .slice(0, 3)
            .map(Number);
        const style = (id: string) => {
          const s = getComputedStyle(document.querySelector(`[data-testid="action-block-${id}"]`)!);
          return { bg: rgb(s.backgroundColor), fg: rgb(s.color) };
        };
        return { w: style('w'), tw: style('tw'), m: style('m'), fo: style('fo') };
      });
      const luminance = ([r, g, b]: number[]) => {
        const lin = (c: number) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
      };
      const contrast = (a: number[], b: number[]) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi! + 0.05) / (lo! + 0.05);
      };
      const hue = ([r, g, b]: number[]) => {
        const max = Math.max(r!, g!, b!);
        const d = max - Math.min(r!, g!, b!);
        const h = max === r ? (g! - b!) / d : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
        return (h * 60 + 360) % 360;
      };
      const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
      // The label reads on the block (WCAG AA for small text)…
      expect(contrast(colours.m.bg, colours.m.fg)).toBeGreaterThan(4.5);
      // …and the hue is clearly not the one of Appear, Disappear or Transform.
      for (const other of [colours.w, colours.tw, colours.fo]) {
        expect(apart(hue(colours.m.bg), hue(other.bg))).toBeGreaterThan(30);
      }
    }
  });
});

test.describe('morph blocks: menu', () => {
  test('Edit pairs… comes first and opens the pair editor; there is no animation to change', async ({
    page,
  }) => {
    await openBlockScene(page, [morphJson('m', 3, 1, PAIRS)]);
    await blockLocator(page, 'm').click({ button: 'right' });
    const menu = page.getByTestId('block-menu');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('block-menu-header')).toHaveText('Morph · 2');
    await expect(menu.getByRole('menuitem').first()).toHaveAttribute(
      'data-testid',
      'block-menu-pairs',
    );
    await expect(page.getByTestId('block-menu-pairs')).toHaveText('Edit pairs…');
    await expect(menu.locator('[data-testid^="block-menu-change-"]')).toHaveCount(0);
    await expect(menu).not.toContainText('Change animation');
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'm' });
    expect(await morphRequest(page)).toBeNull();
    await page.getByTestId('block-menu-pairs').click();
    await expect(menu).toHaveCount(0);
    expect(await morphRequest(page)).toEqual({ clipId: 'a', actionId: 'm' });
    // Nothing changed in the project.
    expect(await canUndo(page)).toBe(false);
  });

  // The block that opens the editor has the focus, and the editor opens over the timeline. Its
  // Link button, the control it used to give the focus to, is disabled until something is
  // selected: the focus stayed on the block, and the arrows, Delete and Enter went on acting on
  // the timeline behind the dialog.
  test('the pair editor takes the focus: the keys no longer act on the timeline behind it', async ({
    page,
  }) => {
    await openBlockScene(page, [morphJson('m', 3, 1, PAIRS)]);
    const editor = page.getByTestId('morph-editor');
    const focusInside = () => editor.evaluate((dialog) => dialog.contains(document.activeElement));

    await blockLocator(page, 'm').click({ button: 'right' });
    await page.getByTestId('block-menu-pairs').click();
    await expect(editor).toBeVisible();
    await expect(page.getByTestId('morph-link')).toBeDisabled();
    expect(await focusInside()).toBe(true);
    for (const key of ['ArrowRight', 'ArrowDown', 'Alt+ArrowRight', 'Delete', 'Enter']) {
      await page.keyboard.press(key);
    }
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'm' });
    expect(await blockOf(page, 'a', 'm')).toMatchObject({ start: 3, duration: 1 });
    expect(await canUndo(page)).toBe(false);
    await expect(page.getByTestId('formula-editor')).toHaveCount(0);
    await expect(editor).toBeVisible();

    // The same from the panel's button, which has the focus when it is pressed.
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await blockLocator(page, 'm').click();
    await page.getByTestId('block-morph-pairs').click();
    await expect(editor).toBeVisible();
    expect(await focusInside()).toBe(true);
  });

  test('other blocks have no Edit pairs…', async ({ page }) => {
    await openBlockScene(page, [appearJson('w', 2, 1, 'write', [3])]);
    await blockLocator(page, 'w').click({ button: 'right' });
    await expect(page.getByTestId('block-menu')).toBeVisible();
    await expect(page.getByTestId('block-menu-pairs')).toHaveCount(0);
    await expect(page.getByTestId('block-menu-duplicate')).toHaveText('Duplicate');
  });

  test('duplicating copies the settings but not the pairs, and says so', async ({ page }) => {
    await openBlockScene(page, [
      morphJson('m', 3, 1.5, PAIRS, { style: 'fade', pathArc: 90, easing: 'linear' }),
    ]);
    await blockLocator(page, 'm').click({ button: 'right' });
    await expect(page.getByTestId('block-menu-duplicate')).toHaveText('Duplicate without pairs');
    await page.getByTestId('block-menu-duplicate').click();
    const blocks = (await clipOf(page, 'a')).actions;
    expect(blocks).toHaveLength(2);
    const copy = blocks.find((x) => x.id !== 'm')!;
    expect(copy).toMatchObject({
      kind: 'morph',
      start: 4.5, // right after the original
      duration: 1.5,
      easing: 'linear',
      style: 'fade',
      pathArc: 90,
      pairs: [],
    });
    expect((await blockOf(page, 'a', 'm')) as unknown).toMatchObject({ pairs: PAIRS });
    await expect(blockLocator(page, copy.id)).toHaveText('Morph · 0');
    expect((await uiState(page)).selection).toMatchObject({ actionId: copy.id });
    await undo(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  });

  test('a copy that does not fit before the clip ends is refused with a reason', async ({
    page,
  }) => {
    await openBlockScene(page, [morphJson('m', 8.5, 1, PAIRS)]);
    await blockLocator(page, 'm').click();
    await page.keyboard.press('ControlOrMeta+d');
    await expect(page.getByTestId('notice')).toContainText('No room for that animation');
    await expect(page.getByTestId('notice')).toContainText(
      'no room after it for a Morph block: the clip ends less than 1.00 s after it',
    );
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  });

  test('Delete… asks for a held confirmation, naming the block', async ({ page }) => {
    await openBlockScene(page, [morphJson('m', 3, 1, PAIRS)]);
    await blockLocator(page, 'm').click({ button: 'right' });
    await page.getByTestId('block-menu-delete').click();
    await expect(page.getByTestId('dialog')).toContainText('Morph · 2');
    await holdToConfirm(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(0);
    await undo(page);
    expect((await clipOf(page, 'a')).actions).toHaveLength(1);
  });
});

test.describe('morph blocks: panel', () => {
  test('shows the style, the path arc, the pairs and the timing of the selected morph', async ({
    page,
  }) => {
    await openBlockScene(page, [
      morphJson('m', 3, 1.5, [PAIRS[0]!, { from: [1], to: [3], style: 'transform' }]),
    ]);
    await blockLocator(page, 'm').click();
    const panel = page.getByTestId('block-properties');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('block-name')).toHaveText('Morph · 2');
    await expect(page.getByTestId('block-name')).toHaveClass(/is-morph/);
    await expect(page.getByTestId('block-morph-hint')).toContainText(
      'as the next line of a derivation grows out of the previous one',
    );
    // The pairs, by their glyphs; the second has a style of its own.
    await expect(page.getByTestId('block-morph-pair-0')).toContainText('a → c');
    await expect(page.getByTestId('block-morph-pair-1')).toContainText('+ → =');
    await expect(page.getByTestId('block-morph-pair-1')).toContainText('Transform');
    await expect(page.getByTestId('block-morph-pair-0-style')).toHaveCount(0);

    await page.getByTestId('block-morph-style').selectOption('transform');
    expect(await blockOf(page, 'a', 'm')).toMatchObject({ style: 'transform' });
    const arc = page.getByTestId('block-morph-path-arc');
    await arc.fill('-90');
    await arc.press('Enter');
    expect(await blockOf(page, 'a', 'm')).toMatchObject({ pathArc: -90 });
    await arc.press('ArrowDown');
    expect(await blockOf(page, 'a', 'm')).toMatchObject({ pathArc: -105 });

    // Timing: no lag ratio, shift or scale.
    await expect(page.getByTestId('block-start')).toHaveValue('3');
    await expect(page.getByTestId('block-duration')).toHaveValue('1.5');
    await expect(page.getByTestId('block-easing')).toBeVisible();
    await expect(page.getByTestId('block-lag-mode')).toHaveCount(0);
    await expect(page.getByTestId('block-shift-x')).toHaveCount(0);
    await expect(page.getByTestId('block-glyph-picker')).toHaveCount(0);
    const start = page.getByTestId('block-start');
    await start.fill('6');
    await start.press('Enter');
    expect(await blockOf(page, 'a', 'm')).toMatchObject({ start: 6, duration: 1.5 });
    await expect(blockLocator(page, 'm')).toHaveAttribute('data-start', '6');

    // Every edit is one undo step.
    await undo(page);
    expect((await blockOf(page, 'a', 'm')).start).toBe(3);
    await undo(page);
    await undo(page);
    await undo(page);
    expect(await blockOf(page, 'a', 'm')).toMatchObject({ style: 'copy', pathArc: 0 });
  });

  test('Edit pairs… opens the pair editor of the block', async ({ page }) => {
    await openBlockScene(page, [morphJson('m', 3, 1, PAIRS)]);
    await blockLocator(page, 'm').click();
    await expect(page.getByTestId('block-morph-pairs')).toHaveText('Edit pairs…');
    await page.getByTestId('block-morph-pairs').click();
    expect(await morphRequest(page)).toEqual({ clipId: 'a', actionId: 'm' });
  });

  test('a morph without pairs says how to get some; the clip lists it as a Morph', async ({
    page,
  }) => {
    await openBlockScene(page, [morphJson('m', 3, 1)]);
    await blockLocator(page, 'm').click();
    await expect(page.getByTestId('block-morph-pairs-empty')).toHaveText(
      'No pairs yet: Edit pairs… to choose which glyphs turn into which.',
    );
    await expect(page.getByTestId('block-issues')).toContainText('animates no glyph');
    await page.getByTestId('block-select-clip').click();
    await page.getByTestId('animations-tab-timing').click();
    const row = page.getByTestId('block-row-m');
    await expect(row).toContainText('Morph · 0');
    await expect(row).toContainText('3.00 s → 4.00 s');
    await expect(row.locator('.an-block-chip')).toHaveClass(/is-morph/);
  });

  test('a locked track shows the morph read-only', async ({ page }) => {
    await openBlockScene(page, [morphJson('m', 3, 1, PAIRS)]);
    await page.evaluate(() => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.tracks.find((t) => t.id === 't1')!.locked = true;
      });
    });
    await blockLocator(page, 'm').click();
    await expect(page.getByTestId('block-locked')).toBeVisible();
    for (const id of ['block-morph-style', 'block-morph-path-arc', 'block-morph-pairs']) {
      await expect(page.getByTestId(id)).toBeDisabled();
    }
  });
});

test.describe('morph blocks: dragging', () => {
  test('dragged over the Appear that brings one of its sources, it stops at its end', async ({
    page,
  }) => {
    // The Write brings b (glyph 2) at [2, 3]; the morph copies b onto c (glyph 4) at [6, 7].
    await openBlockScene(page, [
      appearJson('w', 2, 1, 'write', [2]),
      morphJson('m', 6, 1, [{ from: [2], to: [4], style: null }]),
    ]);
    await dragBlock(page, 'm', -6, { shift: true });
    expect(await blockOf(page, 'a', 'm')).toMatchObject({ start: 3, duration: 1 });
    await expect(blockLocator(page, 'm')).toHaveAttribute('data-start', '3');
    // Nothing to report there: the source is on screen when the morph starts.
    await expect(page.getByTestId('block-issues')).toHaveCount(0);
    await undo(page);
    expect((await blockOf(page, 'a', 'm')).start).toBe(6);
    // To the right it goes as far as the clip.
    await dragBlock(page, 'm', 6, { shift: true });
    expect((await blockOf(page, 'a', 'm')).start).toBe(9);
  });

  test('without pairs it animates nothing, so nothing stops it inside its clip', async ({
    page,
  }) => {
    await openBlockScene(page, [
      disappearJson('gone', 1, 8, 'fade_out', 'all'),
      morphJson('m', 6, 1),
    ]);
    await dragBlock(page, 'm', -4, { shift: true });
    expect((await blockOf(page, 'a', 'm')).start).toBeCloseTo(2, 1);
  });
});

test.describe('morph blocks: preview', () => {
  const outlined = async (page: Page) =>
    Number(await page.getByTestId('preview-frame').getAttribute('data-block-outline-count'));

  /** Canvas pixels within a small distance of the theme's `--block-morph` colour. */
  const morphPixels = (page: Page) =>
    page.getByTestId('preview-canvas').evaluate((element) => {
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--block-morph');
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.trim().slice(i, i + 2), 16));
      const canvas = element as HTMLCanvasElement;
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const d = Math.hypot(data[i]! - r!, data[i + 1]! - g!, data[i + 2]! - b!);
        if (d < 30) count++;
      }
      return count;
    });

  test('a selected morph outlines both sides of its pairs, in its own colour', async ({ page }) => {
    // a → c and + → = at [3, 4], copies: a and + stay, c and = arrive through the morph.
    await openBlockScene(page, [morphJson('m', 3, 1, PAIRS)]);
    await setTime(page, 1);
    expect(await morphPixels(page)).toBe(0);
    await blockLocator(page, 'm').click();
    // Before the morph only its sources are on screen…
    await expect.poll(() => outlined(page)).toBe(2);
    // …after it both sides are.
    await setTime(page, 5);
    await expect.poll(() => outlined(page)).toBe(4);
    await expect.poll(() => morphPixels(page)).toBeGreaterThan(50);
    // Nothing selected, nothing outlined.
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'none' }),
    );
    await expect.poll(() => outlined(page)).toBe(0);
    await expect.poll(() => morphPixels(page)).toBe(0);
  });

  test('the Start field keeps a copy before the block that consumes its source', async ({
    page,
  }) => {
    // `lend` copies a onto c over [1, 2); `take` turns a into = over [3, 4). A copy after the
    // consumption is an error, so Start stops at 3 s, where the copy begins exactly with it.
    await openBlockScene(page, [
      morphJson('lend', 1, 1, [{ from: [0], to: [4], style: null }]),
      morphJson('take', 3, 1, [{ from: [0], to: [3], style: null }], { style: 'transform' }),
    ]);
    await blockLocator(page, 'lend').click();
    const start = page.getByTestId('block-start');
    await expect(start).toHaveValue('1');
    await start.fill('5');
    await start.press('Enter');
    expect(await blockOf(page, 'a', 'lend')).toMatchObject({ start: 3, duration: 1 });
    await expect(start).toHaveValue('3');
    await expect(page.getByTestId('block-issues-section')).toHaveCount(0);
    await expect(blockLocator(page, 'lend')).toHaveAttribute('data-start', '3');
  });

  test('a morph has no start and end state icons, unlike a part transform', async ({ page }) => {
    await openBlockScene(page, [
      morphJson('m', 3, 1, PAIRS),
      partJson('pt', 6, 1, [3, 4], { shift: [1, 0] }),
    ]);
    await blockLocator(page, 'pt').click();
    await expect(page.getByTestId('block-state-icons')).toBeVisible();
    await expect(page.getByTestId('block-end-state-pt')).toBeVisible();
    await blockLocator(page, 'm').click();
    expect((await uiState(page)).selection).toMatchObject({ kind: 'action', actionId: 'm' });
    await expect(page.getByTestId('block-state-icons')).toHaveCount(0);
    await expect(page.getByTestId('block-start-state-m')).toHaveCount(0);
    await expect(page.getByTestId('block-end-state-m')).toHaveCount(0);
  });
});
