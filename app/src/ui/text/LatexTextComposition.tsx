/* The composition workspace of a LaTeX text (`tex`): its source as the user writes it — text
 * mode, `$…$` for maths, `\\` for a line break, a blank line for a paragraph —, its size and
 * colour and its layout (the width in scene units, the alignment of the lines inside it, the line
 * spacing), beside the stage where it is placed in the frame. The draft is rendered as it is
 * typed, by LaTeX in the companion or by MathJax without it, the way the render sync renders the
 * applied object (the same request, so the same render). */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canRenderLatex,
  getEngine,
  renderRequestFor,
  toSnapshot,
  type RenderRequest,
  type ResolvedFormula,
} from '../../engine';
import {
  defaultIntro,
  frameWidth,
  isBlank,
  KINDS,
  type IntroKind,
  type TexFormula,
  type TextLayout,
} from '../../model';
import { useRenderStore } from '../../store';
import { CommitInput } from '../creator/CommitInput';
import { GlyphColors, type GlyphEdits } from '../creator/GlyphColors';
import { GlyphListToggle } from '../creator/GlyphListToggle';
import { hasGlyphs } from '../creator/glyphsUnavailable';
import { validateFormulaName } from '../creator/formulaActions';
import { IntroField, TagField } from '../creator/ObjectFields';
import { describeRenderError } from '../creator/renderErrors';
import {
  fontSizeOfScale,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  parseStandardScale,
  scaleOfFontSize,
  STANDARD_SCALE_RANGE,
} from '../creator/standardScale';
import { HexColorField } from '../project/HexColorField';
import { SegmentedControl } from '../SegmentedControl';
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
import { colorGlyphs, hideGlyphs } from './glyphPaint';
import { MAX_LINE_SPACING, MIN_LINE_SPACING, validateTextDraft } from './textCompositionModel';
import {
  paintIsBehind,
  useTextComposition,
  type TextCompositionSession,
} from './textCompositionStore';
import { useDraftPaint } from './useDraftPaint';
import { createTextPreview, type TextPreviewState } from './textPreview';
import './textComposition.css';
import { keysText } from '../platform';

/** How long the source rests before LaTeX is asked for it: a compilation is not a keystroke. */
const RENDER_DELAY_MS = 200;

/** What the right side of the workspace shows: the stage, or the glyphs to colour and hide. */
const VIEW_OPTIONS = [
  { value: 'placement', label: 'Placement' },
  { value: 'glyphs', label: 'Glyphs' },
] as const;
type View = (typeof VIEW_OPTIONS)[number]['value'];

const NO_COLORS: Record<string, string> = {};

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
] as const;

export function LatexTextComposition({ session }: { session: TextCompositionSession<TexFormula> }) {
  const { project, uses, selectedLocked, placementEnabled, conflict } = useSessionFacts(session);
  const applied = useRenderStore((state) => state.resolved.get(session.original.id));
  const prefer = useRenderStore((state) => state.prefer);
  // Render again when the companion comes or goes: its LaTeX replaces MathJax, or the other way.
  const latexReady = canRenderLatex(useCompanionState());
  const engine = getEngine();
  const { patch, setComposing, apply, editPaint } = useTextComposition.getState();
  const { draft } = session;
  const formula = useMemo(() => ({ ...session.original, ...draft }), [session.original, draft]);
  const blank = isBlank(formula);
  const invalid = validateTextDraft(draft);
  const key = JSON.stringify(renderRequestFor(formula, project.meta, prefer));
  // What the width of the text is read against: the frame of this project, to a tenth of a unit
  // (14.2 at 16:9, 8 for a square, 4.5 at 9:16).
  const frameUnits = String(Number(frameWidth(project.meta).toFixed(1)));
  const request = useMemo(() => JSON.parse(key) as RenderRequest, [key]);
  const [view, setView] = useState<View>('placement');
  // The applied object's render is on the stage from the first frame; the draft's replaces it.
  const [seed] = useState(() => applied?.render ?? null);
  const [preview, setPreview] = useState<TextPreviewState>({
    key: null,
    render: seed,
    pending: false,
    error: null,
    failure: null,
  });
  const worker = useRef<ReturnType<typeof createTextPreview> | null>(null);
  const source = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const queue = createTextPreview(
      (request, signal) => engine.render(request, signal),
      setPreview,
      seed,
      RENDER_DELAY_MS,
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
    if (session.composing || invalid || blank) queue.suspend();
    else queue.request(request, key);
  }, [key, request, latexReady, session.composing, invalid, blank]);

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

  const current = !blank && preview.key === key && !preview.pending && !preview.error;
  const shown = blank ? null : preview.render;
  useDraftPaint(session, request, current ? preview.render : null);
  const { paint, paintLost } = session;
  // The paint is on the stage once it has followed the glyphs to the render shown there.
  const painted = paint !== null && shown?.key === paint.basis.render.key;
  // The glyphs of the draft as the glyph view takes an object's: a formula whose snapshot is
  // the render the paint counts by, coloured and hidden as the paint says.
  const glyphs = useMemo((): ResolvedFormula | null => {
    if (!paint || blank) return null;
    const { render } = paint.basis;
    return {
      formula: {
        ...formula,
        glyphColors: paint.paint.colors,
        hiddenGlyphs: paint.paint.hidden,
        snapshot: toSnapshot(render),
      },
      render,
      canonToRender: render.glyphs.map((glyph) => glyph.index),
      confidence: 1,
    };
  }, [paint, blank, formula]);
  const glyphEdits = useMemo(
    (): GlyphEdits => ({
      color: (indices, color) => editPaint((now) => colorGlyphs(now, indices, color)),
      hidden: (indices, hidden) => editPaint((now) => hideGlyphs(now, indices, hidden)),
      clearColors: () => editPaint((now) => ({ ...now, colors: {} })),
    }),
    [editPaint],
  );
  // Colours the author set wait for the render they count by: Apply has nothing to write them
  // on while the text is being rendered, or does not render.
  const behind = paintIsBehind(session);

  /** Why a name cannot be this text's (a copy made on Apply may keep its original's). */
  const nameError = (name: string) =>
    session.independent && name === session.original.name
      ? null
      : validateFormulaName(
          name,
          project.formulas,
          session.isNew || session.independent ? null : session.original.id,
        );
  const setLayout = (change: Partial<TextLayout>) =>
    patch({ layout: { ...draft.layout, ...change } });
  // What the line over the stage says is what the stage shows: while the draft is rendered again
  // (and while its colours follow), the words stay and only the dot tells.
  const drawn = shown
    ? `${shown.glyphs.length} glyphs · ${shown.exact ? 'exact (LaTeX)' : 'MathJax'}`
    : null;
  const busy = !blank && (preview.pending || (current && paint !== null && !painted));
  const renderState: RenderState =
    blank || session.composing
      ? 'idle'
      : preview.error
        ? 'error'
        : busy
          ? 'busy'
          : current
            ? 'ok'
            : 'idle';
  const status = session.composing
    ? 'Composing text…'
    : blank
      ? 'Empty: nothing is drawn.'
      : preview.error
        ? 'Cannot render'
        : (drawn ?? (preview.pending ? 'Rendering…' : 'Waiting for the render'));
  const applyNow = () => {
    // A field being typed in (the width, the size) commits as it loses the focus.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    void apply();
  };

  return (
    <CompositionFrame
      session={session}
      title={`LaTeX text composition · ${session.original.name}`}
      uses={uses}
      applyDisabled={session.composing || session.applying || !!conflict || behind}
      onApply={applyNow}
    >
      <>
        <section className="text-composition-source" aria-label="LaTeX text source and layout">
          <label htmlFor="composition-source">Text</label>
          <textarea
            id="composition-source"
            ref={source}
            data-testid="tex-source"
            spellCheck={false}
            aria-label="LaTeX text"
            value={draft.source}
            onChange={(event) => patch({ source: event.target.value.replace(/\r\n?/g, '\n') })}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(event) => {
              patch({ source: event.currentTarget.value });
              setComposing(false);
            }}
          />
          <p className="field-hint">
            LaTeX in text mode: <code>$x^2$</code> for maths, <code>\\</code> for a line break, a
            blank line for a paragraph · {keysText('Ctrl/⌘+Enter applies')}
          </p>
          <fieldset className="text-typography">
            <legend>Size and colour</legend>
            <div className="text-field-row">
              <span>Size</span>
              <span className="inline-fields">
                {/* The scale and the font size are one value (R4): 48 × scale = font_size. */}
                <CommitInput
                  value={String(scaleOfFontSize(draft.fontSize))}
                  label="Scale"
                  testId="text-scale"
                  width="52px"
                  validate={(text) =>
                    parseStandardScale(text) === null
                      ? `A number or a fraction from ${STANDARD_SCALE_RANGE.min} to ${STANDARD_SCALE_RANGE.max}.`
                      : null
                  }
                  onCommit={(text) =>
                    patch({ fontSize: fontSizeOfScale(parseStandardScale(text) ?? 1) })
                  }
                />
                <span className="field-hint">× 48 =</span>
                <CommitInput
                  value={String(draft.fontSize)}
                  label="Font size"
                  testId="text-font-size"
                  width="52px"
                  validate={(text) => {
                    const n = Number(text);
                    return Number.isFinite(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE
                      ? null
                      : `A number from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}.`;
                  }}
                  onCommit={(text) => patch({ fontSize: Number(text) })}
                />
              </span>
            </div>
            <div className="text-field-row">
              <span>Colour</span>
              <HexColorField
                label="Text colour"
                testId="text-color"
                value={draft.color}
                onCommit={(color) => patch({ color })}
              />
            </div>
          </fieldset>
          <fieldset className="text-typography">
            <legend>Layout</legend>
            <div className="text-field-row">
              <span>Width</span>
              <span className="inline-fields">
                <CommitInput
                  value={draft.layout.width === null ? '' : String(draft.layout.width)}
                  label="Text width"
                  testId="tex-width"
                  width="64px"
                  placeholder="auto"
                  validate={(text) =>
                    text.trim() === '' || (Number.isFinite(Number(text)) && Number(text) > 0)
                      ? null
                      : 'A positive number of scene units, or empty.'
                  }
                  onCommit={(text) =>
                    setLayout({ width: text.trim() === '' ? null : Number(text) })
                  }
                />
                <span
                  className="field-hint"
                  data-testid="tex-width-hint"
                  title={`The frame is ${frameUnits} units wide. Empty: as wide as the text comes.`}
                >
                  units (frame: {frameUnits})
                </span>
              </span>
            </div>
            <div className="text-field-row">
              <SegmentedControl
                label="Align"
                testId="tex-align"
                value={draft.layout.align}
                options={ALIGN_OPTIONS}
                onChange={(align) => setLayout({ align })}
              />
            </div>
            <div className="text-field-row">
              <span>Line spacing</span>
              <span className="inline-fields">
                <CommitInput
                  value={String(draft.layout.lineSpacing)}
                  label="Line spacing"
                  testId="tex-line-spacing"
                  width="52px"
                  validate={(text) => {
                    const n = Number(text);
                    return Number.isFinite(n) && n >= MIN_LINE_SPACING && n <= MAX_LINE_SPACING
                      ? null
                      : `A factor from ${MIN_LINE_SPACING} to ${MAX_LINE_SPACING}.`;
                  }}
                  onCommit={(text) => setLayout({ lineSpacing: Number(text) })}
                />
                <span className="field-hint">× the normal distance</span>
              </span>
            </div>
          </fieldset>
          <fieldset className="text-typography">
            <legend>Object</legend>
            <div className="text-field-row">
              <span>Name</span>
              <CommitInput
                value={draft.name}
                label="Text name"
                testId="text-name"
                width="150px"
                normalize={(text) => text.trim()}
                validate={nameError}
                onCommit={(name) => patch({ name })}
              />
            </div>
            <div className="text-field-row">
              <span>Tag</span>
              <TagField
                tag={draft.tag}
                onChange={(tag) => patch({ tag })}
                colorTestId="text-tag-color"
                iconTestId="text-tag-icon"
              />
            </div>
            <div className="text-field-row">
              <label htmlFor="composition-intro">Appears with</label>
              <span className="inline-fields">
                <IntroField
                  id="composition-intro"
                  intro={draft.intro}
                  kinds={KINDS.tex.intros}
                  onKind={(kind) =>
                    patch({ intro: kind === '' ? null : defaultIntro(kind as IntroKind) })
                  }
                  onDuration={(duration) =>
                    draft.intro && patch({ intro: { ...draft.intro, duration } })
                  }
                  selectTestId="text-intro"
                  durationTestId="text-intro-duration"
                />
              </span>
            </div>
            <p className="field-hint">
              New clips start with it; clips still at the previous intro follow.
            </p>
          </fieldset>
          <SessionActions session={session} uses={uses} selectedLocked={selectedLocked} />
        </section>
        <div className="text-composition-preview">
          {/* One row: which side of the workspace shows, then what is drawn there. The switch
              comes first: the words beside it change length, and it must not move with them. */}
          <div className="text-preview-head">
            <div className="text-view-switch">
              <SegmentedControl<View>
                label="Show"
                testId="text-view"
                value={view}
                options={VIEW_OPTIONS}
                onChange={setView}
              />
            </div>
            {view === 'glyphs' && (
              <GlyphListToggle disabled={!hasGlyphs(glyphs?.formula ?? formula, glyphs)} />
            )}
            <RenderStatus state={renderState}>{status}</RenderStatus>
          </div>
          {/* Hidden, not unmounted: the stage keeps its zoom, its grid and its guides. */}
          <div className="text-stage-slot" hidden={view !== 'placement'}>
            <SessionStage
              session={session}
              render={shown}
              color={draft.color}
              glyphColors={painted ? paint.paint.colors : NO_COLORS}
              current={current}
              movable={placementEnabled}
            />
          </div>
          {view === 'glyphs' && (
            <section className="text-glyphs" aria-label="Glyph colours" data-testid="text-glyphs">
              {/* A selection counts by the glyphs of one render: it is let go with it. */}
              <GlyphColors
                key={glyphs?.render.key ?? 'none'}
                formula={glyphs?.formula ?? formula}
                resolved={glyphs}
                background={project.meta.background}
                stale={false}
                edits={glyphEdits}
                emptyHint={
                  blank
                    ? 'Type some text to see its glyphs and colour them.'
                    : paintLost
                      ? 'The glyph colours could not follow the last change of the text: it keeps the ones it had. Apply the text, then open it again to colour its glyphs.'
                      : 'The glyphs of this text are not ready yet.'
                }
              />
            </section>
          )}
          <SessionMessages>
            <SessionConflict session={session} conflict={conflict} />
            {!blank && preview.error && (
              <div className="render-error" role="alert" data-testid="text-render-error">
                <strong>
                  {preview.failure ? describeRenderError(preview.failure, formula) : preview.error}
                </strong>
                {shown && <span> The stage keeps the last appearance that rendered.</span>}
                {preview.failure?.log && <pre>{preview.failure.log}</pre>}
              </div>
            )}
            {behind && preview.error && (
              <p className="field-hint" data-testid="text-paint-waits">
                This text does not render as it is written: fix it to apply the glyph colours you
                set, or cancel.
              </p>
            )}
            {/* The warnings of what is on the stage: they stay while the next render is on its way. */}
            {shown && !preview.error && shown.warnings.length > 0 && (
              <ul className="render-warnings" data-testid="text-render-warnings">
                {shown.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </SessionMessages>
        </div>
      </>
    </CompositionFrame>
  );
}
