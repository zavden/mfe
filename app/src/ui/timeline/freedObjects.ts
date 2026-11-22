/* What is said when deleting clips frees a brace or a shape (D117): an object over glyphs of
 * several clips is not deleted with one of them, as an object that hangs on one clip is — it
 * stays where it is, detached (`freedClips`, `deleteClips`). The clip's, the formula's and the
 * track's deletions all say it the same way, and leave an end a Transform carried a line onto
 * them where the line was drawn (`freedEnds`). */
import type { Clip, FreedEndPoint, Project, Relation } from '../../model';
import { freedEndPoint } from '../../scene';
import { useRenderStore } from '../../store';
import { notify } from '../project/noticeStore';
import { lockedReason, lockedTrackOf, relationName } from '../relations/lockedRelations';

/** Where deleting clips of `project` leaves an end a Transform carried a line onto them
 * (`deleteClips`): measured on `project` as it is before the deletion, with the renders the app
 * has, so that the line is drawn where it was. */
export function freedEnds(project: Project): FreedEndPoint {
  return freedEndPoint(project, useRenderStore.getState().resolved);
}

/** Tell that `freed` (clips of `project`, as it was before the deletion) were detached and stay;
 * nothing when none was. */
export function reportFreed(project: Project, freed: readonly Clip[]): void {
  if (freed.length === 0) return;
  const names = freed.map(
    (clip) => project.formulas.find((f) => f.id === clip.formulaId)?.name ?? '?',
  );
  const one = freed.length === 1;
  notify({
    kind: 'info',
    title: one ? `“${names[0]}” detached` : `${freed.length} objects detached`,
    message:
      `${one ? 'It spanned' : 'They spanned'} glyphs of several formulas, and one of those is ` +
      `gone: ${one ? 'it stays where it is, a free object' : 'they stay where they are, free objects'} ` +
      'now. Undo brings back what was deleted, and the attachment with it.',
    ...(one ? {} : { details: names }),
  });
}

/** Tell which things — tracks or formulas, each under the name it is said by — were not deleted,
 * and why: relations with a clip on a locked track would have gone with each (`heldRelations`).
 * `plural` is what several of them are called ("formulas"). Nothing when none was kept. */
export function reportHeld(
  project: Project,
  kept: ReadonlyMap<string, readonly Relation[]>,
  plural: string,
): void {
  const [first] = kept;
  if (!first) return;
  const unlock =
    'Unlock the track on the timeline to create, edit or delete relations of its clips.';
  const line = (relation: Relation) =>
    `the ${relationName(project, relation)}, track “${lockedTrackOf(project, relation)?.name ?? '?'}”.`;
  if (kept.size > 1) {
    notify({
      kind: 'info',
      title: `${kept.size} ${plural} were not deleted`,
      message: `A relation with a clip on a locked track would go with each. ${unlock}`,
      details: [...kept].flatMap(([name, relations]) =>
        relations.map((relation) => `${name}: ${line(relation)}`),
      ),
    });
    return;
  }
  const [name, relations] = first;
  const [relation] = relations;
  if (!relation) return;
  if (relations.length === 1) {
    notify({
      kind: 'info',
      title: `${name} was not deleted`,
      message: lockedReason(
        project,
        relation,
        `The ${relationName(project, relation)} would go with it.`,
      ),
    });
    return;
  }
  const said = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  notify({
    kind: 'info',
    title: `${name} was not deleted`,
    message: `${relations.length} relations with a clip on a locked track would go with it. ${unlock}`,
    details: relations.map((r) => said(line(r))),
  });
}
