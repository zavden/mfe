/* A line's curve and tips in the editor (`lineCurve.ts`, D145, D146): what a line is bent into,
 * the degrees an arc's handle reads, the nodes the mode shows, that a free line keeps its ends when
 * what it is drawn with changes, and the mode «Edit curve». */
import { describe, expect, it } from 'vitest';
import { arcSpline, buildLine } from '../../../geom';
import {
  createClip,
  createEmptyProject,
  createEndsAttach,
  createEndsTween,
  createLineFormula,
  createTrack,
  createTween,
  DEFAULT_LINE_ARC,
  defaultIntro,
  defaultOutro,
  LINE_ARC_LIMIT,
  type Clip,
  type LineCurve,
  type LineFormula,
  type Project,
  type SplineNode,
  type TweenAction,
  type Vec2,
  validateProject,
} from '../../../model';
import { lineEndsAt } from '../../../scene';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { withServices } from '../../../test/services';
import { useNoticeStore } from '../../project/noticeStore';
import {
  arcDegrees,
  arcFromPointer,
  arcTangent,
  bendLine,
  bendsOf,
  bentCurve,
  copyLineShape,
  describePathShape,
  editLineCurve,
  explicitNodes,
  pasteLineShape,
  pathShapeOf,
  removeCurvePoint,
  reversedCurve,
  reverseLine,
  setLineArc,
  setLineNodes,
  setLineTips,
  startLineCurveTracking,
  useLineCurveEdit,
  useLineShapeClipboard,
  withPathShape,
} from '../lineCurve';
import { editLine, setLineKind } from '../lineDraw';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
const project = () => useProjectStore.getState().project;
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;
const lineOf = (p: Project) => p.formulas.find((f) => f.kind === 'line') as LineFormula;
const clipOf = (p: Project) => p.clips.find((c) => c.formulaId === lineOf(p).id)!;
const endsOf = (p: Project, clip: Clip = clipOf(p)) =>
  lineEndsAt(p.meta.target, lineOf(p), clip.initial);

/** A free arrow from (0, 0) to (2, 1) over [0, 6), with a Transform that takes it a unit up. */
function scene(fields: Partial<LineFormula> = {}): Clip {
  const p = createEmptyProject();
  p.tracks = [createTrack('Track 1')];
  const formula = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 1], ...fields });
  p.formulas.push(formula);
  const clip = createClip(formula.id, p.tracks[0]!.id, 0, 6, none);
  clip.initial.position = [1, 0.5];
  clip.actions.push(createTween(2, 1, { position: [1, 1.5] }, 'smooth'));
  p.clips.push(clip);
  loadProject(p);
  useUiStore.getState().setTime(1);
  return clip;
}

const close = (a: Vec2, b: Vec2) => {
  expect(a[0]).toBeCloseTo(b[0], 5);
  expect(a[1]).toBeCloseTo(b[1], 5);
};

describe('what a line is bent into', () => {
  it('is an arc or a spline while it is straight, a spline while it is an arc, and never back', () => {
    expect(bendsOf(null)).toEqual(['arc', 'spline']);
    expect(bendsOf({ shape: 'arc', degrees: 30, trim: 0 })).toEqual(['spline']);
    expect(bendsOf({ shape: 'spline', nodes: [] })).toEqual([]);
    expect(bentCurve(null, 'arc')).toEqual({ shape: 'arc', degrees: DEFAULT_LINE_ARC, trim: 0 });
    // A spline starts as the arc of thirty degrees, in nodes.
    expect(bentCurve(null, 'spline')).toEqual({
      shape: 'spline',
      nodes: arcSpline(DEFAULT_LINE_ARC).nodes,
    });
    // An arc becomes the nodes of what is drawn of it: what its gap leaves.
    expect(bentCurve({ shape: 'arc', degrees: -80, trim: 0.25 }, 'spline')).toEqual({
      shape: 'spline',
      nodes: arcSpline(-40).nodes,
    });
    expect(bentCurve({ shape: 'arc', degrees: 30, trim: 0 }, 'arc')).toBeNull();
    expect(bentCurve({ shape: 'spline', nodes: [] }, 'spline')).toBeNull();
    expect(bentCurve({ shape: 'spline', nodes: [] }, 'arc')).toBeNull();
  });

  it('keeps an arc’s degrees to hundredths, within the limit either way', () => {
    expect(arcDegrees(30.004)).toBe(30);
    expect(arcDegrees(-12.346)).toBe(-12.35);
    expect(arcDegrees(1000)).toBe(LINE_ARC_LIMIT);
    expect(arcDegrees(-1000)).toBe(-LINE_ARC_LIMIT);
    expect(Object.is(arcDegrees(-0.001), 0)).toBe(true);
  });
});

describe('the handle of an arc', () => {
  const start: Vec2 = [-1, 0.5];
  const end: Vec2 = [2, 1.5];

  it('leaves the start along the arc: half its degrees off the line, clockwise for a positive arc', () => {
    // A positive arc from left to right bulges down: it leaves its start downwards.
    close(arcTangent([0, 0], [2, 0], 90, 0), [Math.SQRT1_2, -Math.SQRT1_2]);
    close(arcTangent([0, 0], [2, 0], -90, 0), [Math.SQRT1_2, Math.SQRT1_2]);
    close(arcTangent([0, 0], [2, 0], 0, 0), [1, 0]);
    // What a gap took of the arc is not drawn: less of a turn is left.
    close(arcTangent([0, 0], [2, 0], 90, 0.25), arcTangent([0, 0], [2, 0], 45, 0));
  });

  it('reads the degrees back from where the pointer is', () => {
    for (const degrees of [30, -30, 90, 135, -200, 280]) {
      for (const trim of [0, 0.1]) {
        const [tx, ty] = arcTangent(start, end, degrees, trim);
        const pointer: Vec2 = [start[0] + 0.7 * tx, start[1] + 0.7 * ty];
        expect(arcFromPointer(start, end, pointer, trim)).toBeCloseTo(degrees, 6);
      }
    }
    // Whole degrees; every fifteenth with Shift; no further than the limit.
    const [tx, ty] = arcTangent(start, end, 37.4, 0);
    const pointer: Vec2 = [start[0] + tx, start[1] + ty];
    expect(arcFromPointer(start, end, pointer, 0)).toBe(37);
    expect(arcFromPointer(start, end, pointer, 0, true)).toBe(30);
    const back: Vec2 = [start[0] - (end[0] - start[0]), start[1] - (end[1] - start[1])];
    expect(Math.abs(arcFromPointer(start, end, back, 0)!)).toBe(LINE_ARC_LIMIT);
    expect(arcFromPointer(start, end, start, 0)).toBeNull();
    expect(arcFromPointer(start, start, end, 0)).toBeNull();
  });
});

describe('the nodes the mode shows', () => {
  it('say every handle of a stretch: one that is not there, a third of the way to the next point', () => {
    const nodes: SplineNode[] = [
      { at: [0, 0], in: null, out: null, smooth: false },
      { at: [0.6, 0.3], in: null, out: [0.9, 0.3], smooth: false },
      { at: [1, 0], in: null, out: null, smooth: false },
    ];
    const explicit = explicitNodes(nodes);
    // A stretch without handles runs straight: its handles at its thirds.
    close(explicit[0]!.out!, [0.2, 0.1]);
    close(explicit[1]!.in!, [0.4, 0.2]);
    // The handle that is there stays; the missing one aims at it.
    expect(explicit[1]!.out).toEqual([0.9, 0.3]);
    close(explicit[2]!.in!, [1 + (0.9 - 1) / 3, 0.1]);
    // The two ends have nothing outside the curve.
    expect(explicit[0]!.in).toBeNull();
    expect(explicit[2]!.out).toBeNull();
  });
});

describe('changing what a free line is drawn with', () => {
  it('keeps its two ends where they are: the clip follows the centre of the line', () => {
    scene();
    const before = endsOf(project());
    close(before.start, [0, 0]);
    const steps = undoSteps();
    expect(bendLine(lineOf(project()).id, 'arc')).toBe(true);
    expect(undoSteps()).toBe(steps + 1);
    expect(lineOf(project()).curve).toEqual({ shape: 'arc', degrees: 30, trim: 0 });
    close(endsOf(project()).start, before.start);
    close(endsOf(project()).end, before.end);
    // A wider arc bulges out of the box of the two ends: the clip moves, the ends do not.
    setLineArc(lineOf(project()).id, 160);
    expect(clipOf(project()).initial.position[1]).toBeLessThan(0.4);
    close(endsOf(project()).start, before.start);
    close(endsOf(project()).end, before.end);
    // Where its Transform takes it moved the same way.
    const [x, y] = clipOf(project()).initial.position;
    const tween = clipOf(project()).actions[0]!;
    expect(tween.kind === 'tween' && tween.to.position).toEqual([
      expect.closeTo(x, 5),
      expect.closeTo(y + 1, 5),
    ]);
    // More or less of an arc, another tip, another kind: the ends stay.
    setLineArc(lineOf(project()).id, -140);
    close(endsOf(project()).start, before.start);
    setLineTips(lineOf(project()).id, { tip: 'dot' });
    expect(lineOf(project()).tip).toBe('dot');
    close(endsOf(project()).end, before.end);
    editLine(lineOf(project()).id, { tipLength: 0.8 });
    close(endsOf(project()).start, before.start);
    setLineKind(lineOf(project()).id, 'double_arrow');
    setLineTips(lineOf(project()).id, { startTip: 'stealth' });
    expect(lineOf(project())).toMatchObject({ line: 'double_arrow', startTip: 'stealth' });
    close(endsOf(project()).start, before.start);
    close(endsOf(project()).end, before.end);
  });

  it('bends an arc into the spline of that arc, and nothing further', () => {
    scene({ curve: { shape: 'arc', degrees: 60, trim: 0 } });
    const id = lineOf(project()).id;
    expect(bendLine(id, 'arc')).toBe(false);
    expect(bendLine(id, 'spline')).toBe(true);
    expect(lineOf(project()).curve).toEqual({ shape: 'spline', nodes: arcSpline(60).nodes });
    const steps = undoSteps();
    expect(bendLine(id, 'spline')).toBe(false);
    expect(bendLine(id, 'arc')).toBe(false);
    setLineArc(id, 10);
    expect(undoSteps()).toBe(steps);
  });

  it('holds an arc’s degrees within the limit, and writes nothing for the same ones', () => {
    scene({ curve: { shape: 'arc', degrees: 30, trim: 0 } });
    const id = lineOf(project()).id;
    const steps = undoSteps();
    setLineArc(id, 30);
    expect(undoSteps()).toBe(steps);
    setLineArc(id, 999);
    expect(lineOf(project()).curve).toMatchObject({ degrees: LINE_ARC_LIMIT });
  });
});

describe('the mode «Edit curve»', () => {
  const nodes: SplineNode[] = [
    { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
    { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
  ];

  it('bends a straight line into a spline and opens on it, its clip selected', () => {
    const clip = scene();
    const steps = undoSteps();
    expect(editLineCurve(clip.id)).toBe(true);
    expect(undoSteps()).toBe(steps + 1);
    expect(lineOf(project()).curve?.shape).toBe('spline');
    expect(useLineCurveEdit.getState().clipId).toBe(clip.id);
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [clip.id] });
    useLineCurveEdit.getState().close();
    expect(useLineCurveEdit.getState().clipId).toBeNull();
  });

  it('keeps the curve on leaving, or puts back the one it started with', () => {
    const clip = scene({ curve: { shape: 'spline', nodes } });
    const moved: SplineNode[] = [
      nodes[0]!,
      { at: [0.5, 0.5], in: null, out: null, smooth: false },
      nodes[1]!,
    ];
    expect(editLineCurve(clip.id)).toBe(true);
    setLineNodes(clip.id, moved);
    useLineCurveEdit.getState().close();
    expect(lineOf(project()).curve).toEqual({ shape: 'spline', nodes: moved });
    // Again, and Esc: as it was when the mode started.
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    setLineNodes(clip.id, nodes);
    expect(lineOf(project()).curve).toEqual({ shape: 'spline', nodes });
    useLineCurveEdit.getState().close(true);
    expect(lineOf(project()).curve).toEqual({ shape: 'spline', nodes: moved });
  });

  it('opens with the playback paused, the playhead brought to the clip when it is off it', () => {
    const clip = scene({ curve: { shape: 'spline', nodes } });
    // On the clip (it runs over [0, 6)), playing: paused where it is.
    useUiStore.getState().setTime(2.5);
    useUiStore.getState().setPlaying(true);
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    expect(useUiStore.getState()).toMatchObject({ time: 2.5, playing: false });
    useLineCurveEdit.getState().close();
    // Past it, playing: paused at its start.
    useUiStore.getState().setTime(7);
    useUiStore.getState().setPlaying(true);
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    expect(useUiStore.getState()).toMatchObject({ time: 0, playing: false });
    useLineCurveEdit.getState().close();
  });

  it('removes the selected point while the line is on screen, one undo step; never an end', () => {
    const three: SplineNode[] = [
      nodes[0]!,
      { at: [0.5, 0.2], in: [0.4, 0.2], out: [0.6, 0.2], smooth: true },
      nodes[1]!,
    ];
    const clip = scene({ curve: { shape: 'spline', nodes: three } });
    const points = () => {
      const curve = lineOf(project()).curve;
      return curve?.shape === 'spline' ? curve.nodes.length : 0;
    };
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    // Nothing selected, or an end: nothing goes.
    expect(removeCurvePoint()).toBe(false);
    useLineCurveEdit.getState().select({ node: 0, part: 'at' });
    expect(removeCurvePoint()).toBe(false);
    // The middle point, with the line off screen: nothing goes either.
    useLineCurveEdit.getState().select({ node: 1, part: 'at' });
    useUiStore.getState().setTime(6);
    expect(removeCurvePoint()).toBe(false);
    expect(points()).toBe(3);
    // On screen it goes, in one step, and the selection with it.
    useUiStore.getState().setTime(1);
    const steps = undoSteps();
    expect(removeCurvePoint()).toBe(true);
    expect(points()).toBe(2);
    expect(undoSteps()).toBe(steps + 1);
    expect(useLineCurveEdit.getState().selected).toBeNull();
    useLineCurveEdit.getState().close();
  });

  it('does not open on a locked track, nor on a line that is no spline', () => {
    const clip = scene({ curve: { shape: 'arc', degrees: 30, trim: 0 } });
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(false);
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
      const line = draft.formulas[0]!;
      if (line.kind === 'line') line.curve = { shape: 'spline', nodes };
    });
    useNoticeStore.getState().clear();
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(false);
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    expect(useNoticeStore.getState().notices).toMatchObject([
      {
        title: 'The curve stays',
        message: 'Track “Track 1” is locked: unlock it on the timeline to edit the curve.',
      },
    ]);
  });

  it('does not open on a line locked in the preview, and says why', () => {
    const clip = scene({ curve: { shape: 'spline', nodes } });
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.previewLocked = true;
    });
    useNoticeStore.getState().clear();
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(false);
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    expect(useNoticeStore.getState().notices).toMatchObject([
      {
        title: 'The curve stays',
        message: '“l1” is locked in the preview: unlock it on the timeline to edit the curve.',
      },
    ]);
  });

  it('writes no nodes for a line on a locked track, nor for one locked in the preview', () => {
    const clip = scene({ curve: { shape: 'spline', nodes } });
    const moved: SplineNode[] = [nodes[0]!, { ...nodes[1]!, at: [1, 0.5] }];
    const lock = (track: boolean, preview: boolean) =>
      useProjectStore.getState().update((draft) => {
        draft.tracks[0]!.locked = track;
        if (preview) draft.clips[0]!.previewLocked = true;
        else delete draft.clips[0]!.previewLocked;
      });
    for (const [track, preview] of [
      [true, false],
      [false, true],
    ] as const) {
      lock(track, preview);
      const steps = undoSteps();
      setLineNodes(clip.id, moved);
      expect(lineOf(project()).curve).toEqual({ shape: 'spline', nodes });
      expect(undoSteps()).toBe(steps);
    }
    lock(false, false);
    setLineNodes(clip.id, moved);
    expect(lineOf(project()).curve).toEqual({ shape: 'spline', nodes: moved });
  });
});

describe('«Edit curve» while its line is locked', () => {
  withServices(startLineCurveTracking);
  const nodes: SplineNode[] = [
    { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
    { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
  ];
  const notices = () => useNoticeStore.getState().notices;

  it('ends when its track is locked, saying why, and keeps the curve', () => {
    const clip = scene({ curve: { shape: 'spline', nodes } });
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    const moved: SplineNode[] = [nodes[0]!, { ...nodes[1]!, in: [0.6, -0.6] }];
    setLineNodes(clip.id, moved);
    useNoticeStore.getState().clear();
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    expect(lineOf(project()).curve).toEqual({ shape: 'spline', nodes: moved });
    expect(notices()).toMatchObject([
      {
        title: 'Edit curve ended',
        message: 'Track “Track 1” is locked: unlock it on the timeline to edit the curve.',
      },
    ]);
  });

  it('ends when its clip is locked in the preview, saying why', () => {
    const clip = scene({ curve: { shape: 'spline', nodes } });
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    useNoticeStore.getState().clear();
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.previewLocked = true;
    });
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    expect(notices()).toMatchObject([
      {
        title: 'Edit curve ended',
        message: '“l1” is locked in the preview: unlock it on the timeline to edit the curve.',
      },
    ]);
  });

  it('ends without a word when its line goes, or stops being a spline', () => {
    const clip = scene({ curve: { shape: 'spline', nodes } });
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    useNoticeStore.getState().clear();
    useProjectStore.getState().update((draft) => {
      draft.clips = [];
    });
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    expect(notices()).toEqual([]);
  });

  it('stays on through any other change', () => {
    const clip = scene({ curve: { shape: 'spline', nodes } });
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    useProjectStore.getState().update((draft) => {
      draft.meta.name = 'Renamed';
    });
    expect(useLineCurveEdit.getState().clipId).toBe(clip.id);
    useLineCurveEdit.getState().close();
  });
});

describe('«Reverse points» (D147)', () => {
  const S: SplineNode[] = [
    { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
    { at: [0.6, -0.2], in: [0.5, 0.1], out: [0.7, -0.5], smooth: true },
    { at: [1, 0], in: [0.9, -0.3], out: null, smooth: false },
  ];

  it('turns an arc the other way and runs a spline through its points backwards', () => {
    expect(reversedCurve(null)).toBeNull();
    expect(reversedCurve({ shape: 'arc', degrees: 60, trim: 0.1 })).toEqual({
      shape: 'arc',
      degrees: -60,
      trim: 0.1,
    });
    expect(reversedCurve({ shape: 'arc', degrees: 0, trim: 0 })).toEqual({
      shape: 'arc',
      degrees: 0,
      trim: 0,
    });
    const back = reversedCurve({ shape: 'spline', nodes: S });
    expect(back).toEqual({
      shape: 'spline',
      nodes: [
        { at: [0, 0], in: null, out: [0.1, 0.3], smooth: false },
        { at: [0.4, 0.2], in: [0.3, 0.5], out: [0.5, -0.1], smooth: true },
        { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
      ],
    });
    // Twice is the curve it was.
    expect(reversedCurve(back)).toEqual({ shape: 'spline', nodes: S });
  });

  it('ends «Edit curve» on the line it reverses first, which keeps its curve', () => {
    const clip = scene({ curve: { shape: 'spline', nodes: S } });
    const shaped: SplineNode[] = [S[0]!, { ...S[1]!, at: [0.5, -0.3] }, S[2]!];
    expect(useLineCurveEdit.getState().open(clip.id)).toBe(true);
    setLineNodes(clip.id, shaped);
    expect(reverseLine(lineOf(project()).id)).toBe(true);
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    const reversed = reversedCurve({ shape: 'spline', nodes: shaped });
    expect(lineOf(project()).curve).toEqual(reversed);
    // What would have been Esc now changes nothing: the mode is over.
    useLineCurveEdit.getState().close(true);
    expect(lineOf(project()).curve).toEqual(reversed);
  });

  it.each(['ce', 'gl'] as const)('draws the same curve, from its other end (%s)', (lib) => {
    for (const curve of [
      null,
      { shape: 'arc', degrees: 70, trim: 0 },
      { shape: 'spline', nodes: S },
    ] as (LineCurve | null)[]) {
      const look = { strokeWidth: 4, tipLength: 0.35, dashLength: 0.1 };
      const a: Vec2 = [-2, -0.5];
      const b: Vec2 = [2, 1];
      const forth = buildLine(lib, 'line', a, b, { ...look, curve }).parts[0]!.contour;
      const back = buildLine(lib, 'line', b, a, { ...look, curve: reversedCurve(curve) }).parts[0]!
        .contour;
      // The same points, last to first: a contour is x, y pairs.
      const pairs = (contour: readonly number[]) =>
        Array.from({ length: contour.length / 2 }, (_, k) => [
          contour[2 * k]!,
          contour[2 * k + 1]!,
        ]);
      const want = pairs(forth).reverse();
      // ManimGL cuts a spline into quadratics from its start: the same curve, by other points.
      if (lib === 'gl' && curve?.shape === 'spline') {
        expect(pairs(back)[0]![0]).toBeCloseTo(want[0]![0]!, 9);
        expect(pairs(back).at(-1)![1]).toBeCloseTo(want.at(-1)![1]!, 9);
        continue;
      }
      pairs(back).forEach(([x, y], k) => {
        expect(x).toBeCloseTo(want[k]![0]!, 6);
        expect(y).toBeCloseTo(want[k]![1]!, 6);
      });
    }
  });

  it('swaps the two ends of a free arrow where they are, and back; its Transforms go along', () => {
    // The scene's arrow, with two tips and bent, has a plain Transform that takes it a unit up;
    // another carries its ends.
    const line = scene({ line: 'double_arrow', tip: 'stealth', startTip: 'dot' });
    bendLine(lineOf(project()).id, 'arc');
    useProjectStore.getState().update((draft) => {
      draft.clips
        .find((c) => c.id === line.id)!
        .actions.push({
          ...createEndsTween(4, 1, {
            start: { clipId: 'elsewhere', glyphs: 'all', anchor: 'left' },
            end: { point: [4, 4] },
            buff: 0.2,
            degrees: 80,
          }),
          id: 'carried',
        });
    });
    const p = project();
    const before = structuredClone({ formula: lineOf(p), clip: p.clips[0]! });
    const up = (before.clip.actions[0] as TweenAction).to.position!;
    const ends = lineEndsAt('ce', before.formula, before.clip.initial);
    const there = lineEndsAt('ce', before.formula, { ...before.clip.initial, position: up });
    const steps = undoSteps();
    expect(reverseLine(before.formula.id)).toBe(true);
    expect(undoSteps()).toBe(steps + 1);
    const formula = lineOf(project());
    const clip = project().clips[0]!;
    expect(formula).toMatchObject({
      vector: [-2, -1],
      curve: { shape: 'arc', degrees: -DEFAULT_LINE_ARC },
      tip: 'dot',
      startTip: 'stealth',
    });
    // The line is where it was, its ends the other way round — at its start, and where its
    // plain Transform takes it.
    const now = lineEndsAt('ce', formula, clip.initial);
    expect(now.start[0]).toBeCloseTo(ends.end[0], 5);
    expect(now.start[1]).toBeCloseTo(ends.end[1], 5);
    expect(now.end[0]).toBeCloseTo(ends.start[0], 5);
    expect(now.end[1]).toBeCloseTo(ends.start[1], 5);
    const [plain, carried] = clip.actions as TweenAction[];
    const moved = lineEndsAt('ce', formula, { ...clip.initial, position: plain!.to.position! });
    expect(moved.start[0]).toBeCloseTo(there.end[0], 5);
    expect(moved.start[1]).toBeCloseTo(there.end[1], 5);
    // The ends a Transform carries it to change places too, an arc's new degrees with them.
    expect(carried!.ends).toMatchObject({
      start: { point: [4, 4] },
      end: { clipId: 'elsewhere', anchor: 'left' },
      degrees: -80,
    });
    // Twice: as it was.
    reverseLine(formula.id);
    expect(lineOf(project())).toEqual(before.formula);
    expect((project().clips[0]!.actions[1] as TweenAction).ends).toEqual(
      (before.clip.actions[1] as TweenAction).ends,
    );
    project().clips[0]!.initial.position.forEach((v, k) =>
      expect(v).toBeCloseTo(before.clip.initial.position[k]!, 5),
    );
  });

  it('swaps the ends a line hangs by', () => {
    const line = scene();
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === line.id)!.attach = createEndsAttach(
        { clipId: 'host', glyphs: 'all', anchor: 'right' },
        { point: [3, -1] },
        0.1,
      );
    });
    reverseLine(lineOf(project()).id);
    expect(project().clips[0]!.attach).toMatchObject({
      start: { point: [3, -1] },
      end: { clipId: 'host', glyphs: 'all', anchor: 'right' },
      buff: 0.1,
    });
  });
});

describe('the degrees a Transform holds, once its line is no arc it can change', () => {
  /** The scene's arrow as an arc of 60° that a Transform, from 2 s, takes to 120° — and a second
   * one that leaves its degrees alone. */
  function arcScene(): string {
    scene({ curve: { shape: 'arc', degrees: 60, trim: 0 } });
    useProjectStore.getState().update((draft) => {
      const ends = { start: { point: [0, 0] as Vec2 }, end: { point: [2, 1] as Vec2 } };
      clipOf(draft).actions = [
        { ...createEndsTween(2, 1, { ...ends, degrees: 120 }), id: 'bends' },
        { ...createEndsTween(4, 1, ends), id: 'keeps' },
      ];
    });
    return lineOf(project()).id;
  }
  const degrees = () =>
    clipOf(project()).actions.map((action) => (action as TweenAction).ends?.degrees);
  const refused = () =>
    validateProject(project())
      .filter((issue) => issue.code === 'ends-degrees')
      .map((issue) => issue.message);

  it('is valid on an arc', () => {
    arcScene();
    expect(degrees()).toEqual([120, null]);
    expect(refused()).toEqual([]);
  });

  it('goes when the arc is bent into a spline, in the same undo step', () => {
    const id = arcScene();
    const steps = undoSteps();
    expect(bendLine(id, 'spline')).toBe(true);
    expect(undoSteps()).toBe(steps + 1);
    expect(degrees()).toEqual([null, null]);
    expect(refused()).toEqual([]);
    useProjectStore.temporal.getState().undo();
    expect(degrees()).toEqual([120, null]);
  });

  it('goes when the arc becomes a dashed line, whose Transform carries its dashes', () => {
    const id = arcScene();
    setLineKind(id, 'dashed');
    expect(degrees()).toEqual([null, null]);
    expect(refused()).toEqual([]);
  });

  it('stays when the arc becomes another line that is no dashed one', () => {
    const id = arcScene();
    setLineKind(id, 'line');
    expect(degrees()).toEqual([120, null]);
    expect(refused()).toEqual([]);
  });
});

describe('the shape of a path, copied and pasted (D151)', () => {
  const NODES: SplineNode[] = [
    { at: [0, 0], in: null, out: [0.2, 0.5], smooth: false },
    { at: [0.5, 0.3], in: [0.4, 0.3], out: [0.6, 0.3], smooth: true },
    { at: [1, 0], in: [0.8, 0.5], out: null, smooth: false },
  ];
  const lines = () => project().formulas.filter((f): f is LineFormula => f.kind === 'line');
  const named = (name: string) => lines().find((f) => f.name === name)!;
  const clipNamed = (name: string) => project().clips.find((c) => c.formulaId === named(name).id)!;
  const drawn = (name: string) => lineEndsAt('ce', named(name), clipNamed(name).initial);

  /** The scene's arrow `l1` and, beside it, a dashed line `l2` and a double arrow `l3`. */
  function three(fields: Partial<LineFormula> = {}): void {
    scene(fields);
    useLineShapeClipboard.getState().set(null);
    useProjectStore.getState().update((draft) => {
      const add = (more: Partial<LineFormula>, at: Vec2) => {
        const formula = createLineFormula({ vector: [0, 2], ...more });
        draft.formulas.push(formula);
        const clip = createClip(formula.id, draft.tracks[0]!.id, 6, 9, none);
        clip.initial.position = at;
        draft.clips.push(clip);
      };
      add({ name: 'l2', line: 'dashed' }, [3, 1]);
      add({ name: 'l3', line: 'double_arrow', tip: 'stealth', startTip: 'dot' }, [5, 1]);
    });
  }

  it('is the curve alone: straight, the degrees of an arc, a copy of the nodes of a spline', () => {
    expect(pathShapeOf(null)).toBeNull();
    expect(pathShapeOf({ shape: 'arc', degrees: -40, trim: 0.2 })).toEqual({
      shape: 'arc',
      degrees: -40,
      trim: 0,
    });
    const copy = pathShapeOf({ shape: 'spline', nodes: NODES })!;
    expect(copy).toEqual({ shape: 'spline', nodes: NODES });
    expect(copy.shape === 'spline' && copy.nodes[1]).not.toBe(NODES[1]);
    expect(describePathShape(null)).toBe('straight');
    expect(describePathShape({ shape: 'arc', degrees: -40, trim: 0 })).toBe('an arc of -40°');
    expect(describePathShape(copy)).toBe('a spline of 3 points');
  });

  it('keeps the part of an arc its gap takes, and is nothing new on a line that has it', () => {
    const arc: LineCurve = { shape: 'arc', degrees: 50, trim: 0 };
    expect(withPathShape({ shape: 'arc', degrees: 20, trim: 0.1 }, arc)).toEqual({
      curve: { shape: 'arc', degrees: 50, trim: 0.1 },
    });
    expect(withPathShape({ shape: 'arc', degrees: 50, trim: 0.1 }, arc)).toBeNull();
    expect(withPathShape(null, null)).toBeNull();
    expect(withPathShape({ shape: 'spline', nodes: NODES }, null)).toEqual({ curve: null });
    expect(withPathShape(null, arc)).toEqual({ curve: arc });
  });

  it('pastes nothing before a copy, and nothing onto what is no line', () => {
    three();
    const steps = undoSteps();
    expect(pasteLineShape([named('l2').id])).toBe(0);
    expect(copyLineShape('nothing')).toBe(false);
    expect(undoSteps()).toBe(steps);
  });

  it('gives an arc to a dashed line and a double arrow at once: their own ends, tips and kind', () => {
    three({ curve: { shape: 'arc', degrees: 70, trim: 0 } });
    const before = { l2: drawn('l2'), l3: drawn('l3') };
    expect(copyLineShape(named('l1').id)).toBe(true);
    expect(useLineShapeClipboard.getState().copied).toEqual({
      curve: { shape: 'arc', degrees: 70, trim: 0 },
      from: 'l1',
    });
    const steps = undoSteps();
    expect(pasteLineShape([named('l2').id, named('l3').id, named('l1').id])).toBe(2);
    expect(undoSteps()).toBe(steps + 1);
    expect(named('l2')).toMatchObject({
      line: 'dashed',
      vector: [0, 2],
      curve: { shape: 'arc', degrees: 70, trim: 0 },
    });
    expect(named('l3')).toMatchObject({
      line: 'double_arrow',
      tip: 'stealth',
      startTip: 'dot',
      curve: { shape: 'arc', degrees: 70, trim: 0 },
    });
    for (const name of ['l2', 'l3'] as const) {
      close(drawn(name).start, before[name].start);
      close(drawn(name).end, before[name].end);
    }
    // Once more: they have that path.
    expect(pasteLineShape([named('l2').id, named('l3').id])).toBe(0);
    expect(undoSteps()).toBe(steps + 1);
    useProjectStore.temporal.getState().undo();
    expect(named('l2').curve).toBeNull();
    expect(named('l3').curve).toBeNull();
  });

  it('gives a spline its nodes, a copy of them, in the frame of the ends of the line it goes to', () => {
    three({ curve: { shape: 'spline', nodes: NODES } });
    copyLineShape(named('l1').id);
    expect(pasteLineShape([named('l2').id])).toBe(1);
    expect(named('l2').curve).toEqual({ shape: 'spline', nodes: NODES });
    // The copy is the one of the moment: a later change of the first line is not in it.
    setLineNodes(clipNamed('l1').id, [NODES[0]!, NODES[2]!]);
    expect(pasteLineShape([named('l3').id])).toBe(1);
    expect(named('l3').curve).toEqual({ shape: 'spline', nodes: NODES });
  });

  it('makes a bent line straight again, its Transform keeping no degrees', () => {
    three();
    useProjectStore.getState().update((draft) => {
      const l2 = draft.formulas.find((f) => f.name === 'l2') as LineFormula;
      l2.line = 'arrow';
      l2.curve = { shape: 'arc', degrees: 60, trim: 0 };
      const ends = { start: { point: [3, 0] as Vec2 }, end: { point: [3, 2] as Vec2 } };
      draft.clips
        .find((c) => c.formulaId === l2.id)!
        .actions.push(createEndsTween(7, 1, { ...ends, degrees: 120 }));
    });
    copyLineShape(named('l1').id);
    expect(pasteLineShape([named('l2').id])).toBe(1);
    expect(named('l2').curve).toBeNull();
    expect((clipNamed('l2').actions[0] as TweenAction).ends!.degrees).toBeNull();
    expect(validateProject(project()).filter((issue) => issue.code === 'ends-degrees')).toEqual([]);
  });

  it('ends «Edit curve» on the line it is pasted onto, which keeps what it was given', () => {
    three({ curve: { shape: 'arc', degrees: 30, trim: 0 } });
    copyLineShape(named('l1').id);
    expect(editLineCurve(clipNamed('l2').id)).toBe(true);
    expect(useLineCurveEdit.getState().clipId).toBe(clipNamed('l2').id);
    expect(pasteLineShape([named('l2').id])).toBe(1);
    expect(useLineCurveEdit.getState().clipId).toBeNull();
    expect(named('l2').curve).toEqual({ shape: 'arc', degrees: 30, trim: 0 });
  });
});
