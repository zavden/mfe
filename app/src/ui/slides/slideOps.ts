/* The Slides mode in the editor (D200), pure: what its commands work out on a project before
 * `slideActions.ts` writes it as one undo step — turning the mode on and off, the time a mark is
 * put or moved at, adding one —, and what the timeline draws of it — the ruler by zone, the marks
 * and the words that name them. The model's half, where a mark may stand and what is said of one
 * that does not, is `model/slides.ts`. */
import {
  animationSpans,
  createSlides,
  markCoverName,
  marksInOrder,
  markStanding,
  nearestPauseTime,
  newId,
  pauseZoneAt,
  pauseZones,
  sceneDuration,
  skippedWait,
  slideMarkIssues,
  slidesOn,
  TIME_EPSILON,
  zoneAt,
  type Project,
  type SlideMark,
  type SlideMarkId,
  type SlideMarkKind,
  type Window,
} from '../../model';
import { snapToFrame } from '../time';

/** The project with the Slides mode on: a project that has the field, with no mark yet. */
export function turnSlidesOn(project: Project): Project {
  return slidesOn(project) ? project : { ...project, slides: createSlides() };
}

/** Why the Slides mode cannot be turned off, or null when it can: the owner's rule is that every
 * pause and comment is deleted first (as the multicamera's, D190). */
export function slidesOffBlocker(project: Pick<Project, 'slides'>): string | null {
  const marks = project.slides?.marks ?? [];
  if (marks.length === 0) return null;
  const pauses = marks.filter((mark) => mark.kind === 'pause').length;
  const comments = marks.length - pauses;
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const what = [
    ...(pauses > 0 ? [count(pauses, 'pause')] : []),
    ...(comments > 0 ? [count(comments, 'comment')] : []),
  ].join(' and ');
  return `Delete every pause and comment to turn Slides off (there ${
    marks.length === 1 ? 'is' : 'are'
  } ${what}).`;
}

/** The project with the Slides mode off: without the field. Unchanged while a mark holds it on
 * (`slidesOffBlocker`). */
export function turnSlidesOff(project: Project): Project {
  if (!slidesOn(project) || slidesOffBlocker(project) !== null) return project;
  const rest = { ...project };
  delete rest.slides;
  return rest;
}

// --- The ruler by zone ---------------------------------------------------------------------

/** A stretch of the ruler as the mode tints it: where a pause may stand (`pause`), or where
 * something animates (`busy`). A pause zone of no length — the instant between two animations
 * that touch, or the start or the end of a scene that begins or ends with one — is a `notch`. */
export interface RulerZone {
  kind: 'pause' | 'busy';
  start: number;
  end: number;
  notch: boolean;
}

/** The stretches of the ruler from 0 to the end of the scene, in order: the pause zones and the
 * animation spans between them, one after the other. Past the end of the scene there is none. */
export function rulerZones(project: Project): RulerZone[] {
  const zones = pauseZones(project);
  const spans = animationSpans(project);
  const out: RulerZone[] = [];
  zones.forEach((zone, i) => {
    out.push({
      kind: 'pause',
      start: zone.start,
      end: zone.end,
      notch: zone.end - zone.start <= TIME_EPSILON,
    });
    const span = spans[i];
    if (span) out.push({ kind: 'busy', start: span.start, end: span.end, notch: false });
  });
  return out;
}

// --- The marks and their words ---------------------------------------------------------------

/** A time as the mode's words say it: «3.20 s». */
export const markClock = (t: number): string => `${t.toFixed(2)} s`;

/** What a mark is and when: «Pause at 3.20 s», «Comment at 5.00 s». */
export function markTitle(mark: Pick<SlideMark, 'kind' | 'time'>): string {
  return `${mark.kind === 'pause' ? 'Pause' : 'Comment'} at ${markClock(mark.time)}`;
}

/** The words a mark carries — a comment's, a pause's note —, trimmed; null when it has none. */
export function markWords(mark: Pick<SlideMark, 'text'>): string | null {
  const words = (mark.text ?? '').trim();
  return words === '' ? null : words;
}

/** The name of a mark for a screen reader: what it is and when, whether it skips its wait
 * (`skip`, the words of `skipWords`), then its words on one line. */
export function markLabel(mark: SlideMark, skip: string | null = null): string {
  const title = skip === null ? markTitle(mark) : `${markTitle(mark)} (${skip})`;
  const words = markWords(mark);
  return words === null ? title : `${title}: ${words.replace(/\s+/g, ' ')}`;
}

/** What the project says of each of its marks (`slideMarkIssues`: out of place, a comment
 * without words, a second pause at an instant), by the mark's id, in the order it says them. */
export function markWarnings(project: Project): Map<SlideMarkId, string[]> {
  const marks = project.slides?.marks ?? [];
  const out = new Map<SlideMarkId, string[]>();
  for (const issue of slideMarkIssues(project)) {
    const mark = marks[issue.path[2] as number];
    if (!mark) continue;
    out.set(mark.id, [...(out.get(mark.id) ?? []), issue.message]);
  }
  return out;
}

/** Where each mark is drawn beside the others at its instant, in widths of a mark from it: 0 for
 * a mark alone, and side by side about the instant, in their order, for several. */
export function markSpread(project: Pick<Project, 'slides'>): Map<SlideMarkId, number> {
  const out = new Map<SlideMarkId, number>();
  const marks = marksInOrder(project);
  for (let i = 0; i < marks.length;) {
    let j = i + 1;
    while (j < marks.length && marks[j]!.time - marks[i]!.time <= TIME_EPSILON) j++;
    const count = j - i;
    for (let k = i; k < j; k++) out.set(marks[k]!.id, k - i - (count - 1) / 2);
    i = j;
  }
  return out;
}

// --- Where a mark is put ---------------------------------------------------------------------

/** The most characters the words of a mark take (a comment, a pause's note). */
export const MAX_MARK_WORDS = 2000;

/** What snaps a time of the ruler, when the timeline's Snap is on: the playhead, within
 * `threshold` seconds (the timeline's snapping distance at its zoom). */
export interface MarkSnap {
  playhead: number;
  threshold: number;
}

/** A place of the ruler, as its menu sees it: where a pause may stand, with the zone it is held
 * in; where something animates, with what; or past the end of the scene. */
export type RulerSpot =
  | { kind: 'pause'; time: number; zone: Window }
  | { kind: 'busy'; time: number; cover: string }
  | { kind: 'outside'; time: number };

/** The time `raw` of the ruler as a mark would be put there: on a frame, and with `snap` onto the
 * playhead or an edge of a pause zone when one is that near — the edges are kept exact, frames or
 * not —, then held inside the zone. The zone is the one under `raw`; or, where something animates
 * there, one that the snapping reached: an instant between two animations is a notch of the
 * ruler, which a click near enough puts a mark on. */
export function rulerSpot(
  project: Project,
  raw: number,
  fps: number,
  snap: MarkSnap | null,
): RulerSpot {
  const time = snappedTime(raw, fps, snap, pauseZones(project));
  const zone = pauseZoneAt(project, Math.max(0, raw)) ?? pauseZoneAt(project, time);
  if (zone) return { kind: 'pause', time: Math.min(Math.max(time, zone.start), zone.end), zone };
  if (zoneAt(project, time) === 'outside') return { kind: 'outside', time };
  return { kind: 'busy', time, cover: markCoverName(project, time) };
}

/** `raw` (0 or later) on a frame, or, with `snap`, on the playhead or an edge of `zones` when one
 * is within its reach — the nearest; an edge is kept exact, frame or not. */
function snappedTime(
  raw: number,
  fps: number,
  snap: MarkSnap | null,
  zones: readonly Window[],
): number {
  const t = Math.max(0, raw);
  let best: { at: number; edge: boolean } | null = null;
  if (snap) {
    const candidates = [
      { at: snap.playhead, edge: false },
      ...zones.flatMap((zone) => [
        { at: zone.start, edge: true },
        { at: zone.end, edge: true },
      ]),
    ];
    for (const candidate of candidates) {
      const distance = Math.abs(candidate.at - t);
      if (distance <= snap.threshold && (!best || distance < Math.abs(best.at - t))) {
        best = candidate;
      }
    }
  }
  if (!best) return snapToFrame(t, fps);
  return best.edge ? best.at : snapToFrame(best.at, fps);
}

/** Where `mark` goes for the time `raw` under the pointer, or a key's: on a frame, snapped as a
 * new mark is (`snap`), and held in the pause zone it stands in — a mark is moved within its zone,
 * between the animations around it. A mark out of place goes to the time nearest `raw` where one
 * may stand, in any zone. Null where a pause would fall on the frame of another pause: it stays
 * where it was. */
export function markMoveTime(
  project: Project,
  mark: SlideMark,
  raw: number,
  snap: MarkSnap | null,
): number | null {
  const fps = project.meta.fps;
  const zone = markStanding(project, mark) === 'standing' ? pauseZoneAt(project, mark.time) : null;
  const t = snappedTime(raw, fps, snap, zone ? [zone] : pauseZones(project));
  const time = zone
    ? Math.min(Math.max(t, zone.start), zone.end)
    : nearestPauseTime(project, Math.min(t, sceneDuration(project)));
  if (mark.kind === 'pause' && pauseOnFrame(project, time, mark.id)) return null;
  return time;
}

/** Where a key moves a mark (←/→: `direction` -1 or 1): a frame along, inside the pause zone it
 * stands in; a mark out of place to the edge of what covers it on that side — the end of the
 * animation it is under, or the end of the scene it is past. Or why it does not move: it is at
 * the edge of its zone, with what is next (`stop`); or a pause would fall on the frame of
 * another. */
export type MarkStep =
  | { kind: 'move'; time: number }
  | { kind: 'edge'; next: string }
  | { kind: 'pause'; other: SlideMark };

/** How far from a frame (in frames) a time still counts as on it: the float noise of a time
 * written in seconds. */
const FRAME_SLACK = 1e-4;

export function markStep(project: Project, mark: SlideMark, direction: 1 | -1): MarkStep {
  const fps = project.meta.fps;
  const duration = sceneDuration(project);
  let time: number;
  if (markStanding(project, mark) === 'standing') {
    const zone = pauseZoneAt(project, mark.time)!;
    // The next frame on that side: from a time off the frames (an edge), the nearest one.
    const frame = mark.time * fps;
    const next =
      direction > 0 ? Math.floor(frame + FRAME_SLACK) + 1 : Math.ceil(frame - FRAME_SLACK) - 1;
    time = Math.min(Math.max(snapToFrame(next / fps, fps), zone.start), zone.end);
    if (Math.abs(time - mark.time) <= TIME_EPSILON) {
      const beyond = mark.time + direction / (2 * fps);
      const what =
        beyond < 0
          ? 'the scene starts there'
          : beyond > duration
            ? 'the scene ends there'
            : `${markCoverName(project, beyond)} runs next`;
      return { kind: 'edge', next: what };
    }
  } else if (mark.time > duration) {
    if (direction > 0) return { kind: 'edge', next: 'the scene ends before it' };
    time = duration;
  } else {
    const span = animationSpans(project).find(
      (w) => mark.time > w.start + TIME_EPSILON && mark.time < w.end - TIME_EPSILON,
    );
    time = span ? (direction > 0 ? span.end : span.start) : mark.time;
  }
  const other = mark.kind === 'pause' ? pauseOnFrame(project, time, mark.id) : undefined;
  return other ? { kind: 'pause', other } : { kind: 'move', time };
}

/** The marks with `id` at `time`, in the order the app writes them. */
export function withMarkMoved(
  marks: readonly SlideMark[],
  id: SlideMarkId,
  time: number,
): SlideMark[] {
  return marksInOrder({
    slides: { marks: marks.map((mark) => (mark.id === id ? { ...mark, time } : mark)) },
  });
}

/** Whether two times fall on one frame of `fps`. */
export const sameFrame = (a: number, b: number, fps: number): boolean =>
  Math.round(a * fps) === Math.round(b * fps);

/** A pause of the project on the frame of `time`, other than `except`; undefined when there is
 * none. */
export function pauseOnFrame(
  project: Project,
  time: number,
  except?: SlideMarkId,
): SlideMark | undefined {
  const fps = project.meta.fps;
  return project.slides?.marks.find(
    (mark) => mark.kind === 'pause' && mark.id !== except && sameFrame(mark.time, time, fps),
  );
}

/** Why a mark of `kind` cannot be put at `time`, or null when it can: a pause already on that
 * frame (a second one is not added: the scene stops there once), an animation that runs then, or
 * a time past the end of the scene. */
export type AddRefusal =
  | { kind: 'twice'; existing: SlideMark }
  | { kind: 'busy'; cover: string }
  | { kind: 'outside'; end: number }
  | { kind: 'off' };

export function addRefusal(project: Project, kind: SlideMarkKind, time: number): AddRefusal | null {
  if (!slidesOn(project)) return { kind: 'off' };
  const zone = zoneAt(project, time);
  if (zone === 'outside') return { kind: 'outside', end: sceneDuration(project) };
  if (zone === 'animation') return { kind: 'busy', cover: markCoverName(project, time) };
  const existing = kind === 'pause' ? pauseOnFrame(project, time) : undefined;
  return existing ? { kind: 'twice', existing } : null;
}

/** The words for a mark that cannot be put at `time`: the title and the message of a notice. */
export function refusalNotice(
  kind: SlideMarkKind,
  time: number,
  refusal: AddRefusal,
): { title: string; message: string } {
  const what = kind === 'pause' ? 'pause' : 'comment';
  switch (refusal.kind) {
    case 'twice':
      return {
        title: `A pause is at ${markClock(refusal.existing.time)} already`,
        message: 'The scene stops there once: the pause that is there has the focus.',
      };
    case 'busy':
      return {
        title: `No ${what} at ${markClock(time)}`,
        message: `${capitalize(refusal.cover)} runs then: a ${what} stands where nothing animates.`,
      };
    case 'outside':
      return {
        title: `No ${what} at ${markClock(time)}`,
        message: `The scene ends at ${markClock(refusal.end)}.`,
      };
    case 'off':
      return { title: `No ${what}`, message: 'Turn the Slides mode on first (View ▸ Slides).' };
  }
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A new mark: a pause or a comment at `time`, with its words when it has some. */
export function createMark(kind: SlideMarkKind, time: number, text?: string): SlideMark {
  const words = (text ?? '').trim();
  return { id: newId('p'), time, kind, ...(words ? { text: words } : {}) };
}

/** The marks of the project with `mark` among them, in the order the app writes them
 * (`marksInOrder`). */
export function withMarkAdded(marks: readonly SlideMark[], mark: SlideMark): SlideMark[] {
  return marksInOrder({ slides: { marks: [...marks, mark] } });
}

/** The rests of the scene between two animations: the pause zones that have an animation before
 * them and another after — one of no length where the two touch. Not the start of the scene, where
 * nothing has happened yet, nor what follows its last animation, where it only ends. */
export function restsBetweenAnimations(project: Project): Window[] {
  return pauseZones(project).slice(1, -1);
}

/** The pauses that «Add a pause after every animation» adds: one where each animation ends and
 * another follows — the start of the rest between them, kept exact as an edge of the ruler is —,
 * but in a rest that holds a pause already, anywhere in it, and on a frame that has one (two
 * animations shorter than a frame). In order, for a long scene whose owner then deletes the ones
 * not wanted. */
export function pausesAfterAnimations(project: Project): SlideMark[] {
  const fps = project.meta.fps;
  const pauses = (project.slides?.marks ?? []).filter((mark) => mark.kind === 'pause');
  const added: SlideMark[] = [];
  for (const rest of restsBetweenAnimations(project)) {
    const taken = [...pauses, ...added].some(
      (mark) =>
        (mark.time >= rest.start - TIME_EPSILON && mark.time <= rest.end + TIME_EPSILON) ||
        sameFrame(mark.time, rest.start, fps),
    );
    if (!taken) added.push(createMark('pause', rest.start));
  }
  return added;
}

/** The marks with the words of `id` set to `text`, trimmed: a pause given none loses its note.
 * A comment is not given none (`commentWordsIssue`). */
export function withMarkWords(
  marks: readonly SlideMark[],
  id: SlideMarkId,
  text: string,
): SlideMark[] {
  const words = text.trim();
  return marks.map((mark) => {
    if (mark.id !== id) return mark;
    const rest = { ...mark };
    delete rest.text;
    return words ? { ...rest, text: words } : rest;
  });
}

/** What the words of a mark are called in its menu and its dialog: a comment's, or a pause's note
 * — «Add a note…» while it has none. */
export function wordsEntry(mark: Pick<SlideMark, 'kind' | 'text'>): string {
  if (mark.kind === 'comment') return 'Edit comment…';
  return markWords(mark) === null ? 'Add a note…' : 'Edit note…';
}

// --- A pause that skips its wait (D202) -------------------------------------------------------

/** The wait `mark` skips, or would skip with the flag on: `skippedWait` of it as a pause that
 * skips (format 36). Null for a comment and for a pause with nothing to skip — where an animation
 * starts at its own instant, in the rest after the last animation, or out of place. */
export function waitToSkip(project: Project, mark: SlideMark): Window | null {
  return mark.kind === 'pause' ? skippedWait(project, { ...mark, skipWait: true }) : null;
}

/** Why a pause has no wait to skip, in a sentence of the menu; null when it has one (or for a
 * comment). It names the case of `skippedWait` that gives nothing. */
export function noWaitReason(project: Project, mark: SlideMark): string | null {
  if (mark.kind !== 'pause' || waitToSkip(project, mark) !== null) return null;
  if (markStanding(project, mark) !== 'standing') {
    return 'The exports leave this pause out: it is not where the scene rests.';
  }
  const last = pauseZones(project).at(-1);
  const zone = pauseZoneAt(project, mark.time);
  if (zone && last && Math.abs(zone.start - last.start) <= TIME_EPSILON) {
    return 'No animation follows this pause: the scene only ends after it.';
  }
  return 'An animation starts at this instant: there is no wait after it to skip.';
}

/** The words that say a pause skips its wait, and how long: «skips its wait: 0.50 s»; with the
 * flag on and nothing to skip, «skips its wait: none here». Null for a pause that keeps it. */
export function skipWords(project: Project, mark: SlideMark): string | null {
  if (mark.kind !== 'pause' || mark.skipWait !== true) return null;
  const skipped = skippedWait(project, mark);
  return `skips its wait: ${skipped ? markClock(skipped.end - skipped.start) : 'none here'}`;
}

/** The marks with the pause `id` skipping its wait (`on`) or keeping it: the field goes when it
 * is kept, never written false. */
export function withSkipWait(
  marks: readonly SlideMark[],
  id: SlideMarkId,
  on: boolean,
): SlideMark[] {
  return marks.map((mark) => (mark.id === id ? skipWaitSet(mark, on) : mark));
}

function skipWaitSet(mark: SlideMark, on: boolean): SlideMark {
  const rest = { ...mark };
  delete rest.skipWait;
  return on ? { ...rest, skipWait: true } : rest;
}

/** What «Skip the wait at every pause» does: the pauses it sets (those with a wait to skip that
 * keep it now), and how many pauses have no wait to skip — left as they are. */
export interface EverySkip {
  set: SlideMark[];
  none: number;
}

export function skipEveryWait(project: Project): EverySkip {
  const pauses = (project.slides?.marks ?? []).filter((mark) => mark.kind === 'pause');
  const set: SlideMark[] = [];
  let none = 0;
  for (const mark of pauses) {
    if (waitToSkip(project, mark) === null) none++;
    else if (mark.skipWait !== true) set.push(mark);
  }
  return { set, none };
}

/** The pauses «Keep the wait at every pause» clears: every one that skips its wait, with
 * something to skip or not. */
export function keepEveryWait(project: Pick<Project, 'slides'>): SlideMark[] {
  return (project.slides?.marks ?? []).filter(
    (mark) => mark.kind === 'pause' && mark.skipWait === true,
  );
}

/** The marks with every pause in `ids` skipping its wait (`on`) or keeping it. */
export function withSkipWaits(
  marks: readonly SlideMark[],
  ids: ReadonlySet<SlideMarkId>,
  on: boolean,
): SlideMark[] {
  return marks.map((mark) => (ids.has(mark.id) ? skipWaitSet(mark, on) : mark));
}

/** The marks without their pauses: what «Delete every pause» leaves — the comments. */
export function withoutPauses(marks: readonly SlideMark[]): SlideMark[] {
  return marks.filter((mark) => mark.kind !== 'pause');
}

/** Why the words given for a comment cannot be kept, or null: a comment says something. */
export function commentWordsIssue(text: string): string | null {
  return text.trim() === ''
    ? 'A comment needs words: what is to be done here. Cancel leaves it unwritten.'
    : null;
}
