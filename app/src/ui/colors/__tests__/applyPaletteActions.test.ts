// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createClip, createEmptyProject, createFormula, createTrack } from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import { history, loadProject, useProjectStore } from '../../../store';
import { startDocumentTracking, useDocumentStore } from '../../project/documentStore';
import {
  createApplyPaletteCommand,
  type ApplyPaletteCommand,
  type ApplyPaletteSnapshot,
} from '../applyPaletteActions';

const palette: ApplyPaletteSnapshot = {
  id: 'palette-a',
  revision: 1,
  displayName: 'Course',
  colors: {
    background: '#102030',
    formula: '#E0E1E2',
    variable: '#AABBCC',
    constant: '#CCDDEE',
    operator: '#345678',
    result: '#56789A',
    text: '#C1C2C3',
    muted: '#919293',
    rectangle: '#123456',
    circle: '#789ABC',
    arrow: '#ABCDEF',
  },
};
const commands: ApplyPaletteCommand[] = [];
let stopTracking: (() => void) | undefined;

function setup() {
  const project = smallProject();
  loadProject(project);
  useDocumentStore.getState().beginDocument(project, { fileName: null, handle: null });
  stopTracking = startDocumentTracking();
  let selected: ApplyPaletteSnapshot | null = structuredClone(palette);
  const command = createApplyPaletteCommand(() => selected);
  commands.push(command);
  return {
    project,
    command,
    select: (next: ApplyPaletteSnapshot | null) => {
      selected = next;
    },
  };
}

afterEach(() => {
  for (const command of commands.splice(0)) command.dispose();
  stopTracking?.();
  stopTracking = undefined;
  loadProject(createEmptyProject());
});

describe('Apply palette confirmation', () => {
  it('commits every colour and background in one undo, with exact redo and dirty tracking', () => {
    const { project, command } = setup();
    const preview = command.preview()!;
    expect(command.confirm(preview).status).toBe('applied');
    const applied = useProjectStore.getState().project;
    expect(applied.meta.background).toBe(palette.colors.background);
    expect(applied.formulas.map((formula) => formula.color)).toEqual([
      palette.colors.formula,
      palette.colors.formula,
    ]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useDocumentStore.getState().dirty).toBe(true);
    history.undo();
    expect(useProjectStore.getState().project).toBe(project);
    expect(useDocumentStore.getState().dirty).toBe(false);
    history.redo();
    expect(useProjectStore.getState().project).toBe(applied);
    expect(useDocumentStore.getState().dirty).toBe(true);
  });

  it('leaves a canonical no-op clean and preserves its redo history', () => {
    const { command } = setup();
    useProjectStore.getState().update((draft) => {
      draft.meta.background = palette.colors.background.toLowerCase();
      draft.formulas.forEach((formula) => {
        formula.color = palette.colors.formula.toLowerCase();
      });
    });
    const before = useProjectStore.getState().project;
    useDocumentStore.getState().markClean(before);
    history.clear();
    useProjectStore.getState().update((draft) => {
      draft.meta.name = 'Future';
    });
    history.undo();
    const preview = command.preview()!;
    expect(command.confirm(preview).status).toBe('noop');
    expect(useProjectStore.getState().project).toBe(before);
    expect(useDocumentStore.getState().dirty).toBe(false);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
  });

  it('cancels a real gesture before preview and excludes its transient objects and tracks', () => {
    const { project, command } = setup();
    const transient = createFormula({ name: 'Transient' });
    const track = createTrack('Transient');
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.tracks.push(track);
      draft.formulas.push(transient);
      draft.clips.push(createClip(transient.id, track.id, 0, 3));
    });
    const preview = command.preview()!;
    expect(gesture.active).toBe(false);
    expect(useProjectStore.getState().project).toBe(project);
    expect(preview.plan.changes.map((change) => change.id)).toEqual(
      project.formulas.map((formula) => formula.id),
    );
    expect(command.confirm(preview).status).toBe('applied');
    gesture.update((draft) => {
      draft.formulas.push(transient);
    });
    gesture.end();
    expect(useProjectStore.getState().project.formulas).toHaveLength(2);
    history.undo();
    expect(useProjectStore.getState().project).toBe(project);
    expect(history.canUndo()).toBe(false);
  });

  it('aborts stale confirmation after independent-edit cancellation retains a new lock', () => {
    const { project, command } = setup();
    const preview = command.preview()!;
    const gesture = history.beginGesture(() => {
      useProjectStore.getState().amend((draft) => {
        draft.meta.name = project.meta.name;
        draft.tracks[0]!.locked = true;
      });
      gesture.finishCancellation();
    });
    gesture.update((draft) => {
      draft.meta.name = 'Transient';
    });

    const result = command.confirm(preview);

    expect(result.status).toBe('stale');
    expect(gesture.active).toBe(false);
    const afterCancellation = useProjectStore.getState().project;
    expect(afterCancellation.meta.background).toBe(project.meta.background);
    expect(afterCancellation.formulas).toEqual(project.formulas);
    expect(afterCancellation.tracks[0]!.locked).toBe(true);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    if (result.status !== 'stale') throw new Error('Expected a refreshed preview');
    expect(result.preview!.plan.skipped).toEqual([
      { id: project.formulas[0]!.id, name: project.formulas[0]!.name, reasons: ['locked-track'] },
    ]);
    expect(result.preview!.plan.changes).toHaveLength(1);
    expect(command.confirm(result.preview!).status).toBe('applied');
    expect(useProjectStore.getState().project.formulas[0]).toEqual(project.formulas[0]);
    history.undo();
    expect(useProjectStore.getState().project).toBe(afterCancellation);
  });

  it('invalidates an edited then undone project even when its original reference returns', () => {
    const { project, command } = setup();
    const preview = command.preview()!;
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    history.undo();
    expect(useProjectStore.getState().project).toBe(project);
    expect(command.isCurrent(preview)).toBe(false);
    const result = command.confirm(preview);
    expect(result.status).toBe('stale');
    expect(useProjectStore.getState().project).toBe(project);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
  });

  it('refreshes a changed palette revision before applying its new snapshot', () => {
    const { project, command, select } = setup();
    const preview = command.preview()!;
    const next = {
      ...palette,
      revision: 2,
      displayName: 'Revised',
      colors: { ...palette.colors, formula: '#FF0000' },
    };
    select(next);
    const result = command.confirm(preview);
    expect(result.status).toBe('stale');
    expect(useProjectStore.getState().project).toBe(project);
    if (result.status !== 'stale') throw new Error('Expected a refreshed preview');
    expect(result.preview!.palette.displayName).toBe('Revised');
    expect(command.confirm(result.preview!).status).toBe('applied');
    expect(useProjectStore.getState().project.formulas[0]!.color).toBe('#FF0000');
  });

  it('does not apply a deleted palette or an old background choice', () => {
    const { project, command, select } = setup();
    const withBackground = command.preview()!;
    command.preview(false);
    expect(command.confirm(withBackground).status).toBe('stale');
    expect(useProjectStore.getState().project).toBe(project);
    const latest = command.preview()!;
    select(null);
    expect(command.confirm(latest)).toEqual({ status: 'stale', preview: null });
    expect(useProjectStore.getState().project).toBe(project);
    expect(history.canUndo()).toBe(false);
  });

  it.each(['load', 'same-reference-load', 'session', 'cancel-callback'] as const)(
    'cancels ownership after %s, including a replacement that reuses object IDs',
    (replacement) => {
      const { project, command } = setup();
      const preview = command.preview()!;
      const next = replacement === 'same-reference-load' ? project : structuredClone(project);
      if (replacement !== 'same-reference-load') next.formulas[0]!.name = 'Replacement object';
      if (replacement === 'session') {
        useDocumentStore.getState().beginDocument(next, { fileName: 'new.mfe.json', handle: null });
      } else if (replacement === 'cancel-callback') {
        const gesture = history.beginGesture(() => {
          loadProject(next);
          useDocumentStore.getState().beginDocument(next, { fileName: null, handle: null });
          gesture.finishCancellation();
        });
      } else loadProject(next);

      expect(command.confirm(preview).status).toBe('cancelled');
      expect(useProjectStore.getState().project.formulas[0]!.color).toBe(
        project.formulas[0]!.color,
      );
      expect(useProjectStore.getState().project.meta.background).toBe(project.meta.background);
      expect(history.canUndo()).toBe(false);
    },
  );
});
