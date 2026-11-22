/* A scene of an exported page, made of its two files: the project (`scene.js`, which its owner
 * may have edited by hand or with an agent) and the outlines of its formulas (`glyphs.js`). The
 * project is read with the editor's own schema and checked with the editor's own rules, so a
 * mistake in the scene file is said in the words the editor would use; what can still be drawn
 * is drawn. Pure. */
import { validateProject, type ClipId, type Project } from '../model';
import { ProjectSchema } from '../model/schema';
import { makeScene, type Scene } from '../embed/engine';
import { glyphFileProblem, reviveGlyphs, type GlyphFile } from './glyphFile';
import { clipNames } from './names';

/** Something wrong with a scene's files. An error is what cannot play as written; a warning,
 * what plays and may not be what was meant. */
export interface DeckProblem {
  severity: 'error' | 'warning';
  /** The file it is about. */
  file: 'scene.js' | 'glyphs.js';
  /** Where in the file's data: `clips[2].intro.kind`; empty when it is about the whole. */
  where: string;
  message: string;
}

export interface DeckScene {
  /** The scene, when one could be made: with errors it may still play, as far as it can. */
  scene: Scene | null;
  /** The name of each clip, by its id (`names.ts`). */
  names: Map<ClipId, string>;
  problems: DeckProblem[];
}

/** A path of the project as a reader of the file would write it: `clips[2].intro.kind`. */
export function wherePath(path: readonly PropertyKey[]): string {
  return path
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`,
    )
    .join('');
}

/** Makes the scene of a project and a glyph file as the page's scripts gave them (any value: the
 * files are edited by hand). Never throws: what is wrong is in `problems`. */
export function buildDeckScene(projectData: unknown, glyphData: unknown): DeckScene {
  const problems: DeckProblem[] = [];
  const none: DeckScene = { scene: null, names: new Map(), problems };

  const glyphProblem = glyphFileProblem(glyphData);
  if (glyphProblem) {
    problems.push({
      severity: 'error',
      file: 'glyphs.js',
      where: '',
      message: `The glyph file cannot be used: ${glyphProblem}.`,
    });
  }

  const parsed = ProjectSchema.safeParse(projectData);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push({
        severity: 'error',
        file: 'scene.js',
        where: wherePath(issue.path),
        message: issue.message,
      });
    }
    return none;
  }
  const project = parsed.data as Project;
  for (const issue of validateProject(project)) {
    problems.push({
      severity: issue.severity,
      file: 'scene.js',
      where: wherePath(issue.path),
      message: issue.message,
    });
  }
  const names = clipNames(project);
  if (glyphProblem) return { scene: null, names, problems };

  try {
    const { resolved, problems: glyphProblems } = reviveGlyphs(project, glyphData as GlyphFile);
    for (const problem of glyphProblems) {
      const index = project.formulas.findIndex((formula) => formula.id === problem.formulaId);
      problems.push({
        severity: 'error',
        file: 'scene.js',
        where: index < 0 ? 'formulas' : `formulas[${index}]`,
        message: problem.message,
      });
    }
    // As the video shows the scene: the clips of hidden tracks too.
    const scene = makeScene(project, resolved, { includeHidden: true });
    // The first frame is made now, so that a scene that cannot be evaluated says so here.
    scene.evaluate(0);
    return { scene, names, problems };
  } catch (error) {
    problems.push({
      severity: 'error',
      file: 'scene.js',
      where: '',
      message: `The scene cannot be drawn: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { scene: null, names, problems };
  }
}

/** Whether a scene has something that keeps it from playing as written. */
export function hasDeckErrors(problems: readonly DeckProblem[]): boolean {
  return problems.some((problem) => problem.severity === 'error');
}
