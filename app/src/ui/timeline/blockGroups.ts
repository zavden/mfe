/* What the timeline draws for the blocks of a clip. A block on its own is a block. The members
 * of a group (`model/groups.ts`) are one block on one lane while the group is folded, which is how
 * a group shows unless it was unfolded; unfolded, its members are blocks on lanes of their own,
 * marked as grouped. Which groups are unfolded is a view state (`unfolded` in the timeline
 * store): no file keeps it. Pure. */
import {
  groupOf,
  type ActionId,
  type Clip,
  type ClipAction,
  type ClipId,
  type GroupId,
} from '../../model';
import {
  animationName,
  blockCategory,
  blockLabel,
  type BlockCategory,
} from '../animations/blockKinds';

/** A group among those of a project: a group's name means nothing outside its clip. */
export const groupKey = (clipId: ClipId, group: GroupId): string => `${clipId}/${group}`;

/** No group unfolded. */
export const ALL_FOLDED: ReadonlySet<string> = new Set();

export interface DrawnBlock {
  /** The block that stands for it: itself, or the first member of the group in the clip's
   * order. */
  id: ActionId;
  /** The folded group it draws; null for a block drawn as itself (one of an unfolded group too). */
  group: GroupId | null;
  /** The blocks it draws: one, or the members of the group in the clip's order. */
  members: ClipAction[];
}

/** What the timeline draws for the blocks of `clip`, in the clip's order (a folded group where
 * its first member is). */
export function drawnBlocks(clip: Clip, unfolded: ReadonlySet<string> = ALL_FOLDED): DrawnBlock[] {
  const drawn: DrawnBlock[] = [];
  const folded = new Map<GroupId, DrawnBlock>();
  for (const action of clip.actions) {
    const group = groupOf(action);
    if (group === undefined || unfolded.has(groupKey(clip.id, group))) {
      drawn.push({ id: action.id, group: null, members: [action] });
      continue;
    }
    const known = folded.get(group);
    if (known) known.members.push(action);
    else {
      const block: DrawnBlock = { id: action.id, group, members: [action] };
      folded.set(group, block);
      drawn.push(block);
    }
  }
  return drawn;
}

/** The group the block `actionId` of `clip` is drawn as: the one it is in, while that group is
 * folded; null for a block drawn as itself. What the keys and the menus do to the selected block
 * goes to the whole group then, as the pointer does. */
export function foldedGroupOf(
  clip: Clip,
  actionId: ActionId,
  unfolded: ReadonlySet<string> = ALL_FOLDED,
): GroupId | null {
  const action = clip.actions.find((a) => a.id === actionId);
  const group = action && groupOf(action);
  return group === undefined || unfolded.has(groupKey(clip.id, group)) ? null : group;
}

/** The label on a folded group: its animation and how many blocks run it when they all run the
 * same one ("Write ×3"), "Group ×3" when they differ. */
export function groupLabel(members: readonly ClipAction[]): string {
  const names = new Set(members.map(animationName));
  return `${names.size === 1 ? [...names][0]! : 'Group'} ×${members.length}`;
}

/** The family that colours a folded group: its members' when they share one, `mixed` otherwise. */
export function groupCategory(members: readonly ClipAction[]): BlockCategory | 'mixed' {
  const categories = new Set(members.map(blockCategory));
  return categories.size === 1 ? [...categories][0]! : 'mixed';
}

const span = (members: readonly ClipAction[], clipStart: number) => {
  const first = members[0]!;
  const start = clipStart + first.start;
  return { start, end: start + first.duration, duration: first.duration };
};

/** The tooltip of a folded group: what it is, its members and when it runs, in seconds from the
 * start of the scene. */
export function groupTitle(members: readonly ClipAction[], clipStart: number): string {
  const { start, end, duration } = span(members, clipStart);
  return [
    `Group of ${members.length} animations that run together`,
    ...members.map((member) => `· ${blockLabel(member)}`),
    `${start.toFixed(2)} s → ${end.toFixed(2)} s · ${duration.toFixed(2)} s`,
  ].join('\n');
}

/** How a folded group reads to assistive technology: "Group of 3 animations: Write · 3, Write ·
 * 3, FadeIn · 1, 1.00 to 2.50 s, lane 1 of 2". */
export function groupDescription(
  members: readonly ClipAction[],
  clip: Clip,
  lane: number,
  laneCount: number,
): string {
  const { start, end } = span(members, clip.start);
  const parts = [
    `Group of ${members.length} animations: ${members.map(blockLabel).join(', ')}`,
    `${start.toFixed(2)} to ${end.toFixed(2)} s`,
  ];
  if (laneCount > 1) parts.push(`lane ${lane + 1} of ${laneCount}`);
  return parts.join(', ');
}
