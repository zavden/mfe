// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { applyToPoint, arcSpline, straightSpline, type Box, type Mat2D } from '../../../geom';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createMorph,
  createRelation,
  type PathSpline,
  type Project,
  type SplineNode,
} from '../../../model';
import { createEvaluator } from '../../../scene';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import {
  addNode,
  changePath,
  findPair,
  handleLink,
  hitPath,
  moveAnchor,
  moveHandle,
  nodesInScene,
  pathEditFrame,
  pathEditHint,
  removeNode,
  samplePath,
  toggleSmooth,
  transferOf,
  usePathEdit,
  writePath,
  type PairRef,
} from '../pathEdit';
import { onPreviewMode } from '../previewModes';
import { useSymbolAlign } from '../symbolAlign';
import { boxSnapshot, resolvedBoxes } from './resolvedBoxes';

/** Every formula is one square glyph, 1 by 1, centred on its origin. */
const SQUARE: Box = { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 };

const node = (at: [number, number], extra: Partial<SplineNode> = {}): SplineNode => ({
  at,
  in: null,
  out: null,
  smooth: false,
  ...extra,
});

/** Formula a at (0, 0) and b at (3, 2), both from 0 to 10 s; a relation a → b in [1, 3) with
 * the pair 0 → 0, and a morph block of a with the pair 0 → 0 (a one-glyph formula, for the
 * reference only). */
function build(): Project {
  const p = createEmptyProject('t');
  p.formulas = ['a', 'b'].map((id) => ({
    ...createFormula({ name: `F${id}`, source: '=', snapshot: boxSnapshot([SQUARE], '=') }),
    id: `f${id}`,
  }));
  const [top] = p.tracks;
  p.clips = ['a', 'b'].map((id) => {
    const c = createClip(`f${id}`, top!.id, 0, 10);
    c.id = id;
    c.initial.position = id === 'a' ? [0, 0] : [3, 2];
    return c;
  });
  const relation = createRelation('a', 'b', {
    offset: 1,
    duration: 2,
    pairs: [{ from: [0], to: [0], style: null }],
  });
  relation.id = 'r1';
  p.relations.push(relation);
  const morph = createMorph(5, { duration: 1, pairs: [{ from: [0], to: [0], style: null }] });
  morph.id = 'm1';
  p.clips[0]!.actions.push(morph);
  return p;
}

const REL: PairRef = { origin: { kind: 'relation', relationId: 'r1' }, index: 0 };
const MORPH: PairRef = { origin: { kind: 'morph', clipId: 'a', actionId: 'm1' }, index: 0 };

function load(p: Project): void {
  loadProject(p);
  useRenderStore.setState({
    resolved: new Map(p.formulas.map((f) => [f.id, resolvedBoxes(f, [SQUARE], '=')])),
  });
}

const bump: PathSpline = {
  nodes: [node([0, 0], { out: [0.3, 0.4] }), node([1, 0], { in: [0.7, 0.4] })],
};

/** A chord of length 2 along x from (1, 1). */
const CHORD: Mat2D = [2, 0, 0, 2, 1, 1];

beforeEach(() => {
  load(build());
  useUiStore.setState({ time: 0, selection: { kind: 'none' }, playing: true });
  usePathEdit.setState({ target: null, selected: null });
  useSymbolAlign.setState({ phase: null });
});

describe('finding the pair', () => {
  it('finds a relation pair and a morph pair, and nothing for a bad index or id', () => {
    const p = useProjectStore.getState().project;
    expect(findPair(p, REL)?.pair).toEqual({ from: [0], to: [0], style: null });
    expect(findPair(p, MORPH)?.holder).toMatchObject({ kind: 'morph' });
    expect(findPair(p, { ...REL, index: 1 })).toBeNull();
    expect(findPair(p, { origin: { kind: 'relation', relationId: 'nope' }, index: 0 })).toBeNull();
    expect(transferOf(p, REL)).toMatchObject({ key: 'relation:r1', start: 1, end: 3 });
    expect(transferOf(p, MORPH)).toMatchObject({ key: 'morph:m1', start: 5, end: 6 });
  });

  it('writes and removes the path of either kind of pair', () => {
    useProjectStore.getState().update((draft) => writePath(draft, MORPH, bump));
    expect(findPair(useProjectStore.getState().project, MORPH)?.pair.path).toEqual(bump);
    useProjectStore.getState().update((draft) => writePath(draft, MORPH, null));
    expect(findPair(useProjectStore.getState().project, MORPH)?.pair).not.toHaveProperty('path');
  });
});

describe('pathEditFrame', () => {
  it('measures the chord from the source centre at the start to the target centre at the end', () => {
    const p = useProjectStore.getState().project;
    const frame = pathEditFrame(p, createEvaluator(p, useRenderStore.getState().resolved), REL)!;
    expect(frame.from).toEqual([0, 0]);
    expect(frame.to).toEqual([3, 2]);
    expect(frame.spline.nodes).toHaveLength(2);
    expect(applyToPoint(frame.matrix!, [1, 0])).toEqual([3, 2]);
    expect(frame.transfer.key).toBe('relation:r1');
  });

  it("starts from the holder's arc as nodes when the pair has no path of its own", () => {
    const evaluator = () =>
      createEvaluator(useProjectStore.getState().project, useRenderStore.getState().resolved);
    const frameOf = () => pathEditFrame(useProjectStore.getState().project, evaluator(), REL)!;
    expect(frameOf().spline).toEqual(straightSpline());
    useProjectStore.getState().update((draft) => {
      draft.relations[0]!.pathArc = 60;
    });
    expect(frameOf().spline).toEqual(arcSpline(60));
    useProjectStore.getState().update((draft) => writePath(draft, REL, bump));
    expect(frameOf().spline).toEqual(bump);
  });

  it('has no matrix when the two centres coincide, and nothing for a missing pair', () => {
    const p = useProjectStore.getState().project;
    const ev = createEvaluator(p, useRenderStore.getState().resolved);
    expect(pathEditFrame(p, ev, MORPH)?.matrix).toBeNull();
    expect(pathEditFrame(p, ev, { ...REL, index: 3 })).toBeNull();
  });
});

describe('the curve on screen', () => {
  it('maps the nodes and samples the curve through the chord frame', () => {
    const nodes = nodesInScene(bump, CHORD);
    expect(nodes[0]).toEqual({ at: [1, 1], in: null, out: [1.6, 1.8], smooth: false });
    const curve = samplePath(bump, CHORD, 4);
    expect(curve).toHaveLength(5);
    expect(curve[0]).toEqual([1, 1]);
    expect(curve[4]![0]).toBeCloseTo(3, 9);
    expect(curve[2]![1]).toBeGreaterThan(1.4);
  });

  it('hits handles first, then interior anchors, then the curve; the ends are fixed', () => {
    expect(hitPath(bump, CHORD, [1.6, 1.8], 0.1)).toEqual({
      kind: 'node',
      selection: { node: 0, part: 'out' },
    });
    // The added node is a smooth one with the handles de Casteljau gives it.
    const three = addNode(bump, { segment: 0, t: 0.5 });
    expect(three.nodes[1]!.smooth).toBe(true);
    const middle = nodesInScene(three, CHORD)[1]!;
    expect(hitPath(three, CHORD, middle.at, 0.05)).toEqual({
      kind: 'node',
      selection: { node: 1, part: 'at' },
    });
    expect(hitPath(bump, CHORD, [1, 1], 0.1)).toBeNull();
    const onCurve = hitPath(bump, CHORD, [2, 1.6], 0.2);
    expect(onCurve?.kind).toBe('curve');
    if (onCurve?.kind === 'curve') expect(onCurve.place.segment).toBe(0);
    expect(hitPath(bump, CHORD, [2, 0.5], 0.2)).toBeNull();
  });
});

describe('editing the nodes', () => {
  const three = (): PathSpline => ({
    nodes: [
      node([0, 0]),
      node([0.5, 0.2], { in: [0.3, 0.2], out: [0.7, 0.2], smooth: true }),
      node([1, 0]),
    ],
  });

  it('moves an anchor with its handles, never an end', () => {
    const moved = moveAnchor(three(), 1, [0.1, 0.1]);
    expect(moved.nodes[1]).toEqual(
      node([0.6, 0.3], { in: [0.4, 0.3], out: [0.8, 0.3], smooth: true }),
    );
    expect(moveAnchor(three(), 0, [0.1, 0.1])).toEqual(three());
  });

  it('mirrors the partner handle of a smooth node by default: the same line, the same length', () => {
    // The out handle, 0.2 from the anchor, is drawn 0.4 straight up: the in handle goes 0.4 down.
    const moved = moveHandle(three(), 1, 'out', [0.5, 0.6]);
    expect(moved.nodes[1]).toEqual(
      node([0.5, 0.2], { in: [0.5, -0.2], out: [0.5, 0.6], smooth: true }),
    );
    expect(moveHandle(three(), 1, 'out', [0.5, 0.6], 'mirror')).toEqual(moved);
    // Either handle, any direction: the other is its reflection through the anchor.
    const turned = moveHandle(three(), 1, 'in', [0.2, 0.6]).nodes[1]!;
    expect(turned.in).toEqual([0.2, 0.6]);
    expect(turned.out![0]).toBeCloseTo(0.8, 9);
    expect(turned.out![1]).toBeCloseTo(-0.2, 9);
  });

  it('with align, turns the partner handle to stay opposite, keeping its own length', () => {
    const moved = moveHandle(three(), 1, 'out', [0.5, 0.6], 'align');
    expect(moved.nodes[1]!.out).toEqual([0.5, 0.6]);
    expect(moved.nodes[1]!.in).toEqual([0.5, 0]);
    expect(moved.nodes[1]!.smooth).toBe(true);
  });

  it('with free, breaks the pair: the node becomes a corner and the partner stays', () => {
    const moved = moveHandle(three(), 1, 'out', [0.5, 0.6], 'free');
    expect(moved.nodes[1]).toEqual(node([0.5, 0.2], { in: [0.3, 0.2], out: [0.5, 0.6] }));
  });

  it('moves a corner’s handle alone, whatever the link', () => {
    const corner = toggleSmooth(three(), 1);
    for (const link of ['mirror', 'align'] as const) {
      expect(moveHandle(corner, 1, 'out', [0.5, 0.6], link).nodes[1]).toEqual(
        node([0.5, 0.2], { in: [0.3, 0.2], out: [0.5, 0.6] }),
      );
    }
  });

  it('leaves a retracted partner retracted, as the unused handles of the ends are', () => {
    const one: PathSpline = {
      nodes: [
        node([0, 0], { out: [0.2, 0.1] }),
        node([0.5, 0.2], { in: null, out: [0.7, 0.2], smooth: true }),
        node([1, 0], { in: [0.8, 0.1] }),
      ],
    };
    for (const link of ['mirror', 'align'] as const) {
      expect(moveHandle(one, 1, 'out', [0.5, 0.6], link).nodes[1]!.in).toBeNull();
      // The first node's in handle and the last's out handle are not used: they stay null.
      expect(moveHandle(one, 0, 'out', [0.3, 0.3], link).nodes[0]!.in).toBeNull();
      expect(moveHandle(one, 2, 'in', [0.7, 0.3], link).nodes[2]!.out).toBeNull();
    }
  });

  it('retracts a handle dropped on its anchor, the partner left as it was', () => {
    for (const link of ['mirror', 'align', 'free'] as const) {
      const moved = moveHandle(three(), 1, 'in', [0.5, 0.2], link).nodes[1]!;
      expect(moved.in).toBeNull();
      expect(moved.out).toEqual([0.7, 0.2]);
    }
  });

  it('reads the link from the keys of the move: Ctrl/⌘ before Shift, else the mirror', () => {
    const keys = (shiftKey: boolean, ctrlKey: boolean, metaKey: boolean) =>
      handleLink({ shiftKey, ctrlKey, metaKey });
    expect(keys(false, false, false)).toBe('mirror');
    expect(keys(true, false, false)).toBe('align');
    expect(keys(false, true, false)).toBe('free');
    expect(keys(false, false, true)).toBe('free');
    expect(keys(true, true, false)).toBe('free');
  });

  it('toggles between smooth and corner', () => {
    const corner = toggleSmooth(three(), 1);
    expect(corner.nodes[1]!.smooth).toBe(false);
    expect(corner.nodes[1]!.in).toEqual([0.3, 0.2]);
    // A corner without handles gets a pair along the line between its neighbours.
    const bare: PathSpline = { nodes: [node([0, 0]), node([0.5, 0.3]), node([1, 0])] };
    const smooth = toggleSmooth(bare, 1);
    expect(smooth.nodes[1]).toEqual(
      node([0.5, 0.3], { in: [0.333333, 0.3], out: [0.666667, 0.3], smooth: true }),
    );
    // One handle is mirrored into the other.
    const one: PathSpline = {
      nodes: [node([0, 0]), node([0.5, 0.3], { in: [0.4, 0.4] }), node([1, 0])],
    };
    expect(toggleSmooth(one, 1).nodes[1]!.out).toEqual([0.6, 0.2]);
    expect(toggleSmooth(three(), 0)).toEqual(three());
  });

  it('removes an interior node only', () => {
    expect(removeNode(three(), 1).nodes).toHaveLength(2);
    expect(removeNode(three(), 0)).toEqual(three());
    expect(removeNode(three(), 2)).toEqual(three());
  });
});

describe('the mode', () => {
  it('opens on a pair: the playhead in the middle of the window, the holder selected', () => {
    useSymbolAlign.setState({ phase: { step: 'target' } });
    usePathEdit.getState().open(REL);
    expect(usePathEdit.getState().target).toEqual(REL);
    expect(useUiStore.getState().time).toBe(2);
    expect(useUiStore.getState().playing).toBe(false);
    expect(useUiStore.getState().selection).toEqual({ kind: 'relation', id: 'r1' });
    expect(useSymbolAlign.getState().phase).toBeNull();
    usePathEdit.getState().open(MORPH);
    expect(useUiStore.getState().time).toBe(5.5);
    expect(useUiStore.getState().selection).toEqual({
      kind: 'action',
      clipId: 'a',
      actionId: 'm1',
    });
  });

  it('ignores a pair that is not there', () => {
    usePathEdit.getState().open({ ...REL, index: 2 });
    expect(usePathEdit.getState().target).toBeNull();
    expect(useUiStore.getState().time).toBe(0);
  });

  it('says it turns on only when it does: what covers the preview stays for a refusal', () => {
    const told: string[] = [];
    const stop = onPreviewMode((mode) => told.push(mode));
    usePathEdit.getState().open({ ...REL, index: 2 });
    expect(told).toEqual([]);
    usePathEdit.getState().open(REL);
    expect(told).toEqual(['path']);
    stop();
  });

  it('drops a path that is the chord itself when it closes, and keeps a curved one', () => {
    const chord: PathSpline = { nodes: [node([0, 0]), node([1, 0])] };
    useProjectStore.getState().update((draft) => writePath(draft, REL, chord));
    usePathEdit.getState().open(REL);
    usePathEdit.getState().select({ node: 0, part: 'out' });
    usePathEdit.getState().close();
    expect(usePathEdit.getState()).toMatchObject({ target: null, selected: null });
    expect(findPair(useProjectStore.getState().project, REL)?.pair).not.toHaveProperty('path');
    useProjectStore.getState().update((draft) => writePath(draft, REL, bump));
    usePathEdit.getState().open(REL);
    usePathEdit.getState().close();
    expect(findPair(useProjectStore.getState().project, REL)?.pair.path).toEqual(bump);
  });

  it('closed during a drag of a node, gives the drag up: the path is the one from before it', () => {
    useProjectStore.getState().update((draft) => writePath(draft, REL, bump));
    usePathEdit.getState().open(REL);
    // The node dragged onto the chord, the button still held when another mode ends this one.
    const gesture = history.beginGesture();
    gesture.run(() => changePath(REL, bump, straightSpline()));
    expect(findPair(useProjectStore.getState().project, REL)?.pair.path).toEqual(straightSpline());
    usePathEdit.getState().close();
    expect(gesture.active).toBe(false);
    expect(usePathEdit.getState().target).toBeNull();
    // Not dropped as the chord the drag showed: that was never the pair's path.
    expect(findPair(useProjectStore.getState().project, REL)?.pair.path).toEqual(bump);
  });

  it("drops a path left as the holder's arc when it closes, and keeps an edited one", () => {
    useProjectStore.getState().update((draft) => {
      draft.relations[0]!.pathArc = 60;
    });
    useProjectStore.getState().update((draft) => writePath(draft, REL, arcSpline(60)));
    usePathEdit.getState().open(REL);
    usePathEdit.getState().close();
    expect(findPair(useProjectStore.getState().project, REL)?.pair).not.toHaveProperty('path');
    const edited = moveHandle(arcSpline(60), 0, 'out', [0.5, 0.5]);
    useProjectStore.getState().update((draft) => writePath(draft, REL, edited));
    usePathEdit.getState().open(REL);
    usePathEdit.getState().close();
    expect(findPair(useProjectStore.getState().project, REL)?.pair.path).toEqual(edited);
    // The chord itself is dropped whatever the arc.
    useProjectStore.getState().update((draft) => writePath(draft, REL, straightSpline()));
    usePathEdit.getState().open(REL);
    usePathEdit.getState().close();
    expect(findPair(useProjectStore.getState().project, REL)?.pair).not.toHaveProperty('path');
  });

  it('tells what to do', () => {
    expect(pathEditHint(null)).toMatch(/not on screen/);
    const p = useProjectStore.getState().project;
    const ev = createEvaluator(p, useRenderStore.getState().resolved);
    expect(pathEditHint(pathEditFrame(p, ev, MORPH))).toMatch(/coincide/);
    expect(pathEditHint(pathEditFrame(p, ev, REL))).toMatch(/drag anchors/);
    // The keys of a handle's drag (D176).
    expect(pathEditHint(pathEditFrame(p, ev, REL))).toContain(
      'drag anchors and handles · Shift: keep the other handle’s length · Ctrl/⌘: move a handle alone ·',
    );
  });
});
