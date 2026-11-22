import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { groupOf, type ActionId, type Clip, type ClipAction, type Formula } from '../../model';
import type { GroupId, IntroKind, OutroKind } from '../../model';
import { blockSubject } from '../animations/blockKinds';
import { AnimationIcon } from '../animations/AnimationIcon';
import { phaseIcon } from '../animations/animationIcons';
import { animationLabel, shortAnimationLabel } from '../animations/catalogue';
import { blockDescription } from './keyboardNav';
import { MISSING_TAG_COLOR } from '../animations/PropertiesHeader';
import { ActionBlock, type BlockEdge } from './ActionBlock';
import { drawnBlocks, groupDescription } from './blockGroups';
import { GroupBlock } from './GroupBlock';
import { Icon } from './icons';
import { HANDLE_WIDTH, phaseShowsName } from './layout';
import type { ClipLanes } from './trackLayout';
import { isMainClick } from '../pointer';

interface ClipBlockProps {
  clip: Clip;
  formula: Formula | undefined;
  pxPerSecond: number;
  selected: boolean;
  locked: boolean;
  onPointerDown(e: ReactPointerEvent, clip: Clip): void;
  onTrimStart(e: ReactPointerEvent, clip: Clip, edge: 'start' | 'end'): void;
  /** Press on the inner edge of the clip's intro or outro: a drag makes it longer or shorter
   * (`phaseGestures.ts`). */
  onPhaseResize(e: ReactPointerEvent, clip: Clip, phase: 'intro' | 'outro'): void;
  /** Role while a link is being made: its source, a possible target, or not a target (`linkReason`
   * says why). */
  linkRole: 'source' | 'target' | 'invalid' | null;
  linkReason: string | null;
  /** A plain double-click on the clip (not on a trim handle, a block or the padlock). */
  onOpen(clip: Clip): void;
  /** How the clip's animation blocks are stacked in its upper strip. */
  lanes: ClipLanes;
  /** The groups drawn with a lane per member (`groupKey`s); the others are one block each. */
  unfolded: ReadonlySet<string>;
  /** Fold a group of the clip into one block, or unfold it. */
  onGroupFold(clip: Clip, group: GroupId, folded: boolean): void;
  /** The block of this clip that is selected, if any. */
  selectedAction: ActionId | null;
  /** Which of the clip's items holds the timeline's Tab stop (useTimelineKeyboard): the clip
   * itself, one of its blocks, or none. */
  tabStop: 'clip' | ActionId | null;
  /** How the clip reads to assistive technology (`clipDescription`). */
  label: string;
  /** The block being dragged and held back by the planner, if any (see ActionBlock). */
  stoppedAction: ActionId | null;
  onBlockPress(e: ReactPointerEvent, clip: Clip, action: ClipAction, edge: BlockEdge): void;
  onBlockMenu(e: ReactMouseEvent, clip: Clip, action: ClipAction): void;
  /** A double-click on a block: its dialog (R2). */
  onBlockOpen(clip: Clip, action: ClipAction): void;
  /** A right-click on the clip, not on one of its blocks. */
  onClipMenu(e: ReactMouseEvent, clip: Clip): void;
  /** The clip's lock after its transformations (ui/animations/transformEdit.ts); null when it
   * has no transformation to protect. */
  transformLock: 'locked' | 'unlocked' | null;
  onToggleTransformLock(clip: Clip): void;
  /** The clip is locked in the preview (`Clip.previewLocked`): it shows a mark, which unlocks
   * it. */
  onUnlockPreview(clip: Clip): void;
}

/** The icon and the name of an intro or an outro on its band of the clip (D189); on a band too
 * short for the name, the icon alone (`phaseShowsName`). */
function PhaseName({
  kind,
  width,
  outro = false,
}: {
  kind: IntroKind | OutroKind;
  width: number;
  outro?: boolean;
}) {
  const name = shortAnimationLabel(kind);
  return (
    <span
      className={`tl-seg-name${outro ? ' is-outro' : ''}${phaseShowsName(width, name) ? '' : ' is-icon-only'}`}
      style={{ width }}
    >
      <AnimationIcon name={phaseIcon(kind)} />
      <span className="tl-seg-text">{name}</span>
    </span>
  );
}

/** One clip on a track: the formula's tag colour, its intro / outro segments — each with a grab
 * zone on its inner edge, in the lower part of the clip, that makes the animation longer or
 * shorter (D119) — and its animation blocks in the upper strip (the relation windows are drawn
 * over the lower half, see TimelineRelations, and so is the link port, see TimelineLinkPorts). A
 * double-click opens its formula in the formula editor. */
export function ClipBlock({
  clip,
  formula,
  pxPerSecond: px,
  selected,
  locked,
  onPointerDown,
  onTrimStart,
  onPhaseResize,
  linkRole,
  linkReason,
  onOpen,
  lanes,
  unfolded,
  onGroupFold,
  selectedAction,
  tabStop,
  label,
  stoppedAction,
  onBlockPress,
  onBlockMenu,
  onBlockOpen,
  onClipMenu,
  transformLock,
  onToggleTransformLock,
  onUnlockPreview,
}: ClipBlockProps) {
  const color = formula?.tag.color ?? MISSING_TAG_COLOR;
  const name = formula?.name ?? '(missing formula)';
  const icon = formula?.tag.icon ?? null;
  const classes = ['tl-clip'];
  if (selected) classes.push('is-selected');
  if (locked) classes.push('is-locked');
  if (clip.previewLocked) classes.push('is-preview-locked');
  if (linkRole) classes.push(`is-link-${linkRole}`);
  if (selectedAction) classes.push('has-selected-block');
  return (
    <div
      className={classes.join(' ')}
      role="gridcell"
      aria-selected={selected}
      aria-label={label}
      tabIndex={tabStop === 'clip' ? 0 : -1}
      data-space-plays=""
      data-testid={`clip-${clip.id}`}
      data-clip-id={clip.id}
      data-link={linkRole ?? undefined}
      data-start={clip.start}
      data-end={clip.end}
      style={{
        left: clip.start * px,
        width: Math.max(2, (clip.end - clip.start) * px),
        ['--clip-color' as string]: color,
      }}
      // Outside link mode the clip's own tooltip (ClipTooltip) names it and shows the formula.
      title={
        linkRole === 'invalid' && linkReason
          ? linkReason
          : linkRole === 'target'
            ? `Relate to ${name}`
            : undefined
      }
      onPointerDown={(e) => onPointerDown(e, clip)}
      onDoubleClick={(e) => {
        // Modifier clicks build a selection; handles trim.
        if (!isMainClick(e) || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        if ((e.target as Element).closest('.tl-handle, .tl-phase-handle, .tl-block, .tl-clip-lock'))
          return;
        onOpen(clip);
      }}
      onContextMenu={(e) => onClipMenu(e, clip)}
    >
      {clip.intro.kind !== 'none' && (
        <div
          className="tl-seg tl-intro"
          data-testid={`clip-${clip.id}-intro`}
          style={{ width: clip.intro.duration * px }}
        />
      )}
      {clip.outro.kind !== 'none' && (
        <div
          className="tl-seg tl-outro"
          data-testid={`clip-${clip.id}-outro`}
          style={{ width: clip.outro.duration * px }}
        />
      )}
      {/* The lower half: the intro's icon and name (D189), the clip's name, the outro's. */}
      <div className="tl-clip-foot">
        {clip.intro.kind !== 'none' && (
          <PhaseName kind={clip.intro.kind} width={clip.intro.duration * px} />
        )}
        <div className="tl-clip-label">
          {clip.previewLocked && (
            <button
              type="button"
              className="tl-clip-lock tl-clip-preview-lock"
              data-testid={`clip-${clip.id}-preview-lock`}
              aria-label={`Unlock ${name} in the preview`}
              title="Locked in the preview: it cannot be selected or moved there, and a press goes through it to what is under it. Click to unlock."
              disabled={locked}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onUnlockPreview(clip);
              }}
            >
              <Icon name="pointer-off" />
            </button>
          )}
          {icon && <span className="tl-clip-icon">{icon}</span>}
          <span className="tl-clip-name">{name}</span>
          {transformLock && (
            <button
              type="button"
              className={`tl-clip-lock is-${transformLock}`}
              data-testid={`clip-${clip.id}-transform-lock`}
              aria-pressed={transformLock === 'locked'}
              aria-label={
                transformLock === 'locked'
                  ? `Unlock ${name} after its transformations`
                  : `Lock ${name} after its transformations`
              }
              title={
                transformLock === 'locked'
                  ? 'Locked after its first transformation: the preview edits a transformation only through the end icon of its block. Click to unlock.'
                  : 'Unlocked: the preview edits the keyframe at the playhead. Click to lock again.'
              }
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleTransformLock(clip);
              }}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
                <path
                  d={
                    transformLock === 'locked'
                      ? 'M4 5.5V4a2 2 0 0 1 4 0v1.5'
                      : 'M4 5.5V4a2 2 0 0 1 3.9-.6'
                  }
                />
              </svg>
            </button>
          )}
        </div>
        {clip.outro.kind !== 'none' && (
          <PhaseName kind={clip.outro.kind} width={clip.outro.duration * px} outro />
        )}
      </div>
      {drawnBlocks(clip, unfolded).map(({ id, group, members }) => {
        const lane = lanes.laneOf.get(id) ?? 0;
        if (group !== null) {
          // A folded group: one block, which stands for its selected member or its first.
          const has = (wanted: ActionId | 'clip' | null) => members.some((m) => m.id === wanted);
          return (
            <GroupBlock
              key={`group:${group}`}
              clip={clip}
              group={group}
              members={members}
              active={members.find((m) => m.id === selectedAction) ?? members[0]!}
              lane={lane}
              pxPerSecond={px}
              selected={has(selectedAction)}
              tabStop={has(tabStop)}
              label={groupDescription(members, clip, lane, lanes.count)}
              stopped={has(stoppedAction)}
              onPress={onBlockPress}
              onMenu={onBlockMenu}
              onUnfold={(c, g) => onGroupFold(c, g, false)}
            />
          );
        }
        const action = members[0]!;
        // The first member of an unfolded group carries the arrow that folds it again.
        const own = groupOf(action);
        const first = own !== undefined && clip.actions.find((a) => groupOf(a) === own) === action;
        return (
          <ActionBlock
            key={action.id}
            clip={clip}
            action={action}
            subject={blockSubject(formula?.kind)}
            lane={lane}
            pxPerSecond={px}
            selected={action.id === selectedAction}
            tabStop={tabStop === action.id}
            label={blockDescription(action, clip, lane, lanes.count)}
            stopped={action.id === stoppedAction}
            onPress={onBlockPress}
            onMenu={onBlockMenu}
            onOpen={onBlockOpen}
            onFold={first ? (c, g) => onGroupFold(c, g, true) : undefined}
          />
        );
      })}
      {clip.intro.kind !== 'none' && (
        <div
          className="tl-phase-handle is-intro"
          data-testid={`clip-${clip.id}-intro-handle`}
          style={{ left: clip.intro.duration * px }}
          title={`${animationLabel(clip.intro.kind)} · ${clip.intro.duration.toFixed(2)} s — drag to make the intro longer or shorter`}
          onPointerDown={(e) => onPhaseResize(e, clip, 'intro')}
        />
      )}
      {clip.outro.kind !== 'none' && (
        <div
          className="tl-phase-handle is-outro"
          data-testid={`clip-${clip.id}-outro-handle`}
          style={{ right: clip.outro.duration * px }}
          title={`${animationLabel(clip.outro.kind)} · ${clip.outro.duration.toFixed(2)} s — drag to make the outro longer or shorter`}
          onPointerDown={(e) => onPhaseResize(e, clip, 'outro')}
        />
      )}
      <div
        className="tl-handle tl-handle-start"
        data-testid={`clip-${clip.id}-trim-start`}
        style={{ width: HANDLE_WIDTH }}
        onPointerDown={(e) => onTrimStart(e, clip, 'start')}
      />
      <div
        className="tl-handle tl-handle-end"
        data-testid={`clip-${clip.id}-trim-end`}
        style={{ width: HANDLE_WIDTH }}
        onPointerDown={(e) => onTrimStart(e, clip, 'end')}
      />
    </div>
  );
}
