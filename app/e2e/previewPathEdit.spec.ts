import { expect, test, type Page } from './test';
import { canUndo, undo, type MfeWindow, type PairRefJson } from './helpers';
import { blockLocator, morphJson, openBlockScene } from './blockHelpers';
import { openRelationScene, plain, selectRelation } from './relationsHelpers';
import { project, uiState } from './timelineHelpers';
import { scenePoint } from './previewHelpers';

/* Edit path: the preview mode that shapes the custom path of a transfer pair (D48). The mode is
 * entered through its store here (the menus come later); the nodes it draws are read from the
 * frame's `data-path-nodes` (CSS px from the canvas corner). */

const A = plain('a', 'fa', 't1', 0, 8);
A.initial.position = [-2, 1];
const B = plain('b', 'fb', 't2', 2, 8);
B.initial.position = [2, -1];
const RELATION = {
  id: 'r1',
  fromClipId: 'a',
  toClipId: 'b',
  offset: 0,
  duration: 2,
  easing: 'linear',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [0], to: [0], style: null }],
};
const REF: PairRefJson = { origin: { kind: 'relation', relationId: 'r1' }, index: 0 };

interface NodeJson {
  at: [number, number];
  in: [number, number] | null;
  out: [number, number] | null;
  smooth: boolean;
}

const frame = (page: Page) => page.getByTestId('preview-frame');

async function nodes(page: Page): Promise<NodeJson[]> {
  const text = await frame(page).getAttribute('data-path-nodes');
  return text ? (JSON.parse(text) as NodeJson[]) : [];
}

/** Page coordinates of a point given in CSS px from the canvas corner. */
async function pageAt(page: Page, [x, y]: [number, number]): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId('preview-canvas').boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function storedPath(page: Page) {
  const p = await project(page);
  const relation = (p.relations as unknown as { pairs: { path?: { nodes: NodeJson[] } }[] }[])[0]!;
  return relation.pairs[0]!.path ?? null;
}

async function open(page: Page): Promise<void> {
  await openRelationScene(page, [A, B], { relations: [RELATION] });
  await page.evaluate((ref) => (window as MfeWindow).__mfe!.usePathEdit.getState().open(ref), REF);
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
}

test('entering the mode moves the playhead to the middle of the window and shows the chord', async ({
  page,
}) => {
  await open(page);
  expect((await uiState(page)).time).toBe(3);
  expect((await uiState(page)).selection).toEqual({ kind: 'relation', id: 'r1' });
  await expect(page.getByTestId('preview-hint')).toContainText('Edit path');
  const drawn = await nodes(page);
  expect(drawn).toHaveLength(2);
  // The chord runs from the source glyph's centre to the target glyph's centre: right and down.
  expect(drawn[1]!.at[0]).toBeGreaterThan(drawn[0]!.at[0]);
  expect(drawn[1]!.at[1]).toBeGreaterThan(drawn[0]!.at[1]);
  // The glyphs at the start and at the end are drawn as ghosts.
  expect(Number(await frame(page).getAttribute('data-ghost-count'))).toBe(2);
  // Done leaves the mode; a path that is the chord itself is not kept.
  await page.getByTestId('path-edit-done').click();
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  expect(await storedPath(page)).toBeNull();
});

test("a pair without a path starts from the relation's arc, kept only once edited", async ({
  page,
}) => {
  await openRelationScene(page, [A, B], { relations: [{ ...RELATION, pathArc: 60 }] });
  await page.evaluate((ref) => (window as MfeWindow).__mfe!.usePathEdit.getState().open(ref), REF);
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  const [first, last] = await nodes(page);
  expect(first!.in).toBeNull();
  expect(last!.out).toBeNull();
  // The handles leave the chord on the side Manim swings a positive arc to: under a chord that
  // runs right, i.e. to the right of the travel direction, which with y growing downwards on
  // screen is a positive cross product.
  const d = [last!.at[0] - first!.at[0], last!.at[1] - first!.at[1]];
  const h = [first!.out![0] - first!.at[0], first!.out![1] - first!.at[1]];
  expect(d[0]! * h[1]! - d[1]! * h[0]!).toBeGreaterThan(0);
  // Left alone, the arc is not written: the pair keeps following the relation's Path arc.
  await page.getByTestId('path-edit-done').click();
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  expect(await storedPath(page)).toBeNull();
  // Moving a handle makes it the pair's own path, starting from the arc.
  await page.evaluate((ref) => (window as MfeWindow).__mfe!.usePathEdit.getState().open(ref), REF);
  const from = await pageAt(page, first!.out!);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Enter');
  const stored = (await storedPath(page))!;
  expect(stored.nodes).toHaveLength(2);
  expect(stored.nodes[1]!.in).not.toBeNull();
  await expect(page.getByTestId('relation-pair-0-path')).toHaveText('custom path');
});

test('a press on the curve adds an anchor and drags it, as one undo step', async ({ page }) => {
  await open(page);
  const [first, last] = await nodes(page);
  const middle: [number, number] = [
    (first!.at[0] + last!.at[0]) / 2,
    (first!.at[1] + last!.at[1]) / 2,
  ];
  const from = await pageAt(page, middle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 60, { steps: 8 });
  await page.mouse.up();
  await expect(frame(page)).toHaveAttribute('data-path-selected', '1:at');
  const drawn = await nodes(page);
  expect(drawn).toHaveLength(3);
  expect(drawn[1]!.at[1]).toBeCloseTo(middle[1] - 60, 0);
  const stored = (await storedPath(page))!;
  expect(stored.nodes).toHaveLength(3);
  // Up on screen is to the left of a chord that runs right and down: v > 0.
  expect(stored.nodes[1]!.at[1]).toBeGreaterThan(0.1);
  expect(stored.nodes[1]!.smooth).toBe(false);
  // One step: the anchor and its move go together.
  expect(await canUndo(page)).toBe(true);
  await undo(page);
  expect(await nodes(page)).toHaveLength(2);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  expect(await nodes(page)).toHaveLength(3);
  // The curve bends while the glyph is still drawn by the morph at the playhead.
  expect((await uiState(page)).time).toBe(3);
});

test('an anchor becomes smooth with a double-click, a handle breaks the pair with Ctrl', async ({
  page,
}) => {
  await open(page);
  const [first, last] = await nodes(page);
  const middle: [number, number] = [
    (first!.at[0] + last!.at[0]) / 2,
    (first!.at[1] + last!.at[1]) / 2,
  ];
  const at = await pageAt(page, middle);
  await page.mouse.click(at.x, at.y);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '1:at');
  await page.mouse.dblclick(at.x, at.y);
  await expect.poll(async () => (await nodes(page))[1]!.smooth).toBe(true);
  let drawn = await nodes(page);
  expect(drawn[1]!.in).not.toBeNull();
  expect(drawn[1]!.out).not.toBeNull();
  // Drag the outgoing handle up: the incoming one mirrors it, opposite.
  const out = await pageAt(page, drawn[1]!.out!);
  await page.mouse.move(out.x, out.y);
  await page.mouse.down();
  await page.mouse.move(out.x, out.y - 40, { steps: 6 });
  await page.mouse.up();
  drawn = await nodes(page);
  expect(drawn[1]!.out![1]).toBeCloseTo(out.y - 40 - (await pageAt(page, [0, 0])).y, 0);
  const anchor = drawn[1]!.at;
  const dIn = [drawn[1]!.in![0] - anchor[0], drawn[1]!.in![1] - anchor[1]];
  const dOut = [drawn[1]!.out![0] - anchor[0], drawn[1]!.out![1] - anchor[1]];
  // Collinear and opposite (the nodes are reported to a tenth of a pixel).
  const lengths = Math.hypot(dIn[0]!, dIn[1]!) * Math.hypot(dOut[0]!, dOut[1]!);
  expect(Math.abs(dIn[0]! * dOut[1]! - dIn[1]! * dOut[0]!) / lengths).toBeLessThan(0.02);
  expect(dIn[0]! * dOut[0]! + dIn[1]! * dOut[1]!).toBeLessThan(0);
  // With Ctrl the pair breaks: the node is a corner and the incoming handle stays put.
  const before = drawn[1]!.in!;
  const out2 = await pageAt(page, drawn[1]!.out!);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.move(out2.x, out2.y);
  await page.mouse.down();
  await page.mouse.move(out2.x + 30, out2.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('ControlOrMeta');
  drawn = await nodes(page);
  expect(drawn[1]!.smooth).toBe(false);
  expect(drawn[1]!.in).toEqual(before);
  // Delete retracts the selected handle, then removes the selected anchor.
  await expect(frame(page)).toHaveAttribute('data-path-selected', '1:out');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await nodes(page))[1]!.out).toBeNull();
  expect(await nodes(page)).toHaveLength(3);
  const anchor2 = await pageAt(page, (await nodes(page))[1]!.at);
  await page.mouse.click(anchor2.x, anchor2.y);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '1:at');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await nodes(page)).length).toBe(2);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '');
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  // Two nodes without handles between them is the chord: nothing is stored.
  expect(await storedPath(page)).toBeNull();
});

test('a smooth anchor’s handles mirror each other; Shift keeps the other’s length, Ctrl/⌘ moves one alone', async ({
  page,
}) => {
  await open(page);
  const [first, last] = await nodes(page);
  const at = await pageAt(page, [
    (first!.at[0] + last!.at[0]) / 2,
    (first!.at[1] + last!.at[1]) / 2,
  ]);
  // An anchor in the middle, made smooth.
  await page.mouse.click(at.x, at.y);
  await page.mouse.dblclick(at.x, at.y);
  await expect.poll(async () => (await storedPath(page))?.nodes[1]?.smooth).toBe(true);
  // The project's spline, in the frame of the chord: lengths there are lengths on screen.
  const anchor = async () => (await storedPath(page))!.nodes[1]!;
  const length = (node: NodeJson, part: 'in' | 'out') =>
    Math.hypot(node[part]![0] - node.at[0], node[part]![1] - node.at[1]);
  const opposite = (node: NodeJson) => {
    const a = [node.in![0] - node.at[0], node.in![1] - node.at[1]];
    const b = [node.out![0] - node.at[0], node.out![1] - node.at[1]];
    const sine =
      (a[0]! * b[1]! - a[1]! * b[0]!) / (Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!));
    expect(Math.abs(sine)).toBeLessThan(1e-3);
    expect(a[0]! * b[0]! + a[1]! * b[1]!).toBeLessThan(0);
  };
  /** Where the outgoing handle is on the page. */
  const outOnPage = async () => pageAt(page, (await nodes(page))[1]!.out!);
  /** The outgoing handle dragged by (dx, dy) px, `key` held from before the press. */
  const dragOut = async (dx: number, dy: number, key?: string) => {
    const out = await outOnPage();
    if (key) await page.keyboard.down(key);
    await page.mouse.move(out.x, out.y);
    await page.mouse.down();
    await page.mouse.move(out.x + dx, out.y + dy, { steps: 6 });
    await page.mouse.up();
    if (key) await page.keyboard.up(key);
  };

  // A plain drag: the incoming handle is the outgoing one reflected through the anchor.
  let before = await anchor();
  await dragOut(30, -50);
  let node = await anchor();
  expect(length(node, 'out')).toBeGreaterThan(length(before, 'out') + 0.05);
  expect(length(node, 'in')).toBeCloseTo(length(node, 'out'), 4);
  expect(node.in![0]).toBeCloseTo(2 * node.at[0] - node.out![0], 4);
  expect(node.in![1]).toBeCloseTo(2 * node.at[1] - node.out![1], 4);
  expect(node.smooth).toBe(true);

  // With Shift: the incoming handle turns to stay opposite and keeps its own length.
  before = node;
  await dragOut(-50, 45, 'Shift');
  node = await anchor();
  expect(length(node, 'in')).toBeCloseTo(length(before, 'in'), 4);
  expect(Math.abs(length(node, 'out') - length(node, 'in'))).toBeGreaterThan(0.02);
  opposite(node);
  expect(node.smooth).toBe(true);

  // The key is read at each move: Shift pressed in the middle of a drag changes the next one.
  before = node;
  const out = await outOnPage();
  await page.mouse.move(out.x, out.y);
  await page.mouse.down();
  await page.mouse.move(out.x + 25, out.y - 25, { steps: 4 });
  await expect
    .poll(async () => length(await anchor(), 'out'))
    .not.toBeCloseTo(length(before, 'out'), 4);
  let held = await anchor();
  expect(length(held, 'in')).toBeCloseTo(length(held, 'out'), 4);
  await page.keyboard.down('Shift');
  await page.mouse.move(out.x + 30, out.y - 25, { steps: 2 });
  held = await anchor();
  expect(length(held, 'in')).toBeCloseTo(length(before, 'in'), 4);
  opposite(held);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const kept = await anchor();

  // With Ctrl/⌘: only that handle moves, and the anchor becomes a corner.
  await dragOut(20, 30, 'ControlOrMeta');
  node = await anchor();
  expect(node.smooth).toBe(false);
  expect(node.in).toEqual(kept.in);
  expect(node.out).not.toEqual(kept.out);
  // Each drag is one step of the undo history.
  await undo(page);
  await expect.poll(async () => (await anchor()).smooth).toBe(true);
  expect(await anchor()).toEqual(kept);
});

test('the arrows nudge the selection and Escape cancels a drag', async ({ page }) => {
  await open(page);
  const [first, last] = await nodes(page);
  const middle: [number, number] = [
    (first!.at[0] + last!.at[0]) / 2,
    (first!.at[1] + last!.at[1]) / 2,
  ];
  const at = await pageAt(page, middle);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await nodes(page)).length).toBe(3);
  const before = (await nodes(page))[1]!.at;
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await nodes(page))[1]!.at[1]).toBeCloseTo(before[1] - 1, 0);
  expect((await nodes(page))[1]!.at[0]).toBeCloseTo(before[0] + 10, 0);
  // A drag cancelled with Escape leaves the anchor where it was.
  const moved = await pageAt(page, (await nodes(page))[1]!.at);
  await page.mouse.move(moved.x, moved.y);
  await page.mouse.down();
  await page.mouse.move(moved.x, moved.y - 50, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await nodes(page))[1]!.at[1]).toBeCloseTo(before[1] - 1, 0);
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  // The pair's path plays: at the playhead the glyph is off the straight line.
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  const stored = (await storedPath(page))!;
  expect(stored.nodes).toHaveLength(3);
});

test('a right-click opens the preview’s menu: Escape leaves the mode on, an entry chosen there ends it and keeps the path', async ({
  page,
}) => {
  await open(page);
  // A path of its own: an anchor pulled off the chord.
  const [first, last] = await nodes(page);
  const middle = await pageAt(page, [
    (first!.at[0] + last!.at[0]) / 2,
    (first!.at[1] + last!.at[1]) / 2,
  ]);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y - 60, { steps: 8 });
  await page.mouse.up();
  const shaped = (await storedPath(page))!;
  expect(shaped.nodes).toHaveLength(3);
  // On empty space, the menu of the scene; closed with Escape, the mode stays on.
  const empty = await scenePoint(page, [-5.5, -3.2]);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await expect(page.getByTestId('preview-space-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preview-space-menu')).toHaveCount(0);
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  // On a formula, its menu: closed with a press elsewhere, the mode stays on too.
  const formula = await scenePoint(page, [2, -1]);
  await page.mouse.click(formula.x, formula.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByTestId('preview-menu')).toHaveCount(0);
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  // An entry chosen there — one that starts no other mode — ends the mode before it acts.
  await page.mouse.click(formula.x, formula.y, { button: 'right' });
  await expect(page.getByTestId('preview-menu')).toBeVisible();
  await page.getByTestId('preview-menu-copy-properties').click();
  await expect(page.getByTestId('preview-menu')).toHaveCount(0);
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  // The path is kept as it was shaped.
  expect(await storedPath(page)).toEqual(shaped);
});

test('the Animations panel opens the mode on a relation pair and names what it follows', async ({
  page,
}) => {
  await openRelationScene(page, [A, B], { relations: [{ ...RELATION, pathArc: 30 }] });
  await selectRelation(page, 'r1');
  const row = page.getByTestId('relation-pair-0-path');
  await expect(row).toHaveText('arc 30°');
  await page.getByTestId('relation-pair-0-edit-path').click();
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  // Bend the path, finish: the row says so. The curve starts as the arc (one cubic): press its
  // midpoint, B(½) = (P0 + 3 P1 + 3 P2 + P3) / 8.
  const [first, last] = await nodes(page);
  const middle: [number, number] = [
    (first!.at[0] + 3 * first!.out![0] + 3 * last!.in![0] + last!.at[0]) / 8,
    (first!.at[1] + 3 * first!.out![1] + 3 * last!.in![1] + last!.at[1]) / 8,
  ];
  const from = await pageAt(page, middle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 50, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('path-edit-done').click();
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  await expect(row).toHaveText('custom path');
  expect((await storedPath(page))!.nodes).toHaveLength(3);
});

test('the block panel opens the mode on a Morph pair', async ({ page }) => {
  await openBlockScene(page, [morphJson('m', 3, 1.5, [{ from: [0], to: [4], style: null }])]);
  await blockLocator(page, 'm').click();
  await expect(page.getByTestId('block-morph-pair-0-path')).toHaveText('straight');
  await page.getByTestId('block-morph-pair-0-edit-path').click();
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'morph:m:0');
  expect((await uiState(page)).time).toBe(3.75);
  await expect(page.getByTestId('preview-hint')).toContainText('Edit path');
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
});
