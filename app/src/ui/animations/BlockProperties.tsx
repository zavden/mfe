/* The Animations panel for one selected animation block: which animation it runs, when, on which
 * glyphs, and what validation says about it. Timing edits are clamped to the block's allowed
 * range (blockRange), like dragging it on the timeline. A tween (a keyframe of the whole formula)
 * keeps its own editor; a transform of a part has its relative shift, scale, rotation, colour and
 * opacity, ARCHITECTURE §5) — and either can turn into the other. A morph within the formula has
 * its pairs' default style, its path arc and a read-only list of its pairs, which its pair editor
 * (ui/morph) edits. An Emphasis block (D73) has its effect and the effect's own settings. */
import { useMemo } from 'react';
import {
  animatedWhole,
  clipLifetimes,
  DEFAULT_COLOR,
  EMPHASIS,
  namesArrowPart,
  PATH_ARC_LIMIT,
  type ActionId,
  type AppearAction,
  type AppearKind,
  type Clip,
  type ClipAction,
  type ClipId,
  type DisappearAction,
  type DisappearKind,
  type EmphasisAction,
  type EmphasisKind,
  type Formula,
  type FormulaSnapshot,
  type MorphAction,
  type PartTransformAction,
  type RelationStyle,
} from '../../model';
import { defaultLagRatio, tweensOf } from '../../scene';
import { history, useProjectStore, useUiStore } from '../../store';
import { openMorphEditor } from '../morph/morphEditorStore';
import { MIN_SCALE } from '../preview/handles';
import { notify } from '../project/noticeStore';
import { usePathEdit } from '../preview/pathEdit';
import { EditedPathDot } from '../relations/EditedPathDot';
import { describePair, wearsEditedPath, pathOfPair } from '../relations/relationOps';
import { STYLE_OPTIONS, styleLabel } from '../relations/styleOptions';
import {
  changeBlockAnimation,
  changeBlockKind,
  changeEmphasisEffect,
  confirmDeleteBlock,
  duplicateBlockForOthers,
  editBlock,
  reportRefused,
  setBlockGlyphs,
  setBlockTiming,
  setMorphStyle,
  splitBlockIntoRuns,
} from './blockActions';
import { blockCategory, blockLabel, blockSubject, CATEGORY_LABEL, wholeHint } from './blockKinds';
import {
  animationLabel,
  appearChoicesOf,
  disappearChoicesOf,
  emphasisChoicesOf,
  PULSE_EASING_CHOICES,
  type Choice,
} from './catalogue';
import { clampTiming, findBlock, type TimingEdit } from './blockRange';
import {
  CheckField,
  ColorField,
  GroupedSelectField,
  NumberField,
  SelectField,
  SliderField,
} from './fields';
import { GlyphPicker } from './GlyphPicker';
import { GroupMembers } from './GroupMembers';
import { complementGlyphs } from './parallel';
import { splitOptions } from './splitBlock';
import { openSplitDialog } from './splitDialogStore';
import { blockIssues } from './issues';
import { IssuesSection } from './IssueList';
import { Section } from './Section';
import { TweenEditor } from './TweenEditor';
import { SpecFields } from './SpecFields';
import { blockContext } from './context';
import { PropertiesHeader } from './PropertiesHeader';

/** `choices`, and `current` after them when it is none of them: a block a file gave something its
 * object does not take still shows what it runs (validation reports it). */
function withCurrent<V extends string>(
  choices: readonly Choice<V>[],
  current: V,
  label: string,
): readonly Choice<V>[] {
  return choices.some((choice) => choice.value === current)
    ? choices
    : [...choices, { value: current, label }];
}

/** The «Animation» select of an Appear or Disappear block of `formula`: what its object takes
 * (`appearChoicesOf`, `disappearChoicesOf`: a line is never grown nor shrunk, an arrow also grows
 * with GrowArrow). */
function animationGroups(formula: Formula | undefined, action: AppearAction | DisappearAction) {
  const group = <V extends AppearKind | DisappearKind>(
    kind: 'appear' | 'disappear',
    choices: readonly Choice<V>[],
  ) => ({
    label: CATEGORY_LABEL[kind],
    options: (action.kind === kind
      ? withCurrent(choices, action.anim as V, animationLabel(action.anim))
      : choices
    ).map((k) => ({ value: `${kind}:${k.value}`, label: k.label })),
  });
  return [
    group('appear', appearChoicesOf(formula)),
    group('disappear', disappearChoicesOf(formula)),
  ];
}

interface BlockPropertiesProps {
  clipId: ClipId;
  actionId: ActionId;
  /** The block dialog (R2) shows the formula in large beside these fields: the Glyphs section
   * keeps its split actions and leaves the picking to it. */
  glyphsAside?: boolean;
}

/** A change to a part transform: its new fields, or what works them out from the block as it is
 * when the change is applied. Shift X and Y are the second kind: each keeps the other coordinate,
 * and the one drawn here is what a drag of the part still held in the preview shows, which the
 * edit gives up. */
type PartPatch =
  Partial<PartTransformAction> | ((current: PartTransformAction) => Partial<PartTransformAction>);

/** The fields of a part transform (ARCHITECTURE §5): the relative shift, scale and rotation, and
 * the colour and opacity the glyphs take when ticked (otherwise they keep theirs). */
function PartFields({
  action,
  patch,
}: {
  action: PartTransformAction;
  patch(change: PartPatch): void;
}) {
  return (
    <>
      <div className="an-row">
        <NumberField
          label="Shift X"
          testId="block-part-shift-x"
          value={action.shift[0]}
          step={0.1}
          onCommit={(v) => patch((now) => ({ shift: [v, now.shift[1]] }))}
        />
        <NumberField
          label="Shift Y"
          testId="block-part-shift-y"
          value={action.shift[1]}
          step={0.1}
          onCommit={(v) => patch((now) => ({ shift: [now.shift[0], v] }))}
        />
        <NumberField
          label="Scale"
          testId="block-part-scale"
          value={action.scale}
          min={MIN_SCALE}
          step={0.1}
          suffix="×"
          onCommit={(v) => patch({ scale: v })}
        />
        <NumberField
          label="Rotation"
          testId="block-part-rotation"
          value={action.rotation}
          step={5}
          suffix="°"
          onCommit={(v) => patch({ rotation: v })}
        />
      </div>
      <div className="an-row">
        <CheckField
          label="Set opacity"
          testId="block-part-opacity-on"
          checked={action.opacity !== null}
          onChange={(on) => patch({ opacity: on ? 1 : null })}
        />
        {action.opacity !== null && (
          <>
            <SliderField
              label=" "
              ariaLabel="Opacity"
              testId="block-part-opacity-slider"
              value={action.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => patch({ opacity: v })}
            />
            <NumberField
              label=" "
              ariaLabel="Opacity value"
              compact
              testId="block-part-opacity"
              value={action.opacity}
              min={0}
              max={1}
              step={0.05}
              onCommit={(v) => patch({ opacity: v })}
            />
          </>
        )}
      </div>
      <div className="an-row">
        <CheckField
          label="Set colour"
          testId="block-part-color-on"
          checked={action.color !== null}
          onChange={(on) => patch({ color: on ? DEFAULT_COLOR : null })}
        />
        <ColorField
          label=" "
          ariaLabel="Colour"
          testId="block-part-color"
          value={action.color ?? DEFAULT_COLOR}
          disabled={action.color === null}
          onCommit={(v) => patch({ color: v })}
        />
      </div>
    </>
  );
}

/** What each Emphasis effect does, under its select. */
const EMPHASIS_HINTS: Record<EmphasisKind, string> = {
  indicate:
    'Indicate: the chosen glyphs swell and take the colour, then come back. A pulse, so its easing is one of the two that come back.',
  wiggle: 'Wiggle: the chosen glyphs swell a little and rock about their centre, then come back.',
  circumscribe:
    'Circumscribe: a rectangle around the chosen glyphs, as they are when the block starts, is traced and untraced in one pass.',
  flash:
    'Flash: twelve lines shoot out of the centre of the chosen glyphs, as they are when the block starts, at each Manim library’s own tempo.',
  focus_on:
    'FocusOn: a disc shrinks from the whole frame onto the centre of the chosen glyphs, as they are when the block starts, over everything.',
};

/** The settings of an Emphasis effect (D73): the colour of what it draws or turns the glyphs
 * into, and the effect's own numbers; the fields of the other effects keep Manim's defaults. */
function EmphasisFields({
  action,
  patch,
}: {
  action: EmphasisAction;
  patch(change: Partial<EmphasisAction>): void;
}) {
  const colour = (
    <ColorField
      label="Colour"
      testId="block-emphasis-color"
      value={action.color}
      onCommit={(v) => patch({ color: v })}
    />
  );
  const scale = (
    <NumberField
      label="Scale"
      testId="block-emphasis-scale"
      value={action.scale}
      min={MIN_SCALE}
      step={0.1}
      suffix="×"
      onCommit={(v) => patch({ scale: v })}
    />
  );
  switch (action.effect) {
    case 'indicate':
      return (
        <div className="an-row">
          {colour}
          {scale}
        </div>
      );
    case 'wiggle':
      return (
        <div className="an-row">
          {scale}
          <NumberField
            label="Angle"
            testId="block-emphasis-angle"
            value={action.angle}
            step={1}
            suffix="°"
            onCommit={(v) => patch({ angle: v })}
          />
          <NumberField
            label="Wiggles"
            testId="block-emphasis-wiggles"
            value={action.wiggles}
            min={1}
            step={1}
            digits={0}
            onCommit={(v) => patch({ wiggles: Math.max(1, Math.round(v)) })}
          />
        </div>
      );
    case 'circumscribe':
      return (
        <>
          <div className="an-row">
            {colour}
            <NumberField
              label="Gap"
              title="Between the glyphs and the rectangle, scene units"
              testId="block-emphasis-buff"
              value={action.buff}
              step={0.05}
              onCommit={(v) => patch({ buff: v })}
            />
          </div>
          <div className="an-row">
            <NumberField
              label="Stroke"
              testId="block-emphasis-stroke-width"
              value={action.strokeWidth}
              min={0}
              step={0.5}
              onCommit={(v) => patch({ strokeWidth: v })}
            />
            <NumberField
              label="Time width"
              title="How much of the rectangle is lit at a time, as a fraction of it"
              testId="block-emphasis-time-width"
              value={action.timeWidth}
              min={0.05}
              step={0.1}
              onCommit={(v) => patch({ timeWidth: v })}
            />
          </div>
        </>
      );
    case 'flash':
      return <div className="an-row">{colour}</div>;
    case 'focus_on':
      return (
        <div className="an-row">
          {colour}
          <SliderField
            label="Opacity"
            testId="block-emphasis-opacity-slider"
            value={action.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch({ opacity: v })}
          />
          <NumberField
            label=" "
            ariaLabel="Opacity value"
            compact
            testId="block-emphasis-opacity"
            value={action.opacity}
            min={0}
            max={1}
            step={0.05}
            onCommit={(v) => patch({ opacity: v })}
          />
        </div>
      );
  }
}

/** The fields of a morph within the formula: the default style of its pairs, the path arc, and its
 * pairs, read-only here ("Edit pairs…" opens the pair editor), each with its Edit path… and the
 * mark of an edited path (`EditedPathDot`) on those whose path was shaped. */
function MorphFields({
  action,
  snapshot,
  patch,
  onEditPairs,
  onEditPath,
}: {
  action: MorphAction;
  snapshot: FormulaSnapshot | null;
  patch(change: Partial<Pick<MorphAction, 'style' | 'pathArc'>>): void;
  onEditPairs(): void;
  /** Shape the custom path of pair `index` in the preview. */
  onEditPath(index: number): void;
}) {
  return (
    <>
      <div className="an-row an-morph-settings">
        <SelectField
          label="Default style"
          testId="block-morph-style"
          value={action.style}
          options={STYLE_OPTIONS}
          onChange={(style: RelationStyle) => patch({ style })}
        />
        <NumberField
          label="Path arc"
          title="Degrees: 0 moves the glyphs along straight lines"
          testId="block-morph-path-arc"
          value={action.pathArc}
          min={-PATH_ARC_LIMIT}
          max={PATH_ARC_LIMIT}
          step={15}
          suffix="°"
          onCommit={(pathArc) => patch({ pathArc })}
        />
      </div>
      <div className="an-morph-pairs" data-testid="block-morph-pairs-list">
        <div className="an-morph-pairs-header">
          <span className="an-label">Pairs</span>
          <button
            type="button"
            className="an-small-button an-accent-button"
            data-testid="block-morph-pairs"
            title="Choose which glyphs turn into which"
            onClick={onEditPairs}
          >
            Edit pairs…
          </button>
        </div>
        {action.pairs.length === 0 ? (
          <p className="an-hint" data-testid="block-morph-pairs-empty">
            No pairs yet: Edit pairs… to choose which glyphs turn into which.
          </p>
        ) : (
          <ul className="an-pairs">
            {action.pairs.map((pair, i) => (
              <li key={i} data-testid={`block-morph-pair-${i}`}>
                <span>
                  {describePair(pair, snapshot, snapshot)}
                  {wearsEditedPath(pair, action) && (
                    <EditedPathDot testId={`block-morph-pair-${i}-path-dot`} />
                  )}
                </span>
                <span className="an-pair-meta" title="Glyph indices">
                  {pair.from.join(' ')} → {pair.to.join(' ')}
                </span>
                {pair.style && (
                  <span className="an-pair-meta" data-testid={`block-morph-pair-${i}-style`}>
                    {styleLabel(pair.style)}
                  </span>
                )}
                <span className="an-pair-meta" data-testid={`block-morph-pair-${i}-path`}>
                  {pathOfPair(pair, action)}
                </span>
                <button
                  type="button"
                  className="an-small-button"
                  data-testid={`block-morph-pair-${i}-edit-path`}
                  title="Shape the curve this pair's glyphs follow, in the preview"
                  onClick={() => onEditPath(i)}
                >
                  Edit path…
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function BlockProperties({ clipId, actionId, glyphsAside }: BlockPropertiesProps) {
  const project = useProjectStore((s) => s.project);
  const select = useUiStore((s) => s.select);
  const clip = project.clips.find((c) => c.id === clipId);
  const action = clip?.actions.find((a) => a.id === actionId);
  const life = useMemo(() => clipLifetimes(project).get(clipId), [project, clipId]);
  if (!clip || !action) return null;

  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  const track = project.tracks.find((t) => t.id === clip.trackId);
  const category = blockCategory(action);
  // A brace and a shape are one piece: their Transform has no part to turn into (D123).
  const subject = blockSubject(formula?.kind);
  const issues = blockIssues(project, clipId, actionId);

  /** Move or resize the block to what `wanted` asks for (relative to the clip), clamped to where
   * it may be. `wanted` gets the clip and the block to plan with: a field keeps the focus when the
   * button goes down on the block, so its Enter can come during a drag of it, and the edit goes to
   * the block that drag leaves (`history.cancelForeignGesture`), not to the one drawn here. */
  const setTiming = (
    edit: TimingEdit,
    wanted: (now: { clip: Clip; action: ClipAction }) => { start: number; end: number },
  ) => {
    history.cancelForeignGesture();
    const live = useProjectStore.getState().project;
    const found = findBlock(live, clipId, actionId);
    if (!found) return;
    const timing = clampTiming(live, found.clip, actionId, wanted(found), edit);
    if (timing.start === found.action.start && timing.duration === found.action.duration) return;
    setBlockTiming(clipId, actionId, timing);
  };

  /** Whole formula (a keyframe) or a part of it: a Transform block can be either. */
  const kindSwitch = (kind: 'tween' | 'transform') => (
    <div className="an-row" role="group" aria-label="What the transform moves">
      {(
        [
          ['tween', 'Whole formula', 'A keyframe: the whole formula moves to a new state'],
          ['transform', 'Part of the formula', 'Chosen glyphs move relative to where they are'],
        ] as const
      ).map(([value, label, title]) => (
        <button
          key={value}
          type="button"
          className={`an-small-button${kind === value ? ' is-on' : ''}`}
          data-testid={`block-kind-${value}`}
          aria-pressed={kind === value}
          title={title}
          onClick={() => {
            if (kind === value) return;
            const outcome = changeBlockKind(clipId, actionId, value);
            if (!outcome.ok) {
              notify({
                kind: 'warning',
                title: 'No room for that animation',
                message: outcome.reason,
              });
            }
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  type Block = AppearAction | DisappearAction | PartTransformAction | EmphasisAction;

  /** Start, duration and easing; for appear and disappear also the lag ratio and fade fields.
   * An Indicate offers the pulse easings only; a Flash runs at each library's own tempo. */
  const timingSection = (block: Block | MorphAction) => {
    const glyphBlock = block.kind === 'appear' || block.kind === 'disappear' ? block : null;
    const effective = life?.actions.get(block.id)?.glyphs.length ?? 0;
    const easingChoices =
      block.kind !== 'emphasis'
        ? undefined
        : block.effect === 'indicate'
          ? PULSE_EASING_CHOICES
          : block.effect === 'flash'
            ? null
            : undefined;
    return (
      <Section title="Timing" testId="block-timing-section" tone="timing">
        <SpecFields
          prefix="block"
          leading={
            <NumberField
              label="Start"
              title="Seconds from the start of the scene"
              testId="block-start"
              value={clip.start + block.start}
              min={clip.start}
              suffix="s"
              onCommit={(v) =>
                setTiming('move', (now) => ({
                  start: v - now.clip.start,
                  end: v - now.clip.start + now.action.duration,
                }))
              }
            />
          }
          duration={block.duration}
          minDuration={0.05}
          easing={block.easing}
          easingChoices={easingChoices}
          lagRatio={glyphBlock ? glyphBlock.lagRatio : null}
          manimLag={
            glyphBlock
              ? defaultLagRatio(glyphBlock.anim, Math.max(1, effective), project.meta.target)
              : undefined
          }
          shift={glyphBlock ? glyphBlock.shift : [0, 0]}
          scale={glyphBlock ? glyphBlock.scale : 1}
          fade={glyphBlock?.anim === 'fade_in' || glyphBlock?.anim === 'fade_out'}
          lag={glyphBlock !== null}
          onDuration={(v) =>
            setTiming('end', (now) => ({ start: now.action.start, end: now.action.start + v }))
          }
          onEasing={(easing) =>
            editBlock(clipId, actionId, (a) => {
              a.easing = easing;
            })
          }
          onLagRatio={(value) =>
            editBlock(clipId, actionId, (a) => {
              if (a.kind === 'appear' || a.kind === 'disappear') a.lagRatio = value;
            })
          }
          onShift={(value) =>
            editBlock(clipId, actionId, (a) => {
              if (a.kind === 'appear' || a.kind === 'disappear') a.shift = value;
            })
          }
          onScale={(value) =>
            editBlock(clipId, actionId, (a) => {
              if (a.kind === 'appear' || a.kind === 'disappear') a.scale = value;
            })
          }
        />
      </Section>
    );
  };

  /** The glyph picker, the two ways to split the block into blocks that run at its time on
   * different glyphs (splitBlock.ts): one per run of consecutive glyphs, or by choice, and a copy
   * for the glyphs it does not animate (parallel.ts). A block takes an arrow whole (audit A5-07):
   * none of these, but the words that say so — and, for a block a file gave a part of one, the
   * button that gives it all of it (`arrow-part`). */
  const glyphsSection = (block: Block) => {
    if (formula && animatedWhole(formula)) {
      const every = Array.from({ length: formula.snapshot?.glyphs.length ?? 0 }, (_, i) => i);
      return (
        <Section title="Glyphs" testId="block-glyphs-section">
          <p className="an-hint" data-testid="block-glyphs-whole">
            {wholeHint(formula)}
          </p>
          {namesArrowPart(formula, block.glyphs) && (
            <div className="an-quick">
              <button
                type="button"
                className="an-small-button"
                data-testid="block-glyphs-all-whole"
                title="Every glyph of the arrow: its shaft and its tips"
                onClick={() =>
                  setBlockGlyphs(clipId, actionId, block.kind === 'transform' ? every : 'all')
                }
              >
                All glyphs
              </button>
            </div>
          )}
        </Section>
      );
    }
    const split = splitOptions(block, life);
    const others = complementGlyphs(project, clip, block).length > 0;
    return (
      <Section title="Glyphs" testId="block-glyphs-section">
        {glyphsAside ? (
          <p className="an-hint" data-testid="block-glyphs-aside">
            Pick the glyphs on the formula beside.
          </p>
        ) : formula ? (
          <GlyphPicker clip={clip} action={block} formula={formula} life={life} />
        ) : (
          <p className="an-hint">This clip has no formula.</p>
        )}
        <div className="an-quick" role="group" aria-label="Split the block">
          <button
            type="button"
            className="an-small-button"
            data-testid="block-split-runs"
            disabled={(split?.runs ?? 0) < 2}
            title="One block per run of consecutive glyphs, all at this time, in parallel"
            onClick={() =>
              reportRefused(splitBlockIntoRuns(clipId, actionId), 'Cannot split this block')
            }
          >
            Split into runs
          </button>
          <button
            type="button"
            className="an-small-button"
            data-testid="block-split"
            disabled={(split?.glyphs ?? 0) < 2}
            title="Move chosen glyphs to a new block at this time, in parallel"
            onClick={() => openSplitDialog(clipId, actionId)}
          >
            Split…
          </button>
          <button
            type="button"
            className="an-small-button"
            data-testid="block-duplicate-others"
            disabled={!others}
            title="A copy of this block at this time, in parallel, for the glyphs it does not animate"
            onClick={() =>
              reportRefused(
                duplicateBlockForOthers(clipId, actionId),
                'Cannot duplicate for the other glyphs',
              )
            }
          >
            Duplicate for the other glyphs
          </button>
        </div>
      </Section>
    );
  };

  const body = () => {
    if (action.kind === 'morph') {
      return (
        <>
          <Section title="Animation" testId="block-animation-section" tone={category}>
            <p className="an-hint" data-testid="block-morph-hint">
              Morph within the formula: chosen glyphs turn into other glyphs of the same formula, as
              the next line of a derivation grows out of the previous one. Targets arrive through
              the morph and skip the intro.
            </p>
            <MorphFields
              action={action}
              snapshot={formula?.snapshot ?? null}
              patch={(change) => {
                // A default style that would give the project an error is refused, as the pair
                // editor refuses it (audit A3-04).
                if (change.style !== undefined) {
                  const outcome = setMorphStyle(clipId, actionId, change.style);
                  if (!outcome.ok) {
                    notify({
                      kind: 'warning',
                      title: 'Default style not changed',
                      message: outcome.reason,
                    });
                  }
                  return;
                }
                editBlock(clipId, actionId, (a) => {
                  if (a.kind === 'morph') Object.assign(a, change);
                });
              }}
              onEditPairs={() => openMorphEditor(clipId, actionId)}
              onEditPath={(index) =>
                usePathEdit
                  .getState()
                  .open({ origin: { kind: 'morph', clipId, actionId }, index }, action.pairs[index])
              }
            />
          </Section>
          {timingSection(action)}
        </>
      );
    }
    if (action.kind === 'tween') {
      return (
        <Section title="Animation" testId="block-animation-section" tone={category}>
          {subject === 'formula' && kindSwitch('tween')}
          <p className="an-hint" data-testid="block-tween-hint">
            {action.fit
              ? 'Transform: the shape goes to surround other glyphs, every point from where it is to its new place.'
              : subject === 'formula'
                ? 'Transform: the whole formula moves to a new state (a keyframe).'
                : `Transform: the ${subject} moves to a new state (a keyframe).`}
          </p>
          <TweenEditor clip={clip} action={action} index={tweensOf(clip).indexOf(action)} />
        </Section>
      );
    }
    if (action.kind === 'emphasis') {
      return (
        <>
          <Section title="Animation" testId="block-animation-section" tone={category}>
            <SelectField
              label="Effect"
              testId="block-effect"
              value={action.effect}
              options={withCurrent(
                emphasisChoicesOf(formula),
                action.effect,
                EMPHASIS[action.effect].label,
              )}
              onChange={(effect: EmphasisKind) => changeEmphasisEffect(clipId, actionId, effect)}
            />
            <p className="an-hint" data-testid="block-emphasis-hint">
              {EMPHASIS_HINTS[action.effect]}
            </p>
            <EmphasisFields
              action={action}
              patch={(change) =>
                editBlock(clipId, actionId, (a) => {
                  if (a.kind === 'emphasis') Object.assign(a, change);
                })
              }
            />
          </Section>
          {timingSection(action)}
          {glyphsSection(action)}
        </>
      );
    }
    if (action.kind === 'transform') {
      return (
        <>
          <Section title="Animation" testId="block-animation-section" tone={category}>
            {kindSwitch('transform')}
            <p className="an-hint" data-testid="block-part-hint">
              The chosen glyphs move relative to where they are when the block starts: the shift in
              scene units, the scale and the rotation about their centre. Ticked, the colour and the
              opacity are set too; otherwise the glyphs keep theirs.
            </p>
            <PartFields
              action={action}
              patch={(change) =>
                editBlock(clipId, actionId, (a) => {
                  if (a.kind !== 'transform') return;
                  Object.assign(a, typeof change === 'function' ? change(a) : change);
                })
              }
            />
          </Section>
          {timingSection(action)}
          {glyphsSection(action)}
        </>
      );
    }
    return (
      <>
        <Section title="Animation" testId="block-animation-section" tone={category}>
          <GroupedSelectField
            label="Animation"
            testId="block-anim"
            value={`${action.kind}:${action.anim}`}
            groups={animationGroups(formula, action)}
            onChange={(value) => {
              const [kind, anim] = value.split(':') as ['appear' | 'disappear', string];
              changeBlockAnimation(clipId, actionId, kind, anim as AppearKind | DisappearKind);
            }}
          />
        </Section>
        {timingSection(action)}
        {glyphsSection(action)}
      </>
    );
  };

  return (
    <div className="an-clip" data-testid="block-properties">
      {track?.locked && (
        <p className="an-notice an-locked" data-testid="block-locked">
          Track “{track.name}” is locked: unlock it on the timeline to edit this animation.
        </p>
      )}
      <PropertiesHeader
        sticky
        context={blockContext(project, clip, action)}
        color={formula?.tag.color}
        titleTestId="block-title"
        title={
          <>
            {formula?.tag.icon ? `${formula.tag.icon} ` : ''}
            {formula?.name ?? '(missing formula)'}
            <span className={`an-block-chip is-${category}`} data-testid="block-name">
              {blockLabel(action)}
            </span>
          </>
        }
      >
        <button
          type="button"
          className="an-small-button"
          data-testid="block-select-clip"
          title="Back to the clip's animations"
          onClick={() => select({ kind: 'clips', ids: [clip.id] })}
        >
          Clip
        </button>
        <button
          type="button"
          className="an-small-button"
          data-testid="block-delete"
          disabled={track?.locked ?? false}
          onClick={() => void confirmDeleteBlock(clipId, actionId)}
        >
          Delete…
        </button>
      </PropertiesHeader>
      <GroupMembers clip={clip} action={action} locked={track?.locked ?? false} />
      <fieldset className="an-fieldset" disabled={track?.locked ?? false}>
        {body()}
        <IssuesSection issues={issues} testId="block-issues-section" listTestId="block-issues" />
      </fieldset>
    </div>
  );
}
