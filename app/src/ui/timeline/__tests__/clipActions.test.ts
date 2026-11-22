// @vitest-environment node
/* The commands of clips that plan with the project (clipActions.ts): duplicating the selected
 * clips and moving one with the keys. Both can be fired from the keyboard while the button is
 * still held on a clip, and then they give that drag up before they plan. */
import { afterEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createTrack,
  setIdGenerator,
  validateProject,
  type Project,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { duplicateSelectedClips, nudgeClip } from '../clipActions';

type Write = (draft: Project) => void;

/** Clip `a` over 5–8 s alone on the first track and `b` over 0–12 s on the second, at 30 fps;
 * `a` is selected. The ids are the same in every run. */
function loadScene(): void {
  const project = createEmptyProject('t');
  project.tracks = [createTrack('Track 2'), createTrack('Track 1')];
  const formula = createFormula({ name: 'f', source: 'x' });
  project.formulas.push(formula);
  const [first, second] = project.tracks;
  project.clips.push(
    { ...createClip(formula.id, first!.id, 5, 8), id: 'a' },
    { ...createClip(formula.id, second!.id, 0, 12), id: 'b' },
  );
  loadProject(project);
  useUiStore.setState({ selection: { kind: 'clips', ids: ['a'] } });
}

/** What `command` leaves of the scene, fired while a gesture that wrote `during` is open (none
 * without it). */
function leaves(command: () => unknown, during?: Write) {
  const restoreIds = setIdGenerator(sequentialIds());
  try {
    loadScene();
    if (during) history.beginGesture().update(during);
    const returned = command();
    const { project } = useProjectStore.getState();
    return {
      returned,
      gesturing: history.isGesturing(),
      project,
      errors: validateProject(project)
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.code),
      selection: useUiStore.getState().selection,
      steps: useProjectStore.temporal.getState().pastStates.length,
    };
  } finally {
    restoreIds();
  }
}

const windows = (project: Project) =>
  project.clips.filter((c) => c.id !== 'b').map((c) => [c.start, c.end]);

/** `a` dragged to the start of its track. */
const move: Write = (draft) => {
  Object.assign(draft.clips[0]!, { start: 0, end: 3 });
};
/** The end of `a` dragged out to 11 s. */
const trim: Write = (draft) => {
  draft.clips[0]!.end = 11;
};

afterEach(() => {
  useUiStore.setState({ selection: { kind: 'none' } });
  loadProject(createEmptyProject());
});

describe('duplicateSelectedClips', () => {
  it('copies the selected clip after itself, as one undo step, and selects the copy', () => {
    const { project, selection, steps, errors } = leaves(duplicateSelectedClips);
    expect(windows(project)).toEqual([
      [5, 8],
      [8, 11],
    ]);
    expect(selection).toEqual({ kind: 'clips', ids: [project.clips[2]!.id] });
    expect(steps).toBe(1);
    expect(errors).toEqual([]);
  });

  it('copies nothing without clips that can be edited', () => {
    const locked = leaves(() => {
      useProjectStore.getState().update((draft) => {
        draft.tracks[0]!.locked = true;
      });
      duplicateSelectedClips();
    });
    expect(locked.project.clips).toHaveLength(2);
    expect(locked.steps).toBe(1); // the lock alone
    const none = leaves(() => {
      useUiStore.setState({ selection: { kind: 'none' } });
      duplicateSelectedClips();
    });
    expect(none.project.clips).toHaveLength(2);
    expect(none.steps).toBe(0);
  });

  it.each([
    ['moved', move],
    ['trimmed', trim],
  ])(
    'while the clip is being %s: the drag is given up, the copy is of the clip it leaves',
    (_, during) => {
      const alone = leaves(duplicateSelectedClips);
      const fired = leaves(duplicateSelectedClips, during);
      expect(fired.gesturing).toBe(false);
      // Not a copy of what the drag showed, next to the clip the drag was given up on: the two
      // would overlap (moved), or the copy be as long as the trim made it.
      expect(fired.errors).toEqual([]);
      expect(windows(fired.project)).toEqual([
        [5, 8],
        [8, 11],
      ]);
      expect(fired).toEqual(alone);
    },
  );
});

describe('nudgeClip', () => {
  const frame = 1 / 30;

  it('moves the clip a frame along its track, as one undo step, and says where it went', () => {
    const { returned, project, steps } = leaves(() => nudgeClip('a', frame, 0));
    expect(returned).toMatchObject({ ok: true, start: 5.033333, end: 8.033333 });
    expect(project.clips[0]).toMatchObject({ start: 5.033333, end: 8.033333 });
    expect(steps).toBe(1);
  });

  it('says why a clip stays, and nothing for one that is gone', () => {
    expect(leaves(() => nudgeClip('a', 0, -1)).returned).toEqual({
      ok: false,
      reason: 'No track above',
    });
    expect(leaves(() => nudgeClip('gone', frame, 0)).returned).toBeNull();
  });

  it('while the clip is being moved: the drag is given up, the frame is from where it was', () => {
    const alone = leaves(() => nudgeClip('a', frame, 0));
    const fired = leaves(() => nudgeClip('a', frame, 0), move);
    expect(fired.gesturing).toBe(false);
    expect(fired.project.clips[0]).toMatchObject({ start: 5.033333, end: 8.033333 });
    expect(fired).toEqual(alone);
  });
});
