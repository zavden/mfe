/* Python code generation for ManimCE 0.22 and ManimGL 1.7 (docs/ARCHITECTURE.md §8).
 *
 * The scene is built from `buildEvents(project)` — the same timing truth the preview uses — in
 * three passes: the formulas become mobjects, one per clip (prepare.ts); the events are snapped
 * to the frame grid and cut into pieces (timeline.ts), and every piece becomes a `self.wait` or
 * a `self.play` (steps.ts) of the animations of animations.ts; and the lines are put together
 * into the file (assemble.ts). While emitting, the generator keeps track of which glyphs of
 * each clip are on screen (membership.ts), so that a whole formula is only used (added,
 * animated) when all of its glyphs are. The passes share one context (context.ts). */
import {
  exportedMarks,
  sceneDuration,
  slideMarkIssues,
  validateProject,
  visualProject,
} from '../../model';
import { refreshLocalRenders } from '../../engine';
import { attachmentIssues, settleScene } from '../../scene';
import type { GeneratePython } from '../types';
import { assemble } from './assemble';
import { createContext } from './context';
import { prepareClips, prepareFormulas, reportMissingGlyphs, reportProjectIssues } from './prepare';
import { emitTimeline } from './steps';
import { attachmentPlan } from './attach';
import { prepareCamera, reportCamera } from './camera';
import { dropUnreadGlyphLists } from './glyphs';
import { exportIssue } from './issues';

export { sceneClassName, isValidClassName } from './python';
export { effectiveSceneName, isValidSceneName } from './camera';

export const generatePython: GeneratePython = (project, formulas, options) => {
  // The scene is the visual part of the project. Sound that goes on after the last animation
  // makes the editor's own video longer than this scene, and the header must not say otherwise.
  const editorFrames = Math.round(sceneDuration(project) * project.meta.fps);
  // The marks of the Slides mode stand in the whole scene, the tail in which only sound plays
  // included: they and what is said of them come from the project with its sound.
  const marks = exportedMarks(project);
  const markIssues = slideMarkIssues(project);
  project = visualProject(project);
  const plan = attachmentPlan(project);
  // Only exports requiring a future initial state or shared dimensions need the saved scene's
  // derived geometry. Ordinary native constructors retain their existing output and metrics.
  const settled =
    plan.initialTargets.size || plan.sharedFits.size
      ? settleScene(project, formulas, refreshLocalRenders)
      : null;
  if (settled) ({ project, formulas } = settled);
  const gen = createContext(project, formulas, options, marks);
  for (const pending of settled?.readiness.pending ?? []) {
    if (
      !plan.initialTargets.has(pending.clipId) &&
      !(pending.dependencyId && plan.initialTargets.has(pending.dependencyId)) &&
      !plan.sharedFits.has(project.clips.find((c) => c.id === pending.clipId)!.formulaId)
    )
      continue;
    const index = project.clips.findIndex((c) => c.id === pending.clipId);
    gen.issues.push(
      exportIssue(
        'warning',
        'export-missing-render',
        `Attachment initial geometry is not ready (${pending.reason}); the saved dimensions and initial placement are used. Render and settle its dependencies for exact placement.`,
        ['clips', index, 'attach'],
      ),
    );
  }
  for (const issue of validateProject(project)) {
    if (!issue.code.startsWith('slide-mark-')) gen.issues.push(issue);
  }
  for (const issue of markIssues) gen.issues.push(issue);
  for (const issue of attachmentIssues(project, formulas)) gen.issues.push(issue);
  reportProjectIssues(gen);
  prepareFormulas(gen);
  prepareClips(gen);
  prepareCamera(gen);
  reportCamera(gen);
  reportMissingGlyphs(gen);
  emitTimeline(gen);
  dropUnreadGlyphLists(gen);
  const usedPositionalHelper = gen.helpers.has('glyphs');
  return {
    code: assemble(gen, editorFrames),
    sceneName: gen.sceneName,
    issues: gen.issues,
    usedPositionalHelper,
  };
};
