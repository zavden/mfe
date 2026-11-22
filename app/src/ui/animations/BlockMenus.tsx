/* The two menus of animation blocks: "Add animation" (a right-click on a clip, or the button of
 * the Animations panel) and the menu of a block. They only present the choices; the caller acts
 * and decides how to report a refusal. The menu closes after a choice. */
import { useState, type ReactNode } from 'react';
import {
  animatedWhole,
  EMPHASIS,
  KINDS,
  type AppearKind,
  type AttachSide,
  type ClipAction,
  type ClipId,
  type DisappearKind,
  type EmphasisKind,
  type AttachTarget,
  type Formula,
  type LineKind,
} from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { ContextMenu, MenuItem, Submenu } from '../ContextMenu';
import { addBlock } from './blockActions';
import { BRACE_SIDES, LABEL_KINDS, SIDE_LABELS, type LabelKind } from './braceActions';
import { LINE_KINDS, LINE_LABELS } from '../creator/sources';
import { startLineDraw } from '../preview/lineDraw';
import { SHAPE_CHOICE_LABELS, SHAPE_CHOICES, type ShapeChoice } from './shapeActions';
import {
  CATEGORY_LABEL,
  blockLabel,
  clipIsArrow,
  clipSubject,
  type BlockSubject,
} from './blockKinds';
import {
  APPEAR_ANIMATIONS,
  appearChoicesOf,
  DISAPPEAR_ANIMATIONS,
  disappearChoicesOf,
  EMPHASIS_EFFECTS,
  emphasisChoicesOf,
  GROW_ARROW,
} from './catalogue';
import { addTimeLabel, regionAddTime, type AddTime, type NewBlock } from './blockOps';
import { isGlyphBlock, type SplitOptions } from './splitBlock';
import { groupLabel } from '../timeline/blockGroups';
import { regionLabel } from '../timeline/region';
import { useTimelineStore } from '../timeline/timelineStore';
import { startRetarget } from '../preview/shapeRetarget';

/** «Add brace ▸»: a side of the whole object, or the glyph dialog. */
export type BraceChoice = AttachSide | 'glyphs';

/** «Add shape ▸»: a shape on the whole object, or the glyph dialog. */
export type ShapeMenuChoice = ShapeChoice | 'glyphs';

interface AddAnimationMenuProps {
  x: number;
  y: number;
  /** What the menu is about, e.g. "f1 · at 2.35 s". */
  header: string;
  /** What the clip shows (`blockSubject`): a brace or a shape has a Transform of the whole
   * object alone, and no Morph (D123). A formula when absent. */
  subject?: BlockSubject;
  onPick(block: NewBlock): void;
  /** A shape's «To another formula or glyphs…»: start choosing, in the preview, what a Transform
   * carries it to (`preview/shapeRetarget.ts`); absent, the entry is not offered and Transform is
   * one entry. */
  onRetarget?(): void;
  /** «Add brace ▸» on the clip's object (D66); absent, the group is not offered. On a shape, the
   * four sides only: it is one piece, with no glyphs to choose in the dialog (D123). */
  onBrace?(choice: BraceChoice): void;
  /** «Add shape ▸» on the clip's object (D71); absent, the group is not offered. */
  onShape?(choice: ShapeMenuChoice): void;
  /** The clip shows an arrow or a double arrow: Appear offers GrowArrow too (D145). */
  arrow?: boolean;
  /** What a line drawn from this menu starts on: the clip (D140). */
  lineFrom?: AttachTarget;
  /** «Add label ▸» at the tip of the clip's brace (D69); absent, the group is not offered. */
  onLabel?(kind: LabelKind): void;
  /** The clip's own entries (`ObjectMenuItems`, D118, D120: its intro, its outro, Remove
   * animations and what its kind adds), after the groups above. */
  object?: ReactNode;
  /** The clip's lock in the preview (preview/previewLock.ts): the menu's last entry locks it or
   * unlocks it. */
  previewLock?: { locked: boolean; onToggle(): void };
  /** Why the clip cannot be edited now (its track is locked), or absent: the entries that would
   * change it — its animations, its lock in the preview — are off, with this as their tooltip.
   * A brace, a shape or a line on it stays, as in the preview's menu, and `object` has its own
   * entries off but the copies (its timing, the shape of its path), which change nothing. */
  locked?: string;
  onClose(): void;
}

/** The items of a group as a submenu (entry `testId`, text `label`), or alone — `flat` — when
 * they make a menu of their own (the glyph pick bar's Brace ▾, the brace panel's Add label ▾). */
function Group({
  flat,
  label,
  testId,
  disabled,
  title,
  children,
}: {
  flat?: boolean;
  label: string;
  testId: string;
  /** Greyed out, with `title` to say why (a submenu only). */
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  if (flat) return children;
  return (
    <Submenu label={label} testId={testId} disabled={disabled} title={title}>
      {children}
    </Submenu>
  );
}

/** «Add brace ›»: a submenu of the four sides, then the glyph dialog — left out with `dialog`
 * false: the dialog is of one object, and the glyphs may be of several (D117); a shape is one
 * piece, and so are several whole clips (D123). `header` replaces the entry's text (the clip's
 * menu says when the brace goes on the picked glyphs, D74). `disabled` greys the entry out, with
 * `title` to say why. The entry's test id is `testIdPrefix`, its items' `<testIdPrefix>-<side>`
 * and `-glyphs`. */
export function BraceMenuItems({
  testIdPrefix,
  header = 'Add brace',
  flat,
  dialog = true,
  disabled,
  title,
  onChoose,
}: {
  testIdPrefix: string;
  header?: string;
  flat?: boolean;
  dialog?: boolean;
  disabled?: boolean;
  title?: string;
  onChoose(choice: BraceChoice): void;
}) {
  return (
    <Group flat={flat} label={header} testId={testIdPrefix} disabled={disabled} title={title}>
      {BRACE_SIDES.map((side) => (
        <MenuItem key={side} testId={`${testIdPrefix}-${side}`} onClick={() => onChoose(side)}>
          {SIDE_LABELS[side]}
        </MenuItem>
      ))}
      {dialog && (
        <MenuItem testId={`${testIdPrefix}-glyphs`} onClick={() => onChoose('glyphs')}>
          On some glyphs…
        </MenuItem>
      )}
    </Group>
  );
}

/** «Add shape ›»: a submenu of a box, a circle, an underline, a cross, a highlight, then the
 * glyph dialog (D71), left out with `dialog` false as the brace's is. `header` replaces the
 * entry's text; `disabled` greys the entry out, with `title` to say why. */
export function ShapeMenuItems({
  testIdPrefix,
  header = 'Add shape',
  flat,
  dialog = true,
  disabled,
  title,
  onChoose,
}: {
  testIdPrefix: string;
  header?: string;
  flat?: boolean;
  dialog?: boolean;
  disabled?: boolean;
  title?: string;
  onChoose(choice: ShapeMenuChoice): void;
}) {
  return (
    <Group flat={flat} label={header} testId={testIdPrefix} disabled={disabled} title={title}>
      {SHAPE_CHOICES.map((choice) => (
        <MenuItem
          key={choice}
          testId={`${testIdPrefix}-${choice}`}
          onClick={() => onChoose(choice)}
        >
          {SHAPE_CHOICE_LABELS[choice]}
        </MenuItem>
      ))}
      {dialog && (
        <MenuItem testId={`${testIdPrefix}-glyphs`} onClick={() => onChoose('glyphs')}>
          On some glyphs…
        </MenuItem>
      )}
    </Group>
  );
}

/** «Add line ›»: a submenu of a line, a dashed line, an arrow and a double arrow (D137). Choosing
 * one starts drawing it in the preview: from a clip's menu it starts on that clip, and a click
 * puts its end; from the menu of the preview's empty space (`title` says so), two clicks put its
 * start and its end. */
export function LineMenuItems({
  testIdPrefix,
  flat,
  title = 'Draw it in the preview: it starts here; then click where it ends',
  onChoose,
}: {
  testIdPrefix: string;
  flat?: boolean;
  title?: string;
  onChoose(line: LineKind): void;
}) {
  return (
    <Group flat={flat} label="Add line" testId={testIdPrefix} title={title}>
      {LINE_KINDS.map((line) => (
        <MenuItem key={line} testId={`${testIdPrefix}-${line}`} onClick={() => onChoose(line)}>
          {LINE_LABELS[line]}
        </MenuItem>
      ))}
    </Group>
  );
}

/** «Add label ›»: a submenu of a formula or a LaTeX text at a brace's tip (D69). */
export function LabelMenuItems({
  testIdPrefix,
  flat,
  onChoose,
}: {
  testIdPrefix: string;
  flat?: boolean;
  onChoose(kind: LabelKind): void;
}) {
  return (
    <Group flat={flat} label="Add label" testId={testIdPrefix}>
      {LABEL_KINDS.map((kind) => (
        <MenuItem key={kind} testId={`${testIdPrefix}-${kind}`} onClick={() => onChoose(kind)}>
          {KINDS[kind].label}
        </MenuItem>
      ))}
    </Group>
  );
}

/** Appear, Disappear, Transform, Morph and Emphasis animations to add to a clip, and a brace or a
 * shape on it — or a label at its tip, for a brace's clip, and then what the caller gives for
 * the clip itself (`object`: its intro, its outro, Remove animations…). A short menu: each kind of
 * animation that has several is an entry that opens them beside it (test id
 * `add-animation-group-<kind>`; the animations keep `add-animation-<animation>`), and Morph, which
 * has one, is that one. A brace and a shape are one piece: no part to transform, no Morph — a
 * brace's Transform is one entry, a shape's opens its two: the Transform and the one that
 * carries it to surround another formula or other glyphs (D123). */
export function AddAnimationMenu({
  x,
  y,
  header,
  subject = 'formula',
  onPick,
  onRetarget,
  onBrace,
  onShape,
  arrow = false,
  lineFrom,
  onLabel,
  object,
  previewLock,
  locked,
  onClose,
}: AddAnimationMenuProps) {
  const off = locked !== undefined;
  const pick = (block: NewBlock) => () => {
    onClose();
    onPick(block);
  };
  return (
    <ContextMenu x={x} y={y} label="Add animation" testId="add-animation-menu" onClose={onClose}>
      <div className="ctx-header is-wrapping" data-testid="add-animation-header">
        Add animation · {header}
      </div>
      <Submenu
        label={CATEGORY_LABEL.appear}
        testId="add-animation-group-appear"
        disabled={off}
        title={locked}
      >
        {[
          ...APPEAR_ANIMATIONS.filter(
            (k) => subject !== 'line' || KINDS.line.intros.includes(k.value),
          ),
          ...(arrow ? [GROW_ARROW] : []),
        ].map((k) => (
          <MenuItem
            key={k.value}
            testId={`add-animation-${k.value}`}
            onClick={pick({ kind: 'appear', anim: k.value })}
          >
            {k.label}
          </MenuItem>
        ))}
      </Submenu>
      <Submenu
        label={CATEGORY_LABEL.disappear}
        testId="add-animation-group-disappear"
        disabled={off}
        title={locked}
      >
        {DISAPPEAR_ANIMATIONS.filter(
          (k) => subject !== 'line' || KINDS.line.outros.includes(k.value),
        ).map((k) => (
          <MenuItem
            key={k.value}
            testId={`add-animation-${k.value}`}
            onClick={pick({ kind: 'disappear', anim: k.value })}
          >
            {k.label}
          </MenuItem>
        ))}
      </Submenu>
      {subject === 'formula' ? (
        <>
          <Submenu
            label={CATEGORY_LABEL.transform}
            testId="add-animation-group-transform"
            disabled={off}
            title={locked}
          >
            <MenuItem testId="add-animation-tween" onClick={pick({ kind: 'tween' })}>
              Whole formula (keyframe)
            </MenuItem>
            <MenuItem testId="add-animation-transform" onClick={pick({ kind: 'transform' })}>
              Part of the formula
            </MenuItem>
          </Submenu>
          <MenuItem
            testId="add-animation-morph"
            disabled={off}
            title={locked}
            onClick={pick({ kind: 'morph' })}
          >
            {CATEGORY_LABEL.morph} within the formula
          </MenuItem>
        </>
      ) : onRetarget ? (
        <Submenu
          label={CATEGORY_LABEL.transform}
          testId="add-animation-group-transform"
          disabled={off}
          title={locked}
        >
          <MenuItem testId="add-animation-tween" onClick={pick({ kind: 'tween' })}>
            {CATEGORY_LABEL.transform}
          </MenuItem>
          <MenuItem
            testId="add-animation-retarget"
            onClick={() => {
              onClose();
              onRetarget();
            }}
          >
            To another formula or glyphs…
          </MenuItem>
        </Submenu>
      ) : (
        <MenuItem
          testId="add-animation-tween"
          disabled={off}
          title={locked}
          onClick={pick({ kind: 'tween' })}
        >
          {CATEGORY_LABEL.transform}
          {/* A line has no part and no size of its own: its Transform says what it does. */}
          {subject === 'line' && <span className="ctx-hint">ends · stroke · colour</span>}
        </MenuItem>
      )}
      <Submenu
        label={CATEGORY_LABEL.emphasis}
        testId="add-animation-group-emphasis"
        disabled={off}
        title={locked}
      >
        {EMPHASIS_EFFECTS.filter((k) => subject !== 'line' || !EMPHASIS[k.value].animates).map(
          (k) => (
            <MenuItem
              key={k.value}
              testId={`add-animation-${k.value}`}
              onClick={pick({ kind: 'emphasis', effect: k.value })}
            >
              {k.label}
            </MenuItem>
          ),
        )}
      </Submenu>
      {(onBrace || onShape || onLabel) && <hr className="ctx-sep" />}
      {onBrace && (
        <BraceMenuItems
          testIdPrefix="add-brace"
          dialog={subject === 'formula'}
          onChoose={(choice) => {
            onClose();
            onBrace(choice);
          }}
        />
      )}
      {onShape && (
        <ShapeMenuItems
          testIdPrefix="add-shape"
          onChoose={(choice) => {
            onClose();
            onShape(choice);
          }}
        />
      )}
      {onShape && (
        <LineMenuItems
          testIdPrefix="add-line"
          onChoose={(line) => {
            onClose();
            startLineDraw(line, lineFrom);
          }}
        />
      )}
      {onLabel && (
        <LabelMenuItems
          testIdPrefix="add-label"
          onChoose={(kind) => {
            onClose();
            onLabel(kind);
          }}
        />
      )}
      {object && (
        <>
          <hr className="ctx-sep" />
          {object}
        </>
      )}
      {previewLock && (
        <>
          <hr className="ctx-sep" />
          <MenuItem
            testId="clip-menu-preview-lock"
            disabled={off}
            title={locked}
            onClick={() => {
              onClose();
              previewLock.onToggle();
            }}
          >
            {previewLock.locked ? 'Unlock in the preview' : 'Lock in the preview'}
          </MenuItem>
        </>
      )}
    </ContextMenu>
  );
}

interface BlockMenuProps {
  x: number;
  y: number;
  action: ClipAction;
  /** The object of the block's clip: what it takes is what the menu offers (a line's block is
   * never grown nor shrunk, an arrow's grows with GrowArrow). */
  formula: Formula | undefined;
  onChange(kind: 'appear' | 'disappear', anim: AppearKind | DisappearKind): void;
  /** An Emphasis block: run another effect. */
  onChangeEffect(effect: EmphasisKind): void;
  /** A morph block: open its pair editor. */
  onEditPairs(): void;
  onDuplicate(): void;
  /** A block that names glyphs: whether a copy for the other glyphs has any to animate
   * (`complementGlyphs`); the item is disabled otherwise. */
  canDuplicateOthers?: boolean;
  onDuplicateOthers(): void;
  /** A block that names glyphs: what a split can do where it is (`splitOptions`); the split
   * items are disabled when it can do nothing. */
  split?: SplitOptions;
  onSplitRuns(): void;
  onSplit(): void;
  onDelete(): void;
  /** A member of a group that is drawn unfolded: fold the group again, take this block out of
   * it, or undo the group. */
  group?: { onFold(): void; onLeave(): void; onUngroup(): void };
  /** How many blocks of the clip run with this one without being grouped with it — they start
   * with it and last the same (`runsWith`) — and what groups it with them; absent when none
   * does. */
  groupWith?: { count: number; onGroup(): void };
  onClose(): void;
}

/** "Group with the 2 blocks that run with it". */
const groupWithLabel = (count: number, it: string) =>
  `Group with the ${count === 1 ? 'block that runs' : `${count} blocks that run`} with ${it}`;

interface GroupMenuProps {
  x: number;
  y: number;
  /** The blocks of the group, in the clip's order. */
  members: readonly ClipAction[];
  onUnfold(): void;
  onUngroup(): void;
  /** Blocks that run with the group without being in it, as for a block (`BlockMenu`). */
  groupWith?: { count: number; onGroup(): void };
  onDuplicate(): void;
  onDelete(): void;
  onClose(): void;
}

/** The menu of a group of blocks folded into one: what it holds, then show its animations on
 * lanes of their own, undo the group, take in the blocks that run with it, copy it whole or
 * delete it whole. What a single animation of it can do (another animation, its glyphs, a split)
 * is on that animation's own menu, once unfolded, and in the Animations panel. */
export function GroupMenu({
  x,
  y,
  members,
  onUnfold,
  onUngroup,
  groupWith,
  onDuplicate,
  onDelete,
  onClose,
}: GroupMenuProps) {
  const act = (run: () => void) => () => {
    onClose();
    run();
  };
  return (
    <ContextMenu x={x} y={y} label="Group of animations" testId="group-menu" onClose={onClose}>
      <div className="ctx-header" data-testid="group-menu-header">
        {groupLabel(members)}
      </div>
      <div className="ctx-header ctx-group" data-testid="group-menu-members">
        {members.map(blockLabel).join(', ')}
      </div>
      <MenuItem testId="group-menu-unfold" onClick={act(onUnfold)}>
        Unfold
      </MenuItem>
      <MenuItem testId="group-menu-ungroup" onClick={act(onUngroup)}>
        Ungroup
      </MenuItem>
      {groupWith && (
        <MenuItem testId="group-menu-group" onClick={act(groupWith.onGroup)}>
          {groupWithLabel(groupWith.count, 'it')}
        </MenuItem>
      )}
      <hr className="ctx-sep" />
      <MenuItem testId="group-menu-duplicate" onClick={act(onDuplicate)}>
        Duplicate
      </MenuItem>
      <MenuItem testId="group-menu-delete" danger onClick={act(onDelete)}>
        Delete…
      </MenuItem>
    </ContextMenu>
  );
}

/** Change the animation of a block (appear and disappear ones), the effect of an Emphasis block,
 * or edit its pairs (a morph), duplicate it (a block that names glyphs: also for the other glyphs,
 * alongside it), split it (into runs of consecutive glyphs, or by choice), delete it. A morph's
 * copy has no pairs (a target arrives through one pair only), and its item says so. A block of
 * an arrow, which takes all of it, has no split and no copy for other glyphs. A member of an
 * unfolded group has the group's items first. */
export function BlockMenu({
  x,
  y,
  action,
  formula,
  onChange,
  onChangeEffect,
  onEditPairs,
  onDuplicate,
  canDuplicateOthers,
  onDuplicateOthers,
  split,
  onSplitRuns,
  onSplit,
  onDelete,
  group,
  groupWith,
  onClose,
}: BlockMenuProps) {
  const act = (run: () => void) => () => {
    onClose();
    run();
  };
  const change = action.kind === 'appear' || action.kind === 'disappear';
  return (
    <ContextMenu x={x} y={y} label="Animation block" testId="block-menu" onClose={onClose}>
      <div className="ctx-header" data-testid="block-menu-header">
        {blockLabel(action)}
      </div>
      {group && (
        <>
          <MenuItem testId="block-menu-fold" onClick={act(group.onFold)}>
            Fold the group
          </MenuItem>
          <MenuItem testId="block-menu-leave" onClick={act(group.onLeave)}>
            Take out of the group
          </MenuItem>
          <MenuItem testId="block-menu-ungroup" onClick={act(group.onUngroup)}>
            Ungroup
          </MenuItem>
        </>
      )}
      {groupWith && (
        <MenuItem testId="block-menu-group" onClick={act(groupWith.onGroup)}>
          {groupWithLabel(groupWith.count, group ? 'its group' : 'it')}
        </MenuItem>
      )}
      {(group || groupWith) && <hr className="ctx-sep" />}
      {change && (
        <>
          <div className="ctx-header ctx-group">Change animation</div>
          {appearChoicesOf(formula).map((k) => (
            <MenuItem
              key={k.value}
              testId={`block-menu-change-${k.value}`}
              current={action.kind === 'appear' && action.anim === k.value}
              onClick={act(() => onChange('appear', k.value))}
            >
              {CATEGORY_LABEL.appear} · {k.label}
            </MenuItem>
          ))}
          {disappearChoicesOf(formula).map((k) => (
            <MenuItem
              key={k.value}
              testId={`block-menu-change-${k.value}`}
              current={action.kind === 'disappear' && action.anim === k.value}
              onClick={act(() => onChange('disappear', k.value))}
            >
              {CATEGORY_LABEL.disappear} · {k.label}
            </MenuItem>
          ))}
          <hr className="ctx-sep" />
        </>
      )}
      {action.kind === 'emphasis' && (
        <>
          <div className="ctx-header ctx-group">Change effect</div>
          {emphasisChoicesOf(formula).map((k) => (
            <MenuItem
              key={k.value}
              testId={`block-menu-effect-${k.value}`}
              current={action.effect === k.value}
              onClick={act(() => onChangeEffect(k.value))}
            >
              {k.label}
            </MenuItem>
          ))}
          <hr className="ctx-sep" />
        </>
      )}
      {action.kind === 'morph' && (
        <>
          <MenuItem testId="block-menu-pairs" onClick={act(onEditPairs)}>
            Edit pairs…
          </MenuItem>
          <hr className="ctx-sep" />
        </>
      )}
      <MenuItem testId="block-menu-duplicate" onClick={act(onDuplicate)}>
        {action.kind === 'morph' ? 'Duplicate without pairs' : 'Duplicate'}
      </MenuItem>
      {/* A block takes an arrow whole (audit A5-07): it is not split, nor copied for some of
          the arrow's glyphs. */}
      {isGlyphBlock(action) && !(formula && animatedWhole(formula)) && (
        <>
          <MenuItem
            testId="block-menu-duplicate-others"
            disabled={!canDuplicateOthers}
            onClick={act(onDuplicateOthers)}
          >
            Duplicate for the other glyphs
          </MenuItem>
          <MenuItem
            testId="block-menu-split-runs"
            disabled={(split?.runs ?? 0) < 2}
            onClick={act(onSplitRuns)}
          >
            Split into runs
          </MenuItem>
          <MenuItem
            testId="block-menu-split"
            disabled={(split?.glyphs ?? 0) < 2}
            onClick={act(onSplit)}
          >
            Split…
          </MenuItem>
        </>
      )}
      <MenuItem testId="block-menu-delete" danger onClick={act(onDelete)}>
        Delete…
      </MenuItem>
    </ContextMenu>
  );
}

interface AddAnimationButtonProps {
  clipId: ClipId;
  /** Called with why a block could not be added, or null after one was. */
  onNotice(reason: string | null): void;
}

/** "Add animation": the same menu as a right-click on the clip, for the playhead — or for the
 * region, while one is marked on the timeline (D180). */
export function AddAnimationButton({ clipId, onNotice }: AddAnimationButtonProps) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const time = useUiStore((s) => s.time);
  const region = useTimelineStore((s) => s.region);
  const start = useProjectStore((s) => s.project.clips.find((c) => c.id === clipId)?.start);
  const end = useProjectStore((s) => s.project.clips.find((c) => c.id === clipId)?.end);
  // In the panel the time is the playhead's, wherever it is; a region wins over it.
  const where: AddTime =
    region && start !== undefined && end !== undefined
      ? regionAddTime({ start, end }, region)
      : { time, atPlayhead: true };
  const formula = useProjectStore((s) => {
    const clip = s.project.clips.find((c) => c.id === clipId);
    return s.project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? 'clip';
  });
  const subject = useProjectStore((s) =>
    clipSubject(
      s.project,
      s.project.clips.find((c) => c.id === clipId),
    ),
  );
  const arrow = useProjectStore((s) => clipIsArrow(s.project, clipId));
  return (
    <>
      <button
        type="button"
        className="an-small-button an-accent-button"
        data-testid="add-animation"
        aria-haspopup="menu"
        title={
          where.region
            ? `Add an animation in the region (${regionLabel(where.region)})`
            : `Add an animation at the playhead (${time.toFixed(2)} s)`
        }
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setAt({ x: box.left, y: box.bottom + 2 });
        }}
      >
        Add animation
      </button>
      {at && (
        <AddAnimationMenu
          x={at.x}
          y={at.y}
          header={`${formula} · ${addTimeLabel(where)}`}
          subject={subject}
          arrow={arrow}
          onRetarget={subject === 'shape' ? () => startRetarget(clipId) : undefined}
          onPick={(block) => {
            const outcome = addBlock(clipId, block, useUiStore.getState().time, {
              atPlayhead: true,
            });
            onNotice(outcome.ok ? null : outcome.reason);
          }}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}
