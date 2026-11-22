/* The animations and rate functions the editor offers, with their Manim names: one source for the
 * clip panel, the relation editor, the default animations, the stored preferences, the block menus
 * and the timeline's labels. Intro and outro lists follow the format's order (model/schema.ts);
 * the block menus put the most used animations first. Pure. */
import {
  EMPHASIS,
  EMPHASIS_KINDS,
  introsOf,
  KINDS,
  PULSE_EASINGS,
  type AppearKind,
  type DisappearKind,
  type Easing,
  type EmphasisKind,
  type Formula,
  type IntroKind,
  type OutroKind,
} from '../../model';

type AnimationKind = Exclude<IntroKind | OutroKind, 'none'>;

export interface Choice<V extends string> {
  value: V;
  label: string;
}

/** Manim's name of each animation. */
const MANIM_NAME: Record<AnimationKind, string> = {
  write: 'Write',
  fade_in: 'FadeIn',
  grow_from_center: 'GrowFromCenter',
  draw_border_then_fill: 'DrawBorderThenFill',
  create: 'Create',
  grow_arrow: 'GrowArrow',
  unwrite: 'Unwrite',
  fade_out: 'FadeOut',
  shrink_to_center: 'ShrinkToCenter',
  uncreate: 'Uncreate',
};

/** Shorter names for the narrow intro and outro bands of a clip on the timeline. */
const SHORT_NAME: Partial<Record<AnimationKind, string>> = {
  grow_from_center: 'Grow',
  draw_border_then_fill: 'Border',
  shrink_to_center: 'Shrink',
};

const choice = <K extends AnimationKind>(value: K): Choice<K> => ({
  value,
  label: MANIM_NAME[value],
});

/** Manim's GrowArrow (D145): an arrow's alone, so it is in none of the lists below — the ones
 * every object takes — and is added for an arrow (`introChoicesOf`, `appearChoicesOf`). */
export const GROW_ARROW: Choice<'grow_arrow'> = choice('grow_arrow');

/** The intro animations, without "none". */
export const INTRO_ANIMATIONS: readonly Choice<Exclude<IntroKind, 'none'>>[] = (
  ['write', 'fade_in', 'grow_from_center', 'draw_border_then_fill', 'create'] as const
).map(choice);

/** The outro animations, without "none". */
export const OUTRO_ANIMATIONS: readonly Choice<Exclude<OutroKind, 'none'>>[] = (
  ['unwrite', 'fade_out', 'shrink_to_center', 'uncreate'] as const
).map(choice);

/** A clip's (or a relation's) intro choices, "None" first. */
export const INTRO_CHOICES: readonly Choice<IntroKind>[] = [
  { value: 'none', label: 'None (appear)' },
  ...INTRO_ANIMATIONS,
];

/** A clip's (or a relation's) outro choices, "None" first. */
export const OUTRO_CHOICES: readonly Choice<OutroKind>[] = [
  { value: 'none', label: 'None (disappear)' },
  ...OUTRO_ANIMATIONS,
];

/** What an Appear block can run, as the block menus list it. */
export const APPEAR_ANIMATIONS: readonly Choice<AppearKind>[] = (
  ['write', 'create', 'fade_in', 'grow_from_center', 'draw_border_then_fill'] as const
).map(choice);

/** The intro choices of `formula`: the ones its kind takes, "None" first, and GrowArrow for an
 * arrow (`introsOf`). Every choice when there is no formula. */
export function introChoicesOf(formula: Formula | null | undefined): readonly Choice<IntroKind>[] {
  if (!formula) return INTRO_CHOICES;
  const kinds = introsOf(formula);
  return [...INTRO_CHOICES, GROW_ARROW].filter((item) => kinds.includes(item.value));
}

/** What an Appear block of `formula` can run: `APPEAR_ANIMATIONS` of its kind, and GrowArrow for
 * an arrow. */
export function appearChoicesOf(
  formula: Formula | null | undefined,
): readonly Choice<AppearKind>[] {
  if (!formula) return APPEAR_ANIMATIONS;
  const kinds = introsOf(formula);
  return [...APPEAR_ANIMATIONS, GROW_ARROW].filter((item) => kinds.includes(item.value));
}

/** What a Disappear block can run, as the block menus list it. */
export const DISAPPEAR_ANIMATIONS: readonly Choice<DisappearKind>[] = (
  ['fade_out', 'unwrite', 'uncreate', 'shrink_to_center'] as const
).map(choice);

/** What a Disappear block of `formula` can run: `DISAPPEAR_ANIMATIONS` its kind takes as outros
 * (a line is never shrunk). */
export function disappearChoicesOf(
  formula: Formula | null | undefined,
): readonly Choice<DisappearKind>[] {
  if (!formula) return DISAPPEAR_ANIMATIONS;
  const kinds = KINDS[formula.kind].outros;
  return DISAPPEAR_ANIMATIONS.filter((item) => kinds.includes(item.value));
}

/** Manim's name of an animation ("Write", "FadeOut"); "none" stays "none". */
export function animationLabel(kind: IntroKind | OutroKind): string {
  return kind === 'none' ? 'none' : MANIM_NAME[kind];
}

/** The name on a clip's intro or outro band ("Grow" for GrowFromCenter); empty for "none". */
export function shortAnimationLabel(kind: IntroKind | OutroKind): string {
  return kind === 'none' ? '' : (SHORT_NAME[kind] ?? MANIM_NAME[kind]);
}

/** The rate functions the editors offer. */
export const EASINGS: readonly Easing[] = [
  'smooth',
  'linear',
  'rush_into',
  'rush_from',
  'slow_into',
  'double_smooth',
  'there_and_back',
  'there_and_back_with_pause',
];

/** The rate functions as select options (labelled with their Manim names). */
export const EASING_CHOICES: readonly Choice<Easing>[] = EASINGS.map((e) => ({
  value: e,
  label: e,
}));

/** The easings an Indicate may run with: those that come back to the start (`PULSE_EASINGS`). */
export const PULSE_EASING_CHOICES: readonly Choice<Easing>[] = PULSE_EASINGS.map((e) => ({
  value: e,
  label: e,
}));

/** The Emphasis effects, as the block menus list them (D73), with Manim's names. */
export const EMPHASIS_EFFECTS: readonly Choice<EmphasisKind>[] = EMPHASIS_KINDS.map((k) => ({
  value: k,
  label: EMPHASIS[k].label,
}));

/** The Emphasis effects a block of `formula` can run: all of them, but for a line only those that
 * draw something of their own without animating it (`EMPHASIS[effect].animates`): an Indicate or
 * a Wiggle would scale it, which the two libraries do not do alike (`line-animation`). */
export function emphasisChoicesOf(
  formula: Formula | null | undefined,
): readonly Choice<EmphasisKind>[] {
  if (formula?.kind !== 'line') return EMPHASIS_EFFECTS;
  return EMPHASIS_EFFECTS.filter((item) => !EMPHASIS[item.value].animates);
}
