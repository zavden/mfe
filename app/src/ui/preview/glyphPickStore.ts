/* The preview pick owns one document, and each of its parts a formula and a canonical snapshot.
 * While the app runs, a service reconciles it synchronously with the stores
 * (`startGlyphPickTracking`); commands also resolve it directly, before any React effect. */
import { create } from 'zustand';
import { remapIndices } from '../../model';
import {
  onProjectLoaded,
  projectLoads,
  useProjectStore,
  useRenderStore,
  useUiStore,
} from '../../store';
import { useDocumentStore } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { transitionFor } from '../relations/pairDraft';
import { prunePick, samePick, type GlyphPick, type PickPart, type PickRevision } from './glyphPick';

interface GlyphPickState {
  pick: GlyphPick | null;
  set(pick: GlyphPick | null): void;
  /** The pick in the current canonical index space, or null if ownership was lost. */
  current(): GlyphPick | null;
  clear(): void;
}

/** Capture the index space of a pointer press, including one that has no selection yet. Its
 * document is the count of projects loaded (`projectLoads`): a project that takes the place of
 * this one is another document from the first moment the stores show it, whatever its ids. */
export function pickRevision(clipId: string): PickRevision | null {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = project.formulas.find((f) => f.id === clip?.formulaId);
  return formula
    ? {
        document: projectLoads(),
        session: useDocumentStore.getState().session,
        formulaId: formula.id,
        key: formula.snapshot?.key ?? null,
      }
    : null;
}

export function currentPickRevision(clipId: string, revision: PickRevision | null): boolean {
  const now = pickRevision(clipId);
  return (
    !!now &&
    !!revision &&
    now.document === revision.document &&
    now.session === revision.session &&
    now.formulaId === revision.formulaId &&
    now.key === revision.key
  );
}

/** How glyph indices taken at a revision are read now: in the same index space, through the map
 * of a verified transition (`map[before]` is the index now, or null for a glyph that is gone), or
 * not at all — the owner was lost: another document or session, another formula on the clip, or
 * (`unverified`) a render of the formula that no transition leads to. */
export type PickRebase =
  | { kind: 'same'; revision: PickRevision }
  | { kind: 'moved'; revision: PickRevision; map: readonly (number | null)[] }
  | { kind: 'lost'; unverified: boolean };

/** What became of the index space `before`, captured on clip `clipId` (`pickRevision`). */
export function pickRebase(clipId: string, before: PickRevision | null | undefined): PickRebase {
  const now = pickRevision(clipId);
  if (
    !now ||
    !before ||
    now.document !== before.document ||
    now.session !== before.session ||
    now.formulaId !== before.formulaId
  )
    return { kind: 'lost', unverified: false };
  if (now.key === before.key) return { kind: 'same', revision: now };
  const transition = transitionFor(
    useRenderStore.getState().transitions,
    now.formulaId,
    before.key,
    now.key,
  );
  return transition
    ? { kind: 'moved', revision: now, map: transition.map }
    : { kind: 'lost', unverified: true };
}

/** A part in the current canonical index space of its formula, or null if it lost its owner:
 * another document or session, another formula on its clip, or a render no transition leads to
 * (a notice says so). */
function resolvePart(part: PickPart): PickPart | null {
  const rebase = pickRebase(part.clipId, part.revision);
  if (rebase.kind === 'same') return part;
  if (rebase.kind === 'lost') {
    if (rebase.unverified)
      notify({
        kind: 'warning',
        title: 'Glyph selection cleared',
        message: 'The formula changed without a matching glyph transition. Pick its glyphs again.',
      });
    return null;
  }
  const { map, revision } = rebase;
  const anchor = part.selection.anchor;
  return {
    ...part,
    revision,
    selection: {
      selected: new Set(remapIndices([...part.selection.selected], map).kept),
      anchor: anchor === null ? null : (map[anchor] ?? null),
    },
  };
}

/** The pick in the current index space of each of its formulas, or null: a part that lost its
 * owner takes the whole pick with it, as a part without a glyph left does (`prunePick`). */
export function resolveGlyphPick(pick: GlyphPick | null): GlyphPick | null {
  if (!pick) return null;
  const parts: PickPart[] = [];
  for (const part of pick.parts) {
    const next = resolvePart(part);
    if (!next) return null;
    parts.push(next);
  }
  const next = parts.every((part, index) => part === pick.parts[index]) ? pick : { parts };
  return prunePick(next, useProjectStore.getState().project, useUiStore.getState().selection);
}

export const useGlyphPick = create<GlyphPickState>()((set, get) => ({
  pick: null,
  set: (pick) => {
    // A part that comes without an owner is of its formula as it is now.
    const parts = pick?.parts.map((part) => ({
      ...part,
      revision: part.revision ?? pickRevision(part.clipId) ?? undefined,
    }));
    const next = resolveGlyphPick(parts ? { parts } : null);
    if (!samePick(get().pick, next)) set({ pick: next });
  },
  current: () => {
    const next = resolveGlyphPick(get().pick);
    if (!samePick(get().pick, next)) set({ pick: next });
    return next;
  },
  clear: () => {
    if (get().pick) set({ pick: null });
  },
}));

/** Keep the pick in step with the project, the renders and the selection, and drop it with its
 * document (one of the app's services, `useAppServices`). Returns the function that stops it. */
export function startGlyphPickTracking(): () => void {
  const follow = () => {
    useGlyphPick.getState().current();
  };
  const clear = () => useGlyphPick.getState().clear();
  const stops = [
    useProjectStore.subscribe(follow),
    useRenderStore.subscribe(follow),
    useUiStore.subscribe(follow),
    useDocumentStore.subscribe((state, before) => {
      if (state.session !== before.session) clear();
    }),
    onProjectLoaded(clear),
  ];
  follow();
  return () => stops.forEach((stop) => stop());
}
