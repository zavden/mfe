/* Which glyphs an animation block names, and the quick choices of the glyph picker. Pure. */
import { TIME_EPSILON, type ClipAction, type ClipLifetime, type GlyphTarget } from '../../model';

/** The glyphs on screen just before `time` (absolute seconds), as far as the block can tell
 * without itself: stays that the block brought in do not count, and a stay that it takes the
 * glyph out of still does. A glyph changes state when the animation that moves it starts. */
export function glyphsOnScreenBefore(
  life: ClipLifetime,
  action: ClipAction,
  time: number,
): Set<number> {
  const own = (cause: { kind: string; actionId?: string; key?: string }) =>
    (cause.kind === 'action' && cause.actionId === action.id) ||
    (cause.kind === 'transfer' && cause.key === `morph:${action.id}`);
  const on = new Set<number>();
  for (const [glyph, stints] of life.stints) {
    for (const stint of stints) {
      if (own(stint.enter.cause)) continue;
      const entered = stint.enter.start <= time + TIME_EPSILON;
      const left = !own(stint.exit.cause) && stint.exit.start <= time + TIME_EPSILON;
      if (entered && !left) on.add(glyph);
    }
  }
  return on;
}

/** The glyphs a block names, out of `universe` ('all' is every one; both sides of a morph's
 * pairs). */
export function namedGlyphs(action: ClipAction, universe: readonly number[]): Set<number> {
  if (action.kind === 'tween') return new Set(universe);
  if (action.kind === 'morph') return new Set(action.pairs.flatMap((p) => [...p.from, ...p.to]));
  return new Set(action.glyphs === 'all' ? universe : action.glyphs);
}

/** The quick choices of the picker. */
export type QuickChoice = 'all' | 'off-screen' | 'on-screen' | 'hidden';

export interface PickerContext {
  /** Every glyph of the formula, ascending. */
  universe: readonly number[];
  /** Glyphs on screen when the block starts. */
  onScreen: ReadonlySet<number>;
  /** The glyphs the clip's intro leaves out (`startHiddenGlyphs`): the formula's `hiddenGlyphs`
   * and the clip's own `startHidden`, or every glyph of a clip that starts empty. */
  hidden: readonly number[];
}

/** The glyphs a quick choice picks, ascending. */
export function quickGlyphs(choice: QuickChoice, ctx: PickerContext): number[] {
  switch (choice) {
    case 'all':
      return [...ctx.universe];
    case 'off-screen':
      return ctx.universe.filter((g) => !ctx.onScreen.has(g));
    case 'on-screen':
      return ctx.universe.filter((g) => ctx.onScreen.has(g));
    case 'hidden':
      return ctx.universe.filter((g) => ctx.hidden.includes(g));
  }
}

/** What a quick choice stores in a block: `'all'` for Appear, Disappear and Emphasis (it
 * follows the formula when its LaTeX changes), a list otherwise. */
export function quickTarget(
  choice: QuickChoice,
  action: ClipAction,
  ctx: PickerContext,
): GlyphTarget {
  if (choice === 'all' && action.kind !== 'transform' && action.kind !== 'tween') return 'all';
  return quickGlyphs(choice, ctx);
}

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((g, i) => g === b[i]);

/** Whether a quick choice describes what the block names now (the button shows as pressed). */
export function quickActive(choice: QuickChoice, action: ClipAction, ctx: PickerContext): boolean {
  if (action.kind === 'tween' || action.kind === 'morph') return false;
  if (choice === 'all') {
    return (
      action.glyphs === 'all' || sameList([...namedGlyphs(action, ctx.universe)], ctx.universe)
    );
  }
  return action.glyphs !== 'all' && sameList([...action.glyphs], quickGlyphs(choice, ctx));
}

/** An explicit, ascending, duplicate-free list of glyphs. */
export function sortedGlyphs(glyphs: Iterable<number>): number[] {
  return [...new Set(glyphs)].sort((a, b) => a - b);
}
