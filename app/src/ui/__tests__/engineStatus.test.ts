// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CompanionState } from '../../engine';
import type { FormulaRenderEntry } from '../../store';
import { companionSummary, rendererSummary, rendererTooltip } from '../engineStatus';

const offline = { status: 'offline' } as CompanionState;
const health = (latex: boolean) => ({ capabilities: { latex, dvisvgm: true } });
const online = { status: 'online', health: health(true) } as CompanionState;
/** Running, but without TeX where it runs. */
const noTex = { status: 'online', health: health(false) } as CompanionState;

/** A render entry whose last good render came from `backend` (or none). */
const entry = (
  status: FormulaRenderEntry['status'],
  backend: 'latex' | 'mathjax' | null,
): FormulaRenderEntry =>
  ({
    status,
    resolved: backend ? { render: { backend } } : null,
    error: null,
  }) as unknown as FormulaRenderEntry;

describe('renderer status with font text', () => {
  const text = (exact: boolean): FormulaRenderEntry =>
    ({
      status: 'ok',
      resolved: { render: { backend: 'pango', exact } },
      error: null,
    }) as unknown as FormulaRenderEntry;

  it('counts a shaped text as exact, by Pango', () => {
    const summary = rendererSummary(['t'], { t: text(true) }, 'auto', online);
    expect(summary).toMatchObject({ label: 'Pango', exact: 1, pango: 1 });
    expect(summary.boxes).toBeUndefined();
  });

  it('counts a text drawn as boxes apart: it is neither exact nor MathJax', () => {
    const summary = rendererSummary(['t'], { t: text(false) }, 'auto', offline);
    expect(summary).toMatchObject({ label: 'MathJax', exact: 0, mathjax: 0, boxes: 1 });
    expect(rendererTooltip(summary, 'auto')).toContain(
      '1 font text as placeholder boxes (needs the companion)',
    );
  });

  it('says mixed when boxes stand beside a renderer', () => {
    const entries = { t: text(false), f: entry('ok', 'latex'), u: text(false) };
    const summary = rendererSummary(['t', 'f', 'u'], entries, 'auto', online);
    expect(summary).toMatchObject({ label: 'mixed', exact: 1, boxes: 2 });
    expect(rendererTooltip(summary, 'auto')).toContain(
      '1 formula exact (LaTeX), 2 font texts as placeholder boxes (needs the companion)',
    );
  });
});

describe('renderer status', () => {
  it('names one backend when every formula uses it, "mixed" otherwise', () => {
    const ids = ['a', 'b', 'c'];
    const all = (backend: 'latex' | 'mathjax') =>
      Object.fromEntries(ids.map((id) => [id, entry('ok', backend)]));
    expect(rendererSummary(ids, all('latex'), 'auto', online).label).toBe('LaTeX');
    expect(rendererSummary(ids, all('mathjax'), 'auto', online).label).toBe('MathJax');
    const mixed = { ...all('latex'), c: entry('ok', 'mathjax') };
    expect(rendererSummary(ids, mixed, 'auto', online)).toEqual({
      label: 'mixed',
      exact: 2,
      mathjax: 1,
      loading: 0,
      failed: 0,
    });
  });

  it('counts formulas rendering or failed, and ignores entries of other formulas', () => {
    const entries = {
      a: entry('loading', 'mathjax'), // an earlier render is kept while a new one loads
      b: entry('error', null),
      gone: entry('ok', 'latex'),
    };
    expect(rendererSummary(['a', 'b'], entries, 'auto', offline)).toEqual({
      label: 'MathJax',
      exact: 0,
      mathjax: 1,
      loading: 1,
      failed: 1,
    });
  });

  it('says what new formulas would use when nothing is rendered yet', () => {
    expect(rendererSummary([], {}, 'auto', offline).label).toBe('MathJax');
    expect(rendererSummary([], {}, 'auto', online).label).toBe('LaTeX');
    expect(rendererSummary([], {}, 'auto', noTex).label).toBe('MathJax');
    expect(rendererSummary([], {}, 'mathjax', online).label).toBe('MathJax');
    expect(rendererSummary([], {}, 'latex', offline).label).toBe('LaTeX');
  });

  it('explains the counts and the glyph source preference in the tooltip', () => {
    const summary = { label: 'mixed', exact: 3, mathjax: 1, loading: 0, failed: 2 } as const;
    expect(rendererTooltip(summary, 'auto')).toBe(
      '3 formulas exact (LaTeX), 1 formula with MathJax, 2 formulas failed\n' +
        'Glyph source: Auto (LaTeX when the companion is online) (View menu)',
    );
    expect(rendererTooltip(rendererSummary([], {}, 'mathjax', online), 'mathjax')).toMatch(
      /^No formula rendered yet: new ones use MathJax\.\nGlyph source: MathJax only/,
    );
  });
});

describe('companionSummary', () => {
  it('gives the version when the companion is online, and what it is for otherwise', () => {
    const health = { version: '1.2.0' } as Extract<CompanionState, { status: 'online' }>['health'];
    expect(companionSummary({ status: 'online', health })).toBe('1.2.0, online');
    expect(companionSummary(offline)).toBe('Not running (optional: exact LaTeX, ffmpeg, Manim)');
    expect(companionSummary({ status: 'checking' })).toBe('Looking for it…');
    expect(companionSummary({ status: 'unsupported' })).toBe('Not available here');
  });
});
