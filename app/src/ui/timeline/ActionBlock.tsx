import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { groupOf, type Clip, type ClipAction, type GroupId } from '../../model';
import { AnimationIcon } from '../animations/AnimationIcon';
import { blockIcon } from '../animations/animationIcons';
import { blockCategory, blockLabel, blockTitle, type BlockSubject } from '../animations/blockKinds';
import { useProjectStore } from '../../store';
import { attachHosts, listNames } from '../animations/attachNames';
import { Icon } from './icons';
import { blockShowsName } from './layout';

/** Which part of a block a press grabbed: the body moves it, an edge resizes it. */
export type BlockEdge = 'move' | 'start' | 'end';

/** A block narrower than this (px) is still drawn this wide, so that it can be grabbed. */
const MIN_WIDTH = 6;

interface ActionBlockProps {
  clip: Clip;
  action: ClipAction;
  /** What the clip shows, for the words of the tooltip (`blockSubject`). */
  subject: BlockSubject;
  /** Lane within the clip's strip, from 0 (top). */
  lane: number;
  pxPerSecond: number;
  selected: boolean;
  /** Whether it holds the timeline's Tab stop (useTimelineKeyboard). */
  tabStop: boolean;
  /** How it reads to assistive technology (`blockDescription`). */
  label: string;
  /** Being dragged and held back by the planner (blockGestures): marked in the danger colour,
   * and the drag readout says why. */
  stopped: boolean;
  onPress(e: ReactPointerEvent, clip: Clip, action: ClipAction, edge: BlockEdge): void;
  onMenu(e: ReactMouseEvent, clip: Clip, action: ClipAction): void;
  /** A double-click: the block's dialog (R2). */
  onOpen(clip: Clip, action: ClipAction): void;
  /** For a member of an unfolded group, the first of them in the clip's order: its arrow folds
   * the group back into one block. */
  onFold?(clip: Clip, group: GroupId): void;
}

/** One animation block (a clip action) in the upper strip of its clip: coloured by category,
 * with its animation's icon (D189), then the Manim name and the number of glyphs it names. Its body moves it and its edges
 * resize it (see blockGestures). A member of a group that is unfolded is drawn like this too,
 * marked as grouped: it moves and stretches with the others. */
export function ActionBlock({
  clip,
  action,
  subject,
  lane,
  pxPerSecond: px,
  selected,
  tabStop,
  label,
  stopped,
  onPress,
  onMenu,
  onOpen,
  onFold,
}: ActionBlockProps) {
  const category = blockCategory(action);
  const group = groupOf(action);
  // A Transform that carries its shape elsewhere says where to: "Transform → f2".
  const target = useProjectStore((state) =>
    action.kind === 'tween' && action.fit
      ? listNames(attachHosts(state.project, action.fit))
      : undefined,
  );
  const width = Math.max(MIN_WIDTH, action.duration * px);
  const name = target === undefined ? blockLabel(action) : `${blockLabel(action)} ${target}`;
  // Too short for its name, it shows its icon alone.
  const named = blockShowsName(width, name, group !== undefined && onFold !== undefined);
  return (
    <div
      className={`tl-block is-${category}${group === undefined ? '' : ' is-grouped'}${named ? '' : ' is-icon-only'}${selected ? ' is-selected' : ''}${stopped ? ' is-stopped' : ''}`}
      data-testid={`action-block-${action.id}`}
      data-action-id={action.id}
      data-kind={action.kind}
      data-group={group}
      data-lane={lane}
      data-start={action.start}
      data-duration={action.duration}
      style={{
        left: action.start * px,
        width,
        // The height of a lane is the row's (`--lane-height`, set by the timeline per track).
        top: `calc(var(--lane-height) * ${lane} + 1px)`,
        height: 'calc(var(--lane-height) - 3px)',
      }}
      // Reached with the arrows from its clip (useTimelineKeyboard); the Animations panel
      // lists the blocks too.
      role="button"
      aria-label={label}
      aria-current={selected || undefined}
      tabIndex={tabStop ? 0 : -1}
      data-space-plays=""
      title={blockTitle(action, clip.start, subject, target)}
      onPointerDown={(e) => onPress(e, clip, action, 'move')}
      onContextMenu={(e) => onMenu(e, clip, action)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(clip, action);
      }}
    >
      {group !== undefined && onFold && (
        // A pointer's shortcut: the keyboard folds a group from the menu of a member.
        <span
          className="tl-group-fold is-unfolded"
          data-testid={`group-fold-${group}`}
          aria-hidden="true"
          title="Fold the group into one block"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onFold(clip, group);
          }}
        >
          <Icon name="chevron-down" />
        </span>
      )}
      <AnimationIcon name={blockIcon(action)} />
      <span className="tl-block-label">{name}</span>
      <div
        className="tl-block-handle tl-block-handle-start"
        data-testid={`action-block-${action.id}-start`}
        onPointerDown={(e) => onPress(e, clip, action, 'start')}
      />
      <div
        className="tl-block-handle tl-block-handle-end"
        data-testid={`action-block-${action.id}-end`}
        onPointerDown={(e) => onPress(e, clip, action, 'end')}
      />
    </div>
  );
}
