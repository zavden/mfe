/* A line's curve and tips (D145, D146). A line is bent, never unbent: a straight one into an arc
 * — Manim's `path_arc`, thirty degrees to begin with — or into a spline, an arc into a spline
 * (the same curve, as nodes); the way back is Undo. An arc's degrees are a field of the Line
 * section and a handle in the preview: a stem along the arc where it leaves its start, whose tip
 * is dragged (`arcFromPointer`). A spline is shaped in the mode «Edit curve» (`useLineCurveEdit`),
 * with the anchors and handles of a custom path (`pathEdit.ts` has the edits, pure): each change
 * is one undo step, Enter keeps the curve and Esc puts back the one the mode started with,
 * wherever the playhead is (`useLineCurveKeys.ts`). The mode opens with the playback paused and
 * the playhead on the line's clip.
 *
 * A clip is placed by the centre the library reads of its line, which the curve and the tips
 * move: what changes them keeps the ends of a free line where they are (`relook`); a line with an
 * end on glyphs is placed by the attach sync.
 *
 * The shape of a line's path is copied and pasted onto other lines (D151), of any of the four
 * kinds: straight, an arc's degrees or a spline's nodes — which are in the frame of the two ends,
 * so the path stretches and turns with the ends of the line that takes it — and nothing else of
 * the line (its tips, its kind, its stroke and its ends stay). A paste is the one way a bent line
 * is made straight again, or a spline an arc. A small clipboard of the app's own
 * (`useLineShapeClipboard`), as the one of a clip's properties. */
import { create } from 'zustand';
import { arcSpline, chordFrame, splineStretches, type Mat2D } from '../../geom';
import {
  DEFAULT_LINE_ARC,
  endsTweens,
  LINE_ARC_LIMIT,
  type Clip,
  type ClipId,
  type LineCurve,
  type LineFormula,
  type LineTip,
  type Project,
  type SplineNode,
  type Target,
  type Vec2,
} from '../../model';
import { lineEndsAt } from '../../scene';
import { history, useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { notify } from '../project/noticeStore';
import { onDocumentReplaced } from '../project/documentStore';
import { round6 } from '../time';
import { mainPlayback } from '../transport/mainPlayback';
import { removeNode, type PathSelection } from './pathEdit';
import { isPreviewLocked } from './previewLock';
import { endPreviewModes, registerPreviewMode } from './previewModes';

/** What a line can still be bent into: an arc and a spline while it is straight, a spline while it
 * is an arc, nothing once it is a spline. */
export function bendsOf(curve: LineCurve | null): ('arc' | 'spline')[] {
  if (!curve) return ['arc', 'spline'];
  return curve.shape === 'arc' ? ['spline'] : [];
}

/** The curve a line takes when it is bent into `shape`, or null when it cannot be: a straight
 * line, the arc of thirty degrees, as an arc or as the nodes of one; an arc, the arc that is
 * drawn of it — what its gap leaves — as nodes. */
export function bentCurve(curve: LineCurve | null, shape: 'arc' | 'spline'): LineCurve | null {
  if (!bendsOf(curve).includes(shape)) return null;
  if (shape === 'arc') return { shape: 'arc', degrees: DEFAULT_LINE_ARC, trim: 0 };
  const degrees = curve?.shape === 'arc' ? curve.degrees * (1 - 2 * curve.trim) : DEFAULT_LINE_ARC;
  return { shape: 'spline', nodes: arcSpline(degrees).nodes };
}

/** `degrees` as an arc holds them: whole hundredths, within the limit either way. */
export const arcDegrees = (degrees: number): number =>
  Math.max(-LINE_ARC_LIMIT, Math.min(LINE_ARC_LIMIT, Math.round(degrees * 100) / 100)) || 0;

/** The unit vector along an arc of `degrees` where it leaves `start` for `end`, once its gap took
 * `trim` of it: the line between its ends turned by half of what is drawn of the arc, clockwise
 * for a positive arc (which bulges to the right of its way). */
export function arcTangent(start: Vec2, end: Vec2, degrees: number, trim: number): Vec2 {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (!(length > 0)) return [1, 0];
  const turn = (-(degrees * (1 - 2 * trim)) / 2) * (Math.PI / 180);
  const ux = (end[0] - start[0]) / length;
  const uy = (end[1] - start[1]) / length;
  return [ux * Math.cos(turn) - uy * Math.sin(turn), ux * Math.sin(turn) + uy * Math.cos(turn)];
}

/** The degrees of the arc from `start` to `end` that leaves `start` towards `pointer`
 * (`arcTangent` backwards), whole ones — every fifteenth with `coarse` —, within the limit. Null
 * when the pointer is on the start or the two ends are one point. */
export function arcFromPointer(
  start: Vec2,
  end: Vec2,
  pointer: Vec2,
  trim: number,
  coarse = false,
): number | null {
  const chord = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const dx = pointer[0] - start[0];
  const dy = pointer[1] - start[1];
  if (!(Math.hypot(dx, dy) > 0) || !(Math.hypot(end[0] - start[0], end[1] - start[1]) > 0)) {
    return null;
  }
  let turn = Math.atan2(dy, dx) - chord;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  const kept = 1 - 2 * trim;
  const degrees = ((-2 * turn) / (kept > 0 ? kept : 1)) * (180 / Math.PI);
  const step = coarse ? 15 : 1;
  return arcDegrees(Math.round(degrees / step) * step);
}

/** The nodes of a line's spline with every handle of a stretch said: one that is not there is
 * where the line draws it, a third of the way to the next control point (`splineStretches`), so
 * that what the mode shows and cuts is the curve on screen. The first node has no handle before
 * it, the last none after. */
export function explicitNodes(nodes: readonly SplineNode[]): SplineNode[] {
  const stretches = splineStretches(nodes);
  return nodes.map((node, index) => ({
    ...node,
    in: index === 0 ? null : stretches[index - 1]![1],
    out: index === nodes.length - 1 ? null : stretches[index]![0],
  }));
}

/** The frame of a spline's nodes for a line drawn from `start` to `end`: u along the line, v
 * across it to the left; null when the two ends are one point. */
export const curveFrame = (start: Vec2, end: Vec2): Mat2D | null => chordFrame(start, end);

/** Change what the line object `formulaId` is drawn with, in a draft: its clips that hang on
 * nothing keep their two ends where they are — the clip's position, and where its Transforms take
 * it, go with the centre of the line, which the change may move. A Transform changes the degrees
 * of an arc that is not dashed, and of nothing else (`ends-degrees`): the degrees its Transforms
 * held go once the line is no such arc. */
export function relook(
  draft: Project,
  formulaId: string,
  change: (formula: LineFormula) => void,
): void {
  const formula = draft.formulas.find((f) => f.id === formulaId);
  if (formula?.kind !== 'line') return;
  const lib: Target = draft.meta.target;
  const free = draft.clips.filter((clip) => clip.formulaId === formulaId && !clip.attach);
  const starts = free.map((clip) => lineEndsAt(lib, formula, clip.initial).start);
  change(formula);
  if (formula.curve?.shape !== 'arc' || formula.line === 'dashed') {
    for (const clip of draft.clips) {
      if (clip.formulaId !== formulaId) continue;
      for (const tween of endsTweens(clip)) tween.ends.degrees = null;
    }
  }
  free.forEach((clip, index) => {
    const before = clip.initial.position;
    const drawn = lineEndsAt(lib, formula, clip.initial).start;
    const dx = starts[index]![0] - drawn[0];
    const dy = starts[index]![1] - drawn[1];
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
    clip.initial.position = [round6(before[0] + dx), round6(before[1] + dy)];
    for (const action of clip.actions) {
      if (action.kind !== 'tween' || !action.to.position) continue;
      action.to.position = [round6(action.to.position[0] + dx), round6(action.to.position[1] + dy)];
    }
  });
}

/** `relook` as one undo step. */
function relookStep(formulaId: string, change: (formula: LineFormula) => void): void {
  history.cancelForeignGesture();
  useProjectStore.getState().update((draft) => relook(draft, formulaId, change));
}

const lineOf = (formulaId: string): LineFormula | null => {
  const formula = useProjectStore.getState().project.formulas.find((f) => f.id === formulaId);
  return formula?.kind === 'line' ? formula : null;
};

/** Bend the line object `formulaId` into an arc or a spline, as one undo step; nothing when it
 * cannot be (`bendsOf`). Whether it was. */
export function bendLine(formulaId: string, shape: 'arc' | 'spline'): boolean {
  const formula = lineOf(formulaId);
  const curve = formula && bentCurve(formula.curve, shape);
  if (!formula || !curve) return false;
  relookStep(formulaId, (line) => {
    line.curve = curve;
  });
  announce(
    shape === 'arc'
      ? `${formula.name} is an arc of ${DEFAULT_LINE_ARC} degrees`
      : `${formula.name} is a spline`,
  );
  return true;
}

/** Set the degrees of the arc of the line object `formulaId` (nothing when it is no arc). */
export function setLineArc(formulaId: string, degrees: number): void {
  const formula = lineOf(formulaId);
  if (formula?.curve?.shape !== 'arc') return;
  const next = arcDegrees(degrees);
  if (next === formula.curve.degrees) return;
  relookStep(formulaId, (line) => {
    if (line.curve?.shape === 'arc') line.curve.degrees = next;
  });
}

/** Set the shape of the tips of the line object `formulaId`, as one undo step. */
export function setLineTips(formulaId: string, tips: { tip?: LineTip; startTip?: LineTip }): void {
  relookStep(formulaId, (line) => {
    Object.assign(line, tips);
  });
}

/** Why the curve of the line of `clipId` cannot be shaped now, or null: its track is locked, or
 * the clip is locked in the preview — which leaves it alone (`previewLock.ts`). */
export function curveLock(project: Project, clipId: ClipId): string | null {
  const clip = project.clips.find((c) => c.id === clipId);
  const track = clip && project.tracks.find((t) => t.id === clip.trackId);
  if (!clip || !track) return 'That line no longer exists.';
  if (track.locked) {
    return `Track “${track.name}” is locked: unlock it on the timeline to edit the curve.`;
  }
  if (isPreviewLocked(clip)) {
    const name = project.formulas.find((f) => f.id === clip.formulaId)?.name ?? 'The line';
    return `“${name}” is locked in the preview: unlock it on the timeline to edit the curve.`;
  }
  return null;
}

/** Set the nodes of the spline of the line of clip `clipId`, its object's, as one undo step:
 * nothing when it is no spline, or when the clip is locked (`curveLock`). */
export function setLineNodes(clipId: ClipId, nodes: readonly SplineNode[]): void {
  const { project } = useProjectStore.getState();
  const formulaId = project.clips.find((c) => c.id === clipId)?.formulaId;
  const formula = formulaId ? lineOf(formulaId) : null;
  if (!formulaId || formula?.curve?.shape !== 'spline' || nodes.length < 2) return;
  if (curveLock(project, clipId)) return;
  // The same curve with a point made smooth, or a corner, is another list of nodes.
  if (JSON.stringify(formula.curve.nodes) === JSON.stringify(nodes)) return;
  relookStep(formulaId, (line) => {
    if (line.curve?.shape === 'spline') line.curve.nodes = structuredClone([...nodes]);
  });
}

// --- «Reverse points» ------------------------------------------------------------------------

/** No `-0` in a file: the opposite of a number, zero for zero. */
const opposite = (value: number): number => (value === 0 ? 0 : -value);

/** `curve` as the same line run from its end to its start: an arc turns the other way, by as
 * many degrees; a spline goes through its points backwards, each with its two handles swapped,
 * in the frame of the two ends as they are then — along the line from the new start, across it
 * to the new left. */
export function reversedCurve(curve: LineCurve | null): LineCurve | null {
  if (!curve) return null;
  if (curve.shape === 'arc') return { ...curve, degrees: opposite(curve.degrees) };
  const turned = (point: Vec2 | null): Vec2 | null =>
    point && [round6(1 - point[0]), opposite(round6(point[1]))];
  return {
    shape: 'spline',
    nodes: [...curve.nodes].reverse().map((node) => ({
      at: turned(node.at)!,
      in: turned(node.out),
      out: turned(node.in),
      smooth: node.smooth,
    })),
  };
}

/** Reverse the line object `formulaId` in a draft (D147, Manim's «reverse points» for a line in
 * the editor): its start and its end change places, and the curve drawn stays where it is. The
 * object runs along the opposite vector, bent as `reversedCurve` says; a double arrow's two tips
 * change shapes with their ends, so that it is drawn as it was, and an arrow's tip is then at the
 * other end. Each of its clips swaps the two ends it hangs by, and so does each of its Transforms
 * that carries its ends (an arc's new degrees turned too); a clip that hangs on nothing keeps the
 * line where it is — its position, and where its plain Transforms take it, go with the centre of
 * the line, which a tip moves. What draws the line — Create, GrowArrow — starts from the other
 * end from then on. */
export function reverseLineIn(draft: Project, formulaId: string): void {
  const formula = draft.formulas.find((f) => f.id === formulaId);
  if (formula?.kind !== 'line') return;
  const lib: Target = draft.meta.target;
  const clips = draft.clips.filter((clip) => clip.formulaId === formulaId);
  const free = clips.filter((clip) => !clip.attach);
  const ends = free.map((clip) => lineEndsAt(lib, formula, clip.initial).end);
  formula.vector = [opposite(formula.vector[0]), opposite(formula.vector[1])];
  formula.curve = reversedCurve(formula.curve);
  if (formula.line === 'double_arrow') {
    [formula.tip, formula.startTip] = [formula.startTip, formula.tip];
  }
  for (const clip of clips) {
    if (clip.attach?.rule === 'ends') {
      [clip.attach.start, clip.attach.end] = [clip.attach.end, clip.attach.start];
    }
    for (const action of clip.actions) {
      if (action.kind !== 'tween' || !action.ends) continue;
      const held = action.ends;
      [held.start, held.end] = [held.end, held.start];
      if (held.degrees !== null) held.degrees = opposite(held.degrees);
      if (held.drawn) [held.drawn.start, held.drawn.end] = [held.drawn.end, held.drawn.start];
    }
  }
  // A free clip: the new start is where the end was.
  free.forEach((clip, index) => {
    const before = clip.initial.position;
    const drawn = lineEndsAt(lib, formula, clip.initial).start;
    const dx = ends[index]![0] - drawn[0];
    const dy = ends[index]![1] - drawn[1];
    clip.initial.position = [round6(before[0] + dx), round6(before[1] + dy)];
    for (const action of clip.actions) {
      if (action.kind !== 'tween' || !action.to.position) continue;
      action.to.position = [round6(action.to.position[0] + dx), round6(action.to.position[1] + dy)];
    }
  });
}

/** Reverse the line object `formulaId` (`reverseLineIn`), as one undo step. «Edit curve» on it
 * ends first, keeping its curve (`endCurveEditOn`). Whether it is a line. */
export function reverseLine(formulaId: string): boolean {
  const formula = lineOf(formulaId);
  if (!formula) return false;
  endCurveEditOn([formulaId]);
  history.cancelForeignGesture();
  useProjectStore.getState().update((draft) => reverseLineIn(draft, formulaId));
  announce(`${formula.name} is reversed: its start and its end changed places`);
  return true;
}

// --- Copy and paste the shape of the path (D151) -----------------------------------------------

/** The shape of the path of a line as another line takes it: straight (null), an arc's degrees —
 * the part of it a gap takes (`trim`) is the taker's own — or a copy of a spline's nodes. */
export function pathShapeOf(curve: LineCurve | null): LineCurve | null {
  if (!curve) return null;
  if (curve.shape === 'arc') return { shape: 'arc', degrees: curve.degrees, trim: 0 };
  return { shape: 'spline', nodes: curve.nodes.map((node) => structuredClone(node)) };
}

/** "straight", "an arc of 30°", "a spline of 4 points". */
export function describePathShape(curve: LineCurve | null): string {
  if (!curve) return 'straight';
  if (curve.shape === 'arc') return `an arc of ${curve.degrees}°`;
  return `a spline of ${curve.nodes.length} points`;
}

/** What a line with the path `own` is drawn with once it takes `shape`: an arc keeps the part of
 * it its gap takes; null when that is the path it has. */
export function withPathShape(
  own: LineCurve | null,
  shape: LineCurve | null,
): { curve: LineCurve | null } | null {
  const next =
    shape?.shape === 'arc' && own?.shape === 'arc'
      ? { ...shape, trim: own.trim }
      : pathShapeOf(shape);
  return JSON.stringify(next) === JSON.stringify(own) ? null : { curve: next };
}

interface LineShapeClipboardState {
  /** The last copied shape, with the name of the line it is of; null until one is copied. */
  copied: { curve: LineCurve | null; from: string } | null;
  set(copied: { curve: LineCurve | null; from: string } | null): void;
}

export const useLineShapeClipboard = create<LineShapeClipboardState>()((set) => ({
  copied: null,
  set: (copied) => set({ copied }),
}));

/** Copy the shape of the path of the line object `formulaId`. Whether it did. */
export function copyLineShape(formulaId: string): boolean {
  const formula = lineOf(formulaId);
  if (!formula) return false;
  const curve = pathShapeOf(formula.curve);
  useLineShapeClipboard.getState().set({ curve, from: formula.name });
  announce(`Copied the path of ${formula.name}: ${describePathShape(curve)}`);
  return true;
}

/** Give the line objects `formulaIds` the copied shape, as one undo step: each keeps its ends, its
 * tips, its kind and its stroke; the ones that are not lines, and the ones that have that path
 * already, stay. «Edit curve» on one of them ends first, keeping its curve. How many changed. */
export function pasteLineShape(formulaIds: readonly string[]): number {
  const { copied } = useLineShapeClipboard.getState();
  if (!copied) return 0;
  const { project } = useProjectStore.getState();
  const taking = project.formulas.filter(
    (formula): formula is LineFormula =>
      formula.kind === 'line' &&
      formulaIds.includes(formula.id) &&
      withPathShape(formula.curve, copied.curve) !== null,
  );
  if (taking.length === 0) return 0;
  endCurveEditOn(taking.map((formula) => formula.id));
  history.cancelForeignGesture();
  useProjectStore.getState().update((draft) => {
    for (const { id } of taking) {
      relook(draft, id, (line) => {
        const next = withPathShape(line.curve, copied.curve);
        if (next) line.curve = next.curve;
      });
    }
  });
  const names = taking.map((formula) => formula.name).join(', ');
  announce(`${names}: the path of ${copied.from}, ${describePathShape(copied.curve)}`);
  return taking.length;
}

// --- «Edit curve» ----------------------------------------------------------------------------

interface LineCurveEditState {
  /** The clip whose line's spline is being shaped. */
  clipId: ClipId | null;
  /** The nodes the spline had when the mode started: what Esc puts back. */
  original: SplineNode[] | null;
  selected: PathSelection | null;
  /** Enter the mode on the line of a clip, if it is a spline that can be shaped (`curveLock`:
   * not on a locked track, not locked in the preview — a notice says why). */
  open(clipId: ClipId): boolean;
  /** Leave the mode: keeping the curve as it is, or — `cancel` — as it was on entering. */
  close(cancel?: boolean): void;
  select(selected: PathSelection | null): void;
}

/** «Edit curve» on a clip of one of the line objects `formulaIds` ends, keeping its curve: what
 * writes another path for the line — a paste, a reversal — first ends the mode, whose Esc would
 * otherwise put back the nodes of before over it. */
function endCurveEditOn(formulaIds: readonly string[]): void {
  const { clipId } = useLineCurveEdit.getState();
  if (clipId === null) return;
  const { clips } = useProjectStore.getState().project;
  const line = clips.find((clip) => clip.id === clipId)?.formulaId;
  if (line !== undefined && formulaIds.includes(line)) useLineCurveEdit.getState().close();
}

/** The spline of the line of `clipId`, with its object, or null. */
export function splineOfClip(
  project: Project,
  clipId: ClipId | null,
): { formula: LineFormula; nodes: SplineNode[] } | null {
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
  return formula?.kind === 'line' && formula.curve?.shape === 'spline'
    ? { formula, nodes: formula.curve.nodes }
    : null;
}

export const useLineCurveEdit = create<LineCurveEditState>()((set, get) => ({
  clipId: null,
  original: null,
  selected: null,
  open(clipId) {
    const { project } = useProjectStore.getState();
    const clip = project.clips.find((c) => c.id === clipId);
    const spline = splineOfClip(project, clipId);
    if (!clip || !spline) return false;
    const locked = curveLock(project, clipId);
    if (locked) {
      notify({ kind: 'info', title: 'The curve stays', message: locked });
      return false;
    }
    endPreviewModes('curve');
    // The line is shaped where it is drawn: on screen — the playback paused, which would carry
    // the playhead off it, and the playhead brought to the clip's start when it is elsewhere —,
    // and alone selected.
    mainPlayback.pause();
    if (!curveShownAt(clip, useUiStore.getState().time)) mainPlayback.seek(clip.start);
    useUiStore.getState().select({ kind: 'clips', ids: [clipId] });
    set({ clipId, original: structuredClone(spline.nodes), selected: null });
    return true;
  },
  close(cancel = false) {
    const { clipId, original } = get();
    if (clipId === null) return;
    set({ clipId: null, original: null, selected: null });
    if (!cancel || !original) return;
    setLineNodes(clipId, original);
  },
  select(selected) {
    set({ selected });
  },
}));

registerPreviewMode(
  'curve',
  () => useLineCurveEdit.getState().close(),
  () => useLineCurveEdit.getState().clipId !== null,
);

/** What the preview's hint says in the mode. */
export const LINE_CURVE_HINT =
  'Edit curve: drag points and handles · Shift: keep the other handle’s length · Ctrl/⌘: move a handle alone · click the curve to add a point · Delete removes · double-click: smooth or corner · Enter: done · Esc: as it was';

/** Whether the line of `clip` is on screen at `time`: the mode shows its points then
 * (`LineLayer.tsx`), and says that it is not otherwise — on all the same, and left as always. */
export const curveShownAt = (clip: Pick<Clip, 'start' | 'end'>, time: number): boolean =>
  time >= clip.start && time < clip.end;

/** Remove the point of the spline that the mode has selected, as one undo step — while its line
 * is on screen, and never an end of the line —; the selection goes with it. Whether one went. */
export function removeCurvePoint(): boolean {
  const { clipId, selected } = useLineCurveEdit.getState();
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  const spline = splineOfClip(project, clipId);
  if (!selected || !clip || !spline || !curveShownAt(clip, useUiStore.getState().time)) {
    return false;
  }
  // The nodes as the mode shows and cuts them, every handle said.
  const nodes = explicitNodes(spline.nodes);
  const next = removeNode({ nodes }, selected.node).nodes;
  if (next.length === nodes.length) return false;
  setLineNodes(clip.id, next);
  useLineCurveEdit.getState().select(null);
  return true;
}

/** Bend the line of `clipId` into a spline and shape it at once; or just shape it, when it is one
 * already. */
export function editLineCurve(clipId: ClipId): boolean {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
  if (!clip || formula?.kind !== 'line') return false;
  if (formula.curve?.shape !== 'spline' && !bendLine(formula.id, 'spline')) return false;
  return useLineCurveEdit.getState().open(clipId);
}

/** Leave the mode with its document, or when its line stops being a spline (an Undo past the
 * bend); and, saying why, when its line is locked — its track, or in the preview —, keeping the
 * curve as it is: nothing can be written there. One of the sessions that end with the document.
 * Returns the function that stops it. */
export function startLineCurveTracking(): () => void {
  const offDocument = onDocumentReplaced(() => useLineCurveEdit.getState().close());
  const offProject = useProjectStore.subscribe((state) => {
    const { clipId } = useLineCurveEdit.getState();
    if (clipId === null) return;
    const spline = splineOfClip(state.project, clipId);
    const locked = spline ? curveLock(state.project, clipId) : null;
    if (spline && !locked) return;
    useLineCurveEdit.setState({ clipId: null, original: null, selected: null });
    if (locked) notify({ kind: 'info', title: 'Edit curve ended', message: locked });
  });
  return () => {
    offDocument();
    offProject();
  };
}
