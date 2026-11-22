/* The names of the clips of a scene in the exported page: what a group of the stage is called
 * (`data-clip`), what `deck.clip('eq1')` takes, and what the timeline in words of the scene file
 * says. They are the names the exported Python gives its variables in the ordinary case: the
 * formula's name as an identifier, and `_2`, `_3`… for its later clips, in the order the clips
 * start. Derived from the project every time: a clip added by hand to the scene file gets its
 * name without anything to keep in step. Pure. */
import { identifier, NameAllocator } from '../export/codegen/python';
import type { ClipId, Project } from '../model';

/** The name of every clip of `project` whose formula exists, by clip id. */
export function clipNames(project: Pick<Project, 'clips' | 'formulas'>): Map<ClipId, string> {
  const formulas = new Map(project.formulas.map((formula) => [formula.id, formula]));
  const names = new NameAllocator();
  const out = new Map<ClipId, string>();
  // As the Python export orders them: by start, clips that start together in the project's order.
  for (const clip of [...project.clips].sort((a, b) => a.start - b.start)) {
    const formula = formulas.get(clip.formulaId);
    if (formula) out.set(clip.id, names.take(identifier(formula.name)));
  }
  return out;
}
