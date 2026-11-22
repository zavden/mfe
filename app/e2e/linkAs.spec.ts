import { expect, test, type Page } from './test';
import { openWithProject, type MfeWindow } from './helpers';
import {
  glyph,
  openRelationScene,
  plain,
  relationProject,
  relations,
  selectClip,
  type StoredRelation,
} from './relationsHelpers';
import { clipJson, setTime, type ActionJson } from './timelineHelpers';

/* «Link as» (D170): a right-click with glyphs selected on both sides of a pair editor chooses the
 * style the new pair is born with. f1 = a+b=c on track 1 over [0, 6]; f2 = a=3+1 on track 2 over
 * [2, 8]. */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);

async function openEditor(page: Page): Promise<void> {
  await selectClip(page, 'a');
  await page.getByTestId('create-relation-other').selectOption('b');
  await page.getByTestId('create-relation-button').click();
}

const menu = (page: Page) => page.getByTestId('rel-style-menu');
const choice = (page: Page, key: 'transform' | 'copy' | 'fade' | 'join') =>
  page.getByTestId(`rel-link-as-${key}`);

test.describe('«Link as» in the relation editor', () => {
  test('a right-click across the two sides chooses the style the pair is born with', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await expect(page.getByTestId('relation-editor')).toBeVisible();

    // A source, then a right-click on a target: the target joins the selection and the menu
    // offers the link, where a plain click would have linked at once.
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    await expect(page.getByTestId('rel-link-as-header')).toHaveText('Link a → a');
    await expect(glyph(page, 'to', 'a')).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('rel-selection')).toHaveText('a → a');
    for (const key of ['transform', 'copy', 'fade'] as const) {
      await expect(choice(page, key)).toBeEnabled();
    }
    await expect(choice(page, 'transform')).toHaveText('Link as Transform');
    await expect(choice(page, 'fade')).toHaveText('Link as Fade transform');
    // No pair holds the glyphs: the menu is the link alone.
    await expect(page.getByTestId('rel-style-menu-inherit')).toHaveCount(0);
    await expect(page.getByTestId('rel-style-menu-delete')).toHaveCount(0);

    // Escape closes the menu, not the editor; the two sides stay selected for the Link button.
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    await expect(page.getByTestId('rel-link')).toBeEnabled();

    // A right-click on the selection itself offers the same; the pair takes the style chosen.
    await glyph(page, 'from', 'a').click({ button: 'right' });
    await choice(page, 'copy').click();
    await expect(menu(page)).toHaveCount(0);
    const badge = page.getByTestId('rel-junction-0');
    await expect(badge).toHaveAttribute('data-style', 'C');
    await expect(page.getByTestId('rel-pair-0-style')).toHaveValue('copy');
    await expect(page.getByTestId('rel-selection')).toHaveText('Nothing selected');

    // A plain click still links at once, with the relation's style.
    await glyph(page, 'from', '=').click();
    await glyph(page, 'to', '=').click();
    await expect(page.getByTestId('rel-junction-1')).toHaveAttribute('data-style', 'I:T');

    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    const [saved] = (await relations(page)) as [StoredRelation];
    expect(saved.pairs).toMatchObject([
      { from: [0], to: [0], style: 'copy' },
      { from: [3], to: [1], style: null },
    ]);
  });

  test('a style that cannot be is disabled over its reason, and a linked target is joined', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click(); // a → a, consumed (the relation's Transform)

    // The same source again: it can only be copied now.
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', '3').click({ button: 'right' });
    await expect(page.getByTestId('rel-link-as-header')).toHaveText('Link a → 3');
    const reason =
      'Source glyph a (0) is already consumed by another pair. Make one of the pairs a copy.';
    await expect(choice(page, 'transform')).toBeDisabled();
    await expect(page.getByTestId('rel-link-as-transform-note')).toHaveText(reason);
    await expect(choice(page, 'fade')).toBeDisabled();
    await expect(page.getByTestId('rel-link-as-fade-note')).toHaveText(reason);
    await expect(choice(page, 'copy')).toBeEnabled();
    await expect(page.getByTestId('rel-link-as-copy-note')).toHaveCount(0);
    // The pair that holds the source follows, with its own entries.
    await expect(page.getByTestId('rel-style-menu-header')).toHaveText('Pair 1: a → a');
    await expect(page.getByTestId('rel-style-menu-inherit')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await choice(page, 'copy').click();
    await expect(page.getByTestId('rel-junction-1')).toHaveAttribute('data-style', 'C');
    await expect(page.getByTestId('rel-problems')).toHaveCount(0);

    // Onto a target that has a pair: the link joins it, and the pair keeps its style.
    await glyph(page, 'from', 'b').click();
    await glyph(page, 'to', '3').click({ button: 'right' });
    await expect(choice(page, 'join')).toHaveText('Join pair 2 (Copy)');
    await expect(choice(page, 'transform')).toHaveCount(0);
    await choice(page, 'join').click();
    await expect(page.getByTestId('rel-pair-1-text')).toHaveText('a b → 3');
    await expect(page.getByTestId('rel-message')).toContainText('joined pair 2');

    // Glyphs linked to each other already have nothing to link: the menu is their pair's.
    await glyph(page, 'from', 'b').click();
    await page.keyboard.down('Shift');
    await glyph(page, 'to', '3').click();
    await page.keyboard.up('Shift');
    await glyph(page, 'to', '3').click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    await expect(page.getByTestId('rel-link-as-header')).toHaveCount(0);
    await expect(page.getByTestId('rel-style-menu-header')).toHaveText('a b → 3');
  });

  test('the reason names the other relation that takes the glyph', async ({ page }) => {
    // r1 consumes the "a" of f1 into the "a" of f2 over [4, 5]; the new relation starts at the
    // playhead, before it.
    const r1 = {
      id: 'r1',
      fromClipId: 'a',
      toClipId: 'b',
      offset: 2,
      duration: 1,
      easing: 'smooth',
      style: 'transform',
      pathArc: 0,
      pairs: [{ from: [0], to: [0], style: null }],
    };
    await openRelationScene(page, [A, B], { relations: [r1] });
    await setTime(page, 2);
    await openEditor(page);
    await page.getByTestId('relation-choice-add').click();
    await expect(page.getByTestId('relation-editor')).toContainText('Relation 1 of 2: f1 → f2');

    // Consumed later by the other relation: here it can be copied, not consumed.
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', '3').click({ button: 'right' });
    const copyOnly =
      'Source glyph a (0) — relation 2 of 2 (f1 → f2) consumes it: here it can only be copied.';
    await expect(choice(page, 'transform')).toBeDisabled();
    await expect(choice(page, 'transform')).toHaveAccessibleDescription(copyOnly);
    await expect(page.getByTestId('rel-link-as-fade-note')).toHaveText(copyOnly);
    await expect(choice(page, 'copy')).toBeEnabled();
    await expect(page.getByTestId('rel-link-as-refused')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('rel-clear-selection').click();

    // Brought in by the other relation: no style can bring it again, and it is said once.
    await glyph(page, 'from', 'b').click();
    await glyph(page, 'to', 'a').click({ button: 'right' });
    for (const key of ['transform', 'copy', 'fade'] as const) {
      await expect(choice(page, key)).toBeDisabled();
    }
    await expect(page.getByTestId('rel-link-as-refused')).toHaveText(
      'Target glyph a (0) — brought in by relation 2 of 2 (f1 → f2).',
    );
    await expect(page.getByTestId('rel-link-as-transform-note')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('rel-clear-selection').click();

    // The copy is made and saved; nothing is wrong with it.
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', '3').click({ button: 'right' });
    await choice(page, 'copy').click();
    await expect(page.getByTestId('rel-problems')).toHaveCount(0);
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    const added = (await relations(page)).find((r) => r.id !== 'r1')!;
    expect(added.pairs).toMatchObject([{ from: [0], to: [2], style: 'copy' }]);
  });

  test('the list of glyphs for the keyboard opens the same menu', async ({ page }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await page.getByTestId('rel-toggle-list').click();
    await page.getByTestId('rel-from-chip-2').click(); // b
    await page.getByTestId('rel-to-chip-2').click({ button: 'right' }); // 3
    await expect(page.getByTestId('rel-link-as-header')).toHaveText('Link b → 3');
    await choice(page, 'fade').click();
    await expect(page.getByTestId('rel-junction-0')).toHaveAttribute('data-style', 'F');
  });
});

/* The pair editor of a Morph block: A &= x_1 \\ &= x_2 \\ &= x_3, ten glyphs in three rows
 * (A = x 1 | = x 2 | = x 3), with a Morph block (copy) at 2 s. */
test.describe('«Link as» in the pair editor of a Morph block', () => {
  const LABELS = ['A', '=', 'x', '1', '=', 'x', '2', '=', 'x', '3'];
  const morph = {
    id: 'm1',
    kind: 'morph',
    start: 2,
    duration: 1,
    easing: 'smooth',
    style: 'copy',
    pathArc: 0,
    pairs: [],
  } as unknown as ActionJson;

  test('offers the styles, and a glyph that is a target cannot also be a source', async ({
    page,
  }) => {
    const file = relationProject(
      [clipJson('c', 'fm', 't1', 0, 10, { actions: [morph] })],
      [{ id: 'fm', name: 'steps', source: 'A &= x_1 \\\\ &= x_2 \\\\ &= x_3', color: '#58C4DD' }],
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWithProject(page, file);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const f = (window as MfeWindow).__mfe!.useProjectStore.getState().project.formulas[0] as {
            snapshot?: { glyphs: { label: string }[] } | null;
          };
          return f.snapshot ? f.snapshot.glyphs.map((g) => g.label) : null;
        }),
      )
      .toEqual(LABELS);
    await page.evaluate(() =>
      (window as MfeWindow).__mfe!.useMorphEditorStore.getState().open({
        clipId: 'c',
        actionId: 'm1',
      }),
    );
    await expect(page.getByTestId('morph-from-glyph-0')).toBeVisible();

    // = (row 1) → = (row 2), born a Transform where the block's own style is Copy.
    await page.getByTestId('morph-from-glyph-1').click();
    await page.getByTestId('morph-to-glyph-4').click({ button: 'right' });
    await expect(page.getByTestId('morph-link-as-header')).toHaveText('Link = → =');
    await expect(page.getByTestId('morph-link-as-copy')).toBeEnabled();
    await page.getByTestId('morph-link-as-transform').click();
    await expect(page.getByTestId('morph-junction-0')).toHaveAttribute('data-style', 'T');
    await expect(page.getByTestId('morph-pair-0-style')).toHaveValue('transform');

    // The target of that pair as a source: refused for every style, with the block's own rule.
    await page.getByTestId('morph-from-glyph-4').click();
    await page.getByTestId('morph-to-glyph-7').click({ button: 'right' });
    await expect(page.getByTestId('morph-link-as-refused')).toHaveText(
      'Glyph = (4) is a target of pair 1: it cannot also be a source of this block.',
    );
    await expect(page.getByTestId('morph-link-as-copy')).toBeDisabled();
  });
});
