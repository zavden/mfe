/* Every completion route uses the current document, revision, locks and candidate errors: the
 * document a drag still held leaves, since an editor opened from the keyboard leaves that drag
 * running under it, and what is saved replaces whole clips and relations. */
import type { GlyphPair, Issue, Project } from '../../model';
import { history, useProjectStore } from '../../store';
import { stripIds, type Sides } from './pairSession';
import type { PairSession } from './usePairSession';

interface CommitOptions {
  sides(project: Project): Sides | null;
  lock(project: Project): string | null;
  prepare(project: Project, pairs: GlyphPair[]): { candidate: Project; issues: Issue[] };
}

export function preparePairCommit(
  session: PairSession,
  options: CommitOptions,
): {
  candidate: Project;
  pairs: ReturnType<PairSession['snapshot']>['pairs'];
} | null {
  history.cancelForeignGesture();
  const project = useProjectStore.getState().project;
  const sides = options.sides(project);
  const snapshot = session.snapshot();
  const lock = options.lock(project);
  let reason = lock ?? snapshot.stale;
  if (
    !sides ||
    !session.current(
      { from: sides.from.key, to: sides.to.key },
      { from: sides.from.id, to: sides.to.id },
    )
  )
    reason ??= 'The formula changed: close the editor and open it again.';
  if (reason) {
    session.setMessage(reason);
    return null;
  }
  const prepared = options.prepare(project, stripIds(snapshot.pairs));
  const error = prepared.issues.find((issue) => issue.severity === 'error');
  if (error) {
    session.setMessage(error.message);
    return null;
  }
  return { candidate: prepared.candidate, pairs: snapshot.pairs };
}
