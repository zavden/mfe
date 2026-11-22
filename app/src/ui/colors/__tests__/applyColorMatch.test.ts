// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  fixedTextMeasurer,
  producerOf,
  renderRequestFor,
  resolveFormula,
  textBoxesKey,
  toSnapshot,
  type RenderRequest,
} from '../../../engine';
import { textBoxesRender } from '../../../engine/textBoxes';
import {
  createBraceFormula,
  createColorMatch,
  createEmptyProject,
  createFormula,
  createTexFormula,
  createTextFormula,
  type Formula,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore } from '../../../store';
import { replaceProject } from '../../project/actions';
import { useNoticeStore } from '../../project/noticeStore';
import { applyColorMatch, matchColorsBlocker } from '../applyColorMatch';

/** MathJax renders keyed by their source, so a formula's snapshot is the identity of its render. */
const engine = {
  render: async (request: RenderRequest) =>
    producerOf(request.kind).free(
      request,
      `k:${request.kind === 'math' ? request.latex : request.kind === 'tex' ? request.source : 'brace'}`,
    ),
};

const RED = '#FC6255';
const BLUE = '#58C4DD';

/** A project with the formulas (rendered through `engine` unless `unrendered`) and one match
 * list "Course": x red, + blue. */
async function setup(
  latexes: string[],
  options: { unrendered?: number[]; colors?: Record<number, Record<string, string>> } = {},
): Promise<{ project: Project; formulas: Formula[] }> {
  const project = createEmptyProject();
  const formulas: Formula[] = [];
  for (const [i, latex] of latexes.entries()) {
    const formula = createFormula({
      name: `f${i + 1}`,
      source: latex,
      glyphColors: options.colors?.[i] ?? {},
    });
    const result = await engine.render({
      kind: 'math',
      latex,
      packages: [],
      preamble: '',
      target: 'ce',
      fontSize: 48,
      prefer: 'mathjax',
    });
    if (!result.ok) throw new Error(result.error.message);
    if (!options.unrendered?.includes(i)) {
      formula.snapshot = toSnapshot(result.render);
      formulas.push(formula);
      project.formulas.push(formula);
      continue;
    }
    formulas.push(formula);
    project.formulas.push(formula);
  }
  project.colorMatches.push(
    createColorMatch('Course', [
      { pattern: '$x$', color: RED },
      { pattern: '+', color: BLUE },
    ]),
  );
  loadProject(project);
  for (const [i, formula] of formulas.entries()) {
    if (options.unrendered?.includes(i)) continue;
    const result = await engine.render({
      kind: 'math',
      latex: formula.source,
      packages: [],
      preamble: '',
      target: 'ce',
      fontSize: 48,
      prefer: 'mathjax',
    });
    if (!result.ok) throw new Error(result.error.message);
    useRenderStore.getState().setEntry(formula.id, {
      status: 'ok',
      resolved: resolveFormula(formula, result.render),
      error: null,
    });
  }
  return { project, formulas };
}

const colorsOf = () => useProjectStore.getState().project.formulas.map((f) => f.glyphColors);
const lastNotice = () => useNoticeStore.getState().notices.at(-1)!;

function heldRenderer() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release,
    render: async (request: RenderRequest) => {
      await gate;
      return engine.render(request);
    },
  };
}

afterEach(() => {
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
  useNoticeStore.setState({ notices: [] });
});

describe('applyColorMatch', () => {
  it('colours the glyphs of every occurrence, replacing the per-glyph colours, as one undo step', async () => {
    // MathJax orders: a x + b → 0 a, 1 x, 2 +, 3 b; y = x^2 → 0 y, 1 =, 2 x, 3 2.
    const { project, formulas } = await setup(['a x + b', 'y = x^2', 'z'], {
      colors: { 0: { '0': '#123456' }, 2: { '0': '#123456' } },
    });
    const report = await applyColorMatch(
      formulas.map((f) => f.id),
      project.colorMatches[0]!.id,
      engine,
    );
    expect(colorsOf()).toEqual([{ '1': RED, '2': BLUE }, { '2': RED }, {}]);
    expect(report?.applied).toEqual([
      { name: 'f1', glyphs: 2 },
      { name: 'f2', glyphs: 1 },
      { name: 'f3', glyphs: 0 },
    ]);
    expect(report?.skipped).toEqual([]);
    expect(lastNotice()).toMatchObject({
      kind: 'info',
      title: '“Course” applied to 3 formulas',
      message: '3 glyphs coloured. No match in f3.',
    });
    history.undo();
    expect(colorsOf()).toEqual([{ '0': '#123456' }, {}, { '0': '#123456' }]);
    expect(history.canUndo()).toBe(false);
  });

  it('leaves alone a formula without a render, one that changed meanwhile, and says so', async () => {
    const { project, formulas } = await setup(['a x', 'x + x'], { unrendered: [0] });
    const renumbering = {
      render: async (request: RenderRequest) => {
        // The second formula's glyphs are renumbered while its labelled render runs.
        useProjectStore.getState().amend((draft) => {
          draft.formulas[1]!.snapshot!.key = 'elsewhere';
        });
        return engine.render(request);
      },
    };
    const report = await applyColorMatch(
      formulas.map((f) => f.id),
      project.colorMatches[0]!.id,
      renumbering,
    );
    expect(colorsOf()).toEqual([{}, {}]);
    expect(report?.applied).toEqual([]);
    expect(report?.skipped).toEqual([
      { name: 'f1', reason: 'not rendered yet' },
      { name: 'f2', reason: 'its glyphs changed while the colours were computed' },
    ]);
    expect(history.canUndo()).toBe(false);
    expect(lastNotice()).toMatchObject({
      kind: 'warning',
      title: '“Course” coloured nothing',
      details: ['f1: not rendered yet.', 'f2: its glyphs changed while the colours were computed.'],
    });
  });

  it('skips a formula the patterns cannot be rendered on, and reports an invalid pattern', async () => {
    const { project, formulas } = await setup(['\\sqrt{x}']);
    const match = project.colorMatches[0]!;
    useProjectStore.getState().update((draft) => {
      draft.colorMatches[0]!.entries = [
        { pattern: '\\sqrt', color: RED },
        { pattern: 'a}', color: BLUE },
      ];
    });
    const report = await applyColorMatch([formulas[0]!.id], match.id, engine);
    expect(report?.applied).toEqual([]);
    expect(report?.skipped[0]?.name).toBe('f1');
    expect(report?.skipped[0]?.reason).toMatch(/cannot be rendered on it/);
    expect(report?.invalid).toEqual([1]);
    expect(lastNotice().details?.at(-1)).toBe(
      'Pattern 2 (“a}”) is not valid for a match and was ignored.',
    );
  });

  it('warns when the list no longer exists', async () => {
    const { formulas } = await setup(['x']);
    expect(await applyColorMatch([formulas[0]!.id], 'gone', engine)).toBeNull();
    expect(lastNotice().title).toBe('This match colour list no longer exists.');
  });

  it('does not colour a replacement document with identical formula IDs and snapshot keys', async () => {
    const { project, formulas } = await setup(['x']);
    replaceProject(project, { fileName: 'A.mfe.json', handle: null });
    const held = heldRenderer();
    const pending = applyColorMatch([formulas[0]!.id], project.colorMatches[0]!.id, held);
    const replacement = structuredClone(project);
    replacement.formulas[0]!.glyphColors = { '0': BLUE };
    replaceProject(replacement, { fileName: 'B.mfe.json', handle: null });
    held.release();
    expect((await pending)?.applied).toEqual([]);
    expect(colorsOf()).toEqual([{ '0': BLUE }]);
    expect(history.canUndo()).toBe(false);
  });

  it('lets the newer colour command win when completion order is reversed', async () => {
    const { project, formulas } = await setup(['x']);
    const blue = createColorMatch('Blue', [{ pattern: '$x$', color: BLUE }]);
    useProjectStore.getState().update((draft) => {
      draft.colorMatches.push(blue);
    });
    const held = heldRenderer();
    const first = applyColorMatch([formulas[0]!.id], project.colorMatches[0]!.id, held);
    await applyColorMatch([formulas[0]!.id], blue.id, engine);
    held.release();
    expect((await first)?.applied).toEqual([]);
    expect(colorsOf()).toEqual([{ '0': BLUE }]);
  });

  it.each(['manual colour', 'formula deletion', 'list edit'] as const)(
    'rejects a result after %s even when undo restores the original input',
    async (change) => {
      const { project, formulas } = await setup(['x']);
      const held = heldRenderer();
      const pending = applyColorMatch([formulas[0]!.id], project.colorMatches[0]!.id, held);
      useProjectStore.getState().update((draft) => {
        if (change === 'manual colour') draft.formulas[0]!.glyphColors = { '0': BLUE };
        if (change === 'formula deletion') draft.formulas = [];
        if (change === 'list edit') draft.colorMatches[0]!.entries[0]!.color = BLUE;
      });
      history.undo();
      held.release();
      expect((await pending)?.applied).toEqual([]);
      expect(colorsOf()).toEqual([{}]);
      expect(history.canRedo()).toBe(true);
    },
  );

  it('preserves a manual colour while still applying to other unchanged formulas', async () => {
    const { project, formulas } = await setup(['x', 'x']);
    const held = heldRenderer();
    const pending = applyColorMatch(
      formulas.map((f) => f.id),
      project.colorMatches[0]!.id,
      held,
    );
    useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.glyphColors = { '0': BLUE };
    });
    held.release();
    expect((await pending)?.applied).toEqual([{ name: 'f2', glyphs: 1 }]);
    expect(colorsOf()).toEqual([{ '0': BLUE }, { '0': RED }]);
  });

  it('keeps independent pending commands and unrelated document edits valid', async () => {
    const { project, formulas } = await setup(['x', 'x']);
    const held = heldRenderer();
    const pending = applyColorMatch([formulas[0]!.id], project.colorMatches[0]!.id, held);
    await applyColorMatch([formulas[1]!.id], project.colorMatches[0]!.id, engine);
    useProjectStore.getState().update((draft) => {
      draft.meta.name = 'A different title';
    });
    held.release();
    expect((await pending)?.applied).toEqual([{ name: 'f1', glyphs: 1 }]);
    expect(colorsOf()).toEqual([{ '0': RED }, { '0': RED }]);
  });
});

describe('applyColorMatch on an object that has no LaTeX', () => {
  /** `objects` in the project of `setup(['a x + b'])`, each drawn as the app draws it with no
   * companion: a font text as boxes, a brace as its geometry. */
  async function withObjects(objects: Formula[]) {
    const { project, formulas } = await setup(['a x + b']);
    useProjectStore.getState().amend((draft) => {
      for (const object of objects) draft.formulas.push(object);
    });
    for (const object of objects) {
      const request = renderRequestFor(object, { preamble: '', target: 'ce' }, 'mathjax');
      const render =
        request.kind === 'text'
          ? textBoxesRender(request, textBoxesKey(request), fixedTextMeasurer)
          : await engine.render(request).then((result) => {
              if (!result.ok) throw new Error(result.error.message);
              return result.render;
            });
      useProjectStore.getState().amend((draft) => {
        draft.formulas.find((f) => f.id === object.id)!.snapshot = toSnapshot(render);
      });
      const current = useProjectStore.getState().project.formulas.find((f) => f.id === object.id)!;
      useRenderStore.getState().setEntry(object.id, {
        status: 'ok',
        resolved: resolveFormula(current, render),
        error: null,
      });
    }
    return { match: project.colorMatches[0]!.id, formula: formulas[0]! };
  }
  const stored = (id: string) =>
    useProjectStore.getState().project.formulas.find((f) => f.id === id)!;

  it('leaves a font text its colours and says why it took none', async () => {
    // "x + y" holds an x and a +, the patterns of the list: they are LaTeX, and this is not.
    const text = createTextFormula({
      name: 'p1',
      source: 'x + y',
      glyphColors: { '0': '#123456', '2': '#ABCDEF' },
    });
    const { match } = await withObjects([text]);
    const before = useProjectStore.getState().project;

    const report = await applyColorMatch([text.id], match, engine);
    expect(stored(text.id).glyphColors).toEqual({ '0': '#123456', '2': '#ABCDEF' });
    expect(report?.applied).toEqual([]);
    expect(report?.skipped).toEqual([
      { name: 'p1', reason: 'a Text (font) has no LaTeX to find the patterns in' },
    ]);
    expect(lastNotice()).toMatchObject({
      kind: 'warning',
      title: '“Course” coloured nothing',
      details: ['p1: a Text (font) has no LaTeX to find the patterns in.'],
    });
    // Nothing was written: no step, and the document is as saved as it was.
    expect(useProjectStore.getState().project).toBe(before);
    expect(history.canUndo()).toBe(false);
  });

  it('colours the formulas selected with it, and counts neither it nor a brace', async () => {
    const text = createTextFormula({ name: 'p1', source: 'x', glyphColors: { '0': '#123456' } });
    const brace = createBraceFormula({ name: 'b1', width: 2 });
    const { match, formula } = await withObjects([text, brace]);
    const braceBefore = stored(brace.id);

    const report = await applyColorMatch([formula.id, text.id, brace.id], match, engine);
    expect(stored(formula.id).glyphColors).toEqual({ '1': RED, '2': BLUE });
    expect(stored(text.id).glyphColors).toEqual({ '0': '#123456' });
    expect(stored(brace.id)).toBe(braceBefore);
    expect(report?.applied).toEqual([{ name: 'f1', glyphs: 2 }]);
    // A brace has no glyph to colour one by one: it is not a thing the list was asked about.
    expect(report?.skipped).toEqual([
      { name: 'p1', reason: 'a Text (font) has no LaTeX to find the patterns in' },
    ]);
    expect(lastNotice()).toMatchObject({
      kind: 'info',
      title: '“Course” applied to 1 formula',
      message: '2 glyphs coloured.',
      details: ['p1: a Text (font) has no LaTeX to find the patterns in.'],
    });
  });

  it('writes nothing for a brace alone', async () => {
    const brace = createBraceFormula({ name: 'b1', width: 2 });
    const { match } = await withObjects([brace]);
    const before = useProjectStore.getState().project;

    const report = await applyColorMatch([brace.id], match, engine);
    expect(report).toMatchObject({ applied: [], skipped: [] });
    expect(useProjectStore.getState().project).toBe(before);
    expect(history.canUndo()).toBe(false);
    expect(lastNotice()).toMatchObject({ kind: 'warning', title: '“Course” coloured nothing' });
  });
});

describe('whether a list can colour every object of a selection', () => {
  it('can while each is a formula or a LaTeX text; else it names the first it cannot colour', () => {
    const formula = createFormula({ name: 'f1' });
    const tex = createTexFormula({ name: 't1' });
    expect(matchColorsBlocker([formula, tex])).toBeNull();
    expect(matchColorsBlocker([])).toBeNull();
    expect(
      matchColorsBlocker([formula, createTextFormula({ name: 'p1' }), createBraceFormula()]),
    ).toBe('p1 is a Text (font): it has no LaTeX to find the patterns in');
    expect(matchColorsBlocker([createBraceFormula({ name: 'b1' }), formula])).toBe(
      'b1 is a Brace: its glyphs take no colours of their own',
    );
  });
});
