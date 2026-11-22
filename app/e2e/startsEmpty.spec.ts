import { expect, test, type Page } from './test';
import { openAnimationsTab } from './helpers';
import { clipOf, setTime, undo } from './timelineHelpers';
import { openRelationScene, plain, relationTab, selectClip } from './relationsHelpers';

/* A clip that starts empty (`Clip.startsEmpty`). f1 = a+b=c on track 1 over [0, 6], at the centre
 * of the frame; f2 = a=3+1 on track 2 over [2, 8], two units lower; the "a" of f1 becomes the "a"
 * of f2 over [2, 3]. */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);
B.initial.position = [0, -2];
const RELATION = {
  id: 'r1',
  fromClipId: 'a',
  toClipId: 'b',
  offset: 0,
  duration: 1,
  easing: 'smooth',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [0], to: [0], style: null }],
};

/** How many pixels of the preview are drawn where f2 is: in the lower part of the frame, which
 * f1 never reaches. */
async function drawnOfTarget(page: Page): Promise<number> {
  return page.getByTestId('preview-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const top = Math.round(canvas.height * 0.62);
    const { data } = canvas
      .getContext('2d')!
      .getImageData(0, top, canvas.width, canvas.height - top);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! + data[i + 1]! + data[i + 2]! > 90) count++;
    }
    return count;
  });
}

test.describe('a clip that starts empty', () => {
  test('the box of the Intro section leaves on screen only what the relation brings', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B], { relations: [RELATION] });
    await setTime(page, 5);
    await selectClip(page, 'b');
    await openAnimationsTab(page, 'timing');
    // The whole of f2 is there (with the frame of the selection around it): the "a" the relation
    // brought, the rest from the clip's start.
    await expect.poll(() => drawnOfTarget(page)).toBeGreaterThan(400);
    const whole = await drawnOfTarget(page);
    const box = page.getByTestId('clip-starts-empty');
    await expect(box).not.toBeChecked();
    await expect(page.getByTestId('clip-starts-empty-hint')).toHaveText(
      'Glyphs appear only when a relation, a Morph or an Appear brings them.',
    );
    await box.check();
    expect((await clipOf(page, 'b')).startsEmpty).toBe(true);
    // Only the "a" is left: one glyph of five.
    await expect.poll(() => drawnOfTarget(page)).toBeLessThan(whole * 0.5);
    expect(await drawnOfTarget(page)).toBeGreaterThan(20);
    await expect(page.getByTestId('issues-section')).toHaveCount(0);

    // Before the relation's window nothing of f2 shows at all.
    await setTime(page, 2);
    await expect.poll(() => drawnOfTarget(page)).toBe(0);

    // One undo step.
    await undo(page);
    expect('startsEmpty' in (await clipOf(page, 'b'))).toBe(false);
    await expect(box).not.toBeChecked();
    await expect.poll(() => drawnOfTarget(page)).toBeGreaterThan(whole * 0.5);
  });

  test('the relation editor sets it for its target, and saves it with the relation', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B], { relations: [RELATION] });
    await selectClip(page, 'b');
    await page.getByTestId('relation-edit-r1').click();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    await expect(page.getByTestId('rel-summary')).toHaveText(
      '1 linked pair · 4 glyphs leave · 4 glyphs arrive',
    );
    await relationTab(page, 'animation');
    const box = page.getByTestId('rel-starts-empty');
    await expect(box).not.toBeChecked();
    await expect(page.getByTestId('rel-unpaired-in')).toContainText(
      'They enter with the intro of that clip:',
    );

    await box.check();
    await expect(page.getByTestId('rel-summary')).toHaveText(
      '1 linked pair · 4 glyphs leave · 4 glyphs stay out',
    );
    await expect(page.getByTestId('rel-unpaired-in')).toContainText(
      'The clip starts empty: they stay out',
    );
    await expect(page.getByTestId('rel-intro-kind')).toBeDisabled();
    // Nothing is written before Save.
    expect('startsEmpty' in (await clipOf(page, 'b'))).toBe(false);

    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    expect((await clipOf(page, 'b')).startsEmpty).toBe(true);
    // The panel shows the same clip: its box is checked.
    await openAnimationsTab(page, 'timing');
    await expect(page.getByTestId('clip-starts-empty')).toBeChecked();

    // The editor opens again with the box as the clip has it, and the box of its intro that
    // follows the window waits, unticked.
    await openAnimationsTab(page, 'relations');
    await page.getByTestId('relation-edit-r1').click();
    await relationTab(page, 'animation');
    await expect(page.getByTestId('rel-starts-empty')).toBeChecked();
    await expect(page.getByTestId('rel-match-intro')).toBeDisabled();
    await expect(page.getByTestId('rel-match-intro')).not.toBeChecked();
    await expect(page.getByTestId('rel-summary')).toHaveText(
      '1 linked pair · 4 glyphs leave · 4 glyphs stay out',
    );
    await page.getByTestId('rel-cancel').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();

    // The save was one undo step.
    await undo(page);
    expect('startsEmpty' in (await clipOf(page, 'b'))).toBe(false);
  });

  test('a notice says so when the clip is left with nothing to show', async ({ page }) => {
    const empty = { ...B, startsEmpty: true };
    await openRelationScene(page, [A, empty], { relations: [RELATION] });
    await expect(page.getByTestId('notice')).toHaveCount(0);
    // Its only relation is deleted, from the list of the clip.
    await selectClip(page, 'b');
    await page.getByTestId('relation-delete-r1').click();
    const notice = page.getByTestId('notice');
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText('“f2” starts empty and nothing fills it now');
    await expect(notice).toContainText('untick “Starts empty”');
    // The mark is left alone: unticking it is the user's call, and the clip's panel says the
    // same for as long as it lasts — a warning, under Warnings (D177).
    expect((await clipOf(page, 'b')).startsEmpty).toBe(true);
    await expect(page.getByTestId('clip-issues')).toContainText('this clip never shows');
    await expect(page.getByTestId('issues-section')).toHaveAttribute('data-tone', 'warnings');
    await expect(page.getByTestId('issues-section').locator('h3')).toHaveText('Warnings');
    // Undone, the relation fills the clip again; nothing more to say.
    await undo(page);
    await expect(page.getByTestId('issues-section')).toHaveCount(0);
    await expect(notice).toHaveCount(1);
  });

  test('the box belongs to the intro: the Outro section has none', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await selectClip(page, 'a');
    await openAnimationsTab(page, 'timing');
    await expect(page.getByTestId('intro-section').getByTestId('clip-starts-empty')).toBeVisible();
    await expect(page.getByTestId('outro-section').getByRole('checkbox')).toHaveCount(0);
  });
});
