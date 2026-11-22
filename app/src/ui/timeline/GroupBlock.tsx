import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Clip, ClipAction, GroupId } from '../../model';
import { AnimationIcon } from '../animations/AnimationIcon';
import { groupIcon } from '../animations/animationIcons';
import type { BlockEdge } from './ActionBlock';
import { groupCategory, groupLabel, groupTitle } from './blockGroups';
import { Icon } from './icons';
import { blockShowsName } from './layout';

/** A group narrower than this (px) is still drawn this wide, so that it can be grabbed. */
const MIN_WIDTH = 6;

interface GroupBlockProps {
  clip: Clip;
  group: GroupId;
  /** The blocks of the group, in the clip's order. */
  members: readonly ClipAction[];
  /** The member the block stands for: the selected one when one of them is, else the first. A
   * press, the menu and the keyboard act through it. */
  active: ClipAction;
  /** Lane within the clip's strip, from 0 (top). */
  lane: number;
  pxPerSecond: number;
  selected: boolean;
  /** Whether it holds the timeline's Tab stop (useTimelineKeyboard). */
  tabStop: boolean;
  /** How it reads to assistive technology (`groupDescription`). */
  label: string;
  /** Being dragged and held back by the planner (blockGestures). */
  stopped: boolean;
  onPress(e: ReactPointerEvent, clip: Clip, action: ClipAction, edge: BlockEdge): void;
  onMenu(e: ReactMouseEvent, clip: Clip, action: ClipAction): void;
  /** Its arrow, or a double-click: show the members on lanes of their own. */
  onUnfold(clip: Clip, group: GroupId): void;
}

/** A group of blocks folded into one (`blockGroups.ts`): one block on one lane for animations
 * that start together and last the same, labelled with what they run and how many they are. Its
 * body moves the group and its edges stretch it, all its members at once (`blockGestures`, through
 * the member it stands for); its arrow unfolds it. */
export function GroupBlock({
  clip,
  group,
  members,
  active,
  lane,
  pxPerSecond: px,
  selected,
  tabStop,
  label,
  stopped,
  onPress,
  onMenu,
  onUnfold,
}: GroupBlockProps) {
  const width = Math.max(MIN_WIDTH, active.duration * px);
  const name = groupLabel(members);
  // Too short for its label, it shows its arrow and its icon alone.
  const named = blockShowsName(width, name, true);
  return (
    <div
      className={`tl-block is-group is-${groupCategory(members)}${named ? '' : ' is-icon-only'}${selected ? ' is-selected' : ''}${stopped ? ' is-stopped' : ''}`}
      data-testid={`group-block-${group}`}
      // The keyboard finds it by the member it stands for, or by any of them (`data-members`).
      data-action-id={active.id}
      data-members={members.map((member) => member.id).join(' ')}
      data-group={group}
      data-count={members.length}
      data-lane={lane}
      data-start={active.start}
      data-duration={active.duration}
      style={{
        left: active.start * px,
        width,
        // The height of a lane is the row's (`--lane-height`, set by the timeline per track).
        top: `calc(var(--lane-height) * ${lane} + 1px)`,
        height: 'calc(var(--lane-height) - 3px)',
      }}
      role="button"
      aria-label={label}
      aria-current={selected || undefined}
      tabIndex={tabStop ? 0 : -1}
      data-space-plays=""
      title={groupTitle(members, clip.start)}
      onPointerDown={(e) => onPress(e, clip, active, 'move')}
      onContextMenu={(e) => onMenu(e, clip, active)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onUnfold(clip, group);
      }}
    >
      {/* A pointer's shortcut: the keyboard unfolds a group from its menu. */}
      <span
        className="tl-group-fold"
        data-testid={`group-unfold-${group}`}
        aria-hidden="true"
        title="Show the animations of the group on lanes of their own"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onUnfold(clip, group);
        }}
      >
        <Icon name="chevron-down" />
      </span>
      <AnimationIcon name={groupIcon(members)} />
      <span className="tl-block-label">{name}</span>
      <div
        className="tl-block-handle tl-block-handle-start"
        data-testid={`group-block-${group}-start`}
        onPointerDown={(e) => onPress(e, clip, active, 'start')}
      />
      <div
        className="tl-block-handle tl-block-handle-end"
        data-testid={`group-block-${group}-end`}
        onPointerDown={(e) => onPress(e, clip, active, 'end')}
      />
    </div>
  );
}
