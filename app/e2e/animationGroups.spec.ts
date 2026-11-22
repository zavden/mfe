import { expect, test, type Page } from './test';
import {
  blockLocator,
  blockOf,
  emphasisJson,
  grouped,
  groupLocator,
  groupsOf,
  openBlockScene,
  partJson,
  PX_PER_SECOND,
} from './blockHelpers';
import { forceFallbackFilePaths } from './creatorHelpers';
import { holdToConfirm } from './helpers';
import { plain, relationProject } from './relationsHelpers';
import {
  box,
  canUndo,
  clipOf,
  dragTo,
  timeToX,
  uiState,
  undo,
  type ActionJson,
} from './timelineHelpers';

/* Groups of animation blocks (model/groups.ts): blocks of a clip that start together and last the
 * same, drawn as one block on one lane and moved as one. Clip `a` (formula a+b=c, five glyphs)
 * runs over [0, 10] on track 1. */

/** Three part transforms over [2, 3.5] on glyphs 0, 1 and 2, grouped as `g`; a group `h` of two
 * blocks of different kinds over [5, 6]; and `late`, on its own, which moves glyph 1 over
 * [7, 8]. */
const SCENE: ActionJson[] = [
  grouped(partJson('p1', 2, 1.5, [0]), 'g'),
  grouped(partJson('p2', 2, 1.5, [1]), 'g'),
  grouped(partJson('p3', 2, 1.5, [2]), 'g'),
  grouped(partJson('q1', 5, 1, [3]), 'h'),
  grouped(emphasisJson('q2', 5, 1, 'indicate', [4]), 'h'),
  partJson('late', 7, 1, [1]),
];

/** A track with one lane of blocks, and what each further lane adds (layout.ts). */
const ROW = 46;
const LANE = 19;

const rowHeight = async (page: Page) => (await box(page.getByTestId('track-row-t1'))).height;

const timings = async (page: Page, ids: string[]) =>
  Promise.all(
    ids.map(async (id) => {
      const block = await blockOf(page, 'a', id);
      return [block.start, block.duration];
    }),
  );

/** Drag the folded group `group` by `seconds`: by its body, or by one of its edges. */
async function dragGroup(
  page: Page,
  group: string,
  seconds: number,
  edge: 'move' | 'start' | 'end' = 'move',
): Promise<void> {
  const b = await box(groupLocator(page, group));
  const y = b.y + b.height / 2;
  const x = edge === 'start' ? b.x + 2 : edge === 'end' ? b.x + b.width - 2 : b.x + b.width / 2;
  await dragTo(page, { x, y }, { x: x + seconds * PX_PER_SECOND, y });
}

test.describe('animation groups on the timeline', () => {
  test('a group is one block on one lane, labelled with what it runs', async ({ page }) => {
    await openBlockScene(page, SCENE);
    const g = groupLocator(page, 'g');
    await expect(g).toBeVisible();
    await expect(g).toHaveText('Transform ×3');
    await expect(g).toHaveAttribute('data-count', '3');
    await expect(g).toHaveAttribute('data-lane', '0');
    // Its members are not drawn: one block stands for the three, over their time.
    for (const id of ['p1', 'p2', 'p3']) await expect(blockLocator(page, id)).toHaveCount(0);
    const shape = await box(g);
    // (A block lies inside its clip's edge: a pixel past the time on the ruler.)
    expect(Math.abs(shape.x - (await timeToX(page, 2)))).toBeLessThanOrEqual(1);
    expect(shape.width).toBeCloseTo(1.5 * PX_PER_SECOND, 0);
    // So the track is as high as one lane of blocks, not three.
    expect(await rowHeight(page)).toBe(ROW);
    await expect(g).toHaveAttribute('title', /^Group of 3 animations that run together\n/);
    await expect(g).toHaveAttribute(
      'aria-label',
      'Group of 3 animations: Transform · 1, Transform · 1, Transform · 1, 2.00 to 3.50 s',
    );
    // Members of different kinds: a group by that name, in a colour of its own.
    const h = groupLocator(page, 'h');
    await expect(h).toHaveText('Group ×2');
    await expect(h).toHaveClass(/is-mixed/);
    await expect(g).toHaveClass(/is-transform/);
    // A block on its own is drawn as ever.
    await expect(blockLocator(page, 'late')).toHaveText('Transform · 1');
  });

  test('moving or stretching the group moves every animation of it, in one step', async ({
    page,
  }) => {
    await openBlockScene(page, SCENE);
    const members = ['p1', 'p2', 'p3'];
    await dragGroup(page, 'g', 1);
    expect(await timings(page, members)).toEqual([
      [3, 1.5],
      [3, 1.5],
      [3, 1.5],
    ]);
    // The press selected the group through its first member; the block is still one.
    expect((await uiState(page)).selection).toEqual({
      kind: 'action',
      clipId: 'a',
      actionId: 'p1',
    });
    await expect(groupLocator(page, 'g')).toHaveClass(/is-selected/);
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: 'g', p2: 'g', p3: 'g', late: null });
    await undo(page);
    expect(await timings(page, members)).toEqual([
      [2, 1.5],
      [2, 1.5],
      [2, 1.5],
    ]);
    expect(await canUndo(page)).toBe(false);

    // An edge stretches all of them.
    await dragGroup(page, 'g', 0.5, 'end');
    expect(await timings(page, members)).toEqual([
      [2, 2],
      [2, 2],
      [2, 2],
    ]);
    await dragGroup(page, 'g', -1, 'start');
    expect(await timings(page, members)).toEqual([
      [1, 3],
      [1, 3],
      [1, 3],
    ]);

    // It goes as far as all of them can: `late` moves glyph 1 from 7 s on, which stops `p2`,
    // and with it the group.
    await dragGroup(page, 'g', 5);
    expect(await timings(page, members)).toEqual([
      [4, 3],
      [4, 3],
      [4, 3],
    ]);
  });

  test('its arrow unfolds it into its animations, which still move as one, and folds it back', async ({
    page,
  }) => {
    await openBlockScene(page, SCENE);
    await page.getByTestId('group-unfold-g').click();
    await expect(groupLocator(page, 'g')).toHaveCount(0);
    for (const [lane, id] of ['p1', 'p2', 'p3'].entries()) {
      await expect(blockLocator(page, id)).toHaveAttribute('data-lane', String(lane));
      await expect(blockLocator(page, id)).toHaveClass(/is-grouped/);
      await expect(blockLocator(page, id)).toHaveText('Transform · 1');
    }
    expect(await rowHeight(page)).toBe(ROW + 2 * LANE);
    // The other group stays folded, and nothing of the project changed.
    await expect(groupLocator(page, 'h')).toBeVisible();
    expect(await canUndo(page)).toBe(false);

    // A member dragged takes the others along: the timing is the group's.
    const second = await box(blockLocator(page, 'p2'));
    const at = { x: second.x + second.width / 2, y: second.y + second.height / 2 };
    await dragTo(page, at, { x: at.x + PX_PER_SECOND, y: at.y });
    expect(await timings(page, ['p1', 'p2', 'p3'])).toEqual([
      [3, 1.5],
      [3, 1.5],
      [3, 1.5],
    ]);
    expect((await uiState(page)).selection).toEqual({
      kind: 'action',
      clipId: 'a',
      actionId: 'p2',
    });

    // The arrow on its first member folds it again; the selected member is still selected.
    await expect(page.getByTestId('group-fold-g')).toHaveCount(1);
    await page.getByTestId('group-fold-g').click();
    await expect(groupLocator(page, 'g')).toBeVisible();
    await expect(groupLocator(page, 'g')).toHaveClass(/is-selected/);
    await expect(groupLocator(page, 'g')).toHaveAttribute('data-action-id', 'p2');
    expect(await rowHeight(page)).toBe(ROW);
    // A double-click unfolds it too.
    await groupLocator(page, 'g').dblclick();
    await expect(blockLocator(page, 'p3')).toBeVisible();
  });

  test('with nothing selected, unfolding and folding a group keep the view where it was, and the focus on the group', async ({
    page,
  }) => {
    // A clip longer than the view, its group near its end: the view is moved there, away from
    // the start of the clip, which holds the timeline's Tab stop while nothing is selected.
    const far: ActionJson[] = [
      grouped(partJson('p1', 34, 1.5, [0]), 'g'),
      grouped(partJson('p2', 34, 1.5, [1]), 'g'),
    ];
    await openBlockScene(page, far, { clip: { end: 40 } });
    const scroll = page.getByTestId('timeline-scroll');
    const left = () => scroll.evaluate((el) => el.scrollLeft);
    await scroll.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const view = await left();
    expect(view).toBeGreaterThan(1000);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });

    await page.getByTestId('group-unfold-g').click();
    await expect(blockLocator(page, 'p1')).toBeFocused();
    expect(await left()).toBe(view);

    await page.getByTestId('group-fold-g').click();
    await expect(groupLocator(page, 'g')).toBeFocused();
    expect(await left()).toBe(view);
    expect((await uiState(page)).selection).toEqual({ kind: 'none' });
    expect(await canUndo(page)).toBe(false);
  });

  test('a project opened again shows its groups folded, whatever was unfolded before', async ({
    page,
  }) => {
    // File ▸ Open through the file input: Chrome's own picker cannot be driven.
    await forceFallbackFilePaths(page);
    await openBlockScene(page, SCENE);
    await page.getByTestId('group-unfold-g').click();
    await expect(groupLocator(page, 'g')).toHaveCount(0);
    expect(await rowHeight(page)).toBe(ROW + 2 * LANE);
    // File ▸ Open… the same file: the ids of its clips and groups are the ones unfolded.
    const file = relationProject([
      plain('a', 'fa', 't1', 0, 10, { actions: SCENE }),
      plain('b', 'fb', 't2', 2, 8),
    ]);
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Open…' }).click();
    await page.getByTestId('projects-other').click();
    await (
      await chooser
    ).setFiles({
      name: 'groups.mfe.json',
      mimeType: 'application/json',
      buffer: Buffer.from(file),
    });
    // The project in hand was never saved: its changes are given up.
    await page.getByTestId('dialog-discard').click();
    await expect(page.getByTestId('doc-file')).toHaveText('groups.mfe.json');
    await expect(groupLocator(page, 'g')).toBeVisible();
    await expect(groupLocator(page, 'h')).toBeVisible();
    await expect(blockLocator(page, 'p1')).toHaveCount(0);
    expect(await rowHeight(page)).toBe(ROW);
  });

  test('its menu unfolds it or undoes it; a member of an unfolded group can leave it', async ({
    page,
  }) => {
    await openBlockScene(page, SCENE);
    await groupLocator(page, 'g').click({ button: 'right' });
    const menu = page.getByTestId('group-menu');
    await expect(menu.getByTestId('group-menu-header')).toHaveText('Transform ×3');
    await expect(menu.getByTestId('group-menu-members')).toHaveText(
      'Transform · 1, Transform · 1, Transform · 1',
    );
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Unfold',
      'Ungroup',
      'Duplicate',
      'Delete…',
    ]);
    await menu.getByTestId('group-menu-ungroup').click();
    // Three blocks on their own again, each where it was, on a lane each.
    await expect(groupLocator(page, 'g')).toHaveCount(0);
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: null, p2: null, p3: null, q1: 'h' });
    for (const id of ['p1', 'p2', 'p3']) {
      await expect(blockLocator(page, id)).toBeVisible();
      await expect(blockLocator(page, id)).not.toHaveClass(/is-grouped/);
    }
    expect(await rowHeight(page)).toBe(ROW + 2 * LANE);
    expect(await timings(page, ['p1', 'p2', 'p3'])).toEqual([
      [2, 1.5],
      [2, 1.5],
      [2, 1.5],
    ]);
    // A block on its own moves alone.
    const third = await box(blockLocator(page, 'p3'));
    const at = { x: third.x + third.width / 2, y: third.y + third.height / 2 };
    await dragTo(page, at, { x: at.x + PX_PER_SECOND, y: at.y });
    expect(await timings(page, ['p1', 'p2', 'p3'])).toEqual([
      [2, 1.5],
      [2, 1.5],
      [3, 1.5],
    ]);
    await undo(page);
    await undo(page);
    await expect(groupLocator(page, 'g')).toBeVisible();
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: 'g', p2: 'g', p3: 'g' });

    // Unfolded from the menu, a member's own menu starts with what it can do about its group.
    await groupLocator(page, 'g').click({ button: 'right' });
    await page.getByTestId('group-menu-unfold').click();
    await blockLocator(page, 'p2').click({ button: 'right' });
    const blockMenu = page.getByTestId('block-menu');
    await expect(blockMenu.getByRole('menuitem').first()).toHaveText('Fold the group');
    await blockMenu.getByTestId('block-menu-leave').click();
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: 'g', p2: null, p3: 'g' });
    await expect(blockLocator(page, 'p2')).not.toHaveClass(/is-grouped/);
    // The two that stay are still a group: folded, it is one block again beside the one that left.
    await blockLocator(page, 'p1').click({ button: 'right' });
    await page.getByTestId('block-menu-fold').click();
    await expect(groupLocator(page, 'g')).toHaveText('Transform ×2');
    await expect(blockLocator(page, 'p2')).toBeVisible();
    expect(await rowHeight(page)).toBe(ROW + LANE);
    // A group of two that loses one is no group: the block left is a block on its own.
    await page.getByTestId('group-unfold-g').click();
    await blockLocator(page, 'p3').click({ button: 'right' });
    await page.getByTestId('block-menu-leave').click();
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: null, p2: null, p3: null });
    await blockLocator(page, 'p1').click({ button: 'right' });
    await expect(page.getByTestId('block-menu')).toBeVisible();
    await expect(page.getByTestId('block-menu-fold')).toHaveCount(0);
  });

  test('the keyboard reaches a folded group as one block, opens its menu and nudges it whole', async ({
    page,
  }) => {
    await openBlockScene(page, SCENE);
    await page.getByTestId('clip-a').focus();
    await page.keyboard.press('ArrowUp');
    const g = groupLocator(page, 'g');
    await expect(g).toBeFocused();
    expect((await uiState(page)).selection).toEqual({
      kind: 'action',
      clipId: 'a',
      actionId: 'p1',
    });
    // Along the lane: the next block is the other group, then the block on its own.
    await page.keyboard.press('ArrowRight');
    await expect(groupLocator(page, 'h')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(blockLocator(page, 'late')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(g).toBeFocused();
    // Alt + arrows move the group a frame (60 fps), all its members at once.
    await page.keyboard.press('Alt+ArrowRight');
    const moved = await timings(page, ['p1', 'p2', 'p3']);
    expect(moved[0]![0]).toBeCloseTo(2 + 1 / 60, 5);
    expect(moved[1]).toEqual(moved[0]);
    expect(moved[2]).toEqual(moved[0]);
    await expect(g).toBeFocused();
    // Enter opens the group's menu, from which it unfolds; the focus then is on a member.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('group-menu')).toBeVisible();
    await page.keyboard.press('Enter'); // Unfold, the first item
    await expect(page.getByTestId('group-menu')).toHaveCount(0);
    await expect(blockLocator(page, 'p1')).toBeVisible();
    await expect(blockLocator(page, 'p1')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(blockLocator(page, 'p2')).toBeFocused();
  });

  test('blocks that run together are grouped from the menu of one of them', async ({ page }) => {
    // Three blocks over [2, 3.5] on glyphs 0, 1 and 2, none in a group; `odd` starts with them
    // and lasts longer; `late` runs on its own.
    await openBlockScene(page, [
      partJson('p1', 2, 1.5, [0]),
      partJson('p2', 2, 1.5, [1]),
      partJson('p3', 2, 1.5, [2]),
      partJson('odd', 2, 2, [3]),
      partJson('late', 7, 1, [1]),
    ]);
    expect(await rowHeight(page)).toBe(ROW + 3 * LANE);
    // A block that nothing runs with has nothing to be grouped with.
    await blockLocator(page, 'late').click({ button: 'right' });
    await expect(page.getByTestId('block-menu')).toBeVisible();
    await expect(page.getByTestId('block-menu-group')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await blockLocator(page, 'odd').click({ button: 'right' });
    await expect(page.getByTestId('block-menu-group')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await blockLocator(page, 'p2').click({ button: 'right' });
    await expect(page.getByTestId('block-menu-group')).toHaveText(
      'Group with the 2 blocks that run with it',
    );
    await page.getByTestId('block-menu-group').click();
    const groups = await groupsOf(page, 'a');
    expect(groups.p1).toBeTruthy();
    expect(groups).toEqual({ p1: groups.p1, p2: groups.p1, p3: groups.p1, odd: null, late: null });
    // One block now, and the lanes it frees: the group and `odd`, which runs over it.
    const g = groupLocator(page, groups.p1!);
    await expect(g).toHaveText('Transform ×3');
    await expect(g).toHaveClass(/is-selected/);
    expect(await rowHeight(page)).toBe(ROW + LANE);
    expect(await timings(page, ['p1', 'p2', 'p3'])).toEqual([
      [2, 1.5],
      [2, 1.5],
      [2, 1.5],
    ]);
    // One step: undone, the three are blocks on their own again.
    await undo(page);
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: null, p2: null, p3: null });
    expect(await canUndo(page)).toBe(false);

    // A block that runs with a group joins it from either menu.
    await blockLocator(page, 'p1').click({ button: 'right' });
    await page.getByTestId('block-menu-group').click();
    await blockLocator(page, 'odd').click();
    await page.getByTestId('block-duration').fill('1.5');
    await page.getByTestId('block-duration').press('Enter');
    expect((await blockOf(page, 'a', 'odd')).duration).toBe(1.5);
    const name = (await groupsOf(page, 'a')).p1!;
    await groupLocator(page, name).click({ button: 'right' });
    await expect(page.getByTestId('group-menu-group')).toHaveText(
      'Group with the block that runs with it',
    );
    await page.getByTestId('group-menu-group').click();
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: name, p2: name, p3: name, odd: name });
    await expect(groupLocator(page, name)).toHaveText('Transform ×4');
    expect(await rowHeight(page)).toBe(ROW);
  });

  test('a folded group is copied and deleted whole, from its menu and with the keys', async ({
    page,
  }) => {
    await openBlockScene(page, SCENE);
    const ids = async () => (await clipOf(page, 'a')).actions.map((a) => a.id);
    await groupLocator(page, 'h').click({ button: 'right' });
    await page.getByTestId('group-menu-duplicate').click();
    // A copy of both blocks right after the group, a group of its own, selected.
    const after = await clipOf(page, 'a');
    expect(after.actions).toHaveLength(8);
    const copies = after.actions.filter((a) => a.start === 6);
    expect(copies.map((a) => [a.kind, a.duration])).toEqual([
      ['transform', 1],
      ['emphasis', 1],
    ]);
    const all = await groupsOf(page, 'a');
    const copyGroup = all[copies[0]!.id]!;
    expect(copyGroup).toBeTruthy();
    expect(copyGroup).not.toBe('h');
    expect(all[copies[1]!.id]).toBe(copyGroup);
    await expect(groupLocator(page, copyGroup)).toHaveText('Group ×2');
    await expect(groupLocator(page, copyGroup)).toHaveClass(/is-selected/);
    await expect(groupLocator(page, 'h')).toBeVisible();

    // Delete asks, and takes every animation of the group in one step.
    await groupLocator(page, copyGroup).click({ button: 'right' });
    await page.getByTestId('group-menu-delete').click();
    await expect(page.getByTestId('dialog')).toContainText('Delete the group?');
    await expect(page.getByTestId('dialog')).toContainText('a group of 2 animations');
    await holdToConfirm(page);
    expect(await ids()).toEqual(['p1', 'p2', 'p3', 'q1', 'q2', 'late']);
    await undo(page);
    expect(await ids()).toHaveLength(8);
    await undo(page);
    expect(await ids()).toEqual(['p1', 'p2', 'p3', 'q1', 'q2', 'late']);

    // The keys act on the group the selected block is drawn as.
    await groupLocator(page, 'g').click();
    await page.keyboard.press('ControlOrMeta+d');
    expect(await ids()).toHaveLength(9);
    await undo(page);
    await groupLocator(page, 'g').click();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('dialog')).toContainText('Delete the group?');
    await holdToConfirm(page);
    expect(await ids()).toEqual(['q1', 'q2', 'late']);
    await undo(page);

    // Unfolded, a member is a block: the keys act on it alone.
    await page.getByTestId('group-unfold-g').click();
    await blockLocator(page, 'p3').click();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('dialog')).toContainText('Delete animation?');
    await holdToConfirm(page);
    expect(await ids()).toEqual(['p1', 'p2', 'q1', 'q2', 'late']);
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: 'g', p2: 'g' });
  });

  test('the Animations panel lists the members of the selected group and edits each of them', async ({
    page,
  }) => {
    await openBlockScene(page, SCENE);
    await groupLocator(page, 'h').click();
    const section = page.getByTestId('block-group-section');
    await expect(section.getByRole('heading')).toHaveText('Group ×2');
    // Its two commands are side by side at the right end of its header, "Take out" at the left
    // of "Ungroup": neither is left alone in the middle of the line.
    const header = await box(section.locator('.an-section-header'));
    const leave = await box(page.getByTestId('block-group-leave'));
    const ungroup = await box(page.getByTestId('block-group-ungroup'));
    expect(ungroup.x - (leave.x + leave.width)).toBeGreaterThanOrEqual(4);
    expect(ungroup.x - (leave.x + leave.width)).toBeLessThanOrEqual(8);
    expect(header.x + header.width - (ungroup.x + ungroup.width)).toBeLessThanOrEqual(10);
    expect(Math.abs(leave.y - ungroup.y)).toBeLessThanOrEqual(1);
    await expect(section.getByRole('group').getByRole('button')).toHaveText([
      'Transform · 1',
      'Indicate · 1',
    ]);
    await expect(page.getByTestId('block-group-member-q1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('block-name')).toHaveText('Transform · 1');
    // Another member: the panel shows it, and the group's block on the timeline stands for it.
    await page.getByTestId('block-group-member-q2').click();
    await expect(page.getByTestId('block-name')).toHaveText('Indicate · 1');
    await expect(groupLocator(page, 'h')).toHaveAttribute('data-action-id', 'q2');
    await expect(groupLocator(page, 'h')).toHaveClass(/is-selected/);
    // Its own settings are its own…
    await page.getByTestId('block-effect').selectOption('wiggle');
    expect(await blockOf(page, 'a', 'q2')).toMatchObject({ effect: 'wiggle' });
    await expect(groupLocator(page, 'h')).toHaveText('Group ×2');
    // …and its time is the group's: the block on the timeline moves, with both members.
    await page.getByTestId('block-start').fill('8.5');
    await page.getByTestId('block-start').press('Enter');
    expect(await timings(page, ['q1', 'q2'])).toEqual([
      [8.5, 1],
      [8.5, 1],
    ]);
    const moved = await box(groupLocator(page, 'h'));
    expect(Math.abs(moved.x - (await timeToX(page, 8.5)))).toBeLessThanOrEqual(1);

    // Taken out of a group of three, a block is drawn on its own beside the two that stay.
    await groupLocator(page, 'g').click();
    await page.getByTestId('block-group-member-p3').click();
    await page.getByTestId('block-group-leave').click();
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: 'g', p2: 'g', p3: null });
    await expect(groupLocator(page, 'g')).toHaveText('Transform ×2');
    await expect(blockLocator(page, 'p3')).toBeVisible();
    await expect(blockLocator(page, 'p3')).toHaveClass(/is-selected/);
    await expect(page.getByTestId('block-group-section')).toHaveCount(0);
    // Ungroup, from the panel of either member left.
    await groupLocator(page, 'g').click();
    await page.getByTestId('block-group-ungroup').click();
    expect(await groupsOf(page, 'a')).toMatchObject({ p1: null, p2: null, p3: null });
    await expect(groupLocator(page, 'g')).toHaveCount(0);
    expect(await rowHeight(page)).toBe(ROW + 2 * LANE);
  });
});
