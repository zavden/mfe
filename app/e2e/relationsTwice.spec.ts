import { expect, test, type Page } from './test';
import { clipOf, setTime } from './timelineHelpers';
import {
  glyph,
  openRelationScene,
  plain,
  relations,
  relationTab,
  selectClip,
  selectRelation,
  type StoredRelation,
} from './relationsHelpers';

/* Two clips with several relations (D165). f1 = a+b=c on track 1 over [0, 6]; f2 = a=3+1 on
 * track 2 over [2, 8]; r1 turns the "a" of f1 into the "a" of f2 over [2, 3]. */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);
const relation = (id: string, offset: number, from: number, to: number) => ({
  id,
  fromClipId: 'a',
  toClipId: 'b',
  offset,
  duration: 1,
  easing: 'smooth',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [from], to: [to], style: null }],
});
const R1 = relation('r1', 0, 0, 0);
/** The "b" of f1 into the "3" of f2 over [4, 5]. */
const R2 = relation('r2', 2, 2, 2);

async function askBetween(page: Page): Promise<void> {
  await selectClip(page, 'a');
  await page.getByTestId('create-relation-other').selectOption('b');
  await page.getByTestId('create-relation-button').click();
  await expect(page.getByTestId('relation-choice')).toBeVisible();
}

test.describe('several relations between two clips', () => {
  test('the button of two related clips asks: edit theirs, or add another', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [R1] });
    await selectClip(page, 'a');
    await page.getByTestId('create-relation-other').selectOption('b');
    const button = page.getByTestId('create-relation-button');
    await expect(button).toHaveText('Edit or add a relation…');
    // The other direction has none: it is a plain Create.
    await page.getByTestId('create-relation-direction-in').click();
    await expect(button).toHaveText('Create relation…');
    await page.getByTestId('create-relation-direction-out').click();

    await button.click();
    const menu = page.getByTestId('relation-choice');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('relation-choice-header')).toHaveText('f1 → f2 · 1 relation');
    await expect(page.getByTestId('relation-choice-edit-1')).toHaveText(
      'Edit relation 1…2.00–3.00 s · 1 pair',
    );
    // The menu opens under the button, inside the window.
    const at = (await menu.boundingBox())!;
    const from = (await button.boundingBox())!;
    expect(at.y).toBeGreaterThanOrEqual(from.y + from.height);
    // Escape closes it, and nothing was opened.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByTestId('relation-editor')).toBeHidden();

    // Add another: a second relation between the same two clips, with its own glyphs.
    await button.click();
    await page.getByTestId('relation-choice-add').click();
    await expect(page.getByTestId('relation-editor')).toContainText('Relation 2 of 2: f1 → f2');
    await glyph(page, 'from', 'b').click();
    await glyph(page, 'to', '3').click();
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    const saved = await relations(page);
    expect(saved).toHaveLength(2);
    const [first, second] = saved as [StoredRelation, StoredRelation];
    expect(first.id).toBe('r1');
    expect(second).toMatchObject({ fromClipId: 'a', toClipId: 'b' });
    expect(second.pairs).toEqual([{ from: [2], to: [2], style: null }]);
    // Its window comes right after the first one's ([2, 3] → [3, 4]): the two do not lie one
    // over the other on the timeline.
    expect(second.offset).toBe(first.offset + first.duration);
    expect(second.duration).toBe(1);
    await expect(page.getByTestId('issues-section')).toHaveCount(0);

    // Both are listed, numbered, and drawn on the timeline.
    await expect(page.getByTestId('relation-number-r1')).toHaveText('1 of 2');
    await expect(page.getByTestId(`relation-number-${second.id}`)).toHaveText('2 of 2');
    await expect(page.getByTestId('relation-window-r1')).toBeVisible();
    await expect(page.getByTestId(`relation-window-${second.id}`)).toBeVisible();
    // The clips are untouched.
    expect((await clipOf(page, 'b')).start).toBe(2);
  });

  test('the menu opens the relation it names', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [R1, R2] });
    await askBetween(page);
    await expect(page.getByTestId('relation-choice-header')).toHaveText('f1 → f2 · 2 relations');
    await expect(page.getByTestId('relation-choice-edit-2')).toHaveText(
      'Edit relation 2…4.00–5.00 s · 1 pair',
    );
    await page.getByTestId('relation-choice-edit-2').click();
    await expect(page.getByTestId('relation-editor')).toContainText('Relation 2 of 2: f1 → f2');
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('b → 3');
    await page.getByTestId('rel-cancel').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    // Its band on the timeline and its own panel name it by the same number.
    await expect(page.getByTestId('relation-window-r2')).toHaveAttribute(
      'title',
      /^Relation 2 of 2, f1 → f2: window 4\.00–5\.00 s/,
    );
    await selectRelation(page, 'r2');
    await expect(page.getByTestId('relation-properties')).toContainText('Relation 2 of 2');
    await selectClip(page, 'a');
    await page.getByTestId('create-relation-other').selectOption('b');

    await page.getByTestId('create-relation-button').click();
    await page.getByTestId('relation-choice-edit-1').click();
    await expect(page.getByTestId('relation-editor')).toContainText('Relation 1 of 2: f1 → f2');
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('a → a');
  });

  test('the editor of a second relation dims the glyphs the first one took', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [R1] });
    await askBetween(page);
    await page.getByTestId('relation-choice-add').click();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    // The new window comes after the first ([3, 4]). The "a" of f2 came through the first
    // relation: no second pair can bring it. The "a" of f1 was consumed by it: it is gone.
    const target = glyph(page, 'to', 'a');
    const source = glyph(page, 'from', 'a');
    await expect(target).toHaveAttribute('data-eligible', 'false');
    await expect(target).toHaveClass(/is-ineligible/);
    await expect(target.locator('title')).toHaveText(
      '0: a — brought in by relation 1 of 2 (f1 → f2)',
    );
    await expect(source).toHaveAttribute('data-eligible', 'false');
    await expect(source.locator('title')).toHaveText(
      '0: a — consumed earlier by relation 1 of 2 (f1 → f2)',
    );
    await expect(glyph(page, 'to', '3')).toHaveAttribute('data-eligible', 'true');
    await expect(page.getByTestId('rel-taken-hint')).toContainText('Dimmed glyphs are taken');

    // The suggestion by label leaves both out.
    await page.getByTestId('rel-auto-link').click();
    await expect(page.getByTestId('rel-suggestion')).toContainText('= → =');
    await expect(page.getByTestId('rel-suggestion')).toContainText('+ → +');
    await expect(page.getByTestId('rel-suggestion')).not.toContainText('a → a');
    await page.getByTestId('rel-suggestion-dismiss').click();

    // Moved to start with the first, the "a" of f1 is still there to copy: noted, not dimmed.
    await relationTab(page, 'animation');
    await page.getByTestId('rel-offset').fill('0');
    await page.getByTestId('rel-offset').press('Enter');
    await expect(source).toHaveAttribute('data-eligible', 'true');
    await expect(source.locator('title')).toHaveText(
      '0: a — relation 1 of 2 (f1 → f2) consumes it: here it can only be copied',
    );
    // Outlined in red dashes, as a source a pair of this relation consumes (D184).
    await expect(source).toHaveAttribute('data-consumed', 'true');
  });

  test('two relations with the same window share the lane in two stripes, each one reachable', async ({
    page,
  }) => {
    // r3 moves the "b" of f1 into the "3" of f2 over [2, 3], as r1 does with the "a".
    await openRelationScene(page, [A, B], { relations: [R1, relation('r3', 0, 2, 2)] });
    const boxOf = async (testId: string) => (await page.getByTestId(testId).boundingBox())!;
    const under = (x: number, y: number) =>
      page.evaluate(
        ([px, py]) => document.elementFromPoint(px!, py!)?.getAttribute('data-testid') ?? null,
        [x, y],
      );
    // On the target clip and on the source clip: the same span of time, one band over the other,
    // each half the lane; a relation alone keeps the whole lane (measured below).
    for (const band of ['relation-window', 'relation-source-window']) {
      const first = await boxOf(`${band}-r1`);
      const second = await boxOf(`${band}-r3`);
      expect(second.x).toBeCloseTo(first.x, 1);
      expect(second.width).toBeCloseTo(first.width, 1);
      expect(second.height).toBeCloseTo(first.height, 1);
      expect(second.y).toBeCloseTo(first.y + first.height, 1);
      // Each is what the pointer finds at its own middle.
      for (const [id, box] of [
        ['r1', first],
        ['r3', second],
      ] as const) {
        expect(await under(box.x + box.width / 2, box.y + box.height / 2)).toBe(`${band}-${id}`);
      }
    }
    const striped = await boxOf('relation-window-r1');
    // A double click on the lower stripe opens the second relation, not the first.
    const lower = await boxOf('relation-window-r3');
    await page.mouse.dblclick(lower.x + lower.width / 2, lower.y + lower.height / 2);
    await expect(page.getByTestId('relation-editor')).toContainText('Relation 2 of 2: f1 → f2');
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('b → 3');
    // Moved after the first (the Animation tab), it gets the whole lane back, and so does the
    // first.
    await relationTab(page, 'animation');
    await page.getByTestId('rel-offset').fill('2');
    await page.getByTestId('rel-offset').press('Enter');
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    const whole = await boxOf('relation-window-r1');
    expect(whole.height).toBeCloseTo(striped.height * 2, 1);
    expect((await boxOf('relation-window-r3')).height).toBeCloseTo(whole.height, 1);
  });

  test('a new relation starts where the playhead is, when a window fits there', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    // The two clips share [2, 6]. With the playhead at 4.5, the window is [4.5, 5.5].
    await setTime(page, 4.5);
    await selectClip(page, 'a');
    await page.getByTestId('create-relation-other').selectOption('b');
    await page.getByTestId('create-relation-button').click();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    await relationTab(page, 'animation');
    await expect(page.getByTestId('rel-window')).toContainText('Window 4.50 → 5.50 s');
    await expect(page.getByTestId('rel-window-note')).toHaveCount(0);
    await relationTab(page, 'pairs');
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    const [first] = (await relations(page)) as [StoredRelation];
    expect([first.offset, first.duration]).toEqual([2.5, 1]);

    // Another one with the playhead before the two clips meet: no window fits there, so it is
    // the window of always — after the first — and the editor says so, until it is moved.
    await setTime(page, 1);
    await page.getByTestId('create-relation-button').click();
    await page.getByTestId('relation-choice-add').click();
    await relationTab(page, 'animation');
    await expect(page.getByTestId('rel-window-note')).toHaveText(
      'No window fits at the playhead (1.00 s): the two clips allow one within 2.00–6.00 s. It starts at 5.50 s instead.',
    );
    await expect(page.getByTestId('rel-window')).toContainText('Window 5.50 → 6.00 s');
    await page.getByTestId('rel-offset').fill('0');
    await page.getByTestId('rel-offset').press('Enter');
    await expect(page.getByTestId('rel-window-note')).toHaveCount(0);
    await page.getByTestId('rel-cancel').click();
    await page.getByTestId('rel-confirm-yes').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();

    // A link port follows the playhead too, and may put the new window over another one.
    await setTime(page, 5);
    await page.keyboard.down('Shift');
    await page.getByTestId('clip-a-link').click();
    await page.keyboard.up('Shift');
    await page.getByTestId('clip-b').click({ position: { x: 40, y: 8 } });
    await page.getByTestId('relation-choice-add').click();
    await relationTab(page, 'animation');
    await expect(page.getByTestId('rel-window')).toContainText('Window 5.00 → 6.00 s');
  });

  test('a link port onto a clip that is related already asks too', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [R1] });
    await page.keyboard.down('Shift');
    await page.getByTestId('clip-a-link').click();
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('timeline-link-band')).toHaveAttribute('data-mode', 'armed');
    await page.getByTestId('clip-b').click({ position: { x: 40, y: 8 } });
    // The menu, where the pointer is; the link is over and no editor is open yet.
    await expect(page.getByTestId('relation-choice')).toBeVisible();
    await expect(page.getByTestId('timeline-link-band')).toHaveCount(0);
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    await page.getByTestId('relation-choice-add').click();
    await expect(page.getByTestId('relation-editor')).toContainText('Relation 2 of 2: f1 → f2');
    expect(await relations(page)).toHaveLength(1);
  });

  test('the Default style of a relation in its panel is refused when it would clash with the other', async ({
    page,
  }) => {
    // r1 turns the "a" of f1 into the "a" of f2 over [2, 3]; r3, whose pair inherits Copy,
    // copies that "a" into the "3" of f2 at the same time (audit A3-04).
    const r3 = { ...relation('r3', 0, 0, 2), style: 'copy' };
    await openRelationScene(page, [A, B], { relations: [R1, r3] });
    await selectRelation(page, 'r3');
    const style = page.getByTestId('relation-style');
    await style.selectOption('transform');
    const notice = page.getByTestId('notice');
    await expect(notice).toContainText('Default style not changed');
    await expect(notice).toContainText(
      'Transform would give the project an error: Source glyph 0 of "f1" is consumed by more than one pair.',
    );
    await expect(style).toHaveValue('copy');
    expect((await relations(page)).map((r) => r.style)).toEqual(['transform', 'copy']);
    // What clashes with nothing is set.
    await style.selectOption('fade_copy');
    await expect(style).toHaveValue('fade_copy');
    expect((await relations(page)).map((r) => r.style)).toEqual(['transform', 'fade_copy']);
  });

  test('a locked track keeps the button and the menu from editing', async ({ page }) => {
    await openRelationScene(page, [A, B], { relations: [R1] });
    await selectClip(page, 'a');
    await page.getByTestId('create-relation-other').selectOption('b');
    await page.getByTestId('track-lock-t2').click();
    await expect(page.getByTestId('create-relation-button')).toBeDisabled();
    await expect(page.getByTestId('create-relation-blocker')).toContainText('is locked');
  });
});
