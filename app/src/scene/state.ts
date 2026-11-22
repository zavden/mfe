/* Discrete clip states: what a clip looks like before and after each tween action. */
import {
  isGlyphEnd,
  TIME_EPSILON,
  type ActionId,
  type Clip,
  type ClipState,
  type Easing,
  type Placement,
  type ShapeFitBox,
  type Target,
  type TweenAction,
  type TweenEnds,
} from '../model';
import { rateFunction } from './easing';

/** Apply a partial target; `glyphColors` merges into the current per-glyph colours. */
function applyState(state: ClipState, to: Partial<ClipState>): ClipState {
  return {
    ...state,
    ...to,
    position: to.position ? [to.position[0], to.position[1]] : state.position,
    glyphColors: to.glyphColors ? { ...state.glyphColors, ...to.glyphColors } : state.glyphColors,
  };
}

/** Easings whose rate is 0 at the end (`there_and_back`, `there_and_back_with_pause`): Manim's
 * `finish()` interpolates at alpha 1, so a tween with one of them leaves the clip in the state it
 * started from. */
const ENDS_AT_START: ReadonlySet<Easing> = new Set(['there_and_back', 'there_and_back_with_pause']);

export function endsAtStart(easing: Easing): boolean {
  return ENDS_AT_START.has(easing);
}

/** The size a shape's clip draws its shape at: the box a tween fitted it to (`TweenFit`), or
 * null for the object's own, which its render has. */
export type FitSize = Pick<ShapeFitBox, 'width' | 'height'> | null;

export interface ActionStates {
  action: TweenAction;
  /** State when the action starts. */
  from: ClipState;
  /** The action's target (what it animates towards). */
  to: ClipState;
  /** State once the action has ended: `to`, or `from` for an easing that ends at the start. */
  after: ClipState;
  /** A tween that carries its shape to other glyphs, once fitted: the sizes the shape is drawn
   * at when it starts and when it has arrived (`after`: once it has ended). Absent otherwise. */
  fit?: { from: FitSize; to: FitSize; after: FitSize };
  /** A tween that carries the ends of its line, once measured (`TweenEnds`): where it puts them.
   * `to` is then where the centre of that line is. Absent otherwise. */
  ends?: TweenEnds;
}

/** The fields of a state that place the object: what a fit gives, and so never takes. */
const PLACEMENT_FIELDS = ['position', 'scale', 'rotation', 'flipX', 'flipY'] as const;

/** Where a fitted tween leaves its shape: on the fit's centre, unturned, at scale 1 — a new
 * shape built on the new target, as Manim builds it. */
function fitPlacement(box: ShapeFitBox): Placement {
  return {
    position: [box.center[0], box.center[1]],
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  };
}

/** The clip's tweens (the actions that move the whole formula), in start order. */
export function tweensOf(clip: Clip): TweenAction[] {
  return clip.actions
    .filter((a): a is TweenAction => a.kind === 'tween')
    .sort((a, b) => a.start - b.start);
}

/** Tweens in start order with the state before, the target, and the state after each one. */
export function actionStates(clip: Clip): ActionStates[] {
  const sorted = tweensOf(clip);
  const out: ActionStates[] = [];
  let state = clip.initial;
  let size: FitSize = null;
  for (const action of sorted) {
    const box = action.fit?.fitted ?? null;
    const drawn = action.ends?.drawn ?? null;
    // A fit sets the placement, whatever `to` says of it; one not fitted yet moves nothing. So
    // do the ends a tween carries a line to: the clip is then at the centre of that line.
    const placed = box
      ? { ...action.to, ...fitPlacement(box) }
      : drawn
        ? { ...action.to, ...fitPlacement({ center: drawn.center, width: 0, height: 0 }) }
        : action.to;
    const to = applyState(state, placed);
    const back = endsAtStart(action.easing);
    const after = back ? state : to;
    if (drawn && action.ends) {
      out.push({ action, from: state, to, after, ends: action.ends });
      state = after;
      continue;
    }
    if (box) {
      const arrived = { width: box.width, height: box.height };
      out.push({
        action,
        from: state,
        to,
        after,
        fit: { from: size, to: arrived, after: back ? size : arrived },
      });
      if (!back) size = arrived;
    } else out.push({ action, from: state, to, after });
    state = after;
  }
  return out;
}

/** The keyframe a direct edit at a given time changes (e.g. dragging the clip in the preview). */
export type KeyframeRef = { kind: 'initial' } | { kind: 'action'; actionId: ActionId };

/** Keyframe in effect at absolute time t: the target of the latest action that has started by
 * t (so an edit during a tween changes that tween's target), else the clip's initial state. A
 * finished action that ends at its start state (`endsAtStart`) leaves the keyframe before it in
 * effect. `state` is the full state at that keyframe, to compute edits relative to it. */
export function keyframeAt(clip: Clip, t: number): { ref: KeyframeRef; state: ClipState } {
  let found: { ref: KeyframeRef; state: ClipState } = {
    ref: { kind: 'initial' },
    state: clip.initial,
  };
  for (const { action, to } of actionStates(clip)) {
    const start = clip.start + action.start;
    if (start > t + TIME_EPSILON) break;
    const ended = t >= start + action.duration - TIME_EPSILON;
    if (ended && endsAtStart(action.easing)) continue;
    found = { ref: { kind: 'action', actionId: action.id }, state: to };
  }
  return found;
}

/** The tween that has carried the clip's shape to other glyphs and still places it at `t`
 * (`TweenFit`): the keyframe in effect there, when it is one of those. Null otherwise — before
 * any, or once a plain tween after it has moved the shape on. */
export function fitInEffect(clip: Clip, t: number): TweenAction | null {
  const { ref } = keyframeAt(clip, t);
  if (ref.kind !== 'action') return null;
  const action = clip.actions.find((a) => a.id === ref.actionId);
  return action?.kind === 'tween' && action.fit ? action : null;
}

/** The tween that has carried the ends of the clip's line and still places it at `t`
 * (`TweenEnds`): the keyframe in effect there, when it is one of those. Null otherwise. */
export function endsInEffect(clip: Clip, t: number): TweenAction | null {
  const { ref } = keyframeAt(clip, t);
  if (ref.kind !== 'action') return null;
  const action = clip.actions.find((a) => a.id === ref.actionId);
  return action?.kind === 'tween' && action.ends ? action : null;
}

/** Merge `patch` into a keyframe of `clip` (mutates; use inside a store recipe). */
export function patchKeyframe(clip: Clip, ref: KeyframeRef, patch: Partial<ClipState>): void {
  if (ref.kind === 'initial') {
    clip.initial = applyState(clip.initial, patch);
    return;
  }
  const action = clip.actions.find((a) => a.id === ref.actionId);
  if (action?.kind !== 'tween') return;
  if (!action.fit && !action.ends) {
    action.to = { ...action.to, ...patch };
    return;
  }
  // A line between two free points is moved by moving the two: its place is theirs to give.
  const { ends } = action;
  if (ends?.drawn && patch.position && !isGlyphEnd(ends.start) && !isGlyphEnd(ends.end)) {
    const dx = patch.position[0] - ends.drawn.center[0];
    const dy = patch.position[1] - ends.drawn.center[1];
    const moved = ([x, y]: readonly [number, number]): [number, number] => [x + dx, y + dy];
    ends.start = { point: moved(ends.start.point) };
    ends.end = { point: moved(ends.end.point) };
    ends.drawn = {
      ...ends.drawn,
      start: moved(ends.drawn.start),
      end: moved(ends.drawn.end),
      center: moved(ends.drawn.center),
    };
  }
  // A fit places its shape itself, and the ends of a line place it: only an appearance is
  // written into it.
  const appearance: Partial<ClipState> = { ...patch };
  for (const field of PLACEMENT_FIELDS) delete appearance[field];
  action.to = { ...action.to, ...appearance };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The clip's whole state as shown at absolute time `t` (for editor overlays and the property
 * clipboard): the state the finished tweens left, or a blend while one runs — the evaluator's
 * rule, one eased alpha driving position, scale, rotation and opacity; the flips, the colour
 * override, the per-glyph colours and a shape's paint are those of the nearer keyframe (they
 * switch at the middle). Intros and outros do not change the clip, so they are ignored. */
export function stateAt(clip: Clip, t: number, target: Target): ClipState {
  let state = clip.initial;
  for (const { action, from, to, after } of actionStates(clip)) {
    const start = clip.start + action.start;
    if (t < start - TIME_EPSILON) break;
    if (action.duration > 0 && t < start + action.duration - TIME_EPSILON) {
      const alpha = rateFunction(action.easing, target)((t - start) / action.duration);
      // The flips, the colours and a shape's paint: the nearer keyframe's.
      const near = alpha < 0.5 ? from : to;
      return {
        ...near,
        position: [
          lerp(from.position[0], to.position[0], alpha),
          lerp(from.position[1], to.position[1], alpha),
        ],
        scale: lerp(from.scale, to.scale, alpha),
        rotation: lerp(from.rotation, to.rotation, alpha),
        opacity: lerp(from.opacity, to.opacity, alpha),
      };
    }
    state = after;
  }
  return state;
}

/** Where the clip's formula sits at absolute time `t` (the selection box, the transform
 * handles): the placement of `stateAt`. */
export function placementAt(clip: Clip, t: number, target: Target): Placement {
  const { position, scale, rotation, flipX, flipY } = stateAt(clip, t, target);
  return { position, scale, rotation, flipX, flipY };
}
