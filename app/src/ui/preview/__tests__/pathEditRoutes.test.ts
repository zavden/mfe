// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { arcSpline, straightSpline, type Box } from '../../../geom';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  remapGlyphRefs,
  type GlyphPair,
  type PathSpline,
  type Project,
} from '../../../model';
import { createEvaluator } from '../../../scene';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { withServices } from '../../../test/services';
import {
  changePath,
  currentPath,
  findPair,
  pathEditFrame,
  pathEditHint,
  restoreGesturePath,
  startPathEditTracking,
  usePathEdit,
  writePath,
  writeRoutePath,
  type PairRef,
} from '../pathEdit';
import { boxSnapshot, resolvedBoxes } from './resolvedBoxes';

withServices(startPathEditTracking);

const square = (x: number): Box => ({ minX: x - 0.5, minY: -0.5, maxX: x + 0.5, maxY: 0.5 });
/** Formula a: two glyphs, at x = −1 and 1; formula b: three, at x = −2, 0 and 2. */
const BOXES = { fa: [square(-1), square(1)], fb: [square(-2), square(0), square(2)] };

const bump: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
    { at: [1, 0], in: [0.7, 0.4], out: null, smooth: false },
  ],
};

/** Clip a at (−3, 2), clip b at (3, −2), both 0–10 s; the relation a → b in [1, 3) with `pair`. */
function build(pair: GlyphPair, pathArc = 0): Project {
  const p = createEmptyProject('t');
  p.formulas = (['fa', 'fb'] as const).map((id) => ({
    ...createFormula({ name: id, source: 'x', snapshot: boxSnapshot(BOXES[id]) }),
    id,
  }));
  const [top] = p.tracks;
  p.clips = ['a', 'b'].map((id) => {
    const c = createClip(`f${id}`, top!.id, 0, 10);
    c.id = id;
    c.initial.position = id === 'a' ? [-3, 2] : [3, -2];
    return c;
  });
  const relation = createRelation('a', 'b', { offset: 1, duration: 2, pathArc, pairs: [pair] });
  relation.id = 'r1';
  p.relations.push(relation);
  return p;
}

const REL: PairRef = { origin: { kind: 'relation', relationId: 'r1' }, index: 0 };
const TWO_ONTO_ONE: GlyphPair = { from: [0, 1], to: [1], style: null };

function load(p: Project): void {
  loadProject(p);
  useRenderStore.setState({
    resolved: new Map(p.formulas.map((f) => [f.id, resolvedBoxes(f, BOXES[f.id as 'fa'])])),
    transitions: {},
  });
}

const project = () => useProjectStore.getState().project;
const stored = () => findPair(project(), REL)!.pair;
/** The frame the panel measures for the session as it is: its route, «Path per glyph» and the
 * lock of the other routes. */
const frame = () => {
  const { route, perGlyph, lockOthers } = usePathEdit.getState();
  return pathEditFrame(
    project(),
    createEvaluator(project(), useRenderStore.getState().resolved),
    REL,
    route,
    { perGlyph, lockOthers },
  )!;
};
const steps = () => useProjectStore.temporal.getState().pastStates.length;
/** The mode on the pair with «Path per glyph» turned on, as its toggle does (D175). */
const openPerGlyph = () => {
  usePathEdit.getState().open(REL);
  usePathEdit.getState().setPerGlyph(true);
};

beforeEach(() => {
  usePathEdit.setState({
    target: null,
    route: null,
    perGlyph: false,
    lockOthers: false,
    selected: null,
  });
  load(build(TWO_ONTO_ONE));
  useUiStore.setState({ time: 0, selection: { kind: 'none' }, playing: false });
});

describe('the routes in the mode', () => {
  it('opens on the common path alone; with Path per glyph, every route laid on its own chord', () => {
    usePathEdit.getState().open(REL);
    expect(usePathEdit.getState()).toMatchObject({ route: null, perGlyph: false });
    let f = frame();
    // Off (D175): the common path, drawn once on the chord of the first route; no route drawn,
    // none to choose.
    expect(f).toMatchObject({ route: null, perGlyph: false, routes: [], choosable: false });
    expect(f.from).toEqual([-4, 2]);
    expect(f.to).toEqual([3, -2]);
    expect(f.spline).toEqual(straightSpline());
    expect(f.choices).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 1 },
    ]);
    expect(pathEditHint(f)).toMatch(
      /^Edit path of all the glyphs: .* turn on Path per glyph to shape one glyph alone/,
    );
    usePathEdit.getState().chooseRoute({ from: 1, to: 1 });
    expect(usePathEdit.getState().route).toBeNull();

    usePathEdit.getState().setPerGlyph(true);
    expect(usePathEdit.getState()).toMatchObject({ route: null, perGlyph: true });
    f = frame();
    expect(f).toMatchObject({ route: null, perGlyph: true, choosable: true });
    // The pair's chord: from the middle of both sources to the target.
    expect(f.from).toEqual([-3, 2]);
    expect(f.to).toEqual([3, -2]);
    // Each route from its own source glyph to its target glyph.
    expect(f.routes.map((r) => [r.from, r.to, r.own])).toEqual([
      [[-4, 2], [3, -2], false],
      [[-2, 2], [3, -2], false],
    ]);
    expect(pathEditHint(f)).toMatch(/^Edit path of all the routes/);
  });

  it('has no routes on a pair with a single one: the mode is as it was', () => {
    load(build({ from: [0], to: [1], style: null }));
    usePathEdit.getState().open(REL);
    expect(frame()).toMatchObject({ choices: [], routes: [], perGlyph: false, choosable: false });
    expect(pathEditHint(frame())).toMatch(/^Edit path: drag anchors/);
    usePathEdit.getState().chooseRoute({ from: 0, to: 1 });
    expect(usePathEdit.getState().route).toBeNull();
  });

  it('edits a route on its own chord: its first change writes its entry, one undo step', () => {
    openPerGlyph();
    const revision = usePathEdit.getState().revision;
    usePathEdit.getState().chooseRoute({ from: 1, to: 1 });
    expect(usePathEdit.getState()).toMatchObject({ route: { from: 1, to: 1 }, selected: null });
    expect(usePathEdit.getState().revision).toBeGreaterThan(revision);
    const f = frame();
    expect([f.from, f.to]).toEqual([
      [-2, 2],
      [3, -2],
    ]);
    // It starts as what the route follows: the common path, here the plain chord.
    expect(f.spline).toEqual(straightSpline());
    expect(pathEditHint(f)).toMatch(/^Edit path of one route/);
    const before = steps();
    expect(changePath(REL, f.spline, bump)).toBe(true);
    expect(stored().routes).toEqual([{ from: 1, to: 1, path: bump }]);
    expect(stored()).not.toHaveProperty('path');
    expect(steps()).toBe(before + 1);
    expect(frame().spline).toBe(bump);
    // Undo takes the entry back; the route stays chosen and follows the common path again.
    history.undo();
    expect(stored()).not.toHaveProperty('routes');
    expect(usePathEdit.getState().route).toEqual({ from: 1, to: 1 });
    expect(frame().spline).toEqual(straightSpline());
  });

  it('refuses a write meant for another route than the one chosen', () => {
    openPerGlyph();
    usePathEdit.getState().chooseRoute({ from: 1, to: 1 });
    expect(changePath(REL, straightSpline(), bump, null)).toBe(false);
    expect(changePath(REL, straightSpline(), bump, { from: 0, to: 1 })).toBe(false);
    expect(stored()).not.toHaveProperty('routes');
    expect(changePath(REL, straightSpline(), bump, { from: 1, to: 1 })).toBe(true);
  });

  it('moves the routes without a path of their own when the common path is edited', () => {
    useProjectStore
      .getState()
      .update((draft) => writeRoutePath(draft, REL, { from: 0, to: 1 }, arcSpline(90)));
    usePathEdit.getState().open(REL);
    expect(changePath(REL, straightSpline(), bump)).toBe(true);
    expect(stored().path).toBe(bump);
    const [first, second] = frame().routes;
    expect(first).toMatchObject({ own: true, spline: arcSpline(90) });
    expect(second).toMatchObject({ own: false, spline: bump });
  });
});

describe('leaving a route', () => {
  it('drops its own path when it is what the route would follow without it', () => {
    openPerGlyph();
    usePathEdit.getState().chooseRoute({ from: 1, to: 1 });
    changePath(REL, straightSpline(), bump);
    changePath(REL, bump, straightSpline());
    expect(stored().routes).toEqual([{ from: 1, to: 1, path: straightSpline() }]);
    usePathEdit.getState().chooseRoute({ from: 0, to: 1 });
    expect(stored()).not.toHaveProperty('routes');
    expect(usePathEdit.getState().route).toEqual({ from: 0, to: 1 });
    // A path of its own that differs stays, going to All together and closing.
    changePath(REL, straightSpline(), bump);
    usePathEdit.getState().chooseRoute(null);
    expect(stored().routes).toEqual([{ from: 0, to: 1, path: bump }]);
    usePathEdit.getState().close();
    expect(stored().routes).toEqual([{ from: 0, to: 1, path: bump }]);
  });

  it('drops on closing every route path the common path has caught up with', () => {
    useProjectStore.getState().update((draft) => {
      writeRoutePath(draft, REL, { from: 0, to: 1 }, bump);
      writeRoutePath(draft, REL, { from: 1, to: 1 }, arcSpline(90));
    });
    usePathEdit.getState().open(REL);
    // The common path made what route 0 → 1 has: that route's own says nothing any more.
    changePath(REL, straightSpline(), bump);
    usePathEdit.getState().close();
    expect(stored().path).toEqual(bump);
    expect(stored().routes).toEqual([{ from: 1, to: 1, path: arcSpline(90) }]);
  });

  it('removes the chosen route’s own path as one step, the route still chosen', () => {
    openPerGlyph();
    usePathEdit.getState().chooseRoute({ from: 0, to: 1 });
    changePath(REL, straightSpline(), bump);
    const before = steps();
    usePathEdit.getState().removeRoutePath();
    expect(stored()).not.toHaveProperty('routes');
    expect(steps()).toBe(before + 1);
    expect(usePathEdit.getState().route).toEqual({ from: 0, to: 1 });
    // Nothing to remove: no step.
    usePathEdit.getState().removeRoutePath();
    expect(steps()).toBe(before + 1);
  });

  it('writes nothing on a locked track: neither a route nor its removal', () => {
    useProjectStore
      .getState()
      .update((draft) => writeRoutePath(draft, REL, { from: 0, to: 1 }, bump));
    usePathEdit.getState().open(REL);
    usePathEdit.getState().chooseRoute({ from: 0, to: 1 });
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    const locked = project();
    expect(changePath(REL, bump, straightSpline())).toBe(false);
    usePathEdit.getState().removeRoutePath();
    usePathEdit.getState().close();
    expect(project()).toBe(locked);
  });
});

describe('a route that stops being one', () => {
  it('goes back to the common path when the pair stops playing it, writing nothing', () => {
    openPerGlyph();
    usePathEdit.getState().chooseRoute({ from: 1, to: 1 });
    // A fade that merges two sources plays no route of its own.
    useProjectStore.getState().update((draft) => {
      const pair = draft.relations[0]!.pairs[0]!;
      pair.style = 'fade';
      pair.extras = 'merge';
    });
    const after = project();
    expect(usePathEdit.getState()).toMatchObject({ target: REL, route: null });
    expect(project()).toBe(after);
  });

  it('follows its glyphs through a renumbering, and is given up when its glyph goes', () => {
    openPerGlyph();
    usePathEdit.getState().chooseRoute({ from: 1, to: 1 });
    changePath(REL, straightSpline(), bump);
    // A glyph is put in front of formula a's: its glyphs 0 and 1 become 1 and 2.
    const rerender = (map: (number | null)[], key: string) => {
      const from = project().formulas[0]!.snapshot!.key;
      useRenderStore.getState().setTransition('fa', { from, to: key, map });
      useProjectStore.getState().amend((draft) => {
        remapGlyphRefs(draft, 'fa', map);
        draft.formulas[0]!.snapshot = { ...draft.formulas[0]!.snapshot!, key };
      });
    };
    rerender([1, 2], 'shifted');
    expect(stored().from).toEqual([1, 2]);
    expect(usePathEdit.getState().route).toEqual({ from: 2, to: 1 });
    expect(currentPath(usePathEdit.getState().target!)?.spline).toBe(bump);
    // Its source glyph goes: the pair has one route left, and the mode edits the pair.
    rerender([0, 1, null], 'dropped');
    expect(stored().from).toEqual([1]);
    expect(usePathEdit.getState().target).not.toBeNull();
    expect(usePathEdit.getState().route).toBeNull();
    // The whole pair gone, the mode closes, as it does today.
    rerender([null, null], 'gone');
    expect(usePathEdit.getState()).toMatchObject({ target: null, route: null });
  });
});

describe('a drag of a route given up', () => {
  it('gives the route its path back, or takes the entry it made away', () => {
    openPerGlyph();
    usePathEdit.getState().chooseRoute({ from: 0, to: 1 });
    const { session } = usePathEdit.getState();
    const before = project();
    const gesture = history.beginGesture();
    gesture.run(() => changePath(REL, straightSpline(), bump));
    expect(stored().routes).toEqual([{ from: 0, to: 1, path: bump }]);
    gesture.run(() =>
      expect(restoreGesturePath(session, bump, undefined, { from: 0, to: 1 })).toBe(true),
    );
    gesture.finishCancellation();
    expect(project()).toBe(before);
    // With a path of its own before the drag, that path comes back, the very object.
    useProjectStore
      .getState()
      .update((draft) => writeRoutePath(draft, REL, { from: 0, to: 1 }, bump));
    const own = stored().routes![0]!.path;
    const second = history.beginGesture();
    second.run(() => changePath(REL, own, straightSpline()));
    second.run(() =>
      restoreGesturePath(session, stored().routes![0]!.path, own, { from: 0, to: 1 }),
    );
    second.finishCancellation();
    expect(stored().routes![0]!.path).toBe(own);
  });

  it('closed during the drag, gives the drag up: the route’s path is the one from before it', () => {
    useProjectStore.getState().update((draft) => {
      writePath(draft, REL, arcSpline(60));
      writeRoutePath(draft, REL, { from: 0, to: 1 }, bump);
    });
    usePathEdit.getState().open(REL);
    usePathEdit.getState().chooseRoute({ from: 0, to: 1 });
    const gesture = history.beginGesture();
    // Dragged onto the common path, the button still held when another mode ends this one.
    gesture.run(() => changePath(REL, bump, arcSpline(60)));
    usePathEdit.getState().close();
    expect(gesture.active).toBe(false);
    // Not dropped as the common path the drag showed: that was never the route's path.
    expect(stored().routes).toEqual([{ from: 0, to: 1, path: bump }]);
  });
});

describe('Path per glyph and the lock of the other routes (D175)', () => {
  it('opens on when a route the pair plays has a path of its own, the lock off', () => {
    useProjectStore
      .getState()
      .update((draft) => writeRoutePath(draft, REL, { from: 1, to: 1 }, bump));
    usePathEdit.getState().open(REL);
    expect(usePathEdit.getState()).toMatchObject({
      route: null,
      perGlyph: true,
      lockOthers: false,
    });
    expect(frame()).toMatchObject({ perGlyph: true, choosable: true });
    expect(frame().routes.map((r) => r.own)).toEqual([false, true]);
  });

  it('opens off when the only path of its own is of a route the pair does not play', () => {
    // A fade that merges its two sources plays no route: its stored entry is ignored.
    load(
      build({
        ...TWO_ONTO_ONE,
        style: 'fade',
        extras: 'merge',
        routes: [{ from: 1, to: 1, path: bump }],
      }),
    );
    usePathEdit.getState().open(REL);
    expect(usePathEdit.getState().perGlyph).toBe(false);
    expect(frame()).toMatchObject({ choices: [], routes: [], perGlyph: false });
  });

  it('turned off with a route chosen, edits the common path again and deletes nothing', () => {
    openPerGlyph();
    usePathEdit.getState().chooseRoute({ from: 1, to: 1 });
    expect(changePath(REL, straightSpline(), bump)).toBe(true);
    usePathEdit.getState().select({ node: 0, part: 'out' });
    const before = project();
    const revision = usePathEdit.getState().revision;
    usePathEdit.getState().setPerGlyph(false);
    expect(usePathEdit.getState()).toMatchObject({ route: null, perGlyph: false, selected: null });
    // A drag held across the change is given up: the curve is on another chord now.
    expect(usePathEdit.getState().revision).toBeGreaterThan(revision);
    // The route keeps its own path, and plays it: nothing was written.
    expect(project()).toBe(before);
    expect(stored().routes).toEqual([{ from: 1, to: 1, path: bump }]);
    // The one curve drawn is the common path, on the first route — which follows it.
    const f = frame();
    expect(f).toMatchObject({ route: null, routes: [], choosable: false });
    expect(pathEditHint(f)).toMatch(/^Edit the common path: /);
    expect(f.spline).toEqual(straightSpline());
    expect([f.from, f.to]).toEqual([
      [-4, 2],
      [3, -2],
    ]);
    // An edit is the common path's.
    expect(changePath(REL, f.spline, bump)).toBe(true);
    expect(stored().path).toBe(bump);
    expect(stored().routes).toEqual([{ from: 1, to: 1, path: bump }]);
    // On again, at All together.
    usePathEdit.getState().setPerGlyph(true);
    expect(usePathEdit.getState()).toMatchObject({ route: null, perGlyph: true });
  });

  it('draws the common path on the first route that follows it, when the first has its own', () => {
    useProjectStore
      .getState()
      .update((draft) => writeRoutePath(draft, REL, { from: 0, to: 1 }, bump));
    usePathEdit.getState().open(REL);
    usePathEdit.getState().setPerGlyph(false);
    expect(frame().from).toEqual([-2, 2]);
    // Every route with its own: the first route carries it.
    useProjectStore
      .getState()
      .update((draft) => writeRoutePath(draft, REL, { from: 1, to: 1 }, arcSpline(90)));
    expect(frame().from).toEqual([-4, 2]);
    expect(frame().spline).toEqual(straightSpline());
  });

  it('locks the other routes: still drawn, none chosen by the pointer, the bar still chooses', () => {
    openPerGlyph();
    usePathEdit.getState().setLockOthers(true);
    expect(usePathEdit.getState().lockOthers).toBe(true);
    let f = frame();
    expect(f).toMatchObject({ perGlyph: true, choosable: false });
    expect(f.routes).toHaveLength(2);
    expect(pathEditHint(f)).toMatch(
      /^Edit path of all the routes: .* ‹ › choose another route \(the others are locked\)/,
    );
    // ‹ › go through the store, which the lock leaves alone.
    usePathEdit.getState().chooseRoute({ from: 1, to: 1 });
    f = frame();
    expect(f).toMatchObject({ route: { from: 1, to: 1 }, choosable: false });
    expect(pathEditHint(f)).toMatch(/^Edit path of one route: .* ‹ › choose another route/);
    // The lock is kept while the routes are hidden, and works again once they are shown.
    usePathEdit.getState().setPerGlyph(false);
    expect(usePathEdit.getState().lockOthers).toBe(true);
    usePathEdit.getState().setPerGlyph(true);
    expect(frame().choosable).toBe(false);
    usePathEdit.getState().setLockOthers(false);
    expect(frame().choosable).toBe(true);
  });

  it('keeps the two flags in the session: nothing is written, and the next pair starts afresh', () => {
    const before = project();
    const past = steps();
    openPerGlyph();
    usePathEdit.getState().setLockOthers(true);
    expect(project()).toBe(before);
    expect(steps()).toBe(past);
    usePathEdit.getState().close();
    expect(usePathEdit.getState()).toMatchObject({
      target: null,
      perGlyph: false,
      lockOthers: false,
    });
    usePathEdit.getState().open(REL);
    expect(usePathEdit.getState()).toMatchObject({ perGlyph: false, lockOthers: false });
    // Without a session the toggles do nothing.
    usePathEdit.getState().close();
    usePathEdit.getState().setPerGlyph(true);
    usePathEdit.getState().setLockOthers(true);
    expect(usePathEdit.getState()).toMatchObject({ perGlyph: false, lockOthers: false });
  });
});
