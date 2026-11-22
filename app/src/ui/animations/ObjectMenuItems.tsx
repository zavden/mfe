/* The entries of a clip about its own object in a context menu (D118, D120) — the preview's
 * menu on the object and the timeline's menu on its clip show the same ones. Every clip has
 * «Intro ›» and «Outro ›» (the animation it starts and ends with, None among them; the current
 * one is ticked) and «Remove animations» (the intro, the outro and the blocks, but the Morph
 * ones). A formula or a text has «Remove relations» as well: its transformations of glyphs, the
 * relations with other clips and its Morph blocks; and «Unlink formula (make a copy)»: the clip
 * takes a copy of its formula of its own, off — the tooltip says why — when the formula has no
 * other clip (`timeline/unlinkClips.ts`, `unlinkClipsById`). A brace or a shape has «Colour ›» (the
 * object's), «Direction ›» (an attached brace: the side it is on) and «Detach» (while it hangs
 * on something). A line has «Become ›» — another of the four kinds of line, the one it is ticked
 * (D148) —, «Reverse points» — its start and its end change places (D147) —, «Curve ›» — bend
 * it into an arc or a spline, or shape the spline it is; and copy the shape of its path, or give
 * it the copied one (D151) — and «Detach ›» (an end, or both). The actions are `objectActions.ts`
 * and `braceActions.ts`; a clip on a locked track has the entries off, but the copy of its path,
 * which changes nothing. */
import type { ReactNode } from 'react';
import { BRACE_SIDE_DEGREES, isGlyphEnd, KINDS, type ClipId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { ColourSwatches } from '../colors/ColourSwatches';
import { MenuItem, Submenu } from '../ContextMenu';
import { LINE_KINDS, LINE_LABELS } from '../creator/sources';
import {
  bendLine,
  bendsOf,
  copyLineShape,
  describePathShape,
  editLineCurve,
  pasteLineShape,
  reverseLine,
  useLineShapeClipboard,
  withPathShape,
} from '../preview/lineCurve';
import { freeLineEnd, freeLineEnds, lineEndsHeld, setLineKind } from '../preview/lineDraw';
import { unlinkClipsById } from '../timeline/clipActions';
import { editableClips } from '../timeline/clipOps';
import { planUnlink, unlinkEntry } from '../timeline/unlinkClips';
import { splitAtPlayhead, splitEntry } from '../timeline/splitActions';
import { usePreferences } from '../preferences';
import { BRACE_SIDES, detachClip, setBraceDirection, SIDE_LABELS } from './braceActions';
import { introChoicesOf, OUTRO_CHOICES } from './catalogue';
import {
  clipHasAnimations,
  clipHasTransformations,
  removeClipAnimations,
  removeClipTransformations,
  setClipPhase,
  setObjectColour,
} from './objectActions';

interface ObjectMenuItemsProps {
  clipId: ClipId;
  /** The test ids are `<testIdPrefix>-color`, `-direction`, `-intro`, `-outro`, `-become` (each
   * with its items' `-<choice>`), `-remove-animations`, `-remove-relations`, `-unlink` and
   * `-detach`. */
  testIdPrefix: string;
  /** Entries of the menu's own that go with the clip's times, right after «Outro ›» (the
   * timeline's «Timing ›»). */
  afterOutro?: ReactNode;
  /** Close the menu: called before an entry acts. */
  onClose(): void;
}

export function ObjectMenuItems({
  clipId,
  testIdPrefix: ids,
  afterOutro,
  onClose,
}: ObjectMenuItemsProps) {
  const project = useProjectStore((state) => state.project);
  const time = useUiStore((state) => state.time);
  const suffix = usePreferences((state) => state.splitSuffix);
  const copiedShape = useLineShapeClipboard((state) => state.copied);
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
  if (!clip || !formula) return null;
  const locked = editableClips(project, [clipId]).length === 0;
  const act = (action: () => void) => () => {
    onClose();
    action();
  };
  const { attach } = clip;
  const { outros, transfers } = KINDS[formula.kind];
  // A line: its two ends as what places it at the playhead has them (its clip, or the
  // Transform in effect there, D144).
  const held = formula.kind === 'line' ? lineEndsHeld(clip, 'playhead') : null;
  const onGlyphs = (side: 'start' | 'end'): boolean => {
    const end = held?.[side] ?? null;
    return end !== null && isGlyphEnd(end);
  };
  /** A brace or a shape: an object drawn for another, with a colour and an attachment. */
  const fitted = formula.kind === 'brace' || formula.kind === 'shape';
  /** «Unlink formula (make a copy)», for an object the Creator lists; null for any other. */
  const unlink = unlinkEntry(project, planUnlink(project, [clipId]), 'clip');
  /** «Split at playhead (S)»: off unless the playhead is inside the clip. */
  const split = splitEntry(project, [clipId], time, suffix);
  return (
    <>
      {fitted && (
        <Submenu label="Colour" testId={`${ids}-color`} disabled={locked}>
          <ColourSwatches
            testIdPrefix={`${ids}-color`}
            onPick={(hex) => act(() => setObjectColour(clipId, hex))()}
          />
        </Submenu>
      )}
      {attach?.rule === 'brace' && (
        <Submenu label="Direction" testId={`${ids}-direction`} disabled={locked}>
          {BRACE_SIDES.map((side) => (
            <MenuItem
              key={side}
              testId={`${ids}-direction-${side}`}
              current={Math.abs(attach.direction - BRACE_SIDE_DEGREES[side]) < 1e-9}
              onClick={act(() => setBraceDirection(clipId, BRACE_SIDE_DEGREES[side]))}
            >
              {SIDE_LABELS[side]}
            </MenuItem>
          ))}
        </Submenu>
      )}
      <Submenu label="Intro" testId={`${ids}-intro`} disabled={locked}>
        {introChoicesOf(formula).map((choice) => (
          <MenuItem
            key={choice.value}
            testId={`${ids}-intro-${choice.value}`}
            current={clip.intro.kind === choice.value}
            onClick={act(() => void setClipPhase(clipId, 'intro', choice.value))}
          >
            {choice.label}
          </MenuItem>
        ))}
      </Submenu>
      <Submenu label="Outro" testId={`${ids}-outro`} disabled={locked}>
        {OUTRO_CHOICES.filter((choice) => outros.includes(choice.value)).map((choice) => (
          <MenuItem
            key={choice.value}
            testId={`${ids}-outro-${choice.value}`}
            current={clip.outro.kind === choice.value}
            onClick={act(() => void setClipPhase(clipId, 'outro', choice.value))}
          >
            {choice.label}
          </MenuItem>
        ))}
      </Submenu>
      {afterOutro}
      <MenuItem
        testId={`${ids}-remove-animations`}
        disabled={locked || !clipHasAnimations(clip)}
        onClick={act(() => removeClipAnimations(clipId))}
      >
        Remove animations
      </MenuItem>
      {transfers && (
        <MenuItem
          testId={`${ids}-remove-relations`}
          disabled={locked || !clipHasTransformations(project, clip)}
          onClick={act(() => removeClipTransformations(clipId))}
        >
          Remove relations
          {clip.actions.some((action) => action.kind === 'morph') && (
            <span className="ctx-hint">and Morph blocks</span>
          )}
        </MenuItem>
      )}
      {unlink && (
        <MenuItem
          testId={`${ids}-unlink`}
          disabled={unlink.disabled}
          title={unlink.title}
          onClick={act(() => void unlinkClipsById([clipId]))}
        >
          {unlink.label}
        </MenuItem>
      )}
      {split && (
        <MenuItem
          testId={`${ids}-split`}
          disabled={split.disabled}
          title={split.title}
          onClick={act(() => void splitAtPlayhead([clipId]))}
        >
          {split.label}
        </MenuItem>
      )}
      {formula.kind === 'line' && (
        <Submenu
          label="Become"
          testId={`${ids}-become`}
          disabled={locked}
          title="Make this line another kind of line: it keeps its ends, its curve and its tips"
        >
          {LINE_KINDS.map((line) => (
            <MenuItem
              key={line}
              testId={`${ids}-become-${line}`}
              current={formula.line === line}
              onClick={act(() => setLineKind(formula.id, line))}
            >
              {LINE_LABELS[line]}
            </MenuItem>
          ))}
        </Submenu>
      )}
      {formula.kind === 'line' && (
        <MenuItem
          testId={`${ids}-reverse`}
          disabled={locked}
          onClick={act(() => void reverseLine(formula.id))}
        >
          Reverse points
          <span className="ctx-hint">start ⇄ end</span>
        </MenuItem>
      )}
      {formula.kind === 'line' && (
        <Submenu
          label="Curve"
          testId={`${ids}-curve`}
          title="Bend this line, or give it the path of another"
        >
          <MenuItem
            testId={`${ids}-curve-arc`}
            disabled={locked || !bendsOf(formula.curve).includes('arc')}
            onClick={act(() => void bendLine(formula.id, 'arc'))}
          >
            Arc
            <span className="ctx-hint">
              {formula.curve?.shape === 'arc' ? `${formula.curve.degrees}°` : 'path_arc'}
            </span>
          </MenuItem>
          <MenuItem
            testId={`${ids}-curve-spline`}
            disabled={locked}
            onClick={act(() => void editLineCurve(clipId))}
          >
            {formula.curve?.shape === 'spline' ? 'Edit curve' : 'Spline'}
            <span className="ctx-hint">points and handles</span>
          </MenuItem>
          <hr className="ctx-sep" />
          <MenuItem
            testId={`${ids}-curve-copy`}
            onClick={act(() => void copyLineShape(formula.id))}
          >
            Copy path shape
            <span className="ctx-hint">{describePathShape(formula.curve)}</span>
          </MenuItem>
          <MenuItem
            testId={`${ids}-curve-paste`}
            disabled={
              locked || !copiedShape || withPathShape(formula.curve, copiedShape.curve) === null
            }
            onClick={act(() => void pasteLineShape([formula.id]))}
          >
            Paste path shape
            <span className="ctx-hint">
              {copiedShape
                ? `${describePathShape(copiedShape.curve)}, of ${copiedShape.from}`
                : 'nothing copied'}
            </span>
          </MenuItem>
        </Submenu>
      )}
      {formula.kind === 'line' && (
        <Submenu
          label="Detach"
          testId={`${ids}-detach-ends`}
          disabled={locked || !(onGlyphs('start') || onGlyphs('end'))}
          title={
            onGlyphs('start') || onGlyphs('end') ? undefined : 'Both ends of this line are free'
          }
        >
          {(['start', 'end'] as const).map((side) => (
            <MenuItem
              key={side}
              testId={`${ids}-detach-${side}`}
              icon={<span className="line-end-dot" data-side={side} />}
              disabled={!onGlyphs(side)}
              onClick={act(() => void freeLineEnd(clipId, side))}
            >
              Detach {side}
              {!onGlyphs(side) && <span className="ctx-hint">free</span>}
            </MenuItem>
          ))}
          <MenuItem
            testId={`${ids}-detach-all`}
            icon={
              <>
                <span className="line-end-dot is-half" data-side="start" />
                <span className="line-end-dot is-half" data-side="end" />
              </>
            }
            onClick={act(() => void freeLineEnds(clipId))}
          >
            Detach all
          </MenuItem>
        </Submenu>
      )}
      {fitted && attach && (
        <MenuItem
          testId={`${ids}-detach`}
          disabled={locked}
          onClick={act(() => detachClip(clipId))}
        >
          Detach
        </MenuItem>
      )}
    </>
  );
}
