import type { PointerEvent as ReactPointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyToPoint, type Box, type Vec2 } from '../../../geom';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  type PathSpline,
  type Project,
  type SplineNode,
} from '../../../model';
import { createEvaluator, type Drawable } from '../../../scene';
import { loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { withServices } from '../../../test/services';
import {
  findPair,
  pathEditFrame,
  startPathEditTracking,
  usePathEdit,
  writePath,
  type PairRef,
} from '../pathEdit';
import { usePathGestures } from '../usePathGestures';
import { boxSnapshot, resolvedBoxes } from './resolvedBoxes';

/* The canvas of the Edit-path mode on a pair of two routes (D167): what a click chooses with
 * «Path per glyph» off, on, and on with the other routes locked (D175), and how a smooth node's
 * other handle follows a drag by the keys held at each move (D176). The view maps a scene point
 * (x, y) to the client point (500 + 100x, 500 − 100y): a CSS pixel is 0.01 of a unit. */

withServices(startPathEditTracking);

const square = (x: number): Box => ({ minX: x - 0.5, minY: -0.5, maxX: x + 0.5, maxY: 0.5 });
/** Formula a: two glyphs, at x = −1 and 1; formula b: three, at x = −2, 0 and 2. */
const BOXES = { fa: [square(-1), square(1)], fb: [square(-2), square(0), square(2)] };

/** Clip a at (−3, 2), clip b at (3, −2); the relation a → b in [1, 3) takes both glyphs of a onto
 * the middle one of b: the route 0 → 1 runs from (−4, 2), the route 1 → 1 from (−2, 2), both to
 * (3, −2). */
function build(): Project {
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
  const relation = createRelation('a', 'b', {
    offset: 1,
    duration: 2,
    pairs: [{ from: [0, 1], to: [1], style: null }],
  });
  relation.id = 'r1';
  p.relations.push(relation);
  return p;
}

const REL: PairRef = { origin: { kind: 'relation', relationId: 'r1' }, index: 0 };

/** A third of the way along the route 1 → 1: far from the other route and from either chord the
 * common path is drawn on (the pair's, or the first route's). */
const ON_SECOND_ROUTE: Vec2 = [-2 + 5 / 3, 2 - 4 / 3];
/** On the ink of the second source glyph, away from every curve. */
const ON_SECOND_GLYPH: Vec2 = [-2, 2.3];

function mount() {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect;
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = () => true;
  canvas.releasePointerCapture = vi.fn();
  // The faint glyphs of the pair: the second source glyph's square, as the renderer picks it.
  const pickGhost = (p: Vec2): Drawable | null =>
    Math.abs(p[0] + 2) <= 0.5 && Math.abs(p[1] - 2) <= 0.5
      ? ({ key: 'ghost:from:a:1', glyph: 1 } as Drawable)
      : null;
  const { result } = renderHook(() => {
    const project = useProjectStore((s) => s.project);
    const { target, route, perGlyph, lockOthers } = usePathEdit();
    const frame = target
      ? pathEditFrame(
          project,
          createEvaluator(project, useRenderStore.getState().resolved),
          target,
          route,
          { perGlyph, lockOthers },
        )
      : null;
    return usePathGestures({
      canvasRef: { current: canvas },
      camera: { frameWidth: 10, frameHeight: 10, center: [0, 0], zoom: 1 },
      surface: { width: 1000, height: 1000 },
      unit: 0.01,
      target,
      frame,
      pickGhost,
    });
  });
  const event = ([x, y]: Vec2, type = 'pointerup', keys: Keys = {}) =>
    ({
      type,
      clientX: 500 + x * 100,
      clientY: 500 - y * 100,
      button: 0,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...keys,
      pointerId: 1,
      currentTarget: canvas,
      preventDefault() {},
    }) as unknown as ReactPointerEvent<HTMLCanvasElement>;
  const click = (point: Vec2) =>
    act(() => {
      result.current.onPointerDown(event(point, 'pointerdown'));
      result.current.onPointerUp(event(point));
    });
  const hover = (point: Vec2) =>
    act(() => void result.current.onPointerMove(event(point, 'pointermove')));
  const down = (point: Vec2) =>
    act(() => void result.current.onPointerDown(event(point, 'pointerdown')));
  const move = (point: Vec2, keys: Keys = {}) =>
    act(() => void result.current.onPointerMove(event(point, 'pointermove', keys)));
  const up = (point: Vec2) => act(() => void result.current.onPointerUp(event(point)));
  return { result, click, hover, down, move, up };
}

/** The keys held at a pointer event. */
type Keys = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

const project = () => useProjectStore.getState().project;
const route = () => usePathEdit.getState().route;

beforeEach(() => {
  usePathEdit.setState({
    target: null,
    route: null,
    perGlyph: false,
    lockOthers: false,
    selected: null,
  });
  const p = build();
  loadProject(p);
  useRenderStore.setState({
    resolved: new Map(p.formulas.map((f) => [f.id, resolvedBoxes(f, BOXES[f.id as 'fa'])])),
    transitions: {},
  });
  useUiStore.setState({ time: 0, selection: { kind: 'none' }, playing: false });
  usePathEdit.getState().open(REL);
});

describe('what a click on the canvas chooses (D175)', () => {
  it('chooses nothing with Path per glyph off: neither a route’s curve nor its glyph', () => {
    const { result, click, hover } = mount();
    const before = project();
    // No route lights up for a click (the pointer would say so), on its curve or its glyph.
    hover(ON_SECOND_ROUTE);
    expect(result.current.hoverRoute).toBeNull();
    hover(ON_SECOND_GLYPH);
    expect(result.current.hoverRoute).toBeNull();
    click(ON_SECOND_ROUTE);
    click(ON_SECOND_GLYPH);
    expect(route()).toBeNull();
    expect(project()).toBe(before);
  });

  it('chooses the route under a click once the routes are shown', () => {
    const { result, click, hover } = mount();
    act(() => usePathEdit.getState().setPerGlyph(true));
    hover(ON_SECOND_ROUTE);
    expect(result.current.hoverRoute).toEqual({ from: 1, to: 1 });
    click(ON_SECOND_ROUTE);
    expect(route()).toEqual({ from: 1, to: 1 });
    act(() => usePathEdit.getState().chooseRoute(null));
    click(ON_SECOND_GLYPH);
    expect(route()).toEqual({ from: 1, to: 1 });
  });

  it('chooses nothing with the other routes locked, and lights none up', () => {
    const { result, click, hover } = mount();
    act(() => usePathEdit.getState().setPerGlyph(true));
    hover(ON_SECOND_ROUTE);
    expect(result.current.hoverRoute).toEqual({ from: 1, to: 1 });
    act(() => usePathEdit.getState().setLockOthers(true));
    expect(result.current.hoverRoute).toBeNull();
    const before = project();
    click(ON_SECOND_ROUTE);
    click(ON_SECOND_GLYPH);
    expect(route()).toBeNull();
    expect(project()).toBe(before);
    // Unlocked, the same click chooses again.
    act(() => usePathEdit.getState().setLockOthers(false));
    click(ON_SECOND_ROUTE);
    expect(route()).toEqual({ from: 1, to: 1 });
  });
});

describe('a drag of a smooth node’s handle (D176)', () => {
  /** A smooth node in the middle, its handles 0.2 either side along the chord. */
  const SMOOTH: PathSpline = {
    nodes: [
      { at: [0, 0], in: null, out: null, smooth: false },
      { at: [0.5, 0.2], in: [0.3, 0.2], out: [0.7, 0.2], smooth: true },
      { at: [1, 0], in: null, out: null, smooth: false },
    ],
  };
  const middle = () => findPair(project(), REL)!.pair.path!.nodes[1]!;
  const length = (node: SplineNode, part: 'in' | 'out') =>
    Math.hypot(node[part]![0] - node.at[0], node[part]![1] - node.at[1]);
  /** Where a point of the chord's frame is on the canvas: the common path, on the first route
   * while «Path per glyph» is off, as the session has it. */
  const onScreen = (p: Vec2): Vec2 => {
    const { route, perGlyph, lockOthers } = usePathEdit.getState();
    expect(perGlyph).toBe(false);
    const frame = pathEditFrame(
      project(),
      createEvaluator(project(), useRenderStore.getState().resolved),
      REL,
      route,
      { perGlyph, lockOthers },
    )!;
    expect(frame.matrix).not.toBeNull();
    return applyToPoint(frame.matrix!, p);
  };
  const near = (a: Vec2 | null, b: Vec2) => {
    expect(a![0]).toBeCloseTo(b[0], 5);
    expect(a![1]).toBeCloseTo(b[1], 5);
  };

  beforeEach(() => {
    useProjectStore.getState().update((draft) => writePath(draft, REL, SMOOTH));
  });

  it('mirrors the other handle; Shift keeps its length, Ctrl/⌘ moves one alone, read at each move', () => {
    const { down, move, up } = mount();
    const steps = useProjectStore.temporal.getState().pastStates.length;
    const out = onScreen([0.7, 0.2]);
    const drawnTo = onScreen([0.8, 0.5]);
    down(out);
    // No key: the in handle is the out handle's reflection, as long as it.
    move(drawnTo);
    near(middle().out, [0.8, 0.5]);
    near(middle().in, [0.2, -0.1]);
    expect(middle().smooth).toBe(true);
    // Shift pressed mid-drag: the in handle turns opposite, as long as it was (0.2).
    move(drawnTo, { shiftKey: true });
    expect(length(middle(), 'in')).toBeCloseTo(0.2, 5);
    near(middle().in, [0.5 - 0.2 / Math.SQRT2, 0.2 - 0.2 / Math.SQRT2]);
    expect(middle().smooth).toBe(true);
    // Ctrl/⌘ instead: the node is a corner and the in handle where it was.
    move(drawnTo, { ctrlKey: true });
    near(middle().in, [0.3, 0.2]);
    expect(middle().smooth).toBe(false);
    move(drawnTo, { metaKey: true });
    expect(middle().smooth).toBe(false);
    // Let go of the keys: the mirror again.
    move(drawnTo);
    near(middle().in, [0.2, -0.1]);
    expect(middle().smooth).toBe(true);
    up(drawnTo);
    expect(length(middle(), 'in')).toBeCloseTo(length(middle(), 'out'), 5);
    // The whole drag is one undo step.
    expect(useProjectStore.temporal.getState().pastStates.length).toBe(steps + 1);
  });

  it('mirrors the other handle when the arrows nudge one, Shift taking ten steps', () => {
    mount();
    act(() => usePathEdit.getState().select({ node: 1, part: 'out' }));
    const press = (shiftKey: boolean) =>
      act(
        () =>
          void document.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'ArrowUp',
              shiftKey,
              bubbles: true,
              cancelable: true,
            }),
          ),
      );
    press(false);
    const nudged = middle();
    expect(nudged.out).not.toEqual([0.7, 0.2]);
    expect(length(nudged, 'in')).toBeCloseTo(length(nudged, 'out'), 5);
    near(nudged.in, [2 * 0.5 - nudged.out![0], 2 * 0.2 - nudged.out![1]]);
    press(true);
    const far = middle();
    // Ten times as far from where it was.
    const step = Math.hypot(nudged.out![0] - 0.7, nudged.out![1] - 0.2);
    expect(Math.hypot(far.out![0] - nudged.out![0], far.out![1] - nudged.out![1])).toBeCloseTo(
      10 * step,
      5,
    );
    near(far.in, [2 * 0.5 - far.out![0], 2 * 0.2 - far.out![1]]);
    expect(far.smooth).toBe(true);
  });
});
