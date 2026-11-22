/* The glyph pick of the preview (D74, D117): with Alt held, a click on a glyph of a formula picks
 * it — a click on a picked one takes it out, Shift takes the range from the last one picked in
 * that formula — and a drag that starts on a formula draws a rectangle that picks the glyphs it
 * touches, of every formula (Shift adds them). The pick is parts of the formulas of one or more
 * clips, as the preview draws them now: what the glyph actions colour, hide or put a brace or a
 * shape on (`glyphActions.ts`). The rules of a click, a range and a box are the Creator's
 * (`creator/glyphSelection.ts`), formula by formula. Pure: no DOM, no stores. */
import { contoursBox, type Box } from '../../geom';
import { KINDS, type ClipId, type Formula, type GlyphTarget, type Project } from '../../model';
import type { Drawable } from '../../scene';
import type { Selection } from '../../store';
import {
  clampSelection,
  clickGlyph,
  marqueeSelection,
  NO_SELECTION,
  type GlyphSelection,
} from '../creator/glyphSelection';
import { highlightedClipIds } from '../selection';

/** The glyphs picked on one clip: a part of its formula. */
export interface PickPart {
  clipId: ClipId;
  selection: GlyphSelection;
  /** Transient ownership, attached by the pick store; never part of a project file. */
  revision?: PickRevision;
}

/** The glyphs picked in the preview: a part of the formula of each of one or more clips, in the
 * order the clips joined. Never without a part, and no part without a glyph: nothing picked is
 * `null`. */
export interface GlyphPick {
  parts: readonly PickPart[];
}

export interface PickRevision {
  document: number;
  session: number;
  formulaId: string;
  key: string | null;
}

/** Whether what is drawn of `formula` is drawn from its snapshot: `drawn` is the formula the
 * render on screen was resolved for. The two part for a moment when the formula is rendered
 * again — the snapshot is amended before its render is published — and the glyphs on screen are
 * then numbered as the snapshot before: a click must wait for the render. */
export function drawsSnapshot(
  formula: Pick<Formula, 'snapshot'>,
  drawn: { formula: Pick<Formula, 'snapshot'> } | undefined,
): boolean {
  return (drawn?.formula.snapshot?.key ?? null) === (formula.snapshot?.key ?? null);
}

/** The glyphs of one clip a rectangle touches (`glyphsTouching`). */
export interface PickTouch {
  clipId: ClipId;
  /** Ascending, each once. */
  glyphs: number[];
}

/** CSS pixels around a glyph's box within which an Alt+click still picks it: the gap of an "="
 * or a thin stroke is hard to aim at. */
export const PICK_REACH = 6;

/** How many picked glyphs a description lists before it only counts them. */
const LISTED = 12;

/** Whether a drawable is a glyph that can be picked: an object of the project (a temporary
 * effect, glyph −1, is not). */
export function pickable(d: Drawable): boolean {
  return d.role === 'object' && d.glyph >= 0;
}

/** Whether the glyphs of the formula of clip `clipId` can be picked: its kind colours and hides
 * them one by one (a brace or a shape is one glyph, and takes neither a brace nor a shape). */
export function pickableClip(project: Project, clipId: ClipId): boolean {
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = project.formulas.find((f) => f.id === clip?.formulaId);
  return formula !== undefined && KINDS[formula.kind].glyphColors;
}

/** Whether two boxes share at least one point (closed intervals: touching edges count). */
const touches = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** The glyphs drawn now whose box touches `rect` (edges and corners count), clip by clip — the
 * clips `canPick` takes: `first` (the one a drag began on) and then the others in the order
 * they are drawn — each glyph once (a morph's pieces share their glyph). A clip the rectangle
 * does not touch is not listed. */
export function glyphsTouching(
  drawables: readonly Drawable[],
  rect: Box,
  canPick: (clipId: ClipId) => boolean,
  first?: ClipId,
): PickTouch[] {
  const touched = new Map<ClipId, Set<number>>();
  const refused = new Set<ClipId>();
  for (const d of drawables) {
    if (!pickable(d) || refused.has(d.clipId) || touched.get(d.clipId)?.has(d.glyph)) continue;
    const box = contoursBox(d.path.contours);
    if (!Number.isFinite(box.minX) || !touches(box, rect)) continue;
    let glyphs = touched.get(d.clipId);
    if (!glyphs) {
      if (!canPick(d.clipId)) {
        refused.add(d.clipId);
        continue;
      }
      glyphs = new Set();
      touched.set(d.clipId, glyphs);
    }
    glyphs.add(d.glyph);
  }
  return [...touched]
    .sort(([a], [b]) => Number(b === first) - Number(a === first))
    .map(([clipId, glyphs]) => ({ clipId, glyphs: [...glyphs].sort((a, b) => a - b) }));
}

/** The pick of `parts`, without the parts that have no glyph; null when none has. */
function pickOf(parts: readonly PickPart[]): GlyphPick | null {
  const kept = parts.filter((part) => part.selection.selected.size > 0);
  return kept.length > 0 ? { parts: kept } : null;
}

/** The part of clip `clipId` in a pick, if it has one. */
export function pickPart(pick: GlyphPick | null, clipId: ClipId): PickPart | undefined {
  return pick?.parts.find((part) => part.clipId === clipId);
}

/** The only part of a pick of one clip; null for a pick over several (what works on one formula
 * — a colour sequence, the glyph dialogs — asks for it). */
export function singlePart(pick: GlyphPick | null): PickPart | null {
  return pick?.parts.length === 1 ? pick.parts[0]! : null;
}

/** The clips a pick has glyphs of, in the order they joined: the selection while it lasts. */
export function pickClipIds(pick: GlyphPick): ClipId[] {
  return pick.parts.map((part) => part.clipId);
}

/** Whether `glyph` of clip `clipId` is picked. */
export function pickHas(pick: GlyphPick | null, clipId: ClipId, glyph: number): boolean {
  return pickPart(pick, clipId)?.selection.selected.has(glyph) ?? false;
}

/** How many glyphs are picked, over every part. */
export function pickCount(pick: GlyphPick): number {
  return pick.parts.reduce((sum, part) => sum + part.selection.selected.size, 0);
}

/** The pick after an Alt+click on `glyph` of clip `clipId` (null: on the formula, off its
 * glyphs — nothing stays picked): the glyph joins the part of that clip, or leaves it when it
 * was picked — with `shift`, the range from the last one picked in that clip joins — and the
 * parts of the other clips stay as they are. A glyph of a clip without a part starts its part.
 * Null when nothing is picked. */
export function pickByClick(
  current: GlyphPick | null,
  clipId: ClipId,
  glyph: number | null,
  shift: boolean,
): GlyphPick | null {
  if (glyph === null) return null;
  const parts = current?.parts ?? [];
  const own = parts.find((part) => part.clipId === clipId);
  const selection = clickGlyph(own?.selection ?? NO_SELECTION, glyph, { shift, toggle: true });
  return pickOf(
    own
      ? parts.map((part) => (part === own ? { ...own, selection } : part))
      : [...parts, { clipId, selection }],
  );
}

/** The pick while an Alt+drag rectangle touches `touched`: those glyphs — with `additive`
 * (Shift) along with the pick the drag started from (`restore`), whose parts come first. Null
 * when nothing is picked. */
export function pickByRect(
  restore: GlyphPick | null,
  touched: readonly PickTouch[],
  additive: boolean,
): GlyphPick | null {
  const before = restore?.parts ?? [];
  const parts: PickPart[] = additive ? [...before] : [];
  for (const { clipId, glyphs } of touched) {
    const own = before.find((part) => part.clipId === clipId);
    const selection = marqueeSelection(own?.selection ?? NO_SELECTION, glyphs, additive);
    const at = parts.findIndex((part) => part.clipId === clipId);
    // A part the drag started from keeps what it owns (its revision), whatever it picks now.
    const next = { ...own, clipId, selection };
    if (at >= 0) parts[at] = next;
    else parts.push(next);
  }
  return pickOf(parts);
}

/** The picked glyphs of a part, ascending. */
export function pickedGlyphs(part: PickPart): number[] {
  return [...part.selection.selected].sort((a, b) => a - b);
}

/** What a part names in an attachment or a block: `'all'` when it is every glyph of the formula
 * (`count` of them), else the list. */
export function pickTarget(part: PickPart, count: number): GlyphTarget {
  const glyphs = pickedGlyphs(part);
  return glyphs.length === count && count > 0 ? 'all' : glyphs;
}

/** The pick as the preview's frame spells it (`data-glyph-pick`): `ca:1,2` — clip, then its
 * glyphs ascending — the parts joined by `;`. */
export function pickKey(pick: GlyphPick | null): string {
  return pick
    ? pick.parts.map((part) => `${part.clipId}:${pickedGlyphs(part).join(',')}`).join(';')
    : '';
}

function sameRevision(a: PickRevision | undefined, b: PickRevision | undefined): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.document === b.document &&
      a.session === b.session &&
      a.formulaId === b.formulaId &&
      a.key === b.key)
  );
}

function samePart(a: PickPart, b: PickPart): boolean {
  if (a === b) return true;
  if (a.clipId !== b.clipId || a.selection.anchor !== b.selection.anchor) return false;
  if (!sameRevision(a.revision, b.revision)) return false;
  if (a.selection.selected.size !== b.selection.selected.size) return false;
  for (const glyph of a.selection.selected) if (!b.selection.selected.has(glyph)) return false;
  return true;
}

/** Whether two picks name the same glyphs of the same clips, in the same order (the store is
 * written only when they differ). */
export function samePick(a: GlyphPick | null, b: GlyphPick | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.parts.length !== b.parts.length) return false;
  return a.parts.every((part, index) => samePart(part, b.parts[index]!));
}

/** The pick once the project or the selection changed under it: nothing when one of its clips
 * is gone or has none of its picked glyphs left, or when its clips are not the selection (the
 * pick is parts of the selected formulas: another selection, or one more clip in it, lets it
 * go), and without the glyphs a formula no longer has. The same object comes back when nothing
 * changed, so that a caller can tell. */
export function prunePick(
  pick: GlyphPick | null,
  project: Project,
  selection: Selection,
): GlyphPick | null {
  if (!pick) return null;
  const highlighted = highlightedClipIds(selection);
  if (highlighted.length !== pick.parts.length) return null;
  let changed = false;
  const parts: PickPart[] = [];
  for (const part of pick.parts) {
    const clip = project.clips.find((c) => c.id === part.clipId);
    const formula = project.formulas.find((f) => f.id === clip?.formulaId);
    if (!clip || !formula || !highlighted.includes(part.clipId)) return null;
    const kept = clampSelection(part.selection, formula.snapshot?.glyphs.length ?? 0);
    if (kept.selected.size === 0) return null;
    if (kept !== part.selection) changed = true;
    parts.push(kept === part.selection ? part : { ...part, selection: kept });
  }
  return changed ? { parts } : pick;
}

/** "3 glyphs of f1: 2, 3, 4" (the list up to a dozen glyphs, then the count alone) for a pick
 * in one clip, "5 glyphs of 2 formulas" for one over several — "objects" when one of them is
 * not a formula (a text) — for the hint, the action bar and the menus. */
export function describePick(project: Project, pick: GlyphPick): string {
  const formulaOf = (part: PickPart) => {
    const clip = project.clips.find((c) => c.id === part.clipId);
    return project.formulas.find((f) => f.id === clip?.formulaId);
  };
  const total = pickCount(pick);
  const glyphs = `${total} glyph${total === 1 ? '' : 's'}`;
  const only = singlePart(pick);
  if (!only) {
    const formulas = pick.parts.every((part) => formulaOf(part)?.kind === 'math');
    return `${glyphs} of ${pick.parts.length} ${formulas ? 'formulas' : 'objects'}`;
  }
  const count = `${glyphs} of ${formulaOf(only)?.name ?? '?'}`;
  return total <= LISTED ? `${count}: ${pickedGlyphs(only).join(', ')}` : count;
}
