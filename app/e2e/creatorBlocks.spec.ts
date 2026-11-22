import { expect, test, type Locator, type Page } from './test';
import { closeEditor, pinMathJax, switchCreatorView } from './creatorHelpers';
import { canUndo, getProject, openWithProject, type MfeWindow } from './helpers';
import { plain, relationProject } from './relationsHelpers';
import { uiState } from './timelineHelpers';

/* The block view of the Creator's formula list (R3): a square per formula with its tag, name,
 * clip count, kind and status, the rendering in a tooltip; selected, walked, dragged, edited and
 * right-clicked like the rows. The view is an editor preference. */

const FORMULAS = ['a+b', 'c=d', 'x^2', 'y'].map((latex, i) => ({
  id: `f${i}`,
  name: `f${i}`,
  source: latex,
}));

const blocks = (page: Page) => page.getByTestId('formula-block');

async function openBlocks(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, relationProject([plain('a', 'f0', 't1', 0, 4)], FORMULAS));
  await pinMathJax(page);
  await switchCreatorView(page, 'grid');
  await expect(blocks(page)).toHaveCount(4);
}

test('blocks show the tag, the name, the clip count and the status; the view is remembered', async ({
  page,
}) => {
  await openBlocks(page);
  await expect(page.getByTestId('formula-item')).toHaveCount(0);
  await expect(page.getByTestId('formula-list')).toHaveAttribute('data-view', 'grid');
  // The key of the view says so, and offers the rows.
  await expect(page.getByTestId('creator-view-toggle')).toHaveAttribute('data-view', 'grid');
  await expect(page.getByTestId('creator-view-toggle')).toHaveAccessibleName('Switch to list view');
  const first = blocks(page).nth(0);
  await expect(first).toHaveAttribute('data-name', 'f0');
  await expect(first.getByTestId('formula-tag')).toBeAttached();
  await expect(first.getByTestId('formula-clips')).toHaveText('▭ 1');
  await expect(first.getByTestId('formula-kind')).toBeVisible();
  await expect(first.getByTestId('formula-status')).toHaveAttribute('data-status', 'ok');
  await expect(blocks(page).nth(1).getByTestId('formula-clips')).toHaveCount(0);
  // No rendering in the block.
  await expect(first.locator('.formula-thumb')).toHaveCount(0);
  // A square.
  const box = (await first.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  // Kept as a preference; back to the rows.
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('mfe.preferences') ?? '{}').creatorView,
    ),
  ).toBe('grid');
  await switchCreatorView(page, 'list');
  await expect(page.getByTestId('formula-item')).toHaveCount(4);
  await expect(blocks(page)).toHaveCount(0);
});

/** Formulas whose blocks are compact in a window 1700 px wide: the first with a pure yellow tag
 * (the lightest of the palette) and a long name, the second with a dark blue one and an icon, the
 * third failing to render. */
async function openCompactBlocks(page: Page): Promise<void> {
  // A wider window gives the Creator room for three columns, each narrower than two were.
  await page.setViewportSize({ width: 1700, height: 950 });
  const formulas = [
    { ...FORMULAS[0]!, name: 'a long name for a small block', color: '#FFFF00' },
    { ...FORMULAS[1]!, color: '#236B8E' },
    { ...FORMULAS[2]!, source: '\\frac{a}{' },
    FORMULAS[3]!,
  ];
  await openWithProject(page, relationProject([plain('a', 'f0', 't1', 0, 4)], formulas));
  await pinMathJax(page);
  await switchCreatorView(page, 'grid');
  // The second formula's tag has an icon.
  await page.evaluate(() => {
    const store = (window as MfeWindow).__mfe!.useProjectStore.getState();
    store.update((draft) => {
      (draft as unknown as { formulas: { tag: { icon: string | null } }[] }).formulas[1]!.tag.icon =
        '★';
    });
  });
}

const isCompact = async (block: Locator) => (await block.boundingBox())!.width < 112;

const style = (locator: Locator, property: string, pseudo?: string) =>
  locator.evaluate(
    (el, [name, part]) => getComputedStyle(el, part || undefined).getPropertyValue(name!),
    [property, pseudo ?? ''],
  );

type Rgb = [number, number, number];

/** The colour of a CSS colour value, in 0…255: `rgb(…)` or a theme token's `#rrggbb`. */
function rgbOf(text: string): Rgb {
  const value = text.trim();
  if (value.startsWith('#')) {
    const n = parseInt(value.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return value
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number) as Rgb;
}

/** The ring of a computed `box-shadow`: its one inset layer with no offset and no blur, all
 * spread, as Chrome writes it — the colour as `rgb(…)`, `rgba(…)` or `color(srgb …)`. */
function ring(shadow: string): { width: number; color: Rgb; alpha: number } {
  const layers = shadow.split(/,(?![^(]*\))/).map((layer) => layer.trim());
  const rings = layers.filter((layer) => /\) 0px 0px 0px \d+px inset$/.test(layer));
  expect(rings, shadow).toHaveLength(1);
  const [, color, width] = /^(.*\)) 0px 0px 0px (\d+)px inset$/.exec(rings[0]!)!;
  const numbers = color!.match(/[\d.]+/g)!.map(Number);
  const [r, g, b, alpha = 1] = numbers;
  const scale = color!.startsWith('color(srgb') ? 255 : 1;
  return {
    width: Number(width),
    color: [r!, g!, b!].map((v) => Math.round(v * scale)) as Rgb,
    alpha,
  };
}

function contrast(a: Rgb, b: Rgb): number {
  const luminance = (c: Rgb) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The pane a compact block's name lies on, as the screen shows it: the block's face captured
 * with the name hidden for the moment, its pixels inside its padding (6 px), the box the name
 * stays in — the tag's edge and the lit line are nearer the border. `pixels` are all of them;
 * `low` one near the foot, where the sheen of the top has faded out. */
async function pane(page: Page, block: Locator): Promise<{ pixels: Rgb[]; low: Rgb }> {
  const face = block.getByTestId('formula-block-face');
  const name = block.getByTestId('formula-name');
  expect(await style(face, 'padding-top')).toBe('6px');
  await name.evaluate((el) => (el.style.visibility = 'hidden'));
  const png = (await face.screenshot()).toString('base64');
  await name.evaluate((el) => (el.style.visibility = ''));
  const width = (await face.boundingBox())!.width;
  return page.evaluate(
    async ([base64, cssWidth]) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const inset = Math.ceil((6 * bitmap.width) / cssWidth);
      const [w, h] = [bitmap.width - 2 * inset, bitmap.height - 2 * inset];
      const { data } = context.getImageData(inset, inset, w, h);
      const at = (x: number, y: number): Rgb => {
        const i = (y * w + x) * 4;
        return [data[i]!, data[i + 1]!, data[i + 2]!];
      };
      const pixels: Rgb[] = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels.push(at(x, y));
      return { pixels, low: at(Math.floor(w / 2), Math.floor(h * 0.95)) };
    },
    [png, width] as const,
  );
}

test('a block too narrow for its name is glass tinted with its tag, the rest in its corners under the pointer', async ({
  page,
}) => {
  await openCompactBlocks(page);
  const first = blocks(page).nth(0);
  const second = blocks(page).nth(1);
  const face = first.getByTestId('formula-block-face');
  expect(await isCompact(first)).toBe(true);
  // Glass, not a slab of the tag's colour (the pane is measured in the test below); the name in
  // the text's colour on every tag; no dot.
  expect(await style(face, 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await style(face, 'background-image')).toMatch(/^linear-gradient\(.*linear-gradient\(/);
  const text = rgbOf(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--text'),
    ),
  );
  for (const block of [first, second]) {
    expect(rgbOf(await style(block.getByTestId('formula-name'), 'color'))).toEqual(text);
  }
  await expect(first.getByTestId('formula-name')).toBeVisible();
  await expect(first.locator('.formula-tag-dot')).toBeHidden();
  // The whole name, which the ordinary face would have had no room for.
  const name = (await first.getByTestId('formula-name').boundingBox())!;
  expect(name.height).toBeGreaterThan(40);
  // The rest waits for the pointer.
  await page.mouse.move(5, 5);
  for (const id of ['formula-kind', 'formula-status', 'formula-clips', 'formula-edit']) {
    await expect(first.getByTestId(id)).toBeHidden();
  }
  await first.hover();
  for (const id of ['formula-kind', 'formula-status', 'formula-clips', 'formula-edit']) {
    await expect(first.getByTestId(id)).toBeVisible();
  }
  // At once: nothing fades in.
  expect(await style(first.locator('.formula-block-actions'), 'transition-duration')).toBe('0s');
  expect(await style(first.locator('.formula-block-actions'), 'opacity')).toBe('1');
  // The render is one letter there — M for MathJax —, and the badge keeps its words.
  const status = first.getByTestId('formula-status');
  expect(await style(status, 'content', '::before')).toBe('"M"');
  await expect(status).toHaveText('MathJax');
  await expect(status).toHaveAttribute('title', /^MathJax:/);
  // In the corners: the buttons at the top, the kind at the bottom left, the clips at the right.
  const box = (await first.boundingBox())!;
  const kind = (await first.getByTestId('formula-kind').boundingBox())!;
  const clips = (await first.getByTestId('formula-clips').boundingBox())!;
  const edit = (await first.getByTestId('formula-edit').boundingBox())!;
  expect(kind.x - box.x).toBeLessThan(12);
  expect(box.y + box.height - (kind.y + kind.height)).toBeLessThan(12);
  expect(box.x + box.width - (clips.x + clips.width)).toBeLessThan(12);
  expect(edit.y - box.y).toBeLessThan(12);
  // A button of its corner works as it does on the ordinary face.
  await first.getByTestId('formula-duplicate').click();
  await expect(blocks(page)).toHaveCount(5);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(blocks(page)).toHaveCount(4);
  // Gone with the pointer; the icon of a tag comes with the corners too.
  await second.hover();
  await expect(first.getByTestId('formula-kind')).toBeHidden();
  await expect(second.locator('.formula-tag-icon')).toBeVisible();
  // The keyboard brings them as well: a block the arrows reach.
  await first.click();
  await page.mouse.move(5, 5);
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(second.getByTestId('formula-kind')).toBeVisible();
  // A render that failed is not left for the pointer to find.
  const failed = blocks(page).nth(2).getByTestId('formula-status');
  await expect(failed).toHaveAttribute('data-status', 'error');
  await expect(failed).toBeVisible();
  expect(await style(failed, 'content', '::before')).toBe('"!"');
  await expect(blocks(page).nth(2).getByTestId('formula-kind')).toBeHidden();

  // With room again, the ordinary face: the dot, the kind and the status in the block itself.
  await page.setViewportSize({ width: 1500, height: 950 });
  await expect.poll(() => isCompact(first)).toBe(false);
  await page.mouse.move(5, 5);
  expect(await style(face, 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await style(face, 'background-image')).toBe('none');
  await expect(first.locator('.formula-tag-dot')).toBeVisible();
  await expect(first.getByTestId('formula-kind')).toBeVisible();
  await expect(first.getByTestId('formula-status')).toBeVisible();
  expect(await style(first.getByTestId('formula-status'), 'content', '::before')).toBe('none');
  await expect(first.getByTestId('formula-clips')).toBeVisible();
});

test('the glass of a compact block is a tint of its tag over the panel, its name readable on it in both themes', async ({
  page,
}) => {
  await openCompactBlocks(page);
  const tagged: [Locator, Rgb][] = [
    [blocks(page).nth(0), [255, 255, 0]],
    [blocks(page).nth(1), [0x23, 0x6b, 0x8e]],
  ];
  expect(await isCompact(tagged[0]![0])).toBe(true);
  await page.mouse.move(5, 5);
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const panel = rgbOf(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--panel'),
      ),
    );
    for (const [block, tag] of tagged) {
      const where = `${theme}, tag ${tag}`;
      const { pixels, low } = await pane(page, block);
      // A share of the tag over the panel, the same in every channel that tells them apart: a
      // tint, not the tag's own colour nor a colour of its own.
      const shares = [0, 1, 2]
        .filter((i) => Math.abs(tag[i]! - panel[i]!) > 60)
        .map((i) => (low[i]! - panel[i]!) / (tag[i]! - panel[i]!));
      expect(shares.length, where).toBeGreaterThan(0);
      for (const share of shares) {
        expect(share, where).toBeGreaterThan(0.1);
        expect(share, where).toBeLessThan(0.5);
        expect(Math.abs(share - shares[0]!), where).toBeLessThan(0.03);
      }
      // The name reads on every pixel of the pane, at 4.5 to 1 at least.
      const ink = rgbOf(await style(block.getByTestId('formula-name'), 'color'));
      const least = Math.min(...pixels.map((pixel) => contrast(ink, pixel)));
      expect(least, where).toBeGreaterThanOrEqual(4.5);
    }
  }

  // The edge all round inside the border is the tag's, lit whole under the pointer; selected, it
  // is the accent's, and wider.
  const [first] = tagged[0]!;
  const edge = async () => ring(await style(first.getByTestId('formula-block-face'), 'box-shadow'));
  expect(await edge()).toEqual({ width: 1, color: [255, 255, 0], alpha: 0.7 });
  await first.hover();
  expect(await edge()).toEqual({ width: 1, color: [255, 255, 0], alpha: 1 });
  await first.click();
  await page.mouse.move(5, 5);
  await expect(first).toHaveAttribute('aria-selected', 'true');
  const accent = rgbOf(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent'),
    ),
  );
  expect(await edge()).toEqual({ width: 2, color: accent, alpha: 1 });
});

test('one key switches the view: it shows the other view’s icon and says what a press does', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, relationProject([plain('a', 'f0', 't1', 0, 4)], FORMULAS));
  await pinMathJax(page);
  const key = page.getByTestId('creator-view-toggle');
  const list = page.getByTestId('formula-list');
  const drawing = (where: Locator) => where.locator('svg').evaluate((svg) => svg.innerHTML);
  // The pictures of the two views as the app draws them elsewhere: the blocks on the Templates
  // tab, the rows on the key that lists a formula's glyphs, in the formula editor.
  const blocksIcon = await drawing(page.getByTestId('creator-tab-templates'));
  await page.getByTestId('formula-item').first().dblclick();
  const rowsIcon = await drawing(
    page.getByTestId('formula-editor').getByTestId('glyph-list-toggle'),
  );
  await closeEditor(page);
  expect(rowsIcon).not.toBe(blocksIcon);
  const before = await getProject(page);
  const undoable = await canUndo(page);

  // The list view: the key shows the blocks, and says that a press shows them.
  await expect(list).toHaveAttribute('data-view', 'list');
  await expect(key).toHaveAttribute('data-view', 'list');
  await expect(key).toHaveAccessibleName('Switch to block view');
  await expect(key).toHaveAttribute(
    'title',
    'Switch to block view: a square per formula; point at one for its rendering',
  );
  // A key that acts, not one that stays pressed.
  expect(await key.getAttribute('aria-pressed')).toBeNull();
  expect(await drawing(key)).toBe(blocksIcon);

  await key.click();
  await expect(list).toHaveAttribute('data-view', 'grid');
  await expect(blocks(page)).toHaveCount(4);
  await expect(page.getByTestId('formula-item')).toHaveCount(0);
  await expect(key).toHaveAttribute('data-view', 'grid');
  await expect(key).toHaveAccessibleName('Switch to list view');
  await expect(key).toHaveAttribute(
    'title',
    'Switch to list view: a row per formula, with its rendering',
  );
  expect(await drawing(key)).toBe(rowsIcon);

  // From the keyboard: Tab after the magnifier, and Enter or Space; the key keeps the focus.
  await page.getByTestId('creator-search-open').focus();
  await page.keyboard.press('Tab');
  await expect(key).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(list).toHaveAttribute('data-view', 'list');
  await expect(page.getByTestId('formula-item')).toHaveCount(4);
  await expect(key).toHaveAccessibleName('Switch to block view');
  expect(await drawing(key)).toBe(blocksIcon);
  await expect(key).toBeFocused();
  await page.keyboard.press('Space');
  await expect(list).toHaveAttribute('data-view', 'grid');
  await expect(key).toHaveAccessibleName('Switch to list view');
  await expect(key).toBeFocused();
  // The view is the editor's, not the project's: nothing in it changed, no step to undo.
  expect(await getProject(page)).toEqual(before);
  expect(await canUndo(page)).toBe(undoable);
});

test('pointing at a block shows its rendering, kind, glyph source and keys beside the block', async ({
  page,
}) => {
  await openBlocks(page);
  const block = (await blocks(page).nth(0).boundingBox())!;
  await page.mouse.move(block.x + 10, block.y + 10);
  const tip = page.getByTestId('formula-tooltip');
  await expect(tip).toBeVisible();
  await expect(tip.locator('.formula-thumb svg')).toBeVisible();
  await expect(tip).toContainText('f0');
  await expect(tip).toContainText('Formula · MathJax');
  // What a double-click and F2 do is said there: the name has no tooltip of its own, which
  // would come up over the rendering.
  await expect(tip).toContainText('Double-click to edit');
  expect(
    await blocks(page)
      .nth(0)
      .getByTestId('formula-name')
      .evaluate((el) => el.hasAttribute('title')),
  ).toBe(false);
  // To the right of the block, level with its top, wherever the pointer is on it: the tooltip
  // does not follow the pointer.
  const shown = (await tip.boundingBox())!;
  // A fifth larger than the rendering of a row: 288 px wide, the rendering 62 px tall.
  expect(shown.width).toBe(288);
  expect((await tip.locator('.formula-thumb').boundingBox())!.height).toBe(62);
  const gap = shown.x - (block.x + block.width);
  expect(gap).toBeGreaterThan(0);
  expect(gap).toBeLessThan(12);
  expect(Math.abs(shown.y - block.y)).toBeLessThan(2);
  await page.mouse.move(block.x + block.width - 10, block.y + block.height - 10, { steps: 4 });
  expect(await tip.boundingBox()).toEqual(shown);
  // It hangs from the document, not from the Creator (a container may place and clip what is
  // inside it).
  expect(await tip.evaluate((el) => el.parentElement === document.body)).toBe(true);
  // On another block it is that block's, beside it.
  const next = (await blocks(page).nth(1).boundingBox())!;
  await page.mouse.move(next.x + 10, next.y + 10);
  await expect(tip).toContainText('f1');
  const moved = (await tip.boundingBox())!;
  expect(moved.x - (next.x + next.width)).toBeCloseTo(gap, 0);
  // A press takes it away — a drag or a double-click may follow — until the pointer moves on.
  await page.mouse.down();
  await expect(tip).toHaveCount(0);
  await page.mouse.up();
  await page.mouse.move(next.x + 12, next.y + 11);
  await expect(tip).toHaveCount(0);
  await page.mouse.move(next.x + 30, next.y + 30);
  await expect(tip).toBeVisible();
  await page.getByTestId('creator-search-open').hover();
  await expect(tip).toHaveCount(0);
});

test('the grid is walked with the arrows: ← → a block, ↑ ↓ a row; Shift extends', async ({
  page,
}) => {
  await openBlocks(page);
  const columns = await page
    .getByTestId('formula-list')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBeGreaterThanOrEqual(2);
  await blocks(page).nth(0).click();
  await expect(blocks(page).nth(0)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(blocks(page).nth(1)).toBeFocused();
  expect((await uiState(page)).selection).toEqual({ kind: 'formula', id: 'f1' });
  await page.keyboard.press('ArrowDown');
  const below = Math.min(1 + columns, 3);
  await expect(blocks(page).nth(below)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(blocks(page).nth(1)).toBeFocused();
  await page.keyboard.press('Shift+ArrowLeft');
  expect((await uiState(page)).selection).toEqual({ kind: 'formulas', ids: ['f0', 'f1'] });
  await expect(blocks(page).nth(0)).toHaveAttribute('aria-selected', 'true');
});

test('a block edits on double-click, acts from its hover buttons, has the menu and drags', async ({
  page,
}) => {
  await openBlocks(page);
  await blocks(page).nth(1).dblclick();
  await expect(page.getByTestId('formula-editor')).toBeVisible();
  await closeEditor(page);
  // The actions appear on hover.
  await blocks(page).nth(2).hover();
  await blocks(page).nth(2).getByTestId('formula-duplicate').click();
  await expect(blocks(page)).toHaveCount(5);
  await blocks(page).nth(0).click({ button: 'right' });
  await expect(page.getByTestId('formula-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  // A real drag: the block offers its id under the Timeline's MIME type, as a copy.
  await expect(blocks(page).nth(0)).toHaveAttribute('draggable', 'true');
  await page.evaluate(() => {
    document.addEventListener('dragstart', (event) => {
      (window as unknown as { __drag: unknown }).__drag = {
        effect: event.dataTransfer?.effectAllowed,
        id: event.dataTransfer?.getData('application/x-mfe-formula'),
      };
    });
  });
  await blocks(page).nth(0).dragTo(page.getByTestId('panel-timeline'));
  expect(await page.evaluate(() => (window as unknown as { __drag: unknown }).__drag)).toEqual({
    effect: 'copy',
    id: 'f0',
  });
  expect((await getProject(page)).formulas).toHaveLength(5);
});
