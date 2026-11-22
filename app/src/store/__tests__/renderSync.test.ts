// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  renderKey,
  type CompanionState,
  type FormulaEngine,
  type RenderRequest,
  type RenderResult,
} from '../../engine';
import { createMockEngine } from '../../test/mockEngine';
import { createClip, createEmptyProject, createFormula, createRelation } from '../../model';

/** What a request asks to typeset, whatever its kind. */
const sourceOf = (request: RenderRequest) =>
  request.kind === 'math' ? request.latex : request.kind === 'tex' ? request.source : 'brace';
import {
  history,
  loadProject,
  onProjectAmended,
  startRenderSync,
  useProjectStore,
  useRenderStore,
  useSyncWarnings,
} from '../index';

/** Wait for pending promise callbacks. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface TestEngine extends FormulaEngine {
  calls: RenderRequest[];
  setOnline(online: boolean): void;
  /** Hold renders until `release()`; resolves in the order given to `release`. */
  hold(): { release(order?: number[]): Promise<void> };
}

/** The mock engine, but able to impersonate the LaTeX backend while "online". */
function makeEngine(): TestEngine {
  const inner = createMockEngine();
  const listeners = new Set<(state: CompanionState) => void>();
  let online = false;
  let held:
    | {
        request: RenderRequest;
        resolve(result: RenderResult): void;
        result: Promise<RenderResult>;
      }[]
    | null = null;
  const base = async (request: RenderRequest): Promise<RenderResult> => {
    const useLatex = request.prefer === 'latex' || (request.prefer === 'auto' && online);
    const result = await inner.render({ ...request, prefer: 'mathjax' });
    if (!result.ok || !useLatex) return result;
    const render = { ...result.render, backend: 'latex' as const, exact: true };
    render.key = renderKey(request, 'latex', 'test');
    return { ok: true, render };
  };
  const engine: TestEngine = {
    version: 'test',
    calls: [],
    async render(request) {
      engine.calls.push(request);
      if (!held) return base(request);
      let resolve!: (result: RenderResult) => void;
      const result = new Promise<RenderResult>((r) => (resolve = r));
      held.push({ request, resolve, result });
      return result;
    },
    companion: () =>
      online
        ? ({
            status: 'online',
            health: { capabilities: { latex: true, dvisvgm: true } },
          } as unknown as CompanionState)
        : { status: 'offline' },
    onCompanionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOnline(value) {
      online = value;
      for (const l of listeners) l(engine.companion());
    },
    hold() {
      held = [];
      const pending = held;
      return {
        async release(order) {
          const indices = order ?? pending.map((_, i) => i);
          for (const i of indices) {
            const entry = pending[i]!;
            entry.resolve(await base(entry.request));
          }
          held = null;
          await settle();
        },
      };
    },
  };
  return engine;
}

const project = () => useProjectStore.getState().project;
const formula = (id: string) => project().formulas.find((f) => f.id === id)!;
const entry = (id: string) => useRenderStore.getState().entries[id];

function addFormula(latex: string, fields: Parameters<typeof createFormula>[0] = {}) {
  const f = createFormula({ name: `f${project().formulas.length + 1}`, source: latex, ...fields });
  useProjectStore.getState().update((draft) => {
    draft.formulas.push(f);
  });
  return f;
}

let stop: (() => void) | null = null;
let engine: TestEngine;

beforeEach(() => {
  loadProject(createEmptyProject());
  useRenderStore.setState({ prefer: 'auto' });
  useRenderStore.getState().retain([]);
  useSyncWarnings.getState().clear();
  engine = makeEngine();
  stop = startRenderSync(engine);
});

afterEach(() => {
  stop?.();
  stop = null;
});

describe('render sync', () => {
  it('renders new formulas, taking their snapshot from the render without an undo step', async () => {
    const f = addFormula('a+b');
    expect(entry(f.id)?.status).toBe('loading');
    await settle();

    const e = entry(f.id)!;
    expect(e.status).toBe('ok');
    expect(e.resolved?.canonToRender).toEqual([0, 1, 2]);
    const snapshot = formula(f.id).snapshot!;
    expect(snapshot.glyphs.map((g) => g.label)).toEqual(['a', '+', 'b']);
    expect(snapshot.key).toBe(e.resolved!.render.key);
    // Only the user's own edit is undoable; the snapshot was amended in.
    history.undo();
    expect(project().formulas).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
  });

  it('leaves empty LaTeX idle without calling the engine', async () => {
    const f = addFormula('   ');
    await settle();
    expect(entry(f.id)).toEqual({ status: 'idle', resolved: null, error: null });
    expect(engine.calls).toHaveLength(0);
  });

  it('keeps the previous resolution while loading and after an error', async () => {
    const f = addFormula('a+b');
    await settle();
    const first = entry(f.id)!.resolved;
    expect(first).not.toBeNull();

    useProjectStore.getState().update((d) => {
      d.formulas[0]!.source = '';
    });
    expect(entry(f.id)).toEqual({ status: 'idle', resolved: null, error: null });

    useProjectStore.getState().update((d) => {
      d.formulas[0]!.source = 'x';
    });
    expect(entry(f.id)?.status).toBe('loading');
    await settle();
    expect(entry(f.id)?.status).toBe('ok');

    // An error keeps the last good render.
    const before = entry(f.id)!.resolved;
    const original = engine.render.bind(engine);
    engine.render = async (request) =>
      sourceOf(request) === 'broken'
        ? {
            ok: false,
            error: { message: 'Undefined control sequence', backend: 'mathjax', line: 1 },
          }
        : original(request);
    useProjectStore.getState().update((d) => {
      d.formulas[0]!.source = 'broken';
    });
    await settle();
    const failed = entry(f.id)!;
    expect(failed.status).toBe('error');
    expect(failed.error?.message).toMatch(/Undefined/);
    expect(failed.resolved).toBe(before);
  });

  it('ignores responses of superseded requests', async () => {
    const f = addFormula('a');
    await settle();
    const gate = engine.hold();
    useProjectStore.getState().update((d) => {
      d.formulas[0]!.source = 'a+b';
    });
    useProjectStore.getState().update((d) => {
      d.formulas[0]!.source = 'a+b+c';
    });
    expect(sourceOf(engine.calls.at(-1)!)).toBe('a+b+c');
    await gate.release([1, 0]); // the newer response first, then the stale one
    const e = entry(f.id)!;
    expect(e.status).toBe('ok');
    expect(e.resolved!.render.glyphs).toHaveLength(5);
    expect(formula(f.id).snapshot!.glyphs).toHaveLength(5);
  });

  it('ignores the response of a request made before the formula was deleted and undone', async () => {
    const gate = engine.hold();
    const f = addFormula('a'); // request 0, never answered until the end
    useProjectStore.getState().update((d) => {
      d.formulas[0]!.source = 'a+b'; // request 1
    });
    useProjectStore.getState().update((d) => {
      d.formulas.splice(0, 1); // the formula and its tracker go
    });
    history.undo(); // the formula is back with a+b: a new tracker, request 2
    expect(engine.calls.map(sourceOf)).toEqual(['a', 'a+b', 'a+b']);
    await gate.release([2, 0]); // the current render first, then the one of the deleted tracker
    const e = entry(f.id)!;
    expect(e.status).toBe('ok');
    expect(e.resolved!.formula.source).toBe('a+b');
    expect(e.resolved!.render.glyphs).toHaveLength(3);
    expect(formula(f.id).snapshot!.glyphs).toHaveLength(3);
  });

  it('re-requests when the target, preamble, font size, packages or preference change', async () => {
    addFormula('a+b');
    await settle();
    const count = engine.calls.length;
    const change = (recipe: (d: ReturnType<typeof project>) => void) => {
      useProjectStore.getState().update(recipe);
    };
    change((d) => {
      d.meta.target = 'gl';
    });
    change((d) => {
      d.meta.preamble = '\\newcommand{\\x}{x}';
    });
    change((d) => {
      d.formulas[0]!.fontSize = 60;
    });
    change((d) => {
      if (d.formulas[0]!.kind === 'math') d.formulas[0]!.packages = ['physics'];
    });
    useRenderStore.getState().setPrefer('mathjax');
    expect(engine.calls.length).toBe(count + 5);
    expect(engine.calls.at(-1)).toMatchObject({
      target: 'gl',
      fontSize: 60,
      packages: ['physics'],
      prefer: 'mathjax',
      preamble: '\\newcommand{\\x}{x}',
    });
    await settle();
  });

  it('re-resolves without rendering when only other fields change', async () => {
    const f = addFormula('a+b');
    await settle();
    const calls = engine.calls.length;
    useProjectStore.getState().update((d) => {
      d.formulas[0]!.name = 'renamed';
      d.formulas[0]!.glyphColors = { '1': '#FF0000' };
    });
    expect(engine.calls.length).toBe(calls);
    const e = entry(f.id)!;
    expect(e.status).toBe('ok');
    expect(e.resolved!.formula.name).toBe('renamed');
    expect(e.resolved!.formula.glyphColors).toEqual({ '1': '#FF0000' });
    expect(useRenderStore.getState().resolved.get(f.id)).toBe(e.resolved);
  });

  it('forgets deleted formulas', async () => {
    const f = addFormula('a');
    await settle();
    useProjectStore.getState().update((d) => {
      d.formulas = [];
    });
    expect(entry(f.id)).toBeUndefined();
    expect(useRenderStore.getState().resolved.size).toBe(0);
  });

  describe('editing the LaTeX', () => {
    it('remaps glyph colours and relations in one amend, then undo restores everything', async () => {
      const f = addFormula('a+b');
      await settle();
      // Colour the "b" (canonical 2) and relate it from another clip.
      const other = addFormula('c');
      await settle();
      useProjectStore.getState().update((d) => {
        d.formulas.find((x) => x.id === f.id)!.glyphColors = { '2': '#FF0000' };
        const track = d.tracks[0]!.id;
        const track2 = d.tracks[1]!.id;
        const a = createClip(f.id, track, 0, 4);
        const b = createClip(other.id, track2, 2, 6);
        d.clips.push(a, b);
        d.relations.push(
          createRelation(b.id, a.id, { pairs: [{ from: [0], to: [2], style: null }], offset: 0 }),
        );
      });
      const oldKey = formula(f.id).snapshot!.key;
      const edited = { source: 'x+a+b' };
      useProjectStore.getState().update((d) => {
        d.formulas.find((x) => x.id === f.id)!.source = edited.source;
      });
      await settle();

      const after = formula(f.id);
      expect(after.snapshot!.glyphs.map((g) => g.label)).toEqual(['x', '+', 'a', '+', 'b']);
      expect(after.glyphColors).toEqual({ '4': '#FF0000' }); // "b" moved from 2 to 4
      expect(project().relations[0]!.pairs[0]!.to).toEqual([4]);
      // The step is published for an editor that holds indices of the old snapshot.
      expect(useRenderStore.getState().transitions[f.id]).toEqual({
        from: oldKey,
        to: after.snapshot!.key,
        map: [2, 3, 4],
      });
      expect(useSyncWarnings.getState().warnings[f.id]).toBeUndefined();

      // One undo reverts the edit together with the remap and the new snapshot.
      history.undo();
      await settle();
      const undone = formula(f.id);
      expect(undone.source).toBe('a+b');
      expect(undone.snapshot!.glyphs.map((g) => g.label)).toEqual(['a', '+', 'b']);
      expect(undone.glyphColors).toEqual({ '2': '#FF0000' });
      expect(project().relations[0]!.pairs[0]!.to).toEqual([2]);
      expect(entry(f.id)!.status).toBe('ok');

      // Redo restores the amended state, and the sync leaves it alone.
      history.redo();
      await settle();
      expect(formula(f.id).glyphColors).toEqual({ '4': '#FF0000' });
      expect(formula(f.id).snapshot!.glyphs).toHaveLength(5);
    });

    it('warns when glyphs with colours are dropped', async () => {
      const f = addFormula('a+b', { glyphColors: { '2': '#00FF00' } });
      await settle();
      useProjectStore.getState().update((d) => {
        d.formulas[0]!.source = 'a+';
      });
      await settle();
      expect(formula(f.id).glyphColors).toEqual({});
      const warning = useSyncWarnings.getState().warnings[f.id];
      expect(warning).toMatchObject({ cause: 'edit', droppedColors: 1 });

      // A further edit clears the warning; dismiss removes it too.
      useSyncWarnings.getState().dismiss(f.id);
      expect(useSyncWarnings.getState().warnings[f.id]).toBeUndefined();
    });

    it('treats a package change as an edit', async () => {
      const f = addFormula('a+b', { glyphColors: { '1': '#00FF00' } });
      await settle();
      useProjectStore.getState().update((d) => {
        if (d.formulas[0]!.kind === 'math') d.formulas[0]!.packages = ['physics'];
      });
      await settle();
      // Same glyphs, so colours stay put, and the snapshot key moved to the new render.
      expect(formula(f.id).glyphColors).toEqual({ '1': '#00FF00' });
      expect(formula(f.id).snapshot!.key).toBe(entry(f.id)!.resolved!.render.key);
    });

    it('does not treat loading a project as an edit', async () => {
      const f = addFormula('a+b', { glyphColors: { '1': '#00FF00' } });
      await settle();
      const loaded = structuredClone(project());
      loaded.formulas[0]!.source = 'a+b+c';
      loaded.formulas[0]!.snapshot = null;
      loadProject(loaded);
      await settle();
      // Snapshot taken from the new render; colours untouched (no 'edit' remap against old data).
      expect(formula(f.id).snapshot!.glyphs).toHaveLength(5);
      expect(formula(f.id).glyphColors).toEqual({ '1': '#00FF00' });
      expect(history.canUndo()).toBe(false);
    });
  });

  describe('fidelity changes', () => {
    it('re-bases a MathJax snapshot on the LaTeX render when the companion comes online', async () => {
      const f = addFormula('a+b', { glyphColors: { '1': '#FF0000' } });
      await settle();
      const mathjaxKey = formula(f.id).snapshot!.key;
      expect(formula(f.id).snapshot!.backend).toBe('mathjax');

      engine.setOnline(true);
      await settle();
      const snapshot = formula(f.id).snapshot!;
      expect(snapshot.backend).toBe('latex');
      expect(snapshot.key).not.toBe(mathjaxKey);
      expect(formula(f.id).glyphColors).toEqual({ '1': '#FF0000' }); // same index: identical layout
      expect(entry(f.id)!.resolved!.render.backend).toBe('latex');
      expect(entry(f.id)!.resolved!.confidence).toBe(1);
      expect(history.canUndo()).toBe(true); // only the addFormula step, never the amend
      history.undo();
      expect(project().formulas).toHaveLength(0);
    });

    it('keeps an exact snapshot when only a MathJax render is available', async () => {
      engine.setOnline(true);
      const f = addFormula('a+b');
      await settle();
      const exact = formula(f.id).snapshot!;
      expect(exact.backend).toBe('latex');

      engine.setOnline(false);
      await settle();
      expect(formula(f.id).snapshot).toBe(exact);
      const e = entry(f.id)!;
      expect(e.status).toBe('ok');
      expect(e.resolved!.render.backend).toBe('mathjax');
      expect(e.resolved!.canonToRender).toEqual([0, 1, 2]); // positional match, same layout
      expect(history.canUndo()).toBe(true);
    });

    it('re-bases on a font size change and keeps references', async () => {
      const f = addFormula('a+b', { glyphColors: { '2': '#FF0000' } });
      await settle();
      const key = formula(f.id).snapshot!.key;
      useProjectStore.getState().update((d) => {
        d.formulas[0]!.fontSize = 72;
      });
      await settle();
      expect(formula(f.id).snapshot!.key).not.toBe(key);
      expect(formula(f.id).glyphColors).toEqual({ '2': '#FF0000' });
    });
  });

  it('notifies amend listeners only for amendments', async () => {
    const seen: number[] = [];
    const off = onProjectAmended((before, after) =>
      seen.push(after.formulas.length - before.formulas.length),
    );
    addFormula('a');
    await settle();
    off();
    expect(seen).toEqual([0]); // the snapshot amend, not the user's addFormula
  });

  it('stops processing after unsubscribe', async () => {
    stop?.();
    stop = null;
    const calls = engine.calls.length;
    addFormula('a');
    await settle();
    expect(engine.calls.length).toBe(calls);
  });
});
