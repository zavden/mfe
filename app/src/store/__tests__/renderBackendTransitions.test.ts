// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKEND_VERSIONS,
  createEngine,
  renderKey,
  type CompanionState,
  type Engine,
  type FormulaEngine,
  type RenderRequest,
  type RenderResult,
} from '../../engine';
import { HEALTH } from '../../engine/__tests__/fakeCompanion';
import { createEmptyProject, createFormula, type RenderBackend } from '../../model';
import { history, loadProject, useProjectStore } from '../projectStore';
import { startRenderSync, useSyncWarnings } from '../renderSync';
import { useRenderStore } from '../renderStore';

interface SwitchingEngine extends FormulaEngine {
  setBackend(backend: RenderBackend): void;
}

let base: Engine;
let engine: SwitchingEngine;
let stop: (() => void) | undefined;
const formula = () => useProjectStore.getState().project.formulas[0]!;
const entry = () => useRenderStore.getState().entries[formula().id]!;

async function settled() {
  for (let i = 0; i < 100 && entry()?.status !== 'ok'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(entry()?.status).toBe('ok');
}

/** Controlled backend order with real MathJax geometry; renderCorrespondence.test covers the
 * production exact SVG. Reversing the exact order makes cross-backend edit matching invalid. */
function switchingEngine(initial: RenderBackend): SwitchingEngine {
  let backend = initial;
  const listeners = new Set<(state: CompanionState) => void>();
  const state = (): CompanionState =>
    backend === 'latex' ? { status: 'online', health: HEALTH } : { status: 'offline' };
  return {
    version: 'controlled-order',
    companion: state,
    onCompanionChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setBackend: (next) => {
      backend = next;
      for (const listener of listeners) listener(state());
    },
    async render(request) {
      const chosen = request.prefer === 'auto' ? backend : request.prefer;
      const result = await base.render({ ...request, prefer: 'mathjax' });
      if (!result.ok || chosen === 'mathjax') return result;
      return {
        ok: true,
        render: {
          ...result.render,
          backend: 'latex',
          exact: true,
          key: renderKey(request, 'latex', BACKEND_VERSIONS.latex),
          glyphs: [...result.render.glyphs].reverse().map((glyph, index) => ({ ...glyph, index })),
        },
      };
    },
  };
}

async function mount(source: string, backend: RenderBackend, marked = 'b') {
  const value = createEmptyProject();
  value.formulas.push(createFormula({ source }));
  loadProject(value);
  engine = switchingEngine(backend);
  stop = startRenderSync(engine);
  await settled();
  const index = formula().snapshot!.glyphs.findIndex((glyph) => glyph.label === marked);
  expect(index).toBeGreaterThanOrEqual(0);
  useProjectStore.getState().update((draft) => {
    draft.formulas[0]!.glyphColors = { [index]: '#FF0000' };
  });
  return formula().snapshot!;
}

function edit(source: string) {
  useProjectStore.getState().update((draft) => {
    draft.formulas[0]!.source = source;
  });
}

function markedLabel() {
  const indices = Object.keys(formula().glyphColors).map(Number);
  expect(indices).toHaveLength(1);
  return formula().snapshot!.glyphs[indices[0]!]!.label;
}

beforeEach(() => {
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
  useRenderStore.getState().setPrefer('auto');
  useSyncWarnings.getState().clear();
  base = createEngine({ companion: { fetch: null, autoStart: false } });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  base.dispose();
});

describe('composed backend and source changes', () => {
  it.each(['latex', 'mathjax'] as const)(
    'preserves a denominator when the source and %s backend change together',
    async (backend) => {
      const original = await mount('\\frac{a}{b}', backend);
      engine.setBackend(backend === 'latex' ? 'mathjax' : 'latex');
      edit('\\frac{a}{c}'); // the intermediate old-source render has not been applied
      await settled();
      expect(markedLabel()).toBe('c');
      history.undo();
      await settled();
      expect(markedLabel()).toBe('b');
      if (backend === 'latex') expect(formula().snapshot!.key).toBe(original.key);
      history.redo();
      await settled();
      expect(markedLabel()).toBe('c');
    },
  );

  it.each([
    ['fraction substitution', '\\frac{a}{b}', '\\frac{a}{c}', 'c'],
    ['fraction insertion', '\\frac{a}{b}', '\\frac{a}{b+d}', 'b'],
    ['fraction move', '\\frac{a}{b}', '\\frac{b}{a}', 'b'],
    ['radical substitution', '\\sqrt{a+b}', '\\sqrt{a+c}', 'c'],
    ['script substitution', 'a_b^c', 'a_d^c', 'd'],
  ])(
    'preserves the marked occurrence through fallback then %s',
    async (_name, from, to, expected) => {
      await mount(from!, 'latex');
      engine.setBackend('mathjax');
      await settled();
      edit(to!);
      await settled();
      expect(markedLabel()).toBe(expected);
      expect(useSyncWarnings.getState().warnings[formula().id]?.droppedColors ?? 0).toBe(0);
    },
  );

  it('drops a genuinely removed denominator and reports its lost color', async () => {
    await mount('\\frac{a}{b}', 'latex');
    engine.setBackend('mathjax');
    await settled();
    edit('a');
    await settled();
    expect(formula().glyphColors).toEqual({});
    expect(useSyncWarnings.getState().warnings[formula().id]).toMatchObject({
      cause: 'edit',
      droppedColors: 1,
    });
  });

  it('retains authored data when an old-source bridge fails, then remaps when exact rendering returns', async () => {
    const original = await mount('\\frac{a}{b}', 'latex');
    const render = engine.render.bind(engine);
    engine.render = (request) =>
      request.prefer === 'mathjax' && request.kind === 'math' && request.latex === '\\frac{a}{b}'
        ? Promise.resolve({
            ok: false,
            error: { backend: 'mathjax', message: 'Old source unsupported' },
          })
        : render(request);
    const colors = formula().glyphColors;
    engine.setBackend('mathjax');
    edit('\\frac{a}{c}');
    await settled();
    expect(formula().snapshot!.key).toBe(original.key);
    expect(formula().glyphColors).toEqual(colors);
    expect(useSyncWarnings.getState().warnings[formula().id]).toMatchObject({
      confidence: 0,
      droppedColors: 0,
    });
    engine.setBackend('latex');
    await settled();
    expect(markedLabel()).toBe('c');
    expect(formula().snapshot!.backend).toBe('latex');
    expect(useSyncWarnings.getState().warnings[formula().id]).toBeUndefined();
  });

  it('ignores a completed bridge from a superseded source edit', async () => {
    await mount('\\frac{a}{b}', 'latex');
    const render = engine.render.bind(engine);
    const pending: { request: RenderRequest; resolve: (result: RenderResult) => void }[] = [];
    engine.render = (request) =>
      request.prefer === 'mathjax' && request.kind === 'math' && request.latex === '\\frac{a}{b}'
        ? new Promise((resolve) => pending.push({ request, resolve }))
        : render(request);
    engine.setBackend('mathjax');
    edit('\\frac{a}{c}');
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    edit('\\frac{a}{d}');
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!.resolve(await render(pending[1]!.request));
    await settled();
    expect(markedLabel()).toBe('d');
    const current = formula().snapshot!.key;
    pending[0]!.resolve(await render(pending[0]!.request));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(formula().snapshot!.key).toBe(current);
    expect(markedLabel()).toBe('d');
  });

  it('does not reuse the old backend when the same-ID document loads during a backend switch', async () => {
    await mount('\\frac{a}{b}', 'latex');
    const render = engine.render.bind(engine);
    let held: RenderRequest | undefined;
    let release!: (result: RenderResult) => void;
    engine.render = (request) => {
      if (!held && request.prefer === 'auto') {
        held = request;
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return render(request);
    };
    engine.setBackend('mathjax');
    loadProject(structuredClone(useProjectStore.getState().project));
    try {
      await settled();
      expect(entry().resolved!.render.backend).toBe('mathjax');
      expect(markedLabel()).toBe('b');
    } finally {
      release(await render(held!));
    }
  });

  it('keeps exact canonical identity when only the project preamble changes while offline', async () => {
    const original = await mount('\\frac{a}{b}', 'latex', 'a');
    const colors = formula().glyphColors;
    engine.setBackend('mathjax');
    await settled();
    useProjectStore.getState().update((draft) => {
      draft.meta.preamble = '\\newcommand{\\unusedSetupOnly}{z}';
    });
    await settled();
    expect(formula().snapshot!.key).toBe(original.key);
    expect(formula().snapshot!.backend).toBe('latex');
    expect(formula().glyphColors).toEqual(colors);
    expect(markedLabel()).toBe('a');
  });
});
