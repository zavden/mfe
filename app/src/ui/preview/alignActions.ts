/* Align and distribute the selected clips: the glue between the pure maths (`align.ts`, measuring
 * with `boxes.ts`) and the stores. It acts on the clips highlighted by the selection that are
 * on screen at the playhead, on an unlocked track, rendered, whose keyframe the preview may edit
 * now (not locked after a transformation, no part's end state under edit) and that are placed by
 * hand, not by what they hang on: the same rules as a drag. A move writes the same keyframe a
 * drag writes (`applyEdit`), all in one undo step, and moves nothing when every box is already in
 * place (no undo step).
 *
 * The other selected clips are left out of the measure and stay where they are, and the notice
 * names them whenever there are any (also when nothing else moved: the user asked for something
 * those clips did not do). A single alignable clip aligns to the frame, unless other selected
 * clips were left out (then it has nothing to align with and stays).
 *
 * An attached object (a brace, a shape, a label beside a formula) is placed by the glyphs it
 * hangs on: a position written to it is derived again by the attach sync, so it is neither
 * measured nor written. Selected with what it hangs on, it goes where that goes and is not named;
 * selected without it, it stays and is. */
import { attachTargets, type Clip, type ClipId } from '../../model';
import { fitInEffect } from '../../scene';
import { history, useProjectStore, useUiStore } from '../../store';
import { partEditOf, previewEdit, useTransformEdit } from '../animations/transformEdit';
import { notify } from '../project/noticeStore';
import { round6 } from '../time';
import { highlightedClipIds } from '../selection';
import type { IconName } from '../timeline/icons';
import { alignDeltas, distributeDeltas, type AlignEdge, type AlignItem, type Axis } from './align';
import { sceneFrameBox } from './boxes';
import { geometryNow } from './geometry';
import { previewEditableClips } from './previewLock';
import { applyEdit } from './gesture';

/** The eight actions of the Edit menu, the preview's context menu and the keyboard. */
export const ALIGN_ACTIONS = [
  {
    id: 'align-left',
    edge: 'left',
    label: 'Align left',
    short: 'Left',
    keys: 'Alt+A',
    icon: 'align-left',
  },
  {
    id: 'align-center',
    edge: 'centerX',
    label: 'Align centre',
    short: 'Centre',
    keys: 'Alt+H',
    icon: 'align-center',
  },
  {
    id: 'align-right',
    edge: 'right',
    label: 'Align right',
    short: 'Right',
    keys: 'Alt+D',
    icon: 'align-right',
  },
  {
    id: 'align-top',
    edge: 'top',
    label: 'Align top',
    short: 'Top',
    keys: 'Alt+W',
    icon: 'align-top',
  },
  {
    id: 'align-middle',
    edge: 'middle',
    label: 'Align middle',
    short: 'Middle',
    keys: 'Alt+V',
    icon: 'align-middle',
  },
  {
    id: 'align-bottom',
    edge: 'bottom',
    label: 'Align bottom',
    short: 'Bottom',
    keys: 'Alt+S',
    icon: 'align-bottom',
  },
] as const satisfies readonly {
  id: string;
  edge: AlignEdge;
  label: string;
  short: string;
  keys: string;
  /** Shown before the label in the menus. */
  icon: IconName;
}[];

export const DISTRIBUTE_ACTIONS = [
  {
    id: 'distribute-h',
    axis: 'x',
    label: 'Distribute horizontally',
    short: 'Horizontally',
    // The Control key on every system: ⌃⌥H on a Mac, not ⌥⌘H (`commandForKey`).
    keys: 'Ctrl+Alt+H',
    icon: 'distribute-h',
  },
  {
    id: 'distribute-v',
    axis: 'y',
    label: 'Distribute vertically',
    short: 'Vertically',
    keys: 'Ctrl+Alt+V',
    icon: 'distribute-v',
  },
] as const satisfies readonly {
  id: string;
  axis: Axis;
  label: string;
  short: string;
  keys: string;
  icon: IconName;
}[];

export interface Alignable {
  /** Each alignable clip's whole formula box at the playhead (scene units): every glyph where
   * it is now, part transforms included (`geometry.ts`). */
  items: AlignItem[];
  /** Selected clips that stay where they are. */
  skipped: Clip[];
}

/** The selected clips split into those whose keyframe the preview may edit now and those it may
 * not: what Paste properties writes to, and what Align and Distribute choose from. */
export function editableSelection(): Alignable {
  const { project } = useProjectStore.getState();
  const { selection, time } = useUiStore.getState();
  const { editing, unlocked } = useTransformEdit.getState();
  // On screen now and rendered: the clips the geometry knows.
  const shapes = geometryNow();
  const ids = highlightedClipIds(selection);
  const editable = new Set(previewEditableClips(project, ids).map((clip) => clip.id));
  const items: AlignItem[] = [];
  const skipped: Clip[] = [];
  // Project order, as everything that lists clips does.
  for (const clip of project.clips) {
    if (!ids.includes(clip.id)) continue;
    const shape = shapes.get(clip.id);
    const usable =
      shape !== undefined &&
      editable.has(clip.id) &&
      partEditOf(clip, editing) === null &&
      !('blocked' in previewEdit(clip, time, editing, unlocked));
    if (!usable) {
      skipped.push(clip);
      continue;
    }
    items.push({ id: clip.id, box: shape.box });
  }
  return { items, skipped };
}

/** The clips that place `clip` at `time` in the user's stead: those a Transform has carried its
 * shape to, while that Transform is what places it (`fitInEffect`), else those it hangs on
 * (`clip.attach`). None for a clip placed by hand. */
export function placedBy(clip: Clip, time: number): ClipId[] {
  const placer = fitInEffect(clip, time)?.fit ?? clip.attach;
  return placer ? attachTargets(placer).map((target) => target.clipId) : [];
}

/** The selected clips split into those Align and Distribute move now and those that stay: the
 * editable ones that are placed by hand. A clip placed by what it hangs on is never measured nor
 * moved; it is among `skipped` unless it hangs — itself, or through another attached object, as a
 * brace's label does — on a clip that is aligned, which it follows. */
export function alignableSelection(): Alignable {
  const editable = editableSelection();
  const { project } = useProjectStore.getState();
  const { selection, time } = useUiStore.getState();
  const ids = highlightedClipIds(selection);
  const hosts = new Map<ClipId, ClipId[]>();
  for (const clip of project.clips) {
    if (!ids.includes(clip.id)) continue;
    const placers = placedBy(clip, time);
    if (placers.length > 0) hosts.set(clip.id, placers);
  }
  if (hosts.size === 0) return editable;
  const items = editable.items.filter((item) => !hosts.has(item.id));
  // What goes somewhere: the clips aligned, and whatever hangs on one of them.
  const going = new Set(items.map((item) => item.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, placers] of hosts) {
      if (going.has(id) || !placers.some((host) => going.has(host))) continue;
      going.add(id);
      grew = true;
    }
  }
  return {
    items,
    skipped: project.clips.filter((clip) => ids.includes(clip.id) && !going.has(clip.id)),
  };
}

/** Move the clips by `deltas` (one undo step); whether any moved. A position holds six decimals,
 * and a delta is exact: a clip whose rounded position is the one it has is left as it is. A side
 * of a 16:9 frame is at ∓64/9 and an even spacing may ask for gaps of thirds, which six decimals
 * do not hold, so a clip put there is always a ten-millionth from where it is asked to be. When
 * no clip moves the project is not written, and the history takes no step. */
function move(deltas: ReadonlyMap<ClipId, readonly [number, number]>): boolean {
  if (deltas.size === 0) return false;
  const { time } = useUiStore.getState();
  const { editing, unlocked } = useTransformEdit.getState();
  let moved = false;
  useProjectStore.getState().update((draft) => {
    for (const clip of draft.clips) {
      const delta = deltas.get(clip.id);
      if (!delta) continue;
      const edit = previewEdit(clip, time, editing, unlocked);
      if ('blocked' in edit) continue;
      const [x, y] = edit.state.position;
      const to: [number, number] = [round6(x + delta[0]), round6(y + delta[1])];
      if (to[0] === x && to[1] === y) continue;
      applyEdit(clip, edit, { position: to });
      moved = true;
    }
  });
  return moved;
}

/** Name the clips that did not take part (in an alignment, or in a group transform). */
export function reportSkipped(skipped: readonly Clip[]): void {
  if (skipped.length === 0) return;
  const { formulas } = useProjectStore.getState().project;
  const names = skipped.map((clip) => {
    const formula = formulas.find((f) => f.id === clip.formulaId);
    return `“${formula?.name ?? 'Formula'}”`;
  });
  notify({
    kind: 'info',
    title: skipped.length === 1 ? '1 clip stayed' : `${skipped.length} clips stayed`,
    message:
      `${names.join(', ')}: a clip is left alone when it is attached to another, locked in the ` +
      'preview or after its transformations, on a locked track, or off screen now.',
  });
}

/** Align the selection's clips on `edge` of the box enclosing them, or of the frame (`toFrame`,
 * and always for a lone clip) — the scene camera's at the playhead, when the scene has one
 * (`sceneFrameBox`). Whether anything moved. */
export function alignSelection(edge: AlignEdge, toFrame = false): boolean {
  // Its keys can come during a drag: what is measured is where the formulas are without it.
  history.cancelForeignGesture();
  const { items, skipped } = alignableSelection();
  // The frame is what the scene is seen through now: the camera's, in a scene with one.
  const frame =
    toFrame || (items.length === 1 && skipped.length === 0)
      ? sceneFrameBox(useProjectStore.getState().project, useUiStore.getState().time)
      : null;
  const moved = move(alignDeltas(items, edge, frame));
  reportSkipped(skipped);
  return moved;
}

/** Space the selection's clips evenly along `axis` (3 or more). Whether anything moved. */
export function distributeSelection(axis: Axis): boolean {
  history.cancelForeignGesture();
  const { items, skipped } = alignableSelection();
  const moved = move(distributeDeltas(items, axis));
  reportSkipped(skipped);
  return moved;
}
