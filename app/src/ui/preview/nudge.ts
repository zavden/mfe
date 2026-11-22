/* The arrow keys move the selected objects of the preview: ←/→/↑/↓ by 0.01 scene units, with
 * Shift by 0.1, while the preview has the keyboard — a click on it gives its frame the focus
 * (`PreviewPanel.tsx`) — and something selected is on screen. What moves is what a drag of the
 * selection would move, by the drag's rules (`selectionMove.ts`), written as a drag writes it
 * (`writeTravel`): the keyframe in effect at the playhead, the end state under edit, a part's
 * shift; to six decimals, so that a position on the hundredths stays on them. No snapping: a press
 * moves by its step exactly.
 *
 * A run of presses is one undo step: a press on the same selection, at the same instant, moving the
 * same keyframes, while the step of the press before is still the last one made, joins that step
 * (`history.continueStep`) — a key held down repeats, and its repeats join too. Any other step in
 * between (an edit, an undo, a redo), another selection — clicked again, even the same clips — or
 * another instant starts a new one; derived data written without a step (the attach sync, a
 * snapshot) does not.
 *
 * The selected clips that stay are named, as Align names them (`reportSkipped`), or — a lone
 * selected clip that a drag would not move — with the notice a drag gives (`warnRefusal`); not
 * again while that notice is up. A drag still held is given up first, as the timeline's Alt+arrows
 * and Align do. Everywhere else the keys are not the selection's: with nothing selected on screen
 * ←/→ step the playhead (`Transport.tsx`); a mode of the preview (`previewModeOn`), a dialog and a
 * covered preview keep them; with Ctrl/⌘ or Alt they are not taken (the panel checks). */
import type { Clip, ClipId, Project } from '../../model';
import { history, useProjectStore, useUiStore, type Selection } from '../../store';
import { announce } from '../announcer';
import { isModalOpen } from '../project/modalStack';
import { useNoticeStore } from '../project/noticeStore';
import { highlightedClipIds } from '../selection';
import { placedBy, reportSkipped } from './alignActions';
import { writeTravel, type Drag } from './gesture';
import { clipsOnScreen } from './interaction';
import { isPreviewCovered } from './previewCover';
import { isPreviewLocked } from './previewLock';
import { previewModeOn } from './previewModes';
import { editContext, planMove, warnRefusal, type MoveRefusal } from './selectionMove';

/** How far a press of an arrow moves, in scene units; with Shift, `NUDGE_STEP_LARGE`. */
export const NUDGE_STEP = 0.01;
export const NUDGE_STEP_LARGE = 0.1;

/** The travel a key moves the selection by (scene units, +y up), or null when it is no arrow. */
export function nudgeTravel(key: string, large: boolean): [number, number] | null {
  const step = large ? NUDGE_STEP_LARGE : NUDGE_STEP;
  switch (key) {
    case 'ArrowLeft':
      return [-step, 0];
    case 'ArrowRight':
      return [step, 0];
    case 'ArrowUp':
      return [0, step];
    case 'ArrowDown':
      return [0, -step];
    default:
      return null;
  }
}

/** The run of presses the last one was part of. */
const run = {
  /** The selection it moved: the very object, so that a click in between starts a new run. */
  selection: null as Selection | null,
  /** The instant it moved them at. */
  time: Number.NaN,
  /** The clips it moved and the keyframes it wrote, as a key. */
  moves: '',
  /** The top of the undo stack its write left: while it is still on top, no step was made since. */
  past: undefined as unknown,
};

/** What the last notice was about, and its id: it is not given again while it is up. */
const said = { about: '', id: -1 };

/** Give a notice — `show` gives it — unless the one about the same thing is still up. */
function tell(about: string, show: () => void): void {
  const { notices } = useNoticeStore.getState();
  if (said.about === about && notices.some((n) => n.id === said.id)) return;
  show();
  said.about = about;
  said.id = useNoticeStore.getState().notices.at(-1)?.id ?? -1;
}

/** The selected clips `ids` that go where `going` go: those `going` holds, and those placed at
 * `time` by one of them, or by a clip that is placed by one (a brace's label). */
function goingWith(
  project: Project,
  ids: readonly ClipId[],
  time: number,
  going: ReadonlySet<ClipId>,
): Set<ClipId> {
  const result = new Set(going);
  const hosts = new Map<ClipId, ClipId[]>();
  for (const clip of project.clips) {
    if (!ids.includes(clip.id)) continue;
    const placers = placedBy(clip, time);
    if (placers.length > 0) hosts.set(clip.id, placers);
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, placers] of hosts) {
      if (result.has(id) || !placers.some((host) => result.has(host))) continue;
      result.add(id);
      grew = true;
    }
  }
  return result;
}

/** Whether a drag could start from `clip`: a press reaches it (not locked in the preview) and
 * its track is not locked. */
function pressable(project: Project, clip: Clip): boolean {
  return (
    !isPreviewLocked(clip) && !project.tracks.find((track) => track.id === clip.trackId)?.locked
  );
}

/** Move the selection of the preview by `travel` (an arrow key's, `nudgeTravel`), as a drag of it
 * would move it. Whether the key was the selection's: something selected is on screen and no mode
 * of the preview, dialog or cover has the keys — then it moved, or a notice says why not. */
export function nudgeSelection(travel: [number, number]): boolean {
  if (isModalOpen() || isPreviewCovered() || previewModeOn()) return false;
  const { selection, time } = useUiStore.getState();
  const onScreen = new Set(clipsOnScreen(useProjectStore.getState().project, time));
  const ids = highlightedClipIds(selection).filter((id) => onScreen.has(id));
  if (ids.length === 0) return false;
  // A drag still held is given up: the selection moves from where it is without it.
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  const shown = ids.flatMap((id) => project.clips.filter((clip) => clip.id === id));
  const context = editContext();
  // The drag a press on the first selected clip that can be dragged would make; a clip that a
  // drag cannot start from is left to go along with it, as a drag of the selection would.
  let plan: Drag | null = null;
  let refusal: MoveRefusal | null = null;
  for (const clip of shown) {
    if (!pressable(project, clip)) continue;
    const next = planMove(
      project,
      clip,
      { clipId: clip.id, startScene: [0, 0] },
      selection,
      context,
    );
    if (!('refused' in next)) {
      plan = next;
      break;
    }
    refusal ??= next;
  }
  if (!plan) {
    const lone = shown.length === 1 ? shown[0]! : null;
    if (lone && refusal) tell(`${refusal.refused}:${lone.id}`, () => warnRefusal(project, refusal));
    else tell(`stayed:${ids.join(',')}`, () => reportSkipped(shown));
    return true;
  }
  const drag = plan;
  const moved = [drag.clipId, ...drag.companions.map((c) => c.clipId)];
  const moves = JSON.stringify([
    drag.clipId,
    drag.ref,
    drag.part ?? null,
    drag.companions.map((c) => [c.clipId, c.ref]),
  ]);
  const temporal = useProjectStore.temporal;
  const joins =
    run.selection === selection &&
    run.time === time &&
    run.moves === moves &&
    run.past !== undefined &&
    temporal.getState().pastStates.at(-1) === run.past;
  const before = useProjectStore.getState().project;
  const write = () =>
    useProjectStore.getState().update((draft) => writeTravel(draft, drag, travel));
  if (joins) history.continueStep(write);
  else write();
  if (useProjectStore.getState().project !== before) {
    run.selection = selection;
    run.time = time;
    run.moves = moves;
    run.past = temporal.getState().pastStates.at(-1);
  }
  // The selected clips that neither moved nor follow one that did stay, and are named.
  const going = goingWith(project, ids, time, new Set(moved));
  const stayed = shown.filter((clip) => !going.has(clip.id));
  if (stayed.length > 0) {
    tell(`stayed:${stayed.map((clip) => clip.id).join(',')}`, () => reportSkipped(stayed));
  }
  const name = project.formulas.find(
    (f) => f.id === project.clips.find((c) => c.id === drag.clipId)?.formulaId,
  )?.name;
  const way = travel[0] > 0 ? 'right' : travel[0] < 0 ? 'left' : travel[1] > 0 ? 'up' : 'down';
  const what = moved.length === 1 ? `${name ?? 'The object'}` : `${moved.length} objects`;
  announce(`${what} moved ${way} ${Math.abs(travel[0] || travel[1])}`);
  return true;
}
