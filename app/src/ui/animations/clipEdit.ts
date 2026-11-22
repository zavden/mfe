/* Pure edits behind the clip properties panel. They mutate a clip inside a store `update`
 * recipe (or return data for one) and keep the clip valid: durations fit, tweens stay inside
 * [intro end, outro start] and clear of each other and of relation windows. */
import {
  actionWindow,
  createTween,
  defaultIntro,
  defaultOutro,
  TIME_EPSILON,
  type Clip,
  type ClipState,
  type Formula,
  type IntroKind,
  type OutroKind,
  type Project,
  type ClipAction,
  type TweenAction,
  type Window,
} from '../../model';
import { keyframeAt } from '../../scene';
import {
  actionSlotAt,
  fitActions,
  freeActionWindows,
  MIN_ACTION_DURATION,
} from '../timeline/clipOps';
import { round6 } from '../time';

export type Phase = 'intro' | 'outro';

/** Longest duration the intro (or outro) may have: the clip minus the other animation. */
export function maxPhaseDuration(clip: Clip, phase: Phase): number {
  const other = phase === 'intro' ? clip.outro.duration : clip.intro.duration;
  return Math.max(0, round6(clip.end - clip.start - other));
}

/** Give the clip's intro (or outro) the animation `kind` with that animation's own options, as
 * long as the animation is by default — or as `duration` says — and as the clip has room for,
 * and no longer than `longest` (what the windows of its relations with clips on locked tracks
 * leave it: `lockedPhaseRoom`); the blocks are fitted to it (`fitActions`: a Transform of the
 * whole formula is cut where the animation runs, or dropped). */
export function setPhaseKind(
  clip: Clip,
  phase: Phase,
  kind: IntroKind | OutroKind,
  duration?: number,
  longest = Infinity,
): void {
  const fresh =
    phase === 'intro' ? defaultIntro(kind as IntroKind) : defaultOutro(kind as OutroKind);
  const spec = clip[phase];
  const fade = kind === 'fade_in' || kind === 'fade_out';
  spec.kind = kind as never;
  spec.easing = fresh.easing;
  spec.lagRatio = null;
  spec.duration =
    kind === 'none'
      ? 0
      : round6(Math.min(duration ?? fresh.duration, maxPhaseDuration(clip, phase), longest));
  if (!fade) {
    spec.shift = [0, 0];
    spec.scale = 1;
  }
  if (kind !== 'none' && spec.duration < MIN_ACTION_DURATION) {
    // No room for an animation: keep the clip valid by leaving it out.
    spec.kind = 'none' as never;
    spec.duration = 0;
  }
  fitActions(clip);
}

/** Make the clip start empty, or as its formula says (`Clip.startsEmpty`, absent when it does
 * not): its intro and its blocks stay as they are. */
export function setStartsEmpty(clip: Clip, startsEmpty: boolean): void {
  if (startsEmpty) clip.startsEmpty = true;
  else delete clip.startsEmpty;
}

type Hiding = Pick<Formula, 'hiddenGlyphs' | 'snapshot'> | undefined;

/** The glyphs that the clip's own list (`Clip.startHidden`, what a split gives its first half)
 * keeps out of its intro: those of the list that the formula has and does not hide itself, which
 * stay out whatever the list says. Ascending, once each. */
export function leftOutGlyphs(clip: Pick<Clip, 'startHidden'>, formula: Hiding): number[] {
  const hidden = new Set(formula?.hiddenGlyphs ?? []);
  const count = formula?.snapshot?.glyphs.length ?? Infinity;
  return [...new Set(clip.startHidden ?? [])]
    .filter((glyph) => !hidden.has(glyph) && glyph < count)
    .sort((a, b) => a - b);
}

/** Bring those glyphs back to the intro, which animates them as the others — unless a relation
 * or a block of the clip brings them later. The glyphs of the list that the formula hides stay
 * in it: shown again in the formula, they are still not the first half's. Without any, the list
 * goes. */
export function clearStartHidden(clip: Clip, formula: Hiding): void {
  const hidden = new Set(formula?.hiddenGlyphs ?? []);
  const kept = [...new Set(clip.startHidden ?? [])]
    .filter((glyph) => hidden.has(glyph))
    .sort((a, b) => a - b);
  if (kept.length > 0) clip.startHidden = kept;
  else delete clip.startHidden;
}

/** "3 glyphs stay out of the intro": what the Intro section says of a clip whose list keeps
 * `count` glyphs out of its intro. */
export function startHiddenLine(count: number): string {
  return count === 1 ? '1 glyph stays out of the intro' : `${count} glyphs stay out of the intro`;
}

/** Which glyphs those are and why, as the tooltips of that line and of its button say it: each
 * by its label and its index, "= (3)", or by its index alone when `labelOf` knows none. */
export function startHiddenReason(
  glyphs: readonly number[],
  labelOf: (glyph: number) => string | undefined = () => undefined,
): string {
  const names = [...glyphs]
    .sort((a, b) => a - b)
    .map((glyph) => {
      const label = labelOf(glyph);
      return label ? `${label} (${glyph})` : String(glyph);
    });
  const one = names.length === 1;
  const named = one
    ? `Glyph ${names[0]}`
    : `Glyphs ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${named}: ${one ? 'it' : 'they'} had not come on screen yet where this clip was split, so its intro leaves ${one ? 'it' : 'them'} out.`;
}

export function setPhaseDuration(clip: Clip, phase: Phase, duration: number): void {
  const spec = clip[phase];
  if (spec.kind === 'none') return;
  spec.duration = round6(
    Math.min(Math.max(duration, MIN_ACTION_DURATION), maxPhaseDuration(clip, phase)),
  );
  fitActions(clip);
}

// --- Tween actions ---------------------------------------------------------------

/** The window a given action may occupy: the free window around it, ignoring the action. */
function windowFor(project: Project, clip: Clip, action: ClipAction): Window | null {
  const without: Clip = { ...clip, actions: clip.actions.filter((a) => a.id !== action.id) };
  const mine = actionWindow(clip, action);
  return (
    freeActionWindows(project, without).find(
      (w) => mine.start >= w.start - TIME_EPSILON && mine.end <= w.end + TIME_EPSILON,
    ) ?? null
  );
}

/** Change an action's start (relative to the clip) and/or duration, clamped into its free
 * window (the time around it not used by the intro, outro, other tweens or relations). Returns false when the action does not exist or has no room. */
export function editActionTiming(
  project: Project,
  clip: Clip,
  actionId: string,
  patch: { start?: number; duration?: number },
): boolean {
  const action = clip.actions.find((a) => a.id === actionId);
  if (!action) return false;
  const free = windowFor(project, clip, action);
  if (!free) return false;
  // The start stays inside the free window; the duration is then limited to what is left of it.
  const wanted = clip.start + (patch.start ?? action.start);
  const start = Math.min(Math.max(wanted, free.start), free.end - MIN_ACTION_DURATION);
  const duration = Math.min(
    Math.max(patch.duration ?? action.duration, MIN_ACTION_DURATION),
    free.end - start,
  );
  action.start = round6(start - clip.start);
  action.duration = round6(duration);
  clip.actions.sort((a, b) => a.start - b.start);
  return true;
}

/** A tween that starts at the playhead and runs towards the state the clip has there. It is
 * meant to be edited afterwards (in the list or by dragging the formula in the preview, which
 * changes the target of the latest tween that has started). Returns null when the playhead is
 * not in free time of the clip (outside it, inside the intro/outro, another tween or a relation
 * window). */
export function addKeyframeAt(project: Project, clip: Clip, t: number): TweenAction | null {
  const slot = actionSlotAt(project, clip, t);
  if (!slot) return null;
  const state: ClipState = keyframeAt(clip, slot.start).state;
  // Plain copies only: `clip` may be an immer draft inside a store recipe.
  const to: Partial<ClipState> = {
    position: [state.position[0], state.position[1]],
    scale: state.scale,
    rotation: state.rotation,
    opacity: state.opacity,
  };
  const duration = round6(Math.min(1, slot.end - slot.start));
  const action = createTween(round6(slot.start - clip.start), duration, to, 'smooth');
  clip.actions.push(action);
  clip.actions.sort((a, b) => a.start - b.start);
  return action;
}

/** The state a tween starts from: the clip's state after every earlier action. */
export function stateBefore(clip: Clip, actionId: string): ClipState {
  const target = clip.actions.find((a) => a.id === actionId);
  const earlier = { ...clip, actions: clip.actions.filter((a) => a.start < (target?.start ?? 0)) };
  return keyframeAt(earlier, Infinity).state;
}
