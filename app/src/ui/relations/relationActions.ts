/* Store actions on relations that the timeline and the panel share. */
import type { Project, Relation, RelationId, RelationStyle } from '../../model';
import { useProjectStore } from '../../store';
import { introducedError } from './draftValidation';
import { deleteRelation, relationLock, type WindowSpec } from './relationOps';
import { styleLabel } from './styleOptions';

/** Store-facing guard shared by relation controls and pending menu commands. */
export function editRelation(
  relationId: RelationId,
  recipe: (relation: Relation) => void,
): boolean {
  const { project, update } = useProjectStore.getState();
  const relation = project.relations.find((r) => r.id === relationId);
  if (!relation || relationLock(project, relation)) return false;
  update((draft) => {
    const current = draft.relations.find((r) => r.id === relationId);
    if (current && !relationLock(draft, current)) recipe(current);
  });
  return true;
}

export function removeRelation(relationId: RelationId): boolean {
  const { project, update } = useProjectStore.getState();
  const relation = project.relations.find((r) => r.id === relationId);
  if (!relation || relationLock(project, relation)) return false;
  update((draft) => deleteRelation(draft, relationId));
  return true;
}

/** Set a relation's window (one undo step); nothing happens when it is the stored one already. */
export function setRelationWindow(relationId: RelationId, spec: WindowSpec): void {
  const { project } = useProjectStore.getState();
  const relation = project.relations.find((r) => r.id === relationId);
  if (!relation) return;
  if (
    Math.abs(relation.offset - spec.offset) < 1e-9 &&
    Math.abs(relation.duration - spec.duration) < 1e-9
  ) {
    return;
  }
  editRelation(relationId, (r) => {
    r.offset = spec.offset;
    r.duration = spec.duration;
  });
}

/** Why the default style of what holds pairs (a relation, a Morph block) is not set to `style`, as
 * the edit would leave `after`: the error it gives the project that `before` did not have — the
 * style decides which sources its pairs that have none of their own consume (`sourceRoles`).
 * Null when it gives none (audit A3-04). The relation editor and the pair editor refuse the same
 * change, their drafts being validated before they save. */
export function defaultStyleRefusal(
  before: Project,
  after: Project,
  style: RelationStyle,
): string | null {
  const issue = introducedError(before, after);
  if (!issue) return null;
  return `${styleLabel(style)} would give the project an error: ${issue.message} Give the pairs that clash a style of their own in Edit pairs…, or keep the default style.`;
}

/** Set a relation's default style (one undo step), unless it gives the project an error it did
 * not have (`defaultStyleRefusal`): then nothing changes, and the reason is returned. */
export function setRelationStyle(
  relationId: RelationId,
  style: RelationStyle,
): { ok: true } | { ok: false; reason: string } {
  const { project } = useProjectStore.getState();
  const relation = project.relations.find((r) => r.id === relationId);
  if (!relation || relation.style === style) return { ok: true };
  const after: Project = {
    ...project,
    relations: project.relations.map((r) => (r.id === relationId ? { ...r, style } : r)),
  };
  const reason = defaultStyleRefusal(project, after, style);
  if (reason) return { ok: false, reason };
  editRelation(relationId, (r) => void (r.style = style));
  return { ok: true };
}
