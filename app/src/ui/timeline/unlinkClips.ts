/* Unlink formula (make a copy): clips of a formula that has other clips leave it for a copy of it,
 * made as the Creator's Duplicate makes it, so that editing either formula no longer changes the
 * clips of the other. Pure: which formulas a selection of clips copies and which clips go to each
 * copy, how the clips are moved, and what the menus say. The command is `unlinkClipsById`
 * (`clipActions.ts`).
 *
 * The copy has its original's snapshot, so every canonical glyph index stays what it was, and
 * everything else of a clip names clips, not formulas — its blocks, its glyph colours, the pairs
 * of its relations as source or as target, the objects attached to it or to its glyphs, its
 * groups of blocks —: moving a clip is changing its `formulaId`, and nothing else. */
import { KINDS, type ClipId, type Formula, type FormulaId, type Project } from '../../model';

/** Whether the clips of `formula` can be unlinked from it: those of an object the Creator lists
 * (a formula, a LaTeX text, a font text), which is what Duplicate copies. A brace, a shape or a
 * line lives with its clips, out of the Creator's list: its menus have no such entry. */
export function unlinks(formula: Pick<Formula, 'kind'>): boolean {
  return KINDS[formula.kind].listed;
}

/** The clips that leave one formula for one copy of it, which they share. */
export interface UnlinkMove {
  formulaId: FormulaId;
  /** In the project's order. */
  clipIds: ClipId[];
}

/** What unlinking a selection of clips does. */
export interface UnlinkPlan {
  /** The clips of `ids` that are of an object that can be unlinked (`unlinks`), in the project's
   * order: none, and the menus have no entry. */
  candidates: ClipId[];
  /** One per formula that gets a copy, in the order of the project's formulas. */
  moves: UnlinkMove[];
  /** Candidates on a locked track: they stay with their formula. */
  locked: ClipId[];
}

/** What unlinking the clips `ids` does: the candidates on unlocked tracks leave their formula for
 * one copy of it, shared by those of the same formula, when the formula keeps a clip of its own —
 * one not among them: not selected, or on a locked track. A formula's only clip, or all of its
 * clips together, have nothing to be unlinked from. Ids that are not clips of the project (a
 * sound, one that is gone) are left out. */
export function planUnlink(project: Project, ids: readonly ClipId[]): UnlinkPlan {
  const named = new Set(ids);
  const formulas = new Map(project.formulas.map((f) => [f.id, f]));
  const lockedTracks = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  const candidates = project.clips.filter((clip) => {
    const formula = formulas.get(clip.formulaId);
    return named.has(clip.id) && formula !== undefined && unlinks(formula);
  });
  const locked = candidates.filter((clip) => lockedTracks.has(clip.trackId));
  const moving = new Set(
    candidates.filter((clip) => !lockedTracks.has(clip.trackId)).map((clip) => clip.id),
  );
  const clipsOf = new Map<FormulaId, ClipId[]>();
  for (const clip of project.clips) {
    clipsOf.set(clip.formulaId, [...(clipsOf.get(clip.formulaId) ?? []), clip.id]);
  }
  const moves: UnlinkMove[] = [];
  for (const formula of project.formulas) {
    const clips = clipsOf.get(formula.id) ?? [];
    const leaving = clips.filter((id) => moving.has(id));
    if (leaving.length > 0 && leaving.length < clips.length) {
      moves.push({ formulaId: formula.id, clipIds: leaving });
    }
  }
  return {
    candidates: candidates.map((clip) => clip.id),
    moves,
    locked: locked.map((clip) => clip.id),
  };
}

/** Inside a project update: the clips of each move go to the copy of their formula (`copies`:
 * original id → copy, already in the project). A move whose copy is not given stays. */
export function moveToCopies(
  draft: Project,
  moves: readonly UnlinkMove[],
  copies: ReadonlyMap<FormulaId, Pick<Formula, 'id'>>,
): void {
  for (const move of moves) {
    const copy = copies.get(move.formulaId);
    if (!copy) continue;
    const leaving = new Set(move.clipIds);
    for (const clip of draft.clips) if (leaving.has(clip.id)) clip.formulaId = copy.id;
  }
}

/** “f1”: the name of a formula as the menus quote it. */
const quoted = (project: Project, id: FormulaId) =>
  `“${project.formulas.find((f) => f.id === id)?.name ?? '?'}”`;

/** The entry of the menus: its text, and its tooltip — what it does, or why it is off. */
export interface UnlinkEntry {
  label: string;
  title: string;
  disabled: boolean;
}

/** The entry for `plan`: in the menu of one clip (`scope` 'clip': the clip's own entries, on the
 * timeline and in the preview) or in the menu of the selected clips ('selection'). Null when that
 * menu has none: no clip of an object that can be unlinked. */
export function unlinkEntry(
  project: Project,
  plan: UnlinkPlan,
  scope: 'clip' | 'selection',
): UnlinkEntry | null {
  const { candidates, moves, locked } = plan;
  if (candidates.length === 0) return null;
  const own = scope === 'clip';
  const label =
    moves.length > 1
      ? `Unlink formulas (make ${moves.length} copies)`
      : 'Unlink formula (make a copy)';
  if (moves.length === 0) {
    // The clips that could move are all the clips of their formulas: a clip of the same formula
    // on a locked track would have stayed, and they would have moved away from it.
    const free = candidates.filter((id) => !locked.includes(id));
    const ofFree = new Set(
      project.clips.filter((clip) => free.includes(clip.id)).map((clip) => clip.formulaId),
    );
    const single = ofFree.size === 1 ? quoted(project, [...ofFree][0]!) : null;
    const title =
      free.length === 0
        ? own
          ? 'The clip is on a locked track.'
          : locked.length === 1
            ? 'The selected clip is on a locked track.'
            : 'The selected clips are on locked tracks.'
        : (free.length === 1
            ? `${single} has no other clip: there is nothing to unlink ${own ? 'this clip' : 'it'} from.`
            : `These are all the clips of ${single ?? 'their formulas'}: there is nothing to unlink them from.`) +
          (locked.length > 0 ? ' The others are on locked tracks.' : '');
    return { label, title, disabled: true };
  }
  const names = moves.map((move) => quoted(project, move.formulaId));
  const clips = moves[0]!.clipIds.length;
  const what = own
    ? `This clip gets a copy of ${names[0]} of its own, a new formula in the Creator.`
    : moves.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)} get a copy each, which their selected clips share: new formulas in the Creator.`
      : clips === 1
        ? `The selected clip of ${names[0]} gets a copy of it of its own, a new formula in the Creator.`
        : `The ${clips} selected clips of ${names[0]} share one copy of it, a new formula in the Creator.`;
  const stays =
    locked.length === 0
      ? ''
      : locked.length === 1
        ? ' A selected clip on a locked track keeps its formula.'
        : ` ${locked.length} selected clips on locked tracks keep their formula.`;
  return {
    label,
    title: `${what} Editing a formula or its copy no longer changes the clips of the other.${stays}`,
    disabled: false,
  };
}
