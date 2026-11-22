/* Candidate edits may affect owners elsewhere in a project. Compare semantic diagnostics,
 * allowing unrelated imported errors and reductions of an existing problem. */
import { issueIdentityNotWorse, validateProject, type Issue, type Project } from '../../model';

const cached = new WeakMap<Project, Issue[]>();
function issuesOf(project: Project): Issue[] {
  let issues = cached.get(project);
  if (!issues) {
    issues = validateProject(project);
    cached.set(project, issues);
  }
  return issues;
}

/** Stable owner IDs replace presentation positions for diagnostics without richer metadata. */
function subject(project: Project, issue: Issue): string {
  if (issue.identity) return JSON.stringify(issue.identity.subject);
  const path = [...issue.path];
  const index = path[1] as number;
  if (path[0] === 'relations') path[1] = project.relations[index]?.id ?? index;
  if (path[0] === 'formulas') path[1] = project.formulas[index]?.id ?? index;
  if (path[0] === 'tracks') path[1] = project.tracks[index]?.id ?? index;
  if (path[0] === 'clips') {
    const clip = project.clips[index];
    path[1] = clip?.id ?? index;
    if (path[2] === 'actions') path[3] = clip?.actions[path[3] as number]?.id ?? path[3]!;
  }
  return JSON.stringify(path);
}

export function introducedIssue(before: Project, after: Project, issue: Issue): boolean {
  const key = subject(after, issue);
  return !issuesOf(before).some((old) => {
    if (issue.identity || old.identity) return issueIdentityNotWorse(issue, old);
    return (
      old.code === issue.code &&
      subject(before, old) === key &&
      (issue.severity !== 'error' || old.severity === 'error')
    );
  });
}

export function transactionProblems(
  before: Project,
  after: Project,
  own: (issue: Issue) => boolean,
): Issue[] {
  return issuesOf(after).filter((issue) => own(issue) || introducedIssue(before, after, issue));
}

export const involvesTransfer = (issue: Issue, key: string): boolean =>
  issue.identity?.participants.includes(key) ?? false;

/** The first error `after` has that `before` did not (`transactionProblems`, nothing owned): what
 * an edit made from a field must not bring — a relation's or a Morph block's default style (audit
 * A3-04), a new block (A8-02). A new warning does not count, nor does an error `before` had
 * already. Null when it brings none. */
export function introducedError(before: Project, after: Project): Issue | null {
  return (
    transactionProblems(before, after, () => false).find((issue) => issue.severity === 'error') ??
    null
  );
}
