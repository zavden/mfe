/* The guard of the Slides mode (D200): what the editor asks when an edit covers a mark. A mark
 * keeps its instant when clips move (`model/slides.ts`), so any edit that changes what animates
 * when — a clip moved or trimmed, a block added, a relation retimed, a camera move, a shorter
 * scene — can leave a pause or a comment under an animation or past the end of the scene. The
 * owner's rule: the editor says so then, and to go on the marks covered have to be deleted.
 *
 * It is one check after each edit, not a check in each of the editor's many writes: the guard
 * listens to the project, looks once the edit is a step of the history — when a drag ends, not
 * while it runs —, and asks only for the marks that edit covered (`newlyCoveredMarks`). Its two
 * answers: delete them, in the same undo step as the edit, or take the edit back, with nothing left
 * to redo. Nothing is asked of a project without marks, of an edit that reaches none, of another
 * document, or of an undo or a redo: a state of the history was looked at when it was made.
 *
 * `coveredQuestion` is pure; `startSlideGuard` is one of the app's services
 * (`project/useAppServices.ts`). */
import {
  markCoverName,
  newlyCoveredMarks,
  sceneDuration,
  type CoveredMark,
  type Project,
} from '../../model';
import { history, projectLoads, useProjectStore } from '../../store';
import { showDialog, type DialogSpec } from '../project/dialogStore';

/** The ids of the guard's two answers. */
export const KEEP_CHANGE = 'delete-marks';
export const TAKE_BACK = 'take-back';

/** The most of a comment a line of the question shows. */
const MAX_WORDS = 60;

const clock = (t: number) => `${t.toFixed(2)} s`;

/** A covered mark as a line of the question: what it is, when, a comment's first words, and what
 * is there now. */
export function coveredLine(project: Project, { mark, standing }: CoveredMark): string {
  const first = (mark.text ?? '').trim().split('\n')[0] ?? '';
  const words = first.length > MAX_WORDS ? `${first.slice(0, MAX_WORDS - 1).trimEnd()}…` : first;
  const what = `${mark.kind === 'pause' ? 'Pause' : 'Comment'} at ${clock(mark.time)}`;
  const now =
    standing === 'outside'
      ? `the scene ends at ${clock(sceneDuration(project))} now`
      : `${markCoverName(project, mark.time)} runs there now`;
  return `${what}${words ? `: “${words}”` : ''} — ${now}`;
}

/** The question for the marks an edit covered, in `project` as the edit left it. */
export function coveredQuestion(project: Project, covered: readonly CoveredMark[]): DialogSpec {
  const one = covered.length === 1;
  const kind = covered[0]?.mark.kind ?? 'pause';
  return {
    title: one
      ? `This change covers a ${kind}`
      : `This change covers ${covered.length} marks of the Slides mode`,
    message: `A pause or a comment stands where nothing animates, within the scene. To keep the change, ${
      one ? 'this mark has' : 'these marks have'
    } to go:`,
    details: covered.map((entry) => coveredLine(project, entry)),
    buttons: [
      { id: TAKE_BACK, label: 'Take the change back' },
      {
        id: KEEP_CHANGE,
        label: one ? 'Delete it and keep the change' : 'Delete them and keep the change',
        tone: 'primary',
      },
    ],
    cancelId: TAKE_BACK,
  };
}

/** The most steps the guard takes back for one edit: an edit is one step, and a command that
 * makes a few is still one edit. */
const MAX_STEPS_BACK = 8;

/** Ask when an edit covers a mark of the Slides mode, and do what is answered. Returns the
 * function that stops it. */
export function startSlideGuard(): () => void {
  let stopped = false;
  let loads = projectLoads();
  /** The last project looked at and left as it was: what an edit is compared with, and where
   * «Take the change back» returns to. */
  let settled = useProjectStore.getState().project;
  /** How many steps the history had then. */
  let settledDepth = history.depth();
  /** Every project looked at: a state the history returns to is one of them. */
  const looked = new WeakSet<Project>([settled]);
  let asking = false;
  let queued = false;

  const settle = (project: Project) => {
    settled = project;
    settledDepth = history.depth();
    looked.add(project);
  };

  const look = () => {
    queued = false;
    if (stopped || asking || history.isGesturing()) return;
    const { project } = useProjectStore.getState();
    if (project === settled) return;
    const another = projectLoads() !== loads;
    loads = projectLoads();
    if (another || looked.has(project) || !project.slides?.marks.length) {
      settle(project);
      return;
    }
    let covered: CoveredMark[];
    try {
      covered = newlyCoveredMarks(settled, project);
    } catch {
      // A project that cannot be read is not the guard's to report (as the other services).
      return;
    }
    if (covered.length === 0) {
      settle(project);
      return;
    }
    asking = true;
    const before = settled;
    const depth = settledDepth;
    void showDialog(coveredQuestion(project, covered)).then((answer) => {
      asking = false;
      if (stopped) return;
      if (answer === KEEP_CHANGE) deleteCovered(before);
      else takeBack(depth);
      // What either answer left is looked at as any other project.
      schedule();
    });
  };

  /** Delete what the edit covered, as one step with the edit: one undo brings both back. The
   * project is read again — a render that finished while the question was open amended it. */
  const deleteCovered = (before: Project) => {
    const ids = new Set(
      newlyCoveredMarks(before, useProjectStore.getState().project).map(({ mark }) => mark.id),
    );
    if (ids.size === 0) return;
    history.continueStep(() =>
      useProjectStore.getState().update((draft) => {
        if (draft.slides) draft.slides.marks = draft.slides.marks.filter((m) => !ids.has(m.id));
      }),
    );
  };

  /** Take the edit back for good, nothing left to redo: its step, and the steps before it that the
   * same command made — down to as many as the history had before the edit. An edit that joined
   * the step before it (a thing done click by click) goes with that step, which is what one undo
   * would take. */
  const takeBack = (depth: number) => {
    for (let step = 0; step < MAX_STEPS_BACK; step++) {
      if (!history.retractStep()) return;
      if (history.depth() <= depth) return;
    }
  };

  /** Look once the writes of the command that runs are made: a command of several writes is one
   * edit, and what is asked is asked of what it leaves. */
  const schedule = () => {
    if (queued || stopped) return;
    queued = true;
    queueMicrotask(look);
  };

  const stopProject = useProjectStore.subscribe((state, previous) => {
    if (state.project !== previous.project) schedule();
  });
  // The end of a drag makes no new project: it makes the one the drag left a step.
  const stopHistory = history.subscribe(schedule);
  return () => {
    stopped = true;
    stopProject();
    stopHistory();
  };
}
