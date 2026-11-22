/* Where a relation's window may sit. The drag of its band on the timeline and the Offset and
 * Duration fields of the relation panel go through here, so they agree.
 *
 * The window stays inside its range (`windowRange`: after the source's intro and the target's
 * start, before the source's end and the target's outro), between the moves of the camera around
 * it (`cameraGap`: nothing else animates while the camera moves), is at least MIN_WINDOW long, and never
 * gives the project a validation error it does not have: a block of either clip animating a glyph
 * of the pairs while the window runs, the ownership of the transfers in time (a copy before the
 * consumption of its source, one owner per target, a source still arriving), as validation's own
 * sections say (`timingIssues`), including attachments measuring either clip's glyphs. An edit
 * that would add an error stops at the last position that is fine,
 * preferring the boundary it ran into (a block's edge, another window's start) when one is within
 * reach, so that the window lands exactly there. Pure. */
import {
  addedTimingError,
  cameraGap,
  cameraMoveEdges,
  glyphTransfers,
  relationWindow,
  TIME_EPSILON,
  timingIssues,
  timingLifetimes,
  timingMeasurementTimes,
  type ClipId,
  type Project,
  type Relation,
  type RelationId,
} from '../../model';
import { round6 } from '../time';
import { MIN_WINDOW, windowRange, type WindowSpec } from './relationOps';

/** Which part of a window an edit moves: the whole window, its start edge or its end edge. */
export type WindowEdit = 'move' | 'start' | 'end';

/** Absolute seconds of a window's edges. */
interface Edges {
  start: number;
  end: number;
}

/** Where an edit of the window of `relationId` lands, as the relation stores it (offset from the
 * target clip's start, duration). `wanted` gives the edges the user asked for, in absolute seconds
 * (`move` uses its start and keeps the duration; `start` and `end` move that edge only). Null when
 * the relation or its clips are missing, or the clips leave no room for a window. */
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
  const between = windowRange(from, to);
  if (!between) return null;
  const current = relationWindow(relation, to);
  // Nor does it pass a move of the camera, during which nothing else animates (D190).
  const camera = cameraGap(project, current);
  const range = {
    start: Math.max(between.start, camera.start),
    end: Math.min(between.end, camera.end),
  };
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

  // The window must not give the project an error it does not have. Between the current edges
  // and the wanted ones, keep to the last position that adds none: by bisection, then settled
  // on the nearest boundary of what the window runs into when that boundary is fine too.
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
 * the window meets a boundary it may have run into — the edges of the busy spans of both clips'
 * glyphs (blocks, intros, outros, the other windows), their measurement instants, and the ends of
 * the other transfers — or an edge of a camera move,
 * farthest first. */
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
  // The edges of the camera's moves, during which no window runs (the locked region, D190).
  for (const time of cameraMoveEdges(project)) times.add(time);
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
