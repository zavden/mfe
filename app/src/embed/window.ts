/* Where the window of a relation may sit, and the loop the relation editor previews it over, for
 * the widgets of the web documentation (`MFEPlayer.engine.relations`): the range the two clips
 * leave for the window, the clamp every edit of it goes through (the drag of its band on the
 * timeline and the Offset and Duration fields agree on it), and the span, the framed instants and
 * the band of the editor's own preview. The player cannot import `ui/`, so these are copies of
 * the editor's functions — `ui/relations/relationOps.ts` (`MIN_WINDOW`, `windowRange`),
 * `ui/relations/windowRange.ts` (`clampWindow`), `ui/relations/relationPreview.ts` and
 * `ui/time.ts` (`round6`) —, which `__tests__/window.test.ts` holds to the originals. Pure. */
import {
  addedTimingError,
  glyphTransfers,
  introWindow,
  outroWindow,
  relationWindow,
  TIME_EPSILON,
  timingIssues,
  timingLifetimes,
  timingMeasurementTimes,
  type Clip,
  type ClipId,
  type Project,
  type Relation,
  type RelationId,
  type Window,
} from '../model';

/** Removes float noise from values written by arithmetic (µs resolution for times). */
export const round6 = (x: number): number => Math.round(x * 1e6) / 1e6 + 0; // never -0

/** A relation window is never shorter than this (seconds). */
export const MIN_WINDOW = 0.05;

/** Where a window between `from` and `to` may lie — after the source's intro and the target's
 * start, before the source's end and the target's outro —, or null when the clips leave no room. */
export function windowRange(from: Clip, to: Clip): Window | null {
  const start = Math.max(introWindow(from).end, to.start);
  const end = Math.min(from.end, outroWindow(to).start);
  return end - start >= MIN_WINDOW - TIME_EPSILON ? { start, end } : null;
}

/** A relation's window as it stores it: from the target clip's start, and how long. */
export interface WindowSpec {
  offset: number;
  duration: number;
}

/** Which part of a window an edit moves: the whole window, its start edge or its end edge. */
export type WindowEdit = 'move' | 'start' | 'end';

/** Absolute seconds of a window's edges. */
export interface Edges {
  start: number;
  end: number;
}

/** Where an edit of the window of `relationId` lands, as the relation stores it. `wanted` gives the
 * edges asked for, in absolute seconds (`move` uses its start and keeps the duration; `start` and
 * `end` move that edge only). The window stays inside its range, is at least MIN_WINDOW long, and
 * never gives the project a validation error it does not have: an edit that would stops at the
 * last position that is fine, on the boundary it ran into when one is within reach. Null when the
 * relation or its clips are missing, or the clips leave no room for a window. */
export function clampWindow(
  project: Project,
  relationId: RelationId,
  wanted: Edges,
  edit: WindowEdit,
): WindowSpec | null {
  const relation = project.relations.find((r) => r.id === relationId);
  const from = project.clips.find((c) => c.id === relation?.fromClipId);
  const to = project.clips.find((c) => c.id === relation?.toClipId);
  if (!relation || !from || !to) return null;
  const range = windowRange(from, to);
  if (!range) return null;
  const current = relationWindow(relation, to);
  const duration = current.end - current.start;
  let target: Edges;
  if (edit === 'move') {
    const start = clamp(wanted.start, range.start, range.end - duration);
    target = { start, end: start + duration };
  } else if (edit === 'start') {
    const start = clamp(wanted.start, range.start, current.end - MIN_WINDOW);
    target = { start, end: current.end };
  } else {
    const end = clamp(wanted.end, current.start + MIN_WINDOW, range.end);
    target = { start: current.start, end };
  }
  target = { start: round6(target.start), end: round6(target.end) };
  if (same(target, current)) return spec(relation, to, current);

  const clipIds = [from.id, to.id];
  const before = timingIssues(project, clipIds);
  const ok = (edges: Edges) => {
    const candidate = withWindow(project, relation, to, edges);
    return addedTimingError(timingIssues(candidate, clipIds), before) === null;
  };
  const at = (f: number): Edges => ({
    start: current.start + (target.start - current.start) * f,
    end: current.end + (target.end - current.end) * f,
  });
  if (ok(target)) return spec(relation, to, target);
  let good = 0;
  let bad = 1;
  for (let i = 0; i < 12; i++) {
    const f = (good + bad) / 2;
    if (ok(at(f))) good = f;
    else bad = f;
  }
  for (const f of boundaryFractions(
    project,
    relation,
    from.id,
    to.id,
    current,
    target,
    good,
    bad,
  )) {
    if (ok(at(f))) {
      good = f;
      break;
    }
  }
  const settled = at(good);
  return spec(relation, to, { start: round6(settled.start), end: round6(settled.end) });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

const same = (a: Edges, b: Edges) =>
  Math.abs(a.start - b.start) < 1e-9 && Math.abs(a.end - b.end) < 1e-9;

function spec(relation: Relation, to: { start: number }, edges: Edges): WindowSpec {
  const offset = round6(edges.start - to.start);
  const duration = round6(edges.end - edges.start);
  return Math.abs(offset - relation.offset) < 1e-9 && Math.abs(duration - relation.duration) < 1e-9
    ? { offset: relation.offset, duration: relation.duration }
    : { offset, duration };
}

/** The project with the relation's window at `edges`. */
function withWindow(project: Project, relation: Relation, to: { start: number }, edges: Edges) {
  const next: Relation = {
    ...relation,
    offset: round6(edges.start - to.start),
    duration: round6(edges.end - edges.start),
  };
  return { ...project, relations: project.relations.map((r) => (r.id === relation.id ? next : r)) };
}

/** The fractions of the way from `current` to `target`, within (good, bad], at which an edge of
 * the window meets a boundary it may have run into, farthest first. */
function boundaryFractions(
  project: Project,
  relation: Relation,
  fromId: ClipId,
  toId: ClipId,
  current: Edges,
  target: Edges,
  good: number,
  bad: number,
): number[] {
  const times = timingMeasurementTimes(project, [fromId, toId]);
  const lifetimes = timingLifetimes(project, [fromId, toId]);
  for (const id of [fromId, toId]) {
    for (const spans of lifetimes.get(id)?.busy.values() ?? []) {
      for (const span of spans) times.add(span.start).add(span.end);
    }
  }
  for (const transfer of glyphTransfers(project)) {
    if (transfer.origin.kind === 'relation' && transfer.origin.relationId === relation.id) continue;
    times.add(transfer.start).add(transfer.end);
  }
  const fractions = new Set<number>();
  for (const time of times) {
    for (const edge of ['start', 'end'] as const) {
      const span = target[edge] - current[edge];
      if (Math.abs(span) < TIME_EPSILON) continue;
      const f = (time - current[edge]) / span;
      const tolerance = (2 * TIME_EPSILON) / Math.abs(span);
      if (f >= good - tolerance && f <= bad + tolerance && f >= 0 && f <= 1) fractions.add(f);
    }
  }
  return [...fractions].sort((a, b) => b - a);
}

// ---- The relation editor's preview loop (ui/relations/relationPreview.ts) ----

/** Seconds shown before and after the transformation, so that the loop shows the source standing
 * and the target settled. */
export const WINDOW_PAD = 0.5;

/** A stretch of scene seconds. */
export interface TimeSpan {
  start: number;
  end: number;
}

type Lifetime = Pick<Clip, 'start' | 'end'>;

// To the microsecond, so that the bar's bounds read as the times they are.
const round = (t: number) => Math.round(t * 1e6) / 1e6;

/** The scene seconds a relation's transformation runs over: its window, counted from the start of
 * its target clip. */
export function windowSpan(to: Pick<Clip, 'start'>, relation: WindowSpec): TimeSpan {
  const start = round(to.start + relation.offset);
  return { start, end: round(start + relation.duration) };
}

/** The scene seconds the editor's preview loops over: the window padded by `pad`, within the time
 * either clip is on the scene; never empty. */
export function relationSpan(
  from: Lifetime,
  to: Lifetime,
  relation: WindowSpec,
  pad = WINDOW_PAD,
): TimeSpan {
  const window = windowSpan(to, relation);
  const start = round(Math.max(Math.min(from.start, to.start), window.start - pad));
  const end = round(Math.min(Math.max(from.end, to.end), window.end + pad));
  return { start, end: Math.max(end, round(start + 0.001)) };
}

/** How far through the transformation the scene time `time` is: 0 before its window, 1 after. */
export function windowProgress(time: number, window: TimeSpan): number {
  const length = window.end - window.start;
  if (length <= 0) return time >= window.start ? 1 : 0;
  return Math.min(1, Math.max(0, (time - window.start) / length));
}

/** The instants the preview's camera frames, in order: the ends of the span, and the window cut
 * in `steps` — a path that bulges away from both formulas is in the picture all the way. */
export function framedTimes(span: TimeSpan, window: TimeSpan, steps = 8): number[] {
  const times = [span.start, span.end];
  for (let i = 0; i <= steps; i += 1) {
    times.push(window.start + ((window.end - window.start) * i) / steps);
  }
  return [...new Set(times.map(round))].sort((a, b) => a - b);
}

/** Where the window lies on the bar of the span, as fractions from 0 to 1. */
export function windowBand(span: TimeSpan, window: TimeSpan): { from: number; to: number } {
  const length = span.end - span.start;
  const at = (t: number) => Math.min(1, Math.max(0, (t - span.start) / length));
  return { from: at(window.start), to: at(window.end) };
}
