// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, createFormula } from '../../model';
import {
  history,
  HISTORY_LIMIT,
  loadProject,
  onProjectAmended,
  onProjectLoaded,
  useProjectStore,
} from '../index';

const formulaNames = () => useProjectStore.getState().project.formulas.map((f) => f.name);
const addFormula = (name: string) =>
  useProjectStore.getState().update((draft) => {
    draft.formulas.push(createFormula({ name }));
  });

beforeEach(() => loadProject(createEmptyProject()));

describe('project store', () => {
  it.each(['undo', 'redo'] as const)(
    '%s cancels a gesture without changing either committed stack',
    (command) => {
      addFormula('kept');
      addFormula('future');
      history.undo();
      const before = useProjectStore.temporal.getState();
      const past = [...before.pastStates];
      const future = [...before.futureStates];
      const gesture = history.beginGesture();
      gesture.run(() => addFormula('cancelled'));
      // The direct temporal API has the same boundary as menu / keyboard history.
      useProjectStore.temporal.getState()[command]();
      expect(formulaNames()).toEqual(['kept']);
      expect(useProjectStore.temporal.getState().pastStates).toEqual(past);
      expect(useProjectStore.temporal.getState().futureStates).toEqual(future);
      gesture.run(() => addFormula('late move'));
      gesture.end();
      gesture.cancel();
      history.redo();
      expect(formulaNames()).toEqual(['kept', 'future']);
    },
  );

  it('offers cancellation through either history command even with empty stacks', () => {
    const gesture = history.beginGesture();
    gesture.run(() => addFormula('cancelled'));
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);
    history.redo();
    expect(formulaNames()).toEqual([]);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('cancels before an independent edit, preserving the new lock and its own history step', () => {
    addFormula('kept');
    const gesture = history.beginGesture();
    gesture.run(() => addFormula('cancelled'));
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    gesture.run(() => addFormula('late move'));
    gesture.cancel();
    expect(formulaNames()).toEqual(['kept']);
    expect(useProjectStore.getState().project.tracks[0]!.locked).toBe(true);
    history.undo();
    expect(useProjectStore.getState().project.tracks[0]!.locked).toBe(false);
    expect(formulaNames()).toEqual(['kept']);
    history.redo();
    expect(formulaNames()).toEqual(['kept']);
  });

  describe('cancelForeignGesture, for a command that plans with the project', () => {
    it("cancels a gesture that is another's: the command reads the project it will write to", () => {
      addFormula('kept');
      const past = [...useProjectStore.temporal.getState().pastStates];
      const gesture = history.beginGesture();
      gesture.run(() => addFormula('dragged'));
      history.cancelForeignGesture();
      expect(history.isGesturing()).toBe(false);
      expect(gesture.active).toBe(false);
      expect(formulaNames()).toEqual(['kept']);
      expect(useProjectStore.temporal.getState().pastStates).toEqual(past);
      // The step the command then makes is its own.
      addFormula('planned');
      history.undo();
      expect(formulaNames()).toEqual(['kept']);
    });

    it('keeps the gesture inside its own write', () => {
      const gesture = history.beginGesture();
      gesture.run(() => {
        addFormula('dragged');
        history.cancelForeignGesture();
        addFormula('still dragged');
      });
      expect(gesture.active).toBe(true);
      gesture.end();
      expect(formulaNames()).toEqual(['dragged', 'still dragged']);
      history.undo();
      expect(formulaNames()).toEqual([]);
    });

    it('does nothing without a gesture', () => {
      addFormula('kept');
      const before = useProjectStore.getState().project;
      const past = [...useProjectStore.temporal.getState().pastStates];
      history.cancelForeignGesture();
      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.temporal.getState().pastStates).toEqual(past);
      expect(history.canUndo()).toBe(true);
    });
  });

  it('projectBeforeGesture is the project a running gesture started from, else the project', () => {
    addFormula('kept');
    const start = useProjectStore.getState().project;
    expect(history.projectBeforeGesture()).toBe(start);
    const gesture = history.beginGesture();
    gesture.run(() => addFormula('dragged'));
    // What the gesture shows is not what a command pressed during it decides with.
    expect(formulaNames()).toEqual(['kept', 'dragged']);
    expect(history.projectBeforeGesture()).toBe(start);
    gesture.end();
    expect(history.projectBeforeGesture()).toBe(useProjectStore.getState().project);
    expect(formulaNames()).toEqual(['kept', 'dragged']);
    // Given up, the gesture leaves the project it started from.
    const other = history.beginGesture();
    other.run(() => addFormula('given up'));
    other.cancel();
    expect(history.projectBeforeGesture()).toBe(useProjectStore.getState().project);
    expect(formulaNames()).toEqual(['kept', 'dragged']);
  });

  it('a replaced owner cannot finish or cancel the newer gesture', () => {
    const first = history.beginGesture();
    first.run(() => addFormula('old'));
    const second = history.beginGesture();
    second.run(() => addFormula('new'));
    first.end();
    first.cancel();
    first.run(() => addFormula('late'));
    expect(second.active).toBe(true);
    second.end();
    expect(formulaNames()).toEqual(['new']);
    history.undo();
    expect(formulaNames()).toEqual([]);
  });

  it('an owned-field rollback keeps newer derived data without consuming or clearing history', () => {
    addFormula('kept');
    addFormula('future');
    history.undo();
    const before = useProjectStore.getState().project;
    const past = [...useProjectStore.temporal.getState().pastStates];
    const future = [...useProjectStore.temporal.getState().futureStates];
    const owner = history.beginGesture(() => {
      useProjectStore.getState().update((draft) => {
        draft.formulas[0]!.source = '';
      });
      owner.finishCancellation();
    });
    owner.update((draft) => {
      draft.formulas[0]!.source = 'drag';
    });
    useProjectStore.getState().amend((draft) => {
      draft.formulas[0]!.fontSize = 64;
    });
    history.undo();
    expect(useProjectStore.getState().project.formulas[0]).toEqual({
      ...before.formulas[0],
      fontSize: 64,
    });
    expect(useProjectStore.temporal.getState().pastStates).toEqual(past);
    expect(useProjectStore.temporal.getState().futureStates).toEqual(future);
  });

  it('an owned-field rollback that leaves the project as it was gives back the very object', () => {
    addFormula('kept');
    const start = useProjectStore.getState().project;
    const past = [...useProjectStore.temporal.getState().pastStates];
    const owner = history.beginGesture(() => {
      useProjectStore.getState().update((draft) => {
        draft.formulas[0]!.source = '';
      });
      owner.finishCancellation();
    });
    owner.update((draft) => {
      draft.formulas[0]!.source = 'drag';
    });
    history.undo();
    // Equal is not enough: the document is unsaved while the project is another object.
    expect(useProjectStore.getState().project).toBe(start);
    expect(useProjectStore.temporal.getState().pastStates).toEqual(past);
    expect(history.isGesturing()).toBe(false);
  });

  it('retains async derived amendments during a live gesture and restores the baseline on cancel', async () => {
    addFormula('kept');
    addFormula('future');
    history.undo();
    const start = useProjectStore.getState().project;
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.formulas[0]!.source = 'scaled';
    });
    await Promise.resolve(); // a render/attachment completion outside handle.run
    useProjectStore.getState().amend((draft) => {
      draft.formulas[0]!.fontSize = 64;
    });
    expect(gesture.active).toBe(true);
    expect(useProjectStore.getState().project.formulas[0]!.fontSize).toBe(64);
    gesture.cancel();
    expect(useProjectStore.getState().project).toBe(start);
    history.redo();
    expect(formulaNames()).toEqual(['kept', 'future']);
    expect(useProjectStore.getState().project.formulas[0]!.source).toBe('');
  });

  it('document replacement invalidates an active handle before reused ids can receive old moves', () => {
    const before = useProjectStore.getState().project;
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.meta.name = 'drag';
    });
    loadProject({ ...before, meta: { ...before.meta, name: 'New document' } });
    gesture.update((draft) => {
      draft.meta.name = 'late move';
    });
    gesture.end();
    gesture.cancel();
    expect(useProjectStore.getState().project.meta.name).toBe('New document');
    expect(history.canUndo()).toBe(false);
  });

  it('applies updates immutably', () => {
    const before = useProjectStore.getState().project;
    addFormula('f1');
    expect(formulaNames()).toEqual(['f1']);
    expect(before.formulas).toEqual([]);
  });

  it('undoes and redoes one step per update', () => {
    addFormula('f1');
    addFormula('f2');
    history.undo();
    expect(formulaNames()).toEqual(['f1']);
    history.redo();
    expect(formulaNames()).toEqual(['f1', 'f2']);
  });

  it('records a gesture as one step', () => {
    addFormula('f1');
    const gesture = history.beginGesture();
    gesture.run(() => addFormula('tmp1'));
    gesture.run(() => addFormula('tmp2'));
    gesture.end();
    expect(formulaNames()).toEqual(['f1', 'tmp1', 'tmp2']);
    history.undo();
    expect(formulaNames()).toEqual(['f1']);
    history.redo();
    expect(formulaNames()).toEqual(['f1', 'tmp1', 'tmp2']);
  });

  it('cancels a gesture without a history entry', () => {
    addFormula('f1');
    const gesture = history.beginGesture();
    gesture.run(() => addFormula('tmp'));
    gesture.cancel();
    expect(formulaNames()).toEqual(['f1']);
    history.undo();
    expect(formulaNames()).toEqual([]);
  });

  it('amends without an undo step; the next update records the amended state', () => {
    addFormula('f1');
    useProjectStore.getState().amend((draft) => {
      draft.formulas[0]!.source = 'x';
    });
    expect(history.canUndo()).toBe(true); // only the addFormula step
    addFormula('f2');
    history.undo();
    expect(useProjectStore.getState().project.formulas.map((f) => f.source)).toEqual(['x']);
    history.undo();
    expect(formulaNames()).toEqual([]);
    expect(history.canUndo()).toBe(false);
  });

  it('keeps an amendment made during a gesture inside the gesture step', () => {
    addFormula('f1');
    const gesture = history.beginGesture();
    gesture.run(() => addFormula('tmp'));
    useProjectStore.getState().amend((draft) => {
      draft.formulas[0]!.source = 'x';
    });
    gesture.end();
    expect(formulaNames()).toEqual(['f1', 'tmp']);
    expect(useProjectStore.getState().project.formulas[0]!.source).toBe('x');
    history.undo();
    expect(formulaNames()).toEqual(['f1']);
  });

  it('clears history on load', () => {
    addFormula('f1');
    loadProject(createEmptyProject());
    expect(history.canUndo()).toBe(false);
  });

  it('tells listeners when a project is loaded, and only then', () => {
    const loaded: string[] = [];
    const off = onProjectLoaded((p) => loaded.push(p.meta.name));
    addFormula('f1');
    history.clear();
    const next = createEmptyProject('Opened');
    loadProject(next);
    off();
    loadProject(createEmptyProject('After'));
    expect(loaded).toEqual(['Opened']);
  });

  it('tells listeners what an amendment changed, and nothing for an empty one', () => {
    addFormula('f1');
    const seen: [string, string][] = [];
    const off = onProjectAmended((before, after) =>
      seen.push([before.formulas[0]!.source, after.formulas[0]!.source]),
    );
    useProjectStore.getState().amend(() => {});
    useProjectStore.getState().amend((draft) => {
      draft.formulas[0]!.source = 'x';
    });
    off();
    expect(seen).toEqual([['', 'x']]);
  });
});

/* A step made in several writes (`continueStep`, `retractStep`): what a paste click by click is
 * undone as. */
describe('a step made in several writes', () => {
  const steps = () => useProjectStore.temporal.getState().pastStates.length;

  it('continueStep joins what it writes to the step before: one undo takes both back', () => {
    addFormula('kept');
    addFormula('first');
    const answer = history.continueStep(() => {
      addFormula('second');
      return 'done';
    });
    expect(answer).toBe('done');
    history.continueStep(() => addFormula('third'));
    expect(formulaNames()).toEqual(['kept', 'first', 'second', 'third']);
    expect(steps()).toBe(2);
    history.undo();
    expect(formulaNames()).toEqual(['kept']);
    history.redo();
    expect(formulaNames()).toEqual(['kept', 'first', 'second', 'third']);
    expect(history.canRedo()).toBe(false);
  });

  it('joins nothing when the write changes nothing', () => {
    addFormula('kept');
    addFormula('first');
    const before = useProjectStore.temporal.getState().pastStates;
    history.continueStep(() => useProjectStore.getState().update(() => {}));
    expect(useProjectStore.temporal.getState().pastStates).toBe(before);
    history.undo();
    expect(formulaNames()).toEqual(['kept']);
  });

  it('is a step of its own when there is none before it', () => {
    history.continueStep(() => addFormula('first'));
    expect(steps()).toBe(1);
    history.undo();
    expect(formulaNames()).toEqual([]);
  });

  it('takes the place of a gesture that had written nothing, and still joins', () => {
    addFormula('first');
    const gesture = history.beginGesture();
    history.continueStep(() => addFormula('second'));
    expect(gesture.active).toBe(false);
    expect(steps()).toBe(1);
    history.undo();
    expect(formulaNames()).toEqual([]);
  });

  // The history keeps `HISTORY_LIMIT` steps, and a step made past them pushes the oldest out. A
  // write joined to the step before it makes no step: it pushes nothing out (B-20 of the final
  // audit: the second glyph of a paste, as the 200th step, cost the first revision).
  describe('at the limit of the history', () => {
    /** As many steps: a formula each. */
    const make = (count: number) => {
      for (let i = 0; i < count; i++) addFormula(`f${i}`);
    };
    const undoAll = () => {
      while (history.canUndo()) history.undo();
    };

    it('a write joined to the last step that fits pushes no step out', () => {
      make(HISTORY_LIMIT - 1);
      addFormula('first'); // the last step that fits: the first glyph of a paste
      expect(steps()).toBe(HISTORY_LIMIT);
      history.continueStep(() => addFormula('second')); // its second glyph: the same step
      expect(steps()).toBe(HISTORY_LIMIT);
      history.undo();
      expect(formulaNames()).toHaveLength(HISTORY_LIMIT - 1);
      history.redo();
      expect(formulaNames().slice(-2)).toEqual(['first', 'second']);
      // Every step before it is still there: undo reaches the project as it was loaded.
      undoAll();
      expect(formulaNames()).toEqual([]);
    });

    it('and so do the writes joined after it', () => {
      make(HISTORY_LIMIT - 1);
      addFormula('first');
      for (const name of ['second', 'third', 'fourth']) {
        history.continueStep(() => addFormula(name));
      }
      expect(steps()).toBe(HISTORY_LIMIT);
      undoAll();
      expect(formulaNames()).toEqual([]);
    });

    it('below the limit a joined write is one step with the one before, as ever', () => {
      make(HISTORY_LIMIT - 2);
      addFormula('first');
      history.continueStep(() => addFormula('second'));
      expect(steps()).toBe(HISTORY_LIMIT - 1);
      undoAll();
      expect(formulaNames()).toEqual([]);
    });

    it('a step of its own past the limit pushes the oldest out, as ever', () => {
      make(HISTORY_LIMIT);
      undoAll();
      expect(formulaNames()).toEqual([]);
      while (history.canRedo()) history.redo();
      addFormula('one more');
      expect(steps()).toBe(HISTORY_LIMIT);
      undoAll();
      expect(formulaNames()).toEqual(['f0']);
    });
  });

  it('retractStep takes the last step back for good: the very project, nothing to redo', () => {
    addFormula('kept');
    const before = useProjectStore.getState().project;
    addFormula('mistake');
    expect(history.retractStep()).toBe(true);
    expect(useProjectStore.getState().project).toBe(before);
    expect(history.canRedo()).toBe(false);
    expect(steps()).toBe(1);
    history.undo();
    expect(formulaNames()).toEqual([]);
  });

  it('depth counts the steps there are to undo: a gesture that runs is not one yet', () => {
    expect(history.depth()).toBe(0);
    addFormula('kept');
    expect(history.depth()).toBe(1);
    const gesture = history.beginGesture();
    gesture.run(() => addFormula('dragged'));
    expect(history.depth()).toBe(1);
    gesture.end();
    expect(history.depth()).toBe(2);
    // A write that joins the step before it adds none; a step taken back is one fewer.
    history.continueStep(() => addFormula('joined'));
    expect(history.depth()).toBe(2);
    history.retractStep();
    expect(history.depth()).toBe(1);
    history.undo();
    expect(history.depth()).toBe(0);
  });

  it('retractStep does nothing without a step, nor while a gesture runs', () => {
    expect(history.retractStep()).toBe(false);
    addFormula('kept');
    const gesture = history.beginGesture();
    gesture.run(() => addFormula('dragged'));
    expect(history.retractStep()).toBe(false);
    gesture.end();
    expect(formulaNames()).toEqual(['kept', 'dragged']);
  });
});
