/* Groups of animation blocks (format 19). The blocks of a clip that carry the same `group` are
 * one thing on the timeline, like the animations of Manim's `AnimationGroup`: they start together
 * and last the same, each with its own animation, glyphs and options. The rule of a group is that
 * and nothing else — at least two blocks of one clip, one start, one duration; what its members
 * may animate at the same time is the rule of any two blocks (`conflicts.ts`).
 *
 * A group is only a mark on its blocks: the engine, the lifetimes and the export read the blocks
 * as they always did (blocks that run together are one `self.play` already). What the mark
 * changes is the editor: the timeline draws a group as one block and moves it as one.
 *
 * A block that no longer runs with its group leaves it (`repairClipGroups`); the project store
 * applies that after every edit, and the loader to a file, so a project never holds a group that
 * breaks the rule. */
import { TIME_EPSILON } from './time';
import type {
  ActionId,
  AppearAction,
  Clip,
  ClipAction,
  DisappearAction,
  EmphasisAction,
  GroupId,
  PartTransformAction,
  Project,
} from './types';

/** The blocks that can be in a group: those that name glyphs. A keyframe takes the whole formula,
 * so no block that animates glyphs runs with it. A morph names pairs, not glyphs: it keeps busy
 * only the glyphs of its pairs (`lifetime.ts`), and blocks on other glyphs may run beside it, but
 * it is not grouped either. */
export type GroupableAction = AppearAction | DisappearAction | PartTransformAction | EmphasisAction;

export function isGroupable(action: ClipAction): action is GroupableAction {
  return (
    action.kind === 'appear' ||
    action.kind === 'disappear' ||
    action.kind === 'transform' ||
    action.kind === 'emphasis'
  );
}

/** The group a block is in, if any. */
export function groupOf(action: ClipAction): GroupId | undefined {
  return isGroupable(action) ? action.group : undefined;
}

/** Whether two blocks start together and last the same: what lets them be one group. */
export function sameSpan(
  a: { start: number; duration: number },
  b: { start: number; duration: number },
): boolean {
  return (
    Math.abs(a.start - b.start) < TIME_EPSILON && Math.abs(a.duration - b.duration) < TIME_EPSILON
  );
}

/** The groups of a clip: the members of each, in the clip's order. */
export function clipGroups(clip: Clip): Map<GroupId, GroupableAction[]> {
  const groups = new Map<GroupId, GroupableAction[]>();
  for (const action of clip.actions) {
    if (!isGroupable(action) || action.group === undefined) continue;
    const members = groups.get(action.group);
    if (members) members.push(action);
    else groups.set(action.group, [action]);
  }
  return groups;
}

/** The block `actionId` of `clip` and the blocks grouped with it, in the clip's order: the block
 * alone when it is in no group, nothing when the clip has no such block. */
export function groupMembers(clip: Clip, actionId: ActionId): ClipAction[] {
  const action = clip.actions.find((a) => a.id === actionId);
  if (!action) return [];
  const group = groupOf(action);
  return group === undefined ? [action] : clip.actions.filter((a) => groupOf(a) === group);
}

/** The blocks of `clip` that the block `actionId` could be grouped with: those that name glyphs,
 * start with it and last the same, and are not in its group already (a block of another group
 * that runs with it is one of them). None for a block that cannot be in a group, or that the
 * clip has not. */
export function runsWith(clip: Clip, actionId: ActionId): GroupableAction[] {
  const action = clip.actions.find((a) => a.id === actionId);
  if (!action || !isGroupable(action)) return [];
  return clip.actions.filter(
    (other): other is GroupableAction =>
      other !== action &&
      isGroupable(other) &&
      sameSpan(action, other) &&
      (action.group === undefined || other.group !== action.group),
  );
}

/** Whether a group of `clip` breaks the rule: a lone block, or blocks that do not run together.
 * A pure read, for the common case that nothing is to repair. */
export function hasBrokenGroup(clip: Clip): boolean {
  for (const members of clipGroups(clip).values()) {
    if (members.length < 2 || members.some((member) => !sameSpan(members[0]!, member))) return true;
  }
  return false;
}

/** Take out of their group the blocks of `clip` that break its rule: of the blocks that carry
 * one `group`, those that run together stay — the most of them, the earliest in the clip's order
 * when two sets tie — if they are two or more; the others are blocks on their own again.
 * Returns the ids of the blocks that left. Writes to `clip` only then (it may be an immer
 * draft: a sound clip is left untouched). */
export function repairClipGroups(clip: Clip): ActionId[] {
  const left: ActionId[] = [];
  for (const members of clipGroups(clip).values()) {
    // The members by span, in the order their first block has in the clip.
    const sets: GroupableAction[][] = [];
    for (const member of members) {
      const set = sets.find((s) => sameSpan(s[0]!, member));
      if (set) set.push(member);
      else sets.push([member]);
    }
    let kept: GroupableAction[] | null = null;
    for (const set of sets) {
      if (set.length >= 2 && (!kept || set.length > kept.length)) kept = set;
    }
    for (const member of members) {
      if (kept?.includes(member)) continue;
      delete member.group;
      left.push(member.id);
    }
  }
  return left;
}

/** `repairClipGroups` on every clip: the clips that had blocks taken out of a group, with them. */
export function repairGroups(project: Project): { clip: Clip; left: ActionId[] }[] {
  const repaired: { clip: Clip; left: ActionId[] }[] = [];
  for (const clip of project.clips) {
    // Most clips have no group: nothing to read twice, nothing to write.
    if (!clip.actions.some((a) => groupOf(a) !== undefined)) continue;
    const left = repairClipGroups(clip);
    if (left.length > 0) repaired.push({ clip, left });
  }
  return repaired;
}
