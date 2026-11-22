/* The composition editor owns local source and placement drafts. Apply is the only project
 * write; native input undo never competes with a long-lived project history gesture. It edits a
 * font text or a LaTeX text: what only a font text has (a saved appearance to refresh, the lock
 * of its shared uses) is asked of its kind.
 *
 * The stage places one thing, which the session says: opened from a clip, that occurrence (its
 * initial state, or the end state of the selected Transform); opened from the library, where the
 * new clips of the object start (`Formula.startPosition`, D124), which Apply keeps while
 * `keepPosition` is on. */
import { create } from 'zustand';
import {
  droppedTotal,
  emptyRemapReport,
  isBlank,
  newId,
  remapGlyphRefs,
  setStartPosition,
  startPositionOf,
  type Placement,
  type Project,
  type Vec2,
} from '../../model';
import { renderRequestFor, type FormulaRender, type GlyphMatch } from '../../engine';
import { requestIdentity, type RenderBasis } from '../../engine/correspondence';
import { textArtifactRender, textBasisMatches } from '../../engine/pango';
import {
  discardTextGeometry,
  loadTextGeometry,
  storeTextGeometry,
  type StoredTextGeometry,
} from '../../media/textGeometry';
import { freedEndPoint } from '../../scene';
import { syncCurrentMediaOwnership } from '../../store/mediaOwnership';
import {
  applyTextGeometryCommit,
  planTextGeometryCommit,
  type TextGeometryCommitPlan,
} from '../../store/textGeometryCommit';
import {
  history,
  describeWarning,
  useRenderStore,
  useSyncWarnings,
  useProjectStore,
  useUiStore,
} from '../../store';
import { patchKeyframe, stateAt } from '../../scene';
import { partEditOf, previewEdit, useTransformEdit } from '../animations/transformEdit';
import { createEditorFormula } from '../creator/newFormula';
import {
  applyFormulaIntro,
  duplicateName,
  introStayedNotice,
  validateFormulaName,
} from '../creator/formulaActions';
import { getActivePalette } from '../colors/paletteStore';
import { usePreferences } from '../preferences';
import { onDocumentReplaced, useDocumentStore } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { mainPlayback } from '../transport/mainPlayback';
import { safeSession } from '../storage';
import {
  carryPaint,
  planPaintCommit,
  type GlyphPaint,
  type PaintCommit,
  type PaintState,
} from './glyphPaint';
import {
  boundState,
  isCompositionFormula,
  ORIGIN_PLACEMENT,
  placementOf,
  samePlacement,
  sameTextDraft,
  textDraftOf,
  textSourceLock,
  validateTextDraft,
  type CompositionFormula,
  type CompositionKind,
  type DraftOf,
  type FontTextDraft,
  type LatexTextDraft,
  type PlacementBinding,
  type TextDraft,
} from './textCompositionModel';

export interface TextCompositionSession<F extends CompositionFormula = CompositionFormula> {
  token: number;
  document: string;
  documentSession: number;
  time: number;
  /** The object as it was when the session opened: a font text or a LaTeX text. */
  original: F;
  isNew: boolean;
  clipId: string | null;
  placement: PlacementBinding | null;
  placementReason: string | null;
  /** Of the kind of `original`. */
  draft: DraftOf<F>;
  position: Vec2;
  pose: Placement;
  /** «New clips start here», of a library session (one without a clip): Apply keeps the stage's
   * position as the one the object's new clips start at. On when the session opens; off, Apply
   * leaves the object's start position as it was. Always off in the session of a clip, whose
   * stage places that clip. */
  keepPosition: boolean;
  independent: boolean;
  refresh: boolean;
  applying: boolean;
  composing: boolean;
  error: string | null;
  positions: Vec2[];
  futurePositions: Vec2[];
  /** The glyph colours and hidden glyphs of the draft of a LaTeX text, counted by its render
   * (`glyphPaint.ts`); null until something says what its glyphs are. */
  paint: PaintState | null;
  /** A change of the draft could not be followed glyph by glyph: the paint was let go, and
   * Apply leaves the colours of the object to the render sync, as it finds them. */
  paintLost: boolean;
  /** The paint of a recovered draft, until the render it counts by is the draft's. */
  recoveredPaint: RecoveredPaint | null;
  recovery: {
    draft: DraftOf<F>;
    position: Vec2;
    keepPosition: boolean;
    independent: boolean;
    paint: RecoveredPaint | null;
  } | null;
}

/** A paint kept with an unapplied draft: the key of the render it counts by, and the paint. */
interface RecoveredPaint {
  key: string;
  paint: GlyphPaint;
}

/** Whether `session` edits an object of `kind`: its original and its draft are then of it. */
export const isSessionOf = <K extends CompositionKind>(
  session: TextCompositionSession,
  kind: K,
): session is TextCompositionSession<Extract<CompositionFormula, { kind: K }>> =>
  session.original.kind === kind;

interface CompositionState {
  session: TextCompositionSession | null;
  /** Open the session of an object and, with `clipId`, of that occurrence of it; without an
   * object, of a new one of `kind`, which reaches the project when it is applied. */
  open(formulaId?: string, clipId?: string, kind?: CompositionKind): void;
  cancel(): void;
  /** Change fields of the draft (of its kind: a patch never changes the kind). */
  patch(patch: Partial<Omit<FontTextDraft, 'kind'>> | Partial<Omit<LatexTextDraft, 'kind'>>): void;
  setComposing(composing: boolean): void;
  setPosition(position: Vec2, record?: boolean): void;
  /** Turn «New clips start here» on or off; nothing in the session of a clip. */
  setKeepPosition(keep: boolean): void;
  recordPosition(before: Vec2): void;
  undoPosition(redo?: boolean): void;
  makeIndependent(): void;
  refresh(): void;
  cancelRefresh(): void;
  recover(): void;
  /** Start the paint of the draft (`seedPaint`); it replaces one the author has not edited. */
  startPaint(state: PaintState): void;
  /** The draft was rendered anew (`basis`): the paint follows `match`, the glyphs of the render
   * it counted by → the glyphs of this one; null when nothing verified says where they went,
   * and the paint is let go. */
  followPaint(basis: RenderBasis, match: GlyphMatch | null): void;
  /** Colour or hide glyphs of the render the paint counts by. */
  editPaint(change: (paint: GlyphPaint) => GlyphPaint): void;
  apply(render?: FormulaRender): boolean | Promise<boolean>;
}

const RECOVERY = 'mfe.text-composition.v2';
let nextToken = 0;

function recovered(session: TextCompositionSession): TextCompositionSession['recovery'] {
  try {
    const value = JSON.parse(safeSession.getItem(RECOVERY) ?? 'null') as {
      document: string;
      formulaId: string;
      clipId: string | null;
      isNew: boolean;
      basis: string;
      placement: string;
      draft: TextDraft;
      position: Vec2;
      keepPosition?: boolean;
      independent: boolean;
      paint?: RecoveredPaint | null;
    } | null;
    if (
      !value ||
      value.document !== session.document ||
      value.clipId !== session.clipId ||
      value.isNew !== session.isNew ||
      (!session.isNew && value.formulaId !== session.original.id) ||
      value.basis !== JSON.stringify(textDraftOf(session.original)) ||
      value.placement !== JSON.stringify(session.placement) ||
      value.draft?.kind !== session.original.kind ||
      validateTextDraft(value.draft) ||
      !Array.isArray(value.position) ||
      value.position.length !== 2 ||
      !value.position.every(Number.isFinite)
    )
      return null;
    const paint = value.paint;
    return {
      draft: value.draft,
      position: value.position,
      // A draft kept before the box existed comes back as a session opens: ticked.
      keepPosition: !session.clipId && value.keepPosition !== false,
      independent: value.independent === true,
      paint:
        paint &&
        typeof paint.key === 'string' &&
        Array.isArray(paint.paint?.hidden) &&
        paint.paint.hidden.every(Number.isInteger) &&
        Object.values(paint.paint.colors ?? {}).every((color) => typeof color === 'string')
          ? {
              key: paint.key,
              paint: { colors: { ...paint.paint.colors }, hidden: [...paint.paint.hidden] },
            }
          : null,
    };
  } catch {
    return null;
  }
}

function remember(session: TextCompositionSession | null): void {
  if (!session || session.composing || validateTextDraft(session.draft)) return;
  safeSession.setItem(
    RECOVERY,
    JSON.stringify({
      document: session.document,
      formulaId: session.original.id,
      clipId: session.clipId,
      isNew: session.isNew,
      basis: JSON.stringify(textDraftOf(session.original)),
      placement: JSON.stringify(session.placement),
      draft: session.draft,
      position: session.position,
      keepPosition: session.keepPosition,
      independent: session.independent,
      paint: session.paint?.edited
        ? { key: session.paint.basis.render.key, paint: session.paint.paint }
        : null,
    }),
  );
}

/** Whether the paint the author edited counts by an earlier render than the one of the draft
 * as it stands (it is being rendered, or it does not render): Apply waits for it. A draft that
 * draws nothing has nothing to paint. */
export function paintIsBehind(session: TextCompositionSession): boolean {
  const { paint, draft, original } = session;
  if (!paint?.edited || draft.kind !== 'tex' || original.kind !== 'tex') return false;
  const formula = { ...original, ...draft };
  if (isBlank(formula)) return false;
  const { meta } = useProjectStore.getState().project;
  return (
    requestIdentity(renderRequestFor(formula, meta, 'auto')) !==
    requestIdentity(paint.basis.request)
  );
}

/** Used by Save/New/Open/Export boundaries; a second trusted gesture follows Apply/Cancel. */
export function blockTextCompositionCommand(): boolean {
  if (!useTextComposition.getState().session) return false;
  notify({
    kind: 'info',
    title: 'Finish text composition',
    message: 'Choose Apply or Cancel in the text editor, then run the command again.',
  });
  return true;
}

export const isTextCompositionOpen = (): boolean => useTextComposition.getState().session !== null;

export function cancelTextCompositionForHistory(): boolean {
  if (!isTextCompositionOpen()) return false;
  useTextComposition.getState().cancel();
  return true;
}

/** A current reason, rechecked on Apply and whenever the document changes. */
export function compositionConflict(session: TextCompositionSession): string | null {
  const document = useDocumentStore.getState();
  if (document.documentId !== session.document || document.session !== session.documentSession)
    return 'The document changed. Reopen this text in the current document.';
  const project = useProjectStore.getState().project;
  if (!session.isNew) {
    const formula = project.formulas.find((item) => item.id === session.original.id);
    if (!isCompositionFormula(formula) || formula.kind !== session.original.kind)
      return 'This text no longer exists.';
    if (!sameTextDraft(textDraftOf(formula), textDraftOf(session.original)))
      return 'The source or typography changed outside this editor. Cancel and reopen to use it.';
    if (
      session.clipId &&
      !project.clips.some(
        (clip) => clip.id === session.clipId && clip.formulaId === session.original.id,
      )
    )
      return 'The selected occurrence changed or no longer exists.';
    const sourceChanged =
      !sameTextDraft(session.draft, textDraftOf(session.original)) || session.refresh;
    if (
      session.refresh &&
      formula.kind === 'text' &&
      session.original.kind === 'text' &&
      JSON.stringify(formula.geometry) !== JSON.stringify(session.original.geometry)
    )
      return 'The saved appearance changed outside this editor. Reopen before refreshing it.';
    // Only a font text is locked by its other uses: its glyphs are a saved appearance they share.
    if (sourceChanged && !session.independent && formula.kind === 'text') {
      const lock = textSourceLock(project, formula.id);
      if (lock) return lock;
    }
    if (session.independent) {
      const clip = project.clips.find((item) => item.id === session.clipId);
      if (!clip || project.tracks.find((track) => track.id === clip.trackId)?.locked)
        return 'The selected occurrence must be on an unlocked track to become independent.';
    }
    // No clip is touched by it, so no lock of a track stands in its way.
    if (
      keepsNewPosition(session) &&
      !samePosition(startPositionOf(formula), startPositionOf(session.original))
    )
      return 'The start position changed outside this editor. Cancel and reopen to use it.';
  }
  if (session.placement && !samePosition(session.position, session.placement.original.position)) {
    const binding = session.placement;
    const clip = project.clips.find((item) => item.id === binding.clipId);
    const state = clip && boundState(clip, binding.ref);
    if (
      !clip ||
      !state ||
      clip.trackId !== binding.trackId ||
      clip.attach ||
      project.tracks.find((track) => track.id === clip.trackId)?.locked
    )
      return 'This placement is no longer editable. Cancel and select an unlocked, unattached state.';
    if (!samePlacement(state, binding.original))
      return 'The placement changed outside this editor.';
    const editing = useTransformEdit.getState();
    const allowed = previewEdit(clip, session.time, editing.editing, editing.unlocked);
    if ('blocked' in allowed || JSON.stringify(allowed.ref) !== JSON.stringify(binding.ref))
      return 'The placement editing context changed. Select the intended state again.';
  }
  return validateTextDraft(session.draft) ?? draftNameConflict(session, project);
}

/** Why the name a LaTeX text's draft gives it cannot be its name; null when it can. A copy made
 * on Apply may keep the name of its original: it is given the next free one. */
function draftNameConflict(session: TextCompositionSession, project: Project): string | null {
  const { draft, original } = session;
  if (draft.kind !== 'tex') return null;
  if (session.independent && draft.name === original.name) return null;
  const own = session.isNew || session.independent ? null : original.id;
  return validateFormulaName(draft.name, project.formulas, own);
}

const samePosition = (a: Vec2, b: Vec2) => a[0] === b[0] && a[1] === b[1];

/** Whether Apply gives the object a new start position: a library session with «New clips start
 * here» on, whose stage is not where the object already keeps its new clips. */
export function keepsNewPosition(session: TextCompositionSession): boolean {
  return (
    !session.clipId &&
    session.keepPosition &&
    !samePosition(session.position, startPositionOf(session.original))
  );
}

function compositionError(token: number, error: unknown): void {
  const current = useTextComposition.getState().session;
  if (current?.token === token)
    useTextComposition.setState({
      session: {
        ...current,
        applying: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
}

/** All authored fields, canonical references and an optional prepared appearance publish in
 * the same recipe. A delayed storage operation never changes the transaction's ownership. */
function commitComposition(
  s: TextCompositionSession,
  prepared?: {
    stored: StoredTextGeometry;
    plan: TextGeometryCommitPlan;
  },
): string | null {
  let id = s.original.id;
  const sourceChanged = !sameTextDraft(s.draft, textDraftOf(s.original));
  const moved = s.placement && !samePosition(s.position, s.placement.original.position);
  const kept = keepsNewPosition(s);
  let remapped = emptyRemapReport();
  let introStayed = 0;
  let painted: PaintCommit | null = null;
  try {
    if (s.isNew || s.independent || sourceChanged || moved || kept || prepared || s.paint?.edited) {
      // Where an end a Transform carried a line to is left when its glyphs go: measured on the
      // project and the renders as they are before the commit.
      const freed = freedEndPoint(
        useProjectStore.getState().project,
        useRenderStore.getState().resolved,
      );
      useProjectStore.getState().update((draft) => {
        const conflict = compositionConflict(s);
        if (conflict) throw new Error(conflict);
        let formula = draft.formulas.find((f) => f.id === s.original.id);
        // The name a new object or a copy takes: its draft's (a LaTeX text names itself), made
        // free when another object has it.
        const fresh = s.isNew || s.independent;
        if (fresh) {
          const basis = s.isNew ? s.original : formula!;
          const wanted = s.draft.kind === 'tex' ? s.draft.name : basis.name;
          id = s.isNew ? s.original.id : newId('f');
          formula = {
            ...basis,
            id,
            name: draft.formulas.some((f) => f.name === wanted)
              ? duplicateName(wanted, draft.formulas)
              : wanted,
          };
          draft.formulas.push(formula);
          if (s.independent) draft.clips.find((clip) => clip.id === s.clipId)!.formulaId = id;
        }
        if (formula?.kind !== s.original.kind) throw new Error('The text object no longer exists.');
        const sourceBefore = formula.source;
        if (sourceChanged || s.isNew) {
          if (s.draft.kind === 'tex') {
            // The intro goes through the rule that brings along the clips still at the previous
            // one; the rest of the draft is the object's own fields.
            const { intro, name, ...fields } = s.draft;
            const was = formula.intro;
            Object.assign(formula, fields);
            if (!fresh) formula.name = name;
            if (JSON.stringify(intro) !== JSON.stringify(was))
              introStayed = applyFormulaIntro(
                draft,
                id,
                intro,
                !!intro && !!was && intro.kind === was.kind,
              );
          } else Object.assign(formula, s.draft);
        }
        if (moved && s.placement) {
          const clip = draft.clips.find((c) => c.id === s.placement!.clipId)!;
          patchKeyframe(clip, s.placement.ref, { position: [...s.position] });
        }
        // Where the next clips of the object start; the clips it has keep their own.
        if (kept) setStartPosition(formula, s.position);
        if (s.paint?.edited && formula.kind === 'tex' && !isBlank(formula)) {
          // The paint counts by a render: it must be the render of the text as it is written
          // now, which then is the snapshot the project counts its glyphs by.
          if (paintIsBehind(s))
            throw new Error(
              'The glyph colours count by an earlier render of this text. Wait for its render, then apply again.',
            );
          const plan = planPaintCommit(s.paint, formula, formula.source !== sourceBefore);
          if (typeof plan === 'string') throw new Error(plan);
          if (plan.kind === 'snapshot') {
            if (plan.map) remapped = remapGlyphRefs(draft, id, plan.map, freed);
            formula.snapshot = plan.snapshot;
          }
          formula.glyphColors = plan.glyphColors;
          formula.hiddenGlyphs = plan.hiddenGlyphs;
          painted = plan;
          // Last operation, as below: whoever holds glyph indices of the old snapshot needs the
          // step before the project notifies, and a rejected recipe must publish none.
          if (plan.kind === 'snapshot' && plan.transition)
            useRenderStore.getState().setTransition(id, plan.transition);
        }
        if (prepared) {
          remapped = applyTextGeometryCommit(
            draft,
            id,
            prepared.stored.reference,
            prepared.plan,
            freed,
          );
          // Last operation: consumers need the transition before project notification, but
          // rejected recipes must never publish a transition for a change that did not happen.
          if (prepared.plan.transition)
            useRenderStore.getState().setTransition(id, prepared.plan.transition);
        }
      });
    }
  } catch (error) {
    compositionError(s.token, error);
    return null;
  }
  // How sure the step that carried the references of the project was, when there was one.
  const committed = painted as PaintCommit | null;
  const confidence =
    prepared?.plan.match?.confidence ??
    (committed?.kind === 'snapshot' && committed.map ? committed.confidence : null);
  if (confidence !== null && (confidence < 0.8 || droppedTotal(remapped))) {
    const warning = {
      ...remapped,
      cause: sourceChanged ? ('edit' as const) : ('rebase' as const),
      confidence,
    };
    useSyncWarnings.setState((state) => ({ warnings: { ...state.warnings, [id]: warning } }));
    notify({
      kind: 'warning',
      title: 'Review this text’s glyph references',
      message: `${describeWarning(warning)}. Review animation pairs, attachments and retained copy principals.`,
    });
  }
  introStayedNotice(s.draft.kind === 'tex' ? s.draft.name : s.original.name, introStayed);
  if (useTextComposition.getState().session?.token === s.token) {
    useTextComposition.getState().cancel();
    useUiStore
      .getState()
      .select(s.clipId ? { kind: 'clips', ids: [s.clipId] } : { kind: 'formula', id });
  }
  return id;
}

async function applyAppearance(s: TextCompositionSession, render: FormulaRender): Promise<boolean> {
  let stored: StoredTextGeometry | undefined;
  let published = false;
  try {
    if (s.original.kind !== 'text') throw new Error('Only a font text has a saved appearance.');
    let previous = useRenderStore.getState().resolved.get(s.original.id)?.render ?? null;
    if (previous?.key !== s.original.snapshot?.key && s.original.geometry) {
      try {
        previous = textArtifactRender(await loadTextGeometry(s.original.geometry));
      } catch {
        previous = null;
      } // Missing provenance is explicit conservative repair in the plan.
    }
    stored = await storeTextGeometry(render.text!);
    const current = useTextComposition.getState().session;
    if (!current || current.token !== s.token) return false;
    if (
      !current.refresh ||
      !sameTextDraft(current.draft, s.draft) ||
      !samePosition(current.position, s.position) ||
      current.keepPosition !== s.keepPosition ||
      current.independent !== s.independent
    )
      throw new Error('The draft changed while preparing its appearance. Apply again.');
    const conflict = compositionConflict(s);
    if (conflict) throw new Error(conflict);
    const plan = planTextGeometryCommit(s.original, previous, stored.artifact);
    if (commitComposition(s, { stored, plan }) === null) return false;
    published = true;
    try {
      await syncCurrentMediaOwnership();
      await stored.lease.release();
    } catch (error) {
      // The published reference must keep its temporary pin when durable ownership failed.
      notify({
        kind: 'warning',
        title: 'Text appearance applied; storage needs attention',
        message:
          'The prepared geometry remains protected. Save the project to a file before closing.',
        details: [error instanceof Error ? error.message : String(error)],
      });
    }
    return true;
  } catch (error) {
    compositionError(s.token, error);
    return false;
  } finally {
    if (stored && !published)
      await discardTextGeometry(stored).catch((error: unknown) => {
        notify({
          kind: 'warning',
          title: 'Could not discard temporary text geometry',
          message: String(error),
        });
      });
  }
}

/** `session`, whose paint has just reached a render, with the paint of the recovered draft in its
 * place when that is the render it counts by. The recovered paint waits for one render only: the
 * first after the recovery is the recovered draft's. */
function withRecoveredPaint(session: TextCompositionSession): TextCompositionSession {
  const { paint, recoveredPaint } = session;
  if (!paint || !recoveredPaint) return session;
  return {
    ...session,
    recoveredPaint: null,
    paint:
      recoveredPaint.key === paint.basis.render.key
        ? { ...paint, paint: recoveredPaint.paint, edited: true }
        : paint,
  };
}

export const useTextComposition = create<CompositionState>()((set, get) => ({
  session: null,
  open(formulaId, clipId, kind = 'text') {
    if (get().session) {
      blockTextCompositionCommand();
      return;
    }
    history.cancelGesture();
    mainPlayback.pause();
    const project = useProjectStore.getState().project;
    const original = formulaId
      ? project.formulas.find((f) => f.id === formulaId)
      : createEditorFormula(
          kind,
          project.formulas,
          usePreferences.getState().standardScale,
          {},
          getActivePalette()?.source.colors,
        );
    if (!isCompositionFormula(original)) return;
    const time = useUiStore.getState().time;
    const clip = clipId
      ? project.clips.find((c) => c.id === clipId && c.formulaId === original.id)
      : null;
    if (clipId && !clip) return;
    const edit = useTransformEdit.getState();
    const target = clip ? previewEdit(clip, time, edit.editing, edit.unlocked) : null;
    // Why the placement of the clip cannot be edited; a library session has no clip to place.
    let reason: string | null = null;
    if (clip && project.tracks.find((t) => t.id === clip.trackId)?.locked)
      reason = 'The selected track is locked. Source edits also respect every shared use.';
    else if (clip?.attach)
      reason = 'Attached object: detach explicitly before editing its free position.';
    else if (clip && partEditOf(clip, edit.editing))
      reason = 'A part transform is selected. Select the whole object state to edit placement.';
    else if (target && 'blocked' in target)
      reason =
        'Placement is locked after a transformation. Use its end-state icon to edit that state.';
    const pose = placementOf(
      target && !('blocked' in target)
        ? target.state
        : clip
          ? stateAt(clip, time, project.meta.target)
          : // The library: where the object keeps its new clips, upright and at its own size.
            { ...ORIGIN_PLACEMENT, position: startPositionOf(original) },
    );
    const placement =
      clip && !reason && target && !('blocked' in target)
        ? {
            clipId: clip.id,
            trackId: clip.trackId,
            ref: target.ref,
            original: pose,
          }
        : null;
    const doc = useDocumentStore.getState();
    const session: TextCompositionSession = {
      token: ++nextToken,
      document: doc.documentId,
      documentSession: doc.session,
      time,
      original,
      isNew: !formulaId,
      clipId: clip?.id ?? null,
      placement,
      placementReason: reason,
      draft: textDraftOf(original),
      position: [...pose.position],
      pose,
      keepPosition: !clip,
      independent: false,
      refresh: false,
      applying: false,
      composing: false,
      error: null,
      positions: [],
      futurePositions: [],
      paint: null,
      paintLost: false,
      recoveredPaint: null,
      recovery: null,
    };
    session.recovery = recovered(session);
    set({ session });
  },
  cancel() {
    if (!get().session) return;
    safeSession.setItem(RECOVERY, 'null');
    set({ session: null });
  },
  patch(patch) {
    const s = get().session;
    if (!s) return;
    const session = { ...s, draft: { ...s.draft, ...patch } as TextDraft, error: null };
    set({ session });
    remember(session);
  },
  setComposing(composing) {
    const s = get().session;
    if (!s) return;
    const session = { ...s, composing };
    set({ session });
    remember(session);
  },
  setPosition(position, record = true) {
    const s = get().session;
    if (!s || !position.every(Number.isFinite) || samePosition(s.position, position)) return;
    const session = {
      ...s,
      position: [...position] as Vec2,
      error: null,
      positions: record ? [...s.positions.slice(-99), s.position] : s.positions,
      futurePositions: record ? [] : s.futurePositions,
    };
    set({ session });
    remember(session);
  },
  setKeepPosition(keep) {
    const s = get().session;
    if (!s || s.clipId || s.keepPosition === keep) return;
    const session = { ...s, keepPosition: keep, error: null };
    set({ session });
    remember(session);
  },
  recordPosition(before) {
    const s = get().session;
    if (s && !samePosition(s.position, before))
      set({
        session: { ...s, positions: [...s.positions.slice(-99), before], futurePositions: [] },
      });
  },
  undoPosition(redo = false) {
    const s = get().session;
    if (!s) return;
    const stack = redo ? s.futurePositions : s.positions;
    const position = stack.at(-1);
    if (!position) return;
    const session = {
      ...s,
      position,
      positions: redo ? [...s.positions, s.position] : s.positions.slice(0, -1),
      futurePositions: redo ? s.futurePositions.slice(0, -1) : [...s.futurePositions, s.position],
    };
    set({ session });
    remember(session);
  },
  makeIndependent() {
    const s = get().session;
    if (!s?.clipId || s.isNew) return;
    const session = { ...s, independent: true, error: null };
    set({ session });
    remember(session);
  },
  refresh() {
    const s = get().session;
    if (s?.original.kind === 'text') set({ session: { ...s, refresh: true, error: null } });
  },
  cancelRefresh() {
    const s = get().session;
    if (s && !s.applying) set({ session: { ...s, refresh: false, error: null } });
  },
  recover() {
    const s = get().session;
    if (!s?.recovery) return;
    const { paint, ...kept } = s.recovery;
    set({ session: { ...s, ...kept, recoveredPaint: paint, recovery: null } });
  },
  startPaint(state) {
    const s = get().session;
    if (!s || s.original.kind !== 'tex' || s.paint?.edited) return;
    set({ session: withRecoveredPaint({ ...s, paint: state, paintLost: false }) });
  },
  followPaint(basis, match) {
    const s = get().session;
    if (!s?.paint) return;
    const session = match
      ? withRecoveredPaint({ ...s, paint: carryPaint(s.paint, basis, match) })
      : { ...s, paint: null, paintLost: true, recoveredPaint: null };
    set({ session });
    remember(session);
  },
  editPaint(change) {
    const s = get().session;
    if (!s?.paint) return;
    const session = {
      ...s,
      paint: { ...s.paint, paint: change(s.paint.paint), edited: true },
      recoveredPaint: null,
      error: null,
    };
    set({ session });
    remember(session);
  },
  apply(render) {
    const s = get().session;
    if (!s || s.composing || s.applying) return false;
    const error = compositionConflict(s);
    if (error) {
      set({ session: { ...s, error } });
      return false;
    }
    if (!s.refresh) return commitComposition(s) !== null;
    if (
      s.draft.kind !== 'text' ||
      !render?.exact ||
      !render.text ||
      !textBasisMatches(render.text.basis, {
        ...s.draft,
        target: useProjectStore.getState().project.meta.target,
      })
    ) {
      set({
        session: {
          ...s,
          error:
            'Wait for the refreshed Pango result, or cancel appearance refresh to keep the saved appearance.',
        },
      });
      return false;
    }
    set({ session: { ...s, applying: true, error: null } });
    return applyAppearance(s, render);
  },
}));

/** Drop the session with its document — the next one may reuse ids: nothing is written to it —
 * and when its text or its clip leaves the project (one of the app's services, `useAppServices`).
 * Returns the function that stops it. */
export function startTextCompositionTracking(): () => void {
  const drop = () => useTextComposition.setState({ session: null });
  const follow = (project: Project) => {
    const session = useTextComposition.getState().session;
    if (!session || session.isNew) return;
    const formula = project.formulas.find((item) => item.id === session.original.id);
    if (
      formula?.kind !== session.original.kind ||
      (session.clipId && !project.clips.some((clip) => clip.id === session.clipId))
    )
      drop();
  };
  const stops = [
    onDocumentReplaced(drop),
    useProjectStore.subscribe((state) => follow(state.project)),
  ];
  follow(useProjectStore.getState().project);
  return () => stops.forEach((stop) => stop());
}
