/* The formula engine: picks a backend, caches renders by key, tracks the companion. How each
 * kind of object renders in either mode is its glyph producer's business (producers.ts).
 *
 * A font text has one backend, Pango in the companion, whatever `prefer` says. Where no companion
 * shapes text for the request's library, or it goes away under the request, the render is the
 * text's placeholder boxes (its producer's free mode), which is not exact; an error is only what
 * the companion says of the text itself (a font it does not have, a glyph it cannot outline).
 *
 * Backend choice (RenderRequest.prefer): 'mathjax' always uses MathJax; 'latex' needs the
 * companion online and otherwise returns an error result; 'auto' uses LaTeX when the companion
 * is online and MathJax otherwise (while the first health check is running it waits for it, so
 * a page load with a running companion does not start with a throw-away MathJax render). An
 * 'auto' render whose companion request fails at the transport level falls back to MathJax.
 *
 * Cache: LRU over render keys (renderKey with the backend's own version, e.g. latex+1), holding
 * promises so concurrent requests for one key share one render. Results that depend on the
 * companion being reachable (transport failures, fallback GL calibration) are evicted when
 * they settle; LaTeX and MathJax errors are deterministic and stay cached. */
import {
  companionCommand,
  createCompanionClient,
  type CompanionClient,
  type CompanionClientOptions,
} from './companion';
import { renderKey } from './key';
import { createLatexBackend, LATEX_BACKEND_VERSION, type BackendOutcome } from './latex';
import { MATHJAX_BACKEND_VERSION } from './mathjax';
import { producerOf, renderRequestFor, type RenderableFormula } from './producers';
import { textBoxRanges } from './textBoxes';
import {
  createPangoBackend,
  isTextBoxes,
  PANGO_BACKEND_VERSION,
  pangoState,
  sameTextShape,
  textBasisMatches,
  textBoxesKey,
  textSavedBoxesKey,
} from './pango';
import type {
  CompanionState,
  FormulaEngine,
  FormulaRender,
  RenderRequest,
  RenderResult,
  ResolvedFormula,
  TextRenderRequest,
} from './types';
import type { Formula, ProjectMeta, RenderBackend, Target, TextFormula } from '../model';

const ENGINE_VERSION = `${MATHJAX_BACKEND_VERSION}|${LATEX_BACKEND_VERSION}|${PANGO_BACKEND_VERSION}`;
export const DEFAULT_CACHE_SIZE = 500;

export const BACKEND_VERSIONS: Readonly<Record<RenderBackend, string>> = {
  mathjax: MATHJAX_BACKEND_VERSION,
  latex: LATEX_BACKEND_VERSION,
  pango: PANGO_BACKEND_VERSION,
};

/** Whether `render` is what the engine would render for `formula` now: its LaTeX, packages,
 * size, the project's preamble and target, and the backend's version are unchanged. */
export function isCurrentRender(
  render: FormulaRender,
  formula: RenderableFormula,
  meta: Pick<ProjectMeta, 'preamble' | 'target'>,
): boolean {
  if (formula.kind === 'text') {
    return (
      render.backend === 'pango' &&
      !!render.text &&
      textBasisMatches(render.text.basis, { ...formula, target: meta.target })
    );
  }
  return render.key === expectedRenderKey(formula, meta, render.backend);
}

/** The key a render of `formula` by `source` has now, for a project with `meta`. */
export function expectedRenderKey(
  formula: RenderableFormula,
  meta: Pick<ProjectMeta, 'preamble' | 'target'>,
  source: RenderBackend,
): string {
  return renderKey(renderRequestFor(formula, meta, 'auto'), source, BACKEND_VERSIONS[source]);
}

/** Whether the formula's snapshot is exact for `meta` as it stands: taken from the LaTeX backend
 * for this LaTeX, packages, size, preamble and target, by the current backend version. Only then
 * may an export address the glyphs by literal indices: a LaTeX snapshot kept from an earlier
 * render (the sync keeps one while the companion is offline, also after a change of target or
 * preamble) can number the glyphs differently from what Manim will build. */
export function isExactSnapshot(
  formula: RenderableFormula & Pick<Formula, 'snapshot'>,
  meta: Pick<ProjectMeta, 'preamble' | 'target'>,
): boolean {
  const { snapshot } = formula;
  if (formula.kind === 'text') {
    return (
      snapshot?.backend === 'pango' &&
      formula.geometry?.key === snapshot.key &&
      formula.geometry.basisKey === expectedRenderKey(formula, meta, 'pango')
    );
  }
  return (
    snapshot !== null &&
    snapshot.backend === 'latex' &&
    snapshot.key === expectedRenderKey(formula, meta, 'latex')
  );
}

/** How a font text is drawn by `render`, for the project as it stands:
 *   - `exact`: the geometry the project's library shaped for its source, font and size;
 *   - `borrowed`: the geometry the other library shaped for them (the project changed library
 *     where nothing could shape the text again): the same glyphs in the same order, another size;
 *   - `saved-boxes`: boxes where the glyphs of its snapshot were, its geometry not being at hand;
 *   - `boxes`: the placeholder boxes of its source, nothing having shaped it;
 *   - `stale`: something of an earlier source, font or size (a newer render is due, or failed). */
export type TextDrawing = 'exact' | 'borrowed' | 'saved-boxes' | 'boxes' | 'stale';

export function textDrawing(
  formula: Pick<TextFormula, 'kind' | 'source' | 'font' | 'fontSize' | 'snapshot' | 'geometry'>,
  render: FormulaRender,
  meta: Pick<ProjectMeta, 'preamble' | 'target'>,
): TextDrawing {
  if (render.text) {
    if (isCurrentRender(render, formula, meta)) return 'exact';
    return sameTextShape(render.text.basis, { ...formula, target: meta.target })
      ? 'borrowed'
      : 'stale';
  }
  if (!isTextBoxes(render)) return 'stale';
  const request = renderRequestFor(formula, meta, 'auto');
  if (request.kind !== 'text') return 'stale';
  if (render.boxes) return render.key === textBoxesKey(request) ? 'boxes' : 'stale';
  return formula.snapshot &&
    textShapedFor(formula) !== null &&
    render.key === textSavedBoxesKey(request, formula.snapshot.key)
    ? 'saved-boxes'
    : 'stale';
}

/** Whether the glyphs of a font text nothing has shaped as it stands are counted by its boxes:
 * the glyph references of the project then say something of the text as it is. `resolved`, what
 * the render sync left for it, must be the boxes of its source, font and size for the project's
 * library, and its snapshot must be theirs (one glyph per character), or be an earlier shape of
 * the same source that the sync carried over to them (a new font or size where nothing could
 * shape it). Boxes drawn over a snapshot nothing could carry over, the one of an earlier source
 * whose geometry is not at hand, say nothing of its references: not counted. With nothing
 * resolved at hand, the snapshot must be the one of those boxes. A snapshot that has the key of
 * the boxes and another number of glyphs was cut by another rule (an earlier version, a file
 * written by hand): the sync leaves its references alone and says it is unsure, and it counts
 * nothing here either. An export writes a counted text on trust. */
export function textCountedByBoxes(
  formula: Pick<TextFormula, 'kind' | 'source' | 'font' | 'fontSize' | 'snapshot' | 'geometry'>,
  resolved: Pick<ResolvedFormula, 'render' | 'confidence'> | undefined,
  meta: Pick<ProjectMeta, 'preamble' | 'target'>,
): boolean {
  const request = renderRequestFor(formula, meta, 'auto');
  if (request.kind !== 'text') return false;
  const key = textBoxesKey(request);
  const { snapshot } = formula;
  /** The snapshot of these boxes: their key, and one glyph for each of them. */
  const theirs =
    snapshot?.key === key && snapshot.glyphs.length === textBoxRanges(request.source).length;
  if (!resolved) return theirs;
  if (!resolved.render.boxes || resolved.render.key !== key) return false;
  if (!snapshot) return true;
  return snapshot.key === key ? theirs : resolved.confidence > 0;
}

/** The library whose `Text` the saved geometry of `formula` is, for the text as it stands (its
 * source, font and size), or null when there is none by either library. `render` answers when it
 * is the one the project's glyph references count by (the snapshot's, or the only one there is);
 * otherwise the formula's own geometry reference does. An export for that library is exact; one
 * for the other writes the same `Text` on trust (`TEXT_CE_GL_SIZE_RATIO`). */
export function textShapedFor(
  formula: Pick<TextFormula, 'kind' | 'source' | 'font' | 'fontSize' | 'snapshot' | 'geometry'>,
  render?: FormulaRender,
): Target | null {
  const counted = render && (!formula.snapshot || formula.snapshot.key === render.key);
  for (const target of ['ce', 'gl'] as const) {
    const meta = { preamble: '', target };
    if (counted ? isCurrentRender(render, formula, meta) : isExactSnapshot(formula, meta))
      return target;
  }
  return null;
}

/** The fingerprint a scene for `target` can check the text it builds against: the saved one of
 * the geometry the project's glyph references count by, when `target`'s library shaped it. Null:
 * no such check (the other library's geometry, one that is not the snapshot's, none at hand, or
 * one without a fingerprint). */
export function textSignatureFor(
  formula: Parameters<typeof textShapedFor>[0],
  render: FormulaRender | undefined,
  target: Target,
): string | null {
  if (!render?.text || (formula.snapshot && formula.snapshot.key !== render.key)) return null;
  if (textShapedFor(formula, render) !== target) return null;
  return render.text.provenance.geometrySignature ?? null;
}

export interface EngineOptions {
  /** An existing client (tests), or options for a new one. */
  companion?: CompanionClient | CompanionClientOptions;
  cacheSize?: number;
}

/** Engine plus a few extras for tools (inspector, tests). */
export interface Engine extends FormulaEngine {
  readonly client: CompanionClient;
  /** Number of cached renders. */
  cacheSize(): number;
  clearCache(): void;
  /** Refresh a settled text result without cancelling other consumers or other kinds. */
  invalidateText(request: TextRenderRequest): void;
  /** Have the companion start its text worker for `target` when nothing has yet (it starts
   * none by itself): asked for a project with font text, which needs it to shape a text and to
   * tell whether the fonts a saved one was shaped with are still these. Nothing is awaited: the
   * companion's state says when the worker is ready. A worker that failed to start is left to
   * the next request that names it (the text editor's font list). */
  prepareText(target: Target): void;
  /** Stop polling the companion. */
  dispose(): void;
}

/** Why "LaTeX only" cannot render: the companion is not running. */
export const offlineMessage = (): string =>
  `Exact rendering needs the companion, which is not running. Start it: ${companionCommand()}`;

export const NO_LATEX_MESSAGE =
  'The companion cannot run LaTeX: latex or dvisvgm is not installed where it runs.';

/** The companion is running and can compile LaTeX (it found latex and dvisvgm). */
export function canRenderLatex(state: CompanionState): boolean {
  return (
    state.status === 'online' &&
    state.health.capabilities.latex &&
    state.health.capabilities.dvisvgm
  );
}

function isClient(value: unknown): value is CompanionClient {
  return !!value && typeof (value as CompanionClient).tex === 'function';
}

export function createEngine(options: EngineOptions = {}): Engine {
  const client = isClient(options.companion)
    ? options.companion
    : createCompanionClient(options.companion);
  const latex = createLatexBackend(client);
  const pango = createPangoBackend(client);
  /** The libraries whose text worker this engine asked the companion to start, until it answers. */
  const preparing = new Set<Target>();
  const maxEntries = options.cacheSize ?? DEFAULT_CACHE_SIZE;
  type Settled = { result: RenderResult; unavailable: boolean };
  const cache = new Map<string, Promise<Settled>>();
  /** Keys of cached LaTeX failures: a companion that comes back (restarted, perhaps with new
   * packages installed) gets asked again. */
  const latexFailures = new Set<string>();
  let couldRender = canRenderLatex(client.state());
  const unsubscribe = client.subscribe((state) => {
    const can = canRenderLatex(state);
    if (can && !couldRender) {
      for (const key of latexFailures) cache.delete(key);
      latexFailures.clear();
    }
    couldRender = can;
  });

  /** `result` with the producer's hints about the request among its warnings (a new result: the
   * cached one stays as the backend gave it). */
  const withHints = (request: RenderRequest, result: RenderResult): RenderResult => {
    const hints = producerOf(request.kind).hints?.(request) ?? [];
    if (!result.ok || hints.length === 0) return result;
    const { render } = result;
    return { ok: true, render: { ...render, warnings: [...render.warnings, ...hints] } };
  };

  /** Render through one backend, sharing and caching by render key. A font text comes here for
   * its placeholder boxes only (what Pango shapes has its own cache, `pango.ts`). */
  const run = (request: RenderRequest, source: RenderBackend): Promise<Settled> => {
    const key =
      request.kind === 'text'
        ? textBoxesKey(request)
        : renderKey(request, source, BACKEND_VERSIONS[source]);
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key); // LRU: move to the most recent end
      cache.set(key, hit);
      return hit;
    }
    const outcome: Promise<BackendOutcome> =
      source === 'latex' && !producerOf(request.kind).local
        ? latex.render(request, key)
        : Promise.resolve().then(() => ({
            result: producerOf(request.kind).free(request, key),
            transient: false,
          }));
    const promise = outcome.then((o) => {
      if (o.transient && cache.get(key) === promise) cache.delete(key);
      else if (source === 'latex' && !o.result.ok) latexFailures.add(key);
      return { result: o.result, unavailable: !!o.unavailable };
    });
    cache.set(key, promise);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value!;
      cache.delete(oldest);
      latexFailures.delete(oldest);
    }
    return promise;
  };

  const engine: Engine = {
    version: ENGINE_VERSION,
    client,
    async render(request, signal) {
      signal?.throwIfAborted();
      if (request.kind === 'text') {
        if (client.state().status === 'checking') await client.settled();
        signal?.throwIfAborted();
        const shaped = await pango.render(request, signal);
        if (shaped.ok || !shaped.error.unavailable) return shaped;
        signal?.throwIfAborted();
        return (await run(request, 'pango')).result;
      }
      // A kind built in the browser in either mode (a brace): exact without the companion.
      if (producerOf(request.kind).local) {
        return withHints(request, (await run(request, 'latex')).result);
      }
      let state = client.state();
      if (request.prefer !== 'mathjax' && state.status === 'checking') {
        state = await client.settled();
      }
      const latexReady = canRenderLatex(state);
      if (request.prefer === 'latex' && !latexReady) {
        const message = state.status === 'online' ? NO_LATEX_MESSAGE : offlineMessage();
        return { ok: false, error: { message, backend: 'latex' } };
      }
      const source: RenderBackend =
        request.prefer === 'mathjax' ? 'mathjax' : latexReady ? 'latex' : 'mathjax';
      const { result, unavailable } = await run(request, source);
      if (source === 'latex' && unavailable && request.prefer === 'auto') {
        return withHints(request, (await run(request, 'mathjax')).result);
      }
      return withHints(request, result);
    },
    companion: () => client.state(),
    onCompanionChange: (listener: (state: CompanionState) => void) => client.subscribe(listener),
    cacheSize: () => cache.size,
    invalidateText: (request) => pango.invalidate(request),
    prepareText(target) {
      if (!client.fonts || preparing.has(target) || pangoState(client.state(), target) !== 'unused')
        return;
      preparing.add(target);
      // The font list is what starts the worker; its answer comes when the worker is ready.
      void client
        .fonts(target)
        .catch(() => undefined)
        .finally(() => {
          preparing.delete(target);
          void client.check();
        });
      // The companion says "preparing" from now on: see it without waiting for the next poll.
      setTimeout(() => void client.check(), 200);
    },
    clearCache: () => {
      cache.clear();
      latexFailures.clear();
      pango.clear();
    },
    dispose: () => {
      unsubscribe();
      pango.clear();
      client.stop();
    },
  };
  return engine;
}
