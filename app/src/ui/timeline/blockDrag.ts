/* What the readout of a dragged animation block says (BlockDragReadout): the blocks of the clip
 * it runs alongside, and why the planner holds it where it is when the pointer asked for more.
 * Pure. */
import { TIME_EPSILON, type Clip, type ClipAction, type Project } from '../../model';
import {
  blockConflicts,
  movedWith,
  withTiming,
  type Timing,
  type TimingEdit,
} from '../animations/blockRange';
import { animationName } from '../animations/blockKinds';
import { parallelWith } from '../animations/parallel';
import { glyphRuns } from '../animations/splitBlock';
import { MIN_ACTION_DURATION } from './clipOps';

/** "Write · 7–14, 20–27", "FadeOut · all glyphs", "Transform · all glyphs" (a tween), "Morph · 3
 * pairs": the animation and what it animates, as runs of glyph indices. */
export function describeBlock(action: ClipAction): string {
  const name = animationName(action);
  if (action.kind === 'tween') return `${name} · all glyphs`;
  if (action.kind === 'morph') {
    return `${name} · ${action.pairs.length} pair${action.pairs.length === 1 ? '' : 's'}`;
  }
  if (action.glyphs === 'all') return `${name} · all glyphs`;
  const runs = glyphRuns([...new Set(action.glyphs)].sort((a, b) => a - b));
  const text = runs.map((r) => (r.length === 1 ? `${r[0]}` : `${r[0]}–${r[r.length - 1]}`));
  return `${name} · ${text.join(', ')}`;
}

/** "in parallel with Write · 7–14 and FadeOut · 3", or null when the block runs alone. */
export function parallelText(clip: Clip, action: ClipAction): string | null {
  const others = parallelWith(clip, action).map(describeBlock);
  if (others.length === 0) return null;
  const list =
    others.length === 1
      ? others[0]!
      : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]!}`;
  return `in parallel with ${list}`;
}

/** Whether the planner's answer `got` falls short of the edges the pointer asked for (`wanted`,
 * relative to the clip), on the edge the gesture moves. */
export function stoppedShort(
  got: Timing,
  wanted: { start: number; end: number },
  edit: TimingEdit,
): boolean {
  const gotEnd = got.start + got.duration;
  if (edit === 'end') return Math.abs(gotEnd - wanted.end) > TIME_EPSILON;
  return Math.abs(got.start - wanted.start) > TIME_EPSILON;
}

/** How far past where it stopped a block is asked about when the position the pointer wants is
 * fine in itself (seconds): the first step over what it cannot pass. */
const STEP = 0.02;

/** Why the block cannot be where the pointer asked (`wanted`, relative to the clip) when the
 * planner left it at `got`: the minimum length when an edge was pushed past it; else the
 * planner's sentence for the block where the pointer wants it (`blockConflicts`); else — that
 * position is fine in itself, but a block never passes another animation of its glyphs — the
 * sentence for the first step beyond where it stopped; else a plain sentence. For a block in a
 * group, the sentence of the first of its members that cannot be there. */
export function stopReason(
  project: Project,
  clip: Clip,
  actionId: string,
  wanted: { start: number; end: number },
  got: Timing,
  edit: TimingEdit,
): string {
  if (wanted.end - wanted.start < MIN_ACTION_DURATION - TIME_EPSILON) {
    return `A block lasts at least ${MIN_ACTION_DURATION} s.`;
  }
  const moved = movedWith(clip, actionId);
  const at = (window: { start: number; end: number }) => {
    const probe = withTiming(clip, moved, {
      start: window.start,
      duration: window.end - window.start,
    });
    for (const id of moved) {
      const why = blockConflicts(project, probe, id);
      if (why) return why;
    }
    return null;
  };
  const direct = at(wanted);
  if (direct) return direct;
  const gotEnd = got.start + got.duration;
  const forward = (edit === 'end' ? wanted.end > gotEnd : wanted.start > got.start) ? 1 : -1;
  const step = forward * STEP;
  const beyond =
    edit === 'end'
      ? { start: got.start, end: gotEnd + step }
      : edit === 'start'
        ? { start: got.start + step, end: gotEnd }
        : { start: got.start + step, end: gotEnd + step };
  return at(beyond) ?? 'The block cannot go further.';
}
