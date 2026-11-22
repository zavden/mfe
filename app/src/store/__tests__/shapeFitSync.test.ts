// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEngine } from '../../test/mockEngine';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createShapeAttach,
  createShapeFormula,
  defaultIntro,
  defaultOutro,
  parseProject,
  serializeProject,
} from '../../model';
import { attachmentIssues } from '../../scene';
import { detachClip, setAttachBuff } from '../../ui/animations/braceActions';
import { setShapeKind } from '../../ui/animations/shapeActions';
import {
  loadProject,
  startAttachSync,
  startRenderSync,
  useProjectStore,
  useRenderStore,
} from '../index';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const project = () => useProjectStore.getState().project;
const issues = () => attachmentIssues(project(), useRenderStore.getState().resolved);
const roundTrips = () => expect(parseProject(serializeProject(project())).ok).toBe(true);
let stopRender: () => void;
let stopAttach: () => void;

beforeEach(() => {
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
  stopRender = startRenderSync(createMockEngine());
  stopAttach = startAttachSync();
});

afterEach(() => {
  stopAttach();
  stopRender();
});

describe.each(['ce', 'gl'] as const)('shape fit sync (%s)', (target) => {
  it.each(['box', 'circle'] as const)(
    'preserves %s geometry through invalid gap, undo/redo and detach',
    async (shape) => {
      const p = createEmptyProject();
      p.meta.target = target;
      const host = createFormula({ name: 'host', source: 'xxxxxxxx' });
      const fitted = createShapeFormula({ name: 'fitted', shape });
      const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
      const a = createClip(host.id, p.tracks[0]!.id, 0, 6, none);
      const b = createClip(fitted.id, p.tracks[1]!.id, 0, 6, {
        ...none,
        attach: createShapeAttach(a.id, 'all', -0.1),
      });
      p.formulas.push(host, fitted);
      p.clips.push(a, b);
      loadProject(p);
      await flush();
      await flush();
      const before = project().formulas[1];
      roundTrips();
      expect(issues()).toEqual([]);
      const steps = useProjectStore.temporal.getState().pastStates.length;

      setAttachBuff(b.id, -5);
      expect(project().formulas[1]).toEqual(before);
      expect(issues()).toMatchObject([{ severity: 'error', code: 'attach-shape-fit' }]);
      expect(useProjectStore.temporal.getState().pastStates.length).toBe(steps + 1);
      roundTrips();
      useProjectStore.temporal.getState().undo();
      expect(issues()).toEqual([]);
      roundTrips();
      useProjectStore.temporal.getState().redo();
      expect(project().formulas[1]).toEqual(before);
      expect(issues()).toHaveLength(1);
      roundTrips();

      setAttachBuff(b.id, -0.1);
      useProjectStore.getState().update((draft) => {
        const formula = draft.formulas[0]!;
        formula.source = 'x';
        formula.fontSize = 4;
      });
      await flush();
      await flush();
      expect(project().formulas[1]).toEqual(before);
      expect(issues()).toHaveLength(1);
      roundTrips();

      setShapeKind(fitted.id, 'underline');
      await flush();
      expect(issues()).toEqual([]);
      roundTrips();
      setShapeKind(fitted.id, shape);
      await flush();
      const kept = project().formulas[1];
      expect(issues()).toHaveLength(1);
      detachClip(b.id);
      expect(issues()).toEqual([]);
      expect(project().formulas[1]).toEqual(kept);
      roundTrips();
    },
  );
});
