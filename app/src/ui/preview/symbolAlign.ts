/* Align by symbol: a two-click mode of the preview. The first click takes the symbol to align (a
 * glyph of formula B, the one that will move), the second the reference symbol (a glyph of
 * another formula, A, which stays): what moves is chosen first, then where it goes. A compass,
 * opened on the reference, then asks which of its edges, corners or its centre the symbol lands
 * on, and the whole of B moves so that it does (`glyphAlign.ts`): the keyframe a drag writes, one
 * undo step,
 * under the rules of `alignableSelection` (a formula that cannot be edited now stays, and a
 * notice says so). So does a formula that would not end up aligned: one placed by the glyphs it
 * hangs on, or one that is moving at that instant (`symbolHold.ts`). The store holds the mode;
 * the panel feeds it the clicks.
 *
 * The mode has two forms, by where the reference symbol is picked (`source`): on the formulas the
 * pointer reaches (Alt+G), or on those locked in the preview (Shift+Alt+G, `previewLock.ts`) —
 * the way to align a formula to a symbol of a locked one, which no click reaches otherwise. The
 * symbol to align, the first click, is always of a formula that is not locked: it is the one
 * that moves.
 *
 * Between two instants. The two symbols are measured at the playhead when the side is chosen,
 * which needs both formulas on screen then. Often they never are — a line of a derivation comes
 * in as the one before it leaves — so the symbol to move can be *kept* (G, in the reference
 * step): it is then measured as it is at the instant G was pressed, the playhead goes wherever
 * the reference is, and the move writes the keyframe in effect at the kept instant. Nothing else
 * of the timeline changes. What can go wrong with that is judged in `symbolHold.ts`: a symbol
 * that cannot be kept (a notice says why and G keeps nothing), and what moves beyond the
 * alignment once made (the closing notice lists it).
 *
 * The symbols are glyphs, not indices. Each is taken on a render of its formula (`revision`) and
 * followed from it: when the formula is rendered again — its source edited with the mode on —
 * the transition the render sync publishes says which index the glyph has now, and the mode goes
 * on with it; without one, or when the glyph is gone, the mode ends and says so
 * (`glyphPickStore.ts`, the rule of the glyphs picked with Alt). It ends with its clips and with
 * its document too. A service keeps the stored phase in step (`startSymbolAlignTracking`), and
 * every command reads it through `current()`, before any effect has run. */
import { create } from 'zustand';
import { TIME_EPSILON, type ClipId, type Project } from '../../model';
import { createEvaluator, type KeyframeRef } from '../../scene';
import { history, useProjectStore, useRenderStore, useUiStore } from '../../store';
import { listNames } from '../animations/attachNames';
import { partEditOf, previewEdit, useTransformEdit } from '../animations/transformEdit';
import { onDocumentReplaced } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { round6 } from '../time';
import { reportSkipped } from './alignActions';
import { geometryAt, geometryNow } from './geometry';
import { applyEdit } from './gesture';
import { glyphAlignDelta, type Direction } from './glyphAlign';
import type { PickRevision } from './glyphPick';
import { currentPickRevision, pickRebase, pickRevision } from './glyphPickStore';
import { previewEditableClips, previewLockedIds } from './previewLock';
import { endPreviewModes, registerPreviewMode } from './previewModes';
import {
  alignRefusal,
  alignSummary,
  alignWarnings,
  nearestOnScreen,
  refusalNotice,
  seconds,
  type AlignRefusal,
  type EditRights,
  type Named,
  type SymbolHold,
} from './symbolHold';

/** A glyph the user clicked. Its box is measured when the direction is chosen, where the glyph
 * is at the playhead then (`geometry.ts`): the playhead may move between the clicks. The symbol
 * to align is measured at the instant it was kept at instead, when it was (`SymbolHold`). */
export interface PickedGlyph {
  clipId: ClipId;
  glyph: number;
  /** The drawable's key, to outline it. */
  key: string;
  /** The glyph's label ("=", "x"), for the hint and the compass. */
  label: string;
  /** The render of its formula `glyph` is an index of: what the glyph is followed from when the
   * formula is rendered again. */
  revision: PickRevision;
}

/** A glyph as a click reports it: of the render the pointer hit, when the click says which
 * (`revision`), else of its formula as it is now. */
export type ClickedGlyph = Omit<PickedGlyph, 'revision'> & { revision?: PickRevision };

/** The steps of the mode, in their order: the symbol to align (`target`, of the formula that
 * moves), the reference it goes to, and the side of the reference it lands on. `held` is the
 * instant the symbol to align was kept at (G), or null: measured at the playhead. */
export type SymbolAlignPhase =
  | { step: 'target' }
  | { step: 'reference'; target: PickedGlyph; held: SymbolHold | null }
  | {
      step: 'direction';
      reference: PickedGlyph;
      target: PickedGlyph;
      held: SymbolHold | null;
      /** Where the compass opens (on the reference): CSS px from the preview frame's corner. */
      at: { x: number; y: number };
    };

/** Where the reference symbol is picked: on the formulas that are not locked in the preview, or
 * on the locked ones. */
export type SymbolSource = 'unlocked' | 'locked';

interface SymbolAlignState {
  phase: SymbolAlignPhase | null;
  /** The form of the mode that is on, or was on last. */
  source: SymbolSource;
  /** Enter the mode in a form (or leave it when that form is on: the shortcut toggles; the
   * other form's shortcut starts over in its form). */
  toggle(source?: SymbolSource): void;
  cancel(): void;
  /** The phase with its symbols as their formulas number them now. The mode ends when one of
   * them cannot be followed: without a word when its clip or its document went, with a notice
   * when its formula was rendered again and the glyph is gone, or nothing tells where it went. */
  current(): SymbolAlignPhase | null;
  /** A click on a glyph: the symbol to align first, then the reference. A reference on the
   * formula that moves is ignored; so is one picked where the symbol to align is not on screen
   * and was not kept (a notice says that G keeps it), and a glyph of a render its formula no
   * longer has. */
  pick(glyph: ClickedGlyph, at: { x: number; y: number }): void;
  /** G, in the reference step: keep the symbol to align as it is at the playhead, or let it go
   * when it is kept. A symbol that cannot be aligned as it is now is not kept, and a notice says
   * why (`symbolHold.ts`). */
  hold(): void;
  /** The chosen direction: move formula B and leave the mode. Whether it moved. */
  apply(direction: Direction): boolean;
}

export const useSymbolAlign = create<SymbolAlignState>()((set, get) => ({
  phase: null,
  source: 'unlocked',
  toggle: (source = 'unlocked') => {
    const current = get();
    if (current.phase && current.source === source) {
      set({ phase: null });
      return;
    }
    endPreviewModes('symbol');
    set({ phase: { step: 'target' }, source });
  },
  cancel: () => set({ phase: null }),
  current: () => {
    const { phase } = get();
    if (!phase) return null;
    const next = followPhase(phase);
    if ('ended' in next) {
      set({ phase: null });
      if (next.ended !== 'owner')
        notify({
          kind: 'warning',
          title: 'Align by symbol ended',
          message:
            (next.ended === 'gone'
              ? `“${next.label}” is no longer in its formula.`
              : 'The formula changed without a matching glyph transition.') +
            ' Start again and pick its symbol.',
        });
      return null;
    }
    if (next !== phase) set({ phase: next });
    return next;
  },
  pick: (clicked, at) => {
    const phase = get().current();
    if (!phase || phase.step === 'direction') return;
    // A click on a render its formula no longer has names a glyph by an index of the past.
    const revision = pickRevision(clicked.clipId);
    if (!revision) return;
    if (clicked.revision && !currentPickRevision(clicked.clipId, clicked.revision)) return;
    const glyph: PickedGlyph = { ...clicked, revision };
    if (phase.step === 'target') {
      set({ phase: { step: 'reference', target: glyph, held: null } });
      return;
    }
    if (glyph.clipId === phase.target.clipId) return;
    if (!phase.held && !onScreenNow(phase.target)) {
      // The formula to move is not here, and nothing remembers where its symbol was.
      notify({ kind: 'warning', ...forgottenNotice(phase.target) });
      return;
    }
    const { target, held } = phase;
    set({ phase: { step: 'direction', reference: glyph, target, held, at } });
  },
  hold: () => {
    const phase = get().current();
    if (!phase || phase.step !== 'reference') return;
    if (phase.held) {
      set({ phase: { ...phase, held: null } });
      return;
    }
    const { project } = useProjectStore.getState();
    const { time } = useUiStore.getState();
    const { editing, unlocked } = useTransformEdit.getState();
    const { target } = phase;
    const clip = project.clips.find((c) => c.id === target.clipId);
    // The end state under edit on this formula is what would move: it is kept with the instant.
    const own = editing && editing.clipId === target.clipId ? editing : null;
    const refusal: AlignRefusal | null =
      clip && onScreenNow(target)
        ? alignRefusal(project, clip, target.glyph, time, { editing: own, unlocked })
        : { kind: 'off-screen' };
    if (refusal) {
      const host = refusal.kind === 'attached' ? hostName(project, refusal.to) : undefined;
      notify({
        kind: 'warning',
        ...refusalNotice(refusal, 'keep', named(project, target), time, host),
      });
      return;
    }
    set({ phase: { ...phase, held: { at: time, editing: own } } });
  },
  apply: (direction) => {
    // The direction is a key: it can come during a drag, and what is measured is where the
    // symbols are without it (`history.cancelForeignGesture`).
    history.cancelForeignGesture();
    const phase = get().current();
    set({ phase: null });
    if (!phase || phase.step !== 'direction') return false;
    const { project } = useProjectStore.getState();
    const { time } = useUiStore.getState();
    const { held } = phase;
    const evaluator = createEvaluator(project, useRenderStore.getState().resolved);
    // The reference where it is now; the symbol to align where it was kept, or now too.
    const now = geometryAt(evaluator, time);
    const then = held ? geometryAt(evaluator, held.at) : now;
    const reference = now.get(phase.reference.clipId)?.glyphs.get(phase.reference.glyph);
    const target = then.get(phase.target.clipId)?.glyphs.get(phase.target.glyph);
    if (!target) {
      notify(
        held
          ? {
              kind: 'warning',
              title: 'Nothing to align',
              message:
                `“${phase.target.label}” is no longer there at ${seconds(held.at)}, the time ` +
                'it was kept at.',
            }
          : { kind: 'warning', ...forgottenNotice(phase.target) },
      );
      return false;
    }
    if (!reference) {
      notify({
        kind: 'warning',
        title: 'Nothing to align',
        message: 'The reference symbol is no longer on screen at the playhead.',
      });
      return false;
    }
    const { editing, unlocked } = useTransformEdit.getState();
    const at = held ? held.at : time;
    const rights = { editing: held ? held.editing : editing, unlocked };
    // A formula placed by what it hangs on, or one that is moving at that instant, would not end
    // up aligned whatever is written: it stays, and a notice says why. (One that is locked stays
    // too, with the notice of every alignment: `moveBySymbol`.)
    const moving = project.clips.find((c) => c.id === phase.target.clipId);
    const refusal = moving && alignRefusal(project, moving, phase.target.glyph, at, rights);
    if (refusal && (refusal.kind === 'attached' || refusal.kind === 'moving')) {
      const host = refusal.kind === 'attached' ? hostName(project, refusal.to) : undefined;
      notify({
        kind: 'warning',
        ...refusalNotice(refusal, 'align', named(project, phase.target), at, host),
      });
      return false;
    }
    const delta = glyphAlignDelta(reference, target, direction);
    const result = moveBySymbol(phase.target.clipId, delta, at, rights);
    if (!result) return false;
    // Between two instants, what was done may not show at the playhead: a notice says it, with
    // what moves beyond it.
    if (held && Math.abs(held.at - time) > TIME_EPSILON) {
      const moved = { ...named(project, phase.target), at };
      const origin = { ...named(project, phase.reference), at: time };
      if (!result.moved) {
        notify({
          kind: 'info',
          title: 'Nothing moved',
          message: `${alignSummary(moved, origin, direction).message} It already was.`,
        });
        return false;
      }
      const clip = project.clips.find((c) => c.id === phase.target.clipId)!;
      const referenceClip = project.clips.find((c) => c.id === phase.reference.clipId);
      const near = referenceClip ? nearestOnScreen(referenceClip, at, evaluator.duration) : time;
      const nearBox =
        geometryAt(evaluator, near)
          .get(phase.reference.clipId)
          ?.glyphs.get(phase.reference.glyph) ?? null;
      const details = alignWarnings({
        ...moved,
        clip,
        glyph: phase.target.glyph,
        ref: result.ref,
        reference: { ...origin, box: reference, near, nearBox },
      });
      notify({
        kind: details.length > 0 ? 'warning' : 'info',
        ...alignSummary(moved, origin, direction),
        ...(details.length > 0 ? { details } : {}),
      });
    }
    return result.moved;
  },
}));

registerPreviewMode(
  'symbol',
  () => {
    if (useSymbolAlign.getState().phase) useSymbolAlign.getState().cancel();
  },
  () => useSymbolAlign.getState().phase !== null,
);

/** A symbol the mode took, as its formula numbers it now, or why it cannot be followed: its
 * `owner` went (the clip, its formula, the document), its formula was rendered again and nothing
 * tells where the glyph went (`unverified`), or the glyph is `gone` from it. */
function followed(glyph: PickedGlyph): PickedGlyph | 'owner' | 'unverified' | 'gone' {
  const rebase = pickRebase(glyph.clipId, glyph.revision);
  if (rebase.kind === 'same') return glyph;
  if (rebase.kind === 'lost') return rebase.unverified ? 'unverified' : 'owner';
  const now = rebase.map[glyph.glyph] ?? null;
  if (now === null) return 'gone';
  // The key of a glyph's drawable starts with its clip and its index (scene/evaluator.ts); a
  // piece of a Morph adds a mark after them, which stays.
  const before = `${glyph.clipId}:${glyph.glyph}`;
  const rest = glyph.key.startsWith(before) ? glyph.key.slice(before.length) : null;
  const key = rest !== null && !/^\d/.test(rest) ? `${glyph.clipId}:${now}${rest}` : glyph.key;
  return { ...glyph, glyph: now, key, revision: rebase.revision };
}

/** `phase` with each of its symbols followed (the same object when none moved), or what ends
 * the mode and the label of the symbol that did. */
function followPhase(
  phase: SymbolAlignPhase,
): SymbolAlignPhase | { ended: 'owner' | 'unverified' | 'gone'; label: string } {
  if (phase.step === 'target') return phase;
  const target = followed(phase.target);
  if (typeof target === 'string') return { ended: target, label: phase.target.label };
  if (phase.step === 'reference') return target === phase.target ? phase : { ...phase, target };
  const reference = followed(phase.reference);
  if (typeof reference === 'string') return { ended: reference, label: phase.reference.label };
  return target === phase.target && reference === phase.reference
    ? phase
    : { ...phase, target, reference };
}

/** Keep the symbols of the mode on their glyphs as the project and the renders change, and end
 * the mode with its document: one of the sessions that end with it
 * (`ui/project/sessionTracking.ts`). Returns the function that stops it. */
export function startSymbolAlignTracking(): () => void {
  const follow = () => {
    useSymbolAlign.getState().current();
  };
  const stops = [
    useProjectStore.subscribe(follow),
    useRenderStore.subscribe(follow),
    onDocumentReplaced(() => useSymbolAlign.getState().cancel()),
  ];
  follow();
  return () => stops.forEach((stop) => stop());
}

/** A formula and its symbol, as the notices name them. */
function named(project: Project, glyph: PickedGlyph): Named {
  const clip = project.clips.find((c) => c.id === glyph.clipId);
  const formula = project.formulas.find((f) => f.id === clip?.formulaId);
  return { name: formula?.name ?? 'Formula', label: glyph.label };
}

/** What an attached formula hangs on, as a notice names it: the object of each of its clips. */
function hostName(project: Project, clipIds: readonly ClipId[]): string | undefined {
  const names = clipIds.flatMap((clipId) => {
    const clip = project.clips.find((c) => c.id === clipId);
    const formula = project.formulas.find((f) => f.id === clip?.formulaId);
    return formula ? [`“${formula.name}”`] : [];
  });
  return names.length > 0 ? listNames([...new Set(names)]) : undefined;
}

/** Whether the glyph can be measured at the playhead: its clip is on screen and has it. */
function onScreenNow(glyph: PickedGlyph): boolean {
  return geometryNow().get(glyph.clipId)?.glyphs.has(glyph.glyph) ?? false;
}

/** The symbol to align is not on screen at the playhead and was not kept: the mode cannot tell
 * where it was. The notice reminds what keeps it. */
function forgottenNotice(target: PickedGlyph): { title: string; message: string } {
  const { project } = useProjectStore.getState();
  const { name, label } = named(project, target);
  return {
    title: `“${label}” is not on screen at ${seconds(useUiStore.getState().time)}`,
    message:
      `To align “${name}” with a symbol at another time, press G after clicking its symbol and ` +
      'before moving the playhead: G remembers where the symbol is at that time. Go back to ' +
      `“${name}”, press G, then come back and click the reference.`,
  };
}

/** Move the keyframe of the clip in effect at `at` by `delta`, when it can be edited then;
 * select the clip. The keyframe written and whether it moved (the symbols may already line up),
 * or null when the clip stayed (a notice said so). */
function moveBySymbol(
  clipId: ClipId,
  delta: [number, number],
  at: number,
  rights: EditRights,
): { ref: KeyframeRef; moved: boolean } | null {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return null;
  const { editing, unlocked } = rights;
  const editable = previewEditableClips(project, [clipId]).length === 1;
  const edit = previewEdit(clip, at, editing, unlocked);
  if (!editable || partEditOf(clip, editing) || 'blocked' in edit) {
    reportSkipped([clip]);
    return null;
  }
  useUiStore.getState().select({ kind: 'clips', ids: [clipId] });
  if (delta[0] === 0 && delta[1] === 0) return { ref: edit.ref, moved: false };
  useProjectStore.getState().update((draft) => {
    const target = draft.clips.find((c) => c.id === clipId);
    if (!target) return;
    const current = previewEdit(target, at, editing, unlocked);
    if ('blocked' in current) return;
    const [x, y] = current.state.position;
    applyEdit(target, current, { position: [round6(x + delta[0]), round6(y + delta[1])] });
  });
  return { ref: edit.ref, moved: true };
}

/** What the preview's hint says in each step. `onScreen`: whether the symbol to align can be
 * measured at the playhead (it cannot once its formula has left the screen). */
export function symbolAlignHint(
  phase: SymbolAlignPhase | null,
  source: SymbolSource = 'unlocked',
  onScreen = true,
): string | null {
  if (!phase) return null;
  if (phase.step === 'target')
    return 'Align by symbol: click the symbol to move (or arrows and Enter) · Shift+wheel sets the reach · Esc cancels';
  if (phase.step === 'reference') {
    const { label } = phase.target;
    const where = source === 'locked' ? 'on a locked formula' : 'on another formula';
    if (phase.held)
      return `“${label}” kept as at ${seconds(phase.held.at)} · go to another time and click (or arrow to) the reference symbol ${where} · G lets it go · Esc cancels`;
    if (!onScreen)
      return `“${label}” is not on screen at this time: go back to it and press G to keep it as it is there · Esc cancels`;
    return `Now click (or arrow to) the reference symbol ${where}: “${label}” goes to it · G keeps “${label}” as it is now, for a reference at another time · Esc cancels`;
  }
  return null;
}

/** Shift+Alt+G: align by symbol with the reference on a formula locked in the preview (or leave
 * that form of the mode). With no locked formula there would be nothing to click: a notice says
 * how one is locked instead. */
export function toggleLockedSymbolAlign(): void {
  const state = useSymbolAlign.getState();
  const on = state.phase !== null && state.source === 'locked';
  if (!on && previewLockedIds(useProjectStore.getState().project).size === 0) {
    notify({
      kind: 'info',
      title: 'No formula is locked in the preview',
      message:
        'Lock one from the menu of its clip on the timeline (Lock in the preview): this takes ' +
        'the reference symbol from a locked formula.',
    });
    return;
  }
  state.toggle('locked');
}
