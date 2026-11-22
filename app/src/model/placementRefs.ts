/* What places a clip by glyphs of other clips, in one list (ARCHITECTURE §5, "Attached objects"):
 * its attachment (`clip.attach`, with the other clips a brace or a shape spans), the tweens
 * that carry its shape to other glyphs (`TweenFit`) and the ones that carry the ends of its line
 * (`TweenEnds`, on glyphs or at points: the sync measures both). Each is a *use*: who owns the reference, the
 * instant Manim measures its targets at, where it is in the clip, and the targets themselves.
 * Validation, the glyph remap, deletion, duplication, the attach sync and the generated Python
 * walk this list rather than `clip.attach` and the tweens one by one, so that something new that
 * places a clip is taught here once. What each of them does with a use stays its own: a lost
 * target frees an attachment, removes a fit and frees the end of a line where it was drawn. */
import type { AttachTarget, Clip, ClipAttach, EndsAttach, TweenFit } from './types';
import { isGlyphEnd, type EndsTween, type FitTween } from './kinds';

/** Whose reference it is: the clip's attachment, or one of its tweens (the block itself, and its
 * place among the clip's actions) — its fit, or the ends it carries its line to. */
export type PlacementOwner =
  | { kind: 'attach' }
  | { kind: 'fit'; tween: FitTween; index: number }
  | { kind: 'ends'; tween: EndsTween; index: number };

/** Where something is inside its clip, as an issue's path continues after `['clips', i]`. */
export type ClipPath = readonly (string | number)[];

/** One target of a use: glyphs of one clip. */
export interface PlacementSpot {
  /** The reference as the project holds it — the object itself, never a copy: in a draft, what
   * is written here is written into the project. */
  target: AttachTarget;
  /** Where it is in its clip: `['attach']`, `['attach', 'also', 0]`, `['attach', 'end']` (an end
   * of a line), `['actions', 2, 'fit']`, `['actions', 2, 'ends', 'start']`. */
  path: ClipPath;
}

export interface PlacementUse {
  owner: PlacementOwner;
  /** The instant its targets are measured at, in seconds of the scene: the clip's start for an
   * attachment, the tween's for a fit. */
  at: number;
  /** Where it is in its clip: `['attach']`, `['actions', 2, 'fit']`. */
  path: ClipPath;
  /** Its targets, in their order: the clip it names, then the others it spans. None for a tween
   * that carries a line to two points. */
  spots: PlacementSpot[];
}

/** A line: each of its ends that is on glyphs, where its holder has it. */
function endSpots(holder: Pick<EndsAttach, 'start' | 'end'>, path: ClipPath): PlacementSpot[] {
  return (['start', 'end'] as const).flatMap((side) => {
    const end = holder[side];
    return isGlyphEnd(end) ? [{ target: end, path: [...path, side] }] : [];
  });
}

function spotsOf(holder: ClipAttach | TweenFit, path: ClipPath): PlacementSpot[] {
  if ('rule' in holder && holder.rule === 'ends') return endSpots(holder, path);
  const also = ('also' in holder && holder.also) || [];
  return [
    { target: holder, path },
    ...also.map((target, i) => ({ target, path: [...path, 'also', i] })),
  ];
}

/** Every use of `clip`: its attachment first, then the fits of its tweens in the clip's order. */
export function placementUses(clip: Pick<Clip, 'start' | 'attach' | 'actions'>): PlacementUse[] {
  const uses: PlacementUse[] = [];
  if (clip.attach) {
    const path = ['attach'];
    uses.push({
      owner: { kind: 'attach' },
      at: clip.start,
      path,
      spots: spotsOf(clip.attach, path),
    });
  }
  clip.actions.forEach((action, index) => {
    if (action.kind !== 'tween') return;
    const at = clip.start + action.start;
    if (action.fit) {
      const path = ['actions', index, 'fit'];
      uses.push({
        owner: { kind: 'fit', tween: action as FitTween, index },
        at,
        path,
        spots: spotsOf(action.fit, path),
      });
    }
    if (action.ends) {
      const path = ['actions', index, 'ends'];
      uses.push({
        owner: { kind: 'ends', tween: action as EndsTween, index },
        at,
        path,
        spots: endSpots(action.ends, path),
      });
    }
  });
  return uses;
}

/** Whether the attach sync places `clip` at all — by glyphs of other clips, or by the ends a
 * tween carries its line to —: it and the readiness of a scene have nothing to do for a project
 * without one such clip. */
export function hasPlacementUses(clip: Pick<Clip, 'attach' | 'actions'>): boolean {
  return (
    Boolean(clip.attach) ||
    clip.actions.some(
      (action) =>
        action.kind === 'tween' && (action.fit !== undefined || action.ends !== undefined),
    )
  );
}

/** Whether `use` names a clip of `ids` among its targets. */
export function usesAnyOf(use: PlacementUse, ids: ReadonlySet<string>): boolean {
  return use.spots.some((spot) => ids.has(spot.target.clipId));
}
