/* The validation issues of one object of the project (validateProject reports them by index
 * path), for the panels that list them and the timeline that marks them, and how grave they are
 * (D177): red is for errors, which need an edit; what has only warnings wears the warning colour.
 * Pure. */
import {
  validateProject,
  type ActionId,
  type ClipId,
  type Issue,
  type Project,
  type RelationId,
  type Severity,
} from '../../model';
import type { ResolvedFormulas } from '../../engine';
import { attachmentIssues } from '../../scene';
import type { SectionTone } from './Section';

const cache = new WeakMap<Project, Issue[]>();
const measuredCache = new WeakMap<Project, WeakMap<ResolvedFormulas, Issue[]>>();

/** Semantic validation once per project, plus fitted geometry diagnostics for its current renders. */
export function projectIssues(project: Project, formulas?: ResolvedFormulas): Issue[] {
  let issues = cache.get(project);
  if (!issues) {
    issues = validateProject(project);
    cache.set(project, issues);
  }
  if (!formulas) return issues;
  let byRenders = measuredCache.get(project);
  if (!byRenders) {
    byRenders = new WeakMap();
    measuredCache.set(project, byRenders);
  }
  let measured = byRenders.get(formulas);
  if (!measured) {
    measured = [...issues, ...attachmentIssues(project, formulas)];
    byRenders.set(formulas, measured);
  }
  return measured;
}

/** The issues of a clip (its blocks included) and of the relations it takes part in. */
export function clipIssues(project: Project, clipId: ClipId, formulas?: ResolvedFormulas): Issue[] {
  const index = project.clips.findIndex((c) => c.id === clipId);
  return projectIssues(project, formulas).filter((issue) => {
    if (issue.path[0] === 'clips') return issue.path[1] === index;
    if (issue.path[0] === 'relations') {
      const relation = project.relations[issue.path[1] as number];
      return relation?.fromClipId === clipId || relation?.toClipId === clipId;
    }
    return false;
  });
}

/** The issues of one animation block. */
export function blockIssues(project: Project, clipId: ClipId, actionId: ActionId): Issue[] {
  const clipIndex = project.clips.findIndex((c) => c.id === clipId);
  const actionIndex = project.clips[clipIndex]?.actions.findIndex((a) => a.id === actionId);
  return projectIssues(project).filter(
    (i) =>
      i.path[0] === 'clips' &&
      i.path[1] === clipIndex &&
      i.path[2] === 'actions' &&
      i.path[3] === actionIndex,
  );
}

/** The issues of one relation. */
export function relationIssues(project: Project, relationId: RelationId): Issue[] {
  const index = project.relations.findIndex((r) => r.id === relationId);
  return projectIssues(project).filter((i) => i.path[0] === 'relations' && i.path[1] === index);
}

/** The relations that have issues, each with the graver severity of its own: the timeline draws
 * the band and the arrow of a relation with an error in the danger red, of one with only warnings
 * in the warning colour. */
export function relationSeverities(project: Project): Map<RelationId, Severity> {
  return severities(
    projectIssues(project).flatMap((issue) => {
      const relation =
        issue.path[0] === 'relations' ? project.relations[issue.path[1] as number] : undefined;
      return relation ? [[relation.id, issue.severity] as const] : [];
    }),
  );
}

// --- How grave -------------------------------------------------------------------------------

/** The graver of some severities (an absent one counts for none): an error as soon as one is,
 * a warning when the others are warnings, null when there is none. */
export function graver(list: Iterable<Severity | null | undefined>): Severity | null {
  let worst: Severity | null = null;
  for (const severity of list) {
    if (severity === 'error') return 'error';
    if (severity === 'warning') worst = 'warning';
  }
  return worst;
}

/** The graver severity of each key of `entries`, pairs of a key and the severity of one of its
 * issues: an error as soon as one of a key's issues is one. */
export function severities<K>(entries: Iterable<readonly [K, Severity]>): Map<K, Severity> {
  const out = new Map<K, Severity>();
  for (const [key, severity] of entries) out.set(key, graver([out.get(key), severity])!);
  return out;
}

/** The class that marks something drawn by the issues it has: `is-bad`, in the danger red, for
 * an error; `is-warned`, in the warning colour, when they are all warnings; null for none. */
export function issueMark(severity: Severity | null | undefined): 'is-bad' | 'is-warned' | null {
  return severity === 'error' ? 'is-bad' : severity === 'warning' ? 'is-warned' : null;
}

/** How a panel lists the issues of what is selected. */
export interface IssueSection {
  title: 'Problems' | 'Warnings';
  tone: Extract<SectionTone, 'problems' | 'warnings'>;
  /** In the order the section lists them: the errors first, each severity in the order
   * validation found it. */
  issues: Issue[];
}

/** The section that lists `issues`: «Problems» in the danger red, its errors first, when one of
 * them is an error; «Warnings» in the warning colour when they are all warnings — a warning is a
 * notice, not a problem. Null: nothing to list. */
export function issueSection(issues: readonly Issue[]): IssueSection | null {
  const worst = graver(issues.map((issue) => issue.severity));
  if (worst === null) return null;
  if (worst === 'warning') return { title: 'Warnings', tone: 'warnings', issues: [...issues] };
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity !== 'error');
  return { title: 'Problems', tone: 'problems', issues: [...errors, ...warnings] };
}
