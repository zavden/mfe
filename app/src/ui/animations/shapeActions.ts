/* Shapes on the timeline (D71): adding one on glyphs of a clip — from the preview's and the
 * clip's menus — as a box, a circle, an underline, a cross or a highlight (a box filled with no
 * stroke, behind the glyphs), and editing one in the Animations panel: which shape it is, its
 * corner radius and its style. The gap, the colour and Detach are the attachment's, shared with
 * the braces (`braceActions.ts`). Each action is one undo step; the attach sync fits and places
 * what hangs on something (`store/attachSync.ts`). Adding plans with the project, so it gives up a
 * drag still held before it reads it, as adding a brace does. */
import type {
  AttachTarget,
  ClipId,
  FormulaId,
  GlyphStyle,
  GlyphTarget,
  Project,
  ShapeDiagonal,
  ShapeKind,
} from '../../model';
import { history, useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { SHAPE_LABELS, storedDiagonal } from '../creator/sources';
import { usePreferences } from '../preferences';
import { getActivePalette } from '../colors/paletteStore';
import {
  applyAttachmentCreation,
  planShapeCreation,
  planSpanningShape,
  type ShapeChoice,
} from './attachmentCreation';

export {
  HIGHLIGHT_FILL_OPACITY,
  planSpanningShape,
  SHAPE_CHOICES,
  SHAPE_PRESETS,
  type ShapeChoice,
} from './attachmentCreation';

export const SHAPE_CHOICE_LABELS: Readonly<Record<ShapeChoice, string>> = {
  ...SHAPE_LABELS,
  highlight: 'Highlight',
};

/** Whether `clipId` is the clip of a shape (it takes neither braces nor shapes in the menus). */
export function isShapeClip(project: Project, clipId: ClipId): boolean {
  const clip = project.clips.find((c) => c.id === clipId);
  return project.formulas.find((f) => f.id === clip?.formulaId)?.kind === 'shape';
}

/** Add a shape of `choice` on `glyphs` of the object of clip `clipId`: a shape object named after
 * its kind, attached with the shape rule at the preset's gap, over `attachedClipWindow` (from the
 * playhead to the target's end), on the nearest free track above the target's — below it for a
 * highlight — (a new one beside it when none has room), with no intro; selected afterwards, as
 * one undo step. With `also`, one shape over those glyphs and
 * the glyphs of the other clips it names (D117), as Manim fits one to a `VGroup`. Returns the
 * clip's id, or null when a target is gone. */
export function addShape(
  clipId: ClipId,
  glyphs: GlyphTarget,
  choice: ShapeChoice,
  also: readonly AttachTarget[] = [],
): ClipId | null {
  history.cancelForeignGesture();
  const state = useProjectStore.getState();
  const preferences = usePreferences.getState();
  const plan = planShapeCreation(
    state.project,
    clipId,
    glyphs,
    choice,
    useUiStore.getState().time,
    {
      introDuration: preferences.intro.duration,
      standardScale: preferences.standardScale,
      colors: getActivePalette()?.source.colors,
    },
    also,
  );
  if (!plan) return null;
  const { formula, clip, targetName } = plan;
  state.update((draft) => applyAttachmentCreation(draft, plan));
  useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
  announce(`${SHAPE_CHOICE_LABELS[choice]} ${formula.name} added on ${targetName}`);
  return clip.id;
}

/** One shape of `choice` around the whole of each of the clips `clipIds` (`planSpanningShape`,
 * D126): read from the project as it is now, so a menu that stayed open while a clip went adds
 * nothing. Returns the new clip's id, or null when there is none. */
export function addShapeOverClips(clipIds: readonly ClipId[], choice: ShapeChoice): ClipId | null {
  history.cancelForeignGesture();
  const plan = planSpanningShape(
    useProjectStore.getState().project,
    clipIds,
    useUiStore.getState().time,
  );
  return plan?.ok ? addShape(plan.clipId, 'all', choice, plan.also) : null;
}

/** Edit a shape object as one undo step (nothing when it is not one). */
function editShape(
  formulaId: FormulaId,
  recipe: (shape: Extract<Project['formulas'][number], { kind: 'shape' }>) => void,
): void {
  useProjectStore.getState().update((draft) => {
    const formula = draft.formulas.find((f) => f.id === formulaId);
    if (formula?.kind === 'shape') recipe(formula);
  });
}

/** Which shape a shape object is (its style stays; a diagonal is a cross line's alone). */
export function setShapeKind(formulaId: FormulaId, shape: ShapeKind): void {
  editShape(formulaId, (object) => {
    object.shape = shape;
    if (shape !== 'cross_line') delete object.diagonal;
  });
}

/** The diagonal a cross line runs along; the default one is the absence of the field, and a shape
 * that is not a cross line keeps none. */
export function setShapeDiagonal(formulaId: FormulaId, diagonal: ShapeDiagonal): void {
  editShape(formulaId, (object) => {
    const stored = storedDiagonal(object.shape, diagonal);
    if (stored) object.diagonal = stored;
    else delete object.diagonal;
  });
}

/** Some of a shape's style: the fill opacity, the stroke width, the stroke opacity. */
export function setShapeStyle(formulaId: FormulaId, patch: Partial<GlyphStyle>): void {
  editShape(formulaId, (object) => {
    object.style = { ...object.style, ...patch };
  });
}

/** The colour of a shape's fill: its own, or — `null` — the stroke's again (D123). */
export function setShapeFillColor(formulaId: FormulaId, color: string | null): void {
  editShape(formulaId, (object) => {
    if (color === null) delete object.fillColor;
    else object.fillColor = color;
  });
}

/** A box's corner radius, scene units (0: square corners). */
export function setShapeCornerRadius(formulaId: FormulaId, radius: number): void {
  editShape(formulaId, (object) => {
    object.cornerRadius = Math.max(0, radius);
  });
}
