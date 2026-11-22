/* Help → Engine inspector: a developer view of the formula engine (Phase 1).
 *
 * Renders the typed LaTeX with the chosen target / packages / backend preference and shows
 * what the engine returned: source, exact flag, timing, warnings or the error, and every glyph
 * with its render index, label and box. "Compare backends" renders with MathJax and LaTeX side
 * by side and shows the positional matching (matchGlyphs 'position', MathJax → LaTeX); hovering
 * a glyph highlights its counterpart. Renders are debounced and stale results are dropped. */
import { useEffect, useMemo, useState } from 'react';
import {
  getEngine,
  glyphLikes,
  matchGlyphs,
  type GlyphMatch,
  type RenderRequest,
  type RenderResult,
} from '../../engine';
import { TARGET_NAMES, type RenderBackend, type Target } from '../../model';
import { Modal } from '../project/Modal';
import { useCompanionState } from '../useCompanion';
import { GlyphView } from './GlyphView';
import './inspector.css';

type Prefer = RenderRequest['prefer'];

interface Timed {
  result: RenderResult;
  ms: number;
}

type Outcome =
  | { mode: 'single'; single: Timed }
  | { mode: 'compare'; mathjax: Timed; latex: Timed; match: GlyphMatch | null };

const DEBOUNCE_MS = 200;
const FONT_SIZE = 48;

async function timedRender(request: RenderRequest): Promise<Timed> {
  const t0 = performance.now();
  const result = await getEngine().render(request);
  return { result, ms: performance.now() - t0 };
}

function parsePackages(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function ResultSummary({ timed, testId }: { timed: Timed; testId: string }) {
  const { result, ms } = timed;
  const backend: RenderBackend = result.ok ? result.render.backend : result.error.backend;
  return (
    <div className="inspector-summary" data-testid={`${testId}-summary`}>
      <span className="inspector-tag" data-testid={`${testId}-backend`}>
        {backend}
      </span>
      {result.ok && (
        <span
          className={result.render.exact ? 'inspector-tag exact' : 'inspector-tag inexact'}
          data-testid={`${testId}-exact`}
        >
          {result.render.exact ? 'exact' : 'approximate'}
        </span>
      )}
      <span className="inspector-dim" data-testid={`${testId}-time`}>
        {ms.toFixed(1)} ms
      </span>
      {result.ok && (
        <span className="inspector-dim" data-testid={`${testId}-count`}>
          {result.render.glyphs.length} glyphs
        </span>
      )}
      {result.ok && result.render.warnings.length > 0 && (
        <ul className="inspector-warnings" data-testid={`${testId}-warnings`}>
          {result.render.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {!result.ok && (
        <div className="inspector-error" data-testid={`${testId}-error`} role="alert">
          <strong>{result.error.message}</strong>
          {result.error.line !== undefined && <span> (line {result.error.line})</span>}
          {result.error.log && <pre>{result.error.log}</pre>}
        </div>
      )}
    </div>
  );
}

export function EngineInspector({ onClose }: { onClose: () => void }) {
  const companion = useCompanionState();
  const [latex, setLatex] = useState('e^{i\\pi} + 1 = 0');
  const [target, setTarget] = useState<Target>('ce');
  const [packages, setPackages] = useState('');
  const [prefer, setPrefer] = useState<Prefer>('auto');
  const [compare, setCompare] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [hover, setHover] = useState<{ side: 'single' | RenderBackend; index: number } | null>(
    null,
  );

  // Re-render when inputs change or the companion comes and goes.
  useEffect(() => {
    let stale = false;
    const base: RenderRequest = {
      kind: 'math',
      latex,
      packages: parsePackages(packages),
      preamble: '',
      target,
      fontSize: FONT_SIZE,
      prefer,
    };
    const timer = setTimeout(async () => {
      let next: Outcome;
      if (compare) {
        const [mathjax, tex] = await Promise.all([
          timedRender({ ...base, prefer: 'mathjax' }),
          timedRender({ ...base, prefer: 'latex' }),
        ]);
        const match =
          mathjax.result.ok && tex.result.ok
            ? matchGlyphs(
                glyphLikes(mathjax.result.render),
                glyphLikes(tex.result.render),
                'position',
              )
            : null;
        next = { mode: 'compare', mathjax, latex: tex, match };
      } else {
        next = { mode: 'single', single: await timedRender(base) };
      }
      if (!stale) {
        setHover(null);
        setOutcome(next);
      }
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [latex, target, packages, prefer, compare, companion.status]);

  // Highlighted render indices per side, following the match in compare mode.
  const highlights = useMemo(() => {
    const sets = {
      single: new Set<number>(),
      mathjax: new Set<number>(),
      latex: new Set<number>(),
      pango: new Set<number>(),
    };
    if (!hover) return sets;
    sets[hover.side].add(hover.index);
    if (outcome?.mode === 'compare' && outcome.match) {
      const { map } = outcome.match;
      if (hover.side === 'mathjax') {
        const j = map[hover.index];
        if (j !== null && j !== undefined) sets.latex.add(j);
      } else if (hover.side === 'latex') {
        map.forEach((j, i) => {
          if (j === hover.index) sets.mathjax.add(i);
        });
      }
    }
    return sets;
  }, [hover, outcome]);

  const hoverOn = (side: 'single' | RenderBackend) => (index: number | null) =>
    setHover(index === null ? null : { side, index });

  return (
    <Modal
      title="Engine inspector"
      onClose={onClose}
      testId="engine-inspector"
      width="min(1000px, calc(100vw - 32px))"
    >
      <div className="inspector">
        <div className="inspector-form">
          <label className="inspector-field inspector-latex">
            <span>LaTeX</span>
            <textarea
              rows={2}
              spellCheck={false}
              value={latex}
              data-testid="inspector-latex"
              onChange={(e) => setLatex(e.target.value)}
            />
          </label>
          <label className="inspector-field">
            <span>Target</span>
            <select
              value={target}
              data-testid="inspector-target"
              onChange={(e) => setTarget(e.target.value as Target)}
            >
              <option value="ce">{TARGET_NAMES.ce}</option>
              <option value="gl">{TARGET_NAMES.gl}</option>
            </select>
          </label>
          <label className="inspector-field">
            <span>Packages</span>
            <input
              type="text"
              placeholder="physics, cancel"
              value={packages}
              data-testid="inspector-packages"
              onChange={(e) => setPackages(e.target.value)}
            />
          </label>
          <label className="inspector-field">
            <span>Backend</span>
            <select
              value={prefer}
              disabled={compare}
              data-testid="inspector-prefer"
              onChange={(e) => setPrefer(e.target.value as Prefer)}
            >
              <option value="auto">auto</option>
              <option value="mathjax">MathJax</option>
              <option value="latex">LaTeX (companion)</option>
            </select>
          </label>
          <label className="inspector-check">
            <input
              type="checkbox"
              checked={compare}
              data-testid="inspector-compare"
              onChange={(e) => setCompare(e.target.checked)}
            />
            <span>Compare backends</span>
          </label>
          <span className="inspector-dim inspector-companion" data-testid="inspector-companion">
            companion {companion.status}
          </span>
        </div>
        <div className="inspector-body" data-testid="inspector-result">
          {outcome === null && <p className="inspector-dim">Rendering…</p>}
          {outcome?.mode === 'single' && (
            <section>
              <ResultSummary timed={outcome.single} testId="inspector" />
              {outcome.single.result.ok && (
                <GlyphView
                  render={outcome.single.result.render}
                  highlighted={highlights.single}
                  onHover={hoverOn('single')}
                  testId="inspector-glyphs"
                />
              )}
            </section>
          )}
          {outcome?.mode === 'compare' && (
            <>
              <div className="inspector-compare">
                {(['mathjax', 'latex'] as const).map((side) => {
                  const timed = outcome[side];
                  return (
                    <section key={side} data-testid={`inspector-${side}`}>
                      <h3>{side === 'mathjax' ? 'MathJax' : 'LaTeX'}</h3>
                      <ResultSummary timed={timed} testId={`inspector-${side}`} />
                      {timed.result.ok && (
                        <GlyphView
                          render={timed.result.render}
                          highlighted={highlights[side]}
                          onHover={hoverOn(side)}
                          testId={`inspector-${side}-glyphs`}
                        />
                      )}
                    </section>
                  );
                })}
              </div>
              {outcome.match && (
                <section className="inspector-mapping" data-testid="inspector-mapping">
                  <h3>
                    Position match MathJax → LaTeX · confidence{' '}
                    <span data-testid="inspector-confidence">
                      {outcome.match.confidence.toFixed(2)}
                    </span>
                  </h3>
                  <ol>
                    {outcome.match.map.map((j, i) => {
                      const label = (r: RenderResult, k: number) =>
                        r.ok ? (r.render.glyphs[k]?.label ?? '?') : '?';
                      return (
                        <li
                          key={i}
                          className={highlights.mathjax.has(i) ? 'active' : undefined}
                          onMouseEnter={() => setHover({ side: 'mathjax', index: i })}
                          onMouseLeave={() => setHover(null)}
                        >
                          {i} {label(outcome.mathjax.result, i)} →{' '}
                          {j === null ? 'unmatched' : `${j} ${label(outcome.latex.result, j)}`}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
