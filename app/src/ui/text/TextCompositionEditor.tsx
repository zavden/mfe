/* The composition workspace: the editor of a text object, with its source beside a stage where it
 * is placed in the frame. A font text is edited here (its typography, its saved appearance); a
 * LaTeX text has its own form (`LatexTextComposition.tsx`); what both share is in
 * `CompositionParts.tsx`. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  companionCommand,
  getEngine,
  renderRequestFor,
  textDrawing,
  type CompanionFontCatalog,
  type RenderRequest,
} from '../../engine';
import {
  canRenderPango,
  isTextBoxes,
  isVerifiedText,
  pangoState,
  sameTextShape,
  textBasisMatches,
} from '../../engine/pango';
import { matchTextLayouts, textLayoutOf } from '../../engine/textMatch';
import type { TextFormula } from '../../model';
import { useRenderStore } from '../../store';
import { companionTextNote, NEEDS_COMPANION, needsCompanionTitle } from '../creator/formulaStatus';
import { HexColorField } from '../project/HexColorField';
import { useCompanionState } from '../useCompanion';
import {
  CompositionFrame,
  RenderStatus,
  SessionActions,
  SessionConflict,
  SessionMessages,
  SessionStage,
  type RenderState,
} from './CompositionParts';
import { useSessionFacts } from './useSessionFacts';
import { LatexTextComposition } from './LatexTextComposition';
import {
  isSessionOf,
  useTextComposition,
  type TextCompositionSession,
} from './textCompositionStore';
import {
  sameTextDraft,
  textDraftOf,
  textSourceLock,
  validateTextDraft,
} from './textCompositionModel';
import { createTextPreview, type TextPreviewState } from './textPreview';
import './textComposition.css';
import { keysText } from '../platform';

export function TextCompositionEditorHost() {
  const session = useTextComposition((state) => state.session);
  if (!session) return null;
  if (isSessionOf(session, 'tex'))
    return <LatexTextComposition key={session.token} session={session} />;
  return isSessionOf(session, 'text') ? (
    <FontTextComposition key={session.token} session={session} />
  ) : null;
}

function FontTextComposition({ session }: { session: TextCompositionSession<TextFormula> }) {
  const { project, uses, selectedLocked, placementEnabled, conflict } = useSessionFacts(session);
  const resolved = useRenderStore((state) => state.resolved.get(session.original.id));
  const companion = useCompanionState();
  const engine = getEngine();
  const { patch, setComposing, apply } = useTextComposition.getState();
  const formula = useMemo(
    () => ({ ...session.original, ...session.draft }),
    [session.original, session.draft],
  );
  const request = useMemo(
    () => renderRequestFor(formula, project.meta, 'auto'),
    [formula, project.meta],
  );
  const key = JSON.stringify(request);
  const [seed, setSeed] = useState(() => resolved);
  // Portable geometry can finish loading after the editor opens, even while the companion
  // is absent. Adopt only the original source's resolved appearance, never an external edit.
  if (
    !seed &&
    resolved?.formula.kind === 'text' &&
    sameTextDraft(textDraftOf(resolved.formula), textDraftOf(session.original))
  ) {
    setSeed(resolved);
  }
  const [preview, setPreview] = useState<TextPreviewState>({
    key: null,
    render: seed?.render ?? null,
    pending: false,
    error: null,
    failure: null,
  });
  const worker = useRef<ReturnType<typeof createTextPreview> | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [catalog, setCatalog] = useState<CompanionFontCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const source = useRef<HTMLTextAreaElement>(null);
  const invalid = validateTextDraft(session.draft);
  const sourceLock =
    !session.isNew && !session.independent ? textSourceLock(project, session.original.id) : null;

  useEffect(() => {
    const queue = createTextPreview(
      (req, signal) => engine.render(req, signal),
      setPreview,
      seed?.render ?? null,
    );
    worker.current = queue;
    return () => {
      queue.dispose();
      worker.current = null;
    };
  }, [engine, seed]);

  useEffect(() => {
    const queue = worker.current;
    if (!queue) return;
    if (session.composing || invalid) {
      queue.suspend();
      return;
    }
    const nextRequest = JSON.parse(key) as RenderRequest;
    const retained = seed?.render;
    // The saved shape of the text as it stands is its appearance: the project's library's own,
    // or, where nothing shapes text for that library now, the one the other library gave it
    // (what the preview shows, `store/renderSync.ts`).
    if (
      !session.refresh &&
      retained?.text &&
      nextRequest.kind === 'text' &&
      (textBasisMatches(retained.text.basis, nextRequest) ||
        (sameTextShape(retained.text.basis, nextRequest) &&
          !canRenderPango(companion, nextRequest.target)))
    )
      queue.retain(retained, key);
    else queue.request(nextRequest, key);
    // A request identity contains source/font/size/target only; placement never shapes again.
  }, [key, companion, session.composing, session.refresh, refresh, invalid, seed]);

  // The font list is also what starts the companion's text worker for the project's library:
  // asked when nothing has started it and when it is ready. While it starts, the request already
  // made is the one that waits. A worker that failed to start is tried again only on the
  // author's word ("Try again", "Refresh appearance"): asking by itself would start it over and
  // over.
  const textWorker = pangoState(companion, project.meta.target);
  const [retry, setRetry] = useState(0);
  const word = refresh + retry;
  const askedWord = useRef(word);
  useEffect(() => {
    const abort = new AbortController();
    let stale = false;
    const fonts = engine.client.fonts;
    const again = askedWord.current !== word;
    askedWord.current = word;
    if (!fonts || textWorker === 'none' || textWorker === 'preparing') return;
    if (textWorker === 'failed' && !again) return;
    fonts(project.meta.target, abort.signal)
      .then((value) => {
        if (!stale) {
          setCatalog(value);
          setCatalogError(null);
          void engine.client.check();
        }
      })
      .catch((error: unknown) => {
        if (!stale) setCatalogError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      stale = true;
      abort.abort();
    };
  }, [engine, textWorker, project.meta.target, word]);

  useEffect(() => {
    const timer = setTimeout(() => source.current?.focus(), 0);
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', preventLoss);
    };
  }, []);

  const current = preview.key === key && !preview.pending && !preview.error;
  const refreshReady =
    current && !!preview.render && isVerifiedText(preview.render, companion, project.meta.target);
  const family =
    catalog?.target === project.meta.target
      ? catalog.fonts.find(
          (item) =>
            item.family.toLocaleLowerCase() === session.draft.font.family.toLocaleLowerCase(),
        )
      : null;
  const availableStyles = family
    ? [
        ...new Set(
          family.faces.map((face) => `${face.name}${face.synthetic ? ' (synthetic)' : ''}`),
        ),
      ]
    : [];
  const styleExists = family?.faces.some((face) => {
    const bold =
      /bold|heavy|black/i.test(`${face.name} ${face.weight}`) || Number(face.weight) >= 600;
    const italic = /italic|oblique/i.test(`${face.name} ${face.slant}`) || Number(face.slant) > 0;
    return (
      bold === (session.draft.font.weight === 'bold') &&
      italic === (session.draft.font.slant === 'italic') &&
      !face.synthetic
    );
  });
  const fallbacks = [
    ...new Set(preview.render?.text?.provenance.resolvedFonts.map((font) => font.family) ?? []),
  ].filter((name) => name.toLocaleLowerCase() !== session.draft.font.family.toLocaleLowerCase());
  const paint = useMemo(() => {
    const colors: Record<string, string> = {};
    const original = seed;
    if (!preview.render || !original) return colors;
    const from = textLayoutOf(original.render);
    const to = textLayoutOf(preview.render);
    const map =
      preview.render.key === original.render.key
        ? original.canonToRender
        : from && to && session.original.snapshot?.key === original.render.key
          ? matchTextLayouts(from, to).map
          : [];
    map.forEach((index, canonical) => {
      const color = session.original.glyphColors[String(canonical)];
      if (index !== null && color) colors[String(index)] = color;
    });
    return colors;
  }, [preview.render, session.original, seed]);
  // How the draft is drawn, once its render is the current one: with its real glyphs, or
  // without them (placeholder boxes, or the shape the other library gave it). While the next
  // render is on its way the words keep describing the one on the stage: only the dot of the
  // status line tells, so nothing comes and goes with every key.
  const shown = current || preview.pending ? preview.render : null;
  const drawing = !shown
    ? null
    : isTextBoxes(shown)
      ? shown.boxes
        ? ('boxes' as const)
        : ('saved-boxes' as const)
      : shown.text && textDrawing(formula, shown, project.meta) === 'borrowed'
        ? ('borrowed' as const)
        : ('exact' as const);
  const unshaped = drawing !== null && drawing !== 'exact';
  const companionNote = companionTextNote(companion, project.meta.target);
  const status = session.applying
    ? 'Preparing appearance…'
    : session.composing
      ? 'Composing text…'
      : preview.error
        ? preview.error
        : drawing === 'exact'
          ? 'Current Pango geometry'
          : drawing === 'borrowed'
            ? 'Shape from the other library'
            : unshaped
              ? 'Placeholder boxes'
              : preview.pending
                ? 'Rendering Pango…'
                : 'Waiting for Pango geometry';
  const renderState: RenderState = session.composing
    ? 'idle'
    : session.applying || preview.pending
      ? 'busy'
      : preview.error
        ? 'error'
        : current && drawing === 'exact'
          ? 'ok'
          : 'idle';

  return (
    <CompositionFrame
      session={session}
      title={`Text composition · ${session.original.name}`}
      uses={uses}
      applyDisabled={
        session.composing || session.applying || !!conflict || (session.refresh && !refreshReady)
      }
      onApply={() => {
        void apply(current ? (preview.render ?? undefined) : undefined);
      }}
    >
      <>
        <section className="text-composition-source" aria-label="Text source and typography">
          <label htmlFor="composition-source">Text</label>
          <textarea
            id="composition-source"
            ref={source}
            data-testid="text-source"
            wrap="off"
            spellCheck={false}
            aria-label="Text source"
            value={session.draft.source}
            readOnly={!!sourceLock}
            onChange={(event) => patch({ source: event.target.value.replace(/\r\n?/g, '\n') })}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(event) => {
              patch({ source: event.currentTarget.value });
              setComposing(false);
            }}
          />
          <p className="field-hint">
            {keysText('Plain text · Enter adds a line · Ctrl/⌘+Enter applies')}
          </p>
          <fieldset disabled={!!sourceLock} className="text-typography">
            <legend>Typography</legend>
            <label>
              Font family
              <input
                type="text"
                data-testid="text-font-family"
                aria-label="Font family"
                list="composition-fonts"
                maxLength={256}
                value={session.draft.font.family}
                onChange={(e) => patch({ font: { ...session.draft.font, family: e.target.value } })}
              />
            </label>
            <datalist id="composition-fonts">
              {catalog?.fonts.map((font) => (
                <option key={font.family} value={font.family} />
              ))}
            </datalist>
            {family && (
              <p className="field-hint" data-testid="text-font-styles">
                Available styles: {availableStyles.slice(0, 4).join(', ')}
                {availableStyles.length > 4 ? `, +${availableStyles.length - 4} more` : ''}.
                {!styleExists && ' Requested style may be synthesized.'}
              </p>
            )}
            <label>
              Size
              <input
                type="number"
                aria-label="Font size"
                data-testid="text-font-size"
                min={4}
                max={512}
                step={1}
                value={session.draft.fontSize}
                onChange={(e) => {
                  if (Number.isFinite(e.target.valueAsNumber))
                    patch({ fontSize: e.target.valueAsNumber });
                }}
              />
            </label>
            <div className="text-font-style">
              <label>
                <input
                  type="checkbox"
                  data-testid="text-bold"
                  checked={session.draft.font.weight === 'bold'}
                  onChange={(e) =>
                    patch({
                      font: { ...session.draft.font, weight: e.target.checked ? 'bold' : 'normal' },
                    })
                  }
                />{' '}
                Bold
              </label>
              <label>
                <input
                  type="checkbox"
                  data-testid="text-italic"
                  checked={session.draft.font.slant === 'italic'}
                  onChange={(e) =>
                    patch({
                      font: {
                        ...session.draft.font,
                        slant: e.target.checked ? 'italic' : 'normal',
                      },
                    })
                  }
                />{' '}
                Italic
              </label>
            </div>
            <label>Colour</label>
            <HexColorField
              label="Text colour"
              testId="text-color"
              value={session.draft.color}
              disabled={!!sourceLock}
              onCommit={(color) => patch({ color })}
            />
          </fieldset>
          {catalogError && <p className="field-hint">Font catalog unavailable: {catalogError}</p>}
          {!catalog && (
            <p className="field-hint">
              Enter the requested font family. The companion verifies availability.
            </p>
          )}
          <button
            type="button"
            className="btn"
            data-testid="text-refresh"
            disabled={!!sourceLock || session.composing}
            onClick={() => {
              if (request.kind === 'text') engine.invalidateText(request);
              useTextComposition.getState().refresh();
              setRefresh((n) => n + 1);
            }}
          >
            Refresh appearance
          </button>
          {session.refresh && (
            <>
              {!refreshReady && (
                <p className="field-hint" data-testid="text-refresh-pending">
                  The saved appearance is retained until a refreshed result is ready. Cancel
                  appearance refresh to apply source changes without it.
                </p>
              )}
              <button
                type="button"
                className="btn"
                data-testid="text-refresh-cancel"
                disabled={session.applying}
                onClick={() => useTextComposition.getState().cancelRefresh()}
              >
                Cancel appearance refresh
              </button>
            </>
          )}
          {sourceLock && (
            <p role="status" data-testid="text-source-lock">
              {sourceLock}
            </p>
          )}
          <SessionActions session={session} uses={uses} selectedLocked={selectedLocked} />
        </section>
        <div className="text-composition-preview">
          <RenderStatus state={renderState}>
            {status}
            {unshaped && (
              <span className="badge badge-approx" data-testid="text-needs-companion">
                {NEEDS_COMPANION}
              </span>
            )}
          </RenderStatus>
          <SessionStage
            session={session}
            render={preview.render}
            color={session.draft.color}
            glyphColors={paint}
            current={current}
            movable={placementEnabled}
          />
          <SessionMessages>
            <SessionConflict session={session} conflict={conflict} />
            {unshaped && (
              <p className="field-hint" data-testid="text-needs-companion-hint">
                {needsCompanionTitle(drawing, project.meta.target, shown?.warnings[0])}
                {companionNote && <> {companionNote}</>}
                {textWorker === 'failed' && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="btn btn-small text-worker-retry"
                      data-testid="text-worker-retry"
                      onClick={() => setRetry((count) => count + 1)}
                    >
                      Try again
                    </button>
                  </>
                )}
                {companion.status !== 'online' && (
                  <>
                    {' '}
                    Start it: <code>{companionCommand()}</code>
                  </>
                )}
              </p>
            )}
            {fallbacks.length > 0 && (
              <p className="field-hint" data-testid="text-fallback-fonts">
                Fallback fonts: {fallbacks.slice(0, 4).join(', ')}
                {fallbacks.length > 4 ? `, +${fallbacks.length - 4} more` : ''}.
              </p>
            )}
            {preview.error && preview.render && (
              <p className="field-hint" data-testid="text-stale">
                Showing the last valid appearance. Position guides need current geometry.
              </p>
            )}
            {Object.keys(session.original.glyphColors).length > 0 &&
              preview.render?.key !== seed?.render.key && (
                <p className="field-hint">
                  Glyph colours are retained and remapped when you apply the text.
                </p>
              )}
            {!unshaped &&
              preview.render?.warnings.map((warning) => (
                <p key={warning} className="field-hint">
                  {warning}
                </p>
              ))}
          </SessionMessages>
        </div>
      </>
    </CompositionFrame>
  );
}
