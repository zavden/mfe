// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BACKEND_VERSIONS, renderKey, type ResolvedFormula } from '../../../engine';
import {
  packagesOf,
  createClip,
  createEmptyProject,
  createFormula,
  type Formula,
} from '../../../model';
import type { FormulaRenderEntry } from '../../../store';
import { formulaReadiness, videoReadiness } from '../readiness';

const project = createEmptyProject();
const make = (name: string, latex: string) => {
  const f = createFormula({ name, source: latex });
  project.formulas.push(f);
  project.clips.push(createClip(f.id, project.tracks[0]!.id, 0, 1));
  return f;
};
const ok = make('ok', 'x');
const empty = make('empty', '  ');
const loading = make('loading', 'y');
const failed = make('failed', 'z');
const old = make('old', 'w');
const never = make('never', 'u');
const unused = createFormula({ name: 'unused', source: '' });
project.formulas.push(unused);

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

const entries: Record<string, FormulaRenderEntry> = {
  [ok.id]: { status: 'ok', resolved: renderOf(ok), error: null },
  [empty.id]: { status: 'idle', resolved: null, error: null },
  [loading.id]: { status: 'loading', resolved: renderOf(loading), error: null },
  [failed.id]: {
    status: 'error',
    resolved: renderOf(failed, 'v'),
    error: { message: 'Missing close brace', backend: 'mathjax' },
  },
  [old.id]: { status: 'ok', resolved: renderOf(old, 'v'), error: null },
  [never.id]: {
    status: 'error',
    resolved: null,
    error: { message: 'Undefined control sequence', backend: 'latex' },
  },
};
const resolved = new Map(
  Object.entries(entries).flatMap(([id, e]) => (e.resolved ? [[id, e.resolved] as const] : [])),
);

describe('formulaReadiness', () => {
  it('sorts the formulas on the timeline into empty, pending and stale ones', () => {
    const names = (fs: Formula[]) => fs.map((f) => f.name);
    const out = formulaReadiness(project, entries, resolved);
    expect(names(out.empty)).toEqual(['empty']);
    expect(names(out.pending)).toEqual(['loading']);
    expect(names(out.stale)).toEqual(['failed', 'old', 'never']);
  });
});

describe('videoReadiness', () => {
  it('waits for renders in progress and of an earlier LaTeX; tells failed formulas apart', () => {
    const names = (fs: Formula[]) => fs.map((f) => f.name);
    const out = videoReadiness(project, entries, resolved);
    expect(names(out.waiting)).toEqual(['loading', 'old']);
    expect(names(out.failing)).toEqual(['failed']);
    expect(names(out.missing)).toEqual(['never']);
    expect(names(out.empty)).toEqual(['empty']);
  });
});
