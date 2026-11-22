/* What the glyphs picked in the preview (`glyphPick.ts`, D74) can take: a colour or none, hidden
 * or shown at the start — the formula's own fields, as the Creator's glyph menu sets them — a
 * brace on a side, a shape; through the actions of the Creator, the braces and the shapes, each
 * one undo step. A brace or a shape added on the pick becomes the selection, so the pick goes.
 * Their own colours can also be copied as a sequence and pasted onto another pick of the same
 * symbols (`colourSequence.ts`, D92), in this object or another. Glyphs picked in several
 * formulas (D117) take a colour, or lose their own, all in one undo step, and one brace or one
 * shape over them all — Manim's `Brace(VGroup(…))` —; hiding, a colour sequence and the glyph
 * dialogs are of one formula. */
import { create } from 'zustand';
import {
  BRACE_SIDE_DEGREES,
  type AttachSide,
  type AttachTarget,
  type ClipId,
  type Formula,
  type GlyphTarget,
  type Project,
} from '../../model';
import { useProjectStore } from '../../store';
import { addBrace } from '../animations/braceActions';
import { addShape, type ShapeChoice } from '../animations/shapeActions';
import { useGlyphsDialog, type GlyphsDialogWhat } from '../animations/glyphsDialogStore';
import { assignGlyphColors, setGlyphColorsOf, setGlyphsHidden } from '../creator/formulaActions';
import { notify } from '../project/noticeStore';
import {
  colourSequenceOf,
  glyphLabels,
  pairColourSequence,
  type ColourSequence,
  type SequencePairing,
} from './colourSequence';
import { pickedGlyphs, pickTarget, samePick, singlePart, type GlyphPick } from './glyphPick';
import { resolveGlyphPick, useGlyphPick } from './glyphPickStore';

/** A part of the pick with its clip's formula. */
interface PartNow {
  clipId: ClipId;
  formula: Formula;
  /** The picked glyphs, ascending. */
  glyphs: number[];
  /** What they name in an attachment: every glyph of the formula as `'all'`. */
  target: GlyphTarget;
}

/** The parts of the pick, each with its clip's formula; null when there is no pick or one of
 * its clips is gone. */
function partsNow(expected?: GlyphPick): PartNow[] | null {
  const pick = useGlyphPick.getState().current();
  if (!pick) return null;
  // A held menu belongs to the pick it displayed, even if another pick is made meanwhile.
  if (expected && !samePick(pick, resolveGlyphPick(expected))) return null;
  const { project } = useProjectStore.getState();
  const parts: PartNow[] = [];
  for (const part of pick.parts) {
    const clip = project.clips.find((c) => c.id === part.clipId);
    const formula = project.formulas.find((f) => f.id === clip?.formulaId);
    if (!clip || !formula) return null;
    parts.push({
      clipId: clip.id,
      formula,
      glyphs: pickedGlyphs(part),
      target: pickTarget(part, formula.snapshot?.glyphs.length ?? 0),
    });
  }
  return parts;
}

/** The pick when it is in one clip, with that clip's formula: what the actions on one formula
 * work on. Null when there is none, when its clip is gone, or when it is over several clips. */
function pickNow(expected?: GlyphPick): PartNow | null {
  if (!singlePart(useGlyphPick.getState().current())) return null;
  return partsNow(expected)?.[0] ?? null;
}

/** The picked glyphs when the pick is on clip `clipId` alone (a dialog starts from them), else
 * undefined. */
export function pickedGlyphsOf(clipId: ClipId): number[] | undefined {
  const now = pickNow();
  return now?.clipId === clipId ? now.glyphs : undefined;
}

/** What the pick names on clip `clipId` when it is on that clip alone (a brace or a shape from
 * the clip's menu goes on it), else undefined. */
export function pickedTargetOf(clipId: ClipId): GlyphTarget | undefined {
  const now = pickNow();
  return now?.clipId === clipId ? now.target : undefined;
}

/** What the colour items can do on `glyphs` of `formula`: a colour of their own to clear,
 * shown ones to hide at the start, hidden ones to show. */
export function pickColourState(
  formula: Formula,
  glyphs: readonly number[],
): { canClearColor: boolean; canHide: boolean; canShow: boolean } {
  const hidden = new Set(formula.hiddenGlyphs);
  return {
    canClearColor: glyphs.some((g) => String(g) in formula.glyphColors),
    canHide: glyphs.some((g) => !hidden.has(g)),
    canShow: glyphs.some((g) => hidden.has(g)),
  };
}

/** Whether a picked glyph has a colour of its own, which Clear colour would take off: in a pick
 * over one formula or several. */
export function pickHasColour(project: Project, pick: GlyphPick): boolean {
  return pick.parts.some((part) => {
    const clip = project.clips.find((c) => c.id === part.clipId);
    const colours = project.formulas.find((f) => f.id === clip?.formulaId)?.glyphColors ?? {};
    return [...part.selection.selected].some((glyph) => String(glyph) in colours);
  });
}

/** Colour the picked glyphs (`null`: their own colour goes), as the Creator's palette does:
 * those of every formula of the pick, as one undo step. */
export function colourPickedGlyphs(color: string | null, expected?: GlyphPick): void {
  const parts = partsNow(expected);
  if (!parts) return;
  setGlyphColorsOf(
    parts.map((part) => ({ id: part.formula.id, glyphs: part.glyphs })),
    color,
  );
}

/** Hide the picked glyphs at the start of every clip of the formula, or show them again. */
export function hidePickedGlyphs(hidden: boolean, expected?: GlyphPick): void {
  const now = pickNow(expected);
  if (now) setGlyphsHidden(now.formula.id, now.glyphs, hidden);
}

interface ColourSequenceClipboardState {
  /** The last copied colour sequence; null until one is copied. */
  sequence: ColourSequence | null;
  set(sequence: ColourSequence | null): void;
}

/** The copied colour sequence: an in-app clipboard, as the one of the clip properties
 * (`propertyClipboard.ts`) — nothing leaves the page. A sequence is symbols and colours, no
 * reference to where it came from: it outlives that object, and the project. */
export const useColourSequenceClipboard = create<ColourSequenceClipboardState>()((set) => ({
  sequence: null,
  set: (sequence) => set({ sequence }),
}));

/** Copy the own colours of the picked glyphs, as a sequence. Whether it did. */
export function copyPickedColourSequence(expected?: GlyphPick): boolean {
  const now = pickNow(expected);
  const sequence = now && colourSequenceOf(now.formula, now.glyphs);
  if (!sequence) return false;
  useColourSequenceClipboard.getState().set(sequence);
  return true;
}

/** How `sequence` goes onto `glyphs` of `formula`, or why it does not. */
export function colourSequencePairing(
  formula: Formula,
  glyphs: readonly number[],
  sequence: ColourSequence,
): SequencePairing {
  const labels = glyphLabels(formula, glyphs);
  return labels && formula.snapshot
    ? pairColourSequence(sequence, labels, formula.snapshot.backend)
    : { ok: false, reason: 'The selected glyphs are not rendered yet.' };
}

/** Paste the copied colour sequence onto the picked glyphs, as one undo step: each takes the
 * colour of the copied glyph that is its symbol, and loses its own where that one had none.
 * A sequence that does not go onto the pick is not pasted, and a notice says why. Whether
 * anything changed. */
export function pastePickedColourSequence(expected?: GlyphPick): boolean {
  const now = pickNow(expected);
  const { sequence } = useColourSequenceClipboard.getState();
  if (!now || !sequence) return false;
  const pairing = colourSequencePairing(now.formula, now.glyphs, sequence);
  if (!pairing.ok) {
    notify({ kind: 'info', title: 'Colour sequence not pasted', message: pairing.reason });
    return false;
  }
  return assignGlyphColors(
    now.formula.id,
    new Map(now.glyphs.map((glyph, index) => [glyph, pairing.colors[index] ?? null])),
  );
}

/** The pick as the targets of an attachment or of a Transform's fit: each clip with its picked
 * glyphs — every glyph of a formula as `'all'` —, in the order the clips joined; null without a
 * pick. */
export function pickedTargets(): AttachTarget[] | null {
  const parts = partsNow();
  return parts ? parts.map((part) => ({ clipId: part.clipId, glyphs: part.target })) : null;
}

/** What the parts of a pick after the first are to an attachment on them all: its `also`. */
const alsoOf = (parts: readonly PartNow[]): AttachTarget[] =>
  parts.map((part) => ({ clipId: part.clipId, glyphs: part.target }));

/** A brace on the picked glyphs, pointing `side` (`addBrace`) — one brace over them all, when
 * they are of several formulas —: its clip becomes the selection. The new clip's id, or null
 * without a pick. */
export function braceOnPickedGlyphs(side: AttachSide, expected?: GlyphPick): ClipId | null {
  const [first, ...rest] = partsNow(expected) ?? [];
  if (!first) return null;
  return addBrace(first.clipId, first.target, BRACE_SIDE_DEGREES[side], alsoOf(rest));
}

/** A shape of `choice` on the picked glyphs (`addShape`) — one shape over them all, when they
 * are of several formulas —: its clip becomes the selection. The new clip's id, or null without
 * a pick. */
export function shapeOnPickedGlyphs(choice: ShapeChoice, expected?: GlyphPick): ClipId | null {
  const [first, ...rest] = partsNow(expected) ?? [];
  return first ? addShape(first.clipId, first.target, choice, alsoOf(rest)) : null;
}

/** Start the glyph dialog from the same validated pick as the immediate attachment commands. */
export function openPickedGlyphsDialog(what: GlyphsDialogWhat, expected: GlyphPick): void {
  const now = pickNow(expected);
  if (now) useGlyphsDialog.getState().open(now.clipId, what, now.glyphs);
}
