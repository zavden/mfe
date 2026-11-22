/* The project being edited, with undo/redo.
 *
 * Every `update` is one undo step. Continuous gestures (dragging a clip, scrubbing a
 * value) own a handle from `history.beginGesture()`. Only writes through that handle belong
 * to the gesture. Undo/Redo cancel it first; an independent edit cancels it before committing. */
import { produce } from 'immer';
import { temporal } from 'zundo';
import { create } from 'zustand';
import {
  createEmptyProject,
  hasBrokenFormulaGroups,
  hasBrokenGroup,
  repairFormulaGroups,
  repairGroups,
  type Project,
} from '../model';

export interface ProjectState {
  project: Project;
  /** Replace the project (New / Open). Clears the undo history. */
  load(project: Project): void;
  /** Apply an immer recipe to the project as one undo step. */
  update(recipe: (draft: Project) => void): void;
  /** Apply an immer recipe without creating an undo step, for derived data the app maintains
   * itself (glyph snapshots, references remapped after a re-render). The next undoable
   * update records the amended project as its "before" state. */
  amend(recipe: (draft: Project) => void): void;
}

/** The most steps the history keeps: one made past them pushes the oldest out. */
export const HISTORY_LIMIT = 200;

type LoadListener = (project: Project) => void;
type AmendListener = (before: Project, after: Project) => void;
const loadListeners = new Set<LoadListener>();
const amendListeners = new Set<AmendListener>();
let loads = 0;

/** How many projects were loaded so far: what tells a document from the one before it, which
 * may have had the same ids. It counts a load before the store holds the new project, so whoever
 * hears the store change already knows that what it kept belongs to another document. */
export function projectLoads(): number {
  return loads;
}

/** An owner cannot write, end or cancel another gesture, even after a late pointer event. */
export interface ProjectGesture {
  readonly active: boolean;
  update(recipe: (draft: Project) => void): void;
  run<T>(write: () => T): T | undefined;
  end(): void;
  cancel(): void;
  /** Complete an editor's owned-field rollback, preserving the project and both history stacks.
   * Call only after restoring that editor's fields; ordinary callers use cancel(). When that
   * leaves the project as the gesture found it, the very object comes back (the document is
   * unsaved while the project is another object, however equal). */
  finishCancellation(): void;
}

interface GestureState {
  start: Project;
  cancelling: boolean;
  onCancel?: () => void;
}
let gesture: GestureState | null = null;
let writer: GestureState | null = null;
const gestureListeners = new Set<() => void>();
const changedGesture = () => {
  for (const listener of gestureListeners) listener();
};

function independentEdit(): void {
  if (gesture && writer !== gesture && !gesture.cancelling) cancelGesture(gesture);
}

/** Called after `loadProject` replaced the project and cleared its history (New, Open, the
 * autosave's restore): from then on, nothing in the project counts as an edit. */
export function onProjectLoaded(listener: LoadListener): () => void {
  loadListeners.add(listener);
  return () => {
    loadListeners.delete(listener);
  };
}

/** Called after `amend` changed the project (snapshots, remapped references). The document
 * layer uses it to keep "unsaved changes" honest: derived data is not a user edit. */
export function onProjectAmended(listener: AmendListener): () => void {
  amendListeners.add(listener);
  return () => {
    amendListeners.delete(listener);
  };
}

/** What a recipe makes of the project, with the rule of groups kept: a block that no longer
 * runs with its group — one moved, stretched or left alone by whatever the edit was — is a block
 * on its own again (`model/groups.ts`), and a formula that is gone has left its group of the
 * Creator, a group left without formulas going too (`model/formulaGroups.ts`). The project
 * itself when nothing breaks either rule. */
function edited(project: Project, recipe: (draft: Project) => void): Project {
  const next = produce(project, recipe);
  if (next === project) return next;
  const blocks = next.clips.some(hasBrokenGroup);
  const formulas = hasBrokenFormulaGroups(next);
  if (!blocks && !formulas) return next;
  return produce(next, (draft) => {
    if (blocks) repairGroups(draft);
    if (formulas) repairFormulaGroups(draft);
  });
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set) => ({
      project: createEmptyProject(),
      load: (project) => set({ project }),
      update: (recipe) => {
        independentEdit();
        set((state) => ({ project: edited(state.project, recipe) }));
      },
      amend: (recipe) => {
        const temporal = useProjectStore.temporal.getState();
        const before = useProjectStore.getState().project;
        // Inside a gesture tracking is already paused; endGesture then records the amendment
        // as part of the gesture's step.
        const tracking = temporal.isTracking;
        if (tracking) temporal.pause();
        set((state) => ({ project: edited(state.project, recipe) }));
        if (tracking) temporal.resume();
        const after = useProjectStore.getState().project;
        if (before !== after) for (const listener of amendListeners) listener(before, after);
      },
    }),
    {
      partialize: (state) => ({ project: state.project }),
      equality: (before, after) => before.project === after.project,
      limit: HISTORY_LIMIT,
    },
  ),
);

const temporalState = () => useProjectStore.temporal.getState();

function endGesture(owner: GestureState): void {
  if (gesture !== owner) return;
  const end = useProjectStore.getState().project;
  gesture = null;
  // Rewind silently, then replay the result while recording: one committed step.
  useProjectStore.setState({ project: owner.start });
  temporalState().resume();
  if (end !== owner.start) useProjectStore.setState({ project: end });
  changedGesture();
}

function cancelGesture(owner: GestureState): void {
  if (gesture !== owner || owner.cancelling) return;
  owner.cancelling = true; // Invalidate writes before any subscriber or pointer cleanup runs.
  try {
    // A scoped editor may restore its owned field and finish cancellation here, retaining newer
    // locks or amendments. Otherwise cancellation restores the gesture's starting project.
    owner.onCancel?.();
  } finally {
    if (gesture === owner) {
      gesture = null;
      useProjectStore.setState({ project: owner.start });
      temporalState().resume();
      changedGesture();
    }
  }
}

// Protect the underlying temporal commands too: menu, shortcut and direct store callers share
// the same cancellation boundary. Cancelling never consumes an existing past/future state.
const { undo, redo } = temporalState();
useProjectStore.temporal.setState({
  undo: (steps) => {
    if (gesture) cancelGesture(gesture);
    else undo(steps);
  },
  redo: (steps) => {
    if (gesture) cancelGesture(gesture);
    else redo(steps);
  },
});

export const history = {
  undo: () => temporalState().undo(),
  redo: () => temporalState().redo(),
  clear: () => {
    if (gesture) cancelGesture(gesture);
    temporalState().clear();
  },
  canUndo: () => gesture !== null || temporalState().pastStates.length > 0,
  canRedo: () => gesture !== null || temporalState().futureStates.length > 0,
  isGesturing: () => gesture !== null,
  /** How many steps there are to undo (a gesture that runs is not one yet): what tells whether a
   * write made a step of its own — one more —, joined the step before it or made none. */
  depth: (): number => temporalState().pastStates.length,
  /** The project as it was before the gesture that runs, or the project when none does: what a
   * command pressed during a drag decides with, since it gives the drag up and then does what it
   * does with no drag held (the S key: split, or the circle selector). */
  projectBeforeGesture: (): Project => gesture?.start ?? useProjectStore.getState().project,
  subscribe(listener: () => void): () => void {
    gestureListeners.add(listener);
    return () => {
      gestureListeners.delete(listener);
    };
  },

  /** Stop recording; later updates are previewed live but not yet undoable. */
  beginGesture(onCancel?: () => void): ProjectGesture {
    if (gesture) cancelGesture(gesture);
    const owner: GestureState = {
      start: useProjectStore.getState().project,
      cancelling: false,
      onCancel,
    };
    gesture = owner;
    temporalState().pause();
    changedGesture();
    const handle: ProjectGesture = {
      get active() {
        return gesture === owner && !owner.cancelling;
      },
      run(write) {
        if (!handle.active) return;
        const previous = writer;
        writer = owner;
        try {
          return write();
        } finally {
          writer = previous;
        }
      },
      update(recipe) {
        handle.run(() => useProjectStore.getState().update(recipe));
      },
      end: () => endGesture(owner),
      cancel: () => cancelGesture(owner),
      finishCancellation() {
        if (gesture !== owner) return;
        gesture = null;
        // Recording is still paused: this is no step. Anything newer (a lock, an amendment)
        // makes the two differ, and stays.
        const { project } = useProjectStore.getState();
        if (project !== owner.start && JSON.stringify(project) === JSON.stringify(owner.start))
          useProjectStore.setState({ project: owner.start });
        temporalState().resume();
        changedGesture();
      },
    };
    return handle;
  },
  /** Cancel the current owner, e.g. when replacing the document. Pointer owners use handles. */
  cancelGesture(): void {
    if (gesture) cancelGesture(gesture);
  },
  /** Cancel the gesture of another, as `update` will: what a command that plans with the project
   * calls before it reads it. `update` cancels the gesture too, but by then the plan is made, with
   * what the gesture had moved, and it would go to the project the cancellation brings back.
   * Inside a gesture's own write (`handle.run`) nothing is cancelled: that write is the gesture's. */
  cancelForeignGesture(): void {
    independentEdit();
  },

  /** Run `write` so that the step it makes is one with the step before it: for a thing done
   * click by click — the colours of a list pasted one at a time — that a single undo takes back.
   * Unlike a gesture, nothing is held open between the writes: whatever is edited in between is
   * a step of its own, and loses nothing. The caller answers for the step before being its own
   * and the last one made (the project is still the very object that step left). Nothing is
   * joined when there was no step before, or when `write` makes none. */
  continueStep<T>(write: () => T): T {
    const before = temporalState().pastStates;
    const last = before.at(-1);
    // A copy: at `HISTORY_LIMIT` the step `write` makes pushes the oldest state out of this very
    // array, and a step that is joined makes none — nothing is to go.
    const kept = before.slice();
    const result = write();
    const past = temporalState().pastStates;
    // The step `write` made put the state in between on top of the one from before it: without
    // that state, the two steps are one, and the states are the ones from before the write.
    if (last !== undefined && past.at(-1) !== last && past.at(-2) === last) {
      useProjectStore.temporal.setState({ pastStates: kept });
    }
    return result;
  },
  /** Take the last step back for good: the project is the very object from before it, and
   * nothing is left to redo. For a step its maker unmakes itself — the only colour of a paste
   * taken back —, which would otherwise stay as a step that changes nothing. Whether it did:
   * not without a step, nor while a gesture runs. */
  retractStep(): boolean {
    if (gesture || temporalState().pastStates.length === 0) return false;
    undo();
    useProjectStore.temporal.setState({ futureStates: [] });
    return true;
  },
};

/** Open a project: replace it and forget the previous history. */
export function loadProject(project: Project): void {
  history.cancelGesture();
  loads++;
  useProjectStore.getState().load(project);
  history.clear();
  for (const listener of loadListeners) listener(project);
}
