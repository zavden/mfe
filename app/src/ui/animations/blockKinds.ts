/* Names and categories of the animation blocks (clip actions), shared by the timeline, the menus
 * and the Animations panel. Pure. */
import {
  EMPHASIS,
  growsAsArrow,
  type Clip,
  type ClipAction,
  type Formula,
  type FormulaKind,
  type Project,
} from '../../model';
import { animationLabel } from './catalogue';

/** What the blocks of a clip animate, for the menus and their words (D123): a formula or a text
 * has glyphs a block can name — a part to transform, the pairs of a morph —; a brace and a shape
 * are one piece each, so theirs is a plain Transform and they have no morph. Nor has a line,
 * which takes only what draws, fades, moves or repaints it (`validateProject`, `line-animation`):
 * its menus offer no more. */
export type BlockSubject = 'formula' | 'brace' | 'shape' | 'line';

export function blockSubject(kind: FormulaKind | undefined): BlockSubject {
  return kind === 'brace' || kind === 'shape' || kind === 'line' ? kind : 'formula';
}

/** `blockSubject` of the object a clip shows. */
export function clipSubject(
  project: Project,
  clip: Pick<Clip, 'formulaId'> | undefined,
): BlockSubject {
  return blockSubject(project.formulas.find((f) => f.id === clip?.formulaId)?.kind);
}

/** Whether the clip `clipId` shows an arrow or a double arrow, which Manim's GrowArrow grows. */
export function clipIsArrow(project: Project, clipId: string | undefined): boolean {
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
  return formula !== undefined && growsAsArrow(formula);
}

/** "An arrow" or "A double arrow": what a block animates whole is (`animatedWhole`). */
function wholeNoun(formula: Formula): string {
  return formula.kind === 'line' && formula.line === 'double_arrow' ? 'A double arrow' : 'An arrow';
}

/** What the Glyphs section of a block of an arrow says in place of its glyph picker and its
 * splits: a block animates an arrow whole (`animatedWhole`, audit A5-07). */
export function wholeHint(formula: Formula): string {
  return `${wholeNoun(formula)} is animated whole, its shaft and its tips together, as Manim does: a block takes all of it, and is not split.`;
}

/** Why a block of an arrow is not split, nor copied for other glyphs: it animates the whole arrow
 * (`animatedWhole`). */
export function wholeReason(formula: Formula): string {
  return `${wholeNoun(formula)} is animated whole, its shaft and its tips together, as Manim does: a block of it takes all its glyphs, and is not split or copied for other glyphs.`;
}

/** The five families of block, which the timeline colours and the menus group by. Tweens (the
 * whole formula) and part transforms are both "Transform"; a morph within the formula is its own;
 * the Emphasis effects (D73) are one family. */
export type BlockCategory = 'appear' | 'disappear' | 'transform' | 'morph' | 'emphasis';

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  appear: 'Appear',
  disappear: 'Disappear',
  transform: 'Transform',
  morph: 'Morph',
  emphasis: 'Emphasis',
};

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

/** "Write", "FadeOut", "Transform", "Morph", "Indicate". */
export function animationName(action: ClipAction): string {
  if (action.kind === 'appear' || action.kind === 'disappear') {
    return animationLabel(action.anim);
  }
  if (action.kind === 'emphasis') return EMPHASIS[action.effect].label;
  return action.kind === 'morph' ? 'Morph' : 'Transform';
}

/** How many glyphs a block names: undefined for the whole formula (a tween, or `'all'`) and for
 * a morph, which names pairs (`pairCount`). */
export function glyphCount(action: ClipAction): number | undefined {
  if (action.kind === 'tween' || action.kind === 'morph' || action.glyphs === 'all') {
    return undefined;
  }
  return action.glyphs.length;
}

/** How many pairs a morph block has; undefined for the other blocks. */
export function pairCount(action: ClipAction): number | undefined {
  return action.kind === 'morph' ? action.pairs.length : undefined;
}

/** Whether a block is a Transform that carries its shape to other glyphs (`TweenFit`, D123). */
export function carriesShape(action: ClipAction): boolean {
  return action.kind === 'tween' && action.fit !== undefined;
}

/** The label on a block: its animation, and the number of glyphs when it names some ("Write · 2";
 * for a morph the number of its pairs). A Transform that carries its shape elsewhere ends in an
 * arrow, which the timeline follows with where to ("Transform → f2"). */
export function blockLabel(action: ClipAction): string {
  if (carriesShape(action)) return `${animationName(action)} →`;
  const count = glyphCount(action) ?? pairCount(action);
  return count === undefined ? animationName(action) : `${animationName(action)} · ${count}`;
}

/** The tooltip of a block: what it does and when, in seconds from the start of the scene. The
 * Transform of a brace or a shape is just that: there is no part to tell it from; one that
 * carries its shape elsewhere says where to (`target`, the names of what it goes to). */
export function blockTitle(
  action: ClipAction,
  clipStart: number,
  subject: BlockSubject = 'formula',
  target?: string,
): string {
  const count = glyphCount(action);
  const pairs = pairCount(action);
  const what = carriesShape(action)
    ? `${animationName(action)} to ${target ?? 'other glyphs'}`
    : action.kind === 'tween'
      ? subject === 'formula'
        ? `${animationName(action)} (whole formula)`
        : animationName(action)
      : pairs !== undefined
        ? `${animationName(action)} within the formula (${pairs} pair${pairs === 1 ? '' : 's'})`
        : count === undefined
          ? `${animationName(action)} (all glyphs)`
          : `${animationName(action)} (${count} glyph${count === 1 ? '' : 's'})`;
  const start = clipStart + action.start;
  return `${what}\n${start.toFixed(2)} s → ${(start + action.duration).toFixed(2)} s · ${action.duration.toFixed(2)} s`;
}
