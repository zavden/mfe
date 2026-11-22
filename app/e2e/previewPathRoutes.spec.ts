import { expect, test, type Page } from './test';
import { canUndo, undo, type MfeWindow, type PairRefJson } from './helpers';
import { blockLocator, morphJson, openBlockScene } from './blockHelpers';
import { openRelationScene, plain, type RelFormula } from './relationsHelpers';
import { project } from './timelineHelpers';

/* Edit path on the routes of a pair (D167): a pair whose source glyphs go to target glyphs one by
 * one is edited as one path until «Path per glyph» is on (D175); then every route is drawn on its
 * own chord, a click on one (or on its glyph) edits that route's own path unless the others are
 * locked, and «All together» the common one. The glyphs are filled squares, so that a click on one
 * away from its centre — away from every curve — lands on its ink. The routes the frame draws
 * are read from its `data-path-routes` (CSS px from the canvas corner), the edited curve from its
 * `data-path-nodes`, the route edited from its `data-path-route`, the option and the lock from its
 * `data-path-per-glyph` and `data-path-lock-others`. */

const SQUARES: RelFormula[] = [
  { id: 'f1', name: 'one', source: '\\blacksquare' },
  { id: 'f2', name: 'two', source: '\\blacksquare\\qquad\\blacksquare' },
  { id: 'f3', name: 'three', source: '\\blacksquare\\qquad\\blacksquare\\qquad\\blacksquare' },
];

const REF: PairRefJson = { origin: { kind: 'relation', relationId: 'r1' }, index: 0 };

interface PairJson {
  from: number[];
  to: number[];
  style: string | null;
  routes?: { from: number; to: number; path: { nodes: NodeJson[] } }[];
}

interface NodeJson {
  at: [number, number];
  in: [number, number] | null;
  out: [number, number] | null;
  smooth: boolean;
}

interface RouteJson {
  route: string;
  own: boolean;
  from: [number, number];
  to: [number, number];
  /** A point on its curve, a third of the way along. */
  mark: [number, number];
}

const frame = (page: Page) => page.getByTestId('preview-frame');
const title = (page: Page) => page.getByTestId('path-edit-route');

/** The relation r1 from a clip of `from` (top left) to a clip of `to` (bottom right), with one
 * pair, and the mode open on it. */
async function openPair(page: Page, from: string, to: string, pair: PairJson): Promise<void> {
  const a = plain('a', from, 't1', 0, 8, {});
  a.initial.position = [-3, 1.5];
  a.initial.scale = 2;
  const b = plain('b', to, 't2', 2, 8, {});
  b.initial.position = [3, -1.5];
  b.initial.scale = 2;
  const relation = {
    id: 'r1',
    fromClipId: 'a',
    toClipId: 'b',
    offset: 0,
    duration: 2,
    easing: 'linear',
    style: 'transform',
    pathArc: 0,
    pairs: [pair],
  };
  await openRelationScene(page, [a, b], { relations: [relation] }, SQUARES);
  await page.evaluate((ref) => (window as MfeWindow).__mfe!.usePathEdit.getState().open(ref), REF);
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
}

async function routes(page: Page): Promise<RouteJson[]> {
  const text = await frame(page).getAttribute('data-path-routes');
  return text ? (JSON.parse(text) as RouteJson[]) : [];
}

async function nodes(page: Page): Promise<NodeJson[]> {
  const text = await frame(page).getAttribute('data-path-nodes');
  return text ? (JSON.parse(text) as NodeJson[]) : [];
}

async function storedPair(page: Page): Promise<PairJson & { path?: unknown }> {
  const p = await project(page);
  return (p.relations as unknown as { pairs: (PairJson & { path?: unknown })[] }[])[0]!.pairs[0]!;
}

/** Page coordinates of a point given in CSS px from the canvas corner. */
async function pageAt(page: Page, [x, y]: [number, number]): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId('preview-canvas').boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function clickAt(page: Page, point: [number, number]): Promise<void> {
  const at = await pageAt(page, point);
  await page.mouse.click(at.x, at.y);
}

/** «Path per glyph» turned on with its toggle (D175): the routes are drawn. */
async function perGlyphOn(page: Page): Promise<void> {
  await page.getByTestId('path-edit-per-glyph').click();
  await expect(frame(page)).toHaveAttribute('data-path-per-glyph', 'true');
  await expect(page.getByTestId('path-edit-per-glyph')).toHaveAttribute('aria-pressed', 'true');
}

/** Press the edited curve halfway between its two nodes and drag it `dy` px down. */
async function bendEdited(page: Page, dy: number): Promise<void> {
  const [first, last] = await nodes(page);
  const at = await pageAt(page, [
    (first!.at[0] + last!.at[0]) / 2,
    (first!.at[1] + last!.at[1]) / 2,
  ]);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y + dy, { steps: 6 });
  await page.mouse.up();
}

test('two sources onto one target: each route drawn, a click on one edits its own path', async ({
  page,
}) => {
  await openPair(page, 'f2', 'f1', { from: [0, 1], to: [0], style: null });
  // No route has a path of its own: the routes are shown once «Path per glyph» is on.
  await perGlyphOn(page);
  await expect(title(page)).toHaveText('All 2 routes');
  await expect(page.getByTestId('path-edit-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('path-edit-remove-own')).toHaveCount(0);
  await expect(page.getByTestId('preview-hint')).toContainText('Edit path of all the routes');
  const listed = await routes(page);
  expect(listed.map((r) => [r.route, r.own])).toEqual([
    ['0>0', false],
    ['1>0', false],
  ]);
  // Each route leaves its own source square (the first is left of the second) for the target.
  expect(listed[1]!.from[0] - listed[0]!.from[0]).toBeGreaterThan(40);
  expect(listed[0]!.to).toEqual(listed[1]!.to);

  // A click on the second route's curve: it is edited alone, on its own chord.
  await clickAt(page, listed[1]!.mark);
  await expect(frame(page)).toHaveAttribute('data-path-route', '1>0');
  await expect(title(page)).toHaveText(/^Route 2 of 2: /);
  await expect(page.getByTestId('path-edit-all')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('preview-hint')).toContainText('Edit path of one route');
  const [first, last] = await nodes(page);
  expect(first!.at).toEqual(listed[1]!.from);
  expect(last!.at).toEqual(listed[1]!.to);
  // No path of its own yet: nothing to remove.
  await expect(page.getByTestId('path-edit-remove-own')).toBeDisabled();
  expect(await storedPair(page)).not.toHaveProperty('routes');

  // Its first change writes its entry, as one undo step; the pair's own path stays absent.
  await bendEdited(page, -50);
  let stored = await storedPair(page);
  expect(stored.routes).toHaveLength(1);
  expect(stored.routes![0]).toMatchObject({ from: 1, to: 0 });
  expect(stored.routes![0]!.path.nodes).toHaveLength(3);
  expect(stored).not.toHaveProperty('path');
  await expect(page.getByTestId('path-edit-route-own')).toBeVisible();
  // The other route did not move.
  expect((await routes(page))[0]).toEqual(listed[0]);
  expect((await routes(page))[1]!.own).toBe(true);
  expect(await canUndo(page)).toBe(true);
  await undo(page);
  expect(await storedPair(page)).not.toHaveProperty('routes');
  await expect(frame(page)).toHaveAttribute('data-path-route', '1>0');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect.poll(async () => (await storedPair(page)).routes?.length).toBe(1);

  // «Remove own path»: it follows the common path again, still edited.
  await page.getByTestId('path-edit-remove-own').click();
  await expect.poll(async () => (await storedPair(page)).routes).toBeUndefined();
  await expect(frame(page)).toHaveAttribute('data-path-route', '1>0');
  await expect(page.getByTestId('path-edit-remove-own')).toBeDisabled();
  expect(await nodes(page)).toHaveLength(2);
  await undo(page);
  await expect.poll(async () => (await storedPair(page)).routes?.length).toBe(1);

  // «All together» edits the common path again; Done keeps the route's own path.
  await page.getByTestId('path-edit-all').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '');
  await expect(title(page)).toHaveText('All 2 routes');
  await page.getByTestId('path-edit-done').click();
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  stored = await storedPair(page);
  expect(stored.routes).toHaveLength(1);
  expect(stored).not.toHaveProperty('path');
});

test('the common path moves the routes that follow it, not one with a path of its own', async ({
  page,
}) => {
  const bump: { nodes: NodeJson[] } = {
    nodes: [
      { at: [0, 0], in: null, out: [0.3, 0.5], smooth: false },
      { at: [1, 0], in: [0.7, 0.5], out: null, smooth: false },
    ],
  };
  await openPair(page, 'f2', 'f1', {
    from: [0, 1],
    to: [0],
    style: null,
    routes: [{ from: 0, to: 0, path: bump }],
  });
  const before = await routes(page);
  expect(before.map((r) => r.own)).toEqual([true, false]);
  await bendEdited(page, 60);
  const after = await routes(page);
  // The route without a path of its own bends with the common path; the other keeps its curve.
  expect(after[1]!.mark[1]).toBeGreaterThan(before[1]!.mark[1] + 15);
  expect(after[0]).toEqual(before[0]);
  const stored = await storedPair(page);
  expect(stored.path).toBeDefined();
  expect(stored.routes).toEqual([{ from: 0, to: 0, path: bump }]);
});

test('a click on the glyph of one route chooses it; a glyph of several, or a drag, does not', async ({
  page,
}) => {
  // One source onto two targets: each target square is the glyph of one route.
  await openPair(page, 'f1', 'f2', { from: [0], to: [0, 1], style: null });
  await perGlyphOn(page);
  const listed = await routes(page);
  expect(listed.map((r) => r.route)).toEqual(['0>0', '0>1']);
  // Below the second target's centre, on its ink and away from every curve (they come from above).
  const target = listed[1]!.to;
  await clickAt(page, [target[0], target[1] + 10]);
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>1');
  // The source square is the glyph of both routes: a click on it chooses neither.
  await page.getByTestId('path-edit-all').click();
  const source = listed[0]!.from;
  await clickAt(page, [source[0] - 10, source[1] - 10]);
  await expect(frame(page)).toHaveAttribute('data-path-route', '');
  // A press on a route that becomes a drag chooses nothing.
  const mid = await pageAt(page, listed[0]!.mark);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 30, mid.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(frame(page)).toHaveAttribute('data-path-route', '');
  expect(await storedPair(page)).not.toHaveProperty('routes');
});

test('‹ and › step through the routes; leaving one drops an own path that says nothing', async ({
  page,
}) => {
  // Two onto three: Manim aligns the groups, the first square going to two targets.
  await openPair(page, 'f2', 'f3', { from: [0, 1], to: [0, 1, 2], style: null });
  await perGlyphOn(page);
  await expect(title(page)).toHaveText('All 3 routes');
  await page.getByTestId('path-edit-next').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>0');
  await expect(title(page)).toHaveText(/^Route 1 of 3: /);
  await page.getByTestId('path-edit-next').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>1');
  await page.getByTestId('path-edit-next').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '1>2');
  await expect(title(page)).toHaveText(/^Route 3 of 3: /);
  await page.getByTestId('path-edit-next').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '');
  await page.getByTestId('path-edit-prev').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '1>2');

  // Bend the route, then take the bend away: its own path is the chord, what it would follow.
  await bendEdited(page, -40);
  expect((await storedPair(page)).routes).toHaveLength(1);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '1:at');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await nodes(page)).length).toBe(2);
  expect((await storedPair(page)).routes).toHaveLength(1);
  // Leaving the route drops it.
  await page.getByTestId('path-edit-prev').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>1');
  expect(await storedPair(page)).not.toHaveProperty('routes');
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
});

test('a pair with one route has no route bar', async ({ page }) => {
  await openPair(page, 'f1', 'f1', { from: [0], to: [0], style: null });
  await expect(page.getByTestId('preview-hint')).toContainText('Edit path: drag anchors');
  await expect(page.getByTestId('path-edit-routes')).toHaveCount(0);
  await expect(frame(page)).toHaveAttribute('data-path-routes', '');
});

test('the routes of a Morph pair are edited the same way', async ({ page }) => {
  // In "a+b=c": a and b onto c.
  await openBlockScene(page, [morphJson('m', 3, 1.5, [{ from: [0, 2], to: [4], style: null }])]);
  await blockLocator(page, 'm').click();
  await page.getByTestId('block-morph-pair-0-edit-path').click();
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'morph:m:0');
  await perGlyphOn(page);
  await expect(title(page)).toHaveText('All 2 routes');
  // The three glyphs lie on one line: the routes run along the common path, which takes a click
  // first (it adds a node there). The bar chooses a route.
  const listed = await routes(page);
  await clickAt(page, listed[0]!.mark);
  await expect(frame(page)).toHaveAttribute('data-path-selected', '1:at');
  await expect(frame(page)).toHaveAttribute('data-path-route', '');
  await undo(page);
  await page.getByTestId('path-edit-next').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>4');
  await expect(title(page)).toHaveText('Route 1 of 2: a → c');
  await bendEdited(page, 50);
  const p = await project(page);
  const clip = p.clips.find((c) => c.id === 'a')!;
  const morph = (clip.actions as unknown as { id: string; pairs: PairJson[] }[]).find(
    (a) => a.id === 'm',
  )!;
  expect(morph.pairs[0]!.routes).toHaveLength(1);
  expect(morph.pairs[0]!.routes![0]).toMatchObject({ from: 0, to: 4 });
});

/** A point of a route's curve where it follows the plain chord: `t` of the way from its start. */
const along = (route: RouteJson, t: number): [number, number] => [
  route.from[0] + t * (route.to[0] - route.from[0]),
  route.from[1] + t * (route.to[1] - route.from[1]),
];

test('Path per glyph is off when no route has its own path: one curve, on the first route, and no route answers', async ({
  page,
}) => {
  await openPair(page, 'f2', 'f1', { from: [0, 1], to: [0], style: null });
  await expect(frame(page)).toHaveAttribute('data-path-per-glyph', 'false');
  await expect(frame(page)).toHaveAttribute('data-path-lock-others', 'false');
  const toggle = page.getByTestId('path-edit-per-glyph');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(title(page)).toHaveText('One path for all the glyphs');
  await expect(page.getByTestId('path-edit-own-count')).toHaveCount(0);
  for (const id of ['path-edit-prev', 'path-edit-next', 'path-edit-all', 'path-edit-lock-others'])
    await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByTestId('preview-hint')).toContainText('Edit path of all the glyphs');
  await expect(page.getByTestId('preview-hint')).toContainText('turn on Path per glyph');
  // One curve, and no route drawn beside it.
  await expect(frame(page)).toHaveAttribute('data-path-routes', '');
  const drawn = await nodes(page);
  expect(drawn).toHaveLength(2);

  // Where the routes run, as the option draws them; then off again.
  await perGlyphOn(page);
  const listed = await routes(page);
  expect(listed.map((r) => r.route)).toEqual(['0>0', '1>0']);
  await toggle.click();
  await expect(frame(page)).toHaveAttribute('data-path-per-glyph', 'false');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(frame(page)).toHaveAttribute('data-path-routes', '');
  // The common path was drawn on the first route's chord: from the first square to the target.
  expect(drawn[0]!.at).toEqual(listed[0]!.from);
  expect(drawn[1]!.at).toEqual(listed[0]!.to);
  expect(await nodes(page)).toEqual(drawn);

  // A click where the second route runs, or on its own square, chooses nothing, writes nothing.
  const before = await project(page);
  await clickAt(page, along(listed[1]!, 0.25));
  const second = listed[1]!.from;
  await clickAt(page, [second[0], second[1] - 10]);
  await expect(frame(page)).toHaveAttribute('data-path-route', '');
  await expect(frame(page)).toHaveAttribute('data-path-per-glyph', 'false');
  expect(await project(page)).toEqual(before);
  expect(await nodes(page)).toEqual(drawn);
  // The curve is the pair's: bending it writes the pair's path, which both routes follow.
  await bendEdited(page, 40);
  const stored = await storedPair(page);
  expect(stored.path).toBeDefined();
  expect(stored).not.toHaveProperty('routes');
});

test('the lock leaves the other routes drawn but deaf to the pointer, and ‹ › still choose', async ({
  page,
}) => {
  await openPair(page, 'f2', 'f1', { from: [0, 1], to: [0], style: null });
  await perGlyphOn(page);
  const lock = page.getByTestId('path-edit-lock-others');
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  const listed = await routes(page);
  const canvas = page.getByTestId('preview-canvas');
  // Unlocked, the pointer over another route says that a click would choose it.
  const mark = await pageAt(page, listed[1]!.mark);
  await page.mouse.move(mark.x, mark.y);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(frame(page)).toHaveAttribute('data-path-lock-others', 'true');
  await expect(page.getByTestId('preview-hint')).toContainText(
    '‹ › choose another route (the others are locked)',
  );
  // Still drawn; the pointer over them says nothing.
  expect(await routes(page)).toEqual(listed);
  await page.mouse.move(mark.x + 1, mark.y);
  await expect(canvas).toHaveCSS('cursor', 'default');
  // Neither a click on the route nor one on its square chooses it.
  const before = await project(page);
  await clickAt(page, listed[1]!.mark);
  const second = listed[1]!.from;
  await clickAt(page, [second[0], second[1] - 10]);
  await expect(frame(page)).toHaveAttribute('data-path-route', '');
  expect(await project(page)).toEqual(before);
  // The bar's arrows still go through the routes.
  await page.getByTestId('path-edit-next').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>0');
  await page.getByTestId('path-edit-next').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '1>0');
  await expect(page.getByTestId('preview-hint')).toContainText('Edit path of one route');
  await clickAt(page, listed[0]!.mark);
  await expect(frame(page)).toHaveAttribute('data-path-route', '1>0');
  // Unlocked, a click chooses again.
  await lock.click();
  await expect(frame(page)).toHaveAttribute('data-path-lock-others', 'false');
  await clickAt(page, listed[0]!.mark);
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>0');
});

test('Path per glyph turned off with a route chosen edits the common path and deletes nothing', async ({
  page,
}) => {
  await openPair(page, 'f2', 'f1', { from: [0, 1], to: [0], style: null });
  await perGlyphOn(page);
  const listed = await routes(page);
  await page.getByTestId('path-edit-next').click();
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>0');
  await bendEdited(page, -50);
  const own = (await storedPair(page)).routes;
  expect(own).toHaveLength(1);
  await page.getByTestId('path-edit-per-glyph').click();
  await expect(frame(page)).toHaveAttribute('data-path-per-glyph', 'false');
  await expect(frame(page)).toHaveAttribute('data-path-route', '');
  await expect(frame(page)).toHaveAttribute('data-path-routes', '');
  // The route keeps its own path, and plays it.
  expect((await storedPair(page)).routes).toEqual(own);
  // The bar says the one curve is the common path, and that a route has its own.
  await expect(title(page)).toHaveText('Common path');
  await expect(page.getByTestId('path-edit-own-count')).toHaveText('1 route with its own path');
  await expect(page.getByTestId('preview-hint')).toContainText('Edit the common path');
  // The common path is drawn where it is followed: on the second route, the first has its own.
  const drawn = await nodes(page);
  expect(drawn).toHaveLength(2);
  expect(drawn[0]!.at).toEqual(listed[1]!.from);
  expect(drawn[1]!.at).toEqual(listed[1]!.to);
  await page.getByTestId('path-edit-done').click();
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  expect((await storedPair(page)).routes).toEqual(own);
});

test('a pair with a route of its own opens with Path per glyph on, the lock off', async ({
  page,
}) => {
  const bump: { nodes: NodeJson[] } = {
    nodes: [
      { at: [0, 0], in: null, out: [0.3, 0.5], smooth: false },
      { at: [1, 0], in: [0.7, 0.5], out: null, smooth: false },
    ],
  };
  await openPair(page, 'f2', 'f1', {
    from: [0, 1],
    to: [0],
    style: null,
    routes: [{ from: 1, to: 0, path: bump }],
  });
  await expect(frame(page)).toHaveAttribute('data-path-per-glyph', 'true');
  await expect(frame(page)).toHaveAttribute('data-path-lock-others', 'false');
  await expect(page.getByTestId('path-edit-per-glyph')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('path-edit-lock-others')).toHaveAttribute('aria-pressed', 'false');
  await expect(title(page)).toHaveText('All 2 routes');
  expect((await routes(page)).map((r) => [r.route, r.own])).toEqual([
    ['0>0', false],
    ['1>0', true],
  ]);
});

test('Enter on a button of the route bar presses it and the mode stays on; during a drag it is the mode’s', async ({
  page,
}) => {
  await openPair(page, 'f2', 'f1', { from: [0, 1], to: [0], style: null });
  // «Path per glyph», then ›, pressed with Enter from the keyboard.
  await page.getByTestId('path-edit-per-glyph').focus();
  await page.keyboard.press('Enter');
  await expect(frame(page)).toHaveAttribute('data-path-per-glyph', 'true');
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  await page.getByTestId('path-edit-next').focus();
  await page.keyboard.press('Enter');
  await expect(frame(page)).toHaveAttribute('data-path-route', '0>0');
  await expect(frame(page)).toHaveAttribute('data-path-edit', 'relation:r1:0');
  // With a drag of the curve held, Enter is the mode's as anywhere else: the drag is kept and
  // the mode left — «All together», which has the focus, is not pressed.
  const all = page.getByTestId('path-edit-all');
  await all.focus();
  const [first, last] = await nodes(page);
  const at = await pageAt(page, [
    (first!.at[0] + last!.at[0]) / 2,
    (first!.at[1] + last!.at[1]) / 2,
  ]);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y + 40, { steps: 6 });
  await expect(all).toBeFocused();
  await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect(frame(page)).toHaveAttribute('data-path-edit', '');
  expect((await storedPair(page)).routes?.map((route) => route.from)).toEqual([0]);
});
