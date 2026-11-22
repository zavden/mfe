/* The words of the timeline strip: Manim's names of the animations on a clip's intro and outro
 * bands and on its blocks, and the families its blocks are coloured by — the app's own words
 * (`ui/animations/catalogue.ts`, `ui/animations/blockKinds.ts`), which this module cannot import
 * (the player is built from the core alone); `__tests__/labels.test.ts` holds the two to the
 * same words for every kind. Pure. */
import { EMPHASIS, type ClipAction, type IntroKind, type OutroKind } from '../model';

type AnimationKind = Exclude<IntroKind | OutroKind, 'none'>;

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

/** Shorter names for the narrow intro and outro bands. */
const SHORT_NAME: Partial<Record<AnimationKind, string>> = {
  grow_from_center: 'Grow',
  draw_border_then_fill: 'Border',
  shrink_to_center: 'Shrink',
};

/** Manim's name of an intro or an outro ("Write", "FadeOut"); "none" stays "none". */
export function animationLabel(kind: IntroKind | OutroKind): string {
  return kind === 'none' ? 'none' : MANIM_NAME[kind];
}

/** The name on a clip's intro or outro band; empty for "none". */
export function shortAnimationLabel(kind: IntroKind | OutroKind): string {
  return kind === 'none' ? '' : (SHORT_NAME[kind] ?? MANIM_NAME[kind]);
}

/** The five families of block, which the timeline colours. */
export type BlockCategory = 'appear' | 'disappear' | 'transform' | 'morph' | 'emphasis';

export function blockCategory(action: ClipAction): BlockCategory {
  if (
    action.kind === 'appear' ||
    action.kind === 'disappear' ||
    action.kind === 'morph' ||
    action.kind === 'emphasis'
  ) {
    return action.kind;
  }
  return 'transform';
}

function animationName(action: ClipAction): string {
  if (action.kind === 'appear' || action.kind === 'disappear') return animationLabel(action.anim);
  if (action.kind === 'emphasis') return EMPHASIS[action.effect].label;
  return action.kind === 'morph' ? 'Morph' : 'Transform';
}

/** The label on a block: its animation, and the number of glyphs it names ("Write · 2"; for a
 * morph, the number of its pairs). A Transform that carries its shape elsewhere ends in an
 * arrow. */
export function blockLabel(action: ClipAction): string {
  if (action.kind === 'tween' && action.fit !== undefined) return `${animationName(action)} →`;
  const count =
    action.kind === 'morph'
      ? action.pairs.length
      : action.kind === 'tween' || action.glyphs === 'all'
        ? undefined
        : action.glyphs.length;
  return count === undefined ? animationName(action) : `${animationName(action)} · ${count}`;
}
