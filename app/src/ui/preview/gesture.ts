/* The preview's pointer gestures, once the pointer has moved: a drag of a formula moves it (and
 * the other selected clips with it), a drag of a handle scales or rotates it (the whole selected
 * group about its centre, when several clips are selected), a drag on empty space draws a
 * selection rectangle (marquee). What the edits change is the part transform under
 * edit (its shift, scale and rotation), else the keyframe in effect at the playhead — unless the
 * clip is locked and that keyframe belongs to a transformation (`blocked`). Pure: the component
 * passes the stores' state in and owns the undo gesture and the pointer. */
import type { ActionId, Clip, ClipId, Project, Vec2 } from '../../model';
import type { Camera } from '../../render';
import type { Selection } from '../../store';
import { patchKeyframe, type KeyframeRef } from '../../scene';
import { partEditOf, previewEdit, type TransformEditTarget } from '../animations/transformEdit';
import type { Box } from '../../geom';
import type { ScreenPoint } from '../pointer';
import { round6 } from '../time';
import type { GlyphPick, PickRevision } from './glyphPick';
import type { DragSnap } from './dragSnap';
import type { GroupMember } from './groupTransform';
import { beginRotation, type HandleId, type RotationTracker } from './handles';

export type Gesture =
  | { kind: 'pan'; start: Vec2; camera: Camera }
  | {
      /** Pressed on empty space: a marquee after DRAG_THRESHOLD px, else a click that clears the
       * selection on release (unless `additive`). */
      kind: 'marquee-press';
      startPixel: ScreenPoint;
      startScene: Vec2;
      /** Ctrl/⌘ or Shift was held: the rectangle adds to the selection instead of replacing it. */
      additive: boolean;
      /** The selection at the press: what an additive rectangle adds to, and what Esc restores. */
      restore: Selection;
      /** The objects do not answer the pointer (`pointerReach.ts`): no rectangle grows from the
       * press, which is a click that clears the selection or nothing. */
      still?: true;
    }
  | {
      /** The selection rectangle being drawn; the selection follows it live. */
      kind: 'marquee';
      startScene: Vec2;
      additive: boolean;
      restore: Selection;
      /** The clips `restore` highlights (what the rectangle adds to). */
      initial: ClipId[];
      cancelled: boolean;
    }
  | {
      /** Alt pressed on a formula whose glyphs can be picked (D74): a glyph rectangle after
       * DRAG_THRESHOLD px, else a click that picks the glyph under the pointer on release — it
       * joins the glyphs picked in this formula and in the others (D117); Shift: the range from
       * the last one picked in this formula — or clears the pick when there is none. */
      kind: 'glyph-press';
      clipId: ClipId;
      startPixel: ScreenPoint;
      startScene: Vec2;
      /** The glyph under the pointer at the press, or null. */
      glyph: number | null;
      /** Shift was held: the rectangle adds to the pick, a click takes a range. */
      additive: boolean;
      /** The formula's render at the press: the glyph is one of its index space. */
      revision: PickRevision;
      /** The selection at the press: what Esc brings back, with the pick, from a rectangle. */
      selection: Selection;
    }
  | {
      /** The glyph rectangle being drawn, begun on the formula of `clipId`; the pick follows it
       * live, among the glyphs of every formula it touches. */
      kind: 'glyph-marquee';
      /** The clip the drag began on: the selection while the rectangle picks nothing. */
      clipId: ClipId;
      startScene: Vec2;
      additive: boolean;
      /** The pick at the press: what an additive rectangle adds to, and what Esc restores. */
      restore: GlyphPick | null;
      /** The selection at the press, restored with it. */
      restoreSelection: Selection;
      /** The render of each formula the rectangle has touched, as it was then. */
      revisions: Map<ClipId, PickRevision>;
      cancelled: boolean;
    }
  | {
      kind: 'press';
      clipId: ClipId;
      startPixel: ScreenPoint;
      startScene: Vec2;
      locked: boolean;
      /** The user was told that the clip is locked after its transformations. */
      warned?: boolean;
      /** A plain click inside a multi-selection: it narrows to this clip on release, unless the
       * press became a drag. */
      collapseTo?: ClipId;
    }
  | {
      kind: 'drag';
      clipId: ClipId;
      startScene: Vec2;
      /** The keyframe's position, or the part's shift, when the drag began. */
      startPosition: Vec2;
      ref: KeyframeRef;
      /** Set when the drag moves a part transform's end state (its shift) instead. */
      part?: ActionId;
      /** The other selected clips, moved by the same travel. */
      companions: Companion[];
      /** What the drag snaps with (set by the panel when it has the boxes); null = no snapping. */
      snap?: DragSnap | null;
      cancelled: boolean;
    }
  | {
      /** Pressed on a transform handle; becomes `transform` after DRAG_THRESHOLD px. */
      kind: 'handle-press';
      handle: HandleId;
      clipId: ClipId;
      startPixel: ScreenPoint;
      startScene: Vec2;
      center: Vec2;
      /** The clips the handles frame when several are selected: they scale or turn as a group. */
      group?: ClipId[];
    }
  | {
      kind: 'transform';
      handle: HandleId;
      clipId: ClipId;
      ref: KeyframeRef;
      /** The formula's centre, which stays where it is. */
      center: Vec2;
      startScene: Vec2;
      /** Scale or rotation of the keyframe (or of the part) when the drag began. */
      startValue: number;
      /** Set when the handles scale or rotate a part transform's end state instead. */
      part?: ActionId;
      tracker: RotationTracker;
      cancelled: boolean;
      /** What a corner drag's size snaps with (set by the panel when it has the boxes): the box
       * where the drag began and the other clips' boxes; null = no size guides. */
      size?: { box: Box; targets: readonly Box[] } | null;
      /** Set for a group: the members whose keyframe can be edited, with where they began. The
       * group scales by a factor (`startValue` 1) or turns by an angle (`startValue` 0) about
       * `center`, the centre of its box. */
      members?: TransformMember[];
    };

/** A clip that moves along with the dragged one: its keyframe and where it was. */
export interface Companion {
  clipId: ClipId;
  ref: KeyframeRef;
  startPosition: Vec2;
}

export type Press = Extract<Gesture, { kind: 'press' }>;
export type MarqueePress = Extract<Gesture, { kind: 'marquee-press' }>;
export type GlyphPress = Extract<Gesture, { kind: 'glyph-press' }>;
export type GlyphMarquee = Extract<Gesture, { kind: 'glyph-marquee' }>;
export type Marquee = Extract<Gesture, { kind: 'marquee' }>;
export type HandlePress = Extract<Gesture, { kind: 'handle-press' }>;
export type Drag = Extract<Gesture, { kind: 'drag' }>;
export type Transform = Extract<Gesture, { kind: 'transform' }>;

/** What the preview may edit now: the playhead, the end state under edit, and the clips the
 * user unlocked. */
export interface EditContext {
  time: number;
  editing: TransformEditTarget | null;
  unlocked: readonly ClipId[];
}

/** The drag a press on the formula becomes, or `blocked` when the clip's keyframe cannot be
 * edited now. `others` are the other selected clips (editable ones: on screen, unlocked track):
 * those whose keyframe can be edited move along; a part drag moves the part alone. The arrow keys
 * move the selection through the same drag, from a press of their own (`nudge.ts`). */
export function startDrag(
  press: Pick<Press, 'clipId' | 'startScene'>,
  clip: Clip,
  context: EditContext,
  others: readonly Clip[] = [],
): Drag | 'blocked' {
  const part = partEditOf(clip, context.editing);
  if (part) {
    // Dragging the formula while a part's end state is edited moves the part: its shift.
    return {
      kind: 'drag',
      clipId: press.clipId,
      startScene: press.startScene,
      startPosition: [part.shift[0], part.shift[1]],
      ref: { kind: 'initial' },
      part: part.id,
      companions: [],
      cancelled: false,
    };
  }
  const edit = previewEdit(clip, context.time, context.editing, context.unlocked);
  if ('blocked' in edit) return 'blocked';
  const companions: Companion[] = [];
  for (const other of others) {
    if (other.id === clip.id || partEditOf(other, context.editing)) continue;
    const otherEdit = previewEdit(other, context.time, context.editing, context.unlocked);
    if ('blocked' in otherEdit) continue;
    companions.push({
      clipId: other.id,
      ref: otherEdit.ref,
      startPosition: [otherEdit.state.position[0], otherEdit.state.position[1]],
    });
  }
  return {
    kind: 'drag',
    clipId: press.clipId,
    startScene: press.startScene,
    startPosition: [edit.state.position[0], edit.state.position[1]],
    ref: edit.ref,
    companions,
    cancelled: false,
  };
}

/** The scale or rotation drag a press on a handle becomes, or `blocked`. */
export function startTransform(
  press: HandlePress,
  clip: Clip,
  context: EditContext,
): Transform | 'blocked' {
  const base = {
    kind: 'transform' as const,
    handle: press.handle,
    clipId: press.clipId,
    center: press.center,
    startScene: press.startScene,
    tracker: beginRotation(press.center, press.startScene),
    cancelled: false,
  };
  const part = partEditOf(clip, context.editing);
  if (part) {
    return {
      ...base,
      ref: { kind: 'initial' },
      startValue: press.handle === 'rotate' ? part.rotation : part.scale,
      part: part.id,
    };
  }
  const edit = previewEdit(clip, context.time, context.editing, context.unlocked);
  if ('blocked' in edit) return 'blocked';
  return {
    ...base,
    ref: edit.ref,
    startValue: press.handle === 'rotate' ? edit.state.rotation : edit.state.scale,
  };
}

/** A member of a group transform: where it began, and the keyframe the transform writes. */
export interface TransformMember extends GroupMember {
  ref: KeyframeRef;
}

/** The group scale or rotation a press on the group's handles becomes: the group's `clips` whose
 * keyframe can be edited now (a clip whose part is under edit, or that is locked after its
 * transformations, is left out), each with where it began — or `blocked` when none can. */
export function startGroupTransform(
  press: HandlePress,
  clips: readonly Clip[],
  context: EditContext,
): Transform | 'blocked' {
  const members: TransformMember[] = [];
  for (const clip of clips) {
    if (partEditOf(clip, context.editing)) continue;
    const edit = previewEdit(clip, context.time, context.editing, context.unlocked);
    if ('blocked' in edit) continue;
    members.push({
      clipId: clip.id,
      ref: edit.ref,
      startPosition: [edit.state.position[0], edit.state.position[1]],
      startScale: edit.state.scale,
      startRotation: edit.state.rotation,
    });
  }
  const first = members[0];
  if (!first) return 'blocked';
  return {
    kind: 'transform',
    handle: press.handle,
    clipId: first.clipId,
    ref: first.ref,
    center: press.center,
    startScene: press.startScene,
    startValue: press.handle === 'rotate' ? 0 : 1,
    tracker: beginRotation(press.center, press.startScene),
    cancelled: false,
    members,
  };
}

/** What a drag changes: where the formula is, how big it is, or how far it is turned. */
export interface EditPatch {
  position?: Vec2;
  scale?: number;
  rotation?: number;
}

/** Write a move of a drag's clips by `travel` (scene units) to a draft of the project: the clip
 * dragged and its companions, each from where it began, to six decimals as the handles write — a
 * snapped edge lands exactly on its target, and a step of 0.01 of the arrow keys leaves no
 * 0.30000000000000004. A coordinate the travel does not move (0 along it: a drag held to the other
 * axis, an arrow key) keeps the value it had. */
export function writeTravel(draft: Project, drag: Drag, travel: Vec2): void {
  const moved = ([x, y]: Vec2): Vec2 => [
    travel[0] === 0 ? x : round6(x + travel[0]),
    travel[1] === 0 ? y : round6(y + travel[1]),
  ];
  const clip = draft.clips.find((c) => c.id === drag.clipId);
  if (clip) applyEdit(clip, drag, { position: moved(drag.startPosition) });
  for (const companion of drag.companions) {
    const other = draft.clips.find((c) => c.id === companion.clipId);
    if (other) applyEdit(other, companion, { position: moved(companion.startPosition) });
  }
}

/** Write a drag's result to the clip (a draft of it): to the part's end state, where a position
 * is its shift, or to the keyframe. */
export function applyEdit(
  clip: Clip,
  edit: { ref: KeyframeRef; part?: ActionId },
  patch: EditPatch,
): void {
  if (edit.part) {
    const action = clip.actions.find((a) => a.id === edit.part);
    if (action?.kind !== 'transform') return;
    if (patch.position) action.shift = patch.position;
    if (patch.scale !== undefined) action.scale = patch.scale;
    if (patch.rotation !== undefined) action.rotation = patch.rotation;
    return;
  }
  patchKeyframe(clip, edit.ref, patch);
}
