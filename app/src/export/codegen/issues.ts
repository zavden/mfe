/* Issues the code generator reports (CodegenResult.issues). */
import type { Issue, IssueCode } from '../../model';

/** What the generated code cannot guarantee: the export codes of the model's IssueCode. */
export type ExportIssueCode = Extract<IssueCode, `export-${string}`>;

export function exportIssue(
  severity: Issue['severity'],
  code: ExportIssueCode,
  message: string,
  path: Issue['path'] = [],
): Issue {
  return { severity, code, message, path };
}
