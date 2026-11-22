// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCompanionClient,
  createEngine,
  renderRequestFor,
  toSnapshot,
  type Engine,
  type FormulaEngine,
  type FormulaRender,
} from '../../engine';
import { fakeCompanion } from '../../engine/__tests__/fakeCompanion';
import fracSvg from '../../engine/__tests__/fixtures/frac.svg?raw';
import {
  createAttach,
  createClip,
  createEmptyProject,
  createFormula,
  createMorph,
  createPartTransform,
  createRelation,
  createTexFormula,
  createTween,
  remapGlyphRefs,
  serializeProject,
  type Formula,
  type Project,
  type TexFormula,
} from '../../model';
import { openProjectText } from '../../ui/project/actions';
import { history, loadProject, useProjectStore } from '../projectStore';
import { startRenderSync, useSyncWarnings } from '../renderSync';
import { useRenderStore } from '../renderStore';

let engine: Engine;
let stop: (() => void) | undefined;
const project = () => useProjectStore.getState().project;
const formula = (id: string) => project().formulas.find((item) => item.id === id)!;
const entry = (id: string) => useRenderStore.getState().entries[id]!;
const labels = (render: FormulaRender) => render.glyphs.map((glyph) => glyph.label);

async function settled(id: string) {
  // Subscribe before checking so a synchronous completion cannot fall between the two.
  // Keep the same readiness assertion and timeout without paying a polling interval per edit.
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = useRenderStore.subscribe(check);
    const timer = setTimeout(() => {
      unsubscribe();
      try {
        expect(entry(id)?.status).toBe('ok');
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 1000);
    function check() {
      if (entry(id)?.status !== 'ok') return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
    check();
  });
}

async function mount(value: Project, renderer: FormulaEngine = engine) {
  loadProject(value);
  stop = startRenderSync(renderer);
  for (const item of value.formulas) await settled(item.id);
}

async function exactFraction(value: Formula, valueProject: Project) {
  const fake = fakeCompanion(() => ({
    ok: true,
    svg: fracSvg,
    cached: true,
    ms: 0,
    warnings: [],
    glyphs: [
      { label: 'a', kind: 'char', font: 'cmmi10', code: 97 },
      { label: '—', kind: 'rule', font: null, code: null },
      { label: 'b', kind: 'char', font: 'cmmi10', code: 98 },
    ],
  }));
  const exact = createEngine({
    companion: createCompanionClient({ fetch: fake.fetch, autoStart: false }),
  });
  try {
    const result = await exact.render(renderRequestFor(value, valueProject.meta, 'auto'));
    if (!result.ok) throw new Error(result.error.message);
    return result.render;
  } finally {
    exact.dispose();
  }
}

beforeEach(() => {
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
  useRenderStore.getState().setPrefer('mathjax');
  useSyncWarnings.getState().clear();
  engine = createEngine({ companion: { fetch: null, autoStart: false } });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  engine.dispose();
});

describe('unchanged text occurrences across reflow', () => {
  const cases = [
    {
      name: 'auto to narrow',
      width: null,
      next: { layout: { width: 2, align: 'left', lineSpacing: 1 } },
    },
    {
      name: 'narrow to auto',
      width: 2,
      next: { layout: { width: null, align: 'left', lineSpacing: 1 } },
    },
    {
      name: 'between wrapped widths',
      width: 2,
      next: { layout: { width: 1.3, align: 'left', lineSpacing: 1 } },
    },
    { name: 'font size at a fixed width', width: 2, next: { fontSize: 80 } },
    { name: 'alignment', width: 2, next: { layout: { width: 2, align: 'right', lineSpacing: 1 } } },
    {
      name: 'line spacing',
      width: 2,
      next: { layout: { width: 2, align: 'left', lineSpacing: 2.5 } },
    },
  ] satisfies { name: string; width: number | null; next: Partial<TexFormula> }[];

  it.each(cases)(
    'preserves each repeated-letter reference through $name and undo/redo',
    async ({ width, next }) => {
      const value = createEmptyProject();
      const text = createTexFormula({
        source: 'alpha beta gamma delta',
        layout: { width, align: 'left', lineSpacing: 1 },
      });
      const other = createFormula({ source: 'x' });
      value.formulas.push(text, other);
      await mount(value);
      useProjectStore.getState().update((draft) => {
        const current = draft.formulas.find((item) => item.id === text.id)!;
        current.glyphColors = Object.fromEntries(
          current.snapshot!.glyphs.map((_, index) => [
            String(index),
            `#${(0x100000 + index).toString(16)}`,
          ]),
        );
        current.hiddenGlyphs = [10]; // the first 'a' in gamma, not a nearby occurrence after reflow
        const a = createClip(text.id, draft.tracks[0]!.id, 0, 10);
        const b = createClip(other.id, draft.tracks[1]!.id, 1, 10);
        a.initial.glyphColors = { '10': '#112233' };
        a.actions.push(
          createPartTransform(2, [10]),
          createTween(4, 1, { glyphColors: { '18': '#445566' } }),
          createMorph(6, { pairs: [{ from: [0], to: [10], style: null }] }),
        );
        b.attach = createAttach(a.id, [10]);
        draft.clips.push(a, b);
        draft.relations.push(
          createRelation(a.id, b.id, { pairs: [{ from: [10], to: [0], style: null }] }),
        );
      });
      const before = structuredClone(project());
      const beforeFormula = before.formulas.find((item) => item.id === text.id)!;
      const occurrenceLabels = beforeFormula.snapshot!.glyphs.map((glyph) => glyph.label);
      expect(occurrenceLabels[10]).toBe('a');
      useProjectStore.getState().update((draft) => {
        Object.assign(
          draft.formulas.find((item) => item.id === text.id)!,
          next,
        );
      });
      await settled(text.id);
      const check = () => {
        expect(formula(text.id).snapshot!.glyphs.map((glyph) => glyph.label)).toEqual(
          occurrenceLabels,
        );
        expect(formula(text.id).glyphColors).toEqual(beforeFormula.glyphColors);
        expect(formula(text.id).hiddenGlyphs).toEqual([10]);
        expect(project().clips).toEqual(before.clips);
        expect(project().relations).toEqual(before.relations);
      };
      check();
      expect(useRenderStore.getState().transitions[text.id]!.map).toEqual(
        occurrenceLabels.map((_, index) => index),
      );
      expect(useSyncWarnings.getState().warnings[text.id]).toBeUndefined();
      history.undo();
      await settled(text.id);
      check();
      expect(formula(text.id).snapshot!.key).toBe(beforeFormula.snapshot!.key);
      history.redo();
      await settled(text.id);
      check();
    },
  );
});

it('composes a text source edit at the old layout with a simultaneous reflow', async () => {
  const value = createEmptyProject();
  const text = createTexFormula({
    source: 'alpha beta gamma delta',
    glyphColors: { '10': '#FF0000', '13': '#00FF00' },
  });
  value.formulas.push(text);
  await mount(value);
  useProjectStore.getState().update((draft) => {
    const current = draft.formulas[0]!;
    current.source += '!';
    if (current.kind === 'tex') current.layout.width = 2;
  });
  await settled(text.id);
  expect(
    formula(text.id)
      .snapshot!.glyphs.map((glyph) => glyph.label)
      .join(''),
  ).toBe('alphabetagammadelta!');
  expect(formula(text.id).glyphColors).toEqual({ '10': '#FF0000', '13': '#00FF00' });
});

it('composes exact-to-free correspondence with a denominator edit and preserves exact undo', async () => {
  const value = createEmptyProject();
  const fraction = createFormula({
    source: '\\frac{a}{b}',
    glyphColors: { '2': '#FF0000' },
    hiddenGlyphs: [2],
  });
  const exact = await exactFraction(fraction, value);
  fraction.snapshot = toSnapshot(exact);
  const destination = createFormula({ source: 'x' });
  value.formulas.push(fraction, destination);
  const from = createClip(fraction.id, value.tracks[0]!.id, 0, 5);
  const to = createClip(destination.id, value.tracks[1]!.id, 2, 7);
  value.clips.push(from, to);
  value.relations.push(
    createRelation(from.id, to.id, {
      pairs: [{ from: [1, 2], to: [0], style: null, extras: 'copies' }],
    }),
  );
  expect(value.relations[0]!.pairs[0]!.principal).toBe(1);
  await mount(value);
  expect(entry(fraction.id).resolved!.canonToRender).toEqual([0, 2, 1]);
  useProjectStore.getState().update((draft) => {
    draft.formulas[0]!.source = '\\frac{a}{c}';
  });
  await settled(fraction.id);
  expect(labels(entry(fraction.id).resolved!.render)).toEqual(['a', 'c', '—']);
  expect(formula(fraction.id).glyphColors).toEqual({ '1': '#FF0000' });
  expect(formula(fraction.id).hiddenGlyphs).toEqual([1]);
  expect(formula(fraction.id).snapshot!.glyphs[1]!.label).toBe('c');
  expect(project().relations[0]!.pairs[0]).toMatchObject({ from: [2, 1], principal: 2 });
  expect(
    formula(fraction.id).snapshot!.glyphs[project().relations[0]!.pairs[0]!.principal!]!.label,
  ).toBe('—');
  expect(useRenderStore.getState().transitions[fraction.id]!.map).toEqual([0, 2, 1]);
  history.undo();
  await settled(fraction.id);
  expect(formula(fraction.id).snapshot!.key).toBe(exact.key);
  expect(formula(fraction.id).snapshot!.backend).toBe('latex');
  expect(formula(fraction.id).glyphColors).toEqual({ '2': '#FF0000' });
  expect(project().relations[0]!.pairs[0]).toMatchObject({ from: [1, 2], principal: 1 });
  expect(
    entry(fraction.id).resolved!.render.glyphs[entry(fraction.id).resolved!.canonToRender[2]!]!
      .label,
  ).toBe('b');
  history.redo();
  await settled(fraction.id);
  expect(formula(fraction.id).glyphColors).toEqual({ '1': '#FF0000' });
  expect(formula(fraction.id).snapshot!.glyphs[1]!.label).toBe('c');
  expect(project().relations[0]!.pairs[0]).toMatchObject({ from: [2, 1], principal: 2 });
});

it('maintains a missing snapshot when reopening the same-ID pre-render save', async () => {
  const value = createEmptyProject();
  const item = createFormula({ source: 'a+b' });
  value.formulas.push(item);
  const saved = serializeProject(value);
  await mount(value);
  const render = entry(item.id).resolved!.render;
  useRenderStore
    .getState()
    .setTransition(item.id, { from: 'previous-document', to: render.key, map: [0, 1, 2] });
  expect(openProjectText(saved, { fileName: 'pending-render.mfe.json', handle: null })).toBe(true);
  await settled(item.id);
  expect(formula(item.id).snapshot!.glyphs.map((glyph) => glyph.label)).toEqual(['a', '+', 'b']);
  expect(entry(item.id).resolved!.render).toBe(render);
  expect(entry(item.id).resolved!.formula).toBe(formula(item.id));
  expect(entry(item.id).resolved!.canonToRender).toEqual([0, 1, 2]);
  expect(useRenderStore.getState().transitions[item.id]).toBeUndefined();
  expect(history.canUndo()).toBe(false);
});

it('does not inherit another document transition when the same IDs have an exact snapshot', async () => {
  const value = createEmptyProject();
  const fraction = createFormula({ source: '\\frac{a}{b}' });
  value.formulas.push(fraction);
  await mount(value);
  const render = entry(fraction.id).resolved!.render;
  const loaded = structuredClone(project());
  loaded.formulas[0]!.snapshot = toSnapshot(await exactFraction(fraction, value));
  loaded.formulas[0]!.glyphColors = { '2': '#FF0000' };
  useRenderStore
    .getState()
    .setTransition(fraction.id, { from: 'previous-document', to: render.key, map: [0, 1, 2] });
  loadProject(loaded);
  await settled(fraction.id);
  expect(formula(fraction.id).snapshot!.backend).toBe('latex');
  expect(formula(fraction.id).glyphColors).toEqual({ '2': '#FF0000' });
  expect(entry(fraction.id).resolved!.canonToRender).toEqual([0, 2, 1]);
  expect(entry(fraction.id).resolved!.render).toBe(render);
  expect(useRenderStore.getState().transitions[fraction.id]).toBeUndefined();
});

it('preserves a published canonical reorder on render reuse and composes the next source edit from it', async () => {
  const value = createEmptyProject();
  const item = createFormula({ source: 'a+b', glyphColors: { '0': '#FF0000' } });
  value.formulas.push(item);
  await mount(value);
  const original = formula(item.id).snapshot!;
  const canonicalKey = 'published-canonical-reorder';
  useRenderStore.getState().setTransition(item.id, {
    from: original.key,
    to: canonicalKey,
    map: [2, 1, 0],
  });
  useProjectStore.getState().amend((draft) => {
    remapGlyphRefs(draft, item.id, [2, 1, 0]);
    draft.formulas[0]!.snapshot = {
      ...original,
      key: canonicalKey,
      glyphs: [original.glyphs[2]!, original.glyphs[1]!, original.glyphs[0]!],
    };
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(formula(item.id).snapshot!.key).toBe(canonicalKey);
  expect(formula(item.id).glyphColors).toEqual({ '2': '#FF0000' });
  expect(entry(item.id).resolved!.canonToRender).toEqual([2, 1, 0]);
  useProjectStore.getState().update((draft) => {
    draft.formulas[0]!.source = 'x+a+b';
  });
  await settled(item.id);
  expect(formula(item.id).snapshot!.key).toBe(entry(item.id).resolved!.render.key);
  expect(formula(item.id).glyphColors).toEqual({ '2': '#FF0000' });
  expect(formula(item.id).snapshot!.glyphs[2]!.label).toBe('a');
  expect(useRenderStore.getState().transitions[item.id]).toEqual({
    from: canonicalKey,
    to: formula(item.id).snapshot!.key,
    map: [4, 3, 2],
  });
});

it('reopens a pending-reflow save through the verified old snapshot request without losing occurrences', async () => {
  const value = createEmptyProject();
  const item = createTexFormula({
    source: 'alpha beta gamma delta',
    layout: { width: null, align: 'left', lineSpacing: 1 },
  });
  value.formulas.push(item);
  await mount(value);
  const occurrenceLabels = formula(item.id).snapshot!.glyphs.map((glyph) => glyph.label);
  const colors = Object.fromEntries(
    occurrenceLabels.map((_, index) => [
      String(index),
      `#${(0x300000 + index).toString(16).toUpperCase()}`,
    ]),
  );
  useProjectStore.getState().update((draft) => {
    draft.formulas[0]!.glyphColors = colors;
  });
  const oldKey = formula(item.id).snapshot!.key;
  useProjectStore.getState().update((draft) => {
    const text = draft.formulas[0]!;
    if (text.kind === 'tex') text.layout.width = 2;
  });
  const pending = serializeProject(project());
  expect(formula(item.id).snapshot!.key).toBe(oldKey);
  await settled(item.id);
  expect(formula(item.id).glyphColors).toEqual(colors);
  expect(openProjectText(pending, { fileName: 'pending-reflow.mfe.json', handle: null })).toBe(
    true,
  );
  await settled(item.id);
  expect(formula(item.id).snapshot!.glyphs.map((glyph) => glyph.label)).toEqual(occurrenceLabels);
  expect(formula(item.id).glyphColors).toEqual(colors);
  expect(formula(item.id).snapshot!.key).toBe(entry(item.id).resolved!.render.key);
  expect(useRenderStore.getState().transitions[item.id]!.map).toEqual(
    occurrenceLabels.map((_, index) => index),
  );
});
