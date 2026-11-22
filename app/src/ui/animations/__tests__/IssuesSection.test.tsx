/* The section of a panel that lists the issues of what is selected (D177): a warning is a notice,
 * not a problem, and red is for errors. */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Issue } from '../../../model';
import { IssuesSection } from '../IssueList';

const issue = (severity: Issue['severity'], message: string): Issue => ({
  severity,
  code: severity === 'error' ? 'clip-length' : 'intro-empty',
  message,
  path: ['clips', 0],
});

function show(issues: Issue[]) {
  render(<IssuesSection issues={issues} testId="issues-section" listTestId="clip-issues" />);
  const section = screen.queryByTestId('issues-section');
  const rows = section ? within(screen.getByTestId('clip-issues')).getAllByRole('listitem') : [];
  return { section, rows };
}

describe('IssuesSection', () => {
  it('lists only warnings under Warnings, in the warning tone', () => {
    const { section, rows } = show([issue('warning', 'one'), issue('warning', 'two')]);
    expect(section).toHaveClass('an-section');
    expect(section).toHaveAttribute('data-tone', 'warnings');
    expect(section!.querySelector('h3')).toHaveTextContent(/^Warnings$/);
    expect(rows.map((row) => row.textContent)).toEqual(['warning one', 'warning two']);
    for (const row of rows) expect(row).toHaveClass('an-issue', 'is-warning');
  });

  it('lists only errors under Problems, in the problems tone', () => {
    const { section, rows } = show([issue('error', 'one')]);
    expect(section).toHaveAttribute('data-tone', 'problems');
    expect(section!.querySelector('h3')).toHaveTextContent(/^Problems$/);
    expect(rows.map((row) => row.textContent)).toEqual(['error one']);
    expect(rows[0]).toHaveClass('is-error');
  });

  it('lists errors and warnings under Problems, the errors first; a warning keeps its look', () => {
    const { section, rows } = show([
      issue('warning', 'w1'),
      issue('error', 'e1'),
      issue('warning', 'w2'),
      issue('error', 'e2'),
    ]);
    expect(section).toHaveAttribute('data-tone', 'problems');
    expect(section!.querySelector('h3')).toHaveTextContent(/^Problems$/);
    expect(rows.map((row) => row.textContent)).toEqual([
      'error e1',
      'error e2',
      'warning w1',
      'warning w2',
    ]);
    expect(rows.map((row) => row.className)).toEqual([
      'an-issue is-error',
      'an-issue is-error',
      'an-issue is-warning',
      'an-issue is-warning',
    ]);
  });

  it('is not there without issues', () => {
    const { section } = show([]);
    expect(section).toBeNull();
  });
});
