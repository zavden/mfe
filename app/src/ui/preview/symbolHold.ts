/* Align by symbol between two instants: what can go wrong, and what to say about it.
 *
 * The symbol to move can be *kept* as it is at one instant (G, `symbolAlign.ts`) while its
 * reference is picked at another: the formula that comes in and the one it comes from are often
 * never whole on screen together. The move then writes the keyframe in effect at the kept
 * instant, and nothing else of the timeline. Two things can make that go wrong, and this module
 * tells them apart:
 *
 *   - a *refusal* (`alignRefusal`): the move cannot be written, or once written the symbols would
 *     not line up — the formula hangs on another one, is locked, or is moving at that instant (a
 *     transformation of the formula, of that part or an emphasis is running: the keyframe is the
 *     one it is moving to, so a shift of it shows only in part there);
 *   - a *warning* (`alignWarnings`): the move was made and the symbols line up as each was at its
 *     own instant, but something moves beyond that — another transformation takes the formula to
 *     a position of its own, only the end of a transformation moved, the symbol was moved as a
 *     part, or the reference is elsewhere by the time the formula is there.
 *
 * Pure: the store passes the project and what the preview may edit, and shows what comes back. */
import type { Box } from '../../geom';
import {
  attachTargets,
  EMPHASIS,
  onScreenAt,
  TIME_EPSILON,
  type Clip,
  type ClipAction,
  type ClipId,
  type Project,
  type Target,
} from '../../model';
import { endsAtStart, rateFunction, tweensOf, type KeyframeRef } from '../../scene';
import { partEditOf, previewEdit, type TransformEditTarget } from '../animations/transformEdit';
import { DIRECTION_LABELS, type Direction } from './glyphAlign';
import { previewEditableClips } from './previewLock';

/** What the preview may edit of a clip: the end state under edit (a block's end icon) and the
 * clips the user unlocked after their transformations. */
export interface EditRights {
  editing: TransformEditTarget | null;
  unlocked: readonly ClipId[];
}

/** A symbol kept in time: the instant it is measured at, and the end state that was under edit
 * on its formula then — the keyframe the move writes in that case (that edit itself ends as soon
 * as the playhead leaves). */
export interface SymbolHold {
  at: number;
  editing: TransformEditTarget | null;
}

/** What moves the symbol at an instant: a transformation of the whole formula, one of the part
 * the symbol belongs to, or an emphasis that swells or turns it. */
export type Motion = 'tween' | 'part' | 'emphasis';

/** Why a formula cannot be aligned by a symbol measured at an instant. */
export type AlignRefusal =
  /** Not on screen at that instant (or the symbol is not there): nothing to measure. The store
   * finds this one, from the geometry. */
  | { kind: 'off-screen' }
  /** Placed by the glyphs it hangs on (`clip.attach`): what is written is derived again. */
  | { kind: 'attached'; to: ClipId[] }
  /** On a locked track, or locked in the preview. */
  | { kind: 'locked' }
  /** The end state of one of its part transforms is under edit: an edit would go to the part. */
  | { kind: 'part-edit' }
  /** Locked after its transformations, and one of them has started by that instant. */
  | { kind: 'after-transform' }
  /** Moving at that instant: `what` runs from `from` to `until` (seconds). */
  | { kind: 'moving'; what: Motion; from: number; until: number };

/** The span of an action of `clip` when it is running at `t`: started, with time left. */
function runningAt(
  clip: Clip,
  action: ClipAction,
  t: number,
): { from: number; until: number } | null {
  const from = clip.start + action.start;
  const until = from + action.duration;
  if (action.duration <= 0 || t < from - TIME_EPSILON || t >= until - TIME_EPSILON) return null;
  return { from, until };
}

/** What moves glyph `glyph` of `clip` at `t`, when the move would write keyframe `ref`. A tween
 * that is at its target at `t` (the middle of a `there_and_back`, where its end icon looks) moves
 * nothing when it is the one written: a shift of its target shows whole there. */
function motionAt(
  clip: Clip,
  glyph: number,
  t: number,
  ref: KeyframeRef,
  target: Target,
): AlignRefusal | null {
  for (const action of clip.actions) {
    const span = runningAt(clip, action, t);
    if (!span) continue;
    if (action.kind === 'tween') {
      const alpha = rateFunction(action.easing, target)((t - span.from) / action.duration);
      const written = ref.kind === 'action' && ref.actionId === action.id;
      if (written && Math.abs(alpha - 1) < 1e-9) continue;
      return { kind: 'moving', what: 'tween', ...span };
    }
    if (action.kind === 'transform') {
      const moves =
        action.shift[0] !== 0 ||
        action.shift[1] !== 0 ||
        action.scale !== 1 ||
        action.rotation !== 0;
      if (moves && action.glyphs.includes(glyph)) return { kind: 'moving', what: 'part', ...span };
    }
    if (action.kind === 'emphasis' && EMPHASIS[action.effect].animates) {
      const moves = action.scale !== 1 || (action.effect === 'wiggle' && action.angle !== 0);
      const takes = action.glyphs === 'all' || action.glyphs.includes(glyph);
      if (moves && takes) return { kind: 'moving', what: 'emphasis', ...span };
    }
  }
  return null;
}

/** Why `clip` cannot be aligned by its glyph `glyph` as it is at `t`, or null when it can: the
 * keyframe in effect at `t` can be written, and a shift of it moves the symbol by as much at
 * `t`. */
export function alignRefusal(
  project: Project,
  clip: Clip,
  glyph: number,
  t: number,
  rights: EditRights,
): AlignRefusal | null {
  if (clip.attach) {
    return { kind: 'attached', to: attachTargets(clip.attach).map((target) => target.clipId) };
  }
  if (previewEditableClips(project, [clip.id]).length === 0) return { kind: 'locked' };
  if (partEditOf(clip, rights.editing)) return { kind: 'part-edit' };
  const edit = previewEdit(clip, t, rights.editing, rights.unlocked);
  if ('blocked' in edit) return { kind: 'after-transform' };
  return motionAt(clip, glyph, t, edit.ref, project.meta.target);
}

/** A time as the notices write it. */
export const seconds = (t: number): string => `${t.toFixed(2)} s`;

const MOTION_WORDS: Record<Motion, string> = {
  tween: 'a transformation of the formula',
  part: 'a transformation of that part',
  emphasis: 'an emphasis',
};

/** A formula and one of its symbols, as the notices name them. */
export interface Named {
  /** The formula's name. */
  name: string;
  /** The symbol's label ("=", "x"). */
  label: string;
}

/** The notice of a refusal. `purpose`: the symbol was being kept at `t` (G), or the formula
 * aligned as it is at `t`. `host` names what an attached formula hangs on. */
export function refusalNotice(
  refusal: AlignRefusal,
  purpose: 'keep' | 'align',
  who: Named,
  t: number,
  host = 'another formula',
): { title: string; message: string } {
  const { name, label } = who;
  const title =
    purpose === 'keep' ? `“${label}” cannot be kept at ${seconds(t)}` : `“${name}” was not moved`;
  const verb = purpose === 'keep' ? 'Keep' : 'Align';
  switch (refusal.kind) {
    case 'off-screen':
      return {
        title,
        message:
          `“${name}” is not on screen at ${seconds(t)}. Go to a time when it is, then press G ` +
          'to keep its symbol as it is there.',
      };
    case 'attached':
      return {
        title,
        message:
          `“${name}” is attached to ${host}: it is placed by the glyphs it hangs on. To align ` +
          'it by hand, select it and press Detach in the Animations panel.',
      };
    case 'locked':
      return {
        title,
        message: `“${name}” cannot be moved now: it is on a locked track, or locked in the preview.`,
      };
    case 'part-edit':
      return {
        title,
        message:
          `The end state of a part of “${name}” is being edited, and a move would go to that ` +
          'part. Finish that edit first (Esc).',
      };
    case 'after-transform':
      return {
        title,
        message:
          `“${name}” is locked after its transformations, and one has started by ` +
          `${seconds(t)}. ${verb} it at a time before its first transformation, or at the end ` +
          'state of one (select its block on the timeline and click its end icon), or unlock ' +
          'the clip with the padlock on the timeline.',
      };
    case 'moving':
      return {
        title,
        message:
          `“${label}” is moving at ${seconds(t)}: ${MOTION_WORDS[refusal.what]} runs from ` +
          `${seconds(refusal.from)} to ${seconds(refusal.until)}, so an alignment made there ` +
          `would not hold. ${verb} it at a time when it is at rest.`,
      };
  }
}

/** The instant nearest to `t` at which `clip` is on screen: `t` itself when it is there, else
 * the clip's first instant or its last one. */
export function nearestOnScreen(
  clip: Pick<Clip, 'start' | 'end'>,
  t: number,
  duration: number,
): number {
  if (onScreenAt(clip, t, duration)) return t;
  return t < clip.start ? clip.start : Math.max(clip.start, clip.end - 2 * TIME_EPSILON);
}

const sameBox = (a: Box, b: Box): boolean =>
  Math.abs(a.minX - b.minX) < 1e-6 &&
  Math.abs(a.minY - b.minY) < 1e-6 &&
  Math.abs(a.maxX - b.maxX) < 1e-6 &&
  Math.abs(a.maxY - b.maxY) < 1e-6;

/** The reference symbol of an alignment between two instants, measured twice. */
export interface ReferenceReading extends Named {
  /** The instant it was picked at, and its box there: what the formula was aligned to. */
  at: number;
  box: Box;
  /** The instant nearest to the kept one at which it is on screen (`nearestOnScreen`), and its
   * box there; null when it could not be measured. */
  near: number;
  nearBox: Box | null;
}

export interface AlignedMove extends Named {
  /** The formula that moved, as it is (the move changes positions only). */
  clip: Clip;
  /** Its symbol's canonical glyph. */
  glyph: number;
  /** The instant the symbol was measured at. */
  at: number;
  /** The keyframe the move wrote. */
  ref: KeyframeRef;
  /** The reference, when it was picked at another instant. */
  reference?: ReferenceReading;
}

/** What moves beyond an alignment that was made: one sentence each, none in the clean case (a
 * formula with no transformation after the keyframe that moved, a symbol no part transform
 * moved, a reference that stays where it was picked). */
export function alignWarnings(move: AlignedMove): string[] {
  const { clip, glyph, at, ref, name, label, reference } = move;
  const out: string[] = [];
  const tweens = tweensOf(clip);
  const written = ref.kind === 'action' ? tweens.findIndex((a) => a.id === ref.actionId) : -1;
  // Before the keyframe that moved, the formula is where it was.
  const own = written === -1 ? null : tweens[written]!;
  if (own) {
    out.push(
      `Only the end of the transformation at ${seconds(clip.start + own.start)} moved: before ` +
        `it, “${name}” is where it was.`,
    );
  }
  // A tween's target position is a point of its own (absolute): it does not follow the keyframe
  // before it.
  const fixed = tweens.filter((a, index) => index > written && a.to.position !== undefined);
  if (fixed.length > 0) {
    const times = fixed.map((a) => seconds(clip.start + a.start)).join(', ');
    out.push(
      fixed.length === 1
        ? `The transformation of “${name}” at ${times} takes it to a position of its own, ` +
            'which did not move.'
        : `The transformations of “${name}” at ${times} take it to positions of their own, ` +
            'which did not move.',
    );
  }
  // A part transform that has moved the symbol: the alignment is of the symbol where that left
  // it.
  const part = clip.actions.find(
    (a) =>
      a.kind === 'transform' &&
      a.glyphs.includes(glyph) &&
      clip.start + a.start <= at + TIME_EPSILON &&
      !endsAtStart(a.easing) &&
      (a.shift[0] !== 0 || a.shift[1] !== 0 || a.scale !== 1 || a.rotation !== 0),
  );
  if (part) {
    out.push(
      `“${label}” was moved by a transformation of its part (at ` +
        `${seconds(clip.start + part.start)}): the symbols line up from then on, not before.`,
    );
  }
  if (reference && reference.nearBox && !sameBox(reference.box, reference.nearBox)) {
    out.push(
      `The reference “${reference.label}” of “${reference.name}” moves between ` +
        `${seconds(Math.min(reference.at, reference.near))} and ` +
        `${seconds(Math.max(reference.at, reference.near))}: it was taken where it is at ` +
        `${seconds(reference.at)}.`,
    );
  }
  return out;
}

/** What the closing notice of an alignment between two instants says was done. */
export function alignSummary(
  moved: Named & { at: number },
  reference: Named & { at: number },
  direction: Direction,
): { title: string; message: string } {
  const side = DIRECTION_LABELS[direction].toLowerCase();
  return {
    title: `“${moved.name}” moved`,
    message:
      `The ${side} of its “${moved.label}” as at ${seconds(moved.at)} is on that of ` +
      `“${reference.label}” of “${reference.name}” as at ${seconds(reference.at)}.`,
  };
}
