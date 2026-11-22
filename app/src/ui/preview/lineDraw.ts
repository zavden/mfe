/* «Add line ▸» (D137, D140): drawing a line or an arrow in the preview, and moving its ends
 * afterwards. The entry starts the mode with the kind chosen. In a clip's menus the line starts on
 * that clip — on its picked symbols, when the menu opened on them —, and one click puts its end;
 * in the menu of the preview's empty space, two clicks put the start and the end. A click on a
 * formula or a text puts the end on the whole of it; with Alt held the preview picks symbols as
 * always, and the end goes on the ones picked; a click on empty space leaves the end free at that
 * point. Escape leaves the mode.
 *
 * An end on glyphs waits for its anchor (`pending`): a compass asks where on them it is — one of
 * the nine points of their box, or «Auto», the edge Manim finds towards the other end — and the
 * end is put once it is answered.
 *
 * Afterwards the selected line shows a handle at each end (`LineLayer.tsx`). Dragged, an end is
 * left free where it is dropped: it goes on nothing by itself. With Alt held it goes on the symbol
 * under the pointer, with Alt and Shift on the whole formula there, and the compass asks its
 * anchor. With Ctrl/⌘ held the end stays on the line's own axis (`alongLine`): the line is made
 * longer or shorter, in the direction it had.
 *
 * A free end is where the user puts it. Manim leaves the gap of a line (`buff`) at both of its
 * ends, a free one too, so the point the attachment holds for it is that much further out along
 * the line (`pointForFreeEnd`, scene/lines.ts): the line drawn ends where the pointer was.
 * `planLine` and the helpers above it are pure; the rest reads and writes the stores. */
import { create } from 'zustand';
import type { ResolvedFormulas } from '../../engine';
import {
  animatedWhole,
  createClip,
  createEndsAttach,
  defaultIntro,
  defaultOutro,
  isGlyphEnd,
  KINDS,
  growsAsArrow,
  LINE_BUFFS,
  LINE_STROKE_WIDTHS,
  newId,
  nextFormulaName,
  remapIndices,
  sceneDuration,
  TIME_EPSILON,
  type ActionId,
  type Clip,
  type ClipId,
  type AttachTarget,
  type EndsAttach,
  type Formula,
  type LineAnchor,
  type LineEnd,
  type LineEndPoint,
  type LineFormula,
  type LineKind,
  type Project,
  type Target,
  type TweenAction,
  type TweenEnds,
  type Vec2,
} from '../../model';
import {
  exportEvaluator,
  foundLineEnds,
  keyframeAt,
  lineCentre,
  lineCurveBefore,
  lineEndInput,
  lineEndsAt,
  lineEndsInEffect,
  measuredCurve,
  pointForFreeEnd,
  type SceneEvaluator,
} from '../../scene';
import { history, useProjectStore, useRenderStore, useUiStore } from '../../store';
import {
  attachedWindowOver,
  newTrackBeside,
  type AttachmentCreationDefaults,
} from '../animations/attachmentCreation';
import { listNames } from '../animations/attachNames';
import { announce } from '../announcer';
import { getActivePalette } from '../colors/paletteStore';
import { createEditorFormula } from '../creator/newFormula';
import { LINE_LABELS } from '../creator/sources';
import { isMac, keysSpoken, keysText } from '../platform';
import { usePreferences } from '../preferences';
import { onDocumentReplaced } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { round6 } from '../time';
import { relook } from './lineCurve';
import { MIN_CLIP_LENGTH, nearestFreeTrack } from '../timeline/clipOps';
import { DROPPED_CLIP_LENGTH } from '../timeline/layout';
import { DIRECTION_LABELS, type Direction } from './glyphAlign';
import { pickedTargets } from './glyphActions';
import type { PickRevision } from './glyphPick';
import { pickRebase, pickRevision, useGlyphPick } from './glyphPickStore';
import { endPreviewModes, registerPreviewMode } from './previewModes';

/** The line being drawn: its kind, and its start once it is put. */
export interface LineDrawRequest {
  line: LineKind;
  start: LineEnd | null;
  /** The index space of the start's glyphs when it is on symbols (`pickRevision`): a new render
   * of their formula renumbers them, and the start follows them (`followedEnd`, B6-04). */
  startRevision?: PickRevision;
}

export type LineSide = 'start' | 'end';

/** Whose end waits for its anchor: the next one of the line being drawn, or the `side` end of
 * the line of `clipId`. */
export type EndOwner = { kind: 'draw' } | { kind: 'move'; clipId: ClipId; side: LineSide };

/** An end on glyphs that waits for its anchor: the compass is open for it (D140). */
export interface PendingEnd {
  owner: EndOwner;
  /** The glyphs the end goes on. */
  target: AttachTarget;
  /** The index space of the glyphs, when they are symbols, not the whole formula. */
  revision?: PickRevision;
  /** Where the compass opens, in CSS px from the preview frame's corner; null: by the glyphs. */
  at: { x: number; y: number } | null;
  /** The anchor the end has now, when it is asked again for the glyphs it is already on. */
  current: LineAnchor | null;
}

interface LineDrawState {
  request: LineDrawRequest | null;
  pending: PendingEnd | null;
  /** The glyphs under the pointer that an end would go on: the preview marks them. */
  aim: AttachTarget | null;
  start(line: LineKind): void;
  setStart(end: LineEnd, revision?: PickRevision): void;
  ask(pending: PendingEnd | null): void;
  setAim(aim: AttachTarget | null): void;
  /** Leave the mode, and whatever waited for an anchor. */
  cancel(): void;
  /** The start and the end waiting for its anchor on the symbols their formulas number now
   * (`followedEnd`). When the start's symbols are gone, or their formula changed with no glyph
   * transition, the mode ends, and an end waiting for its anchor is given up — a notice says
   * so —; when the clip or its document went, quietly. Whether the mode is still on. */
  follow(): boolean;
}

/** An end on symbols — glyphs of `end.clipId` taken in the index space `revision` — as their
 * formula numbers them now (`pickRebase`): the same end, the end on the glyphs a new render moved
 * them to (those of them that are left), or why it cannot be followed: its `owner` went (the
 * clip, its formula, the document), the formula changed with no glyph transition
 * (`unverified`), or none of its glyphs is left (`gone`). An end on the whole of a formula, or one
 * with no index space, is what it is. */
export function followedEnd<E extends AttachTarget>(
  end: E,
  revision: PickRevision | undefined,
): { end: E; revision?: PickRevision } | 'owner' | 'unverified' | 'gone' {
  if (end.glyphs === 'all' || !revision) return { end, revision };
  const rebase = pickRebase(end.clipId, revision);
  if (rebase.kind === 'same') return { end, revision };
  if (rebase.kind === 'lost') return rebase.unverified ? 'unverified' : 'owner';
  const kept = remapIndices(end.glyphs, rebase.map).kept.sort((a, b) => a - b);
  if (kept.length === 0) return 'gone';
  return { end: { ...end, glyphs: kept }, revision: rebase.revision };
}

/** The index space of an end's glyphs when they are symbols (`pickRevision`), else none. */
const revisionOf = (target: AttachTarget): PickRevision | undefined =>
  target.glyphs === 'all' ? undefined : (pickRevision(target.clipId) ?? undefined);

/** What a notice says of the symbols of `end` that the line tool cannot follow; `whose` names
 * what was on them ("its start"). */
function lostSymbols(end: AttachTarget, why: 'unverified' | 'gone', whose?: string): string {
  const name = formulaOfClip(useProjectStore.getState().project, end.clipId)?.name ?? '?';
  return why === 'gone'
    ? `The symbols of “${name}”${whose ? ` ${whose} was on` : ''} are no longer there.`
    : `“${name}” changed without a matching glyph transition.`;
}

const sameTarget = (a: AttachTarget | null, b: AttachTarget | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.clipId === b.clipId &&
    (a.glyphs === 'all' || b.glyphs === 'all'
      ? a.glyphs === b.glyphs
      : a.glyphs.length === b.glyphs.length && a.glyphs.every((g, i) => g === b.glyphs[i])));

export const useLineDraw = create<LineDrawState>()((set, get) => ({
  request: null,
  pending: null,
  aim: null,
  start: (line) => {
    endPreviewModes('line');
    set({ request: { line, start: null }, pending: null, aim: null });
  },
  setStart: (end, revision) =>
    set((state) =>
      state.request
        ? {
            request: {
              line: state.request.line,
              start: end,
              ...(revision && isGlyphEnd(end) && end.glyphs !== 'all'
                ? { startRevision: revision }
                : {}),
            },
          }
        : state,
    ),
  ask: (pending) => set({ pending }),
  setAim: (aim) => set((state) => (sameTarget(state.aim, aim) ? state : { aim })),
  cancel: () => set({ request: null, pending: null, aim: null }),
  follow: () => {
    const { request, pending } = get();
    let next: Partial<Pick<LineDrawState, 'request' | 'pending'>> = {};
    if (request?.start && isGlyphEnd(request.start)) {
      const start = followedEnd(request.start, request.startRevision);
      if (typeof start === 'string') {
        set({ request: null, pending: null, aim: null });
        if (start !== 'owner') {
          notify({
            kind: 'warning',
            title: 'No line made',
            message: `${lostSymbols(request.start, start, 'its start')} Start the line again.`,
          });
        }
        return false;
      }
      if (start.end !== request.start) {
        next = { request: { ...request, start: start.end, startRevision: start.revision } };
      }
    }
    if (pending) {
      const target = followedEnd(pending.target, pending.revision);
      if (typeof target === 'string') {
        next = { ...next, pending: null };
        if (target !== 'owner') {
          notify({
            kind: 'warning',
            title: 'The end was not put',
            message: `${lostSymbols(pending.target, target)} Pick them again.`,
          });
        }
      } else if (target.end !== pending.target) {
        next = { ...next, pending: { ...pending, target: target.end, revision: target.revision } };
      }
    }
    if (next.request || 'pending' in next) set(next);
    return get().request !== null || get().pending !== null;
  },
}));

registerPreviewMode(
  'line',
  () => {
    const { request, pending } = useLineDraw.getState();
    if (request || pending) useLineDraw.getState().cancel();
  },
  () => {
    const { request, pending } = useLineDraw.getState();
    return request !== null || pending !== null;
  },
);

/** The anchor a direction of the compass names, and back (null for `auto`). */
export const anchorOf = (direction: Direction): LineAnchor => direction.toLowerCase() as LineAnchor;
export const directionOf = (anchor: LineAnchor): Direction | null =>
  anchor === 'auto' ? null : (anchor.toUpperCase() as Direction);

/** What an anchor is called: «Auto», or the compass's name for the point. */
export function anchorLabel(anchor: LineAnchor): string {
  const direction = directionOf(anchor);
  return direction ? DIRECTION_LABELS[direction] : 'Auto';
}

/** What «Auto» does, for a tooltip. */
export const AUTO_ANCHOR_HINT =
  'Auto: the edge Manim finds towards the line’s other end — Line(a, b)';

/** Two ends closer than this are one place: there is no line to draw between them. */
export const MIN_LINE_LENGTH = 0.02;

/** Why a new line is refused when its two ends are at one place. */
const AT_ONE_PLACE = 'The two ends are at one place: click somewhere else for the end.';

/** Say that an end stays because the two ends would be at one place; false, for the caller to
 * return. */
function stayAtOnePlace(): false {
  notify({ kind: 'info', title: 'The end stays', message: 'The two ends would be at one place.' });
  return false;
}

/** Whether a line between `ends`, with an end on glyphs, has its two ends at one place at the
 * instant `t` they are measured at: Manim finds no line between them — both on one formula with
 * the anchor Auto, where there is no direction to look for an edge in (`foundLineEnds`) —, or the
 * two points it finds are as close as two free ends at one place. False when an end cannot be
 * measured now: the sync places the line once it can. */
function endsAtOnePlace(
  evaluator: Pick<SceneEvaluator, 'points'>,
  lib: Target,
  ends: { start: LineEnd; end: LineEnd },
  t: number,
): boolean {
  const found = foundLineEnds(evaluator, lib, ends, t);
  if (found === undefined) return false;
  return (
    found === null ||
    Math.hypot(found.end[0] - found.start[0], found.end[1] - found.start[1]) < MIN_LINE_LENGTH
  );
}

const formulaOfClip = (project: Pick<Project, 'clips' | 'formulas'>, clipId: ClipId) => {
  const clip = project.clips.find((c) => c.id === clipId);
  return clip && project.formulas.find((f) => f.id === clip.formulaId);
};

/** Whether the end of a line can go on the object of `clipId`: a formula or a text — not what is
 * itself fitted to others (a brace, a shape, another line). */
export function takesLineEnd(
  project: Pick<Project, 'clips' | 'formulas'>,
  clipId: ClipId,
): boolean {
  const formula = formulaOfClip(project, clipId);
  return formula !== undefined && KINDS[formula.kind].fitted === null;
}

/** A place for an end before its anchor is known: glyphs of a clip, or a point of the scene. */
export type EndPlace = AttachTarget | LineEndPoint;

/** What a click at `point` means for an end: the whole object under it when an end can go on it
 * (`hit`, never the line's own clip), else that point of the scene. */
export function endAt(
  project: Pick<Project, 'clips' | 'formulas'>,
  hit: ClipId | null,
  point: Vec2,
  own?: ClipId,
): EndPlace {
  return hit !== null && hit !== own && takesLineEnd(project, hit)
    ? { clipId: hit, glyphs: 'all' }
    : freePoint(point);
}

/** `to` brought onto the line from `fixed` through `end`, on the side of `end` and no nearer to
 * `fixed` than the shortest line there is: where an end dragged with Ctrl/⌘ held goes (D142) —
 * the line grows or shrinks, and keeps its direction. `to` itself when the two are at one place:
 * there is no direction to keep. */
export function alongLine(fixed: Vec2, end: Vec2, to: Vec2): Vec2 {
  const dx = end[0] - fixed[0];
  const dy = end[1] - fixed[1];
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return to;
  const along = Math.max(
    MIN_LINE_LENGTH,
    ((to[0] - fixed[0]) * dx + (to[1] - fixed[1]) * dy) / length,
  );
  return [fixed[0] + (along * dx) / length, fixed[1] + (along * dy) / length];
}

/** A free end at `point`. */
export const freePoint = (point: Vec2): LineEndPoint => ({
  point: [round6(point[0]), round6(point[1])],
});

export type LinePlan =
  | { ok: true; formula: Formula; clip: Clip; beside: string | null; name: string }
  | { ok: false; reason: string };

/** The line of `line` from `start` to `end` at the playhead `time`: its object, named after its
 * kind, with no intro — it is there when its clip starts —, and its clip. With an end on glyphs
 * the clip hangs by its ends at Manim's gap for the kind and runs where its hosts are on screen
 * together from the playhead on, to go on a track in front of the front-most of them (`beside`).
 * With two free ends it is a free object between the two points, from the playhead to the end of
 * the scene. Refused, saying why, between two ends at one place (`endsAtOnePlace`: two points, or
 * two ends on glyphs Manim finds no line between), on a host that is gone, or when the two hosts
 * are never on screen together. */
export function planLine(
  project: Project,
  formulas: ResolvedFormulas,
  line: LineKind,
  start: LineEnd,
  end: LineEnd,
  time: number,
  defaults: AttachmentCreationDefaults,
): LinePlan {
  const lib = project.meta.target;
  const intro = defaultIntro('none');
  const fresh = (fields: Partial<LineFormula>) =>
    createEditorFormula(
      'line',
      project.formulas,
      defaults.standardScale,
      { line, intro, ...fields } as Partial<LineFormula>,
      defaults.colors,
    ) as LineFormula;
  if (!isGlyphEnd(start) && !isGlyphEnd(end)) {
    const vector: Vec2 = [end.point[0] - start.point[0], end.point[1] - start.point[1]];
    if (Math.hypot(...vector) < MIN_LINE_LENGTH) return { ok: false, reason: AT_ONE_PLACE };
    const formula = fresh({ vector: [round6(vector[0]), round6(vector[1])] });
    const from = round6(Math.max(time, 0));
    const to = round6(Math.max(sceneDuration(project), from + DROPPED_CLIP_LENGTH));
    const clip = createClip(formula.id, project.tracks[0]?.id ?? '', from, to, {
      intro,
      outro: defaultOutro('none'),
    });
    const [x, y] = lineCentre(lib, formula, start.point, formula.vector);
    clip.initial.position = [round6(x), round6(y)];
    return { ok: true, formula, clip, beside: null, name: 'two points' };
  }
  const hosts: Clip[] = [];
  for (const side of [start, end]) {
    if (!isGlyphEnd(side)) continue;
    const host = project.clips.find((c) => c.id === side.clipId);
    if (!host) return { ok: false, reason: 'A clip the line was to end on no longer exists.' };
    hosts.push(host);
  }
  const window = attachedWindowOver(hosts, time);
  if (window.end - window.start < MIN_CLIP_LENGTH - TIME_EPSILON) {
    return { ok: false, reason: 'The two clips are never on screen together.' };
  }
  // A free end: the point Manim is given for it, so that the line drawn ends where it was put.
  const buff = LINE_BUFFS[line];
  const evaluator = exportEvaluator(project, formulas);
  const settled = (side: 'start' | 'end'): LineEnd => {
    const own = side === 'start' ? start : end;
    if (isGlyphEnd(own)) return own;
    const other = lineEndInput(evaluator, lib, side === 'start' ? end : start, window.start);
    return { point: pointForFreeEnd(lib, other, own.point, buff, side) };
  };
  const ends = { start: settled('start'), end: settled('end') };
  if (endsAtOnePlace(evaluator, lib, ends, window.start))
    return { ok: false, reason: AT_ONE_PLACE };
  const formula = fresh({});
  const names = hosts.map(
    (host) => project.formulas.find((f) => f.id === host.formulaId)?.name ?? '?',
  );
  const rows = hosts.map((host) => project.tracks.findIndex((t) => t.id === host.trackId));
  const clip = createClip(formula.id, hosts[0]!.trackId, window.start, window.end, {
    intro,
    outro: defaultOutro('none'),
    attach: createEndsAttach(ends.start, ends.end, buff),
  });
  return {
    ok: true,
    formula,
    clip,
    beside: project.tracks[Math.min(...rows)]?.id ?? hosts[0]!.trackId,
    name: listNames([...new Set(names)]),
  };
}

/** Put a planned line into a draft: on a track in front of its hosts — the nearest with room
 * above the front-most of them, a new one right above it when none has (D137) —, or, for a line
 * between two points, on the front-most track with room, a new one in front of them all when
 * none has. */
export function applyLine(draft: Project, plan: Extract<LinePlan, { ok: true }>): void {
  const { clip, beside } = plan;
  let track;
  if (beside !== null) {
    track =
      nearestFreeTrack(draft, beside, clip.start, clip.end, 'above') ??
      newTrackBeside(draft, beside, 'above');
  } else {
    const first = draft.tracks[0];
    // The search runs below a track: ask it from above them all.
    const room = first && nearestFreeTrackFromTop(draft, clip.start, clip.end);
    track = room ?? newTrackBeside(draft, first?.id ?? '', 'above');
  }
  draft.formulas.push(plan.formula);
  draft.clips.push({ ...clip, trackId: track.id });
}

/** The front-most visual track that is not locked and has room over [start, end). */
function nearestFreeTrackFromTop(project: Project, start: number, end: number) {
  const scratch: Project = {
    ...project,
    tracks: [{ ...project.tracks[0]!, id: '\u0000top' }, ...project.tracks],
  };
  return nearestFreeTrack(scratch, '\u0000top', start, end, 'below');
}

const defaultsNow = (): AttachmentCreationDefaults => {
  const preferences = usePreferences.getState();
  return {
    introDuration: preferences.intro.duration,
    standardScale: preferences.standardScale,
    colors: getActivePalette()?.source.colors,
  };
};

/** Make the line of `line` from `start` to `end` at the playhead, as one undo step, and select
 * it. Refused, a notice says why. Returns its clip's id, or null. */
export function createLine(line: LineKind, start: LineEnd, end: LineEnd): ClipId | null {
  history.cancelForeignGesture();
  const state = useProjectStore.getState();
  const plan = planLine(
    state.project,
    useRenderStore.getState().resolved,
    line,
    start,
    end,
    useUiStore.getState().time,
    defaultsNow(),
  );
  if (!plan.ok) {
    notify({ kind: 'warning', title: 'No line made', message: plan.reason });
    return null;
  }
  state.update((draft) => applyLine(draft, plan));
  useUiStore.getState().select({ kind: 'clips', ids: [plan.clip.id] });
  announce(`${LINE_LABELS[line]} ${plan.formula.name} added between ${plan.name}`);
  return plan.clip.id;
}

/** What the preview's hint says while the mode is on: which end is asked for, and how it is
 * put; while the compass is open (`asking`: what the end goes on), that a point of it is to be
 * chosen. */
export function lineDrawHint(
  request: LineDrawRequest,
  startName: string,
  asking: string | null = null,
  mac: boolean = isMac(),
): string {
  const what = LINE_LABELS[request.line];
  const which = request.start === null ? 'starts' : 'ends';
  if (asking !== null) {
    return `${what}: choose where on ${asking} it ${which} — a corner, an edge, the centre or Auto · Esc: another place`;
  }
  // The keys as the system writes them: of these words, not of the names beside them.
  const how = keysText(
    'click a formula, or empty space for a free point; hold Alt to pick symbols',
    mac,
  );
  return request.start === null
    ? `${what}: where it starts — ${how} · Esc cancels`
    : `${what} from ${startName}: where it ends — ${how} · Esc cancels`;
}

/** What the hint calls an end that is put: the object it is on, or "a point". */
export function endName(project: Pick<Project, 'clips' | 'formulas'>, end: EndPlace): string {
  if ('point' in end) return 'a point';
  const name = formulaOfClip(project, end.clipId)?.name ?? '?';
  return end.glyphs === 'all' ? name : `symbols of ${name}`;
}

const copyTarget = (target: AttachTarget): AttachTarget => ({
  clipId: target.clipId,
  glyphs: target.glyphs === 'all' ? 'all' : [...target.glyphs],
});

/** Start drawing a line of `line`. From a clip's menu the line starts on `from` — the clip, or
 * the symbols picked on it —, when an end can go there: the compass asks where on it, and then
 * one click puts the end. Otherwise two clicks put the start and the end. The symbols picked
 * before are let go: the choice starts clean. */
export function startLineDraw(line: LineKind, from?: AttachTarget): void {
  const { project } = useProjectStore.getState();
  useGlyphPick.getState().clear();
  useLineDraw.getState().start(line);
  if (from && takesLineEnd(project, from.clipId)) {
    const revision = revisionOf(from);
    useLineDraw.getState().ask({
      owner: { kind: 'draw' },
      target: copyTarget(from),
      ...(revision ? { revision } : {}),
      at: null,
      current: null,
    });
    announce(
      `${LINE_LABELS[line]} from ${endName(project, from)}: choose where on it the line starts, then click where it ends; Escape cancels`,
    );
    return;
  }
  announce(
    `${LINE_LABELS[line]}: click where it starts, then where it ends; ${keysSpoken('hold Alt to pick symbols')}; Escape cancels`,
  );
}

/** An end is put at `place` — while drawing, or the end of a line dropped there —: a point is
 * taken as it is; glyphs wait for their anchor, and the compass opens at `at` (by the glyphs with
 * none). The end of a line that cannot be moved now is refused, a notice says why. */
export function offerLineEnd(
  owner: EndOwner,
  place: EndPlace,
  at: { x: number; y: number } | null,
): void {
  const state = useLineDraw.getState();
  if ('point' in place) {
    state.ask(null);
    if (owner.kind === 'draw') placeLineEnd(place);
    else moveLineEnd(owner.clipId, owner.side, place);
    return;
  }
  let current: LineAnchor | null = null;
  if (owner.kind === 'move') {
    const { project } = useProjectStore.getState();
    const locked = lineEndsLock(project, owner.clipId);
    if (locked) {
      notify({ kind: 'info', title: 'The end stays', message: locked });
      return;
    }
    const clip = project.clips.find((c) => c.id === owner.clipId);
    const now = clip ? lineEndsHeld(clip)[owner.side] : null;
    if (now && isGlyphEnd(now) && sameTarget(now, place)) current = now.anchor;
  }
  const revision = revisionOf(place);
  state.ask({ owner, target: copyTarget(place), ...(revision ? { revision } : {}), at, current });
}

/** The compass answered: the end that waited is put on its glyphs at `anchor` — those its
 * formula numbers now (`follow`). */
export function anchorPendingEnd(anchor: LineAnchor): void {
  useLineDraw.getState().follow();
  const { pending } = useLineDraw.getState();
  if (!pending) return;
  useLineDraw.getState().ask(null);
  const end: LineEnd = { ...copyTarget(pending.target), anchor };
  if (pending.owner.kind === 'draw') placeLineEnd(end, pending.revision);
  else moveLineEnd(pending.owner.clipId, pending.owner.side, end);
}

/** Ask again where on its glyphs the `side` end of the line of `clipId` is: the compass opens
 * at `at` with its anchor marked. Nothing for a free end. */
export function askLineAnchor(
  clipId: ClipId,
  side: LineSide,
  at: { x: number; y: number } | null,
): void {
  const clip = useProjectStore.getState().project.clips.find((c) => c.id === clipId);
  const end = clip ? lineEndsHeld(clip)[side] : null;
  if (end && isGlyphEnd(end)) offerLineEnd({ kind: 'move', clipId, side }, end, at);
}

/** Put the `side` end of the line of `clipId` at another point of the glyphs it is on. Whether
 * it changed. */
export function setLineAnchor(
  clipId: ClipId,
  side: LineSide,
  anchor: LineAnchor,
  scope: EndsScope = 'playhead',
): boolean {
  const clip = useProjectStore.getState().project.clips.find((c) => c.id === clipId);
  const end = clip ? lineEndsHeld(clip, scope)[side] : null;
  if (!end || !isGlyphEnd(end) || end.anchor === anchor) return false;
  return moveLineEnd(clipId, side, { ...copyTarget(end), anchor }, false, scope);
}

/** An end of the line being drawn is put: the start — with the index space of its glyphs when it
 * is on symbols (`revision`), so that it follows them until the line is made —, and then the end,
 * which makes the line from the start as its formula numbers it then and leaves the mode (it stays
 * on when the line is refused, for another try, and ends when the start's symbols are gone). */
export function placeLineEnd(end: LineEnd, revision?: PickRevision): void {
  const { request } = useLineDraw.getState();
  if (!request) return;
  if (request.start === null) {
    useLineDraw.getState().setStart(end, revision);
    return;
  }
  if (!useLineDraw.getState().follow()) return;
  const start = useLineDraw.getState().request?.start;
  if (!start) return;
  if (createLine(request.line, start, end) !== null) useLineDraw.getState().cancel();
}

/** The symbols just picked with Alt, as a place for an end: those of the first object picked
 * that an end can go on; the pick is let go. Null with nothing picked. */
export function endFromPick(own?: ClipId): AttachTarget | null {
  const { project } = useProjectStore.getState();
  const target = (pickedTargets() ?? []).find(
    (t) => t.clipId !== own && takesLineEnd(project, t.clipId),
  );
  if (!target) return null;
  useGlyphPick.getState().clear();
  return copyTarget(target);
}

/** Where the two ends of the line of `clip` are at `time` — the ones the tween in effect then
 * carries it to, once one has (`lineEndsInEffect`) —, or null when it is not a line with a
 * render. */
export function lineEndsNow(
  project: Project,
  formulas: ResolvedFormulas,
  clip: Clip,
  time: number,
): { start: Vec2; end: Vec2 } | null {
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  if (formula?.kind !== 'line' || !formulas.get(formula.id)) return null;
  return lineEndsInEffect(project.meta.target, formula, clip, time);
}

/** Why the ends of the line of `clipId` cannot be moved now, or null: its track is locked. (With
 * the playhead on a Transform of the line, or after it, its ends are that Transform's: D144.) */
export function lineEndsLock(project: Project, clipId: ClipId): string | null {
  const clip = project.clips.find((c) => c.id === clipId);
  const track = clip && project.tracks.find((t) => t.id === clip.trackId);
  if (!clip || !track) return 'That line no longer exists.';
  return track.locked
    ? `Track “${track.name}” is locked: unlock it on the timeline to move the line.`
    : null;
}

/** Whose ends are meant: the ones in effect at the playhead (the tween there, once one of the
 * line's Transforms has started; else its clip's), the clip's own, whatever the playhead says, or
 * a given tween's. */
export type EndsScope = 'playhead' | 'clip' | { tween: ActionId };

/** The tween of `clip` whose ends `scope` means, or null for the clip's own. */
function scopedTween(clip: Clip, scope: EndsScope): TweenAction | null {
  if (scope === 'clip') return null;
  let id: ActionId | null;
  if (scope === 'playhead') {
    const { ref } = keyframeAt(clip, useUiStore.getState().time);
    id = ref.kind === 'action' ? ref.actionId : null;
  } else id = scope.tween;
  const action = id === null ? undefined : clip.actions.find((a) => a.id === id);
  return action?.kind === 'tween' ? action : null;
}

/** The two ends of the line of `clip` as what `scope` means holds them: on glyphs, at a point, or
 * null — a free line's own, a plain Transform's — where nothing says. */
export function lineEndsHeld(
  clip: Clip,
  scope: EndsScope = 'playhead',
): { start: LineEnd | null; end: LineEnd | null; buff: number | null } {
  const tween = scopedTween(clip, scope);
  if (tween) {
    return tween.ends
      ? { start: tween.ends.start, end: tween.ends.end, buff: tween.ends.buff }
      : { start: null, end: null, buff: null };
  }
  const attach = clip.attach?.rule === 'ends' ? clip.attach : null;
  return { start: attach?.start ?? null, end: attach?.end ?? null, buff: attach?.buff ?? null };
}

/** Move the `side` end of the line of `clip` in its tween `tween` (D144): the tween then carries
 * the line there. The other end stays as that tween has it — on its glyphs, or where the line is
 * drawn then (not the point the tween holds for it, which is the gap further out: it is given that
 * point again below, once) —; a plain Transform takes the two ends from where the line is. A free
 * end beside one on glyphs is the point Manim is to be given for the line drawn to end where
 * asked. */
function moveTweenEnd(
  clip: Clip,
  formula: LineFormula,
  tween: TweenAction,
  side: LineSide,
  to: LineEnd,
  freeOther: boolean,
): boolean {
  const state = useProjectStore.getState();
  const { project } = state;
  const lib = project.meta.target;
  const at = clip.start + tween.start;
  // Where the line is once this tween has ended: what it carries it to, or moves it to.
  const drawn = tweenDrawn(lib, formula, clip, tween);
  const held = tween.ends ?? null;
  const other = side === 'start' ? 'end' : 'start';
  // The end that stays: on its glyphs as the tween has them — unless it is freed too —, else
  // where it is drawn, as for the clip's own ends (`moveLineEnd`): at its own point beside another
  // free end (two free ends have no gap), where the tween draws it beside one on glyphs, where the
  // line is for a plain tween.
  const keeps = (ends: TweenEnds): boolean =>
    isGlyphEnd(ends[other]) ? !freeOther : !isGlyphEnd(ends[side]);
  const kept: LineEnd = held && keeps(held) ? held[other] : { point: drawn[other] };
  const ends = { [side]: to, [other]: kept } as { start: LineEnd; end: LineEnd };
  const attached = clip.attach?.rule === 'ends' ? clip.attach.buff : LINE_BUFFS[formula.line];
  const buff = held?.buff ?? attached;
  if (!isGlyphEnd(ends.start) && !isGlyphEnd(ends.end)) {
    const [a, b] = [ends.start.point, ends.end.point];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_LINE_LENGTH) return stayAtOnePlace();
  }
  const degrees = held?.degrees ?? null;
  const curve = measuredCurve({ curve: lineCurveBefore(formula, clip, tween.id) }, { degrees });
  const evaluator = exportEvaluator(project, useRenderStore.getState().resolved);
  const settle = (which: 'start' | 'end'): LineEnd => {
    const own = ends[which];
    const across = ends[which === 'start' ? 'end' : 'start'];
    if (isGlyphEnd(own)) return own;
    if (!isGlyphEnd(across)) return freePoint(own.point);
    const input = lineEndInput(evaluator, lib, across, at);
    return { point: pointForFreeEnd(lib, input, own.point, buff, which, curve) };
  };
  const next = { start: settle('start'), end: settle('end') };
  if (endsAtOnePlace(evaluator, lib, next, at)) return stayAtOnePlace();
  state.update((draft) => {
    const action = draft.clips
      .find((c) => c.id === clip.id)
      ?.actions.find((a) => a.id === tween.id);
    if (action?.kind !== 'tween') return;
    action.ends = { ...next, buff, degrees, drawn: action.ends?.drawn ?? null };
    // The ends place the line: the tween no longer says where it is.
    for (const field of ['position', 'scale', 'rotation', 'flipX', 'flipY'] as const) {
      delete action.to[field];
    }
  });
  return true;
}

/** Move the `side` end of the line of `clipId` to `to` — glyphs to hang on, or the point where the
 * line drawn is to end —, as one undo step. The other end stays as it is: on its glyphs, or where
 * it is drawn. With both ends free the line has no attachment, and is where its clip puts it. A
 * line object with other clips gets an object of its own first: its vector is this clip's alone.
 * Refused, a notice says why. Whether it moved. */
export function moveLineEnd(
  clipId: ClipId,
  side: LineSide,
  to: LineEnd,
  /** Leave the other end free too, where it is drawn («Detach all»). */
  freeOther = false,
  /** Whose end: at the playhead, the Transform in effect there once one has started (D144). */
  scope: EndsScope = 'playhead',
): boolean {
  history.cancelForeignGesture();
  const state = useProjectStore.getState();
  const { project } = state;
  const formulas = useRenderStore.getState().resolved;
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
  if (!clip || formula?.kind !== 'line') return false;
  const locked = lineEndsLock(project, clipId);
  if (locked) {
    notify({ kind: 'info', title: 'The end stays', message: locked });
    return false;
  }
  const where = (): string =>
    isGlyphEnd(to)
      ? `${endName(project, to)}, ${anchorLabel(to.anchor).toLowerCase()}`
      : endName(project, to);
  const tween = scopedTween(clip, scope);
  if (tween) {
    if (!moveTweenEnd(clip, formula, tween, side, to, freeOther)) return false;
    announce(
      freeOther
        ? `Both ends of ${formula.name} are free in its Transform`
        : `${side === 'start' ? 'Start' : 'End'} of ${formula.name} moved to ${where()} in its Transform`,
    );
    return true;
  }
  const lib = project.meta.target;
  const drawn = lineEndsAt(lib, formula, clip.initial);
  const attach = clip.attach?.rule === 'ends' ? clip.attach : null;
  const other = side === 'start' ? 'end' : 'start';
  // The end that stays: on its glyphs, or where it is drawn now.
  const kept: LineEnd =
    attach && isGlyphEnd(attach[other]) && !freeOther ? attach[other] : { point: drawn[other] };
  const ends = { [side]: to, [other]: kept } as { start: LineEnd; end: LineEnd };
  const free = !isGlyphEnd(ends.start) && !isGlyphEnd(ends.end);
  let vector: Vec2 | null = null;
  let position: Vec2 | null = null;
  let next: EndsAttach | null = null;
  if (free) {
    const a = (ends.start as { point: Vec2 }).point;
    const b = (ends.end as { point: Vec2 }).point;
    vector = [round6(b[0] - a[0]), round6(b[1] - a[1])];
    if (Math.hypot(...vector) < MIN_LINE_LENGTH) return stayAtOnePlace();
    const [x, y] = lineCentre(lib, formula, a, vector);
    position = [round6(x), round6(y)];
  } else {
    const buff = attach?.buff ?? LINE_BUFFS[formula.line];
    const evaluator = exportEvaluator(project, formulas);
    const settle = (which: 'start' | 'end'): LineEnd => {
      const own = ends[which];
      if (isGlyphEnd(own)) return own;
      const across = lineEndInput(
        evaluator,
        lib,
        ends[which === 'start' ? 'end' : 'start'],
        clip.start,
      );
      return { point: pointForFreeEnd(lib, across, own.point, buff, which, formula.curve) };
    };
    next = createEndsAttach(settle('start'), settle('end'), buff);
    if (endsAtOnePlace(evaluator, lib, next, clip.start)) return stayAtOnePlace();
  }
  const shared = project.clips.some((c) => c.id !== clip.id && c.formulaId === formula.id);
  state.update((draft) => {
    const target = draft.clips.find((c) => c.id === clipId);
    let object = draft.formulas.find((f) => f.id === formula.id);
    if (!target || object?.kind !== 'line') return;
    if (shared) {
      const own: LineFormula = {
        ...structuredClone(formula),
        id: newId('f'),
        name: nextFormulaName('line', draft.formulas),
      };
      draft.formulas.push(own);
      target.formulaId = own.id;
      object = draft.formulas[draft.formulas.length - 1] as LineFormula;
    }
    target.attach = next;
    if (vector && position && object.kind === 'line') {
      object.vector = vector;
      target.initial.position = position;
      target.initial.rotation = 0;
      target.initial.scale = 1;
      target.initial.flipX = false;
      target.initial.flipY = false;
    }
  });
  announce(
    freeOther
      ? `Both ends of ${formula.name} are free`
      : `${side === 'start' ? 'Start' : 'End'} of ${formula.name} moved to ${where()}`,
  );
  return true;
}

/** Where the two ends of the line of `clip` are drawn once its tween `tween` has carried it: where
 * the tween draws it (`TweenEnds.drawn`), or, for a plain one or one never measured, where the line
 * is when it ends. */
function tweenDrawn(
  lib: Target,
  formula: LineFormula,
  clip: Clip,
  tween: TweenAction,
): { start: Vec2; end: Vec2 } {
  return (
    tween.ends?.drawn ??
    lineEndsInEffect(lib, formula, clip, clip.start + tween.start + tween.duration)
  );
}

/** Where the two ends of the line are drawn for what `scope` means: at the start of its clip, or
 * once the tween meant has carried it. */
function drawnFor(project: Project, clip: Clip, formula: LineFormula, scope: EndsScope) {
  const lib = project.meta.target;
  const tween = scopedTween(clip, scope);
  return tween ? tweenDrawn(lib, formula, clip, tween) : lineEndsAt(lib, formula, clip.initial);
}

/** Free the `side` end of the line of `clipId` where it is drawn. */
export function freeLineEnd(
  clipId: ClipId,
  side: LineSide,
  scope: EndsScope = 'playhead',
): boolean {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
  if (!clip || formula?.kind !== 'line') return false;
  const drawn = drawnFor(project, clip, formula, scope);
  return moveLineEnd(clipId, side, freePoint(drawn[side]), false, scope);
}

/** Free both ends of the line of `clipId` where they are drawn, as one undo step: the line hangs
 * on nothing, and is where its clip — or the Transform meant — puts it. */
export function freeLineEnds(clipId: ClipId, scope: EndsScope = 'playhead'): boolean {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
  if (!clip || formula?.kind !== 'line') return false;
  const held = lineEndsHeld(clip, scope);
  if (!(held.start && isGlyphEnd(held.start)) && !(held.end && isGlyphEnd(held.end))) return false;
  const drawn = drawnFor(project, clip, formula, scope);
  return moveLineEnd(clipId, 'start', freePoint(drawn.start), true, scope);
}

/** Set the gap, the degrees of the arc or the point of a free end of the ends a tween carries
 * its line to (the fields of its panel), as one undo step. */
export function editTweenEnds(
  clipId: ClipId,
  actionId: ActionId,
  change: { buff?: number; degrees?: number | null; point?: { side: LineSide; at: Vec2 } },
): void {
  if (change.point) {
    moveLineEnd(clipId, change.point.side, freePoint(change.point.at), false, { tween: actionId });
    return;
  }
  history.cancelForeignGesture();
  useProjectStore.getState().update((draft) => {
    const action = draft.clips.find((c) => c.id === clipId)?.actions.find((a) => a.id === actionId);
    if (action?.kind !== 'tween' || !action.ends) return;
    if (change.buff !== undefined) action.ends.buff = change.buff;
    if (change.degrees !== undefined) action.ends.degrees = change.degrees;
  });
}

/** The ends a new Transform of the line of `clip` starts with, at the instant `at` it starts:
 * the ones the line has then — on the same glyphs, at the same gap, or at the points it is drawn
 * between —, so that adding it changes nothing until an end is moved. */
export function endsForNewTween(
  project: Project,
  clip: Clip,
  formula: LineFormula,
  at: number,
): TweenEnds {
  const { ref } = keyframeAt(clip, at);
  const before = ref.kind === 'action' ? clip.actions.find((a) => a.id === ref.actionId) : null;
  const copy = (end: LineEnd): LineEnd =>
    isGlyphEnd(end) ? { ...copyTarget(end), anchor: end.anchor } : freePoint(end.point);
  const base = { degrees: null, drawn: null };
  if (before?.kind === 'tween' && before.ends) {
    const { start, end, buff } = before.ends;
    return { start: copy(start), end: copy(end), buff, ...base };
  }
  if (!before && clip.attach?.rule === 'ends') {
    const { start, end, buff } = clip.attach;
    return { start: copy(start), end: copy(end), buff, ...base };
  }
  const drawn = lineEndsInEffect(project.meta.target, formula, clip, at);
  return { start: freePoint(drawn.start), end: freePoint(drawn.end), buff: 0, ...base };
}

/** Change what a line object is drawn with — its stroke, an arrow's tip, a dashed line's dashes —
 * as one undo step (nothing when it is not a line). A clip of it that hangs on nothing keeps its
 * ends where they are (`relook`). */
export function editLine(
  formulaId: string,
  fields: Partial<Pick<LineFormula, 'strokeWidth' | 'tipLength' | 'dashLength'>>,
): void {
  history.cancelForeignGesture();
  useProjectStore.getState().update((draft) =>
    relook(draft, formulaId, (formula) => {
      Object.assign(formula, fields);
    }),
  );
}

/** Make a line object another of the four, as one undo step (the field «Kind» of its panel and
 * «Become ›» in its menu, D148). What it still had of Manim's defaults for the kind it was — its
 * stroke width, and the gap its clips leave at the glyphs their ends are on — becomes Manim's for
 * the new kind: a line turned into an arrow is 6 wide and stops short of what it points at, as an
 * `Arrow` does. An arrow that came in with `GrowArrow` and is left without a tip is drawn in with
 * `Create` instead: Manim's `GrowArrow` refuses a line that has no tip. A line that becomes an
 * arrow gives its blocks all of it, which a block of an arrow takes (`animatedWhole`). */
export function setLineKind(formulaId: string, line: LineKind): void {
  history.cancelForeignGesture();
  useProjectStore.getState().update((draft) =>
    relook(draft, formulaId, (formula) => {
      if (formula.line === line) return;
      const was = formula.line;
      if (formula.strokeWidth === LINE_STROKE_WIDTHS[was])
        formula.strokeWidth = LINE_STROKE_WIDTHS[line];
      formula.line = line;
      const grows = growsAsArrow(formula);
      const whole = animatedWhole(formula);
      for (const clip of draft.clips) {
        if (clip.formulaId !== formulaId) continue;
        if (clip.attach?.rule === 'ends' && clip.attach.buff === LINE_BUFFS[was])
          clip.attach.buff = LINE_BUFFS[line];
        // A block takes an arrow whole (audit A5-07): one that named some glyphs of the line it
        // was — a dashed line's dashes — takes all of the arrow it is now.
        for (const action of clip.actions) {
          const named = action.kind === 'appear' || action.kind === 'disappear';
          if (whole && (named || action.kind === 'emphasis')) action.glyphs = 'all';
        }
        if (grows) continue;
        if (clip.intro.kind === 'grow_arrow') clip.intro.kind = 'create';
        for (const action of clip.actions)
          if (action.kind === 'appear' && action.anim === 'grow_arrow') action.anim = 'create';
      }
    }),
  );
}

/** Keep the ends of the mode on their symbols as the project and the renders change (`follow`),
 * and leave the mode with its document: the next one is another scene. One of the sessions that
 * end with the document (`ui/project/sessionTracking.ts`). Returns the function that stops it. */
export function startLineDrawTracking(): () => void {
  const follow = () => {
    const { request, pending } = useLineDraw.getState();
    if (request || pending) useLineDraw.getState().follow();
  };
  const stops = [
    useProjectStore.subscribe(follow),
    useRenderStore.subscribe(follow),
    onDocumentReplaced(() => useLineDraw.getState().cancel()),
  ];
  return () => stops.forEach((stop) => stop());
}
