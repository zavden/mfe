import { expect, test, type Page } from './test';
import {
  glyph,
  openRelationScene,
  plain,
  relations,
  selectClip,
  type StoredRelation,
} from './relationsHelpers';

/* A join taken apart and put back (D167). f1 = a+b=c on track 1 over [0, 6]; f2 = a=3+1 on
 * track 2 over [2, 8]. Several sources onto one target are one pair by default; «Split into
 * separate pairs» makes a pair of each, onto the same target, each with its own style. */
const A = plain('a', 'fa', 't1', 0, 6);
const B = plain('b', 'fb', 't2', 2, 8);

async function openEditor(page: Page): Promise<void> {
  await selectClip(page, 'a');
  await page.getByTestId('create-relation-other').selectOption('b');
  await page.getByTestId('create-relation-button').click();
  await expect(page.getByTestId('relation-editor')).toBeVisible();
}

/** Opens the menu of the pair that holds a glyph of the source. */
async function pairMenuOf(page: Page, label: string): Promise<void> {
  await page.getByTestId('rel-clear-selection').click({ force: true });
  await glyph(page, 'from', label).click();
  await glyph(page, 'from', label).click({ button: 'right' });
  await expect(page.getByTestId('rel-style-menu')).toBeVisible();
}

test.describe('pairs that bring the same target', () => {
  test('a pair of two sources is split into two pairs, restyled, saved and joined again', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    // a and b of f1 onto the a of f2: the second link joins the first pair.
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();
    await glyph(page, 'from', 'b').click();
    await glyph(page, 'to', 'a').click();
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('a b → a');
    await expect(page.getByTestId('rel-pair-1')).toHaveCount(0);

    // One pair of two sources: Split, not Join.
    await pairMenuOf(page, 'a');
    await expect(page.getByTestId('rel-style-menu-join')).toHaveCount(0);
    await page.getByTestId('rel-style-menu-split').click();
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('a → a');
    await expect(page.getByTestId('rel-pair-1-text')).toHaveText('b → a');
    await expect(page.getByTestId('rel-message')).toHaveText(
      'Pair 1 is 2 pairs now, one per source: each can have its own style and path.',
    );
    // Two links onto one glyph, each with its badge; nothing is wrong with them.
    await expect(page.getByTestId('rel-junction-0')).toHaveAttribute('data-style', 'I:T');
    await expect(page.getByTestId('rel-junction-1')).toHaveAttribute('data-style', 'I:T');
    await expect(page.getByTestId('rel-problems')).toHaveCount(0);

    // Each has its own style now. A transform and a fade cannot be one pair again: Join says so.
    await page.getByTestId('rel-pair-1-style').selectOption('fade');
    await pairMenuOf(page, 'b');
    await expect(page.getByTestId('rel-style-menu-join')).toBeDisabled();
    await expect(page.getByTestId('rel-style-menu-join-note')).toHaveText(
      'The pairs have styles that one pair cannot hold: give them one style, or one style and copies.',
    );
    await page.keyboard.press('Escape');
    // The second sends a copy instead.
    await page.getByTestId('rel-pair-1-style').selectOption('copy');
    await expect(page.getByTestId('rel-junction-1')).toHaveAttribute('data-style', 'C');
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    const [saved] = (await relations(page)) as [StoredRelation];
    expect(saved.pairs).toMatchObject([
      { from: [0], to: [0], style: null },
      { from: [2], to: [0], style: 'copy' },
    ]);
    // The project plays: the scene has no error to show.
    await expect(page.getByTestId('crash')).toHaveCount(0);

    // Back in the editor, either pair offers Join, and neither Split.
    await page.getByTestId(`relation-edit-${saved.id}`).click();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
    await pairMenuOf(page, 'b');
    await expect(page.getByTestId('rel-style-menu-split')).toHaveCount(0);
    await page.getByTestId('rel-style-menu-join').click();
    // A transform and a copy fit one pair: the copy is an extra source that sends a copy.
    await expect(page.getByTestId('rel-pair-0-text')).toHaveText('a b → a');
    await expect(page.getByTestId('rel-pair-0-extras')).toHaveValue('copies');
    await expect(page.getByTestId('rel-message')).toHaveText('Pairs 1, 2 are pair 1 now.');
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    const [again] = (await relations(page)) as [StoredRelation];
    expect(again.pairs).toMatchObject([
      { from: [0, 2], to: [0], style: null, extras: 'copies', principal: 0 },
    ]);
  });

  test('«Link as» onto a linked target: join its pair, or a separate pair with its style', async ({
    page,
  }) => {
    await openRelationScene(page, [A, B]);
    await openEditor(page);
    await glyph(page, 'from', 'a').click();
    await glyph(page, 'to', 'a').click();

    await glyph(page, 'from', 'b').click();
    await glyph(page, 'to', 'a').click({ button: 'right' });
    await expect(page.getByTestId('rel-link-as-join')).toHaveText('Join pair 1 (Transform)');
    await expect(page.getByTestId('rel-link-as-separate-transform')).toHaveText(
      'Separate pair as Transform',
    );
    await expect(page.getByTestId('rel-link-as-separate-fade')).toHaveText(
      'Separate pair as Fade transform',
    );
    await page.getByTestId('rel-link-as-separate-copy').click();
    await expect(page.getByTestId('rel-pair-1-text')).toHaveText('b → a');
    await expect(page.getByTestId('rel-junction-1')).toHaveAttribute('data-style', 'C');
    await expect(page.getByTestId('rel-problems')).toHaveCount(0);

    // Two pairs bring the target now: a plain click makes one more of its own, and says so.
    await glyph(page, 'from', 'c').click();
    await glyph(page, 'to', 'a').click();
    await expect(page.getByTestId('rel-pair-2-text')).toHaveText('c → a');
    await expect(page.getByTestId('rel-message')).toHaveText(
      'Glyph c (4) made a pair of its own onto a (0), which 2 pairs bring already.',
    );
    // And the menu offers the styles, with nothing to join.
    await glyph(page, 'from', '+').click();
    await glyph(page, 'to', 'a').click({ button: 'right' });
    await expect(page.getByTestId('rel-link-as-join')).toHaveCount(0);
    await expect(page.getByTestId('rel-link-as-fade')).toHaveText('Link as Fade transform');
    await page.getByTestId('rel-link-as-fade').click();
    await expect(page.getByTestId('rel-junction-3')).toHaveAttribute('data-style', 'F');
    await expect(page.getByTestId('rel-problems')).toHaveCount(0);
    await page.getByTestId('rel-save').click();
    await expect(page.getByTestId('relation-editor')).toBeHidden();
    const [saved] = (await relations(page)) as [StoredRelation];
    expect(saved.pairs.map((p) => [p.from, p.to, p.style])).toEqual([
      [[0], [0], null],
      [[2], [0], 'copy'],
      [[4], [0], null],
      [[1], [0], 'fade'],
    ]);
  });
});
