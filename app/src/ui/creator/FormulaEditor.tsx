/* Formula editor (modal): a header every kind of object shares — name, tag, size, colour, Appears
 * with, acting on the object immediately — then the source panel of its kind (`sources/`), whose
 * draft is applied with one button (one undo step), and the glyph column, which colours and hides
 * the glyphs of the applied object (kinds without glyph colours have no column). Ctrl/⌘+Z and
 * redo undo those project edits while it is open (a text field keeps its own undo). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { canRenderLatex, getEngine, renderRequestFor, type RenderResult } from '../../engine';
import { introsOf, isBlank, kindOf, takesIntro, TARGET_NAMES, type Formula } from '../../model';
import { useProjectStore, useRenderStore, useSyncWarnings, describeWarning } from '../../store';
import { HexColorField } from '../project/HexColorField';
import { confirmDialog } from '../project/dialogStore';
import { Modal } from '../project/Modal';
import {
  applyFormulaSource,
  patchFormula,
  setFormulaIntro,
  setFormulaIntroDuration,
  renameFormula,
  validateFormulaName,
} from './formulaActions';
import { ColumnSplitter } from './ColumnSplitter';
import { CommitInput } from './CommitInput';
import { GlyphColors } from './GlyphColors';
import { GlyphListToggle } from './GlyphListToggle';
import { hasGlyphs } from './glyphsUnavailable';
import { IntroField, TagField } from './ObjectFields';
import { describeRenderError } from './renderErrors';
import {
  fontSizeOfScale,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  parseStandardScale,
  scaleFieldError,
  scaleOfFontSize,
} from './standardScale';
import { sameDraft, sourcePanelOf, withDraft, type SourceDraft } from './sources';
import { keyHint } from '../platform';
import { useCompanionState } from '../useCompanion';

const PREVIEW_DEBOUNCE_MS = 200;
/** The source column's share of the editor width by default; the bar between the columns
 * changes it (kept for the session), never below these widths. */
const DEFAULT_SPLIT = 1.15 / 2.15;
const MIN_SOURCE_WIDTH = 470; // the tag row still fits on one line
const MIN_GLYPHS_WIDTH = 320;
/** Width of the grid column the bar sits in (the gap between the columns). */
const SPLITTER_WIDTH = 20;
let rememberedSplit = DEFAULT_SPLIT;

interface FormulaEditorProps {
  formulaId: string;
  onClose: () => void;
  /** The formula was just created: focus the source field. */
  isNew?: boolean;
}

export function FormulaEditor({ formulaId, onClose, isNew }: FormulaEditorProps) {
  const formula = useProjectStore((state) =>
    state.project.formulas.find((f) => f.id === formulaId),
  );
  // Close when the formula disappears (undo of its creation, deletion).
  useEffect(() => {
    if (!formula) onClose();
  }, [formula, onClose]);
  if (!formula) return null;
  return <EditorBody formula={formula} onClose={onClose} isNew={isNew} />;
}

function EditorBody({
  formula,
  onClose,
  isNew,
}: {
  formula: Formula;
  onClose: () => void;
  isNew?: boolean;
}) {
  const formulaId = formula.id;
  const kind = kindOf(formula);
  const source = sourcePanelOf(formula);
  const formulas = useProjectStore((state) => state.project.formulas);
  const meta = useProjectStore((state) => state.project.meta);
  const entry = useRenderStore((state) => state.entries[formulaId]);
  const prefer = useRenderStore((state) => state.prefer);
  const warning = useSyncWarnings((state) => state.warnings[formulaId]);

  const [draft, setDraft] = useState<SourceDraft>(() => source.draftOf(formula));
  // The formula changed under the editor (undo, redo): follow it unless the draft has edits.
  const [seen, setSeen] = useState(() => source.draftOf(formula));
  const current = source.draftOf(formula);
  if (!sameDraft(current, seen)) {
    const clean = sameDraft(draft, seen);
    setSeen(current);
    if (clean) setDraft(current);
  }
  const patchDraft = (patch: Partial<SourceDraft>) =>
    setDraft((previous) => ({ ...previous, ...patch }));

  const dirty = !sameDraft(draft, current);

  // Render the draft (debounced) to report errors and warnings before it is applied.
  const [preview, setPreview] = useState<{ source: string; result: RenderResult | null } | null>(
    null,
  );
  const { preamble, target } = meta;
  // Render again when the companion comes or goes: its LaTeX replaces MathJax, or the other way.
  const latexReady = canRenderLatex(useCompanionState());
  useEffect(() => {
    if (isBlank({ kind: formula.kind, source: draft.source })) return;
    let stale = false;
    const timer = setTimeout(() => {
      getEngine()
        .render(renderRequestFor(withDraft(formula, draft), { preamble, target }, prefer))
        .catch((error: unknown): RenderResult => ({
          ok: false,
          error: {
            message: `This formula could not be rendered (internal error: ${
              error instanceof Error ? error.message : String(error)
            }).`,
            backend: 'mathjax',
          },
        }))
        .then((result) => {
          if (!stale) setPreview({ source: draft.source, result });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [formula, draft, preamble, target, prefer, latexReady]);

  const blank = isBlank({ kind: formula.kind, source: draft.source });
  const previewResult = !blank && preview?.source === draft.source ? preview.result : null;

  const apply = () => {
    if (!dirty) return;
    applyFormulaSource(formulaId, draft);
  };
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  const requestClose = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Discard the unapplied changes?',
        message: 'The source was edited but not applied.',
        confirmLabel: 'Discard changes',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const [split, setSplitState] = useState(rememberedSplit);
  const setSplit = (value: number) => {
    rememberedSplit = value;
    setSplitState(value);
  };

  const nameError = (name: string) => validateFormulaName(name, formulas, formulaId);
  const resolved = entry?.resolved ?? null;

  const shownWarnings = useMemo(() => {
    if (previewResult?.ok) return previewResult.render.warnings;
    return [];
  }, [previewResult]);

  const SourcePanel = source.Panel;

  return (
    <Modal
      title={`${kind.label} · ${formula.name}`}
      onClose={() => void requestClose()}
      testId="formula-editor"
      width="1040px"
      resizable
      // Its edits (colours, hidden glyphs, name, tag, size, Apply) are undo steps of the project.
      allowHistory
      // Nothing to lose without an unapplied draft: a press outside closes, after the field being
      // typed in (name, tag icon, size, hex colour) commits on blur as it would anywhere else.
      closeOnBackdrop={!dirty}
      onBackdrop={() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        onClose();
      }}
      footer={
        <>
          {dirty && <span className="field-hint footer-hint">Unapplied changes</span>}
          <button
            type="button"
            className="btn"
            onClick={() => void requestClose()}
            data-testid="editor-close"
          >
            Close
          </button>
        </>
      }
    >
      <div className="editor-container">
        <div
          className={kind.glyphColors ? 'editor-grid' : 'editor-grid editor-grid-single'}
          ref={gridRef}
          style={{
            ['--split-left' as string]: `${split}fr`,
            ['--split-right' as string]: `${1 - split}fr`,
            ['--split-min-left' as string]: `${MIN_SOURCE_WIDTH}px`,
            ['--split-min-right' as string]: `${MIN_GLYPHS_WIDTH}px`,
            ['--splitter-width' as string]: `${SPLITTER_WIDTH}px`,
          }}
          onKeyDownCapture={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              applyRef.current();
            }
          }}
        >
          <section className="editor-main" aria-label={`${kind.label} source`}>
            <div className="editor-fields">
              <span className="form-label">Name</span>
              <CommitInput
                value={formula.name}
                label="Formula name"
                testId="editor-name"
                validate={nameError}
                onCommit={(name) => renameFormula(formulaId, name)}
                width="140px"
              />
              <span className="form-label">Tag</span>
              <TagField
                tag={formula.tag}
                onChange={(tag) => patchFormula(formulaId, { tag })}
                colorTestId="editor-tag-color"
                iconTestId="editor-tag-icon"
              />
              {/* A size is the font size of what is typeset from a source: a brace and a shape are
                  fitted to their target, and theirs changes nothing. */}
              {kind.source && (
                <>
                  <span className="form-label">Size</span>
                  <span className="inline-fields">
                    {/* The scale and the font size are one value (R4): 48 × scale = font_size. */}
                    <CommitInput
                      value={String(scaleOfFontSize(formula.fontSize))}
                      label="Scale"
                      testId="editor-scale"
                      width="64px"
                      validate={scaleFieldError}
                      onCommit={(text) =>
                        patchFormula(formulaId, {
                          fontSize: fontSizeOfScale(parseStandardScale(text) ?? 1),
                        })
                      }
                    />
                    <span className="field-hint">× 48 =</span>
                    <CommitInput
                      value={String(formula.fontSize)}
                      label="Font size"
                      testId="editor-font-size"
                      width="64px"
                      validate={(text) => {
                        const n = Number(text);
                        return Number.isFinite(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE
                          ? null
                          : `A number from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}.`;
                      }}
                      onCommit={(text) => patchFormula(formulaId, { fontSize: Number(text) })}
                    />
                    <span className="field-hint">Manim font_size</span>
                  </span>
                </>
              )}
              <span className="form-label">Colour</span>
              <HexColorField
                value={formula.color}
                label="Formula colour"
                testId="editor-color"
                onCommit={(color) => patchFormula(formulaId, { color })}
              />
              <label className="form-label" htmlFor="editor-intro">
                Appears with
              </label>
              <span className="inline-fields">
                <IntroField
                  id="editor-intro"
                  intro={formula.intro}
                  kinds={introsOf(formula)}
                  takes={(intro) => takesIntro(formula, intro)}
                  onKind={(value) => setFormulaIntro(formulaId, value)}
                  onDuration={(seconds) => setFormulaIntroDuration(formulaId, seconds)}
                  selectTestId="editor-intro"
                  durationTestId="editor-intro-duration"
                />
                <span className="field-hint">
                  New clips start with it; clips still at the previous intro follow
                </span>
              </span>
            </div>

            <SourcePanel
              draft={draft}
              color={formula.color}
              onChange={patchDraft}
              autoFocus={isNew}
              onApply={() => applyRef.current()}
            />

            <div className="apply-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!dirty}
                onClick={apply}
                title={keyHint('Mod+Enter')}
                data-testid="editor-apply"
              >
                Apply
              </button>
              <button
                type="button"
                className="btn"
                disabled={!dirty}
                onClick={() => setDraft(source.draftOf(formula))}
                data-testid="editor-revert"
              >
                Revert
              </button>
              <span className="draft-status" data-testid="editor-status" aria-live="polite">
                {blank && 'Empty: nothing is drawn.'}
                {!blank && !previewResult && 'Rendering…'}
                {previewResult?.ok &&
                  `${previewResult.render.glyphs.length} glyphs · ${
                    previewResult.render.exact ? 'exact (LaTeX)' : 'MathJax'
                  }`}
                {previewResult && !previewResult.ok && (
                  <span className="field-error">Cannot render</span>
                )}
              </span>
            </div>
            {previewResult && !previewResult.ok && (
              <div className="render-error" role="alert" data-testid="editor-error">
                <strong>
                  {describeRenderError(previewResult.error, withDraft(formula, draft))}
                </strong>
                {previewResult.error.log && <pre>{previewResult.error.log}</pre>}
              </div>
            )}
            {shownWarnings.length > 0 && (
              <ul className="render-warnings" data-testid="editor-warnings">
                {shownWarnings.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            )}
          </section>

          {kind.glyphColors && (
            <>
              <ColumnSplitter
                containerRef={gridRef}
                value={split}
                defaultValue={DEFAULT_SPLIT}
                onChange={setSplit}
                minLeft={MIN_SOURCE_WIDTH}
                minRight={MIN_GLYPHS_WIDTH}
                width={SPLITTER_WIDTH}
                label="Resize the glyph view"
                testId="editor-splitter"
              />

              <section className="editor-glyphs" aria-label="Glyph colours">
                <div className="editor-glyphs-head">
                  <h3>Glyphs</h3>
                  <GlyphListToggle disabled={!hasGlyphs(formula, resolved)} />
                </div>
                {warning && (
                  <div className="sync-warning" role="status" data-testid="editor-sync-warning">
                    <span>{describeWarning(warning)}</span>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => useSyncWarnings.getState().dismiss(formulaId)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {resolved && (
                  <div className="render-badges">
                    <span
                      className={resolved.render.exact ? 'badge badge-exact' : 'badge badge-approx'}
                      data-testid="editor-source-badge"
                      title={
                        resolved.render.exact
                          ? 'Glyph order and shapes come from LaTeX, as Manim builds them'
                          : 'MathJax glyphs: the order can differ from Manim in some formulas'
                      }
                    >
                      {resolved.render.exact ? 'exact' : 'MathJax'}
                    </span>
                    <span className="field-hint">
                      {TARGET_NAMES[resolved.render.target]} · {resolved.render.glyphs.length}{' '}
                      glyphs
                    </span>
                  </div>
                )}
                <GlyphColors
                  formula={formula}
                  resolved={resolved}
                  background={meta.background}
                  stale={dirty}
                />
              </section>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
