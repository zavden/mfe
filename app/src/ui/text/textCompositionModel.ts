/* Pure source/placement ownership for the composition workspace. Browser text metrics never
 * determine geometry. A session edits a shared source and, optionally, one explicit keyframe.
 * Two kinds of object are composed there: a font text (`text`) and a LaTeX text (`tex`); the
 * draft of a session is of the kind of its object. */
import {
  KINDS,
  TextFontSchema,
  TextSourceSchema,
  type Clip,
  type ClipState,
  type Formula,
  type Placement,
  type Project,
  type TexFormula,
  type TextFormula,
  type Vec2,
} from '../../model';
import { actionStates, type KeyframeRef } from '../../scene';
import type { Box } from '../../geom';
import { MIN_FONT_SIZE, MAX_FONT_SIZE } from '../creator/standardScale';

/** The kinds of object the composition workspace edits. */
export type CompositionFormula = TextFormula | TexFormula;
export type CompositionKind = CompositionFormula['kind'];

export const isCompositionFormula = (
  formula: Pick<Formula, 'kind'> | undefined,
): formula is CompositionFormula => formula?.kind === 'text' || formula?.kind === 'tex';

/** What a session edits of a font text: its source and its typography. */
export interface FontTextDraft extends Pick<TextFormula, 'source' | 'font' | 'fontSize' | 'color'> {
  kind: 'text';
}

/** What a session edits of a LaTeX text: its source, its size and colour, its layout, and what
 * the formula editor gave it as an object (its name, its tag, the intro of its new clips). */
export interface LatexTextDraft extends Pick<
  TexFormula,
  'source' | 'layout' | 'fontSize' | 'color' | 'name' | 'tag' | 'intro'
> {
  kind: 'tex';
}

export type TextDraft = FontTextDraft | LatexTextDraft;

/** The draft of the kind of `formula`. */
export type DraftOf<F extends CompositionFormula> = F extends TexFormula
  ? LatexTextDraft
  : FontTextDraft;

/** The line spacing the LaTeX form accepts (a factor of LaTeX's own). */
export const MIN_LINE_SPACING = 0.5;
export const MAX_LINE_SPACING = 3;

export interface PlacementBinding {
  clipId: string;
  trackId: string;
  ref: KeyframeRef;
  original: Placement;
}

export const ORIGIN_PLACEMENT: Placement = {
  position: [0, 0],
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
};

/** What the line under the stage says of a library session — one opened without a clip —,
 * whose stage places no clip: with «New clips start here» on (`kept`), Apply keeps the position
 * for the object's new clips; off, the position is only a place to look at the text. */
export const libraryPlacementNote = (kept: boolean): string =>
  kept
    ? 'Library object: new clips start at this position. Clips already on the timeline keep theirs.'
    : 'Library object: stage placement is provisional and is not saved.';

export function textDraftOf<F extends CompositionFormula>(formula: F): DraftOf<F>;
export function textDraftOf(formula: CompositionFormula): TextDraft {
  const { source, fontSize, color } = formula;
  return formula.kind === 'tex'
    ? {
        kind: 'tex',
        source,
        layout: { ...formula.layout },
        fontSize,
        color,
        name: formula.name,
        tag: { ...formula.tag },
        intro: formula.intro ? { ...formula.intro, shift: [...formula.intro.shift] } : null,
      }
    : { kind: 'text', source, font: { ...formula.font }, fontSize, color };
}

/** Whether both drafts of a LaTeX text set the same glyphs: the same source, layout and size
 * (not its colour, nor what it has as an object). */
export const sameLatexShape = (a: LatexTextDraft, b: LatexTextDraft): boolean =>
  a.source === b.source &&
  a.fontSize === b.fontSize &&
  a.layout.width === b.layout.width &&
  a.layout.align === b.layout.align &&
  a.layout.lineSpacing === b.layout.lineSpacing;

export function sameTextDraft(a: TextDraft, b: TextDraft): boolean {
  if (a.source !== b.source || a.fontSize !== b.fontSize || a.color !== b.color) return false;
  if (a.kind === 'tex')
    return (
      b.kind === 'tex' &&
      sameLatexShape(a, b) &&
      a.name === b.name &&
      a.tag.color === b.tag.color &&
      a.tag.icon === b.tag.icon &&
      JSON.stringify(a.intro) === JSON.stringify(b.intro)
    );
  return (
    b.kind === 'text' &&
    a.font.family === b.font.family &&
    a.font.weight === b.font.weight &&
    a.font.slant === b.font.slant
  );
}

export function placementOf(state: Placement): Placement {
  return {
    position: [...state.position],
    scale: state.scale,
    rotation: state.rotation,
    flipX: state.flipX,
    flipY: state.flipY,
  };
}

export const samePlacement = (a: Placement, b: Placement): boolean =>
  a.position[0] === b.position[0] &&
  a.position[1] === b.position[1] &&
  a.scale === b.scale &&
  a.rotation === b.rotation &&
  a.flipX === b.flipX &&
  a.flipY === b.flipY;

export function boundState(clip: Clip, ref: KeyframeRef): ClipState | null {
  return ref.kind === 'initial'
    ? clip.initial
    : (actionStates(clip).find(({ action }) => action.id === ref.actionId)?.to ?? null);
}

/** All shared uses matter for source changes; a placement edit has a separate gate. */
export function textSourceLock(project: Project, formulaId: string): string | null {
  const uses = project.clips.filter((clip) => clip.formulaId === formulaId);
  const locked = new Set(project.tracks.filter((track) => track.locked).map((track) => track.id));
  const count = uses.filter((clip) => locked.has(clip.trackId)).length;
  return count
    ? `This text is used by ${count} clip${count === 1 ? '' : 's'} on locked tracks. ` +
        'Unlock those tracks or make the selected occurrence independent.'
    : null;
}

export function validateTextDraft(draft: TextDraft): string | null {
  if (draft.kind !== 'text' && draft.kind !== 'tex') return 'This is not a text draft.';
  if (draft.kind === 'text') {
    const font = TextFontSchema.safeParse(draft.font);
    if (!font.success) return font.error.issues[0]?.message ?? 'Choose a valid font family.';
  }
  if (
    !Number.isFinite(draft.fontSize) ||
    draft.fontSize < MIN_FONT_SIZE ||
    draft.fontSize > MAX_FONT_SIZE
  )
    return `Font size must be between ${MIN_FONT_SIZE} and ${MAX_FONT_SIZE}.`;
  if (!/^#[0-9a-f]{6}$/i.test(draft.color)) return 'Choose a six-digit hexadecimal colour.';
  if (draft.kind === 'text') {
    const source = TextSourceSchema.safeParse(draft.source);
    if (!source.success) return source.error.issues[0]?.message ?? 'Text is invalid.';
    return null;
  }
  if (typeof draft.source !== 'string') return 'Text is invalid.';
  const { width, align, lineSpacing } = draft.layout ?? {};
  if (width !== null && !(Number.isFinite(width) && width! > 0))
    return 'The width is a positive number of scene units, or empty.';
  if (align !== 'left' && align !== 'center' && align !== 'right')
    return 'Choose left, centre or right alignment.';
  // The form takes a factor from MIN_LINE_SPACING to MAX_LINE_SPACING; a file may hold another
  // positive one, which stays valid until it is edited.
  if (!(Number.isFinite(lineSpacing) && lineSpacing! > 0))
    return 'The line spacing is a positive factor.';
  if (typeof draft.name !== 'string' || draft.name.trim() === '') return 'Give the text a name.';
  if (!/^#[0-9a-f]{6}$/i.test(draft.tag?.color ?? '') || (draft.tag.icon ?? '').length > 8)
    return 'The tag is a six-digit hexadecimal colour and an icon of up to 8 characters.';
  if (
    draft.intro != null &&
    (!KINDS.tex.intros.includes(draft.intro.kind) ||
      !Array.isArray(draft.intro.shift) ||
      !(Number.isFinite(draft.intro.duration) && draft.intro.duration >= 0))
  )
    return 'The intro of the text is not valid.';
  return null;
}

/** Empty text has an editing box even though it has no drawable contours. */
export function selectableTextBox(box: Box): Box {
  const x = (box.minX + box.maxX) / 2;
  const y = (box.minY + box.maxY) / 2;
  const w = Math.max(0.2, box.maxX - box.minX);
  const h = Math.max(0.35, box.maxY - box.minY);
  return { minX: x - w / 2, minY: y - h / 2, maxX: x + w / 2, maxY: y + h / 2 };
}

export function centeredPosition(position: Vec2, box: Box, axis: 'x' | 'y'): Vec2 {
  return axis === 'x'
    ? [position[0] - (box.minX + box.maxX) / 2, position[1]]
    : [position[0], position[1] - (box.minY + box.maxY) / 2];
}
