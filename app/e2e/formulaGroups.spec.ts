import { expect, test, type Page } from './test';
import { pinMathJax, switchCreatorView } from './creatorHelpers';
import {
  getProject,
  holdToConfirm,
  openSubmenu,
  openWithProject,
  selectionOf,
  undo,
} from './helpers';
import { relationProject } from './relationsHelpers';

/* Groups of formulas in the Creator (format 22): several selected formulas are grouped from
 * their menu into one row, which opens onto them; the group is selected, and acted on, as its
 * formulas; it is renamed in place and undone with Ungroup. */

const FORMULAS = ['a+b', 'c=d', 'x^2', 'y', 'z'].map((latex, i) => ({
  id: `f${i}`,
  name: `f${i}`,
  source: latex,
}));

interface StoredGroup {
  id: string;
  name: string;
  formulaIds: string[];
}

const GROUP: StoredGroup = { id: 'g1', name: 'grp1', formulaIds: ['f1', 'f3', 'f4', 'f2'] };

const groups = (page: Page) => page.getByTestId('formula-group');
const item = (page: Page, name: string) =>
  page.locator(`[data-testid="formula-item"][data-name="${name}"]`);

/** The rows of the list, top to bottom: `f0`, `[grp1]` for a group, `·f1` for a formula shown
 * under its open group. */
const rows = (page: Page) =>
  page
    .getByTestId('formula-list')
    .locator('> li')
    .evaluateAll((list) =>
      list.map((row) => {
        const name = row.getAttribute('data-name');
        if (row.getAttribute('data-testid') === 'formula-group') return `[${name}]`;
        return row.hasAttribute('data-in-group') ? `·${name}` : name;
      }),
    );

const stored = async (page: Page): Promise<StoredGroup[]> =>
  ((await getProject(page)) as unknown as { formulaGroups?: StoredGroup[] }).formulaGroups ?? [];

const selectedIds = async (page: Page): Promise<string[]> => {
  const selection = (await selectionOf(page)) as { kind: string; id?: string; ids?: string[] };
  if (selection.kind === 'formula') return [selection.id!];
  return selection.kind === 'formulas' ? selection.ids! : [];
};

async function openList(page: Page, formulaGroups?: StoredGroup[]): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(
    page,
    relationProject([], FORMULAS, formulaGroups ? { formulaGroups } : {}),
  );
  await pinMathJax(page);
  await expect(page.getByTestId('formula-list').locator('> li').first()).toBeVisible();
}

test('several selected formulas are grouped from their menu into one row, where the first was', async ({
  page,
}) => {
  await openList(page);
  expect(await rows(page)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
  // One formula has nothing to group.
  await item(page, 'f0').click({ button: 'right' });
  await expect(page.getByTestId('formula-menu')).toBeVisible();
  await expect(page.getByTestId('formula-menu-group')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await item(page, 'f1').click();
  await item(page, 'f3').click({ modifiers: ['ControlOrMeta'] });
  await item(page, 'f3').click({ button: 'right' });
  await page.getByTestId('formula-menu-group').click();
  await expect(groups(page)).toHaveCount(1);
  expect(await rows(page)).toEqual(['f0', '[grp1]', 'f2', 'f4']);
  const group = groups(page).first();
  await expect(group).toHaveAttribute('data-open', 'false');
  await expect(group.getByTestId('formula-group-name')).toHaveText('grp1');
  await expect(group.getByTestId('formula-group-count')).toHaveText('2 formulas');
  // The renderings of its formulas, in the row.
  await expect(group.getByTestId('formula-group-thumbs').locator('.formula-thumb svg')).toHaveCount(
    2,
  );
  // Its formulas stay selected, which is what the group selected is; the focus is on its row.
  expect(await selectedIds(page)).toEqual(['f1', 'f3']);
  await expect(group).toHaveAttribute('data-selected', 'true');
  await expect(group).toBeFocused();
  expect(await stored(page)).toMatchObject([{ name: 'grp1', formulaIds: ['f1', 'f3'] }]);

  // The next one is grp2; one undo each.
  await item(page, 'f2').click();
  await item(page, 'f4').click({ modifiers: ['Shift'] });
  await item(page, 'f4').click({ button: 'right' });
  await page.getByTestId('formula-menu-group').click();
  expect(await rows(page)).toEqual(['f0', '[grp1]', '[grp2]']);
  await undo(page);
  expect(await rows(page)).toEqual(['f0', '[grp1]', 'f2', 'f4']);
  await undo(page);
  expect(await rows(page)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
  expect(await stored(page)).toEqual([]);
});

test('a group opens onto its formulas and closes again, without selecting anything', async ({
  page,
}) => {
  await openList(page, [GROUP]);
  // The group is where its first formula is in the project (f1), its formulas in its own order.
  expect(await rows(page)).toEqual(['f0', '[grp1]']);
  const group = groups(page).first();
  // Closed: the renderings of the first three, and how many more there are.
  await expect(group.getByTestId('formula-group-thumbs').locator('.formula-thumb')).toHaveCount(3);
  await expect(group.getByTestId('formula-group-more')).toHaveText('+1');
  await expect(group.getByTestId('formula-group-count')).toHaveText('4 formulas');
  const toggle = group.getByTestId('formula-group-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(group).toHaveAttribute('data-open', 'true');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '·f3', '·f4', '·f2']);
  await expect(item(page, 'f3')).toHaveAttribute('data-in-group', 'g1');
  await expect(group.getByTestId('formula-group-thumbs')).toHaveCount(0);
  expect((await selectionOf(page)).kind).toBe('none');
  // Open or closed is the view's: the project says nothing of it.
  expect(await stored(page)).toEqual([GROUP]);

  await toggle.click();
  expect(await rows(page)).toEqual(['f0', '[grp1]']);
  // A double-click on the row opens it too; so do Enter and →, and ← closes it.
  await group.getByTestId('formula-group-count').dblclick();
  await expect(group).toHaveAttribute('data-open', 'true');
  await group.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(group).toHaveAttribute('data-open', 'false');
  await page.keyboard.press('ArrowRight');
  await expect(group).toHaveAttribute('data-open', 'true');
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('data-open', 'false');
});

test('a group is selected as its formulas: their menu acts on the group', async ({ page }) => {
  await openList(page, [GROUP]);
  const group = groups(page).first();
  await group.click();
  expect(await selectedIds(page)).toEqual(['f1', 'f3', 'f4', 'f2']);
  await expect(group).toHaveAttribute('data-selected', 'true');
  // Ctrl/⌘ adds a formula to them, and takes the whole group away.
  await item(page, 'f0').click({ modifiers: ['ControlOrMeta'] });
  expect(await selectedIds(page)).toEqual(['f0', 'f1', 'f3', 'f4', 'f2']);
  await group.click({ modifiers: ['ControlOrMeta'] });
  expect(await selectedIds(page)).toEqual(['f0']);
  await expect(group).toHaveAttribute('data-selected', 'false');
  // The arrow keys walk the rows, the group among them.
  await item(page, 'f0').focus();
  await page.keyboard.press('ArrowDown');
  await expect(group).toBeFocused();
  expect(await selectedIds(page)).toEqual(['f1', 'f3', 'f4', 'f2']);

  // Its menu is the menu of its formulas, with the group's name over it.
  await item(page, 'f0').click();
  await group.click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-header')).toHaveText('grp1 · 4 formulas');
  await expect(page.getByTestId('formula-menu-rename-group')).toBeVisible();
  await expect(page.getByTestId('formula-menu-ungroup')).toBeVisible();
  await expect(page.getByTestId('formula-menu-group')).toHaveCount(0);
  await page.getByTestId('formula-menu-add-to-timeline').click();
  // A clip of each formula at the playhead, as with the four selected one by one.
  const clips = (await getProject(page)).clips;
  expect(clips.map((clip) => clip.formulaId)).toEqual(['f1', 'f3', 'f4', 'f2']);

  // Delete 4 formulas…: they go with their clips, and the group with them; one undo.
  await group.click({ button: 'right' });
  await page.getByTestId('formula-menu-delete').click();
  await expect(page.getByTestId('dialog')).toContainText('Delete 4 formulas?');
  await holdToConfirm(page);
  expect(await rows(page)).toEqual(['f0']);
  expect(await stored(page)).toEqual([]);
  await undo(page);
  expect(await rows(page)).toEqual(['f0', '[grp1]']);
  expect(await stored(page)).toEqual([GROUP]);
});

test('a selection keeps the order of the list: Duplicate selects the copies so, and so does a deletion', async ({
  page,
}) => {
  // The group holds f1 f3 f4 f2: the list is f0, then those four, not the project's f1 f2 f3 f4
  // (audit B1-01).
  await openList(page, [GROUP]);
  const group = groups(page).first();
  await group.click();
  expect(await selectedIds(page)).toEqual(['f1', 'f3', 'f4', 'f2']);
  await group.click({ button: 'right' });
  await page.getByTestId('formula-menu-duplicate').click();
  // Each copy after its original, in the group; the copies selected in the order of the list.
  const ids = (await getProject(page)).formulas.map((f) => f.id);
  const copies = ['f1', 'f3', 'f4', 'f2'].map((id) => ids[ids.indexOf(id) + 1]!);
  expect(new Set(copies).size).toBe(4);
  expect(copies.some((id) => FORMULAS.some((f) => f.id === id))).toBe(false);
  expect(await selectedIds(page)).toEqual(copies);
  // «Add to the timeline», in the menu of the copies, makes their clips in that order too.
  const project = await getProject(page);
  const nameOf = (id: string) => project.formulas.find((f) => f.id === id)!.name;
  await group.getByTestId('formula-group-toggle').click();
  await item(page, nameOf(copies[0]!)).click({ button: 'right' });
  await page.getByTestId('formula-menu-add-to-timeline').click();
  expect((await getProject(page)).clips.map((clip) => clip.formulaId)).toEqual(copies);
  await undo(page);
  await undo(page);
  // A formula deleted out of a selection of the group leaves the others in the order of the list.
  await group.click();
  expect(await selectedIds(page)).toEqual(['f1', 'f3', 'f4', 'f2']);
  await item(page, 'f3').getByTestId('formula-delete').click();
  await holdToConfirm(page);
  expect(await selectedIds(page)).toEqual(['f1', 'f4', 'f2']);
});

test('deleting a formula of a group takes it out of the group', async ({ page }) => {
  await openList(page, [{ ...GROUP, formulaIds: ['f1', 'f3'] }]);
  await groups(page).first().getByTestId('formula-group-toggle').click();
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '·f3', 'f2', 'f4']);
  await item(page, 'f1').getByTestId('formula-delete').click();
  await holdToConfirm(page);
  expect(await rows(page)).toEqual(['f0', 'f2', '[grp1]', '·f3', 'f4']);
  await expect(groups(page).first().getByTestId('formula-group-count')).toHaveText('1 formula');
  // The last one: the group goes with it.
  await item(page, 'f3').getByTestId('formula-delete').click();
  await holdToConfirm(page);
  expect(await rows(page)).toEqual(['f0', 'f2', 'f4']);
  expect(await stored(page)).toEqual([]);
  await undo(page);
  expect(await rows(page)).toEqual(['f0', 'f2', '[grp1]', '·f3', 'f4']);
});

test('a group is renamed in place: a double-click on its name, F2, or its menu', async ({
  page,
}) => {
  await openList(page, [GROUP]);
  const group = groups(page).first();
  const field = page.getByTestId('formula-group-rename-input');
  await group.getByTestId('formula-group-name').dblclick();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('grp1');
  // A double-click on the name renames: it does not open the group.
  await expect(group).toHaveAttribute('data-open', 'false');
  await field.fill('Algebra');
  await page.keyboard.press('Enter');
  await expect(group.getByTestId('formula-group-name')).toHaveText('Algebra');
  await expect(group).toBeFocused();
  expect((await stored(page))[0]!.name).toBe('Algebra');

  // F2 on the row; Escape leaves the name as it was.
  await page.keyboard.press('F2');
  await field.fill('Other');
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(group.getByTestId('formula-group-name')).toHaveText('Algebra');
  await expect(group).toBeFocused();

  // A group needs a name: an empty one keeps the field open and says why.
  await page.keyboard.press('F2');
  await field.fill('  ');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('formula-group-rename-error')).toHaveText(
    'The name cannot be empty.',
  );
  await expect(field).toBeVisible();
  await page.keyboard.press('Escape');

  // From the menu: the field has the focus once the menu is gone; leaving it takes the name.
  await group.click({ button: 'right' });
  await page.getByTestId('formula-menu-rename-group').click();
  await expect(field).toBeFocused();
  await field.fill('Limits and series');
  await page.getByTestId('creator-tab-formulas').click(); // a click elsewhere: the open tab
  await expect(group.getByTestId('formula-group-name')).toHaveText('Limits and series');
  // Each rename is one step.
  await undo(page);
  await expect(group.getByTestId('formula-group-name')).toHaveText('Algebra');
  await undo(page);
  await expect(group.getByTestId('formula-group-name')).toHaveText('grp1');
});

test('Ungroup puts the formulas of a group back on their own', async ({ page }) => {
  await openList(page, [GROUP]);
  await groups(page).first().click({ button: 'right' });
  await page.getByTestId('formula-menu-ungroup').click();
  await expect(groups(page)).toHaveCount(0);
  // Back in the project's order, none deleted, and still selected.
  expect(await rows(page)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
  expect(await selectedIds(page)).toEqual(['f1', 'f2', 'f3', 'f4']);
  expect(await stored(page)).toEqual([]);
  expect('formulaGroups' in (await getProject(page))).toBe(false);
  await undo(page);
  expect(await rows(page)).toEqual(['f0', '[grp1]']);
});

test('the search of formulas lists the formulas of a group, each saying its group; the list stays whole', async ({
  page,
}) => {
  await openList(page, [GROUP]);
  await page.getByTestId('creator-search-open').click();
  const field = page.getByTestId('formula-search-input');
  const found = () =>
    page
      .getByTestId('formula-search-result')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-name')));
  await field.fill('x^2');
  expect(await found()).toEqual(['f2']);
  await expect(page.getByTestId('formula-search-group')).toHaveText('grp1');
  // By the name of the group: every formula of it, in its order, and no folder.
  await field.fill('GRP');
  expect(await found()).toEqual(['f1', 'f3', 'f4', 'f2']);
  await field.fill('f0');
  expect(await found()).toEqual(['f0']);
  await expect(page.getByTestId('formula-search-group')).toHaveCount(0);
  // The list of the Creator is not filtered: its group is whole, and closed as the view had it.
  expect(await rows(page)).toEqual(['f0', '[grp1]']);
  const group = groups(page).first();
  await expect(group.getByTestId('formula-group-count')).toHaveText('4 formulas');
  await expect(group.getByTestId('formula-group-toggle')).not.toHaveAttribute('aria-disabled');
  // A result of a closed group selects its formula alone.
  await field.fill('x^2');
  await page.getByTestId('formula-search-result').click();
  expect(await selectedIds(page)).toEqual(['f2']);
});

const PAIR: StoredGroup = { id: 'g1', name: 'grp1', formulaIds: ['f1', 'f3'] };

test('the menu puts formulas into a group there is, and takes them out of theirs', async ({
  page,
}) => {
  await openList(page, [PAIR, { id: 'g2', name: 'Others', formulaIds: ['f2'] }]);
  expect(await rows(page)).toEqual(['f0', '[grp1]', '[Others]', 'f4']);
  // A formula on its own: any group takes it.
  await item(page, 'f4').click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-remove-from-group')).toHaveCount(0);
  await openSubmenu(page, 'formula-menu-add-to-group');
  await expect(page.getByTestId('formula-menu-add-to-group-g2')).toHaveText('Others');
  await page.getByTestId('formula-menu-add-to-group-g1').click();
  await expect(page.getByTestId('formula-menu')).toHaveCount(0);
  expect(await rows(page)).toEqual(['f0', '[grp1]', '[Others]']);
  expect((await stored(page))[0]).toEqual({ ...PAIR, formulaIds: ['f1', 'f3', 'f4'] });
  const group = groups(page).first();
  await expect(group.getByTestId('formula-group-count')).toHaveText('3 formulas');
  await expect(group).toBeFocused();
  await undo(page);
  expect(await rows(page)).toEqual(['f0', '[grp1]', '[Others]', 'f4']);

  // A formula of a group: «Remove from group», and no group to add it to.
  await group.getByTestId('formula-group-toggle').click();
  await item(page, 'f3').click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-add-to-group')).toHaveCount(0);
  await expect(page.getByTestId('formula-menu-ungroup')).toHaveCount(0);
  await page.getByTestId('formula-menu-remove-from-group').click();
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '[Others]', 'f3', 'f4']);
  expect(await selectedIds(page)).toEqual(['f3']);

  // One on its own and one of a group, together: both go into the group chosen.
  await item(page, 'f0').click();
  await item(page, 'f1').click({ modifiers: ['ControlOrMeta'] });
  await item(page, 'f1').click({ button: 'right' });
  await openSubmenu(page, 'formula-menu-add-to-group');
  await page.getByTestId('formula-menu-add-to-group-g2').click();
  // grp1 is left without formulas and goes; Others is where its first formula (f2) is.
  expect(await rows(page)).toEqual(['[Others]', 'f3', 'f4']);
  expect(await stored(page)).toEqual([
    { id: 'g2', name: 'Others', formulaIds: ['f2', 'f0', 'f1'] },
  ]);
  await undo(page);
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '[Others]', 'f3', 'f4']);
});

test('a formula dropped on the row of a group goes into it; the group itself is not dragged', async ({
  page,
}) => {
  await openList(page, [PAIR]);
  const group = groups(page).first();
  expect(await rows(page)).toEqual(['f0', '[grp1]', 'f2', 'f4']);
  await item(page, 'f4').dragTo(group);
  expect(await rows(page)).toEqual(['f0', '[grp1]', 'f2']);
  expect(await stored(page)).toEqual([{ ...PAIR, formulaIds: ['f1', 'f3', 'f4'] }]);
  await expect(group).not.toHaveAttribute('data-drop', 'true');
  // A formula of the group dragged out of it stays in it: «Remove from group» takes it out.
  await group.getByTestId('formula-group-toggle').click();
  await item(page, 'f3').dragTo(item(page, 'f0'));
  expect((await stored(page))[0]!.formulaIds).toEqual(['f1', 'f3', 'f4']);
  // Onto the timeline it goes as ever: a clip of it.
  await item(page, 'f3').dragTo(page.getByTestId('panel-timeline'));
  await expect.poll(async () => (await getProject(page)).clips.length).toBe(1);
  // The row of the group is not something to drag.
  await expect(group).not.toHaveAttribute('draggable', 'true');
  await undo(page);
  await undo(page);
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '·f3', 'f2', 'f4']);
});

test('the copy of a formula of a group is in the group, after the original', async ({ page }) => {
  await openList(page, [PAIR]);
  await groups(page).first().getByTestId('formula-group-toggle').click();
  await item(page, 'f1').getByTestId('formula-duplicate').click();
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '·f5', '·f3', 'f2', 'f4']);
  expect((await stored(page))[0]!.formulaIds).toHaveLength(3);
  await undo(page);
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '·f3', 'f2', 'f4']);
});

test('in the block view a group is a block, and the blocks of its formulas come after it', async ({
  page,
}) => {
  await openList(page, [PAIR]);
  await switchCreatorView(page, 'grid');
  const blocks = page.getByTestId('formula-block');
  const block = (name: string) =>
    page.locator(`[data-testid="formula-block"][data-name="${name}"]`);
  const group = groups(page).first();
  expect(await rows(page)).toEqual(['f0', '[grp1]', 'f2', 'f4']);
  await expect(blocks).toHaveCount(3);
  // A block like the others, with its name, how many formulas it has and the button.
  const size = (await group.boundingBox())!;
  const other = (await block('f0').boundingBox())!;
  expect(Math.abs(size.width - other.width)).toBeLessThan(1);
  expect(Math.abs(size.height - other.height)).toBeLessThan(1);
  await expect(group.getByTestId('formula-group-name')).toHaveText('grp1');
  await expect(group.getByTestId('formula-group-count')).toHaveText('2 formulas');
  await expect(group.getByTestId('formula-group-toggle')).toHaveAttribute('aria-expanded', 'false');
  // Its tooltip, beside it like a formula's: the renderings of its formulas, which a block
  // does not show.
  await page.mouse.move(size.x + 10, size.y + size.height - 10);
  const tip = page.getByTestId('formula-tooltip');
  await expect(tip.locator('.formula-thumb svg')).toHaveCount(2);
  await expect(tip).toContainText('grp1');
  await expect(tip).toContainText('Group · 2 formulas');
  await expect(tip).toContainText('Double-click to open');
  const shown = (await tip.boundingBox())!;
  expect(shown.width).toBe(288);
  expect(shown.x).toBeGreaterThan(size.x + size.width);

  // Selected as its formulas; the arrows of the grid walk over it.
  await group.click();
  expect(await selectedIds(page)).toEqual(['f1', 'f3']);
  await expect(group).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(block('f0')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(group).toBeFocused();
  expect(await selectedIds(page)).toEqual(['f1', 'f3']);

  // Enter opens it: the blocks of its formulas follow it, marked as the group's.
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('data-open', 'true');
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '·f3', 'f2', 'f4']);
  await expect(block('f3')).toHaveAttribute('data-in-group', 'g1');
  await expect(blocks).toHaveCount(5);
  // The view is another, the open groups the same.
  await switchCreatorView(page, 'list');
  expect(await rows(page)).toEqual(['f0', '[grp1]', '·f1', '·f3', 'f2', 'f4']);
  await switchCreatorView(page, 'grid');

  // Renamed with F2; a formula dropped on it goes into it; its menu ungroups it.
  await group.focus();
  await page.keyboard.press('F2');
  await page.getByTestId('formula-group-rename-input').fill('Pairs');
  await page.keyboard.press('Enter');
  await expect(group.getByTestId('formula-group-name')).toHaveText('Pairs');
  await expect(group).toBeFocused();
  await block('f4').dragTo(group);
  expect(await rows(page)).toEqual(['f0', '[Pairs]', '·f1', '·f3', '·f4', 'f2']);
  await group.click({ button: 'right' });
  await expect(page.getByTestId('formula-menu-header')).toHaveText('Pairs · 3 formulas');
  await page.getByTestId('formula-menu-ungroup').click();
  expect(await rows(page)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
  await expect(blocks).toHaveCount(5);
});
