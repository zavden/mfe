/* Copy the state of one clip — its placement and appearance as shown at the playhead — and paste
 * all or part of it onto the selected clips: a small in-app clipboard (not the system one:
 * nothing leaves the page, and a paste needs no permission) and the glue to the stores. A paste
 * writes the keyframe a drag writes (`patchKeyframe`) on every selected clip the preview may
 * edit now — the rules of `editableSelection`: on screen at the playhead, on an unlocked track,
 * not locked after a transformation, no part's end state under edit — in one undo step; the
 * other selected clips stay and the notice names them. What a paste writes is chosen by group
 * (D57): everything but the position, the transformation (scale, rotation, flips), the
 * appearance (opacity, colour override), the per-glyph colours — onto clips of the same formula
 * only, since they go by glyph index — or the position alone, which stacks several clips on one
 * point on purpose. */
import { create } from 'zustand';
import type { Clip, ClipId, ClipState, FormulaId } from '../../model';
import { patchKeyframe, stateAt, type KeyframeRef } from '../../scene';
import { history, useProjectStore, useUiStore } from '../../store';
import { previewEdit, useTransformEdit } from '../animations/transformEdit';
import { highlightedClipIds } from '../selection';
import { editableSelection, reportSkipped } from './alignActions';
import { rotationReadout, scaleReadout } from './handles';

/** What Copy takes: the clip's state as shown at the playhead, and the formula it belongs to
 * (its per-glyph colours go by that formula's glyph indices). */
export interface ClipProperties extends ClipState {
  formulaId: FormulaId;
}

/** What a Paste writes: all of it but the position, or one group. */
export type PasteGroup = 'all' | 'transformation' | 'appearance' | 'glyph-colors' | 'position';

/** The groups in menu order, with their labels. */
export const PASTE_GROUPS: readonly { id: PasteGroup; label: string }[] = [
  { id: 'all', label: 'All but position' },
  { id: 'transformation', label: 'Transformation' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'glyph-colors', label: 'Glyph colours' },
  { id: 'position', label: 'Position' },
];

const FIELDS: Record<Exclude<PasteGroup, 'all'>, readonly (keyof ClipState)[]> = {
  transformation: ['scale', 'rotation', 'flipX', 'flipY'],
  appearance: ['opacity', 'color'],
  'glyph-colors': ['glyphColors'],
  position: ['position'],
};
const ALL_FIELDS = [...FIELDS.transformation, ...FIELDS.appearance, ...FIELDS['glyph-colors']];

interface PropertyClipboardState {
  /** The last copied properties; null until something is copied. */
  properties: ClipProperties | null;
  set(properties: ClipProperties | null): void;
}

export const usePropertyClipboard = create<PropertyClipboardState>()((set) => ({
  properties: null,
  set: (properties) => set({ properties }),
}));

/** The properties of `clip` as shown at the playhead (a copy: later edits leave it alone). */
export function propertiesOf(clip: Clip): ClipProperties {
  const { time } = useUiStore.getState();
  const { meta } = useProjectStore.getState().project;
  const state = stateAt(clip, time, meta.target);
  return {
    ...state,
    position: [state.position[0], state.position[1]],
    glyphColors: { ...state.glyphColors },
    formulaId: clip.formulaId,
  };
}

/** The clip a Copy takes: `clipId` when given, else the single highlighted clip; null when
 * there is none (or several). */
export function copySource(clipId?: ClipId): Clip | null {
  const { clips } = useProjectStore.getState().project;
  const id = clipId ?? singleHighlighted();
  return id ? (clips.find((c) => c.id === id) ?? null) : null;
}

function singleHighlighted(): ClipId | null {
  const ids = highlightedClipIds(useUiStore.getState().selection);
  return ids.length === 1 ? ids[0]! : null;
}

/** Copy the properties of `clipId` (or of the single highlighted clip). Whether it did. */
export function copyProperties(clipId?: ClipId): boolean {
  const source = copySource(clipId);
  if (!source) return false;
  usePropertyClipboard.getState().set(propertiesOf(source));
  return true;
}

/** What pasting `group` of `properties` writes onto `clip`: the group's fields, copied; the
 * per-glyph colours only onto a clip of the same formula (they go by its glyph indices). */
export function pastePatch(
  properties: ClipProperties,
  group: PasteGroup,
  clip: Pick<Clip, 'formulaId'>,
): Partial<ClipState> {
  const patch: Partial<ClipState> = {};
  for (const field of group === 'all' ? ALL_FIELDS : FIELDS[group]) {
    if (field === 'position') patch.position = [properties.position[0], properties.position[1]];
    else if (field === 'glyphColors') {
      if (clip.formulaId === properties.formulaId)
        patch.glyphColors = { ...properties.glyphColors };
    } else (patch as Record<string, unknown>)[field] = properties[field];
  }
  return patch;
}

/** The per-glyph colours a keyframe shows once `copied` is pasted: on the initial state they
 * replace the clip's (a paste makes the clip look like the source); a tween's target can only
 * add to them, as the tween editor does. */
function glyphColorsAfter(
  ref: KeyframeRef,
  current: Record<string, string>,
  copied: Record<string, string>,
): Record<string, string> {
  return ref.kind === 'initial' ? copied : { ...current, ...copied };
}

function sameColors(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** Whether writing `patch` to the keyframe (`ref`, whose state is `state`) changes anything. */
function wouldChange(ref: KeyframeRef, state: ClipState, patch: Partial<ClipState>): boolean {
  for (const field of Object.keys(patch) as (keyof ClipState)[]) {
    if (field === 'position') {
      const [x, y] = patch.position!;
      if (x !== state.position[0] || y !== state.position[1]) return true;
    } else if (field === 'glyphColors') {
      const after = glyphColorsAfter(ref, state.glyphColors, patch.glyphColors!);
      if (!sameColors(after, state.glyphColors)) return true;
    } else if (patch[field] !== state[field]) return true;
  }
  return false;
}

/** Write `patch` to the keyframe (mutates a draft). */
function writePatch(clip: Clip, ref: KeyframeRef, patch: Partial<ClipState>): void {
  patchKeyframe(clip, ref, patch);
  if (ref.kind === 'initial' && patch.glyphColors) {
    clip.initial.glyphColors = { ...patch.glyphColors };
  }
}

/** Paste `group` of the copied properties onto the selected clips that can be edited now, in
 * one undo step. Nothing happens, and no undo step is added, when nothing was copied, no
 * selected clip can take them, or none would change. Whether anything changed. */
export function pasteProperties(group: PasteGroup = 'all'): boolean {
  const properties = usePropertyClipboard.getState().properties;
  if (!properties) return false;
  // Ctrl/⌘+V can come during a drag: which clips are on screen, and which would change, is asked
  // of the project the drag leaves.
  history.cancelForeignGesture();
  const { items, skipped } = editableSelection();
  reportSkipped(skipped);
  if (items.length === 0) return false;
  const targets = new Set(items.map((item) => item.id));
  const { time } = useUiStore.getState();
  const { editing, unlocked } = useTransformEdit.getState();
  const { clips, formulas } = useProjectStore.getState().project;
  // A line has no scale, turn or flip of its own: it takes the rest of what is pasted.
  const lines = new Set(formulas.filter((f) => f.kind === 'line').map((f) => f.id));
  const patchFor = (clip: Clip) => {
    const patch = pastePatch(properties, group, clip);
    if (lines.has(clip.formulaId)) for (const field of FIELDS.transformation) delete patch[field];
    return patch;
  };
  const changing = new Set<ClipId>();
  for (const clip of clips) {
    if (!targets.has(clip.id)) continue;
    const edit = previewEdit(clip, time, editing, unlocked);
    if ('blocked' in edit) continue;
    if (wouldChange(edit.ref, edit.state, patchFor(clip))) {
      changing.add(clip.id);
    }
  }
  if (changing.size === 0) return false;
  useProjectStore.getState().update((draft) => {
    for (const clip of draft.clips) {
      if (!changing.has(clip.id)) continue;
      const edit = previewEdit(clip, time, editing, unlocked);
      if (!('blocked' in edit)) writePatch(clip, edit.ref, patchFor(clip));
    }
  });
  return true;
}

const SEP = ' · ';
const percent = (opacity: number) => `${Math.round(opacity * 100)} %`;
const coordinate = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);

/** What a Paste of `group` would write, for a menu label: "× 1.60 · 15° · flipped",
 * "80 % · #FF0000", "3 glyphs", "1.00, -0.50". */
export function pasteLabel(properties: ClipProperties, group: PasteGroup): string {
  const glyphs = Object.keys(properties.glyphColors).length;
  switch (group) {
    case 'transformation': {
      const parts = [scaleReadout(properties.scale)];
      if (properties.rotation !== 0) parts.push(rotationReadout(properties.rotation));
      if (properties.flipX || properties.flipY) parts.push('flipped');
      return parts.join(SEP);
    }
    case 'appearance': {
      const parts = [percent(properties.opacity)];
      if (properties.color !== null) parts.push(properties.color);
      return parts.join(SEP);
    }
    case 'glyph-colors':
      return glyphs === 0 ? 'none' : `${glyphs} glyph${glyphs === 1 ? '' : 's'}`;
    case 'position':
      return `${coordinate(properties.position[0])}, ${coordinate(properties.position[1])}`;
    case 'all': {
      const parts = [
        pasteLabel(properties, 'transformation'),
        pasteLabel(properties, 'appearance'),
      ];
      if (glyphs > 0) parts.push(pasteLabel(properties, 'glyph-colors'));
      return parts.join(SEP);
    }
  }
}
