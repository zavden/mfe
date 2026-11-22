/* The relation editor: a modal that links the glyphs of one clip to the glyphs of another.
 *
 * Editing model. The editor works on a draft (the relation plus the intro of the target and the
 * outro of the source, which carry the "unpaired glyph" settings) and touches the project only
 * when "Save relation" is pressed: the whole session is ONE undo step, and the preview and the
 * timeline do not change while pairs are being edited. Closing with unsaved changes asks first
 * (inside the dialog; nothing here uses window.alert / confirm / prompt); without changes a
 * press outside the dialog closes it.
 *
 * Linking. Click a glyph of the source, then one of the target (or the other way round) to link
 * them. Shift / Ctrl / ⌘ + click adds glyphs to the selection of one side; with glyphs selected
 * on both sides "Link" makes one n → m pair. A plain click on a glyph of a side with no
 * selection while the other side has one links at once. Pairs keep their glyphs in ascending
 * order (docs/ARCHITECTURE.md §5).
 *
 * Preview (D156). A switch over the drawing, Link | Preview, puts the transformation in its
 * place: the two formulas as the draft would animate them, looping, with a bar to choose the
 * instant (RelationPreview.tsx). Nothing is saved for it, and the side column stays: a style, the
 * window or a phase changed there shows at once.
 *
 * Raw preview (D157). The last key of the drawing's toolbar animates the drawing itself: the
 * glyphs go from the source, on top, to the target, below, as the draft's pairs say, in straight
 * lines (RawPreview.tsx). The bar of that loop takes the toolbar's place, with the key that ends
 * it; Escape ends it too, and only then closes the editor. */
import { useEffect, useRef, useState } from 'react';
import {
  type Formula,
  type IntroKind,
  type OutroKind,
  type Project,
  type Relation,
} from '../../model';
import { useProjectStore, useRenderStore, useUiStore } from '../../store';
import {
  maxPhaseDuration,
  setPhaseDuration,
  setPhaseKind,
  setStartsEmpty,
} from '../animations/clipEdit';
import { useDocumentStore } from '../project/documentStore';
import { Modal } from '../project/Modal';
import { SegmentedControl } from '../SegmentedControl';
import { Tabs } from '../Tabs';
import { Icon } from '../timeline/icons';
import { useTimelineStore } from '../timeline/timelineStore';
import { glyphsUnavailable } from '../creator/glyphsUnavailable';
import { GlyphChips } from '../creator/GlyphChips';
import { GlyphListToggle } from '../creator/GlyphListToggle';
import { usePreferences } from '../preferences';
import { GlyphLinkCanvas } from './GlyphLinkCanvas';
import { INTRO_CHOICES, OUTRO_CHOICES } from '../animations/catalogue';
import { IssueList } from '../animations/IssueList';
import { hintedProblem, LINK_TITLE } from './linkAs';
import { holds } from './pairGestures';
import { revealRow } from './revealRow';
import { usePathEdit } from '../preview/pathEdit';
import { PairMenu } from './PairMenu';
import { RelationFooter } from './RelationFooter';
import { RawPreview } from './RawPreview';
import { RelationPreview } from './RelationPreview.tsx';
import { PairList, RelationSettings, UnpairedPhase } from './RelationSidebar';
import { useFooterConfirmation } from './useFooterConfirmation';
import { usePairSession } from './usePairSession';
import { usePairStage } from './usePairStage';
import { preparePairCommit } from './pairCommit';
import { removeRelation } from './relationActions';
import {
  draftProblems,
  initialDraft,
  pairSeverities,
  projectWithDraft,
  relationEligibility,
  resolveDraft,
  unpairedGlyphs,
  type RelationDraft,
} from './relationDraft';
import {
  copyRelation,
  describePair,
  glyphLabel,
  linkPair,
  newRelation,
  onePieceRelation,
  relationSummary,
  relationAlive,
  relationLock,
  relationTitle,
  sortedUnique,
  suggestPairs,
  windowRange,
} from './relationOps';
import { round6 } from '../time';
import type { RelationEditorRequest } from './relationEditorStore';
import './relations.css';
import { keysText } from '../platform';

/** Whether the editor draws the links, kept for the session. */
let linksShown = true;

/** The two tabs of the side column: the pairs, and how the relation and what it leaves unpaired
 * are animated. */
type SideTab = 'pairs' | 'animation';
/** What the workbench shows. */
type MainView = 'link' | 'preview';

/** Brings a row of the list of pairs into view, by scrolling the list and nothing else. */
const reveal = (selector: string) => revealRow(document.querySelector(selector));

export function RelationEditor({
  request,
  onClose,
}: {
  request: RelationEditorRequest;
  onClose: () => void;
}) {
  const project = useProjectStore((s) => s.project);
  const resolved = useRenderStore((s) => s.resolved);

  // The draft is created once from the request; the project can change underneath only through
  // undo/redo, which the open modal blocks.
  const [initial] = useState<
    { draft: RelationDraft; existed: boolean; note: string | null } | { error: string }
  >(() => {
    if (request.kind === 'edit') {
      const relation = project.relations.find((r) => r.id === request.relationId);
      const from = project.clips.find((c) => c.id === relation?.fromClipId);
      const to = project.clips.find((c) => c.id === relation?.toClipId);
      if (!relation || !from || !to) return { error: 'This relation no longer exists.' };
      if (!relationAlive(project, relation))
        return {
          error:
            'A formula of this relation no longer exists (the file refers to one that is not in the project): delete the relation or the clip.',
        };
      const lock = relationLock(project, relation);
      if (lock) return { error: lock };
      // A relation with a brace, a shape or a line on a side, which a saved project may hold
      // (`relation-kind`, audit A1-02): opened from anywhere (a double-click on its band), the
      // editor says why it does not edit it.
      const piece = onePieceRelation(project, relation);
      if (piece) return { error: piece };
      return { draft: initialDraft(copyRelation(relation), from, to), existed: true, note: null };
    }
    // A new relation is made where the user is on the timeline: its window starts at the
    // playhead when one fits there — or is the region, while one is marked (D180).
    const playhead = useUiStore.getState().time;
    const { region } = useTimelineStore.getState();
    const made = newRelation(project, request.fromClipId, request.toClipId, playhead, region);
    if (!made.ok) return { error: made.message };
    const from = project.clips.find((c) => c.id === request.fromClipId)!;
    const to = project.clips.find((c) => c.id === request.toClipId)!;
    return { draft: initialDraft(made.relation, from, to), existed: false, note: made.note };
  });

  if ('error' in initial) {
    return (
      <Modal
        title="Relation"
        onClose={onClose}
        testId="relation-editor"
        footer={
          <button type="button" className="btn" data-testid="rel-error-ok" onClick={onClose}>
            OK
          </button>
        }
      >
        <p data-testid="rel-error">{initial.error}</p>
      </Modal>
    );
  }
  return (
    <Editor
      project={project}
      resolved={resolved}
      start={initial.draft}
      existed={initial.existed}
      note={initial.note}
      onClose={onClose}
    />
  );
}

interface EditorProps {
  project: Project;
  resolved: ReturnType<typeof useRenderStore.getState>['resolved'];
  start: RelationDraft;
  existed: boolean;
  /** What to say of where a new relation's window was put (`newRelation`), until it is moved. */
  note: string | null;
  onClose: () => void;
}

/** Closes the editor when the project it works on has changed under it (a project was opened —
 * even one with the same ids —, the clips or their formulas were removed), instead of drawing a
 * relation whose clips are gone. */
function Editor(props: EditorProps) {
  const { project, start, onClose } = props;
  const session = useDocumentStore((s) => s.session);
  const [opened] = useState(session);
  const alive = session === opened && relationAlive(project, start.relation);
  useEffect(() => {
    if (!alive) onClose();
  }, [alive, onClose]);
  return alive ? <EditorBody {...props} /> : null;
}

function EditorBody({ project, resolved, start, existed, note, onClose }: EditorProps) {
  const update = useProjectStore((s) => s.update);
  const entries = useRenderStore((s) => s.entries);
  /** The draft but its pairs: the relation's settings and the two phases. The pairs are the
   * session's (`usePairSession`), which re-bases them when a formula is re-rendered underneath;
   * the settings never need that. */
  const [draft, setDraft] = useState<RelationDraft>(start);
  const confirmation = useFooterConfirmation();
  /** What the editor keeps of its drawing while it is open: its layout, which the raw preview
   * follows, and its view, which is the same when the drawing comes back from one of the
   * previews that take its place. */
  const stage = usePairStage();
  /** The glyphs of the two sides as keys under the drawing: only when asked for. */
  const listed = usePreferences((s) => s.relationGlyphList);
  /** The side column's tab. An editor opens on its pairs: linking them is what it is for, and
   * a press on the drawing (or a pick in the lists of glyphs) brings them back. */
  const [tab, setTab] = useState<SideTab>('pairs');
  /** What the workbench shows: the drawing to link glyphs, or the transformation (D156). */
  const [view, setView] = useState<MainView>('link');
  /** The drawing animates itself (D157): the raw preview, asked for by its key of the toolbar. */
  const [raw, setRaw] = useState(false);
  // The key that asked for it has the focus back when the preview ends.
  const rawKey = useRef<HTMLButtonElement>(null);
  const wasRaw = useRef(false);
  useEffect(() => {
    if (wasRaw.current && !raw) rawKey.current?.focus();
    wasRaw.current = raw;
  }, [raw]);
  const showPairs = () => setTab('pairs');
  /** The (first) pair of the glyph under the pointer; -1 without one. */
  const hoveredPair = useRef(-1);
  // The pairs come back with the row of the pair pressed in view: the pair of the glyph under
  // the pointer or, without one, the first the list emphasises (a pair of the selected glyphs).
  useEffect(() => {
    if (tab !== 'pairs') return;
    reveal(
      hoveredPair.current >= 0
        ? `[data-testid="rel-pair-${hoveredPair.current}"]`
        : '[data-testid="rel-pairs"] [data-focus="true"]',
    );
  }, [tab]);
  const [showLinks, setShowLinksState] = useState(linksShown);
  const setShowLinks = (show: boolean) => {
    linksShown = show;
    setShowLinksState(show);
  };

  const settings = draft.relation;
  const from = project.clips.find((c) => c.id === settings.fromClipId)!;
  const to = project.clips.find((c) => c.id === settings.toClipId)!;
  const fromFormula = project.formulas.find((f) => f.id === from.formulaId) as Formula;
  const toFormula = project.formulas.find((f) => f.id === to.formulaId) as Formula;
  const fromSnap = fromFormula.snapshot;
  const toSnap = toFormula.snapshot;
  const fromResolved = resolved.get(fromFormula.id);
  const toResolved = resolved.get(toFormula.id);
  const range = windowRange(from, to);

  const labelOf = {
    from: (g: number) => glyphLabel(fromSnap, g),
    to: (g: number) => glyphLabel(toSnap, g),
  };
  const session = usePairSession({
    start: start.relation.pairs,
    formulaIds: { from: fromFormula.id, to: toFormula.id },
    holder: (pairs) => ({ ...settings, pairs }),
    link: (holder, src, dst, style, separate) =>
      linkPair(holder, src, dst, style, labelOf, { separate }),
    problems: (next) =>
      draftProblems(
        project,
        resolveDraft({ ...draft, relation: { ...settings, pairs: next } }, from, to),
      ),
    // «Link as» says a problem as the canvas says it of the glyph: who else takes it.
    explain: (issue, glyphs) => {
      const { ineligible, notes } = relationEligibility(project, { ...settings, pairs: [] });
      return hintedProblem(
        issue,
        glyphs,
        { from: from.id, to: to.id },
        { from: new Map([...notes.from, ...ineligible.from]), to: ineligible.to },
        (side, g) => labelOf[side](g),
      );
    },
    describe: (pair) => describePair(pair, fromSnap, toSnap),
    wording: { owner: 'the relation', saved: 'the relation is saved', rerendered: 'A formula' },
  });
  const { pairs, stale, message, selection, canLink, suggestion } = session;
  /** The relation as it would be saved now. */
  const relation: Relation = { ...settings, pairs: session.plain };
  const settingsOf = (d: RelationDraft) => ({ ...d, relation: { ...d.relation, pairs: [] } });
  const dirty =
    session.dirty || JSON.stringify(settingsOf(draft)) !== JSON.stringify(settingsOf(start));

  const effective = resolveDraft({ ...draft, relation }, from, to);
  const problems = draftProblems(project, effective);
  const errors = problems.filter((p) => p.severity === 'error');
  const pairIssues = pairSeverities(
    problems,
    project.relations.findIndex((r) => r.id === relation.id),
  );
  const blocked = stale ?? relationLock(project, relation);

  /** A change of the relation's settings (window, style, easing): the pairs are not its. */
  const patchSettings = (next: Relation) => {
    setDraft((d) => ({ ...d, relation: { ...next, pairs: d.relation.pairs } }));
    session.setSuggestion(null);
  };

  // --- Settings
  const toStart = to.start;
  const lo = range ? range.start - toStart : -Infinity;
  const hi = range ? range.end - toStart : Infinity;
  const window0 = toStart + settings.offset;

  const setWindow = (offset: number, duration: number) =>
    patchSettings({ ...settings, offset: round6(offset), duration: round6(duration) });

  // What the glyphs no pair carries do, as the scene plays them once the draft is saved: those
  // the source's outro takes away, and those the target's intro brings — not the glyphs its
  // formula hides, nor those the clip leaves out itself (the first half of a split), nor those a
  // Morph or an Appear block brings —, or of a target that starts empty, those that stay out.
  const { leaving, entering } = unpairedGlyphs(
    project,
    effective,
    fromSnap?.glyphs.length ?? 0,
    toSnap?.glyphs.length ?? 0,
  );

  // What the other relations (and Morph blocks) already do with the glyphs of the two clips.
  const eligibility = relationEligibility(project, relation);
  const taken = eligibility.ineligible.from.size > 0 || eligibility.ineligible.to.size > 0;

  const setOutroKind = (kind: OutroKind) => {
    const probe = structuredClone(from);
    probe.outro = structuredClone(draft.outro);
    setPhaseKind(probe, 'outro', kind);
    setDraft((d) => ({ ...d, outro: probe.outro, matchOut: kind !== 'none' && d.matchOut }));
  };
  const setIntroKind = (kind: IntroKind) => {
    const probe = structuredClone(to);
    probe.intro = structuredClone(draft.intro);
    setPhaseKind(probe, 'intro', kind);
    setDraft((d) => ({ ...d, intro: probe.intro, matchIn: kind !== 'none' && d.matchIn }));
  };

  // --- Closing
  const requestClose = () => {
    if (session.selected) {
      session.clearSelection();
      return;
    }
    if (dirty) confirmation.ask('discard');
    else onClose();
  };

  /** Write the draft and close; false when the snapshot moved under it. */
  const save = (): boolean => {
    const prepared = preparePairCommit(session, {
      sides: (current) => {
        const saved = current.relations.find((r) => r.id === settings.id);
        if (
          existed &&
          (!saved ||
            saved.fromClipId !== settings.fromClipId ||
            saved.toClipId !== settings.toClipId)
        )
          return null;
        const side = (clipId: string) => {
          const clip = current.clips.find((c) => c.id === clipId);
          const formula = current.formulas.find((f) => f.id === clip?.formulaId);
          return (
            formula && { id: formula.id, name: formula.name, key: formula.snapshot?.key ?? null }
          );
        };
        const from = side(settings.fromClipId);
        const to = side(settings.toClipId);
        return from && to ? { from, to } : null;
      },
      lock: (current) => relationLock(current, settings),
      prepare: (current, pairs) => {
        const from = current.clips.find((c) => c.id === settings.fromClipId)!;
        const to = current.clips.find((c) => c.id === settings.toClipId)!;
        const effective = resolveDraft({ ...draft, relation: { ...settings, pairs } }, from, to);
        return {
          candidate: projectWithDraft(current, effective),
          issues: draftProblems(current, effective),
        };
      },
    });
    if (!prepared) return false;
    const next = prepared.candidate;
    update((draftProject) => {
      draftProject.relations = next.relations;
      for (const clip of draftProject.clips) {
        const saved = next.clips.find((c) => c.id === clip.id);
        if (!saved) continue;
        if (clip.id === relation.fromClipId) clip.outro = saved.outro;
        if (clip.id === relation.toClipId) {
          clip.intro = saved.intro;
          setStartsEmpty(clip, saved.startsEmpty === true);
        }
        if (clip.id === relation.fromClipId || clip.id === relation.toClipId)
          clip.actions = saved.actions;
      }
    });
    onClose();
    return true;
  };
  // Edit path… of a link: the relation is saved, the editor closes and the preview's mode opens
  // on that pair.
  const editPath = (index: number) => {
    const id = pairs[index]?.id;
    const currentIndex = session.snapshot().pairs.findIndex((pair) => pair.id === id);
    if (currentIndex < 0 || !save()) return;
    usePathEdit
      .getState()
      .open({ origin: { kind: 'relation', relationId: relation.id }, index: currentIndex });
  };

  const remove = () => {
    if (!removeRelation(relation.id)) return;
    if (useUiStore.getState().selection.kind === 'relation')
      useUiStore.getState().select({ kind: 'none' });
    onClose();
  };

  // "Relation 2 of 3" when the two clips have several; a new one comes last.
  const title = `${relationTitle(project, settings)}: ${fromFormula.name} → ${toFormula.name}`;
  /** Both formulas have their glyphs: there is a drawing, and something to preview. */
  const ready = !!(fromResolved && toResolved && fromSnap && toSnap);
  /** The raw preview shows: asked for, in the drawing's view, with a draft that can be drawn. */
  const rawOn = view === 'link' && raw && ready && errors.length === 0;

  const footer = (
    <RelationFooter
      confirmation={confirmation}
      existed={existed}
      dirty={dirty}
      pairCount={pairs.length}
      errorCount={errors.length}
      blocked={blocked}
      onDiscard={onClose}
      onDelete={remove}
      onCancel={requestClose}
      onSave={save}
    />
  );

  const labelsOf = (glyphs: number[], snap: typeof fromSnap) =>
    glyphs.map((g) => glyphLabel(snap, g)).join(' ');

  /** The second tab: the timing and style of the relation, and the animation of the glyphs it
   * does not pair (the source's outro, the target's intro). */
  const animation = (
    <section className="rel-section rel-settings" data-testid="rel-settings">
      <h3>Timing and style</h3>
      <RelationSettings
        relation={relation}
        lo={lo}
        hi={hi}
        window0={window0}
        range={range}
        onWindow={setWindow}
        patch={(change) => patchSettings({ ...settings, ...change })}
        // Where the window was put, as long as it is still there.
        note={
          settings.offset === start.relation.offset && settings.duration === start.relation.duration
            ? note
            : null
        }
      />

      <h3>Unpaired glyphs</h3>
      <UnpairedPhase
        phase="outro"
        formulaName={fromFormula.name}
        glyphs={leaving}
        snap={fromSnap}
        kind={draft.outro.kind}
        options={OUTRO_CHOICES}
        onKind={setOutroKind}
        duration={effective.outro.duration}
        maxDuration={maxPhaseDuration(from, 'outro')}
        onDuration={(v) => {
          const probe = structuredClone(from);
          probe.outro = structuredClone(draft.outro);
          setPhaseDuration(probe, 'outro', v);
          setDraft((d) => ({ ...d, outro: probe.outro }));
        }}
        match={draft.matchOut}
        onMatch={(matchOut) => setDraft((d) => ({ ...d, matchOut }))}
      />
      <UnpairedPhase
        phase="intro"
        formulaName={toFormula.name}
        glyphs={entering}
        snap={toSnap}
        kind={draft.intro.kind}
        options={INTRO_CHOICES}
        onKind={setIntroKind}
        duration={effective.intro.duration}
        maxDuration={maxPhaseDuration(to, 'intro')}
        onDuration={(v) => {
          const probe = structuredClone(to);
          probe.intro = structuredClone(draft.intro);
          setPhaseDuration(probe, 'intro', v);
          setDraft((d) => ({ ...d, intro: probe.intro }));
        }}
        match={draft.matchIn && !draft.startsEmpty}
        onMatch={(matchIn) => setDraft((d) => ({ ...d, matchIn }))}
        startsEmpty={draft.startsEmpty}
        onStartsEmpty={(startsEmpty) => setDraft((d) => ({ ...d, startsEmpty }))}
      />
      <p className="rel-hint">
        The outro, the intro and “Starts empty” belong to the clips: changing them here changes
        those clips.
      </p>
    </section>
  );

  return (
    <Modal
      title={title}
      onClose={requestClose}
      testId="relation-editor"
      width="min(1180px, calc(100vw - 32px))"
      closeOnBackdrop={!dirty}
      onBackdrop={onClose}
      resizable
      footer={footer}
    >
      <div
        className="rel-body"
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
            data-testid="rel-heading-from"
            style={{ ['--clip-color' as string]: fromFormula.tag.color }}
          >
            <span className="rel-role">Source</span>
            {fromFormula.name}
            <small>
              {from.start.toFixed(2)}–{from.end.toFixed(2)} s
            </small>
          </span>
          <span aria-hidden="true">→</span>
          <span
            className="rel-clip"
            data-testid="rel-heading-to"
            style={{ ['--clip-color' as string]: toFormula.tag.color }}
          >
            <span className="rel-role">Target</span>
            {toFormula.name}
            <small>
              {to.start.toFixed(2)}–{to.end.toFixed(2)} s
            </small>
          </span>
          <span className="rel-hint">
            {stage.layout === 'side'
              ? 'The source is at the left, the target at the right.'
              : 'The source is on top, the target below.'}{' '}
            Click a glyph of each formula to link them.{' '}
            {keysText(
              'Shift-click, or drag a box over glyphs (Shift or Ctrl/⌘: add), to select several;',
            )}{' '}
            then press Link to make one pair of many.
            {taken && (
              <span data-testid="rel-taken-hint">
                {' '}
                Dimmed glyphs are taken by another relation or a Morph block: point at one to see
                why.
              </span>
            )}
          </span>
        </header>

        <div className="rel-layout">
          <div className="rel-main">
            <div className="rel-main-head">
              <p className="rel-summary" data-testid="rel-summary">
                {/* Of a target that starts empty, what stays out is what nothing brings: no
                    relation, and no block of the clip either (`unpairedGlyphs`). */}
                {relationSummary(pairs.length, leaving.length, entering.length, draft.startsEmpty)}
              </p>
              <SegmentedControl<MainView>
                label="Show"
                value={view}
                onChange={(next) => {
                  setView(next);
                  setRaw(false);
                }}
                testId="rel-view"
                options={[
                  { value: 'link', label: 'Link', title: 'Link the glyphs of the two formulas' },
                  {
                    value: 'preview',
                    label: 'Preview',
                    title: 'See the transformation as it is now, before saving',
                  },
                ]}
              />
            </div>
            {fromResolved && toResolved && fromSnap && toSnap ? (
              view === 'preview' ? (
                errors.length > 0 && (
                  <p className="rel-empty" data-testid="rel-preview-blocked">
                    Fix the problems listed to see the transformation.
                  </p>
                )
              ) : rawOn ? (
                <RawPreview
                  project={project}
                  resolved={resolved}
                  draft={effective}
                  from={{ formula: fromFormula, resolved: fromResolved }}
                  to={{ formula: toFormula, resolved: toResolved }}
                  layout={stage.layout ?? 'stacked'}
                  onEnd={() => setRaw(false)}
                />
              ) : (
                <>
                  <GlyphLinkCanvas
                    from={{ formula: fromFormula, resolved: fromResolved }}
                    to={{ formula: toFormula, resolved: toResolved }}
                    stage={stage}
                    background={project.meta.background}
                    pairs={pairs}
                    showLinks={showLinks}
                    defaultStyle={relation.style}
                    pairIssues={pairIssues}
                    ineligible={eligibility.ineligible}
                    notes={eligibility.notes}
                    consumed={eligibility.consumed}
                    {...session.canvas}
                    onPress={showPairs}
                    onHoverGlyph={(glyph) => {
                      session.canvas.onHoverGlyph(glyph);
                      // Bring the row of the glyph's (first) pair into view.
                      const index = glyph ? pairs.findIndex((p) => holds(p, glyph)) : -1;
                      hoveredPair.current = index;
                      if (index >= 0) reveal(`[data-testid="rel-pair-${index}"]`);
                    }}
                  />
                  {/* The keyboard's way to pick glyphs: like a click on the glyph above. The lists
                    grow with the formulas: they show when the key of the toolbar asks for them. */}
                  {listed && (
                    <div className="rel-chips" data-testid="rel-chips">
                      <GlyphChips
                        glyphs={fromSnap.glyphs}
                        selected={selection.from}
                        label={`Glyphs of ${fromFormula.name} (from)`}
                        testIdPrefix="rel-from"
                        onPick={(index, event) => {
                          showPairs();
                          session.canvas.onGlyph('from', index, event);
                        }}
                        onContext={(index, event) =>
                          session.canvas.onContextMenu({ side: 'from', index }, event)
                        }
                      />
                      <GlyphChips
                        glyphs={toSnap.glyphs}
                        selected={selection.to}
                        label={`Glyphs of ${toFormula.name} (to)`}
                        testIdPrefix="rel-to"
                        onPick={(index, event) => {
                          showPairs();
                          session.canvas.onGlyph('to', index, event);
                        }}
                        onContext={(index, event) =>
                          session.canvas.onContextMenu({ side: 'to', index }, event)
                        }
                      />
                    </div>
                  )}
                </>
              )
            ) : (
              <p className="rel-empty" data-testid="rel-rendering">
                {[
                  ...new Set(
                    [fromFormula, toFormula]
                      .filter((f) => !resolved.get(f.id) || !f.snapshot)
                      .map((f) => glyphsUnavailable(f, entries[f.id])),
                  ),
                ].join(' ')}
              </p>
            )}

            {session.pairMenu && (
              <PairMenu
                menu={session.pairMenu}
                pairs={pairs}
                defaultStyle={relation.style}
                pathArc={relation.pathArc}
                fromSnap={fromSnap}
                toSnap={toSnap}
                onEditPath={editPath}
                editPathBlocked={
                  blocked ?? (errors.length ? 'Fix the problems listed first' : null)
                }
                {...session.menu}
              />
            )}

            <RelationPreview
              active={view === 'preview' && ready && errors.length === 0}
              project={project}
              resolved={resolved}
              draft={effective}
            />

            {view === 'link' && !rawOn && (
              <>
                <div className="rel-toolbar">
                  <span className="rel-selection" data-testid="rel-selection">
                    {canLink
                      ? `${labelsOf(sortedUnique(selection.from), fromSnap)} → ${labelsOf(sortedUnique(selection.to), toSnap)}`
                      : session.selected
                        ? 'Now select glyphs on the other side'
                        : 'Nothing selected'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    data-testid="rel-link"
                    title={LINK_TITLE}
                    disabled={!canLink}
                    onClick={() => session.link([...selection.from], [...selection.to])}
                  >
                    Link
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    data-testid="rel-clear-selection"
                    disabled={!session.selected}
                    onClick={session.clearSelection}
                  >
                    Clear selection
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    data-testid="rel-auto-link"
                    disabled={!fromSnap || !toSnap}
                    title="Suggest one-to-one links between glyphs with the same label (in reading order)"
                    onClick={() => {
                      if (!fromSnap || !toSnap) return;
                      // A suggested pair consumes its source: one that can only be copied
                      // is left out as one that cannot be used at all.
                      const found = suggestPairs(fromSnap, toSnap, pairs, {
                        from: [
                          ...eligibility.ineligible.from.keys(),
                          ...eligibility.notes.from.keys(),
                        ],
                        to: eligibility.ineligible.to.keys(),
                      });
                      session.setSuggestion(found);
                      session.setMessage(
                        found.length === 0 ? 'No more glyphs with the same label.' : null,
                      );
                    }}
                  >
                    Suggest links by label
                  </button>
                  <GlyphListToggle
                    preference="relationGlyphList"
                    className="btn btn-small rel-toggle-list"
                    testId="rel-toggle-list"
                    disabled={!(fromResolved && toResolved && fromSnap && toSnap)}
                  />
                  <button
                    type="button"
                    className="btn btn-small rel-toggle-links"
                    data-testid="rel-toggle-links"
                    aria-pressed={!showLinks}
                    aria-label={showLinks ? 'Hide all links' : 'Show all links'}
                    title={showLinks ? 'Hide all links' : 'Show all links'}
                    onClick={() => setShowLinks(!showLinks)}
                  >
                    <Icon name={showLinks ? 'eye' : 'eye-off'} />
                  </button>
                  <button
                    ref={rawKey}
                    type="button"
                    className="btn btn-small rel-raw-open"
                    data-testid="rel-raw-open"
                    disabled={!ready || errors.length > 0}
                    title={
                      errors.length > 0
                        ? 'Fix the problems listed first'
                        : 'Animate this drawing: the glyphs go from the source to the target as their pairs say, in straight lines'
                    }
                    onClick={() => setRaw(true)}
                  >
                    Preview raw
                  </button>
                </div>

                {suggestion && suggestion.length > 0 && fromSnap && toSnap && (
                  <div className="rel-suggestion" data-testid="rel-suggestion">
                    <span>
                      {suggestion.length} suggested link{suggestion.length === 1 ? '' : 's'}:{' '}
                      {suggestion.map((p) => describePair(p, fromSnap, toSnap)).join(' · ')}
                    </span>
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      data-testid="rel-suggestion-accept"
                      onClick={session.acceptSuggestion}
                    >
                      Accept all
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      data-testid="rel-suggestion-dismiss"
                      onClick={() => session.setSuggestion(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </>
            )}
            {(blocked ?? message) && (
              <p className="rel-message" role="status" data-testid="rel-message">
                {blocked ?? message}
              </p>
            )}
          </div>

          <aside className="rel-side">
            <Tabs<SideTab>
              label="Relation"
              testId="rel-side"
              active={tab}
              onChange={setTab}
              tabs={[
                {
                  id: 'pairs',
                  label: `Pairs (${pairs.length})`,
                  content: (
                    <PairList
                      pairs={pairs}
                      pairIssues={pairIssues}
                      fromSnap={fromSnap}
                      toSnap={toSnap}
                      defaultStyle={relation.style}
                      titled={false}
                      pathArc={relation.pathArc}
                      onEditPath={editPath}
                      editPathBlocked={
                        blocked ?? (errors.length ? 'Fix the problems listed first' : null)
                      }
                      {...session.list}
                    />
                  ),
                },
                { id: 'animation', label: 'Animation', content: animation },
              ]}
            />

            {/* Under both tabs: a problem of the pairs or of the timing is in sight in either. */}
            {problems.length > 0 && (
              <IssueList issues={problems} testId="rel-problems" className="rel-problems" />
            )}
          </aside>
        </div>
      </div>
    </Modal>
  );
}
