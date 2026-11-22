// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  defaultIntro,
  defaultOutro,
} from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { createNewFormula } from '../../creator/formulaActions';
import { defaultPreferences, usePreferences } from '../../preferences';
import { addBraceLabel } from '../braceActions';

afterEach(() => usePreferences.setState(defaultPreferences()));

it('uses each standard scale for new brace labels and preserves existing labels through preferences and history', () => {
  const project = createEmptyProject();
  const brace = createBraceFormula({ name: 'brace', width: 2 });
  const clip = createClip(brace.id, project.tracks[0]!.id, 0, 6, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  project.formulas.push(brace);
  project.clips.push(clip);
  loadProject(project);
  useUiStore.getState().setTime(0);
  usePreferences.setState({ standardScale: { math: '1/2', tex: '3/2' } });
  const current = () => useProjectStore.getState().project;
  for (const [kind, size] of [
    ['math', 24],
    ['tex', 72],
  ] as const) {
    const ordinary = createNewFormula(kind);
    expect(current().formulas.find((f) => f.id === ordinary)!.fontSize).toBe(size);
    const steps = useProjectStore.temporal.getState().pastStates.length;
    const id = addBraceLabel(clip.id, kind)!;
    const labelClip = current().clips.find((c) => c.id === id)!;
    expect(current().formulas.find((f) => f.id === labelClip.formulaId)!.fontSize).toBe(size);
    expect(useProjectStore.temporal.getState().pastStates.length).toBe(steps + 1);
    useProjectStore.temporal.getState().undo();
    expect(current().clips.some((c) => c.id === id)).toBe(false);
    useProjectStore.temporal.getState().redo();
    expect(current().formulas.find((f) => f.id === labelClip.formulaId)!.fontSize).toBe(size);
  }
  const before = current();
  usePreferences.setState({ standardScale: { math: '2', tex: '1/3' } });
  expect(current()).toBe(before);
});
