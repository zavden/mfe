/* Drawing a line and moving its ends (`lineDraw.ts`, D137, D140): what a click means for an end,
 * the plan of a new line, the point Manim is given for a free end, what moving an end writes,
 * and the anchor an end on glyphs waits for. */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createEndsAttach,
  createFormula,
  createLineFormula,
  createShapeFormula,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  type Clip,
  type LineFormula,
  type Project,
  type TweenAction,
  validateProject,
} from '../../../model';
import { refreshLocalRenders } from '../../../engine';
import { lineEndsAt, pointForFreeEnd, settleScene } from '../../../scene';
import { loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { planNewBlock } from '../../animations/blockOps';
import { useNoticeStore } from '../../project/noticeStore';
import {
  alongLine,
  anchorLabel,
  anchorOf,
  anchorPendingEnd,
  askLineAnchor,
  createLine,
  directionOf,
  editTweenEnds,
  endAt,
  endsForNewTween,
  freeLineEnd,
  freeLineEnds,
  lineDrawHint,
  lineEndsHeld,
  MIN_LINE_LENGTH,
  moveLineEnd,
  offerLineEnd,
  placeLineEnd,
  setLineAnchor,
  setLineKind,
  startLineDraw,
  startLineDrawTracking,
  takesLineEnd,
  useLineDraw,
} from '../lineDraw';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
const project = () => useProjectStore.getState().project;
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;
const lineOf = (p: Project) => p.formulas.find((f) => f.kind === 'line') as LineFormula;
const clipOf = (p: Project) => p.clips.find((c) => c.formulaId === lineOf(p).id)!;

/** Three tracks; on the middle one, a box 2 × 1 at (−3, 1) over [0, 6) (clip `host`, which an
 * end cannot go on); a free line from (0, 0) to (2, 0) on the first, over [0, 6). */
function scene(): { host: Clip; line: Clip } {
  const p = createEmptyProject();
  p.tracks = [createTrack('Track 3'), createTrack('Track 2'), createTrack('Track 1')];
  const box = createShapeFormula({ name: 'box', width: 2, height: 1 });
  const formula = createLineFormula({ name: 'l1', vector: [2, 0] });
  p.formulas.push(box, formula);
  const host = createClip(box.id, p.tracks[1]!.id, 0, 6, none);
  host.initial.position = [-3, 1];
  const line = createClip(formula.id, p.tracks[0]!.id, 0, 6, none);
  line.initial.position = [1, 0];
  p.clips.push(host, line);
  loadProject(p);
  useUiStore.getState().setTime(2);
  return { host, line };
}

describe('what a click means for an end', () => {
  it('is the whole of a formula or a text, and a point anywhere else', () => {
    const { host, line } = scene();
    const p = project();
    // A shape takes no end: a click on it is a point, as on empty space.
    expect(takesLineEnd(p, host.id)).toBe(false);
    expect(endAt(p, host.id, [1.23456789, 2])).toEqual({ point: [1.234568, 2] });
    expect(endAt(p, null, [0, 0])).toEqual({ point: [0, 0] });
    expect(endAt(p, line.id, [0, 0], line.id)).toEqual({ point: [0, 0] });
  });

  it('says in the hint which end is asked for', () => {
    expect(lineDrawHint({ line: 'arrow', start: null }, '')).toContain('Arrow: where it starts');
    expect(lineDrawHint({ line: 'dashed', start: { point: [0, 0] } }, 'a point')).toContain(
      'Dashed line from a point: where it ends',
    );
    // While the compass is open, that a point of the glyphs is to be chosen.
    expect(lineDrawHint({ line: 'arrow', start: null }, '', 'f1')).toContain(
      'Arrow: choose where on f1 it starts',
    );
    expect(lineDrawHint({ line: 'arrow', start: { point: [0, 0] } }, 'a point', 'f1')).toContain(
      'choose where on f1 it ends',
    );
  });

  it('names the key that picks symbols as the system writes it, and leaves the names alone', () => {
    expect(lineDrawHint({ line: 'arrow', start: null }, '', null, false)).toBe(
      'Arrow: where it starts — click a formula, or empty space for a free point; hold Alt to pick symbols · Esc cancels',
    );
    expect(lineDrawHint({ line: 'arrow', start: null }, '', null, true)).toBe(
      'Arrow: where it starts — click a formula, or empty space for a free point; hold ⌥ to pick symbols · Esc cancels',
    );
    // A formula named as a key is still its name.
    expect(lineDrawHint({ line: 'arrow', start: { point: [0, 0] } }, 'Alt', null, true)).toBe(
      'Arrow from Alt: where it ends — click a formula, or empty space for a free point; hold ⌥ to pick symbols · Esc cancels',
    );
  });

  it('keeps an end dragged with Ctrl on the line’s own axis: longer or shorter, the same way', () => {
    // A line from (1, 1) up and to the right; the pointer goes off to the side.
    const on = alongLine([1, 1], [3, 3], [5, 3]);
    expect(on[0]).toBeCloseTo(4, 9);
    expect(on[1]).toBeCloseTo(4, 9);
    // Shorter, and never through the other end: it stops at the shortest line there is.
    expect(alongLine([1, 1], [3, 3], [2, 1])[0]).toBeCloseTo(1.5, 9);
    const least = alongLine([1, 1], [3, 3], [-4, -2]);
    expect(Math.hypot(least[0] - 1, least[1] - 1)).toBeCloseTo(MIN_LINE_LENGTH, 9);
    expect(least[0]).toBeGreaterThan(1);
    // Two ends at one place have no direction to keep.
    expect(alongLine([1, 1], [1, 1], [5, 3])).toEqual([5, 3]);
  });

  it('names an anchor as the compass does, «Auto» besides its nine', () => {
    expect(anchorOf('UL')).toBe('ul');
    expect(anchorOf('CENTER')).toBe('center');
    expect(directionOf('dr')).toBe('DR');
    expect(directionOf('auto')).toBeNull();
    expect(anchorLabel('auto')).toBe('Auto');
    expect(anchorLabel('left')).toBe('Left edge');
  });
});

/** `scene`, and two formulas an end can go on: `fa` on a track of its own over [0, 6) (clip
 * `a`), `fb` on another (clip `b`). They have no render: what is asked and written is looked at,
 * not where the line is drawn. */
function withFormulas(): { a: Clip; b: Clip; line: Clip } {
  const { line } = scene();
  const p = structuredClone(project());
  const fa = createFormula({ name: 'fa', source: 'a' });
  const fb = createFormula({ name: 'fb', source: 'b' });
  const ta = createTrack('Track 4');
  const tb = createTrack('Track 5');
  p.formulas.push(fa, fb);
  p.tracks.push(ta, tb);
  const a = createClip(fa.id, ta.id, 0, 6, none);
  const b = createClip(fb.id, tb.id, 0, 6, none);
  p.clips.push(a, b);
  loadProject(p);
  useUiStore.getState().setTime(2);
  return { a, b, line };
}

describe('the anchor an end on glyphs waits for', () => {
  it('starts on the clip of the menu, asks where on it, and takes one click for the end', () => {
    const { a, b } = withFormulas();
    startLineDraw('arrow', { clipId: a.id, glyphs: [0] });
    // The start is asked for by the glyphs (no pointer put it): nothing is put yet.
    expect(useLineDraw.getState().request).toEqual({ line: 'arrow', start: null });
    expect(useLineDraw.getState().pending).toEqual({
      owner: { kind: 'draw' },
      target: { clipId: a.id, glyphs: [0] },
      // The index space of the symbols, which the end follows until it is used (B6-04).
      revision: expect.objectContaining({ formulaId: a.formulaId }),
      at: null,
      current: null,
    });
    anchorPendingEnd('dr');
    expect(useLineDraw.getState().pending).toBeNull();
    expect(useLineDraw.getState().request!.start).toEqual({
      clipId: a.id,
      glyphs: [0],
      anchor: 'dr',
    });
    // The end: a click on the other formula waits for its point too, and then the line is made.
    const lines = () => project().formulas.filter((f) => f.kind === 'line').length;
    offerLineEnd({ kind: 'draw' }, { clipId: b.id, glyphs: 'all' }, { x: 40, y: 50 });
    expect(lines()).toBe(1);
    expect(useLineDraw.getState().pending).toMatchObject({
      target: { clipId: b.id, glyphs: 'all' },
      at: { x: 40, y: 50 },
    });
    anchorPendingEnd('auto');
    expect(lines()).toBe(2);
    expect(useLineDraw.getState().request).toBeNull();
    expect(project().clips.at(-1)!.attach).toEqual({
      rule: 'ends',
      start: { clipId: a.id, glyphs: [0], anchor: 'dr' },
      end: { clipId: b.id, glyphs: 'all', anchor: 'auto' },
      buff: 0.25,
    });
  });

  it('starts with two clicks from a clip an end cannot go on, or from none', () => {
    const { host } = scene();
    startLineDraw('line', { clipId: host.id, glyphs: 'all' });
    expect(useLineDraw.getState().pending).toBeNull();
    expect(useLineDraw.getState().request).toEqual({ line: 'line', start: null });
    startLineDraw('line');
    expect(useLineDraw.getState().pending).toBeNull();
  });

  it('gives the end up when the compass is cancelled, and all of it with the mode', () => {
    const { a } = withFormulas();
    startLineDraw('line', { clipId: a.id, glyphs: 'all' });
    useLineDraw.getState().ask(null);
    expect(useLineDraw.getState().request).toEqual({ line: 'line', start: null });
    offerLineEnd({ kind: 'draw' }, { clipId: a.id, glyphs: 'all' }, null);
    useLineDraw.getState().setAim({ clipId: a.id, glyphs: 'all' });
    useLineDraw.getState().cancel();
    expect(useLineDraw.getState()).toMatchObject({ request: null, pending: null, aim: null });
    // Nothing waits: an answer does nothing.
    const before = project();
    anchorPendingEnd('ul');
    expect(project()).toBe(before);
  });

  it('takes a point at once: a free end waits for nothing', () => {
    withFormulas();
    startLineDraw('line');
    offerLineEnd({ kind: 'draw' }, { point: [1, 1] }, { x: 0, y: 0 });
    expect(useLineDraw.getState().pending).toBeNull();
    expect(useLineDraw.getState().request!.start).toEqual({ point: [1, 1] });
  });
});

describe('an end of a line dropped somewhere', () => {
  it('is left free at a point, and waits for its anchor on glyphs', () => {
    const { a, line } = withFormulas();
    // A point: moved at once, and still a free line.
    offerLineEnd({ kind: 'move', clipId: line.id, side: 'end' }, { point: [0, 3] }, null);
    expect(clipOf(project()).attach).toBeNull();
    expect(lineOf(project()).vector).toEqual([0, 3]);
    // Glyphs: nothing moves until the compass answers.
    const before = project();
    offerLineEnd(
      { kind: 'move', clipId: line.id, side: 'end' },
      { clipId: a.id, glyphs: 'all' },
      { x: 10, y: 20 },
    );
    expect(project()).toBe(before);
    expect(useLineDraw.getState().pending).toMatchObject({
      owner: { kind: 'move', clipId: line.id, side: 'end' },
      current: null,
    });
    anchorPendingEnd('left');
    expect(clipOf(project()).attach).toMatchObject({
      rule: 'ends',
      start: { point: [0, 0] },
      end: { clipId: a.id, glyphs: 'all', anchor: 'left' },
    });
  });

  it('asks again for the glyphs it is on with its anchor marked, and changes it alone', () => {
    const { a, line } = withFormulas();
    offerLineEnd(
      { kind: 'move', clipId: line.id, side: 'end' },
      { clipId: a.id, glyphs: [0] },
      null,
    );
    anchorPendingEnd('ul');
    askLineAnchor(line.id, 'end', { x: 5, y: 6 });
    expect(useLineDraw.getState().pending).toEqual({
      owner: { kind: 'move', clipId: line.id, side: 'end' },
      target: { clipId: a.id, glyphs: [0] },
      revision: expect.objectContaining({ formulaId: a.formulaId }),
      at: { x: 5, y: 6 },
      current: 'ul',
    });
    useLineDraw.getState().ask(null);
    // A free end has no anchor to ask for.
    askLineAnchor(line.id, 'start', null);
    expect(useLineDraw.getState().pending).toBeNull();
    // The panel's field: the same glyphs, another point of them.
    expect(setLineAnchor(line.id, 'end', 'ul')).toBe(false);
    expect(setLineAnchor(line.id, 'start', 'ul')).toBe(false);
    expect(setLineAnchor(line.id, 'end', 'center')).toBe(true);
    expect(clipOf(project()).attach).toMatchObject({
      end: { clipId: a.id, glyphs: [0], anchor: 'center' },
    });
  });

  it('frees both ends at once where they are drawn, as one undo step', () => {
    const { a, b, line } = withFormulas();
    offerLineEnd(
      { kind: 'move', clipId: line.id, side: 'end' },
      { clipId: a.id, glyphs: 'all' },
      null,
    );
    anchorPendingEnd('left');
    offerLineEnd(
      { kind: 'move', clipId: line.id, side: 'start' },
      { clipId: b.id, glyphs: [0] },
      null,
    );
    anchorPendingEnd('auto');
    expect(clipOf(project()).attach).toMatchObject({
      start: { clipId: b.id },
      end: { clipId: a.id },
    });
    const drawn = lineEndsAt('ce', lineOf(project()), clipOf(project()).initial);
    const steps = undoSteps();
    expect(freeLineEnds(line.id)).toBe(true);
    expect(undoSteps()).toBe(steps + 1);
    expect(clipOf(project()).attach).toBeNull();
    const free = lineEndsAt('ce', lineOf(project()), clipOf(project()).initial);
    expect(free.start[0]).toBeCloseTo(drawn.start[0], 5);
    expect(free.start[1]).toBeCloseTo(drawn.start[1], 5);
    expect(free.end[0]).toBeCloseTo(drawn.end[0], 5);
    expect(free.end[1]).toBeCloseTo(drawn.end[1], 5);
    // A line that hangs on nothing has nothing to free.
    expect(freeLineEnds(line.id)).toBe(false);
  });

  it('opens no compass for an end that cannot be moved now', () => {
    const { a, line } = withFormulas();
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    offerLineEnd(
      { kind: 'move', clipId: line.id, side: 'end' },
      { clipId: a.id, glyphs: 'all' },
      null,
    );
    expect(useLineDraw.getState().pending).toBeNull();
  });
});

describe('an end on symbols while the line is drawn (audit B6-04)', () => {
  const snapshot = (key: string, labels: string[]) => ({
    backend: 'mathjax' as const,
    key,
    glyphs: labels.map((label, i) => ({
      label,
      center: [i, 0] as [number, number],
      size: [0.5, 0.5] as [number, number],
    })),
  });
  /** `withFormulas`, its first formula rendered as "a+b=c" (snapshot `k1`). */
  function symbols() {
    const made = withFormulas();
    useProjectStore.getState().update((draft) => {
      const formula = draft.formulas.find((f) => f.id === made.a.formulaId)!;
      formula.snapshot = snapshot('k1', ['a', '+', 'b', '=', 'c']);
    });
    useNoticeStore.getState().clear();
    return made;
  }
  /** The formula rendered anew as `labels` (`key`), its old glyphs at `map` (null: gone), as the
   * render sync publishes it: the transition first, then the snapshot. No map: nothing tells
   * where the glyphs went. */
  function rerender(formulaId: string, key: string, labels: string[], map?: (number | null)[]) {
    if (map) useRenderStore.getState().setTransition(formulaId, { from: 'k1', to: key, map });
    useProjectStore.getState().update((draft) => {
      draft.formulas.find((f) => f.id === formulaId)!.snapshot = snapshot(key, labels);
    });
  }
  /** «Add line ▸ Line» started on the symbols `glyphs` of `a`, at the centre of their box. */
  function startOn(a: Clip, glyphs: number[]) {
    startLineDraw('line');
    offerLineEnd({ kind: 'draw' }, { clipId: a.id, glyphs }, null);
    anchorPendingEnd('center');
    expect(useLineDraw.getState().request!.start).toMatchObject({ glyphs });
  }
  const lines = () => project().formulas.filter((f) => f.kind === 'line').length;
  const notices = () => useNoticeStore.getState().notices.map((n) => `${n.title}: ${n.message}`);

  it('follows its glyph when the formula is rendered again before the end is put', () => {
    const { a } = symbols();
    startOn(a, [3]); // the "="
    // Edited to z+a+b=c: two glyphs come in before it, which is the sixth now.
    rerender(a.formulaId, 'k2', ['z', '+', 'a', '+', 'b', '=', 'c'], [2, 3, 4, 5, 6]);
    placeLineEnd({ point: [3, -3] });
    expect(useLineDraw.getState().request).toBeNull();
    expect(project().clips.at(-1)!.attach).toMatchObject({
      start: { clipId: a.id, glyphs: [5], anchor: 'center' },
    });
  });

  it('follows it at once while the app tracks the mode: the start the preview marks moves', () => {
    const { a } = symbols();
    const stop = startLineDrawTracking();
    try {
      startOn(a, [3]);
      rerender(a.formulaId, 'k2', ['z', '+', 'a', '+', 'b', '=', 'c'], [2, 3, 4, 5, 6]);
      expect(useLineDraw.getState().request!.start).toMatchObject({ clipId: a.id, glyphs: [5] });
      // Followed, the mode is still on, waiting for the end.
      expect(useLineDraw.getState().follow()).toBe(true);
      expect(useLineDraw.getState().request!.start).toMatchObject({ glyphs: [5] });
    } finally {
      stop();
    }
  });

  it('ends the mode with a notice when its glyphs are gone, and makes no line', () => {
    const { a } = symbols();
    startOn(a, [3]);
    rerender(a.formulaId, 'k2', ['a', '+', 'b', 'c'], [0, 1, 2, null, 3]);
    const before = lines();
    placeLineEnd({ point: [3, -3] });
    expect(lines()).toBe(before);
    expect(useLineDraw.getState().request).toBeNull();
    expect(notices()).toEqual([
      'No line made: The symbols of “fa” its start was on are no longer there. Start the line again.',
    ]);
  });

  it('ends it too when the formula changed with no glyph transition to follow', () => {
    const { a } = symbols();
    startOn(a, [3]);
    rerender(a.formulaId, 'k2', ['z', '=', 'c']);
    placeLineEnd({ point: [3, -3] });
    expect(useLineDraw.getState().request).toBeNull();
    expect(notices()).toEqual([
      'No line made: “fa” changed without a matching glyph transition. Start the line again.',
    ]);
  });

  it('follows the symbols the compass asks about too, and gives them up when they are gone', () => {
    const { a } = symbols();
    startLineDraw('line', { clipId: a.id, glyphs: [3] });
    rerender(a.formulaId, 'k2', ['z', '+', 'a', '+', 'b', '=', 'c'], [2, 3, 4, 5, 6]);
    expect(useLineDraw.getState().follow()).toBe(true);
    expect(useLineDraw.getState().pending!.target).toEqual({ clipId: a.id, glyphs: [5] });
    anchorPendingEnd('up');
    expect(useLineDraw.getState().request!.start).toMatchObject({ glyphs: [5], anchor: 'up' });
    // Asked again on glyphs of the second render, which a third one loses: the compass closes,
    // and the mode waits for another start.
    useLineDraw.getState().cancel();
    startLineDraw('line', { clipId: a.id, glyphs: [5] });
    useRenderStore.getState().setTransition(a.formulaId, {
      from: 'k2',
      to: 'k3',
      map: [0, 1, 2, 3, 4, null, 5],
    });
    useProjectStore.getState().update((draft) => {
      draft.formulas.find((f) => f.id === a.formulaId)!.snapshot = snapshot('k3', [
        'z',
        '+',
        'a',
        '+',
        'b',
        'c',
      ]);
    });
    expect(useLineDraw.getState().follow()).toBe(true);
    expect(useLineDraw.getState()).toMatchObject({ request: { start: null }, pending: null });
    expect(notices()).toEqual([
      'The end was not put: The symbols of “fa” are no longer there. Pick them again.',
    ]);
  });
});

describe('the point Manim is given for a free end', () => {
  it('is the gap further out along the line, so that the line drawn ends where it was put', () => {
    // The other end: a square of side 2 about the origin (its four corners, as a closed path).
    const corners = [1, 1, -1, 1, -1, -1, 1, -1, 1, 1];
    const points: number[] = [];
    for (let i = 0; i + 3 < corners.length; i += 2) {
      const [x0, y0, x1, y1] = corners.slice(i, i + 4) as [number, number, number, number];
      points.push(x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3);
      points.push(x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3, x1, y1);
    }
    const square = { paths: [{ degree: 3 as const, points: Float64Array.from(points) }] };
    for (const lib of ['ce', 'gl'] as const) {
      const given = pointForFreeEnd(lib, square, [5, 0.5], 0.25, 'end');
      // Further out than the click, by the gap, along the line that comes from the square.
      expect(Math.hypot(given[0] - 5, given[1] - 0.5)).toBeCloseTo(0.25, 5);
      expect(given[0]).toBeGreaterThan(5);
    }
    // With no gap, or with nothing to measure, the point is the click.
    expect(pointForFreeEnd('ce', square, [5, 0.5], 0, 'end')).toEqual([5, 0.5]);
    expect(pointForFreeEnd('ce', null, [5, 0.5], 0.25, 'start')).toEqual([5, 0.5]);
  });
});

describe('drawing a line between two points', () => {
  beforeEach(() => void scene());

  it('makes a free line object and its clip, on the front-most track with room, as one undo step', () => {
    const steps = undoSteps();
    const id = createLine('arrow', { point: [-1, -2] }, { point: [2, -2] })!;
    const p = project();
    const made = p.formulas.at(-1) as LineFormula;
    expect(made).toMatchObject({ kind: 'line', line: 'arrow', name: 'l2', vector: [3, 0] });
    expect(made.intro).toMatchObject({ kind: 'none' });
    const clip = p.clips.find((c) => c.id === id)!;
    // The first track is taken by the other line and the second by the box: the third has room.
    expect(clip).toMatchObject({ start: 2, attach: null, trackId: p.tracks[2]!.id });
    expect(p.tracks).toHaveLength(3);
    // Its ends are the two points.
    const ends = lineEndsAt('ce', made, clip.initial);
    expect(ends.start[0]).toBeCloseTo(-1, 6);
    expect(ends.end[0]).toBeCloseTo(2, 6);
    expect(ends.start[1]).toBeCloseTo(-2, 6);
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
    expect(undoSteps()).toBe(steps + 1);
  });

  it('refuses two ends at one place, and keeps the mode on for another try', () => {
    startLineDraw('line');
    placeLineEnd({ point: [1, 1] });
    expect(useLineDraw.getState().request).toEqual({ line: 'line', start: { point: [1, 1] } });
    const before = project();
    placeLineEnd({ point: [1, 1.01] });
    expect(project()).toBe(before);
    expect(useLineDraw.getState().request).not.toBeNull();
    placeLineEnd({ point: [3, 1] });
    expect(useLineDraw.getState().request).toBeNull();
    expect(project().formulas.filter((f) => f.kind === 'line')).toHaveLength(2);
  });
});

describe('moving an end of a line', () => {
  it('puts a free line between its other end and the new point', () => {
    const { line } = scene();
    const steps = undoSteps();
    expect(moveLineEnd(line.id, 'end', { point: [0, 3] })).toBe(true);
    const p = project();
    expect(lineOf(p).vector).toEqual([0, 3]);
    const ends = lineEndsAt('ce', lineOf(p), clipOf(p).initial);
    expect(ends.start[0]).toBeCloseTo(0, 6);
    expect(ends.start[1]).toBeCloseTo(0, 6);
    expect(ends.end[1]).toBeCloseTo(3, 6);
    expect(clipOf(p).attach).toBeNull();
    expect(undoSteps()).toBe(steps + 1);
    // Onto its other end: refused.
    expect(moveLineEnd(line.id, 'end', { point: [0, 0.001] })).toBe(false);
  });

  it('stays while the track is locked, or once a Transform has moved the line', () => {
    const { line } = scene();
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    const before = project();
    expect(moveLineEnd(line.id, 'end', { point: [0, 3] })).toBe(false);
    expect(project()).toBe(before);
  });

  it('gives a line object that has other clips an object of its own', () => {
    const { line } = scene();
    const copy = { ...structuredClone(project().clips[1]!), id: 'copy' };
    useProjectStore.getState().update((draft) => {
      draft.clips.push({ ...copy, trackId: draft.tracks[2]!.id });
    });
    expect(moveLineEnd('copy', 'start', { point: [0, -2] })).toBe(true);
    const p = project();
    const lines = p.formulas.filter((f) => f.kind === 'line') as LineFormula[];
    expect(lines.map((f) => f.name)).toEqual(['l1', 'l2']);
    expect(lines[0]!.vector).toEqual([2, 0]);
    expect(p.clips.find((c) => c.id === 'copy')!.formulaId).toBe(lines[1]!.id);
    expect(p.clips.find((c) => c.id === line.id)!.formulaId).toBe(lines[0]!.id);
  });
});

describe('a line with an end on glyphs', () => {
  it('frees an end where it is drawn, and hangs on nothing once both are free', () => {
    const { host, line } = scene();
    // (An end on a box is refused by validation; the settle places it all the same.)
    const attached: Project = {
      ...project(),
      clips: project().clips.map((clip) =>
        clip.id === line.id
          ? {
              ...clip,
              attach: createEndsAttach({ clipId: host.id, glyphs: 'all' }, { point: [3, -1] }, 0),
            }
          : clip,
      ),
    };
    const local = refreshLocalRenders(attached, new Map());
    loadProject(settleScene(local.project, local.formulas, refreshLocalRenders).project);
    const fitted = lineEndsAt('ce', lineOf(project()), clipOf(project()).initial);
    expect(fitted.start[0]).toBeLessThan(-1.5);
    expect(freeLineEnd(line.id, 'start')).toBe(true);
    const p = project();
    expect(clipOf(p).attach).toBeNull();
    const free = lineEndsAt('ce', lineOf(p), clipOf(p).initial);
    expect(free.start[0]).toBeCloseTo(fitted.start[0], 5);
    expect(free.start[1]).toBeCloseTo(fitted.start[1], 5);
    expect(free.end[0]).toBeCloseTo(3, 5);
  });

  it('takes Manim’s stroke and gap for its new kind when it still had the old kind’s', () => {
    const { host, line } = scene();
    useProjectStore.getState().update((draft) => {
      draft.clips[1]!.attach = createEndsAttach(
        { clipId: host.id, glyphs: 'all' },
        { point: [3, -1] },
        0,
      );
    });
    setLineKind(lineOf(project()).id, 'arrow');
    expect(lineOf(project())).toMatchObject({ line: 'arrow', strokeWidth: 6 });
    expect(project().clips.find((c) => c.id === line.id)!.attach).toMatchObject({ buff: 0.25 });
    // One the user set stays.
    useProjectStore.getState().update((draft) => {
      (draft.formulas[1] as LineFormula).strokeWidth = 3;
    });
    setLineKind(lineOf(project()).id, 'dashed');
    expect(lineOf(project())).toMatchObject({ line: 'dashed', strokeWidth: 3 });
    expect(project().clips.find((c) => c.id === line.id)!.attach).toMatchObject({ buff: 0 });
  });

  it('gives an arrow that grew with GrowArrow a Create when it becomes a line without a tip', () => {
    const { line } = scene();
    const own = () => project().clips.find((c) => c.id === line.id)!;
    setLineKind(lineOf(project()).id, 'arrow');
    useProjectStore.getState().update((draft) => {
      const clip = draft.clips.find((c) => c.id === line.id)!;
      clip.intro = { ...clip.intro, kind: 'grow_arrow', duration: 0.5 };
      clip.actions.push({ ...createAppear(clip.start + 1, 'grow_arrow', 'all'), id: 'grown' });
    });
    // Another arrow keeps it: a double arrow grows as an arrow does.
    setLineKind(lineOf(project()).id, 'double_arrow');
    expect(own().intro.kind).toBe('grow_arrow');
    expect(validateProject(project()).filter((issue) => issue.severity === 'error')).toEqual([]);
    // A line has no tip to grow: Manim's GrowArrow refuses it, and so does the project.
    setLineKind(lineOf(project()).id, 'line');
    expect(own().intro).toMatchObject({ kind: 'create', duration: 0.5 });
    expect(own().actions.find((action) => action.id === 'grown')).toMatchObject({ anim: 'create' });
    expect(validateProject(project()).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('gives the blocks of a line that becomes an arrow all of it, which a block of one takes (audit A5-07)', () => {
    const { line } = scene();
    const own = () => project().clips.find((c) => c.id === line.id)!;
    setLineKind(lineOf(project()).id, 'dashed');
    // Blocks on some of its dashes, as a dashed line takes them.
    useProjectStore.getState().update((draft) => {
      const clip = draft.clips.find((c) => c.id === line.id)!;
      clip.actions.push(
        { ...createDisappear(1, 'fade_out', [0, 2]), id: 'out' },
        { ...createEmphasis(3, 'flash', [1]), id: 'flash' },
      );
    });
    setLineKind(lineOf(project()).id, 'line');
    expect(own().actions.map((action) => 'glyphs' in action && action.glyphs)).toEqual([
      [0, 2],
      [1],
    ]);
    // An arrow: its shaft and its tip, never one without the other.
    setLineKind(lineOf(project()).id, 'arrow');
    expect(own().actions.map((action) => 'glyphs' in action && action.glyphs)).toEqual([
      'all',
      'all',
    ]);
  });
});

describe('the ends of a line in a Transform of it (D144)', () => {
  const tweens = () =>
    clipOf(project()).actions.filter((a): a is TweenAction => a.kind === 'tween');
  /** The scene's free line with a Transform over [3, 4) made as the menu makes it. */
  function withTransform() {
    const made = scene();
    const plan = planNewBlock(project(), made.line.id, { kind: 'tween' }, 3);
    if (!plan.ok) throw new Error(plan.reason);
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === made.line.id)!.actions.push(plan.action);
    });
    return made;
  }

  it('starts a new Transform with the ends the line has, which place it', () => {
    withTransform();
    const [tween] = tweens();
    expect(tween).toMatchObject({
      start: 3,
      to: { opacity: 1 },
      ends: { start: { point: [0, 0] }, end: { point: [2, 0] }, buff: 0, degrees: null },
    });
    expect(Object.keys(tween!.to)).toEqual(['opacity']);
    // A line that hangs on glyphs starts it on the same glyphs, at the same gap.
    const clip = clipOf(project());
    const held = createEndsAttach({ clipId: 'h', glyphs: [1] }, { point: [2, 0] }, 0.3);
    const ends = endsForNewTween(
      project(),
      { ...clip, actions: [], attach: held },
      lineOf(project()),
      3,
    );
    expect(ends).toMatchObject({
      start: { clipId: 'h', glyphs: [1], anchor: 'auto' },
      end: { point: [2, 0] },
      buff: 0.3,
    });
  });

  it('moves an end of the Transform in effect at the playhead, not of the clip’s start', () => {
    const { line } = withTransform();
    // Before the Transform the end moved is the clip's own.
    useUiStore.getState().setTime(2);
    expect(lineEndsHeld(clipOf(project()))).toEqual({ start: null, end: null, buff: null });
    // On it, and after it, the Transform's: the other end stays where it has it.
    useUiStore.getState().setTime(3.5);
    const steps = undoSteps();
    expect(moveLineEnd(line.id, 'end', { point: [3, 2] })).toBe(true);
    expect(undoSteps()).toBe(steps + 1);
    expect(tweens()[0]!.ends).toMatchObject({ start: { point: [0, 0] }, end: { point: [3, 2] } });
    expect(lineOf(project()).vector).toEqual([2, 0]);
    expect(clipOf(project()).initial.position).toEqual([1, 0]);
    expect(clipOf(project()).attach).toBeNull();
    expect(lineEndsHeld(clipOf(project()))).toMatchObject({ end: { point: [3, 2] } });
    // The same end, said by the Transform itself, wherever the playhead is.
    useUiStore.getState().setTime(1);
    editTweenEnds(line.id, tweens()[0]!.id, { point: { side: 'start', at: [-1, -1] } });
    expect(tweens()[0]!.ends).toMatchObject({ start: { point: [-1, -1] }, end: { point: [3, 2] } });
    expect(lineOf(project()).vector).toEqual([2, 0]);
    // Two ends at one place are refused there too.
    useUiStore.getState().setTime(5);
    expect(moveLineEnd(line.id, 'end', { point: [-1, -1] })).toBe(false);
  });

  it('gives a plain Transform the two ends when one is moved over it: they place the line then', () => {
    const { line } = scene();
    useProjectStore.getState().update((draft) => {
      const clip = draft.clips.find((c) => c.id === line.id)!;
      clip.actions.push({ ...createTween(3, 1, { position: [1, 2], opacity: 0.5 }), id: 'plain' });
    });
    useUiStore.getState().setTime(4.5);
    // The line was moved up by two: its end is dragged from there.
    expect(moveLineEnd(line.id, 'end', { point: [4, 2] })).toBe(true);
    const [tween] = tweens();
    expect(tween!.ends).toMatchObject({ start: { point: [0, 2] }, end: { point: [4, 2] } });
    expect(tween!.to).toEqual({ opacity: 0.5 });
  });

  it('frees the ends of a Transform where it draws them; a gap and degrees are its fields', () => {
    const { line } = withTransform();
    const id = tweens()[0]!.id;
    useProjectStore.getState().update((draft) => {
      const action = draft.clips.find((c) => c.id === line.id)!.actions[0]!;
      if (action.kind !== 'tween' || !action.ends) return;
      action.ends.drawn = { start: [0.5, 0.25], end: [2, 0], trim: 0, center: [1.25, 0.125] };
      action.ends.start = { clipId: 'elsewhere', glyphs: 'all', anchor: 'down' };
    });
    expect(lineEndsHeld(clipOf(project()), { tween: id }).start).toMatchObject({ anchor: 'down' });
    editTweenEnds(line.id, id, { buff: 0.4 });
    editTweenEnds(line.id, id, { degrees: 45 });
    expect(tweens()[0]!.ends).toMatchObject({ buff: 0.4, degrees: 45 });
    expect(freeLineEnd(line.id, 'start', { tween: id })).toBe(true);
    expect(tweens()[0]!.ends).toMatchObject({
      start: { point: [0.5, 0.25] },
      end: { point: [2, 0] },
    });
    // The clip's own ends were never on glyphs: nothing to free there.
    expect(freeLineEnds(line.id, 'clip')).toBe(false);
  });
});
