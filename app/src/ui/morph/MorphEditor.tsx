/* The pair editor of a Morph block: a modal that links glyphs of one clip's formula to other
 * glyphs of the same formula, drawn twice — the sources on top (what is on screen when the block
 * starts), the targets below (what the block brings in); or side by side, the sources at the
 * left, when that draws them larger or its key asks for it.
 *
 * Editing model, as in the relation editor (`ui/relations/RelationEditor.tsx`): the editor works
 * on a draft of the block's pairs and touches the project only when "Save pairs" is pressed — one
 * `editBlock` update that writes the pairs and nothing else (the Animations panel owns the
 * block's timing, style and path arc), so the whole session is ONE undo step. Closing with
 * unsaved changes asks first, inside the dialog; without changes a press outside closes it.
 *
 * Linking, with the relation editor's gestures (`ui/relations/pairGestures.ts`): click a source,
 * then a target (or the other way round); Shift / Ctrl / ⌘ + click or a box drag selects several
 * on a side, and "Link" makes one n → m pair. A glyph is never on both sides of one block. Glyphs
 * that cannot take part (`morphEligibility`) are dimmed with the reason in their tooltip; they
 * stay clickable, and the Problems list says what validation makes of the draft. A glyph the intro
 * brings can be a target: linked, it skips the intro and arrives through the block. */
import { useEffect, useMemo, useState } from 'react';
import type { GlyphPair } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { editBlock } from '../animations/blockActions';
import { IssueList } from '../animations/IssueList';
import { GlyphChips } from '../creator/GlyphChips';
import { GlyphListToggle } from '../creator/GlyphListToggle';
import { glyphsUnavailable } from '../creator/glyphsUnavailable';
import { usePreferences } from '../preferences';
import { useDocumentStore } from '../project/documentStore';
import { Modal } from '../project/Modal';
import { GlyphLinkCanvas } from '../relations/GlyphLinkCanvas';
import { holds } from '../relations/pairGestures';
import { usePathEdit } from '../preview/pathEdit';
import { hintedProblem, LINK_TITLE } from '../relations/linkAs';
import { PairMenu } from '../relations/PairMenu';
import { PairList } from '../relations/RelationSidebar';
import { describePair, sortedUnique } from '../relations/relationOps';
import { styleLabel } from '../relations/styleOptions';
import { useFooterConfirmation, type FooterConfirmation } from '../relations/useFooterConfirmation';
import { usePairSession } from '../relations/usePairSession';
import { usePairStage } from '../relations/usePairStage';
import { preparePairCommit } from '../relations/pairCommit';
import { Icon } from '../timeline/icons';
import {
  findMorph,
  linkMorphPair,
  morphAlive,
  morphEligibility,
  morphGlyphLabel,
  morphLock,
  morphPairSeverities,
  morphProblems,
  morphSummary,
  openMorphDraft,
  suggestMorphPairs,
  whyNoSuggestion,
  withMorphPairs,
} from './morphDraft';
import type { MorphEditorRequest } from './morphEditorStore';
import '../relations/relations.css';
import './morph.css';
import { keysText } from '../platform';

const TITLE = 'Morph pairs';

/** Whether the editor draws the links, kept for the session. */
let linksShown = true;

export function MorphEditor({
  request,
  onClose,
}: {
  request: MorphEditorRequest;
  onClose: () => void;
}) {
  const project = useProjectStore((s) => s.project);
  // The draft is made once from the request; the project can change underneath only through a
  // re-render of the formula (followed below) or another document (which closes the editor).
  const [opening] = useState(() => openMorphDraft(project, request.clipId, request.actionId));
  if (!opening.ok) {
    return <MorphMessage message={opening.message} testId="morph-error" onClose={onClose} />;
  }
  return <Editor request={request} start={opening.pairs} onClose={onClose} />;
}

/** The dialog with only a message and OK: the block is gone, its track is locked, its formula
 * has no glyphs (yet). */
function MorphMessage({
  message,
  testId,
  onClose,
}: {
  message: string;
  testId: string;
  onClose: () => void;
}) {
  return (
    <Modal
      title={TITLE}
      onClose={onClose}
      testId="morph-editor"
      footer={
        <button type="button" className="btn" data-testid="morph-error-ok" onClick={onClose}>
          OK
        </button>
      }
    >
      <p data-testid={testId}>{message}</p>
    </Modal>
  );
}

interface EditorProps {
  request: MorphEditorRequest;
  start: GlyphPair[];
  onClose: () => void;
}

/** Closes the editor when the project it works on has changed under it (another document — even
 * one with the same ids —, the block, its clip or their formula removed). */
function Editor(props: EditorProps) {
  const { request, onClose } = props;
  const project = useProjectStore((s) => s.project);
  const session = useDocumentStore((s) => s.session);
  const [opened] = useState(session);
  const alive = session === opened && morphAlive(project, request.clipId, request.actionId);
  useEffect(() => {
    if (!alive) onClose();
  }, [alive, onClose]);
  return alive ? <EditorBody {...props} /> : null;
}

function EditorBody({ request, start, onClose }: EditorProps) {
  const { clipId, actionId } = request;
  const project = useProjectStore((s) => s.project);
  const resolvedMap = useRenderStore((s) => s.resolved);
  const entries = useRenderStore((s) => s.entries);
  const found = findMorph(project, clipId, actionId)!; // Editor checked it
  const { action } = found;
  const formula = found.formula!;
  const snap = formula.snapshot;
  const [showLinks, setShowLinksState] = useState(linksShown);
  const setShowLinks = (show: boolean) => {
    linksShown = show;
    setShowLinksState(show);
  };
  const confirmation = useFooterConfirmation();
  /** What the editor keeps of its drawing while it is open: its layout and its view. */
  const stage = usePairStage();
  const sideBySide = stage.layout === 'side';
  /** The glyphs of the two sides as keys under the drawing: only when asked for, and the relation
   * editor's own choice (one preference for the two pair editors). */
  const listed = usePreferences((s) => s.relationGlyphList);
  const label = (g: number) => morphGlyphLabel(formula, g);
  const labels = (glyphs: Iterable<number>) => sortedUnique(glyphs).map(label).join(' ');

  // The pairs, their selection, suggestion, menu and re-base (both sides are glyphs of the one
  // formula: a re-render takes both through the same transition) are the session's.
  const session = usePairSession({
    start,
    formulaIds: { from: formula.id, to: formula.id },
    selfPairs: true,
    holder: (pairs) => ({ pairs, style: action.style }),
    link: (holder, src, dst, style, separate) =>
      linkMorphPair(holder, src, dst, label, style, separate),
    problems: (next) => morphProblems(project, clipId, actionId, next),
    // «Link as» says a problem as the canvas says it of the glyph: why it cannot take part.
    explain: (issue, glyphs) => {
      const hints = morphEligibility(project, clipId, actionId);
      return (
        hints &&
        hintedProblem(
          issue,
          glyphs,
          { from: clipId, to: clipId },
          { from: hints.notSource, to: new Map([...hints.targetNotes, ...hints.notTarget]) },
          (_, g) => label(g),
        )
      );
    },
    describe: (pair) => describePair(pair, snap, snap),
    wording: { owner: 'the block', saved: 'the pairs are saved', rerendered: `“${formula.name}”` },
  });
  const { pairs, plain, dirty, stale, message, selection, canLink, selected, suggestion } = session;

  const eligibility = useMemo(
    () => morphEligibility(project, clipId, actionId),
    [project, clipId, actionId],
  );
  const ineligible = useMemo(
    () => eligibility && { from: eligibility.notSource, to: eligibility.notTarget },
    [eligibility],
  );
  const notes = useMemo(() => eligibility && { to: eligibility.targetNotes }, [eligibility]);
  const problems = useMemo(
    () => morphProblems(project, clipId, actionId, plain),
    [project, clipId, actionId, plain],
  );
  const errors = problems.filter((p) => p.severity === 'error');
  const blocked = stale ?? morphLock(project, clipId);
  const pairIssues = morphPairSeverities(problems, found.path, plain);
  // The formula drawn on both sides, kept while neither the project nor its render changes.
  const side = useMemo(() => {
    const f = findMorph(project, clipId, actionId)?.formula;
    const r = f && resolvedMap.get(f.id);
    return f && r ? { formula: f, resolved: r } : null;
  }, [project, resolvedMap, clipId, actionId]);
  const suggest = () => {
    const offered = suggestMorphPairs(project, clipId, actionId, plain);
    session.setSuggestion(offered.length > 0 ? offered : null);
    session.setMessage(
      offered.length > 0 ? null : whyNoSuggestion(project, clipId, actionId, plain),
    );
  };

  // --- Closing
  const cancel = () => {
    if (dirty) confirmation.ask('discard');
    else onClose();
  };
  /** Escape and ×: a selection goes first, then the editor (asking when there are changes). */
  const requestClose = () => {
    if (selected) session.clearSelection();
    else cancel();
  };

  /** Write the draft and close; false when the snapshot moved under it or the clip is locked. */
  const save = (): boolean => {
    const prepared = preparePairCommit(session, {
      sides: (current) => {
        const formula = findMorph(current, clipId, actionId)?.formula;
        if (!formula) return null;
        const side = { id: formula.id, name: formula.name, key: formula.snapshot?.key ?? null };
        return { from: side, to: side };
      },
      lock: (current) => morphLock(current, clipId),
      prepare: (current, pairs) => ({
        candidate: withMorphPairs(current, clipId, actionId, pairs),
        issues: morphProblems(current, clipId, actionId, pairs),
      }),
    });
    if (!prepared) return false;
    const next = structuredClone(findMorph(prepared.candidate, clipId, actionId)!.action.pairs);
    editBlock(clipId, actionId, (block) => {
      if (block.kind === 'morph') block.pairs = next;
    });
    onClose();
    return true;
  };
  // Edit path… of a link: the block is saved, the editor closes and the preview's mode opens.
  const editPath = (index: number) => {
    const id = pairs[index]?.id;
    const currentIndex = session.snapshot().pairs.findIndex((pair) => pair.id === id);
    if (currentIndex < 0 || !save()) return;
    usePathEdit
      .getState()
      .open({ origin: { kind: 'morph', clipId, actionId }, index: currentIndex });
  };

  // A formula without glyphs yet: say why, until they come (a draft with changes stays open,
  // with the message where the drawing goes).
  const ready = !!snap && !!side;
  if (!ready && !dirty) {
    return (
      <MorphMessage
        message={glyphsUnavailable(formula, entries[formula.id])}
        testId="morph-rendering"
        onClose={onClose}
      />
    );
  }

  const span = eligibility?.window;

  return (
    <Modal
      title={TITLE}
      onClose={requestClose}
      testId="morph-editor"
      width="min(1180px, calc(100vw - 32px))"
      closeOnBackdrop={!dirty}
      onBackdrop={onClose}
      resizable
      footer={
        <MorphFooter
          confirmation={confirmation}
          dirty={dirty}
          errorCount={errors.length}
          blocked={blocked}
          onDiscard={onClose}
          onCancel={cancel}
          onSave={save}
        />
      }
    >
      <div
        className="rel-body morph-body"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canLink && e.target === e.currentTarget) {
            e.preventDefault();
            session.link([...selection.from], [...selection.to]);
          }
        }}
        tabIndex={-1}
      >
        <header className="rel-heading">
          <span
            className="rel-clip"
            data-testid="morph-heading"
            style={{ ['--clip-color' as string]: formula.tag.color }}
          >
            <span className="rel-role">Morph</span>
            {formula.name}
            {span && (
              <small>
                {span.start.toFixed(2)}–{span.end.toFixed(2)} s
              </small>
            )}
          </span>
          <span className="rel-hint">
            The formula is drawn twice: the sources {sideBySide ? 'at the left' : 'on top'} (glyphs
            on screen when the block starts), the targets {sideBySide ? 'at the right' : 'below'}{' '}
            (glyphs it brings in). Click a source, then a target, to link them.{' '}
            {keysText(
              'Shift-click, or drag a box over glyphs (Shift or Ctrl/⌘: add), to select several;',
            )}{' '}
            then press Link to make one pair of many. A target the intro brings arrives through the
            block instead. Dimmed glyphs cannot take part as they are: point at one to see why.
          </span>
        </header>

        <div className="rel-layout">
          <div className="rel-main">
            <p className="rel-summary" data-testid="morph-summary">
              {morphSummary(pairs.length, eligibility)}
            </p>
            {side && snap ? (
              <>
                <GlyphLinkCanvas
                  from={side}
                  to={side}
                  testIdPrefix="morph"
                  stage={stage}
                  ownerName="block"
                  label={{ drawing: 'The formula twice', from: 'sources', to: 'targets' }}
                  ineligible={ineligible ?? undefined}
                  notes={notes ?? undefined}
                  background={project.meta.background}
                  pairs={pairs}
                  showLinks={showLinks}
                  defaultStyle={action.style}
                  pairIssues={pairIssues}
                  {...session.canvas}
                  onHoverGlyph={(glyph) => {
                    session.canvas.onHoverGlyph(glyph);
                    // Bring the row of the glyph's (first) pair into view.
                    const index = glyph ? pairs.findIndex((p) => holds(p, glyph)) : -1;
                    if (index >= 0) {
                      document
                        .querySelector(`[data-testid="morph-pair-${index}"]`)
                        ?.scrollIntoView({ block: 'nearest' });
                    }
                  }}
                />
                {/* The keyboard's way to pick glyphs: like a click on the glyph above. The lists
                    grow with the formula, twice: they show when the key of the toolbar asks for
                    them. */}
                {listed && (
                  <div className="rel-chips" data-testid="morph-chips">
                    <GlyphChips
                      glyphs={snap.glyphs}
                      selected={selection.from}
                      label={`Glyphs of ${formula.name} (sources)`}
                      testIdPrefix="morph-from"
                      onPick={(index, event) => session.canvas.onGlyph('from', index, event)}
                      onContext={(index, event) =>
                        session.canvas.onContextMenu({ side: 'from', index }, event)
                      }
                    />
                    <GlyphChips
                      glyphs={snap.glyphs}
                      selected={selection.to}
                      label={`Glyphs of ${formula.name} (targets)`}
                      testIdPrefix="morph-to"
                      onPick={(index, event) => session.canvas.onGlyph('to', index, event)}
                      onContext={(index, event) =>
                        session.canvas.onContextMenu({ side: 'to', index }, event)
                      }
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="rel-empty" data-testid="morph-rendering">
                {glyphsUnavailable(formula, entries[formula.id])}
              </p>
            )}

            {session.pairMenu && (
              <PairMenu
                testIdPrefix="morph"
                menu={session.pairMenu}
                pairs={pairs}
                defaultStyle={action.style}
                pathArc={action.pathArc}
                fromSnap={snap}
                toSnap={snap}
                onEditPath={editPath}
                editPathBlocked={
                  blocked ?? (errors.length ? 'Fix the problems listed first' : null)
                }
                {...session.menu}
              />
            )}

            <div className="rel-toolbar">
              <span className="rel-selection" data-testid="morph-selection">
                {canLink
                  ? `${labels(selection.from)} → ${labels(selection.to)}`
                  : selected
                    ? 'Now select glyphs on the other side'
                    : 'Nothing selected'}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-small"
                data-testid="morph-link"
                title={LINK_TITLE}
                disabled={!canLink}
                onClick={() => session.link([...selection.from], [...selection.to])}
              >
                Link
              </button>
              <button
                type="button"
                className="btn btn-small"
                data-testid="morph-clear-selection"
                disabled={!selected}
                onClick={session.clearSelection}
              >
                Clear selection
              </button>
              <button
                type="button"
                className="btn btn-small"
                data-testid="morph-suggest"
                disabled={!snap}
                title="Suggest one-to-one pairs between glyphs on screen and glyphs that can arrive, with the same label (in reading order)"
                onClick={suggest}
              >
                Suggest pairs by label
              </button>
              <GlyphListToggle
                preference="relationGlyphList"
                className="btn btn-small rel-toggle-list"
                testId="morph-toggle-list"
                disabled={!(side && snap)}
              />
              <button
                type="button"
                className="btn btn-small rel-toggle-links"
                data-testid="morph-toggle-links"
                aria-pressed={!showLinks}
                aria-label={showLinks ? 'Hide all links' : 'Show all links'}
                title={showLinks ? 'Hide all links' : 'Show all links'}
                onClick={() => setShowLinks(!showLinks)}
              >
                <Icon name={showLinks ? 'eye' : 'eye-off'} />
              </button>
            </div>

            {blocked && (
              <p className="rel-message morph-stale" role="alert" data-testid="morph-stale">
                {blocked}
              </p>
            )}
            {message && (
              <p className="rel-message" role="status" data-testid="morph-message">
                {message}
              </p>
            )}
          </div>

          <aside className="rel-side">
            <PairList
              testIdPrefix="morph"
              pairs={pairs}
              pairIssues={pairIssues}
              fromSnap={snap}
              toSnap={snap}
              defaultStyle={action.style}
              pathArc={action.pathArc}
              onEditPath={editPath}
              editPathBlocked={blocked ?? (errors.length ? 'Fix the problems listed first' : null)}
              {...session.list}
            />

            {suggestion && (
              <div className="rel-suggestion" data-testid="morph-suggestion">
                <span>
                  {suggestion.length} suggested pair{suggestion.length === 1 ? '' : 's'}:{' '}
                  {suggestion.map((p) => describePair(p, snap, snap)).join(' · ')}
                </span>
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  data-testid="morph-suggest-accept"
                  onClick={session.acceptSuggestion}
                >
                  Accept all
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  data-testid="morph-suggest-dismiss"
                  onClick={() => session.setSuggestion(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
            <section className="rel-section" data-testid="morph-block">
              <h3>Block</h3>
              <p className="rel-window">
                {span && `${span.start.toFixed(2)} → ${span.end.toFixed(2)} s · `}
                Default style {styleLabel(action.style)} · Easing {action.easing} · Path arc{' '}
                {action.pathArc}°
              </p>
              <p className="rel-hint">
                The timing, the default style and the path arc of the block are set in the
                Animations panel.
              </p>
            </section>

            {problems.length > 0 && (
              <IssueList issues={problems} testId="morph-problems" className="rel-problems" />
            )}
          </aside>
        </div>
      </div>
    </Modal>
  );
}

interface MorphFooterProps {
  confirmation: FooterConfirmation;
  dirty: boolean;
  errorCount: number;
  /** Why Save is held back regardless of the draft (the formula re-rendered underneath). */
  blocked: string | null;
  /** Close without saving. */
  onDiscard(): void;
  onCancel(): void;
  onSave(): void;
}

/** Cancel (or Close) and Save, or, while the discard question is open, that question. */
function MorphFooter({
  confirmation,
  dirty,
  errorCount,
  blocked,
  onDiscard,
  onCancel,
  onSave,
}: MorphFooterProps) {
  const { confirming, labelId, keepRef, dismiss } = confirmation;
  if (confirming) {
    return (
      <div
        className="rel-confirm"
        role="alertdialog"
        aria-labelledby={labelId}
        data-testid="morph-confirm"
      >
        <span id={labelId}>Discard the changes to these pairs?</span>
        <button
          type="button"
          ref={keepRef}
          className="btn"
          data-testid="morph-confirm-keep"
          onClick={dismiss}
        >
          Keep editing
        </button>
        <button
          type="button"
          className="btn btn-danger"
          data-testid="morph-confirm-yes"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    );
  }
  return (
    <>
      <button type="button" className="btn" data-testid="morph-cancel" onClick={onCancel}>
        {dirty ? 'Cancel' : 'Close'}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        data-testid="morph-save"
        disabled={!dirty || errorCount > 0 || blocked !== null}
        title={
          blocked !== null
            ? blocked
            : errorCount > 0
              ? 'Fix the problems listed first'
              : !dirty
                ? 'Nothing changed yet'
                : undefined
        }
        onClick={onSave}
      >
        Save pairs
      </button>
    </>
  );
}
