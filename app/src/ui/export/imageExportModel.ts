/* What the dialog of Export ▸ Image… works out before its button is pressed: the instant of the
 * picture, what is still to render, what the picture will show otherwise than its formulas are
 * written, and the name of its file. Pure. */
import type { ResolvedFormulas } from '../../engine';
import { onScreenAt, sceneDuration, type Formula, type Project } from '../../model';
import type { FormulaRenderEntry } from '../../store';
import { textHasShape, videoReadiness } from './readiness';
import { videoFileName } from './videoExportModel';

/** The instant the picture is of: the playhead, within the scene (past its end, the evaluator
 * draws the end). */
export function frameInstant(project: Project, playhead: number): number {
  return Math.min(Math.max(playhead, 0), sceneDuration(project));
}

/** What the dialog does with the formulas on the timeline, as the Video dialog does (`readiness.ts`):
 * it waits for the ones that are rendering, wherever they are — what is on screen can hang on one
 * that is not: a brace on its formula, a line on its ends —, and tells of the ones the picture has,
 * the ones on screen at its instant. */
export interface ImageReadiness {
  /** Rendering, or rendered from an earlier source: Export waits. */
  waiting: Formula[];
  /** On screen, and their current LaTeX fails: drawn as their last good render. */
  failing: Formula[];
  /** On screen, their current LaTeX fails and they never rendered: left out. */
  missing: Formula[];
  /** On screen, with nothing written in them: left out. */
  empty: Formula[];
  /** Font texts on screen as placeholder boxes: what the picture shows. */
  boxes: Formula[];
  /** Font texts on screen that nothing can draw (no shape of their current source, and no boxes
   * in its place): the picture is held back, as every video is. */
  blocked: Formula[];
}

export function imageReadiness(
  project: Project,
  entries: Readonly<Record<string, FormulaRenderEntry | undefined>>,
  resolved: ResolvedFormulas,
  time: number,
): ImageReadiness {
  const duration = sceneDuration(project);
  const instant = frameInstant(project, time);
  const onScreen = {
    ...project,
    clips: project.clips.filter((clip) => onScreenAt(clip, instant, duration)),
  };
  const here = videoReadiness(onScreen, entries, resolved);
  const text = (formula: Formula) => formula.kind === 'text';
  const undrawable = [...here.failing, ...here.missing];
  return {
    waiting: videoReadiness(project, entries, resolved).waiting,
    failing: here.failing.filter((formula) => !text(formula)),
    missing: here.missing.filter((formula) => !text(formula)),
    empty: here.empty,
    boxes: here.boxes,
    blocked: undrawable.filter(
      (formula) =>
        text(formula) && !textHasShape(formula, resolved) && !here.boxes.includes(formula),
    ),
  };
}

/** `<project name> <instant>s.png`, the instant in seconds to the hundredth: the pictures of
 * several frames of a project have each a name of its own, which says when it is of. */
export function imageFileName(projectName: string, time: number): string {
  const named = videoFileName(projectName, 'png', 'image');
  return `${named.slice(0, -'.png'.length)} ${time.toFixed(2)}s.png`;
}
