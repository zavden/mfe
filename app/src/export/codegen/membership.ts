/* Which glyphs of each clip are on screen while the timeline is emitted, and what the animations
 * that ended left on them (ARCHITECTURE §8, "Glyph membership"): a whole formula is only used
 * (added, animated) when all of its glyphs are, and never again once one is gone for good. */
import { sourceRoles, type ClipState } from '../../model';
import { endsAtStart, overridesEndedBy } from '../../scene';
import { braceLines, lineLines, placementLine, shapeLines, tipLine } from './attach';
import { glyphArgs, isAll } from './glyphs';
import type { Codegen, ClipCtx, Op, AnimKind } from './context';

/** Animations whose Manim default lag ratio is not zero (model/defaults.ts): they run glyph
 * after glyph unless the lag ratio is set to 0. */
const STAGGERED_BY_DEFAULT: ReadonlySet<AnimKind> = new Set([
  'write',
  'unwrite',
  'create',
  'uncreate',
]);

export function isWhole(
  ctx: ClipCtx,
  glyphs: readonly number[],
  when: 'intro' | 'present',
): boolean {
  if (!isAll(glyphs, ctx.formula.count) || ctx.gone.size > 0) return false;
  return when === 'intro' ? ctx.present.size === 0 : ctx.present.size === ctx.formula.count;
}

/** Whether an intro, an outro or an appear / disappear block may animate the formula mobject
 * itself: not when the formula is matched by position and the animation runs glyph after glyph
 * (a lag ratio), since the mobject would play in Manim's glyph order, which can differ from the
 * editor's (a MathJax fraction ends with its bar), while the glyph list follows the editor's. */
export function mayUseWhole(ctx: ClipCtx, anim: AnimKind, lagRatio: number | null): boolean {
  if (!ctx.formula.positional) return true;
  return lagRatio === null ? !STAGGERED_BY_DEFAULT.has(anim) : lagRatio <= 0;
}

/** The clip's state at absolute time t (left by the latest tween that has ended). */
export function stateAt(gen: Codegen, ctx: ClipCtx, t: number): ClipState {
  let state = ctx.clip.initial;
  for (const tween of gen.settled.get(ctx.clip.id) ?? []) {
    if (tween.end <= t + 1e-9) state = tween.state;
  }
  return state;
}

export function applyEnd(op: Op): void {
  switch (op.kind) {
    case 'intro':
    case 'appear':
    case 'place':
    case 'camera':
      break;
    case 'outro':
    case 'disappear':
    case 'leave':
      for (const g of op.glyphs) {
        op.clip.present.delete(g);
        if (op.kind !== 'disappear' || !op.back.has(g)) op.clip.gone.add(g);
      }
      break;
    case 'tween': {
      // A tween that changes a glyph's colour or the clip opacity takes over from any part
      // transform override (the preview's rule, scene/anim/part.ts).
      const { from, to } = op.event;
      const f = op.clip.formula.formula;
      for (const g of [...op.clip.partColor.keys()]) {
        if (overridesEndedBy(from, to, g, f).color) op.clip.partColor.delete(g);
      }
      for (const g of [...op.clip.partOpacity.keys()]) {
        if (overridesEndedBy(from, to, g, f).opacity) op.clip.partOpacity.delete(g);
      }
      break;
    }
    case 'transform':
      endPart(op);
      break;
    case 'emphasis':
      // Every effect leaves the glyphs as they were.
      break;
    case 'transfer':
      for (const pair of op.pairs) {
        for (const g of pair.to) op.to.present.add(g);
        // Copied sources (a copy pair's, or the extras of a `copies` pair) stay.
        for (const g of sourceRoles(pair, pair.style).consumed) {
          op.from.present.delete(g);
          op.from.gone.add(g);
        }
      }
      break;
  }
}

/** What a part transform leaves on its glyphs once it has finished (`rate(1)`, so a block
 * that comes back leaves nothing): colour and opacity overrides, and moved glyphs. */
function endPart(op: Extract<Op, { kind: 'transform' }>): void {
  const { event, clip } = op;
  if (endsAtStart(event.easing)) return;
  const live = op.glyphs.filter((g) => !clip.gone.has(g));
  if (live.length === 0) return;
  if (event.shift[0] !== 0 || event.shift[1] !== 0 || event.scale !== 1 || event.rotation !== 0) {
    clip.partsMoved = true;
  }
  for (const g of live) {
    if (event.color !== null) clip.partColor.set(g, event.color);
    if (event.opacity !== null) clip.partOpacity.set(g, event.opacity);
  }
}

export function emitInstant(gen: Codegen, op: Op): void {
  if (op.kind === 'place') {
    if (op.attach.rule === 'brace') gen.body.push(...braceLines(gen, op.clip, op.attach));
    else if (op.attach.rule === 'shape') gen.body.push(...shapeLines(gen, op.clip, op.attach));
    else if (op.attach.rule === 'tip') gen.body.push(tipLine(gen, op.clip, op.target, op.attach));
    else if (op.attach.rule === 'ends') gen.body.push(...lineLines(gen, op.clip, op.attach));
    else gen.body.push(placementLine(op.clip, op.target, op.attach));
    return;
  }
  if (op.kind !== 'intro' && op.kind !== 'outro' && op.kind !== 'leave') return;
  const ctx = op.clip;
  if (op.kind === 'intro') {
    const whole = isWhole(ctx, op.glyphs, 'intro');
    gen.body.push(
      `self.add(${whole ? ctx.naming.name : glyphArgs(ctx.naming, op.glyphs).join(', ')})`,
    );
    for (const g of op.glyphs) ctx.present.add(g);
  } else {
    const glyphs = op.glyphs.filter((g) => ctx.present.has(g));
    if (glyphs.length === 0) return;
    const whole = isWhole(ctx, glyphs, 'present');
    gen.body.push(
      `self.remove(${whole ? ctx.naming.name : glyphArgs(ctx.naming, glyphs).join(', ')})`,
    );
    applyEnd({ ...op, glyphs });
  }
}
