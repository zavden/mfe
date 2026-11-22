/* A list of validation issues: the severity, then the message. `children` come first (the Python
 * export puts its "no issues" line there). `IssuesSection` is the section of a panel that lists
 * the issues of what is selected. */
import type { ReactNode } from 'react';
import type { Issue } from '../../model';
import { issueSection } from './issues';
import { Section } from './Section';

interface IssueListProps {
  issues: readonly Issue[];
  testId: string;
  className?: string;
  children?: ReactNode;
}

export function IssueList({ issues, testId, className = 'an-issues', children }: IssueListProps) {
  return (
    <ul className={className} data-testid={testId}>
      {children}
      {issues.map((issue, i) => (
        <li key={i} className={`an-issue is-${issue.severity}`}>
          <strong>{issue.severity}</strong> {issue.message}
        </li>
      ))}
    </ul>
  );
}

/** The issues of a clip, a block or a relation at the end of its panel (D177): «Problems» in the
 * danger red, the errors first, when one of them is an error; «Warnings» in the warning colour
 * when they are all warnings; nothing without issues. */
export function IssuesSection({
  issues,
  testId,
  listTestId,
}: {
  issues: readonly Issue[];
  testId: string;
  listTestId: string;
}) {
  const section = issueSection(issues);
  if (!section) return null;
  return (
    <Section title={section.title} testId={testId} tone={section.tone}>
      <IssueList issues={section.issues} testId={listTestId} />
    </Section>
  );
}
