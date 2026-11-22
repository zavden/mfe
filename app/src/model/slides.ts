/* The Slides mode in the model (format 35, D200): where the scene animates and where it rests,
 * and whether a mark — a pause or a comment at an instant — stands where it may.
 *
 * The scene is cut in two kinds of stretch. An **animation span** is a time in which something
 * animates: an intro or an outro that is an animation, a block, a relation (`animationWindows`) or
 * a move of the scene's camera, and the union of those that overlap. A **pause zone** is the rest
 * of the scene, up to its end — the tail in which only sound plays too. A mark stands in a pause
 * zone, its edges included: just where an animation ends or starts is where a pause is wanted
 * most, and the instant between two animations that only touch is a zone of no length. These are
 * the waits of the exported Python (`export/codegen/timeline.ts`), read off the model and a little
 * wider than they: a block that changes nothing is a span here, though the code only waits there.
 * The other way round cannot be: a pause is never offered where the code plays.
 *
 * A mark keeps its instant when clips move, so an edit can leave one under an animation or past
 * the end of the scene. Such a mark is left out of every export and the project says so
 * (`slideMarkIssues`); the editor asks about it when the edit is made (`ui/slides/`). Pure. */
import { animationWindows, cameraMoveWindow, type AnimationOwner } from './camera';
import { sceneDuration, TIME_EPSILON, type Window } from './time';
import type { CameraMove, Project, SlideMark, SlideMarkId } from './types';

/** Whether the Slides mode is on: the project has the field, with marks or without. */
export function slidesOn(project: Pick<Project, 'slides'>): boolean {
  return project.slides !== undefined;
}

interface Layout {
  duration: number;
  spans: Window[];
  zones: Window[];
}

// A project is a value: an edit makes another object, so what was worked out of one stays true.
const layouts = new WeakMap<Project, Layout>();

function layoutOf(project: Project): Layout {
  let layout = layouts.get(project);
  if (!layout) {
    const duration = sceneDuration(project);
    const spans = mergedSpans(project, duration);
    layout = { duration, spans, zones: zonesBetween(spans, duration) };
    layouts.set(project, layout);
  }
  return layout;
}

/** Every window in which something animates, cut to the scene and merged where they overlap:
 * two that only touch stay two. */
function mergedSpans(project: Project, duration: number): Window[] {
  const windows = [
    ...animationWindows(project).map((animation) => animation.window),
    ...(project.camera?.moves ?? []).map(cameraMoveWindow),
  ]
    .map((window) => ({ start: Math.max(0, window.start), end: Math.min(duration, window.end) }))
    .filter((window) => window.end - window.start > TIME_EPSILON)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const spans: Window[] = [];
  for (const window of windows) {
    const last = spans[spans.length - 1];
    if (last && window.start < last.end - TIME_EPSILON) last.end = Math.max(last.end, window.end);
    else spans.push({ ...window });
  }
  return spans;
}

/** What `spans` leave of `[0, duration]`: a zone before the first, one between each two and one
 * after the last — one more than there are spans. A zone has no length where two spans touch, and
 * at the start or the end of a scene that begins or ends with one: an instant, and still a place
 * for a mark. */
function zonesBetween(spans: readonly Window[], duration: number): Window[] {
  const zones: Window[] = [];
  let cursor = 0;
  for (const span of spans) {
    zones.push({ start: cursor, end: Math.max(cursor, span.start) });
    cursor = span.end;
  }
  zones.push({ start: cursor, end: Math.max(cursor, duration) });
  return zones;
}

/** The stretches of the scene in which something animates, in order; no two overlap, and two
 * that touch are two. Shared with a cache: do not change them. */
export function animationSpans(project: Project): readonly Window[] {
  return layoutOf(project).spans;
}

/** The stretches of the scene in which nothing animates, in order, their edges included: where a
 * mark may stand. One of no length is an instant between two animations, or the start or the end
 * of a scene that begins or ends with one. Shared with a cache: do not change them. */
export function pauseZones(project: Project): readonly Window[] {
  return layoutOf(project).zones;
}

/** What the scene does at `t`: it animates, it rests (the edges of an animation rest), or `t` is
 * not a time of the scene. */
export type ZoneKind = 'pause' | 'animation' | 'outside';

export function zoneAt(project: Project, t: number): ZoneKind {
  const { duration, spans } = layoutOf(project);
  if (!(t >= -TIME_EPSILON && t <= duration + TIME_EPSILON)) return 'outside';
  return spans.some((span) => t > span.start + TIME_EPSILON && t < span.end - TIME_EPSILON)
    ? 'animation'
    : 'pause';
}

/** The pause zone `t` is in; null when the scene animates then, or has no such time. */
export function pauseZoneAt(project: Project, t: number): Window | null {
  if (zoneAt(project, t) !== 'pause') return null;
  return (
    pauseZones(project).find(
      (zone) => t >= zone.start - TIME_EPSILON && t <= zone.end + TIME_EPSILON,
    ) ?? null
  );
}

/** The time nearest to `t` at which a mark may stand: `t` itself where the scene rests, else the
 * nearer edge of the animation it falls in, or the end of the scene it is outside of. */
export function nearestPauseTime(project: Project, t: number): number {
  const { duration, spans } = layoutOf(project);
  if (!(t > 0)) return 0;
  if (t >= duration) return duration;
  const span = spans.find((s) => t > s.start + TIME_EPSILON && t < s.end - TIME_EPSILON);
  if (!span) return t;
  return t - span.start <= span.end - t ? span.start : span.end;
}

/** Whether a mark stands where it may (`standing`), under an animation (`busy`) or at no time of
 * the scene (`outside`). */
export type MarkStanding = 'standing' | 'busy' | 'outside';

export function markStanding(project: Project, mark: Pick<SlideMark, 'time'>): MarkStanding {
  const zone = zoneAt(project, mark.time);
  return zone === 'pause' ? 'standing' : zone === 'animation' ? 'busy' : 'outside';
}

/** What animates at an instant. */
export type InstantCover =
  { kind: 'animation'; owner: AnimationOwner } | { kind: 'camera'; move: CameraMove };

/** What animates at `t`, edges left out — what a mark there is under —: the animation that
 * started first (the order of `animationWindows` among those that start together), a move of the
 * camera when no animation does. Null where the scene rests. */
export function coverAt(project: Project, t: number): InstantCover | null {
  const inside = (window: Window) =>
    t > window.start + TIME_EPSILON && t < window.end - TIME_EPSILON;
  let first: { owner: AnimationOwner; start: number } | null = null;
  for (const animation of animationWindows(project)) {
    if (inside(animation.window) && (!first || animation.window.start < first.start)) {
      first = { owner: animation.owner, start: animation.window.start };
    }
  }
  if (first) return { kind: 'animation', owner: first.owner };
  const move = (project.camera?.moves ?? []).find((m) => inside(cameraMoveWindow(m)));
  return move ? { kind: 'camera', move } : null;
}

/** The marks of the project in the order of their instants; at one instant a comment comes
 * before a pause — it is read before the scene stops —, and then the order of the ids, so that
 * the answer is the same whatever the order of the file. */
export function marksInOrder(project: Pick<Project, 'slides'>): SlideMark[] {
  return [...(project.slides?.marks ?? [])].sort(
    (a, b) =>
      a.time - b.time ||
      (a.kind === b.kind ? 0 : a.kind === 'comment' ? -1 : 1) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** A mark out of place, and why. */
export interface CoveredMark {
  mark: SlideMark;
  standing: Exclude<MarkStanding, 'standing'>;
}

/** The marks that do not stand where they may, in order, each with why: what an export leaves
 * out, and what the editor asks about after the edit that covered them. */
export function coveredMarks(project: Project): CoveredMark[] {
  return marksInOrder(project).flatMap((mark) => {
    const standing = markStanding(project, mark);
    return standing === 'standing' ? [] : [{ mark, standing }];
  });
}

/** The marks the change from `before` to `after` covered: they stood where they might before it,
 * and after it they are under an animation or past the end of the scene — the same mark by its
 * id, wherever the change left it. In order. A mark that was out of place already, or that
 * `before` did not have, is not one: the change did nothing to it. */
export function newlyCoveredMarks(before: Project, after: Project): CoveredMark[] {
  const covered = coveredMarks(after);
  if (covered.length === 0) return [];
  const stood = new Set(
    (before.slides?.marks ?? [])
      .filter((mark) => markStanding(before, mark) === 'standing')
      .map((mark) => mark.id),
  );
  return covered.filter(({ mark }) => stood.has(mark.id));
}

/** The marks an export carries: those that stand where they may, in order, a pause that shares
 * its instant with one before it left out (the scene stops there once). */
export function exportedMarks(project: Project): SlideMark[] {
  const marks: SlideMark[] = [];
  for (const mark of marksInOrder(project)) {
    if (markStanding(project, mark) !== 'standing') continue;
    const twice =
      mark.kind === 'pause' &&
      marks.some(
        (other) => other.kind === 'pause' && Math.abs(other.time - mark.time) <= TIME_EPSILON,
      );
    if (!twice) marks.push(mark);
  }
  return marks;
}

/** The stretch a pause that skips its wait jumps over when the scene goes on from it (format 36,
 * D202): from its instant to where the next animation starts — the end of the rest it stands in —,
 * or to the next pause of that rest when one comes first, where the scene stops again. Null for a
 * pause that keeps its wait, for a comment, for a mark out of place, where the animation starts at
 * the pause's own instant (nothing to skip), and in the rest after the last animation: nothing
 * follows it but the end of the scene, and its tail may be the scene's sound. */
export function skippedWait(project: Project, mark: SlideMark): Window | null {
  if (mark.kind !== 'pause' || mark.skipWait !== true) return null;
  if (markStanding(project, mark) !== 'standing') return null;
  const zones = pauseZones(project);
  const index = zones.findIndex(
    (zone) => mark.time >= zone.start - TIME_EPSILON && mark.time <= zone.end + TIME_EPSILON,
  );
  // The last zone is what follows the last animation: no animation starts at its end.
  if (index < 0 || index === zones.length - 1) return null;
  let end = zones[index]!.end;
  for (const other of exportedPauses(project)) {
    if (other.time > mark.time + TIME_EPSILON && other.time < end) end = other.time;
  }
  return end - mark.time > TIME_EPSILON ? { start: mark.time, end } : null;
}

/** The pauses an export carries, in order: the stops of the exported page. */
export function exportedPauses(project: Project): SlideMark[] {
  return exportedMarks(project).filter((mark) => mark.kind === 'pause');
}

/** The stops of a scene `duration` long with pauses at `pauses`: each pause strictly inside the
 * scene, once, in order. A pause at 0 s or at the end is no stop of its own: the scene stands
 * there anyway. What the exported page stops at (`deck/`) and what the editor's rehearsal stops
 * at (`ui/transport/mainPlayback.ts`): one function, so the rehearsal is the page's. */
export function stopsOf(duration: number, pauses: readonly number[]): number[] {
  const stops: number[] = [];
  for (const time of [...pauses].sort((a, b) => a - b)) {
    if (!(time > TIME_EPSILON && time < duration - TIME_EPSILON)) continue;
    if (stops.length > 0 && time - stops[stops.length - 1]! <= TIME_EPSILON) continue;
    stops.push(time);
  }
  return stops;
}

/** How a mark is named in a sentence: «The pause at 3.2 s», «The comment at 5 s». */
export function markName(mark: Pick<SlideMark, 'kind' | 'time'>): string {
  return `The ${mark.kind} at ${+mark.time.toFixed(3)} s`;
}

/** The project without the marks named. The mode stays on: it is turned off by its own command. */
export function withoutMarks(project: Project, ids: ReadonlySet<SlideMarkId>): Project {
  if (!project.slides || !project.slides.marks.some((mark) => ids.has(mark.id))) return project;
  return {
    ...project,
    slides: { ...project.slides, marks: project.slides.marks.filter((mark) => !ids.has(mark.id)) },
  };
}
