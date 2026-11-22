// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanionState } from '../../engine';
import { createEmptyProject, createFormula, createTextFormula } from '../../model';
import { loadProject, useProjectStore } from '../projectStore';
import { startTextPreparation } from '../textPreparation';

function fakeEngine() {
  let listener: (state: CompanionState) => void = () => undefined;
  return {
    prepareText: vi.fn<(target: 'ce' | 'gl') => void>(),
    onCompanionChange: (next: (state: CompanionState) => void) => {
      listener = next;
      return () => {
        listener = () => undefined;
      };
    },
    companionChanged: () => listener({ status: 'offline' }),
  };
}

let stop: (() => void) | undefined;

beforeEach(() => loadProject(createEmptyProject()));
afterEach(() => {
  stop?.();
  stop = undefined;
});

const withText = (target: 'ce' | 'gl' = 'ce') => {
  const project = createEmptyProject();
  project.meta.target = target;
  project.formulas.push(createTextFormula({ source: 'Title' }));
  return project;
};

describe('text preparation', () => {
  it('asks nothing for a project without font text', () => {
    const engine = fakeEngine();
    stop = startTextPreparation(engine);
    useProjectStore.getState().update((draft) => {
      draft.formulas.push(createFormula({ name: 'f', source: 'x' }));
    });
    engine.companionChanged();
    expect(engine.prepareText).not.toHaveBeenCalled();
  });

  it('asks for the project’s library when the project has a font text', () => {
    loadProject(withText('gl'));
    const engine = fakeEngine();
    stop = startTextPreparation(engine);
    expect(engine.prepareText).toHaveBeenCalledWith('gl');
  });

  it('asks when a text comes into the project, when another one is opened, and when the library changes', () => {
    const engine = fakeEngine();
    stop = startTextPreparation(engine);
    useProjectStore.getState().update((draft) => {
      draft.formulas.push(createTextFormula({ source: 'New' }));
    });
    expect(engine.prepareText).toHaveBeenLastCalledWith('ce');
    loadProject(withText('gl'));
    expect(engine.prepareText).toHaveBeenLastCalledWith('gl');
    useProjectStore.getState().update((draft) => {
      draft.meta.target = 'ce';
    });
    expect(engine.prepareText).toHaveBeenLastCalledWith('ce');
  });

  it('asks again when the companion changes: one may have just started', () => {
    loadProject(withText());
    const engine = fakeEngine();
    stop = startTextPreparation(engine);
    engine.prepareText.mockClear();
    engine.companionChanged();
    expect(engine.prepareText).toHaveBeenCalledWith('ce');
  });

  it('asks no more once stopped', () => {
    const engine = fakeEngine();
    startTextPreparation(engine)();
    loadProject(withText());
    engine.companionChanged();
    expect(engine.prepareText).not.toHaveBeenCalled();
  });
});
