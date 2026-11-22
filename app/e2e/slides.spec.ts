/* The Slides mode in the editor (D200): turning it on and off, the ruler coloured by zone, and the
 * marks — pauses and comments — on the ruler. */
import { expect, test, type Locator, type Page } from './test';
import { holdToConfirm, projectFile, someTextField, type MfeWindow } from './helpers';
import {
  box,
  canUndo,
  clipJson,
  dragTo,
  moveClip,
  openTimeline,
  PX_PER_SECOND,
  undo,
} from './timelineHelpers';
import { marksOf, slidesOf, type SlideMarkJson } from './slidesHelpers';

/** A clip of `alpha` on [0, 3] with an intro and an outro of 1 s: the scene animates over [0, 1]
 * and [2, 3], and rests over [1, 2] and at 3 s, where it ends. */
const ONE_CLIP = [clipJson('c1', 'fa', 't1', 0, 3)];

const zones = (page: Page) => page.getByTestId('slide-zone');

/** The zones of the ruler as it draws them: kind, start and end. */
async function zoneList(page: Page): Promise<[string, number, number][]> {
  return zones(page).evaluateAll((all) =>
    all.map((zone): [string, number, number] => [
      zone.getAttribute('data-kind')!,
      Number(zone.getAttribute('data-start')),
      Number(zone.getAttribute('data-end')),
    ]),
  );
}

const style = (locator: Locator, property: string) =>
  locator.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);

async function zen(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as MfeWindow).__mfe!.usePreferences.getState().set({ zenMode: true }),
  );
  await expect(page.getByTestId('timeline-view')).toHaveAttribute('data-orientation', 'vertical');
}

test.describe('the mode', () => {
  test('View ▸ Slides and the button of the timeline turn it on and off, a step each', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP);
    const button = page.getByTestId('timeline-slides');
    expect(await slidesOf(page)).toBeNull();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('menu-view').click();
    const item = page.getByTestId('menu-item-view-slides');
    await expect(item).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await item.click();
    expect(await slidesOf(page)).toEqual({ marks: [] });
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('menu-view').click();
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    // The button: off, and on again.
    await button.click();
    expect(await slidesOf(page)).toBeNull();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();
    expect(await slidesOf(page)).toEqual({ marks: [] });
    // Each is a step of the project.
    await undo(page);
    expect(await slidesOf(page)).toBeNull();
    await undo(page);
    expect(await slidesOf(page)).toEqual({ marks: [] });
    await undo(page);
    expect(await slidesOf(page)).toBeNull();
    expect(await canUndo(page)).toBe(false);
    // Alt+S is the align key it was, not the mode's (it has none).
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('Alt+s');
    expect(await slidesOf(page)).toBeNull();
  });

  test('it stays on while it has a pause or a comment: a notice says why', async ({ page }) => {
    const marks: SlideMarkJson[] = [
      { id: 'p1', time: 1.5, kind: 'pause' },
      { id: 'p2', time: 3, kind: 'comment', text: 'The end' },
    ];
    await openTimeline(page, ONE_CLIP, { slides: { marks } });
    const button = page.getByTestId('timeline-slides');
    const why =
      'Delete every pause and comment to turn Slides off (there are 1 pause and 1 comment).';
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAttribute('title', why);
    // It says it is disabled, and a press on it gives the reason as a notice (Playwright does
    // not press what says so unless forced).
    await button.click({ force: true });
    await expect(page.getByTestId('notice').last()).toContainText('Slides stays on');
    await expect(page.getByTestId('notice').last()).toContainText(why);
    expect(await slidesOf(page)).toEqual({ marks });
    // From the menu too: the item stays checked.
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menu-item-view-slides').click();
    expect(await slidesOf(page)).toEqual({ marks });
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menu-item-view-slides')).toHaveAttribute('aria-checked', 'true');
    expect(await canUndo(page)).toBe(false);
  });
});

test.describe('the ruler by zone', () => {
  test('is tinted where a pause may stand and where something animates, in both themes', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP);
    // Off, the ruler is the one it was.
    await expect(page.getByTestId('slide-zones')).toHaveCount(0);
    await page.getByTestId('timeline-slides').click();
    // The scene starts with the intro and ends with the outro: an instant of rest at each end.
    expect(await zoneList(page)).toEqual([
      ['pause', 0, 0],
      ['busy', 0, 1],
      ['pause', 1, 2],
      ['busy', 2, 3],
      ['pause', 3, 3],
    ]);
    // Each where its times are on the ruler; an instant is a thin notch.
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const rest = await box(zones(page).nth(2));
    expect(rest.x).toBeCloseTo(ruler.x + PX_PER_SECOND, 0);
    expect(rest.width).toBeCloseTo(PX_PER_SECOND, 0);
    expect(rest.height).toBeCloseTo(ruler.height, 0);
    const notch = await box(zones(page).nth(4));
    expect(notch.x + notch.width / 2).toBeCloseTo(ruler.x + 3 * PX_PER_SECOND, 0);
    expect(notch.width).toBeLessThanOrEqual(4);
    // A tint where a pause may stand; a hatch where something animates; the notch in the pause
    // colour, solid. The colours are the theme's.
    const paint = async () => ({
      pause: await style(zones(page).nth(2), 'background-color'),
      busy: await style(zones(page).nth(1), 'background-image'),
      notch: await style(zones(page).nth(4), 'background-color'),
    });
    const dark = await paint();
    expect(dark.busy).toContain('repeating-linear-gradient');
    expect(dark.pause).not.toBe('rgba(0, 0, 0, 0)');
    expect(dark.notch).not.toBe(dark.pause);
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const light = await paint();
    expect(light.pause).not.toBe(dark.pause);
    expect(light.busy).not.toBe(dark.busy);
    expect(light.notch).not.toBe(dark.notch);
    // A press on a zone is a press on the ruler: the playhead goes there.
    await page.mouse.click(rest.x + rest.width / 2, rest.y + rest.height - 4);
    await expect
      .poll(() => page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().time))
      .toBeCloseTo(1.5, 1);
  });

  test('follows an edit as it is made, a drag included', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: [] } });
    // Half a second later, the pointer still down: the zones have moved with the clip.
    await moveClip(page, 'c1', 0.5, { release: false });
    await expect
      .poll(() => zoneList(page))
      .toEqual([
        ['pause', 0, 0.5],
        ['busy', 0.5, 1.5],
        ['pause', 1.5, 2.5],
        ['busy', 2.5, 3.5],
        ['pause', 3.5, 3.5],
      ]);
    await page.mouse.up();
    // An undo puts them back with the clip.
    await undo(page);
    await expect
      .poll(() => zoneList(page))
      .toEqual([
        ['pause', 0, 0],
        ['busy', 0, 1],
        ['pause', 1, 2],
        ['busy', 2, 3],
        ['pause', 3, 3],
      ]);
  });

  test('runs down the ruler in Zen mode', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: [] } });
    await zen(page);
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const rest = await box(zones(page).nth(2));
    expect(rest.y).toBeCloseTo(ruler.y + PX_PER_SECOND, 0);
    expect(rest.height).toBeCloseTo(PX_PER_SECOND, 0);
    expect(rest.width).toBeCloseTo(ruler.width, 0);
  });

  test('keeps its zones apart under forced colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openTimeline(page, ONE_CLIP, { slides: { marks: [] } });
    // A pause zone is a bar of the selection's colour along the top; an animation, a hatch.
    expect(await style(zones(page).nth(2), 'box-shadow')).toContain('inset');
    expect(await style(zones(page).nth(1), 'background-image')).toContain(
      'repeating-linear-gradient',
    );
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await style(zones(page).nth(4), 'background-color')).not.toBe(canvas);
  });

  test('keeps its marks seen under forced colours, one out of place apart', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const fill = (id: string) => style(mark(page, id).locator('.tl-slide-mark-shape'), 'fill');
    expect(await fill('p1')).not.toBe(canvas);
    expect(await fill('p4')).not.toBe(canvas);
    expect(await fill('p4')).not.toBe(await fill('p1'));
    expect(await style(page.getByTestId('slide-line-p1'), 'border-left-color')).not.toBe(canvas);
  });
});

/** On ONE_CLIP: a pause at 1.5 s and a comment at 1.75 s where the scene rests, a pause with a note
 * at 3 s, the end of the scene, and a pause at 0.5 s, under the intro — out of place. */
const MARKS: SlideMarkJson[] = [
  { id: 'p1', time: 1.5, kind: 'pause' },
  { id: 'p2', time: 1.75, kind: 'comment', text: 'A flash\nover the alpha' },
  { id: 'p3', time: 3, kind: 'pause', text: 'Questions' },
  { id: 'p4', time: 0.5, kind: 'pause' },
];

const mark = (page: Page, id: string) => page.getByTestId(`slide-mark-${id}`);
const playhead = (page: Page) =>
  page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().time);

test.describe('the marks on the ruler', () => {
  test('stand in its upper part on their instants, with a line down the tracks at each pause', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    const ruler = await box(page.getByTestId('timeline-ruler'));
    for (const { id, time } of MARKS) {
      const b = await box(mark(page, id));
      expect(b.x + b.width / 2, id).toBeCloseTo(ruler.x + time * PX_PER_SECOND, 0);
      expect(b.y, id).toBeCloseTo(ruler.y, 0);
      // The foot of the ruler is left to the playhead.
      expect(b.y + b.height, id).toBeLessThan(ruler.y + ruler.height - 8);
    }
    // A pause is a tag, a comment a bubble; each named with its words.
    await expect(mark(page, 'p1')).toHaveAttribute('data-kind', 'pause');
    await expect(mark(page, 'p2')).toHaveAttribute('data-kind', 'comment');
    await expect(page.getByRole('button', { name: 'Pause at 1.50 s', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Comment at 1.75 s: A flash over the alpha' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause at 3.00 s: Questions' })).toBeVisible();
    // A line at each pause, none at a comment, from the foot of the ruler down the tracks.
    await expect(page.locator('[data-testid^="slide-line-"]')).toHaveCount(3);
    await expect(page.getByTestId('slide-line-p2')).toHaveCount(0);
    const line = await box(page.getByTestId('slide-line-p1'));
    const lane = await box(page.getByTestId('track-lane-t3'));
    expect(line.x).toBeCloseTo(ruler.x + 1.5 * PX_PER_SECOND, 0);
    // (the ruler's row has an edge of a pixel under it)
    expect(Math.abs(line.y - (ruler.y + ruler.height))).toBeLessThanOrEqual(1.5);
    expect(line.y + line.height).toBeGreaterThanOrEqual(lane.y + lane.height);
    // Off, none of it.
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
        delete (draft as { slides?: unknown }).slides;
      }),
    );
    await expect(page.locator('[data-testid^="slide-mark-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="slide-line-"]')).toHaveCount(0);
  });

  test('a click puts the playhead on a mark; the foot of the ruler under it stays the playhead’s', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await mark(page, 'p1').click();
    expect(await playhead(page)).toBe(1.5);
    // Under the mark, at the foot of the ruler, a press moves the playhead to the pointer.
    const b = await box(mark(page, 'p2'));
    const ruler = await box(page.getByTestId('timeline-ruler'));
    await page.mouse.click(b.x + b.width / 2 + 4, ruler.y + ruler.height - 3);
    expect(await playhead(page)).toBeCloseTo(1.8, 1);
    expect(await playhead(page)).not.toBe(1.75);
    expect(await marksOf(page)).toEqual(MARKS);
  });

  test('hovering a mark shows its words at once; one out of place is amber and says why', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    const tip = page.getByTestId('slide-mark-tip');
    await expect(tip).toHaveCount(0);
    await mark(page, 'p2').hover();
    await expect(tip).toBeVisible({ timeout: 300 });
    await expect(tip.locator('.tl-slide-tip-title')).toHaveText('Comment at 1.75 s');
    // Its words keep their lines.
    expect(await tip.locator('.tl-slide-tip-words').innerText()).toBe('A flash\nover the alpha');
    // Under the ruler, beside the mark.
    const anchor = await box(mark(page, 'p2'));
    const shown = await box(tip);
    expect(shown.y).toBeGreaterThan(anchor.y + anchor.height);
    await page.mouse.move(5, 5);
    await expect(tip).toHaveCount(0);
    // The pause under the intro: amber, as the warnings are, and its tooltip says why.
    await expect(mark(page, 'p4')).toHaveAttribute('data-standing', 'busy');
    await expect(mark(page, 'p4')).toHaveAttribute('data-warned', 'true');
    await expect(mark(page, 'p1')).not.toHaveAttribute('data-warned', /.*/);
    const fill = (id: string) =>
      mark(page, id)
        .locator('.tl-slide-mark-shape')
        .evaluate((el) => getComputedStyle(el).fill);
    const warning = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--warning)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(await fill('p4')).toBe(warning);
    expect(await fill('p1')).not.toBe(warning);
    await mark(page, 'p4').hover();
    await expect(tip).toContainText('Pause at 0.50 s');
    await expect(tip).toContainText(
      'The pause at 0.5 s is where the intro of "alpha" runs: a mark stands where nothing animates, and the exports leave this one out. Move it or delete it.',
    );
  });

  test('marks at one instant stand side by side', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, {
      slides: { marks: [...MARKS, { id: 'p5', time: 1.5, kind: 'comment', text: 'Look' }] },
    });
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const pause = await box(mark(page, 'p1'));
    const comment = await box(mark(page, 'p5'));
    // The comment first — it is read before the scene stops —, then the pause, about the instant.
    expect(comment.x + comment.width).toBeLessThanOrEqual(pause.x + 0.5);
    expect((comment.x + pause.x + pause.width) / 2).toBeCloseTo(ruler.x + 1.5 * PX_PER_SECOND, 0);
  });

  test('a clip dragged over a mark shows it amber before the pointer is let go', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    // One second later: the intro runs over [1, 2], on the pause at 1.5 s.
    await moveClip(page, 'c1', 1, { release: false });
    await expect(mark(page, 'p1')).toHaveAttribute('data-standing', 'busy');
    await expect(mark(page, 'p1')).toHaveAttribute('data-warned', 'true');
    await expect(page.getByTestId('slide-line-p1')).toHaveClass(/is-warned/);
    // Escape gives the drag up: nothing is asked, and the pause stands where it may again.
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(mark(page, 'p1')).toHaveAttribute('data-standing', 'standing');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('stand down the ruler in Zen mode, what is in them upright', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await zen(page);
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const b = await box(mark(page, 'p1'));
    expect(b.y + b.height / 2).toBeCloseTo(ruler.y + 1.5 * PX_PER_SECOND, 0);
    // In the upper part of the ruler: its outer edge, on the right.
    expect(b.x + b.width).toBeCloseTo(ruler.x + ruler.width, 0);
    // The «‖» of a pause and the dots of a comment are drawn as they are written, neither turned
    // nor mirrored: two bars side by side, as when the timeline lies.
    for (const id of ['p1', 'p2']) {
      const drawn = await mark(page, id)
        .locator('.tl-slide-mark-glyph')
        .evaluate((el) => {
          let matrix = new DOMMatrix();
          for (let node: Element | null = el; node; node = node.parentElement) {
            const own = getComputedStyle(node).transform;
            if (own && own !== 'none') matrix = new DOMMatrix(own).multiply(matrix);
          }
          return [matrix.a, matrix.b, matrix.c, matrix.d].map((value) => Math.round(value) + 0);
        });
      expect(drawn, id).toEqual([1, 0, 0, 1]);
    }
    await mark(page, 'p1').click();
    expect(await playhead(page)).toBe(1.5);
  });
});

/** Right-click the ruler at the time `t`, at its foot (under the marks). */
async function rulerMenu(page: Page, t: number): Promise<Locator> {
  const ruler = await box(page.getByTestId('timeline-ruler'));
  const vertical =
    (await page.getByTestId('timeline-view').getAttribute('data-orientation')) === 'vertical';
  // Drawn vertical, the foot of the ruler is its left side.
  if (vertical) {
    await page.mouse.click(ruler.x + 5, ruler.y + t * PX_PER_SECOND, { button: 'right' });
  } else {
    await page.mouse.click(ruler.x + t * PX_PER_SECOND, ruler.y + ruler.height - 5, {
      button: 'right',
    });
  }
  const menu = page.getByTestId('slide-ruler-menu');
  await expect(menu).toBeVisible();
  return menu;
}

test.describe('the menu of the ruler', () => {
  test('adds a pause where the scene rests, as one step', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: [] } });
    const menu = await rulerMenu(page, 1.5);
    await expect(menu.getByTestId('slide-menu-add-pause')).toHaveText('Add pause here (1.50 s)');
    await expect(menu.getByTestId('slide-menu-add-comment')).toHaveText('Add comment here…');
    await expect(menu.getByTestId('slide-ruler-menu-why')).toHaveCount(0);
    await menu.getByTestId('slide-menu-add-pause').click();
    const [added] = await marksOf(page);
    expect(added).toEqual({ id: expect.any(String), time: 1.5, kind: 'pause' });
    // It is drawn, and has the focus.
    await expect(mark(page, added!.id)).toBeFocused();
    await undo(page);
    expect(await marksOf(page)).toEqual([]);
  });

  test('adds a comment with its words, on several lines; never one without words', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: [] } });
    await (await rulerMenu(page, 1.25)).getByTestId('slide-menu-add-comment').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Comment at 1.25 s');
    const field = page.getByTestId('dialog-field');
    await expect(field).toBeFocused();
    // Empty, it says why it cannot be added.
    await expect(page.getByTestId('dialog-field-error')).toContainText('A comment needs words');
    await expect(page.getByTestId('dialog-confirm')).toBeDisabled();
    await page.keyboard.type('Flash the minus sign');
    await page.keyboard.press('Enter');
    await page.keyboard.type('then zoom on y');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(dialog).toBeHidden();
    const [added] = await marksOf(page);
    expect(added).toEqual({
      id: expect.any(String),
      time: 1.25,
      kind: 'comment',
      text: 'Flash the minus sign\nthen zoom on y',
    });
    await undo(page);
    expect(await marksOf(page)).toEqual([]);
    // Cancelled, nothing is added and nothing is a step.
    await (await rulerMenu(page, 1.25)).getByTestId('slide-menu-add-comment').click();
    await page.keyboard.type('Never mind');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await marksOf(page)).toEqual([]);
  });

  test('where something animates, both entries are greyed out and it says what runs', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: [] } });
    const menu = await rulerMenu(page, 0.5);
    await expect(menu.getByTestId('slide-menu-add-pause')).toBeDisabled();
    await expect(menu.getByTestId('slide-menu-add-comment')).toBeDisabled();
    await expect(menu.getByTestId('slide-ruler-menu-why')).toHaveText(
      'The intro of "alpha" runs here: a pause or a comment stands where nothing animates.',
    );
    await expect(menu.getByTestId('slide-menu-add-pause')).toHaveAccessibleDescription(
      /The intro of "alpha" runs here/,
    );
    await page.keyboard.press('Escape');
    expect(await marksOf(page)).toEqual([]);
  });

  test('snaps to the edges of a zone and to the playhead, and holds the time in its zone', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: [] } });
    const time = async (t: number) => {
      const menu = await rulerMenu(page, t);
      const text = await menu.getByTestId('slide-menu-add-pause').textContent();
      const enabled = await menu.getByTestId('slide-menu-add-pause').isEnabled();
      await page.keyboard.press('Escape');
      return [text, enabled];
    };
    // Snap on: an edge a few pixels away pulls the time onto it.
    expect(await time(1.05)).toEqual(['Add pause here (1.00 s)', true]);
    // The instant the scene ends at, a notch: a click just before it, on the outro, reaches it.
    expect(await time(2.96)).toEqual(['Add pause here (3.00 s)', true]);
    // The playhead.
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(1.7));
    expect(await time(1.66)).toEqual(['Add pause here (1.70 s)', true]);
    // Snap off: the time clicked, on a frame.
    await page.getByTestId('timeline-snap').click();
    expect(await time(1.05)).toEqual(['Add pause here (1.05 s)', true]);
    // (on the frame the pointer is on: a mouse event is on whole pixels)
    const [late, free] = await time(2.96);
    expect(late).toMatch(/^Add pause here \(2\.9\d s\)$/);
    expect(free).toBe(false);
  });

  test('a second pause on a frame is not added: the one there takes the focus', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await (await rulerMenu(page, 1.5)).getByTestId('slide-menu-add-pause').click();
    await expect(page.getByTestId('notice').last()).toContainText('A pause is at 1.50 s already');
    await expect(mark(page, 'p1')).toBeFocused();
    expect(await marksOf(page)).toEqual(MARKS);
    expect(await canUndo(page)).toBe(false);
    // A comment may share its instant.
    await (await rulerMenu(page, 1.5)).getByTestId('slide-menu-add-comment').click();
    await page.keyboard.type('Look');
    await page.getByTestId('dialog-confirm').click();
    expect((await marksOf(page)).filter((m) => m.time === 1.5).map((m) => m.kind)).toEqual([
      'comment',
      'pause',
    ]);
  });

  test('on a mark, it is the mark’s own: Delete removes it, as one step', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await mark(page, 'p2').click({ button: 'right' });
    const menu = page.getByTestId('slide-mark-menu');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('slide-ruler-menu')).toHaveCount(0);
    await expect(menu).toContainText('Comment at 1.75 s');
    await menu.getByTestId('slide-mark-menu-delete').click();
    expect((await marksOf(page)).map((m) => m.id)).toEqual(['p1', 'p3', 'p4']);
    await expect(mark(page, 'p2')).toHaveCount(0);
    await undo(page);
    expect(await marksOf(page)).toEqual(MARKS);
  });

  test('is not there while the mode is off', async ({ page }) => {
    await openTimeline(page, ONE_CLIP);
    const ruler = await box(page.getByTestId('timeline-ruler'));
    await page.mouse.click(ruler.x + 1.5 * PX_PER_SECOND, ruler.y + ruler.height / 2, {
      button: 'right',
    });
    await expect(page.getByTestId('slide-ruler-menu')).toHaveCount(0);
  });

  test('reads the time down the ruler in Zen mode', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: [] } });
    await zen(page);
    const menu = await rulerMenu(page, 1.25);
    await expect(menu.getByTestId('slide-menu-add-pause')).toHaveText('Add pause here (1.25 s)');
    await menu.getByTestId('slide-menu-add-pause').click();
    expect((await marksOf(page)).map((m) => m.time)).toEqual([1.25]);
    // Where something animates, greyed out there too.
    await expect((await rulerMenu(page, 2.5)).getByTestId('slide-menu-add-pause')).toBeDisabled();
  });
});

/** The marks' times, by id. */
async function times(page: Page): Promise<Record<string, number>> {
  return Object.fromEntries((await marksOf(page)).map((m) => [m.id, m.time]));
}

/** Drag a mark by `seconds` along the ruler; `release: false` keeps the button down. */
async function dragMark(
  page: Page,
  id: string,
  seconds: number,
  options: { shift?: boolean; release?: boolean } = {},
): Promise<void> {
  const b = await box(mark(page, id));
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const vertical =
    (await page.getByTestId('timeline-view').getAttribute('data-orientation')) === 'vertical';
  const to = vertical
    ? { x: from.x, y: from.y + seconds * PX_PER_SECOND }
    : { x: from.x + seconds * PX_PER_SECOND, y: from.y };
  await dragTo(page, from, to, options);
}

test.describe('dragging a mark', () => {
  test('moves it inside its zone, on frames, as one step; Escape cancels', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    // A quarter of a second earlier: the zone [1, 2] has room.
    await dragMark(page, 'p1', -0.25, { release: false });
    await expect(mark(page, 'p1')).toHaveAttribute('data-time', '1.25');
    // Its words follow it.
    await expect(page.getByTestId('slide-mark-tip')).toContainText('Pause at 1.25 s');
    await page.mouse.up();
    expect(await times(page)).toEqual({ p1: 1.25, p2: 1.75, p3: 3, p4: 0.5 });
    // Past the end of its zone it stops at the edge: the outro starts at 2 s.
    await dragMark(page, 'p1', 1.5);
    expect((await times(page)).p1).toBe(2);
    // One step each.
    await undo(page);
    expect((await times(page)).p1).toBe(1.25);
    await undo(page);
    expect(await marksOf(page)).toEqual(MARKS);
    // Escape gives a drag up: the mark is back, and nothing is a step.
    await dragMark(page, 'p1', -0.3, { release: false });
    await expect(mark(page, 'p1')).toHaveAttribute('data-time', '1.2');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await marksOf(page)).toEqual(MARKS);
    expect(await canUndo(page)).toBe(false);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('snaps to the playhead while Snap is on, not with Shift held', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(1.3));
    await dragMark(page, 'p1', -0.17);
    expect((await times(page)).p1).toBe(1.3);
    await undo(page);
    await dragMark(page, 'p1', -0.17, { shift: true });
    expect((await times(page)).p1).not.toBe(1.3);
    expect((await times(page)).p1).toBeCloseTo(1.33, 1);
  });

  test('a pause does not land on the frame of another pause', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, {
      slides: { marks: [...MARKS, { id: 'p5', time: 1.75, kind: 'pause' }] },
    });
    // p1 dragged onto the pause at 1.75 s waits short of it.
    await page.getByTestId('timeline-snap').click();
    await dragMark(page, 'p1', 0.25);
    const at = (await times(page)).p1!;
    expect(at).toBeGreaterThan(1.5);
    expect(at).toBeLessThan(1.75);
    // A comment may: p2 is at 1.75 s with it.
    expect((await times(page)).p2).toBe(1.75);
  });

  test('takes a mark out of place to the nearest time where it may stand', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    // The pause at 0.5 s, under the intro: a tenth later, nearer the intro's end than its start.
    await dragMark(page, 'p4', 0.1);
    expect((await times(page)).p4).toBe(1);
    await expect(mark(page, 'p4')).toHaveAttribute('data-standing', 'standing');
    await expect(mark(page, 'p4')).not.toHaveAttribute('data-warned', /.*/);
    // Further, into the zone, it goes where it is dropped.
    await undo(page);
    await dragMark(page, 'p4', 0.85);
    expect((await times(page)).p4).toBe(1.35);
  });

  test('runs down the ruler in Zen mode', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await zen(page);
    await dragMark(page, 'p1', -0.25);
    expect((await times(page)).p1).toBe(1.25);
  });
});

test.describe('the words of a mark', () => {
  test('a double click writes a comment’s words, as one step; never none', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await mark(page, 'p2').dblclick();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Comment at 1.75 s');
    const field = page.getByTestId('dialog-field');
    await expect(field).toHaveValue('A flash\nover the alpha');
    // Emptied, it cannot be saved: the field says why.
    await field.fill('   ');
    await expect(page.getByTestId('dialog-field-error')).toContainText('A comment needs words');
    await expect(page.getByTestId('dialog-confirm')).toBeDisabled();
    await field.fill('A flash\nover the alpha\nand a zoom');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(dialog).toBeHidden();
    expect((await marksOf(page)).find((m) => m.id === 'p2')!.text).toBe(
      'A flash\nover the alpha\nand a zoom',
    );
    await expect(mark(page, 'p2')).toHaveAccessibleName(
      'Comment at 1.75 s: A flash over the alpha and a zoom',
    );
    await undo(page);
    expect(await marksOf(page)).toEqual(MARKS);
    // Escape writes nothing.
    await mark(page, 'p2').dblclick();
    await page.getByTestId('dialog-field').fill('Something else');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await marksOf(page)).toEqual(MARKS);
  });

  test('a pause gets a note from its menu, and loses it when the note is emptied', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await mark(page, 'p1').click({ button: 'right' });
    const words = page.getByTestId('slide-mark-menu-words');
    await expect(words).toHaveText('Add a note…');
    await words.click();
    await expect(page.getByRole('dialog')).toContainText('Note of the pause at 1.50 s');
    await page.getByTestId('dialog-field').fill('Ask the room first');
    await page.getByTestId('dialog-confirm').click();
    expect((await marksOf(page)).find((m) => m.id === 'p1')).toEqual({
      id: 'p1',
      time: 1.5,
      kind: 'pause',
      text: 'Ask the room first',
    });
    await mark(page, 'p1').click({ button: 'right' });
    await expect(words).toHaveText('Edit note…');
    await words.click();
    await expect(page.getByTestId('dialog-field')).toHaveValue('Ask the room first');
    // A note may be emptied: the pause has none then.
    await page.getByTestId('dialog-field').fill('');
    await expect(page.getByTestId('dialog-confirm')).toBeEnabled();
    await page.getByTestId('dialog-confirm').click();
    expect((await marksOf(page)).find((m) => m.id === 'p1')).toEqual({
      id: 'p1',
      time: 1.5,
      kind: 'pause',
    });
    // Two steps.
    await undo(page);
    expect((await marksOf(page)).find((m) => m.id === 'p1')!.text).toBe('Ask the room first');
    await undo(page);
    expect(await marksOf(page)).toEqual(MARKS);
    // A comment's entry.
    await mark(page, 'p2').click({ button: 'right' });
    await expect(words).toHaveText('Edit comment…');
  });
});

test.describe('the keyboard', () => {
  test('Tab reaches the marks in their order, each named with its words', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    // After the keys of the corner, before the tracks.
    await page.getByTestId('timeline-row-zoom-in').focus();
    const names: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''),
      );
    }
    expect(names).toEqual([
      'Pause at 0.50 s',
      'Pause at 1.50 s',
      'Comment at 1.75 s: A flash over the alpha',
      'Pause at 3.00 s: Questions',
    ]);
    // Reached with the keyboard, its words show; one out of place says why.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(mark(page, 'p4')).toBeFocused();
    await expect(page.getByTestId('slide-mark-tip')).toContainText(
      'where the intro of "alpha" runs',
    );
    await expect(mark(page, 'p4')).toHaveAccessibleDescription(/where the intro of "alpha" runs/);
  });

  test('←/→ move the focused mark a frame inside its zone, a step each; not the playhead', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await mark(page, 'p1').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(mark(page, 'p1')).toHaveAttribute('data-time', String(1.516667));
    await expect(mark(page, 'p1')).toBeFocused();
    expect(await playhead(page)).toBe(0);
    await undo(page);
    expect((await times(page)).p1).toBe(1.533333);
    await undo(page);
    await undo(page);
    expect(await marksOf(page)).toEqual(MARKS);
    // Past the other marks of its zone, it keeps the focus.
    await mark(page, 'p2').focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
    expect((await times(page)).p2).toBeCloseTo(1.416667, 5);
    await expect(mark(page, 'p2')).toBeFocused();
    // At the edge of its zone it stays: the intro ends at 1 s.
    await mark(page, 'p1').focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft');
    expect((await times(page)).p1).toBe(1);
  });

  test('Delete removes the focused mark, not the selected clip; Enter writes its words; Shift+F10 its menu', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await page.getByTestId('clip-c1').click();
    await mark(page, 'p1').focus();
    await page.keyboard.press('Delete');
    expect((await marksOf(page)).map((m) => m.id)).toEqual(['p2', 'p3', 'p4']);
    expect(await page.getByTestId('clip-c1').count()).toBe(1);
    // The focus goes on to the next mark.
    await expect(mark(page, 'p2')).toBeFocused();
    await page.keyboard.press('Backspace');
    await expect(mark(page, 'p3')).toBeFocused();
    await undo(page);
    await undo(page);
    expect(await marksOf(page)).toEqual(MARKS);
    // Enter: the words.
    await mark(page, 'p3').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('dialog-field')).toHaveValue('Questions');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(mark(page, 'p3')).toBeFocused();
    // Shift+F10: its menu, whose first entry has the focus; Escape gives it back.
    await page.keyboard.press('Shift+F10');
    await expect(page.getByTestId('slide-mark-menu')).toBeVisible();
    await expect(page.getByTestId('slide-mark-menu-words')).toBeFocused();
    await expect(page.getByTestId('slide-mark-menu-delete')).toHaveText('Delete (Del)');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('slide-mark-menu')).toHaveCount(0);
    await expect(mark(page, 'p3')).toBeFocused();
  });

  test('P and Shift+P add a pause and a comment at the playhead, where the scene rests', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP);
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(1.25));
    // Off, the keys are nobody's.
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('p');
    expect(await slidesOf(page)).toBeNull();
    await page.getByTestId('timeline-slides').click();
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('p');
    expect((await marksOf(page)).map((m) => [m.time, m.kind])).toEqual([[1.25, 'pause']]);
    // Again on that frame: not added, a notice says so.
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('p');
    await expect(page.getByTestId('notice').last()).toContainText('A pause is at 1.25 s already');
    expect(await marksOf(page)).toHaveLength(1);
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('Shift+P');
    await expect(page.getByRole('dialog')).toContainText('Comment at 1.25 s');
    await page.keyboard.type('Say it twice');
    await page.keyboard.press('ControlOrMeta+Enter');
    expect((await marksOf(page)).map((m) => [m.time, m.kind, m.text])).toEqual([
      [1.25, 'comment', 'Say it twice'],
      [1.25, 'pause', undefined],
    ]);
    // Where something animates, a notice names it and nothing is added.
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(0.5));
    await page.getByTestId('panel-preview').locator('.panel-title').click();
    await page.keyboard.press('p');
    await expect(page.getByTestId('notice').last()).toContainText('No pause at 0.50 s');
    await expect(page.getByTestId('notice').last()).toContainText('The intro of "alpha" runs then');
    expect(await marksOf(page)).toHaveLength(2);
    // Typed into a field, the letter is the field's.
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(1.5));
    const field = await someTextField(page);
    await field.focus();
    await page.keyboard.press('p');
    await page.keyboard.press('Shift+P');
    await expect(field).toHaveValue('pP');
    expect(await marksOf(page)).toHaveLength(2);
  });

  test('View ▸ Add pause / comment at the playhead, while the mode is on', async ({ page }) => {
    await openTimeline(page, ONE_CLIP);
    await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(1.5));
    await page.getByTestId('menu-view').click();
    const pauseItem = page.getByTestId('menu-item-view-slides-add-pause');
    const commentItem = page.getByTestId('menu-item-view-slides-add-comment');
    await expect(pauseItem).toBeDisabled();
    await expect(commentItem).toBeDisabled();
    await expect(pauseItem.locator('.menu-shortcut')).toHaveText('P');
    await page.getByTestId('menu-item-view-slides').click();
    await page.getByTestId('menu-view').click();
    await expect(pauseItem).toBeEnabled();
    await pauseItem.click();
    expect((await marksOf(page)).map((m) => m.time)).toEqual([1.5]);
    await page.getByTestId('menu-view').click();
    await commentItem.click();
    await expect(page.getByRole('dialog')).toContainText('Comment at 1.50 s');
  });

  test('«Add a pause after every animation»: one where each rest starts, a step; the rest by hand', async ({
    page,
  }) => {
    // alpha on [0, 3] and beta on [3, 6], with intros and outros of 1 s: the scene rests over
    // [1, 2] and [4, 5], and at the instant 3 s between the outro of one and the intro of the other.
    const two = [clipJson('c1', 'fa', 't1', 0, 3), clipJson('c2', 'fb', 't2', 3, 6)];
    await openTimeline(page, two, {
      slides: { marks: [{ id: 'p1', time: 4.5, kind: 'pause' }] },
    });
    await page.getByTestId('menu-view').click();
    const item = page.getByTestId('menu-item-view-slides-add-pauses');
    await expect(item).toHaveText('Add a pause after every animation');
    await item.click();
    // The rest that had a pause keeps it and gets no other.
    expect((await marksOf(page)).map((m) => [m.kind, m.time])).toEqual([
      ['pause', 1],
      ['pause', 3],
      ['pause', 4.5],
    ]);
    await expect(page.getByTestId('notice').last()).toContainText('Added 2 pauses');
    // The first one added has the focus: Delete removes it and goes on to the next.
    const [first, second] = await marksOf(page);
    await expect(mark(page, first!.id)).toBeFocused();
    await page.keyboard.press('Delete');
    await expect(mark(page, second!.id)).toBeFocused();
    expect((await marksOf(page)).map((m) => m.time)).toEqual([3, 4.5]);
    // One step for the deletion, one for all the pauses added.
    await undo(page);
    await undo(page);
    expect((await marksOf(page)).map((m) => m.time)).toEqual([4.5]);

    // From the ruler's menu, wherever it is opened — on an animation too.
    const menu = await rulerMenu(page, 0.5);
    await expect(menu.getByTestId('slide-menu-add-pause')).toBeDisabled();
    await menu.getByTestId('slide-menu-add-pauses').click();
    expect((await marksOf(page)).map((m) => m.time)).toEqual([1, 3, 4.5]);
    // Again: nothing to add, and a notice says so.
    await (await rulerMenu(page, 0.5)).getByTestId('slide-menu-add-pauses').click();
    await expect(page.getByTestId('notice').last()).toContainText('No pause to add');
    expect(await marksOf(page)).toHaveLength(3);
  });

  test('«Add a pause after every animation» is greyed out while the mode is off', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP);
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('menu-item-view-slides-add-pauses')).toBeDisabled();
  });

  test('in Zen mode ↑/↓ move a mark along the time', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: MARKS } });
    await zen(page);
    await mark(page, 'p1').focus();
    await page.keyboard.press('ArrowDown');
    await expect(mark(page, 'p1')).toHaveAttribute('data-time', String(1.516667));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(mark(page, 'p1')).toHaveAttribute('data-time', String(1.483333));
  });
});

/** On ONE_CLIP: a pause at 1.5 s that skips its wait — to 2 s, where the outro starts —, one at
 * 3 s, the end of the scene, that has nothing to skip, one under the intro that skips (out of
 * place: amber), a pause that keeps its wait and a comment. */
const SKIPS: SlideMarkJson[] = [
  { id: 'p1', time: 1.5, kind: 'pause', skipWait: true },
  { id: 'p2', time: 3, kind: 'pause', skipWait: true, text: 'Questions' },
  { id: 'p3', time: 0.5, kind: 'pause', skipWait: true },
  { id: 'p4', time: 1.25, kind: 'pause' },
  { id: 'p5', time: 1.75, kind: 'comment', text: 'Look' },
];

/** The colour a CSS colour token computes to on the page. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);

const fillOf = (page: Page, id: string) =>
  style(mark(page, id).locator('.tl-slide-mark-shape'), 'fill');

/** The stretches drawn along the ruler: the mark, start and end of each. */
async function skipSpans(page: Page): Promise<[string, number, number][]> {
  return page
    .getByTestId('slide-skip-span')
    .evaluateAll((all) =>
      all.map((span): [string, number, number] => [
        span.getAttribute('data-mark-id')!,
        Number(span.getAttribute('data-start')),
        Number(span.getAttribute('data-end')),
      ]),
    );
}

test.describe('a pause that skips its wait', () => {
  test('is violet with «‖▸», says how long, and the stretch it skips runs along the ruler', async ({
    page,
  }) => {
    // p4 keeps its wait and stands in p1's rest before it: p1 skips to the outro at 2 s.
    await openTimeline(page, ONE_CLIP, { slides: { marks: SKIPS } });
    await expect(mark(page, 'p1')).toHaveAttribute('data-skip-wait', 'true');
    await expect(mark(page, 'p4')).not.toHaveAttribute('data-skip-wait', /.*/);
    await expect(mark(page, 'p1').locator('.tl-slide-mark-glyph.is-skip .is-arrow')).toHaveCount(1);
    await expect(mark(page, 'p4').locator('.is-arrow')).toHaveCount(0);
    // Violet, in both themes; one with a warning stays amber.
    const paint = async () => ({
      skip: await tokenColour(page, '--slide-skip'),
      p1: await fillOf(page, 'p1'),
      p2: await fillOf(page, 'p2'),
      p3: await fillOf(page, 'p3'),
      p4: await fillOf(page, 'p4'),
      warning: await tokenColour(page, '--warning'),
    });
    const dark = await paint();
    expect(dark.p1).toBe(dark.skip);
    expect(dark.p2).toBe(dark.skip);
    expect(dark.p3).toBe(dark.warning);
    expect(dark.p4).not.toBe(dark.skip);
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const light = await paint();
    expect(light.p1).toBe(light.skip);
    expect(light.skip).not.toBe(dark.skip);
    expect(light.p3).toBe(light.warning);
    // Its name says it skips its wait, and how long; one with nothing to skip says so.
    await expect(mark(page, 'p1')).toHaveAccessibleName('Pause at 1.50 s (skips its wait: 0.50 s)');
    await expect(mark(page, 'p2')).toHaveAccessibleName(
      'Pause at 3.00 s (skips its wait: none here): Questions',
    );
    await expect(mark(page, 'p4')).toHaveAccessibleName('Pause at 1.25 s');
    // The line of what it skips: one, from the pause to where the outro starts, in the ruler
    // under its numbers; none for the pauses with nothing to skip.
    expect(await skipSpans(page)).toEqual([['p1', 1.5, 2]]);
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const span = await box(page.getByTestId('slide-skip-span'));
    expect(span.x).toBeCloseTo(ruler.x + 1.5 * PX_PER_SECOND, 0);
    expect(span.x + span.width).toBeCloseTo(ruler.x + 2 * PX_PER_SECOND, 0);
    expect(span.y).toBeGreaterThan(ruler.y + 14);
    expect(span.y + span.height).toBeLessThan(ruler.y + ruler.height);
    expect(await style(page.getByTestId('slide-skip-span'), 'background-color')).toBe(light.skip);
    // It lets a press through to the ruler: the playhead goes there.
    await page.mouse.click(span.x + span.width / 2, span.y + 1);
    await expect.poll(() => playhead(page)).toBeCloseTo(1.75, 1);
    // The tooltip says how long, and where the scene goes on; or why it skips nothing.
    const tip = page.getByTestId('slide-mark-tip');
    await mark(page, 'p1').hover();
    await expect(page.getByTestId('slide-mark-tip-skip')).toHaveText(
      'Skips its wait: 0.50 s — the scene goes on at 2.00 s.',
    );
    await mark(page, 'p2').hover();
    await expect(tip).toContainText('Pause at 3.00 s');
    await expect(page.getByTestId('slide-mark-tip-skip')).toHaveText(
      'Skips its wait: none here. No animation follows this pause: the scene only ends after it.',
    );
    await mark(page, 'p4').hover();
    await expect(page.getByTestId('slide-mark-tip-skip')).toHaveCount(0);
    // Its line down the tracks is violet too.
    await expect(page.getByTestId('slide-line-p1')).toHaveClass(/is-skip/);
    await expect(page.getByTestId('slide-line-p4')).not.toHaveClass(/is-skip/);
  });

  test('follows an edit as it is made, a drag included', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, {
      slides: { marks: [{ id: 'p1', time: 1.5, kind: 'pause', skipWait: true }] },
    });
    expect(await skipSpans(page)).toEqual([['p1', 1.5, 2]]);
    // The clip half a second later, the pointer still down: the outro starts at 2.5 s.
    await moveClip(page, 'c1', 0.5, { release: false });
    await expect.poll(() => skipSpans(page)).toEqual([['p1', 1.5, 2.5]]);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect.poll(() => skipSpans(page)).toEqual([['p1', 1.5, 2]]);
    // The pause dragged along its rest: the line starts where it is.
    await dragMark(page, 'p1', -0.25, { release: false });
    await expect.poll(() => skipSpans(page)).toEqual([['p1', 1.25, 2]]);
    await page.mouse.up();
    expect(await marksOf(page)).toEqual([{ id: 'p1', time: 1.25, kind: 'pause', skipWait: true }]);
  });

  test('its menu has «Skip the wait after it», a step each way; greyed where there is nothing to skip', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, {
      slides: {
        marks: [
          { id: 'p1', time: 1.5, kind: 'pause', text: 'Ask' },
          { id: 'p2', time: 3, kind: 'pause' },
          { id: 'p5', time: 1.75, kind: 'comment', text: 'Look' },
        ],
      },
    });
    const skipItem = page.getByTestId('slide-mark-menu-skip');
    await mark(page, 'p1').click({ button: 'right' });
    await expect(skipItem).toHaveRole('menuitemcheckbox');
    await expect(skipItem).toHaveText('Skip the wait after it');
    await expect(skipItem).toHaveAttribute('aria-checked', 'false');
    await expect(skipItem).toBeEnabled();
    await expect(page.getByTestId('slide-mark-menu-skip-why')).toHaveCount(0);
    await skipItem.click();
    await expect(page.getByTestId('slide-mark-menu')).toHaveCount(0);
    expect((await marksOf(page))[0]).toEqual({
      id: 'p1',
      time: 1.5,
      kind: 'pause',
      text: 'Ask',
      skipWait: true,
    });
    await expect(mark(page, 'p1')).toHaveAttribute('data-skip-wait', 'true');
    expect(await skipSpans(page)).toEqual([['p1', 1.5, 2]]);
    // Ticked now; cleared, the field goes.
    await mark(page, 'p1').click({ button: 'right' });
    await expect(skipItem).toHaveAttribute('aria-checked', 'true');
    await skipItem.click();
    expect((await marksOf(page))[0]).toEqual({ id: 'p1', time: 1.5, kind: 'pause', text: 'Ask' });
    await expect(page.getByTestId('slide-skip-span')).toHaveCount(0);
    // A step each.
    await undo(page);
    expect((await marksOf(page))[0]!.skipWait).toBe(true);
    await undo(page);
    expect((await marksOf(page))[0]).toEqual({ id: 'p1', time: 1.5, kind: 'pause', text: 'Ask' });
    // At the end of the scene there is nothing to skip: greyed out, and a line says why.
    await mark(page, 'p2').click({ button: 'right' });
    await expect(skipItem).toBeDisabled();
    await expect(page.getByTestId('slide-mark-menu-skip-why')).toHaveText(
      'No animation follows this pause: the scene only ends after it.',
    );
    await expect(skipItem).toHaveAccessibleDescription(/No animation follows this pause/);
    await page.keyboard.press('Escape');
    // A comment has no such entry.
    await mark(page, 'p5').click({ button: 'right' });
    await expect(page.getByTestId('slide-mark-menu')).toBeVisible();
    await expect(skipItem).toHaveCount(0);
  });

  test('one that skips with nothing to skip can still be cleared from its menu', async ({
    page,
  }) => {
    await openTimeline(page, ONE_CLIP, {
      slides: { marks: [{ id: 'p2', time: 3, kind: 'pause', skipWait: true }] },
    });
    await mark(page, 'p2').click({ button: 'right' });
    const skipItem = page.getByTestId('slide-mark-menu-skip');
    await expect(skipItem).toHaveAttribute('aria-checked', 'true');
    await expect(skipItem).toBeEnabled();
    await expect(page.getByTestId('slide-mark-menu-skip-why')).toBeVisible();
    // From the keyboard: Shift+F10 on the mark, then the entry.
    await page.keyboard.press('Escape');
    await mark(page, 'p2').focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByTestId('slide-mark-menu-words')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(skipItem).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await marksOf(page)).toEqual([{ id: 'p2', time: 3, kind: 'pause' }]);
  });

  test('is told apart under forced colours, its stretch seen', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openTimeline(page, ONE_CLIP, { slides: { marks: SKIPS } });
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await fillOf(page, 'p1')).not.toBe(canvas);
    expect(await fillOf(page, 'p1')).not.toBe(await fillOf(page, 'p4'));
    expect(await fillOf(page, 'p1')).not.toBe(await fillOf(page, 'p3'));
    expect(await style(page.getByTestId('slide-skip-span'), 'background-color')).not.toBe(canvas);
    expect(await style(page.getByTestId('slide-line-p1'), 'border-left-color')).not.toBe(
      await style(page.getByTestId('slide-line-p4'), 'border-left-color'),
    );
  });

  test('runs down the ruler in Zen mode', async ({ page }) => {
    await openTimeline(page, ONE_CLIP, { slides: { marks: SKIPS } });
    await zen(page);
    const ruler = await box(page.getByTestId('timeline-ruler'));
    const span = await box(page.getByTestId('slide-skip-span'));
    expect(span.y).toBeCloseTo(ruler.y + 1.5 * PX_PER_SECOND, 0);
    expect(span.y + span.height).toBeCloseTo(ruler.y + 2 * PX_PER_SECOND, 0);
    expect(span.x).toBeGreaterThan(ruler.x);
    expect(span.x + span.width).toBeLessThan(ruler.x + ruler.width - 14);
  });
});

test.describe('the commands over every pause', () => {
  // alpha on [0, 3] and beta on [3, 6], with intros and outros of 1 s: the scene rests over
  // [1, 2] and [4, 5], and at the instant 3 s between the outro of one and the intro of the other.
  const two = [clipJson('c1', 'fa', 't1', 0, 3), clipJson('c2', 'fb', 't2', 3, 6)];
  const EVERY: SlideMarkJson[] = [
    { id: 'p1', time: 1, kind: 'pause', text: 'Ask' },
    { id: 'p2', time: 3, kind: 'pause' },
    { id: 'p3', time: 4.5, kind: 'pause' },
    { id: 'p4', time: 4.25, kind: 'comment', text: 'Look' },
  ];
  const skipping = async (page: Page) =>
    (await marksOf(page)).filter((m) => m.skipWait).map((m) => m.id);

  test('View ▸ «Skip the wait at every pause» and «Keep the wait at every pause», a step each', async ({
    page,
  }) => {
    await openTimeline(page, two, { slides: { marks: EVERY } });
    await page.getByTestId('menu-view').click();
    const skip = page.getByTestId('menu-item-view-slides-skip-every');
    await expect(skip).toHaveText('Skip the wait at every pause');
    await skip.click();
    // The instant between two animations has no wait to skip: it is left as it is.
    expect(await skipping(page)).toEqual(['p1', 'p3']);
    expect(await skipSpans(page)).toEqual([
      ['p1', 1, 2],
      ['p3', 4.5, 5],
    ]);
    await expect(page.getByTestId('notice').last()).toContainText('2 pauses skip their wait now');
    await expect(page.getByTestId('notice').last()).toContainText(
      '1 pause with no wait to skip stays as it was.',
    );
    // A pause by hand back to its wait; then all of them.
    await mark(page, 'p3').click({ button: 'right' });
    await page.getByTestId('slide-mark-menu-skip').click();
    expect(await skipping(page)).toEqual(['p1']);
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menu-item-view-slides-keep-every').click();
    expect(await skipping(page)).toEqual([]);
    expect((await marksOf(page)).some((m) => 'skipWait' in m)).toBe(false);
    await expect(page.getByTestId('notice').last()).toContainText('1 pause keeps its wait now');
    await expect(page.getByTestId('slide-skip-span')).toHaveCount(0);
    // Three steps.
    await undo(page);
    expect(await skipping(page)).toEqual(['p1']);
    await undo(page);
    expect(await skipping(page)).toEqual(['p1', 'p3']);
    await undo(page);
    expect(await marksOf(page)).toEqual(EVERY);
    // Again with nothing to change: a notice says why, and nothing is a step.
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menu-item-view-slides-keep-every').click();
    await expect(page.getByTestId('notice').last()).toContainText('No pause skips its wait.');
    expect(await canUndo(page)).toBe(false);
  });

  test('from the ruler’s menu too, wherever it is opened', async ({ page }) => {
    await openTimeline(page, two, { slides: { marks: EVERY } });
    const menu = await rulerMenu(page, 0.5);
    await expect(menu.getByTestId('slide-menu-add-pause')).toBeDisabled();
    await menu.getByTestId('slide-menu-skip-every').click();
    expect(await skipping(page)).toEqual(['p1', 'p3']);
    await (await rulerMenu(page, 1.5)).getByTestId('slide-menu-keep-every').click();
    expect(await skipping(page)).toEqual([]);
    await expect((await rulerMenu(page, 1.5)).getByTestId('slide-menu-keep-every')).toHaveText(
      'Keep the wait at every pause',
    );
  });

  test('«Delete every pause…» asks first, then leaves the comments, as one step', async ({
    page,
  }) => {
    await openTimeline(page, two, {
      slides: { marks: [...EVERY.slice(0, 3).map((m) => ({ ...m, skipWait: true })), EVERY[3]!] },
    });
    await page.getByTestId('menu-view').click();
    const item = page.getByTestId('menu-item-view-slides-delete-pauses');
    await expect(item).toHaveText('Delete every pause…');
    await item.click();
    // The question: how many go, what stays, and the button of a deletion, which is held.
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Delete every pause?');
    await expect(dialog).toContainText(
      'The scene has 3 pauses: they go, with their notes and whether they skip their wait. ' +
        'The comment stays. Undo brings them back.',
    );
    await expect(page.getByTestId('dialog-confirm')).toHaveText('Hold to delete 3 pauses');
    // A click is not a hold; and Cancel leaves everything, with no step.
    await page.getByTestId('dialog-confirm').click();
    await expect(dialog).toBeVisible();
    await page.getByTestId('dialog-cancel').click();
    await expect(dialog).toHaveCount(0);
    expect(await marksOf(page)).toHaveLength(4);
    expect(await canUndo(page)).toBe(false);
    // Asked again, and held.
    await page.getByTestId('menu-view').click();
    await item.click();
    await holdToConfirm(page);
    expect(await marksOf(page)).toEqual([EVERY[3]]);
    await expect(page.getByTestId('notice').last()).toContainText('Deleted 3 pauses');
    await expect(page.getByTestId('notice').last()).toContainText(
      'The comment stays. Undo brings the pauses back.',
    );
    await expect(page.locator('[data-testid^="slide-line-"]')).toHaveCount(0);
    // The comment left has the focus.
    await expect(mark(page, 'p4')).toBeFocused();
    // With no pause left, it is greyed out.
    await page.getByTestId('menu-view').click();
    await expect(item).toBeDisabled();
    await page.keyboard.press('Escape');
    // One step brings them back, as they were.
    await undo(page);
    expect((await marksOf(page)).map((m) => [m.id, m.skipWait])).toEqual([
      ['p1', true],
      ['p2', true],
      ['p3', true],
      ['p4', undefined],
    ]);
    // From the ruler's menu: without a comment left, the focus goes to the mode's button.
    await mark(page, 'p4').click({ button: 'right' });
    await page.getByTestId('slide-mark-menu-delete').click();
    const menu = await rulerMenu(page, 1.5);
    await expect(menu.getByTestId('slide-menu-delete-pauses')).toBeEnabled();
    await expect(menu.getByTestId('slide-menu-delete-pauses')).toHaveText('Delete every pause…');
    await menu.getByTestId('slide-menu-delete-pauses').click();
    await expect(page.getByTestId('dialog-confirm')).toHaveText('Hold to delete 3 pauses');
    await holdToConfirm(page);
    expect(await marksOf(page)).toEqual([]);
    await expect(page.getByTestId('timeline-slides')).toBeFocused();
    await expect(
      (await rulerMenu(page, 1.5)).getByTestId('slide-menu-delete-pauses'),
    ).toBeDisabled();
  });

  test('are greyed out while the scene has no pause, in the View menu and on the ruler', async ({
    page,
  }) => {
    // The mode is on, with a comment and no pause.
    await openTimeline(page, two, { slides: { marks: [EVERY[3]!] } });
    await page.getByTestId('menu-view').click();
    for (const id of ['skip-every', 'keep-every', 'delete-pauses']) {
      await expect(page.getByTestId(`menu-item-view-slides-${id}`), id).toBeDisabled();
    }
    // What adds marks is not: the mode is on.
    await expect(page.getByTestId('menu-item-view-slides-add-pauses')).toBeEnabled();
    await page.keyboard.press('Escape');
    const menu = await rulerMenu(page, 1.5);
    for (const id of ['skip-every', 'keep-every', 'delete-pauses']) {
      await expect(menu.getByTestId(`slide-menu-${id}`), id).toBeDisabled();
    }
    await expect(menu.getByTestId('slide-menu-add-pauses')).toBeEnabled();
    await page.keyboard.press('Escape');
    // One pause, and the three answer.
    await (await rulerMenu(page, 1.5)).getByTestId('slide-menu-add-pause').click();
    await page.getByTestId('menu-view').click();
    for (const id of ['skip-every', 'keep-every', 'delete-pauses']) {
      await expect(page.getByTestId(`menu-item-view-slides-${id}`), id).toBeEnabled();
    }
  });

  test('are greyed out while the mode is off', async ({ page }) => {
    await openTimeline(page, two);
    await page.getByTestId('menu-view').click();
    for (const id of ['skip-every', 'keep-every', 'delete-pauses']) {
      await expect(page.getByTestId(`menu-item-view-slides-${id}`), id).toBeDisabled();
    }
  });
});

// The words of a comment are asked for in a dialog, and a file chosen in File → Open… may arrive
// while it is open: the document under the dialog is then another one, which may have a mark of
// the same id at the same time (a copy of the file, an earlier revision). The words were meant for
// the document they were asked in, and are written nowhere else. The files are real ones of the
// origin-private file system; the test holds only the moment the second one's text arrives.
test.describe('words asked for in one document and given when another has opened', () => {
  type HeldWindow = Window & { heldRead: { release: (() => void) | null } };

  const talk = (name: string) =>
    projectFile(name, [], [], {
      meta: {
        name,
        target: 'ce',
        width: 320,
        height: 180,
        fps: 30,
        background: '#000000',
        preamble: '',
        duration: 4,
      },
      tracks: [{ id: 't1', name: 'Track 1', hidden: false, locked: false }],
      slides: { marks: [{ id: 'shared', kind: 'comment', time: 1, text: `${name} original` }] },
    });
  const FILES = [
    { name: 'first.mfe.json', contents: talk('First talk') },
    { name: 'second.mfe.json', contents: talk('Second talk') },
  ];
  const SECOND_MARKS: SlideMarkJson[] = [
    { id: 'shared', kind: 'comment', time: 1, text: 'Second talk original' },
  ];

  /** The first talk is open and saved, and the second one is chosen in File → Open…: its text is
   * on its way, held until `heldRead.release` is called. */
  async function openFirstAndChooseSecond(page: Page): Promise<void> {
    await page.addInitScript((files) => {
      const host = window as unknown as HeldWindow;
      host.heldRead = { release: null };
      const read = File.prototype.text;
      File.prototype.text = async function (this: File) {
        const contents = await read.call(this);
        if (this.name === 'second.mfe.json') {
          File.prototype.text = read;
          await new Promise<void>((done) => {
            host.heldRead.release = done;
          });
        }
        return contents;
      };
      let index = 0;
      Object.defineProperty(window, 'showOpenFilePicker', {
        configurable: true,
        value: async () => {
          const file = files[index++];
          if (!file) throw new Error('unexpected picker call');
          const directory = await navigator.storage.getDirectory();
          const handle = await directory.getFileHandle(file.name, { create: true });
          const writer = await handle.createWritable();
          await writer.write(file.contents);
          await writer.close();
          return [handle];
        },
      });
    }, FILES);
    await page.goto('/');
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    const openOther = async () => {
      await page.keyboard.press('ControlOrMeta+o');
      await page.getByTestId('projects-other').click();
    };
    await openOther();
    await expect(page.getByTestId('doc-file')).toHaveText('first.mfe.json');
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    await openOther();
    await page.waitForFunction(() => (window as unknown as HeldWindow).heldRead.release !== null);
  }

  for (const action of ['a comment’s words changed', 'a comment added'] as const) {
    test(`${action}: the document that opened meanwhile keeps its marks`, async ({ page }) => {
      await openFirstAndChooseSecond(page);
      const field = page.getByTestId('dialog-field');
      if (action === 'a comment’s words changed') {
        await page.getByTestId('slide-mark-shared').click({ button: 'right' });
        await page.getByTestId('slide-mark-menu-words').click();
        await expect(field).toHaveValue('First talk original');
      } else {
        await page.getByTestId('panel-preview').locator('.panel-title').click();
        await page.keyboard.press('Shift+P');
        await expect(field).toHaveValue('');
      }
      await field.fill('Words meant for the first talk');
      // Nothing is written yet: the first talk is still saved, so the second opens unasked.
      await expect(page.getByTestId('doc-status')).toHaveText('Saved');
      await page.evaluate(() => (window as unknown as HeldWindow).heldRead.release!());
      await expect(page.getByTestId('doc-file')).toHaveText('second.mfe.json');
      await expect(page.getByTestId('project-name')).toContainText('Second talk');
      // The question is still there, over the other document: answering it writes nothing.
      await page.getByTestId('dialog-confirm').click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await marksOf(page)).toEqual(SECOND_MARKS);
      await expect(page.getByTestId('doc-status')).toHaveText('Saved');
      expect(await canUndo(page)).toBe(false);
      // Nor does the file get them with the next Save.
      await page.keyboard.press('ControlOrMeta+s');
      await expect(page.getByTestId('doc-status')).toHaveText('Saved');
      const onDisk = await page.evaluate(async () => {
        const directory = await navigator.storage.getDirectory();
        const handle = await directory.getFileHandle('second.mfe.json');
        const data = JSON.parse(await (await handle.getFile()).text()) as {
          slides: { marks: unknown[] };
        };
        return data.slides.marks;
      });
      expect(onDisk).toEqual(SECOND_MARKS);
    });
  }
});
