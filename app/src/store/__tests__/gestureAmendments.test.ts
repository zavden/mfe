// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createMockEngine } from '../../test/mockEngine';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createShapeAttach,
  createShapeFormula,
  defaultIntro,
  defaultOutro,
} from '../../model';
import {
  history,
  loadProject,
  startAttachSync,
  startRenderSync,
  useProjectStore,
  useRenderStore,
} from '../index';
import { startDocumentTracking, useDocumentStore } from '../../ui/project/documentStore';

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
let stopRender = () => {};
let stopAttach = () => {};
let stopDocument = () => {};
afterEach(() => {
  stopDocument();
  stopAttach();
  stopRender();
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
});

it.each(['cancel', 'commit'] as const)(
  'keeps a target-scale gesture active across real async shape-render amendments, then %s',
  async (finish) => {
    const p = createEmptyProject();
    const formula = createFormula({ name: 'host', source: 'xxxx' });
    const shape = createShapeFormula({ name: 'fitted', shape: 'box' });
    const phases = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const host = createClip(formula.id, p.tracks[0]!.id, 0, 6, phases);
    const fitted = createClip(shape.id, p.tracks[1]!.id, 0, 6, {
      ...phases,
      attach: createShapeAttach(host.id, 'all', 0.1),
    });
    p.formulas = [formula, shape];
    p.clips = [host, fitted];
    loadProject(p);
    stopRender = startRenderSync(createMockEngine());
    stopAttach = startAttachSync();
    await settle();
    await settle();
    history.clear();
    const baseline = useProjectStore.getState().project;
    useDocumentStore.getState().markClean(baseline);
    stopDocument = startDocumentTracking();
    const before = baseline.formulas.find((f) => f.id === shape.id)!;
    expect(before.kind).toBe('shape');
    const owner = history.beginGesture();
    owner.update((draft) => {
      draft.clips[0]!.initial.scale = 2;
    });
    await settle();
    await settle();
    const grown = useProjectStore.getState().project.formulas.find((f) => f.id === shape.id)!;
    expect(owner.active).toBe(true);
    expect(useDocumentStore.getState().dirty).toBe(true);
    if (before.kind !== 'shape' || grown.kind !== 'shape') throw new Error('shape fixture');
    expect(grown.width).toBeGreaterThan(before.width);
    expect(grown.snapshot?.key).not.toBe(before.snapshot?.key);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    if (finish === 'commit') owner.end();
    else owner.cancel();
    if (finish === 'commit') history.undo();
    await settle();
    await settle();
    expect(useProjectStore.getState().project.clips[0]!.initial.scale).toBe(1);
    expect(useProjectStore.getState().project.formulas.find((f) => f.id === shape.id)).toEqual(
      before,
    );
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(finish === 'commit');
    expect(useDocumentStore.getState().dirty).toBe(false);
    if (finish === 'commit') {
      history.redo();
      await settle();
      await settle();
      expect(useProjectStore.getState().project.clips[0]!.initial.scale).toBe(2);
      expect(useProjectStore.getState().project.formulas.find((f) => f.id === shape.id)).toEqual(
        grown,
      );
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
      expect(useDocumentStore.getState().dirty).toBe(true);
    }
  },
);
