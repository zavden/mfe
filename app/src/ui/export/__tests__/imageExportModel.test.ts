// @vitest-environment node
/* What the dialog of Export ▸ Image… works out (`imageExportModel.ts`): the instant of the
 * picture, what it waits for and what it tells of, and the name of the file. */
import { describe, expect, it } from 'vitest';
import {
  BACKEND_VERSIONS,
  producerOf,
  renderKey,
  renderRequestFor,
  resolveFormula,
  textBoxesKey,
  toSnapshot,
  type ResolvedFormula,
  type TextRenderRequest,
} from '../../../engine';
import {
  packagesOf,
  createClip,
  createEmptyProject,
  createFormula,
  createTextFormula,
  type Formula,
} from '../../../model';
import type { FormulaRenderEntry } from '../../../store';
import { frameInstant, imageFileName, imageReadiness } from '../imageExportModel';

const project = createEmptyProject();
/** A formula with a clip over [start, end). */
const make = (name: string, latex: string, start: number, end: number) => {
  const formula = createFormula({ name, source: latex });
  project.formulas.push(formula);
  project.clips.push(createClip(formula.id, project.tracks[0]!.id, start, end));
  return formula;
};
// On screen during the first two seconds…
const ok = make('ok', 'x', 0, 2);
const empty = make('empty', '  ', 0, 2);
const failed = make('failed', 'z', 0, 2);
const never = make('never', 'u', 0, 2);
// …and during the last two.
const loading = make('loading', 'y', 2, 4);
const lateFailed = make('late failed', 'q', 2, 4);
const lateEmpty = make('late empty', '', 2, 4);

/** A render of `formula` as it was when its LaTeX was `latex`. */
function renderOf(formula: Formula, latex = formula.source): ResolvedFormula {
  const key = renderKey(
    {
      kind: 'math',
      latex,
      packages: packagesOf(formula),
      preamble: project.meta.preamble,
      target: project.meta.target,
      fontSize: formula.fontSize,
      prefer: 'auto',
    },
    'latex',
    BACKEND_VERSIONS.latex,
  );
  return { formula, render: { key, backend: 'latex' } } as unknown as ResolvedFormula;
}

const failure = { message: 'Missing close brace', backend: 'mathjax' as const };
const entries: Record<string, FormulaRenderEntry> = {
  [ok.id]: { status: 'ok', resolved: renderOf(ok), error: null },
  [empty.id]: { status: 'idle', resolved: null, error: null },
  [failed.id]: { status: 'error', resolved: renderOf(failed, 'v'), error: failure },
  [never.id]: { status: 'error', resolved: null, error: failure },
  [loading.id]: { status: 'loading', resolved: renderOf(loading), error: null },
  [lateFailed.id]: { status: 'error', resolved: renderOf(lateFailed, 'v'), error: failure },
  [lateEmpty.id]: { status: 'idle', resolved: null, error: null },
};
const resolved = new Map(
  Object.entries(entries).flatMap(([id, e]) => (e.resolved ? [[id, e.resolved] as const] : [])),
);
const names = (formulas: Formula[]) => formulas.map((formula) => formula.name);

describe('the instant of the picture', () => {
  it('is the playhead’s, within the scene', () => {
    expect(frameInstant(project, 1.25)).toBe(1.25);
    expect(frameInstant(project, -3)).toBe(0);
    // The scene lasts 4 s: a playhead left past its end shows the end.
    expect(frameInstant(project, 9)).toBe(4);
    expect(frameInstant(createEmptyProject(), 2)).toBe(0);
  });
});

describe('what the picture needs of the formulas', () => {
  it('waits for a render in progress wherever its formula is on the timeline', () => {
    expect(names(imageReadiness(project, entries, resolved, 1).waiting)).toEqual(['loading']);
    expect(names(imageReadiness(project, entries, resolved, 3).waiting)).toEqual(['loading']);
    const settled = {
      ...entries,
      [loading.id]: { ...entries[loading.id]!, status: 'ok' as const },
    };
    expect(imageReadiness(project, settled, resolved, 1).waiting).toEqual([]);
  });

  it('tells of the formulas on screen at the instant only', () => {
    const early = imageReadiness(project, entries, resolved, 1);
    expect(names(early.failing)).toEqual(['failed']);
    expect(names(early.missing)).toEqual(['never']);
    expect(names(early.empty)).toEqual(['empty']);
    const late = imageReadiness(project, entries, resolved, 3);
    expect(names(late.failing)).toEqual(['late failed']);
    expect(late.missing).toEqual([]);
    expect(names(late.empty)).toEqual(['late empty']);
    for (const { boxes, blocked } of [early, late]) {
      expect(boxes).toEqual([]);
      expect(blocked).toEqual([]);
    }
  });

  it('takes a clip’s window as the evaluator does: half-open, but for the end of the scene', () => {
    // At 2 s the first clips are gone and the second ones are there.
    expect(names(imageReadiness(project, entries, resolved, 2).failing)).toEqual(['late failed']);
    // The end of the scene, and a playhead past it, still show what lasts until then.
    expect(names(imageReadiness(project, entries, resolved, 4).failing)).toEqual(['late failed']);
    expect(names(imageReadiness(project, entries, resolved, 60).failing)).toEqual(['late failed']);
  });
});

describe('what the picture needs of a font text', () => {
  /** A project with a font text during [0, 2), another clip of it during [4, 6). */
  function withText() {
    const scene = createEmptyProject();
    const text = createTextFormula({ name: 'title', source: 'AB' });
    scene.formulas.push(text);
    scene.clips.push(createClip(text.id, scene.tracks[0]!.id, 0, 2));
    const other = createFormula({ name: 'x', source: 'x' });
    scene.formulas.push(other);
    scene.clips.push(createClip(other.id, scene.tracks[0]!.id, 2, 6));
    return { scene, text, other };
  }

  it('says that one nothing has shaped is drawn as its boxes', () => {
    const { scene, text, other } = withText();
    const request = renderRequestFor(text, scene.meta, 'auto') as TextRenderRequest;
    const result = producerOf('text').free(request, textBoxesKey(request));
    if (!result.ok) throw new Error(result.error.message);
    const boxed = { ...text, snapshot: toSnapshot(result.render) };
    scene.formulas[0] = boxed;
    const drawn = resolveFormula(boxed, result.render);
    const settled: Record<string, FormulaRenderEntry> = {
      [text.id]: { status: 'ok', resolved: drawn, error: null },
      [other.id]: { status: 'ok', resolved: renderOf(other), error: null },
    };
    const renders = new Map([
      [text.id, drawn],
      [other.id, renderOf(other)],
    ]);
    const on = imageReadiness(scene, settled, renders, 1);
    expect(names(on.boxes)).toEqual(['title']);
    expect(on.blocked).toEqual([]);
    expect(on.waiting).toEqual([]);
    // Off screen, it is not this picture's.
    expect(imageReadiness(scene, settled, renders, 3).boxes).toEqual([]);
  });

  it('holds the picture back for one that nothing can draw, while it is on screen', () => {
    const { scene, text, other } = withText();
    const unshaped: Record<string, FormulaRenderEntry> = {
      [text.id]: { status: 'error', resolved: null, error: failure },
      [other.id]: { status: 'ok', resolved: renderOf(other), error: null },
    };
    const renders = new Map([[other.id, renderOf(other)]]);
    const on = imageReadiness(scene, unshaped, renders, 1);
    expect(names(on.blocked)).toEqual(['title']);
    // It is told as what it is, a text to shape, not as a formula whose LaTeX fails.
    expect(on.missing).toEqual([]);
    expect(on.failing).toEqual([]);
    expect(imageReadiness(scene, unshaped, renders, 3).blocked).toEqual([]);
  });
});

describe('the name of the file', () => {
  it('is the project’s, as a video’s is, with the instant of the picture', () => {
    expect(imageFileName('Quadratic formula', 2.5)).toBe('Quadratic formula 2.50s.png');
    expect(imageFileName('a/b:c*?', 0)).toBe('a-b-c 0.00s.png');
    expect(imageFileName('  ', 12)).toBe('image 12.00s.png');
  });

  it('tells the frames of a project apart', () => {
    // Two frames in a row at 60 fps, and one a minute later.
    const names = [1, 1 + 1 / 60, 61.25].map((time) => imageFileName('Proof', time));
    expect(names).toEqual(['Proof 1.00s.png', 'Proof 1.02s.png', 'Proof 61.25s.png']);
  });
});
