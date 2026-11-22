/* The word a clip that starts empty gets when an edit takes away what filled it (D166). Such a
 * clip (`Clip.startsEmpty`) shows only what a relation, a Morph block or an Appear block brings:
 * remove its relations, delete the clip they came from or the block that wrote its glyphs, and it
 * is still on the timeline but never on screen. The clip's panel says so (a warning); this
 * says it when it happens, in a notice, and leaves the mark alone: taking it off is the user's
 * call (the relation may be on its way back).
 *
 * `clipsLeftEmpty` is pure; `startStartsEmptyNotice` is one of the app's services
 * (`project/useAppServices.ts`). */
import { clipLifetimes, TIME_EPSILON, type ClipId, type Project } from '../../model';
import { projectLoads, useProjectStore } from '../../store';
import { notify } from '../project/noticeStore';

/** The clips of `project` that start empty, by whether anything of theirs ever shows: `filled`
 * have a glyph on screen at some time — with when the first of them comes on screen —, `unfilled`
 * have glyphs and none ever is. A clip whose formula has no glyphs yet (not rendered) is neither. */
function startingEmpty(project: Project): {
  filled: Map<ClipId, number>;
  unfilled: Set<ClipId>;
} {
  const filled = new Map<ClipId, number>();
  const unfilled = new Set<ClipId>();
  if (!project.clips.some((clip) => clip.startsEmpty)) return { filled, unfilled };
  const lifetimes = clipLifetimes(project);
  for (const clip of project.clips) {
    if (!clip.startsEmpty) continue;
    const life = lifetimes.get(clip.id);
    if (!life || life.glyphs.length === 0) continue;
    const enters = [...life.stints.values()].flat().map((stint) => stint.enter.start);
    if (enters.length > 0) filled.set(clip.id, Math.min(...enters));
    else unfilled.add(clip.id);
  }
  return { filled, unfilled };
}

/** The clips the change from `before` to `after` left empty: they started empty and showed
 * something before it, and still start empty but show nothing after it. In the project's order.
 * Ticking "Starts empty" on a clip nothing fills is not one of them (the clip did not start
 * empty before), nor is a clip that was deleted, nor one that now ends before anything of it came
 * on screen (A2-01): it did not lose what filled it, it was cut short before that came — the first
 * half of a split, which leaves it to the second, or a trim. */
export function clipsLeftEmpty(before: Project, after: Project): ClipId[] {
  const now = startingEmpty(after).unfilled;
  if (now.size === 0) return [];
  const was = startingEmpty(before).filled;
  return after.clips
    .filter((clip) => {
      const first = was.get(clip.id);
      return now.has(clip.id) && first !== undefined && first < clip.end - TIME_EPSILON;
    })
    .map((clip) => clip.id);
}

/** The notice for the clips an edit left empty. */
export function leftEmptyNotice(
  project: Project,
  clipIds: readonly ClipId[],
): { title: string; message: string } {
  const names = clipIds.map((id) => {
    const clip = project.clips.find((c) => c.id === id);
    return `“${project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? '?'}”`;
  });
  const one = names.length === 1;
  const who =
    names.length <= 2
      ? names.join(' and ')
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return {
    title: `${who} ${one ? 'starts' : 'start'} empty and nothing fills ${one ? 'it' : 'them'} now`,
    message: `${one ? 'It' : 'They'} will not show. Relate ${one ? 'it' : 'them'} again, add an Appear block, or untick “Starts empty” in ${one ? 'its' : 'their'} Intro (Animations ▸ Timing).`,
  };
}

/** Say so when an edit leaves a clip that starts empty with nothing to show. Another document is
 * not an edit of the one before it. A project that cannot be read at all (broken behind the
 * store's back) is not this service's to report: what it throws would reach whoever wrote to the
 * store, and the editor's own crash screen is what tells the user. Returns the function that
 * stops it. */
export function startStartsEmptyNotice(): () => void {
  let loads = projectLoads();
  return useProjectStore.subscribe((state, previous) => {
    if (state.project === previous.project) return;
    if (projectLoads() !== loads) {
      loads = projectLoads();
      return;
    }
    let left: ClipId[];
    try {
      left = clipsLeftEmpty(previous.project, state.project);
    } catch {
      return;
    }
    if (left.length > 0) notify({ kind: 'warning', ...leftEmptyNotice(state.project, left) });
  });
}
