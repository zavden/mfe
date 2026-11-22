/* Blocks that run at the same time on different glyphs (ARCHITECTURE §5): which blocks of a clip
 * a block runs alongside, and the glyphs a copy of a block could animate alongside it. Pure. */
import {
  animatedWhole,
  appearSkipReason,
  clipLifetimes,
  TIME_EPSILON,
  type Clip,
  type ClipAction,
  type ClipLifetime,
  type Project,
} from '../../model';
import { glyphsOnScreenBefore, namedGlyphs } from './blockGlyphs';
import type { GlyphBlock } from './splitBlock';

/** The blocks of `clip` that run at the same time as `action` (other than itself), in start
 * order: blocks that only touch do not count. */
export function parallelWith(clip: Clip, action: ClipAction): ClipAction[] {
  const start = action.start;
  const end = action.start + action.duration;
  return clip.actions.filter(
    (other) =>
      other.id !== action.id &&
      other.start < end - TIME_EPSILON &&
      start < other.start + other.duration - TIME_EPSILON,
  );
}

/** The glyphs a block like `block`, starting at `time` (absolute seconds) in the clip whose
 * lifetime is `life`, would animate besides `taken` (glyphs other blocks have): for an Appear
 * those an Appear of every glyph would bring then — off screen, and neither consumed by a transfer
 * nor brought by one later (`appearSkipReason`; listed, they would be an error or a warning, audit
 * A8-02) —, on screen for a Disappear or an Emphasis, every other one for a part Transform. `life`
 * may or may not include the block itself (its own stays never count). Ascending. */
export function glyphsLeftFor(
  life: ClipLifetime,
  block: GlyphBlock,
  time: number,
  taken: ReadonlySet<number>,
): number[] {
  const others = life.glyphs.filter((g) => !taken.has(g));
  if (block.kind === 'transform') return others;
  const onScreen = glyphsOnScreenBefore(life, block, time);
  if (block.kind !== 'appear') return others.filter((g) => onScreen.has(g));
  return others.filter((g) => !onScreen.has(g) && appearSkipReason(life, g, time) === null);
}

/** The glyphs of the clip's formula that the block does not name and that a copy of it, at its
 * time, would animate ("Duplicate for the other glyphs"). None for a block of every glyph, nor
 * for a block of an arrow, which takes the whole arrow (`animatedWhole`, audit A5-07). */
export function complementGlyphs(project: Project, clip: Clip, action: GlyphBlock): number[] {
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  if (formula && animatedWhole(formula)) return [];
  const life = clipLifetimes(project).get(clip.id);
  if (!life) return [];
  const named = namedGlyphs(action, life.glyphs);
  return glyphsLeftFor(life, action, clip.start + action.start, named);
}

/** For a new Appear or Disappear of every glyph that lands alongside `others` (blocks of `clip`
 * it overlaps in time; `project` and `clip` are without the new block): the glyphs left for it
 * there — not animated by those blocks, and not named by another block of its kind, which would
 * otherwise skip them later. Empty when nothing is left. */
export function parallelComplement(
  project: Project,
  clip: Clip,
  block: GlyphBlock,
  others: readonly ClipAction[],
): number[] {
  const life = clipLifetimes(project).get(clip.id);
  if (!life) return [];
  const taken = new Set<number>();
  for (const other of others) {
    for (const g of life.actions.get(other.id)?.glyphs ?? []) taken.add(g);
  }
  for (const other of clip.actions) {
    if (other.id !== block.id && other.kind === block.kind && other.glyphs !== 'all') {
      for (const g of other.glyphs) taken.add(g);
    }
  }
  return glyphsLeftFor(life, block, clip.start + block.start, taken);
}
