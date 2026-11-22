/* «To another formula or glyphs…» (D123): choosing, in the preview, what a Transform carries a
 * shape to surround (`TweenFit`). The entry — in the shape's menus — starts the mode; while it is
 * on the preview selects as always: a click takes a formula (Ctrl/⌘ adds more), Alt picks symbols
 * of one or more formulas. Enter, or the «Transform here» button, makes the Transform at the
 * playhead, to what is chosen then — the picked symbols when there are some, else the selected
 * objects whole —; Escape leaves the mode. «Pick again…», on a Transform that has a target,
 * starts it to choose another one for that Transform. `planRetarget` is pure; the rest reads and
 * writes the stores. */
import { create } from 'zustand';
import {
  addedIssues,
  createFitTween,
  validateProject,
  type ActionId,
  type AttachTarget,
  type ClipId,
  type Issue,
  type Project,
  type TweenAction,
} from '../../model';
import { history, useProjectStore, useUiStore, type Selection } from '../../store';
import { listNames } from '../animations/attachNames';
import { findBlockSlot } from '../animations/blockRange';
import { noRoomReason } from '../animations/blockOps';
import { announce } from '../announcer';
import { isMac, keysSpoken, keysText } from '../platform';
import { onDocumentReplaced } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { round6 } from '../time';
import { pickedTargets } from './glyphActions';
import { useGlyphPick } from './glyphPickStore';
import { endPreviewModes, registerPreviewMode } from './previewModes';

/** What is being chosen: the target of a new Transform of the shape of `clipId`, or — with
 * `actionId` — another target for that Transform of it. */
export interface RetargetRequest {
  clipId: ClipId;
  actionId?: ActionId;
}

interface ShapeRetargetState {
  request: RetargetRequest | null;
  start(request: RetargetRequest): void;
  cancel(): void;
}

export const useShapeRetarget = create<ShapeRetargetState>()((set) => ({
  request: null,
  start: (request) => {
    endPreviewModes('retarget');
    set({ request });
  },
  cancel: () => set({ request: null }),
}));

registerPreviewMode(
  'retarget',
  () => {
    if (useShapeRetarget.getState().request) useShapeRetarget.getState().cancel();
  },
  () => useShapeRetarget.getState().request !== null,
);

/** What is chosen in the preview for the shape of `shapeClipId` to go to: the picked symbols,
 * formula by formula, when there are some; else the selected objects, each whole. The shape's own
 * clip is never one of them. In the order they were chosen. */
export function chosenTargets(
  project: Pick<Project, 'clips'>,
  selection: Selection,
  picked: readonly AttachTarget[] | null,
  shapeClipId: ClipId,
): AttachTarget[] {
  if (picked && picked.length > 0) return picked.filter((t) => t.clipId !== shapeClipId);
  const ids = selection.kind === 'clips' ? selection.ids : [];
  const visual = new Set(project.clips.map((clip) => clip.id));
  return ids
    .filter((id) => id !== shapeClipId && visual.has(id))
    .map((clipId) => ({ clipId, glyphs: 'all' as const }));
}

export type RetargetPlan =
  { ok: true; action: TweenAction; replaces: boolean } | { ok: false; reason: string };

const errorsOf = (project: Project): Issue[] =>
  validateProject(project).filter((issue) => issue.severity === 'error');

/** Why the shape of `clipId` cannot be given a Transform, or another target for one: its track
 * is locked. Null when it can. Asked when the mode starts and again when the Transform is made:
 * the track may be locked in between. */
export function shapeLock(
  project: Pick<Project, 'clips' | 'tracks'>,
  clipId: ClipId,
): string | null {
  const clip = project.clips.find((c) => c.id === clipId);
  const track = clip && project.tracks.find((t) => t.id === clip.trackId);
  return track?.locked
    ? `Track “${track.name}” is locked: unlock it on the timeline to give its shapes a Transform.`
    : null;
}

/** The Transform that carries the shape of `request` to `targets`: a new one that starts at the
 * absolute time `time`, a second long, moved or shortened into the nearest free time of its clip
 * as any new Transform is; or the one of `request.actionId` with these targets instead of its
 * own. Refused, saying why, with nothing chosen, on a clip that is not a shape's or whose track
 * is locked, without room, or when the project would not stand with it (a target still being
 * drawn then, one that hangs on the shape itself). */
export function planRetarget(
  project: Project,
  request: RetargetRequest,
  targets: readonly AttachTarget[],
  time: number,
): RetargetPlan {
  const clip = project.clips.find((c) => c.id === request.clipId);
  const formula = project.formulas.find((f) => f.id === clip?.formulaId);
  if (!clip || formula?.kind !== 'shape') {
    return { ok: false, reason: 'That shape no longer exists.' };
  }
  const locked = shapeLock(project, clip.id);
  if (locked) return { ok: false, reason: locked };
  const [first, ...rest] = targets;
  if (!first) {
    return {
      ok: false,
      reason: keysText(
        'Nothing is chosen yet: click a formula in the preview, or hold Alt and pick symbols.',
      ),
    };
  }
  const replaces = request.actionId !== undefined;
  const before = errorsOf(project);
  /** What the project says against `tween` in the clip that it did not say before. */
  const problemsWith = (tween: TweenAction): Issue[] => {
    const actions = replaces
      ? clip.actions.map((a) => (a.id === tween.id ? tween : a))
      : [...clip.actions, tween].sort((a, b) => a.start - b.start);
    const candidate: Project = {
      ...project,
      clips: project.clips.map((c) => (c.id === clip.id ? { ...clip, actions } : c)),
    };
    return addedIssues(errorsOf(candidate), before);
  };
  let action: TweenAction;
  if (request.actionId !== undefined) {
    const current = clip.actions.find((a) => a.id === request.actionId);
    if (current?.kind !== 'tween') return { ok: false, reason: 'That block no longer exists.' };
    action = { ...current, fit: createFitTween(0, 1, first, rest).fit };
  } else {
    const block = createFitTween(0, 1, first, rest);
    const slot = findBlockSlot(project, clip, { block, at: time, shorten: true });
    if (!slot) {
      // No time takes it: when that is its target's doing (one that hangs on the shape itself),
      // say that rather than that the clip is full.
      const asked = { ...block, start: round6(Math.max(time - clip.start, 0)) };
      const about = problemsWith(asked).find((issue) => issue.code.startsWith('attach'));
      return { ok: false, reason: about?.message ?? noRoomReason(block) };
    }
    action = { ...block, ...slot };
  }
  const [problem] = problemsWith(action);
  if (problem) return { ok: false, reason: problem.message };
  return { ok: true, action, replaces };
}

const nameOfClip = (project: Project, clipId: ClipId): string => {
  const clip = project.clips.find((c) => c.id === clipId);
  return project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? '?';
};

/** The names of the objects `targets` are of, each once, as a sentence lists them. */
export function targetNames(project: Project, targets: readonly AttachTarget[]): string {
  return listNames([...new Set(targets.map((target) => nameOfClip(project, target.clipId)))]);
}

/** What the preview's hint says while the mode is on: how to choose, and what is chosen. */
export function retargetHint(
  shape: string,
  chosen: string,
  again: boolean,
  mac: boolean = isMac(),
): string {
  const what = again ? `Another target for the Transform of “${shape}”` : `Transform “${shape}”`;
  const state = chosen === '' ? 'nothing chosen yet' : `to ${chosen}`;
  // The keys as the system writes them: of these words, not of the names beside them.
  const how = keysText('click a formula (Ctrl/⌘ adds more), or hold Alt and pick symbols', mac);
  const make = keysText('Enter makes it at the playhead', mac);
  return `${what}: ${how} · ${state} · ${make} · Esc cancels`;
}

/** Start choosing a target for the shape of `clipId` (for its Transform `actionId`, when given).
 * Nothing on a locked track. The symbols picked before are let go: the choice starts clean. */
export function startRetarget(clipId: ClipId, actionId?: ActionId): void {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const locked = shapeLock(project, clipId);
  if (locked) {
    notify({ kind: 'warning', title: 'The track is locked', message: locked });
    return;
  }
  useGlyphPick.getState().clear();
  useShapeRetarget.getState().start(actionId === undefined ? { clipId } : { clipId, actionId });
  announce(
    keysSpoken(
      'Choose what the shape goes to: click a formula, or hold Alt and pick symbols; Enter makes the Transform, Escape cancels',
    ),
  );
}

/** What is chosen now for the mode's shape (`chosenTargets`, from the stores). */
export function targetsNow(): AttachTarget[] {
  const { request } = useShapeRetarget.getState();
  if (!request) return [];
  return chosenTargets(
    useProjectStore.getState().project,
    useUiStore.getState().selection,
    pickedTargets(),
    request.clipId,
  );
}

/** Make the Transform to what is chosen (or give the one being edited its new target), as one
 * undo step, select it and leave the mode. Refused — the track of the shape locked since the
 * mode started, too —, the mode stays on and a notice says why. Whether it was made. */
export function confirmRetarget(): boolean {
  // Enter can come with the button still held on a clip: the plan is for the project that drag
  // leaves, as for any command that plans (`history.cancelForeignGesture`).
  history.cancelForeignGesture();
  const { request } = useShapeRetarget.getState();
  if (!request) return false;
  const { project } = useProjectStore.getState();
  const targets = targetsNow();
  const plan = planRetarget(project, request, targets, useUiStore.getState().time);
  if (!plan.ok) {
    notify({ kind: 'warning', title: 'No Transform made', message: plan.reason });
    return false;
  }
  const { action, replaces } = plan;
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === request.clipId);
    if (!clip) return;
    if (replaces) clip.actions = clip.actions.map((a) => (a.id === action.id ? action : a));
    else {
      clip.actions.push(action);
      clip.actions.sort((a, b) => a.start - b.start);
    }
  });
  useShapeRetarget.getState().cancel();
  useGlyphPick.getState().clear();
  useUiStore.getState().select({ kind: 'action', clipId: request.clipId, actionId: action.id });
  announce(
    `Transform of ${nameOfClip(project, request.clipId)} to ${targetNames(project, targets)} ${replaces ? 'changed' : 'added'}`,
  );
  return true;
}

/** Leave the mode when its shape or its Transform goes (an undo, a delete), and with its
 * document: the next one may have a shape and a Transform of the same ids — a saved copy opened
 * again —, which are not the ones the choice was started for. One of the sessions that end with
 * the document (`ui/project/sessionTracking.ts`). Returns the function that stops it. */
export function startShapeRetargetTracking(): () => void {
  const stops = [
    useProjectStore.subscribe((state) => {
      const { request } = useShapeRetarget.getState();
      if (!request) return;
      const clip = Array.isArray(state.project.clips)
        ? state.project.clips.find((c) => c.id === request.clipId)
        : undefined;
      const gone =
        !clip ||
        (request.actionId !== undefined && !clip.actions.some((a) => a.id === request.actionId));
      if (gone) useShapeRetarget.getState().cancel();
    }),
    onDocumentReplaced(() => useShapeRetarget.getState().cancel()),
  ];
  return () => stops.forEach((stop) => stop());
}
