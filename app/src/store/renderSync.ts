/* Render sync: keeps the render store and the formula snapshots up to date with the project
 * (docs/ARCHITECTURE.md, "Glyph index spaces").
 *
 * For every formula it asks the engine for a render whenever something that affects it changes
 * (its content — a formula's source and packages, `engine/producers.ts` —, fontSize, meta.target,
 * meta.preamble, the glyph-source preference, or the companion going online/offline) and publishes
 * the outcome in `useRenderStore`:
 * `loading` (keeping the previous resolution), then `ok` or `error` (keeping it too). Responses
 * to superseded requests are dropped.
 *
 * Snapshots (the canonical glyph index space) are maintained with `amend`, never as undo steps:
 *   - no snapshot yet            → taken from the render;
 *   - a source/layout change     → compose canonical→previous render with verified renderer,
 *                                  source and layout steps (`engine/correspondence.ts`);
 *   - a lower-fidelity render    → resolve through that map without replacing an exact snapshot,
 *                                  unless the source really changed;
 *   - an unavailable bridge      → retain authored data and report uncertainty.
 * A font text follows the same rules with its own pieces. Its exact render is the geometry it
 * saved, or what the companion shapes; where neither is to be had it is drawn as placeholder
 * boxes (`engine/textBoxes.ts`), which stand to its geometry as MathJax stands to LaTeX: boxes
 * never replace the snapshot of a shaped text unless its source changed, and references made on
 * boxes are carried to the real glyphs by source range when the text is shaped
 * (`engine/textMatch.ts`). A text whose saved geometry is not at hand gets it back by itself
 * only when a companion shapes that very geometry again (the same key); otherwise it is drawn as
 * boxes, never re-counted behind the author's back, until its file or "Refresh appearance" brings
 * a geometry.
 * Known snapshot requests recognize an authoritative snapshot restored by undo before treating
 * the observed source change as a new edit. Loading clears formula trackers and transitions;
 * immutable request facts keyed by verified snapshots remain available like the render cache.
 * A verified reusable render still runs snapshot maintenance. */
import {
  canRenderLatex,
  BACKEND_VERSIONS,
  getEngine,
  glyphLikes,
  matchGlyphs,
  producerOf,
  renderRequestFor,
  renderKey,
  resolveFormula,
  resolveFormulaTransition,
  sameTextShape,
  savedBoxesRender,
  toSnapshot,
  textArtifactRender,
  textBasisMatches,
  textBoxesKey,
  textBoxesLayout,
  textBoxRanges,
  textLayoutOf,
  textSavedBoxesKey,
  textShapedFor,
  matchTextLayouts,
  type FormulaEngine,
  type FormulaRender,
  type GlyphMatch,
  type RenderRequest,
  type RenderResult,
  type ResolvedFormula,
} from '../engine';
import {
  composeGlyphMatches,
  matchRenderChange,
  renderBasis,
  requestContent,
  requestIdentity,
  type RenderBasis,
} from '../engine/correspondence';
import {
  droppedTotal,
  emptyRemapReport,
  isBlank,
  remapGlyphRefs,
  type Formula,
  type FormulaId,
  type Project,
  type RemapReport,
  type TextGeometryArtifact,
  type TextGeometryRef,
} from '../model';
import { create } from 'zustand';
import { freedEndPoint } from '../scene';
import { onProjectLoaded, useProjectStore } from './projectStore';
import { useRenderStore, type FormulaRenderEntry } from './renderStore';
import {
  discardTextGeometry,
  loadTextGeometry,
  lostTextGeometryNote,
  MediaStorageError,
  storeTextGeometry,
  type StoredTextGeometry,
} from '../media';
import { announceMediaReturned, syncCurrentMediaOwnership } from './mediaOwnership';

// --- Warnings --------------------------------------------------------------------

/** Below this match confidence the user is asked to check the mapping (see GlyphMatch). */
export const CONFIDENCE_THRESHOLD = 0.8;
const refreshListeners = new Set<(id: FormulaId) => void>();

/** Explicit retry for a committed source whose geometry is still absent. It does not mutate
 * authored data or silently refresh an existing saved artifact. */
export function refreshFormulaRender(id: FormulaId): void {
  for (const listener of refreshListeners) listener(id);
}

/** What the last re-mapping of a formula's glyphs dropped, and how sure the match was. */
export interface SyncWarning extends RemapReport {
  /** What changed: the LaTeX was edited, or the glyph source/target/size changed. */
  cause: 'edit' | 'rebase';
  /** Match confidence, 0…1. */
  confidence: number;
}

interface WarningState {
  warnings: Readonly<Record<FormulaId, SyncWarning>>;
  dismiss(id: FormulaId): void;
  clear(): void;
}

/** Formulas whose glyph references may need a look after their glyphs were re-mapped. Shown in
 * the Creator; not undoable, not saved. */
export const useSyncWarnings = create<WarningState>()((set) => ({
  warnings: {},
  dismiss: (id) =>
    set((state) => {
      if (!(id in state.warnings)) return state;
      const warnings = { ...state.warnings };
      delete warnings[id];
      return { warnings };
    }),
  clear: () => set((state) => (Object.keys(state.warnings).length ? { warnings: {} } : state)),
}));

function setWarning(id: FormulaId, warning: SyncWarning): void {
  useSyncWarnings.setState((state) => ({ warnings: { ...state.warnings, [id]: warning } }));
}

/** Human-readable text of a warning (shared by the Creator and tests). */
export function describeWarning(warning: SyncWarning): string {
  const parts: string[] = [];
  if (warning.droppedColors > 0) parts.push(`${warning.droppedColors} glyph colour(s) dropped`);
  if (warning.droppedHidden > 0) {
    parts.push(`${warning.droppedHidden} hidden glyph(s) dropped`);
  }
  if (warning.droppedPairGlyphs + warning.droppedPairs > 0) {
    parts.push(
      `${warning.droppedPairGlyphs} pair glyph(s) and ${warning.droppedPairs} pair(s) dropped`,
    );
  }
  if (warning.droppedActionGlyphs > 0) {
    parts.push(`${warning.droppedActionGlyphs} block glyph(s) dropped`);
  }
  if (warning.droppedAttachGlyphs > 0) {
    parts.push(`${warning.droppedAttachGlyphs} attachment glyph(s) dropped`);
  }
  if (warning.detached > 0) {
    parts.push(`${warning.detached} attached object(s) detached`);
  }
  if (warning.droppedFits > 0) {
    parts.push(`${warning.droppedFits} Transform(s) of a shape to those glyphs removed`);
  }
  if (warning.confidence < CONFIDENCE_THRESHOLD) {
    parts.push(`glyph matching confidence ${Math.round(warning.confidence * 100)}%`);
  }
  const lead = warning.cause === 'edit' ? 'The source changed' : 'The glyphs were re-rendered';
  return `${lead}: check glyph colours, pairs and blocks (${parts.join('; ')}).`;
}

// --- The service -----------------------------------------------------------------

interface Tracker {
  /** JSON of the last request issued for this formula (null = none yet). */
  requestKey: string | null;
  /** Increases with every request; a response is applied only if it carries the latest. */
  generation: number;
  /** The formula's content as last seen in the project (`contentOf`), to notice edits. */
  content: string;
  /** The content changed and no render has been applied since. */
  edited: boolean;
  /** Request provenance and canonical correspondence of the last verified successful render. */
  successful: (RenderBasis & { resolved: ResolvedFormula }) | null;
  abort?: AbortController;
  retryAt?: number;
}

/** What of `formula` counts as its content (its producer says: a formula's source and packages),
 * as JSON: used for pending-edit state and warnings; correspondence uses successful requests. */
function contentOf(formula: Formula): string {
  return JSON.stringify(producerOf(formula.kind).content(formula));
}

/** Characters set right to left, and the marks that turn the direction of others: the Hebrew,
 * Arabic and neighbouring blocks, their presentation forms, the right-to-left planes, and the
 * bidirectional controls. Ranges, not properties: the same in every browser. */
const RIGHT_TO_LEFT =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u200F\u202A-\u202E\u2066-\u2069\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

/** Whether the glyphs of `snapshot` are, label by label, the characters of `source` that draw
 * something, in its order: what a snapshot of its placeholder boxes is, and a shaped one of a
 * text without ligatures set left to right. Never said of a text with something set right to
 * left: shaped glyphs come in the order they are drawn, so a word that reads the same both ways
 * has these labels with its letters the other way round. */
function countsCharacters(snapshot: NonNullable<Formula['snapshot']>, source: string): boolean {
  if (RIGHT_TO_LEFT.test(source)) return false;
  const ranges = textBoxRanges(source);
  return (
    ranges.length === snapshot.glyphs.length &&
    ranges.every(
      ({ start, end }, index) => snapshot.glyphs[index]!.label === source.slice(start, end),
    )
  );
}

/** A render that is worse than the snapshot's source must not replace it. */
function lowerFidelity(render: FormulaRender, formula: Formula): boolean {
  return (
    render.backend === 'mathjax' &&
    (formula.snapshot?.backend === 'latex' || formula.snapshot?.backend === 'pango')
  );
}

/** The companion can render LaTeX now (a change re-renders every formula). */
function isOnline(engine: FormulaEngine): boolean {
  return canRenderLatex(engine.companion());
}

export function startRenderSync(engine: FormulaEngine = getEngine()): () => void {
  const trackers = new Map<FormulaId, Tracker>();
  const reusable = new Map<FormulaId, RenderBasis>();
  /** Content-addressed facts, independent of formula/document identity. Bounded like the
   * engine's render cache; eviction leaves unknown provenance, never an assumed source edit. */
  const snapshots = new Map<string, RenderRequest>();
  const renderStore = useRenderStore;
  let running = true;
  /** True while the service itself amends the project (its own change needs no processing). */
  let amending = false;
  const availabilityKey = () => JSON.stringify(engine.companion());
  let lastAvailability = availabilityKey();
  const verifiedArtifacts = new Set<string>();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const retryBusyText = () => {
    if (retryTimer !== undefined || !running) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (!running) return;
      const project = useProjectStore.getState().project;
      for (const formula of project.formulas) {
        const tracker = trackers.get(formula.id);
        if (tracker?.retryAt && tracker.retryAt <= Date.now())
          request(formula, project, tracker, true);
      }
      if ([...trackers.values()].some((tracker) => tracker.retryAt)) retryBusyText();
    }, 250);
  };

  const entryOf = (id: FormulaId): FormulaRenderEntry | undefined =>
    renderStore.getState().entries[id];

  /** Re-resolve `formula` against the render the entry already holds. */
  const rebase = (resolved: ResolvedFormula, formula: Formula): ResolvedFormula =>
    resolveFormulaTransition(formula, resolved, renderStore.getState().transitions[formula.id]);

  const buildRequest = (formula: Formula, project: Project): RenderRequest =>
    renderRequestFor(formula, project.meta, renderStore.getState().prefer);

  const preferredBackend = (request: RenderRequest): FormulaRender['backend'] =>
    request.kind === 'text'
      ? 'pango'
      : producerOf(request.kind).local
        ? 'latex'
        : request.prefer === 'auto'
          ? isOnline(engine)
            ? 'latex'
            : 'mathjax'
          : request.prefer;

  const canReuse = (basis: RenderBasis, request: RenderRequest): boolean =>
    requestIdentity(basis.request) === requestIdentity(request) &&
    basis.render.backend === preferredBackend(request);

  const currentFormula = (id: FormulaId): Formula | undefined =>
    useProjectStore.getState().project.formulas.find((f) => f.id === id);

  /** Amend the project (the store tells onProjectAmended listeners); `recipe` gets the draft. */
  const amend = (recipe: (draft: Project) => void): void => {
    amending = true;
    try {
      useProjectStore.getState().amend(recipe);
    } finally {
      amending = false;
    }
  };

  /** Replace the snapshot of `formula` with the one of `render`, remapping references. */
  const rebaseSnapshot = (
    formula: Formula,
    render: FormulaRender,
    match: GlyphMatch,
    cause: SyncWarning['cause'],
    geometry?: TextGeometryRef,
  ): void => {
    const old = formula.snapshot;
    if (!old) return;
    let report = emptyRemapReport();
    // Published first, for whoever holds glyph indices of the old snapshot (an open relation
    // editor): when the project changes, the step that explains it is already there.
    useRenderStore.getState().setTransition(formula.id, {
      from: old.key,
      to: render.key,
      map: match.map,
    });
    // An end a Transform carried a line to that loses its glyphs stays where the line was drawn:
    // measured on the project and the renders as they are before the new one comes in.
    const freed = freedEndPoint(
      useProjectStore.getState().project,
      renderStore.getState().resolved,
    );
    amend((draft) => {
      report = remapGlyphRefs(draft, formula.id, match.map, freed);
      const target = draft.formulas.find((f) => f.id === formula.id);
      if (target) {
        target.snapshot = toSnapshot(render);
        if (target.kind === 'text' && geometry) target.geometry = geometry;
        // Boxes took the place of a shaped snapshot: the geometry is of an earlier source, and
        // nothing counts by it any more.
        else if (target.kind === 'text' && !render.text) target.geometry = null;
      }
    });
    const dropped = droppedTotal(report) > 0;
    if (match.confidence < CONFIDENCE_THRESHOLD || dropped) {
      setWarning(formula.id, {
        cause,
        confidence: match.confidence,
        ...report,
      });
    }
  };

  const rememberSnapshot = (key: string, request: RenderRequest): void => {
    snapshots.delete(key);
    snapshots.set(key, request);
    if (snapshots.size > 500) snapshots.delete(snapshots.keys().next().value!);
  };

  interface SnapshotPlan {
    match: GlyphMatch | null;
    replace: boolean;
    cause: SyncWarning['cause'];
    verified: boolean;
  }

  const planSnapshot = async (
    formula: Formula,
    render: FormulaRender,
    request: RenderRequest,
    tracker: Tracker,
    current: () => boolean,
  ): Promise<SnapshotPlan> => {
    const snapshot = formula.snapshot;
    if (
      snapshot &&
      formula.kind === 'text' &&
      snapshot.key === render.key &&
      snapshot.glyphs.length !== render.glyphs.length
    ) {
      // The same key and another number of glyphs: not the render the snapshot was taken from
      // (a file written by hand, boxes cut by another rule). Its references are left alone.
      return { match: null, replace: false, cause: 'rebase', verified: false };
    }
    if (!snapshot || snapshot.key === render.key) {
      return { match: null, replace: !snapshot, cause: 'rebase', verified: true };
    }
    if (formula.kind === 'text') {
      const cause = tracker.edited ? 'edit' : 'rebase';
      const to = textLayoutOf(render);
      if (!to) {
        // Boxes where the glyphs of this very snapshot were: glyph k is canonical glyph k.
        const map = snapshot.glyphs.map((_, index) =>
          index < render.glyphs.length ? index : null,
        );
        return { match: { map, confidence: 1 }, replace: false, cause: 'rebase', verified: true };
      }
      // What the snapshot counts, from the surest word to the least:
      //   1. a render at hand with its key;
      //   2. its key is the one of the boxes of the text as it stands (whoever laid them out);
      //   3. its key is the one of the boxes of an earlier request of this session (an undo or a
      //      redo brought the snapshot back while something else was on its way);
      //   4. its glyphs are, label by label, the characters of the text as it stands that draw
      //      something: one glyph per character in the order of the source, whatever made it.
      // None of them is trusted for another number of glyphs than the snapshot has.
      const held = [tracker.successful?.resolved, entryOf(formula.id)?.resolved].find(
        (value) => value?.render.key === snapshot.key && textLayoutOf(value.render),
      );
      const earlier = snapshots.get(snapshot.key);
      const candidates = [
        held ? textLayoutOf(held.render) : null,
        request.kind === 'text' && snapshot.key === textBoxesKey(request)
          ? textBoxesLayout(request.source)
          : null,
        earlier?.kind === 'text' && snapshot.key === textBoxesKey(earlier)
          ? textBoxesLayout(earlier.source)
          : null,
        request.kind === 'text' && countsCharacters(snapshot, request.source)
          ? textBoxesLayout(request.source)
          : null,
      ];
      const from = candidates.find((layout) => layout?.glyphs.length === snapshot.glyphs.length);
      if (!from) {
        // Nothing says what the snapshot's glyphs stood for. A shaped text takes its place and
        // the references go (a guess by position could repaint the wrong letters); boxes leave
        // the authored data alone and say they are unsure.
        return render.text
          ? {
              match: { map: snapshot.glyphs.map(() => null), confidence: 0 },
              replace: true,
              cause,
              verified: true,
            }
          : { match: null, replace: false, cause, verified: false };
      }
      const match = matchTextLayouts(from, to);
      // Boxes are the lesser render: they take the place of a shaped snapshot only when its
      // source is no longer the text's (as MathJax does with a LaTeX one).
      const replace = !!render.text || from.boxes || from.source !== to.source;
      return { match, replace, cause, verified: true };
    }
    const origin = snapshots.get(snapshot.key);
    const alreadyCurrent =
      snapshot.key === renderKey(request, snapshot.backend, BACKEND_VERSIONS[snapshot.backend]) ||
      (origin !== undefined && requestIdentity(origin) === requestIdentity(request));
    if (alreadyCurrent) {
      // A restored exact snapshot already belongs to this source/layout. A lower-fidelity
      // renderer only resolves it; an edit observed on the way through undo must not replace it.
      return {
        match: matchGlyphs(snapshot.glyphs, glyphLikes(render), 'position'),
        replace: !lowerFidelity(render, formula),
        cause: 'rebase',
        verified: true,
      };
    }
    const previous = tracker.successful;
    let basis: RenderBasis | null = null;
    let canonical: GlyphMatch | null = null;
    if (previous?.resolved.formula.snapshot?.key === snapshot.key) {
      basis = previous;
      canonical = {
        map: previous.resolved.canonToRender,
        confidence: previous.resolved.confidence,
      };
    } else if (origin) {
      basis = await renderBasis(engine, origin, render.backend, current);
      if (basis) canonical = matchGlyphs(snapshot.glyphs, glyphLikes(basis.render), 'position');
    }
    const edited = basis
      ? requestContent(basis.request) !== requestContent(request)
      : origin
        ? requestContent(origin) !== requestContent(request)
        : tracker.edited;
    if (basis && canonical) {
      const next = await matchRenderChange(basis, { request, render }, engine, current);
      if (next) {
        return {
          match: composeGlyphMatches(canonical, next),
          replace: edited || !lowerFidelity(render, formula),
          cause: edited ? 'edit' : 'rebase',
          verified: true,
        };
      }
    } else if (!origin && !edited) {
      // A loaded legacy snapshot has no saved request provenance. Resolve its known geometry
      // as before; subsequent edits can compose through this successful current render.
      return {
        match: matchGlyphs(snapshot.glyphs, glyphLikes(render), 'position'),
        replace: !lowerFidelity(render, formula),
        cause: 'rebase',
        verified: true,
      };
    }
    // No valid same-backend bridge (for example an old source unsupported by MathJax). Keep
    // authored canonical data and the last verified basis instead of persisting a guessed edit.
    return { match: null, replace: false, cause: edited ? 'edit' : 'rebase', verified: false };
  };

  const apply = async (
    id: FormulaId,
    tracker: Tracker,
    generation: number,
    requestValue: RenderRequest,
    result: RenderResult,
  ): Promise<void> => {
    // Superseded: a newer request of the formula, or a formula deleted meanwhile (brought back
    // by undo, it has a new tracker whose generations start again: the old one's are not its).
    const current = () =>
      running && trackers.get(id) === tracker && tracker.generation === generation;
    if (!current()) return;
    const formula = currentFormula(id);
    if (!formula) return; // deleted meanwhile
    if (!result.ok) {
      const previous = entryOf(id);
      if (formula.kind === 'text' && result.error.retryAfterMs) {
        tracker.retryAt = Date.now() + Math.max(100, Math.min(2000, result.error.retryAfterMs));
        renderStore
          .getState()
          .setEntry(id, { status: 'loading', resolved: previous?.resolved ?? null, error: null });
        retryBusyText();
        return;
      }
      renderStore.getState().setEntry(id, {
        status: 'error',
        resolved: previous?.resolved ?? null,
        error: result.error,
      });
      return;
    }
    const plan = await planSnapshot(formula, result.render, requestValue, tracker, current);
    if (!current()) return;
    if (currentFormula(id)?.snapshot?.key !== formula.snapshot?.key) {
      const latest = currentFormula(id);
      if (latest) request(latest, useProjectStore.getState().project, tracker, true);
      return;
    }
    let stored: StoredTextGeometry | undefined;
    if (result.render.text && !plan.verified) {
      renderStore.getState().setEntry(id, {
        status: 'error',
        resolved: entryOf(id)?.resolved ?? null,
        error: {
          backend: 'pango',
          message: 'The text correspondence needs repair before its saved appearance can change.',
        },
      });
      return;
    }
    if (
      formula.kind === 'text' &&
      result.render.text &&
      (!formula.geometry ||
        formula.geometry.key !== result.render.key ||
        !verifiedArtifacts.has(formula.geometry.contentHash))
    ) {
      try {
        stored = await storeTextGeometry(result.render.text, { signal: tracker.abort?.signal });
      } catch (error) {
        if (current())
          renderStore.getState().setEntry(id, {
            status: 'error',
            resolved: entryOf(id)?.resolved ?? null,
            error: {
              backend: 'pango',
              message: `Could not preserve this text appearance: ${String(error)}. The source remains saveable.`,
            },
          });
        return;
      }
      if (!current() || currentFormula(id)?.snapshot?.key !== formula.snapshot?.key) {
        await discardTextGeometry(stored);
        return;
      }
      verifiedArtifacts.add(stored.reference.contentHash);
      if (verifiedArtifacts.size > 500)
        verifiedArtifacts.delete(verifiedArtifacts.values().next().value!);
    }
    const warning = useSyncWarnings.getState().warnings[id];
    if (
      plan.verified &&
      (plan.match?.confidence ?? 1) >= CONFIDENCE_THRESHOLD &&
      warning?.confidence === 0 &&
      droppedTotal(warning) === 0
    ) {
      // A failed bridge preserved the data; once it is available, that temporary uncertainty
      // is gone. Historical warnings about actually dropped references remain until dismissed.
      useSyncWarnings.getState().dismiss(id);
    }
    if (!formula.snapshot) {
      amend((draft) => {
        const target = draft.formulas.find((item) => item.id === id);
        if (target) {
          target.snapshot = toSnapshot(result.render);
          if (target.kind === 'text' && stored) target.geometry = stored.reference;
        }
      });
    } else if (plan.replace && plan.match) {
      rebaseSnapshot(formula, result.render, plan.match, plan.cause, stored?.reference);
    } else if (stored) {
      amend((draft) => {
        const target = draft.formulas.find((item) => item.id === id);
        if (target?.kind === 'text') target.geometry = stored.reference;
      });
    }
    if (stored) {
      try {
        await syncCurrentMediaOwnership();
        await stored.lease.release();
      } catch {
        // Retain the temporary durable owner if handoff failed. Never discard a published ref.
      }
      if (!current()) return;
      // The very geometry the project named, which the store did not hold (a lost one shaped
      // again to the same bytes): the reference is what it was, so nothing of the project says
      // that the document's file may be without it. The document layer is told.
      if (formula.kind === 'text' && formula.geometry?.contentHash === stored.reference.contentHash)
        announceMediaReturned(stored.reference.contentHash);
    }
    const latest = currentFormula(id) ?? formula;
    let resolved = resolveFormula(latest, result.render);
    if (!plan.replace && plan.match) {
      resolved = {
        formula: latest,
        render: result.render,
        canonToRender: plan.match.map,
        confidence: plan.match.confidence,
      };
    }
    if (plan.verified) {
      tracker.edited = false;
      tracker.successful = { request: requestValue, render: result.render, resolved };
      if (latest.snapshot?.key === result.render.key)
        rememberSnapshot(result.render.key, requestValue);
    } else {
      resolved = { ...resolved, confidence: 0 };
      setWarning(id, { ...emptyRemapReport(), cause: plan.cause, confidence: 0 });
    }
    renderStore.getState().setEntry(id, {
      status: 'ok',
      resolved,
      error: null,
    });
  };

  const request = (formula: Formula, project: Project, tracker: Tracker, force: boolean): void => {
    const req = buildRequest(formula, project);
    const key = JSON.stringify([req, formula.kind === 'text' ? formula.geometry : null]);
    const snapshot = formula.snapshot;
    if (
      snapshot &&
      (snapshot.key === renderKey(req, snapshot.backend, BACKEND_VERSIONS[snapshot.backend]) ||
        (req.kind === 'text' && snapshot.key === textBoxesKey(req)))
    ) {
      rememberSnapshot(snapshot.key, req);
    }
    if (!force && key === tracker.requestKey) {
      // Nothing render-relevant changed: only keep `resolved.formula` fresh.
      const entry = entryOf(formula.id);
      if (
        entry?.status === 'ok' &&
        entry.resolved &&
        !formula.snapshot &&
        tracker.successful?.render.key === entry.resolved.render.key &&
        canReuse(tracker.successful, req)
      ) {
        // Deferred so loadProject's lifecycle notification can invalidate the old document's
        // tracker before any cached result amends the new document.
        const generation = ++tracker.generation;
        const render = entry.resolved.render;
        Promise.resolve().then(() =>
          apply(formula.id, tracker, generation, req, { ok: true, render }),
        );
        return;
      }
      if (entry?.resolved && entry.resolved.formula !== formula) {
        const resolved = rebase(entry.resolved, formula);
        if (
          entry.status === 'ok' &&
          tracker.successful?.render.key === resolved.render.key &&
          canReuse(tracker.successful, req)
        ) {
          tracker.successful = { ...tracker.successful, resolved };
        }
        renderStore.getState().setEntry(formula.id, {
          ...entry,
          resolved,
        });
      }
      return;
    }
    tracker.requestKey = key;
    tracker.retryAt = undefined;
    tracker.abort?.abort();
    tracker.abort = new AbortController();
    const generation = ++tracker.generation;
    if (isBlank(formula) && formula.kind !== 'text') {
      renderStore.getState().setEntry(formula.id, { status: 'idle', resolved: null, error: null });
      return;
    }
    const previous = entryOf(formula.id);
    renderStore.getState().setEntry(formula.id, {
      status: 'loading',
      resolved: previous?.resolved ?? null,
      error: null,
    });
    const cached = reusable.get(formula.id);
    reusable.delete(formula.id);
    const renderText = async (): Promise<RenderResult> => {
      if (formula.kind !== 'text' || req.kind !== 'text') return engine.render(req);
      const stillCurrent = () =>
        running && trackers.get(formula.id) === tracker && tracker.generation === generation;
      let artifact: TextGeometryArtifact | null = null;
      /** Why the saved geometry is not at hand, when it is not. */
      let lost: 'missing' | 'corrupt' | null = null;
      if (formula.geometry) {
        const previousFormula = previous?.resolved?.formula;
        try {
          artifact =
            previous?.resolved?.render.text?.key === formula.geometry.key &&
            previousFormula?.kind === 'text' &&
            previousFormula.geometry?.contentHash === formula.geometry.contentHash &&
            verifiedArtifacts.has(formula.geometry.contentHash)
              ? previous.resolved.render.text
              : await loadTextGeometry(formula.geometry, { signal: tracker.abort?.signal });
        } catch (error) {
          if (
            !(error instanceof MediaStorageError) ||
            (error.code !== 'missing' && error.code !== 'corrupt')
          )
            throw error;
          lost = error.code;
        }
        if (!stillCurrent()) throw new DOMException('Superseded text render.', 'AbortError');
      }
      if (artifact && formula.geometry) {
        verifiedArtifacts.add(formula.geometry.contentHash);
        const render = textArtifactRender(artifact);
        const origin = { ...req, ...artifact.basis };
        rememberSnapshot(artifact.key, origin);
        if (textBasisMatches(artifact.basis, req)) return { ok: true, render };
        const resolved = resolveFormula(formula, render);
        if (formula.snapshot?.key === render.key)
          tracker.successful = { request: origin, render, resolved };
        renderStore.getState().setEntry(formula.id, { status: 'loading', resolved, error: null });
      }
      if (lost !== null && formula.snapshot && formula.geometry?.key === formula.snapshot.key) {
        // The references of the project count by the geometry that is not at hand. What a
        // companion shapes now takes the place of a missing one only when it is that very
        // geometry (the same key: the same fonts and versions drew the same outlines), and
        // then nothing changes. Anything else would count other glyphs, and the references
        // would have nothing to follow: the text is drawn as boxes until its file, or "Refresh
        // appearance", brings a geometry on the author's word. A damaged one is not asked
        // for again: the store keeps the bytes it has under that hash, so nothing would be
        // mended. (A text whose snapshot is not that geometry's has nothing counted by it: it
        // goes on as a text never shaped.)
        const note = `${lostTextGeometryNote(lost)} It is drawn as placeholder boxes meanwhile.`;
        if (textShapedFor(formula) !== null) {
          if (lost === 'missing') {
            const again = await engine.render(req, tracker.abort?.signal);
            if (again.ok && again.render.text && again.render.key === formula.snapshot.key) {
              return again;
            }
            // Busy is no answer: asked again in a moment, not settled as boxes.
            if (!again.ok && again.error.retryAfterMs) return again;
          }
          const key = textSavedBoxesKey(req, formula.snapshot.key);
          return { ok: true, render: savedBoxesRender(formula.snapshot, req, key, note) };
        }
        const boxes = producerOf('text').free(req, textBoxesKey(req));
        return boxes.ok ? { ok: true, render: { ...boxes.render, warnings: [note] } } : boxes;
      }
      const result = await engine.render(req, tracker.abort?.signal);
      // Nothing shapes the text now. The shape the other library gave the same source, font and
      // size says more than boxes do: the same glyphs in the same order, another size.
      if (result.ok && !result.render.exact && artifact && sameTextShape(artifact.basis, req)) {
        return { ok: true, render: textArtifactRender(artifact) };
      }
      return result;
    };
    const result =
      cached && canReuse(cached, req) && formula.kind !== 'text'
        ? Promise.resolve<RenderResult>({ ok: true, render: cached.render })
        : formula.kind === 'text'
          ? renderText()
          : engine.render(req);
    result.then(
      (result) => apply(formula.id, tracker, generation, req, result),
      (error: unknown) =>
        apply(formula.id, tracker, generation, req, {
          ok: false,
          error: {
            // What the media store says is already a sentence for the user.
            message: error instanceof MediaStorageError ? error.message : String(error),
            backend: formula.kind === 'text' ? 'pango' : 'mathjax',
          },
        }),
    );
  };

  const process = (project: Project, force = false): void => {
    renderStore.getState().retain(project.formulas.map((f) => f.id));
    const ids = new Set(project.formulas.map((f) => f.id));
    for (const id of trackers.keys())
      if (!ids.has(id)) {
        trackers.get(id)?.abort?.abort();
        trackers.delete(id);
      }
    for (const formula of project.formulas) {
      let tracker = trackers.get(formula.id);
      if (!tracker) {
        tracker = {
          requestKey: null,
          generation: 0,
          content: contentOf(formula),
          edited: false,
          successful: null,
        };
        trackers.set(formula.id, tracker);
      } else {
        const content = contentOf(formula);
        if (content !== tracker.content) {
          tracker.edited = true;
          tracker.content = content;
          useSyncWarnings.getState().dismiss(formula.id);
        }
      }
      request(formula, project, tracker, force);
    }
  };

  /** A new document owns fresh formula trackers and transition history even when IDs match.
   * Only an already successful current render and immutable snapshot-key facts cross that boundary. */
  const resetEdits = (): void => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    const project = useProjectStore.getState().project;
    reusable.clear();
    for (const formula of project.formulas) {
      const previous = trackers.get(formula.id)?.successful;
      if (previous && canReuse(previous, buildRequest(formula, project))) {
        reusable.set(formula.id, previous);
      }
    }
    for (const tracker of trackers.values()) tracker.abort?.abort();
    trackers.clear();
    verifiedArtifacts.clear();
    renderStore.getState().retain([]);
    useSyncWarnings.getState().clear();
    process(project);
  };

  const unsubscribeProject = useProjectStore.subscribe((state, previous) => {
    if (amending || state.project === previous.project) return;
    process(state.project);
  });

  const unsubscribePrefer = renderStore.subscribe((state, previous) => {
    if (state.prefer !== previous.prefer) process(useProjectStore.getState().project);
  });

  const unsubscribeCompanion = engine.onCompanionChange(() => {
    const available = availabilityKey();
    if (available === lastAvailability) return;
    lastAvailability = available;
    process(useProjectStore.getState().project, true);
  });

  const unsubscribeLoad = onProjectLoaded(resetEdits);
  const refresh = (id: FormulaId) => {
    const project = useProjectStore.getState().project;
    const formula = project.formulas.find((item) => item.id === id);
    const tracker = trackers.get(id);
    if (formula && tracker) request(formula, project, tracker, true);
  };
  refreshListeners.add(refresh);

  process(useProjectStore.getState().project);

  return () => {
    running = false;
    clearTimeout(retryTimer);
    unsubscribeProject();
    unsubscribePrefer();
    unsubscribeCompanion();
    unsubscribeLoad();
    refreshListeners.delete(refresh);
    for (const tracker of trackers.values()) tracker.abort?.abort();
    trackers.clear();
    reusable.clear();
    snapshots.clear();
  };
}
